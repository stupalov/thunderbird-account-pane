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

test("resolver failure in rows allows native selection and releases hidden markers", () => {
  const f = makeTreeFixture();
  const nativeRows = f.tree.rows;
  Object.defineProperty(f.tree, "rows", { configurable: true, get() { return nativeRows; } });
  let resolverFails = false;
  f.options.accountForRow = row => {
    if (resolverFails && row.accountId === "b") {
      throw new Error("synthetic foreign resolver failure");
    }
    return row.accountId;
  };
  const filter = filters.attach(f.options);
  filter.apply("a");
  assert.equal(nativeRows[1].getAttribute("data-accountpane-hidden"), "true");
  resolverFails = true;
  assert.equal(f.tree.updateSelection(nativeRows[0]), "updated");
  assert.deepEqual(f.tree.selection, [nativeRows[0]]);
  assert.equal(f.tree.rows, nativeRows);
  assert.equal(nativeRows[1].getAttribute("data-accountpane-hidden"), null);
  assert.deepEqual(f.events.map(event => event.type), ["follow", "update"]);
  assert.equal(f.events[0].accountId, null);
  filter.dispose();
});

test("resolver fail-open tolerates a failing All Accounts notification", () => {
  const f = makeTreeFixture();
  let resolverFails = false;
  f.options.accountForRow = row => {
    if (resolverFails && row.accountId === "b") {
      throw new Error("synthetic foreign resolver failure");
    }
    return row.accountId;
  };
  f.options.followTarget = () => { throw new Error("synthetic notification failure"); };
  const filter = filters.attach(f.options);
  filter.apply("a");
  resolverFails = true;
  assert.equal(f.tree.updateSelection(f.tree.allRows[0]), "updated");
  assert.deepEqual(f.tree.selection, [f.tree.allRows[0]]);
  assert.deepEqual(ids(f.tree), ["a", "b"]);
  assert.equal(f.tree.allRows[1].getAttribute("data-accountpane-hidden"), null);
  filter.dispose();
});

test("native rows getter exceptions propagate without clearing account restriction", () => {
  const f = makeTreeFixture();
  const nativeGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(f.tree), "rows").get;
  const nativeError = new Error("synthetic native getter failure");
  let nativeFails = false;
  Object.defineProperty(f.tree, "rows", { configurable: true, get() {
    if (nativeFails) { throw nativeError; }
    return nativeGetter.call(this);
  } });
  const filter = filters.attach(f.options);
  filter.apply("a");
  nativeFails = true;
  assert.throws(() => f.tree.rows, error => error === nativeError);
  assert.equal(f.tree.allRows[1].getAttribute("data-accountpane-hidden"), "true");
  nativeFails = false;
  assert.deepEqual(ids(f.tree), ["a"]);
  assert.equal(f.events.length, 0);
  filter.dispose();
});

function serverBranch(f, accountId, collapsed = true) {
  const root = f.tree.allRows.find(row => row.accountId === accountId);
  root.modeName = "all";
  root.dataset.serverType = "imap";
  root.collapsed = collapsed;
  root.children = true;
  root.childList = { hidden: collapsed, children: [] };
  const child = makeTreeRow(accountId, root);
  child.modeName = "all";
  root.childList.children.push(child);
  f.tree.allRows.splice(f.tree.allRows.indexOf(root) + 1, 0, child);
  return { root, child };
}

test("specific All Folders promotes children of collapsed server and restores native root", () => {
  const f = makeTreeFixture();
  const { root, child } = serverBranch(f, "a");
  const filter = filters.attach(f.options);
  filter.apply("a");
  assert.deepEqual(Array.from(f.tree.rows), [child]);
  assert.equal(root.unselectable, true);
  assert.equal(root.collapsed, false);
  assert.equal(root.childList.hidden, false);
  assert.equal(root.getAttribute("data-accountpane-flattened"), "true");
  assert.equal(child.style.getPropertyValue("--accountpane-indent"), "0px");
  f.tree.key("Home");
  assert.deepEqual(f.tree.selection, [child]);
  f.tree.key("ArrowLeft");
  assert.deepEqual(f.tree.selection, [child]);
  assert.equal(root.collapsed, false);
  filter.apply(null);
  assert.equal(root.unselectable, false);
  assert.equal(root.collapsed, true);
  assert.equal(root.childList.hidden, true);
  assert.equal(root.getAttribute("data-accountpane-flattened"), null);
  assert.equal(child.style.getPropertyValue("--accountpane-indent"), "");
  filter.dispose();
});

