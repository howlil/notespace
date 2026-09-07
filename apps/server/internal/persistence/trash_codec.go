package persistence

import (
	"bytes"
	"compress/zlib"
	"encoding/gob"
	"encoding/json"
	"fmt"
)

var trashEnvelopeMagic = []byte{'N', 'S', 'T', 'R', 1}

func encodeTrashEnvelope(value workspaceEnvelope) ([]byte, error) {
	var output bytes.Buffer
	_, _ = output.Write(trashEnvelopeMagic)
	compressed := zlib.NewWriter(&output)
	if err := gob.NewEncoder(compressed).Encode(value); err != nil {
		_ = compressed.Close()
		return nil, fmt.Errorf("encode trash envelope: %w", err)
	}
	if err := compressed.Close(); err != nil {
		return nil, fmt.Errorf("encode trash envelope: %w", err)
	}
	return output.Bytes(), nil
}

func decodeTrashEnvelope(data []byte, value *workspaceEnvelope) error {
	if !bytes.HasPrefix(data, trashEnvelopeMagic) {
		// Compatibility with trash records written before the binary codec.
		if err := json.Unmarshal(data, value); err != nil {
			return fmt.Errorf("decode legacy trash envelope: %w", err)
		}
		return nil
	}
	reader, err := zlib.NewReader(bytes.NewReader(data[len(trashEnvelopeMagic):]))
	if err != nil {
		return fmt.Errorf("decode trash envelope: %w", err)
	}
	defer reader.Close()
	if err := gob.NewDecoder(reader).Decode(value); err != nil {
		return fmt.Errorf("decode trash envelope: %w", err)
	}
	return nil
}
