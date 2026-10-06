import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadScript } from "./load-script.mjs";
import { makeModelFixture } from "./fixtures.mjs";

const model = loadScript(fileURLToPath(new URL("../addon/lib/model.js", import.meta.url)),
  "AccountPaneModel");

test("deleted previous folder falls back to flagged inbox", () => {
  const folders = [
    { uri: "fixture://a/root", accountId: "a", root: true, available: true },
    { uri: "fixture://a/renamed", accountId: "a", inbox: true, available: true }
  ];
  assert.equal(model.resolveTarget("a", folders, { a: "fixture://a/deleted" }).uri,
    "fixture://a/renamed");
});

test("all accounts remains unrestricted on external navigation", () => {
  assert.equal(model.followFolder(null, "b"), null);
  assert.equal(model.followFolder("a", "b"), "b");
});

test("restored folder wins over saved global account", () => {
  assert.equal(model.initialAccount([{ id: "a" }, { id: "b" }], "b", "a"), "b");
});

// These cases catch wrong ownership, fallback priority, visibility and state recovery.
const plain = value => structuredClone(value);

test("account list omits hidden, chat and deferred POP entries in native order", () => {
  const { accounts } = makeModelFixture();
  assert.deepEqual(Array.from(model.visibleAccounts(accounts), account => account.id),
    ["b", "a", "local", "pop"]);
  assert.equal(model.visibleAccounts(accounts)[0], accounts[0]);
});

test("empty account list has no visible entries", () => {
  assert.deepEqual(plain(model.visibleAccounts([])), []);
});

test("available previous folder wins over inbox", () => {
  const { folders } = makeModelFixture();
  assert.equal(model.resolveTarget("a", folders, { a: "fixture://a/archive" }).uri,
    "fixture://a/archive");
});

test("foreign remembered URI cannot select another account's folder", () => {
  const { folders } = makeModelFixture();
  assert.equal(model.resolveTarget("a", folders, { a: "fixture://b/inbox" }).uri,
    "fixture://a/renamed-inbox");
});

test("unavailable previous folder falls back to available inbox", () => {
  const { folders } = makeModelFixture();
  assert.equal(model.resolveTarget("a", folders, { a: "fixture://a/unavailable" }).uri,
    "fixture://a/renamed-inbox");
});

test("without inbox first available child precedes account root", () => {
  const { folders } = makeModelFixture();
  assert.equal(model.resolveTarget("local", folders, {}).uri, "fixture://local/saved");
});

test("empty account shows its available root page", () => {
  const folders = [
    { uri: "fixture://a/root", accountId: "a", inbox: false, root: true, available: true }
  ];
  assert.equal(model.resolveTarget("a", folders, {}).uri, "fixture://a/root");
});

test("unavailable or deleted account has no target", () => {
  const { folders } = makeModelFixture();
  assert.equal(model.resolveTarget("deleted", folders, {}), null);
  assert.equal(model.resolveTarget("a", folders.map(folder => ({ ...folder, available: false })), {}), null);
});

test("all accounts has no navigation target", () => {
  const { folders } = makeModelFixture();
  assert.equal(model.resolveTarget(null, folders, {}), null);
});

test("folder resolution works before any remembered-folder settings exist", () => {
  const { folders } = makeModelFixture();
  assert.equal(model.resolveTarget("a", folders, null).uri, "fixture://a/renamed-inbox");
  assert.equal(model.resolveTarget("a", folders).uri, "fixture://a/renamed-inbox");
});

test("new tab uses valid saved account when its folder does not identify an account", () => {
  const { accounts } = makeModelFixture();
  assert.equal(model.initialAccount(accounts, null, "a"), "a");
  assert.equal(model.initialAccount(accounts, "deleted", "b"), "b");
});

test("deleted and hidden restored selections recover to all accounts", () => {
  const { accounts } = makeModelFixture();
  assert.equal(model.initialAccount(accounts, "deleted", "deleted"), null);
  assert.equal(model.initialAccount(accounts, "hidden", "im"), null);
  assert.equal(model.initialAccount(accounts, null, null), null);
  assert.equal(model.initialAccount([], "a", "b"), null);
});

test("external navigation within current account retains restriction", () => {
  assert.equal(model.followFolder("a", "a"), "a");
});

