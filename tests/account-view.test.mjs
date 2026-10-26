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
  get classList() {
    const element = this;
    const names = () => (element.getAttribute("class") || "").split(/\s+/).filter(Boolean);
    return {
      contains(name) { return names().includes(name); },
      toggle(name, force) {
        const present = names().includes(name);
        const next = force === undefined ? !present : Boolean(force);
        const rest = names().filter(item => item !== name);
        element.setAttribute("class", (next ? [...rest, name] : rest).join(" "));
        return next;
      }
    };
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
  unreadCount: "Unread messages: {count}", totalCount: "Total messages: {count}",
  newMessages: "new messages", expandGroup: "Expand {name}", collapseGroup: "Collapse {name}"
};

function fixture(labels = defaultLabels, cssText = "/* fixture CSS */", onSelect = () => {},
    onExpandedChanged = () => {}, onContextMenu = () => {}, onReorder = () => {}, onMove = () => {}) {
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
    // Copies drop the script scope's prototypes so deepEqual compares plain values.
    onSelect: selection => { selected.push({ ...selection }); onSelect(selection); },
    onReorder, onMove,
    onExpandedChanged: (id, value) => { expandedChanges.push([id, value]); onExpandedChanged(id, value); },
    onContextMenu: (target, event, anchor) => {
      contextMenus.push({ target: { ...target }, event, anchor });
      onContextMenu(target, event, anchor);
    } });
  return { document, folderPane, dropIndicator, header, tree, template, nativeHeading,
    selected, expandedChanges, contextMenus, view };
}

const section = f => f.document.getElementById("accountpane-accounts");
const treeItems = f => descendants(section(f)).filter(node => node.getAttribute("role") === "treeitem");
const row = item => item.children[0];
const rowText = item => row(item).textContent;
const part = (item, className) => descendants(row(item)).find(node => node.getAttribute("class") === className);
const account = id => ({ type: "account", id });
const DEFAULT = { type: "group", id: "default" };
const byId = list => Object.fromEntries(list.map(item => [item.id, item]));
const defaultGroup = list => ({ id: "default", name: null, custom: false, accountIds: list.map(item => item.id) });
// The single-group shape the 0.1.13-compatible controller renders.
const show = (f, list, id) => f.view.render([defaultGroup(list)], id === null ? DEFAULT : account(id), byId(list));
const setExpanded = (f, value) => f.view.setCollapsed(value ? [] : ["default"]);
const accounts = [
  { id: "a", serverKey: "server-a", name: "Fixture A", type: "imap", hidden: false, deferred: false, local: false },
  { id: "local", serverKey: "server-local", name: "Local Folders", type: "none", hidden: false, deferred: false, local: true }
];

test("renders an accessible account tree with All Accounts owning the nested native-order group", () => {
  const f = fixture();
  show(f, accounts, "a");
  const list = f.document.getElementById("accountpane-list"), items = treeItems(f);
  assert.equal(list.getAttribute("role"), "tree");
  assert.equal(items[0].parentNode, list);
  assert.equal(items[0].getAttribute("aria-expanded"), "true");
  assert.equal(items[0].children[1].getAttribute("role"), "group");
  assert.deepEqual(items.slice(1).map(item => item.parentNode), [items[0].children[1], items[0].children[1]]);
  assert.deepEqual(items.map(rowText), ["All Accounts", "Fixture A", "Local Folders"]);
  assert.deepEqual(items.map(item => item.getAttribute("aria-selected")), ["false", "true", "false"]);
  show(f, [accounts[1], accounts[0]], null);
  assert.deepEqual(treeItems(f).map(rowText), ["All Accounts", "Local Folders", "Fixture A"]);
  assert.equal(descendants(f.folderPane).filter(node => node.id === "accountpane-accounts").length, 1);
});

