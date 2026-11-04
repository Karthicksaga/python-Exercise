package app

import "testing"

// Ride requests ring on their own channel and expire with the offer; other alerts don't expire early.
func TestAndroidDeliveryRingsRideRequestsAndExpiresThem(t *testing.T) {
	offer := androidDelivery(pushMessage{Tag: "offer-123"})
	note := offer["notification"].(map[string]any)
	if offer["ttl"] != "30s" || note["channel_id"] != "hop-ride-requests" || offer["priority"] != "high" {
		t.Fatalf("ride request delivery = %v", offer)
	}
	other := androidDelivery(pushMessage{Tag: "ride-123"})
	if _, ok := other["ttl"]; ok || other["notification"].(map[string]string)["channel_id"] != "hop-rides" {
		t.Fatalf("trip update delivery = %v", other)
	}
}

func TestNativePushNeedsAValidProjectWithoutAKeyFile(t *testing.T) {
	s := &Server{Config: Config{FCMProject: "Bad Project!"}}
	if e := s.configureNativePush(t.Context()); e == nil {
		t.Fatal("an invalid FCM_PROJECT_ID must be rejected")
	}
	s = &Server{}
	if e := s.configureNativePush(t.Context()); e != nil || s.FCM != nil {
		t.Fatalf("no Firebase settings means push stays off, got %v", e)
	}
}
