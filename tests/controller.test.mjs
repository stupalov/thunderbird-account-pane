import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { loadScript } from "./load-script.mjs";
import { makeModelFixture, makeTreeFixture } from "./fixtures.mjs";

const model = loadScript("addon/lib/model.js", "AccountPaneModel");
const controllerPath = "addon/experiment/controller.js";
const Controller = existsSync(controllerPath) ? loadScript(controllerPath, "AccountPaneController") : null;

const groups = loadScript("addon/lib/groups.js", "AccountPaneGroups");
const work = { groups: [{ id: "g", name: "Work" }] };

function fixture({ settings = {}, current = null, modes = ["all", "favorite"], canDisplayFolder = () => true, saveResult, trackCounts = false, ensureAllFolders, accountKeys } = {}) {
  const data = makeModelFixture();
  const listeners = { folder: new Set(), accounts: new Set(), modes: new Set(), counts: new Set() };
  const effects = [], saved = [], displayCalls = [];
  const subscribe = kind => callback => {
    listeners[kind].add(callback);
    return () => listeners[kind].delete(callback);
  };
  const adapter = {
    listAccounts: () => data.accounts,
    listFolders: id => data.folders.filter(folder => folder.accountId === id),
    currentFolder: () => current,
    selectedFolders: () => [],
    activeModes: () => modes,
    canDisplayFolder,
    ...(ensureAllFolders ? { ensureAllFolders } : {}),
    ...(accountKeys ? { listAccountKeys: () => accountKeys() } : {}),
    displayFolder(uri) { displayCalls.push(uri); effects.push(["display", uri]); },
    reorderAccount(...args) { effects.push(["reorder", ...args]); },
    onFolderChanged: subscribe("folder"), onAccountsChanged: subscribe("accounts"),
    onModesChanged: subscribe("modes"),
    onMessageCountsChanged: subscribe("counts"),
    messageCounts: () => ({ showTotal: false, accounts: {} }),
    emitCounts() { for (const callback of listeners.counts) callback(); },
    emitFolder(folder) { current = folder; for (const callback of listeners.folder) { callback(folder); } },
    emitAccounts() { for (const callback of listeners.accounts) { callback(); } },
    emitModes(value) { modes = value; for (const callback of listeners.modes) { callback(); } }
  };
  assert.ok(Controller?.create, "navigation controller factory must exist");
  // Controller values come from another VM realm; clone them for deep equality.
  const plain = value => value == null ? value : structuredClone(value);
  const controller = Controller.create({ adapter, model, groups, settings, labels: { allAccounts: "All Accounts" },
    filter: { apply(ids) { effects.push(["filter", plain(ids)]); } },
    view: { setCollapsed(ids) { effects.push(["collapsed", [...ids]]); },
      render(list, selection, byId) { effects.push(["render", plain(selection), plain(list), byId]); },
      focusGroup(id) { effects.push(["focus", id]); },
      updateCounts(snapshot) { if (trackCounts) effects.push(["counts", snapshot.showTotal]); } },
    save(patch) { saved.push(structuredClone(patch)); return saveResult?.(patch); }
  });
  const lastRender = () => effects.filter(effect => effect[0] === "render").at(-1);
  // Account id, "group:<id>", or null for unrestricted (default marked only while unrestricted).
  const selected = () => {
    const [, mark, list] = lastRender();
    return mark?.type === "account" ? mark.id : !mark || groups.isUnrestricted(list) ? null : `group:${mark.id}`;
  };
  const filtered = () => effects.filter(effect => effect[0] === "filter").at(-1)[1];
  return { controller, adapter, data, listeners, effects, saved, displayCalls, selected, lastRender, filtered };
}

test("count notifications update badges without filtering, rendering, navigation, or storage", () => {
  const f = fixture({ trackCounts: true });
  f.controller.selectAccount("a");
  assert.equal(f.selected(), "a");
  f.effects.length = 0; f.saved.length = 0; f.displayCalls.length = 0;
  f.adapter.emitCounts();
  assert.deepEqual(f.effects, [["counts", false]]);
  assert.deepEqual(f.saved, []);
  assert.deepEqual(f.displayCalls, []);
  f.controller.dispose();
  f.effects.length = 0;
  f.adapter.emitCounts();
  assert.deepEqual(f.effects, []);
});