test("heading matches the live native mode heading and leaves host layout intact", () => {
  const f = fixture();
  show(f, accounts, null);
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
  show(f, [{ ...accounts[0], name: '<img src=x onerror="throw 1"> #fixture' }, accounts[1]], "a");
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
  show(f, accounts, "a");
  let items = treeItems(f);
  part(items[2], "accountpane-name").dispatch("click");
  part(items[1], "accountpane-badges").dispatch("click");
  part(items[0], "accountpane-name").dispatch("click");
  items[0].children[1].dispatch("click");
  part(items[0], "accountpane-disclosure").dispatch("click");
  items = treeItems(f);
  assert.deepEqual(f.selected, [account("local"), account("a"), DEFAULT]);
  assert.deepEqual(f.expandedChanges, [["default", false]]);
  assert.equal(f.document.activeElement, items[0]);
  assert.equal(items[0].getAttribute("aria-expanded"), "false");
});

test("assistive-technology focus on disclosure lets Enter and Space toggle without selection", () => {
  const f = fixture();
  show(f, accounts, "a");
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
  assert.deepEqual(f.expandedChanges, [["default", false], ["default", true]]);
});

test("context menu dispatches account and default header targets without selecting or navigating", () => {
  const f = fixture();
  show(f, accounts, null);
  const items = treeItems(f);
  const childEvent = row(items[1]).dispatch("contextmenu", { button: 2, screenX: 20, screenY: 30 });
  assert.equal(childEvent.defaultPrevented, true);
  assert.equal(childEvent.stopped, true);
  assert.equal(f.contextMenus.length, 1);
  assert.deepEqual(f.contextMenus[0].target, account("a"));
  assert.equal(f.contextMenus[0].anchor, row(items[1]));
  const rootEvent = row(items[0]).dispatch("contextmenu", { button: 2 });
  assert.equal(rootEvent.defaultPrevented, true);
  assert.deepEqual(f.contextMenus.map(menu => menu.target), [account("a"), DEFAULT]);
  assert.equal(f.contextMenus[1].anchor, row(items[0]));
  assert.deepEqual(f.selected, []);
  assert.equal(items[0].getAttribute("aria-selected"), "true");
});

test("collapsing a focused selected child moves focus to root without selecting All Accounts", () => {
  const f = fixture();
  show(f, accounts, "a");
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
  show(f, accounts, "a");
  f.tree.focus();
  setExpanded(f, false);
  assert.equal(f.document.activeElement, f.tree);
  assert.equal(treeItems(f)[0].getAttribute("aria-expanded"), "false");
});

test("counts stay per-account when expanded and aggregate only on the collapsed root", () => {
  const f = fixture();
  show(f, accounts, "a");
  const items = treeItems(f), identities = [...items];
  items[1].focus();
  f.view.updateCounts({ showTotal: true, accounts: {
    a: { unread: 2, total: 5 }, local: { unread: 3, total: 9 }, hidden: { unread: 80, total: 90 }
  } });
  assert.deepEqual(treeItems(f), identities);
  assert.deepEqual(items.map(rowText), ["All Accounts", "Fixture A25", "Local Folders39"]);
  assert.equal(items[0].getAttribute("aria-label"), "All Accounts");
  setExpanded(f, false);
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
  show(f, accounts, null);
  setExpanded(f, false);
  f.view.updateCounts({ showTotal: true, accounts: {
    a: { unread: 0, total: 0 }, local: { unread: null, total: 7 }
  } });
  const items = treeItems(f);
  assert.deepEqual(items.map(rowText), ["All Accounts7", "Fixture A0", "Local Folders7"]);
  assert.equal(items[0].getAttribute("aria-label"), "All Accounts, Total messages: 7");
});

test("new-mail class marks only accounts with new messages and the label joins aria-label", () => {
  const f = fixture();
  show(f, accounts, null);
  const items = treeItems(f);
  f.view.updateCounts({ showTotal: false, accounts: {
    a: { unread: 2, total: 5, hasNew: true }, local: { unread: 0, total: 1, hasNew: false }
  } });
  assert.deepEqual(items.map(item => item.classList.contains("accountpane-new-messages")), [false, true, false]);
  assert.equal(items[1].getAttribute("aria-label"), "Fixture A, Unread messages: 2, new messages");
  assert.equal(items[1].getAttribute("title"), "Fixture A, Unread messages: 2, new messages");
  assert.equal(items[2].getAttribute("aria-label"), "Local Folders");
  f.view.updateCounts({ showTotal: false, accounts: { a: { unread: 2, total: 5, hasNew: false } } });
  assert.equal(items[1].classList.contains("accountpane-new-messages"), false);
  assert.equal(items[1].getAttribute("aria-label"), "Fixture A, Unread messages: 2");
});

