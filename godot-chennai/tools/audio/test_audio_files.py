#!/usr/bin/env python3
"""Measures the shipped sound files again, from scratch, and compares them with the manifest
(decision G-371): the stored `metrics` are what the GDScript tests hold to their limits, so they
must be what the files really are. Needs ffmpeg and numpy.

    python3 godot-chennai/tools/audio/test_audio_files.py
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audio_dsp as dsp  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MANIFEST = json.load(open(os.path.join(ROOT, "assets", "audio", "manifest.json")))["files"]


class AudioFiles(unittest.TestCase):
    def rows(self):
        for pid, row in MANIFEST.items():
            if "metrics" in row:
                yield pid, row

    def test_stored_measurements_are_what_the_files_measure(self):
        n = 0
        for pid, row in self.rows():
            now = dsp.measure(os.path.join(ROOT, row["path"].replace("res://", "")))
            m = row["metrics"]
            self.assertEqual(now["sha256"], m["sha256"], pid + ": file changed since measured (run measure_manifest.py)")
            for k, tol in (("rms_db", 0.1), ("peak_db", 0.1), ("lufs", 0.2), ("loop_jump", 0.1)):
                self.assertAlmostEqual(now[k], m[k], delta=tol, msg="%s %s" % (pid, k))
            n += 1
        self.assertGreater(n, 30)

    def test_limits(self):
        for pid, row in self.rows():
            m = row["metrics"]
            self.assertEqual(m["channels"], 1, pid + " is mono")
            self.assertLessEqual(m["peak_db"], -1.0, pid + " clips")
            if row.get("loop"):
                self.assertLessEqual(m["loop_jump"], 5.0, pid + " clicks at the loop point")
            if row.get("normalised", "").startswith("-16 LUFS") and "peak limited" not in row["normalised"]:
                self.assertAlmostEqual(m["lufs"], -16.0, delta=3.0, msg=pid)

    def test_every_phase6_file_is_listed_in_the_licence_table(self):
        with open(os.path.join(ROOT, "assets", "LICENSES.md")) as fh:
            text = fh.read()
        for pid, row in MANIFEST.items():
            rel = row["path"].replace("res://", "")
            if "/rec/" in rel or "/synthetic/" in rel:
                self.assertIn("`%s`" % rel, text, pid)
            self.assertTrue(row["licence"].startswith(("CC0", "CC-BY", "Public domain")), pid)
            for bad in ("-SA", "-NC", "-ND"):
                self.assertNotIn(bad, row["licence"], pid)


if __name__ == "__main__":
    unittest.main()
