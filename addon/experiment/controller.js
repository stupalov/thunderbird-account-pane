// Shared script loaded into an isolated Thunderbird or test scope.
var AccountPaneController = (() => {
  function create({ adapter, model, groups, filter, view, settings, save, labels }) {
    let disposed = false;
    const disposers = [];
    // null is unrestricted; otherwise { type: "account" | "group", id }.
    let selection = null;
    let lastFolders = { ...settings?.lastFolders };
    const pendingFolders = new Map();
    let shared = groups.normalize(settings);
    const pendingExpanded = new Map();
    let shownCollapsed = null, pendingFocus = null, prunedKeys = null;

    const accounts = () => model.visibleAccounts(adapter.listAccounts());
    const supported = () => model.allowsFiltering(adapter.activeModes());
    const validAccount = id => accounts().some(account => account.id === id);
    const groupView = () => groups.view(accounts(), shared, labels?.allAccounts);
    const same = (a, b) => a === b || !!a && !!b && a.type === b.type && a.id === b.id;
    const membersFolders = (ids, mode) => ids.flatMap(id => adapter.listFolders(id))
      .filter(folder => adapter.canDisplayFolder(folder.uri, mode));

    function render(list = groupView()) {
      filter.apply(groups.memberIds(list, selection));
      const marked = selection ?? (groups.isUnrestricted(list) ? { type: "group", id: groups.DEFAULT_ID } : null);
      view.render(list, marked, Object.fromEntries(accounts().map(account => [account.id, account])));
      updateCounts();
    }

    function collapsedGroups() {
      const ids = new Set(shared.collapsedGroups);
      for (const [id, pending] of pendingExpanded) {
        if (pending.expanded) ids.delete(id); else ids.add(id);
      }
      return [...ids];
    }

    function showCollapsed() {
      const ids = collapsedGroups(), key = JSON.stringify(ids);
      if (key !== shownCollapsed) {
        shownCollapsed = key;
        view.setCollapsed(ids);
      }
    }

    function updateCounts() {
      if (disposed) return;
      let snapshot;
      try {
        snapshot = adapter.messageCounts();
      } catch {
        snapshot = { showTotal: false, accounts: {} };
      }
      view.updateCounts?.(snapshot);
    }

    function savePatch(patch, failed = () => {}) {
      try {
        const result = save(patch);
        if (result && typeof result.then === "function") {
          Promise.resolve(result).catch(failed);
        }
      } catch {
        failed();
      }
    }

    function changeSelection(next) {
      const changed = !same(selection, next);
      selection = next;
      render();
      if (changed) {
        savePatch(next === null ? { selectedGroupId: null, selectedAccountId: null } :
          next.type === "group" ? { selectedGroupId: next.id } : { selectedAccountId: next.id });
      }
    }

    function select(value, explicit = true) {
      if (disposed) {
        return;
      }
      const list = groupView();
      const next = supported() ? groups.normalizeSelection(list, value) : null;
      const members = groups.memberIds(list, next);
      // The folder already open at attachment has no new folder-change event.
      // Remember its validated URI when leaving, through the same save protocol.
      const current = adapter.currentFolder();
      if (current && !members?.includes(current.accountId)) {
        rememberFolder(current);
      }
      // Resolve against existing folders of the members before hiding rows.
      const ready = members && (!explicit || adapter.ensureAllFolders?.() !== false);
      const mode = explicit && adapter.activeModes().includes("all") ? "all" : undefined;
      const folders = ready ? membersFolders(members, mode) : [];
      const open = next?.type === "group" ? folders.find(folder =>
        folder.uri === current?.uri && folder.accountId === current?.accountId) : null;
      const target = ready ? groups.groupTarget(members, folders,
        { current: open, lastFolders, explicit }, model) : null;
      changeSelection(target ? next : null);
      if (target && adapter.displayFolder(target.uri, mode) === false) {
        changeSelection(null);
      }
    }

    const selectAccount = (id, explicit = true) =>
      select(id === null ? null : { type: "account", id }, explicit);

    function followFolder(id) {
      if (disposed) {
        return;
      }
      // null is the tree filter's mixed-selection/fail-open notification.
      const inGroup = selection?.type === "group" &&
        groups.memberIds(groupView(), selection)?.includes(id);
      const next = id === null || !supported() || !validAccount(id) || selection === null ? null :
        inGroup ? selection : { type: "account", id };
      if (!same(next, selection)) {
        changeSelection(next);
      }
    }

    function setGroupExpanded(groupId, expanded) {
      if (disposed || typeof expanded !== "boolean" ||
          collapsedGroups().includes(groupId) !== expanded) {
        return;
      }
      const pending = { expanded };
      pendingExpanded.set(groupId, pending);
      showCollapsed();
      savePatch({ groupExpanded: { groupId, expanded } }, () => {
        if (pendingExpanded.get(groupId) === pending) {
          pendingExpanded.delete(groupId);
        }
      });
    }

    function rememberFolder(folder, followAccount = false) {
      if (!folder || !validAccount(folder.accountId)) {
        return;
      }
      const actual = adapter.listFolders(folder.accountId).find(item =>
        item.available && item.uri === folder.uri && item.accountId === folder.accountId);
      if (!actual) {
        return;
      }
      if (followAccount) {
        followFolder(actual.accountId);
      }
      lastFolders[actual.accountId] = actual.uri;
      const pending = { uri: actual.uri };
      pendingFolders.set(actual.accountId, pending);
      savePatch({ lastFolder: { accountId: actual.accountId, uri: actual.uri } }, () => {
        if (pendingFolders.get(actual.accountId) === pending) {
          pendingFolders.delete(actual.accountId);
        }
      });
    }

    function folderChanged(folder) {
      if (!disposed) {
        // Only a real native event follows the folder's account restriction.
        rememberFolder(folder, true);
      }
    }

    // Pruning needs the full key list: hidden or deferred accounts keep their group.
    function pruneMembership() {
      let keys;
      try {
        keys = adapter.listAccountKeys?.();
      } catch {
        return;
      }
      const key = Array.isArray(keys) && keys.length ? JSON.stringify([...keys].sort()) : null;
      if (key && key !== prunedKeys) {
        prunedKeys = key;
        savePatch({ pruneMembership: { accountIds: [...keys] } }, () => {
          if (prunedKeys === key) prunedKeys = null;
        });
      }
    }

    function refresh() {
      if (disposed) {
        return;
      }
      pruneMembership();
      const visibleIds = new Set(accounts().map(account => account.id));
      for (const id of pendingFolders.keys()) {
        if (!visibleIds.has(id)) {
          pendingFolders.delete(id);
        }
      }
      const list = groupView();
      const next = supported() ? groups.normalizeSelection(list, selection) : null;
      if (!same(next, selection)) {
        changeSelection(next);
      } else {
        render(list);
      }
      const members = groups.memberIds(list, selection);
      if (members) {
        const current = adapter.currentFolder();
        // Native multiple selection deliberately clears gFolder. Keep that
        // selection only while every selected row is still live and belongs here.
        const selected = current ? [] : adapter.selectedFolders();
        if (selected.length > 1 && selected.every(folder => members.includes(folder.accountId))) {
          return;
        }
        // Native delete/rename may leave a stale folder object or clear gFolder.
        if (!current || members.includes(current.accountId) && (!adapter.canDisplayFolder(current.uri) ||
            !adapter.listFolders(current.accountId).some(folder =>
              folder.available && folder.uri === current.uri))) {
          select(selection, false);
        }
      }
    }

    function updateSettings(value) {
      if (disposed) {
        return;
      }
      // Shared storage supplies history and group structure, never another tab's runtime choice.
      lastFolders = { ...value?.lastFolders };
      for (const [id, pending] of pendingFolders) {
        if (lastFolders[id] === pending.uri) {
          pendingFolders.delete(id);
        } else {
          // A matching storage snapshot acknowledges the latest local event.
          // Promise resolution alone may only acknowledge event delivery.
          lastFolders[id] = pending.uri;
        }
      }
      const before = groupView(), shown = groups.memberIds(before, selection);
      shared = groups.normalize(value);
      for (const [id, pending] of pendingExpanded) {
        if (shared.collapsedGroups.includes(id) !== pending.expanded ||
            id !== groups.DEFAULT_ID && !shared.groups.some(group => group.id === id)) {
          pendingExpanded.delete(id);
        }
      }
      showCollapsed();
      const list = groupView();
      // Unrestricted showed the default group; keep showing it once it stops being everything.
      const promoted = selection === null && supported() && groups.isUnrestricted(before) &&
        !groups.isUnrestricted(list) ? { type: "group", id: groups.DEFAULT_ID } : selection;
      const next = groups.normalizeSelection(list, promoted);
      const members = groups.memberIds(list, next), current = adapter.currentFolder();
      const hidden = current && members && !members.includes(current.accountId) &&
        (!shown || shown.includes(current.accountId));
      if (!same(next, selection)) {
        changeSelection(next);
      } else if (JSON.stringify(list) !== JSON.stringify(before)) {
        render(list);
      }
      if (hidden) {
        select(next, false);
      }
      if (pendingFocus && list.some(entry => entry.id === pendingFocus)) {
        view.focusGroup?.(pendingFocus);
        pendingFocus = null;
      }
    }

    function createGroup(name, accountId = null) {
      const clean = groups.cleanName(name);
      if (disposed || !clean) {
        return null;
      }
      const groupId = groups.newGroupId();
      pendingFocus = groupId;
      savePatch({ createGroup: { groupId, name: clean, ...(accountId ? { accountId } : {}) } }, () => {
        if (pendingFocus === groupId) pendingFocus = null;
      });
      return groupId;
    }

    function renameGroup(groupId, name) {
      if (!disposed && typeof name === "string") {
        // The unchanged localized label must not freeze into a custom name.
        const reset = groupId === groups.DEFAULT_ID && groups.cleanName(name) === labels?.allAccounts;
        savePatch({ renameGroup: { groupId, name: reset ? "" : name } });
      }
    }

    function deleteGroup(groupId) {
      if (!disposed && groupId !== groups.DEFAULT_ID) {
        savePatch({ deleteGroup: { groupId } });
      }
    }

    function moveAccount(accountId, groupId, placement = null) {
      if (disposed) {
        return;
      }
      savePatch({ moveAccount: { accountId, groupId } });
      if (placement) {
        adapter.reorderAccount(accountId, placement.targetId, placement.before);
      }
    }

    function groupChoices(accountId) {
      const list = groupView(), current = groups.groupOf(list, accountId);
      return list.map(entry => ({ id: entry.id, name: entry.name, current: entry.id === current }));
    }

    function groupMenu(groupId) {
      const entry = groupView().find(item => item.id === groupId);
      const customName = !entry ? null : groupId === groups.DEFAULT_ID ? shared.defaultGroupName ?? "" : entry.name;
      return { canDelete: !!entry && groupId !== groups.DEFAULT_ID, name: entry?.name ?? null, customName,
        openTarget: entry ? groups.openTarget(entry.accountIds,
          entry.accountIds.flatMap(id => adapter.listFolders(id)), model) : null };
    }

    function initialSelection() {
      const list = groupView();
      const folderAccount = adapter.currentFolder()?.accountId;
      const saved = shared.selectedGroupId ? { type: "group", id: shared.selectedGroupId } :
        shared.selectedAccountId ? { type: "account", id: shared.selectedAccountId } : null;
      // The folder already open wins unless it belongs to the saved group.
      const chosen = !validAccount(folderAccount) ? saved : saved?.type === "group" &&
        groups.groupOf(list, folderAccount) === saved.id ? saved : { type: "account", id: folderAccount };
      const next = groups.normalizeSelection(list, chosen);
      const members = groups.memberIds(list, next);
      return members && !groups.groupTarget(members, membersFolders(members),
        { lastFolders, explicit: false }, model) ? null : next;
    }

    function dispose() {
      if (!disposed) {
        disposed = true;
        pendingFolders.clear();
        pendingExpanded.clear();
        for (const cleanup of disposers.splice(0).reverse()) {
          cleanup();
        }
      }
    }

    try {
      disposers.push(adapter.onFolderChanged(folderChanged));
      disposers.push(adapter.onAccountsChanged(refresh));
      disposers.push(adapter.onModesChanged(refresh));
      try {
        if (adapter.onMessageCountsChanged) {
          disposers.push(adapter.onMessageCountsChanged(updateCounts));
        }
      } catch {
        // Count observation cannot prevent native account navigation.
      }
      selection = supported() ? initialSelection() : null;
      showCollapsed();
      render();
      pruneMembership();
    } catch (error) {
      dispose();
      throw error;
    }
    return { select, selectAccount, followFolder, setGroupExpanded, moveAccount, createGroup, renameGroup,
      deleteGroup, groupChoices, groupMenu, updateSettings, dispose };
  }
  return { create };
})();
