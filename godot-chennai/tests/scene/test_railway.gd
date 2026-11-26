extends TestCase
## The railway in the real game (translated from `apps/game/tests/railway.spec.ts`): board a
## timetabled train at Egmore through its doors, ride to Chetpet and step off onto the platform;
## a ride towards Tambaram ends at St. Thomas Mount; no money, no ticket; the cab drives off.
## Game time only: the timetable is skipped with `Railway.advance` (the Three.js `railAdvance`)
## and every wait is in physics frames.

const MAIN := preload("res://src/app/main.tscn")
const LOAD_FRAMES := 60 * 240
const LINE := "beach-tambaram"

var main: Main
var rail: Railway
var money: int = 100


func _start() -> bool:
	main = MAIN.instantiate()
	root.add_child(main)
	var reached := await wait_until(func() -> bool: return main.state == &"title" or main.state == &"failed", LOAD_FRAMES)
	if not reached or main.state == &"failed":
		return false
	main.play()
	rail = main.railway
	money = 100
	rail.money_of = func() -> int: return money
	rail.charge = func(rupees: int) -> void: money -= rupees
	return rail != null


func _stop(line: RailLine, name: String) -> int:
	for i in line.stops.size():
		if line.stops[i].name == name:
			return i
	return -1


## Teleports the player onto a stop's platform `u` metres along it and waits for the ground.
func _to_platform(line: RailLine, index: int, u: float) -> void:
	var stop := line.stops[index]
	var p := line.path.beside(stop.s + u, stop.side * RailRules.platform_offset(stop))
	WorldOrigin.recentre(p.x, p.y)
	main.rig.place(WorldOrigin.to_scene(p, line.height_at(stop.s) + RailRules.PLATFORM_HEIGHT + 0.1), line.path.at(stop.s).yaw)
	await main.world.wait_ready_around(p, -1.0, 60 * 60)
	await wait_until(func() -> bool: return rail.stations_view.shown() > 0, 60 * 30)
	await wait_physics_frames(30)


## A platform up on a viaduct: once its station's deck is built (solid), the player is put on it
## again (the first placing can fall through before the deck exists).
func _to_viaduct_platform(line: RailLine, index: int) -> void:
	await _to_platform(line, index, 0.0)
	var id := line.stops[index].id
	await wait_until(func() -> bool: return rail.stations_view.shown_station(id), 60 * 30)
	await wait_physics_frames(10)
	var stop := line.stops[index]
	var p := line.path.beside(stop.s, stop.side * RailRules.platform_offset(stop))
	main.rig.place(WorldOrigin.to_scene(p, line.height_at(stop.s) + RailRules.PLATFORM_HEIGHT + 0.1), line.path.at(stop.s).yaw)
	await wait_physics_frames(30)


## Skips the timetable to a few seconds before the next train reaches stop `index`, then waits
## (game time) for it to stand there.
func _train_at(line: RailLine, index: int) -> bool:
	# A train already standing there that leaves within 12 s is let go: the next one is waited for
	# (the timetable since G-461 can leave one at the end of its stop when a test starts).
	for t in line.trains(rail.clock):
		if t.state.stopped_at == index and t.state.dwell_left < 12.0:
			rail.advance(t.state.dwell_left + 1.0)
	var wait := line.next_arrival(index, rail.clock)
	if wait > 4.0:
		rail.advance(wait - 4.0)
	return await wait_until(func() -> bool:
		for t in line.trains(rail.clock):
			if t.state.stopped_at == index:
				return true
		return false, 60 * 30)


## Waits until the ridden train stands at stop `index` (skipping most of the way).
func _ride_to(line: RailLine, index: int) -> bool:
	var wait := line.next_arrival(index, rail.clock)
	var tr := line.train(rail.ride_departure, rail.clock)
	if tr != null and wait > 4.0:
		rail.advance(maxf(0.0, line.offset + rail.ride_departure * line.headway + line.profile.arrivals[index] - rail.clock - 4.0))
	return await wait_until(func() -> bool:
		var now := line.train(rail.ride_departure, rail.clock)
		return now != null and now.state.stopped_at == index, 60 * 40)


