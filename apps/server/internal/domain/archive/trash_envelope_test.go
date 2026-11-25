package archive

import (
	"bytes"
	"compress/zlib"
	"encoding/gob"
	"encoding/json"
	"reflect"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/domain"
)

func TestTrashCodecReadsPreExtractionGobType(t *testing.T) {
	// Preserve an earlier concrete Go struct layout with retired fields, rather
	// than encoding the current type and only proving a same-version round trip.
	type legacyPlan struct {
		WorkspaceID string
	}
	type legacyHistorySnapshot struct {
		ID string
	}
	type workspaceEnvelope struct {
		Project       domain.Workspace
		Plan          legacyPlan
		History       []legacyHistorySnapshot
		Assets        []domain.StoredAsset
		NoteInstances []domain.NoteInstance
	}
	legacy := workspaceEnvelope{
		Project: domain.Workspace{
			WorkspaceSummary: domain.WorkspaceSummary{ID: "legacy", CategoryID: "legacy", Title: "Existing trash", Version: 1},
			Canvas:           domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[]}`)},
		},
		Plan:    legacyPlan{WorkspaceID: "legacy"},
		History: []legacyHistorySnapshot{{ID: "hist-1"}},
		Assets:  []domain.StoredAsset{{ID: "image", WorkspaceID: "legacy", MimeType: "image/png", Data: []byte("png")}},
	}
	var encoded bytes.Buffer
	_, _ = encoded.Write(trashEnvelopeMagicV1)
	compressed := zlib.NewWriter(&encoded)
	if err := gob.NewEncoder(compressed).Encode(legacy); err != nil {
		t.Fatal(err)
	}
	if err := compressed.Close(); err != nil {
		t.Fatal(err)
	}
	var got domain.WorkspaceEnvelope
	if err := DecodeTrashEnvelope(encoded.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Project, legacy.Project) || !reflect.DeepEqual(got.Assets, legacy.Assets) {
		t.Fatalf("legacy gob trash payload changed: %+v", got)
	}
}

func TestTrashCodecRoundTripsV2ZlibJSON(t *testing.T) {
	envelope := domain.WorkspaceEnvelope{
		Project: domain.Workspace{
			WorkspaceSummary: domain.WorkspaceSummary{ID: "v2-ws", CategoryID: "legacy", Title: "V2 Trash", Version: 1},
			Canvas:           domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[]}`)},
		},
		Assets: []domain.StoredAsset{{ID: "img-v2", WorkspaceID: "v2-ws", MimeType: "image/png", Data: []byte("png-bytes")}},
	}
	encoded, err := EncodeTrashEnvelope(envelope)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(encoded, trashEnvelopeMagicV2) {
		t.Fatal("expected v2 magic header")
	}
	if json.Valid(encoded) {
		t.Fatal("v2 payload should be binary compressed, not raw JSON")
	}
	var got domain.WorkspaceEnvelope
	if err := DecodeTrashEnvelope(encoded, &got); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Project, envelope.Project) || !reflect.DeepEqual(got.Assets, envelope.Assets) {
		t.Fatalf("v2 trash payload mismatch: %+v", got)
	}
}

func TestTrashCodecReadsLegacyJSONEnvelope(t *testing.T) {
	legacy := domain.WorkspaceEnvelope{
		Project: domain.Workspace{
			WorkspaceSummary: domain.WorkspaceSummary{ID: "legacy-json", CategoryID: "legacy", Title: "Pre-binary trash", Version: 1},
			Canvas:           domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[]}`)},
		},
		Assets: []domain.StoredAsset{{ID: "img-1", WorkspaceID: "legacy-json", MimeType: "image/png", Data: []byte("png")}},
	}
	encoded, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	var got domain.WorkspaceEnvelope
	if err := DecodeTrashEnvelope(encoded, &got); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Project, legacy.Project) || !reflect.DeepEqual(got.Assets, legacy.Assets) {
		t.Fatalf("legacy json trash payload changed: %+v", got)
	}
}
