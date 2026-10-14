import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
const path = new URL("../addon/experiment/implementation.js", import.meta.url);
function fixture({ failFilter = false, delayCSS = false, failController = false, failCSS = false,
  packagedRootURI = null } = {}) {
  assert.ok(existsSync(path), "Experiment implementation must exist");
  const events = [], logs = [], controllers = [], loaded = []; let attach, cssCallback, register, globalScope;
  const settings = { version: 1, selectedAccountId: null, lastFolders: {} };
  const FolderUtils = { compareFolders() {} }, MailServices = {}, Ci = {};
  const pane = { document: { getElementById: () => ({}) } };
  const adapter = { accountForRow: row => row.account,
    showAccountContextMenu: (...args) => events.push(["context", ...args]),
    reorderAccount: (...args) => events.push(["reorder", ...args]),
    dispose: () => events.push("adapter-dispose") };
  const filter = { dispose: () => events.push("filter-dispose") };
  const view = { dispose: () => events.push("view-dispose") };
  let follow, select, save, expand, contextMenu, reorder;
  const helpers = {
    AccountPaneModel: {},
    AccountPaneAdapter: { create(options) { assert.equal(options.window, pane);
      assert.equal(options.FolderUtils, FolderUtils); assert.equal(options.MailServices, MailServices);
      assert.equal(options.Ci, Ci); assert.equal(options.Services, Services); events.push("adapter"); return adapter; } },
    AccountPaneView: { create(options) { events.push("view"); assert.equal(options.labels.accounts, "Accounts");
      assert.equal(options.labels.allAccounts, "All Accounts"); assert.equal(options.cssText, "fixture CSS");
      assert.equal(options.labels.expandAccounts, "Expand accounts");
      assert.equal(options.labels.collapseAccounts, "Collapse accounts");
      select = options.onSelect; expand = options.onExpandedChanged; contextMenu = options.onContextMenu; reorder = options.onReorder; return view; } },
    AccountPaneTreeFilter: { attach(options) { events.push("filter");
      assert.equal(options.accountForRow({ account: "a" }), "a"); follow = options.followTarget;
      if (failFilter) throw Error("private"); return filter; } },
    AccountPaneController: { create(options) { events.push("controller"); save = options.save;
      if (failController) throw Error("private fixture://uri");
      const controller = { dispose: () => events.push("controller-dispose"),
        selectAccount: id => events.push(["select", id]), followFolder: id => events.push(["follow", id]),
        setAccountsExpanded: value => events.push(["expanded", value]),
        updateSettings: value => events.push(["settings", value]) }; controllers.push(controller); return controller; } },
    AccountPaneLifecycle: { create(options) { attach = options.attachPane;
      return { start() { events.push("start"); }, dispose() { events.push("lifecycle-dispose"); disposer?.(); } }; } }
  };
  let disposer;
  const Services = { scriptloader: {
    loadSubScript(url, scope) {
      if (url.startsWith("jar:")) throw Error("packaged scripts require explicit permission");
      loaded.push({ url, scope }); Object.assign(scope, helpers);
    },
    loadSubScriptWithOptions(url, options) {
      assert.ok(url.startsWith(packagedRootURI ?? "moz-extension://fixture/"));
      assert.equal(options.allowUnsafeURL, true);
      assert.notEqual(options.target, globalScope);
      assert.equal(typeof options.target, "object");
      loaded.push({ url, scope: options.target }); Object.assign(options.target, helpers);
    }
  },
    obs: { notifyObservers(subject, topic, data) { events.push(["notify", subject, topic, data]); } } };
  class ExtensionAPI { constructor(extension) { this.extension = extension; } }
  class EventManager { constructor(options) { register = options.register; } api() { return { register }; } }
  const ExtensionSupport = { registerWindowListener: () => true, unregisterWindowListener() {} };
  const NetUtil = { asyncFetch(options, callback) { if (failCSS) throw Error("private fixture://uri"); assert.equal(options.loadUsingSystemPrincipal, true);
      assert.ok(options.uri.startsWith(packagedRootURI ?? "moz-extension://fixture/")); cssCallback = callback;
      if (!delayCSS) callback({ available: () => 11, close() {} }, 0); }, readInputStreamToString: () => "fixture CSS" };
  const modules = { Services, MailServices, FolderUtils, ExtensionSupport, NetUtil };
  const extension = { id: "accountpane@stupalov.github.io", rootURI: { resolve: p => (packagedRootURI ?? "moz-extension://fixture/") + p },
    localeData: { localizeMessage: key => ({ accounts: "Accounts", allAccounts: "All Accounts",
      expandAccounts: "Expand accounts", collapseAccounts: "Collapse accounts" })[key] } };
  const scope = vm.createContext({ ExtensionCommon: { ExtensionAPI, EventManager }, Services, Ci,
    Components: { isSuccessCode: status => status === 0 }, ChromeUtils: { importESModule(url) {
      const name = url.split("/").at(-1).split(".")[0]; assert.ok(modules[name], url); return { [name]: modules[name] };
    } }, console: { error: code => logs.push(code) } });
  globalScope = scope;
  vm.runInContext(readFileSync(path, "utf8"), scope);
  const implementation = new scope.accountPane(extension), api = implementation.getAPI({}).accountPane;
  return { implementation, api, events, logs, loaded, settings, controllers,
    attach() { disposer = attach(pane); return disposer; }, select: id => select(id), follow: id => follow(id),
    expand: value => expand(value), contextMenu: (...args) => contextMenu(...args),
    reorder: (...args) => reorder(...args),
    save: patch => save(patch), completeCSS: () => cssCallback({ available: () => 11, close() {} }, 0),
    listen: fire => register(fire), scope };
}
test("Experiment isolates helpers and wires controller adapter filter view and save result", async () => {
  const f = fixture(); const result = Promise.resolve("ack"); const patches = [];
  f.listen({ async(patch) { patches.push(patch); return result; } });
  await f.api.start(f.settings); await f.api.start(f.settings); f.attach();
  assert.equal(f.events.filter(v => v === "start").length, 1); assert.equal(f.loaded.length, 6);
  assert.ok(f.loaded.every(v => v.scope === f.loaded[0].scope)); assert.equal(f.scope.AccountPaneModel, undefined);
  f.select("a"); f.follow(null); f.expand(false);
  const menuEvent = { button: 2 }, anchor = {};
  f.contextMenu("a", menuEvent, anchor);
  assert.deepEqual(f.events.at(-1), ["context", "a", menuEvent, anchor]);
  assert.ok(f.events.some(v => Array.isArray(v) && v[0] === "follow" && v[1] === null));
  assert.ok(f.events.some(v => Array.isArray(v) && v[0] === "expanded" && v[1] === false));
  assert.equal(await f.save({ selectedAccountId: "a" }), "ack"); assert.equal(patches.length, 1);
  await f.api.settingsChanged({ ...f.settings, lastFolders: { a: "fixture://a/one" } });
  assert.equal(f.events.at(-1)[0], "settings");
  f.implementation.onShutdown(false);
  assert.deepEqual(f.events.slice(-6), ["lifecycle-dispose", "controller-dispose", "adapter-dispose", "filter-dispose", "view-dispose",
    ["notify", null, "startupcache-invalidate", null]]);
});
test("packaged Experiment loads only its six fixed helpers into one isolated scope", async () => {
  const root = "jar:file:///fixture/accountpane.xpi!/";
  const f = fixture({ packagedRootURI: root }); f.listen({ async: () => Promise.resolve() });
  await f.api.start(f.settings);
  assert.equal(f.loaded.length, 6);
  assert.ok(f.loaded.every(item => item.url.startsWith(root) && item.scope === f.loaded[0].scope));
  assert.deepEqual(f.loaded.map(item => item.url.slice(root.length)), ["lib/model.js", "experiment/tree-filter.js",
    "experiment/account-view.js", "experiment/controller.js", "experiment/thunderbird-adapter.js", "experiment/lifecycle.js"]);
  assert.equal(f.scope.AccountPaneModel, undefined);
  f.implementation.onShutdown(true);
});
test("partial filter attach failure rolls back view and adapter and logs only a fixed code", async () => {
  const f = fixture({ failFilter: true }); f.listen({ async: () => Promise.resolve() }); await f.api.start(f.settings);
  f.attach(); assert.deepEqual(f.events.slice(-2), ["adapter-dispose", "view-dispose"]);
  assert.deepEqual(f.logs, ["ACCOUNTPANE_ATTACH_FAILED"]); assert.equal(f.controllers.length, 0);
  f.implementation.onShutdown(true); assert.ok(!f.events.some(v => Array.isArray(v) && v[0] === "notify"));
});
test("shutdown during CSS read cannot install a late lifecycle", async () => {
  const f = fixture({ delayCSS: true }); f.listen({ async: () => Promise.resolve() });
  const pending = f.api.start(f.settings); f.implementation.onShutdown(false); f.completeCSS(); await pending;
  assert.ok(!f.events.includes("start"));
});
test("listener rejection reaches save caller and unregister restores panes", async () => {
  const f = fixture(); const stop = f.listen({ async: () => Promise.reject(Error("synthetic")) });
  await f.api.start(f.settings); f.attach(); await assert.rejects(f.save({ selectedAccountId: "a" }));
  stop(); assert.deepEqual(f.events.slice(-5), ["lifecycle-dispose", "controller-dispose", "adapter-dispose", "filter-dispose", "view-dispose"]);
  f.implementation.onShutdown(true);
});
test("start without a background listener leaves native panes untouched", async () => {
  const f = fixture(); await assert.rejects(f.api.start(f.settings), { message: "ACCOUNTPANE_LISTENER_UNAVAILABLE" });
  assert.ok(!f.events.includes("start"));
});
test("partial controller failure rolls back every created provider", async () => {
  const f = fixture({ failController: true }); f.listen({ async: () => Promise.resolve() }); await f.api.start(f.settings);
  f.attach(); assert.deepEqual(f.events.slice(-3), ["adapter-dispose", "filter-dispose", "view-dispose"]);
  assert.deepEqual(f.logs, ["ACCOUNTPANE_ATTACH_FAILED"]); f.implementation.onShutdown(true);
});
test("packaged CSS read failure exposes only a generic startup rejection", async () => {
  const f = fixture({ failCSS: true }); f.listen({ async: () => Promise.resolve() });
  await assert.rejects(f.api.start(f.settings), { message: "ACCOUNTPANE_START_FAILED" });
  assert.ok(!f.events.includes("start")); f.implementation.onShutdown(true);
});
test("concurrent startup waits one resource load and uses latest shared history", async () => {
  const f = fixture({ delayCSS: true }); f.listen({ async: () => Promise.resolve() });
  const first = f.api.start(f.settings), second = f.api.start(f.settings);
  await f.api.settingsChanged({ ...f.settings, lastFolders: { a: "fixture://a/new" } });
  f.completeCSS(); await Promise.all([first, second]); assert.equal(f.loaded.length, 6);
  assert.equal(f.events.filter(v => v === "start").length, 1); f.attach(); f.implementation.onShutdown(true);
});
test("all callers sharing failed startup receive the same generic rejection", async () => {
  const f = fixture({ failCSS: true }); f.listen({ async: () => Promise.resolve() });
  const results = await Promise.allSettled([f.api.start(f.settings), f.api.start(f.settings)]);
  assert.deepEqual(results.map(value => value.reason.message), ["ACCOUNTPANE_START_FAILED", "ACCOUNTPANE_START_FAILED"]);
  f.implementation.onShutdown(true);
});

test("Experiment delegates drag reordering solely to the native account adapter", async () => {
  const f = fixture(); f.listen({ async: () => Promise.resolve() });
  await f.api.start(f.settings); f.attach();
  const before = f.events.length;
  f.reorder("b", "a", true);
  assert.deepEqual(f.events.slice(before), [["reorder", "b", "a", true]]);
  f.implementation.onShutdown(true);
});