test("explicit account switching remembers the departed folder but opens the first real folder", () => {
  const f = fixture();
  f.controller.selectAccount("a");
  assert.deepEqual(f.saved, [{ selectedAccountId: "a" }]);
  f.adapter.emitFolder({ accountId: "a", uri: "fixture://a/renamed-inbox", available: true });
  f.controller.selectAccount("b");
  f.controller.selectAccount("a");
  assert.equal(f.displayCalls.at(-1), "fixture://a/archive");
  assert.deepEqual(f.saved[1], { lastFolder: { accountId: "a", uri: "fixture://a/renamed-inbox" } });
});

test("all accounts never displays a folder", () => {
  const f = fixture();
  f.controller.selectAccount(null);
  assert.deepEqual(f.displayCalls, []);
  f.controller.selectAccount("a");
  const before = f.displayCalls.length;
  f.controller.selectAccount(null);
  assert.equal(f.displayCalls.length, before);
  assert.equal(f.selected(), null);
});

test("filter and view switch before native display during rapid a b a navigation", () => {
  const f = fixture();
  f.effects.length = 0;
  for (const id of ["a", "b", "a"]) { f.controller.selectAccount(id); }
  assert.deepEqual(f.effects.map(effect => effect.slice(0, 2)), [
    ["filter", ["a"]], ["render", { type: "account", id: "a" }], ["display", "fixture://a/archive"],
    ["filter", ["b"]], ["render", { type: "account", id: "b" }], ["display", "fixture://b/inbox"],
    ["filter", ["a"]], ["render", { type: "account", id: "a" }], ["display", "fixture://a/archive"]
  ]);
});

test("explicit account switch prefers an All Folders row when Favorites also contains the URI", () => {
  const modes = [];
  const f = fixture({ canDisplayFolder(uri, mode) {
    modes.push([uri, mode]);
    return mode === "all" && uri === "fixture://a/archive";
  } });
  f.adapter.displayFolder = (uri, mode) => {
    f.displayCalls.push(uri);
    modes.push(["display", uri, mode]);
    return true;
  };
  f.controller.selectAccount("a");
  assert.equal(f.displayCalls.at(-1), "fixture://a/archive");
  assert.deepEqual(modes.at(-1), ["display", "fixture://a/archive", "all"]);
});

test("explicit account clicks preserve every known folder mode and expose All Folders", () => {
  const knownModes = [["all"], ["favorite"], ["unread"], ["recent"], ["smart"], ["tags"],
    ["favorite", "unread"]];
  for (const modes of knownModes) {
    let ensured = 0;
    const attemptedModes = [];
    const f = fixture({ modes, ensureAllFolders() { ensured++; return true; },
      canDisplayFolder(uri, mode) {
        attemptedModes.push(mode);
        return uri === "fixture://a/archive";
      } });
    f.adapter.displayFolder = (uri, mode) => {
      f.displayCalls.push(uri);
      attemptedModes.push(mode);
      return true;
    };
    f.controller.selectAccount("a");
    assert.equal(f.selected(), "a", `${modes} keeps account filtering`);
    assert.equal(ensured, 1, `${modes} adds the All Folders rows`);
    assert.equal(f.displayCalls.at(-1), "fixture://a/archive");
    assert.ok(attemptedModes.every(mode => mode === (modes.includes("all") ? "all" : undefined)));
    f.controller.dispose();
  }
});

test("tree follow changes restriction without recursive display and null clears mixed selection", () => {
  const f = fixture();
  f.controller.selectAccount("a");
  const before = f.displayCalls.length;
  f.controller.followFolder("b");
  assert.equal(f.selected(), "b");
  f.controller.followFolder(null);
  assert.equal(f.selected(), null);
  f.controller.followFolder("a");
  assert.equal(f.selected(), null);
  assert.equal(f.displayCalls.length, before);
});

test("external actual folder change follows a restricted account and records its history", () => {
  const f = fixture();
  f.controller.selectAccount("a");
  f.adapter.emitFolder({ accountId: "b", uri: "fixture://b/inbox", available: true });
  assert.equal(f.selected(), "b");
  assert.deepEqual(f.saved.at(-1), { lastFolder: { accountId: "b", uri: "fixture://b/inbox" } });
  f.controller.selectAccount(null);
  f.adapter.emitFolder({ accountId: "a", uri: "fixture://a/archive", available: true });
  assert.equal(f.selected(), null);
  assert.equal(f.displayCalls.length, 1);
});

