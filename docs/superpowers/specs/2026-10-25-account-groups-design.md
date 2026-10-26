# Account groups (AccountPane 0.2.0) — design

Status: approved scope, 2026-10-25. Target version 0.2.0 (main is at 0.1.13).

## Intent

The maintainer moved from Postbox, where accounts are organised into named *account groups*: "All Accounts" is just the default group, the user creates further groups, moves accounts between them, and selecting a group shows the folders of all of its accounts. AccountPane today has one fixed root ("All Accounts" = full native folder tree) with every visible account under it. This version turns that root into the default group and adds user groups, so a person with many accounts (work, personal, legacy) can switch the folder pane between sets of accounts, not only between one account and everything.

Success: the user can recreate their Postbox layout (screenshot: "All Accounts" with five accounts, a second group "йцукен" with one account), select a group to see only its accounts' folders, see the group's aggregated counters/new-mail star, and manage groups by mouse and by keyboard; layout survives restarts and new/removed accounts.

## Decisions confirmed with the user

1. **The default group behaves like Postbox.** "All Accounts" is the default group. Selecting it shows the folders of its member accounts only. While no account belongs to any user group (including when no user groups exist, or all user groups are empty), the default group contains every visible account and selecting it restores the full, unrestricted native tree exactly as 0.1.x does today (Unified/Tags aggregates included).
2. **The default group can be renamed**, never deleted. Renaming to an empty/whitespace name restores the localized default name ("All Accounts" / Russian equivalent). A custom name is stored; an unset name follows the UI locale.
3. **Group headers are always shown**, including groups with one account and empty groups (an empty group must exist as a drop/move target). An empty group cannot be selected (click/Enter only focuses it); its header still has a context menu.
4. **Open in New Tab / Open in New Window are in 0.2.0** for group headers: they open the group's first available Inbox (see "Context menus"). AccountPane state of the newly opened tab/window is not configured (out of scope; the new tab's pane starts in its own normal initial state).

## Builder's calls (made by the designer, not confirmed by the user — flagged so they can be checked)

