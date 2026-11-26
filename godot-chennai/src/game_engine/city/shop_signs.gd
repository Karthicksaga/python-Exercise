class_name ShopSigns
extends RefCounted
## Painted shop signboards by category (G-192, replaces the ten invented signs of `shopSigns.ts`).
## A sign is a plain board with the category word in Tamil (top) and English (below), from
## `SignCategories`; nothing a shop is called is ever drawn (TD-18). Board colours follow
## Chennai's painted signs. Which category a shop front gets: the mapped one when OSM maps a
## shop, amenity or office at the building (`detail.bin`), else an everyday street shop picked by
## a stable hash and counted as estimated.

## The only English words a sign may say; a test checks the category table against it so no brand
## or business name slips in (TD-18).
const SIGN_WORDS: PackedStringArray = ["ATM", "BAKERY", "BANK", "BOOKS", "BUS", "CHURCH", "CINEMA", "CLINIC", "COFFEE", "COLLEGE", "DENTAL", "ELECTRONICS", "FISH", "FLOWERS", "FOOTWEAR", "FURNITURE", "GROCERY", "HALL", "HARDWARE", "HOSPITAL", "JEWELLERY", "LAUNDRY", "LIBRARY", "LODGE", "MARRIAGE", "MEAT", "MOBILE", "MOSQUE", "OFFICE", "PETROL", "PHARMACY", "POLICE", "POST", "RAILWAY", "REPAIR", "RESTAURANT", "SALON", "SCHOOL", "SHOP", "SNACKS", "STAND", "STATION", "STATIONERY", "SUPERMARKET", "SWEETS", "TAILOR", "TEA", "TEMPLE", "TEXTILES", "VEGETABLES", "VEHICLE"]

## Category id for the shop at `point` on `building`: the mapped category of the building, else
## the nearest mapped sign within `REACH` metres, else an estimated street shop.
const REACH := 14.0


static func pick(b: Building, wall: int, bay: int, point: Vector2, signs: Array[DetailTile.SignSpot], table: SignCategories) -> int:
	if b.detail_category > 0 and not table.is_public(b.detail_category):
		return b.detail_category
	var best := REACH * REACH
	var found := 0
	for s in signs:
		if table.is_public(s.category):
			continue
		var d2 := s.position.distance_squared_to(point)
		if d2 < best:
			best = d2
			found = s.category
	if found > 0:
		return found
	var ids := table.street_ids()
	return ids[floori(CityHash.unit(b.id, 331 + wall * 89 + bay) * ids.size())]
