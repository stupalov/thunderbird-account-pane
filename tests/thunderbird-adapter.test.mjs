import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { loadScript } from "./load-script.mjs";

const path = "addon/experiment/thunderbird-adapter.js";
const Adapter = existsSync(path) ? loadScript(path, "AccountPaneAdapter") : null;

function fixture() {
  const observers = [], prefs = new Map(), folderListeners = new Set(), events = new Map();
  const microtasks = [], displays = [];
  const flags = { Inbox: 0x1000 };
  const makeAccount = (id, type = "imap", extra = {}) => {
    const server = { key: `server-${id}`, prettyName: `Account ${id}`, type, hidden: false,
      QueryInterface() { return { deferredToAccount: extra.deferredToAccount ?? "" }; }, ...extra };
    const root = { URI: `fixture://${id}/root`, isServer: true, flags: 0, server,
      sortOrder: 0, localizedName: "Root", subFolders: [] };
    server.rootFolder = root;
    return { key: id, incomingServer: server };
  };
  const accounts = [makeAccount("b"), makeAccount("a"), makeAccount("local", "none"),
    makeAccount("im", "im"), makeAccount("deferred", "pop3", { deferredToAccount: "a" }),
    makeAccount("hidden", "imap", { hidden: true })];
  const makeFolder = (id, name, order, extra = {}) => {
    const server = accounts.find(account => account.key === id).incomingServer;
    const folder = { URI: `fixture://${id}/${name}`, isServer: false, flags: 0, server,
      sortOrder: order, localizedName: name, subFolders: [], ...extra };
    for (const property of ["msgDatabase", "messages", "getMessages", "getTotalMessages"]) {
      Object.defineProperty(folder, property, { get() { throw Error("message access forbidden"); } });
    }
    return folder;
  };
  const archive = makeFolder("a", "Archive", 20);
  const inbox = makeFolder("a", "RenamedInbox", 10, { flags: flags.Inbox });
  const nested = makeFolder("a", "Nested", 1);
  archive.subFolders = [nested];
  accounts[1].incomingServer.rootFolder.subFolders = [archive, inbox];
  const tree = {};
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  }
  const window = {
    MutationObserver, queueMicrotask(callback) { microtasks.push(callback); },
    document: { getElementById(id) { return id === "folderTree" ? tree : null; } },
    folderPane: { activeModes: ["all", "favorite"], hideLocalFolders: false,
      getRowForFolder(uri) { return { uri }; } },
    gFolder: inbox,
    displayFolder(uri) { displays.push({ receiver: this, uri }); },
    addEventListener(name, callback) { const set = events.get(name) ?? new Set(); set.add(callback); events.set(name, set); },
    removeEventListener(name, callback) { events.get(name)?.delete(callback); }
  };
  const MailServices = {
    accounts: { accounts },
    mfn: { folderAdded: 1, folderDeleted: 2, folderRenamed: 4,
      addListener(listener, mask) { assert.equal(mask, 7); folderListeners.add(listener); },
      removeListener(listener) { folderListeners.delete(listener); } }
  };
  const Services = { prefs: {
    addObserver(branch, observer) { const set = prefs.get(branch) ?? new Set(); set.add(observer); prefs.set(branch, set); },
    removeObserver(branch, observer) { prefs.get(branch)?.delete(observer); }
  } };
  assert.ok(Adapter?.create, "Thunderbird adapter factory must exist");
  const adapter = Adapter.create({ window, MailServices, Services,
    Ci: { nsMsgFolderFlags: flags, nsIPop3IncomingServer: {} },
    FolderUtils: { compareFolders(a, b) { return a.sortOrder - b.sortOrder || a.localizedName.localeCompare(b.localizedName); } }
  });
  return { adapter, window, accounts, archive, inbox, nested, prefs, folderListeners,
    events, observers, displays, makeFolder, MailServices,
    flush() { while (microtasks.length) { microtasks.shift()(); } },
    folderEvent() { for (const callback of events.get("folderURIChanged") ?? []) { callback({ detail: "ignore-untrusted-detail" }); } }
  };
}

