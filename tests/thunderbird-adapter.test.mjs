import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { loadScript } from "./load-script.mjs";

const path = "addon/experiment/thunderbird-adapter.js";
const Adapter = existsSync(path) ? loadScript(path, "AccountPaneAdapter") : null;

function fixture() {
  const observers = [], prefs = new Map(), folderListeners = new Set(), events = new Map();
  const microtasks = [], displays = [], intListeners = new Set(), listenerMasks = [];
  const flags = { Inbox: 0x1000, Junk: 0x400, Virtual: 0x20 };
  const makeAccount = (id, type = "imap", extra = {}) => {
    const server = { key: `server-${id}`, prettyName: `Account ${id}`, type, hidden: false,
      QueryInterface() { return { deferredToAccount: extra.deferredToAccount ?? "" }; }, ...extra };
    const root = { URI: `fixture://${id}/root`, isServer: true, flags: 0, server,
      sortOrder: 0, localizedName: "Root", subFolders: [],
      unread: 0, total: 0,
      getNumUnread(deep) { assert.equal(deep, true); return this.unread; },
      getTotalMessages(deep) { assert.equal(deep, true); return this.total; } };
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
    document: { getElementById(id) { return id === "folderTree" ? tree : null; },
      addEventListener(name, callback) { const set = events.get(name) ?? new Set(); set.add(callback); events.set(name, set); },
      removeEventListener(name, callback) { events.get(name)?.delete(callback); } },
    folderPane: { activeModes: ["all", "favorite"], hideLocalFolders: false,
      getRowForFolder(uri) { return { uri }; } },
    gFolder: inbox,
    displayFolder(uri) { displays.push({ receiver: this, uri }); },
    addEventListener(name, callback) { const set = events.get(name) ?? new Set(); set.add(callback); events.set(name, set); },
    removeEventListener(name, callback) { events.get(name)?.delete(callback); }
  };
  const MailServices = {
    accounts: { accounts },
    mailSession: {
      AddFolderListener(listener, mask) { listenerMasks.push(mask); intListeners.add(listener); },
      RemoveFolderListener(listener) { intListeners.delete(listener); }
    },
    mfn: { folderAdded: 1, folderDeleted: 2, folderRenamed: 4,
      addListener(listener, mask) { assert.equal(mask, 7); folderListeners.add(listener); },
      removeListener(listener) { folderListeners.delete(listener); } }
  };
  const Services = { xulStore: { getValue() { return "false"; } }, prefs: {
    addObserver(branch, observer) { const set = prefs.get(branch) ?? new Set(); set.add(observer); prefs.set(branch, set); },
    removeObserver(branch, observer) { prefs.get(branch)?.delete(observer); }
  } };
  assert.ok(Adapter?.create, "Thunderbird adapter factory must exist");
  const adapter = Adapter.create({ window, MailServices, Services,
    Ci: { nsMsgFolderFlags: flags, nsIPop3IncomingServer: {}, nsIFolderListener: { intPropertyChanged: 8, boolPropertyChanged: 16 } },
    FolderUtils: { compareFolders(a, b) { return a.sortOrder - b.sortOrder || a.localizedName.localeCompare(b.localizedName); } }
  });
  return { adapter, window, accounts, archive, inbox, nested, prefs, folderListeners, intListeners, listenerMasks, Services, flags,
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

test("root recursive counts include collapsed physical folders and exclude invisible accounts", () => {
  const f = fixture();
  f.accounts[0].incomingServer.rootFolder.unread = 3;
  f.accounts[0].incomingServer.rootFolder.total = 10;
  f.accounts[1].incomingServer.rootFolder.unread = 4;
  f.accounts[1].incomingServer.rootFolder.total = 12;
  f.accounts[2].incomingServer.rootFolder.unread = 2;
  f.accounts[2].incomingServer.rootFolder.total = 5;
  f.accounts[5].incomingServer.rootFolder.unread = 99;
  assert.deepEqual(structuredClone(f.adapter.messageCounts()), {
    showTotal: false, accounts: {
      b: { unread: 3, total: 10, hasNew: false }, a: { unread: 4, total: 12, hasNew: false },
      local: { unread: 2, total: 5, hasNew: false }
    }
  });
  f.window.folderPane.hideLocalFolders = true;
  assert.deepEqual(Object.keys(f.adapter.messageCounts().accounts), ["b", "a"]);
});

test("unavailable native count is unknown without affecting other metrics or accounts", () => {
  const f = fixture();
  const root = f.accounts[1].incomingServer.rootFolder;
  root.unread = -1;
  root.total = 8;
  Object.defineProperty(f.accounts[0].incomingServer.rootFolder, "total", { get() { throw Error("unavailable"); } });
  const counts = f.adapter.messageCounts().accounts;
  assert.deepEqual(structuredClone(counts.a), { unread: null, total: 8, hasNew: false });
  assert.deepEqual(structuredClone(counts.b), { unread: 0, total: null, hasNew: false });
});

test("account recursive counts subtract every physical Junk branch once", () => {
  const f = fixture();
  const root = f.accounts[1].incomingServer.rootFolder;
  root.unread = 40; root.total = 100;
  const makeJunk = (name, unread, total, flags = f.flags.Junk) => ({
    URI: `fixture://a/${name}`, server: root.server, flags, localizedName: name,
    subFolders: [], getNumUnread(deep) { assert.equal(deep, true); return unread; },
    getTotalMessages(deep) { assert.equal(deep, true); return total; }
  });
  // The Junk root's native recursive metrics already include its child.
  const junk = makeJunk("Localized trash", 6, 13);
  junk.subFolders.push(makeJunk("nested junk", 2, 3));
  const otherJunk = makeJunk("Autre dossier", 3, 7);
  root.subFolders.push(junk, otherJunk);
  assert.deepEqual(structuredClone(f.adapter.messageCounts().accounts.a), { unread: 31, total: 80, hasNew: false });
});

test("virtual Junk subtree is skipped and literal Spam without the Junk flag is counted", () => {
  const f = fixture();
  const root = f.accounts[1].incomingServer.rootFolder;
  root.unread = 10; root.total = 20;
  const make = (name, flags, unread, total) => ({ URI: `fixture://a/${name}`, server: root.server,
    flags, localizedName: name, subFolders: [],
    getNumUnread() { return unread; }, getTotalMessages() { return total; } });
  const virtualJunk = make("virtual", f.flags.Junk | f.flags.Virtual, 4, 8);
  virtualJunk.subFolders.push(make("physical-under-virtual", f.flags.Junk, 1, 2));
  root.subFolders.push(virtualJunk, make("Spam", 0, 2, 3));
  assert.deepEqual(structuredClone(f.adapter.messageCounts().accounts.a), { unread: 10, total: 20, hasNew: false });
});

test("Junk metrics fail independently and failed enumeration invalidates both metrics", () => {
  const f = fixture();
  const root = f.accounts[1].incomingServer.rootFolder;
  root.unread = 12; root.total = 30;
  const junk = { URI: "fixture://a/Junk", server: root.server, flags: 0x400,
    localizedName: "Junk", subFolders: [], getNumUnread() { return -1; },
    getTotalMessages() { return 5; } };
  root.subFolders.push(junk);
  assert.deepEqual(structuredClone(f.adapter.messageCounts().accounts.a), { unread: null, total: 25, hasNew: false });
  Object.defineProperty(root, "subFolders", { get() { throw Error("enumeration failed"); } });
  assert.deepEqual(structuredClone(f.adapter.messageCounts().accounts.a), { unread: null, total: null, hasNew: false });
});

test("negative post-subtraction counts become unknown without clamping", () => {
  const f = fixture(), root = f.accounts[1].incomingServer.rootFolder;
  root.unread = 2; root.total = 10;
  root.subFolders.push({ URI: "fixture://a/Junk", server: root.server, flags: f.flags.Junk,
    localizedName: "Junk", subFolders: [], getNumUnread() { return 3; }, getTotalMessages() { return 4; } });
  assert.deepEqual(structuredClone(f.adapter.messageCounts().accounts.a), { unread: null, total: 6, hasNew: false });
});

test("no Junk branches preserve native counts and FolderFlag notifications coalesce", () => {
  const f = fixture(), root = f.accounts[1].incomingServer.rootFolder;
  root.unread = 6; root.total = 14;
  assert.deepEqual(structuredClone(f.adapter.messageCounts().accounts.a), { unread: 6, total: 14, hasNew: false });
  const seen = [];
  f.adapter.onMessageCountsChanged(() => seen.push(f.adapter.messageCounts()));
  for (const listener of f.intListeners) {
    listener.onFolderIntPropertyChanged(f.inbox, "FolderFlag");
    listener.onFolderIntPropertyChanged(f.inbox, "FolderFlag");
  }
  f.flush();
  assert.equal(seen.length, 1);
});

test("hasNew follows physical non-junk folders at any depth", () => {
  const f = fixture();
  assert.equal(f.adapter.messageCounts().accounts.a.hasNew, false);
  f.nested.hasNewMessages = true;
  const counts = f.adapter.messageCounts().accounts;
  assert.equal(counts.a.hasNew, true);
  assert.equal(counts.b.hasNew, false);
});

test("hasNew ignores new messages inside Junk branches and Virtual folders", () => {
  const f = fixture(), root = f.accounts[1].incomingServer.rootFolder;
  root.unread = 5; root.total = 9;
  const make = (name, flags, extra = {}) => ({ URI: `fixture://a/${name}`, server: root.server,
    flags, localizedName: name, subFolders: [], getNumUnread() { return 1; },
    getTotalMessages() { return 2; }, ...extra });
  const junk = make("Junk", f.flags.Junk, { hasNewMessages: true });
  junk.subFolders.push(make("junk-child", 0, { hasNewMessages: true }));
  root.subFolders.push(junk);
  assert.deepEqual(structuredClone(f.adapter.messageCounts().accounts.a),
    { unread: 4, total: 7, hasNew: false });
  junk.flags = 0; junk.hasNewMessages = false; junk.subFolders = [];
  const virtual = make("Search", f.flags.Virtual, { hasNewMessages: true });
  virtual.subFolders.push(make("under-virtual", 0, { hasNewMessages: true }));
  root.subFolders.push(virtual);
  assert.equal(f.adapter.messageCounts().accounts.a.hasNew, false);
});

test("a throwing hasNewMessages counts as no new mail without dropping Junk exclusion", () => {
  const f = fixture(), root = f.accounts[1].incomingServer.rootFolder;
  root.unread = 8; root.total = 20;
  Object.defineProperty(f.archive, "hasNewMessages", { get() { throw Error("unavailable"); } });
  root.subFolders.push({ URI: "fixture://a/Junk", server: root.server, flags: f.flags.Junk,
    localizedName: "Junk", subFolders: [], getNumUnread() { return 3; }, getTotalMessages() { return 4; } });
  assert.deepEqual(structuredClone(f.adapter.messageCounts().accounts.a),
    { unread: 5, total: 16, hasNew: false });
  f.inbox.hasNewMessages = true;
  assert.equal(f.adapter.messageCounts().accounts.a.hasNew, true);
});

test("NewMessages bool and BiffState int changes notify message count subscribers", () => {
  const f = fixture(), seen = [];
  f.adapter.onMessageCountsChanged(() => seen.push(true));
  // Native NewMessages arrives as a bool property; BiffState as an int.
  assert.deepEqual(f.listenerMasks, [8 | 16]);
  for (const listener of f.intListeners) listener.onFolderBoolPropertyChanged(f.inbox, "NewMessages", true, false);
  f.flush();
  assert.equal(seen.length, 1);
  for (const listener of f.intListeners) listener.onFolderBoolPropertyChanged(f.inbox, "Other", false, true);
  f.flush();
  assert.equal(seen.length, 1);
  for (const listener of f.intListeners) listener.onFolderIntPropertyChanged(f.inbox, "BiffState");
  f.flush();
  assert.equal(seen.length, 2);
});

test("native integer count changes coalesce separately and stop after disposal", () => {
  const f = fixture(), seen = [];
  const stop = f.adapter.onMessageCountsChanged(() => seen.push(f.adapter.messageCounts()));
  for (const listener of f.intListeners) {
    listener.onFolderIntPropertyChanged(f.inbox, "TotalUnreadMessages");
    listener.onFolderIntPropertyChanged(f.inbox, "TotalMessages");
    listener.onFolderIntPropertyChanged(f.inbox, "Other");
  }
  f.flush();
  assert.equal(seen.length, 1);
  for (const listener of f.intListeners) listener.onFolderIntPropertyChanged(f.inbox, "TotalUnreadMessages");
  stop(); f.flush();
  assert.equal(seen.length, 1);
  assert.equal(f.intListeners.size, 0);
});

test("native total toggle updates visibility with or without existing native rows", () => {
  const f = fixture(), seen = [];
  let visible = false;
  f.Services.xulStore.getValue = (url, id, attribute) => {
    assert.deepEqual([url, id, attribute],
      ["chrome://messenger/content/messenger.xhtml", "totalMsgCount", "visible"]);
    return visible ? "true" : "false";
  };
  f.adapter.onMessageCountsChanged(() => seen.push(f.adapter.messageCounts().showTotal));
  visible = true;
  for (const callback of f.events.get("command") ?? []) {
    callback({ target: { id: "folderPaneHeaderToggleTotalCount" } });
  }
  f.flush();
  assert.deepEqual(seen, [true]);
  visible = false;
  for (const observer of f.observers) {
    observer.callback([{ type: "attributes", attributeName: "hidden",
      target: { classList: { contains(name) { return name === "total-count"; } } } }]);
  }
  f.flush();
  assert.deepEqual(seen, [true, false]);
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
    view: { setExpanded() {}, render(accounts, id) { selections.push(id); } },
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
    filter: { apply() {} }, view: { setExpanded() {}, render(accounts, id) { selections.push(id); } },
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

test("explicit All-mode navigation selects the exact row even when the same URI is selected in Favorites", () => {
  const f = fixture(), row = { uri: f.inbox.URI };
  const calls = [];
  f.window.document.getElementById("folderTree").updateSelection = target => calls.push(["select", target]);
  f.window.ensureFolderTreeRowIsVisible = target => calls.push(["ensure", target]);
  f.window.folderPane.getRowForFolder = (uri, mode) => mode === "all" && uri === f.inbox.URI ? row : null;
  assert.equal(f.adapter.canDisplayFolder(f.inbox.URI, "all"), true);
  assert.equal(f.adapter.displayFolder(f.inbox.URI, "all"), true);
  assert.deepEqual(calls, [["ensure", row], ["select", row]]);
  assert.deepEqual(f.displays, []);
});

test("explicit account navigation adds All Folders while retaining every active mode", () => {
  const f = fixture();
  f.window.folderPane.activeModes = ["smart", "unread", "tags"];
  assert.equal(f.adapter.ensureAllFolders(), true);
  assert.deepEqual(Array.from(f.window.folderPane.activeModes), ["smart", "unread", "tags", "all"]);
  assert.equal(f.adapter.ensureAllFolders(), true);
  assert.equal(f.window.folderPane.activeModes.filter(mode => mode === "all").length, 1);
  f.adapter.dispose();
  assert.equal(f.adapter.ensureAllFolders(), false);
});

function contextFixture() {
  const f = fixture(), calls = [], listeners = new Set();
  const popup = {
    addEventListener(type, fn) { assert.equal(type, "popuphidden"); listeners.add(fn); },
    removeEventListener(type, fn) { listeners.delete(fn); },
    openPopupAtScreen(...args) { calls.push(["mouse", ...args]); },
    openPopup(...args) { calls.push(["keyboard", ...args]); },
    hidePopup() { calls.push(["hide"]); for (const fn of [...listeners]) fn({ target: popup }); }
  };
  const native = {
    _overrideFolder: null,
    setOverrideFolder(folder) { this._overrideFolder = folder; calls.push(["override", folder]); },
    clearOverrideFolder() { this._overrideFolder = null; calls.push(["clear"]); }
  };
  f.window.folderPaneContextMenu = native;
  const original = f.window.document.getElementById;
  f.window.document.getElementById = id => id === "folderPaneContext" ? popup : original(id);
  return { ...f, calls, popup, native, listeners };
}

test("account context menu uses the native server override without selecting a folder and cleans up", () => {
  const f = contextFixture(), anchor = {};
  assert.equal(f.adapter.showAccountContextMenu("a", { button: 2, screenX: 12, screenY: 34 }, anchor), true);
  assert.equal(f.native._overrideFolder, f.accounts[1].incomingServer.rootFolder);
  assert.deepEqual(f.calls.at(-1), ["mouse", 12, 34, true]);
  assert.deepEqual(f.displays, []);
  for (const fn of [...f.listeners]) fn({ target: f.popup });
  assert.equal(f.native._overrideFolder, null);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.adapter.showAccountContextMenu("b", { button: 0 }, anchor), true);
  assert.deepEqual(f.calls.at(-1), ["keyboard", anchor, "after_end", 0, 0, true]);
  f.adapter.dispose();
  assert.equal(f.native._overrideFolder, null);
  assert.equal(f.listeners.size, 0);
  assert.ok(f.calls.some(call => call[0] === "hide"));
});

test("invalid account and popup failure do not leave a native context override behind", () => {
  const f = contextFixture();
  assert.equal(f.adapter.showAccountContextMenu(null, { button: 2 }, {}), false);
  assert.equal(f.adapter.showAccountContextMenu("hidden", { button: 2 }, {}), false);
  assert.deepEqual(f.calls, []);
  f.popup.openPopupAtScreen = () => { throw Error("popup failed"); };
  assert.equal(f.adapter.showAccountContextMenu("a", { button: 2, screenX: 1, screenY: 2 }, {}), false);
  assert.equal(f.native._overrideFolder, null);
  assert.equal(f.listeners.size, 0);
});

test("context disposal does not close or clear another owner's native override", () => {
  const f = contextFixture();
  f.adapter.showAccountContextMenu("a", { button: 2, screenX: 1, screenY: 2 }, {});
  const other = {};
  f.native._overrideFolder = other;
  f.adapter.dispose();
  assert.equal(f.native._overrideFolder, other);
  assert.ok(!f.calls.some(call => call[0] === "hide" || call[0] === "clear"));
  assert.equal(f.listeners.size, 0);
});

test("account reorder persists native complete order while preserving hidden account slots", () => {
  const f = fixture(), calls = [];
  // Interleave hidden entries with visible accounts.
  const [b, a, local, im, deferred, hidden] = f.accounts;
  f.accounts.splice(0, f.accounts.length, b, im, a, deferred, local, hidden);
  f.MailServices.accounts.reorderAccounts = keys => calls.push(Array.from(keys));
  assert.equal(f.adapter.reorderAccount("local", "b", true), true);
  assert.deepEqual(calls, [["local", "im", "b", "deferred", "a", "hidden"]]);
  assert.deepEqual(f.displays, []);
  assert.equal(f.window.gFolder, f.inbox);
});
test("account reorder rejects invalid targets no-ops unavailable API and native failure", () => {
  const f = fixture(), calls = [];
  f.MailServices.accounts.reorderAccounts = keys => calls.push(Array.from(keys));
  for (const args of [[null, "a", true], ["a", "hidden", true], ["hidden", "a", true],
    ["a", "a", true], ["b", "a", true], ["a", "b", false], ["a", "b", "before"]]) {
    assert.equal(f.adapter.reorderAccount(...args), false);
  }
  assert.deepEqual(calls, []);
  delete f.MailServices.accounts.reorderAccounts;
  assert.equal(f.adapter.reorderAccount("local", "a", true), false);
  f.MailServices.accounts.reorderAccounts = () => { throw Error("fixture failure"); };
  assert.equal(f.adapter.reorderAccount("local", "a", true), false);
  f.adapter.dispose();
  assert.equal(f.adapter.reorderAccount("local", "a", true), false);
});

test("account reorder uses current visible order and keeps newly hidden Local Folders in place", () => {
  const f = fixture(), calls = [];
  f.MailServices.accounts.reorderAccounts = keys => calls.push(Array.from(keys));
  f.window.folderPane.hideLocalFolders = true;
  assert.equal(f.adapter.reorderAccount("a", "b", true), true);
  assert.deepEqual(calls, [["a", "b", "local", "im", "deferred", "hidden"]]);
  f.accounts[1].incomingServer.hidden = true;
  assert.equal(f.adapter.reorderAccount("a", "b", true), false);
  assert.equal(calls.length, 1);
});