test("unattributed navigation retains the existing restriction", () => {
  assert.equal(model.followFolder("a", null), "a");
  assert.equal(model.followFolder("a", undefined), "a");
});

test("settings discard deleted accounts and invalid folder ownership or availability", () => {
  const { accounts, folders } = makeModelFixture();
  const settings = {
    version: 1, selectedAccountId: "a", extra: "discard",
    lastFolders: {
      a: "fixture://a/archive", b: "fixture://a/renamed-inbox",
      local: "fixture://local/saved", pop: "fixture://pop/deleted",
      hidden: "fixture://hidden/inbox", deleted: "fixture://deleted/inbox"
    }
  };
  assert.deepEqual(plain(model.sanitizeSettings(settings, accounts, folders)), {
    version: 1, selectedAccountId: "a",
    lastFolders: { a: "fixture://a/archive", local: "fixture://local/saved" }
  });
  assert.deepEqual(plain(model.sanitizeSettings({
    selectedAccountId: "deleted", lastFolders: { a: "fixture://a/unavailable" }
  }, accounts, folders)), { version: 1, selectedAccountId: null, lastFolders: {} });
});

test("settings cannot restore a hidden or deferred account", () => {
  const { accounts, folders } = makeModelFixture();
  for (const selectedAccountId of ["hidden", "im", "chat", "deferred"]) {
    assert.equal(model.sanitizeSettings({ selectedAccountId }, accounts, folders).selectedAccountId, null);
  }
});

test("corrupted settings reset to compatible defaults", () => {
  const { accounts, folders } = makeModelFixture();
  const cases = [
    { settings: undefined, selectedAccountId: null },
    { settings: null, selectedAccountId: null },
    { settings: false, selectedAccountId: null },
    { settings: 7, selectedAccountId: null },
    { settings: "broken", selectedAccountId: null },
    { settings: [], selectedAccountId: null },
    { settings: { version: 999, selectedAccountId: 1, lastFolders: null }, selectedAccountId: null },
    { settings: { selectedAccountId: {}, lastFolders: ["fixture://a/archive"] }, selectedAccountId: null },
    { settings: { selectedAccountId: "a", lastFolders: { a: 17, b: {} } }, selectedAccountId: "a" }
  ];
  for (const { settings, selectedAccountId } of cases) {
    assert.deepEqual(plain(model.sanitizeSettings(settings, accounts, folders)), {
      version: 1, selectedAccountId, lastFolders: {}
    });
  }
});

test("inherited remembered-folder entries are not restored", () => {
  const { accounts, folders } = makeModelFixture();
  const settings = { lastFolders: Object.create({ a: "fixture://a/archive" }) };
  assert.deepEqual(plain(model.sanitizeSettings(settings, accounts, folders).lastFolders), {});
});

test("supported modes allow account filtering", () => {
  for (const modes of [["all"], ["favorite"], ["all", "favorite"], ["favorite", "all"]]) {
    assert.equal(model.allowsFiltering(modes), true);
  }
});

test("unified, tags, recent and unknown modes restore unrestricted navigation", () => {
  for (const modes of [["unified"], ["tags"], ["recent"], ["all", "unified"],
    ["favorite", "tags"], ["all", "unknown"], [], null, undefined, "all"]) {
    assert.equal(model.allowsFiltering(modes), false);
  }
});

test("model operations leave account, folder and settings inputs unchanged", () => {
  const { accounts, folders } = makeModelFixture();
  for (const item of [...accounts, ...folders]) {
    Object.freeze(item);
  }
  Object.freeze(accounts);
  Object.freeze(folders);
  const settings = Object.freeze({
    version: 1, selectedAccountId: "a",
    lastFolders: Object.freeze({ a: "fixture://a/archive" })
  });
  model.visibleAccounts(accounts);
  model.initialAccount(accounts, "b", "a");
  model.resolveTarget("a", folders, settings.lastFolders);
  const result = model.sanitizeSettings(settings, accounts, folders);
  assert.equal(settings.selectedAccountId, "a");
  assert.equal(result.lastFolders.a, "fixture://a/archive");
  assert.notEqual(result, settings);
  assert.notEqual(result.lastFolders, settings.lastFolders);
});