test("smart virtual parent retains only own children without exposing aggregate row", () => {
  const f = makeTreeFixture([]);
  const group = makeTreeRow(null);
  group.modeName = "smart"; group.children = true; group.collapsed = true;
  group.childList = { hidden: true };
  const a = makeTreeRow("a", group); a.modeName = "smart";
  const b = makeTreeRow("b", group); b.modeName = "smart";
  const tag = makeTreeRow(null); tag.modeName = "tags";
  f.tree.allRows.push(group, a, b, tag);
  const filter = filters.attach(f.options);
  filter.apply("a");
  assert.deepEqual(Array.from(f.tree.rows), [a]);
  assert.equal(group.getAttribute("data-accountpane-hidden"), null);
  assert.equal(group.unselectable, true);
  assert.equal(b.getAttribute("data-accountpane-hidden"), "true");
  assert.equal(tag.getAttribute("data-accountpane-hidden"), "true");
  filter.apply("b");
  assert.deepEqual(Array.from(f.tree.rows), [b]);
  filter.dispose();
  assert.equal(group.collapsed, true);
  assert.equal(group.childList.hidden, true);
  assert.equal(group.unselectable, false);
});

test("removed flattened roots restore on rebuild and descendants retain nested collapse", () => {
  const f = makeTreeFixture();
  const { root, child } = serverBranch(f, "a", false);
  child.collapsed = true;
  const grandchild = makeTreeRow("a", child); grandchild.modeName = "all";
  f.tree.allRows.push(grandchild);
  const filter = filters.attach(f.options);
  filter.apply("a");
  assert.deepEqual(Array.from(f.tree.rows), [child]);
  assert.equal(grandchild.style.getPropertyValue("--accountpane-indent"), "16px");
  f.tree.allRows = f.tree.allRows.filter(row => !root.contains(row));
  f.mutate();
  assert.equal(root.unselectable, false);
  assert.equal(root.collapsed, false);
  assert.equal(child.collapsed, true);
  assert.equal(grandchild.style.getPropertyValue("--accountpane-indent"), "");
  filter.dispose();
});

test("resolver failure restores flattened roots without persisting expansion", () => {
  const f = makeTreeFixture();
  const { root, child } = serverBranch(f, "a");
  let fails = false;
  f.options.accountForRow = row => {
    if (fails && row.accountId === "b") { throw new Error("synthetic lookup failure"); }
    return row.accountId;
  };
  const filter = filters.attach(f.options);
  filter.apply("a");
  fails = true;
  f.tree.rows;
  assert.equal(root.unselectable, false);
  assert.equal(root.collapsed, true);
  assert.equal(root.childList.hidden, true);
  assert.equal(child.style.getPropertyValue("--accountpane-indent"), "");
  fails = false;
  assert.deepEqual(Array.from(f.tree.rows), [root, f.tree.allRows[2]]);
  filter.dispose();
});

test("promotion preserves later indent owner and account roots with no folders", () => {
  const f = makeTreeFixture();
  const { root, child } = serverBranch(f, "a");
  const filter = filters.attach(f.options);
  filter.apply("a");
  child.style.setProperty("--accountpane-indent", "7px");
  filter.refresh();
  assert.equal(child.style.getPropertyValue("--accountpane-indent"), "0px");
  filter.apply(null);
  assert.equal(child.style.getPropertyValue("--accountpane-indent"), "7px");
  root.childList.children.length = 0;
  f.tree.allRows = f.tree.allRows.filter(row => row !== child);
  filter.apply("a");
  assert.deepEqual(Array.from(f.tree.rows), [root]);
  assert.equal(root.getAttribute("data-accountpane-flattened"), null);
  filter.dispose();
});

test("flattened roots are presentation-only and restore owned role after native rebuild", () => {
  const f = makeTreeFixture();
  const { root } = serverBranch(f, "a");
  root.setAttribute("role", "treeitem");
  root.setAttribute("aria-expanded", "false");
  const filter = filters.attach(f.options);
  filter.apply("a");
  assert.equal(root.getAttribute("role"), "presentation");
  assert.equal(root.getAttribute("aria-expanded"), "true");
  root.setAttribute("role", "treeitem"); // Native _initRows after composition.
  filter.refresh();
  assert.equal(root.getAttribute("role"), "presentation");
  filter.apply(null);
  assert.equal(root.getAttribute("role"), "treeitem");
  filter.apply("a");
  root.setAttribute("role", "group"); // Another owner while filtered.
  filter.dispose();
  assert.equal(root.getAttribute("role"), "group");
});

