package domain

type SearchResult struct {
	Type           string `json:"type"`
	CategoryID     string `json:"categoryId"`
	CategoryTitle  string `json:"categoryTitle"`
	WorkspaceID    string `json:"workspaceId"`
	WorkspaceTitle string `json:"workspaceTitle"`
	NoteID         string `json:"noteId,omitempty"`
	InstanceID     string `json:"instanceId,omitempty"`
	Excerpt        string `json:"excerpt"`
}
