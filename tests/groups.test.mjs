import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadScript, loadScripts } from "./load-script.mjs";
import { makeModelFixture } from "./fixtures.mjs";

const path = name => fileURLToPath(new URL(`../addon/lib/${name}`, import.meta.url));
const model = loadScript(path("model.js"), "AccountPaneModel");
const groups = loadScripts([path("model.js"), path("groups.js")], "AccountPaneGroups");
const plain = value => structuredClone(value);
const { accounts, folders } = makeModelFixture();
const visible = model.visibleAccounts(accounts);
const base = (extra = {}) => groups.normalize({ version: 2, ...extra });
const withGroups = extra => base({ groups: [{ id: "g-1", name: "Work" }, { id: "g-2", name: "Empty" }], ...extra });
const ids = list => Array.from(list, item => item.id);

test("migrates v1 settings", () => {
  assert.deepEqual(plain(groups.normalize({
    version: 1, selectedAccountId: "a", accountsExpanded: false, lastFolders: { a: "fixture://a/x" }
  })), {
    version: 2, selectedAccountId: "a", selectedGroupId: null, collapsedGroups: ["default"],
    lastFolders: { a: "fixture://a/x" }, defaultGroupName: null, groups: [], membership: {}
  });
  assert.deepEqual(plain(groups.normalize(undefined)), {
    version: 2, selectedAccountId: null, selectedGroupId: null, collapsedGroups: [],
    lastFolders: {}, defaultGroupName: null, groups: [], membership: {}
  });
});

test("normalize drops garbage field by field", () => {
  const s = groups.normalize({
    version: 2,
    groups: [{ id: "default", name: "x" }, { id: "g-1", name: "  " }, { id: "g-2", name: "Work" },
      { id: "g-2", name: "Dup" }, 7, { id: "g-3", name: "x".repeat(150) }],
    membership: { a: "g-2", b: "g-missing", c: 5 },
    collapsedGroups: ["g-2", "g-2", "nope", "default"],
    lastFolders: { a: "fixture://a/x", b: 3 },
    selectedGroupId: "nope", selectedAccountId: 4, defaultGroupName: 9
  });
  assert.deepEqual(plain(s.groups), [{ id: "g-2", name: "Work" }, { id: "g-3", name: "x".repeat(100) }]);
  assert.deepEqual(plain(s.membership), { a: "g-2" });
  assert.deepEqual(plain(s.collapsedGroups), ["g-2", "default"]);
  assert.deepEqual(plain(s.lastFolders), { a: "fixture://a/x" });
  assert.equal(s.selectedGroupId, null);
  assert.equal(s.selectedAccountId, null);
  assert.equal(s.defaultGroupName, null);
  assert.equal(groups.normalize("junk").version, 2);
});

test("normalize keeps valid selections and prefers the account", () => {
  assert.equal(withGroups({ selectedGroupId: "default" }).selectedGroupId, "default");
  assert.equal(withGroups({ selectedGroupId: "g-1" }).selectedGroupId, "g-1");
  const both = withGroups({ selectedGroupId: "g-1", selectedAccountId: "a" });
  assert.equal(both.selectedAccountId, "a");
  assert.equal(both.selectedGroupId, null);
});

test("proto keys stay ordinary", () => {
  const s = groups.normalize(JSON.parse(
    '{"version":2,"groups":[{"id":"g-1","name":"W"}],"membership":{"__proto__":"g-1"},"lastFolders":{"__proto__":"u"}}'));
  assert.ok(Object.hasOwn(s.membership, "__proto__"));
  assert.ok(Object.hasOwn(s.lastFolders, "__proto__"));
  assert.ok(!Object.hasOwn(groups.moveAccount(s, "__proto__", "default").membership, "__proto__"));
});

test("cleanName trims truncates and rejects", () => {
  assert.equal(groups.cleanName("  Home "), "Home");
  assert.equal(groups.cleanName("x".repeat(150)).length, 100);
  assert.equal(groups.cleanName("   "), null);
  assert.equal(groups.cleanName(5), null);
});

