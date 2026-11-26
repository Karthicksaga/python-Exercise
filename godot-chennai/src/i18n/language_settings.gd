class_name LanguageSettings
extends RefCounted
## The Language setting (decision G-441): English, தமிழ், or Both (Tamil above English). Saved in
## the save file's own section `chennai-language-v1` like the control settings (`SaveStore` keeps
## unknown sections). `set_mode` saves, switches `Tr` and so every open screen at once.
##
## Pure data and persistence, no nodes.

signal changed

const SECTION := "chennai-language-v1"
const VERSION := 1
## What the setting shows for each mode: the same in every language, so a reader who cannot read
## the current one can still find their own.
const NAMES: Array[String] = ["English", "தமிழ்", "தமிழ் + English"]
const IDS: Array[String] = ["en", "ta", "both"]

var mode: Tr.Mode = Tr.Mode.ENGLISH
## Where it is saved; tests give their own.
var path: String = SaveStore.DEFAULT_PATH

static var _shared: LanguageSettings = null


## The one instance the game uses, loaded from the save file on first use.
static func shared() -> LanguageSettings:
	if _shared == null:
		_shared = LanguageSettings.new()
		_shared.load_saved()
	return _shared


## Forgets the shared instance (tests).
static func reset_shared() -> void:
	_shared = null


static func name_of(m: Tr.Mode) -> String:
	return NAMES[clampi(int(m), 0, NAMES.size() - 1)]


func to_dict() -> Dictionary:
	return {"version": VERSION, "mode": IDS[clampi(int(mode), 0, IDS.size() - 1)]}


## A missing, wrong-typed or unknown value keeps English.
func from_dict(d: Dictionary) -> void:
	var i := IDS.find(str(d.get("mode", "en")))
	mode = (i if i >= 0 else 0) as Tr.Mode


func load_saved() -> void:
	var v: Variant = SaveStore.new(path).read().section(SECTION)
	if v is Dictionary:
		from_dict(v as Dictionary)


func save() -> void:
	var store := SaveStore.new(path).read()
	store.set_section(SECTION, to_dict())
	store.write()


## Pushes the saved mode into `Tr` (the game calls this once at start).
func apply() -> void:
	Tr.set_mode(mode)


## Changes the language: saved, applied, and announced to the screens that are open.
func set_mode(m: Tr.Mode) -> void:
	mode = m
	save()
	apply()
	changed.emit()


## The next mode in the cycle English → தமிழ் → Both, for the one-button rows.
func next() -> void:
	set_mode(((int(mode) + 1) % IDS.size()) as Tr.Mode)


## The settings row's text: `Language: English` and its Tamil.
func label() -> String:
	return Tr.t("set.language", [name_of(mode)])