test("All Accounts shows new mail only while collapsed and some account has it", () => {
  const f = fixture();
  show(f, accounts, null);
  const items = treeItems(f);
  f.view.updateCounts({ showTotal: false, accounts: {
    a: { unread: 0, total: 5, hasNew: false }, local: { unread: 1, total: 1, hasNew: true }
  } });
  assert.equal(items[0].classList.contains("accountpane-new-messages"), false);
  assert.equal(items[0].getAttribute("aria-label"), "All Accounts");
  setExpanded(f, false);
  assert.equal(items[0].classList.contains("accountpane-new-messages"), true);
  assert.equal(items[0].getAttribute("aria-label"), "All Accounts, Unread messages: 1, new messages");
  f.view.updateCounts({ showTotal: false, accounts: {
    a: { unread: 0, total: 5, hasNew: false }, local: { unread: 1, total: 1, hasNew: false }
  } });
  assert.equal(items[0].classList.contains("accountpane-new-messages"), false);
  f.view.updateCounts({ showTotal: false, accounts: { a: { unread: 0, total: 5, hasNew: true } } });
  assert.equal(items[0].classList.contains("accountpane-new-messages"), true);
  setExpanded(f, true);
  assert.equal(items[0].classList.contains("accountpane-new-messages"), false);
  assert.equal(items[1].classList.contains("accountpane-new-messages"), true);
});

test("every row carries a decorative star immediately before its icon", () => {
  const f = fixture();
  show(f, accounts, null);
  for (const item of treeItems(f)) {
    const children = row(item).children;
    const icon = children.findIndex(node => node.getAttribute("class") === "accountpane-icon");
    // Native folder rows put .new-icon before .icon; the margins rely on it.
    assert.ok(icon > 0);
    const star = children[icon - 1];
    assert.equal(star.getAttribute("class"), "accountpane-new-star");
    assert.equal(star.getAttribute("aria-hidden"), "true");
    assert.equal(star.textContent, "");
    assert.equal(item.classList.contains("accountpane-new-messages"), false);
  }
});

test("tree keyboard expands collapses and moves only through visible account items", () => {
  const f = fixture();
  show(f, accounts, "a");
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
  show(f, accounts, null);
  const items = treeItems(f);
  for (const [key, index] of [["Enter", 1], [" ", 2], ["Enter", 0]]) {
    items[index].focus();
    const event = items[index].dispatch("keydown", { key });
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
  }
  assert.deepEqual(f.selected, [account("a"), account("local"), DEFAULT]);
  for (const properties of [{ key: "Tab" }, { key: "Tab", shiftKey: true }, { key: "ArrowDown", ctrlKey: true }]) {
    const event = items[0].dispatch("keydown", properties);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.stopped, false);
  }
  assert.equal(f.tree.tabIndex, 0);
});

test("rerender preserves expansion and account focus across rename and reorder", () => {
  const f = fixture();
  show(f, accounts, "a");
  treeItems(f)[2].focus();
  show(f, [{ ...accounts[1], name: "Renamed" }, accounts[0]], "a");
  assert.equal(rowText(f.document.activeElement), "Renamed");
  setExpanded(f, false);
  show(f, accounts, "a");
  const items = treeItems(f);
  assert.equal(items[0].getAttribute("aria-expanded"), "false");
  assert.equal(items[0].children[1].hidden, true);
  assert.equal(f.document.activeElement, items[0]);
  f.tree.focus();
  show(f, accounts, "local");
  assert.equal(f.document.activeElement, f.tree);
  assert.deepEqual(treeItems(f).map(item => item.tabIndex), [0, -1, -1]);
});

