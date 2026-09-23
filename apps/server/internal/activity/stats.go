package activity

import "time"

func CalculateStreak(days []DayActivity, endDate string) int {
	if !ValidDate(endDate) {
		return 0
	}
	byDate := make(map[string]int64, len(days))
	for _, day := range days {
		if ValidDate(day.Date) {
			byDate[day.Date] = int64(day.ActiveSeconds)
		}
	}
	date, _ := time.Parse(DateLayout, endDate)
	if byDate[endDate] < ActivityDayThreshold {
		date = date.AddDate(0, 0, -1)
	}
	streak := 0
	for byDate[date.Format(DateLayout)] >= ActivityDayThreshold {
		streak++
		date = date.AddDate(0, 0, -1)
	}
	return streak
}
