package asset

import (
	"context"
	"errors"
)

var (
	ErrNotFound = errors.New("asset not found")
	ErrInvalid  = errors.New("invalid asset")
)

type Stored struct {
	ID          string
	WorkspaceID string
	MimeType    string
	Data        []byte
	CreatedAt   string
}

type Store interface {
	PutAsset(context.Context, Stored) (Stored, error)
	GetAsset(context.Context, string, string) (Stored, error)
	ListAssets(context.Context, string) ([]Stored, error)
	DeleteAsset(context.Context, string, string) error
}
