// The API symbol is required by Thunderbird; all helper exports have their own scope.
var accountPane = class extends ExtensionCommon.ExtensionAPI {
  constructor(extension) {
    super(extension);
    this._disposed = false;
    this._generation = 0;
    this._controllers = new Set();
    this._fire = null;
    this._lifecycle = null;
    this._starting = null;
    this._settings = null;
  }

  _stopPanes() {
    this._generation++;
    this._lifecycle?.dispose();
    this._lifecycle = null;
    this._starting = null;
  }

  async _start(settings) {
    if (this._disposed) return;
    if (!this._fire) throw new Error("ACCOUNTPANE_LISTENER_UNAVAILABLE");
    if (this._lifecycle) return;
    if (this._starting) return this._starting;
    this._settings = settings;
    const generation = this._generation;
    const operation = this._initialize(generation).catch(() => {
      throw new Error("ACCOUNTPANE_START_FAILED");
    });
    this._starting = operation;
    try {
      await operation;
    } finally {
      if (this._starting === operation) this._starting = null;
    }
  }

  async _initialize(generation) {
    const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
    const { FolderUtils } = ChromeUtils.importESModule("resource:///modules/FolderUtils.sys.mjs");
    const { ExtensionSupport } = ChromeUtils.importESModule("resource:///modules/ExtensionSupport.sys.mjs");
    const { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");
    const scope = {};
    for (const path of ["lib/model.js", "experiment/tree-filter.js", "experiment/account-view.js",
      "experiment/controller.js", "experiment/thunderbird-adapter.js", "experiment/lifecycle.js"]) {
      Services.scriptloader.loadSubScriptWithOptions(this.extension.rootURI.resolve(path), {
        target: scope, allowUnsafeURL: true
      });
    }
    const cssText = await new Promise((resolve, reject) => {
      NetUtil.asyncFetch({ uri: this.extension.rootURI.resolve("experiment/account-pane.css"),
        loadUsingSystemPrincipal: true }, (stream, status) => {
        try {
          if (!Components.isSuccessCode(status)) throw new Error();
          resolve(NetUtil.readInputStreamToString(stream, stream.available()));
        } catch {
          reject(new Error("ACCOUNTPANE_RESOURCE_READ_FAILED"));
        } finally {
          stream?.close();
        }
      });
    });
    if (this._disposed || generation !== this._generation || !this._fire) return;
    const labels = { accounts: this.extension.localeData.localizeMessage("accounts"),
      allAccounts: this.extension.localeData.localizeMessage("allAccounts"),
      expandAccounts: this.extension.localeData.localizeMessage("expandAccounts"),
      collapseAccounts: this.extension.localeData.localizeMessage("collapseAccounts"),
      unreadCount: this.extension.localeData.localizeMessage("unreadCount"),
      totalCount: this.extension.localeData.localizeMessage("totalCount") };
    const attachPane = window => {
      if (this._disposed || generation !== this._generation || !this._fire) return () => {};
      let adapter, filter, view, controller;
      let disposed = false;
      const cleanup = () => {
        if (disposed) return;
        disposed = true;
        if (controller) this._controllers.delete(controller);
        // Controller subscriptions stop before the providers they reference.
        for (const component of [controller, adapter, filter, view]) {
          try { component?.dispose(); } catch { console.error("ACCOUNTPANE_CLEANUP_FAILED"); }
        }
      };
      try {
        adapter = scope.AccountPaneAdapter.create({ window, MailServices, Services, Ci, FolderUtils });
        view = scope.AccountPaneView.create({ document: window.document,
          folderPane: window.document.getElementById("folderPane"), labels, cssText,
          onSelect: id => controller?.selectAccount(id),
          onContextMenu: (id, event, anchor) => adapter?.showAccountContextMenu(id, event, anchor),
          onReorder: (movedId, targetId, before) => adapter?.reorderAccount(movedId, targetId, before),
          onExpandedChanged: value => controller?.setAccountsExpanded(value) });
        filter = scope.AccountPaneTreeFilter.attach({ window,
          tree: window.document.getElementById("folderTree"),
          accountForRow: row => adapter.accountForRow(row), followTarget: id => controller?.followFolder(id) });
        controller = scope.AccountPaneController.create({ adapter, model: scope.AccountPaneModel,
          filter, view, settings: this._settings, save: patch => {
            if (this._disposed || !this._fire) throw new Error("ACCOUNTPANE_LISTENER_UNAVAILABLE");
            // Native fire.async forwards the background listener's persistence Promise.
            return this._fire.async(patch);
          } });
        this._controllers.add(controller);
        return cleanup;
      } catch {
        cleanup();
        console.error("ACCOUNTPANE_ATTACH_FAILED");
        return () => {};
      }
    };
    const listenerId = `${this.extension.id}:accountPane`;
    const hooks = { watchWindows: (onLoadWindow, onUnloadWindow) => {
      let registered = false;
      try {
        registered = ExtensionSupport.registerWindowListener(listenerId, {
          chromeURLs: ["chrome://messenger/content/messenger.xhtml"], onLoadWindow, onUnloadWindow });
        if (!registered) throw new Error();
      } catch {
        ExtensionSupport.unregisterWindowListener(listenerId);
        throw new Error("ACCOUNTPANE_WINDOW_LISTENER_FAILED");
      }
      return () => ExtensionSupport.unregisterWindowListener(listenerId);
    } };
    this._lifecycle = scope.AccountPaneLifecycle.create({ hooks, attachPane });
    this._lifecycle.start();
  }

  getAPI(context) {
    return { accountPane: {
      start: settings => this._start(settings),
      settingsChanged: async settings => {
        if (this._disposed) return;
        this._settings = settings;
        for (const controller of this._controllers) controller.updateSettings(settings);
      },
      onStateChanged: new ExtensionCommon.EventManager({ context, name: "accountPane.onStateChanged",
        register: fire => {
          if (this._disposed || this._fire) throw new Error("ACCOUNTPANE_LISTENER_UNAVAILABLE");
          this._fire = fire;
          return () => {
            if (this._fire === fire) {
              this._fire = null;
              this._stopPanes();
            }
          };
        }
      }).api()
    } };
  }

  onShutdown(isAppShutdown) {
    if (this._disposed) return;
    this._disposed = true;
    this._fire = null;
    this._stopPanes();
    if (!isAppShutdown) Services.obs.notifyObservers(null, "startupcache-invalidate", null);
  }
};
