import assert from "node:assert/strict";
import test from "node:test";
import { loadScript } from "./load-script.mjs";
import { makeTreeFixture, makeTreeRow } from "./fixtures.mjs";

const filters = loadScript("addon/experiment/tree-filter.js", "AccountPaneTreeFilter");
const ids = tree => Array.from(tree.rows, row => row.accountId);

test("filtered rows exclude foreign branches and restore exactly", () => {
  const fixture = makeTreeFixture();
  const original = fixture.tree.rows;
  const filter = filters.attach(fixture.options);
  filter.apply("a");
  assert.deepEqual(ids(fixture.tree), ["a"]);
  assert.equal(fixture.tree.allRows[1].getAttribute("data-accountpane-hidden"), "true");
  filter.dispose();
  assert.deepEqual(Array.from(fixture.tree.rows), original);
  assert.equal(Object.hasOwn(fixture.tree, "rows"), false);
  assert.equal(fixture.tree.allRows[1].getAttribute("data-accountpane-hidden"), null);
});

test("native row indexing and Home/End retain collapse semantics", () => {
  const f = makeTreeFixture();
  const child = makeTreeRow("a", f.tree.allRows[0]);
  f.tree.allRows.splice(1, 0, child);
  f.tree.allRows[0].collapsed = true;
  const prototypeDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(f.tree), "rows");
  const filter = filters.attach(f.options);
  filter.apply("a");
  assert.equal(f.tree.rowCount, 1);
  assert.equal(f.tree.getRowAtIndex(0), f.tree.allRows[0]);
  assert.equal(f.tree.getRowAtIndex(1), undefined);
  f.tree.key("End");
  assert.deepEqual(f.tree.selection, [f.tree.allRows[0]]);
  f.tree.allRows[0].collapsed = false;
  assert.equal(f.tree.rowCount, 2);
  f.tree.key("End");
  assert.deepEqual(f.tree.selection, [child]);
  f.tree.key("Home");
  assert.deepEqual(f.tree.selection, [f.tree.allRows[0]]);
  assert.deepEqual(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(f.tree), "rows"), prototypeDescriptor);
  filter.dispose();
});

test("foreign external navigation synchronizes before ensure and selection", () => {
  const f = makeTreeFixture();
  const filter = filters.attach(f.options);
  filter.apply("a");
  const row = f.tree.allRows[1];
  const event = { type: "synthetic" };
  assert.equal(f.window.ensureFolderTreeRowIsVisible(row, event), "ensured");
  assert.equal(f.tree.updateSelection(row, event), "updated");
  assert.deepEqual(f.events.map(event => event.type), ["follow", "ensure", "update"]);
  assert.equal(f.events[0].accountId, "b");
  for (const event of f.events) { assert.deepEqual(event.rows, [row]); }
  assert.equal(f.events[1].marker, null);
  assert.equal(f.events[1].receiver, f.window);
  assert.deepEqual(f.events[1].args, [row, event]);
  assert.equal(f.events[2].receiver, f.tree);
  assert.deepEqual(f.events[2].args, [row, event]);
  filter.dispose();
});

test("direct selection synchronizes while All Accounts stays unrestricted", () => {
  const f = makeTreeFixture();
  const filter = filters.attach(f.options);
  filter.apply("a");
  f.tree.updateSelection(f.tree.allRows[1]);
  assert.deepEqual(ids(f.tree), ["b"]);
  filter.apply(null);
  f.events.length = 0;
  f.window.ensureFolderTreeRowIsVisible(f.tree.allRows[0]);
  f.tree.updateSelection(f.tree.allRows[0]);
  assert.deepEqual(ids(f.tree), ["a", "b"]);
  assert.deepEqual(f.events.map(event => event.type), ["ensure", "update"]);
  filter.dispose();
});

test("same-account swap follows target and mixed swap preserves entire selection", () => {
  const f = makeTreeFixture();
  const filter = filters.attach(f.options);
  filter.apply("a");
  const same = [f.tree.allRows[1]];
  assert.equal(f.tree.swapSelection(same), "swapped");
  assert.deepEqual(ids(f.tree), ["b"]);
  assert.deepEqual(f.events.map(event => event.type), ["follow", "swap"]);
  f.events.length = 0;
  const mixed = [...f.tree.allRows];
  assert.equal(f.tree.swapSelection(mixed), "swapped");
  assert.deepEqual(ids(f.tree), ["a", "b"]);
  assert.deepEqual(f.tree.selection, mixed);
  assert.deepEqual(f.events.map(event => event.type), ["follow", "swap"]);
  assert.equal(f.events[0].accountId, null);
  assert.equal(f.events[1].args[0], mixed);
  filter.dispose();
});

