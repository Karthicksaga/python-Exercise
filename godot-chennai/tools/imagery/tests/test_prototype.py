from __future__ import annotations

import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "prototype"


def test_prototype_html_is_built_from_the_facade_data_and_is_self_contained() -> None:
    spec = importlib.util.spec_from_file_location("build_prototype", HERE / "build_prototype.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    html = (HERE / "index.html").read_text(encoding="utf-8")
    assert html == mod.build(), "run tools/imagery/prototype/build_prototype.py"
    assert "<img" not in html and "http://" not in html.replace("http://www.w3.org/2000/svg", "")
    assert "src=" not in html.replace('<script id="data"', "")
