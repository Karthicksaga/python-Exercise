class_name LevelCrossing
extends RefCounted
## When a mapped level crossing's barriers are down (G-327): from the timetable, so a crossing far
## from the player agrees with the trains drawn near it. The barriers start down `CLOSE_AHEAD`
## seconds before a train's front reaches the road and rise once its rear is `CLEAR` metres past.
## The bell rings while they move and while they are down; road traffic stops at them while they
## are not fully up. Timings are estimates for a manned gate on a suburban line. Pure logic.

## Seconds before the train reaches the road that the barriers start to come down.
const CLOSE_AHEAD := 35.0
## Seconds the booms take to swing.
const SWING := 6.0
## The rear of the train must be this far past the road, metres.
const CLEAR := 8.0
## Half the length of a drawn train (four coaches), metres.
const HALF_TRAIN := 45.0


## How far down the barriers are, 0 up to 1 down, at railway time `clock`, for `crossing`.
## `extra`: other trains' distances along a line through it (the player's cab), line id -> s.
static func closed_amount(network: RailNetwork, crossing: RailNetwork.Crossing, clock: float, extra: Dictionary[String, float] = {}) -> float:
	var best := INF
	for id: String in crossing.lines.keys():
		var line := network.line(id)
		if line == null:
			continue
		var at: float = crossing.lines[id]
		best = minf(best, _until_clear(line, at, clock))
		if extra.has(id):
			var s: float = extra[id]
			if s - HALF_TRAIN <= at + CLEAR and s + HALF_TRAIN >= at - 250.0:
				best = 0.0
	if is_inf(best):
		return 0.0
	# best: seconds until the next train's front reaches the road (0 while one is on it).
	return clampf((CLOSE_AHEAD - best) / SWING, 0.0, 1.0)


## Seconds until a train of `line` covers the point `at` (0 while one is on it), looking up to
## CLOSE_AHEAD + SWING ahead; INF when none comes.
static func _until_clear(line: RailLine, at: float, clock: float) -> float:
	var look := CLOSE_AHEAD + SWING
	var best := INF
	for train in line.trains(clock + look):
		var later := train.state.s
		if later + HALF_TRAIN < at - 0.01:
			continue
		var now := line.train(train.departure, clock)
		var rear := -INF if now == null else now.state.s - HALF_TRAIN
		if rear > at + CLEAR:
			continue
		var front := -INF if now == null else now.state.s + HALF_TRAIN
		if front >= at:
			return 0.0
		# Step forward to when the front reaches the road (the run is a lookup; 1 s steps are enough).
		var t := 0.0
		while t <= look:
			var then := line.train(train.departure, clock + t)
			if then != null and then.state.s + HALF_TRAIN >= at:
				break
			t += 1.0
		best = minf(best, t)
	return best


## True while the bell rings: the barriers are moving or down.
static func bell(amount: float) -> bool:
	return amount > 0.0
