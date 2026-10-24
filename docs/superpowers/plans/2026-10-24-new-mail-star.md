# New-mail star on account rows — implementation plan

**Goal:** show Thunderbird's "new messages" star on an AccountPane account row when any non-junk folder of that account has new messages; on All Accounts only while collapsed and some account has the star.

**Spec (agreed in chat, 2026-10-24):**
- Source of truth: `nsIMsgFolder.hasNewMessages` per folder. Walk the account's folder tree like `junkBranches()` does: skip Virtual folders, skip Junk-flagged branches entirely, stop at the first folder with new messages.
- Updates: the existing `onMessageCountsChanged` path plus the folder-listener int properties `NewMessages` and `BiffState` (Thunderbird itself reacts to both, see about3Pane.js `onFolderIntPropertyChanged`).
- Look: same as native folder rows (about3Pane.css ~500–545, ~595–615): the `--icon-sparkle-star-xs` sparkle overlaid on the icon (`fill: var(--color-yellow-30); stroke: var(--color-amber-50)`), name bold and `color: var(--new-folder-color)`. Fallbacks when the variables are missing: `gold`/`darkgoldenrod` and `currentColor`.
- All Accounts: star only when collapsed and any visible account has it; nothing when expanded.
- Accessibility: append the localized label `newMessages` ("new messages" / "есть новые письма") to the row's aria-label and title.
- Version 0.1.10; CHANGELOG entry; README feature bullet "A star marks accounts with new messages, like Thunderbird's folders."

## Task 1: adapter
- `thunderbird-adapter.js` `messageCounts()`: each account entry gains `hasNew: boolean` (false on any error). Share the tree walk with `junkBranches` (refactor into one visitor that returns `{ junk: [...], hasNew }`).
- The `intPropertyChanged` listener also notifies on `"NewMessages"` and `"BiffState"`.
- Tests in `tests/thunderbird-adapter.test.mjs` with the existing fixture style: hasNew true when a nested folder has new messages; false when only a Junk branch or a Virtual folder has them; false when the folder throws; `onMessageCountsChanged` fires on `NewMessages` and `BiffState`.

## Task 2: view, CSS, locales, build validation
- `account-view.js` `updateCounts()`: toggle class `accountpane-new-messages` on `entry.option` for accounts with `hasNew`; for the root entry only when `!expanded` and some account has it; add the `newMessages` label to aria-label/title parts.
- `account-pane.css`: star overlay on `.accountpane-new-messages > .accountpane-row .accountpane-icon` (an `::after`-style element is not possible on `<svg>`; add a `<span class="accountpane-new-star">` after the icon in `createEntry`, hidden by default, shown by the class), name bold + `--new-folder-color`.
- `_locales/en|ru/messages.json`: `newMessages`. `scripts/build.py`: add `newMessages` to the required message keys.
- Tests in `tests/account-view.test.mjs`: class present/absent per account; root class only when collapsed; label text in aria-label. `tests/build.test.mjs` unchanged unless the key list is asserted.

## Task 3: version and docs
- 0.1.10 in `addon/manifest.json`, `package.json`, `scripts/build.py` (two places), `tests/build.test.mjs`; CHANGELOG `## 0.1.10`; README.md/README.ru.md feature bullet; `docs/testing.md` placeholder for the native check.
- `node --test tests/*.test.mjs` green; `python3 scripts/build.py` twice, identical SHA-256.

## Native check (user, macOS working profile)
Install 0.1.10 over 0.1.9; receive mail → star on the account cloud; open the folder → star gone; collapse All Accounts with a starred account → star on All Accounts.
