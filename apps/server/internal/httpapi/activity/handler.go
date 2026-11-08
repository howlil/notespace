package activityhttp

import (
	"github.com/howlil/notespace/apps/server/internal/activity"
)

// Handler owns activity transport and delegates product rules to application services.
type Handler struct {
	activities *activity.Service
}

func New(activities *activity.Service) Handler { return Handler{activities: activities} }
