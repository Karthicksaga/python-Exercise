from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from street_imagery import validate as v
from street_imagery.cli import main

GOOD_IMAGE: dict[str, Any] = {"provider": "mapillary", "id": "T1", "sequence_id": "s", "captured_at": "2021-01-01T00:00:00Z", "creator": "u", "license": "CC-BY-SA-4.0",
                              "license_source": "provider_terms", "attribution": "Imagery © Mapillary contributors, CC BY-SA 4.0", "retrieved_at": "2026-11-25", "used_for": ["o1"]}
# TEST DATA: made-up ids to test the validators; the committed manifest is empty.
GOOD_OBS: dict[str, Any] = {"format": 1, "area": "t", "reviewed_by": "tester", "reviewed_on": "2026-11-25", "observations": [
    {"id": "o1", "category": "apartment", "location": {"lat": 13.08, "lng": 80.21}, "facts": [
        {"field": "floors", "value": 5, "status": "observed", "sources": [{"provider": "mapillary", "image_id": "T1"}]},
        {"field": "wall_colour", "value": "#D9C9A0", "status": "estimated", "basis": "general_knowledge", "basis_note": "typical"}]}]}


def manifest(*images: dict[str, Any]) -> dict[str, Any]:
    return {"format": 1, "images": list(images)}


def test_committed_street_ref_tree_is_valid() -> None:
    assert v.check_tree() == []


def test_manifest_rules() -> None:
    assert v.validate_manifest(manifest(GOOD_IMAGE)) == []
    bad = dict(GOOD_IMAGE, provider="google")
    assert any("never Google" in p for p in v.validate_manifest(manifest(bad)))
    assert any("duplicate" in p for p in v.validate_manifest(manifest(GOOD_IMAGE, GOOD_IMAGE)))
    assert any("attribution" in p for p in v.validate_manifest(manifest(dict(GOOD_IMAGE, attribution=""))))
    assert any("license " in p for p in v.validate_manifest(manifest(dict(GOOD_IMAGE, license="proprietary"))))
    assert any("image or to Google" in p for p in v.validate_manifest(manifest(dict(GOOD_IMAGE, page="https://x.example/a/photo.jpg"))))
    assert any("google" in p.lower() for p in v.validate_manifest(manifest(dict(GOOD_IMAGE, page="https://www.google.com/maps/@13,80"))))
    assert v.validate_manifest({"format": 2}) != []


def test_observation_rules() -> None:
    ids = v.manifest_ids(manifest(GOOD_IMAGE))
    assert v.validate_observations(GOOD_OBS, ids) == []
    o = copy.deepcopy(GOOD_OBS)
    o["observations"][0]["facts"][0]["sources"] = [{"provider": "mapillary", "image_id": "NOPE"}]
    assert any("not in the manifest" in p for p in v.validate_observations(o, ids))
    o = copy.deepcopy(GOOD_OBS)
    del o["observations"][0]["facts"][0]["sources"]
    assert any("non-empty 'sources'" in p for p in v.validate_observations(o, ids))
    o = copy.deepcopy(GOOD_OBS)
    o["observations"][0]["facts"][1]["basis_note"] = ""
    assert any("general_knowledge" in p for p in v.validate_observations(o, ids))
    o = copy.deepcopy(GOOD_OBS)
    o["observations"][0]["facts"][1]["value"] = "beige"
    assert any("#RRGGBB" in p for p in v.validate_observations(o, ids))
    o = copy.deepcopy(GOOD_OBS)
    o["reviewed_by"] = ""
    assert any("hand review" in p for p in v.validate_observations(o, ids))
    o = copy.deepcopy(GOOD_OBS)
    o["observations"][0]["facts"][0]["sources"] = [{"kind": "human_inspection", "note": "street view, human eyes only", "date": "2026-11-25"}]
    assert v.validate_observations(o, ids) == []
    o["observations"][0]["facts"][0]["sources"] = [{"kind": "human_inspection", "note": "n", "date": "d", "image_id": "123"}]
    assert any("no image id" in p for p in v.validate_observations(o, ids))
    o["observations"][0]["category"] = "castle"
    assert any("category" in p for p in v.validate_observations(o, ids))


