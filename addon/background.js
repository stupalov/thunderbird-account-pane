// Local settings only. Exported separately for isolated script tests.
var AccountPaneStorage = (() => {
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const id = value => typeof value === "string" && value.length > 0;
  function normalize(value) {
    const source = object(value) ? value : {};
    return { version: 1, selectedAccountId: id(source.selectedAccountId) ? source.selectedAccountId : null,
      accountsExpanded: typeof source.accountsExpanded === "boolean" ? source.accountsExpanded : true,
      lastFolders: Object.fromEntries(Object.entries(object(source.lastFolders) ? source.lastFolders : {})
        .filter(([key, uri]) => id(key) && id(uri))) };
  }
  function copyPatch(value) {
    const patch = {};
    if (object(value) && Object.hasOwn(value, "selectedAccountId") &&
        (value.selectedAccountId === null || id(value.selectedAccountId))) {
      patch.selectedAccountId = value.selectedAccountId;
    }
    if (object(value) && typeof value.accountsExpanded === "boolean") {
      patch.accountsExpanded = value.accountsExpanded;
    }
    if (object(value?.lastFolder) && id(value.lastFolder.accountId) && id(value.lastFolder.uri)) {
      patch.lastFolder = { accountId: value.lastFolder.accountId, uri: value.lastFolder.uri };
    }
    return patch;
  }
  function createWriter(storage, initialSettings) {
    let current = normalize(initialSettings);
    let chain = Promise.resolve();
    function save(value) {
      const patch = copyPatch(value);
      const operation = chain.then(async () => {
        const next = normalize(current);
        if (Object.hasOwn(patch, "selectedAccountId")) next.selectedAccountId = patch.selectedAccountId;
        if (Object.hasOwn(patch, "accountsExpanded")) next.accountsExpanded = patch.accountsExpanded;
        if (patch.lastFolder) {
          // Computed property preserves ordinary account keys such as __proto__.
          next.lastFolders = { ...next.lastFolders, [patch.lastFolder.accountId]: patch.lastFolder.uri };
        }
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
