package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
)

const (
	ProviderDeepSeek       = "deepseek"
	ProviderOpenRouterFree = "openrouter-free"
	OpenRouterFreeBaseURL  = "https://openrouter.ai/api/v1"
)

var freeModelID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*:free$`)

func isFreeModel(model string) bool {
	return model == "openrouter/free" || freeModelID.MatchString(model)
}

// ValidateProviderConfig is also called before opening the database at startup.
func ValidateProviderConfig(cfg Config) error {
	switch cfg.Provider {
	case "", ProviderDeepSeek:
		return nil
	case ProviderOpenRouterFree:
		if !isFreeModel(cfg.Model) {
			return errors.New("openrouter-free requires HONOBOX_MODEL=openrouter/free or an explicit owner/model:free ID")
		}
		return nil
	default:
		return errors.New("HONOBOX_PROVIDER must be deepseek or openrouter-free")
	}
}

// Free mode is deliberately a small text/function-tool API, rather than the
// legacy provider's unrestricted pass-through. New provider extensions must be
// reviewed before they can alter routing, enable paid server tools, or add costs.
func prepareFreeRequest(raw []byte) ([]byte, error) {
	body, err := uniqueObject(raw)
	if err != nil {
		return nil, err
	}
	for field := range body {
		switch field {
		case "model", "messages", "stream", "stream_options", "tools", "tool_choice", "parallel_tool_calls",
			"temperature", "top_p", "top_k", "min_p", "top_a", "frequency_penalty", "presence_penalty",
			"repetition_penalty", "max_tokens", "max_completion_tokens", "seed", "stop", "response_format",
			"logit_bias", "logprobs", "top_logprobs", "reasoning", "user":
		default:
			return nil, fmt.Errorf("field %q is not allowed in openrouter-free mode; routing, fallbacks and paid extensions are disabled", field)
		}
	}
	var model string
	if json.Unmarshal(body["model"], &model) != nil || !isFreeModel(model) {
		return nil, errors.New("openrouter-free only accepts openrouter/free or an explicit owner/model:free ID")
	}
	var messages []map[string]json.RawMessage
	if json.Unmarshal(body["messages"], &messages) != nil || len(messages) == 0 {
		return nil, errors.New("a nonempty messages array is required")
	}
	for _, message := range messages {
		for field := range message {
			switch field {
			case "role", "content", "name", "tool_calls", "tool_call_id", "refusal":
			default:
				return nil, fmt.Errorf("message field %q is not allowed in openrouter-free mode", field)
			}
		}
		if content, ok := message["content"]; ok && !bytes.Equal(bytes.TrimSpace(content), []byte("null")) {
			var text string
			if json.Unmarshal(content, &text) != nil {
				return nil, errors.New("openrouter-free supports text messages only; file, image and audio processing are disabled")
			}
		}
		if err := functionToolsOnly(message["tool_calls"]); err != nil {
			return nil, err
		}
	}
	if err := functionToolsOnly(body["tools"]); err != nil {
		return nil, err
	}
	if choice, ok := body["tool_choice"]; ok {
		var label string
		if json.Unmarshal(choice, &label) == nil {
			if label != "auto" && label != "none" && label != "required" {
				return nil, errors.New("openrouter-free supports function tool choices only")
			}
		} else {
			var selected struct {
				Type string `json:"type"`
			}
			if json.Unmarshal(choice, &selected) != nil || selected.Type != "function" {
				return nil, errors.New("openrouter-free supports function tool choices only")
			}
		}
	}
	// Enforce a second, server-owned zero-price boundary. Clients cannot provide
	// this field or override it with paid fallback models, presets or plugins.
	body["provider"] = json.RawMessage(`{"allow_fallbacks":false,"max_price":{"prompt":0,"completion":0,"request":0,"image":0}}`)
	return json.Marshal(body)
}

func functionToolsOnly(raw json.RawMessage) error {
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil
	}
	var tools []struct {
		Type string `json:"type"`
	}
	if json.Unmarshal(raw, &tools) != nil {
		return errors.New("tools and tool_calls must be arrays")
	}
	for _, tool := range tools {
		if tool.Type != "function" {
			return errors.New("openrouter-free only supports client function tools; paid server tools are disabled")
		}
	}
	return nil
}

func uniqueObject(raw []byte) (map[string]json.RawMessage, error) {
	d := json.NewDecoder(bytes.NewReader(raw))
	token, err := d.Token()
	if err != nil || token != json.Delim('{') {
		return nil, errors.New("request must be a JSON object")
	}
	body := make(map[string]json.RawMessage)
	for d.More() {
		key, err := d.Token()
		if err != nil {
			return nil, errors.New("invalid JSON request")
		}
		name, ok := key.(string)
		if !ok {
			return nil, errors.New("invalid JSON field")
		}
		if _, duplicate := body[name]; duplicate {
			return nil, fmt.Errorf("duplicate field %q is not allowed in openrouter-free mode", name)
		}
		var value json.RawMessage
		if err := d.Decode(&value); err != nil {
			return nil, errors.New("invalid JSON field value")
		}
		body[name] = value
	}
	if _, err := d.Token(); err != nil {
		return nil, errors.New("invalid JSON object")
	}
	if _, err := d.Token(); err != io.EOF {
		return nil, errors.New("request must contain one JSON object")
	}
	return body, nil
}
