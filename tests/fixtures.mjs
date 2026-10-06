// Synthetic model data only; no profile identifiers or user mailbox data.
export function makeModelFixture() {
  const account = (id, name, extra = {}) => ({
    id, serverKey: `server-${id}`, name, type: "imap",
    hidden: false, deferred: false, local: false, ...extra
  });
  const folder = (accountId, path, extra = {}) => ({
    uri: `fixture://${accountId}/${path}`, accountId,
    inbox: false, root: false, available: true, ...extra
  });
  return {
    accounts: [
      account("b", "Zulu"),
      account("a", "Alpha"),
      account("local", "Local Folders", { type: "none", local: true }),
      account("hidden", "Hidden", { hidden: true }),
      account("im", "Instant messages", { type: "im" }),
      account("chat", "Chat", { type: "chat" }),
      account("deferred", "Deferred POP", { type: "pop3", deferred: true }),
      account("pop", "Ordinary POP", { type: "pop3" })
    ],
    folders: [
      folder("a", "root", { root: true }),
      folder("a", "archive"),
      folder("a", "renamed-inbox", { inbox: true }),
      folder("a", "unavailable", { inbox: true, available: false }),
      folder("b", "root", { root: true }),
      folder("b", "inbox", { inbox: true }),
      folder("local", "root", { root: true }),
      folder("local", "saved")
    ]
  };
}

// Tree behavior mirrors the native rows contract: collapse excludes descendants,
// CSS/hidden attributes do not. All identifiers are synthetic.
export function makeTreeRow(accountId, parent = null) {
  const attributes = new Map();
  return {
    accountId, parent, collapsed: false, unselectable: false,
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); }
  };
}

export function makeTreeFixture(accountIds = ["a", "b"]) {
  const events = [];
  class Tree {
    constructor() { this.allRows = accountIds.map(id => makeTreeRow(id)); this.selection = []; }
    get rows() {
      return this.allRows.filter(row => {
        if (row.unselectable) { return false; }
        for (let parent = row.parent; parent; parent = parent.parent) {
          if (parent.collapsed) { return false; }
        }
        return true;
      });
    }
    get rowCount() { return this.rows.length; }
    getRowAtIndex(index) { return this.rows[index]; }
    querySelectorAll() { return this.allRows.filter(row => !row.unselectable); }
    updateSelection(row, event) {
      events.push({ type: "update", receiver: this, args: [row, event], rows: [...this.rows] });
      this.selection = row ? [row] : [];
      return "updated";
    }
    swapSelection(rows) {
      events.push({ type: "swap", receiver: this, args: [rows], rows: [...this.rows] });
      this.selection = [...rows];
      return "swapped";
    }
    key(key) { return this.updateSelection(this.getRowAtIndex(key === "Home" ? 0 : this.rowCount - 1)); }
  }
  const tree = new Tree();
  const observers = [];
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  }
  const window = {
    MutationObserver,
    ensureFolderTreeRowIsVisible(row, ...args) {
      events.push({ type: "ensure", receiver: this, args: [row, ...args], rows: [...tree.rows],
        marker: row.getAttribute("data-accountpane-hidden") });
      for (let parent = row.parent; parent; parent = parent.parent) { parent.collapsed = false; }
      return "ensured";
    }
  };
  return {
    tree, window, events, observers,
    options: { window, tree, accountForRow: row => row?.accountId ?? null,
      followTarget(accountId) { events.push({ type: "follow", accountId, rows: [...tree.rows] }); } },
    mutate() { for (const observer of observers) { if (!observer.disconnected) { observer.callback([]); } } }
  };
}
