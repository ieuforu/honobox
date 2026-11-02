package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestFreeModeBlocksPaidModelsAndRoutingBeforeAnyNetworkRequest(t *testing.T) {
	app, store := testServer(t, Config{Provider: ProviderOpenRouterFree, APIKey: "free-test-only"})
	called := 0
	app.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		called++
		t.Fatal("rejected request reached the network transport")
		return nil, nil
	})
	cases := map[string]string{
		"paid model":                 `{"model":"openai/gpt-paid","messages":[{}]}`,
		"auto routing":               `{"model":"openrouter/auto","messages":[{}]}`,
		"paid variant appended":      `{"model":"vendor/model:free:online","messages":[{}]}`,
		"online variant before free": `{"model":"vendor/model:online:free","messages":[{}]}`,
		"model whitespace":           `{"model":"vendor/model:free ","messages":[{}]}`,
		"fallback models":            `{"model":"openrouter/free","models":["openai/gpt-paid"],"messages":[{}]}`,
		"provider override":          `{"model":"openrouter/free","provider":{"allow_fallbacks":true},"messages":[{}]}`,
		"route override":             `{"model":"openrouter/free","route":"fallback","messages":[{}]}`,
		"preset override":            `{"model":"openrouter/free","preset":"paid-preset","messages":[{}]}`,
		"plugin":                     `{"model":"openrouter/free","plugins":[{"id":"web"}],"messages":[{}]}`,
		"unknown extension":          `{"model":"openrouter/free","new_routing_option":true,"messages":[{}]}`,
		"capitalized model":          `{"model":"openrouter/free","Model":"openai/gpt-paid","messages":[{}]}`,
		"duplicate model":            `{"model":"openai/gpt-paid","model":"openrouter/free","messages":[{}]}`,
		"escaped duplicate model":    `{"model":"openrouter/free","mo\u0064el":"vendor/model:free","messages":[{}]}`,
		"server tool":                `{"model":"openrouter/free","tools":[{"type":"web_search"}],"messages":[{}]}`,
		"server tool choice":         `{"model":"openrouter/free","tool_choice":{"type":"web_search"},"messages":[{}]}`,
		"file processing":            `{"model":"openrouter/free","messages":[{"role":"user","content":[{"type":"file","file":{"filename":"file.pdf"}}]}]}`,
		"audio processing":           `{"model":"openrouter/free","messages":[{"role":"user","content":"hello","audio":{"id":"audio-test"}}]}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			w := httptest.NewRecorder()
			app.ServeHTTP(w, post("/v1/chat/completions", body))
			if w.Code != 400 {
				t.Fatalf("got %d: %s", w.Code, w.Body.String())
			}
		})
	}
	if called != 0 {
		t.Fatalf("made %d provider requests", called)
	}
	items, err := store.List(context.Background())
	if err != nil || len(items) != 0 {
		t.Fatalf("rejected requests created live traces: count=%d err=%v", len(items), err)
	}
}

func TestFreeModeFixesEndpointAndForwardsChatToolsWithZeroPriceBoundary(t *testing.T) {
	for _, model := range []string{"openrouter/free", "vendor/model-1.2:free"} {
		t.Run(model, func(t *testing.T) {
			app, store := testServer(t, Config{Provider: ProviderOpenRouterFree, APIKey: "free-test-only", UpstreamURL: "https://untrusted.invalid/v1"})
			calls := 0
			app.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
				calls++
				if r.URL.String() != "https://openrouter.ai/api/v1/chat/completions" {
					t.Fatalf("wrong destination: %s", r.URL)
				}
				if r.Header.Get("Authorization") != "Bearer free-test-only" {
					t.Fatal("missing dedicated provider key")
				}
				var body struct {
					Model    string            `json:"model"`
					Tools    []json.RawMessage `json:"tools"`
					Messages []json.RawMessage `json:"messages"`
					Provider struct {
						AllowFallbacks bool               `json:"allow_fallbacks"`
						MaxPrice       map[string]float64 `json:"max_price"`
					} `json:"provider"`
				}
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Fatal(err)
				}
				if body.Model != model || len(body.Tools) != 1 || len(body.Messages) != 3 || body.Provider.AllowFallbacks {
					t.Fatalf("chat or routing changed: %+v", body)
				}
				for _, unit := range []string{"prompt", "completion", "request", "image"} {
					if price, ok := body.Provider.MaxPrice[unit]; !ok || price != 0 {
						t.Fatalf("missing zero-price boundary for %s", unit)
					}
				}
				return &http.Response{StatusCode: 200, Status: "200 OK", Header: http.Header{"Content-Type": {"text/event-stream"}}, Body: io.NopCloser(strings.NewReader("data: [DONE]\n\n"))}, nil
			})
			body := `{"model":"` + model + `","stream":true,"stream_options":{"include_usage":true},"max_tokens":64,"tools":[{"type":"function","function":{"name":"lookup","parameters":{"type":"object"}}}],"tool_choice":"auto","messages":[{"role":"user","content":"hello"},{"role":"assistant","content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"lookup","arguments":"{}"}}]},{"role":"tool","tool_call_id":"call_1","content":"done"}]}`
			w := httptest.NewRecorder()
			app.ServeHTTP(w, post("/v1/chat/completions", body))
			if w.Code != 200 || calls != 1 || w.Body.String() != "data: [DONE]\n\n" {
				t.Fatalf("code=%d calls=%d body=%s", w.Code, calls, w.Body.String())
			}
			item, err := store.Get(context.Background(), w.Header().Get("X-Honobox-Trace-Id"))
			if err != nil || item.Status != "completed" || item.Model != model {
				t.Fatalf("incorrect trace: %+v %v", item, err)
			}
		})
	}
}

