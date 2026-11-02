package server

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/ieuforu/honobox/inspector/internal/trace"
)

const captureLimit = 256 * 1024

type recorder struct {
	item            trace.Record
	start           time.Time
	lastSave        time.Time
	store           *trace.Store
	pending         string
	data            []string
	done            bool
	streamError     bool
	observerStopped bool
	secret          string
	eventBytes      int
	dataBytes       int
}

func (p *recorder) clean(text string) string {
	if p.secret != "" {
		return strings.ReplaceAll(text, p.secret, "[redacted]")
	}
	return text
}

func (p *recorder) event(kind, data string) {
	if len(p.item.Events) >= 300 || p.eventBytes+len(data) > captureLimit {
		p.item.Truncated = true
		return
	}
	p.eventBytes += len(data)
	p.item.Events = append(p.item.Events, trace.Event{Kind: kind, MS: time.Since(p.start).Milliseconds(), Data: p.clean(data)})
}

func (p *recorder) save() error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	p.item.DurationMS = time.Since(p.start).Milliseconds()
	p.lastSave = time.Now()
	return p.store.Save(ctx, p.item)
}

func (p *recorder) feed(chunk []byte) {
	if len(p.item.Response) < captureLimit {
		room := captureLimit - len(p.item.Response)
		if len(chunk) > room {
			p.item.Truncated = true
			chunkForCapture := chunk[:room]
			p.item.Response += p.clean(string(chunkForCapture))
		} else {
			p.item.Response += p.clean(string(chunk))
		}
	} else {
		p.item.Truncated = true
	}
	if p.observerStopped {
		return
	}
	p.pending += string(chunk)
	if len(p.pending) > captureLimit {
		p.item.Truncated, p.observerStopped = true, true
		p.pending, p.data = "", nil
		p.event("capture_limit", "A stream frame exceeded the capture limit; forwarding continues")
		return
	}
	for {
		i := strings.IndexByte(p.pending, '\n')
		if i < 0 {
			break
		}
		line := strings.TrimSuffix(p.pending[:i], "\r")
		p.pending = p.pending[i+1:]
		if line == "" {
			if len(p.data) > 0 {
				p.observe(strings.Join(p.data, "\n"))
				p.data = nil
				p.dataBytes = 0
			}
		} else if strings.HasPrefix(line, "data:") {
			p.dataBytes += len(line)
			if p.dataBytes > captureLimit {
				p.item.Truncated, p.observerStopped = true, true
				p.data = nil
				return
			}
			p.data = append(p.data, strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
		}
	}
}

func (p *recorder) observe(data string) {
	if data == "[DONE]" {
		p.done = true
		p.event("done", "Provider sent [DONE]")
		return
	}
	var chunk struct {
		Error   json.RawMessage `json:"error"`
		Choices []struct {
			Delta struct {
				Content   string          `json:"content"`
				ToolCalls json.RawMessage `json:"tool_calls"`
			} `json:"delta"`
			FinishReason *string `json:"finish_reason"`
		} `json:"choices"`
	}
	if err := json.Unmarshal([]byte(data), &chunk); err != nil {
		p.event("unparsed", data)
		return
	}
	if len(chunk.Error) > 0 && string(chunk.Error) != "null" {
		p.streamError = true
		p.item.Error = p.clean(string(chunk.Error))
		p.event("provider_error", string(chunk.Error))
		return
	}
	kind, meaningful := "chunk", false
	for _, choice := range chunk.Choices {
		if len(choice.Delta.ToolCalls) > 0 && string(choice.Delta.ToolCalls) != "null" && string(choice.Delta.ToolCalls) != "[]" {
			kind = "tool_delta"
			meaningful = true
		}
		if choice.Delta.Content != "" {
			meaningful = true
		}
		if choice.FinishReason != nil {
			p.event("finish_reason", *choice.FinishReason)
		}
	}
	if meaningful {
		if p.item.FirstOutputMS == nil {
			ms := time.Since(p.start).Milliseconds()
			p.item.FirstOutputMS = &ms
			p.event("first_output", "First content or tool-call delta")
		}
		p.event(kind, data)
	}
}

func (s *Server) proxy(w http.ResponseWriter, r *http.Request) { s.forward(w, r, "") }

func (s *Server) forward(w http.ResponseWriter, r *http.Request, scenario string) {
	select {
	case s.active <- struct{}{}:
		defer func() { <-s.active }()
	default:
		writeJSON(w, 429, map[string]string{"error": "Eight requests are already in progress"})
		return
	}
	if r.Header.Get("Content-Type") != "" && !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		writeJSON(w, 415, map[string]string{"error": "Content-Type must be application/json"})
		return
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1024*1024))
	if err != nil {
		writeJSON(w, 413, map[string]string{"error": "Request body exceeds 1 MiB"})
		return
	}
	var body struct {
		Model    string            `json:"model"`
		Messages []json.RawMessage `json:"messages"`
		Stream   bool              `json:"stream"`
	}
	if json.Unmarshal(raw, &body) != nil || body.Model == "" || len(body.Messages) == 0 {
		writeJSON(w, 400, map[string]string{"error": "A model and nonempty messages array are required"})
		return
	}
	if scenario == "" {
		if err := ValidateProviderConfig(s.cfg); err != nil {
			writeJSON(w, 503, map[string]string{"error": err.Error()})
			return
		}
		if s.cfg.Provider == ProviderOpenRouterFree {
			raw, err = prepareFreeRequest(raw)
			if err != nil {
				writeJSON(w, 400, map[string]string{"error": err.Error()})
				return
			}
		}
	}
	id := make([]byte, 12)
	if _, err := rand.Read(id); err != nil {
		writeJSON(w, 500, map[string]string{"error": "Cannot create trace"})
		return
	}
	p := &recorder{start: time.Now(), store: s.store, secret: s.cfg.APIKey}
	source := "live"
	if scenario != "" {
		source = "lab"
	}
	p.item = trace.Record{ID: hex.EncodeToString(id), StartedAt: p.start.UTC(), Model: body.Model, Source: source, Scenario: scenario, Status: "running", Request: json.RawMessage(p.clean(string(raw))), Events: []trace.Event{}}
	p.event("received", "Request accepted")
	if err := p.save(); err != nil {
		writeJSON(w, 500, map[string]string{"error": "Cannot persist trace"})
		return
	}
	w.Header().Set("X-Honobox-Trace-Id", p.item.ID)
	defer func() {
		if err := p.save(); err != nil {
			slog.Error("trace finalization failed", "trace_id", p.item.ID, "error", err)
		}
	}()

	ctx := r.Context()
	if scenario == "timeout" {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 700*time.Millisecond)
		defer cancel()
	}
	var response *http.Response
	if scenario != "" {
		response, err = mockResponse(ctx, scenario)
	} else if s.cfg.APIKey == "" {
		err = errors.New("Live provider is not configured; local lab scenarios work without a key")
	} else {
		var upstream *http.Request
		upstream, err = http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(s.cfg.UpstreamURL, "/")+"/chat/completions", bytes.NewReader(raw))
		if err == nil {
			upstream.Header.Set("Content-Type", "application/json")
			upstream.Header.Set("Authorization", "Bearer "+s.cfg.APIKey)
			upstream.Header.Set("Accept", "text/event-stream, application/json")
			response, err = s.client.Do(upstream)
		}
	}
	if err != nil {
		p.item.Status, p.item.HTTPStatus, p.item.Error = "failed", 502, "Upstream connection failed"
		if s.cfg.APIKey == "" && scenario == "" {
			p.item.HTTPStatus = 503
			p.item.Error = err.Error()
		}
		if errors.Is(err, context.DeadlineExceeded) {
			p.item.Status, p.item.HTTPStatus, p.item.Error = "timeout", 504, "Upstream response timed out"
		}
		if r.Context().Err() != nil {
			p.item.Status, p.item.HTTPStatus, p.item.Error = "cancelled", 499, "Client disconnected"
		}
		p.event(p.item.Status, p.item.Error)
		writeJSON(w, p.item.HTTPStatus, map[string]string{"error": p.item.Error})
		return
	}
	defer response.Body.Close()
	p.item.HTTPStatus = response.StatusCode
	p.event("upstream_headers", http.StatusText(response.StatusCode))
	contentType := response.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(response.StatusCode)
	controller := http.NewResponseController(w)
	_ = controller.Flush()
	isStream := strings.HasPrefix(contentType, "text/event-stream")
	buffer := make([]byte, 8192)
	var readErr error
	for {
		n, err := response.Body.Read(buffer)
		if n > 0 {
			if isStream {
				p.feed(buffer[:n])
			} else {
				room := captureLimit - len(p.item.Response)
				if room > 0 {
					p.item.Response += p.clean(string(buffer[:min(n, room)]))
				}
				if n > room {
					p.item.Truncated = true
				}
			}
			if _, writeErr := w.Write(buffer[:n]); writeErr != nil {
				readErr = writeErr
				break
			}
			if isStream {
				if flushErr := controller.Flush(); flushErr != nil {
					readErr = flushErr
					break
				}
			}
			if time.Since(p.lastSave) > 100*time.Millisecond {
				if err := p.save(); err != nil {
					slog.Error("trace update failed", "trace_id", p.item.ID, "error", err)
				}
			}
		}
		if err != nil {
			if !errors.Is(err, io.EOF) {
				readErr = err
			}
			break
		}
	}
	p.item.Status = "completed"
	switch {
	case r.Context().Err() != nil:
		p.item.Status, p.item.Error = "cancelled", "Client disconnected; upstream request cancelled"
	case ctx.Err() != nil || errors.Is(readErr, context.DeadlineExceeded):
		p.item.Status, p.item.Error = "timeout", "Upstream response timed out"
	case response.StatusCode >= 300:
		p.item.Status, p.item.Error = "failed", "Upstream returned HTTP "+response.Status
	case p.streamError:
		p.item.Status = "failed"
	case readErr != nil || (isStream && !p.done && !p.observerStopped):
		p.item.Status, p.item.Error = "interrupted", "Stream ended without [DONE]"
	}
	p.event(p.item.Status, p.item.Error)
}
