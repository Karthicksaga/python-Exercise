package app

// Flags are public capability indicators, not authorization. Each new feature
// remains disabled until its server implementation and rollout are enabled.
type FeatureFlags struct {
	HopCircle                bool `json:"hopCircle"`
	TransparentFareBreakdown bool `json:"transparentFareBreakdown"`
	SmartFareAgreement       bool `json:"smartFareAgreement"`
	HopCommute               bool `json:"hopCommute"`
	SmartRouteMatching       bool `json:"smartRouteMatching"`
	TamilVoiceBooking        bool `json:"tamilVoiceBooking"`
	HopAssist                bool `json:"hopAssist"`
	HopTrust                 bool `json:"hopTrust"`
	HopFareLock              bool `json:"hopFareLock"`
	HopFamily                bool `json:"hopFamily"`
}
