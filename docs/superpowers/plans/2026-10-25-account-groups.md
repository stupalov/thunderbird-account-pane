# Account Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Postbox-style account groups in AccountPane 0.2.0: a default group ("All Accounts") plus user groups, group selection filters the folder pane to a set of accounts, group CRUD and moving accounts by drag or context menu, persisted as settings v2.

**Architecture:** A new pure script `addon/lib/groups.js` (`AccountPaneGroups`) owns group data: normalisation of settings v2, migration from v1, pure operations applied by the background writer, and derived views/selection helpers used by the controller. Group structure is *shared* state: the controller never changes it locally, it sends a patch, the background writer applies it serially and broadcasts the snapshot, and every pane re-renders from `updateSettings`. Selection stays per pane. The tree filter generalises from one account id to a set of ids; the view renders group headers with nested accounts; the adapter owns native menus/prompts/tab opening.

**Tech Stack:** Thunderbird MailExtension + Experiment API (plain JS scripts loaded into isolated scopes), Node 24 `node --test` with `vm`-loaded scripts and hand-made fakes, Python 3 builder.

**Spec:** `docs/superpowers/specs/2026-10-25-account-groups-design.md` (read it; it is the authority for behaviour, this plan for names and boundaries).

## Global Constraints

- Thunderbird range stays `strict_min_version: "140.0"`, `strict_max_version: "158.*"`; ESR 140 fallbacks in the adapter stay.
- No third-party dependencies; tests: `node --test tests/*.test.mjs` (Node may be at `/Users/mike/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`); build: `python3 scripts/build.py`.
- Default group id is the literal `"default"`; user group ids are `"g-" + Date.now().toString(36) + "-" + random base36` and never equal `"default"`.
- Group names: trimmed, max 100 characters (longer is truncated), empty rejected for user groups; empty for the default group resets it to the localized label.
- Settings key stays `settings` in `storage.local`; new `version: 2`.
- Keep every existing `accountpane-*` class/ID and `data-accountpane-*` attribute; new DOM names start with `accountpane-`.
- With no account in any user group, behaviour and DOM equal 0.1.13 apart from the new context-menu entries (anti-goal in the spec).
- All native integration fails open: an exception in group code never leaves folder rows hidden.
- Code, comments, commits, README, CHANGELOG, PR in English; `README.ru.md` mirrors `README.md`; locale strings in `en` and `ru`. No attribution lines in commits.
- Match the surrounding code style: dense, small functions, short comments only for non-obvious native constraints, tests in the existing one-test-per-behaviour style.

## Review Focus

