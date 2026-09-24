package activity

import "time"

type Service struct {
	store      Store
	references ReferenceLookup
	nowFn      func() time.Time
}

func NewService(store Store, references ReferenceLookup, now func() time.Time) Service {
	if store == nil {
		panic("activity: store is required")
	}
	if references == nil {
		panic("activity: reference lookup is required")
	}
	return Service{store: store, references: references, nowFn: now}
}

func (s Service) now() time.Time {
	if s.nowFn != nil {
		return s.nowFn().UTC()
	}
	return time.Now().UTC()
}

func (s Service) currentDate() string {
	if s.nowFn != nil {
		return s.nowFn().Format(DateLayout)
	}
	return time.Now().Format(DateLayout)
}
