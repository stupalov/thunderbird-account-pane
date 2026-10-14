// Shared script loaded into an isolated Thunderbird or test scope.
var AccountPaneTreeFilter = (() => {
  const marker = "data-accountpane-hidden";
  const attached = new WeakMap();

  function descriptorFor(object, key) {
    for (let owner = object; owner; owner = Object.getPrototypeOf(owner)) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      if (descriptor) {
        return descriptor;
      }
    }
    return null;
  }

  function attach({ window, tree, accountForRow, followTarget }) {
    if (attached.has(tree)) {
      return attached.get(tree);
    }
    if (!tree || !window || typeof accountForRow !== "function" ||
        typeof followTarget !== "function" ||
        typeof tree.querySelectorAll !== "function" ||
        typeof window.MutationObserver !== "function") {
      throw new TypeError("AccountPane requires a supported folder tree");
    }

    // Preflight every instance hook before modifying any of them. Never patch
    // a shared prototype; a non-configurable writable method can keep its flags.
    const hooks = [
      { owner: tree, key: "rows", getter: true },
      { owner: tree, key: "updateSelection" },
      { owner: tree, key: "swapSelection" },
      { owner: window, key: "ensureFolderTreeRowIsVisible" }
    ];
    for (const hook of hooks) {
      hook.own = Object.getOwnPropertyDescriptor(hook.owner, hook.key);
      const descriptor = descriptorFor(hook.owner, hook.key);
      hook.native = hook.getter ? descriptor?.get : hook.owner[hook.key];
      const writableMethod = !hook.getter && hook.own?.writable;
      if (typeof hook.native !== "function" ||
          (hook.own && !hook.own.configurable && !writableMethod) ||
          (!hook.own && !Object.isExtensible(hook.owner))) {
        throw new TypeError(`AccountPane cannot wrap ${hook.key}`);
      }
    }

    const marked = new Map();
    const flattened = new Map();
    const indented = new Map();
    const flattenMarker = "data-accountpane-flattened";
    const indentProperty = "--accountpane-indent";

    function restoreFlattened(row) {
      const previous = flattened.get(row);
      if (row.getAttribute("aria-expanded") === "true") {
        if (previous.expanded === null) { row.removeAttribute("aria-expanded"); }
        else { row.setAttribute("aria-expanded", previous.expanded); }
      }
      if (row.getAttribute("role") === "presentation") {
        if (previous.role === null) { row.removeAttribute("role"); }
        else { row.setAttribute("role", previous.role); }
      }
      if (row.getAttribute(flattenMarker) === "true") {
        if (previous.marker === null) { row.removeAttribute(flattenMarker); }
        else { row.setAttribute(flattenMarker, previous.marker); }
        if (!previous.unselectable) { row.classList.remove("unselectable"); }
        if (previous.collapsed) { row.classList.add("collapsed"); }
        if (row.childList) { row.childList.hidden = previous.hidden; }
      }
      flattened.delete(row);
    }

    function restoreIndent(row) {
      const previous = indented.get(row);
      if (row.style.getPropertyValue(indentProperty) === previous.applied) {
        if (previous.value) { row.style.setProperty(indentProperty, previous.value, previous.priority); }
        else { row.style.removeProperty(indentProperty); }
      }
      indented.delete(row);
    }

    function flatten(row) {
      if (!flattened.has(row)) {
        flattened.set(row, {
          marker: row.getAttribute(flattenMarker), role: row.getAttribute("role"),
          expanded: row.getAttribute("aria-expanded"),
          unselectable: row.classList.contains("unselectable"),
          collapsed: row.classList.contains("collapsed"), hidden: row.childList.hidden
        });
      }
      row.setAttribute(flattenMarker, "true");
      // The row remains a structural ancestor, without an accessible account
      // entry. aria-hidden would incorrectly hide its folder descendants too.
      row.setAttribute("role", "presentation");
      row.setAttribute("aria-expanded", "true");
      // Do not call native expandRow: its expanded event persists folder state.
      row.classList.add("unselectable");
      row.classList.remove("collapsed");
      row.childList.hidden = false;
    }
    let selectedAccountId = null;
    let disposed = false;
    let observer;

    function restoreMarker(row) {
      // Another extension may have changed our marker since we set it.
      if (row.getAttribute(marker) === "true") {
        const previous = marked.get(row);
        if (previous === null) {
          row.removeAttribute(marker);
        } else {
          row.setAttribute(marker, previous);
        }
      }
      marked.delete(row);
    }

    function clearRestrictions() {
      selectedAccountId = null;
      for (const row of marked.keys()) { restoreMarker(row); }
      for (const row of flattened.keys()) { restoreFlattened(row); }
      for (const row of indented.keys()) { restoreIndent(row); }
    }

    function refresh() {
      if (disposed) {
        return;
      }
      // Include collapsed and our temporarily unselectable roots on every pass.
      const rows = new Set(tree.querySelectorAll("li"));
      const accounts = new Map([...rows].map(row => [row, accountForRow(row)]));
      const retainedGroups = new Set();
      const roots = new Set();
      if (selectedAccountId !== null) {
        for (const row of rows) {
          if (accounts.get(row) === selectedAccountId) {
            if (row.modeName === "all" && row.dataset?.serverType &&
                row.childList && row.childList.children.length > 0) {
              roots.add(row);
            }
            // Unified virtual parents have no real account of their own. Keep
            // their branches but never their cross-account selectable results.
            for (let parent = row.parentNode?.closest?.("li"); parent && rows.has(parent);
                 parent = parent.parentNode?.closest?.("li")) {
              if (parent.modeName === "smart" && accounts.get(parent) === null && parent.childList) {
                retainedGroups.add(parent);
                roots.add(parent);
              }
            }
          }
        }
      }
      for (const row of flattened.keys()) {
        if (!roots.has(row)) { restoreFlattened(row); }
      }
      for (const row of roots) { flatten(row); }
      for (const row of marked.keys()) {
        if (!rows.has(row) || selectedAccountId === null ||
            accounts.get(row) === selectedAccountId || retainedGroups.has(row)) {
          restoreMarker(row);
        }
      }
      for (const row of rows) {
        if (selectedAccountId !== null && accounts.get(row) !== selectedAccountId &&
            !retainedGroups.has(row) && !row.classList?.contains("unselectable") &&
            row.getAttribute(marker) !== "true") {
          marked.set(row, row.getAttribute(marker));
          row.setAttribute(marker, "true");
        }
        let promotedAncestors = 0;
        for (let parent = row.parentNode?.closest?.("li"); parent && rows.has(parent);
             parent = parent.parentNode?.closest?.("li")) {
          if (roots.has(parent)) { promotedAncestors++; }
        }
        if (promotedAncestors && Number.isFinite(row.depth) && row.style) {
          if (!indented.has(row)) {
            indented.set(row, { value: row.style.getPropertyValue(indentProperty),
              priority: row.style.getPropertyPriority(indentProperty) });
          }
          const previous = indented.get(row);
          if (previous.applied !== undefined &&
              row.style.getPropertyValue(indentProperty) !== previous.applied) {
            previous.value = row.style.getPropertyValue(indentProperty);
            previous.priority = row.style.getPropertyPriority(indentProperty);
          }
          previous.applied = `${Math.max(0, row.depth - 1 - promotedAncestors) * 16}px`;
          row.style.setProperty(indentProperty, previous.applied);
        } else if (indented.has(row)) { restoreIndent(row); }
      }
      for (const row of indented.keys()) {
        if (!rows.has(row)) { restoreIndent(row); }
      }
    }

    function apply(accountId) {
      if (!disposed) {
        selectedAccountId = accountId;
        refresh();
      }
    }

    function synchronize(rows) {
      if (disposed || selectedAccountId === null || !rows.length) {
        return;
      }
      try {
        const accounts = new Set(rows.map(row => accountForRow(row)));
        const target = accounts.size === 1 ? accounts.values().next().value : null;
        if (target !== selectedAccountId) {
          // Update before the callback as well as before native navigation.
          // Controller callbacks need not re-enter apply to make rows visible.
          apply(target);
          followTarget(target);
        }
      } catch {
        // Account lookup/controller failures must not block native navigation.
        clearRestrictions();
      }
    }

    hooks[0].wrapper = function() {
      // Native getter errors retain their native semantics. Only our filtering
      // step can fail open after the native rows have been obtained.
      const rows = hooks[0].native.call(this);
      if (disposed || selectedAccountId === null) {
        return rows;
      }
      try {
        return rows.filter(row => !flattened.has(row) && accountForRow(row) === selectedAccountId);
      } catch {
        clearRestrictions();
        try {
          followTarget(null);
        } catch {
          // A failing notification must not interrupt the native rows consumer.
        }
        return rows;
      }
    };
    for (const hook of hooks.slice(1)) {
      hook.wrapper = function(...args) {
        synchronize(hook.key === "swapSelection" ? args[0] : args[0] ? [args[0]] : []);
        return hook.native.apply(this, args);
      };
    }

    function dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      observer?.disconnect();
      clearRestrictions();
      for (const hook of hooks) {
        const current = Object.getOwnPropertyDescriptor(hook.owner, hook.key);
        if ((hook.getter ? current?.get : current?.value) !== hook.wrapper) {
          continue;
        }
        if (hook.own) {
          Object.defineProperty(hook.owner, hook.key, hook.own);
        } else {
          delete hook.owner[hook.key];
        }
      }
      attached.delete(tree);
    }

    try {
      for (const hook of hooks) {
        Object.defineProperty(hook.owner, hook.key, hook.getter ? {
          configurable: true, enumerable: hook.own?.enumerable ?? false,
          get: hook.wrapper, set: hook.own?.set
        } : {
          configurable: hook.own?.configurable ?? true,
          enumerable: hook.own?.enumerable ?? false,
          writable: hook.own && "writable" in hook.own ? hook.own.writable : true,
          value: hook.wrapper
        });
      }
      observer = new window.MutationObserver(() => {
        try {
          refresh();
        } catch {
          clearRestrictions();
        }
      });
      // Native observers also watch composition only. Attribute feedback would
      // make our own markings schedule refresh repeatedly.
      observer.observe(tree, { childList: true, subtree: true });
    } catch (error) {
      dispose();
      throw error;
    }
    const filter = { apply, refresh, dispose };
    attached.set(tree, filter);
    return filter;
  }
  return { attach };
})();