test("observer marks dynamic favorite rows without an account ancestor", () => {
  const f = makeTreeFixture(["a"]);
  const filter = filters.attach(f.options);
  filter.apply("a");
  const favorite = makeTreeRow("b");
  f.tree.allRows.push(favorite);
  f.mutate();
  assert.equal(favorite.getAttribute("data-accountpane-hidden"), "true");
  assert.deepEqual(ids(f.tree), ["a"]);
  assert.deepEqual({ ...f.observers[0].options }, { childList: true, subtree: true });
  f.tree.allRows.pop();
  f.mutate();
  assert.equal(favorite.getAttribute("data-accountpane-hidden"), null);
  filter.dispose();
  assert.equal(f.observers[0].disconnected, true);
});

test("dispose restores own descriptors and cleans only attributes it changed", () => {
  const f = makeTreeFixture(["a", "b", "b", "b"]);
  f.tree.allRows[1].setAttribute("data-accountpane-hidden", "true");
  f.tree.allRows[2].setAttribute("data-accountpane-hidden", "previous");
  f.tree.allRows[3].setAttribute("hidden", "true");
  const ownGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(f.tree), "rows").get;
  Object.defineProperty(f.tree, "rows", { get: ownGetter, enumerable: true, configurable: true });
  f.tree.updateSelection = f.tree.updateSelection.bind(f.tree);
  const before = Object.getOwnPropertyDescriptors(f.tree);
  const beforeEnsure = Object.getOwnPropertyDescriptor(f.window, "ensureFolderTreeRowIsVisible");
  const filter = filters.attach(f.options);
  filter.apply("a");
  f.tree.allRows[3].setAttribute("data-accountpane-hidden", "other-owner");
  filter.dispose();
  filter.dispose();
  assert.deepEqual(Object.getOwnPropertyDescriptors(f.tree), before);
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.window, "ensureFolderTreeRowIsVisible"), beforeEnsure);
  assert.equal(f.tree.allRows[1].getAttribute("data-accountpane-hidden"), "true");
  assert.equal(f.tree.allRows[2].getAttribute("data-accountpane-hidden"), "previous");
  assert.equal(f.tree.allRows[3].getAttribute("data-accountpane-hidden"), "other-owner");
  assert.equal(f.tree.allRows[3].getAttribute("hidden"), "true");
});

test("captured wrappers pass through after disposal without replacing later owners", () => {
  const f = makeTreeFixture();
  const filter = filters.attach(f.options);
  filter.apply("a");
  const capturedRows = Object.getOwnPropertyDescriptor(f.tree, "rows").get;
  const capturedUpdate = f.tree.updateSelection;
  const capturedSwap = f.tree.swapSelection;
  const capturedEnsure = f.window.ensureFolderTreeRowIsVisible;
  const laterGetter = function() { return capturedRows.call(this); };
  const laterUpdate = function(...args) { return capturedUpdate.apply(this, args); };
  const laterEnsure = function(...args) { return capturedEnsure.apply(this, args); };
  Object.defineProperty(f.tree, "rows", { configurable: true, get: laterGetter });
  f.tree.updateSelection = laterUpdate;
  f.window.ensureFolderTreeRowIsVisible = laterEnsure;
  filter.dispose();
  assert.equal(Object.getOwnPropertyDescriptor(f.tree, "rows").get, laterGetter);
  assert.equal(f.tree.updateSelection, laterUpdate);
  assert.equal(f.window.ensureFolderTreeRowIsVisible, laterEnsure);
  assert.deepEqual(ids(f.tree), ["a", "b"]);
  f.events.length = 0;
  f.window.ensureFolderTreeRowIsVisible(f.tree.allRows[1]);
  f.tree.updateSelection(f.tree.allRows[1]);
  capturedSwap.call(f.tree, [...f.tree.allRows]);
  assert.deepEqual(f.events.map(event => event.type), ["ensure", "update", "swap"]);
});

test("attach is idempotent and can attach afresh after disposal", () => {
  const f = makeTreeFixture();
  const first = filters.attach(f.options);
  assert.equal(filters.attach(f.options), first);
  first.apply("a");
  first.dispose();
  const second = filters.attach(f.options);
  assert.notEqual(second, first);
  second.apply("b");
  assert.deepEqual(ids(f.tree), ["b"]);
  second.dispose();
  assert.equal(Object.hasOwn(f.tree, "rows"), false);
  assert.equal(Object.hasOwn(f.tree, "updateSelection"), false);
});