test("presentation-only promotion removes role when it was originally absent", () => {
  const f = makeTreeFixture();
  const { root } = serverBranch(f, "a");
  const filter = filters.attach(f.options);
  filter.apply("a");
  assert.equal(root.getAttribute("role"), "presentation");
  filter.dispose();
  assert.equal(root.getAttribute("role"), null);
});

test("flattened root restores expanded accessibility state after native composition", () => {
  const f = makeTreeFixture();
  const { root } = serverBranch(f, "a");
  root.setAttribute("role", "treeitem");
  root.setAttribute("aria-expanded", "false");
  const filter = filters.attach(f.options);
  filter.apply("a");
  assert.equal(root.getAttribute("aria-expanded"), "true");
  root.setAttribute("aria-expanded", "true"); // Native composition sees opened root.
  filter.refresh();
  filter.apply(null);
  assert.equal(root.collapsed, true);
  assert.equal(root.getAttribute("role"), "treeitem");
  assert.equal(root.getAttribute("aria-expanded"), "false");
  filter.apply("a");
  root.setAttribute("aria-expanded", "mixed"); // Later owner is untouched.
  filter.dispose();
  assert.equal(root.getAttribute("aria-expanded"), "mixed");
});

test("flattened root removes owned expanded state when originally absent", () => {
  const f = makeTreeFixture();
  const { root } = serverBranch(f, "a");
  const filter = filters.attach(f.options);
  filter.apply("a");
  assert.equal(root.getAttribute("aria-expanded"), "true");
  filter.dispose();
  assert.equal(root.getAttribute("aria-expanded"), null);
});

// Mirror native folder-tree-row naming contracts, including its idempotent
// text setters and full-name/count accessibility updates.
function namedFolder(row, style = "both") {
  const state = { writes: 0, name: "", fullName: "" };
  Object.assign(row, {
    _nameStyle: style, _folderName: "Release - notes", _fullFolderName: "Projects/Release - notes",
    _serverName: "Work - account", unreadCount: 3, totalCount: 12,
    updateFolderNames(name, fullName) {
      this._folderName = name; this._fullFolderName = fullName; this._setName();
    },
    setServerName(name) { this._serverName = name; this._setName(); }
  });
  Object.defineProperties(row, {
    name: { get() { return state.name; }, set(value) {
      if (value !== state.name) { state.name = value; state.writes++; }
    } },
    fullName: { get() { return state.fullName; }, set(value) {
      if (value !== state.fullName) { state.fullName = value; }
      this.setAttribute("aria-label", `${value}, ${this.unreadCount} unread, ${this.totalCount} total`);
      this.setAttribute("title", value);
    } }
  });
  Object.setPrototypeOf(row, {
    _setName() {
      this.name = this._nameStyle === "server" ? this._serverName : this._nameStyle === "folder" ?
        this._folderName : `${this._folderName} - ${this._serverName}`;
      this.fullName = this._nameStyle === "server" ? this._serverName : this._nameStyle === "folder" ?
        this._fullFolderName : `${this._fullFolderName} - ${this._serverName}`;
    }
  });
  row._setName();
  return state;
}

test("selected account shortens compact labels without parsing hyphens or changing native counts", () => {
  const f = makeTreeFixture(["a", "a", "b"]);
  const [favorite, recent, foreign] = f.tree.allRows;
  recent.modeName = "recent";
  for (const row of f.tree.allRows) { namedFolder(row); }
  const filter = filters.attach(f.options);
  filter.apply("a");
  for (const row of [favorite, recent]) {
    assert.equal(row.name, "Release - notes");
    assert.equal(row.fullName, "Projects/Release - notes");
    assert.equal(row.getAttribute("aria-label"), "Projects/Release - notes, 3 unread, 12 total");
    assert.equal(row.getAttribute("title"), "Projects/Release - notes");
    assert.equal(row._nameStyle, "both");
  }
  assert.equal(foreign.name, "Release - notes - Work - account");
  filter.apply(null);
  assert.equal(favorite.name, "Release - notes - Work - account");
  assert.equal(favorite.fullName, "Projects/Release - notes - Work - account");
  assert.equal(Object.hasOwn(favorite, "_setName"), false);
  filter.dispose();
});

