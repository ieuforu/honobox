package trace

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func TestRestartPreservesRecordsAndFinalizesInterruptedRequests(t *testing.T) {
	path := filepath.Join(t.TempDir(), "traces.db")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	for _, item := range []Record{
		{ID: "finished", StartedAt: time.Now(), Status: "completed", Response: "kept"},
		{ID: "in-flight", StartedAt: time.Now(), Status: "running"},
	} {
		if err := store.Save(ctx, item); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	store, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	finished, _ := store.Get(ctx, "finished")
	interrupted, _ := store.Get(ctx, "in-flight")
	if finished.Status != "completed" || finished.Response != "kept" {
		t.Fatalf("finished record changed: %+v", finished)
	}
	if interrupted.Status != "interrupted" || interrupted.Error == "" {
		t.Fatalf("in-flight record not recovered: %+v", interrupted)
	}
}
