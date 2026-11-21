package icon

import (
	"encoding/xml"
	"errors"
	"io"
	"strings"
)

func unsafeSVGURL(value string) bool {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" || strings.HasPrefix(value, "#") {
		return false
	}
	if strings.HasPrefix(value, "data:image/") && !strings.HasPrefix(value, "data:image/svg") {
		return false
	}
	return strings.Contains(value, ":") || strings.HasPrefix(value, "//")
}

func unsafeSVGStyle(lowerValue string) bool {
	return strings.Contains(lowerValue, "javascript:") ||
		strings.Contains(lowerValue, "url(http") ||
		strings.Contains(lowerValue, "url(//") ||
		strings.Contains(lowerValue, "@import")
}

func validSVG(data []byte) bool {
	decoder := xml.NewDecoder(strings.NewReader(string(data)))
	seenSVG := false
	styleDepth := 0
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
			if name == "style" {
				styleDepth++
			}
			switch name {
			case "script", "foreignobject", "iframe", "object", "embed",
				"set", "animate", "animatetransform", "animatemotion", "animatecolor", "mpath":
				return false
			}
			for _, attr := range typed.Attr {
				attrName := strings.ToLower(attr.Name.Local)
				value := strings.TrimSpace(attr.Value)
				lowerValue := strings.ToLower(value)
				if strings.HasPrefix(attrName, "on") || attrName == "base" || strings.Contains(lowerValue, "javascript:") {
					return false
				}
				if (attrName == "href" || attrName == "xlink:href") && unsafeSVGURL(value) {
					return false
				}
				if attrName == "style" && unsafeSVGStyle(lowerValue) {
					return false
				}
			}
		case xml.EndElement:
			if strings.EqualFold(typed.Name.Local, "style") && styleDepth > 0 {
				styleDepth--
			}
		case xml.CharData:
			if styleDepth > 0 && unsafeSVGStyle(strings.ToLower(string(typed))) {
				return false
			}
		}
	}
}