test("an account-less default group stays a selectable root and unknown selection marks nothing", () => {
  const f = fixture();
  setExpanded(f, false);
  show(f, [], null);
  let items = treeItems(f);
  assert.deepEqual(items.map(rowText), ["All Accounts"]);
  assert.equal(items[0].getAttribute("aria-selected"), "true");
  assert.equal(items[0].getAttribute("aria-expanded"), "false");
  assert.equal(items[0].tabIndex, 0);
  f.view.render([defaultGroup([])], account("removed"), {});
  items = treeItems(f);
  assert.equal(items[0].getAttribute("aria-selected"), "false");
  assert.equal(items[0].tabIndex, 0);
});

test("dispose removes owned nodes and listeners while preserving the native pane", () => {
  const f = fixture();
  show(f, accounts, "a");
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
  show(f, accounts, null);
  assert.deepEqual(f.selected, []);
});

test("localized labels name the tree root and disclosure in both states", () => {
  for (const [locale, expected] of [["en", ["Accounts", "All Accounts", "Collapse accounts", "Expand accounts"]],
    ["ru", ["Аккаунты", "Все аккаунты", "Свернуть аккаунты", "Развернуть аккаунты"]]]) {
    const messages = JSON.parse(readFileSync(`addon/_locales/${locale}/messages.json`, "utf8"));
    const labels = Object.fromEntries(Object.entries(messages).map(([key, value]) => [key, value.message]));
    const f = fixture(labels);
    show(f, [], null);
    const heading = f.document.getElementById("accountpane-heading"), root = treeItems(f)[0];
    assert.equal(heading.textContent, expected[0]);
    assert.equal(rowText(root), expected[1]);
    assert.equal(f.document.getElementById("accountpane-list").getAttribute("aria-labelledby"), heading.id);
    assert.equal(part(root, "accountpane-disclosure").getAttribute("aria-label"), expected[2]);
    setExpanded(f, false);
    assert.equal(part(root, "accountpane-disclosure").getAttribute("aria-label"), expected[3]);
  }
});

test("localized new-mail label reaches the row aria-label", () => {
  for (const [locale, expected] of [["en", "new messages"], ["ru", "есть новые письма"]]) {
    const messages = JSON.parse(readFileSync(`addon/_locales/${locale}/messages.json`, "utf8"));
    const labels = Object.fromEntries(Object.entries(messages).map(([key, value]) => [key, value.message]));
    const f = fixture(labels);
    show(f, accounts, null);
    f.view.updateCounts({ showTotal: false, accounts: { a: { unread: 0, total: 0, hasNew: true } } });
    assert.equal(treeItems(f)[1].getAttribute("aria-label"), `Fixture A, ${expected}`);
  }
});

test("synchronous selection rerender retains activated account focus", () => {
  const f = fixture(undefined, undefined, selection => f.view.render([defaultGroup(accounts)], selection, byId(accounts)));
  show(f, accounts, null);
  treeItems(f)[1].focus();
  treeItems(f)[1].dispatch("keydown", { key: "Enter" });
  assert.equal(rowText(f.document.activeElement), "Fixture A");
  part(treeItems(f)[2], "accountpane-name").dispatch("click");
  assert.equal(rowText(f.document.activeElement), "Local Folders");
  assert.deepEqual(f.selected, [account("a"), account("local")]);
});

