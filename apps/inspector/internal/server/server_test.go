package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ieuforu/honobox/inspector/internal/trace"
)

func testServer(t *testing.T, cfg Config) (*Server, *trace.Store) {
	t.Helper()
	store, err := trace.Open(filepath.Join(t.TempDir(), "traces.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return New(cfg, store), store
}

func post(path, body string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func TestForwardPreservesToolMessagesAndUnknownFields(t *testing.T) {
	body := `{"model":"unit-model","stream":true,"thinking":{"type":"disabled"},"tools":[{"type":"function","function":{"name":"lookup"}}],"messages":[{"role":"assistant","content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"lookup","arguments":"{}"}}]},{"role":"tool","tool_call_id":"call_1","content":"done"}]}`
	wire := "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"你好\"},\"finish_reason\":null}]}\r\n\r\ndata: [DONE]\r\n\r\n"
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got, _ := io.ReadAll(r.Body)
		if string(got) != body {
			t.Errorf("request changed: %s", got)
		}
		if r.Header.Get("Authorization") != "Bearer provider-test-only" {
			t.Error("provider auth missing")
		}
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, wire)
	}))
	defer upstream.Close()
	app, store := testServer(t, Config{APIKey: "provider-test-only", UpstreamURL: upstream.URL + "/v1"})
	w := httptest.NewRecorder()
	app.ServeHTTP(w, post("/v1/chat/completions", body))
	if w.Code != 200 || w.Body.String() != wire {
		t.Fatalf("wire changed: %d %q", w.Code, w.Body.String())
	}
	item, err := store.Get(context.Background(), w.Header().Get("X-Honobox-Trace-Id"))
	if err != nil {
		t.Fatal(err)
	}
	if item.Status != "completed" || item.FirstOutputMS == nil {
		t.Fatalf("bad trace: %+v", item)
	}
	if string(item.Request) != body {
		t.Fatal("tool messages or provider-specific fields were removed")
	}
	encoded, _ := json.Marshal(item)
	if strings.Contains(string(encoded), "provider-test-only") {
		t.Fatal("provider credential recorded")
	}
}

func TestSSEObserverHandlesFragmentedUTF8AndMultilineData(t *testing.T) {
	p := &recorder{start: time.Now(), item: trace.Record{}}
	wire := "data: {\"choices\":\r\ndata: [{\"index\":0,\"delta\":{\"content\":\"你好\"}}]}\r\n\r\ndata: [DONE]\r\n\r\n"
	for _, value := range []byte(wire) {
		p.feed([]byte{value})
	}
	if !p.done || p.item.FirstOutputMS == nil {
		t.Fatal("split stream was not parsed")
	}
	var textEvents int
	for _, event := range p.item.Events {
		if event.Kind == "chunk" {
			textEvents++
		}
	}
	if textEvents != 1 || p.item.Response != wire {
		t.Fatalf("events=%d response=%q", textEvents, p.item.Response)
	}
}

func TestCaptureIsBoundedWithoutStoppingForwarding(t *testing.T) {
	p := &recorder{start: time.Now()}
	p.feed([]byte("data: " + strings.Repeat("x", captureLimit+10)))
	if !p.observerStopped || !p.item.Truncated || len(p.item.Response) > captureLimit {
		t.Fatal("oversized event was not bounded")
	}
	p.event("test", strings.Repeat("x", captureLimit+1))
	if p.eventBytes > captureLimit {
		t.Fatal("event budget exceeded")
	}
}

