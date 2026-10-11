// A test-only stdin/stdout bridge: the TypeScript oracle sends independent cases
// and compares their result with the native Go domain. No network or runtime DB.
package main

import (
	"encoding/json"
	"leave-management/internal/model"
	"leave-management/internal/service"
	"os"
	"time"
)

type input struct {
	Database   *model.Database `json:"database"`
	ActorID    int             `json:"actorId"`
	EmployeeID int             `json:"employeeId"`
	Command    model.Command   `json:"command"`
	Operation  string          `json:"operation"`
	Query      string          `json:"query"`
	Date       string          `json:"date"`
	Now        string          `json:"now"`
}
type output struct {
	Database *model.Database `json:"database,omitempty"`
	Result   any             `json:"result,omitempty"`
	Error    error           `json:"error,omitempty"`
}

func main() {
	decoder, encoder := json.NewDecoder(os.Stdin), json.NewEncoder(os.Stdout)
	var cases []input
	if err := decoder.Decode(&cases); err != nil {
		panic(err)
	}
	results := make([]output, 0, len(cases))
	for _, c := range cases {
		var result any
		var err error
		db := model.Clone(c.Database)
		switch c.Operation {
		case "snapshot":
			result, err = service.Snapshot(db, c.ActorID)
		case "colleagues":
			result, err = service.Colleagues(db, c.ActorID, c.Query, c.Date)
		case "profile":
			result, err = service.Profile(db, c.ActorID, c.EmployeeID)
		default:
			now, _ := time.Parse(time.RFC3339, c.Now)
			result, err = service.Apply(db, c.ActorID, c.Command, now)
		}
		if err != nil {
			results = append(results, output{Error: err})
		} else {
			results = append(results, output{Database: db, Result: result})
		}
	}
	if err := encoder.Encode(results); err != nil {
		panic(err)
	}
}
