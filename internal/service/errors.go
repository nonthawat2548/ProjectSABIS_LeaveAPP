package service

type Error struct {
	Message string `json:"message"`
	Code    string `json:"code"`
}

func (e *Error) Error() string           { return e.Message }
func Invalid(message string) error       { return &Error{message, "VALIDATION"} }
func Problem(message, code string) error { return &Error{message, code} }
