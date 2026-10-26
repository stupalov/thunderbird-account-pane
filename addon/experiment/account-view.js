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
    onContextMenu = () => {}, onReorder = () => {}, onMove = () => {}, cssText }) {
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
    let collapsed = new Set();
    let multiple = false;
    let lastCounts = { showTotal: false, accounts: {} };
    const dragType = "application/x-accountpane-account";
    let dragState = null;
    let suppressClick = false;

    // Rows match the native folder rows, whatever density or theme sets their height.
    function syncRowHeight() {
      const rows = document.querySelectorAll?.("#folderTree li:not([data-server-type]) > .container") ?? [];
      for (const row of rows) {
        const height = row.getBoundingClientRect?.().height;
        if (Number.isFinite(height) && height > 0) {
          list.style.setProperty("--accountpane-row-height", `${height}px`);
          return;
        }
      }
    }

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
      if (!root) ownRow.setAttribute("draggable", "true");
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
      // Native folder rows put the sparkle before the icon; with its negative
      // margins the icon overlaps it, leaving it at the icon's top-left corner.
      const star = document.createElement("span");
      star.className = "accountpane-new-star";
      star.setAttribute("aria-hidden", "true");
      ownRow.append(star, createSvg(document, ICON_PATHS[kind], "accountpane-icon", kind));
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

    function headerFor(target) {
      return entries.find(entry => entry.disclosure?.contains(target));
    }

    function isExpanded(header) {
      return !header.empty && !collapsed.has(header.id);
    }

    function visibleEntries() {
      return entries.filter(entry => entry === entry.header || isExpanded(entry.header));
    }

    function setTabStop(entry) {
      const visible = visibleEntries();
      const target = visible.includes(entry) ? entry : entry?.header ?? visible[0];
      for (const current of entries) {
        current.option.tabIndex = current === target ? 0 : -1;
      }
    }

    function onFocus(event) {
      const entry = entryFor(event.target);
      if (entry) setTabStop(entry);
    }

    function syncHeader(header) {
      const expanded = isExpanded(header);
      if (header.empty) header.option.removeAttribute("aria-expanded");
      else header.option.setAttribute("aria-expanded", String(expanded));
      header.group.hidden = !expanded;
      // Not the hidden attribute: a placeholder keeps its slot under any stylesheet.
      for (const [name, value] of [["data-accountpane-placeholder", ""], ["aria-hidden", "true"]]) {
        if (header.empty) header.disclosure.setAttribute(name, value);
        else header.disclosure.removeAttribute(name);
      }
      const template = multiple ? expanded ? labels.collapseGroup : labels.expandGroup :
        expanded ? labels.collapseAccounts : labels.expandAccounts;
      const label = multiple ? (template ?? "").replace("{name}", () => header.name) : template;
      header.disclosure.setAttribute("aria-label", label);
      header.disclosure.setAttribute("title", label);
    }

    function applyCollapsed() {
      clearDrag();
      const activeEntry = entryFor(document.activeElement);
      for (const entry of entries) if (entry === entry.header) syncHeader(entry);
      if (activeEntry && !visibleEntries().includes(activeEntry)) {
        setTabStop(activeEntry.header);
        activeEntry.header.option.focus();
      } else {
        setTabStop(activeEntry || entries.find(entry => entry.option.tabIndex === 0));
      }
      updateCounts(lastCounts);
    }

    function setCollapsed(groupIds) {
      if (disposed) return;
      collapsed = new Set(Array.isArray(groupIds) ? groupIds : []);
      applyCollapsed();
    }

    function toggle(header) {
      if (header.empty) return;
      const expanded = collapsed.delete(header.id);
      if (!expanded) collapsed.add(header.id);
      applyCollapsed();
      onExpandedChanged(header.id, expanded);
    }

    function select(entry) {
      if (!entry.empty) onSelect({ type: entry.kind, id: entry.id });
    }

    function onContextMenuEvent(event) {
      const entry = entryFor(event.target);
      if (!entry) return;
      consume(event);
      onContextMenu({ type: entry.kind, id: entry.id }, event, entry.row);
    }

    function onClick(event) {
      if (event.button && event.button !== 0) return;
      if (suppressClick) {
        suppressClick = false;
        consume(event);
        return;
      }
      const header = headerFor(event.target);
      if (header) {
        consume(event);
        header.option.focus();
        toggle(header);
        return;
      }
      const entry = entryFor(event.target);
      if (entry) {
        entry.option.focus();
        select(entry);
      }
    }

    function consume(event) {
      event.preventDefault();
      event.stopPropagation();
    }

    function clearDropIndicator() {
      for (const entry of entries) entry.row.removeAttribute("data-accountpane-drop");
    }

    function clearDrag() {
      clearDropIndicator();
      dragState = null;
    }

    function onMouseDown() {
      // A fresh mouse gesture restores ordinary selection after a drag. Keep
      // any browser-generated click at the end of the drag from navigating.
      if (!dragState) suppressClick = false;
    }

    function onDragStart(event) {
      clearDrag();
      const source = entryFor(event.target);
      if (disposed || source?.kind !== "account" || !visibleEntries().includes(source) || !event.dataTransfer) {
        event.preventDefault();
        return;
      }
      const token = `${Date.now()}-${Math.random()}`;
      try {
        event.dataTransfer.setData(dragType, token);
        event.dataTransfer.effectAllowed = "move";
        dragState = { source, token };
        suppressClick = true;
        event.stopPropagation();
      } catch {
        event.preventDefault();
      }
    }

    function dropTarget(event) {
      if (disposed || !dragState || !entries.includes(dragState.source)) return null;
      try {
        const transfer = event.dataTransfer;
        if (!transfer || !Array.from(transfer.types).includes(dragType)) return null;
        if (transfer.mozSourceNode && !dragState.source.row.contains(transfer.mozSourceNode)) return null;
        // The browser protects payloads during dragover; read the private token
        // only on drop, when access is allowed. The live source stays pane-local.
        if (event.type === "drop" && transfer.getData(dragType) !== dragState.token) return null;
      } catch {
        return null;
      }
      const target = entryFor(event.target), source = dragState.source;
      if (!target || target === source) return null;
      if (target.kind === "group") return target.id === source.groupId ? null : { target, mode: "into" };
      const rect = target.row.getBoundingClientRect();
      if (!Number.isFinite(event.clientY) || !(rect.height > 0)) return null;
      return { target, mode: event.clientY < rect.top + rect.height / 2 ? "before" : "after" };
    }

    function onDragOver(event) {
      clearDropIndicator();
      const destination = dropTarget(event);
      if (!destination) return;
      consume(event);
      event.dataTransfer.dropEffect = "move";
      destination.target.row.setAttribute("data-accountpane-drop", destination.mode);
    }

    function onDragLeave(event) {
      const target = entryFor(event.target);
      if (!target || !target.row.contains(event.relatedTarget)) clearDropIndicator();
    }

    function onDrop(event) {
      const destination = dropTarget(event);
      const source = dragState?.source;
      clearDrag();
      if (!destination) return;
      consume(event);
      const { target, mode } = destination, before = mode === "before";
      if (mode === "into") onMove(source.id, target.id, null);
      else if (target.groupId === source.groupId) onReorder(source.id, target.id, before);
      else onMove(source.id, target.groupId, { targetId: target.id, before });
    }

    function onKeyDown(event) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const header = headerFor(event.target);
      if (header && (event.key === "Enter" || event.key === " ")) {
        consume(event);
        toggle(header);
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
          if (entry.kind === "group" && !entry.empty) {
            if (collapsed.has(entry.id)) toggle(entry);
            else visible[index + 1]?.option.focus();
          }
          return;
        case "ArrowLeft":
          consume(event);
          if (entry.kind === "account") entry.header.option.focus();
          else if (isExpanded(entry)) toggle(entry);
          return;
        case "Enter":
        case " ":
          consume(event);
          select(entry);
          return;
        default:
          return;
      }
      consume(event);
      next.option.focus();
    }

    const dragListeners = { mousedown: onMouseDown, dragstart: onDragStart,
      dragover: onDragOver, dragleave: onDragLeave, drop: onDrop, dragend: clearDrag };
    for (const [type, listener] of Object.entries(dragListeners)) list.addEventListener(type, listener);
    list.addEventListener("contextmenu", onContextMenuEvent);
    list.addEventListener("click", onClick);
    list.addEventListener("keydown", onKeyDown);
    list.addEventListener("focusin", onFocus);

    function createGroup(group, accountsById) {
      const header = Object.assign(createEntry({ id: group.id, name: group.name ?? labels.allAccounts }, true),
        { kind: "group", groupId: group.id });
      header.header = header;
      header.option.setAttribute("aria-level", "1");
      header.option.setAttribute("data-accountpane-group", group.id);
      if (group.custom) header.option.classList.toggle("accountpane-group", true);
      const children = (group.accountIds ?? []).filter(id => accountsById?.[id]).map(id =>
        Object.assign(createEntry(accountsById[id]), { kind: "account", groupId: group.id, header }));
      for (const child of children) child.option.setAttribute("aria-level", "2");
      // A lone default group is 0.1.13's root: selectable and expandable even without accounts.
      header.empty = multiple && children.length === 0;
      header.group = document.createElement("ul");
      header.group.setAttribute("role", "group");
      header.group.append(...children.map(entry => entry.option));
      header.option.append(header.group);
      return [header, ...children];
    }

    function render(groups, selection, accountsById) {
      if (disposed) return;
      clearDrag();
      const previouslyFocused = entryFor(document.activeElement);
      const groupList = Array.isArray(groups) ? groups : [];
      multiple = groupList.length > 1;
      entries = groupList.flatMap(group => createGroup(group, accountsById));
      const headers = entries.filter(entry => entry === entry.header);
      const matches = (entry, target) => entry.kind === target?.type && entry.id === target?.id;
      for (const entry of entries) {
        entry.option.setAttribute("aria-selected", String(matches(entry, selection)));
      }
      list.replaceChildren(...headers.map(header => header.option));
      for (const header of headers) syncHeader(header);
      const restored = previouslyFocused && entries.find(entry =>
        matches(entry, { type: previouslyFocused.kind, id: previouslyFocused.id }));
      const fallback = previouslyFocused && headers.find(header => header.id === previouslyFocused.groupId);
      const selectedEntry = entries.find(entry => matches(entry, selection));
      setTabStop(restored || selectedEntry || fallback || headers[0]);
      updateCounts(lastCounts);
      syncHeadingStyle();
      syncRowHeight();
      if (previouslyFocused) {
        const focusTarget = restored ? visibleEntries().includes(restored) ? restored : restored.header :
          fallback || headers[0];
        focusTarget?.option.focus();
      }
    }

    function focusGroup(groupId) {
      const header = entries.find(entry => entry === entry.header && entry.id === groupId);
      if (disposed || !header) return;
      setTabStop(header);
      header.option.focus();
    }

    function updateCounts(snapshot) {
      if (disposed) return;
      lastCounts = snapshot;
      const aggregate = header => {
        const members = entries.filter(entry => entry.kind === "account" && entry.header === header);
        const sum = metric => {
          let total = 0;
          for (const entry of members) {
            const value = snapshot.accounts?.[entry.id]?.[metric];
            if (!Number.isSafeInteger(value) || value < 0) return null;
            total += value;
            if (!Number.isSafeInteger(total)) return null;
          }
          return total;
        };
        return { unread: sum("unread"), total: sum("total"),
          hasNew: members.some(entry => snapshot.accounts?.[entry.id]?.hasNew === true) };
      };
      const description = (template, value) => template?.replace("{count}", String(value));
      for (const entry of entries) {
        // Expanded headers leave the numbers to member rows; empty ones have none.
        const counts = entry.kind === "account" ? snapshot.accounts?.[entry.id] :
          entry.empty || !collapsed.has(entry.id) ? null : aggregate(entry);
        const unread = counts?.unread;
        const total = counts?.total;
        const showNew = counts?.hasNew === true;
        const showUnread = Number.isSafeInteger(unread) && unread > 0;
        const showTotal = snapshot.showTotal && Number.isSafeInteger(total) && total >= 0;
        entry.unread.textContent = showUnread ? String(unread) : "";
        entry.total.textContent = showTotal ? String(total) : "";
        entry.option.classList.toggle("accountpane-new-messages", showNew);
        const parts = [entry.name];
        if (showUnread) parts.push(description(labels.unreadCount, unread));
        if (showTotal) parts.push(description(labels.totalCount, total));
        if (showNew) parts.push(labels.newMessages);
        entry.option.setAttribute("aria-label", parts.filter(Boolean).join(", "));
        entry.option.setAttribute("title", parts.filter(Boolean).join(", "));
      }
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      clearDrag();
      for (const [type, listener] of Object.entries(dragListeners)) list.removeEventListener(type, listener);
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
    return { render, setCollapsed, updateCounts, focusGroup, dispose };
  }
  return { create };
})();
