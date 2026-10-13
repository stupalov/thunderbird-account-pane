import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { loadScript } from "./load-script.mjs";

// A structural/event double only. It does not implement layout or browser Tab navigation.
class Element {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.tabIndex = -1;
    this.parentNode = null;
    this.text = "";
  }
  set id(value) { this.setAttribute("id", value); }
  get id() { return this.getAttribute("id") || ""; }
  set textContent(value) { this.replaceChildren(); this.text = String(value); }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(""); }
  set innerHTML(value) { throw new Error("Fixture forbids HTML interpolation"); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...children) {
    for (const child of children) {
      child.remove();
      child.parentNode = this;
      this.children.push(child);
    }
  }
  insertBefore(child, reference) {
    child.remove();
    const index = reference === null ? this.children.length : this.children.indexOf(reference);
    assert.ok(index >= 0, "reference belongs to parent");
    child.parentNode = this;
    this.children.splice(index, 0, child);
  }
  replaceChildren(...children) {
    for (const child of this.children) { child.parentNode = null; }
    this.children = [];
    this.text = "";
    this.append(...children);
  }
  remove() {
    if (this.parentNode) {
      const index = this.parentNode.children.indexOf(this);
      this.parentNode.children.splice(index, 1);
      this.parentNode = null;
    }
  }
  contains(node) {
    for (let current = node; current; current = current.parentNode) {
      if (current === this) { return true; }
    }
    return false;
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) { this.listeners.set(type, new Set()); }
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, properties = {}) {
    const event = {
      type, target: this, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; },
      ...properties
    };
    for (let node = this; node && !event.stopped; node = node.parentNode) {
      for (const listener of node.listeners.get(type) || []) { listener(event); }
    }
    return event;
  }
  focus() { this.ownerDocument.activeElement = this; this.dispatch("focusin"); }
}

function descendants(element) {
  return element.children.flatMap(child => [child, ...descendants(child)]);
}
function fixture(labels = { accounts: "Accounts", allAccounts: "All Accounts" }, cssText = "/* fixture CSS */", onSelect = () => {}) {
  assert.ok(existsSync("addon/experiment/account-view.js"), "AccountPaneView implementation exists");
  const viewModule = loadScript("addon/experiment/account-view.js", "AccountPaneView");
  const document = {
    activeElement: null,
    createElement(tag) { return new Element(this, tag); },
    getElementById(id) { return descendants(this.body).find(node => node.id === id) || null; }
  };
  document.head = document.createElement("head");
  document.body = document.createElement("body");
  const folderPane = document.createElement("div");
  folderPane.id = "folderPane";
  folderPane.setAttribute("class", "collapsed-by-splitter");
  const dropIndicator = document.createElement("img");
  const header = document.createElement("div");
  header.id = "folderPaneHeaderBar";
  const tree = document.createElement("ul");
  tree.id = "folderTree";
  tree.tabIndex = 0; // Native tree-listbox connectedCallback makes this a tab stop.
  const template = document.createElement("template");
  folderPane.append(dropIndicator, header, tree, template);
  document.body.append(folderPane);
  const selected = [];
  const view = viewModule.create({ document, folderPane, labels, cssText, onSelect: id => { selected.push(id); onSelect(id); } });
  return { document, folderPane, dropIndicator, header, tree, template, selected, view };
}
const options = f => descendants(f.folderPane).filter(node => node.getAttribute("role") === "option");
const accounts = [
  { id: "a", serverKey: "server-a", name: "Fixture A", type: "imap", hidden: false, deferred: false, local: false },
  { id: "local", serverKey: "server-local", name: "Local Folders", type: "none", hidden: false, deferred: false, local: true }
];

test("renders All Accounts first, native order, and selected state without duplicates", () => {
  const f = fixture();
  f.view.render(accounts, "a");
  assert.deepEqual(options(f).map(row => row.textContent), ["All Accounts", "Fixture A", "Local Folders"]);
  assert.deepEqual(options(f).map(row => row.getAttribute("aria-selected")), ["false", "true", "false"]);
  f.view.render([accounts[1], accounts[0]], null);
  assert.deepEqual(options(f).map(row => row.textContent), ["All Accounts", "Local Folders", "Fixture A"]);
  assert.deepEqual(options(f).map(row => row.getAttribute("aria-selected")), ["true", "false", "false"]);
  assert.equal(descendants(f.folderPane).filter(node => node.id === "accountpane-accounts").length, 1);
});

