// Package model contains the JSON contract shared with the existing React application.
package model

import "encoding/json"

type Employee struct {
	ID         int    `json:"id"`
	Name       string `json:"name"`
	Gender     string `json:"gender"`
	Email      string `json:"email"`
	Phone      string `json:"phone"`
	Position   string `json:"position"`
	Role       string `json:"role"`
	ManagerID  *int   `json:"managerId"`
	Department string `json:"department"`
	Active     bool   `json:"active"`
}
type LeaveType struct {
	ID                       int     `json:"id"`
	Name                     string  `json:"name"`
	QuotaScope               string  `json:"quotaScope"`
	DefaultQuotaDays         float64 `json:"defaultQuotaDays"`
	DayCountBasis            string  `json:"dayCountBasis"`
	AdvanceNoticeDays        int     `json:"advanceNoticeDays"`
	DocumentRequiredFromDays *int    `json:"documentRequiredFromDays"`
	RequiredDocumentType     *string `json:"requiredDocumentType"`
	EligibleGender           *string `json:"eligibleGender"`
}
type Entitlement struct {
	ID          int     `json:"id"`
	EmployeeID  int     `json:"employeeId"`
	LeaveTypeID int     `json:"leaveTypeId"`
	Year        int     `json:"year"`
	GrantedDays float64 `json:"grantedDays"`
}
type MaternityCase struct {
	ID          int `json:"id"`
	EmployeeID  int `json:"employeeId"`
	CaseNo      int `json:"caseNo"`
	MaximumDays int `json:"maximumDays"`
}
type TimelineEvent struct {
	Action  string `json:"action"`
	ActorID int    `json:"actorId"`
	At      string `json:"at"`
	Comment string `json:"comment"`
}
type LeaveRequest struct {
	ID              int             `json:"id"`
	EmployeeID      int             `json:"employeeId"`
	LeaveTypeID     int             `json:"leaveTypeId"`
	MaternityCaseID *int            `json:"maternityCaseId"`
	StartDate       string          `json:"startDate"`
	EndDate         string          `json:"endDate"`
	Reason          string          `json:"reason"`
	RequestDate     string          `json:"requestDate"`
	Status          string          `json:"status"`
	Duration        string          `json:"duration"`
	Version         int             `json:"version"`
	Timeline        []TimelineEvent `json:"timeline"`
}
type LeaveDay struct {
	ID            int     `json:"id"`
	LeaveID       int     `json:"leaveId"`
	Date          string  `json:"date"`
	EntitlementID *int    `json:"entitlementId"`
	Units         float64 `json:"units"`
}
type LeaveDocument struct {
	ID           int    `json:"id"`
	LeaveID      int    `json:"leaveId"`
	DocumentType string `json:"documentType"`
	FileName     string `json:"fileName"`
	StorageKey   string `json:"storageKey"`
	FileType     string `json:"fileType"`
	FileSize     int    `json:"fileSize"`
	UploadedAt   string `json:"uploadedAt"`
	DataURL      string `json:"dataUrl"`
	Remote       bool   `json:"remote,omitempty"`
}
type LeaveApproval struct {
	ID         int     `json:"id"`
	LeaveID    int     `json:"leaveId"`
	ApproverID int     `json:"approverId"`
	StepNo     int     `json:"stepNo"`
	ReviewRole string  `json:"reviewRole"`
	ReviewType string  `json:"reviewType"`
	Status     string  `json:"status"`
	Comment    string  `json:"comment"`
	AssignedAt string  `json:"assignedAt"`
	ReviewedAt *string `json:"reviewedAt"`
	Cancelled  bool    `json:"cancelled,omitempty"`
}
type WorkStatus struct {
	ID         int    `json:"id"`
	EmployeeID int    `json:"employeeId"`
	Date       string `json:"date"`
	StatusType string `json:"statusType"`
	UpdatedAt  string `json:"updatedAt"`
}
type Notification struct {
	ID         int    `json:"id"`
	EmployeeID int    `json:"employeeId"`
	LeaveID    *int   `json:"leaveId"`
	Text       string `json:"text"`
	CreatedAt  string `json:"createdAt"`
	Read       bool   `json:"read"`
}
type Holiday struct {
	Date string `json:"date"`
	Name string `json:"name"`
}
type Database struct {
	SchemaVersion  int             `json:"schemaVersion"`
	Employees      []Employee      `json:"employees"`
	LeaveTypes     []LeaveType     `json:"leaveTypes"`
	Entitlements   []Entitlement   `json:"entitlements"`
	MaternityCases []MaternityCase `json:"maternityCases"`
	Requests       []LeaveRequest  `json:"requests"`
	Days           []LeaveDay      `json:"days"`
	Documents      []LeaveDocument `json:"documents"`
	Approvals      []LeaveApproval `json:"approvals"`
	WorkStatuses   []WorkStatus    `json:"workStatuses"`
	Notifications  []Notification  `json:"notifications"`
	Holidays       []Holiday       `json:"holidays"`
}
type Attachment struct {
	FileName string `json:"fileName"`
	FileType string `json:"fileType"`
	FileSize int    `json:"fileSize"`
	DataURL  string `json:"dataUrl"`
	UploadID string `json:"uploadId,omitempty"`
}
type RequestInput struct {
	LeaveTypeID     int         `json:"leaveTypeId"`
	MaternityCaseID *int        `json:"maternityCaseId"`
	StartDate       string      `json:"startDate"`
	EndDate         string      `json:"endDate"`
	Duration        string      `json:"duration"`
	Reason          string      `json:"reason"`
	Attachment      *Attachment `json:"attachment"`
	KeepDocument    *bool       `json:"keepDocument"`
}
type Command struct {
	Type         string          `json:"type"`
	Input        *RequestInput   `json:"input"`
	ID           int             `json:"id"`
	Version      int             `json:"version"`
	Comment      string          `json:"comment"`
	HRID         int             `json:"hrId"`
	Date         string          `json:"date"`
	StatusType   string          `json:"statusType"`
	EmployeeID   int             `json:"employeeId"`
	LeaveTypeID  int             `json:"leaveTypeId"`
	Year         int             `json:"year"`
	GrantedDays  *float64        `json:"grantedDays"`
	MaximumDays  int             `json:"maximumDays"`
	Name         string          `json:"name"`
	Remove       bool            `json:"remove"`
	Policy       *LeaveType      `json:"policy"`
	PolicyFields map[string]bool `json:"-"`
}