func TestFreeProviderConfigurationAndKeylessLab(t *testing.T) {
	app, _ := testServer(t, Config{Provider: ProviderOpenRouterFree})
	app.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		t.Fatal("keyless mode used provider transport")
		return nil, nil
	})
	w := httptest.NewRecorder()
	app.ServeHTTP(w, httptest.NewRequest("GET", "/api/config", nil))
	var cfg struct {
		Provider       string `json:"provider"`
		Model          string `json:"model"`
		Upstream       string `json:"upstream"`
		LiveConfigured bool   `json:"liveConfigured"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &cfg); err != nil {
		t.Fatal(err)
	}
	if cfg.Provider != ProviderOpenRouterFree || cfg.Model != "openrouter/free" || cfg.Upstream != OpenRouterFreeBaseURL || cfg.LiveConfigured {
		t.Fatalf("unexpected public config: %+v", cfg)
	}
	w = httptest.NewRecorder()
	app.ServeHTTP(w, post("/api/lab/tool-call", ""))
	if w.Code != 200 {
		t.Fatalf("keyless lab failed: %d %s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	app.ServeHTTP(w, post("/v1/chat/completions", `{"model":"openrouter/free","messages":[{"role":"user","content":"hello"}]}`))
	if w.Code != 503 {
		t.Fatalf("missing-key live call returned %d", w.Code)
	}
}

func TestInvalidProviderConfigurationFailsClosed(t *testing.T) {
	for _, cfg := range []Config{
		{Provider: "typo", Model: "openrouter/free", APIKey: "test-only"},
		{Provider: ProviderOpenRouterFree, Model: "vendor/paid", APIKey: "test-only"},
	} {
		if ValidateProviderConfig(cfg) == nil {
			t.Fatalf("invalid startup config accepted: %+v", cfg)
		}
		app, _ := testServer(t, cfg)
		app.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
			t.Fatal("invalid config reached provider")
			return nil, nil
		})
		w := httptest.NewRecorder()
		app.ServeHTTP(w, post("/v1/chat/completions", `{"model":"openrouter/free","messages":[{}]}`))
		if w.Code != 503 {
			t.Fatalf("invalid config returned %d", w.Code)
		}
	}
}
