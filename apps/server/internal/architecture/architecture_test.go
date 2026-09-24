package architecture_test

import (
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

const modulePath = "github.com/howlil/notespace/apps/server/internal/"

var allowedDependencies = map[string]map[string]bool{
	"workspace": {},
	"planning":  {},
	"activity":  {},
	"asset":     {},
	"icon":      {},
	"library": {
		"workspace": true,
	},
	"httpapi": {
		"workspace": true,
		"planning":  true,
		"activity":  true,
		"library":   true,
		"asset":     true,
		"icon":      true,
	},
	"sqlite": {
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

		file, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}

		for _, spec := range file.Imports {
			importPath, err := strconv.Unquote(spec.Path.Value)
			if err != nil {
				return err
			}
			if !strings.HasPrefix(importPath, modulePath) {
				continue
			}
			target := strings.Split(strings.TrimPrefix(importPath, modulePath), "/")[0]
			if source == target {
				continue
			}
			if !allowedDependencies[source][target] {
				t.Errorf("%s imports internal dependency %q outside the allowed graph", filepath.ToSlash(rel), target)
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