function transfer() {
  const values = new Map();
  return { effectAllowed: "", dropEffect: "", setData(type, value) { values.set(type, value); },
    get types() { return [...values.keys()]; },
    getData(type) { return values.get(type) || ""; } };
}
function drag(f, source, target, before = true, dataTransfer = transfer()) {
  row(source).dispatch("dragstart", { dataTransfer });
  row(target).getBoundingClientRect = () => ({ top: 10, height: 20 });
  const over = row(target).dispatch("dragover", { dataTransfer, clientY: before ? 11 : 29 });
  const drop = row(target).dispatch("drop", { dataTransfer, clientY: before ? 11 : 29 });
  return { over, drop, dataTransfer };
}
test("account drag invokes reorder before or after another account without navigation", () => {
  const calls = [], f = fixture(undefined, undefined, undefined, undefined, undefined,
    (...args) => calls.push(args));
  show(f, accounts, "a");
  const items = treeItems(f);
  assert.equal(row(items[1]).getAttribute("draggable"), "true");
  assert.notEqual(row(items[0]).getAttribute("draggable"), "true");
  const result = drag(f, items[2], items[1]);
  assert.equal(result.over.defaultPrevented, true);
  assert.equal(result.dataTransfer.effectAllowed, "move");
  assert.deepEqual(calls, [["local", "a", true]]);
  row(items[2]).dispatch("click");
  assert.deepEqual(f.selected, []);
  drag(f, items[1], items[2], false);
  assert.deepEqual(calls.at(-1), ["a", "local", false]);
  assert.equal(items[1].getAttribute("aria-selected"), "true");
});
test("foreign drops, root and self drops, cancellation and stale rerender cannot reorder", () => {
  const calls = [], f = fixture(undefined, undefined, undefined, undefined, undefined,
    (...args) => calls.push(args));
  show(f, accounts, null);
  let items = treeItems(f);
  row(items[1]).getBoundingClientRect = () => ({ top: 0, height: 20 });
  row(items[1]).dispatch("drop", { dataTransfer: transfer(), clientY: 0 });
  drag(f, items[0], items[1]); drag(f, items[1], items[0]); drag(f, items[1], items[1]);
  const dt = transfer();
  row(items[1]).dispatch("dragstart", { dataTransfer: dt });
  row(items[2]).dispatch("dragend", { dataTransfer: dt });
  row(items[2]).dispatch("drop", { dataTransfer: dt });
  row(items[1]).dispatch("dragstart", { dataTransfer: dt });
  show(f, accounts, null); items = treeItems(f);
  row(items[2]).dispatch("drop", { dataTransfer: dt });
  row(items[1]).dispatch("dragstart", { dataTransfer: dt });
  row(items[2]).getBoundingClientRect = () => ({ top: 0, height: 20 });
  row(items[2]).dispatch("dragover", { dataTransfer: dt, clientY: 1 });
  assert.equal(row(items[2]).getAttribute("data-accountpane-drop"), "before");
  row(items[2]).dispatch("dragleave", { relatedTarget: null });
  assert.equal(row(items[2]).getAttribute("data-accountpane-drop"), null);
  f.view.dispose();
  assert.deepEqual(calls, []);
});

test("protected dragover data permits owned insertion while foreign drag sources are ignored", () => {
  const calls = [], f = fixture(undefined, undefined, undefined, undefined, undefined,
    (...args) => calls.push(args));
  show(f, accounts, "a");
  const items = treeItems(f), dt = transfer();
  row(items[2]).getBoundingClientRect = () => ({ top: 0, height: 20 });
  row(items[1]).dispatch("dragstart", { dataTransfer: dt });
  const read = dt.getData;
  dt.getData = () => ""; // HTML drag data is protected before drop.
  dt.mozSourceNode = row(items[1]);
  const over = row(items[2]).dispatch("dragover", { dataTransfer: dt, clientY: 19 });
  assert.equal(over.defaultPrevented, true);
  assert.equal(row(items[2]).getAttribute("data-accountpane-drop"), "after");
  dt.mozSourceNode = f.tree;
  const foreign = row(items[2]).dispatch("dragover", { dataTransfer: dt, clientY: 19 });
  assert.equal(foreign.defaultPrevented, false);
  assert.equal(row(items[2]).getAttribute("data-accountpane-drop"), null);
  dt.mozSourceNode = row(items[1]); dt.getData = read;
  row(items[2]).dispatch("drop", { dataTransfer: dt, clientY: 19 });
  assert.deepEqual(calls, [["a", "local", false]]);
});

