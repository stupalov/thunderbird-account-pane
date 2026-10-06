import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { loadScript } from "./load-script.mjs";
const path = fileURLToPath(new URL("../addon/experiment/lifecycle.js", import.meta.url));
function factory(logs = []) {
  assert.ok(existsSync(path), "lifecycle implementation must exist");
  return loadScript(path, "AccountPaneLifecycle", { console: { error: code => logs.push(code) } });
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture({ pending = false, ready = true, url = "about:3pane" } = {}) {
  let resolve;
  const promise = pending ? new Promise(r => { resolve = r; }) : Promise.resolve();
  const pane = { closed: false, folderPane: {}, folderTree: ready ? {} : null,
    hasDOMContentLoaded: { promise },
    document: { readyState: "complete", location: { href: url },
      getElementById: id => ready && ["folderPane", "folderTree"].includes(id) ? {} : null } };
  const listeners = new Map();
  const browser = { contentWindow: pane, contentDocument: pane.document,
    addEventListener(type, cb) { listeners.set(type, cb); },
    removeEventListener(type, cb) { if (listeners.get(type) === cb) listeners.delete(type); } };
  const tab = { mode: { name: "mail3PaneTab" }, chromeBrowser: browser, closed: false };
  const monitors = new Set();
  const tabmail = { tabInfo: [tab], currentTabInfo: tab,
    registerTabMonitor(monitor) { monitors.add(monitor); monitor.onTabSwitched(tab, null); },
    unregisterTabMonitor(monitor) { monitors.delete(monitor); } };
  const window = { closed: false, document: { getElementById: () => tabmail } };
  let load, unload, removed = 0;
  const hooks = { watchWindows(onLoad, onUnload) {
    load = onLoad; unload = onUnload; onLoad(window); return () => { removed++; };
  } };
  const attached = [], cleaned = [], logs = [];
  const lifecycle = factory(logs).create({ hooks, attachPane(w) {
    attached.push(w.document); return () => cleaned.push(w.document);
  } });
  return { lifecycle, hooks, logs, pane, browser, tab, tabmail, monitors, listeners, attached, cleaned,
    resolve: () => resolve?.(), load: () => load(window), unload: () => unload(window),
    removed: () => removed };
}
test("existing pane attaches once after native initialization despite repeat start and tab events", async () => {
  const f = fixture({ pending: true }); f.lifecycle.start(); f.lifecycle.start(); f.load();
  await tick(); assert.equal(f.attached.length, 0); f.resolve(); await tick();
  assert.equal(f.attached.length, 1);
  [...f.monitors][0].onTabRestored(f.tab); [...f.monitors][0].onTabSwitched(f.tab);
  await tick(); assert.equal(f.attached.length, 1);
  f.lifecycle.dispose(); f.lifecycle.dispose(); assert.equal(f.cleaned.length, 1);
  assert.equal(f.monitors.size, 0); assert.equal(f.removed(), 1);
});
test("new and restored mail tabs attach and closing disposes only that pane", async () => {
  const f = fixture(); f.lifecycle.start(); await tick();
  const second = fixture(); f.tabmail.tabInfo.push(second.tab);
  const monitor = [...f.monitors][0]; monitor.onTabOpened(second.tab); await tick();
  assert.equal(f.attached.length, 2); monitor.onTabClosing(second.tab); second.tab.closed = true;
  assert.equal(f.cleaned.length, 1); f.unload(); assert.equal(f.cleaned.length, 2);
  f.lifecycle.dispose(); assert.equal(f.cleaned.length, 2);
});
test("close or dispose cancels a pending initialization without late attachment", async () => {
  for (const close of [true, false]) {
    const f = fixture({ pending: true }); f.lifecycle.start();
    if (close) { [...f.monitors][0].onTabClosing(f.tab); f.tab.closed = true; }
    else f.lifecycle.dispose();
    f.resolve(); await tick(); assert.equal(f.attached.length, 0);
    f.lifecycle.dispose(); assert.equal(f.cleaned.length, 0);
  }
});
test("loading browser retries on its document load and removes waiting handler on teardown", async () => {
  const f = fixture(); f.pane.document.readyState = "loading"; f.lifecycle.start();
  assert.equal(f.listeners.size, 1); assert.equal(f.attached.length, 0);
  f.pane.document.readyState = "complete";
  f.listeners.get("load")({ target: f.pane.document }); await tick();
  assert.equal(f.attached.length, 1); assert.equal(f.listeners.size, 0); f.lifecycle.dispose();
  const waiting = fixture(); waiting.pane.document.readyState = "loading";
  waiting.lifecycle.start(); waiting.lifecycle.dispose(); assert.equal(waiting.listeners.size, 0);
});
test("incompatible, missing readiness, rejected readiness and nonmail panes stay untouched", async () => {
  const variants = [fixture({ ready: false }), fixture({ url: "about:message" }), fixture(), fixture(), fixture()];
  delete variants[2].pane.hasDOMContentLoaded;
  variants[3].pane.hasDOMContentLoaded.promise = Promise.reject(new Error("synthetic"));
  variants[4].tab.mode.name = "mailMessageTab";
  for (const f of variants) f.lifecycle.start();
  await tick();
  for (const f of variants) { assert.equal(f.attached.length, 0); f.lifecycle.dispose(); }
});
test("document replacement while initialization is pending cannot attach the stale pane", async () => {
  const f = fixture({ pending: true }); f.lifecycle.start();
  const next = fixture(); f.browser.contentWindow = next.pane; f.browser.contentDocument = next.pane.document;
  f.resolve(); await tick(); assert.equal(f.attached.length, 0);
  [...f.monitors][0].onTabSwitched(f.tab); await tick(); assert.equal(f.attached.length, 1);
  f.lifecycle.dispose(); assert.equal(f.cleaned.length, 1);
});
test("attachment failure and partial window registration roll back without leaking monitors", async () => {
  const f = fixture();
  const lifecycle = factory(f.logs).create({ hooks: f.hooks, attachPane() { throw Error("synthetic"); } });
  lifecycle.start(); await tick(); lifecycle.dispose(); assert.equal(f.monitors.size, 0);
  const g = fixture(); g.tabmail.registerTabMonitor = monitor => { g.monitors.add(monitor); throw Error("synthetic"); };
  g.lifecycle.start(); g.lifecycle.dispose(); assert.equal(g.monitors.size, 0);
});
test("retained native callbacks after window unload cannot attach another pane", async () => {
  const f = fixture(); f.lifecycle.start(); await tick(); const monitor = [...f.monitors][0];
  f.unload(); const late = fixture(); monitor.onTabOpened(late.tab); await tick();
  assert.equal(f.attached.length, 1); assert.equal(f.cleaned.length, 1); f.lifecycle.dispose();
});
test("throwing native monitor removal does not prevent pane cleanup", async () => {
  const f = fixture(); f.lifecycle.start(); await tick();
  f.tabmail.unregisterTabMonitor = () => { throw Error("synthetic"); };
  assert.doesNotThrow(() => f.lifecycle.dispose()); assert.equal(f.cleaned.length, 1);
  assert.deepEqual(f.logs, ["ACCOUNTPANE_CLEANUP_FAILED"]);
});
