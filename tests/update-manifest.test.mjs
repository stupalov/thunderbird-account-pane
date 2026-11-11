import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "accountpane-update-fixture-"));
  mkdirSync(join(root, "scripts"));
  for (const s of ["build.py", "update-manifest.py"]) cpSync(new URL(`../scripts/${s}`, import.meta.url), join(root, "scripts", s));
  cpSync(new URL("../addon", import.meta.url), join(root, "addon"), { recursive: true });
  const py = (script, ...args) => spawnSync("python3", [join(root, "scripts", script), ...args], { encoding: "utf8" });
  return { root, py, dispose: () => rmSync(root, { recursive: true, force: true }) };
}
const ID = "accountpane@stupalov.github.io";
test("updates.json describes the built XPI: version, link, sha256 and bounds", () => {
  const f = fixture();
  try {
    assert.equal(f.py("build.py").status, 0);
    const result = f.py("update-manifest.py"); assert.equal(result.status, 0, result.stderr);
    const xpi = readFileSync(join(f.root, "dist/accountpane-0.2.5.xpi"));
    const doc = JSON.parse(readFileSync(join(f.root, "dist/updates.json"), "utf8"));
    assert.deepEqual(Object.keys(doc), ["addons"]); assert.deepEqual(Object.keys(doc.addons), [ID]);
    assert.deepEqual(doc.addons[ID].updates, [{
      version: "0.2.5",
      update_link: "https://github.com/stupalov/thunderbird-account-pane/releases/download/v0.2.5/accountpane-0.2.5.xpi",
      update_hash: "sha256:" + createHash("sha256").update(xpi).digest("hex"),
      applications: { gecko: { strict_min_version: "140.0", strict_max_version: "159.*" } }
    }]);
  } finally { f.dispose(); }
});
test("updates.json is deterministic and ends with a newline", () => {
  const f = fixture();
  try {
    f.py("build.py"); assert.equal(f.py("update-manifest.py").status, 0);
    const first = readFileSync(join(f.root, "dist/updates.json"));
    assert.equal(f.py("update-manifest.py").status, 0);
    assert.deepEqual(readFileSync(join(f.root, "dist/updates.json")), first);
    assert.equal(first.at(-1), 10);
  } finally { f.dispose(); }
});
test("generator uses the version and bounds from the manifest inside the XPI, not the source tree", () => {
  const f = fixture();
  try {
    f.py("build.py");
    const file = join(f.root, "addon/manifest.json"), m = JSON.parse(readFileSync(file));
    m.version = "9.9.9"; m.browser_specific_settings.gecko.strict_max_version = "999.*"; writeFileSync(file, JSON.stringify(m));
    assert.equal(f.py("update-manifest.py").status, 0);
    const u = JSON.parse(readFileSync(join(f.root, "dist/updates.json"), "utf8")).addons[ID].updates[0];
    assert.equal(u.version, "0.2.5"); assert.equal(u.applications.gecko.strict_max_version, "159.*");
  } finally { f.dispose(); }
});
test("generator refuses a missing XPI and the catalogue variant", () => {
  const f = fixture();
  try {
    let r = f.py("update-manifest.py"); assert.notEqual(r.status, 0);
    assert.ok(!existsSync(join(f.root, "dist/updates.json")));
    f.py("build.py", "--catalogue");
    r = f.py("update-manifest.py", join(f.root, "dist/accountpane-0.2.5-atn.xpi"));
    assert.notEqual(r.status, 0); assert.match(r.stderr, /ACCOUNTPANE_UPDATE_INVALID_INPUT/);
    assert.ok(!existsSync(join(f.root, "dist/updates.json")));
  } finally { f.dispose(); }
});
test("generator refuses an ambiguous dist (two release XPIs)", () => {
  const f = fixture();
  try {
    f.py("build.py");
    cpSync(join(f.root, "dist/accountpane-0.2.5.xpi"), join(f.root, "dist/accountpane-0.2.3.xpi"));
    const r = f.py("update-manifest.py"); assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ACCOUNTPANE_UPDATE_INVALID_INPUT/);
  } finally { f.dispose(); }
});