test("live renames and newly built mode rows use current metadata and converge after observer refresh", () => {
  const f = makeTreeFixture(["a"]);
  const row = f.tree.allRows[0];
  const state = namedFolder(row);
  const filter = filters.attach(f.options);
  filter.apply("a");
  row.updateFolderNames("Renamed - folder", "Parent/Renamed - folder");
  row.setServerName("Renamed - server");
  assert.equal(row.name, "Renamed - folder");
  assert.equal(row.fullName, "Parent/Renamed - folder");
  const added = makeTreeRow("a");
  added.modeName = "unread";
  namedFolder(added);
  f.tree.allRows.push(added);
  f.mutate();
  assert.equal(added.name, "Release - notes");
  const writes = state.writes;
  for (let i = 0; i < 10; i++) { f.mutate(); }
  assert.equal(state.writes, writes, "observer refresh must not create further label mutations");
  filter.dispose();
  assert.equal(row.name, "Renamed - folder - Renamed - server");
  assert.equal(row.fullName, "Parent/Renamed - folder - Renamed - server");
  assert.equal(added.name, "Release - notes - Work - account");
});

test("switching accounts and detached mode rows restore native label ownership", () => {
  const f = makeTreeFixture();
  for (const row of f.tree.allRows) { namedFolder(row); }
  const [a, b] = f.tree.allRows;
  const own = a._setName;
  Object.defineProperty(a, "_setName", { value: own, writable: true, configurable: false, enumerable: true });
  const before = Object.getOwnPropertyDescriptor(a, "_setName");
  const filter = filters.attach(f.options);
  filter.apply("a");
  assert.equal(a.name, "Release - notes");
  filter.apply("b");
  assert.equal(a.name, "Release - notes - Work - account");
  assert.deepEqual(Object.getOwnPropertyDescriptor(a, "_setName"), before);
  assert.equal(b.name, "Release - notes");
  f.tree.allRows.pop();
  f.mutate();
  assert.equal(b.name, "Release - notes - Work - account");
  filter.dispose();
});

test("later name-method owners survive cleanup and captured wrappers become native", () => {
  const f = makeTreeFixture(["a"]);
  const row = f.tree.allRows[0];
  namedFolder(row);
  const filter = filters.attach(f.options);
  filter.apply("a");
  const captured = row._setName;
  const later = function() { captured.call(this); };
  row._setName = later;
  filter.dispose();
  assert.equal(row._setName, later);
  row.setServerName("New server");
  assert.equal(row.name, "Release - notes - New server");
});

test("noncompact and nonwrappable rows retain native naming without breaking filtering", () => {
  const f = makeTreeFixture(["a", "a", "a"]);
  const [folder, server, frozen] = f.tree.allRows;
  namedFolder(folder, "folder"); namedFolder(server, "server"); namedFolder(frozen);
  Object.preventExtensions(frozen);
  const filter = filters.attach(f.options);
  filter.apply("a");
  assert.equal(folder.name, "Release - notes");
  assert.equal(server.name, "Work - account");
  assert.equal(frozen.name, "Release - notes - Work - account");
  assert.equal(Object.hasOwn(folder, "_setName"), false);
  filter.dispose();
});

test("resolver fail-open restores compact labels from current native metadata", () => {
  const f = makeTreeFixture(["a"]);
  const row = f.tree.allRows[0];
  namedFolder(row);
  let fail = false;
  f.options.accountForRow = row => { if (fail) { throw new Error("lookup failure"); } return row.accountId; };
  const filter = filters.attach(f.options);
  filter.apply("a");
  row.setServerName("Updated server");
  fail = true;
  assert.equal(f.tree.rows.length, 1);
  assert.equal(row.name, "Release - notes - Updated server");
  assert.equal(Object.hasOwn(row, "_setName"), false);
  filter.dispose();
});

test("native naming exceptions always restore temporary name style", () => {
  const f = makeTreeFixture(["a"]);
  const row = f.tree.allRows[0];
  namedFolder(row);
  const native = row._setName;
  row._setName = function() {
    if (this._nameStyle === "folder") { throw new Error("native formatting failure"); }
    return native.call(this);
  };
  const before = row._setName;
  const filter = filters.attach(f.options);
  assert.throws(() => filter.apply("a"), /native formatting failure/);
  assert.equal(row._nameStyle, "both");
  filter.dispose();
  assert.equal(row._setName, before);
  assert.equal(row.name, "Release - notes - Work - account");
});

test("a set of two accounts hides only non-members and keeps roots unflattened", () => {
  const f = makeTreeFixture(["a", "b", "c"]);
  const { root, child } = serverBranch(f, "a", false);
  const filter = filters.attach(f.options);
  filter.apply(["a", "b"]);
  assert.deepEqual(Array.from(f.tree.rows), [root, child, f.tree.allRows[2]]);
  assert.equal(f.tree.allRows[3].getAttribute("data-accountpane-hidden"), "true");
  assert.equal(root.getAttribute("data-accountpane-hidden"), null);
  assert.equal(root.getAttribute("data-accountpane-flattened"), null);
  assert.equal(root.unselectable, false);
  assert.equal(child.style.getPropertyValue("--accountpane-indent"), "");
  filter.apply(null);
  assert.equal(f.tree.allRows[3].getAttribute("data-accountpane-hidden"), null);
  filter.dispose();
});

