package app

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type mediaTransport func(*http.Request) (*http.Response, error)

func (f mediaTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestCloudMediaRequiresPrivateBucketsAndUsesOpaqueObjects(t *testing.T) {
	private := false
	writes := 0
	client := &http.Client{Transport: mediaTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "storage.googleapis.com" {
			t.Fatalf("unexpected media host %s", r.URL.Host)
		}
		body, status := "", 200
		switch {
		case r.URL.Query().Get("fields") == "iamConfiguration":
			if private {
				body = `{"iamConfiguration":{"publicAccessPrevention":"enforced","uniformBucketLevelAccess":{"enabled":true}}}`
			} else {
				body = `{"iamConfiguration":{"publicAccessPrevention":"inherited","uniformBucketLevelAccess":{"enabled":true}}}`
			}
		case r.Method == "POST":
			writes++
			if r.URL.Query().Get("ifGenerationMatch") != "0" || r.URL.Query().Get("name") != "opaque.jpg" {
				t.Fatal("upload can overwrite an existing object or exposes personal names")
			}
			if r.Header.Get("Content-Type") != "image/jpeg" {
				t.Fatal("unexpected upload type")
			}
		case r.Method == "DELETE":
			status = 404 // Deletion retries are idempotent.
		default:
			body = "normalized-image"
		}
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	store := &cloudMedia{client: client, portraits: "test-portraits", kyc: "test-kyc"}
	if e := store.validatePrivacy(context.Background()); e == nil {
		t.Fatal("public access prevention was not required")
	}
	private = true
	if e := store.validatePrivacy(context.Background()); e != nil {
		t.Fatal(e)
	}
	if e := store.Put(context.Background(), "kyc", "opaque.jpg", []byte("normalized-image")); e != nil {
		t.Fatal(e)
	}
	if writes != 1 {
		t.Fatal("unexpected upload count")
	}
	if data, e := store.Get(context.Background(), "kyc", "opaque.jpg"); e != nil || string(data) != "normalized-image" {
		t.Fatal("private object could not be retrieved", e)
	}
	if e := store.Delete(context.Background(), "kyc", "opaque.jpg"); e != nil {
		t.Fatal("deletion retry failed", e)
	}
}
