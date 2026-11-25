// Package apperr provides structured application errors carrying a semantic
// Kind, optional stable client Code, and user-safe Message so transports map
// failures uniformly without switching on domain-specific error sentinels.
package apperr

import (
	"errors"
	"fmt"
)

type Kind uint8

const (
	KindInternal Kind = iota
	KindNotFound
	KindInvalid
	KindConflict
	KindNotEmpty
	KindUnavailable
)

// Root sentinels support coarse errors.Is classification alongside *Error.
var (
	ErrNotFound    = errors.New("not found")
	ErrInvalid     = errors.New("invalid input")
	ErrConflict    = errors.New("conflict")
	ErrNotEmpty    = errors.New("resource not empty")
	ErrUnavailable = errors.New("service unavailable")
)

type Error struct {
	Kind    Kind
	Code    string
	Message string
	Cause   error
}

func (e *Error) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Cause)
	}
	return e.Message
}

func (e *Error) Unwrap() error { return e.Cause }

func (e *Error) Is(target error) bool {
	switch target {
	case ErrNotFound:
		return e.Kind == KindNotFound
	case ErrInvalid:
		return e.Kind == KindInvalid
	case ErrConflict:
		return e.Kind == KindConflict
	case ErrNotEmpty:
		return e.Kind == KindNotEmpty
	case ErrUnavailable:
		return e.Kind == KindUnavailable
	default:
		other, ok := target.(*Error)
		if !ok || e.Kind != other.Kind {
			return false
		}
		if other.Code != "" {
			return e.Code == other.Code
		}
		if other.Message != "" {
			return e.Message == other.Message
		}
		return true
	}
}

func New(kind Kind, code, message string) *Error {
	return &Error{Kind: kind, Code: code, Message: message}
}

func Wrap(base *Error, cause error) *Error {
	return &Error{Kind: base.Kind, Code: base.Code, Message: base.Message, Cause: cause}
}

func NotFound(message string) *Error       { return New(KindNotFound, "", message) }
func Invalid(message string) *Error        { return New(KindInvalid, "", message) }
func Conflict(code, message string) *Error { return New(KindConflict, code, message) }
func NotEmpty(code, message string) *Error { return New(KindNotEmpty, code, message) }
func Unavailable(message string) *Error    { return New(KindUnavailable, "", message) }

// As extracts a structured *Error from err, synthesizing a default structured
// error when only a coarse root sentinel is present.
func As(err error) (*Error, bool) {
	if err == nil {
		return nil, false
	}
	var structured *Error
	if errors.As(err, &structured) {
		return structured, true
	}
	switch {
	case errors.Is(err, ErrNotFound):
		return NotFound("Not found"), true
	case errors.Is(err, ErrInvalid):
		return Invalid("Invalid request"), true
	case errors.Is(err, ErrConflict):
		return Conflict("", "Request conflicts with current state"), true
	case errors.Is(err, ErrNotEmpty):
		return NotEmpty("", "Request conflicts with current state"), true
	case errors.Is(err, ErrUnavailable):
		return Unavailable("Service unavailable"), true
	default:
		return nil, false
	}
}