test("unavailable hooks reject before any mutation", () => {
  for (const breakHook of [
    f => { f.window.ensureFolderTreeRowIsVisible = null; },
    f => { f.tree.swapSelection = null; },
    f => Object.defineProperty(f.tree, "rows", { value: [], configurable: true }),
    f => Object.defineProperty(f.tree, "rows", { get() { return []; }, configurable: false }),
    f => Object.defineProperty(f.tree, "updateSelection", { value() {}, configurable: false }),
    f => Object.preventExtensions(f.tree)
  ]) {
    const f = makeTreeFixture();
    breakHook(f);
    const beforeTree = Object.getOwnPropertyDescriptors(f.tree);
    const beforeWindow = Object.getOwnPropertyDescriptors(f.window);
    assert.throws(() => filters.attach(f.options), { name: "TypeError" });
    assert.deepEqual(Object.getOwnPropertyDescriptors(f.tree), beforeTree);
    assert.deepEqual(Object.getOwnPropertyDescriptors(f.window), beforeWindow);
    assert.equal(f.observers.length, 0);
  }
});

test("a failing follow callback clears restrictions and delegates native navigation", () => {
  const f = makeTreeFixture();
  f.options.followTarget = () => { throw new Error("synthetic callback failure"); };
  const filter = filters.attach(f.options);
  filter.apply("a");
  assert.equal(f.window.ensureFolderTreeRowIsVisible(f.tree.allRows[1]), "ensured");
  assert.equal(f.tree.updateSelection(f.tree.allRows[1]), "updated");
  assert.deepEqual(ids(f.tree), ["a", "b"]);
  assert.deepEqual(f.tree.selection, [f.tree.allRows[1]]);
  assert.equal(f.tree.allRows[0].getAttribute("data-accountpane-hidden"), null);
  filter.dispose();
});

test("refresh preserves a later marker owner's value when hiding again", () => {
  const f = makeTreeFixture();
  const filter = filters.attach(f.options);
  filter.apply("a");
  const foreign = f.tree.allRows[1];
  foreign.setAttribute("data-accountpane-hidden", "later-owner");
  filter.refresh();
  assert.equal(foreign.getAttribute("data-accountpane-hidden"), "true");
  filter.apply(null);
  assert.equal(foreign.getAttribute("data-accountpane-hidden"), "later-owner");
  filter.dispose();
});

test("external navigation reveals a collapsed foreign branch before selection", () => {
  const f = makeTreeFixture();
  const parent = f.tree.allRows[1];
  parent.collapsed = true;
  const child = makeTreeRow("b", parent);
  f.tree.allRows.push(child);
  const filter = filters.attach(f.options);
  filter.apply("a");
  assert.equal(child.getAttribute("data-accountpane-hidden"), "true");
  f.window.ensureFolderTreeRowIsVisible(child);
  assert.equal(parent.collapsed, false);
  assert.equal(parent.getAttribute("data-accountpane-hidden"), null);
  assert.equal(child.getAttribute("data-accountpane-hidden"), null);
  f.tree.updateSelection(child);
  assert.deepEqual(ids(f.tree), ["b", "b"]);
  assert.deepEqual(f.tree.selection, [child]);
  assert.deepEqual(f.events.map(event => event.type), ["follow", "ensure", "update"]);
  filter.dispose();
});

test("attach rollback restores hooks when observing the tree fails", () => {
  const f = makeTreeFixture();
  f.window.MutationObserver = class {
    observe() { throw new Error("synthetic observer failure"); }
    disconnect() {}
  };
  const treeBefore = Object.getOwnPropertyDescriptors(f.tree);
  const windowBefore = Object.getOwnPropertyDescriptors(f.window);
  assert.throws(() => filters.attach(f.options), /synthetic observer failure/);
  assert.deepEqual(Object.getOwnPropertyDescriptors(f.tree), treeBefore);
  assert.deepEqual(Object.getOwnPropertyDescriptors(f.window), windowBefore);
});

test("writable non-configurable native methods keep flags and restore values", () => {
  const f = makeTreeFixture();
  const nativeEnsure = f.window.ensureFolderTreeRowIsVisible;
  Object.defineProperty(f.window, "ensureFolderTreeRowIsVisible", {
    value: nativeEnsure, writable: true, configurable: false, enumerable: true
  });
  const before = Object.getOwnPropertyDescriptor(f.window, "ensureFolderTreeRowIsVisible");
  const filter = filters.attach(f.options);
  filter.apply("a");
  f.window.ensureFolderTreeRowIsVisible(f.tree.allRows[1]);
  assert.deepEqual(ids(f.tree), ["b"]);
  assert.equal(Object.getOwnPropertyDescriptor(f.window, "ensureFolderTreeRowIsVisible").configurable, false);
  filter.dispose();
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.window, "ensureFolderTreeRowIsVisible"), before);
});
