package domain

type SearchResult struct {
	Type           string  `json:"type"`
	ParentID       *string `json:"parentId,omitempty"`
	ParentTitle    string  `json:"parentTitle,omitempty"`
	WorkspaceID    string  `json:"workspaceId"`
	WorkspaceTitle string  `json:"workspaceTitle"`
	NoteID         string  `json:"noteId,omitempty"`
	InstanceID     string  `json:"instanceId,omitempty"`
	Excerpt        string  `json:"excerpt"`
}
