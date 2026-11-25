package archive

import (
	"bytes"
	"compress/zlib"
	"encoding/gob"
	"encoding/json"
	"fmt"

	"github.com/howlil/notespace/apps/server/internal/domain"
)

var (
	trashEnvelopeMagicV1 = []byte{'N', 'S', 'T', 'R', 1}
	trashEnvelopeMagicV2 = []byte{'N', 'S', 'T', 'R', 2}
)

func EncodeTrashEnvelope(value domain.WorkspaceEnvelope) ([]byte, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("encode trash envelope: %w", err)
	}
	var output bytes.Buffer
	_, _ = output.Write(trashEnvelopeMagicV2)
	compressed := zlib.NewWriter(&output)
	if _, err := compressed.Write(raw); err != nil {
		_ = compressed.Close()
		return nil, fmt.Errorf("encode trash envelope: %w", err)
	}
	if err := compressed.Close(); err != nil {
		return nil, fmt.Errorf("encode trash envelope: %w", err)
	}
	return output.Bytes(), nil
}

func DecodeTrashEnvelope(data []byte, value *domain.WorkspaceEnvelope) error {
	switch {
	case bytes.HasPrefix(data, trashEnvelopeMagicV2):
		reader, err := zlib.NewReader(bytes.NewReader(data[len(trashEnvelopeMagicV2):]))
		if err != nil {
			return fmt.Errorf("decode trash envelope: %w", err)
		}
		defer func() { _ = reader.Close() }()
		if err := json.NewDecoder(reader).Decode(value); err != nil {
			return fmt.Errorf("decode trash envelope: %w", err)
		}
		return nil
	case bytes.HasPrefix(data, trashEnvelopeMagicV1):
		reader, err := zlib.NewReader(bytes.NewReader(data[len(trashEnvelopeMagicV1):]))
		if err != nil {
			return fmt.Errorf("decode legacy gob trash envelope: %w", err)
		}
		defer func() { _ = reader.Close() }()
		if err := gob.NewDecoder(reader).Decode(value); err != nil {
			return fmt.Errorf("decode legacy gob trash envelope: %w", err)
		}
		return nil
	default:
		if err := json.Unmarshal(data, value); err != nil {
			return fmt.Errorf("decode legacy json trash envelope: %w", err)
		}
		return nil
	}
}
