class_name TrCatalog
extends RefCounted
## One language's strings, read from a CSV file under `assets/i18n/` (decision G-440). The first
## row is the header: `key,text` (English) or `key,text,status` (Tamil). Quoted fields may hold
## commas, doubled quotes and newlines. Pure data: no engine translation state, so tests and tools
## read it directly.

const STATUS_REVIEWED := "reviewed"
const STATUS_UNREVIEWED := "needs native review"

## key → text, in file order.
var texts: Dictionary[String, String] = {}
## key → status (empty for a language without the column).
var status: Dictionary[String, String] = {}
## Keys that appear more than once in the file (the later row wins; the test fails on any).
var duplicates: PackedStringArray = PackedStringArray()
var error: String = ""


static func load_file(path: String) -> TrCatalog:
	var c := TrCatalog.new()
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		c.error = "cannot read %s" % path
		return c
	var header: PackedStringArray = f.get_csv_line()
	if header.size() < 2 or header[0] != "key" or header[1] != "text":
		c.error = "%s: the header must start with key,text" % path
		return c
	var has_status := header.size() >= 3 and header[2] == "status"
	while not f.eof_reached():
		var row: PackedStringArray = f.get_csv_line()
		if row.size() < 2 or row[0] == "":
			continue
		if c.texts.has(row[0]):
			c.duplicates.append(row[0])
		c.texts[row[0]] = row[1]
		if has_status and row.size() >= 3:
			c.status[row[0]] = row[2]
	return c


## Whether `key` is shown when only reviewed Tamil may ship.
func is_reviewed(key: String) -> bool:
	return status.get(key, "") == STATUS_REVIEWED


## The `{name}` and `{0}` placeholders of a text, sorted: what a translation must keep.
static func placeholders(text: String) -> PackedStringArray:
	var out: PackedStringArray = PackedStringArray()
	var rx := RegEx.new()
	rx.compile("\\{([A-Za-z0-9_]+)\\}")
	for m in rx.search_all(text):
		out.append(m.get_string(1))
	out.sort()
	return out