def facades() -> dict[str, Any]:
    return json.loads((v.ROOT / "facade_categories.json").read_text(encoding="utf-8"))


def test_facade_categories_cover_the_seven_and_are_all_estimated() -> None:
    f = facades()
    assert [c["id"] for c in f["categories"]] == list(v.CATEGORIES)
    assert v.validate_facades(f) == []
    assert {fd["status"] for c in f["categories"] for fd in c["fields"].values()} == {"estimated"}  # nothing was observed: no imagery reached
    assert all(c["fields"][n]["value"] for c in f["categories"] for n in v.FACADE_FIELDS)


def test_facade_validator_catches_bad_data() -> None:
    f = facades()
    f["categories"][0]["fields"]["floors"]["value"] = {"min": 3, "max": 1}
    f["categories"][1]["fields"]["palette"]["value"][0]["hex"] = "red"
    f["categories"][2]["fields"]["balconies"]["value"]["probability"] = 2
    f["categories"][3]["fields"]["roofs"]["status"] = "observed"
    del f["categories"][4]["fields"]["gates"]
    f["categories"].pop()
    problems = v.validate_facades(f)
    for needle in ("floors", "palette", "balconies", "sources", "fields must be exactly", "categories must be exactly"):
        assert any(needle in p for p in problems), needle


def test_facade_observed_field_must_cite_manifest_ids() -> None:
    f = facades()
    fd = f["categories"][0]["fields"]["floors"]
    fd.update({"status": "observed", "sources": [{"provider": "mapillary", "image_id": "T1"}]})
    assert v.validate_facades(f, set()) != []
    assert v.validate_facades(f, {("mapillary", "T1")}) == []


def test_check_tree_rejects_image_files_and_uncited_manifest_rows(tmp_path: Path) -> None:
    root = tmp_path / "ref"
    (root / "observations").mkdir(parents=True)
    (root / "manifest.json").write_text(json.dumps(manifest(GOOD_IMAGE)))
    (root / "observations" / "a.json").write_text(json.dumps({"format": 1, "area": "t", "observations": []}))
    (root / "photo.jpg").write_bytes(b"x")
    problems = v.check_tree(root)
    assert any("never be stored" in p for p in problems) and any("no observation cites it" in p for p in problems)
    (root / "photo.jpg").unlink()
    (root / "observations" / "a.json").write_text(json.dumps(GOOD_OBS))
    assert v.check_tree(root) == []


def test_schema_files_agree_with_the_code() -> None:
    m = json.loads((v.ROOT / "manifest.schema.json").read_text())
    assert m["properties"]["images"]["items"]["properties"]["provider"]["enum"] == list(v.PROVIDERS)
    o = json.loads((v.ROOT / "observations.schema.json").read_text())
    assert o["properties"]["observations"]["items"]["properties"]["category"]["enum"] == list(v.CATEGORIES)
    fc = json.loads((v.ROOT / "facade_categories.schema.json").read_text())
    assert fc["properties"]["categories"]["items"]["properties"]["fields"]["required"] == list(v.FACADE_FIELDS)


def test_cli_stops_with_a_clear_message_without_a_token(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.delenv("MAPILLARY_TOKEN", raising=False)
    assert main(["discover", "--provider", "mapillary", "--db", str(tmp_path / "d.sqlite")]) == 2
    err = capsys.readouterr().err
    assert "STOP" in err and "MAPILLARY_TOKEN" in err
    assert not any(tmp_path.glob("*.jsonl"))


def test_cli_check_and_report_without_searches(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["check"]) == 0
    out = tmp_path / "r.md"
    assert main(["report", "--db", str(tmp_path / "d.sqlite"), "--out", str(out), "--json", str(tmp_path / "r.json")]) == 0
    assert "No search has succeeded" in out.read_text()
    assert json.loads((tmp_path / "r.json").read_text())["coverage_known"] is False
