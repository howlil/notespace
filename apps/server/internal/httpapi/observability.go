package httpapi

import (
	"crypto/rand"
	"log/slog"
	"net/http"
	"time"
)

type DatabaseStats struct {
	OpenConnections int
	InUse           int
	Idle            int
	WaitCount       int64
	WaitDuration    time.Duration
}

type responseMetricsWriter struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (w *responseMetricsWriter) WriteHeader(status int) {
	if w.status != 0 {
		return
	}
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *responseMetricsWriter) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	n, err := w.ResponseWriter.Write(data)
	w.bytes += n
	return n, err
}

// WithRequestObservability records the user-visible HTTP latency together with
// SQLite pool pressure. DB wait deltas are process-global over the request
// window, so they diagnose contention without pretending to be exact per-request spans.
func WithRequestObservability(next http.Handler, databaseStats func() DatabaseStats) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		before := DatabaseStats{}
		if databaseStats != nil {
			before = databaseStats()
		}

		requestID := rand.Text()
		w.Header().Set("X-Request-ID", requestID)
		metrics := &responseMetricsWriter{ResponseWriter: w}
		next.ServeHTTP(metrics, r)
		if metrics.status == 0 {
			metrics.status = http.StatusOK
		}

		route := r.Pattern
		if route == "" {
			route = "unmatched"
		}
		attributes := []any{
			"request_id", requestID,
			"method", r.Method,
			"route", route,
			"status", metrics.status,
			"response_bytes", metrics.bytes,
			"duration_ms", float64(time.Since(started).Microseconds()) / 1000,
		}
		if databaseStats != nil {
			after := databaseStats()
			attributes = append(attributes,
				"db_wait_count_delta_global", after.WaitCount-before.WaitCount,
				"db_wait_ms_delta_global", float64((after.WaitDuration-before.WaitDuration).Microseconds())/1000,
				"db_open_connections", after.OpenConnections,
				"db_in_use", after.InUse,
				"db_idle", after.Idle,
			)
		}
		slog.Info("http_request", attributes...)
	})
}
