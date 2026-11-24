extends TestCase
## The vehicle, aircraft and train models against their manifests (decision G-37): every check
## of `ModelChecks` is one assertion (budgets, nodes, frame, wheels, hinges, textures).


func test_vehicle_models() -> bool:
	var checks := ModelChecks.new()
	checks.run(ProjectSettings.globalize_path("res://"))
	for i in checks.oks.size():
		check(checks.oks[i], checks.labels[i])
	check(checks.models >= 22, "at least 22 model manifests found (%d)" % checks.models)
	print("    model checks: %d/%d passed, %d models" % [checks.oks.size() - checks.failed(), checks.oks.size(), checks.models])
	return true
