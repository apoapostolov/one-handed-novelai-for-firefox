import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_version():
    try:
        return json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]
    except (OSError, ValueError, KeyError) as error:
        raise SystemExit(f"cannot read the version from manifest.json: {error}") from error


version = read_version()
output = ROOT / f"one-handed-novelai-{version}.xpi"

files = [
    "manifest.json",
    "content.js",
    "content.css",
    "background.js",
    "popup.html",
    "popup.js",
    "popup.css",
    "README.md",
] + [f"assets/icon-{size}.png" for size in (16, 32, 48, 128)]

with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for relative in files:
        source = ROOT / relative
        if not source.is_file():
            raise SystemExit(f"missing file: {relative}")
        archive.write(source, relative)

print(f"wrote {output} ({output.stat().st_size} bytes)")
