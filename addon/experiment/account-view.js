// Shared script loaded into an isolated Thunderbird or test scope.
var AccountPaneView = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const ICON_PATHS = {
    all: [
      "M3.7 8.1h7.7a2.6 2.6 0 0 0 .1-5.2 4 4 0 0 0-7.4 1.2A2 2 0 0 0 3.7 8.1Z",
      "M2.7 13.4h9.1a2.2 2.2 0 0 0 .2-4.4H4a2.3 2.3 0 0 0-1.3 4.4Z"
    ],
    cloud: ["M3.2 12.8h8.5a3.3 3.3 0 0 0 .2-6.6A4.5 4.5 0 0 0 3.5 7.6a2.6 2.6 0 0 0-.3 5.2Z"],
    monitor: ["M2 2.5h12v8H9v1.5h2v1.5H5V12h2v-1.5H2v-8Zm1.5 1.5v5h9V4h-9Z"]
  };
  const DISCLOSURE_ICON = "chrome://messenger/skin/icons/new/nav-down-sm.svg";

  function createSvg(document, paths, className, kind) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    if (kind) svg.setAttribute("data-accountpane-icon", kind);
    for (const data of paths) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", data);
      svg.append(path);
    }
    return svg;
  }

  function create({ document, folderPane, labels, onSelect, onExpandedChanged = () => {},
    onContextMenu = () => {}, cssText }) {
    const tree = document.getElementById("folderTree");
    if (!tree || tree.parentNode !== folderPane) {
      throw new TypeError("AccountPane requires a supported folder pane");
    }
    const style = document.createElement("style");
    style.textContent = cssText ?? "";
    const section = document.createElement("section");
    section.id = "accountpane-accounts";
    const heading = document.createElement("h2");
    heading.id = "accountpane-heading";
    heading.textContent = labels.accounts;
    section.setAttribute("aria-labelledby", heading.id);
    const list = document.createElement("ul");
    list.id = "accountpane-list";
    list.setAttribute("role", "tree");
    list.setAttribute("aria-labelledby", heading.id);
    section.append(heading, list);
    folderPane.insertBefore(section, tree);
    document.head.append(style);

    let entries = [];
    let disposed = false;
    let expanded = true;
    let lastCounts = { showTotal: false, accounts: {} };

    function syncHeadingStyle() {
      const nativeHeading = document.querySelector?.("#folderTree .mode-name");
      const getComputedStyle = document.defaultView?.getComputedStyle;
      if (!nativeHeading || typeof getComputedStyle !== "function") return;
      const computed = getComputedStyle.call(document.defaultView, nativeHeading);
      for (const [name, value] of [
        ["font-family", computed.fontFamily],
        ["font-size", computed.fontSize],
        ["font-weight", computed.fontWeight],
        ["line-height", computed.lineHeight]
      ]) {
        if (typeof value === "string" && value) heading.style.setProperty(name, value);
      }
    }

    function createBadges() {
      const badges = document.createElement("span");
      badges.className = "accountpane-badges";
      badges.setAttribute("aria-hidden", "true");
      const unread = document.createElement("span");
      unread.className = "accountpane-unread-count";
      const total = document.createElement("span");
      total.className = "accountpane-total-count";
      badges.append(unread, total);
      return { badges, unread, total };
    }

    function createEntry(account, root = false) {
      const option = document.createElement("li");
      option.setAttribute("role", "treeitem");
      option.setAttribute("aria-selected", "false");
      option.className = root ? "accountpane-root" : "accountpane-child";
      const ownRow = document.createElement("div");
      ownRow.className = "accountpane-row";
      let disclosure = null;
      if (root) {
        disclosure = document.createElement("button");
        disclosure.className = "accountpane-disclosure";
        disclosure.setAttribute("type", "button");
        disclosure.tabIndex = -1;
        const disclosureIcon = document.createElement("img");
        disclosureIcon.className = "accountpane-disclosure-icon";
        disclosureIcon.setAttribute("src", DISCLOSURE_ICON);
        disclosureIcon.setAttribute("alt", "");
        disclosure.append(disclosureIcon);
        ownRow.append(disclosure);
      }
      const kind = root ? "all" : account.type === "none" || account.local ? "monitor" : "cloud";
      ownRow.append(createSvg(document, ICON_PATHS[kind], "accountpane-icon", kind));
      const name = document.createElement("span");
      name.className = "accountpane-name";
      name.textContent = account.name;
      const { badges, unread, total } = createBadges();
      ownRow.append(name, badges);
      option.append(ownRow);
      return { id: account.id, name: account.name, option, row: ownRow, disclosure, unread, total };
    }

    function entryFor(target) {
      return entries.find(entry => target === entry.option || entry.row.contains(target));
    }

    function rootEntry() {
      return entries[0];
    }

    function visibleEntries() {
      return expanded ? entries : entries.slice(0, 1);
    }

    function setTabStop(entry) {
      const visible = visibleEntries();
      const target = visible.includes(entry) ? entry : visible[0];
      for (const current of entries) {
        current.option.tabIndex = current === target ? 0 : -1;
      }
    }

    function onFocus(event) {
      const entry = entryFor(event.target);
      if (entry) setTabStop(entry);
    }

    function setExpanded(value) {
      if (disposed) return;
      expanded = value !== false;
      const root = rootEntry();
      if (!root) return;
      const activeEntry = entryFor(document.activeElement);
      root.option.setAttribute("aria-expanded", String(expanded));
      root.group.hidden = !expanded;
      root.disclosure.setAttribute("aria-label", expanded ? labels.collapseAccounts : labels.expandAccounts);
      root.disclosure.setAttribute("title", expanded ? labels.collapseAccounts : labels.expandAccounts);
      if (!expanded && activeEntry && activeEntry.id !== null) {
        setTabStop(root);
        root.option.focus();
      } else {
        setTabStop(activeEntry || entries.find(entry => entry.option.tabIndex === 0) || root);
      }
      updateCounts(lastCounts);
    }

    function toggleExpanded() {
      setExpanded(!expanded);
      onExpandedChanged(expanded);
    }

    function onContextMenuEvent(event) {
      const entry = entryFor(event.target);
      if (!entry || entry.id === null) return;
      consume(event);
      onContextMenu(entry.id, event, entry.row);
    }

    function onClick(event) {
      if (event.button && event.button !== 0) return;
      const root = rootEntry();
      if (root?.disclosure.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        root.option.focus();
        toggleExpanded();
        return;
      }
      const entry = entryFor(event.target);
      if (entry) {
        entry.option.focus();
        onSelect(entry.id);
      }
    }

    function consume(event) {
      event.preventDefault();
      event.stopPropagation();
    }

    function onKeyDown(event) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const root = rootEntry();
      if (root?.disclosure.contains(event.target) && (event.key === "Enter" || event.key === " ")) {
        consume(event);
        toggleExpanded();
        return;
      }
      const entry = entryFor(event.target);
      if (!entry) return;
      const visible = visibleEntries();
      const index = visible.indexOf(entry);
      let next = null;
      switch (event.key) {
        case "ArrowUp":
          next = visible[Math.max(0, index - 1)];
          break;
        case "ArrowDown":
          next = visible[Math.min(visible.length - 1, index + 1)];
          break;
        case "Home":
          next = visible[0];
          break;
        case "End":
          next = visible.at(-1);
          break;
        case "ArrowRight":
          consume(event);
          if (entry === root) {
            if (!expanded) toggleExpanded();
            else if (entries[1]) entries[1].option.focus();
          }
          return;
        case "ArrowLeft":
          consume(event);
          if (entry !== root) root.option.focus();
          else if (expanded) toggleExpanded();
          return;
        case "Enter":
        case " ":
          consume(event);
          onSelect(entry.id);
          return;
        default:
          return;
      }
      consume(event);
      next.option.focus();
    }

    list.addEventListener("contextmenu", onContextMenuEvent);
    list.addEventListener("click", onClick);
    list.addEventListener("keydown", onKeyDown);
    list.addEventListener("focusin", onFocus);

    function render(accounts, selectedAccountId) {
      if (disposed) return;
      const previouslyFocused = entryFor(document.activeElement);
      const selected = accounts.some(account => account.id === selectedAccountId) ? selectedAccountId : null;
      const root = createEntry({ id: null, name: labels.allAccounts, type: "all" }, true);
      const group = document.createElement("ul");
      group.setAttribute("role", "group");
      root.group = group;
      const children = accounts.map(account => createEntry(account));
      group.append(...children.map(entry => entry.option));
      root.option.append(group);
      entries = [root, ...children];
      for (const entry of entries) {
        entry.option.setAttribute("aria-selected", String(entry.id === selected));
      }
      list.replaceChildren(root.option);
      root.option.setAttribute("aria-expanded", String(expanded));
      group.hidden = !expanded;
      root.disclosure.setAttribute("aria-label", expanded ? labels.collapseAccounts : labels.expandAccounts);
      root.disclosure.setAttribute("title", expanded ? labels.collapseAccounts : labels.expandAccounts);
      const restored = previouslyFocused && entries.find(entry => entry.id === previouslyFocused.id);
      const selectedEntry = entries.find(entry => entry.id === selected);
      const tabStop = restored || selectedEntry || root;
      setTabStop(tabStop);
      updateCounts(lastCounts);
      syncHeadingStyle();
      if (previouslyFocused) {
        const focusTarget = visibleEntries().includes(restored) ? restored : root;
        focusTarget.option.focus();
      }
    }

    function updateCounts(snapshot) {
      if (disposed) return;
      lastCounts = snapshot;
      const accountEntries = entries.slice(1);
      const all = metric => {
        let sum = 0;
        for (const entry of accountEntries) {
          const value = snapshot.accounts?.[entry.id]?.[metric];
          if (!Number.isSafeInteger(value) || value < 0) return null;
          sum += value;
          if (!Number.isSafeInteger(sum)) return null;
        }
        return sum;
      };
      const aggregate = { unread: all("unread"), total: all("total") };
      const description = (template, value) => template?.replace("{count}", String(value));
      for (const entry of entries) {
        const counts = entry.id === null ? expanded ? null : aggregate : snapshot.accounts?.[entry.id];
        const unread = counts?.unread;
        const total = counts?.total;
        const showUnread = Number.isSafeInteger(unread) && unread > 0;
        const showTotal = snapshot.showTotal && Number.isSafeInteger(total) && total >= 0;
        entry.unread.textContent = showUnread ? String(unread) : "";
        entry.total.textContent = showTotal ? String(total) : "";
        const parts = [entry.name];
        if (showUnread) parts.push(description(labels.unreadCount, unread));
        if (showTotal) parts.push(description(labels.totalCount, total));
        entry.option.setAttribute("aria-label", parts.filter(Boolean).join(", "));
        entry.option.setAttribute("title", parts.filter(Boolean).join(", "));
      }
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      list.removeEventListener("contextmenu", onContextMenuEvent);
      list.removeEventListener("click", onClick);
      list.removeEventListener("keydown", onKeyDown);
      list.removeEventListener("focusin", onFocus);
      if (section.contains(document.activeElement)) tree.focus();
      section.remove();
      style.remove();
      entries = [];
    }

    syncHeadingStyle();
    return { render, setExpanded, updateCounts, dispose };
  }
  return { create };
})();
