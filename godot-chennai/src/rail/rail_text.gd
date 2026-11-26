class_name RailText
extends RefCounted
## Every railway, Metro and map word the player reads that the rail extras added or touched (G-468), in
## one place until the i18n system (`Tr`, `assets/i18n/en.csv` + `ta.csv`, agent/godot-lang) is
## merged: then each constant becomes a key and `%` formats stay as they are. English only here;
## Tamil station names come from the data (OSM or the transliterations marked for review).

# Boarding (`RailRules.boarding`).
const NOT_STANDING := "The train is not standing here."
const DOORS_CLOSING := "The doors are closing."
const NEXT_BEYOND := "This train's next stop is beyond the map (towards %s)."
const TERMINATES := "This train terminates here."
const UNDERGROUND_NEXT := "This train goes underground before its next stop: board at a station on the viaduct."
const TICKET_COSTS := "A ticket costs ₹%d."

# Riding and the HUD (`Railway`).
const BOARD_TRAIN := "BOARD THE TRAIN"
const BOARD_METRO := "BOARD THE METRO"
const METRO_TICKET := "Metro %s Line to %s · ticket ₹%d · next: %s"
const RIDE_UNDERGROUND := "The line goes underground here: please step off."
const METRO_NO_CAB := "Metro trains run on automatic train operation: no cab to take."

# Maps (`MapRail`, the minimap and the full map's legend).
const MAP_RAIL := "Rail"
const MAP_RAIL_ON := "RAIL ON"
const MAP_RAIL_OFF := "RAIL OFF"
const LINE_SUBURBAN := "Suburban"
const LINE_MRTS := "MRTS"
const LINE_EXPRESS := "Express"
const LINE_METRO_BLUE := "Metro Blue"
const LINE_METRO_GREEN := "Metro Green"
const METRO_UNDERGROUND := "underground"
# The full map's labels (G-466): generic words, never a business's own name (TD-18).
const MAP_HOSPITAL := "Hospital"
const MAP_POLICE := "Police"
const MAP_BUS_STAND := "Bus stand"


## The Metro line's name for the player ("Blue", "Green").
static func metro_colour_name(metro_line: String) -> String:
	return "Blue" if metro_line == "blue" else ("Green" if metro_line == "green" else metro_line.capitalize())
