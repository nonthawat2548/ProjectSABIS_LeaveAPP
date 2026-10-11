// Package data embeds the same demo dataset used by React. There is no second seed file.
package data

import _ "embed"

//go:embed leave-management-10-people.json
var DemoJSON []byte
