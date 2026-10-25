package app

import (
	"testing"
)

func TestTrafficAdjustDuration(t *testing.T) {
	// 14 kilometers (14,000 meters) with raw free-flow OSRM time of ~1080s (18 min)
	meters14k := 14000.0
	osrmDuration18m := 1080.0

	// Test car duration
	carSec := trafficAdjustDuration(meters14k, osrmDuration18m, "car", false)
	carMin := float64(carSec) / 60.0
	if carMin < 35 || carMin > 60 {
		t.Fatalf("14 km car trip should take between 35 and 60 minutes in city traffic, got %.1f minutes (%d seconds)", carMin, carSec)
	}

	// Test auto duration (should be slightly slower than car due to speed governors)
	autoSec := trafficAdjustDuration(meters14k, osrmDuration18m, "auto", false)
	autoMin := float64(autoSec) / 60.0
	if autoMin < 38 || autoMin > 65 {
		t.Fatalf("14 km auto trip should take between 38 and 65 minutes in city traffic, got %.1f minutes (%d seconds)", autoMin, autoSec)
	}

	// Test bike duration (should be faster due to agility in traffic)
	bikeSec := trafficAdjustDuration(meters14k, osrmDuration18m, "bike", false)
	bikeMin := float64(bikeSec) / 60.0
	if bikeMin < 28 || bikeMin > 50 {
		t.Fatalf("14 km bike trip should take between 28 and 50 minutes in city traffic, got %.1f minutes (%d seconds)", bikeMin, bikeSec)
	}

	// Short trip: 3 km (3,000 meters)
	shortSec := trafficAdjustDuration(3000.0, 300.0, "car", false)
	shortMin := float64(shortSec) / 60.0
	if shortMin < 8 || shortMin > 16 {
		t.Fatalf("3 km trip should take between 8 and 16 minutes, got %.1f minutes", shortMin)
	}

	// Outstation trip: 100 km (100,000 meters)
	outSec := trafficAdjustDuration(100000.0, 4800.0, "car", true)
	outMin := float64(outSec) / 60.0
	if outMin < 80 || outMin > 120 {
		t.Fatalf("100 km highway trip should take around 80-120 minutes, got %.1f minutes", outMin)
	}
}
