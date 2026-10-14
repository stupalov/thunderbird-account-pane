import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { loadScript } from "./load-script.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";

class Element {
  constructor(document, tagName, namespaceURI = null) {
    this.ownerDocument = document;
    this.tagName = tagName;
    this.namespaceURI = namespaceURI;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.tabIndex = -1;
    this.parentNode = null;
    this.text = "";
    this.style = {
      values: new Map(),
      setProperty(name, value) { this.values.set(name, String(value)); },
      getPropertyValue(name) { return this.values.get(name) ?? ""; }
    };
  }
  set id(value) { this.setAttribute("id", value); }
  get id() { return this.getAttribute("id") || ""; }
  set className(value) {
    // SVGElement.className is an SVGAnimatedString, not a writable HTML string.
    if (this.namespaceURI !== SVG_NS) this.setAttribute("class", value);
  }
  get className() {
    return this.namespaceURI === SVG_NS ? { baseVal: this.getAttribute("class") || "" } :
      this.getAttribute("class") || "";
  }
  set hidden(value) { value ? this.setAttribute("hidden", "") : this.removeAttribute("hidden"); }
  get hidden() { return this.attributes.has("hidden"); }
  set textContent(value) { this.replaceChildren(); this.text = String(value); }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(""); }
  set innerHTML(value) { throw new Error("Fixture forbids HTML interpolation"); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
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
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.text = "";
    this.append(...children);
  }
  remove() {
    if (this.parentNode) {
      this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
      this.parentNode = null;
    }
  }
  contains(node) {
    for (let current = node; current; current = current.parentNode) {
      if (current === this) return true;
    }
    return false;
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
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
      for (const listener of node.listeners.get(type) || []) listener(event);
    }
    return event;
  }
  focus() { this.ownerDocument.activeElement = this; this.dispatch("focusin"); }
}

function descendants(element) {
  return element.children.flatMap(child => [child, ...descendants(child)]);
}

const defaultLabels = {
  accounts: "Accounts", allAccounts: "All Accounts",
  expandAccounts: "Expand accounts", collapseAccounts: "Collapse accounts",
  unreadCount: "Unread messages: {count}", totalCount: "Total messages: {count}"
};

function fixture(labels = defaultLabels, cssText = "/* fixture CSS */", onSelect = () => {},
    onExpandedChanged = () => {}, onContextMenu = () => {}) {
  assert.ok(existsSync("addon/experiment/account-view.js"), "AccountPaneView implementation exists");
  const viewModule = loadScript("addon/experiment/account-view.js", "AccountPaneView");
  let nativeHeading;
  const document = {
    activeElement: null,
    createElement(tag) { return new Element(this, tag); },
    createElementNS(namespace, tag) { return new Element(this, tag, namespace); },
    getElementById(id) { return descendants(this.body).find(node => node.id === id) || null; },
    querySelector(selector) { return selector === "#folderTree .mode-name" ? nativeHeading : null; }
  };
  document.defaultView = { getComputedStyle(node) {
    assert.equal(node, nativeHeading);
    return { fontFamily: "Native Fixture", fontSize: "17px", fontWeight: "500", lineHeight: "21px" };
  } };
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
  tree.tabIndex = 0;
  nativeHeading = document.createElement("span");
  nativeHeading.className = "mode-name";
  tree.append(nativeHeading);
  const template = document.createElement("template");
  folderPane.append(dropIndicator, header, tree, template);
  document.body.append(folderPane);
  const selected = [], expandedChanges = [], contextMenus = [];
  const view = viewModule.create({ document, folderPane, labels: { ...defaultLabels, ...labels }, cssText,
    onSelect: id => { selected.push(id); onSelect(id); },
    onExpandedChanged: value => { expandedChanges.push(value); onExpandedChanged(value); },
    onContextMenu: (id, event, anchor) => {
      contextMenus.push({ id, event, anchor });
      onContextMenu(id, event, anchor);
    } });
  return { document, folderPane, dropIndicator, header, tree, template, nativeHeading,
    selected, expandedChanges, contextMenus, view };
}

const section = f => f.document.getElementById("accountpane-accounts");
const treeItems = f => descendants(section(f)).filter(node => node.getAttribute("role") === "treeitem");
const row = item => item.children[0];
const rowText = item => row(item).textContent;
const part = (item, className) => descendants(row(item)).find(node => node.getAttribute("class") === className);
const accounts = [
  { id: "a", serverKey: "server-a", name: "Fixture A", type: "imap", hidden: false, deferred: false, local: false },
  { id: "local", serverKey: "server-local", name: "Local Folders", type: "none", hidden: false, deferred: false, local: true }
];

