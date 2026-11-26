class_name TransitFare
extends RefCounted
## Bus tickets (decision G-215). The missions' fare table is reused: `ShareShift.share_fare`
## (a base fare plus so much a kilometre, the only distance fare in the rules) at `BUS_SHARE` of
## the share-auto price, rounded to a rupee and kept between `MIN_FARE` and `MAX_FARE`: a city bus
## is about half a share auto. A ticket is bought on boarding for the rest of the route (as a
## conductor sells to the destination; the player may alight earlier). All **estimates**, not a
## published tariff.

const BUS_SHARE := 0.5
const MIN_FARE := 5
const MAX_FARE := 30


## Rupees for a ride of `metres`.
static func ticket(metres: float) -> int:
	return clampi(roundi(ShareShift.share_fare(metres) * BUS_SHARE), MIN_FARE, MAX_FARE)


## Rupees from stop number `from_stop` of a route to its last stop.
static func ticket_on(route: TransitNetwork.Route, from_stop: int) -> int:
	if from_stop < 0 or from_stop >= route.stops.size():
		return MIN_FARE
	return ticket(route.length() - route.stop_at[from_stop])
