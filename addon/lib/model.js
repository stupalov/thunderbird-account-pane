// Shared script loaded into its own scope by Thunderbird and the Node tests.
var AccountPaneModel = {
  visibleAccounts(accounts) {
    return accounts.filter(account => !account.hidden &&
      account.type !== "im" && account.type !== "chat" &&
      !(account.type === "pop3" && account.deferred));
  },

  resolveTarget(accountId, folders, lastFolders) {
    const own = folders.filter(folder => folder.accountId === accountId && folder.available);
    return own.find(folder => folder.uri === lastFolders?.[accountId]) ??
      own.find(folder => folder.inbox && !folder.root) ??
      own.find(folder => !folder.root) ??
      own.find(folder => folder.root) ?? null;
  },

  firstTarget(accountId, folders) {
    const own = folders.filter(folder => folder.accountId === accountId && folder.available);
    return own.find(folder => !folder.root) ?? own.find(folder => folder.root) ?? null;
  },

  initialAccount(accounts, folderAccountId, savedAccountId) {
    const ids = new Set(this.visibleAccounts(accounts).map(account => account.id));
    if (ids.has(folderAccountId)) {
      return folderAccountId;
    }
    return ids.has(savedAccountId) ? savedAccountId : null;
  },

  followFolder(selectedAccountId, folderAccountId) {
    return selectedAccountId === null ? null : folderAccountId ?? selectedAccountId;
  },

  sanitizeSettings(settings, accounts, folders) {
    const value = settings && typeof settings === "object" && !Array.isArray(settings) ?
      settings : {};
    const savedFolders = value.lastFolders && typeof value.lastFolders === "object" &&
      !Array.isArray(value.lastFolders) ? value.lastFolders : {};
    const visible = this.visibleAccounts(accounts);
    const lastFolders = Object.fromEntries(visible.flatMap(account => {
      const uri = savedFolders[account.id];
      if (!Object.hasOwn(savedFolders, account.id) || typeof uri !== "string" ||
          !folders.some(folder => folder.accountId === account.id && folder.available &&
            folder.uri === uri)) {
        return [];
      }
      return [[account.id, uri]];
    }));
    return {
      version: 1,
      selectedAccountId: visible.some(account => account.id === value.selectedAccountId) ?
        value.selectedAccountId : null,
      lastFolders
    };
  },

  allowsFiltering(modes) {
    return Array.isArray(modes) && modes.length > 0 &&
      modes.every(mode => ["all", "favorite", "unread", "recent", "smart", "tags"].includes(mode));
  }
};
