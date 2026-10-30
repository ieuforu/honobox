package server

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ieuforu/honobox/inspector/internal/trace"
)

func TestHostedDemoKeepsLiveTrafficPrivate(t *testing.T) {
	app, store := testServer(t, Config{DemoMode: true, AdminToken: "owner-test", GatewayToken: "gateway-test", APIKey: "provider-test"})
	for _, item := range []trace.Record{
		{ID: "public-lab", Source: "lab", Scenario: "tool-call", Status: "completed", StartedAt: time.Now()},
		{ID: "private-traffic", Source: "live", Status: "failed", Error: "private provider detail", Request: json.RawMessage(`{"messages":[{"content":"private user prompt"}]}`), StartedAt: time.Now()},
	} {
		if err := store.Save(context.Background(), item); err != nil {
			t.Fatal(err)
		}
	}
	get := func(path, token string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", path, nil)
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		app.ServeHTTP(w, r)
		return w
	}
	list := get("/api/traces", "")
	var visible []trace.Record
	if err := json.Unmarshal(list.Body.Bytes(), &visible); err != nil {
		t.Fatal(err)
	}
	if list.Code != 200 || len(visible) != 1 || visible[0].ID != "public-lab" {
		t.Fatalf("unexpected public list: %s", list.Body.String())
	}
	if strings.Contains(list.Body.String(), "private") {
		t.Fatal("private traffic appeared in demo list")
	}
	if get("/api/traces/private-traffic", "").Code != 404 {
		t.Fatal("guessed private ID is readable")
	}
	if get("/api/traces/public-lab", "").Code != 200 {
		t.Fatal("demo record is not readable")
	}
	if get("/api/traces/private-traffic", "owner-test").Code != 200 {
		t.Fatal("owner cannot read private record")
	}
	if get("/api/traces", "wrong-token").Code != 401 {
		t.Fatal("invalid credentials silently fell back to demo")
	}
	for _, item := range []struct {
		token              string
		wantDemo, wantLive bool
	}{{"", true, false}, {"owner-test", false, true}} {
		w := get("/api/config", item.token)
		var cfg struct {
			Demo bool `json:"demo"`
			Live bool `json:"liveConfigured"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &cfg); err != nil {
			t.Fatal(err)
		}
		if cfg.Demo != item.wantDemo || cfg.Live != item.wantLive || strings.Contains(w.Body.String(), "provider-test") {
			t.Fatalf("incorrect config: %s", w.Body.String())
		}
	}
	for _, path := range []string{"/api/lab/tool-call", "/v1/chat/completions"} {
		w := httptest.NewRecorder()
		app.ServeHTTP(w, post(path, `{"model":"test","messages":[{}]}`))
		if w.Code != 401 {
			t.Fatalf("anonymous write %s returned %d", path, w.Code)
		}
	}
}

func TestHostedDemoWithMissingTokensFailsClosed(t *testing.T) {
	app, _ := testServer(t, Config{DemoMode: true})
	w := httptest.NewRecorder()
	app.ServeHTTP(w, post("/api/lab/tool-call", ""))
	if w.Code != 503 {
		t.Fatalf("missing demo credentials permitted writes: %d", w.Code)
	}
}