test("create rename delete and move are pure", () => {
  const empty = base();
  const frozen = plain(empty);
  const created = groups.createGroup(empty, "g-1", "Work", "a");
  assert.deepEqual(plain(empty), frozen);
  assert.equal(created.membership.a, "g-1");
  assert.deepEqual(plain(created.groups), [{ id: "g-1", name: "Work" }]);
  assert.deepEqual(plain(groups.createGroup(empty, "g-1", "Work").membership), {});
  assert.deepEqual(plain(groups.createGroup(created, "g-1", "Again")), plain(created));
  assert.deepEqual(plain(groups.createGroup(created, "default", "X")), plain(created));
  assert.deepEqual(plain(groups.createGroup(created, "g-2", " ")), plain(created));

  assert.equal(groups.renameGroup(created, "g-1", "  Home ").groups[0].name, "Home");
  assert.deepEqual(plain(groups.renameGroup(created, "g-1", "")), plain(created));
  const main = groups.renameGroup(created, "default", "Main");
  assert.equal(main.defaultGroupName, "Main");
  assert.equal(groups.renameGroup(main, "default", "").defaultGroupName, null);

  const selected = groups.normalize({ ...plain(created), collapsedGroups: ["g-1"], selectedGroupId: "g-1" });
  const deleted = groups.deleteGroup(selected, "g-1");
  assert.deepEqual(plain(deleted.groups), []);
  assert.deepEqual(plain(deleted.membership), {});
  assert.deepEqual(plain(deleted.collapsedGroups), []);
  assert.equal(deleted.selectedGroupId, null);
  assert.deepEqual(plain(groups.deleteGroup(selected, "default")), plain(selected));

  assert.deepEqual(plain(groups.moveAccount(created, "a", "default").membership), {});
  assert.deepEqual(plain(groups.moveAccount(created, "a", "g-9")), plain(created));
  assert.equal(groups.moveAccount(created, "b", "g-1").membership.b, "g-1");
});

test("setGroupExpanded toggles collapsed entries", () => {
  const s = withGroups();
  const collapsed = groups.setGroupExpanded(s, "g-1", false);
  assert.deepEqual(plain(collapsed.collapsedGroups), ["g-1"]);
  assert.deepEqual(plain(groups.setGroupExpanded(collapsed, "g-1", false).collapsedGroups), ["g-1"]);
  assert.deepEqual(plain(groups.setGroupExpanded(collapsed, "g-1", true).collapsedGroups), []);
  assert.deepEqual(plain(groups.setGroupExpanded(s, "default", false).collapsedGroups), ["default"]);
  assert.deepEqual(plain(groups.setGroupExpanded(s, "nope", false).collapsedGroups), []);
});

test("pruneMembership drops absent keys and keeps hidden ones", () => {
  const s = withGroups({ membership: { a: "g-1", hidden: "g-1", b: "g-1" },
    lastFolders: { a: "fixture://a/x", b: "fixture://b/x" } });
  const pruned = groups.pruneMembership(s, ["a", "hidden"]);
  assert.deepEqual(plain(pruned.membership), { a: "g-1", hidden: "g-1" });
  assert.deepEqual(plain(pruned.lastFolders), { a: "fixture://a/x" });
});

test("view puts each visible account in exactly one group in native order", () => {
  const s = withGroups({ membership: { a: "g-1", hidden: "g-1" } });
  assert.deepEqual(plain(groups.view(visible, s, "All Accounts")), [
    { id: "default", name: "All Accounts", custom: false, accountIds: ["b", "local", "pop"] },
    { id: "g-1", name: "Work", custom: true, accountIds: ["a"] },
    { id: "g-2", name: "Empty", custom: true, accountIds: [] }
  ]);
  assert.equal(groups.view(visible, withGroups({ defaultGroupName: "Main" }), "All")[0].name, "Main");
});

test("isUnrestricted only while user groups have no visible members", () => {
  const check = extra => groups.isUnrestricted(groups.view(visible, withGroups(extra), "All"));
  assert.equal(groups.isUnrestricted(groups.view(visible, base(), "All")), true);
  assert.equal(check({}), true);
  assert.equal(check({ membership: { hidden: "g-1" } }), true);
  assert.equal(check({ membership: { a: "g-1" } }), false);
});

test("fallbackSelection with empty default is unrestricted", () => {
  const all = Object.fromEntries(visible.map(account => [account.id, "g-1"]));
  assert.equal(groups.fallbackSelection(groups.view(visible, withGroups({ membership: all }), "All")), null);
  assert.equal(groups.fallbackSelection(groups.view(visible, base(), "All")), null);
  assert.deepEqual(plain(groups.fallbackSelection(
    groups.view(visible, withGroups({ membership: { a: "g-1" } }), "All"))), { type: "group", id: "default" });
});