1. **Upgrade from 0.1.13 settings** (`{version:1, selectedAccountId:"x", accountsExpanded:false, lastFolders}`) must start with the same selection and a collapsed default group — test in Task 1 (`migrates v1 settings`) and Task 2 (`writer migrates v1 snapshot on first save`).
2. **Another window changes groups while this pane has the group selected** (delete, move the open folder's account out): the pane must fall back/re-target, never show an empty pane — test in Task 5 (`snapshot deleting the selected group falls back to default`, `snapshot moving the open folder's account re-targets inside the group`).
3. **Every account moved into user groups** (default empty): selecting the default header is a no-op, startup with saved `null` selection is unrestricted — test in Task 1 (`fallbackSelection with empty default is unrestricted`) and Task 4 (`empty group header focuses without selecting`).
4. **Thunderbird reuses a deleted account key**: a new account with a previously used key must land in the default group — test in Task 2 (`pruneMembership drops absent keys and keeps hidden ones`) and Task 5 (`accounts change sends pruneMembership with the full key list`).
5. **Drag within a group still reorders natively, drag across groups moves membership** — test in Task 4 (`drop on an account of another group moves with placement`, `drop inside the same group still reorders`) and Task 5 (`moveAccount with placement saves membership and reorders`).

---

## File map

- Create `addon/lib/groups.js` — `AccountPaneGroups`: normalize/migrate, pure ops, view/selection helpers.
- Modify `addon/background.js` — `AccountPaneStorage` delegates to `AccountPaneGroups`; new patch kinds.
- Modify `addon/manifest.json` — background scripts `["lib/groups.js", "background.js"]`; version `0.2.0` (Task 7).
- Modify `addon/experiment/schema.json` — Settings v2, StatePatch group fields.
- Modify `addon/experiment/tree-filter.js` — `apply(accountIds)` for a set.
- Modify `addon/experiment/account-view.js`, `addon/experiment/account-pane.css` — group headers.
- Modify `addon/experiment/controller.js` — selection model, group commands.
- Modify `addon/experiment/thunderbird-adapter.js` — group menu, Move to Group submenu, prompt, open in tab/window.
- Modify `addon/experiment/implementation.js` — load `lib/groups.js`, labels, wiring.
- Modify `addon/_locales/{en,ru}/messages.json`, `scripts/build.py` (allowlist + keys + version), `tests/build.test.mjs`.
- Modify `tests/load-script.mjs` — add `loadScripts(paths, exportName, extra)`.
- Tests: create `tests/groups.test.mjs`; extend `tests/storage.test.mjs`, `tests/tree-filter.test.mjs`, `tests/account-view.test.mjs`, `tests/controller.test.mjs`, `tests/thunderbird-adapter.test.mjs`, `tests/experiment.test.mjs`.
- Docs (Task 7): `CHANGELOG.md`, `README.md`, `README.ru.md`, `docs/development.md`, `package.json`.

## Shared data shapes (all tasks)

```js
// Settings v2 (normalized)
{ version: 2, selectedAccountId: string|null, selectedGroupId: string|null,
  collapsedGroups: string[], lastFolders: { [accountKey]: uri },
  defaultGroupName: string|null, groups: [{ id, name }], membership: { [accountKey]: groupId } }

// Runtime selection inside a pane (controller/view)
null                                   // unrestricted: full native tree
{ type: "account", id: accountKey }
{ type: "group", id: groupId }         // "default" or a user group id

// Group view entry (derived, ordered, default first)
{ id, name /* resolved, never empty */, custom: boolean, accountIds: string[] }
```

---

### Task 1: Pure group model (`lib/groups.js`)

Model: Sonnet.

**Files:**
- Create: `addon/lib/groups.js`
- Modify: `tests/load-script.mjs`
- Test: `tests/groups.test.mjs`

**Interfaces:**
- Produces `var AccountPaneGroups = { DEFAULT_ID: "default", ... }` with:
  - `normalize(value) -> Settings v2` — never throws; v1 → v2 migration (`accountsExpanded === false` → `collapsedGroups: ["default"]`); drops invalid fields one by one; drops groups with invalid/duplicate/`"default"` ids or empty names; membership values must reference an existing user group; `collapsedGroups` filtered to existing ids, deduplicated; `selectedGroupId` must exist (`"default"` allowed); if both selections are non-null keep `selectedAccountId`. Uses computed keys / `Object.fromEntries` so keys like `__proto__` stay ordinary.
  - `cleanName(value) -> string|null` (trim, slice 100, `null` if empty or not a string).
  - `newGroupId(now = Date.now(), random = Math.random) -> string`.
  - Pure ops, each `(settings, ...) -> new normalized settings` (input not mutated; invalid input returns an unchanged normalized copy):
    `createGroup(s, groupId, name, accountId = null)` (appends; optional immediate move),
    `renameGroup(s, groupId, name)` (`"default"` + empty → `defaultGroupName: null`),
    `deleteGroup(s, groupId)` (not `"default"`; removes its membership entries, its collapsed entry, clears `selectedGroupId` if equal),
    `moveAccount(s, accountId, groupId)` (`"default"` deletes the entry; unknown group → unchanged),
    `setGroupExpanded(s, groupId, expanded)`,
    `pruneMembership(s, accountIds)` (keeps membership and lastFolders only for keys in `accountIds`; this is the *full* account list).
  - `view(accounts, settings, defaultLabel) -> GroupView[]` — `accounts` are visible accounts in native order; each account in exactly one entry; default first, then `settings.groups` order; default `name` = `settings.defaultGroupName ?? defaultLabel`.
  - `isUnrestricted(view) -> boolean` — no custom entry has accountIds.
  - `groupOf(view, accountId) -> groupId|null`.
  - `memberIds(view, selection) -> string[]|null` — `null` for unrestricted (selection `null`, or default group while unrestricted); account → `[id]`; group → its accountIds.
  - `fallbackSelection(view) -> Selection` — default group if it has members and the view is restricted; otherwise `null`.
  - `normalizeSelection(view, selection) -> Selection` — invalid/empty group or vanished account → `fallbackSelection(view)`; default group while unrestricted → `null`.
  - `groupTarget(accountIds, folders, { current, lastFolders, explicit }, model) -> folder|null` — `current` wins when it is available and its account is a member; otherwise the first member for which `explicit ? model.firstTarget(id, folders) : model.resolveTarget(id, folders, lastFolders)` is non-null.
  - `openTarget(accountIds, folders, model) -> folder|null` — the first member (in order) with an available non-root Inbox gives that Inbox; if none has one, the first member's `model.firstTarget`.
- `tests/load-script.mjs` gains `loadScripts(paths: string[], exportName, extra) ` — runs every file in one context, returns `scope[exportName]`.

- [ ] **Step 1: Write failing tests** in `tests/groups.test.mjs` (use `makeModelFixture` accounts filtered through `AccountPaneModel.visibleAccounts`; load `addon/lib/model.js` and `addon/lib/groups.js`). Tests and key assertions:
  - `migrates v1 settings`: `normalize({version:1, selectedAccountId:"a", accountsExpanded:false, lastFolders:{a:"fixture://a/x"}})` deep-equals `{version:2, selectedAccountId:"a", selectedGroupId:null, collapsedGroups:["default"], lastFolders:{a:"fixture://a/x"}, defaultGroupName:null, groups:[], membership:{}}`; `normalize(undefined)` gives the same with `selectedAccountId:null, collapsedGroups:[]`.
  - `normalize drops garbage field by field`: groups `[{id:"default",name:"x"},{id:"g-1",name:"  "},{id:"g-2",name:"Work"},{id:"g-2",name:"Dup"},7]` → `[{id:"g-2",name:"Work"}]`; membership `{a:"g-2", b:"g-missing", c:5}` → `{a:"g-2"}`; `collapsedGroups:["g-2","g-2","nope","default"]` → `["g-2","default"]`; 150-char name truncated to 100; `__proto__` membership key round-trips as an own key.
  - `create rename delete and move are pure`: create `g-1 "Work"` with `accountId:"a"` → `membership.a === "g-1"`, input unchanged; rename `g-1` to `"  Home "` → `"Home"`; rename `g-1` to `""` → unchanged; rename `default` to `"Main"` then `""` → `defaultGroupName` `"Main"` then `null`; delete `g-1` → no groups, `membership` `{}`, `selectedGroupId` cleared if it was `g-1`; delete `default` → unchanged; move `a` to `default` → entry removed; move to unknown group → unchanged.
  - `pruneMembership drops absent keys and keeps hidden ones` (pure part): `pruneMembership(s, ["a","hidden"])` keeps `membership.hidden` and `lastFolders.a`, drops `b`.
  - `view puts each visible account in exactly one group in native order`: membership `{a:"g-1", hidden:"g-1"}`, groups `[g-1 "Work", g-2 "Empty"]` → `[{id:"default",name:"All Accounts",custom:false,accountIds:["b","local","pop"]},{id:"g-1",name:"Work",custom:true,accountIds:["a"]},{id:"g-2",name:"Empty",custom:true,accountIds:[]}]`.
  - `isUnrestricted only while user groups have no visible members`: true for no groups, true for only empty groups, true when the only member is hidden, false with `a` in `g-1`.
  - `fallbackSelection with empty default is unrestricted`: all visible accounts in `g-1` → `fallbackSelection` is `null`; restricted with default members → `{type:"group", id:"default"}`.
  - `normalizeSelection`: default while unrestricted → `null`; `{type:"group",id:"g-2"}` (empty) → fallback; `{type:"account",id:"gone"}` → fallback; valid ones returned unchanged.
  - `memberIds`: `null`→`null`; account → `["a"]`; `g-1` → `["a"]`; default while restricted → its members.
  - `groupTarget prefers current member folder then first resolvable member`: current folder of `b` with members `["a","b"]` → that folder; current of a non-member → first member's target (`explicit:true` uses `firstTarget`, `explicit:false` uses `resolveTarget` with `lastFolders`).
  - `openTarget prefers the first member Inbox`: members `["a","b"]` → `fixture://a/renamed-inbox`; members with no folders → `null`.
  - `newGroupId never returns default and has the g- prefix`.
- [ ] **Step 2: Run** `node --test tests/groups.test.mjs` — expected FAIL (file missing).
- [ ] **Step 3: Implement** `addon/lib/groups.js` and `loadScripts` per Interfaces. Header comment like `model.js` ("Shared script loaded into its own scope by Thunderbird, the background page and the Node tests.").
- [ ] **Step 4: Run** `node --test tests/*.test.mjs` — expected all PASS (existing 195 + new).
- [ ] **Step 5: Commit** `git add addon/lib/groups.js tests/groups.test.mjs tests/load-script.mjs && git commit -m "Add pure account group model"`

---

### Task 2: Settings v2 persistence (background writer, schema, packaging)

Model: Sonnet.

**Files:**
- Modify: `addon/background.js`, `addon/experiment/schema.json`, `addon/manifest.json` (background scripts only), `scripts/build.py` (allowlist), `tests/build.test.mjs`, `docs/development.md` (file count 18 → 19 only)
- Test: `tests/storage.test.mjs`

**Interfaces:**
- Consumes `AccountPaneGroups` (Task 1), loaded before `background.js` in the same background scope.
- Produces patch shapes accepted by `AccountPaneStorage.copyPatch` and the schema `StatePatch` (all optional, any combination; unknown fields ignored):
  - `selectedAccountId: string|null`, `selectedGroupId: string|null` (setting one non-null clears the other in the stored state),
  - `accountsExpanded: boolean` (legacy → `setGroupExpanded("default", value)`), `groupExpanded: { groupId, expanded }`,
  - `lastFolder: { accountId, uri }` (unchanged),
  - `createGroup: { groupId, name, accountId? }`, `renameGroup: { groupId, name }`, `deleteGroup: { groupId }`, `moveAccount: { accountId, groupId }`, `pruneMembership: { accountIds: string[] }`.
- Order of application inside one patch: prune, create, rename, delete, move, groupExpanded/accountsExpanded, selection, lastFolder.
- `AccountPaneStorage.normalize` = `AccountPaneGroups.normalize` (v2 shape). `createWriter` broadcasts v2 snapshots; `browser.accountPane.start(settings)` receives v2.
- `schema.json`: `Settings.version` max 2; add `selectedGroupId`, `collapsedGroups` (array of string), `defaultGroupName` (string|null), `groups` (array of `{id: string, name: string}`), `membership` (object of strings); keep `accountsExpanded` optional for compatibility; `StatePatch` gets all fields above.

- [ ] **Step 1: Write failing tests** (switch `storageModule` to `loadScripts([groups.js, background.js], "AccountPaneStorage", ...)`; update existing expectations from v1 to v2 shapes):
  - `writer migrates v1 snapshot on first save`: initial v1 `{accountsExpanded:false, selectedAccountId:"a"}` + `save({lastFolder:{accountId:"a",uri:"fixture://a/one"}})` → stored `version:2`, `collapsedGroups:["default"]`, `selectedAccountId:"a"`.
  - `group patches apply serially and broadcast the full snapshot`: `save({createGroup:{groupId:"g-1",name:"Work",accountId:"a"}})`, then `save({renameGroup:{groupId:"g-1",name:"Job"}})`, then `save({moveAccount:{accountId:"b",groupId:"g-1"}})` → `groups:[{id:"g-1",name:"Job"}]`, `membership:{a:"g-1",b:"g-1"}`; each resolved value equals the stored settings.
  - `deleteGroup returns accounts to default and clears its selection`.
  - `selection patches are mutually exclusive`: `save({selectedGroupId:"g-1"})` then `save({selectedAccountId:"a"})` → `selectedGroupId:null`.
  - `legacy accountsExpanded patch toggles the default group`.
  - `pruneMembership drops absent keys and keeps hidden ones`: membership `{a:"g-1", hidden:"g-1", gone:"g-1"}` + `pruneMembership:{accountIds:["a","hidden"]}` → `{a:"g-1", hidden:"g-1"}`.
  - `copyPatch ignores malformed group patches`: `{createGroup:{groupId:7}}`, `{moveAccount:{accountId:""}}`, `{pruneMembership:{accountIds:"a"}}` → `{}`.
  - In `tests/build.test.mjs`: the package contains `lib/groups.js`; manifest background scripts are `["lib/groups.js","background.js"]`; schema `Settings.properties` includes the v2 fields.
- [ ] **Step 2: Run** `node --test tests/storage.test.mjs tests/build.test.mjs` — expected FAIL.
- [ ] **Step 3: Implement** in `background.js`: `normalize` delegates to `AccountPaneGroups.normalize`; `copyPatch` validates each new field (strings non-empty, `name` string, `accountIds` array of non-empty strings); `save` applies via the pure ops in the order above. Update `schema.json`, manifest background scripts, `ALLOWED_FILES` in `scripts/build.py` (+ `lib/groups.js`), and the "18 add-on files" sentence in `docs/development.md` to 19.
- [ ] **Step 4: Run** `node --test tests/*.test.mjs` and `python3 scripts/build.py` — expected all PASS and an XPI listing `lib/groups.js`.
- [ ] **Step 5: Commit** `git commit -am "Persist account groups as settings v2"` (add new files explicitly if any).

---

### Task 3: Tree filter for a set of accounts

Model: Opus.

**Files:**
- Modify: `addon/experiment/tree-filter.js`
- Test: `tests/tree-filter.test.mjs`

**Interfaces:**
- `filter.apply(accountIds: string[] | null)` — `null` = unrestricted (today's `apply(null)`); `[]` is treated as `null`. Callers that pass a single string are migrated in Task 5; keep accepting a string as `[string]` so the controller keeps working between tasks.
- `followTarget(target)` contract changes to `followTarget(accountId | null)` only when the native selection leaves the current set: if every selected row's account is in the set → no call; otherwise, a single account → `apply([id])` then `followTarget(id)`; mixed → `apply(null)` then `followTarget(null)`.
- Rules (spec "Folder-pane filtering"): set of one → identical to today (flatten root in All mode, shorten "both" names, Unified/Tags branches for that account). Set of several → hide rows of non-members, keep account roots unflattened, no name shortening, Unified/Tags virtual parents retained when they contain member rows, `rows` getter returns only member rows. Fail-open unchanged.

- [ ] **Step 1: Write failing tests**, reusing the fixture helpers (`makeTreeFixture(["a","b","c"])`):
  - `a set of two accounts hides only non-members and keeps roots unflattened`.
  - `a set of one account behaves exactly like the former single-id apply` (port one existing single-account assertion set through `apply(["a"])`).
  - `string apply remains a one-account set`.
  - `rows getter returns rows of every member account`.
  - `selection inside the set does not notify; selection of a non-member account follows it; mixed selection fails open to null`.
  - `unified parents keep member rows of several accounts and hide mixed aggregates`.
  - `names are not shortened for a multi-account set`.
- [ ] **Step 2: Run** `node --test tests/tree-filter.test.mjs` — expected FAIL on the new tests.
- [ ] **Step 3: Implement**: replace `selectedAccountId` with `selected: Set|null`; membership test `selected.has(accounts.get(row))`; flattening and `shortenName` only when `selected.size === 1`.
- [ ] **Step 4: Run** `node --test tests/*.test.mjs` — expected all PASS (existing tree-filter tests unchanged except where they call internals).
- [ ] **Step 5: Commit** `git commit -am "Filter the folder pane by a set of accounts"`

---

### Task 4: Account view with group headers

Model: Opus.

**Files:**
- Modify: `addon/experiment/account-view.js`, `addon/experiment/account-pane.css`
- Test: `tests/account-view.test.mjs`

**Interfaces:**
- `AccountPaneView.create({ document, folderPane, labels, cssText, onSelect, onContextMenu, onReorder, onMove, onExpandedChanged })`:
  - `onSelect(selection)` — `{type:"group",id}` or `{type:"account",id}` (no longer a bare id/null).
  - `onContextMenu(target, event, anchor)` — `target` is `{type:"group"|"account", id}`; every header, including the default, now has a menu.
  - `onReorder(movedId, targetId, before)` — unchanged, only for a drop on an account of the same group.
  - `onMove(accountId, groupId, placement)` — `placement` is `null` (drop on header) or `{ targetId, before }` (drop on an account of another group).
  - `onExpandedChanged(groupId, expanded)`.
- Returned API: `render(groups, selection, accountsById)`, `setCollapsed(groupIds: string[])`, `updateCounts(snapshot)` (unchanged shape), `focusGroup(groupId)`, `dispose()`.
  - `groups` is the `AccountPaneGroups.view` output; `accountsById` maps id → account (for icon type); `selection` is what to mark selected (the controller passes `{type:"group",id:"default"}` when unrestricted and the default group holds everything, `null` marks nothing).
- `labels` new keys: `expandGroup`, `collapseGroup` (templates with `{name}`), used for every header when `groups.length > 1`; with only the default group, the default header keeps `expandAccounts`/`collapseAccounts` exactly as today.
- DOM: each header `li[role=treeitem].accountpane-root[aria-level=1][data-accountpane-group=<id>]` (+ class `accountpane-group` for user groups), child `ul[role=group]`; accounts `li.accountpane-child[aria-level=2]`. Empty group: disclosure `hidden`, no `aria-expanded`. Header drop indicator `data-accountpane-drop="into"` (CSS: outline/highlight using existing selection colour variables).
- Keyboard per spec: Up/Down/Home/End over visible rows; Right expands or enters; Left goes to header or collapses; Enter/Space select (empty header: no-op); `contextmenu` event handled for both kinds.
- Counters/star per header: aggregate of its members only while collapsed (today's root rule per group); empty group shows nothing.

- [ ] **Step 1: Write failing tests** (update existing tests for the new callback shapes; existing single-group expectations must otherwise hold):
  - `with only the default group the DOM matches 0.1.13` (same classes, labels, one root, accounts at level 2).
  - `renders user group headers after the default with their accounts and levels`.
  - `clicking a header selects the group and clicking its disclosure toggles only it`.
  - `empty group header focuses without selecting` and has no `aria-expanded`.
  - `keyboard moves across groups, Right/Left expand collapse and climb`.
  - `context menu dispatches group and account targets, including the default header`.
  - `drop on a group header moves without placement`; `drop on an account of another group moves with placement`; `drop inside the same group still reorders`; `drop on own header is ignored`; `dragging a member of a collapsed group is impossible but dropping on a collapsed header works`.
  - `each collapsed header aggregates only its members and shows the star if any member has new mail`.
  - `focusGroup focuses the new header after render`.
  - `disclosure labels name the group when user groups exist`.
- [ ] **Step 2: Run** `node --test tests/account-view.test.mjs` — expected FAIL.
- [ ] **Step 3: Implement**: entries become `{kind:"group"|"account", id, groupId, ...}`; `visibleEntries()` = headers plus children of expanded non-empty groups; generalise `setTabStop`, `onKeyDown`, `dropTarget` (returns `{target, mode:"before"|"after"|"into"}`), `updateCounts`. Keep `createEntry` markup for rows. CSS: level-2 indentation already handled by `.accountpane-child`; add `[data-accountpane-drop="into"]`.
- [ ] **Step 4: Run** `node --test tests/*.test.mjs` — the view tests pass; controller tests may fail on the changed callback/`setExpanded` API — fix *only* the view-facing fakes needed, the controller itself is Task 5. If controller tests fail because of `view.setExpanded`, keep a thin `setExpanded(bool)` alias for the default group until Task 5 removes it.
- [ ] **Step 5: Commit** `git commit -am "Render account groups in the account tree"`

---

### Task 5: Controller selection model and group commands

Model: Opus.

**Files:**
- Modify: `addon/experiment/controller.js`
- Test: `tests/controller.test.mjs`

**Interfaces:**
- `AccountPaneController.create({ adapter, model, groups, filter, view, settings, save, labels })` — `groups` is `AccountPaneGroups`; `labels.allAccounts` is the default label; `settings` is v2.
- Returns `{ select(selection, explicit = true), selectAccount(id) /* = select({type:"account",id}) or select(null) for null, kept for callers */, followFolder(id), setGroupExpanded(groupId, expanded), moveAccount(accountId, groupId, placement), createGroup(name, accountId = null) -> groupId|null, renameGroup(groupId, name), deleteGroup(groupId), groupChoices(accountId) -> [{id, name, current}], groupMenu(groupId) -> { canDelete, openTarget /* folder|null */, name }, updateSettings(snapshot), dispose }`.
- Uses: `adapter.listAccountKeys()` (Task 6; full key list including hidden accounts — until Task 6 exists, tests provide it on the fake), `adapter.reorderAccount` for placement, `filter.apply(groups.memberIds(view, selection))`, `view.render(view, markedSelection, accountsById)`, `view.setCollapsed(settings.collapsedGroups)`.
- Persistence: `save({selectedAccountId})` or `save({selectedGroupId})` on selection change (null/null stored for unrestricted is *not* written as a group: unrestricted saves `{selectedGroupId: null, selectedAccountId: null}`); group commands only save patches, the structure changes on `updateSettings`.
- `createGroup` generates the id with `groups.newGroupId()`, saves `{createGroup:{groupId,name,accountId?}}`, remembers it as `pendingFocus`; the next `updateSettings` render calls `view.focusGroup(id)` once.
- `moveAccount(accountId, groupId, placement)` saves `{moveAccount}`; with placement also calls `adapter.reorderAccount(accountId, placement.targetId, placement.before)`.
- `updateSettings(snapshot)`: replace lastFolders logic as today; replace group state; re-render; `normalizeSelection` the pane's selection; if the open folder is no longer inside the selection, re-target via `groups.groupTarget` (`explicit:false`) like the existing `refresh()` path.
- Startup per spec "Selection rules": open folder account in saved group → group; otherwise that account; no open folder → saved selection restored with `groupTarget`/`resolveTarget`; then `normalizeSelection`.
- `refresh()` (accounts changed) additionally sends `save({pruneMembership:{accountIds: adapter.listAccountKeys()}})` when the full key list changed since the last prune (and once at startup).
- `followFolder(id)`: if the selection is a group containing `id`, keep it; else today's rule (follow to the account; `null` → unrestricted).

- [ ] **Step 1: Write failing tests** (update existing ones from `selectAccount`/`setAccountsExpanded` to the new API where the behaviour is unchanged):
  - `selecting a group filters to its members and displays its first target`.
  - `selecting the default group while unrestricted is the former All Accounts path` (`filter.apply(null)`, saved `{selectedGroupId:null, selectedAccountId:null}`).
  - `following a folder inside the selected group keeps the group; outside selects the account`.
  - `snapshot deleting the selected group falls back to default`.
  - `snapshot moving the open folder's account re-targets inside the group`.
  - `first account entering a user group re-filters a pane showing the default group`.
  - `startup restores a saved group unless the open folder belongs elsewhere`.
  - `createGroup saves the patch and focuses the group after the snapshot`.
  - `moveAccount with placement saves membership and reorders`.
  - `accounts change sends pruneMembership with the full key list` (and not again when unchanged).
  - `groupChoices marks the current group; groupMenu forbids deleting default and reports the open target`.
  - `setGroupExpanded saves groupExpanded and updates the view`.
- [ ] **Step 2: Run** `node --test tests/controller.test.mjs` — expected FAIL.
- [ ] **Step 3: Implement** per Interfaces; remove the temporary view `setExpanded` alias from Task 4 if it was added.
- [ ] **Step 4: Run** `node --test tests/*.test.mjs` — expected all PASS.
- [ ] **Step 5: Commit** `git commit -am "Select and manage account groups in the controller"`

---

### Task 6: Native menus, prompts, tab opening, wiring and locales

Model: Opus.

**Files:**
- Modify: `addon/experiment/thunderbird-adapter.js`, `addon/experiment/implementation.js`, `addon/_locales/en/messages.json`, `addon/_locales/ru/messages.json`, `scripts/build.py` (required keys)
- Test: `tests/thunderbird-adapter.test.mjs`, `tests/experiment.test.mjs`, `tests/build.test.mjs`

**Interfaces:**
- Adapter additions:
  - `listAccountKeys() -> string[]` — every `MailServices.accounts.accounts` key (hidden/deferred/IM included); `[]` on failure *and* a flag so the controller does not prune on failure: return `null` on failure; controller skips pruning on `null`.
  - `showAccountContextMenu(accountId, event, anchor, extra)` — `extra = { label, choices: [{id,name,current}], newGroupLabel, onMove(groupId), onNewGroup() }`; appends `menuseparator` + `menu.accountpane-move-menu` > `menupopup` (radio-like checked current, disabled) + separator + "New Account Group…" to `#folderPaneContext`, removed in the existing `finish()` path (popuphidden / cleanup / dispose).
  - `showGroupContextMenu(event, anchor, items)` — creates (once per adapter) `menupopup#accountpane-group-context` in the 3-pane document with `menuitem`s; `items = { openInNewTab, openInNewWindow, newGroup, rename, delete }`, each `{ label, disabled?, hidden?, onCommand }`; opens like the account menu (screen coordinates for mouse, anchored for keyboard); removed on dispose.
  - `promptGroupName(title, text, initial = "") -> string|null` — `Services.prompt.prompt(window.top ?? window, title, text, value, null, {})`; `null` on cancel or failure.
  - `openFolder(uri, where: "tab"|"window") -> boolean` — tab: `window.top.MsgOpenNewTabForFolders([folder], { background: false })`; window: `window.top.MsgOpenNewWindowForFolder(uri)`; folder via `MailServices.folderLookup.getFolderForURL(uri)`; returns `false` when a helper is missing (the implementation hides the items when `canOpenFolder(where)` is false). Verify the helper names against Thunderbird 140 ESR and 157–158 sources (`mail/base/content/mailCommands.js`, `about3Pane.js` folderPaneContextMenu `openNewTab`/`openNewWindow`) and use the ones the native folder context menu uses.
  - `canOpenFolder(where) -> boolean`.
- `implementation.js`: load `lib/groups.js` before `lib/model.js` consumers; labels add `newAccountGroup`, `renameGroup`, `deleteGroup`, `openInNewTab`, `openInNewWindow`, `moveToGroup`, `newGroupPromptTitle`, `renameGroupPromptTitle`, `groupNamePrompt`, `expandGroup`, `collapseGroup`; wire view callbacks → controller; group context menu items call controller commands (`newGroup` → `promptGroupName` → `createGroup`; `rename` → prompt with current name → `renameGroup`; `delete` → `deleteGroup`; open → `adapter.openFolder(controller.groupMenu(id).openTarget.uri, ...)`); account menu `extra` from `controller.groupChoices(id)`.
- Locale strings (en / ru):
  - `newAccountGroup`: "New Account Group…" / "Новая группа аккаунтов…"
  - `renameGroup`: "Rename…" / "Переименовать…"
  - `deleteGroup`: "Delete" / "Удалить"
  - `openInNewTab`: "Open in New Tab" / "Открыть в новой вкладке"
  - `openInNewWindow`: "Open in New Window" / "Открыть в новом окне"
  - `moveToGroup`: "Move to Group" / "Переместить в группу"
  - `newGroupPromptTitle`: "New Account Group" / "Новая группа аккаунтов"
  - `renameGroupPromptTitle`: "Rename Account Group" / "Переименовать группу аккаунтов"
  - `groupNamePrompt`: "Group name:" / "Название группы:"
  - `expandGroup`: "Expand {name}" / "Развернуть «{name}»"
  - `collapseGroup`: "Collapse {name}" / "Свернуть «{name}»"
- `scripts/build.py`: add these keys to the required set.

- [ ] **Step 1: Write failing tests**:
  - adapter: `account menu adds a Move to Group submenu and removes it on popuphidden`; `choosing a group calls onMove; the current group is disabled`; `group menu is created once, opens at the pointer or anchor, and is removed on dispose`; `promptGroupName returns the text, null on cancel or exception`; `openFolder uses the native tab and window helpers and fails closed when missing`; `listAccountKeys includes hidden accounts and returns null on failure`.
  - experiment: `implementation loads lib/groups.js and passes group labels` (follow the existing experiment test pattern).
  - build: required locale keys include the new keys for `en` and `ru`.
- [ ] **Step 2: Run** the three test files — expected FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** `node --test tests/*.test.mjs` and `python3 scripts/build.py` — expected all PASS, XPI built.
- [ ] **Step 5: Commit** `git commit -am "Add group context menus, Move to Group and tab opening"`

---

### Task 7: Version 0.2.0 and documentation

Model: Sonnet.

**Files:**
- Modify: `addon/manifest.json`, `package.json`, `scripts/build.py` (output name/version validation), `tests/build.test.mjs`, `CHANGELOG.md`, `README.md`, `README.ru.md`, `docs/development.md`

**Interfaces:** none (consumes the finished feature).

- [ ] **Step 1: Update tests** in `tests/build.test.mjs` for version `0.2.0` and output `dist/accountpane-0.2.0.xpi`; run — expected FAIL.
- [ ] **Step 2: Bump** version to `0.2.0` everywhere the builder validates it.
- [ ] **Step 3: Docs**:
  - `CHANGELOG.md` `## 0.2.0`: account groups (default group = All Accounts, user groups, group selection filters folders, collapsed-header counters/star, New/Rename/Delete, Open in New Tab/Window, Move to Group submenu and drag onto a header or between groups, settings migrate automatically to v2; Search Messages/Settings intentionally not offered for groups).
  - `README.md` features list + a short `### Account groups` section under Usage (how to create, move by drag/menu, delete returns accounts to All Accounts, selecting a group, keyboard: context-menu key on a row); `README.ru.md` mirrors it in Russian.
  - `docs/development.md`: "Permissions and local data" lists group names, order, membership and collapsed state; note `lib/groups.js` shared by background and experiment; filtering section mentions account sets (several accounts keep their roots).
- [ ] **Step 4: Run** `node --test tests/*.test.mjs` and `python3 scripts/build.py` — expected all PASS, `dist/accountpane-0.2.0.xpi` with SHA-256 printed.
- [ ] **Step 5: Commit** `git commit -am "Release notes and docs for account groups (0.2.0)"`

---

### After the tasks (orchestrator, not subagents)

- Whole-branch review (Fable 5.1) against the spec and Review Focus. Per-task reviews also use Fable 5.1.
- Copy the XPI to `~/tmp/accountpane-0.2.0.xpi`, give the user the native macOS checklist (spec "Testing" → Native), record results in `docs/testing.md`.
- Optional Windows 11 VM keyboard pass via the harness in `.worktrees/accountpane-v1/build/HANDOFF.md`.
- Push the branch and open a PR to `main` (no merge/tag/release/upload).
