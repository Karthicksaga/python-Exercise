package app

import "testing"

func TestDriverDemandBucketsRecentRequests(t *testing.T) {
	f := setup(t)
	rider, d := f.actor("rider", false), f.actor("rider", true)
	f.book(rider, f.quote(rider))
	code, body := f.call(d, "GET", "/api/drivers/demand", nil)
	require(t, code, 200)
	cells, _ := body["cells"].([]any)
	if len(cells) == 0 {
		t.Fatalf("a request in the driver's area must appear as a demand cell: %#v", body)
	}
	if code, _ = f.call(rider, "GET", "/api/drivers/demand", nil); code != 403 {
		t.Fatalf("riders must not read the demand map, got %d", code)
	}
}
