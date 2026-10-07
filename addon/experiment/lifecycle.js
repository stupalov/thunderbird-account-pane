// Native window/tab lifetime only; helper exports stay in the extension scope.
var AccountPaneLifecycle = (() => {
  function create({ hooks, attachPane }) {
    let started = false;
    let disposed = false;
    let stopWindows;
    const windows = new Map();
    const documents = new Map();

    function cleanup(action) {
      try { action?.(); } catch { console.error("ACCOUNTPANE_CLEANUP_FAILED"); }
    }
    function closeTab(record, tab) {
      const entry = record.tabs.get(tab);
      if (!entry) return;
      record.tabs.delete(tab);
      entry.cancelled = true;
      cleanup(entry.stopLoad);
      cleanup(entry.cleanup);
      if (documents.get(entry.document) === entry) documents.delete(entry.document);
    }
    function inspect(record, tab) {
      if (disposed || windows.get(record.window) !== record || record.window.closed ||
          tab.closed || tab.mode?.name !== "mail3PaneTab") return;
      const browser = tab.chromeBrowser;
      if (!browser) return;
      const pane = browser.contentWindow;
      const document = browser.contentDocument;
      let entry = record.tabs.get(tab);
      if (entry && entry.document === document) return;
      if (entry) closeTab(record, tab);
      entry = { document, cancelled: false };
      record.tabs.set(tab, entry);
      const active = () => !disposed && !entry.cancelled && !record.window.closed && !tab.closed &&
        record.tabs.get(tab) === entry && browser.contentWindow === pane && browser.contentDocument === document;
      const ready = () => {
        if (!active() || document?.location?.href !== "about:3pane") return;
        const promise = pane?.hasDOMContentLoaded?.promise;
        if (!promise || typeof promise.then !== "function") return;
        Promise.resolve(promise).then(() => {
          if (!active() || pane.closed || !pane.folderPane || !pane.folderTree ||
              !document.getElementById("folderPane") || !document.getElementById("folderTree") ||
              documents.has(document)) return;
          try {
            entry.cleanup = attachPane(pane);
            documents.set(document, entry);
          } catch {
            // attachPane owns rollback; leave the native pane available.
          }
        }).catch(() => {});
      };
      if (document?.readyState === "complete" && document.location?.href === "about:3pane") {
        ready();
      } else {
        // Ignore nested browser loads; stop after this browser's first document load.
        const onLoad = event => {
          if (event.target !== browser.contentDocument) return;
          entry.stopLoad();
          record.tabs.delete(tab);
          entry.cancelled = true;
          inspect(record, tab);
        };
        entry.stopLoad = () => browser.removeEventListener("load", onLoad, true);
        browser.addEventListener("load", onLoad, true);
        // Loaded incompatible documents never get attached or retain a listener.
        if (document?.readyState === "complete" && document.location?.href !== "about:blank") entry.stopLoad();
      }
    }
    function closeWindow(window) {
      const record = windows.get(window);
      if (!record) return;
      windows.delete(window);
      cleanup(() => record.tabmail.unregisterTabMonitor(record.monitor));
      for (const tab of [...record.tabs.keys()]) closeTab(record, tab);
    }
    function openWindow(window) {
      if (disposed || window.closed || windows.has(window)) return;
      const tabmail = window.document.getElementById("tabmail");
      if (!tabmail || typeof tabmail.registerTabMonitor !== "function") return;
      const record = { window, tabmail, tabs: new Map() };
      record.monitor = {
        monitorName: "accountPane",
        onTabSwitched: tab => inspect(record, tab),
        onTabTitleChanged() {},
        onTabOpened: tab => inspect(record, tab),
        onTabRestored: tab => inspect(record, tab),
        onTabClosing: tab => closeTab(record, tab)
      };
      windows.set(window, record);
      try {
        tabmail.registerTabMonitor(record.monitor);
        for (const tab of tabmail.tabInfo) inspect(record, tab);
      } catch {
        closeWindow(window);
      }
    }
    function start() {
      if (started || disposed) return;
      started = true;
      try {
        stopWindows = hooks.watchWindows(openWindow, closeWindow);
      } catch {
        dispose();
      }
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      cleanup(stopWindows);
      for (const window of [...windows.keys()]) closeWindow(window);
    }
    return { start, dispose };
  }
  return { create };
})();