// Required JSON fields need presence checks: zero is a valid quota/notice value,
// while a missing field must not silently change the policy to zero.
func (c *Command) UnmarshalJSON(data []byte) error {
	type plain Command
	if err := json.Unmarshal(data, (*plain)(c)); err != nil {
		return err
	}
	if c.Policy != nil {
		var root map[string]json.RawMessage
		if err := json.Unmarshal(data, &root); err != nil {
			return err
		}
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(root["policy"], &fields); err != nil {
			return err
		}
		c.PolicyFields = map[string]bool{}
		for key, value := range fields {
			c.PolicyFields[key] = string(value) != "null" || key == "eligibleGender" || key == "documentRequiredFromDays" || key == "requiredDocumentType"
		}
	}
	return nil
}

type Result struct {
	ID      int    `json:"id,omitempty"`
	Message string `json:"message"`
}
type Balance struct{ Total, Used, Remaining, Pending float64 }
type ColleagueStatus struct {
	EmployeeID    int     `json:"employeeId"`
	Name          string  `json:"name"`
	Position      string  `json:"position"`
	Department    string  `json:"department"`
	Date          string  `json:"date"`
	WorkStatus    *string `json:"workStatus"`
	LeaveDuration *string `json:"leaveDuration"`
	UpdatedAt     *string `json:"updatedAt"`
}

func Clone(db *Database) *Database {
	b, _ := json.Marshal(db)
	var copy Database
	_ = json.Unmarshal(b, &copy)
	return &copy
}

func (e Employee) GetID() int      { return e.ID }
func (e LeaveType) GetID() int     { return e.ID }
func (e Entitlement) GetID() int   { return e.ID }
func (e MaternityCase) GetID() int { return e.ID }
func (e LeaveRequest) GetID() int  { return e.ID }
func (e LeaveDay) GetID() int      { return e.ID }
func (e LeaveDocument) GetID() int { return e.ID }
func (e LeaveApproval) GetID() int { return e.ID }
func (e WorkStatus) GetID() int    { return e.ID }
func (e Notification) GetID() int  { return e.ID }
