import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { loadScript } from "./load-script.mjs";
const path = fileURLToPath(new URL("../addon/background.js", import.meta.url));
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(setImmediate);
function storageModule(logs = []) {
  assert.ok(existsSync(path), "storage implementation must exist");
  return loadScript(path, "AccountPaneStorage", { console: { error: code => logs.push(code) } });
}
test("queued writes preserve latest account and both folder histories", async () => {
  let release; const first = new Promise(r => { release = r; }); const writes = [];
  const storage = { async set(value) { if (!writes.length) { writes.push(plain(value)); await first; }
    else writes.push(plain(value)); this.value = plain(value.settings); } };
  const initial = { version: 1, selectedAccountId: null, lastFolders: {} };
  const writer = storageModule().createWriter(storage, initial);
  const a = writer.save({ selectedAccountId: "a", lastFolder: { accountId: "a", uri: "fixture://a/one" } });
  const b = writer.save({ selectedAccountId: "b", lastFolder: { accountId: "b", uri: "fixture://b/two" } });
  await tick(); assert.equal(writes.length, 1); release(); await writer.flush(); await Promise.all([a, b]);
  assert.deepEqual(storage.value, { version: 1, selectedAccountId: "b", accountsExpanded: true,
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
  assert.deepEqual(writes, [{ settings: { version: 1, selectedAccountId: null, accountsExpanded: true,
    lastFolders: { b: "fixture://b/old", a: "fixture://a/one" } } }]);
});
test("expansion defaults true for legacy or invalid settings and accepts only boolean patches", async () => {
  const storage = storageModule();
  assert.deepEqual(plain(storage.normalize({ selectedAccountId: null, lastFolders: {} })),
    { version: 1, selectedAccountId: null, accountsExpanded: true, lastFolders: {} });
  assert.equal(storage.normalize({ accountsExpanded: false }).accountsExpanded, false);
  assert.equal(storage.normalize({ accountsExpanded: "false" }).accountsExpanded, true);
  assert.deepEqual(plain(storage.copyPatch({ accountsExpanded: false, arbitrary: true })),
    { accountsExpanded: false });
  assert.deepEqual(plain(storage.copyPatch({ accountsExpanded: 0 })), {});
  const writes = [];
  const writer = storage.createWriter({ async set(value) { writes.push(plain(value.settings)); } },
    { selectedAccountId: null, accountsExpanded: true, lastFolders: {} });
  await writer.save({ accountsExpanded: false });
  assert.deepEqual(writes, [{ version: 1, selectedAccountId: null, accountsExpanded: false, lastFolders: {} }]);
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
  vm.runInNewContext(readFileSync(path, "utf8"), { browser, console: { error: code => logs.push(code) } });
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
    { version: 1, selectedAccountId: null, accountsExpanded: true, lastFolders: {} });
  assert.deepEqual(f.logs, ["ACCOUNTPANE_STORAGE_READ_FAILED"]);
});