test("mismatched drop token and collapse cancel the drag and a fresh mouse gesture selects normally", () => {
  const calls = [], f = fixture(undefined, undefined, undefined, undefined, undefined,
    (...args) => calls.push(args));
  show(f, accounts, "a");
  const items = treeItems(f), dt = transfer();
  row(items[2]).getBoundingClientRect = () => ({ top: 0, height: 20 });
  row(items[1]).dispatch("dragstart", { dataTransfer: dt });
  row(items[2]).dispatch("drop", { dataTransfer: { types: dt.types, getData: () => "foreign" }, clientY: 19 });
  row(items[1]).dispatch("dragstart", { dataTransfer: dt });
  setExpanded(f, false); setExpanded(f, true);
  row(items[2]).dispatch("drop", { dataTransfer: dt, clientY: 19 });
  assert.deepEqual(calls, []);
  row(items[2]).dispatch("mousedown"); row(items[2]).dispatch("click");
  assert.deepEqual(f.selected, [account("local")]);
});

const allAccounts = [...accounts,
  { id: "b", serverKey: "server-b", name: "Fixture B", type: "imap", hidden: false, deferred: false, local: false }];
const groups = [
  { id: "default", name: "All Accounts", custom: false, accountIds: ["a", "local"] },
  { id: "g-1", name: "Work", custom: true, accountIds: ["b"] },
  { id: "g-2", name: "Empty", custom: true, accountIds: [] }
];
const group = id => ({ type: "group", id });
const showGroups = (f, selection = DEFAULT, list = groups) => f.view.render(list, selection, byId(allAccounts));
function groupFixture() {
  const reorders = [], moves = [];
  const f = fixture(undefined, undefined, undefined, undefined, undefined,
    (...args) => reorders.push(args), (...args) => moves.push(args.map(arg => typeof arg === "object" && arg ? { ...arg } : arg)));
  return Object.assign(f, { reorders, moves });
}

test("with only the default group the DOM matches 0.1.13", () => {
  const f = fixture();
  show(f, accounts, null);
  const list = f.document.getElementById("accountpane-list"), items = treeItems(f);
  assert.deepEqual(list.children, [items[0]]);
  assert.equal(items[0].getAttribute("class"), "accountpane-root");
  assert.equal(items[0].getAttribute("aria-level"), "1");
  assert.equal(items[0].getAttribute("data-accountpane-group"), "default");
  assert.deepEqual(items.slice(1).map(item => [item.getAttribute("class"), item.getAttribute("aria-level")]),
    [["accountpane-child", "2"], ["accountpane-child", "2"]]);
  const disclosure = part(items[0], "accountpane-disclosure");
  assert.equal(disclosure.getAttribute("data-accountpane-placeholder"), null);
  assert.equal(disclosure.getAttribute("aria-hidden"), null);
  assert.equal(disclosure.getAttribute("aria-label"), "Collapse accounts");
  assert.equal(rowText(items[0]), "All Accounts");
});

test("renders user group headers after the default with their accounts and levels", () => {
  const f = fixture();
  showGroups(f, account("b"));
  const list = f.document.getElementById("accountpane-list"), items = treeItems(f);
  assert.deepEqual(items.map(rowText), ["All Accounts", "Fixture A", "Local Folders", "Work", "Fixture B", "Empty"]);
  assert.deepEqual(list.children, [items[0], items[3], items[5]]);
  assert.deepEqual([0, 3, 5].map(index => [items[index].getAttribute("class"),
    items[index].getAttribute("data-accountpane-group"), items[index].getAttribute("aria-level")]),
  [["accountpane-root", "default", "1"], ["accountpane-root accountpane-group", "g-1", "1"],
    ["accountpane-root accountpane-group", "g-2", "1"]]);
  assert.equal(items[4].parentNode, items[3].children[1]);
  assert.equal(items[4].getAttribute("aria-level"), "2");
  assert.equal(part(items[3], "accountpane-icon").getAttribute("data-accountpane-icon"), "all");
  assert.deepEqual(items.map(item => item.getAttribute("aria-selected")),
    ["false", "false", "false", "false", "true", "false"]);
  showGroups(f, group("g-1"));
  assert.equal(treeItems(f)[3].getAttribute("aria-selected"), "true");
  assert.equal(treeItems(f)[3].tabIndex, 0);
});

