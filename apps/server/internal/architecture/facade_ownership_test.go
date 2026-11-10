package architecture_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func signatureHasStore(node ast.Node) bool {
	found := false
	ast.Inspect(node, func(n ast.Node) bool {
		pointer, ok := n.(*ast.StarExpr)
		if !ok {
			return true
		}
		name, ok := pointer.X.(*ast.Ident)
		found = found || (ok && name.Name == "Store")
		return true
	})
	return found
}

func signatureHasHandler(node ast.Node, httpAlias string) bool {
	found := false
	ast.Inspect(node, func(n ast.Node) bool {
		selector, ok := n.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		name, ok := selector.X.(*ast.Ident)
		found = found || (ok && name.Name == httpAlias && selector.Sel.Name == "Handler")
		return true
	})
	return found
}

func readOnlyConnection(call *ast.CallExpr) bool {
	if len(call.Args) != 2 {
		return false
	}
	tail := call.Args[1]
	if expression, ok := tail.(*ast.BinaryExpr); ok && expression.Op == token.ADD {
		tail = expression.Y
	}
	literal, ok := tail.(*ast.BasicLit)
	if !ok || literal.Kind != token.STRING {
		return false
	}
	value, err := strconv.Unquote(literal.Value)
	if err != nil {
		return false
	}
	return readOnlyMode(value)
}

func readOnlyMode(value string) bool {
	start := strings.IndexAny(value, "?&")
	if start < 0 {
		return false
	}
	query, err := url.ParseQuery(value[start+1:])
	return err == nil && len(query["mode"]) == 1 && query.Get("mode") == "ro"
}

func applicationType(value ast.Expr, aliases map[string]bool) bool {
	if pointer, ok := value.(*ast.StarExpr); ok {
		value = pointer.X
	}
	selector, ok := value.(*ast.SelectorExpr)
	if !ok {
		return false
	}
	qualifier, ok := selector.X.(*ast.Ident)
	return ok && aliases[qualifier.Name]
}

func applicationBindings(file *ast.File) map[string]bool {
	aliases := map[string]bool{}
	for _, spec := range file.Imports {
		path, _ := strconv.Unquote(spec.Path.Value)
		if !strings.HasPrefix(path, modulePath) || strings.HasPrefix(path, modulePath+"httpapi") {
			continue
		}
		name := filepath.Base(path)
		if spec.Name != nil {
			name = spec.Name.Name
		}
		aliases[name] = true
	}
	bindings := map[string]bool{}
	ast.Inspect(file, func(n ast.Node) bool {
		field, ok := n.(*ast.Field)
		if !ok {
			return true
		}
		if applicationType(field.Type, aliases) {
			for _, name := range field.Names {
				bindings[name.Name] = true
			}
		}
		return true
	})
	return bindings
}

func applicationCall(call *ast.CallExpr, bindings map[string]bool) bool {
	selector, ok := call.Fun.(*ast.SelectorExpr)
	if !ok {
		return false
	}
	switch receiver := selector.X.(type) {
	case *ast.Ident:
		return bindings[receiver.Name]
	case *ast.SelectorExpr:
		return bindings[receiver.Sel.Name]
	}
	return false
}

func rootImportViolation(owner, path string) string {
	switch owner {
	case "httpapi":
		switch path {
		case "database/sql", "encoding/json", "archive/zip":
			return "transport root must delegate capability decoding/storage"
		}
	case "sqlite":
		if path == "archive/zip" {
			return "archive codec belongs to backup, not Store lifetime"
		}
	}
	return ""
}

func rootImports(owner string, file *ast.File) (map[string]string, string) {
	imports := map[string]string{}
	for _, spec := range file.Imports {
		path, _ := strconv.Unquote(spec.Path.Value)
		name := filepath.Base(path)
		if spec.Name != nil {
			name = spec.Name.Name
		}
		imports[path] = name
		if violation := rootImportViolation(owner, path); violation != "" {
			return imports, violation
		}
	}
	return imports, ""
}

