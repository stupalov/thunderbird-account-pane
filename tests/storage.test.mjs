import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { loadScripts } from "./load-script.mjs";
const path = fileURLToPath(new URL("../addon/background.js", import.meta.url));
const groupsPath = fileURLToPath(new URL("../addon/lib/groups.js", import.meta.url));
const plain = value => JSON.parse(JSON.stringify(value));
const empty = { version: 2, selectedAccountId: null, selectedGroupId: null, collapsedGroups: [],
  lastFolders: {}, defaultGroupName: null, groups: [], membership: {} };
const tick = () => new Promise(setImmediate);
function storageModule(logs = []) {
  assert.ok(existsSync(path), "storage implementation must exist");
  return loadScripts([groupsPath, path], "AccountPaneStorage", { console: { error: code => logs.push(code) } });
}
const saver = (initial, writes = []) => { const writer = storageModule().createWriter(
  { async set(v) { writes.push(plain(v.settings)); } }, initial); return { save: p => writer.save(p).then(plain), writes }; };
test("queued writes preserve latest account and both folder histories", async () => {
  let release; const first = new Promise(r => { release = r; }); const writes = [];
  const storage = { async set(value) { if (!writes.length) { writes.push(plain(value)); await first; }
    else writes.push(plain(value)); this.value = plain(value.settings); } };
  const initial = { version: 1, selectedAccountId: null, lastFolders: {} };
  const writer = storageModule().createWriter(storage, initial);
  const a = writer.save({ selectedAccountId: "a", lastFolder: { accountId: "a", uri: "fixture://a/one" } });
  const b = writer.save({ selectedAccountId: "b", lastFolder: { accountId: "b", uri: "fixture://b/two" } });
  await tick(); assert.equal(writes.length, 1); release(); await writer.flush(); await Promise.all([a, b]);
  assert.deepEqual(storage.value, { ...empty, selectedAccountId: "b",
    lastFolders: { a: "fixture://a/one", b: "fixture://b/two" } });
  assert.deepEqual(initial.lastFolders, {});
});
test("failed writes reject generically, preserve persisted state, and next writes recover", async () => {
  const logs = []; let calls = 0; let value;
  const storage = { async set(v) { if (++calls === 1) throw Error("private fixture://secret"); value = plain(v); } };
  const writer = storageModule(logs).createWriter(storage, { version: 1, selectedAccountId: null, lastFolders: {} });
  await assert.rejects(writer.save({ selectedAccountId: "a" }), { message: "ACCOUNTPANE_STORAGE_WRITE_FAILED" });
  await writer.save({ lastFolder: { accountId: "b", uri: "fixture://b/two" } }); await writer.flush();
  assert.equal(value.settings.selectedAccountId, null); assert.equal(value.settings.lastFolders.b, "fixture://b/two");
  assert.deepEqual(logs, ["ACCOUNTPANE_STORAGE_WRITE_FAILED"]);
});
test("caller mutation and malformed initial settings cannot introduce arbitrary persisted fields", async () => {
  const writes = []; const writer = storageModule().createWriter({ async set(v) { writes.push(plain(v)); } },
    { version: 2, selectedAccountId: 7, lastFolders: { a: 42, b: "fixture://b/old" }, password: "ignored" });
  const patch = { lastFolder: { accountId: "a", uri: "fixture://a/one" }, arbitrary: "ignored" };
  const operation = writer.save(patch); patch.lastFolder.uri = "fixture://a/mutated"; await operation;
  assert.deepEqual(writes, [{ settings: { ...empty,
    lastFolders: { b: "fixture://b/old", a: "fixture://a/one" } } }]);
});
test("expansion defaults true for legacy or invalid settings and accepts only boolean patches", async () => {
  const storage = storageModule();
  assert.deepEqual(plain(storage.normalize({ selectedAccountId: null, lastFolders: {} })),
    empty);
  assert.deepEqual(plain(storage.normalize({ accountsExpanded: false }).collapsedGroups), ["default"]);
  assert.deepEqual(plain(storage.normalize({ accountsExpanded: "false" }).collapsedGroups), []);
  assert.deepEqual(plain(storage.copyPatch({ accountsExpanded: false, arbitrary: true })),
    { accountsExpanded: false });
  assert.deepEqual(plain(storage.copyPatch({ accountsExpanded: 0 })), {});
  const writes = [];
  const writer = storage.createWriter({ async set(value) { writes.push(plain(value.settings)); } },
    { selectedAccountId: null, accountsExpanded: true, lastFolders: {} });
  await writer.save({ accountsExpanded: false });
  assert.deepEqual(writes, [{ ...empty, collapsedGroups: ["default"] }]);
});
function backgroundFixture({ rejectBroadcast = false, readFails = false } = {}) {
  storageModule(); let listener, releaseRead, releaseBroadcast; const events = [], logs = [];
  const read = new Promise(r => { releaseRead = r; });
  let broadcasts = 0;
  const browser = { storage: { local: {
    async get(key) { events.push("read"); assert.equal(key, "settings"); await read;
      if (readFails) throw Error("private"); return { settings: { version: 1, selectedAccountId: null, lastFolders: {} } }; },
    async set(value) { events.push(["write", plain(value.settings)]); } } }, accountPane: {
    onStateChanged: { addListener(cb) { events.push("listen"); listener = cb; } },
    async start(settings) { events.push(["start", plain(settings)]); },
    async settingsChanged(settings) { events.push(["broadcast", plain(settings)]); broadcasts++;
      if (rejectBroadcast && broadcasts === 1) throw Error("private");
      if (!rejectBroadcast && broadcasts === 1) await new Promise(r => { releaseBroadcast = r; }); } } };
  const scope = vm.createContext({ browser, console: { error: code => logs.push(code) } });
  for (const file of [groupsPath, path]) vm.runInContext(readFileSync(file, "utf8"), scope);
  return { events, logs, fire: patch => listener(patch), releaseRead: () => releaseRead(), releaseBroadcast: () => releaseBroadcast() };
}
test("background listens before read/start and awaits every successful snapshot in persistence order", async () => {
  const f = backgroundFixture(); assert.deepEqual(f.events, ["listen", "read"]);
  const a = f.fire({ lastFolder: { accountId: "a", uri: "fixture://a/one" } });
  const b = f.fire({ lastFolder: { accountId: "b", uri: "fixture://b/two" } });
  assert.ok(a && typeof a.then === "function"); f.releaseRead(); await tick();
  assert.deepEqual(f.events.map(v => Array.isArray(v) ? v[0] : v), ["listen", "read", "start", "write", "broadcast"]);
  f.releaseBroadcast(); await Promise.all([a, b]);
  assert.deepEqual(f.events.slice(3).map(v => v[0]), ["write", "broadcast", "write", "broadcast"]);
  assert.deepEqual(f.events.at(-1)[1].lastFolders, { a: "fixture://a/one", b: "fixture://b/two" });
});
test("broadcast failure rejects its listener promise and following snapshot still runs", async () => {
  const f = backgroundFixture({ rejectBroadcast: true }); f.releaseRead();
  await assert.rejects(f.fire({ selectedAccountId: "a" }), { message: "ACCOUNTPANE_SETTINGS_BROADCAST_FAILED" });
  await f.fire({ selectedAccountId: "b" }); assert.equal(f.events.at(-1)[1].selectedAccountId, "b");
  assert.deepEqual(f.logs, ["ACCOUNTPANE_SETTINGS_BROADCAST_FAILED"]);
});
test("storage read failure starts with safe defaults and fixed diagnostic", async () => {
  const f = backgroundFixture({ readFails: true }); f.releaseRead(); await tick();
  assert.deepEqual(f.events.find(v => Array.isArray(v) && v[0] === "start")[1],
    empty);
  assert.deepEqual(f.logs, ["ACCOUNTPANE_STORAGE_READ_FAILED"]);
});
test("writer migrates v1 snapshot on first save", async () => {
  const w = saver({ accountsExpanded: false, selectedAccountId: "a" });
  await w.save({ lastFolder: { accountId: "a", uri: "fixture://a/one" } });
  assert.deepEqual(w.writes, [{ ...empty, selectedAccountId: "a", collapsedGroups: ["default"],
    lastFolders: { a: "fixture://a/one" } }]);
});
test("group patches apply serially and broadcast the full snapshot", async () => {
  const w = saver(empty);
  const results = [await w.save({ createGroup: { groupId: "g-1", name: "Work", accountId: "a" } }),
    await w.save({ renameGroup: { groupId: "g-1", name: "Job" } }),
    await w.save({ moveAccount: { accountId: "b", groupId: "g-1" } })];
  assert.deepEqual(results, w.writes);
  assert.deepEqual(results[2].groups, [{ id: "g-1", name: "Job" }]);
  assert.deepEqual(results[2].membership, { a: "g-1", b: "g-1" });
});
test("deleteGroup returns accounts to default and clears its selection", async () => {
  const w = saver({ ...empty, groups: [{ id: "g-1", name: "Work" }], membership: { a: "g-1" }, selectedGroupId: "g-1" });
  const r = await w.save({ deleteGroup: { groupId: "g-1" } });
  assert.deepEqual([r.groups, r.membership, r.selectedGroupId], [[], {}, null]);
});
test("selection patches are mutually exclusive", async () => {
  const w = saver({ ...empty, groups: [{ id: "g-1", name: "Work" }] });
  assert.equal((await w.save({ selectedGroupId: "g-1" })).selectedGroupId, "g-1");
  const r = await w.save({ selectedAccountId: "a" });
  assert.deepEqual([r.selectedAccountId, r.selectedGroupId], ["a", null]);
  const g = await w.save({ selectedGroupId: "g-1" });
  assert.deepEqual([g.selectedAccountId, g.selectedGroupId], [null, "g-1"]);
  const n = await w.save({ selectedAccountId: null, selectedGroupId: null });
  assert.deepEqual([n.selectedAccountId, n.selectedGroupId], [null, null]);
});
test("legacy accountsExpanded patch toggles the default group", async () => {
  const w = saver(empty);
  assert.deepEqual((await w.save({ accountsExpanded: false })).collapsedGroups, ["default"]);
  assert.deepEqual((await w.save({ accountsExpanded: true })).collapsedGroups, []);
  const g = await w.save({ groupExpanded: { groupId: "default", expanded: false } });
  assert.deepEqual(g.collapsedGroups, ["default"]);
});
test("pruneMembership drops absent keys and keeps hidden ones", async () => {
  const w = saver({ ...empty, groups: [{ id: "g-1", name: "Work" }],
    membership: { a: "g-1", hidden: "g-1", gone: "g-1" } });
  const r = await w.save({ pruneMembership: { accountIds: ["a", "hidden"] } });
  assert.deepEqual(r.membership, { a: "g-1", hidden: "g-1" });
});
test("copyPatch ignores malformed group patches", () => {
  const storage = storageModule();
  for (const bad of [{ createGroup: { groupId: 7 } }, { moveAccount: { accountId: "" } },
    { pruneMembership: { accountIds: "a" } }, { pruneMembership: { accountIds: [] } }, { renameGroup: { groupId: "g" } }, { deleteGroup: {} },
    { groupExpanded: { groupId: "g", expanded: "no" } }, { selectedGroupId: 3 }]) {
    assert.deepEqual(plain(storage.copyPatch(bad)), {});
  }
  assert.deepEqual(plain(storage.copyPatch({ createGroup: { groupId: "g-1", name: "W", extra: 1 },
    pruneMembership: { accountIds: ["a"] } })),
    { createGroup: { groupId: "g-1", name: "W" }, pruneMembership: { accountIds: ["a"] } });
});