test("initial attach uses current ownership before saved account without navigating or saving history", () => {
  const f = fixture({ current: { accountId: "b", uri: "fixture://b/inbox", available: true },
    settings: { selectedAccountId: "a", lastFolders: {} } });
  assert.equal(f.selected(), "b");
  assert.deepEqual(f.displayCalls, []);
  assert.deepEqual(f.saved, []);
  assert.deepEqual(f.lastRender()[2][0].accountIds, ["b", "a", "local", "pop"]);
});

for (const lastFolders of [{}, { a: "fixture://a/renamed-inbox" }]) {
  test(`initial Archive survives first account roundtrip with ${Object.keys(lastFolders).length ? "stale" : "empty"} history`, () => {
    const f = fixture({ current: { accountId: "a", uri: "fixture://a/archive", available: true },
      settings: { lastFolders } });
    assert.equal(f.selected(), "a");
    assert.deepEqual(f.displayCalls, []);
    assert.deepEqual(f.saved, [], "attachment must not fabricate a folder change");
    f.controller.selectAccount("b");
    // An older persisted snapshot can arrive while leaving the initial folder.
    f.controller.updateSettings({ lastFolders: { a: "fixture://a/renamed-inbox" } });
    f.controller.selectAccount("a");
    assert.equal(f.displayCalls.at(-1), "fixture://a/archive");
    assert.deepEqual(f.saved.filter(patch => patch.lastFolder), [
      { lastFolder: { accountId: "a", uri: "fixture://a/archive" } }
    ]);
    f.controller.dispose();
  });
}

test("startup history stays local to each tab until its actual current folder is saved", () => {
  const archive = fixture({ current: { accountId: "a", uri: "fixture://a/archive" } });
  const inbox = fixture({ current: { accountId: "a", uri: "fixture://a/renamed-inbox" } });
  archive.controller.selectAccount("b");
  inbox.controller.updateSettings({ lastFolders: { a: "fixture://a/archive" } });
  inbox.controller.selectAccount("b");
  inbox.adapter.emitFolder(null);
  inbox.adapter.emitAccounts();
  archive.controller.updateSettings({ lastFolders: { a: "fixture://a/renamed-inbox" } });
  archive.controller.selectAccount("a");
  inbox.controller.selectAccount("a");
  inbox.adapter.emitFolder(null);
  inbox.adapter.emitAccounts();
  assert.equal(archive.displayCalls.at(-1), "fixture://a/archive");
  assert.equal(inbox.displayCalls.at(-1), "fixture://a/renamed-inbox");
  archive.controller.dispose(); inbox.controller.dispose();
});

test("unsupported modes clear restriction and returning to supported modes waits for user choice", () => {
  const f = fixture();
  f.controller.selectAccount("a");
  f.adapter.emitModes(["unified"]);
  assert.equal(f.selected(), null);
  f.controller.selectAccount("b");
  assert.equal(f.selected(), null);
  f.adapter.emitModes(["favorite", "all"]);
  f.controller.followFolder("b");
  assert.equal(f.selected(), null);
  assert.equal(f.displayCalls.length, 1);
  f.controller.selectAccount("b");
  assert.equal(f.selected(), "b");
});

test("initial unknown modes override saved and current account", () => {
  const f = fixture({ current: { accountId: "b", uri: "fixture://b/inbox" },
    settings: { selectedAccountId: "a" }, modes: ["unknown"] });
  assert.equal(f.selected(), null);
  assert.deepEqual(f.displayCalls, []);
});

test("deleted account clears a stable-key selection and refreshes names", () => {
  const f = fixture();
  f.controller.selectAccount("a");
  f.data.accounts.find(account => account.id === "b").name = "Renamed";
  f.data.accounts = f.data.accounts.filter(account => account.id !== "a");
  f.adapter.emitAccounts();
  assert.equal(f.selected(), null);
  assert.equal(f.displayCalls.length, 1);
  assert.equal(f.lastRender()[3].b.name, "Renamed");
  assert.deepEqual(f.saved.at(-1), { selectedGroupId: null, selectedAccountId: null });
});

