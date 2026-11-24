class_name HomeRules
extends RefCounted
## The rules of being at home (G-234). A home is a peace zone: no combat, no weapons drawn, no
## wanted level, and a safe place to save. The street outside is the game's; the door is where
## the rules change. Pure.

## Inside a home nobody fights, the police do not look, and no weapon is carried in.
const PEACE_ZONE := true
const COMBAT_ALLOWED := false
const WEAPONS_ALLOWED := false
const WANTED_ACTIVE := false
## SLEEP saves the game; so does the home being the safe save point.
const SAFE_SAVE_POINT := true


## "" when the player may go in, else the reason (shown on the disabled ENTER button's toast):
## the police are looking for them, or they are driving.
static func entry_problem(wanted_stars: float, on_foot: bool) -> String:
	if not on_foot:
		return "Park your vehicle first."
	if wanted_stars > 0.0:
		return "The police are watching. Lose them first."
	return ""


static func entry_problem_ta(wanted_stars: float, on_foot: bool) -> String:
	if not on_foot:
		return "முதலில் வாகனத்தை நிறுத்துங்கள்."
	if wanted_stars > 0.0:
		return "போலீஸ் கண்காணிக்கிறது. முதலில் தப்பிக்கவும்."
	return ""