func test_board_at_egmore_ride_to_chetpet_and_step_off() -> bool:
	if not assert_true(await _start(), "the game reaches play with the railway"):
		return true
	var line := rail.network.line(LINE)
	var egmore := _stop(line, "Chennai Egmore")
	var chetpet := _stop(line, "Chetpet")
	await _to_platform(line, egmore, 20.0)
	assert_contains(rail.hud.info_title.text, "Chennai Egmore", "the HUD names the station")
	assert_true(await _train_at(line, egmore), "a train stands at Egmore")
	await wait_physics_frames(4)
	assert_true(rail.trains_view.drawn_cars >= 4, "its four cars are drawn")
	assert_true(rail.trains_view.solid_cars() >= 4, "and solid")
	assert_true(rail.tracks_view.shown_cells() > 0, "track chunks are drawn")
	# The doors on the platform side slide open shortly after the train stops.
	assert_true(await wait_until(func() -> bool: return rail.trains_view.nearest_doors > 0.8, 60 * 5), "doors open")
	var offer := rail.offer() as ActionCandidate
	assert_true(offer != null and offer.label == "BOARD THE TRAIN", "ACTION offers BOARD THE TRAIN")
	var before := main.rig.body.global_position
	offer.activate.call()
	assert_eq(rail.state, &"walk", "walks through the doorway")
	assert_eq(rail.ride_line.id, LINE, "on the line")
	assert_eq(rail.ride_line.destination(), "Tambaram", "to Tambaram")
	assert_eq(money, 95, "₹5 ticket")
	assert_eq(rail.fares, 5, "fares counted")
	await wait_physics_frames(2)
	assert_true(main.rig.body.global_position.distance_to(before) < 8.0, "a short walk, not a jump into the train")
	assert_true(await wait_until(func() -> bool: return rail.state == &"ride", 60 * 6), "inside after the walk")
	assert_false(main.rig.controls.visible, "walking controls hidden while riding")
	# The train leaves: skip most of the stop, then it pulls away (game time).
	rail.advance(28.0)
	var aboard := main.rig.body.global_position
	await wait_game_seconds(6.0)
	assert_true(main.rig.body.global_position.distance_to(aboard) > 3.0, "the rider moves with the train")
	assert_contains(rail.hud.info_line.text, "Next: Chetpet", "the HUD says the next stop")
	assert_false(rail.hud.step_off.visible, "STEP OFF hidden while moving")
	assert_true(rail.step_off() and rail.state == &"ride", "stepping off refused while moving")
	assert_true(await _ride_to(line, chetpet), "the train reaches Chetpet")
	await wait_physics_frames(60)
	assert_true(rail.hud.step_off.visible, "STEP OFF offered at the station")
	assert_true(rail.step_off(), "step off")
	assert_eq(rail.state, &"walk", "out through the doorway")
	assert_true(await wait_until(func() -> bool: return rail.state == &"foot", 60 * 6), "back on foot")
	await wait_game_seconds(1.0)
	var off := WorldOrigin.to_world(main.rig.body.global_position)
	var p := RailRules.platform_of(line, line.stops[chetpet])
	assert_true(off.distance_to(p.point()) < 56.0, "on the Chetpet platform (%.1f m from its centre)" % off.distance_to(p.point()))
	assert_true(main.rig.body.global_position.y > 0.7, "at platform height (%.2f)" % main.rig.body.global_position.y)
	assert_true(main.rig.body.is_on_floor(), "standing on it")
	assert_true(main.rig.controls.visible, "walking controls back")
	assert_eq(money, 95, "no second fare")
	return true


# CHANGED (G-461): the Beach line no longer leaves the map at St. Thomas Mount: it runs to its
# terminus at Tambaram. A ride towards the world's edge is now one towards Arakkonam, which ends
# at Sevvapet Road, the last station in the world; the ticket checks are as before.
func test_a_ride_towards_arakkonam_ends_at_the_last_station_in_the_world_and_no_money_no_ticket() -> bool:
	if not assert_true(await _start(), "the game reaches play with the railway"):
		return true
	var line := rail.network.line("central-arakkonam")
	var before := _stop(line, "Veppampattu")
	var last := _stop(line, "Sevvapet Road")
	assert_eq(last, line.stops.size() - 1, "Sevvapet Road is the last stop in the world")
	assert_true(line.to.beyond, "the line runs on beyond the world")
	await _to_platform(line, before, 0.0)
	assert_true(await _train_at(line, before), "a train stands at Veppampattu")
	await wait_physics_frames(60)
	money = 0
	assert_true(rail.board(), "BOARD pressed")
	assert_contains(rail.last_message, "A ticket costs ₹5", "no money, no ticket")
	assert_eq(rail.state, &"foot", "still on foot")
	money = 100
	assert_true(rail.board(), "BOARD with money")
	assert_true(await wait_until(func() -> bool: return rail.state == &"ride", 60 * 6), "riding")
	assert_eq(line.stops[line.train(rail.ride_departure, rail.clock).state.next_stop].name, "Sevvapet Road", "next stop")
	rail.advance(28.0)
	await _ride_to(line, last)
	# On arrival the ride ends by itself, with the reason on screen.
	assert_true(await wait_until(func() -> bool: return rail.state == &"foot", 60 * 10), "the ride ends at the last station in the world")
	assert_contains(rail.last_message, "continues to Arakkonam beyond the map", "the reason")
	var off := WorldOrigin.to_world(main.rig.body.global_position)
	assert_true(off.distance_to(RailRules.platform_of(line, line.stops[last]).point()) < 56.0, "on its platform")
	assert_true(main.rig.body.global_position.y > 0.7, "at platform height")
	return true


