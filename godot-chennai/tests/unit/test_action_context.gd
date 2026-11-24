extends TestCase
## The ACTION button's one small interface (G-176): systems register sources, the context picks
## the best candidate by priority, then nearest, and runs it.

class Source:
	extends RefCounted
	var offer: Variant = null
	func get_offer() -> Variant:
		return offer


func test_empty_context_offers_nothing() -> bool:
	var c := ActionContext.new()
	assert_eq(c.label(), "", "no label")
	assert_true(c.best() == null, "no candidate")
	assert_false(c.trigger(), "pressing does nothing")
	return true


func test_highest_priority_wins_then_the_nearest() -> bool:
	var c := ActionContext.new()
	var log: Array[String] = []
	c.add_source(func() -> Variant: return ActionCandidate.make("GET IN", ActionContext.P_BOARD, 1.0, func() -> void: log.append("get in")))
	c.add_source(func() -> Variant: return ActionCandidate.make("TALK", ActionContext.P_TALK, 3.0, func() -> void: log.append("talk")))
	assert_eq(c.label(), "TALK", "TALK outranks a car beside you")
	c.add_source(func() -> Variant: return [
		ActionCandidate.make("TALK", ActionContext.P_TALK, 1.5, func() -> void: log.append("talk near")),
		ActionCandidate.make("PICK UP", ActionContext.P_PICK_UP, 4.0, func() -> void: log.append("pick up"))])
	assert_eq(c.label(), "PICK UP", "PICK UP outranks TALK even if farther")
	assert_eq(c.candidates().size(), 4, "every candidate is listed, best first")
	assert_true(c.trigger(), "pressed")
	assert_eq(log, ["pick up"], "runs the best one only")
	var d := ActionContext.new()
	d.add_source(func() -> Variant: return ActionCandidate.make("TALK", ActionContext.P_TALK, 3.0, func() -> void: log.append("far")))
	d.add_source(func() -> Variant: return ActionCandidate.make("TALK", ActionContext.P_TALK, 1.0, func() -> void: log.append("near")))
	d.trigger()
	assert_eq(log[1], "near", "equal priority: the nearest")
	return true


func test_sources_come_and_go_and_dead_ones_are_dropped() -> bool:
	var c := ActionContext.new()
	var s := Source.new()
	var tok := c.add_source(s.get_offer)
	assert_eq(c.label(), "", "a source offering null shows nothing")
	s.offer = ActionCandidate.make("ENTER", ActionContext.P_ENTER, 2.0, func() -> void: pass)
	assert_eq(c.label(), "ENTER", "it appears when the source offers it")
	var changes: Array[String] = []
	c.best_changed.connect(func(l: String) -> void: changes.append(l))
	s.offer = null
	c.best()
	assert_eq(changes, [""], "best_changed fires when it goes")
	c.remove_source(tok)
	assert_eq(c.source_count(), 0, "removed")
	var gone := Source.new()
	c.add_source(gone.get_offer)
	gone = null
	assert_eq(c.label(), "", "a source whose owner was freed is skipped")
	assert_eq(c.source_count(), 0, "and forgotten")
	return true
