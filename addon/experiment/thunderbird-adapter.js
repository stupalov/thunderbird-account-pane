// Shared script; native services are injected rather than imported into a mail window.
var AccountPaneAdapter = (() => {
  function create({ window, MailServices, Services, Ci, FolderUtils }) {
    const cleanups = new Set();
    let disposed = false;

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

    function accountForServer(key) {
      return listAccounts().find(account => account.serverKey === key)?.id ?? null;
    }

    function accountForRow(row) {
      // Native setFolder uses the folder's server, even for flattened favorites.
      return accountForServer(row?.dataset?.serverKey);
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
              Number.isFinite(child.sortOrder) && typeof child.localizedName === "string";
          } catch {
            return false;
          }
        });
        children.sort(FolderUtils.compareFolders);
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

    function canDisplayFolder(uri) {
      try {
        return !disposed && Boolean(window.folderPane.getRowForFolder(uri));
      } catch {
        return false;
      }
    }

    function displayFolder(uri) {
      if (!canDisplayFolder(uri)) {
        return false;
      }
      try {
        window.displayFolder(uri);
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

    function dispose() {
      if (!disposed) {
        disposed = true;
        for (const cleanup of [...cleanups]) {
          cleanup();
        }
      }
    }
    return { listAccounts, listFolders, currentFolder, selectedFolders, activeModes, canDisplayFolder,
      displayFolder, accountForRow, onFolderChanged, onAccountsChanged, onModesChanged, dispose };
  }
  return { create };
})();
