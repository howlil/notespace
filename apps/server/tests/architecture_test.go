package tests

import (
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

const modulePrefix = "github.com/howlil/notespace/apps/server/internal/"

// allowedTopLevelDependencies enforces the strict 4-tier one-way DAG inside
// apps/server/internal: app -> httpapi -> {domain, infra/store}; infra -> domain.
var allowedTopLevelDependencies = map[string]map[string]bool{
	"domain": {},
	"infra": {
		"domain": true,
	},
	"httpapi": {
		"domain": true,
		"infra":  true,
	},
	"app": {
		"domain":  true,
		"httpapi": true,
		"infra":   true,
	},
}

func subpackageViolation(sourcePackage, targetImport string) string {
	isInternal := strings.HasPrefix(targetImport, modulePrefix)
	targetInternal := strings.TrimPrefix(targetImport, modulePrefix)

	// Tier 3: pure domain must never pull in SQL or HTTP.
	if sourcePackage == "domain" || strings.HasPrefix(sourcePackage, "domain/") {
		if targetImport == "database/sql" || targetImport == "net/http" {
			return "pure domain package must not import " + targetImport
		}
	}

	// Tier 4: infra subpackages have strict internal isolation.
	switch {
	case sourcePackage == "infra/sqlite" || strings.HasPrefix(sourcePackage, "infra/sqlite/"):
		if targetImport == "net/http" {
			return "infra/sqlite must not import net/http"
		}
		if isInternal && (targetInternal == "domain" || strings.HasPrefix(targetInternal, "domain/")) {
			return "infra/sqlite must stay domain-free; inject hooks from infra/store instead"
		}
		if isInternal && (targetInternal == "infra/store" || strings.HasPrefix(targetInternal, "infra/store/") || targetInternal == "infra/eraser") {
			return "infra/sqlite must not import " + targetInternal
		}
	case sourcePackage == "infra/store/paging":
		if targetImport == "database/sql" {
			return "infra/store/paging must remain SQL-free"
		}
		if isInternal && (targetInternal == "infra/store" || targetInternal == "infra/sqlite" || strings.HasPrefix(targetInternal, "infra/sqlite/") || targetInternal == "infra/eraser") {
			return "infra/store/paging must not import " + targetInternal
		}
	case sourcePackage == "infra/store" || strings.HasPrefix(sourcePackage, "infra/store/"):
		if targetImport == "net/http" {
			return "infra/store must not import net/http"
		}
		if isInternal && targetInternal == "infra/eraser" {
			return "infra/store must not import infra/eraser"
		}
	case sourcePackage == "infra/eraser":
		if targetImport == "database/sql" {
			return "infra/eraser must not import database/sql"
		}
		if isInternal && (targetInternal == "infra/sqlite" || strings.HasPrefix(targetInternal, "infra/sqlite/") || targetInternal == "infra/store" || strings.HasPrefix(targetInternal, "infra/store/")) {
			return "infra/eraser must not import " + targetInternal
		}
	}

	// Tier 2: httpapi must never touch SQL, sqlite, or eraser directly.
	if sourcePackage == "httpapi" || strings.HasPrefix(sourcePackage, "httpapi/") {
		if targetImport == "database/sql" {
			return "httpapi must not import database/sql"
		}
		if isInternal && (targetInternal == "infra/sqlite" || strings.HasPrefix(targetInternal, "infra/sqlite/") || targetInternal == "infra/eraser") {
			return "httpapi must not import " + targetInternal
		}
	}

	switch sourcePackage {
	case "httpapi":
		if targetImport == "encoding/json" {
			return "httpapi root router must keep JSON codecs in httpapi/transport"
		}
	case "httpapi/transport":
		if isInternal && targetInternal != "domain" && targetInternal != "domain/apperr" {
			return "httpapi/transport may only import domain and domain/apperr, not " + targetInternal
		}
	case "httpapi/middleware":
		if isInternal && targetInternal != "httpapi/transport" {
			return "httpapi/middleware may only import httpapi/transport, not " + targetInternal
		}
	case "httpapi/handler":
		if isInternal && (targetInternal == "httpapi" || targetInternal == "httpapi/middleware") {
			return "httpapi/handler must not import " + targetInternal
		}
	}

	return ""
}

func TestSubpackageBoundaryGuard(t *testing.T) {
	forbidden := [][2]string{
		{"domain", "database/sql"},
		{"domain/archive", "database/sql"},
		{"domain", "net/http"},
		{"infra/sqlite", "net/http"},
		{"infra/sqlite", modulePrefix + "domain"},
		{"infra/sqlite", modulePrefix + "infra/store"},
		{"infra/store", "net/http"},
		{"infra/store", modulePrefix + "infra/eraser"},
		{"infra/store/paging", "database/sql"},
		{"infra/store/paging", modulePrefix + "infra/store"},
		{"infra/store/paging", modulePrefix + "infra/sqlite"},
		{"infra/eraser", "database/sql"},
		{"infra/eraser", modulePrefix + "infra/store"},
		{"httpapi/handler", "database/sql"},
		{"httpapi/handler", modulePrefix + "infra/sqlite"},
		{"httpapi/handler", modulePrefix + "infra/eraser"},
		{"httpapi/handler", modulePrefix + "httpapi"},
		{"httpapi/handler", modulePrefix + "httpapi/middleware"},
		{"httpapi/middleware", modulePrefix + "infra/store"},
		{"httpapi/transport", modulePrefix + "infra/store"},
		{"httpapi", "encoding/json"},
	}
	for _, pair := range forbidden {
		if got := subpackageViolation(pair[0], pair[1]); got == "" {
			t.Errorf("guard accepted forbidden dependency %v", pair)
		}
	}

	allowed := [][2]string{
		{"domain/archive", modulePrefix + "domain"},
		{"domain/archive", modulePrefix + "domain/apperr"},
		{"infra/store/paging", modulePrefix + "domain"},
		{"infra/store", modulePrefix + "infra/sqlite"},
		{"infra/store", modulePrefix + "domain"},
		{"infra/eraser", modulePrefix + "domain"},
		{"httpapi/middleware", modulePrefix + "httpapi/transport"},
		{"httpapi/handler", modulePrefix + "httpapi/transport"},
		{"httpapi/handler", modulePrefix + "infra/store"},
		{"httpapi/transport", modulePrefix + "domain"},
		{"httpapi", modulePrefix + "httpapi/handler"},
	}
	for _, pair := range allowed {
		if got := subpackageViolation(pair[0], pair[1]); got != "" {
			t.Errorf("guard rejected valid dependency %v: %s", pair, got)
		}
	}
}

func TestInternalHasExactFourTiers(t *testing.T) {
	internalRoot := filepath.Clean(filepath.Join("..", "internal"))
	entries, err := os.ReadDir(internalRoot)
	if err != nil {
		t.Fatal(err)
	}
	var dirs []string
	for _, entry := range entries {
		if entry.IsDir() {
			dirs = append(dirs, entry.Name())
		} else {
			t.Errorf("unexpected top-level file in internal/: %s", entry.Name())
		}
	}
	sort.Strings(dirs)
	want := []string{"app", "domain", "httpapi", "infra"}
	if strings.Join(dirs, ",") != strings.Join(want, ",") {
		t.Fatalf("internal/ top-level dirs = %v, want exact 4 tiers %v", dirs, want)
	}
}

func TestServerDependencyBoundaries(t *testing.T) {
	internalRoot := filepath.Clean(filepath.Join("..", "internal"))

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
		slashRel := filepath.ToSlash(rel)
		parts := strings.Split(slashRel, "/")
		if len(parts) < 2 {
			return nil
		}
		sourceTop := parts[0]
		sourcePackage := filepath.ToSlash(filepath.Dir(rel))

		if _, known := allowedTopLevelDependencies[sourceTop]; !known {
			t.Errorf("%s belongs to unregistered top-level tier %q", slashRel, sourceTop)
			return nil
		}

		file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
		if err != nil {
			return err
		}

		for _, spec := range file.Imports {
			importPath, err := strconv.Unquote(spec.Path.Value)
			if err != nil {
				return err
			}
			if reason := subpackageViolation(sourcePackage, importPath); reason != "" {
				t.Errorf("%s: %s", slashRel, reason)
			}
			if !strings.HasPrefix(importPath, modulePrefix) {
				continue
			}
			targetInternal := strings.TrimPrefix(importPath, modulePrefix)
			targetTop := strings.Split(targetInternal, "/")[0]
			if sourceTop == targetTop {
				continue
			}
			if !allowedTopLevelDependencies[sourceTop][targetTop] {
				t.Errorf("%s imports internal package %q outside the allowed 4-tier DAG", slashRel, targetInternal)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestLegacyServerPackagesRemoved(t *testing.T) {
	internalRoot := filepath.Clean(filepath.Join("..", "internal"))
	for _, name := range []string{"project", "study", "persistence", "planning", "capture", "activity"} {
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
