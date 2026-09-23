package architecture_test

import (
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

const modulePath = "github.com/howlil/notespace/apps/server/internal/"

var applicationPackages = map[string]bool{
	"project":   true, // migration alias: target is workspace
	"workspace": true,
	"planning":  true,
	"study":     true, // migration alias: target is activity
	"activity":  true,
	"library":   true,
	"asset":     true,
}

var infrastructurePackages = map[string]bool{
	"httpapi":     true,
	"persistence": true, // migration alias: target is sqlite
	"sqlite":      true,
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
			if forbiddenDependency(source, target) {
				t.Errorf("%s imports forbidden internal dependency %q", filepath.ToSlash(rel), target)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func forbiddenDependency(source, target string) bool {
	if applicationPackages[source] && infrastructurePackages[target] {
		return true
	}
	if source == "httpapi" && (target == "persistence" || target == "sqlite") {
		return true
	}
	return false
}
