// Package app owns the Notespace server process composition root, configuration,
// HTTP static/SPA delivery, and authentication middleware.
package app

import (
	"os"
	"strconv"
	"time"
)

// Config holds all process-level configuration parsed once at startup.
type Config struct {
	SnapshotOnly         bool
	DatabasePath         string
	DatabasePathExplicit bool
	ListenAddr           string
	WebDir               string
	OwnerPassword        string
	Desktop              bool
	DesktopOriginFile    string
	DevServerURL         string
	ReadyStdout          bool
	TestCanvasSaveDelay  time.Duration
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func ConfigFromEnv() Config {
	rawDB := os.Getenv("NOTESPACE_DB")
	dsn := rawDB
	if dsn == "" {
		dsn = "data/notespace.db"
	}
	var delay time.Duration
	if ms, err := strconv.Atoi(os.Getenv("NOTESPACE_TEST_CANVAS_SAVE_DELAY_MS")); err == nil && ms > 0 {
		delay = time.Duration(ms) * time.Millisecond
	}
	return Config{
		SnapshotOnly:         os.Getenv("NOTESPACE_SNAPSHOT_ONLY") == "1",
		DatabasePath:         dsn,
		DatabasePathExplicit: rawDB != "",
		ListenAddr:           envOr("NOTESPACE_ADDR", "127.0.0.1:8080"),
		WebDir:               envOr("NOTESPACE_WEB_DIR", "apps/web/dist/client"),
		OwnerPassword:        os.Getenv("NOTESPACE_PASSWORD"),
		Desktop:              os.Getenv("NOTESPACE_PARENT_LIFECYCLE") == "1",
		DesktopOriginFile:    envOr("NOTESPACE_DESKTOP_ORIGIN_FILE", dsn+".desktop-origin"),
		DevServerURL:         os.Getenv("NOTESPACE_DEV_SERVER_URL"),
		ReadyStdout:          os.Getenv("NOTESPACE_READY_STDOUT") == "1",
		TestCanvasSaveDelay:  delay,
	}
}