test("count updates preserve option identity, focus, and selection while aggregating visible accounts", () => {
  const f = fixture({ accounts: "Accounts", allAccounts: "All Accounts",
    unreadCount: "Unread messages: {count}", totalCount: "Total messages: {count}" });
  f.view.render(accounts, "a");
  const rows = options(f);
  rows[1].focus();
  f.view.updateCounts({ showTotal: true, accounts: {
    a: { unread: 2, total: 5 }, local: { unread: 3, total: 9 }, hidden: { unread: 80, total: 90 }
  } });
  assert.deepEqual(options(f), rows);
  assert.equal(f.document.activeElement, rows[1]);
  assert.deepEqual(rows.map(row => row.getAttribute("aria-selected")), ["false", "true", "false"]);
  assert.deepEqual(rows.map(row => row.textContent), ["All Accounts514", "Fixture A25", "Local Folders39"]);
  assert.equal(rows[1].getAttribute("aria-label"), "Fixture A, Unread messages: 2, Total messages: 5");
  assert.deepEqual(f.selected, []);
});

test("unknown metrics hide affected badges including incomplete All Accounts totals", () => {
  const f = fixture({ accounts: "Accounts", allAccounts: "All Accounts",
    unreadCount: "Unread messages: {count}", totalCount: "Total messages: {count}" });
  f.view.render(accounts, null);
  f.view.updateCounts({ showTotal: true, accounts: {
    a: { unread: 0, total: 0 }, local: { unread: null, total: 7 }
  } });
  const rows = options(f);
  assert.deepEqual(rows.map(row => row.textContent), ["All Accounts7", "Fixture A0", "Local Folders7"]);
  assert.equal(rows[0].getAttribute("aria-label"), "All Accounts, Total messages: 7");
  f.view.updateCounts({ showTotal: false, accounts: {
    a: { unread: 1, total: 0 }, local: { unread: 2, total: 7 }
  } });
  assert.deepEqual(rows.map(row => row.textContent), ["All Accounts3", "Fixture A1", "Local Folders2"]);
});

test("inserts above the native tree without changing host children or splitter state", () => {
  const f = fixture();
  const section = f.document.getElementById("accountpane-accounts");
  assert.deepEqual(f.folderPane.children, [f.dropIndicator, f.header, section, f.tree, f.template]);
  assert.equal(f.folderPane.getAttribute("class"), "collapsed-by-splitter");
  assert.equal(f.tree.tabIndex, 0);
  assert.equal(f.document.head.children.length, 1);
  assert.equal(f.document.head.children[0].textContent, "/* fixture CSS */");
});

test("account names are literal text and never become markup or element identifiers", () => {
  const f = fixture();
  f.view.render([{ ...accounts[0], name: '<img src=x onerror="throw 1"> #fixture' }], "a");
  const row = options(f)[1];
  assert.equal(row.textContent, '<img src=x onerror="throw 1"> #fixture');
  assert.deepEqual(row.children.map(child => child.tagName), ["span", "span"]);
  assert.equal(row.id, "");
  assert.equal(row.getAttribute("class"), null);
});

test("click selects the exact account and null for All Accounts, including label targets", () => {
  const f = fixture();
  f.view.render(accounts, null);
  options(f)[2].children[0].dispatch("click");
  options(f)[0].dispatch("click");
  assert.deepEqual(f.selected, ["local", null]);
  assert.equal(f.document.activeElement, options(f)[0]);
  assert.deepEqual(options(f).map(row => row.tabIndex), [0, -1, -1]);
});

test("Arrow/Home/End move focus with bounds without selecting", () => {
  const f = fixture();
  f.view.render(accounts, "a");
  assert.deepEqual(options(f).map(row => row.tabIndex), [-1, 0, -1]);
  options(f)[1].focus();
  for (const [key, index] of [["ArrowDown", 2], ["ArrowDown", 2], ["Home", 0], ["ArrowUp", 0], ["End", 2], ["ArrowUp", 1]]) {
    const event = f.document.activeElement.dispatch("keydown", { key });
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
    assert.equal(f.document.activeElement, options(f)[index]);
    assert.equal(options(f).filter(row => row.tabIndex === 0).length, 1);
  }
  assert.deepEqual(f.selected, []);
  assert.deepEqual(options(f).map(row => row.getAttribute("aria-selected")), ["false", "true", "false"]);
});

test("Enter and Space select focused options and consume the key", () => {
  const f = fixture();
  f.view.render(accounts, null);
  for (const [key, index] of [["Enter", 1], [" ", 2], ["Enter", 0]]) {
    options(f)[index].focus();
    const event = options(f)[index].dispatch("keydown", { key });
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
  }
  assert.deepEqual(f.selected, ["a", "local", null]);
});

test("Tab and modifier shortcuts are left to native navigation", () => {
  const f = fixture();
  f.view.render(accounts, "a");
  options(f)[1].focus();
  for (const properties of [{ key: "Tab" }, { key: "Tab", shiftKey: true }, { key: "ArrowDown", ctrlKey: true }, { key: "Enter", metaKey: true }, { key: "Home", altKey: true }]) {
    const event = options(f)[1].dispatch("keydown", properties);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.stopped, false);
    assert.equal(f.document.activeElement, options(f)[1]);
  }
  assert.deepEqual(f.selected, []);
  assert.equal(f.tree.tabIndex, 0);
});

