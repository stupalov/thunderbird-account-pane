#!/usr/bin/env python3
"""Build AccountPane from a fixed, reviewed set of addon inputs only."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys
import tempfile
import zipfile

ALLOWED_FILES = (
    "manifest.json",
    "background.js",
    "lib/model.js",
    "experiment/schema.json",
    "experiment/implementation.js",
    "experiment/lifecycle.js",
    "experiment/thunderbird-adapter.js",
    "experiment/tree-filter.js",
    "experiment/account-view.js",
    "experiment/controller.js",
    "experiment/account-pane.css",
    "_locales/en/messages.json",
    "_locales/ru/messages.json",
    "icons/accountpane-16.png",
    "icons/accountpane-32.png",
    "icons/accountpane-48.png",
    "icons/accountpane-64.png",
    "icons/accountpane-128.png",
)


def require(condition):
    if not condition:
        raise ValueError("ACCOUNTPANE_BUILD_INVALID_INPUT")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result)
        result[key] = value
    return result


def validate_json_refs(value, type_ids):
    if isinstance(value, dict):
        # Thunderbird IntegerType supports bounds, not an enum keyword.
        require(value.get("type") != "integer" or "enum" not in value)
        if "$ref" in value:
            require(value["$ref"] in type_ids)
        for child in value.values():
            validate_json_refs(child, type_ids)
    elif isinstance(value, list):
        for child in value:
            validate_json_refs(child, type_ids)


def build(root):
    addon_root = root / "addon"
    require(addon_root.is_dir() and not addon_root.is_symlink())
    inputs = {}
    # Do not scan addon or add files discovered through manifest references.
    for relative in ALLOWED_FILES:
        path = addon_root / relative
        for part in [path, *path.parents]:
            if part == root:
                break
            require(not part.is_symlink())
        require(path.is_file())
        inputs[relative] = path.read_bytes()
    data = {name: json.loads(content, object_pairs_hook=unique_object)
            for name, content in inputs.items() if name.endswith(".json")}
    manifest = data["manifest.json"]
    require(set(manifest) == {"manifest_version", "name", "version", "icons", "default_locale",
                              "description", "permissions", "background",
                              "browser_specific_settings", "experiment_apis"})
    require(manifest["background"] == {"scripts": ["background.js"]})
    require(manifest["manifest_version"] == 2 and manifest["version"] == "0.1.11")
    icons = {str(size): f"icons/accountpane-{size}.png" for size in (16, 32, 48, 64, 128)}
    require(manifest["icons"] == icons and all(path in inputs for path in icons.values()))
    require(manifest["default_locale"] == "en" and manifest["permissions"] == ["storage"])
    require(manifest["browser_specific_settings"]["gecko"] == {
        "id": "accountpane@stupalov.github.io",
        "strict_min_version": "157.0"})
    require(set(manifest["experiment_apis"]) == {"accountPane"})
    experiment = manifest["experiment_apis"]["accountPane"]
    require(experiment == {"schema": "experiment/schema.json", "parent": {
        "scopes": ["addon_parent"], "paths": [["accountPane"]],
        "script": "experiment/implementation.js"}})
    references = [*manifest["background"]["scripts"], experiment["schema"], experiment["parent"]["script"]]
    for reference in references:
        require(isinstance(reference, str))
        path = PurePosixPath(reference)
        require(not path.is_absolute() and ".." not in path.parts and "\\" not in reference)
        require(reference in inputs)
    schema = data[experiment["schema"]]
    require(isinstance(schema, list) and len(schema) == 1 and schema[0]["namespace"] == "accountPane")
    types = schema[0]["types"]
    type_ids = {value["id"] for value in types}
    require(len(type_ids) == len(types))
    validate_json_refs(schema, type_ids)
    require({function["name"] for function in schema[0]["functions"]} == {"start", "settingsChanged"})
    require(all(function.get("async") is True for function in schema[0]["functions"]))
    require({event["name"] for event in schema[0]["events"]} == {"onStateChanged"})
    message_ids = set(re.findall(r"__MSG_([A-Za-z0-9_]+)__", json.dumps(manifest)))
    for locale in ("en", "ru"):
        messages = data[f"_locales/{locale}/messages.json"]
        for key in message_ids | {"extensionName", "extensionDescription", "accounts", "allAccounts",
                                  "expandAccounts", "collapseAccounts", "unreadCount", "totalCount",
                                  "newMessages"}:
            require(isinstance(messages[key]["message"], str) and bool(messages[key]["message"]))
    output_dir = root / "dist"
    require(not output_dir.is_symlink())
    output = output_dir / "accountpane-0.1.11.xpi"
    require(not output.is_symlink())
    output_dir.mkdir(exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=output_dir, suffix=".xpi", delete=False) as handle:
            temporary = Path(handle.name)
        with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for relative in sorted(ALLOWED_FILES):
                info = zipfile.ZipInfo(relative, date_time=(2026, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, inputs[relative], compresslevel=9)
        temporary.replace(output)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
    return output


if __name__ == "__main__":
    try:
        artifact = build(Path(__file__).resolve().parents[1])
        print(artifact)
        print("SHA-256 " + hashlib.sha256(artifact.read_bytes()).hexdigest())
    except Exception:
        print("ACCOUNTPANE_BUILD_INVALID_INPUT", file=sys.stderr)
        sys.exit(1)
