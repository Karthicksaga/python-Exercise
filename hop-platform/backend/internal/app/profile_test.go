package app

import "testing"

func TestRichProfile(t *testing.T) {
	f := setup(t)
	r := f.actor("rider", false)

	code, _ := f.call(r, "POST", "/api/profile", map[string]any{"name": "Asha K", "phone": "98765", "default_payment": "cash"})
	require(t, code, 400)
	code, _ = f.call(r, "POST", "/api/profile", map[string]any{"name": "Asha K", "birth_date": "2015-01-01"})
	require(t, code, 400)
	code, _ = f.call(r, "POST", "/api/profile", map[string]any{"name": "Asha K", "phone": "9876543210", "gender": "female", "birth_date": "1992-04-05", "avatar_color": "rose", "default_payment": "wallet", "default_vehicle": "auto"})
	require(t, code, 200)
	// A name-only update (older clients) must not wipe the other details.
	code, _ = f.call(r, "POST", "/api/profile", map[string]any{"name": "Asha Kumar"})
	require(t, code, 200)
	code, p := f.call(r, "GET", "/api/profile", nil)
	require(t, code, 200)
	d := p["details"].([]any)[0].(map[string]any)
	if d["name"] != "Asha Kumar" || d["phone"] != "9876543210" || d["default_payment"] != "wallet" || d["birth_date"] != "1992-04-05" {
		t.Fatalf("details lost: %v", d)
	}

	for i := 0; i < maxEmergencyContacts; i++ {
		code, _ = f.call(r, "POST", "/api/profile/contacts", map[string]any{"name": "Contact", "phone": "98000000" + string(rune('0'+i)) + "1", "relation": "Friend"})
		require(t, code, 201)
	}
	code, _ = f.call(r, "POST", "/api/profile/contacts", map[string]any{"name": "Extra", "phone": "9811111111"})
	require(t, code, 409)
	code, _ = f.call(r, "POST", "/api/profile/contacts", map[string]any{"name": "Bad", "phone": "123"})
	require(t, code, 400)

	code, ex := f.call(r, "GET", "/api/profile/export", nil)
	require(t, code, 200)
	if len(ex["emergency_contacts"].([]any)) != maxEmergencyContacts {
		t.Fatalf("export contacts: %v", ex["emergency_contacts"])
	}

	code, _ = f.call(r, "POST", "/api/profile/deletion", map[string]any{})
	require(t, code, 200)
	_, p = f.call(r, "GET", "/api/profile", nil)
	if p["details"].([]any)[0].(map[string]any)["deletion_requested_at"] == nil {
		t.Fatal("deletion not recorded")
	}
	code, _ = f.call(r, "POST", "/api/profile/deletion", map[string]any{"cancel": true})
	require(t, code, 200)
}