func test_a_ride_to_tambaram_ends_at_the_terminus() -> bool:
	if not assert_true(await _start(), "the game reaches play with the railway"):
		return true
	var line := rail.network.line(LINE)
	var sanatorium := _stop(line, "Tambaram Sanatorium")
	var tambaram := _stop(line, "Tambaram")
	assert_eq(tambaram, line.stops.size() - 1, "Tambaram is the terminus")
	assert_false(line.to.beyond, "in the world")
	await _to_platform(line, sanatorium, 0.0)
	assert_true(await _train_at(line, sanatorium), "a train stands at Tambaram Sanatorium")
	await wait_physics_frames(60)
	assert_true(rail.board(), "BOARD")
	assert_true(await wait_until(func() -> bool: return rail.state == &"ride", 60 * 6), "riding")
	rail.advance(28.0)
	await _ride_to(line, tambaram)
	assert_true(await wait_until(func() -> bool: return rail.state == &"foot", 60 * 10), "the ride ends at the terminus")
	assert_contains(rail.last_message, "terminates at Tambaram", "the reason")
	return true


## G-462: the Metro. Board a Blue Line train at Guindy on its viaduct (₹20, BOARD THE METRO, no
## cab), ride to Little Mount, where the ride ends because the line goes underground; boarding
## at Little Mount itself is refused for the same reason. Its cars are the Metro set.
func test_metro_ride_on_the_viaduct_ends_where_the_line_goes_underground() -> bool:
	if not assert_true(await _start(), "the game reaches play with the railway"):
		return true
	var line := rail.network.line("metro-blue-north")
	assert_true(line != null and line.is_metro(), "the Blue Line is a Metro line")
	var guindy := _stop(line, "Guindy Metro")
	var mount := _stop(line, "Little Mount")
	assert_true(line.height_at(line.stops[guindy].s) > 10.0, "Guindy is up on the viaduct")
	assert_true(line.underground_at(line.stops[mount + 1].s), "the next stop after Little Mount is underground")
	await _to_viaduct_platform(line, guindy)
	assert_true(main.rig.body.global_position.y > 10.0, "on the viaduct's platform (%.1f m)" % main.rig.body.global_position.y)
	assert_true(await _train_at(line, guindy), "a Metro train stands at Guindy")
	await wait_physics_frames(30)
	assert_true(rail.trains_view.drawn_cars >= 4, "its four cars are drawn")
	assert_true(rail.models.types.has("metro_cab") and rail.models.types.has("metro_car"), "the Metro cars are loaded")
	assert_true(await wait_until(func() -> bool: return rail.trains_view.nearest_doors > 0.8, 60 * 5), "doors open")
	var offer := rail.offer() as ActionCandidate
	assert_true(offer != null and offer.label == RailText.BOARD_METRO, "ACTION offers BOARD THE METRO")
	assert_true(rail.cab_offer_train() == null, "no cab on the Metro")
	assert_true(rail.board(), "BOARD")
	assert_eq(money, 100 - RailRules.METRO_FARE, "the Metro fare")
	assert_contains(rail.last_message, "Metro Blue Line", "the toast names the line")
	assert_true(await wait_until(func() -> bool: return rail.state == &"ride", 60 * 6), "riding")
	rail.advance(18.0)
	await _ride_to(line, mount)
	assert_true(await wait_until(func() -> bool: return rail.state == &"foot", 60 * 10), "the ride ends before the tunnel")
	assert_contains(rail.last_message, RailText.RIDE_UNDERGROUND, "the reason")
	assert_true(main.rig.body.global_position.y > 10.0, "on Little Mount's platform, up on the viaduct")
	assert_true(await _train_at(line, mount), "the next train stands at Little Mount")
	await wait_physics_frames(30)
	assert_true(rail.board(), "BOARD pressed")
	assert_eq(rail.state, &"foot", "refused")
	assert_contains(rail.last_message, RailText.UNDERGROUND_NEXT, "it goes underground before its next stop")
	return true