test("renders an accessible account tree with All Accounts owning the nested native-order group", () => {
  const f = fixture();
  f.view.render(accounts, "a");
  const list = f.document.getElementById("accountpane-list"), items = treeItems(f);
  assert.equal(list.getAttribute("role"), "tree");
  assert.equal(items[0].parentNode, list);
  assert.equal(items[0].getAttribute("aria-expanded"), "true");
  assert.equal(items[0].children[1].getAttribute("role"), "group");
  assert.deepEqual(items.slice(1).map(item => item.parentNode), [items[0].children[1], items[0].children[1]]);
  assert.deepEqual(items.map(rowText), ["All Accounts", "Fixture A", "Local Folders"]);
  assert.deepEqual(items.map(item => item.getAttribute("aria-selected")), ["false", "true", "false"]);
  f.view.render([accounts[1], accounts[0]], null);
  assert.deepEqual(treeItems(f).map(rowText), ["All Accounts", "Local Folders", "Fixture A"]);
  assert.equal(descendants(f.folderPane).filter(node => node.id === "accountpane-accounts").length, 1);
});

test("heading matches the live native mode heading and leaves host layout intact", () => {
  const f = fixture();
  f.view.render(accounts, null);
  const heading = f.document.getElementById("accountpane-heading");
  assert.deepEqual(["font-family", "font-size", "font-weight", "line-height"].map(name =>
    heading.style.getPropertyValue(name)), ["Native Fixture", "17px", "500", "21px"]);
  assert.deepEqual(f.folderPane.children, [f.dropIndicator, f.header, section(f), f.tree, f.template]);
  assert.equal(f.folderPane.getAttribute("class"), "collapsed-by-splitter");
  assert.equal(f.tree.tabIndex, 0);
  assert.equal(f.document.head.children[0].textContent, "/* fixture CSS */");
});

test("names stay literal while the disclosure uses the native image and owned SVGs distinguish account types", () => {
  const f = fixture();
  f.view.render([{ ...accounts[0], name: '<img src=x onerror="throw 1"> #fixture' }, accounts[1]], "a");
  const items = treeItems(f), names = items.map(item => part(item, "accountpane-name"));
  assert.equal(names[1].textContent, '<img src=x onerror="throw 1"> #fixture');
  const images = descendants(section(f)).filter(node => node.tagName === "img");
  assert.equal(images.length, 1);
  assert.equal(images[0], part(items[0], "accountpane-disclosure-icon"));
  assert.equal(images[0].getAttribute("src"), "chrome://messenger/skin/icons/new/nav-down-sm.svg");
  assert.equal(images[0].getAttribute("alt"), "");
  const icons = items.map(item => part(item, "accountpane-icon"));
  assert.deepEqual(icons.map(icon => icon.getAttribute("data-accountpane-icon")), ["all", "cloud", "monitor"]);
  assert.ok(icons.every(icon => icon.namespaceURI === SVG_NS && icon.getAttribute("aria-hidden") === "true"));
  assert.ok(icons.every(icon => icon.getAttribute("class") === "accountpane-icon"));
  assert.deepEqual(icons.map(icon => icon.children.length), [2, 1, 1]);
  assert.ok(icons.flatMap(icon => icon.children).every(path => path.tagName === "path" && path.namespaceURI === SVG_NS));
});

test("click resolves only owned rows while disclosure and group gutter never select All Accounts", () => {
  const f = fixture();
  f.view.render(accounts, "a");
  let items = treeItems(f);
  part(items[2], "accountpane-name").dispatch("click");
  part(items[1], "accountpane-badges").dispatch("click");
  part(items[0], "accountpane-name").dispatch("click");
  items[0].children[1].dispatch("click");
  part(items[0], "accountpane-disclosure").dispatch("click");
  items = treeItems(f);
  assert.deepEqual(f.selected, ["local", "a", null]);
  assert.deepEqual(f.expandedChanges, [false]);
  assert.equal(f.document.activeElement, items[0]);
  assert.equal(items[0].getAttribute("aria-expanded"), "false");
});

test("assistive-technology focus on disclosure lets Enter and Space toggle without selection", () => {
  const f = fixture();
  f.view.render(accounts, "a");
  const disclosure = part(treeItems(f)[0], "accountpane-disclosure");
  assert.equal(disclosure.tabIndex, -1);
  disclosure.focus();
  for (const [key, expanded] of [["Enter", false], [" ", true]]) {
    const event = disclosure.dispatch("keydown", { key });
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
    assert.equal(treeItems(f)[0].getAttribute("aria-expanded"), String(expanded));
  }
  assert.deepEqual(f.selected, []);
  assert.deepEqual(f.expandedChanges, [false, true]);
});

