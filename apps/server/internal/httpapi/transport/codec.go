// Package transport owns shared HTTP wire plumbing: JSON/binary decoding,
// bounded body limits, structured error-to-status mapping, and query/header parsing.
package transport

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/domain/apperr"
)

func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		SendJSON(w, http.StatusUnsupportedMediaType, map[string]string{"error": "Expected application/json"})
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	err = decoder.Decode(dst)
	if err == nil {
		var extra any
		if decoder.Decode(&extra) != io.EOF {
			err = apperr.ErrInvalid
		}
	}
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			SendJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "Request exceeds the 10 MiB limit"})
		} else {
			SendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON request"})
		}
		return false
	}
	return true
}

func ReadBoundedBody(w http.ResponseWriter, r *http.Request, maxBytes int64, tooLargeMessage string) ([]byte, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			SendJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": tooLargeMessage})
			return nil, false
		}
		Fail(w, err)
		return nil, false
	}
	return data, true
}

func SendJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if value != nil {
		_ = json.NewEncoder(w).Encode(value)
	}
}

func SendNoContent(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNoContent)
}