test("a set of one account behaves exactly like the former single-id apply", () => {
  const f = makeTreeFixture(["a", "b", "c"]);
  const { root, child } = serverBranch(f, "a");
  const filter = filters.attach(f.options);
  filter.apply(["a"]);
  assert.deepEqual(Array.from(f.tree.rows), [child]);
  assert.equal(root.unselectable, true);
  assert.equal(root.collapsed, false);
  assert.equal(root.getAttribute("data-accountpane-flattened"), "true");
  assert.equal(child.style.getPropertyValue("--accountpane-indent"), "0px");
  assert.equal(f.tree.allRows[2].getAttribute("data-accountpane-hidden"), "true");
  filter.apply([]);
  assert.equal(root.unselectable, false);
  assert.equal(root.collapsed, true);
  assert.equal(f.tree.allRows[2].getAttribute("data-accountpane-hidden"), null);
  filter.dispose();
});

test("string apply remains a one-account set", () => {
  const f = makeTreeFixture(["a", "b", "c"]);
  const filter = filters.attach(f.options);
  filter.apply("b");
  assert.deepEqual(ids(f.tree), ["b"]);
  f.tree.updateSelection(f.tree.allRows[1]);
  assert.equal(f.events.some(event => event.type === "follow"), false);
  filter.dispose();
});

test("rows getter returns rows of every member account", () => {
  const f = makeTreeFixture(["a", "b", "c", "a", "c"]);
  const filter = filters.attach(f.options);
  filter.apply(["c", "a"]);
  assert.deepEqual(ids(f.tree), ["a", "c", "a", "c"]);
  filter.dispose();
});

test("selection inside the set does not notify; selection of a non-member account follows it; mixed selection fails open to null", () => {
  const f = makeTreeFixture(["a", "b", "c"]);
  const [a, b, c] = f.tree.allRows;
  const filter = filters.attach(f.options);
  filter.apply(["a", "b"]);
  f.tree.updateSelection(b);
  f.tree.swapSelection([a, b]);
  assert.deepEqual(f.events.map(event => event.type), ["update", "swap"]);
  f.events.length = 0;
  f.tree.updateSelection(c);
  assert.deepEqual(f.events.map(event => event.type), ["follow", "update"]);
  assert.equal(f.events[0].accountId, "c");
  assert.deepEqual(f.events[0].rows, [c]);
  filter.apply(["a", "b"]);
  f.events.length = 0;
  f.tree.swapSelection([a, c]);
  assert.deepEqual(f.events.map(event => event.type), ["follow", "swap"]);
  assert.equal(f.events[0].accountId, null);
  assert.deepEqual(ids(f.tree), ["a", "b", "c"]);
  filter.dispose();
});

test("unified parents keep member rows of several accounts and hide mixed aggregates", () => {
  const f = makeTreeFixture([]);
  const group = makeTreeRow(null);
  group.modeName = "smart"; group.children = true; group.collapsed = true;
  group.childList = { hidden: true };
  const [a, b, c] = ["a", "b", "c"].map(id => {
    const row = makeTreeRow(id, group); row.modeName = "smart"; return row;
  });
  const tag = makeTreeRow(null); tag.modeName = "tags";
  f.tree.allRows.push(group, a, b, c, tag);
  const filter = filters.attach(f.options);
  filter.apply(["a", "b"]);
  assert.deepEqual(Array.from(f.tree.rows), [a, b]);
  assert.equal(group.getAttribute("data-accountpane-hidden"), null);
  assert.equal(group.unselectable, true);
  assert.equal(c.getAttribute("data-accountpane-hidden"), "true");
  assert.equal(tag.getAttribute("data-accountpane-hidden"), "true");
  filter.dispose();
  assert.equal(group.collapsed, true);
  assert.equal(group.unselectable, false);
});

test("names are not shortened for a multi-account set", () => {
  const f = makeTreeFixture(["a", "b"]);
  for (const row of f.tree.allRows) { namedFolder(row); }
  const [a] = f.tree.allRows;
  const filter = filters.attach(f.options);
  filter.apply(["a"]);
  assert.equal(a.name, "Release - notes");
  filter.apply(["a", "b"]);
  assert.equal(a.name, "Release - notes - Work - account");
  assert.equal(Object.hasOwn(a, "_setName"), false);
  filter.dispose();
});
