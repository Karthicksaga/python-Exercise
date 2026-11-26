class_name ActionCandidate
extends RefCounted
## Something the player could do right now with the context ACTION button: a label ("GET IN",
## "TALK", "PICK UP", "HAND OVER", "ENTER"), how urgent it is (`priority`, higher wins), how far it
## is (`distance`, metres; the nearer wins between equal priorities) and what to call when the
## button is pressed.

var label: String = ""
var priority: int = 0
var distance: float = 0.0
var activate: Callable = Callable()
## False: the button shows it dimmed (BUY with too little money) but still calls `activate`, so it
## can explain why (G-238).
var enabled: bool = true


static func make(label_: String, priority_: int, distance_: float, activate_: Callable) -> ActionCandidate:
	var c := ActionCandidate.new()
	c.label = label_
	c.priority = priority_
	c.distance = distance_
	c.activate = activate_
	return c
