package trace

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	_ "modernc.org/sqlite"
)

type Event struct {
	Kind string `json:"kind"`
	MS   int64  `json:"ms"`
	Data string `json:"data,omitempty"`
}

type Record struct {
	ID            string          `json:"id"`
	StartedAt     time.Time       `json:"startedAt"`
	Model         string          `json:"model"`
	Source        string          `json:"source"`
	Scenario      string          `json:"scenario,omitempty"`
	Status        string          `json:"status"`
	HTTPStatus    int             `json:"httpStatus"`
	DurationMS    int64           `json:"durationMs"`
	FirstOutputMS *int64          `json:"firstOutputMs"`
	Request       json.RawMessage `json:"request,omitempty"`
	Response      string          `json:"response,omitempty"`
	Error         string          `json:"error,omitempty"`
	Events        []Event         `json:"events,omitempty"`
	Truncated     bool            `json:"truncated"`
}

type Store struct{ db *sql.DB }

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`PRAGMA journal_mode=WAL;
		PRAGMA busy_timeout=5000;
		CREATE TABLE IF NOT EXISTS traces (
			id TEXT PRIMARY KEY, started_at TEXT NOT NULL, record BLOB NOT NULL
		);
		CREATE INDEX IF NOT EXISTS traces_started ON traces(started_at DESC);`)
	if err != nil {
		db.Close()
		return nil, err
	}
	// Recover every interrupted request, including records outside the UI's first page.
	_, err = db.Exec(`UPDATE traces SET record=json_set(record,
		'$.status', 'interrupted', '$.error', 'Inspector restarted before this request completed')
		WHERE json_extract(record, '$.status')='running'`)
	if err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) Save(ctx context.Context, item Record) error {
	body, err := json.Marshal(item)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO traces(id, started_at, record) VALUES (?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET record=excluded.record`, item.ID, item.StartedAt.UTC().Format(time.RFC3339Nano), body)
	if err != nil {
		return err
	}
	// Keep bounded local storage; never delete an in-flight request.
	_, err = s.db.ExecContext(ctx, `DELETE FROM traces WHERE id IN (
		SELECT id FROM traces WHERE json_extract(record, '$.status') != 'running'
		ORDER BY started_at DESC, id DESC LIMIT -1 OFFSET 500)`)
	return err
}

func (s *Store) List(ctx context.Context) ([]Record, error) {
	return s.list(ctx, "")
}

func (s *Store) ListLab(ctx context.Context) ([]Record, error) {
	return s.list(ctx, "lab")
}

func (s *Store) list(ctx context.Context, source string) ([]Record, error) {
	query := `SELECT record FROM traces`
	var args []any
	if source != "" {
		query += ` WHERE json_extract(record, '$.source')=?`
		args = append(args, source)
	}
	query += ` ORDER BY started_at DESC, id DESC LIMIT 100`
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Record, 0)
	for rows.Next() {
		var body []byte
		if err := rows.Scan(&body); err != nil {
			return nil, err
		}
		var item Record
		if err := json.Unmarshal(body, &item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) Get(ctx context.Context, id string) (Record, error) {
	var item Record
	var body []byte
	err := s.db.QueryRowContext(ctx, `SELECT record FROM traces WHERE id=?`, id).Scan(&body)
	if err != nil {
		return item, err
	}
	err = json.Unmarshal(body, &item)
	return item, err
}
