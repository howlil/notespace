package persistence

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/howlil/notespace/apps/server/internal/project"
)

type scaleEvidence struct {
	AuthoredBytes         int64   `json:"authoredBytes"`
	DatabaseBytes         int64   `json:"databaseBytes"`
	WALBytes              int64   `json:"walBytes"`
	BackupBytes           int64   `json:"backupBytes"`
	AutosaveP50MS         float64 `json:"autosaveP50Ms"`
	AutosaveP95MS         float64 `json:"autosaveP95Ms"`
	FTSSyncP50MS          float64 `json:"ftsSyncP50Ms"`
	FTSSyncP95MS          float64 `json:"ftsSyncP95Ms"`
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

func scaleDocument(iteration, size int) project.Snapshot {
	text := fmt.Sprintf("needle-%d ", iteration) + strings.Repeat("x", size)
	body, _ := json.Marshal(map[string]any{
		"type": "doc",
		"content": []any{map[string]any{
			"type": "paragraph",
			"attrs": map[string]any{"blockId": "scale-block"},
			"content": []any{map[string]any{"type": "text", "text": text}},
		}},
	})
	return project.Snapshot{Format: "tiptap", Version: 1, Data: json.RawMessage(body)}
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
	service := project.Service{Store: store}
	workspace, err := service.Create(ctx, "Scale evidence")
	if err != nil {
		t.Fatal(err)
	}

	// A 1 MiB note is duplicated in the current aggregate's document/notes
	// compatibility fields, deliberately exercising a >2 MiB authored row.
	const iterations = 12
	const documentBytes = 1 << 20
	saves := make([]time.Duration, 0, iterations)
	searches := make([]time.Duration, 0, iterations)
	for i := 0; i < iterations; i++ {
		document := scaleDocument(i, documentBytes)
		notes := append([]project.Note(nil), workspace.Notes...)
		notes[0].Document = document
		started := time.Now()
		workspace, err = service.Update(ctx, workspace.ID, project.Update{
			Title: workspace.Title, Document: document, Notes: notes, Canvas: workspace.Canvas,
			References: workspace.References, SplitRatio: workspace.SplitRatio, Version: workspace.Version,
		})
		if err != nil {
			t.Fatal(err)
		}
		saves = append(saves, time.Since(started))
		started = time.Now()
		if _, err := store.SearchIndexed(ctx, "needle"); err != nil {
			t.Fatal(err)
		}
		searches = append(searches, time.Since(started))
	}

	var authoredBytes int64
	if err := store.db.QueryRowContext(ctx, `SELECT length(document_state)+length(notes_state)+length(canvas_state)+length(references_state) FROM projects WHERE id=?`, workspace.ID).Scan(&authoredBytes); err != nil {
		t.Fatal(err)
	}
	backup, err := store.ExportBackupArchiveAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	saveP50, saveP95 := percentile(saves, .50), percentile(saves, .95)
	searchP50, searchP95 := percentile(searches, .50), percentile(searches, .95)
	decision := "defer"
	if authoredBytes > 2<<20 && saveP95 > 250*time.Millisecond {
		decision = "normalization-candidate"
	}
	evidence := scaleEvidence{
		AuthoredBytes: authoredBytes, DatabaseBytes: fileSize(dbPath), WALBytes: fileSize(dbPath + "-wal"), BackupBytes: int64(len(backup)),
		AutosaveP50MS: float64(saveP50.Microseconds()) / 1000, AutosaveP95MS: float64(saveP95.Microseconds()) / 1000,
		FTSSyncP50MS: float64(searchP50.Microseconds()) / 1000, FTSSyncP95MS: float64(searchP95.Microseconds()) / 1000,
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