func test_drive_from_the_cab_out_of_egmore() -> bool:
	if not assert_true(await _start(), "the game reaches play with the railway"):
		return true
	var line := rail.network.line(LINE)
	var egmore := _stop(line, "Chennai Egmore")
	var half := rail.models.train_length(line.train_type) / 2.0
	await _to_platform(line, egmore, half - 4.0)
	assert_true(await _train_at(line, egmore), "a train stands at Egmore")
	await wait_physics_frames(30)
	assert_true(rail.cab_offer_train() != null, "DRIVE offered by the front cab")
	await wait_frames(2)
	assert_true(rail.hud.drive.visible, "the DRIVE button shows")
	assert_true(rail.take_cab(), "into the cab")
	assert_eq(rail.state, &"cab", "driving")
	var start := rail.cab.s
	# The doors interlock: P4 does nothing until they close.
	rail.hud.lever.set_notch(8, true)
	assert_eq(rail.cab.notch_name(), "P4", "the lever on the HUD moves the notch")
	await wait_game_seconds(1.0)
	assert_true(rail.cab.s - start < 0.05, "no power with the doors open")
	await wait_until(func() -> bool: return not rail.cab.doors_open, 60 * 12)
	await wait_game_seconds(8.0)
	assert_true(rail.cab.s - start > 15.0, "the train pulls away (%.1f m)" % (rail.cab.s - start))
	assert_true(rail.hud.dial.kmh > 5.0, "the speedometer shows it")
	assert_true(rail.taken.size() == 1, "the timetable's train is the player's now")
	rail.hud.emergency_pressed.emit()
	assert_eq(rail.cab.notch_name(), "EMG", "EMG on the HUD")
	await wait_game_seconds(12.0)
	assert_eq(rail.cab.v, 0.0, "the emergency brake stops it")
	return true


## The vigilance handle in the real cab (G-454): HOLD keeps the train running; let go at speed and the
## warning sounds, then the emergency brake stops the train.
func test_the_vigilance_handle_keeps_the_cab_running_or_stops_it() -> bool:
	if not assert_true(await _start(), "the game reaches play with the railway"):
		return true
	var line := rail.network.line(LINE)
	var egmore := _stop(line, "Chennai Egmore")
	var half := rail.models.train_length(line.train_type) / 2.0
	await _to_platform(line, egmore, half - 4.0)
	assert_true(await _train_at(line, egmore), "a train stands at Egmore")
	await wait_physics_frames(30)
	assert_true(rail.take_cab(), "into the cab")
	assert_true(rail.cab.vigilance_on, "the handle is in force in the player's cab")
	await wait_until(func() -> bool: return not rail.cab.doors_open, 60 * 12)
	rail.hud.lever.set_notch(6, true)
	await wait_frames(2)
	# A finger on HOLD (the HUD reads it every step).
	rail.hud.handle.press(true)
	await wait_game_seconds(20.0)
	assert_true(rail.cab.v > 4.0, "running with the handle held (%.1f m/s)" % rail.cab.v)
	assert_false(rail.cab.warning or rail.cab.tripped, "no warning while it is held")
	assert_eq(rail.hud.handle.text, "HOLD", "the button shows no countdown")
	var chimes: int = int(Sound.rail.played["rail_vigilance"])
	rail.hud.handle.press(false)
	await wait_game_seconds(CabDrive.VIGILANCE_LIMIT + 1.0)
	assert_true(rail.cab.warning and not rail.cab.tripped, "released for 8 s at speed: the warning")
	assert_eq(rail.hud.handle.text, "HOLD!", "the button says so")
	assert_true(int(Sound.rail.played["rail_vigilance"]) > chimes, "and the tone sounds")
	await wait_game_seconds(CabDrive.WARNING_GRACE + 1.0)
	assert_eq(rail.cab.notch_name(), "EMG", "ignored: the emergency brake")
	await wait_game_seconds(25.0)
	assert_eq(rail.cab.v, 0.0, "the train stands")
	assert_false(rail.cab.tripped, "and the brake is released at standstill")
	return true
