package domain

import (
	"encoding/json"
	"math"
)

type Note struct {
	ID            string          `json:"id"`
	SchemaVersion int             `json:"schemaVersion"`
	Revision      int             `json:"revision"`
	Document      json.RawMessage `json:"document"`
	CreatedAt     string          `json:"createdAt"`
	UpdatedAt     string          `json:"updatedAt"`
	DeletedAt     string          `json:"deletedAt,omitempty"`
}

type NoteInstance struct {
	ID          string  `json:"id"`
	NoteID      string  `json:"noteId"`
	WorkspaceID string  `json:"workspaceId"`
	ElementID   string  `json:"elementId"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	Width       float64 `json:"width"`
	Height      float64 `json:"height"`
	Compact     bool    `json:"compact"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

type CreateNoteInstanceRequest struct {
	ClientRequestID       string          `json:"clientRequestId"`
	ClientNoteID          string          `json:"clientNoteId"`
	ClientInstanceID      string          `json:"clientInstanceId"`
	ExistingNoteID        string          `json:"existingNoteId,omitempty"`
	ElementID             string          `json:"elementId"`
	ExpectedCanvasVersion int             `json:"expectedCanvasVersion"`
	Document              json.RawMessage `json:"document,omitempty"`
	Canvas                CanvasSnapshot  `json:"canvas"`
	X                     float64         `json:"x"`
	Y                     float64         `json:"y"`
	Width                 float64         `json:"width"`
	Height                float64         `json:"height"`
	Compact               bool            `json:"compact"`
}

type CreateNoteInstanceResult struct {
	Note     Note         `json:"note"`
	Instance NoteInstance `json:"instance"`
	Canvas   CanvasState  `json:"canvas"`
}

type UpdateNoteRequest struct {
	Document         json.RawMessage `json:"document"`
	ExpectedRevision int             `json:"expectedRevision"`
}

type DeleteNoteInstanceRequest struct {
	ExpectedCanvasVersion int            `json:"expectedCanvasVersion"`
	Canvas                CanvasSnapshot `json:"canvas"`
}

type NoteListQuery struct {
	Query          string
	Placed         string
	Unplaced       bool
	WorkspaceID    string
	TagIDs         []string
	Scope          string
	SelectedNoteID string
	Sort           string
	Offset         int
	Limit          int
}

type NoteSummary struct {
	ID             string   `json:"id"`
	Label          string   `json:"label"`
	Excerpt        string   `json:"excerpt"`
	PlacementCount int      `json:"placementCount"`
	WorkspaceIDs   []string `json:"workspaceIds"`
	Tags           []Tag    `json:"tags,omitempty"`
	RelatedReason  string   `json:"relatedReason,omitempty"`
	IsEmpty        bool     `json:"isEmpty"`
	CreatedAt      string   `json:"createdAt"`
	UpdatedAt      string   `json:"updatedAt"`
}

type NoteListResult struct {
	Notes   []NoteSummary `json:"notes"`
	Total   int           `json:"total"`
	HasMore bool          `json:"hasMore"`
}

type NotePlacementInfo struct {
	InstanceID     string `json:"instanceId"`
	WorkspaceID    string `json:"workspaceId"`
	WorkspaceTitle string `json:"workspaceTitle"`
	ElementID      string `json:"elementId"`
	Compact        bool   `json:"compact"`
}

type NoteBacklinkInfo struct {
	NoteID         string `json:"noteId"`
	Label          string `json:"label"`
	WorkspaceID    string `json:"workspaceId"`
	WorkspaceTitle string `json:"workspaceTitle"`
	Kind           string `json:"kind"`
	Excerpt        string `json:"excerpt,omitempty"`
}

type NoteOutgoingRefInfo struct {
	NoteID     string `json:"noteId"`
	Label      string `json:"label"`
	Excerpt    string `json:"excerpt,omitempty"`
	Kind       string `json:"kind"`
	Unresolved bool   `json:"unresolved"`
}

type NoteInfo struct {
	NoteID     string                `json:"noteId"`
	Placements []NotePlacementInfo   `json:"placements"`
	Backlinks  []NoteBacklinkInfo    `json:"backlinks"`
	Outgoing   []NoteOutgoingRefInfo `json:"outgoing"`
	Tags       []Tag                 `json:"tags"`
}

type TrashedNote struct {
	ID             string `json:"id"`
	Label          string `json:"label"`
	Excerpt        string `json:"excerpt"`
	DeletedAt      string `json:"deletedAt"`
	PlacementCount int    `json:"placementCount"`
}

func ValidateGeometry(x, y, width, height float64) bool {
	return !math.IsNaN(x) && !math.IsNaN(y) && !math.IsNaN(width) && !math.IsNaN(height) &&
		!math.IsInf(x, 0) && !math.IsInf(y, 0) && !math.IsInf(width, 0) && !math.IsInf(height, 0) &&
		width >= 160 && width <= 10000 && height >= 48 && height <= 10000
}

func ValidateNote(value Note) error {
	if !ValidID(value.ID, MaxNoteIDLength) || value.SchemaVersion != NoteSchemaVersion || value.Revision < 1 || value.CreatedAt == "" || value.UpdatedAt == "" {
		return ErrNoteInvalid
	}
	if _, err := ParseDocument(value.Document); err != nil {
		return ErrNoteInvalid
	}
	return nil
}

func ValidateNoteInstance(value NoteInstance, workspaceID string) error {
	if !ValidID(value.ID, MaxInstanceIDLength) || !ValidID(value.NoteID, MaxNoteIDLength) ||
		!ValidID(value.WorkspaceID, MaxNoteIDLength) || value.WorkspaceID != workspaceID ||
		!ValidID(value.ElementID, MaxInstanceIDLength) || !ValidateGeometry(value.X, value.Y, value.Width, value.Height) ||
		value.CreatedAt == "" || value.UpdatedAt == "" {
		return ErrNoteInvalid
	}
	return nil
}