test("native account order and stable server ownership exclude deferred chat hidden accounts", () => {
  const f = fixture();
  const accounts = f.adapter.listAccounts();
  assert.deepEqual(Array.from(accounts, account => account.id), ["b", "a", "local"]);
  assert.equal(accounts[1].serverKey, "server-a");
  assert.equal(accounts[2].local, true);
  f.accounts[1].incomingServer.prettyName = "Renamed";
  assert.equal(f.adapter.listAccounts()[1].name, "Renamed");
  assert.equal(f.adapter.accountForRow({ dataset: { serverKey: "server-a" } }), "a");
  assert.equal(f.adapter.accountForRow({ accountId: "b", dataset: { serverKey: "server-a" } }), "a");
  assert.equal(f.adapter.accountForRow({ dataset: { serverKey: "smart-server" } }), null);
  f.window.folderPane.hideLocalFolders = true;
  assert.deepEqual(Array.from(f.adapter.listAccounts(), account => account.id), ["b", "a"]);
});

test("folder traversal uses flags and native sibling ordering without reading messages", () => {
  const f = fixture();
  const folders = f.adapter.listFolders("a");
  assert.deepEqual(Array.from(folders, folder => folder.uri), ["fixture://a/root", "fixture://a/RenamedInbox", "fixture://a/Archive", "fixture://a/Nested"]);
  assert.equal(folders[0].root, true);
  assert.equal(folders[1].inbox, true);
  assert.equal(folders[1].accountId, "a");
  assert.ok(folders.every(folder => folder.available));
  assert.deepEqual(Array.from(f.adapter.listFolders("local"), folder => folder.uri), ["fixture://local/root"]);
  assert.equal(f.adapter.listFolders("missing").length, 0);
});

test("inaccessible folders and failed child enumeration preserve accessible siblings", () => {
  const f = fixture();
  const bad = { get URI() { throw Error("missing folder"); } };
  Object.defineProperty(f.archive, "subFolders", { get() { throw Error("children unavailable"); } });
  f.accounts[1].incomingServer.rootFolder.subFolders.push(bad);
  assert.deepEqual(Array.from(f.adapter.listFolders("a"), folder => folder.uri), ["fixture://a/root", "fixture://a/RenamedInbox", "fixture://a/Archive"]);
});

test("current folder requires live account and hierarchy membership rather than a cached URI", () => {
  const f = fixture();
  assert.equal(f.adapter.currentFolder().uri, "fixture://a/RenamedInbox");
  f.accounts[1].incomingServer.rootFolder.subFolders = [];
  assert.equal(f.adapter.currentFolder(), null);
  f.window.gFolder = { URI: "fixture://unknown/root", server: { key: "unknown" } };
  assert.equal(f.adapter.currentFolder(), null);
  f.window.gFolder = null;
  assert.equal(f.adapter.currentFolder(), null);
});

test("folder change callback reads the actual current folder and subscriptions detach", () => {
  const f = fixture(), seen = [];
  const dispose = f.adapter.onFolderChanged(folder => seen.push(folder?.uri ?? null));
  f.folderEvent();
  f.window.gFolder = null;
  f.folderEvent();
  assert.deepEqual(seen, ["fixture://a/RenamedInbox", null]);
  dispose(); dispose(); f.folderEvent();
  assert.equal(seen.length, 2);
  assert.equal(f.events.get("folderURIChanged").size, 0);
});

test("native display receives URI with its window receiver and modes are read only", () => {
  const f = fixture();
  f.adapter.displayFolder("fixture://a/RenamedInbox");
  assert.equal(f.displays[0].receiver, f.window);
  assert.equal(f.displays[0].uri, "fixture://a/RenamedInbox");
  const modes = f.adapter.activeModes();
  modes.push("unread");
  assert.deepEqual(f.window.folderPane.activeModes, ["all", "favorite"]);
});

test("account and server prefs plus folder rename delete add refresh after native mutations", () => {
  const f = fixture(), seen = [];
  const dispose = f.adapter.onAccountsChanged(() => seen.push(f.adapter.listFolders("a").map(folder => folder.uri)));
  assert.deepEqual([...f.prefs.keys()], ["mail.accountmanager.accounts", "mail.account.", "mail.server."]);
  const observer = [...f.prefs.get("mail.server.")][0];
  observer.observe(null, "nsPref:changed", "mail.server.server-a.name");
  for (const listener of f.folderListeners) {
    listener.folderRenamed(f.inbox, f.archive);
    listener.folderDeleted(f.inbox);
    listener.folderAdded(f.nested);
  }
  assert.equal(seen.length, 0);
  f.accounts[1].incomingServer.rootFolder.subFolders = [f.archive];
  f.flush();
  assert.equal(seen.length, 1);
  assert.ok(!seen[0].includes("fixture://a/RenamedInbox"));
  observer.observe(null, "nsPref:changed", "mail.server.server-a.name");
  dispose(); dispose(); f.flush();
  assert.equal(seen.length, 1);
  assert.equal(f.folderListeners.size, 0);
  assert.ok([...f.prefs.values()].every(set => set.size === 0));
});

