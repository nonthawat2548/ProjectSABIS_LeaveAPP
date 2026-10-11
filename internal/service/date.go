package service

import (
	"time"
	_ "time/tzdata"
)

const dateLayout = "2006-01-02"

func ParseDate(value string) (time.Time, error) {
	d, err := time.Parse(dateLayout, value)
	if err != nil || d.Format(dateLayout) != value || d.Year() < 1900 || d.Year() > 2200 {
		return time.Time{}, Invalid("วันที่ไม่ถูกต้อง")
	}
	return d, nil
}
func Today(now time.Time) string {
	zone, _ := time.LoadLocation("Asia/Bangkok")
	return now.In(zone).Format(dateLayout)
}
func difference(from, to string) int {
	a, _ := ParseDate(from)
	b, _ := ParseDate(to)
	return int(b.Sub(a).Hours() / 24)
}
func timestamp(now time.Time) string { return now.UTC().Format("2006-01-02T15:04:05.000Z") }

// TextLength retains the existing JavaScript string limits, including emoji.
func TextLength(s string) int {
	n := 0
	for _, r := range s {
		n++
		if r > 0xffff {
			n++
		}
	}
	return n
}