for (const cause of ["deleted", "renamed", "missing", "foreign"]) {
  test(`${cause} saved URI falls back to an existing Inbox in the same account`, () => {
    const uri = cause === "foreign" ? "fixture://b/inbox" :
      cause === "missing" ? "fixture://a/gone" : "fixture://a/archive";
    const f = fixture({ settings: { selectedAccountId: "a", lastFolders: { a: uri } } });
    if (cause === "deleted") {
      f.data.folders = f.data.folders.filter(folder => folder.uri !== uri);
    } else if (cause === "renamed") {
      f.data.folders.find(folder => folder.uri === uri).uri = "fixture://a/renamed-archive";
    }
    f.adapter.emitAccounts();
    assert.equal(f.displayCalls.at(-1), "fixture://a/renamed-inbox");
    assert.ok(!f.saved.some(patch => patch.lastFolder));
  });
}

test("refresh after actual folder removal chooses fallback without fabricating history", () => {
  const f = fixture();
  f.controller.selectAccount("a");
  f.adapter.emitFolder({ accountId: "a", uri: "fixture://a/archive", available: true });
  f.data.folders = f.data.folders.filter(folder => folder.uri !== "fixture://a/archive");
  f.adapter.emitAccounts();
  assert.equal(f.displayCalls.at(-1), "fixture://a/renamed-inbox");
  assert.equal(f.saved.filter(patch => patch.lastFolder).length, 1);
});

test("empty Local Folders navigates to its root; unavailable account fails open", () => {
  const f = fixture();
  f.data.folders = f.data.folders.filter(folder => folder.accountId !== "local" || folder.root);
  f.controller.selectAccount("local");
  assert.equal(f.displayCalls.at(-1), "fixture://local/root");
  f.data.folders = f.data.folders.filter(folder => folder.accountId !== "a");
  f.controller.selectAccount("a");
  assert.equal(f.selected(), null);
  assert.equal(f.displayCalls.length, 1);
});

test("shared settings update changes history but preserves independent tab selections", () => {
  const a = fixture(), b = fixture();
  a.controller.selectAccount("a");
  b.controller.selectAccount("b");
  const settings = { selectedAccountId: "a", lastFolders: { a: "fixture://a/archive" } };
  a.controller.updateSettings(settings);
  b.controller.updateSettings(settings);
  assert.equal(a.selected(), "a");
  assert.equal(b.selected(), "b");
  b.controller.selectAccount("a");
  assert.equal(b.displayCalls.at(-1), "fixture://a/archive");
});

test("invalid actual folder events do not persist arbitrary or unavailable URIs", () => {
  const f = fixture();
  f.controller.selectAccount("a");
  for (const folder of [null, { accountId: "a", uri: "fixture://b/inbox" },
    { accountId: "hidden", uri: "fixture://hidden/root" },
    { accountId: "a", uri: "fixture://a/unavailable" }]) { f.adapter.emitFolder(folder); }
  assert.equal(f.saved.filter(patch => patch.lastFolder).length, 0);
});

test("dispose removes subscriptions and late callbacks cannot navigate or save", () => {
  const f = fixture();
  const callbacks = Object.values(f.listeners).flatMap(set => [...set]);
  f.controller.dispose();
  f.controller.dispose();
  for (const callback of callbacks) { callback({ accountId: "a", uri: "fixture://a/archive" }); }
  f.controller.selectAccount("a");
  f.controller.followFolder("b");
  f.controller.updateSettings({ selectedAccountId: "b" });
  assert.ok(Object.values(f.listeners).every(set => set.size === 0));
  assert.deepEqual(f.saved, []);
  assert.deepEqual(f.displayCalls, []);
});

test("favorite-only chooses a native row without discarding existing hidden folder history", () => {
  const f = fixture({ modes: ["favorite"], settings: { lastFolders: { a: "fixture://a/archive" } } });
  f.adapter.canDisplayFolder = uri => uri === "fixture://a/renamed-inbox";
  f.controller.selectAccount("a");
  assert.equal(f.displayCalls.at(-1), "fixture://a/renamed-inbox");
  f.adapter.canDisplayFolder = () => true;
  f.controller.selectAccount("a");
  assert.equal(f.displayCalls.at(-1), "fixture://a/archive");
});