test("account context menu is delegated without selecting or navigating and All Accounts has none", () => {
  const f = fixture();
  f.view.render(accounts, null);
  const items = treeItems(f);
  const childEvent = row(items[1]).dispatch("contextmenu", { button: 2, screenX: 20, screenY: 30 });
  assert.equal(childEvent.defaultPrevented, true);
  assert.equal(childEvent.stopped, true);
  assert.equal(f.contextMenus.length, 1);
  assert.equal(f.contextMenus[0].id, "a");
  assert.equal(f.contextMenus[0].anchor, row(items[1]));
  row(items[0]).dispatch("contextmenu", { button: 2 });
  assert.equal(f.contextMenus.length, 1);
  assert.deepEqual(f.selected, []);
  assert.equal(items[0].getAttribute("aria-selected"), "true");
});

test("collapsing a focused selected child moves focus to root without selecting All Accounts", () => {
  const f = fixture();
  f.view.render(accounts, "a");
  let items = treeItems(f);
  items[1].focus();
  part(items[0], "accountpane-disclosure").dispatch("click");
  items = treeItems(f);
  assert.equal(f.document.activeElement, items[0]);
  assert.equal(items[0].getAttribute("aria-selected"), "false");
  assert.equal(items[1].getAttribute("aria-selected"), "true");
  assert.equal(items[0].children[1].hidden, true);
  assert.deepEqual(items.map(item => item.tabIndex), [0, -1, -1]);
  assert.deepEqual(f.selected, []);
});

test("programmatic collapse preserves focus outside the account tree", () => {
  const f = fixture();
  f.view.render(accounts, "a");
  f.tree.focus();
  f.view.setExpanded(false);
  assert.equal(f.document.activeElement, f.tree);
  assert.equal(treeItems(f)[0].getAttribute("aria-expanded"), "false");
});

test("counts stay per-account when expanded and aggregate only on the collapsed root", () => {
  const f = fixture();
  f.view.render(accounts, "a");
  const items = treeItems(f), identities = [...items];
  items[1].focus();
  f.view.updateCounts({ showTotal: true, accounts: {
    a: { unread: 2, total: 5 }, local: { unread: 3, total: 9 }, hidden: { unread: 80, total: 90 }
  } });
  assert.deepEqual(treeItems(f), identities);
  assert.deepEqual(items.map(rowText), ["All Accounts", "Fixture A25", "Local Folders39"]);
  assert.equal(items[0].getAttribute("aria-label"), "All Accounts");
  f.view.setExpanded(false);
  assert.equal(f.document.activeElement, items[0]);
  assert.deepEqual(items.map(rowText), ["All Accounts514", "Fixture A25", "Local Folders39"]);
  assert.equal(items[0].getAttribute("aria-label"), "All Accounts, Unread messages: 5, Total messages: 14");
  f.view.updateCounts({ showTotal: false, accounts: { a: { unread: 4, total: 5 }, local: { unread: 6, total: 9 } } });
  assert.deepEqual(treeItems(f), identities);
  assert.deepEqual(items.map(rowText), ["All Accounts10", "Fixture A4", "Local Folders6"]);
  assert.deepEqual(f.selected, []);
});

test("unknown metrics hide affected badges including incomplete collapsed aggregate totals", () => {
  const f = fixture();
  f.view.render(accounts, null);
  f.view.setExpanded(false);
  f.view.updateCounts({ showTotal: true, accounts: {
    a: { unread: 0, total: 0 }, local: { unread: null, total: 7 }
  } });
  const items = treeItems(f);
  assert.deepEqual(items.map(rowText), ["All Accounts7", "Fixture A0", "Local Folders7"]);
  assert.equal(items[0].getAttribute("aria-label"), "All Accounts, Total messages: 7");
});

test("tree keyboard expands collapses and moves only through visible account items", () => {
  const f = fixture();
  f.view.render(accounts, "a");
  const items = treeItems(f);
  items[0].focus();
  items[0].dispatch("keydown", { key: "ArrowLeft" });
  assert.equal(items[0].getAttribute("aria-expanded"), "false");
  items[0].dispatch("keydown", { key: "ArrowDown" });
  assert.equal(f.document.activeElement, items[0]);
  items[0].dispatch("keydown", { key: "ArrowRight" });
  assert.equal(items[0].getAttribute("aria-expanded"), "true");
  items[0].dispatch("keydown", { key: "ArrowRight" });
  assert.equal(f.document.activeElement, items[1]);
  items[1].dispatch("keydown", { key: "ArrowLeft" });
  assert.equal(f.document.activeElement, items[0]);
  for (const [key, index] of [["ArrowDown", 1], ["End", 2], ["ArrowDown", 2], ["Home", 0], ["ArrowUp", 0]]) {
    const event = f.document.activeElement.dispatch("keydown", { key });
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
    assert.equal(f.document.activeElement, items[index]);
  }
  assert.deepEqual(f.selected, []);
});