test("clicking a header selects the group and clicking its disclosure toggles only it", () => {
  const f = fixture();
  showGroups(f);
  const items = treeItems(f);
  part(items[3], "accountpane-name").dispatch("click");
  part(items[3], "accountpane-disclosure").dispatch("click");
  assert.deepEqual(f.selected, [group("g-1")]);
  assert.deepEqual(f.expandedChanges, [["g-1", false]]);
  assert.equal(f.document.activeElement, items[3]);
  assert.deepEqual([0, 3].map(index => items[index].getAttribute("aria-expanded")), ["true", "false"]);
  assert.deepEqual([0, 3].map(index => items[index].children[1].hidden), [false, true]);
});

test("empty group header focuses without selecting and has no aria-expanded", () => {
  const f = fixture();
  showGroups(f);
  const empty = treeItems(f)[5];
  assert.equal(empty.getAttribute("aria-expanded"), null);
  // The disclosure stays in the layout as an invisible placeholder, never [hidden].
  const placeholder = part(empty, "accountpane-disclosure");
  assert.equal(placeholder.hidden, false);
  assert.equal(placeholder.getAttribute("data-accountpane-placeholder"), "");
  assert.equal(placeholder.getAttribute("aria-hidden"), "true");
  part(empty, "accountpane-name").dispatch("click");
  assert.equal(f.document.activeElement, empty);
  for (const key of ["Enter", " ", "ArrowRight", "ArrowLeft"]) {
    assert.equal(empty.dispatch("keydown", { key }).defaultPrevented, true);
  }
  assert.deepEqual(f.selected, []);
  assert.deepEqual(f.expandedChanges, []);
  assert.equal(empty.getAttribute("aria-expanded"), null);
});

test("keyboard moves across groups, Right/Left expand collapse and climb", () => {
  const f = fixture();
  showGroups(f);
  const items = treeItems(f), key = name => f.document.activeElement.dispatch("keydown", { key: name });
  items[0].focus();
  key("End");
  assert.equal(f.document.activeElement, items[5]);
  key("Home");
  assert.equal(f.document.activeElement, items[0]);
  items[3].focus();
  key("ArrowLeft");
  assert.equal(items[3].getAttribute("aria-expanded"), "false");
  key("ArrowDown");
  assert.equal(f.document.activeElement, items[5]);
  key("ArrowUp");
  key("ArrowRight");
  assert.equal(items[3].getAttribute("aria-expanded"), "true");
  key("ArrowRight");
  assert.equal(f.document.activeElement, items[4]);
  key("ArrowLeft");
  assert.equal(f.document.activeElement, items[3]);
  key("ArrowUp");
  assert.equal(f.document.activeElement, items[2]);
  assert.deepEqual(f.expandedChanges, [["g-1", false], ["g-1", true]]);
  assert.deepEqual(f.selected, []);
});

test("context menu dispatches group and account targets, including the default header", () => {
  const f = fixture();
  showGroups(f);
  const items = treeItems(f);
  for (const index of [0, 3, 4, 5]) row(items[index]).dispatch("contextmenu", { button: 2 });
  assert.deepEqual(f.contextMenus.map(menu => menu.target), [DEFAULT, group("g-1"), account("b"), group("g-2")]);
  assert.deepEqual(f.contextMenus.map(menu => menu.anchor), [0, 3, 4, 5].map(index => row(items[index])));
  assert.deepEqual(f.selected, []);
});

test("drop on a group header moves without placement", () => {
  const f = groupFixture();
  showGroups(f);
  const items = treeItems(f), dt = transfer();
  row(items[1]).dispatch("dragstart", { dataTransfer: dt });
  const over = row(items[5]).dispatch("dragover", { dataTransfer: dt, clientY: 0 });
  assert.equal(over.defaultPrevented, true);
  assert.equal(row(items[5]).getAttribute("data-accountpane-drop"), "into");
  row(items[5]).dispatch("drop", { dataTransfer: dt, clientY: 0 });
  assert.equal(row(items[5]).getAttribute("data-accountpane-drop"), null);
  drag(f, items[4], items[0]);
  assert.deepEqual(f.moves, [["a", "g-2", null], ["b", "default", null]]);
  assert.deepEqual(f.reorders, []);
});

