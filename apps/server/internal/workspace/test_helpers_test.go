package workspace

import "context"

type workspaceTestStore struct {
	categoryExists     bool
	categoryExistsErr  error
	createInput        Workspace
	createErr          error
	moveID             string
	moveCategoryID     string
	moveResult         Workspace
	moveErr            error
	updateID           string
	updateInput        Update
	updateResult       Workspace
	updateErr          error
	record             Workspace
	recordErr          error
	workspaceExists    bool
	workspaceExistsErr error
	notes              []Note
	notesErr           error
	listNotesCalls     int
	canvas             CanvasState
	canvasErr          error
	getCanvasCalls     int
	createNoteWorkspaceID string
	createNoteInput       NoteCreate
	createNoteResult      Note
	createNoteErr         error
	updateNoteWorkspaceID string
	updateNoteID          string
	updateNoteInput       NoteUpdate
	updateNoteResult      Note
	updateNoteErr         error
	deleteNoteWorkspaceID string
	deleteNoteID          string
	deleteNoteVersion     int
	deleteNoteErr         error
	updateCanvasWorkspaceID string
	updateCanvasInput       CanvasUpdate
	updateCanvasResult      CanvasState
	updateCanvasErr         error
}

func validDocumentSnapshot() Snapshot {
	return Snapshot{Format: "tiptap", Version: 1, Data: []byte("{\"type\":\"doc\",\"content\":[]}")}
}

func validCanvasSnapshot() Snapshot {
	return Snapshot{Format: "excalidraw", Version: 1, Data: []byte("{\"elements\":[],\"appState\":{},\"files\":{}}")}
}

func validNoteFixture(id string) Note {
	return Note{ID: id, Title: "Note " + id, Document: validDocumentSnapshot(), Version: 1}
}

func validWorkspaceFixture() Workspace {
	note := validNoteFixture("note-1")
	return Workspace{
		Summary:  Summary{ID: "workspace-1", CategoryID: UncategorizedCategoryID, Title: "Distributed Systems", Version: 1},
		Document: note.Document, Notes: []Note{note}, Canvas: validCanvasSnapshot(), CanvasVersion: 1,
		References: []Reference{}, SplitRatio: 0.45,
	}
}

func (s *workspaceTestStore) CreateCategory(context.Context, CategorySummary) error { return nil }
func (s *workspaceTestStore) UpdateCategory(context.Context, string, string) (CategorySummary, error) {
	return CategorySummary{}, nil
}
func (s *workspaceTestStore) ListCategories(context.Context) ([]CategorySummary, error) {
	return nil, nil
}
func (s *workspaceTestStore) CategoryExists(context.Context, string) (bool, error) {
	return s.categoryExists, s.categoryExistsErr
}
func (s *workspaceTestStore) Create(_ context.Context, value Workspace) error {
	s.createInput = value
	if s.createErr != nil {
		return s.createErr
	}
	s.record = value
	s.notes = append([]Note(nil), value.Notes...)
	s.canvas = CanvasState{Canvas: value.Canvas, Version: value.CanvasVersion}
	return nil
}
func (s *workspaceTestStore) List(context.Context) ([]Summary, error)            { return nil, nil }
func (s *workspaceTestStore) ListRecent(context.Context, int) ([]Summary, error) { return nil, nil }
func (s *workspaceTestStore) ListWorkspaces(context.Context, WorkspaceQuery) (WorkspacePage, error) {
	return WorkspacePage{}, nil
}
func (s *workspaceTestStore) Move(_ context.Context, id, categoryID string) (Workspace, error) {
	s.moveID, s.moveCategoryID = id, categoryID
	if s.moveErr != nil {
		return Workspace{}, s.moveErr
	}
	if s.moveResult.ID != "" {
		return s.moveResult, nil
	}
	value := s.record
	value.CategoryID = categoryID
	return value, nil
}
func (s *workspaceTestStore) Update(_ context.Context, id string, input Update) (Workspace, error) {
	s.updateID, s.updateInput = id, input
	if s.updateErr != nil {
		return Workspace{}, s.updateErr
	}
	if s.updateResult.ID != "" {
		return s.updateResult, nil
	}
	value := s.record
	value.Title, value.Document, value.Notes, value.Canvas = input.Title, input.Document, append([]Note(nil), input.Notes...), input.Canvas
	value.References, value.SplitRatio, value.Version = append([]Reference(nil), input.References...), input.SplitRatio, input.Version+1
	return value, nil
}
func (s *workspaceTestStore) ListNotes(context.Context, string) ([]Note, error) {
	s.listNotesCalls++
	return s.notes, s.notesErr
}
func (s *workspaceTestStore) GetCanvasState(context.Context, string) (CanvasState, error) {
	s.getCanvasCalls++
	return s.canvas, s.canvasErr
}
func (s *workspaceTestStore) CreateNote(_ context.Context, workspaceID string, input NoteCreate) (Note, error) {
	s.createNoteWorkspaceID, s.createNoteInput = workspaceID, input
	if s.createNoteErr != nil {
		return Note{}, s.createNoteErr
	}
	if s.createNoteResult.ID != "" {
		return s.createNoteResult, nil
	}
	return Note{ID: input.ID, Title: input.Title, Document: input.Document, Version: 1}, nil
}
func (s *workspaceTestStore) UpdateNote(_ context.Context, workspaceID, noteID string, input NoteUpdate) (Note, error) {
	s.updateNoteWorkspaceID, s.updateNoteID, s.updateNoteInput = workspaceID, noteID, input
	if s.updateNoteErr != nil {
		return Note{}, s.updateNoteErr
	}
	if s.updateNoteResult.ID != "" {
		return s.updateNoteResult, nil
	}
	return Note{ID: noteID, Title: input.Title, Document: input.Document, Version: input.Version + 1}, nil
}
func (s *workspaceTestStore) DeleteNote(_ context.Context, workspaceID, noteID string, version int) error {
	s.deleteNoteWorkspaceID, s.deleteNoteID, s.deleteNoteVersion = workspaceID, noteID, version
	return s.deleteNoteErr
}
func (s *workspaceTestStore) UpdateCanvas(_ context.Context, workspaceID string, input CanvasUpdate) (CanvasState, error) {
	s.updateCanvasWorkspaceID, s.updateCanvasInput = workspaceID, input
	if s.updateCanvasErr != nil {
		return CanvasState{}, s.updateCanvasErr
	}
	if s.updateCanvasResult.Version != 0 {
		return s.updateCanvasResult, nil
	}
	return CanvasState{Canvas: input.Canvas, Version: input.Version + 1}, nil
}
func (s *workspaceTestStore) GetWorkspaceRecord(context.Context, string) (Workspace, error) {
	return s.record, s.recordErr
}
func (s *workspaceTestStore) WorkspaceExists(context.Context, string) (bool, error) {
	return s.workspaceExists, s.workspaceExistsErr
}
func (s *workspaceTestStore) Search(context.Context, string) ([]SearchResult, error) { return nil, nil }
