package app

import (
	"crypto/hmac"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"net/http"

	"github.com/jackc/pgx/v5"
)

// Challenges are account-bound and purpose-separated from sign-in codes. Verifying a
// profile number never signs in to, merges, or transfers another account.
func (s *Server) requestProfilePhone(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Phone string `json:"phone"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !validPhone(in.Phone) {
		fail(w, 400, "Enter a valid 10-digit mobile number")
		return
	}
	uid, ctx := user(r).Account.ID, r.Context()
	if !s.limit(w, r, "profile-phone:"+uid, 5, 600) || !s.limit(w, r, "profile-phone-number:"+in.Phone, 5, 600) {
		return
	}
	if !s.smsConfigured() && !s.devSMS() {
		fail(w, 503, "SMS verification is not configured")
		return
	}
	var conflict, immutable bool
	if e := s.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM verified_phones WHERE phone=$2 AND account_id<>$1) OR EXISTS(SELECT 1 FROM accounts WHERE issuer='phone' AND subject=$2 AND id<>$1),
 EXISTS(SELECT 1 FROM accounts WHERE id=$1 AND issuer='phone' AND subject<>$2)`, uid, in.Phone).Scan(&conflict, &immutable); e != nil {
		dbError(w, e)
		return
	}
	if conflict {
		fail(w, 409, "This number cannot be linked. Use its existing sign-in or contact support.")
		return
	}
	if immutable {
		fail(w, 409, "Contact support to change the number used to sign in to this account.")
		return
	}
	n, e := rand.Int(rand.Reader, big.NewInt(1000000))
	if e != nil {
		fail(w, 500, "Could not generate code")
		return
	}
	code := fmt.Sprintf("%06d", n.Int64())
	hash := s.otpHash("profile:"+uid+":"+in.Phone, code)
	tag, e := s.DB.Exec(ctx, `INSERT INTO profile_phone_challenges(account_id,phone,code_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')
 ON CONFLICT(account_id) DO UPDATE SET phone=$2,code_hash=$3,attempts=0,created_at=now(),expires_at=excluded.expires_at
 WHERE profile_phone_challenges.created_at<now()-interval '30 seconds'`, uid, in.Phone, hash)
	if e != nil {
		dbError(w, e)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 429, "Wait 30 seconds before requesting another code")
		return
	}
	out := map[string]any{"ok": true, "expires_in": 600, "retry_after": 30}
	if s.smsConfigured() {
		if e = s.sendOTPSMS(ctx, in.Phone, code); e != nil {
			s.DB.Exec(ctx, "DELETE FROM profile_phone_challenges WHERE account_id=$1 AND code_hash=$2", uid, hash)
			fail(w, 502, "Could not send SMS; try again later")
			return
		}
	} else {
		out["dev_code"] = code
	}
	write(w, 200, out)
}

func (s *Server) verifyProfilePhone(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Phone string `json:"phone"`
		Code  string `json:"code"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !validPhone(in.Phone) || len(in.Code) != 6 {
		fail(w, 400, "Enter your mobile number and 6-digit code")
		return
	}
	uid, ctx := user(r).Account.ID, r.Context()
	if !s.limit(w, r, "profile-phone-verify:"+uid, 30, 600) {
		return
	}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(ctx)
	if e = lockJourney(ctx, tx, uid); e != nil {
		dbError(w, e)
		return
	}
	var phone, hash string
	var expired bool
	var attempts int
	e = tx.QueryRow(ctx, "SELECT phone,code_hash,expires_at<=now(),attempts FROM profile_phone_challenges WHERE account_id=$1 FOR UPDATE", uid).Scan(&phone, &hash, &expired, &attempts)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 400, "Request a new verification code")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	if expired || attempts >= 5 {
		if _, e = tx.Exec(ctx, "DELETE FROM profile_phone_challenges WHERE account_id=$1", uid); e == nil {
			e = tx.Commit(ctx)
		}
		if e != nil {
			dbError(w, e)
			return
		}
		fail(w, 400, "Code expired; request a new one")
		return
	}
	if phone != in.Phone || !hmac.Equal([]byte(hash), []byte(s.otpHash("profile:"+uid+":"+in.Phone, in.Code))) {
		if _, e = tx.Exec(ctx, "UPDATE profile_phone_challenges SET attempts=attempts+1 WHERE account_id=$1", uid); e == nil {
			e = tx.Commit(ctx)
		}
		if e != nil {
			dbError(w, e)
			return
		}
		fail(w, 400, "Incorrect code")
		return
	}
	// Lock account rows consistently with login, then recheck immutable login identities.
	var blocked bool
	e = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM accounts WHERE issuer='phone' AND subject=$2 AND id<>$1) OR EXISTS(SELECT 1 FROM accounts WHERE id=$1 AND issuer='phone' AND subject<>$2)`, uid, phone).Scan(&blocked)
	if e != nil {
		dbError(w, e)
		return
	}
	if blocked {
		fail(w, 409, "This number cannot be linked. Contact support.")
		return
	}
	_, e = tx.Exec(ctx, `INSERT INTO verified_phones(account_id,phone) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET phone=$2,verified_at=now()`, uid, phone)
	if e == nil {
		_, e = tx.Exec(ctx, `INSERT INTO account_profiles(account_id,phone) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET phone=$2,updated_at=now()`, uid, phone)
	}
	if e == nil {
		_, e = tx.Exec(ctx, "DELETE FROM profile_phone_challenges WHERE account_id=$1", uid)
	}
	if e == nil {
		e = audit(ctx, tx, uid, "", "phone_verified", map[string]bool{"verified": true})
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}
