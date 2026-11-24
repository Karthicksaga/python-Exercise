## What a stage attempt measured, for its bonus goals (G-142). Filled by `MissionRunner`.
class_name MissionStats
extends RefCounted

## Game seconds since the stage (or the retry) began; the clock of a timed objective at the end.
var seconds := 0.0
var seconds_left := -1.0
var damage_taken := 0
var max_wanted := 0
var horns_in_quiet_zone := 0
var stability_lowest := 100.0
var suspicion_peak := 0.0
var retries := 0
var hazard_seconds := 0.0
