package workspace

import "context"

type workspaceTestStore struct {
	categoryExists          bool
	categoryExistsErr       error
	createInput             Workspace
	createErr               error
	moveID                  string
	moveCategoryID          string
	moveResult              Workspace
	moveErr                 error
	updateID                string
	updateInput             Update
	updateResult            Workspace
	updateErr               error
	record                  Workspace
	recordErr               error
	workspaceExists         bool
	workspaceExistsErr      error
	canvas                  CanvasState
	canvasErr               error
	getCanvasCalls          int
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

func validWorkspaceFixture() Workspace {
	return Workspace{
		Summary:  Summary{ID: "workspace-1", CategoryID: UncategorizedCategoryID, Title: "Distributed Systems", Version: 1},
		Document: validDocumentSnapshot(), Notes: []Note{}, Canvas: validCanvasSnapshot(), CanvasVersion: 1,
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
	s.canvas = CanvasState{Canvas: value.Canvas, Version: value.CanvasVersion}
	return nil
}
func (s *workspaceTestStore) List(context.Context) ([]Summary, error)            { return nil, nil }
func (s *workspaceTestStore) ListRecent(context.Context, int) ([]Summary, error) { return nil, nil }
func (s *workspaceTestStore) ListWorkspaces(context.Context, WorkspaceQuery) (WorkspacePage, error) {
	return WorkspacePage{}, nil
}
func (s *workspaceTestStore) Move(_ context.Context, id, categoryID string, _ ...string) (Workspace, error) {
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
func (s *workspaceTestStore) RenameMetadata(_ context.Context, id, title string, _ ...string) (Workspace, error) {
	s.updateID, s.updateInput.Title = id, title
	value := s.record
	value.Title = title
	value.Version++
	return value, s.updateErr
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
func (s *workspaceTestStore) GetCanvasState(context.Context, string) (CanvasState, error) {
	s.getCanvasCalls++
	return s.canvas, s.canvasErr
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
func (s *workspaceTestStore) GetWorkspaceSnapshot(ctx context.Context, id string) (Workspace, error) {
	value, err := s.GetWorkspaceRecord(ctx, id)
	if err != nil {
		return Workspace{}, err
	}
	return NewService(s).hydrateGranularState(ctx, value)
}
func (s *workspaceTestStore) GetWorkspaceRecord(context.Context, string) (Workspace, error) {
	if s.recordErr != nil {
		return Workspace{}, s.recordErr
	}
	if s.record.ID == "" {
		return Workspace{}, ErrNotFound
	}
	return s.record, nil
}
func (s *workspaceTestStore) WorkspaceExists(context.Context, string) (bool, error) {
	return s.workspaceExists, s.workspaceExistsErr
}
func (s *workspaceTestStore) Search(context.Context, string) ([]SearchResult, error) { return nil, nil }
