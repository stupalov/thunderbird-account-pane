// Shared script loaded into an isolated Thunderbird or test scope.
var AccountPaneController = (() => {
  function create({ adapter, model, filter, view, settings, save }) {
    let disposed = false;
    const disposers = [];
    const state = { selectedAccountId: null };
    let lastFolders = { ...settings?.lastFolders };
    const pendingFolders = new Map();
    let accountsExpanded = settings?.accountsExpanded !== false;

    const accounts = () => model.visibleAccounts(adapter.listAccounts());
    const supported = () => model.allowsFiltering(adapter.activeModes());
    const validAccount = id => accounts().some(account => account.id === id);
    const displayableFolders = id => adapter.listFolders(id).filter(folder =>
      adapter.canDisplayFolder(folder.uri));

    function render() {
      filter.apply(state.selectedAccountId);
      view.render(accounts(), state.selectedAccountId);
      updateCounts();
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

    function changeSelection(id) {
      const changed = state.selectedAccountId !== id;
      state.selectedAccountId = id;
      render();
      if (changed) {
        savePatch({ selectedAccountId: id });
      }
    }

    function setAccountsExpanded(value) {
      if (disposed || typeof value !== "boolean" || accountsExpanded === value) {
        return;
      }
      accountsExpanded = value;
      view.setExpanded(value);
      savePatch({ accountsExpanded: value });
    }

    function selectAccount(id, explicit = true) {
      if (disposed) {
        return;
      }
      // The folder already open at attachment has no new folder-change event.
      // Remember its validated URI when leaving, through the same save protocol.
      const current = adapter.currentFolder();
      if (current && current.accountId !== id) {
        rememberFolder(current);
      }
      // Resolve against existing folders of this account before hiding rows.
      const allowed = supported() && id !== null && validAccount(id);
      const ready = allowed && (!explicit || adapter.ensureAllFolders?.() !== false);
      const mode = explicit && adapter.activeModes().includes("all") ? "all" : undefined;
      const folders = ready ? adapter.listFolders(id).filter(folder =>
        adapter.canDisplayFolder(folder.uri, mode)) : [];
      const target = ready ? explicit ? model.firstTarget(id, folders) :
        model.resolveTarget(id, folders, lastFolders) : null;
      changeSelection(target ? id : null);
      if (target && adapter.displayFolder(target.uri, mode) === false) {
        changeSelection(null);
      }
    }

    function followFolder(id) {
      if (disposed) {
        return;
      }
      // null is the tree filter's mixed-selection/fail-open notification.
      const next = id === null || !supported() || !validAccount(id) ? null :
        model.followFolder(state.selectedAccountId, id);
      if (next !== state.selectedAccountId) {
        changeSelection(next);
      }
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

    function refresh() {
      if (disposed) {
        return;
      }
      const visibleIds = new Set(accounts().map(account => account.id));
      for (const id of pendingFolders.keys()) {
        if (!visibleIds.has(id)) {
          pendingFolders.delete(id);
        }
      }
      const id = state.selectedAccountId;
      if (!supported() || id !== null && !validAccount(id)) {
        changeSelection(null);
        return;
      }
      render();
      if (id !== null) {
        const current = adapter.currentFolder();
        const folders = adapter.listFolders(id);
        // Native multiple selection deliberately clears gFolder. Keep that
        // selection only while every selected row is still live and belongs here.
        const selected = current ? [] : adapter.selectedFolders();
        if (selected.length > 1 && selected.every(folder => folder.accountId === id)) {
          return;
        }
        // Native delete/rename may leave a stale folder object or clear gFolder.
        if (!current || current.accountId === id && (!adapter.canDisplayFolder(current.uri) ||
            !folders.some(folder => folder.available && folder.uri === current.uri))) {
          selectAccount(id, false);
        }
      }
    }

    function updateSettings(value) {
      if (!disposed) {
        // Shared storage supplies history, never another tab's runtime choice.
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
      }
    }

    function dispose() {
      if (!disposed) {
        disposed = true;
        pendingFolders.clear();
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
      state.selectedAccountId = supported() ? model.initialAccount(accounts(),
        adapter.currentFolder()?.accountId, settings?.selectedAccountId) : null;
      if (state.selectedAccountId !== null &&
          !displayableFolders(state.selectedAccountId).some(folder => folder.available)) {
        state.selectedAccountId = null;
      }
      view.setExpanded(accountsExpanded);
      render();
    } catch (error) {
      dispose();
      throw error;
    }
    return { selectAccount, followFolder, setAccountsExpanded, updateSettings, dispose };
  }
  return { create };
})();