func TestLabScenariosAreRecordedWithoutCredentials(t *testing.T) {
	for _, scenario := range []struct {
		name, status string
		code         int
	}{
		{"tool-call", "completed", 200}, {"interrupted", "interrupted", 200}, {"upstream-error", "failed", 503}, {"timeout", "timeout", 504},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			app, store := testServer(t, Config{})
			w := httptest.NewRecorder()
			app.ServeHTTP(w, post("/api/lab/"+scenario.name, ""))
			item, err := store.Get(context.Background(), w.Header().Get("X-Honobox-Trace-Id"))
			if err != nil {
				t.Fatal(err)
			}
			if w.Code != scenario.code || item.Status != scenario.status || item.Source != "lab" {
				t.Fatalf("code=%d trace=%+v", w.Code, item)
			}
			if scenario.name == "tool-call" {
				var fragments int
				for _, event := range item.Events {
					if event.Kind == "tool_delta" {
						fragments++
					}
				}
				if fragments != 3 {
					t.Fatalf("got %d tool fragments", fragments)
				}
			}
		})
	}
}

func TestDownstreamCancellationCancelsUpstreamAndPersistsTrace(t *testing.T) {
	cancelled := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"first\"}}]}\n\n")
		w.(http.Flusher).Flush()
		<-r.Context().Done()
		close(cancelled)
	}))
	defer upstream.Close()
	app, store := testServer(t, Config{APIKey: "test-only", UpstreamURL: upstream.URL})
	proxy := httptest.NewServer(app)
	defer proxy.Close()
	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, proxy.URL+"/v1/chat/completions", strings.NewReader(`{"model":"test","stream":true,"messages":[{"role":"user","content":"hello"}]}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	id := resp.Header.Get("X-Honobox-Trace-Id")
	buf := make([]byte, 8)
	_, _ = resp.Body.Read(buf)
	cancel()
	_ = resp.Body.Close()
	select {
	case <-cancelled:
	case <-time.After(2 * time.Second):
		t.Fatal("upstream was not cancelled")
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		item, _ := store.Get(context.Background(), id)
		if item.Status == "cancelled" {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("cancellation was not persisted")
}

func TestProviderDeadlineReturns504(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		<-r.Context().Done()
	}))
	defer upstream.Close()
	app, store := testServer(t, Config{APIKey: "test-only", UpstreamURL: upstream.URL, Timeout: 30 * time.Millisecond})
	w := httptest.NewRecorder()
	app.ServeHTTP(w, post("/v1/chat/completions", `{"model":"test","messages":[{}]}`))
	item, _ := store.Get(context.Background(), w.Header().Get("X-Honobox-Trace-Id"))
	if w.Code != 504 || item.Status != "timeout" {
		t.Fatalf("code=%d status=%s", w.Code, item.Status)
	}
}

func TestAuthOriginAndBodyLimits(t *testing.T) {
	app, _ := testServer(t, Config{AdminToken: "admin-test", GatewayToken: "gateway-test"})
	for _, item := range []struct {
		path, token, origin string
		want                int
	}{
		{"/api/traces", "", "", 401}, {"/api/traces", "gateway-test", "", 401},
		{"/api/traces", "admin-test", "", 200}, {"/api/traces", "admin-test", "https://other.test", 403},
	} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", item.path, nil)
		r.Header.Set("Authorization", "Bearer "+item.token)
		r.Header.Set("Origin", item.origin)
		app.ServeHTTP(w, r)
		if w.Code != item.want {
			t.Errorf("%+v got %d", item, w.Code)
		}
	}
	w := httptest.NewRecorder()
	r := post("/v1/chat/completions", strings.Repeat("x", 1024*1024+1))
	r.Header.Set("Authorization", "Bearer gateway-test")
	app.ServeHTTP(w, r)
	if w.Code != 413 {
		t.Fatalf("got %d for oversized body", w.Code)
	}
}

func TestMissingKeyDoesNotCallAProvider(t *testing.T) {
	app, _ := testServer(t, Config{})
	w := httptest.NewRecorder()
	app.ServeHTTP(w, post("/v1/chat/completions", `{"model":"test","messages":[{}]}`))
	if w.Code != 503 {
		t.Fatalf("missing-key response: %d %s", w.Code, w.Body.String())
	}
}