- **No nested groups.** A group contains accounts only.
- **Search Messages… and Settings… are omitted** for groups. Thunderbird's Search Messages dialog is scoped to one folder and Account Settings to one server; neither maps cleanly to a set of accounts. The account context menu (native) keeps both for individual accounts.
- **Group order** is creation order; the default group is always first. Groups cannot be reordered in 0.2.0 (stored as an ordered array, so reordering can be added later without migration). New groups are appended.
- **Delete is not confirmed** — it is non-destructive (accounts move back to the default group, mail is untouched).
- **Account order inside groups** is Thunderbird's global account order (the order the existing drag-to-reorder edits via `reorderAccounts`); groups just partition that list.
- **Group counters/star follow the existing "All Accounts" rule**: the header shows the aggregate (sum of members' unread/total, star if any member has new mail) only while the group is collapsed; expanded, the member rows carry the numbers. This keeps today's behaviour for "All Accounts" and avoids double counting on screen. The aggregate is unknown (hidden) if any member's metric is unknown, as today.
- **A selected group with several accounts keeps each account's root row** in the folder pane (not flattened as for a single account), so folders of different accounts stay distinguishable. A group with exactly one visible member is filtered exactly like selecting that account (flattened).
- **Following native navigation**: when a folder of an account outside the selected group becomes current (e.g. opened from search, from another tab's history), the selection moves to that *account* (same as today's behaviour when an account is selected). A folder of a member account keeps the group selected. Multi-selection across member accounts of the selected group is allowed.
- **Collapsed/expanded state** is per group and shared across windows (like today's `accountsExpanded`).

## Selection rules (builder's calls)

The pane has three kinds of runtime selection: an **account**, a **group**, and **unrestricted** (full native tree). Unrestricted is what 0.1.13 calls "All Accounts selected"; with groups it is shown by selecting the default group *only while* `isUnrestricted` holds, otherwise unrestricted has no selected header.

- **Fail-open / mixed native selection** (`followTarget(null)`, filter errors, a native multi-selection spanning accounts that are not all in the selected group): unrestricted. The default header is marked selected only if the default group is unrestricted.
- **Invalid selection fallback** (saved/selected group deleted, emptied or unknown; selected account gone): the default group if it has members, otherwise unrestricted. An empty group is never the selection.
- **Membership changes under a pane** (this pane or another window via broadcast): the selected group stays selected and the filter is re-applied. If the open folder is now hidden, the pane re-targets inside the group exactly as for a native delete/rename today (`refresh()` path). The same applies when the first account enters a user group and the default group stops being unrestricted. A selected *account* that moves between groups stays selected.
- **Startup**: as today, the folder already open wins. If its account belongs to the saved group, the saved group is restored (keeping that folder); otherwise that account is selected. With no open folder, the saved group/account is restored via `resolveTarget`; then the fallback above.
- **Pruning membership**: entries are pruned only against the *full* account list (`MailServices.accounts.accounts`, hidden/deferred/IM included), never against the visible list, so hiding an account or deferring a POP3 server keeps its group. Hidden accounts keep their entry but are not displayed. Because Thunderbird can reuse a deleted account's key for a new account, the controller sends a `pruneMembership` patch (the full key list) when the account list changes and once at startup; the background writer, which has no account access, applies it. A membership entry whose key exists and points to a missing group is treated as default and dropped on the next write.

## Goals

- Default group + user groups; every visible account in exactly one group.
- Select group → folder pane filtered to the set of its member accounts.
- Group CRUD: New Account Group…, Rename…, Delete; Move account to group (drag onto header, drag between accounts of another group, keyboard-accessible "Move to Group" submenu in the account context menu).
- Group context menu with Open in New Tab / Open in New Window.
- Persistence in `storage.local`, versioned migration from settings v1.
- Keyboard and screen-reader support consistent with the existing ARIA tree; labels in `en` and `ru`.

## Non-goals

- Nested groups, group reordering, group icons/colours.
- Per-tab AccountPane state for tabs/windows opened from the group menu.
- Search Messages… / Settings… for groups.
- Syncing groups to other profiles/devices; import from Postbox.
- Changing native folder rows or native counters.

## Anti-goals (failure even if it "works")

- An account appears in two groups, or disappears from the pane.
- With no user groups in use, anything differs from 0.1.13 (UI, filtering, counters, keyboard, drag-to-reorder) other than the new context menu entries.
- A failure in group code leaves the native folder pane hidden or unusable (the existing fail-open principle applies).
- Corrupt or unknown stored data crashes startup instead of being sanitised.
- Breaking Thunderbird 140 ESR / Betterbird 140 support or the Tangaroa theme (keep existing `accountpane-*` classes/IDs; new elements get new `accountpane-*` names).

## Model

Pure helpers live in `addon/lib/model.js` (Node-testable, no DOM):

- **Group**: `{ id: string, name: string | null }`. The default group has the fixed id `"default"` and is not stored in the groups array; its `name` is `null` unless renamed. User group ids are generated (`"g-" + time base36 + random`), never reused, must not equal `"default"`.
- **Membership**: `{ [accountKey]: groupId }` for accounts in user groups only. An account with no entry, or with an entry pointing to a non-existent group, is in the default group.
- `groupsView(accounts, groups, membership)` → ordered list `[{ id, name, accountIds }]` with the default group first, each account exactly once, account order = input (native) order. Removed accounts are ignored (and dropped by sanitisation on next save); new accounts land in the default group.
- `isUnrestricted(view)`: true when no user group has a visible member — then selecting the default group means "no filter".
- Selection: either an account id or a group id (never both). `null`/absent = default group (preserves the meaning of v1 `selectedAccountId: null`).
- Pure operations returning new state, used by the background writer: `createGroup(state, id, name)`, `renameGroup(state, id, name)`, `deleteGroup(state, id)` (removes membership entries pointing to it), `moveAccount(state, accountKey, groupId)` (`"default"` removes the entry), `setGroupExpanded(state, id, bool)`. Names are trimmed, limited to a reasonable length (e.g. 100 chars); empty names are rejected for user groups and reset the default group's name.
- Group target resolution: explicit selection → the current folder if it belongs to a member account, else the first member (in group order) that has a displayable target via the existing `firstTarget`. Restoring a group on startup uses `resolveTarget` per member with `lastFolders`, first member that resolves.

## Settings v2 and migration

Stored as `settings` in `storage.local` (same key):

```
{
  version: 2,
  selectedAccountId: string | null,
  selectedGroupId: string | null,      // at most one of the two is non-null
  collapsedGroups: string[],           // replaces accountsExpanded
  lastFolders: { [accountKey]: uri },
  defaultGroupName: string | null,
  groups: [{ id, name }],              // user groups, in order
  membership: { [accountKey]: groupId }
}
```

- v1 → v2: `accountsExpanded === false` → `collapsedGroups: ["default"]`; `selectedAccountId` kept; no groups. Unknown/garbage values are dropped field by field (existing `normalize` style), never throw. A future version (> 2) is read best-effort the same way.
- Account-dependent sanitisation (dropping membership/lastFolders/selection of accounts that no longer exist, membership pointing to missing groups) happens where accounts are known (`sanitizeSettings` in the model, applied by the controller) and on the next write.
- `schema.json` `Settings` and `StatePatch` types are extended accordingly (version 1–2). `StatePatch` gains group operations (`createGroup`, `renameGroup`, `deleteGroup`, `moveAccount`, `groupExpanded`) and `selectedGroupId`; `accountsExpanded` is accepted from an old patch shape only if needed for compatibility (builder's choice), otherwise replaced by `groupExpanded`.
- The background writer stays the single serial writer: it applies each patch to the current normalised state and broadcasts the snapshot via `settingsChanged`. Group structure, membership, names and collapsed state are **shared**: every window/tab controller re-renders from the broadcast snapshot. Selection stays per pane (a snapshot never changes another pane's runtime selection, as today), except that a pane whose selected group was deleted falls back to the default group, and a pane whose selected group lost all members falls back to the default group.
- `scripts/build.py` keeps the allowlist; required locale keys are extended.

## UI

Folder pane top section (`#accountpane-accounts`), ARIA `tree`:

```
▾ All Accounts            ← group header (level 1), treeitem with aria-expanded
    On My Mac             ← account (level 2)
    mike@…
▾ йцукен                  ← user group header
    landy2005@…  112
```

- Group headers reuse today's root row look (disclosure + icon + name + badges + new-mail star). The default group keeps class `accountpane-root` and its current markup so existing styling/theme expectations hold; user group headers also get `accountpane-root` plus `accountpane-group`, with `data-accountpane-group` = group id. Accounts keep `accountpane-child`. Each header contains its own `role="group"` list.
- When there are no user groups, the DOM and behaviour are those of 0.1.13 (one root, same labels).
- Group icon: the existing "all" (cloud stack) icon for every header (builder may choose a separate folder-like glyph for user groups if it matches the existing icon set).
- Empty group: header shown, collapsed disclosure disabled or hidden (builder's choice), `aria-disabled` is not used (it still has a menu); click/Enter just focuses.
- Selecting a header selects the group (`aria-selected`), filters the folder pane, shows the target folder. Clicking the disclosure toggles only that group.
- Group-level star and counters per "Builder's calls" above.

### Keyboard (extends the existing tree)

- Up/Down/Home/End move over visible rows (headers and accounts of expanded groups).
- Right on a collapsed header expands; on an expanded header moves to its first account. Left on an account moves to its header; on an expanded header collapses.
- Enter/Space selects the focused group/account (empty group: no-op).
- Context-menu key / Shift+F10 opens the row's menu anchored to the row (already supported for accounts through the `contextmenu` event).
- The tab-stop/roving-focus logic generalises from "root + children" to "headers + children of expanded groups".

### Screen reader

- Headers: `role="treeitem"`, `aria-level="1"`, `aria-expanded`, `aria-selected`; accessible name = group name plus the existing unread/total/new labels when shown; member count may be added ("3 accounts") using a new locale string.
- Accounts: `aria-level="2"`.
- Disclosure button labels become per group: "Expand {name}" / "Collapse {name}" (new keys); the existing `expandAccounts`/`collapseAccounts` remain for the default group if there are no user groups.

## Context menus

### Group header (new, AccountPane-owned XUL `menupopup` in the 3-pane document, created per pane and removed on dispose)

1. Open in New Tab
2. Open in New Window
3. — separator —
4. New Account Group…
5. Rename…
6. Delete (absent/disabled for the default group)

- Open in New Tab/Window: target = first member (group order) whose Inbox (`inbox && !root && available`) exists, else the first member's `firstTarget`; disabled when the group has no member with a target. Use the native folder-pane helpers Thunderbird uses for its own folder context menu (`MsgOpenNewTabForFolders` / `MsgOpenNewWindowForFolder` or the `tabmail.openTab("mail3PaneTab", { folderURI })` equivalent — the builder verifies which exist on 140 ESR and 157–158 and omits the items when unavailable).
- New Account Group…, Rename…: a native modal text prompt (`Services.prompt.prompt`) with localized title/label; Cancel or an empty name for a new group does nothing. New group is created empty and focused afterwards (not selected).
- Delete: removes the group; its accounts return to the default group; if this pane had it selected, the selection becomes the default group.

### Account (existing native `folderPaneContext` with override folder)

- While AccountPane opens it for an account, it appends a separator and a **Move to Group** submenu listing all groups (default first, current group checked/disabled) plus "New Account Group…" (creates the group and moves the account into it). The added items are removed on `popuphidden` and on dispose, leaving the native menu unchanged for normal folder rows.

## Drag and drop

- Existing drag-to-reorder keeps working within a group (drop before/after an account of the same group → `reorderAccounts` as today).
- Drop onto a **group header** (any group, including the default): move the account into that group (no native reorder). Header shows a drop highlight (`data-accountpane-drop="into"`).
- Drop before/after an account of **another** group: move into that group and reorder before/after that account (one membership patch + one native reorder).
- Dropping on its own group header is a no-op. Group headers are not draggable in 0.2.0.
- Collapsed groups: dropping on the collapsed header is allowed (that is how you reach it). Today drag is disabled while the whole list is collapsed; with groups, dragging is possible whenever the source account is visible.

## Folder-pane filtering (`tree-filter.js`)

`apply()` takes a set of account ids (or `null` = unrestricted) instead of one id. Rules:

- One account in the set: identical to today (flatten that account's root in All mode, shorten names, keep Unified/Tags branches for that account only).
- Several accounts: hide rows whose account is outside the set; do not flatten account roots; Unified/Tags virtual parents are kept as today when they contain member rows, their cross-account rows filtered to members; mixed-account aggregate rows are hidden as today.
- `synchronize()` (native selection change): target is "inside the current set" if every selected row belongs to a member account; otherwise the same single-account/`null` logic as today notifies the controller.
- Fail-open behaviour unchanged.

## Controller

`selectAccount(id)` generalises to `select({ accountId } | { groupId })`; the default group with `isUnrestricted` maps to today's `null` path. `followFolder` checks membership of the selected group. `refresh()` (accounts changed) re-derives the groups view, drops selection of vanished accounts/groups to the default group, and re-renders. `updateSettings(snapshot)` now also re-renders the group structure. All existing fail-open, pending-history and disposal rules stay.

## Localisation (en, ru)

New keys (names indicative): `newAccountGroup` ("New Account Group…"), `renameGroup` ("Rename…"), `deleteGroup` ("Delete"), `openInNewTab`, `openInNewWindow`, `moveToGroup` ("Move to Group"), `groupNamePromptTitle`, `groupNamePromptText`, `renameGroupPromptTitle`, `expandGroup` ("Expand {name}"), `collapseGroup` ("Collapse {name}"), `groupMemberCount` (optional). Russian strings follow Thunderbird's Russian UI vocabulary ("Учётные записи"); access keys are optional. `scripts/build.py` required-keys list updated.

## Testing

Automated (`node --test tests/*.test.mjs`, existing fake DOM/adapters in `tests/fixtures.mjs`):

- Model: groups view (exactly-once membership, new account → default, removed account dropped, membership to missing group → default), CRUD operations, name rules, `isUnrestricted`, group target resolution, settings v1→v2 migration and garbage sanitisation.
- Storage/background: serial application of group patches, broadcast snapshot shape, schema of new patch fields.
- Tree filter: account-set filtering (one vs several accounts, Unified/Tags, synchronize with multi-selection), unchanged single-account behaviour.
- View: rendering of headers/accounts/levels/ARIA, per-group expand/collapse, keyboard navigation across groups, context menu dispatch for headers vs accounts, drag onto header, drag between groups, drag within a group (unchanged), aggregated counters/star per group, no-user-groups DOM identical to 0.1.13 expectations.
- Controller: select group, follow folder inside/outside group, group deleted/emptied while selected, startup restore of a selected group.
- Adapter: Move to Group submenu insertion/cleanup on the native popup, group menu creation/cleanup, Open in New Tab/Window call mapping, prompt handling (cancel/empty).

Native (by the user on macOS Thunderbird; keyboard pass on the Windows 11 VM harness if convenient): checklist covers upgrade from 0.1.13 with existing settings, create/rename/delete group, move by drag and by submenu, selection/filtering with one and several accounts, counters/star, Open in New Tab/Window, restart persistence, adding/removing an account, keyboard-only and VoiceOver/NVDA spot check, ESR 140 smoke.

## Deliverables

Design (this file), plan in `docs/superpowers/plans/`, implementation with tests, version 0.2.0 (manifest, package.json, build validation/tests), CHANGELOG entry, README.md and README.ru.md "Account groups" section, `docs/development.md` notes on stored data (groups/membership now stored locally), PR to `main` (no merge, tag, release or catalogue upload).