test("account without current native rows clears restriction and leaves displayed folder", () => {
  const f = fixture();
  f.controller.selectAccount("b");
  f.adapter.canDisplayFolder = () => false;
  f.controller.selectAccount("a");
  assert.equal(f.selected(), null);
  assert.equal(f.displayCalls.length, 1);
  assert.equal(f.saved.filter(patch => patch.lastFolder).length, 0);
});

test("native row disappearing during display fails open", () => {
  const f = fixture();
  f.adapter.displayFolder = () => false;
  f.controller.selectAccount("a");
  assert.equal(f.selected(), null);
  assert.deepEqual(f.saved, [{ selectedAccountId: "a" }, { selectedGroupId: null, selectedAccountId: null }]);
});

test("supported mode change with no remaining account rows fails open without reopening history", () => {
  const f = fixture();
  f.controller.selectAccount("a");
  f.adapter.emitFolder({ accountId: "a", uri: "fixture://a/archive", available: true });
  f.adapter.canDisplayFolder = () => false;
  f.adapter.emitModes(["favorite"]);
  assert.equal(f.selected(), null);
  assert.equal(f.displayCalls.length, 1);
  f.adapter.canDisplayFolder = () => true;
  f.adapter.emitModes(["all"]);
  assert.equal(f.selected(), null);
  assert.equal(f.displayCalls.length, 1);
});

test("controller rolls back earlier subscriptions when later registration fails", () => {
  let remaining = 0;
  const adapter = {
    onFolderChanged() { remaining++; return () => remaining--; },
    onAccountsChanged() { remaining++; return () => remaining--; },
    onModesChanged() { throw Error("observer registration failed"); }
  };
  assert.throws(() => Controller.create({ adapter, model, groups, settings: {},
    filter: {}, view: {}, save() {} }), /observer registration failed/);
  assert.equal(remaining, 0);
});


test("initial attach without any native account rows stays unrestricted", () => {
  const f = fixture({ current: { accountId: "a", uri: "fixture://a/archive" },
    settings: { selectedAccountId: "a" }, canDisplayFolder: () => false });
  assert.equal(f.selected(), null);
  assert.deepEqual(f.displayCalls, []);
  assert.deepEqual(f.saved, []);
});


test("real tree filter follows external native selection before row access without recursive display", () => {
  const tree = makeTreeFixture(["a", "b"]);
  const Filter = loadScript("addon/experiment/tree-filter.js", "AccountPaneTreeFilter");
  const filter = Filter.attach({ ...tree.options,
    followTarget: id => f.controller.followFolder(id)
  });
  const f = fixture();
  // The fixture's filter records controller effects; this real filter exercises
  // the same callback bridge used by lifecycle with native navigation wrappers.
  f.controller.selectAccount("a");
  filter.apply("a");
  tree.tree.updateSelection(tree.tree.allRows[1]);
  assert.equal(f.selected(), "b");
  assert.deepEqual(tree.tree.rows.map(row => row.accountId), ["b"]);
  assert.equal(tree.events.at(-1).rows[0].accountId, "b");
  assert.equal(f.displayCalls.length, 1);
  tree.tree.swapSelection(tree.tree.allRows);
  assert.equal(f.selected(), null);
  assert.equal(tree.tree.selection.length, 2);
  assert.equal(f.displayCalls.length, 1);
  f.controller.dispose(); filter.dispose();
});

test("delayed shared snapshot cannot overwrite pending local history while other account history updates", () => {
  const f = fixture();
  f.controller.selectAccount("a");
  f.adapter.emitFolder({ accountId: "a", uri: "fixture://a/archive", available: true });
  f.controller.updateSettings({ lastFolders: { a: "fixture://a/renamed-inbox", b: "fixture://b/root" } });
  f.controller.selectAccount("b");
  f.adapter.emitFolder(null);
  f.adapter.emitAccounts();
  assert.equal(f.displayCalls.at(-1), "fixture://b/root");
  f.controller.selectAccount("a");
  assert.equal(f.displayCalls.at(-1), "fixture://a/archive");
  f.controller.updateSettings({ lastFolders: { a: "fixture://a/archive" } });
  f.controller.updateSettings({ lastFolders: { a: "fixture://a/renamed-inbox" } });
  f.adapter.emitFolder(null);
  f.adapter.emitAccounts();
  assert.equal(f.displayCalls.at(-1), "fixture://a/renamed-inbox");
});

