package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"sync"
	"time"

	"golang.org/x/oauth2/google"
)

type mediaStore interface {
	Put(context.Context, string, string, []byte) error
	Get(context.Context, string, string) ([]byte, error)
	Delete(context.Context, string, string) error
}
type cloudMedia struct {
	client         *http.Client
	portraits, kyc string
}

func (s *Server) configureMedia(ctx context.Context) error {
	if s.Config.ProfileBucket == "" && s.Config.KYCBucket == "" {
		if s.Config.Development {
			s.Media = &memoryMedia{objects: map[string][]byte{}}
		}
		return nil // Uploads fail closed until private storage is provisioned.
	}
	if s.Config.ProfileBucket == "" || s.Config.KYCBucket == "" || s.Config.ProfileBucket == s.Config.KYCBucket {
		return errors.New("configure distinct MEDIA_PROFILE_BUCKET and MEDIA_KYC_BUCKET")
	}
	client, e := google.DefaultClient(ctx, "https://www.googleapis.com/auth/devstorage.read_write")
	if e != nil {
		return errors.New("private media requires application default credentials")
	}
	client.Timeout = 8 * time.Second
	store := &cloudMedia{client: client, portraits: s.Config.ProfileBucket, kyc: s.Config.KYCBucket}
	// Fail startup rather than trusting an accidentally public/misconfigured bucket.
	for _, bucket := range []string{store.portraits, store.kyc} {
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://storage.googleapis.com/storage/v1/b/"+url.PathEscape(bucket)+"?fields=iamConfiguration", nil)
		res, err := client.Do(req)
		if err != nil {
			return errors.New("could not validate private media bucket")
		}
		var meta struct {
			IAM struct {
				PublicAccess string `json:"publicAccessPrevention"`
				Uniform      struct {
					Enabled bool `json:"enabled"`
				} `json:"uniformBucketLevelAccess"`
			} `json:"iamConfiguration"`
		}
		err = json.NewDecoder(io.LimitReader(res.Body, 64*1024)).Decode(&meta)
		res.Body.Close()
		if err != nil || res.StatusCode != 200 || !meta.IAM.Uniform.Enabled || meta.IAM.PublicAccess != "enforced" {
			return errors.New("media buckets require uniform bucket-level access and enforced public access prevention")
		}
	}
	s.Media = store
	return nil
}
func (m *cloudMedia) bucket(kind string) string {
	if kind == "kyc" {
		return m.kyc
	}
	return m.portraits
}
func (m *cloudMedia) Put(ctx context.Context, kind, key string, data []byte) error {
	endpoint := "https://storage.googleapis.com/upload/storage/v1/b/" + url.PathEscape(m.bucket(kind)) + "/o?uploadType=media&ifGenerationMatch=0&name=" + url.QueryEscape(key)
	req, e := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(data))
	if e != nil {
		return e
	}
	req.Header.Set("Content-Type", "image/jpeg")
	res, e := m.client.Do(req)
	if e != nil {
		return errors.New("private storage unavailable")
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		return fmt.Errorf("private storage upload status %d", res.StatusCode)
	}
	return nil
}
func (m *cloudMedia) Get(ctx context.Context, kind, key string) ([]byte, error) {
	req, e := http.NewRequestWithContext(ctx, "GET", "https://storage.googleapis.com/storage/v1/b/"+url.PathEscape(m.bucket(kind))+"/o/"+url.PathEscape(key)+"?alt=media", nil)
	if e != nil {
		return nil, e
	}
	res, e := m.client.Do(req)
	if e != nil {
		return nil, errors.New("private storage unavailable")
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, errors.New("private file unavailable")
	}
	data, e := io.ReadAll(io.LimitReader(res.Body, 2*1024*1024+1))
	if e != nil || len(data) > 2*1024*1024 {
		return nil, errors.New("invalid private file size")
	}
	return data, nil
}
func (m *cloudMedia) Delete(ctx context.Context, kind, key string) error {
	req, e := http.NewRequestWithContext(ctx, "DELETE", "https://storage.googleapis.com/storage/v1/b/"+url.PathEscape(m.bucket(kind))+"/o/"+url.PathEscape(key), nil)
	if e != nil {
		return e
	}
	res, e := m.client.Do(req)
	if e != nil {
		return errors.New("private storage unavailable")
	}
	defer res.Body.Close()
	if res.StatusCode != 204 && res.StatusCode != 404 {
		return errors.New("private file deletion failed")
	}
	return nil
}

