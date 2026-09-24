package planning

import "context"

func (s Service) Today(ctx context.Context, date string) (Today, error) {
	if !validDateKey(date) {
		return Today{}, ErrInvalid
	}
	tasks, err := s.store.ListToday(ctx, date)
	if err != nil {
		return Today{}, err
	}
	return Today{Date: date, Tasks: tasks}, nil
}

func (s Service) Inbox(ctx context.Context) (Inbox, error) {
	tasks, err := s.store.ListInbox(ctx)
	if err != nil {
		return Inbox{}, err
	}
	return Inbox{Tasks: tasks}, nil
}
