// Shared script loaded into its own scope by Thunderbird, the background page and the Node tests.
var AccountPaneGroups = {
  DEFAULT_ID: "default",

  isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  },

  cleanName(value) {
    const name = typeof value === "string" ? value.trim().slice(0, 100) : "";
    return name || null;
  },

  newGroupId(now = Date.now(), random = Math.random) {
    return `g-${now.toString(36)}-${Math.floor(random() * 2 ** 32).toString(36)}`;
  },

  // Never throws; accepts v1 and v2 settings and drops invalid fields one by one.
  normalize(value) {
    const v = this.isObject(value) ? value : {};
    const seen = new Set([this.DEFAULT_ID]);
    const groups = (Array.isArray(v.groups) ? v.groups : []).flatMap(group => {
      const name = this.isObject(group) ? this.cleanName(group.name) : null;
      if (!name || typeof group.id !== "string" || !group.id || seen.has(group.id)) {
        return [];
      }
      seen.add(group.id);
      return [{ id: group.id, name }];
    });
    const entries = field => this.isObject(v[field]) ? Object.entries(v[field]) : [];
    const collapsed = Array.isArray(v.collapsedGroups) ? v.collapsedGroups :
      v.accountsExpanded === false ? [this.DEFAULT_ID] : [];
    const selectedAccountId = typeof v.selectedAccountId === "string" ? v.selectedAccountId : null;
    return {
      version: 2,
      selectedAccountId,
      selectedGroupId: !selectedAccountId && seen.has(v.selectedGroupId) ? v.selectedGroupId : null,
      collapsedGroups: [...new Set(collapsed.filter(id => seen.has(id)))],
      lastFolders: Object.fromEntries(entries("lastFolders")
        .filter(([, uri]) => typeof uri === "string")),
      defaultGroupName: this.cleanName(v.defaultGroupName),
      groups,
      membership: Object.fromEntries(entries("membership")
        .filter(([, id]) => id !== this.DEFAULT_ID && groups.some(group => group.id === id)))
    };
  },

  createGroup(settings, groupId, name, accountId = null) {
    const s = this.normalize(settings);
    const clean = this.cleanName(name);
    if (!clean || typeof groupId !== "string" || !groupId || groupId === this.DEFAULT_ID ||
        s.groups.some(group => group.id === groupId)) {
      return s;
    }
    const created = { ...s, groups: [...s.groups, { id: groupId, name: clean }] };
    return this.moveAccount(created, accountId, groupId);
  },

  renameGroup(settings, groupId, name) {
    const s = this.normalize(settings);
    const clean = this.cleanName(name);
    if (groupId === this.DEFAULT_ID) {
      return this.normalize({ ...s, defaultGroupName: clean });
    }
    return clean ? this.normalize({ ...s,
      groups: s.groups.map(group => group.id === groupId ? { id: groupId, name: clean } : group) }) : s;
  },

  deleteGroup(settings, groupId) {
    const s = this.normalize(settings);
    return groupId === this.DEFAULT_ID ? s :
      this.normalize({ ...s, groups: s.groups.filter(group => group.id !== groupId) });
  },

  moveAccount(settings, accountId, groupId) {
    const s = this.normalize(settings);
    if (typeof accountId !== "string" ||
        (groupId !== this.DEFAULT_ID && !s.groups.some(group => group.id === groupId))) {
      return s;
    }
    const rest = Object.entries(s.membership).filter(([key]) => key !== accountId);
    return this.normalize({ ...s, membership: Object.fromEntries(
      groupId === this.DEFAULT_ID ? rest : [...rest, [accountId, groupId]]) });
  },

  setGroupExpanded(settings, groupId, expanded) {
    const s = this.normalize(settings);
    const rest = s.collapsedGroups.filter(id => id !== groupId);
    return this.normalize({ ...s, collapsedGroups: expanded ? rest : [...rest, groupId] });
  },

  // accountIds is the full account list: hidden accounts keep their group.
  pruneMembership(settings, accountIds) {
    const s = this.normalize(settings);
    if (!Array.isArray(accountIds)) {
      return s;
    }
    const keep = new Set(accountIds.filter(id => typeof id === "string"));
    const only = object => Object.fromEntries(Object.entries(object).filter(([key]) => keep.has(key)));
    return { ...s, membership: only(s.membership), lastFolders: only(s.lastFolders) };
  },

  // accounts: visible accounts in native order; every one lands in exactly one entry.
  view(accounts, settings, defaultLabel) {
    const s = this.normalize(settings);
    const groupOf = account => Object.hasOwn(s.membership, account.id) ?
      s.membership[account.id] : this.DEFAULT_ID;
    return [{ id: this.DEFAULT_ID, name: s.defaultGroupName ?? defaultLabel, custom: false },
      ...s.groups.map(group => ({ ...group, custom: true }))].map(entry => ({
      ...entry, accountIds: accounts.filter(account => groupOf(account) === entry.id)
        .map(account => account.id)
    }));
  },

  isUnrestricted(view) {
    return view.every(entry => !entry.custom || entry.accountIds.length === 0);
  },

  groupOf(view, accountId) {
    return view.find(entry => entry.accountIds.includes(accountId))?.id ?? null;
  },

  memberIds(view, selection) {
    if (!selection) {
      return null;
    }
    if (selection.type === "account") {
      return [selection.id];
    }
    return selection.id === this.DEFAULT_ID && this.isUnrestricted(view) ? null :
      view.find(entry => entry.id === selection.id)?.accountIds ?? null;
  },

  fallbackSelection(view) {
    return !this.isUnrestricted(view) && view[0].accountIds.length ?
      { type: "group", id: this.DEFAULT_ID } : null;
  },

  normalizeSelection(view, selection) {
    if (!selection) {
      return null;
    }
    if (selection.type === "account") {
      return this.groupOf(view, selection.id) ? selection : this.fallbackSelection(view);
    }
    const entry = selection.type === "group" ? view.find(item => item.id === selection.id) : null;
    if (!entry?.accountIds.length) {
      return this.fallbackSelection(view);
    }
    return entry.id === this.DEFAULT_ID && this.isUnrestricted(view) ? null : selection;
  },

  groupTarget(accountIds, folders, { current, lastFolders, explicit }, model) {
    if (current?.available && accountIds.includes(current.accountId)) {
      return current;
    }
    for (const id of accountIds) {
      const target = explicit ? model.firstTarget(id, folders) :
        model.resolveTarget(id, folders, lastFolders);
      if (target) {
        return target;
      }
    }
    return null;
  },

  openTarget(accountIds, folders, model) {
    for (const id of accountIds) {
      const inbox = folders.find(folder => folder.accountId === id && folder.available &&
        folder.inbox && !folder.root);
      if (inbox) {
        return inbox;
      }
    }
    return accountIds.length ? model.firstTarget(accountIds[0], folders) : null;
  }
};
