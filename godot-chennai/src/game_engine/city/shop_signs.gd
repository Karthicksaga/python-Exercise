class_name ShopSigns
extends RefCounted
## Painted shop signboards (`shopSigns.ts`). Everything is invented: the Tamil lines are ordinary
## words for kinds of shops; the two that read like names ("புது ஸ்டோர்ஸ்" = "New Stores",
## "நிலா டிபன் சென்டர்" = "Moon tiffin centre") are generic made-up patterns, not real
## businesses. No brand or chain names (TD-18). Board colours follow Chennai's painted signs.

const SIGNS: Array[Dictionary] = [
	{"tamil": "மளிகைக் கடை", "english": "GROCERY & PROVISIONS", "board": "#f6c923", "ink": "#b3161b", "trim": "#1d5fa8", "wide": true},
	{"tamil": "சைவ உணவகம்", "english": "VEG MEALS · TIFFIN", "board": "#1f7a3a", "ink": "#fff7d6", "trim": "#f2c230", "wide": true},
	{"tamil": "துணிக்கடை", "english": "TEXTILES & READYMADES", "board": "#1d4fa0", "ink": "#ffffff", "trim": "#e83f6f", "wide": true},
	{"tamil": "நிலா டிபன் சென்டர்", "english": "NILA TIFFIN CENTRE", "board": "#c8302c", "ink": "#fff2a8", "trim": "#ffffff", "wide": true},
	{"tamil": "மருந்தகம்", "english": "MEDICALS", "board": "#ffffff", "ink": "#0f7a3c", "trim": "#0f7a3c", "wide": false},
	{"tamil": "தேநீர் கடை", "english": "TEA · COFFEE", "board": "#e8742a", "ink": "#ffffff", "trim": "#5a2a12", "wide": false},
	{"tamil": "புது ஸ்டோர்ஸ்", "english": "NEW STORES", "board": "#7a2f8f", "ink": "#ffe36b", "trim": "#ffe36b", "wide": false},
	{"tamil": "பூக்கடை", "english": "FLOWERS", "board": "#f4e6c8", "ink": "#c2185b", "trim": "#2e7d32", "wide": false},
	{"tamil": "காலணிகள்", "english": "FOOTWEAR", "board": "#1b1b1b", "ink": "#ffd54a", "trim": "#ffd54a", "wide": false},
	{"tamil": "கைபேசி சேவை", "english": "MOBILE SERVICE", "board": "#18a0c8", "ink": "#ffffff", "trim": "#0b3d5c", "wide": false},
]

## Generic English shop words the signs may use; a test checks every sign against it so no
## brand slips in.
const SIGN_WORDS: PackedStringArray = [
	"GROCERY", "PROVISIONS", "VEG", "MEALS", "TIFFIN", "TEXTILES", "READYMADES", "NILA", "CENTRE",
	"MEDICALS", "TEA", "COFFEE", "NEW", "STORES", "FLOWERS", "FOOTWEAR", "MOBILE", "SERVICE",
]


static func wide() -> Array[int]:
	var out: Array[int] = []
	for i in SIGNS.size():
		if SIGNS[i]["wide"]:
			out.append(i)
	return out


static func narrow() -> Array[int]:
	var out: Array[int] = []
	for i in SIGNS.size():
		if not SIGNS[i]["wide"]:
			out.append(i)
	return out
