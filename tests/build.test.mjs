import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const build = new URL("../scripts/build.py", import.meta.url);
function fixture() {
  assert.ok(existsSync(build), "explicit whitelist build script must exist");
  const root = mkdtempSync(join(tmpdir(), "accountpane-build-fixture-"));
  mkdirSync(join(root, "scripts")); cpSync(build, join(root, "scripts/build.py"));
  cpSync(new URL("../addon", import.meta.url), join(root, "addon"), { recursive: true });
  return { root, run: () => spawnSync("python3", [join(root, "scripts/build.py")], { encoding: "utf8" }),
    dispose: () => rmSync(root, { recursive: true, force: true }) };
}
test("build emits only reviewed addon files and validates archived manifest", () => {
  const f = fixture();
  try {
    for (const name of ["profile/prefs.js", "docs/secret.md", "tests/secret.mjs", ".git/config", "extra.json"]) {
      const file = join(f.root, "addon", name); mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, "fixture secret");
    }
    const result = f.run(); assert.equal(result.status, 0, result.stderr);
    const inspect = spawnSync("python3", ["-c", "import json,zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({'files':z.namelist(),'manifest':json.loads(z.read('manifest.json'))}))",
      join(f.root, "dist/accountpane-0.1.13.xpi")], { encoding: "utf8" });
    assert.equal(inspect.status, 0, inspect.stderr); const artifact = JSON.parse(inspect.stdout);
    assert.deepEqual(artifact.files, ["_locales/en/messages.json", "_locales/ru/messages.json", "background.js",
      "experiment/account-pane.css", "experiment/account-view.js", "experiment/controller.js", "experiment/implementation.js",
      "experiment/lifecycle.js", "experiment/schema.json", "experiment/thunderbird-adapter.js", "experiment/tree-filter.js",
      "icons/accountpane-128.png", "icons/accountpane-16.png", "icons/accountpane-32.png",
      "icons/accountpane-48.png", "icons/accountpane-64.png", "lib/groups.js", "lib/model.js", "manifest.json"]);
    assert.equal(artifact.files.length, 19);
    assert.deepEqual(artifact.manifest.background.scripts, ["lib/groups.js", "background.js"]);
    const props = JSON.parse(readFileSync(join(f.root, "addon/experiment/schema.json")))[0].types[0].properties;
    for (const key of ["selectedGroupId", "collapsedGroups", "defaultGroupName", "groups", "membership"]) assert.ok(key in props, key);
    assert.equal(artifact.manifest.version, "0.1.13");
    assert.deepEqual(artifact.manifest.icons, {
      "16": "icons/accountpane-16.png", "32": "icons/accountpane-32.png",
      "48": "icons/accountpane-48.png", "64": "icons/accountpane-64.png",
      "128": "icons/accountpane-128.png"
    });
    assert.equal(artifact.manifest.browser_specific_settings.gecko.id, "accountpane@stupalov.github.io");
    const first = readFileSync(join(f.root, "dist/accountpane-0.1.13.xpi"));
    assert.equal(f.run().status, 0); assert.deepEqual(readFileSync(join(f.root, "dist/accountpane-0.1.13.xpi")), first);
  } finally { f.dispose(); }
});
test("packaged compatibility is Gecko 140.0 to 158.*", () => {
  const f = fixture();
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const inspect = spawnSync("python3", ["-c", "import json,zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps(json.loads(z.read('manifest.json'))['browser_specific_settings']['gecko']))",
      join(f.root, "dist/accountpane-0.1.13.xpi")], { encoding: "utf8" });
    assert.equal(inspect.status, 0, inspect.stderr);
    const compatibility = JSON.parse(inspect.stdout);
    // XPIInstall targets TOOLKIT_ID: XPIDatabase compares aPlatformVersion,
    // not the app's patch release. These are the inspected native versions.
    const installed = { appVersion: "157.0.1", platformVersion: "157.0" };
    const compare = (left, right) => {
      const a = left.split(".").map(Number), b = right.split(".").map(Number);
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) { return (a[i] ?? 0) - (b[i] ?? 0); }
      }
      return 0;
    };
    assert.equal(compatibility.strict_min_version, "140.0");
    assert.equal(compatibility.strict_max_version, "158.*", "the add-on catalogue requires an explicit maximum for Experiments");
    assert.ok(compare(installed.platformVersion, compatibility.strict_min_version) >= 0,
      `app ${installed.appVersion} must be installable on platform ${installed.platformVersion}`);
    for (const platformVersion of ["140.0", "157.0", "158.0", "159.0"]) {
      assert.ok(compare(platformVersion, compatibility.strict_min_version) >= 0);
    }
    const file = join(f.root, "addon/manifest.json"), manifest = JSON.parse(readFileSync(file));
    manifest.browser_specific_settings.gecko.strict_min_version = "157.0.1";
    writeFileSync(file, JSON.stringify(manifest));
    const rejectedMinimum = f.run();
    assert.notEqual(rejectedMinimum.status, 0, "builder must reject the known platform-incompatible minimum");
    assert.match(rejectedMinimum.stderr, /ACCOUNTPANE_BUILD_INVALID_INPUT/);
    manifest.browser_specific_settings.gecko.strict_min_version = "140.0";
    manifest.browser_specific_settings.gecko.strict_max_version = "*";
    writeFileSync(file, JSON.stringify(manifest));
    const rejectedMaximum = f.run();
    assert.notEqual(rejectedMaximum.status, 0, "builder must reject a wildcard maximum the catalogue does not accept");
    assert.match(rejectedMaximum.stderr, /ACCOUNTPANE_BUILD_INVALID_INPUT/);
  } finally { f.dispose(); }
});
test("build rejects file symlinks and symlinked parent directories without emitting archive", () => {
  for (const directory of [false, true]) {
    const f = fixture();
    try {
      if (directory) {
        cpSync(join(f.root, "addon/experiment"), join(f.root, "outside"), { recursive: true });
        rmSync(join(f.root, "addon/experiment"), { recursive: true }); symlinkSync(join(f.root, "outside"), join(f.root, "addon/experiment"));
      } else {
        unlinkSync(join(f.root, "addon/background.js")); writeFileSync(join(f.root, "outside.js"), "fixture");
        symlinkSync(join(f.root, "outside.js"), join(f.root, "addon/background.js"));
      }
      const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /ACCOUNTPANE_BUILD_INVALID_INPUT/);
      assert.ok(!existsSync(join(f.root, "dist/accountpane-0.1.13.xpi")));
    } finally { f.dispose(); }
  }
});
test("build rejects malformed JSON, unsafe manifest references, changed icon paths and missing locale labels", () => {
  for (const variant of ["json", "path", "label", "schema", "extra-reference", "integer-enum", "icon-path"]) {
    const f = fixture();
    try {
      const file = join(f.root, "addon/manifest.json"); const manifest = JSON.parse(readFileSync(file));
      if (variant === "json") writeFileSync(file, "{");
      if (variant === "path") { manifest.background.scripts = ["../outside.js"]; writeFileSync(file, JSON.stringify(manifest)); }
      if (variant === "extra-reference") { manifest.content_scripts = [{ matches: ["https://fixture.invalid/*"], js: ["../outside.js"] }]; writeFileSync(file, JSON.stringify(manifest)); }
      if (variant === "icon-path") { manifest.icons[16] = "icons/other.png"; writeFileSync(file, JSON.stringify(manifest)); }
      if (variant === "label") writeFileSync(join(f.root, "addon/_locales/en/messages.json"), "{}");
      if (variant === "integer-enum") {
        const schemaFile = join(f.root, "addon/experiment/schema.json"), schema = JSON.parse(readFileSync(schemaFile));
        schema[0].types[0].properties.version = { type: "integer", enum: [1] }; writeFileSync(schemaFile, JSON.stringify(schema));
      }
      if (variant === "schema") {
        const schemaFile = join(f.root, "addon/experiment/schema.json"), schema = JSON.parse(readFileSync(schemaFile));
        schema[0].functions[0].parameters[0].$ref = "Unknown"; writeFileSync(schemaFile, JSON.stringify(schema));
      }
      const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /ACCOUNTPANE_BUILD_INVALID_INPUT/);
      assert.ok(!existsSync(join(f.root, "dist/accountpane-0.1.13.xpi")));
    } finally { f.dispose(); }
  }
});

test("build requires every account-group locale label in en and ru", () => {
  for (const locale of ["en", "ru"]) {
    for (const key of ["newAccountGroup", "renameGroup", "deleteGroup", "openInNewTab", "openInNewWindow", "moveToGroup",
      "newGroupPromptTitle", "renameGroupPromptTitle", "groupNamePrompt", "expandGroup", "collapseGroup"]) {
      const f = fixture();
      try {
        const file = join(f.root, `addon/_locales/${locale}/messages.json`), messages = JSON.parse(readFileSync(file));
        assert.ok(messages[key], `${locale}:${key}`); delete messages[key]; writeFileSync(file, JSON.stringify(messages));
        const result = f.run(); assert.notEqual(result.status, 0, `${locale}:${key}`);
        assert.match(result.stderr, /ACCOUNTPANE_BUILD_INVALID_INPUT/);
      } finally { f.dispose(); }
    }
  }
});
