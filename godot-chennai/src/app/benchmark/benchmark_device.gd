class_name BenchmarkDevice
extends RefCounted
## What the benchmark says about the device and the build (decision G-404): the model, GPU, memory,
## Godot, renderer and the build's commit, plus the phone's thermal state where Android lets an app
## read it. Godot has no thermal API; on Android the benchmark asks the platform through the
## `AndroidRuntime` singleton (PowerManager's thermal status and headroom, the battery's
## temperature from the sticky battery broadcast), then the kernel's battery file. Any of them can
## be refused on a given phone; then the field says "n/a". Not run on a phone from here: the owner's
## first benchmark shows which ones the POCO M6 Pro gives.

## The CI stamps the commit into this project setting before it exports (tools/stamp_build.py);
## a local run reads CHENNAI_BUILD_COMMIT, else says it is unstamped.
const COMMIT_SETTING := "application/config/build_commit"

## PowerManager.getCurrentThermalStatus() values (API 29).
const THERMAL_NAMES: Array[String] = ["none", "light", "moderate", "severe", "critical", "emergency", "shutdown"]


static func commit() -> String:
	var stamped := str(ProjectSettings.get_setting(COMMIT_SETTING, ""))
	if stamped != "":
		return stamped
	var env := OS.get_environment("CHENNAI_BUILD_COMMIT")
	if env == "":
		env = OS.get_environment("GITHUB_SHA")
	return env.left(12) if env != "" else "unstamped (local build)"


static func renderer() -> Dictionary:
	return {
		"method": RenderingServer.get_current_rendering_method(),
		"driver": RenderingServer.get_current_rendering_driver_name(),
		"gpu": RenderingServer.get_video_adapter_name(),
		"vendor": RenderingServer.get_video_adapter_vendor(),
		"api": RenderingServer.get_video_adapter_api_version(),
		"type": PerfWiring._adapter_type(),
	}


## "Mobile (Vulkan)" or "Compatibility (OpenGL)": the line the owner compares between the two APKs.
static func renderer_label() -> String:
	var m := RenderingServer.get_current_rendering_method()
	var name := "Compatibility" if m == "gl_compatibility" else ("Mobile" if m == "mobile" else m.capitalize())
	var driver := RenderingServer.get_current_rendering_driver_name()
	return "%s (%s)" % [name, "OpenGL" if driver.begins_with("opengl") else driver.capitalize()]


static func info() -> Dictionary:
	var mem: Variant = OS.get_memory_info().get("physical", 0)
	var bytes := int(mem) if (mem is int or mem is float) else 0
	var screen := DisplayServer.screen_get_size()
	var window := DisplayServer.window_get_size() if DisplayServer.get_name() != "headless" else Vector2i.ZERO
	return {
		"model": OS.get_model_name(),
		"os": "%s %s" % [OS.get_name(), OS.get_version()],
		"cpu": "%s x%d" % [OS.get_processor_name(), OS.get_processor_count()],
		"memory_gib": snappedf(bytes / 1073741824.0, 0.1),
		"screen": "%dx%d" % [maxi(screen.x, window.x), maxi(screen.y, window.y)],
		"godot": Engine.get_version_info().string,
		"version": str(ProjectSettings.get_setting("application/config/version", "")),
		"commit": commit(),
		"renderer": renderer_label(),
	}


## The thermal state now: {"status", "headroom", "battery_c", "source"}; "n/a" / -1 where unknown.
static func thermal() -> Dictionary:
	var out := {"status": "n/a", "headroom": -1.0, "battery_c": -1.0, "source": "none"}
	if OS.get_name() != "Android":
		return out
	var sources := PackedStringArray()
	if Engine.has_singleton("AndroidRuntime"):
		var rt: Object = Engine.get_singleton("AndroidRuntime")
		var ctx: Variant = rt.call(&"getApplicationContext") if rt.has_method(&"getApplicationContext") else null
		if ctx is Object and ctx != null:
			var context := ctx as Object
			var pm: Variant = context.call(&"getSystemService", "power")
			if pm is Object and pm != null:
				var status: Variant = (pm as Object).call(&"getCurrentThermalStatus")
				if status is int:
					out["status"] = THERMAL_NAMES[clampi(int(status), 0, THERMAL_NAMES.size() - 1)]
					sources.append("PowerManager")
				var head: Variant = (pm as Object).call(&"getThermalHeadroom", 10)
				if (head is float or head is int) and not is_nan(float(head)):
					out["headroom"] = snappedf(float(head), 0.01)
			out["battery_c"] = _battery_from_intent(context)
			if float(out["battery_c"]) >= 0.0:
				sources.append("battery broadcast")
	if float(out["battery_c"]) < 0.0:
		for path: String in ["/sys/class/power_supply/battery/temp", "/sys/class/power_supply/bms/temp"]:
			var f := FileAccess.open(path, FileAccess.READ)
			if f == null:
				continue
			var tenths := f.get_as_text().strip_edges()
			f.close()
			if tenths.is_valid_int():
				out["battery_c"] = int(tenths) / 10.0
				sources.append(path)
				break
	out["source"] = ", ".join(sources) if not sources.is_empty() else "none (the phone refused)"
	return out


## The battery's temperature (°C) from Android's sticky ACTION_BATTERY_CHANGED broadcast, -1 when
## the call is refused.
static func _battery_from_intent(context: Object) -> float:
	var wrapper: Object = Engine.get_singleton("JavaClassWrapper") if Engine.has_singleton("JavaClassWrapper") else null
	if wrapper == null:
		return -1.0
	var filter_class: Variant = wrapper.call(&"wrap", "android.content.IntentFilter")
	if not (filter_class is Object) or filter_class == null:
		return -1.0
	var filter: Variant = (filter_class as Object).call(&"IntentFilter", "android.intent.action.BATTERY_CHANGED")
	if not (filter is Object) or filter == null:
		return -1.0
	var intent: Variant = context.call(&"registerReceiver", null, filter)
	if not (intent is Object) or intent == null:
		return -1.0
	var tenths: Variant = (intent as Object).call(&"getIntExtra", "temperature", -1)
	return int(tenths) / 10.0 if tenths is int and int(tenths) >= 0 else -1.0


## One line for the card and the text file.
static func thermal_line(t: Dictionary) -> String:
	var parts := PackedStringArray()
	parts.append("thermal %s" % t.get("status", "n/a"))
	if float(t.get("headroom", -1.0)) >= 0.0:
		parts.append("headroom %.2f" % float(t["headroom"]))
	parts.append("battery %s" % ("%.1f °C" % float(t["battery_c"]) if float(t.get("battery_c", -1.0)) >= 0.0 else "n/a"))
	return ", ".join(parts)