// Disposable development adapter only: never writes real KYC to the repository,
// container filesystem, database, or public URLs. Restarting loses demo images.
type memoryMedia struct {
	mu      sync.RWMutex
	objects map[string][]byte
}

func (m *memoryMedia) Put(_ context.Context, kind, key string, b []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[kind+":"+key] = bytes.Clone(b)
	return nil
}
func (m *memoryMedia) Get(_ context.Context, kind, key string) ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	b, ok := m.objects[kind+":"+key]
	if !ok {
		return nil, errors.New("demo image expired; upload again")
	}
	return bytes.Clone(b), nil
}
func (m *memoryMedia) Delete(_ context.Context, kind, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.objects, kind+":"+key)
	return nil
}

func (s *Server) storePrivateMedia(ctx context.Context, kind string, data []byte) (string, error) {
	if s.Media == nil {
		return "", errors.New("private media storage is not configured")
	}
	key := randomToken() + ".jpg"
	sum := sha256.Sum256(data)
	// Durable inventory is created first. Failed/replaced uploads are garbage-collected.
	_, e := s.DB.Exec(ctx, "INSERT INTO media_objects(object_key,kind,byte_size,sha256) VALUES($1,$2,$3,$4)", key, kind, len(data), hex.EncodeToString(sum[:]))
	if e != nil {
		return "", e
	}
	if e = s.Media.Put(ctx, kind, key, data); e != nil {
		return "", e
	}
	return key, nil
}
func (s *Server) readPrivateMedia(ctx context.Context, kind, key string) ([]byte, error) {
	if s.Media == nil {
		return nil, errors.New("private media storage is not configured")
	}
	b, e := s.Media.Get(ctx, kind, key)
	if e != nil {
		return nil, e
	}
	var size int
	var hash string
	if e = s.DB.QueryRow(ctx, "SELECT byte_size,sha256 FROM media_objects WHERE object_key=$1 AND kind=$2", key, kind).Scan(&size, &hash); e != nil {
		return nil, e
	}
	sum := sha256.Sum256(b)
	if len(b) != size || hex.EncodeToString(sum[:]) != hash {
		return nil, errors.New("private file integrity check failed")
	}
	return b, nil
}

// Cleanup is bounded and retryable. Active/reviewed evidence is never aged out
// blindly: its retention requires the operator's approved jurisdiction policy.
func (s *Server) CleanupMedia(ctx context.Context) error {
	if s.Media == nil {
		return nil
	}
	// Unsubmitted KYC expires after 30 days of application inactivity. Never
	// expire approved/pending driver evidence through this draft-only rule.
	_, e := s.DB.Exec(ctx, `DELETE FROM driver_documents d WHERE d.updated_at<now()-interval '30 days'
      AND NOT EXISTS(SELECT 1 FROM drivers WHERE user_id=d.account_id)
      AND NOT EXISTS(SELECT 1 FROM driver_application_drafts a WHERE a.account_id=d.account_id AND a.updated_at>now()-interval '30 days')`)
	if e != nil {
		return e
	}
	rows, e := s.DB.Query(ctx, `SELECT object_key,kind FROM media_objects m WHERE created_at<now()-interval '24 hours'
 AND NOT EXISTS(SELECT 1 FROM profile_photos p WHERE p.object_key=m.object_key)
 AND NOT EXISTS(SELECT 1 FROM driver_documents d WHERE d.object_key=m.object_key) LIMIT 50`)
	if e != nil {
		return e
	}
	type object struct{ key, kind string }
	var objects []object
	for rows.Next() {
		var o object
		if e = rows.Scan(&o.key, &o.kind); e != nil {
			rows.Close()
			return e
		}
		objects = append(objects, o)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	for _, o := range objects {
		if e = s.Media.Delete(ctx, o.kind, o.key); e != nil {
			return e
		}
		if _, e = s.DB.Exec(ctx, "DELETE FROM media_objects WHERE object_key=$1", o.key); e != nil {
			return e
		}
	}
	return nil
}

func (s *Server) RunMediaCleanup(ctx context.Context) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			job, cancel := context.WithTimeout(ctx, 30*time.Second)
			if e := s.CleanupMedia(job); e != nil {
				slog.Error("private media cleanup failed")
			}
			cancel()
		}
	}
}