test("mode observer responds only to mode composition and disconnects", () => {
  const f = fixture(), seen = [];
  const dispose = f.adapter.onModesChanged(() => seen.push(Array.from(f.adapter.activeModes())));
  const observer = f.observers[0];
  assert.equal(observer.target, f.window.document.getElementById("folderTree"));
  assert.deepEqual(structuredClone(observer.options), { childList: true });
  observer.callback([]);
  assert.equal(seen.length, 0);
  f.window.folderPane.activeModes = ["unread"];
  observer.callback([]);
  assert.deepEqual(seen, [["unread"]]);
  dispose(); dispose();
  f.window.folderPane.activeModes = ["all"];
  observer.callback([]);
  assert.equal(seen.length, 1);
  assert.equal(observer.disconnected, true);
});

test("adapter dispose removes every active subscription and cancels queued callbacks", () => {
  const f = fixture();
  let seen = 0;
  f.adapter.onFolderChanged(() => seen++);
  f.adapter.onAccountsChanged(() => seen++);
  f.adapter.onModesChanged(() => seen++);
  for (const listener of f.folderListeners) { listener.folderDeleted(f.inbox); }
  f.adapter.dispose(); f.adapter.dispose();
  f.flush(); f.folderEvent();
  for (const observer of f.observers) { observer.callback([]); }
  assert.equal(seen, 0);
  assert.equal(f.folderListeners.size, 0);
  assert.ok([...f.prefs.values()].every(set => set.size === 0));
  assert.ok(f.observers.every(observer => observer.disconnected));
  assert.equal(f.events.get("folderURIChanged").size, 0);
});

test("unavailable native row keeps hierarchy history available and refuses display", () => {
  const f = fixture();
  f.window.folderPane.getRowForFolder = () => null;
  assert.equal(f.adapter.canDisplayFolder("fixture://a/RenamedInbox"), false);
  assert.equal(f.adapter.listFolders("a").find(folder => folder.uri === "fixture://a/RenamedInbox").available, true);
  assert.equal(f.adapter.displayFolder("fixture://a/RenamedInbox"), false);
  assert.equal(f.displays.length, 0);
  f.window.folderPane.getRowForFolder = () => { throw Error("tree regenerating"); };
  assert.equal(f.adapter.canDisplayFolder("fixture://a/RenamedInbox"), false);
});

test("native navigation exceptions return false for controller fail-open", () => {
  const f = fixture();
  f.window.displayFolder = () => { throw Error("folder deleted"); };
  assert.equal(f.adapter.displayFolder("fixture://a/RenamedInbox"), false);
});

test("failed prefs registration rolls back all already registered observers", () => {
  const observers = new Set();
  const adapter = Adapter.create({ Services: { prefs: {
    addObserver(branch, observer) {
      if (branch === "mail.server.") { throw Error("prefs registration failed"); }
      observers.add(branch);
    },
    removeObserver(branch) { observers.delete(branch); }
  } } });
  assert.throws(() => adapter.onAccountsChanged(() => {}), /prefs registration failed/);
  assert.equal(observers.size, 0);
  adapter.dispose();
});

test("failed mode observation disconnects the new observer", () => {
  const f = fixture();
  f.window.MutationObserver.prototype.observe = function() { throw Error("tree missing"); };
  assert.throws(() => f.adapter.onModesChanged(() => {}), /tree missing/);
  assert.equal(f.observers[0].disconnected, true);
});

test("one inaccessible folder sort property does not hide accessible siblings", () => {
  const f = fixture();
  const bad = f.makeFolder("a", "Broken", 5);
  Object.defineProperty(bad, "sortOrder", { get() { throw Error("sort unavailable"); } });
  f.accounts[1].incomingServer.rootFolder.subFolders.push(bad);
  assert.deepEqual(Array.from(f.adapter.listFolders("a"), folder => folder.uri), ["fixture://a/root", "fixture://a/RenamedInbox", "fixture://a/Archive", "fixture://a/Nested"]);
});

