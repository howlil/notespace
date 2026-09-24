package icon

import (
	"encoding/xml"
	"errors"
	"io"
	"strings"
)

func unsafeSVGURL(value string) bool {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" || strings.HasPrefix(value, "#") || strings.HasPrefix(value, "data:image/") {
		return false
	}
	return strings.Contains(value, ":") || strings.HasPrefix(value, "//")
}

func validSVG(data []byte) bool {
	decoder := xml.NewDecoder(strings.NewReader(string(data)))
	seenSVG := false
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			return seenSVG
		}
		if err != nil {
			return false
		}
		switch typed := token.(type) {
		case xml.Directive:
			if strings.Contains(strings.ToLower(string(typed)), "doctype") {
				return false
			}
		case xml.StartElement:
			name := strings.ToLower(typed.Name.Local)
			if name == "svg" {
				seenSVG = true
			}
			switch name {
			case "script", "foreignobject", "iframe", "object", "embed":
				return false
			}
			for _, attr := range typed.Attr {
				attrName := strings.ToLower(attr.Name.Local)
				value := strings.TrimSpace(attr.Value)
				lowerValue := strings.ToLower(value)
				if strings.HasPrefix(attrName, "on") || attrName == "base" || strings.Contains(lowerValue, "javascript:") {
					return false
				}
				if attrName == "href" && unsafeSVGURL(value) {
					return false
				}
				if attrName == "style" && (strings.Contains(lowerValue, "javascript:") || strings.Contains(lowerValue, "url(http") || strings.Contains(lowerValue, "url(//")) {
					return false
				}
			}
		}
	}
}