test("older acknowledgement cannot replace the newest of rapid local folder events", () => {
  const f = fixture();
  f.controller.selectAccount("a");
  f.displayCalls.length = 0;
  f.adapter.emitFolder({ accountId: "a", uri: "fixture://a/archive", available: true });
  f.adapter.emitFolder({ accountId: "a", uri: "fixture://a/renamed-inbox", available: true });
  f.controller.updateSettings({ lastFolders: { a: "fixture://a/archive" } });
  f.adapter.emitFolder(null);
  f.adapter.emitAccounts();
  assert.equal(f.displayCalls.at(-1), "fixture://a/renamed-inbox");
});


test("rejected history save releases pending URI for a later shared snapshot", async () => {
  const f = fixture({ saveResult: patch => patch.lastFolder ? Promise.reject(Error("storage failed")) : undefined });
  f.controller.selectAccount("a");
  f.displayCalls.length = 0;
  f.adapter.emitFolder({ accountId: "a", uri: "fixture://a/archive", available: true });
  await new Promise(setImmediate);
  f.controller.updateSettings({ lastFolders: { a: "fixture://a/renamed-inbox" } });
  f.adapter.emitFolder(null);
  f.adapter.emitAccounts();
  assert.equal(f.displayCalls.at(-1), "fixture://a/renamed-inbox");
});

test("old save rejection cannot release a newer pending event for the same URI", async () => {
  const old = Promise.withResolvers(), latest = Promise.withResolvers();
  let writes = 0;
  const f = fixture({ saveResult: patch => !patch.lastFolder ? undefined :
    ++writes === 1 ? old.promise : latest.promise });
  f.adapter.emitFolder({ accountId: "a", uri: "fixture://a/archive", available: true });
  f.adapter.emitFolder({ accountId: "a", uri: "fixture://a/archive", available: true });
  old.reject(Error("old save failed"));
  await new Promise(setImmediate);
  f.controller.updateSettings({ lastFolders: { a: "fixture://a/renamed-inbox" } });
  f.controller.selectAccount("a");
  assert.equal(f.displayCalls.at(-1), "fixture://a/archive");
  latest.resolve();
});

test("removed account drops pending history before a new shared snapshot", () => {
  const f = fixture();
  f.controller.selectAccount("a");
  f.displayCalls.length = 0;
  f.adapter.emitFolder({ accountId: "a", uri: "fixture://a/archive", available: true });
  const account = f.data.accounts.find(item => item.id === "a");
  f.data.accounts = f.data.accounts.filter(item => item.id !== "a");
  f.adapter.emitAccounts();
  f.data.accounts.push(account);
  f.controller.updateSettings({ lastFolders: { a: "fixture://a/renamed-inbox" } });
  f.controller.selectAccount("a");
  f.displayCalls.length = 0;
  f.adapter.emitFolder(null);
  f.adapter.emitAccounts();
  assert.equal(f.displayCalls.at(-1), "fixture://a/renamed-inbox");
});

test("legacy settings expand accounts by default while persisted false starts collapsed", () => {
  const legacy = fixture();
  const collapsed = fixture({ settings: { accountsExpanded: false } });
  assert.deepEqual(legacy.effects[0], ["collapsed", []]);
  assert.deepEqual(collapsed.effects[0], ["collapsed", ["default"]]);
  assert.deepEqual(legacy.saved, []);
  assert.deepEqual(collapsed.saved, []);
});

test("setGroupExpanded saves groupExpanded and updates the view", () => {
  const f = fixture({ settings: work });
  f.effects.length = 0;
  f.controller.setGroupExpanded("g", false);
  f.controller.setGroupExpanded("g", false);
  assert.deepEqual(f.effects, [["collapsed", ["g"]]]);
  assert.deepEqual(f.saved, [{ groupExpanded: { groupId: "g", expanded: false } }]);
  assert.deepEqual(f.displayCalls, []);
  f.effects.length = 0;
  // A snapshot written before the local change cannot rewind it; the acknowledging one can.
  f.controller.updateSettings({ ...work, collapsedGroups: [] });
  f.controller.updateSettings({ ...work, collapsedGroups: ["g"] });
  assert.deepEqual(f.effects.filter(effect => effect[0] === "collapsed"), []);
  f.controller.updateSettings({ ...work, collapsedGroups: [] });
  assert.deepEqual(f.effects.filter(effect => effect[0] === "collapsed"), [["collapsed", []]]);
});