test("native Local Folders hide toggle refreshes accounts without a server preference write", () => {
  const f = fixture(), seen = [];
  f.adapter.onAccountsChanged(() => seen.push(Array.from(f.adapter.listAccounts(), account => account.id)));
  f.window.folderPane.hideLocalFolders = true;
  for (const observer of f.observers) { observer.callback([]); }
  f.flush();
  assert.deepEqual(seen, [["b", "a"]]);
});

test("native tree loss of all selected-account rows clears the real controller with unchanged accounts and modes", () => {
  const f = fixture();
  const Model = loadScript("addon/lib/model.js", "AccountPaneModel");
  const Controller = loadScript("addon/experiment/controller.js", "AccountPaneController");
  const rows = new Map(f.adapter.listFolders("a").map(folder => [folder.uri, { uri: folder.uri }]));
  f.window.folderPane.getRowForFolder = uri => rows.get(uri) ?? null;
  const restrictions = [], selections = [], saved = [];
  const controller = Controller.create({ adapter: f.adapter, model: Model, settings: {},
    filter: { apply(id) { restrictions.push(id); } },
    view: { render(accounts, id) { selections.push(id); } },
    save(patch) { saved.push(structuredClone(patch)); }
  });
  assert.equal(selections.at(-1), "a");
  rows.clear();
  // No account pref/folder event/mode change accompanies this native rebuild.
  const mutation = [{ type: "childList", target: f.window.document.getElementById("folderTree") }];
  for (const observer of f.observers) { observer.callback(mutation); observer.callback(mutation); }
  f.flush();
  assert.equal(restrictions.at(-1), null);
  assert.equal(selections.at(-1), null);
  assert.deepEqual(saved, [{ selectedAccountId: null }]);
  assert.deepEqual(Array.from(f.adapter.listAccounts(), account => account.id), ["b", "a", "local"]);
  assert.deepEqual(Array.from(f.adapter.activeModes()), ["all", "favorite"]);
  assert.equal(f.adapter.currentFolder().uri, "fixture://a/RenamedInbox");
  assert.deepEqual(f.displays, []);
  const rendered = selections.length;
  f.flush();
  assert.equal(selections.length, rendered);
  controller.dispose(); f.adapter.dispose();
});

test("native same-account multiple selection survives tree refresh but removed selected rows recover", () => {
  const f = fixture();
  const Model = loadScript("addon/lib/model.js", "AccountPaneModel");
  const Controller = loadScript("addon/experiment/controller.js", "AccountPaneController");
  const tree = f.window.document.getElementById("folderTree");
  const rows = [f.inbox, f.archive].map(folder => ({ uri: folder.URI,
    dataset: { serverKey: folder.server.key } }));
  tree.rows = [...rows];
  tree.selection = new Set(rows);
  f.window.folderPane.getRowForFolder = uri => tree.rows.find(row => row.uri === uri) ?? null;
  const selections = [], saved = [];
  const controller = Controller.create({ adapter: f.adapter, model: Model, settings: {},
    filter: { apply() {} }, view: { render(accounts, id) { selections.push(id); } },
    save(patch) { saved.push(structuredClone(patch)); }
  });
  // about3Pane._onSelect clears gFolder and emits folderURIChanged for size > 1.
  f.window.gFolder = null;
  f.folderEvent();
  tree.rows.push({ uri: f.nested.URI, dataset: { serverKey: "server-a" } });
  const mutation = [{ type: "childList", target: tree }];
  for (const observer of f.observers) { observer.callback(mutation); }
  f.flush();
  assert.deepEqual(f.displays, [], "valid native multiple selection must not open a single folder");
  assert.deepEqual([...tree.selection], rows);
  assert.equal(selections.at(-1), "a");
  assert.deepEqual(saved, []);
  // A detached selected row is a real loss, even if another valid row remains.
  tree.rows = tree.rows.filter(row => row !== rows[1]);
  for (const observer of f.observers) { observer.callback(mutation); }
  f.flush();
  assert.deepEqual(f.displays.map(display => display.uri), ["fixture://a/RenamedInbox"]);
  assert.deepEqual(saved, [], "recovery intent must not fabricate history");
  controller.dispose(); f.adapter.dispose();
});
