package sqlite

import (
	"context"
	"encoding/json"
	"fmt"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

type scaleEvidence struct {
	AuthoredBytes         int64   `json:"authoredBytes"`
	DatabaseBytes         int64   `json:"databaseBytes"`
	WALBytes              int64   `json:"walBytes"`
	BackupBytes           int64   `json:"backupBytes"`
	CanvasSaveP50MS       float64 `json:"canvasSaveP50Ms"`
	CanvasSaveP95MS       float64 `json:"canvasSaveP95Ms"`
	CanvasReadP50MS       float64 `json:"canvasReadP50Ms"`
	CanvasReadP95MS       float64 `json:"canvasReadP95Ms"`
	NormalizationDecision string  `json:"normalizationDecision"`
}

func percentile(values []time.Duration, fraction float64) time.Duration {
	if len(values) == 0 {
		return 0
	}
	ordered := append([]time.Duration(nil), values...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i] < ordered[j] })
	index := int(float64(len(ordered)-1) * fraction)
	return ordered[index]
}

func scaleCanvas(iteration, size int) workspacepkg.Snapshot {
	data, _ := json.Marshal(map[string]any{
		"elements": []any{map[string]any{
			"id": fmt.Sprintf("scale-%d", iteration), "type": "text", "text": fmt.Sprintf("needle-%d %s", iteration, strings.Repeat("x", size)),
		}},
		"appState": map[string]any{}, "files": map[string]any{},
	})
	return workspacepkg.Snapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(data)}
}

func fileSize(path string) int64 {
	info, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return info.Size()
}

func TestPersistenceScaleEvidence(t *testing.T) {
	if os.Getenv("NOTESPACE_SCALE_EVIDENCE") != "1" {
		t.Skip("scale evidence is an explicit CI measurement")
	}
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "scale.db")
	store, err := Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := workspacepkg.NewService(store)
	created, err := service.Create(ctx, "Canvas scale evidence")
	if err != nil {
		t.Fatal(err)
	}

	const iterations = 12
	const canvasBytes = 1 << 20
	saves := make([]time.Duration, 0, iterations)
	reads := make([]time.Duration, 0, iterations)
	state := workspacepkg.CanvasState{Canvas: created.Canvas, Version: created.CanvasVersion}
	for i := 0; i < iterations; i++ {
		canvas := scaleCanvas(i, canvasBytes)
		started := time.Now()
		state, err = service.UpdateCanvas(ctx, created.ID, workspacepkg.CanvasUpdate{Canvas: canvas, Version: state.Version})
		if err != nil {
			t.Fatal(err)
		}
		saves = append(saves, time.Since(started))
		started = time.Now()
		if _, err := service.GetCanvasState(ctx, created.ID); err != nil {
			t.Fatal(err)
		}
		reads = append(reads, time.Since(started))
	}

	var authoredBytes int64
	if err := store.db.QueryRowContext(ctx, `SELECT
COALESCE((SELECT length(canvas_state) FROM workspace_canvas WHERE workspace_id=?),0)
+ COALESCE((SELECT length(title)+length(references_state) FROM projects WHERE id=?),0)`,
		created.ID, created.ID).Scan(&authoredBytes); err != nil {
		t.Fatal(err)
	}
	backup, err := store.ExportBackupArchive(ctx)
	if err != nil {
		t.Fatal(err)
	}
	saveP50, saveP95 := percentile(saves, .50), percentile(saves, .95)
	readP50, readP95 := percentile(reads, .50), percentile(reads, .95)
	decision := "granular-canvas"
	if saveP95 > 250*time.Millisecond {
		decision = "investigate-granular-canvas-write-latency"
	}
	evidence := scaleEvidence{
		AuthoredBytes: authoredBytes, DatabaseBytes: fileSize(dbPath), WALBytes: fileSize(dbPath + "-wal"), BackupBytes: int64(len(backup)),
		CanvasSaveP50MS: float64(saveP50.Microseconds()) / 1000, CanvasSaveP95MS: float64(saveP95.Microseconds()) / 1000,
		CanvasReadP50MS: float64(readP50.Microseconds()) / 1000, CanvasReadP95MS: float64(readP95.Microseconds()) / 1000,
		NormalizationDecision: decision,
	}
	encoded, _ := json.MarshalIndent(evidence, "", "  ")
	t.Logf("persistence scale evidence: %s", encoded)
	if output := os.Getenv("NOTESPACE_SCALE_EVIDENCE_FILE"); output != "" {
		if err := os.WriteFile(output, append(encoded, '\n'), 0600); err != nil {
			t.Fatal(err)
		}
	}
}
