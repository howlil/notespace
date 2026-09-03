package study

import "testing"

func TestCalculateStreakUsesTenMinuteStudyDays(t *testing.T) {
	days := []DayActivity{
		{Date: "2026-08-29", ActiveSeconds: 48 * 60},
		{Date: "2026-08-30", ActiveSeconds: 72 * 60},
		{Date: "2026-08-31", ActiveSeconds: 21 * 60},
		{Date: "2026-09-01", ActiveSeconds: 43 * 60},
		{Date: "2026-09-02", ActiveSeconds: 35 * 60},
		{Date: "2026-09-03", ActiveSeconds: 18 * 60},
	}
	if got := CalculateStreak(days, "2026-09-03"); got != 6 {
		t.Fatalf("streak = %d, want 6", got)
	}
	days[5].ActiveSeconds = 9 * 60
	if got := CalculateStreak(days, "2026-09-03"); got != 5 {
		t.Fatalf("streak after below-threshold today = %d, want 5", got)
	}
}

func TestCalculateStreakStopsAtMissingDay(t *testing.T) {
	days := []DayActivity{{Date: "2026-09-01", ActiveSeconds: 600}, {Date: "2026-09-03", ActiveSeconds: 600}}
	if got := CalculateStreak(days, "2026-09-03"); got != 1 {
		t.Fatalf("streak = %d, want 1", got)
	}
}
