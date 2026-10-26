// Shared script; native services are injected rather than imported into a mail window.
var AccountPaneAdapter = (() => {
  function create({ window, MailServices, Services, Ci, FolderUtils }) {
    const cleanups = new Set();
    let disposed = false;
    // Thunderbird 140 ESR has neither nsIMsgFolder.localizedName nor
    // FolderUtils.compareFolders; it sorts folders inside about:3pane by
    // sortOrder, then by the (already localized) name. Match that order.
    const folderName = folder => typeof folder.localizedName === "string" ?
      folder.localizedName : folder.name;
    const nameCollator = new Intl.Collator(undefined, { sensitivity: "base" });
    const compareFolders = typeof FolderUtils?.compareFolders === "function" ?
      FolderUtils.compareFolders : (a, b) =>
        a.sortOrder - b.sortOrder || nameCollator.compare(folderName(a), folderName(b));

    function listAccounts() {
      const result = [];
      for (const account of MailServices.accounts.accounts) {
        try {
          const server = account.incomingServer;
          const local = server.type === "none";
          const deferred = server.type === "pop3" &&
            Boolean(server.QueryInterface(Ci.nsIPop3IncomingServer).deferredToAccount);
          if (server.hidden || local && window.folderPane.hideLocalFolders ||
              server.type === "im" || server.type === "chat" || deferred) {
            continue;
          }
          result.push({ id: account.key, serverKey: server.key, name: server.prettyName,
            type: server.type, hidden: false, deferred: false, local });
        } catch {
          // Removed/unavailable servers must not obstruct remaining accounts.
        }
      }
      return result;
    }

    function listAccountKeys() {
      try {
        const keys = Array.from(MailServices.accounts.accounts, account => account.key);
        return keys.every(key => typeof key === "string") ? keys : null;
      } catch {
        return null;
      }
    }

    function reorderAccount(movedId, targetId, before) {
      if (disposed || typeof before !== "boolean" || movedId === targetId) return false;
      try {
        const visible = listAccounts().map(account => account.id);
        if (!visible.includes(movedId) || !visible.includes(targetId)) return false;
        const ordered = visible.filter(id => id !== movedId);
        ordered.splice(ordered.indexOf(targetId) + (before ? 0 : 1), 0, movedId);
        if (ordered.every((id, index) => id === visible[index])) return false;
        const visibleSet = new Set(visible);
        let index = 0;
        // Native account order is global. Preserve accounts omitted from this
        // pane in their existing slots, including deferred and hidden servers.
        const keys = Array.from(MailServices.accounts.accounts, account =>
          visibleSet.has(account.key) ? ordered[index++] : account.key);
        MailServices.accounts.reorderAccounts(keys);
        return true;
      } catch {
        return false;
      }
    }

    function accountForServer(key) {
      return listAccounts().find(account => account.serverKey === key)?.id ?? null;
    }

    function accountForRow(row) {
      // Native setFolder uses the folder's server, even for flattened favorites.
      return accountForServer(row?.dataset?.serverKey);
    }

    // One walk serves Junk exclusion and the native new-mail star: both skip
    // virtual searches and every physical Junk branch.
    function scanFolders(root) {
      const junk = [];
      let hasNew = false;
      const visited = new Set();
      function visit(folder) {
        const uri = folder.URI;
        const flags = folder.flags;
        if (typeof uri !== "string" || !Number.isSafeInteger(flags)) {
          throw new TypeError("ACCOUNTPANE_FOLDER_METADATA_UNAVAILABLE");
        }
        if (visited.has(uri)) return;
        visited.add(uri);
        // Native recursive counts already omit virtual searches. Never deduct
        // their results, or follow them into another account's physical folders.
        if (flags & Ci.nsMsgFolderFlags.Virtual) return;
        if (flags & Ci.nsMsgFolderFlags.Junk) {
          junk.push(folder);
          return; // Its recursive count includes every nested junk branch once.
        }
        if (!hasNew) {
          try {
            hasNew = folder.hasNewMessages === true;
          } catch {
            // An unreadable flag is no new mail; Junk exclusion still continues.
          }
        }
        for (const child of folder.subFolders) visit(child);
      }
      visit(root);
      return { junk, hasNew };
    }

    function messageCounts() {
      const accounts = {};
      const visible = new Set(listAccounts().map(account => account.id));
      for (const account of MailServices.accounts.accounts) {
        if (!visible.has(account.key)) continue;
        try {
          const server = account.incomingServer;
          const root = server.rootFolder;
          const { junk: excluded, hasNew } = scanFolders(root);
          const count = method => {
            try {
              let value = root[method](true);
              if (!Number.isSafeInteger(value) || value < 0) return null;
              for (const folder of excluded) {
                const junk = folder[method](true);
                if (!Number.isSafeInteger(junk) || junk < 0) return null;
                value -= junk;
                // Counts can change between reads; hide an inconsistent metric
                // rather than publishing a negative or misleading partial sum.
                if (value < 0) return null;
              }
              return value;
            } catch {
              return null;
            }
          };
          accounts[account.key] = {
            unread: count("getNumUnread"), total: count("getTotalMessages"), hasNew
          };
        } catch {
          // A missing server/root cannot supply reliable counts.
          accounts[account.key] = { unread: null, total: null, hasNew: false };
        }
      }
      let showTotal = false;
      try {
        showTotal = Services.xulStore.getValue("chrome://messenger/content/messenger.xhtml",
          "totalMsgCount", "visible") === "true";
      } catch {
        // Match the native default when XULStore is unavailable.
      }
      return { showTotal, accounts };
    }

    function listFolders(accountId) {
      const visible = listAccounts().find(account => account.id === accountId);
      if (!visible) {
        return [];
      }
      const folders = [];
      const visited = new Set();
      function visit(folder) {
        try {
          const uri = folder.URI;
          if (visited.has(uri) || folder.server.key !== visible.serverKey) {
            return;
          }
          visited.add(uri);
          folders.push({ uri, accountId, root: Boolean(folder.isServer),
            inbox: Boolean(folder.flags & Ci.nsMsgFolderFlags.Inbox), available: true });
        } catch {
          return;
        }
        let children;
        try {
          // Copy before sorting: never mutate the native folder collection.
          children = Array.from(folder.subFolders);
        } catch {
          return;
        }
        children = children.filter(child => {
          try {
            return typeof child.URI === "string" && child.server.key === visible.serverKey &&
              Number.isFinite(child.sortOrder) && typeof folderName(child) === "string";
          } catch {
            return false;
          }
        });
        children.sort(compareFolders);
        for (const child of children) {
          visit(child);
        }
      }
      try {
        const account = MailServices.accounts.accounts.find(item => item.key === accountId);
        visit(account.incomingServer.rootFolder);
      } catch {
        // Missing roots are unavailable, not a reason to open a message database.
      }
      return folders;
    }

    function currentFolder() {
      try {
        const folder = window.gFolder;
        if (!folder) {
          return null;
        }
        const id = accountForServer(folder.server.key);
        return id === null ? null : listFolders(id).find(item => item.uri === folder.URI) ?? null;
      } catch {
        return null;
      }
    }

    function activeModes() {
      return Array.from(window.folderPane.activeModes);
    }

    function selectedFolders() {
      try {
        const tree = window.document.getElementById("folderTree");
        const rows = tree.rows;
        const folders = [];
        for (const row of tree.selection) {
          // The selection Set can retain a row removed by a native rebuild.
          if (!rows.includes(row)) {
            return [];
          }
          const id = accountForRow(row);
          const folder = listFolders(id).find(item => item.available && item.uri === row.uri);
          if (!folder) {
            return [];
          }
          folders.push(folder);
        }
        return folders;
      } catch {
        return [];
      }
    }

    function ensureAllFolders() {
      if (disposed) return false;
      try {
        const modes = activeModes();
        if (!modes.includes("all")) window.folderPane.activeModes = [...modes, "all"];
        return activeModes().includes("all");
      } catch {
        return false;
      }
    }

    const xul = tag => window.document.createXULElement(tag);
    function menuItem(label, onCommand, attributes = {}) {
      const item = xul("menuitem");
      item.setAttribute("label", label);
      for (const [name, value] of Object.entries(attributes)) item.setAttribute(name, value);
      item.addEventListener("command", event => {
        // Native folderPaneContext dispatches bubbling commands by item id.
        event.stopPropagation();
        onCommand(event);
      });
      return item;
    }

    function moveMenu({ label, choices, newGroupLabel, onMove, onNewGroup }) {
      const menu = xul("menu"), popup = xul("menupopup");
      // Match the native iconic items: Windows indents only labels with an icon slot.
      menu.setAttribute("class", "menu-iconic accountpane-move-menu");
      menu.setAttribute("label", label);
      for (const choice of choices) {
        popup.append(menuItem(choice.name, () => onMove(choice.id),
          choice.current ? { type: "radio", checked: "true", disabled: "true" } : { type: "radio" }));
      }
      popup.append(xul("menuseparator"), menuItem(newGroupLabel, onNewGroup));
      menu.append(popup);
      return [xul("menuseparator"), menu];
    }

    function openMenu(popup, event, anchor) {
      if (event.button === 2) {
        popup.openPopupAtScreen(event.screenX, event.screenY, true);
      } else {
        popup.openPopup(anchor, "after_end", 0, 0, true);
      }
    }

    function showAccountContextMenu(accountId, event, anchor, extra = null) {
      if (disposed || !listAccounts().some(account => account.id === accountId)) return false;
      const native = window.folderPaneContextMenu;
      const popup = window.document.getElementById("folderPaneContext");
      if (!native || !popup || !anchor) return false;
      let folder;
      try {
        folder = MailServices.accounts.accounts.find(account => account.key === accountId)
          ?.incomingServer.rootFolder;
      } catch {
        return false;
      }
      if (!folder) return false;
      let active = true, added = [];
      const finish = (hide = false) => {
        if (!active) return;
        active = false;
        popup.removeEventListener("popuphidden", onHidden);
        for (const node of added) node.remove();
        cleanups.delete(cleanup);
        if (native._overrideFolder === folder) {
          if (hide) popup.hidePopup();
          // popuphidden normally clears the override through Thunderbird itself.
          if (native._overrideFolder === folder) native.clearOverrideFolder();
        }
      };
      const onHidden = hiddenEvent => {
        if (hiddenEvent.target === popup) finish();
      };
      const cleanup = () => finish(true);
      try {
        // Close the previous invocation before assigning a new native override.
        if (popup.state === "open" || popup.state === "showing") popup.hidePopup();
        native.setOverrideFolder(folder);
        popup.addEventListener("popuphidden", onHidden);
        cleanups.add(cleanup);
        if (extra) {
          added = moveMenu(extra);
          popup.append(...added);
        }
        openMenu(popup, event, anchor);
        return true;
      } catch {
        finish(true);
        return false;
      }
    }

    let groupPopup = null;
    function removeGroupPopup() {
      cleanups.delete(removeGroupPopup);
      const popup = groupPopup;
      groupPopup = null;
      if (!popup) return;
      if (popup.state === "open" || popup.state === "showing") popup.hidePopup();
      popup.remove();
    }

    function showGroupContextMenu(event, anchor, items) {
      if (disposed || !anchor || !items) return false;
      try {
        if (!groupPopup) {
          const popup = xul("menupopup");
          popup.setAttribute("id", "accountpane-group-context");
          window.document.querySelector("popupset").append(popup);
          groupPopup = popup;
          cleanups.add(removeGroupPopup);
        }
        if (groupPopup.state === "open" || groupPopup.state === "showing") groupPopup.hidePopup();
        const entry = ({ label, disabled, hidden, onCommand }) => menuItem(label, onCommand,
          { ...disabled ? { disabled: "true" } : {}, ...hidden ? { hidden: "true" } : {} });
        const separator = xul("menuseparator");
        if (items.openInNewTab.hidden && items.openInNewWindow.hidden) separator.setAttribute("hidden", "true");
        groupPopup.replaceChildren(entry(items.openInNewTab), entry(items.openInNewWindow), separator,
          entry(items.newGroup), entry(items.rename), entry(items.delete));
        openMenu(groupPopup, event, anchor);
        return true;
      } catch {
        return false;
      }
    }

    function promptGroupName(title, text, initial = "") {
      if (disposed) return null;
      try {
        const value = { value: initial };
        return Services.prompt.prompt(window.top ?? window, title, text, value, null, {}) &&
          typeof value.value === "string" ? value.value : null;
      } catch {
        return null;
      }
    }

    // about:3pane's own folder context menu calls these messenger.xhtml helpers
    // (mailWindowOverlay.js) through its top chrome window.
    const OPEN_HELPERS = { tab: "MsgOpenNewTabForFolders", window: "MsgOpenNewWindowForFolder" };
    const chromeWindow = () => window.browsingContext?.topChromeWindow ?? window.top;
    function canOpenFolder(where) {
      try {
        return !disposed && Object.hasOwn(OPEN_HELPERS, where) &&
          typeof chromeWindow()?.[OPEN_HELPERS[where]] === "function" &&
          typeof MailServices.folderLookup?.getFolderForURL === "function";
      } catch {
        return false;
      }
    }

    // Like about3Pane's own Open in New Tab: MsgOpenNewTabForFolders reads
    // mail.tabs.loadInBackground and flips it on Shift when background is unset.
    function tabParams(event) {
      const params = event ? { event } : {};
      const folderPane = window.paneLayout?.folderPaneSplitter, messagePane = window.paneLayout?.messagePaneSplitter;
      if (typeof folderPane?.isCollapsed === "boolean" && typeof messagePane?.isCollapsed === "boolean") {
        Object.assign(params, { folderPaneVisible: !folderPane.isCollapsed, messagePaneVisible: !messagePane.isCollapsed });
      }
      return params;
    }

    function openFolder(uri, where, event = null) {
      if (typeof uri !== "string" || !canOpenFolder(where)) return false;
      try {
        const folder = MailServices.folderLookup.getFolderForURL(uri);
        if (!folder) return false;
        if (where === "tab") {
          chromeWindow().MsgOpenNewTabForFolders([folder], tabParams(event));
        } else {
          chromeWindow().MsgOpenNewWindowForFolder(folder.URI, -1);
        }
        return true;
      } catch {
        return false;
      }
    }

    function canDisplayFolder(uri, mode) {
      try {
        return !disposed && (!mode || activeModes().includes(mode)) &&
          Boolean(window.folderPane.getRowForFolder(uri, mode));
      } catch {
        return false;
      }
    }

    function displayFolder(uri, mode) {
      if (!canDisplayFolder(uri, mode)) {
        return false;
      }
      try {
        if (mode) {
          const row = window.folderPane.getRowForFolder(uri, mode);
          window.ensureFolderTreeRowIsVisible(row);
          window.document.getElementById("folderTree").updateSelection(row);
        } else {
          window.displayFolder(uri);
        }
        return true;
      } catch {
        // A folder/row can disappear between resolution and native navigation.
        return false;
      }
    }

    function subscription(setup) {
      if (disposed) {
        throw new Error("AccountPane adapter is disposed");
      }
      let active = true;
      const removers = [];
      const cleanup = () => {
        if (active) {
          active = false;
          cleanups.delete(cleanup);
          for (const remove of removers.reverse()) {
            remove();
          }
        }
      };
      try {
        setup(removers, () => active && !disposed);
        cleanups.add(cleanup);
      } catch (error) {
        cleanup();
        throw error;
      }
      return cleanup;
    }

    function onFolderChanged(callback) {
      return subscription((removers, active) => {
        const listener = () => {
          if (active()) {
            callback(currentFolder());
          }
        };
        window.addEventListener("folderURIChanged", listener);
        removers.push(() => window.removeEventListener("folderURIChanged", listener));
      });
    }

    function onAccountsChanged(callback) {
      return subscription((removers, active) => {
        let pending = false;
        const refresh = () => {
          if (!active() || pending) {
            return;
          }
          pending = true;
          // Native notifications may precede completion of hierarchy mutations.
          window.queueMicrotask(() => {
            pending = false;
            if (active()) {
              callback();
            }
          });
        };
        const observer = { observe: refresh };
        for (const branch of ["mail.accountmanager.accounts", "mail.account.", "mail.server."]) {
          Services.prefs.addObserver(branch, observer);
          removers.push(() => Services.prefs.removeObserver(branch, observer));
        }
        const listener = { folderAdded: refresh, folderDeleted: refresh, folderRenamed: refresh };
        MailServices.mfn.addListener(listener, MailServices.mfn.folderAdded |
          MailServices.mfn.folderDeleted | MailServices.mfn.folderRenamed);
        removers.push(() => MailServices.mfn.removeListener(listener));
        // Native row availability can change without account or mode changes.
        // Child composition also reflects Local Folders visibility. Coalesce
        // rebuild notifications; filter markers are attributes, not child edits.
        const treeObserver = new window.MutationObserver(refresh);
        removers.push(() => treeObserver.disconnect());
        treeObserver.observe(window.document.getElementById("folderTree"), {
          childList: true, subtree: true
        });
      });
    }

    function onModesChanged(callback) {
      return subscription((removers, active) => {
        let modes = activeModes().join("\n");
        const observer = new window.MutationObserver(() => {
          if (!active()) {
            return;
          }
          const next = activeModes().join("\n");
          if (next !== modes) {
            modes = next;
            callback();
          }
        });
        removers.push(() => observer.disconnect());
        // Mode containers are direct children; row changes are irrelevant here.
        observer.observe(window.document.getElementById("folderTree"), { childList: true });
      });
    }

    function onMessageCountsChanged(callback) {
      return subscription((removers, active) => {
        let pending = false;
        const notify = () => {
          if (!active() || pending) return;
          pending = true;
          window.queueMicrotask(() => {
            pending = false;
            if (active()) callback();
          });
        };
        const listener = {
          onFolderIntPropertyChanged(folder, property) {
            if (property === "TotalUnreadMessages" || property === "TotalMessages" ||
                property === "FolderFlag" || property === "BiffState") notify();
          },
          // Native NewMessages is a bool property (about3Pane.js listens the same way).
          onFolderBoolPropertyChanged(folder, property) {
            if (property === "NewMessages") notify();
          }
        };
        MailServices.mailSession.AddFolderListener(listener,
          Ci.nsIFolderListener.intPropertyChanged | Ci.nsIFolderListener.boolPropertyChanged);
        removers.push(() => MailServices.mailSession.RemoveFolderListener(listener));
        const tree = window.document.getElementById("folderTree");
        const observer = new window.MutationObserver(records => {
          if (records.some(record => record.type === "attributes" &&
              record.attributeName === "hidden" && record.target?.classList?.contains("total-count"))) {
            notify();
          }
        });
        removers.push(() => observer.disconnect());
        observer.observe(tree, { attributes: true, attributeFilter: ["hidden"], subtree: true });
        const onToggle = event => {
          if (event.target?.id === "folderPaneHeaderToggleTotalCount") notify();
        };
        window.document.addEventListener("command", onToggle, true);
        removers.push(() => window.document.removeEventListener("command", onToggle, true));
      });
    }

    function dispose() {
      if (!disposed) {
        disposed = true;
        for (const cleanup of [...cleanups]) {
          cleanup();
        }
      }
    }
    return { listAccounts, listAccountKeys, reorderAccount, listFolders, currentFolder, selectedFolders, activeModes,
      canDisplayFolder, displayFolder, ensureAllFolders, showAccountContextMenu, showGroupContextMenu, promptGroupName,
      canOpenFolder, openFolder, accountForRow, messageCounts, onMessageCountsChanged, onFolderChanged,
      onAccountsChanged, onModesChanged, dispose };
  }
  return { create };
})();