func rootFunctionRole(owner string, fn *ast.FuncDecl, imports map[string]string) bool {
	if owner == "httpapi" {
		return signatureHasHandler(fn.Type, imports["net/http"])
	}
	return signatureHasStore(fn.Type) || (fn.Recv != nil && signatureHasStore(fn.Recv))
}

func connectionCallRole(fn *ast.FuncDecl, call *ast.CallExpr, member string) (bool, string) {
	if member != "Open" && member != "OpenDB" {
		return false, ""
	}
	constructor := fn.Recv == nil && fn.Name.Name == "Open" && fn.Type.Results != nil && signatureHasStore(fn.Type.Results)
	readOnly := member == "Open" && readOnlyConnection(call)
	if !constructor && !readOnly {
		return false, "only Store.Open owns a writable pool; recovery handles must be explicitly read-only"
	}
	return readOnly, ""
}

func rootCallRole(owner string, fn *ast.FuncDecl, call *ast.CallExpr, imports map[string]string, bindings map[string]bool) (bool, string) {
	if owner == "httpapi" && applicationCall(call, bindings) {
		return false, "root composes handlers/middleware; application calls belong to capability handlers"
	}
	selector, ok := call.Fun.(*ast.SelectorExpr)
	if !ok {
		return false, ""
	}
	qualifier, ok := selector.X.(*ast.Ident)
	if !ok {
		return false, ""
	}
	if owner == "httpapi" && qualifier.Name == imports[modulePath+"httpapi/internal/transport"] && selector.Sel.Name == "Decode" {
		return false, "capability request decoding belongs to its handler package"
	}
	if owner == "sqlite" && qualifier.Name == imports["database/sql"] {
		return connectionCallRole(fn, call, selector.Sel.Name)
	}
	return false, ""
}

func rootFunctionCalls(owner string, fn *ast.FuncDecl, imports map[string]string, bindings map[string]bool) (bool, string) {
	role, violation := false, ""
	if fn.Body == nil {
		return role, violation
	}
	ast.Inspect(fn.Body, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		readOnly, issue := rootCallRole(owner, fn, call, imports, bindings)
		role = role || readOnly
		if issue != "" {
			violation = issue
		}
		return true
	})
	return role, violation
}

func globalConnectionViolation(declaration ast.Decl, sqlAlias string) string {
	violation := ""
	ast.Inspect(declaration, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		qualifier, ok := selector.X.(*ast.Ident)
		if ok && qualifier.Name == sqlAlias && (selector.Sel.Name == "Open" || selector.Sel.Name == "OpenDB") {
			violation = "connection lifetime cannot be owned by a package initializer"
		}
		return true
	})
	return violation
}

// Match facade/lifetime roles and dependency operations, never filenames.
func rootFacadeViolation(owner string, file *ast.File, bindings map[string]bool) string {
	imports, violation := rootImports(owner, file)
	if violation != "" {
		return violation
	}
	role := false
	for _, declaration := range file.Decls {
		fn, ok := declaration.(*ast.FuncDecl)
		if !ok {
			if issue := globalConnectionViolation(declaration, imports["database/sql"]); issue != "" {
				return issue
			}
			continue
		}
		role = rootFunctionRole(owner, fn, imports) || role
		readOnly, issue := rootFunctionCalls(owner, fn, imports, bindings)
		role = role || readOnly
		if issue != "" {
			return issue
		}
	}
	if !role {
		return "root file must own facade composition or connection lifetime; place implementation with its capability"
	}
	return ""
}

