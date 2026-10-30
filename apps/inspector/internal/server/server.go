package server

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"io/fs"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/ieuforu/honobox/inspector/internal/trace"
)

type Config struct {
	UpstreamURL  string
	APIKey       string
	GatewayToken string
	AdminToken   string
	Model        string
	Timeout      time.Duration
	Assets       fs.FS
	DemoMode     bool
}

type Server struct {
	cfg    Config
	store  *trace.Store
	client *http.Client
	mux    *http.ServeMux
	active chan struct{}
}

func New(cfg Config, store *trace.Store) *Server {
	if cfg.Timeout <= 0 {
		cfg.Timeout = 90 * time.Second
	}
	if cfg.Model == "" {
		cfg.Model = "deepseek-flash"
	}
	s := &Server{cfg: cfg, store: store, client: &http.Client{
		Timeout: cfg.Timeout,
		// A provider redirect must not move credentials to another destination.
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
	}, mux: http.NewServeMux(), active: make(chan struct{}, 8)}
	s.mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})
	s.mux.Handle("GET /api/config", s.readAccess(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		demo := isDemoRequest(r)
		writeJSON(w, 200, map[string]any{"liveConfigured": cfg.APIKey != "" && !demo, "model": cfg.Model, "upstream": cfg.UpstreamURL, "demo": demo})
	})))
	s.mux.Handle("GET /api/traces", s.readAccess(http.HandlerFunc(s.list)))
	s.mux.Handle("GET /api/traces/{id}", s.readAccess(http.HandlerFunc(s.detail)))
	s.mux.Handle("POST /api/lab/{scenario}", s.guard(cfg.AdminToken, http.HandlerFunc(s.lab)))
	s.mux.Handle("POST /v1/chat/completions", s.guard(cfg.GatewayToken, http.HandlerFunc(s.proxy)))
	if cfg.Assets != nil {
		s.mux.Handle("GET /", http.FileServerFS(cfg.Assets))
	}
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	if strings.HasPrefix(r.URL.Path, "/api/") {
		w.Header().Set("Cache-Control", "no-store")
	}
	s.mux.ServeHTTP(w, r)
}

func (s *Server) guard(token string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.DemoMode && token == "" {
			writeJSON(w, 503, map[string]string{"error": "Hosted demo access tokens are not configured"})
			return
		}
		// Prevent another website from spending quota through a local inspector.
		if origin := r.Header.Get("Origin"); origin != "" {
			u, err := url.Parse(origin)
			if err != nil || u.Host != r.Host || (u.Scheme != "http" && u.Scheme != "https") {
				writeJSON(w, 403, map[string]string{"error": "Cross-origin access is not allowed"})
				return
			}
		}
		if token != "" {
			got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if subtle.ConstantTimeCompare([]byte(got), []byte(token)) != 1 {
				writeJSON(w, 401, map[string]string{"error": "A valid bearer token is required"})
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

type demoContextKey struct{}

func isDemoRequest(r *http.Request) bool {
	demo, _ := r.Context().Value(demoContextKey{}).(bool)
	return demo
}

func (s *Server) readAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.DemoMode && r.Header.Get("Authorization") == "" {
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), demoContextKey{}, true)))
			return
		}
		s.guard(s.cfg.AdminToken, next).ServeHTTP(w, r)
	})
}

func (s *Server) list(w http.ResponseWriter, r *http.Request) {
	var items []trace.Record
	var err error
	if isDemoRequest(r) {
		items, err = s.store.ListLab(r.Context())
	} else {
		items, err = s.store.List(r.Context())
	}
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": "Cannot load traces"})
		return
	}
	for i := range items {
		items[i].Request = nil
		items[i].Response = ""
		items[i].Events = nil
	}
	writeJSON(w, 200, items)
}

func (s *Server) detail(w http.ResponseWriter, r *http.Request) {
	item, err := s.store.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		writeJSON(w, 404, map[string]string{"error": "Trace not found"})
		return
	}
	if isDemoRequest(r) && item.Source != "lab" {
		writeJSON(w, 404, map[string]string{"error": "Trace not found"})
		return
	}
	writeJSON(w, 200, item)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Debug("response write ended", "error", err)
	}
}
