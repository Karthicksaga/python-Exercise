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


## Skips the timetable to a few seconds before the next train reaches stop `index`, then waits
## (game time) for it to stand there.
func _train_at(line: RailLine, index: int) -> bool:
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


func test_a_ride_towards_tambaram_ends_at_st_thomas_mount_and_no_money_no_ticket() -> bool:
	if not assert_true(await _start(), "the game reaches play with the railway"):
		return true
	var line := rail.network.line(LINE)
	var guindy := _stop(line, "Guindy")
	var mount := _stop(line, "St. Thomas Mount")
	await _to_platform(line, guindy, 0.0)
	assert_true(await _train_at(line, guindy), "a train stands at Guindy")
	await wait_physics_frames(60)
	money = 0
	assert_true(rail.board(), "BOARD pressed")
	assert_contains(rail.last_message, "A ticket costs ₹5", "no money, no ticket")
	assert_eq(rail.state, &"foot", "still on foot")
	money = 100
	assert_true(rail.board(), "BOARD with money")
	assert_true(await wait_until(func() -> bool: return rail.state == &"ride", 60 * 6), "riding")
	assert_eq(line.stops[line.train(rail.ride_departure, rail.clock).state.next_stop].name, "St. Thomas Mount", "next stop")
	rail.advance(28.0)
	await _ride_to(line, mount)
	# On arrival the ride ends by itself, with the reason on screen.
	assert_true(await wait_until(func() -> bool: return rail.state == &"foot", 60 * 10), "the ride ends at the last station on the map")
	assert_contains(rail.last_message, "continues to Tambaram beyond the map", "the reason")
	var off := WorldOrigin.to_world(main.rig.body.global_position)
	assert_true(off.distance_to(RailRules.platform_of(line, line.stops[mount]).point()) < 56.0, "on its platform")
	assert_true(main.rig.body.global_position.y > 0.7, "at platform height")
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
