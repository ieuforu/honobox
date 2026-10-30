package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

func (s *Server) lab(w http.ResponseWriter, r *http.Request) {
	scenario := r.PathValue("scenario")
	switch scenario {
	case "tool-call", "interrupted", "upstream-error", "timeout", "slow":
	default:
		writeJSON(w, 404, map[string]string{"error": "Unknown lab scenario"})
		return
	}
	body := `{"model":"honobox-lab","stream":true,"messages":[{"role":"user","content":"What is the weather in Shanghai?"}],"tools":[{"type":"function","function":{"name":"get_weather","parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}}]}`
	r.Body = io.NopCloser(strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	s.forward(w, r, scenario)
}

func mockResponse(ctx context.Context, scenario string) (*http.Response, error) {
	if scenario == "timeout" {
		<-ctx.Done()
		return nil, ctx.Err()
	}
	if scenario == "upstream-error" {
		return &http.Response{StatusCode: 503, Status: "503 Service Unavailable", Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(`{"error":{"message":"Synthetic provider outage","type":"server_error"}}`))}, nil
	}
	reader, writer := io.Pipe()
	go func() {
		defer writer.Close()
		// Closing on cancellation releases a write blocked by a disconnected client.
		stop := context.AfterFunc(ctx, func() { _ = writer.CloseWithError(ctx.Err()) })
		defer stop()
		emit := func(delta any, finish any) bool {
			delay := 85 * time.Millisecond
			if scenario == "slow" {
				delay = 300 * time.Millisecond
			}
			select {
			case <-ctx.Done():
				return false
			case <-time.After(delay):
			}
			data, _ := json.Marshal(map[string]any{"id": "lab-completion", "object": "chat.completion.chunk", "model": "honobox-lab", "choices": []any{map[string]any{"index": 0, "delta": delta, "finish_reason": finish}}})
			_, err := fmt.Fprintf(writer, "data: %s\n\n", data)
			return err == nil
		}
		if scenario == "tool-call" {
			for i, part := range []string{`{"city":`, `"Shang`, `hai"}`} {
				function := map[string]any{"arguments": part}
				call := map[string]any{"index": 0, "function": function}
				if i == 0 {
					function["name"] = "get_weather"
					call["id"] = "call_lab_weather"
					call["type"] = "function"
				}
				if !emit(map[string]any{"tool_calls": []any{call}}, nil) {
					return
				}
			}
			if !emit(map[string]any{}, "tool_calls") {
				return
			}
		} else {
			parts := []string{"The ", "stream ", "is ", "arriving ", "one ", "chunk ", "at ", "a ", "time."}
			if scenario == "slow" {
				parts = append(parts, parts...)
				parts = append(parts, parts...)
			}
			for i, part := range parts {
				if !emit(map[string]any{"content": part}, nil) {
					return
				}
				if scenario == "interrupted" && i == 2 {
					return
				}
			}
			if !emit(map[string]any{}, "stop") {
				return
			}
		}
		_, _ = io.WriteString(writer, "data: [DONE]\n\n")
	}()
	return &http.Response{StatusCode: 200, Status: "200 OK", Header: http.Header{"Content-Type": []string{"text/event-stream"}}, Body: reader}, nil
}
