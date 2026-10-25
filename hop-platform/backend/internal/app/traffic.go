package app

import (
	"math"
	"time"
)

// trafficAdjustDuration converts raw free-flow road engine seconds (e.g. from OSRM) into realistic
// urban and highway travel duration.
// In real-world urban traffic (e.g., Bengaluru, Chennai, Mumbai, Delhi), average vehicle speeds are
// heavily affected by congestion, traffic lights, intersections, and vehicle speed governor limits.
// Raw OSRM calculates theoretical empty-road travel times at maximum speed limits (e.g., 50-80 km/h),
// which produces unrealistically short estimates like 18 minutes for 14 km (~47 km/h average speed).
// This function calibrates duration based on realistic urban vehicle speeds, time-of-day traffic index,
// and intersection delays.
func trafficAdjustDuration(meters float64, osrmDuration float64, vehicleCategory string, isOutstation bool) int64 {
	if meters <= 50 {
		return 30
	}

	// Outstation trips are predominantly on national highways / expressways (60-75 km/h average).
	if isOutstation && meters >= 40000 {
		highwaySec := int64(math.Ceil(meters / 18.0)) // ~65 km/h
		if osrmDuration > 0 {
			highwaySec = max(highwaySec, int64(math.Ceil(osrmDuration*1.15)))
		}
		return max(60, highwaySec)
	}

	// 1. Base average urban speed in meters/second under typical moving conditions:
	// - Bike: ~25.0 km/h (6.94 m/s) - agile, lane filtering
	// - Car / Cab: ~21.6 km/h (6.00 m/s) - standard cab, lane queues, signal stops
	// - Auto: ~19.0 km/h (5.28 m/s) - speed governed (~40 km/h top), frequent passenger slow-downs
	baseSpeed := 6.00
	switch vehicleCategory {
	case "auto":
		baseSpeed = 5.28
	case "bike", "scooter":
		baseSpeed = 6.94
	case "comfort", "prime", "suv", "electric":
		baseSpeed = 5.80
	}

	// 2. Time-of-day traffic congestion index (in IST / Asia/Kolkata):
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		loc = time.FixedZone("IST", 5*3600+1800)
	}
	now := time.Now().In(loc)
	hourFloat := float64(now.Hour()) + float64(now.Minute())/60.0

	trafficFactor := 1.05 // default daytime traffic factor
	if hourFloat >= 8.5 && hourFloat <= 11.5 {
		// Morning peak rush hour (08:30 - 11:30)
		trafficFactor = 1.25
	} else if hourFloat >= 17.0 && hourFloat <= 21.5 {
		// Evening peak rush hour (17:00 - 21:30)
		trafficFactor = 1.30
	} else if hourFloat >= 23.0 || hourFloat < 6.0 {
		// Late night light traffic (23:00 - 06:00)
		trafficFactor = 0.82
	} else if hourFloat >= 21.5 && hourFloat < 23.0 {
		// Post-peak late evening
		trafficFactor = 0.95
	}

	// 3. Urban intersection and traffic signals delay:
	// City driving encounters signals/junctions every ~800m - 1km (~18s delay per km).
	km := meters / 1000.0
	signalsDelay := km * 18.0
	if vehicleCategory == "bike" || vehicleCategory == "scooter" {
		signalsDelay = km * 12.0
	}
	maneuverBuffer := 40.0 // buffer for starting, turning, and arrival maneuvers

	// 4. Compute realistic urban driving duration
	effectiveSpeed := baseSpeed / trafficFactor
	driveSeconds := meters / effectiveSpeed
	cityDuration := driveSeconds + signalsDelay + maneuverBuffer

	// City road traffic is typically 1.7x - 2.1x free-flow theoretical OSRM time.
	if osrmDuration > 0 {
		osrmAdjusted := osrmDuration * 1.85 * trafficFactor
		if osrmAdjusted > cityDuration {
			cityDuration = osrmAdjusted
		}
	}

	return int64(math.Ceil(cityDuration))
}