test("rerender preserves account focus across rename/reorder and repairs removed focus", () => {
  const f = fixture();
  f.view.render(accounts, "a");
  options(f)[2].focus();
  f.view.render([{ ...accounts[1], name: "Renamed" }, accounts[0]], "a");
  assert.equal(f.document.activeElement, options(f)[1]);
  assert.equal(f.document.activeElement.textContent, "Renamed");
  assert.deepEqual(options(f).map(row => row.tabIndex), [-1, 0, -1]);
  f.view.render([accounts[0]], "a");
  assert.equal(f.document.activeElement, options(f)[1]);
  f.tree.focus();
  f.view.render(accounts, "local");
  assert.equal(f.document.activeElement, f.tree);
  assert.deepEqual(options(f).map(row => row.tabIndex), [-1, -1, 0]);
});

test("an empty list and an unavailable selected id fall back to All Accounts", () => {
  const f = fixture();
  f.view.render([], "removed");
  assert.deepEqual(options(f).map(row => row.textContent), ["All Accounts"]);
  assert.equal(options(f)[0].getAttribute("aria-selected"), "true");
  assert.equal(options(f)[0].tabIndex, 0);
  options(f)[0].focus();
  options(f)[0].dispatch("keydown", { key: "End" });
  assert.equal(f.document.activeElement, options(f)[0]);
  assert.deepEqual(f.selected, []);
});

test("dispose removes own nodes and listeners and leaves the native pane intact", () => {
  const f = fixture();
  f.view.render(accounts, "a");
  const section = f.document.getElementById("accountpane-accounts");
  const list = f.document.getElementById("accountpane-list");
  const capturedOption = options(f)[1];
  const foreignStyle = f.document.createElement("style");
  f.document.head.append(foreignStyle);
  capturedOption.focus();
  f.view.dispose();
  f.view.dispose();
  assert.deepEqual(f.folderPane.children, [f.dropIndicator, f.header, f.tree, f.template]);
  assert.deepEqual(f.document.head.children, [foreignStyle]);
  assert.equal(f.document.activeElement, f.tree);
  assert.equal(f.folderPane.getAttribute("class"), "collapsed-by-splitter");
  assert.equal(section.parentNode, null);
  assert.equal([...list.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0), 0);
  capturedOption.dispatch("click");
  capturedOption.dispatch("keydown", { key: "Enter" });
  f.view.render(accounts, null);
  assert.deepEqual(f.selected, []);
  assert.deepEqual(options(f), []);
});

test("dispose preserves focus outside AccountPane", () => {
  const f = fixture();
  f.view.render(accounts, "a");
  f.tree.focus();
  f.view.dispose();
  assert.equal(f.document.activeElement, f.tree);
});

test("localized labels name the section/listbox and All Accounts option", async () => {
  const { readFileSync } = await import("node:fs");
  for (const [locale, expected] of [["en", ["Accounts", "All Accounts"]], ["ru", ["Аккаунты", "Все аккаунты"]]]) {
    const messages = JSON.parse(readFileSync(`addon/_locales/${locale}/messages.json`, "utf8"));
    const f = fixture({ accounts: messages.accounts.message, allAccounts: messages.allAccounts.message });
    f.view.render([], null);
    const heading = f.document.getElementById("accountpane-heading");
    assert.equal(heading.textContent, expected[0]);
    assert.equal(options(f)[0].textContent, expected[1]);
    assert.equal(f.document.getElementById("accountpane-list").getAttribute("aria-labelledby"), heading.id);
    assert.equal(f.document.getElementById("accountpane-accounts").getAttribute("aria-labelledby"), heading.id);
  }
});


test("synchronous onSelect rerender retains the activated account's keyboard focus", () => {
  const f = fixture(undefined, undefined, id => f.view.render(accounts, id));
  f.view.render(accounts, null);
  options(f)[1].focus();
  const event = options(f)[1].dispatch("keydown", { key: "Enter" });
  assert.equal(event.defaultPrevented, true);
  assert.equal(f.document.activeElement, options(f)[1]);
  assert.deepEqual(options(f).map(row => row.getAttribute("aria-selected")), ["false", "true", "false"]);
  options(f)[2].children[0].dispatch("click");
  assert.equal(f.document.activeElement, options(f)[2]);
  assert.deepEqual(options(f).map(row => row.tabIndex), [-1, -1, 0]);
  assert.deepEqual(f.selected, ["a", "local"]);
  f.tree.focus();
  f.view.render(accounts, "a");
  assert.equal(f.document.activeElement, f.tree);
});