test("drop on an account of another group moves with placement", () => {
  const f = groupFixture();
  showGroups(f);
  const items = treeItems(f);
  drag(f, items[4], items[1], true);
  drag(f, items[1], items[4], false);
  assert.deepEqual(f.moves, [["b", "default", { targetId: "a", before: true }],
    ["a", "g-1", { targetId: "b", before: false }]]);
  assert.deepEqual(f.reorders, []);
});

test("drop inside the same group still reorders", () => {
  const f = groupFixture();
  showGroups(f);
  const items = treeItems(f);
  drag(f, items[2], items[1], true);
  assert.deepEqual(f.reorders, [["local", "a", true]]);
  assert.deepEqual(f.moves, []);
});

test("drop on own header is ignored", () => {
  const f = groupFixture();
  showGroups(f);
  const items = treeItems(f);
  const { over } = drag(f, items[4], items[3]);
  assert.equal(over.defaultPrevented, false);
  assert.equal(row(items[3]).getAttribute("data-accountpane-drop"), null);
  assert.deepEqual([f.moves, f.reorders], [[], []]);
});

test("dragging a member of a collapsed group is impossible but dropping on a collapsed header works", () => {
  const f = groupFixture();
  f.view.setCollapsed(["g-1"]);
  showGroups(f);
  const items = treeItems(f);
  assert.equal(row(items[4]).dispatch("dragstart", { dataTransfer: transfer() }).defaultPrevented, true);
  drag(f, items[1], items[3]);
  assert.deepEqual(f.moves, [["a", "g-1", null]]);
});

test("each collapsed header aggregates only its members and shows the star if any member has new mail", () => {
  const f = fixture();
  f.view.setCollapsed(["default", "g-1", "g-2"]);
  showGroups(f);
  const items = treeItems(f);
  f.view.updateCounts({ showTotal: true, accounts: {
    a: { unread: 2, total: 5, hasNew: false }, local: { unread: 3, total: 9 }, b: { unread: 1, total: 4, hasNew: true }
  } });
  assert.deepEqual([0, 3, 5].map(index => rowText(items[index])), ["All Accounts514", "Work14", "Empty"]);
  assert.deepEqual([0, 3, 5].map(index => items[index].classList.contains("accountpane-new-messages")),
    [false, true, false]);
  assert.equal(items[3].getAttribute("aria-label"), "Work, Unread messages: 1, Total messages: 4, new messages");
  assert.equal(items[5].getAttribute("aria-label"), "Empty");
  f.view.setCollapsed(["default"]);
  assert.deepEqual([0, 3, 4].map(index => rowText(items[index])), ["All Accounts514", "Work", "Fixture B14"]);
  assert.equal(items[3].classList.contains("accountpane-new-messages"), false);
});

test("focusGroup focuses the new header after render", () => {
  const f = fixture();
  showGroups(f);
  f.tree.focus();
  showGroups(f, DEFAULT, [...groups, { id: "g-3", name: "New", custom: true, accountIds: [] }]);
  f.view.focusGroup("g-3");
  const items = treeItems(f);
  assert.equal(f.document.activeElement, items[6]);
  assert.deepEqual(items.map(item => item.tabIndex), [-1, -1, -1, -1, -1, -1, 0]);
  f.view.focusGroup("missing");
  assert.equal(f.document.activeElement, items[6]);
  assert.deepEqual(f.selected, []);
});

test("disclosure labels name the group when user groups exist", () => {
  const f = fixture();
  showGroups(f);
  let items = treeItems(f);
  assert.deepEqual([0, 3].map(index => part(items[index], "accountpane-disclosure").getAttribute("aria-label")),
    ["Collapse All Accounts", "Collapse Work"]);
  f.view.setCollapsed(["g-1"]);
  const disclosure = part(items[3], "accountpane-disclosure");
  assert.deepEqual([disclosure.getAttribute("aria-label"), disclosure.getAttribute("title")], ["Expand Work", "Expand Work"]);
  showGroups(f, DEFAULT, [groups[0], { ...groups[1], name: "R&D $& $1" }]);
  items = treeItems(f);
  assert.equal(part(items[3], "accountpane-disclosure").getAttribute("aria-label"), "Expand R&D $& $1");
});
