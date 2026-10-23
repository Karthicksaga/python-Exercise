package main

import "testing"

func TestStartupMigrationsOptIn(t *testing.T) {
	for _, tc := range []struct {
		name, value   string
		want, invalid bool
	}{
		{name: "default disabled"},
		{name: "explicitly disabled", value: "false"},
		{name: "enabled", value: "true", want: true},
		{name: "configuration typo rejected", value: "tru", invalid: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("MIGRATE_ON_START", tc.value)
			got, err := startupMigrationsEnabled()
			if got != tc.want || (err != nil) != tc.invalid {
				t.Fatalf("enabled=%v error=%v, want enabled=%v invalid=%v", got, err, tc.want, tc.invalid)
			}
		})
	}
}
