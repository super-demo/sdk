package sdk

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"time"
)

type SuperAppSDK struct {
	APIKey  string
	BaseURL string
}

func NewSuperAppSDK(apiKey string) *SuperAppSDK {
	// Try multiple possible URLs based on different network setups
	urls := []string{
		"http://localhost:8080/v1/super",
		"http://host.docker.internal:8080/v1/super",
	}

	// Test each URL
	for _, url := range urls {
		client := &http.Client{
			Timeout: 1 * time.Second,
		}

		_, err := client.Get(url + "/list")
		if err == nil {
			log.Printf("✅ Successfully connected to Super App at %s\n", url)
			return &SuperAppSDK{
				APIKey:  apiKey,
				BaseURL: url,
			}
		}
		log.Printf("❌ Could not connect to %s: %v\n", url, err)
	}

	// Default to localhost if none of the URLs worked
	log.Println("⚠️ Using default Super App URL, but connection not verified")
	return &SuperAppSDK{
		APIKey:  apiKey,
		BaseURL: "http://localhost:8080/v1/super",
	}
}

// ✅ Register Mini-App with retry logic
func (sdk *SuperAppSDK) Register(appName string, functions []string) error {
	payload, _ := json.Marshal(map[string]any{
		"appName":   appName,
		"functions": functions,
	})

	// Try a few times in case the server is still starting up
	var lastErr error
	for i := 0; i < 3; i++ {
		resp, err := http.Post(sdk.BaseURL+"/register", "application/json", bytes.NewBuffer(payload))
		if err != nil {
			log.Printf("❌ Register attempt %d failed: %v\n", i+1, err)
			lastErr = err
			time.Sleep(1 * time.Second)
			continue
		}
		defer resp.Body.Close()

		body, _ := ioutil.ReadAll(resp.Body)
		log.Printf("Register response (attempt %d): %s\n", i+1, string(body))

		if resp.StatusCode == http.StatusOK {
			return nil
		}

		lastErr = fmt.Errorf("server returned non-OK status: %d - %s", resp.StatusCode, string(body))
		time.Sleep(1 * time.Second)
	}

	return lastErr
}

// ✅ Call Another Mini-App's Function with better error reporting
func (sdk *SuperAppSDK) CallFunction(url, caller, targetApp, functionName string, payload map[string]interface{}) (map[string]interface{}, error) {
	requestBody, err := json.Marshal(map[string]any{
		"url":          url,
		"caller":       caller,
		"targetApp":    targetApp,
		"functionName": functionName,
		"payload":      payload,
	})
	if err != nil {
		return nil, fmt.Errorf("error encoding request JSON: %v", err)
	}

	log.Printf("Calling %s.%s with payload: %s\n", targetApp, functionName, string(requestBody))

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	req, err := http.NewRequest("POST", sdk.BaseURL+"/call-function", bytes.NewBuffer(requestBody))
	if err != nil {
		return nil, fmt.Errorf("error creating request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error calling function: %v", err)
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response body: %v", err)
	}

	log.Printf("Raw response from call-function: %s\n", string(body))

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("server returned non-OK status: %d - %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("error decoding response JSON: %v", err)
	}

	return result, nil
}
