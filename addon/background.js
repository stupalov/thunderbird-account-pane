// Local settings only. Exported separately for isolated script tests.
var AccountPaneStorage = (() => {
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const id = value => typeof value === "string" && value.length > 0;
  const normalize = value => AccountPaneGroups.normalize(value);
  const text = value => typeof value === "string";
  function copyPatch(value) {
    const patch = {};
    if (!object(value)) return patch;
    for (const key of ["selectedAccountId", "selectedGroupId"]) {
      if (Object.hasOwn(value, key) && (value[key] === null || id(value[key]))) patch[key] = value[key];
    }
    if (typeof value.accountsExpanded === "boolean") patch.accountsExpanded = value.accountsExpanded;
    const { lastFolder: f, groupExpanded: e, createGroup: c, renameGroup: r, deleteGroup: d,
      moveAccount: m, pruneMembership: p } = value;
    if (object(f) && id(f.accountId) && id(f.uri)) patch.lastFolder = { accountId: f.accountId, uri: f.uri };
    if (object(e) && id(e.groupId) && typeof e.expanded === "boolean") {
      patch.groupExpanded = { groupId: e.groupId, expanded: e.expanded };
    }
    if (object(c) && id(c.groupId) && text(c.name)) {
      patch.createGroup = { groupId: c.groupId, name: c.name, ...(id(c.accountId) ? { accountId: c.accountId } : {}) };
    }
    if (object(r) && id(r.groupId) && text(r.name)) patch.renameGroup = { groupId: r.groupId, name: r.name };
    if (object(d) && id(d.groupId)) patch.deleteGroup = { groupId: d.groupId };
    if (object(m) && id(m.accountId) && id(m.groupId)) patch.moveAccount = { accountId: m.accountId, groupId: m.groupId };
    if (object(p) && Array.isArray(p.accountIds) && p.accountIds.every(id)) {
      patch.pruneMembership = { accountIds: [...p.accountIds] };
    }
    return patch;
  }
  // Pure group operations in a fixed order, then selection and history.
  function apply(settings, patch) {
    const G = AccountPaneGroups;
    let next = normalize(settings);
    if (patch.pruneMembership) next = G.pruneMembership(next, patch.pruneMembership.accountIds);
    if (patch.createGroup) {
      next = G.createGroup(next, patch.createGroup.groupId, patch.createGroup.name, patch.createGroup.accountId ?? null);
    }
    if (patch.renameGroup) next = G.renameGroup(next, patch.renameGroup.groupId, patch.renameGroup.name);
    if (patch.deleteGroup) next = G.deleteGroup(next, patch.deleteGroup.groupId);
    if (patch.moveAccount) next = G.moveAccount(next, patch.moveAccount.accountId, patch.moveAccount.groupId);
    if (Object.hasOwn(patch, "accountsExpanded")) next = G.setGroupExpanded(next, G.DEFAULT_ID, patch.accountsExpanded);
    if (patch.groupExpanded) next = G.setGroupExpanded(next, patch.groupExpanded.groupId, patch.groupExpanded.expanded);
    // A non-null selection of one kind clears the other.
    for (const [key, other] of [["selectedGroupId", "selectedAccountId"], ["selectedAccountId", "selectedGroupId"]]) {
      if (Object.hasOwn(patch, key)) {
        next[key] = patch[key];
        if (patch[key] !== null) next[other] = null;
      }
    }
    if (patch.lastFolder) {
      // Computed property preserves ordinary account keys such as __proto__.
      next.lastFolders = { ...next.lastFolders, [patch.lastFolder.accountId]: patch.lastFolder.uri };
    }
    return normalize(next);
  }
  function createWriter(storage, initialSettings) {
    let current = normalize(initialSettings);
    let chain = Promise.resolve();
    function save(value) {
      const patch = copyPatch(value);
      const operation = chain.then(async () => {
        const next = apply(current, patch);
        try {
          await storage.set({ settings: next });
        } catch {
          console.error("ACCOUNTPANE_STORAGE_WRITE_FAILED");
          throw new Error("ACCOUNTPANE_STORAGE_WRITE_FAILED");
        }
        current = normalize(next);
        return normalize(current);
      });
      chain = operation.catch(() => {});
      return operation;
    }
    return { save, flush: () => chain };
  }
  return { createWriter, normalize, copyPatch };
})();

if (typeof browser !== "undefined") {
  (() => {
    let ready;
    let chain = Promise.resolve();
    // Register before reading settings or starting any native controllers.
    browser.accountPane.onStateChanged.addListener(value => {
      const patch = AccountPaneStorage.copyPatch(value);
      const operation = chain.then(async () => {
        const writer = await ready;
        const snapshot = await writer.save(patch);
        try {
          // Every persisted snapshot acknowledges pending controller history.
          await browser.accountPane.settingsChanged(snapshot);
        } catch {
          console.error("ACCOUNTPANE_SETTINGS_BROADCAST_FAILED");
          throw new Error("ACCOUNTPANE_SETTINGS_BROADCAST_FAILED");
        }
      });
      chain = operation.catch(() => {});
      return operation;
    });
    ready = (async () => {
      let value;
      try {
        value = (await browser.storage.local.get("settings")).settings;
      } catch {
        console.error("ACCOUNTPANE_STORAGE_READ_FAILED");
      }
      const settings = AccountPaneStorage.normalize(value);
      const writer = AccountPaneStorage.createWriter(browser.storage.local, settings);
      // Schedule startup separately so a native event cannot deadlock on ready.
      Promise.resolve().then(() => browser.accountPane.start(settings))
        .catch(() => console.error("ACCOUNTPANE_START_FAILED"));
      return writer;
    })();
  })();
}
