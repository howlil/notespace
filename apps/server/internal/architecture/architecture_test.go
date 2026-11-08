package architecture_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func privateDependencyViolation(source, target string) bool {
	if strings.HasPrefix(source, "httpapi/") && strings.HasPrefix(target, "httpapi") {
		return target != "httpapi/internal/transport"
	}
	if !strings.HasPrefix(source, "sqlite/internal/") {
		return false
	}
	if target == "sqlite" {
		return true
	}
	if !strings.HasPrefix(target, "sqlite/internal/") {
		return false
	}
	if target == "sqlite/internal/dbtx" {
		return false
	}
	// Backup codecs and legacy recovery borrow explicit capability query entries.
	return source != "sqlite/internal/backup"
}

func TestPrivateDependencyGuard(t *testing.T) {
	for _, pair := range [][2]string{
		{"httpapi/workspace", "httpapi"},
		{"httpapi/workspace", "httpapi/library"},
		{"sqlite/internal/workspace", "sqlite"},
		{"sqlite/internal/workspace", "sqlite/internal/planning"},
	} {
		if !privateDependencyViolation(pair[0], pair[1]) {
			t.Errorf("guard accepted upward/cross-capability import %v", pair)
		}
	}
	for _, pair := range [][2]string{
		{"httpapi/workspace", "httpapi/internal/transport"},
		{"sqlite/internal/workspace", "sqlite/internal/dbtx"},
		{"sqlite/internal/backup", "sqlite/internal/workspace"},
	} {
		if privateDependencyViolation(pair[0], pair[1]) {
			t.Errorf("guard rejected borrowed dependency %v", pair)
		}
	}
}

func TestAdapterRootsKeepOnlyFacadesAndLifetimeOwners(t *testing.T) {
	roots := map[string]map[string]bool{
		"httpapi": {"router.go": true, "middleware.go": true, "observability.go": true},
		"sqlite": {
			"sqlite.go": true, "indexed_store.go": true,
			"workspace.go": true, "workspace_pagination.go": true,
			"planning.go": true, "activity.go": true, "capture.go": true,
			"assets.go": true, "library.go": true, "search.go": true,
			"manual_snapshot.go": true, "preupgrade.go": true,
		},
	}
	for owner, allowed := range roots {
		entries, err := os.ReadDir(filepath.Join("..", owner))
		if err != nil {
			t.Fatal(err)
		}
		for _, entry := range entries {
			name := entry.Name()
			if !entry.IsDir() && strings.HasSuffix(name, ".go") && !strings.HasSuffix(name, "_test.go") && !allowed[name] {
				t.Errorf("%s/%s: place implementation in its capability package; new root owners require an explicit boundary update", owner, name)
			}
		}
	}
}

const modulePath = "github.com/howlil/notespace/apps/server/internal/"

var allowedDependencies = map[string]map[string]bool{
	"workspace": {},
	"capture": {
		"workspace": true,
	},
	"planning": {},
	"activity": {},
	"asset":    {},
	"icon":     {},
	"library": {
		"workspace": true,
	},
	"httpapi": {
		"capture":   true,
		"workspace": true,
		"planning":  true,
		"activity":  true,
		"library":   true,
		"asset":     true,
		"icon":      true,
	},
	"sqlite": {
		"capture":   true,
		"workspace": true,
		"planning":  true,
		"activity":  true,
		"library":   true,
		"asset":     true,
	},
}

func TestServerDependencyBoundaries(t *testing.T) {
	internalRoot := filepath.Clean("..")

	err := filepath.WalkDir(internalRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}

		rel, err := filepath.Rel(internalRoot, path)
		if err != nil {
			return err
		}
		parts := strings.Split(filepath.ToSlash(rel), "/")
		if len(parts) < 2 {
			return nil
		}
		source := parts[0]

		file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
		if err != nil {
			return err
		}

		sourcePackage := filepath.ToSlash(filepath.Dir(rel))
		for _, spec := range file.Imports {
			importPath, err := strconv.Unquote(spec.Path.Value)
			if err != nil {
				return err
			}
			if !strings.HasPrefix(importPath, modulePath) {
				continue
			}
			targetPackage := strings.TrimPrefix(importPath, modulePath)
			if privateDependencyViolation(sourcePackage, targetPackage) {
				t.Errorf("%s imports forbidden private dependency %q", filepath.ToSlash(rel), targetPackage)
			}
			target := strings.Split(targetPackage, "/")[0]
			if source == target {
				continue
			}
			if !allowedDependencies[source][target] {
				t.Errorf("%s imports internal dependency %q outside the allowed graph", filepath.ToSlash(rel), target)
			}
		}
		if strings.HasPrefix(sourcePackage, "sqlite/internal/") {
			ast.Inspect(file, func(node ast.Node) bool {
				call, ok := node.(*ast.CallExpr)
				if !ok {
					return true
				}
				selector, ok := call.Fun.(*ast.SelectorExpr)
				if !ok {
					return true
				}
				switch selector.Sel.Name {
				case "Begin", "BeginTx", "Commit", "Rollback":
					t.Errorf("%s owns transaction lifetime via %s; keep it in Store", filepath.ToSlash(rel), selector.Sel.Name)
				}
				return true
			})
			for _, spec := range file.Imports {
				if spec.Path.Value != `"database/sql"` {
					continue
				}
				name := "sql"
				if spec.Name != nil {
					name = spec.Name.Name
				}
				ast.Inspect(file, func(node ast.Node) bool {
					selector, ok := node.(*ast.SelectorExpr)
					if !ok {
						return true
					}
					if qualifier, ok := selector.X.(*ast.Ident); ok && qualifier.Name == name {
						switch selector.Sel.Name {
						case "Open", "OpenDB", "DB":
							t.Errorf("%s owns a connection via %s.%s; borrow DBTX/Tx", filepath.ToSlash(rel), name, selector.Sel.Name)
						}
					}
					return true
				})
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestLegacyServerPackagesRemoved(t *testing.T) {
	internalRoot := filepath.Clean("..")
	for _, name := range []string{"project", "study", "persistence"} {
		path := filepath.Join(internalRoot, name)
		_, err := os.Stat(path)
		if err == nil {
			t.Errorf("legacy server package %q still exists", name)
			continue
		}
		if !os.IsNotExist(err) {
			t.Fatal(err)
		}
	}
}
