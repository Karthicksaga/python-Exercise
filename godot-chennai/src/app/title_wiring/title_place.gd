class_name TitlePlace
extends RefCounted
## The real place name for the title chip (G-164): the nearest landmark within `LANDMARK_REACH`
## metres, else the nearest district of the tile's index within `DistrictIndex.DISTRICT_REACH`, else
## "" (the chip is hidden). Names only ever come from the world's data.

const LANDMARK_REACH := 700.0


static func name_at(source: WorldSource, point: Vector2) -> String:
	var best := ""
	var best_d := LANDMARK_REACH
	for l in source.get_landmarks():
		var d := l.position.distance_to(point)
		if d < best_d and l.name != "":
			best_d = d
			best = l.name
	if best != "":
		return best
	var index := source.index_at(point)
	if index == null:
		return ""
	var near := DistrictIndex.DISTRICT_REACH
	for p in index.districts:
		var d := p.position.distance_to(point)
		if d < near and p.name != "":
			near = d
			best = p.name
	return best