test("normalizeSelection", () => {
  const open = groups.view(visible, withGroups(), "All");
  const restricted = groups.view(visible, withGroups({ membership: { a: "g-1" } }), "All");
  assert.equal(groups.normalizeSelection(open, { type: "group", id: "default" }), null);
  assert.equal(groups.normalizeSelection(open, null), null);
  assert.deepEqual(plain(groups.normalizeSelection(restricted, { type: "group", id: "g-2" })),
    { type: "group", id: "default" });
  assert.deepEqual(plain(groups.normalizeSelection(restricted, { type: "group", id: "nope" })),
    { type: "group", id: "default" });
  assert.deepEqual(plain(groups.normalizeSelection(restricted, { type: "account", id: "gone" })),
    { type: "group", id: "default" });
  assert.equal(groups.normalizeSelection(open, { type: "account", id: "gone" }), null);
  assert.equal(groups.normalizeSelection(open, "junk"), null);
  for (const valid of [{ type: "group", id: "g-1" }, { type: "group", id: "default" },
    { type: "account", id: "a" }, null]) {
    assert.deepEqual(plain(groups.normalizeSelection(restricted, valid)), valid);
  }
});

test("groupOf and memberIds", () => {
  const open = groups.view(visible, withGroups(), "All");
  const restricted = groups.view(visible, withGroups({ membership: { a: "g-1" } }), "All");
  assert.equal(groups.groupOf(restricted, "a"), "g-1");
  assert.equal(groups.groupOf(restricted, "b"), "default");
  assert.equal(groups.groupOf(restricted, "gone"), null);
  assert.equal(groups.memberIds(restricted, null), null);
  assert.deepEqual(plain(groups.memberIds(restricted, { type: "account", id: "a" })), ["a"]);
  assert.deepEqual(plain(groups.memberIds(restricted, { type: "group", id: "g-1" })), ["a"]);
  assert.deepEqual(plain(groups.memberIds(restricted, { type: "group", id: "default" })), ["b", "local", "pop"]);
  assert.equal(groups.memberIds(open, { type: "group", id: "default" }), null);
});

test("groupTarget prefers current member folder then first resolvable member", () => {
  const bFolder = folders.find(folder => folder.uri === "fixture://b/inbox");
  const lastFolders = { a: "fixture://a/archive" };
  assert.equal(groups.groupTarget(["a", "b"], folders, { current: bFolder, lastFolders, explicit: true }, model), bFolder);
  assert.equal(groups.groupTarget(["a"], folders, { current: bFolder, lastFolders, explicit: true }, model).uri,
    "fixture://a/archive");
  assert.equal(groups.groupTarget(["a"], folders, { current: bFolder, lastFolders, explicit: false }, model).uri,
    "fixture://a/archive");
  assert.equal(groups.groupTarget(["a"], folders, { current: null, lastFolders: {}, explicit: false }, model).uri,
    "fixture://a/renamed-inbox");
  assert.equal(groups.groupTarget(["a"], folders, { current: null, lastFolders: {}, explicit: true }, model).uri,
    "fixture://a/archive");
  assert.equal(groups.groupTarget(["pop", "b"], folders, { current: null, lastFolders: {}, explicit: true }, model).uri,
    "fixture://b/inbox");
  assert.equal(groups.groupTarget(["pop"], folders, { current: null, lastFolders: {}, explicit: true }, model), null);
  const gone = { ...bFolder, available: false };
  assert.equal(groups.groupTarget(["b"], folders, { current: gone, lastFolders: {}, explicit: true }, model).uri,
    "fixture://b/inbox");
});

test("openTarget prefers the first member Inbox", () => {
  assert.equal(groups.openTarget(["a", "b"], folders, model).uri, "fixture://a/renamed-inbox");
  assert.equal(groups.openTarget(["local", "b"], folders, model).uri, "fixture://b/inbox");
  assert.equal(groups.openTarget(["local"], folders, model).uri, "fixture://local/saved");
  assert.equal(groups.openTarget(["pop"], folders, model), null);
});

test("newGroupId never returns default and has the g- prefix", () => {
  assert.match(groups.newGroupId(1000, () => 0.5), /^g-[0-9a-z]+-[0-9a-z]+$/);
  assert.notEqual(groups.newGroupId(0, () => 0), "default");
  assert.match(groups.newGroupId(), /^g-/);
});
