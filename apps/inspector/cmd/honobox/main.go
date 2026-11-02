package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	inspector "github.com/ieuforu/honobox/inspector"
	"github.com/ieuforu/honobox/inspector/internal/server"
	"github.com/ieuforu/honobox/inspector/internal/trace"
)

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func main() {
	if err := run(); err != nil {
		slog.Error("inspector stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	addr := env("HONOBOX_ADDR", "127.0.0.1:3100")
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return errors.New("HONOBOX_ADDR must have host:port form")
	}
	admin, gateway := os.Getenv("HONOBOX_ADMIN_TOKEN"), os.Getenv("HONOBOX_GATEWAY_TOKEN")
	demoMode := os.Getenv("HONOBOX_DEMO_MODE") == "true"
	if demoMode && (admin == "" || gateway == "") {
		return errors.New("hosted demo mode requires HONOBOX_ADMIN_TOKEN and HONOBOX_GATEWAY_TOKEN")
	}
	ip := net.ParseIP(host)
	if host != "localhost" && (ip == nil || !ip.IsLoopback()) && (admin == "" || gateway == "") {
		return errors.New("non-loopback listeners require HONOBOX_ADMIN_TOKEN and HONOBOX_GATEWAY_TOKEN")
	}
	provider := env("HONOBOX_PROVIDER", server.ProviderDeepSeek)
	upstream := env("HONOBOX_UPSTREAM_BASE_URL", "https://api.deepseek.com")
	model, apiKey := env("HONOBOX_MODEL", "deepseek-flash"), os.Getenv("DEEPSEEK_API_KEY")
	if provider == server.ProviderOpenRouterFree {
		upstream = server.OpenRouterFreeBaseURL
		model, apiKey = env("HONOBOX_MODEL", "openrouter/free"), os.Getenv("OPENROUTER_API_KEY")
	}
	cfg := server.Config{Provider: provider, UpstreamURL: upstream, APIKey: apiKey, AdminToken: admin, GatewayToken: gateway, Model: model, Assets: inspector.Assets(), DemoMode: demoMode}
	if err := server.ValidateProviderConfig(cfg); err != nil {
		return err
	}
	u, err := url.Parse(upstream)
	if err != nil || u.Host == "" || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return errors.New("invalid upstream base URL")
	}
	path := env("HONOBOX_DB_PATH", ".data/inspector.db")
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	store, err := trace.Open(path)
	if err != nil {
		return err
	}
	defer store.Close()
	app := server.New(cfg, store)
	httpServer := &http.Server{Addr: addr, Handler: app, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 * 1024}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			_ = httpServer.Close()
		}
	}()
	slog.Info("HonoBox Inspector ready", "url", "http://"+addr, "provider", provider, "live_configured", apiKey != "")
	err = httpServer.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
