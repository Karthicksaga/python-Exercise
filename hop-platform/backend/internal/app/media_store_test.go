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

func TestMediaStoreMemoryStore(t *testing.T) {
	ctx := context.Background()
	m := &memoryMedia{}
	if err := m.Put(ctx, "kyc", "doc1.jpg", []byte("sample-data")); err != nil {
		t.Fatalf("memoryMedia.Put failed: %v", err)
	}
	data, err := m.Get(ctx, "kyc", "doc1.jpg")
	if err != nil || string(data) != "sample-data" {
		t.Fatalf("memoryMedia.Get failed: %v, data: %s", err, string(data))
	}
	if _, err := m.Get(ctx, "kyc", "nonexistent.jpg"); err == nil {
		t.Fatal("expected error getting nonexistent key")
	}
	if err := m.Delete(ctx, "kyc", "doc1.jpg"); err != nil {
		t.Fatalf("memoryMedia.Delete failed: %v", err)
	}
	if _, err := m.Get(ctx, "kyc", "doc1.jpg"); err == nil {
		t.Fatal("expected error getting deleted key")
	}
}

func TestMediaStoreLocalStore(t *testing.T) {
	ctx := context.Background()
	tempDir := t.TempDir()
	l := &localMedia{baseDir: tempDir}
	if err := l.Put(ctx, "portrait", "user1.jpg", []byte("photo-data")); err != nil {
		t.Fatalf("localMedia.Put failed: %v", err)
	}
	data, err := l.Get(ctx, "portrait", "user1.jpg")
	if err != nil || string(data) != "photo-data" {
		t.Fatalf("localMedia.Get failed: %v, data: %s", err, string(data))
	}
	if _, err := l.Get(ctx, "portrait", "missing.jpg"); err == nil {
		t.Fatal("expected error getting missing key")
	}
	if err := l.Delete(ctx, "portrait", "user1.jpg"); err != nil {
		t.Fatalf("localMedia.Delete failed: %v", err)
	}
	if _, err := l.Get(ctx, "portrait", "user1.jpg"); err == nil {
		t.Fatal("expected error getting deleted key")
	}
}

func TestConfigureMediaProvisionsStoreWhenBucketsEmpty(t *testing.T) {
	ctx := context.Background()

	// Default without buckets: should provision memoryMedia even if Development=false
	s := &Server{Config: Config{Development: false}}
	if err := s.configureMedia(ctx); err != nil {
		t.Fatalf("configureMedia failed: %v", err)
	}
	if s.Media == nil {
		t.Fatal("s.Media must not be nil when buckets are empty")
	}
	if _, ok := s.Media.(*memoryMedia); !ok {
		t.Fatalf("expected *memoryMedia, got %T", s.Media)
	}

	// With MEDIA_LOCAL_DIR: should provision localMedia
	localDir := t.TempDir()
	t.Setenv("MEDIA_LOCAL_DIR", localDir)
	sLocal := &Server{Config: Config{Development: false}}
	if err := sLocal.configureMedia(ctx); err != nil {
		t.Fatalf("configureMedia failed: %v", err)
	}
	if sLocal.Media == nil {
		t.Fatal("sLocal.Media must not be nil")
	}
	if _, ok := sLocal.Media.(*localMedia); !ok {
		t.Fatalf("expected *localMedia, got %T", sLocal.Media)
	}
}