test("failed expansion save lets the shared snapshot win", async () => {
  const f = fixture({ settings: work, saveResult: patch => patch.groupExpanded ? Promise.reject(Error("storage failed")) : undefined });
  f.controller.setGroupExpanded("default", false);
  await new Promise(setImmediate);
  f.effects.length = 0;
  f.controller.updateSettings({ ...work, collapsedGroups: [] });
  assert.deepEqual(f.effects.filter(effect => effect[0] === "collapsed"), [["collapsed", []]]);
});

test("selecting a group filters to its members and displays its first target", () => {
  const f = fixture({ settings: { ...work, membership: { a: "g", b: "g" } } });
  f.effects.length = 0;
  f.controller.select({ type: "group", id: "g" });
  assert.deepEqual(f.effects.map(effect => effect.slice(0, 2)), [["filter", ["b", "a"]],
    ["render", { type: "group", id: "g" }], ["display", "fixture://b/inbox"]]);
  assert.deepEqual(f.saved, [{ selectedGroupId: "g" }]);
});

test("selecting the default group while unrestricted is the former All Accounts path", () => {
  const f = fixture({ settings: work });
  f.controller.selectAccount("a");
  f.effects.length = 0; f.saved.length = 0;
  f.controller.select({ type: "group", id: "default" });
  assert.deepEqual(f.effects.map(effect => effect.slice(0, 2)), [["filter", null],
    ["render", { type: "group", id: "default" }]]);
  assert.deepEqual(f.saved, [{ selectedGroupId: null, selectedAccountId: null }]);
  assert.equal(f.displayCalls.length, 1);
});

test("following a folder inside the selected group keeps the group; outside selects the account", () => {
  const f = fixture({ settings: { ...work, membership: { a: "g", b: "g" } } });
  f.controller.select({ type: "group", id: "g" });
  f.saved.length = 0;
  f.controller.followFolder("a");
  assert.equal(f.selected(), "group:g");
  assert.deepEqual(f.saved, []);
  f.controller.followFolder("local");
  assert.equal(f.selected(), "local");
  assert.deepEqual(f.filtered(), ["local"]);
  assert.equal(f.displayCalls.length, 1);
});

test("snapshot deleting the selected group falls back to default", () => {
  const two = { groups: [{ id: "g", name: "Work" }, { id: "h", name: "Home" }], membership: { a: "g", b: "h" } };
  const f = fixture({ settings: two, current: { accountId: "a", uri: "fixture://a/archive", available: true } });
  f.controller.select({ type: "group", id: "g" });
  const displays = f.displayCalls.length;
  f.controller.updateSettings({ groups: [two.groups[1]], membership: { b: "h" } });
  assert.equal(f.selected(), "group:default");
  assert.deepEqual(f.filtered(), ["a", "local", "pop"]);
  assert.equal(f.displayCalls.length, displays);
});

test("snapshot moving the open folder's account re-targets inside the group", () => {
  const f = fixture({ settings: { ...work, membership: { a: "g", b: "g" } },
    current: { accountId: "a", uri: "fixture://a/archive", available: true } });
  f.controller.select({ type: "group", id: "g" });
  assert.equal(f.displayCalls.at(-1), "fixture://a/archive");
  f.controller.updateSettings({ ...work, membership: { b: "g" } });
  assert.equal(f.selected(), "group:g");
  assert.deepEqual(f.filtered(), ["b"]);
  assert.equal(f.displayCalls.at(-1), "fixture://b/inbox");
  assert.deepEqual(f.saved.at(-1), { lastFolder: { accountId: "a", uri: "fixture://a/archive" } });
});

test("first account entering a user group re-filters a pane showing the default group", () => {
  const f = fixture({ settings: work });
  f.adapter.emitFolder({ accountId: "a", uri: "fixture://a/archive", available: true });
  assert.deepEqual(f.lastRender()[1], { type: "group", id: "default" });
  f.controller.updateSettings({ ...work, membership: { a: "g" } });
  assert.equal(f.selected(), "group:default");
  assert.deepEqual(f.filtered(), ["b", "local", "pop"]);
  assert.equal(f.displayCalls.at(-1), "fixture://b/inbox");
});