test("Enter and Space select focused items while Tab and modifiers stay native", () => {
  const f = fixture();
  f.view.render(accounts, null);
  const items = treeItems(f);
  for (const [key, index] of [["Enter", 1], [" ", 2], ["Enter", 0]]) {
    items[index].focus();
    const event = items[index].dispatch("keydown", { key });
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
  }
  assert.deepEqual(f.selected, ["a", "local", null]);
  for (const properties of [{ key: "Tab" }, { key: "Tab", shiftKey: true }, { key: "ArrowDown", ctrlKey: true }]) {
    const event = items[0].dispatch("keydown", properties);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.stopped, false);
  }
  assert.equal(f.tree.tabIndex, 0);
});

test("rerender preserves expansion and account focus across rename and reorder", () => {
  const f = fixture();
  f.view.render(accounts, "a");
  treeItems(f)[2].focus();
  f.view.render([{ ...accounts[1], name: "Renamed" }, accounts[0]], "a");
  assert.equal(rowText(f.document.activeElement), "Renamed");
  f.view.setExpanded(false);
  f.view.render(accounts, "a");
  const items = treeItems(f);
  assert.equal(items[0].getAttribute("aria-expanded"), "false");
  assert.equal(items[0].children[1].hidden, true);
  assert.equal(f.document.activeElement, items[0]);
  f.tree.focus();
  f.view.render(accounts, "local");
  assert.equal(f.document.activeElement, f.tree);
  assert.deepEqual(treeItems(f).map(item => item.tabIndex), [0, -1, -1]);
});

test("empty and unavailable selection use the root without changing expansion", () => {
  const f = fixture();
  f.view.setExpanded(false);
  f.view.render([], "removed");
  const items = treeItems(f);
  assert.deepEqual(items.map(rowText), ["All Accounts"]);
  assert.equal(items[0].getAttribute("aria-selected"), "true");
  assert.equal(items[0].getAttribute("aria-expanded"), "false");
  assert.equal(items[0].tabIndex, 0);
});

test("dispose removes owned nodes and listeners while preserving the native pane", () => {
  const f = fixture();
  f.view.render(accounts, "a");
  const ownSection = section(f), list = f.document.getElementById("accountpane-list"), captured = treeItems(f)[1];
  const foreignStyle = f.document.createElement("style");
  f.document.head.append(foreignStyle);
  captured.focus();
  f.view.dispose();
  f.view.dispose();
  assert.deepEqual(f.folderPane.children, [f.dropIndicator, f.header, f.tree, f.template]);
  assert.deepEqual(f.document.head.children, [foreignStyle]);
  assert.equal(f.document.activeElement, f.tree);
  assert.equal(f.folderPane.getAttribute("class"), "collapsed-by-splitter");
  assert.equal(ownSection.parentNode, null);
  assert.equal([...list.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0), 0);
  captured.dispatch("click");
  f.view.render(accounts, null);
  assert.deepEqual(f.selected, []);
});

test("localized labels name the tree root and disclosure in both states", () => {
  for (const [locale, expected] of [["en", ["Accounts", "All Accounts", "Collapse accounts", "Expand accounts"]],
    ["ru", ["Аккаунты", "Все аккаунты", "Свернуть аккаунты", "Развернуть аккаунты"]]]) {
    const messages = JSON.parse(readFileSync(`addon/_locales/${locale}/messages.json`, "utf8"));
    const labels = Object.fromEntries(Object.entries(messages).map(([key, value]) => [key, value.message]));
    const f = fixture(labels);
    f.view.render([], null);
    const heading = f.document.getElementById("accountpane-heading"), root = treeItems(f)[0];
    assert.equal(heading.textContent, expected[0]);
    assert.equal(rowText(root), expected[1]);
    assert.equal(f.document.getElementById("accountpane-list").getAttribute("aria-labelledby"), heading.id);
    assert.equal(part(root, "accountpane-disclosure").getAttribute("aria-label"), expected[2]);
    f.view.setExpanded(false);
    assert.equal(part(root, "accountpane-disclosure").getAttribute("aria-label"), expected[3]);
  }
});

test("synchronous selection rerender retains activated account focus", () => {
  const f = fixture(undefined, undefined, id => f.view.render(accounts, id));
  f.view.render(accounts, null);
  treeItems(f)[1].focus();
  treeItems(f)[1].dispatch("keydown", { key: "Enter" });
  assert.equal(rowText(f.document.activeElement), "Fixture A");
  part(treeItems(f)[2], "accountpane-name").dispatch("click");
  assert.equal(rowText(f.document.activeElement), "Local Folders");
  assert.deepEqual(f.selected, ["a", "local"]);
});