func TestRootFacadeRoleGuard(t *testing.T) {
	for _, tc := range []struct {
		owner, source string
		valid         bool
	}{
		{"sqlite", `package sqlite; func (s *Store) NewCapability() {}`, true},
		{"sqlite", `package sqlite; func NewAdapter(s *Store) {}`, true},
		{"sqlite", `package sqlite; import db "database/sql"; func Open() *Store { db.Open("sqlite",dsn); return nil }`, true},
		{"sqlite", `package sqlite; import db "database/sql"; func Recovery() { db.Open("sqlite",path+"?mode=ro") }`, true},
		{"sqlite", `package sqlite; func NewQuery() {}`, false},
		{"sqlite", `package sqlite; import db "database/sql"; var extra, _ = db.Open("sqlite",dsn); func (s *Store) Facade() {}`, false},
		{"sqlite", `package sqlite; import db "database/sql"; func Recovery() { db.Open("sqlite",path+"?mode=ro&mode=rwc") }`, false},
		{"sqlite", `package sqlite; import db "database/sql"; func Recovery() { db.Open("sqlite","mode=ro") }`, false},
		{"sqlite", `package sqlite; import db "database/sql"; func (s *Store) Open() *Store { db.Open("sqlite",dsn); return nil }`, false},
		{"sqlite", `package sqlite; import db "database/sql"; func (s *Store) AnotherPool() { db.Open("sqlite",dsn) }`, false},
		{"sqlite", `package sqlite; import db "database/sql"; func (s *Store) Connector() { db.OpenDB(connector) }`, false},
		{"sqlite", `package sqlite; import "archive/zip"; func (s *Store) Encode() { zip.NewWriter(out) }`, false},
		{"httpapi", `package httpapi; import web "net/http"; func NewCapabilityMiddleware(next web.Handler) web.Handler { return next }`, true},
		{"httpapi", `package httpapi; import "net/http"; func List(w http.ResponseWriter,r *http.Request) {}`, false},
		{"httpapi", `package httpapi; import ("net/http"; "github.com/howlil/notespace/apps/server/internal/workspace"); func New(s *workspace.Service) http.Handler { s.List(ctx); return nil }`, false},
		{"httpapi", `package httpapi; import ("net/http"; "encoding/json"); func New() http.Handler { json.NewDecoder(r.Body); return nil }`, false},
		{"httpapi", `package httpapi; import ("net/http"; wire "github.com/howlil/notespace/apps/server/internal/httpapi/internal/transport"); func New() http.Handler { wire.Decode(w,r,&body); return nil }`, false},
	} {
		file, err := parser.ParseFile(token.NewFileSet(), "any-legitimate-name.go", tc.source, 0)
		if err != nil {
			t.Fatal(err)
		}
		if violation := rootFacadeViolation(tc.owner, file, applicationBindings(file)); (violation == "") != tc.valid {
			t.Errorf("%s: valid=%v, violation=%q; %s", tc.owner, tc.valid, violation, tc.source)
		}
	}
}

func TestRootApplicationCallsCannotHideInAnotherFile(t *testing.T) {
	deps, err := parser.ParseFile(token.NewFileSet(), "dependencies.go", `package httpapi; import "github.com/howlil/notespace/apps/server/internal/workspace"; type Dependencies struct { Workspace *workspace.Service }`, 0)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := parser.ParseFile(token.NewFileSet(), "new-capability.go", `package httpapi; import "net/http"; func WrongRoot(deps Dependencies) http.Handler { deps.Workspace.List(ctx); return nil }`, 0)
	if err != nil {
		t.Fatal(err)
	}
	if violation := rootFacadeViolation("httpapi", handler, applicationBindings(deps)); !strings.Contains(violation, "application calls") {
		t.Fatalf("cross-file service invocation accepted: %q", violation)
	}
}

func rootFiles(root string) (map[string]*ast.File, map[string]bool, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, nil, err
	}
	files := map[string]*ast.File{}
	bindings := map[string]bool{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") || strings.HasSuffix(entry.Name(), "_test.go") {
			continue
		}
		file, err := parser.ParseFile(token.NewFileSet(), filepath.Join(root, entry.Name()), nil, 0)
		if err != nil {
			return nil, nil, err
		}
		files[entry.Name()] = file
		for name := range applicationBindings(file) {
			bindings[name] = true
		}
	}
	return files, bindings, nil
}

func TestAdapterRootsKeepOnlyFacadesAndLifetimeOwners(t *testing.T) {
	for _, owner := range []string{"httpapi", "sqlite"} {
		files, bindings, err := rootFiles(filepath.Join("..", owner))
		if err != nil {
			t.Fatal(err)
		}
		for name, file := range files {
			if violation := rootFacadeViolation(owner, file, bindings); violation != "" {
				t.Errorf("%s/%s: %s", owner, name, violation)
			}
		}
	}
}