test("startup restores a saved group unless the open folder belongs elsewhere", () => {
  const settings = { ...work, membership: { a: "g", b: "g" }, selectedGroupId: "g" };
  const empty = fixture({ settings });
  const inside = fixture({ settings, current: { accountId: "a", uri: "fixture://a/archive", available: true } });
  const outside = fixture({ settings, current: { accountId: "local", uri: "fixture://local/saved", available: true } });
  assert.equal(empty.selected(), "group:g");
  assert.deepEqual(empty.filtered(), ["b", "a"]);
  assert.equal(inside.selected(), "group:g");
  assert.equal(outside.selected(), "local");
  for (const f of [empty, inside, outside]) {
    assert.deepEqual(f.displayCalls, []);
    assert.deepEqual(f.saved, []);
  }
});

test("createGroup saves the patch and focuses the group after the snapshot", () => {
  const f = fixture();
  assert.equal(f.controller.createGroup("   "), null);
  const id = f.controller.createGroup("  Work ", "a");
  assert.match(id, /^g-/);
  assert.deepEqual(f.saved, [{ createGroup: { groupId: id, name: "Work", accountId: "a" } }]);
  assert.ok(!f.effects.some(effect => effect[0] === "focus"));
  const snapshot = { groups: [{ id, name: "Work" }], membership: { a: id } };
  f.controller.updateSettings(snapshot);
  f.controller.updateSettings(snapshot);
  assert.deepEqual(f.effects.filter(effect => effect[0] === "focus"), [["focus", id]]);
  assert.deepEqual(f.lastRender()[2].map(entry => entry.id), ["default", id]);
});

test("moveAccount with placement saves membership and reorders", () => {
  const f = fixture({ settings: work });
  f.effects.length = 0;
  f.controller.moveAccount("a", "g", { targetId: "b", before: true });
  f.controller.moveAccount("b", "default", null);
  assert.deepEqual(f.saved, [{ moveAccount: { accountId: "a", groupId: "g" } },
    { moveAccount: { accountId: "b", groupId: "default" } }]);
  assert.deepEqual(f.effects, [["reorder", "a", "b", true]]);
});

test("accounts change sends pruneMembership with the full key list", () => {
  let keys = ["a", "b", "hidden"];
  const f = fixture({ accountKeys: () => keys });
  assert.deepEqual(f.saved, [{ pruneMembership: { accountIds: ["a", "b", "hidden"] } }]);
  f.adapter.emitAccounts();
  assert.equal(f.saved.length, 1);
  keys = ["b", "a"];
  f.adapter.emitAccounts();
  assert.deepEqual(f.saved.at(-1), { pruneMembership: { accountIds: ["b", "a"] } });
  for (const value of [[], null, "a"]) {
    keys = value;
    f.adapter.emitAccounts();
  }
  assert.equal(f.saved.length, 2);
});

test("groupChoices marks the current group; groupMenu forbids deleting default and reports the open target", () => {
  const f = fixture({ settings: { ...work, membership: { a: "g" } } });
  assert.deepEqual(structuredClone(f.controller.groupChoices("a")), [{ id: "default", name: "All Accounts", current: false },
    { id: "g", name: "Work", current: true }]);
  const menu = f.controller.groupMenu("default");
  assert.equal(menu.canDelete, false);
  assert.equal(menu.name, "All Accounts");
  assert.equal(menu.openTarget.uri, "fixture://b/inbox");
  assert.equal(f.controller.groupMenu("g").canDelete, true);
  assert.equal(f.controller.groupMenu("g").openTarget.uri, "fixture://a/renamed-inbox");
});

test("rename and delete only save patches; the default group is never deleted", () => {
  const f = fixture({ settings: work });
  f.effects.length = 0;
  f.controller.renameGroup("default", "");
  f.controller.renameGroup("g", "Office");
  f.controller.deleteGroup("default");
  f.controller.deleteGroup("g");
  assert.deepEqual(f.saved, [{ renameGroup: { groupId: "default", name: "" } },
    { renameGroup: { groupId: "g", name: "Office" } }, { deleteGroup: { groupId: "g" } }]);
  assert.deepEqual(f.effects, []);
});
