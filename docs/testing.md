# AccountPane testing journal: 0.1.0–0.2.3
**Current candidate 0.2.3 (account groups; 0.2.1–0.2.3 adjust the "Move to Group" indent, empty-group alignment and row height): 265/265 automated tests pass; the XPI is reproducible.
Native check: the maintainer's working profile on macOS, Thunderbird 158.0.1, a keyboard-only
pass on Thunderbird 140.17 ESR and Betterbird 140.13 in the Windows 11 VM, and Thunderbird 158.0.1
and 153.5.1 ESR on Ubuntu 26.04 aarch64 (see 0.2.0 below).**

## 0.2.3: layout fixes (2026-10-26)

Both checked by the maintainer on macOS, Thunderbird 158.0.1, with test builds before merging. An empty group's header now keeps the expand arrow's slot through a placeholder attribute instead of `[hidden]`; it had moved left of the other headers. Account rows and group headers now take their height from the native folder rows, where group headers had been about 36 px against 26 px. Not checked natively on Windows or Linux.

## 0.2.0: account groups (2026-10-26)

Build: `dist/accountpane-0.2.0.xpi`, SHA-256
`37a79c37326b78e6cf2c6a98afa3008ae0ab5557fadcb08b74c5a6942de73273`, installed by the maintainer
with Install Add-on From File… over 0.1.13 in their working macOS profile (Thunderbird 158.0.1),
followed by a restart. The maintainer ran the checklist below and reported that every item works;
these are the maintainer's observations, not automated captures.

1. Upgrade from 0.1.13: same account list, selection and collapsed state; All Accounts still
   shows the full folder tree while no account is in a user group.
2. New Account Group… from the header menu creates an empty, focused (not selected) group.
3. Drag onto a group header moves the account; drag between accounts of another group moves
   and positions it; drag inside a group still reorders accounts.
4. Account menu → Move to Group moves the account; the current group is checked and disabled.
5. Selecting a group with several accounts shows their folders under their account rows; a
   one-account group behaves like a selected account; All Accounts then shows only its members.
6. A collapsed group shows its members' counters (Spam excluded) and the new-mail star.
7. Rename… and Delete work; Delete is disabled for All Accounts; an empty name restores the
   default name.
8. Open in New Tab / Open in New Window open the group's Inbox, following the background-tab
   preference and Shift like the native folder menu.
9. Groups, membership and collapsed state survive a restart and are shared between windows.
10. Keyboard: arrows move between headers and accounts, Left/Right collapse/expand, Enter
    selects, the context menu opens from the keyboard.
11. Optional VoiceOver spot check of the header semantics (part of the reported checklist).

Not checked natively for 0.2.0: Windows keyboard-only pass, Thunderbird 140 ESR / Betterbird 140
(the Open in New Tab/Window helpers are feature-detected and hidden when missing), adding or
removing a real account while groups exist (covered by automated tests only).

### Thunderbird 140 ESR and Betterbird 140, keyboard only (2026-10-26)

Same Windows 11 VM and fictional profiles as the 0.1.13 check (three offline POP3 accounts and
Local Folders), both with 0.1.13 installed and v1 settings. The 0.2.0 XPI above (same SHA-256)
replaced the installed file with Thunderbird closed. Control through `prlctl send-key-event`
(Shift+F10 for context menus); captures outside Git in `dist/groups-20261026/`.

Harness note: replacing the XPI on disk updates the add-on record but Thunderbird kept running
the cached 0.1.13 Experiment scripts until the profile's `startupCache` was removed. An update
through the Add-ons Manager or the catalogue invalidates that cache itself (`onShutdown`).

| Scenario | TB 140.17 ESR | Betterbird 140.13 |
| --- | --- | --- |
| 0.2.0 active after upgrade; v1 selection kept, full tree under All Accounts | pass | pass |
| Group header menu (Shift+F10): Open in New Tab/Window present, Delete disabled for All Accounts | pass | pass |
| New Account Group… prompt creates an empty, focused, unselected group | pass | pass |
| Account menu → Move to Group submenu (current group checked/disabled) moves the account | pass | pass |
| Selecting a two-account group shows both account roots and opens the first Inbox | pass | not run |
| Selecting a one-account group behaves like the selected account | not run | pass |
| All Accounts then shows only its own accounts' folders | pass | pass |
| Collapsed group header shows the members' unread sum | not run (no unread in members) | pass |
| Open in New Tab opens the group's Inbox in a foreground tab; groups shared with the new tab | pass | not run |
| Rename… prefills the current name and renames | pass | not run |
| Restart keeps groups, membership, collapsed state and selection | pass | not run |
| Delete returns the accounts to All Accounts and restores the full tree | pass | pass |
| Keyboard: Home/End/Up/Down across groups, Left/Right collapse/expand, Enter selects | pass | pass |

Not checked on Windows: drag and drop (no pointer in the harness), Open in New Window, screen
readers. Cosmetic: in the native account menu the added "Move to Group" label was not indented
like the native items. Cause: the native items are `menuitem-iconic`, and on Windows only an
iconic item keeps its (empty) icon slot. Fixed after 0.2.0 by giving the submenu the
`menu-iconic` class (0.2.1); checked on Thunderbird 140.17 ESR (label aligned with the native items).
0.2.1 regressed Linux (see the Linux section below); 0.2.2 sets the class on Windows only
(`Services.appinfo.OS === "WINNT"`). The 0.2.2 code (commit `447e1cd`) was checked on Thunderbird
140.17 ESR on Windows (still aligned) and on Thunderbird 158.0.1 on Ubuntu (aligned, no icon box).

### Linux: Ubuntu 26.04 aarch64, Thunderbird 158.0.1 and 153.5.1 ESR (2026-10-26)

First native check on Linux. Parallels VM "Ubuntu ARM64": Ubuntu 26.04.1 LTS, kernel
7.0.0-38-generic (aarch64), GNOME Shell 50.1 on Wayland, US keyboard layout, screen set to
1440×900 for the check. Captures outside Git in `dist/linux-20261026/`.

Builds. archive.mozilla.org has no Linux aarch64 build of Thunderbird (only `linux-x86_64` and
`linux-i686` for 140.17.0esr and 158.0.1), and ESR 140 is no longer offered for arm64 at all.
The arm64 builds came from Mozilla's Snap Store package `thunderbird` (snap-id
`k1Ml1O9GzSO2QftV0ZlWSbUfQ78nN460`), fetched without root with `snap download`:

- `latest/stable`, revision 1300: Thunderbird 158.0.1, BuildID 20261020100829, source stamp
  `fa5eda18cb048269b5c9d60db4f2f191d01aefb1`.
- `esr/stable`, revision 1302: Thunderbird 153.5.1 ESR, BuildID 20261020172110, source stamp
  `2408af54fc4638c52914af99e9085aa291af0410`.

Each `.snap` matches the `snap-sha3-384` in the store's `snap-revision` assertion downloaded
with it (`Mb-S4uI9…DcyO` and `ibyN9EOE…uVzz`); the assertion signatures were not verified,
because `snap ack` needs root. The snaps were not installed: they were unpacked with
`unsquashfs` (from `apt download squashfs-tools`) into a user folder and started directly
(`thunderbird-bin -no-remote -profile …`, `LD_LIBRARY_PATH` set to the bundled library folder).
That runs the same Gecko build without snap confinement and without the snap launcher. Updates
are disabled by the build's own `distribution/policies.json` (`DisableAppUpdate`).

Profiles. One disposable profile per build, generated from scratch: three POP3 accounts (Alpha
Studio, Beta Home, Gamma Club) and Local Folders, fictional mbox messages, `.invalid` addresses.
Alpha and Beta point at unresolvable `.invalid` hosts and never fetch mail. Gamma points at a
throwaway POP3 server on 127.0.0.1 inside the VM that serves fictional `.eml` files and accepts
any password, so the new-mail star could be triggered without any network. No real mail or
credentials. The 0.2.0 XPI from the GitHub release (`gh release download v0.2.0`, SHA-256
`37a79c37326b78e6cf2c6a98afa3008ae0ab5557fadcb08b74c5a6942de73273`, same as above) was installed
in each profile through the Add-ons Manager (gear, Install Add-on From File…, GTK file chooser,
Add, with the usual Experiment "full, unrestricted access" prompt), followed by a restart.

Control: keyboard through `prlctl send-key-event` (Shift+F10 for context menus) and, for drag
and drop and right-clicks, the macOS pointer on the Parallels window. Background clicks don't
reach the VM; the pointer works only while Parallels is frontmost.

| Scenario | TB 158.0.1 | TB 153.5.1 ESR |
| --- | --- | --- |
| Install from file and restart; Accounts list above the folder tree (All Accounts, 3 accounts, Local Folders) | pass | pass |
| Selecting an account filters the tree and opens its Inbox; counter on the account row | pass | pass |
| All Accounts restores the full tree and keeps the open folder | pass | pass |
| Header menu: Open in New Tab/Window, New Account Group…, Rename…, Delete disabled for All Accounts | pass | pass |
| New Account Group… creates an empty, focused, unselected group | pass | pass |
| Account menu → Move to Group (current group checked and disabled) moves the account | pass | pass |
| "Move to Group" label aligned with the native account menu items | pass (no icon column on GTK) | pass |
| Selecting a two-account group shows both account roots and opens the first Inbox | pass | pass |
| Selecting a one-account group behaves like the selected account | pass | not run |
| Collapsed group shows the members' unread sum | pass | not run |
| New-mail star on the account row and on the collapsed group (mail from the loopback server) | pass | not run |
| Rename… prefills the name; an empty name restores "All Accounts" and leaves a user group's name unchanged | pass | not run |
| Open in New Tab: group's first Inbox in a foreground tab, groups present there | pass | not run |
| Open in New Window: group's first Inbox, groups shared with the new window | pass | not run |
| Restart keeps groups, membership, collapsed state and the selected group | pass | pass |
| Delete returns the accounts to All Accounts; deleting the last user group restores the full tree | pass | pass |
| Keyboard: Up/Down/Home/End across headers and accounts, Left/Right collapse/expand, Enter selects | pass | pass |
| Pointer: click selects a group, right-click opens the group menu | pass | not run |
| Drag onto a group header (collapsed or empty group) moves the account | pass | not run |
| Drag between accounts of another group moves and positions it (insertion line shown) | pass | not run |
| Drag inside a group reorders; the folder tree follows the new order, the open Inbox stays open | pass | not run |

Observations:

- The new-mail star disappeared from the AccountPane rows and from the native folder row at the
  same time after a second window was opened. Thunderbird cleared the folder's new-mail state;
  AccountPane only followed it.
- One drag that moved Alpha Studio into the selected group at a position (which also reorders
  the native accounts) left Thunderbird showing the Beta Home account page instead of its
  Inbox. The Inbox was open but hidden inside Beta Home's collapsed folder root at that moment,
  and Thunderbird rebuilt its folder tree after the reorder. With the root expanded, the
  in-group reorder kept the Inbox open. Not investigated further; possibly native behaviour.
- Harness: the generated `user.js` re-applies the account list on every start, so it was moved
  aside after the first start (otherwise the dragged account order is reset). Restart
  persistence was checked after Ctrl+Q; a SIGTERM stop lost Thunderbird's session state.
- PR #7 (`menu-iconic` on the Move to Group submenu, the Windows indent fix): its build
  (head `26ad197`, XPI SHA-256 `67a0367744385568f949202b0389dd2e138fb8de04977f40fc4586e3e0af9adf`)
  was tried on 158.0.1 here by replacing the installed XPI with Thunderbird closed and removing
  `startupCache`. On GTK the class adds an empty checkbox-like icon box in front of "Move to
  Group" and pushes its label to the right of the native labels, so that fix regresses Linux as
  written. With 0.2.0 the label is already aligned on Linux. The profile went back to the 0.2.0
  release XPI afterwards. The Windows-only variant released as 0.2.2 (commit `447e1cd`) was then
  checked here on 158.0.1: the label is aligned with the native items, without an icon box.

Not checked on Linux: Thunderbird 140 ESR (no arm64 build), x86_64 builds, the snap or Flatpak
package as installed and confined, Betterbird, X11 sessions, dark or high-contrast themes, HiDPI
scaling, screen readers (Orca), Spam exclusion from the counters (no Junk folder in the fictional
accounts), the Shift and background-tab variants of Open in New Tab, adding or removing a real
account while groups exist, and on 153.5.1 ESR the rows marked "not run".

## 0.1.13: Thunderbird 140 ESR and Betterbird 140 (2026-10-24)

Setup (Windows 11 VM, Parallels, ARM with x64 emulation, keyboard-only control through
`prlctl send-key-event`, captures through `prlctl capture`, kept outside Git in
`dist/esr-20261024/`):

- Thunderbird 140.17.0esr (x64, en-US) from archive.mozilla.org; SHA-256
  `ff6eac0375eecc6f44529ee48cf2a399d8aff6d24cb7220c82bb041d4472c367` matches the published
  `SHA256SUMS`. Silent install to its own folder next to Thunderbird 158.
- Betterbird 140.13.0esr-bb25 (x64, en-US) from betterbird.eu; SHA-256
  `a4ca8357cd461af56800da33710261126fe5ad73989f701193589c1d51c0a712` matches the published
  `sha256-140.txt`. Silent install to its own folder.
- Each got its own disposable copy of the fictional test profile (three offline POP3
  accounts and Local Folders, fictional messages), without the previously installed
  add-ons, started with `-no-remote -allow-downgrade -profile`. Updates disabled by policy.
- Add-ons installed through the Add-ons Manager: gear, Install Add-on From File…, Add.
  Both builds were accepted with `strict_min_version` 140.0 and showed the usual Experiment
  "full, unrestricted access" prompt.

Finding and fix:

- With 0.1.12 code (only the minimum lowered), selecting an account filtered the folder
  tree correctly but opened the account's start page (Account Central) instead of its
  Inbox. Cause: ESR 140 has no `nsIMsgFolder.localizedName` (the adapter filtered every
  child folder out) and no `FolderUtils.compareFolders` (sorting threw). Both were checked in
  the comm-esr140 sources. 0.1.13 falls back to `name` and to the ESR 140 folder-pane order;
  a new automated test models ESR 140 folders.
- Experiment code is cached: after reinstalling, Thunderbird had to be restarted before
  the new adapter ran (as with the theme stylesheet).

Results with the fixed build (code identical to 0.1.13; only the version string differed),
same scenarios on Thunderbird 140.17.0esr and Betterbird 140.13.0esr-bb25:

| Scenario | TB 140 ESR | Betterbird 140 |
|---|---|---|
| Account list above the folder tree (All Accounts, 3 accounts, Local Folders) | pass | pass |
| Selecting an account filters the tree and opens its Inbox | pass | pass |
| All Accounts restores the full tree and keeps the open folder | pass | pass |
| Unread counter on the account row updates live (messages marked unread with M) | pass | pass |
| Collapse with Left shows the combined counter; Right expands | pass | pass |
| Shift+F10 on an account opens the native account context menu | pass | pass (includes Betterbird's own "Reset Folder Order") |
| Keyboard: Tab to the list, Up/Down, Enter, Left/Right | pass | pass |
| Initial selection follows the open folder (Local Folders at first start) | not observed | pass |

Same as 158 on Windows (0.1.9 check below), apart from Betterbird's defaults (table view,
classic layout, unread/total in the status bar), which AccountPane does not change.

Not covered: the new-mail star (the offline test accounts receive no mail), drag ordering,
restart persistence of the selected account, total counters (not enabled), and versions
141–156, which the manifest allows but which were not tested.

## 0.1.10: new-mail star

- Changed: the adapter reports per-account new mail (`hasNew`) outside Junk and
  Virtual folders; the view shows Thunderbird's new-mail star on account rows,
  and on collapsed All Accounts when any account has it.
- All automated tests pass (194/194).
- Two builds are byte-identical, SHA-256 `1e29d848edfdd65399cc67b1d3bc1bf1928709b345478754c033a4cbe381c8aa` (after the listener and star-placement fixes).
  (`dist/accountpane-0.1.10.xpi`).
- Native check (user, macOS 27, Thunderbird 158.0, working profile, 2026-10-24): installed
  over 0.1.9; the star appears on the account cloud at the top-left corner like native
  folders (a first build placed it top-right; fixed by inserting the star element before
  the icon). The install prompt shows the usual Experiment "full, unrestricted access"
  text, as documented in the README.


## 0.1.9: forward-compatible manifest policy

Checked on 2026-10-19:

- `strict_min_version` remains `157.0`; `strict_max_version` is now `*`.
- The installed Thunderbird 158 schema accepts a string maximum; its
  XPIDatabase compatibility path uses the native version comparator and an
  unbounded wildcard default. No global compatibility preferences were changed.
- All 186 automated tests pass, including packaged bounds and rejection of an
  accidentally restored finite maximum or the incompatible platform minimum.
  These tests do not simulate or certify future Thunderbird internal APIs.
- Two builds are byte-identical. All 18 unique archive entries pass CRC checks
  and match the source bytes.
- Artifact: `dist/accountpane-0.1.9.xpi`, 30,884 bytes.
- SHA-256: `dd93c18756d8211226ba54c4f78c6c0cf3b0113873fb8749c3c149349315032a`.
- Add-on-directory review policy is separate from local XPI compatibility.

Native install on 2026-10-19 (Thunderbird 158.0, macOS, working profile):

- Before the update, the profile held 0.1.8 (byte-identical to
  `dist/accountpane-0.1.8.xpi`), installed earlier the same day and active. The
  0.1.8 account list was observed rendering above the folder tree during the
  day, so the theme-neutral stylesheet and the new icon had already run natively
  on 0.1.8; 0.1.9 differs from 0.1.8 only in the manifest version and maximum.
- A scoped backup of the 0.1.8 package and add-on/session/UI metadata was taken
  first (`AccountPane-backups/20261019-before-019-update`, 8 files with an
  SHA-256 inventory, no mail or credentials).
- The install used the standard Add-ons Manager "Install Add-on From File…"
  flow over the same extension ID, without removing the previous version. The
  automation reached the file dialog and then stopped because the dialog and
  the Add-ons Manager tab disappeared while the window was being used; the
  remaining file-dialog and confirmation steps were completed outside the
  automation. The confirmation prompt text was therefore not captured.
- Result verified on disk: the profile XPI is byte-identical to
  `dist/accountpane-0.1.9.xpi` (SHA-256 above); `extensions.json` lists
  version 0.1.9, active, not disabled, target range 157.0–`*`, and the
  permission set unchanged (`storage` only). No restart was needed.
- Read-only UI check after the update: the account list is rendered above the
  folder tree with the same accounts and counters as before, the previously
  selected folder and message stay selected, and the mail tab remains active.
  Accounts, folders and messages were not clicked.
- Not observed natively for 0.1.9: the version string in the Add-ons Manager
  UI (confirmed from `extensions.json` only), the icon as rendered in the
  manager row, account switching, drag ordering and restart persistence.
  Runtime evidence remains limited to Thunderbird 157–158 on macOS; future
  versions are permitted by the manifest, not tested.

Native UI check later on 2026-10-19 (same profile, read-only, via accessibility
tooling): the Add-ons Manager details page for AccountPane shows Version 0.1.9
and Last Updated October 19, 2026; the extension is enabled, and the list row
shows the new account-over-folders icon. Selecting one account in the AccountPane
list filtered the folder tree to that account and opened its Inbox; selecting
All Accounts restored the full multi-account tree and kept the current folder
selected; selecting the original account again returned to its Inbox and the
message pane showed the same message as before. No messages were clicked and no
read states were changed. The user had changed the selected account between the
first and second look, so the baseline for restoring was the state seen after
that change. Drag ordering and restart persistence were still not observed.

## 0.1.9 on Windows 11 (Thunderbird 158.0, x64 build under ARM emulation)

Checked on 2026-10-20 in a Parallels Desktop virtual machine with a disposable
profile and fictional offline POP3 accounts (no network, no real mail). The
Thunderbird 158.0 Windows x64 installer was downloaded from Mozilla's CDN and
verified against the published SHA-256 before a silent install. The XPI was
sideloaded into the profile's `extensions` folder with
`extensions.autoDisableScopes = 0`; the UI was driven by keyboard only
(scancodes through `prlctl send-key-event`) with full-screen captures through
`prlctl capture`, so mouse-only behaviour such as drag ordering was not
covered.

- First start: the "Accounts" list appears above the folder tree with All
  Accounts, the three fictional accounts and Local Folders; the folder tree is
  filtered to the first account. The only first-run dialog was Thunderbird's
  default-client integration prompt (dismissed).
- `extensions.json` lists AccountPane 0.1.9, active, not disabled; the
  Add-ons Manager shows it enabled with the icon (the version string is on the
  detail page, which was not opened).
- Keyboard: Tab reaches the account tree, Up/Down move focus, Enter selects.
  Selecting an account filters the folder tree to that account and opens its
  Inbox; selecting All Accounts restores the full tree and keeps the open
  folder. Unread counters update live as messages are read.
- Collapsing All Accounts with Left shows the combined unread counter;
  Right expands it again. Shift+F10 on an account opens Thunderbird's native
  account context menu.
- "Next unread" (N) moving into another account's Inbox switched the
  AccountPane selection to that account.
- The Junk folder of the fictional account was flagged by Thunderbird (Spam
  icon) and listed under the account. Its exclusion from the counters was not
  measured here because the folder database had not been built yet.
- Not covered: drag ordering, restart persistence of the selected account,
  installing through "Install Add-on From File…", Thunderbird's Light theme
  (the VM runs Windows in dark mode with "System theme — auto").

## 0.1.8: public-facing documentation, icon and theme-neutral styles

Checked on 2026-10-19:

- All 186 automated tests pass.
- Two consecutive builds are byte-identical; 18 unique ZIP entries pass CRC
  validation and match their allowlisted source files.
- Artifact: `dist/accountpane-0.1.8.xpi`, 30,886 bytes.
- SHA-256: `745a9d31057e5149d484c8e22ef40c16222841a329e9a0fd16a9f1e269142420`.
- The extension stylesheet no longer references Postbird's private CSS variables.
  It uses native Thunderbird variables and inherited typography.
- Browser previews render the actual account view and stylesheet with fictional
  data. Light/dark selection, counts, heading typography, theme-token changes and
  fallbacks without theme tokens were checked; the panels do not overflow.
  Mock folder rows and browser rendering do not establish native Thunderbird
  compatibility for every theme or platform.
- SVG artwork and PNG sizes 16/32/48/64/128 were inspected. Account and folder
  glyphs are centered inside their two panel sections.
- English/Russian user guides, local documentation links and fictional preview
  data were reviewed. A targeted scan of current tracked files and reachable Git
  history found no known private profile paths, personal mail addresses or key
  markers; this is not a comprehensive security audit.
- A scoped backup of the installed 0.1.7 package and add-on/UI metadata was verified.
  Native update attempts were rejected as stale while the user changed the working
  Thunderbird window. No install, restart, theme change or mail selection was made.
  Read-only verification confirmed that the original 0.1.7 package remained active
  at that time. Later on 2026-10-19 the 0.1.8 package was installed over 0.1.7
  outside the automation and ran actively until it was replaced by 0.1.9 the
  same evening (see the 0.1.9 native note).

**Исторический статус 0.1.0: beta-приёмка пройдена для описанной целевой
конфигурации и ограниченного набора сценариев.**
AccountPane 0.1.0 включён в тестовом и исходном рабочем профилях. Рабочий профиль
остаётся текущим и выбранным по умолчанию; сообщение не открывали и не выбирали.
Дата записи: 2026-10-13. Цель — Thunderbird 157.0.1 на macOS Apple Silicon.
Статическое чтение установленного приложения подтвердило эту версию и нужные
внутренние API. Диапазон манифеста платформы 157.0–157.* не является проверкой всех версий.

## Исторические проверки 0.1.0 и 0.1.1

| Проверка | Результат |
| --- | --- |
| Регрессии трёх финальных исправлений до изменения продукта | RED: 5 ожидаемых отказов, 49 PASS |
| Покрывающий прогон после исправлений | PASS: 54/54, 0 ошибок, 0 пропусков |
| Полный автоматический прогон текущего исходника | PASS: 135/135, 0 ошибок, 0 пропусков |
| Синтаксис addon/test JS/MJS и Python-сборщика | PASS: JS/MJS проверены пофайлово, Python через ast.parse |
| Сборка финальных исходников | PASS |
| Воспроизводимость неизменной сборки | PASS в автоматическом тесте сборщика |
| Состав XPI и CRC | PASS: 13 разрешённых файлов, без повреждений |
| Загрузка Experiment и Accounts списка в Thunderbird | PASS: список появился над штатным деревом |
| Выбор A/B/All/Local и Accounts-панели ArrowUp/Return | PASS в тестовом профиле |
| Home/End/PageUp/PageDown в штатном дереве с выбранным A | PASS: клавиши оставались в папках A; B и Local отсутствовали |
| Чистая установка после отсутствия старой записи/пакета; циклы, перезапуск и повторная установка | PASS: список загрузился, текущая папка Sub сохранилась |
| Рабочая установка XPI в целевом профиле | PASS: один Accounts список, прежние аккаунт и папка; статус активен |
| Возврат текущего/стандартного профиля и проверка без открытия сообщения | PASS: исходный профиль current/default=yes; ноль выбранных строк сообщений |
| Conversations и пользовательские CSS после установки | PASS: Conversations активен, CSS-хеши не изменились |
| Archive history, вложенные папки, избранные без строк и мультивыбор | PASS для проверенных случаев |
| Один искусственный черновик перемещён мышью и две независимые почтовые вкладки | PASS |
| Штатное удаление и последующая чистая повторная установка AccountPane | PASS: дерево восстановлено; кандидат снова установлен и включён |
| Same-ID обновление 0.1.0 → 0.1.1 на месте | PASS; визуальный результат описан ниже |
| Unified/All переключение, независимость отдельного окна, прочая приёмка | INCONCLUSIVE/не запускалось; детали ниже |
| Рабочий профиль | Beta 0.1.0 установлена и активна; проверена только исходная текущая папка/аккаунт |

Автоматические проверки выполнены для исходников коммита
`7ab0af21753ee49ef016087074fe07433013b350`. Полный тестовый прогон,
проверки синтаксиса, сборка и независимая проверка XPI выполнены отдельным
исполнителем. После этих документационных изменений тесты и сборка не повторялись.

```sh
# Из корня репозитория; Node.js 24 и Python 3, без npm и зависимостей.
node --test tests/*.test.mjs
python3 scripts/build.py
```

Кандидат 0.1.0 до исправления высоты списка: `dist/accountpane-0.1.0.xpi`,
16 234 байта,
ID `accountpane@stupalov.github.io`, версия 0.1.0.
SHA-256: `ac933c01d821b48b1d7766cc0fbbfba8d186da4219367468d33f9804f3d48598`.
Исходники кандидата: коммит `7ab0af21753ee49ef016087074fe07433013b350`.
Сборщик включает только 13 перечисленных файлов addon, проверяет JSON/ссылки
манифеста и отклоняет символьные ссылки; профили, письма, тесты, docs и Git исключены.

## История нативной проверки

2026-10-07 штатный Install Add-on From File отклонил раннюю сборку до запроса
полного доступа; дополнение не установлено. Её исходники:
`791d1f853ec8f7af5c0fca985e5689d4cf9ba968`, версия 0.1.0, размер 15 768 байт,
SHA-256 `f3a20373da654bb08360c6c69d26449600fd8dd80891010778ebe091a0283103`.
Исходный текущий профиль и профиль по умолчанию затем возвращены.

Установленный Thunderbird имеет AppVersion 157.0.1 и платформу Milestone 157.0.
`XPIInstall.sys.mjs` назначает `TOOLKIT_ID`, а `XPIDatabase.sys.mjs` проверяет
совместимость по `aPlatformVersion`: минимум 157.0.1 отвергает платформу 157.0.
Исправленная сборка и проверка сборщика используют минимум 157.0, максимум 157.*.
Защитные preferences не изменялись.

2026-10-13 кандидат размером 16 202 байта, SHA-256
`98126436f06b4de6abc23267c59953d5562ba2140d4507427414b8e042eb8b85`,
собранный из коммита `d7b01406093b2ecdec723bc85d74d2691a83166e`, был установлен
в подготовленный тестовый профиль. Пользователь принял показанный Thunderbird
запрос полного, неограниченного доступа. Менеджер дополнений сообщил об успешном
добавлении AccountPane 0.1.0, но при открытии почтовой панели список аккаунтов
не появился. В консоли были только фиксированные коды `ACCOUNTPANE_START_FAILED`
в `implementation.js` и `background.js`; первопричина отображена не была.
Приёмка этого кандидата не пройдена.

Кандидат 0.1.0 размером 16 234 байта, SHA-256
`ac933c01d821b48b1d7766cc0fbbfba8d186da4219367468d33f9804f3d48598`, из коммита
`7ab0af21753ee49ef016087074fe07433013b350` включает исправление загрузки шести
фиксированных ресурсов собственного XPI в изолированную область помощников.
Загрузка прошла в подготовленном тестовом профиле: список Accounts появился над
штатным деревом. При установке кандидат запросил прежний полный доступ, который
был принят по существующему согласию. Выбор fixture A/B, «Все аккаунты», «Локальные
папки» и клавиатурный выбор ArrowUp/Return прошли. Простые команды штатного дерева
Right/Down/Left переключали папки Archive/Inbox и раскрывали/сворачивали ветку. В режиме только
избранных аккаунт без избранных строк вернулся к «Все аккаунты», сохранив текущую
Archive и activeModes AllFolders=0/Favorites=1; после снятия Unified выбор A
активировал только A. При создании
UI-папки MultiRefresh сохранилось выделение Archive и Sub.

История Archive прошла сценарий с Archive открытой при подключении: отключение,
выбор штатной папки, повторное включение и переход B → A вернули Archive.
Один искусственный черновик перетащили из Drafts в Archive ровно один раз:
количество изменилось 1→0 и 0→1. Две почтовые вкладки
сохраняли независимый выбор: в первой был B Inbox, во второй — A Sub. Отдельное
окно создано, но независимость его аккаунтов не проверена.

В первом same-ID сценарии старый экземпляр удалили через менеджер дополнений и сразу
установили новый. После закрытия вкладки менеджера и последующего перезапуска запись
дополнения пропала. Возможное объяснение — устаревшее состояние
`pending-uninstall` в обёртке нативного менеджера дополнений; причина не подтверждена,
и этот результат сам по себе не доказывает дефект продукта. Обновление существующей
установки на месте не проверено.

Позднее, когда прежняя запись и пакет уже отсутствовали, XPI установили начисто,
без предварительного Remove. Два цикла выключения/включения и перезапуск сохранили
запись и Accounts список. Затем штатное удаление с закрытием менеджера восстановило
полное дерево и удалило запись/пакет; последующая чистая установка прошла. Кандидат
оставался включён, Accounts загрузился, текущая папка Sub сохранилась. В отдельной
проверке Home/End/PageUp/PageDown при выбранном A оставались внутри A: Home/PageUp
показывали центральную папку A, End/PageDown — Trash A; B и Local не отображались.
Это подтверждает чистые install/remove/install циклы, но не обновление same-ID
установки на месте.

Отдельный цикл Folder Mode All/Unified/All оказался INCONCLUSIVE: при проверке
переключение окна/меню не позволило подтвердить активный режим. Это не считается
ошибкой продукта. После снятия Unified отдельная проверка All-only выбора A прошла.
Отдельное окно создавалось, но выбор аккаунта в нём независимо от основного окна
не проверялся. В тесте Home/End/PageUp/PageDown на штатном дереве оставались внутри
выбранного A, но это не завершает проверку верхнего списка аккаунтов. ArrowUp/Return
в верхнем списке прошли; Home/End/Space/Tab/Shift+Tab там проверены не полностью.
In-place обновление существующей установки остаётся непроверенным.

После штатного удаления AccountPane в тестовом профиле закрыли менеджер дополнений;
полное дерево восстановилось, запись и пакет отсутствовали. Затем XPI был чисто
установлен повторно и включён. После этого исходный профиль штатно восстановлен,
проверен как текущий и выбранный по умолчанию; тестовый профиль не default.

Перед рабочей установкой Thunderbird штатно закрыли. В приватный каталог вне Git
сохранена закрытая копия десяти файлов UI/add-on metadata и реестра профиля с правами
каталога 700 и файлов 600. Копия не содержит почту, учётные данные, key4.db,
cert9.db или token stores; пути и значения не публикуются. Штатный Add-ons Manager
установил тот же проверенный XPI после принятия ранее согласованного full-access
запроса. Read-only metadata подтвердили ровно одну активную запись AccountPane 0.1.0
и один установленный XPI с ожидаемым хешем. Conversations 4.3.16 остался активен;
хеши userChrome.css и userContent.css совпали с инвентаризацией до установки.

После разблокировки native `about:3pane` показал ровно один Accounts список над
исходным деревом и существующие аккаунты. Прежние аккаунт и папка остались выбраны;
заголовок и счётчик папки сохранились. Ноль строк сообщений были выбраны, кнопки
действий оставались отключены; сообщение не открывали. Отдельный ошибочный щелчок
по звезде и немедленный откат описаны ниже.
Локальная визуальная проверка показала согласованность панели с тёмным оформлением;
снимки и личные данные не экспортировались. About Profiles подтвердил исходный
профиль current/default=yes, тестовый — default=no; исходная почтовая вкладка
оставлена открытой.

Операционная заметка: во время подготовки рабочей проверки один щелчок по элементу
управления существующего сообщения случайно переключил звезду. Изменение сразу
отменили тем же элементом; повторная проверка показала звезду выключенной и прежнее
состояние прочтения. Сообщение не открывали. Тема, почтовое содержимое и личные
идентификаторы в документацию не включены.

## Согласованная нативная фаза

Пользователь разрешил тестовую проверку и отдельную beta-установку в рабочем профиле
после основных сценариев; рабочая установка выполнена, исходный профиль остаётся
текущим и выбранным по умолчанию.
Согласие на полный доступ было принято при установке предыдущего кандидата; для
нового кандидата сохраняется тот же запрошенный объём доступа. Установка AccountPane
осталась неизменной между тестовой и рабочей установкой. Рабочий профиль имеет
AccountPane 0.1.0 active; приватная recovery-копия создана до установки.

Несмотря на `permissions: ["storage"]`, Experiment получает неограниченный доступ
к Thunderbird и компьютеру по [официальной модели разрешений](https://developer.thunderbird.net/add-ons/mailextensions/experiments).
Текущий код использует метаданные аккаунтов/папок, обратимые изменения панели и
локальные настройки; он не читает тела писем/пароли и не делает внешних запросов.
Это описание кода, не привилегий или технической изоляции.

Идентичность текущего кандидата: коммит и хеш выше, этот объём доступа и
[откат](../README.md#отключение-и-откат).
Все действия с приложением после согласия выполнять через разрешённое native UI.
Не ослаблять проверку подписей, защитные preferences или Gatekeeper. При отказе
установки записать причину и остановить этот путь.

## Конфигурация для повторной нативной проверки

- Отдельный обозначенный тестовый профиль 157.0.1; рабочий профиль закрыт.
- Два искусственных почтовых аккаунта с отдельными локальными хранилищами,
  вложенными папками и доступными «Локальными папками». Допустимы offline POP
  без реальных серверов/паролей, с отключёнными проверками почты.
- Папка без Inbox, пустые Local Folders, favorite-only набор и аккаунт без строк
  в текущем режиме. Только специально созданные искусственные сообщения.
- Сначала штатная тема, затем Postbird Tangaroa и Conversations 4.3.16 в согласованной
  тестовой конфигурации. Не отправлять реальную почту.

Не переносить личный профиль в Git или в старую версию Thunderbird. Имена/URI,
письма, пароли и пути личного профиля не включать в отчёты, публичные скриншоты
или артефакты. Результаты фиксировать с искусственными обозначениями и фиксированными
кодами диагностики.

## Нативные сценарии нового кандидата

- [x] **Запуск и базовый выбор.** В тестовом профиле проверены запуск Experiment,
  Accounts список над штатным деревом, выбор fixture B, «Все аккаунты», «Локальные
  папки» и переход клавишами ArrowUp/Return. Полный доступ был раскрыт и принят
  в рамках прежнего согласия.
- [x] **Аккаунты и дерево.** Проверены A/B/All/Local Folders, вложенные Inbox/Archive/Sub,
  выбор Local Folders/Trash, режим только избранных без строк с fallback к All Accounts
  при сохранении Archive и режимов, а также сохранение выбора Archive+Sub после
  создания папки UI-MultiRefresh.
- [x] **История папок.** Отключение, открытие Archive штатной навигацией, включение,
  затем B → A вернуло Archive. Проверено начальное подключение с уже открытой Archive.
- [x] **Мышь и вкладки.** Один сохранённый тестовый черновик перетащен из Drafts в
  Archive: источник 1→0, назначение 0→1. Две почтовые вкладки независимо показывали
  B Inbox и A Sub.
- [x] **Клавиатура штатного дерева.** Home/End/PageUp/PageDown при выбранном A
  оставались в его папках (Home/PageUp — центральная папка A, End/PageDown — Trash A;
  B и Local не отображались). Right/Down/Left переключали Archive/Inbox и раскрывали/
  сворачивали ветку. В верхнем Accounts списке ArrowUp/Return выбрали B;
  Home/End/Space/Tab/Shift+Tab полностью не проверялись.
- [x] **Чистая установка, циклы, удаление и повторная установка.** После отсутствия
  прежней записи и пакета чистая установка прошла два цикла выключения/включения и
  перезапуск; список сохранился. Штатное удаление восстановило полное дерево и удалило
  запись/пакет. Последующая чистая установка прошла; Accounts загрузился, текущая
  папка Sub сохранилась.
- [ ] **Обновление существующей установки.** In-place same-ID update не проверен.
  Ранняя попытка Remove и немедленной установки сопровождалась потерей записи после
  закрытия менеджера/перезапуска; возможное stale pending-uninstall состояние не
  подтверждено и не считается дефектом продукта. Удаление с закрытием менеджера для
  завершения, затем чистая установка прошли.
- [ ] **Отдельное окно и режимы.** Второе окно открыто, но независимость его аккаунтов
  не проверена. Сценарий Unified → All оказался INCONCLUSIVE из-за неопределённости
  активного окна/меню; это не считается продуктовым FAIL. После снятия Unified
  проверен выбор A с деревом только A.
- [ ] **Дополнительные деревья и совместимость.** Не завершены внешняя навигация,
  доступность всех типов папок, перестроения/удаление аккаунтов, fail-open и конфликты.
- [ ] **Отключение под нагрузкой и оформление.** Проверить закрытие во время загрузки,
  стили штатной темы/Tangaroa, размер и прокрутки, Conversations 4.3.16, отсутствие
  дубликатов после повторных циклов.

## Рабочая beta-установка — PASS в ограниченной целевой конфигурации

AccountPane 0.1.0 установлено штатным Add-ons Manager в оригинальный рабочий профиль
после закрытой recovery-копии метаданных/реестра вне Git. Read-only проверка подтвердила
одну активную запись и один установленный XPI с ожидаемым SHA-256. Accounts UI появился
над деревом, исходные аккаунт и папка сохранились; сообщений не открывали и не выбирали.
Conversations 4.3.16 и пользовательские CSS сохранены. Исходный профиль текущий и
default=yes, тестовый — default=no. Резервная копия не содержит почту или секреты;
её точный локальный путь не записывается здесь. Откат — отключить/удалить дополнение
через native Add-ons Manager; при необходимости восстановить только сохранённые
UI/add-on metadata с Thunderbird закрытым, по локальной процедуре.

## Граница завершения

135 синтетических тестов и проверка одной рабочей конфигурации не заменяют полную
проверку настоящего UI, schema loader, observer timing, клавиатуры и очистки.
Отдельное окно, полный Unified/All цикл, конфликты, гонки загрузки,
точный runtime descriptor и часть верхней клавиатурной навигации остаются
непроверенными. Эта ограниченная beta-приёмка не является общей сертификацией или
публичным релизом. Любой обнаруженный
дефект сначала воспроизвести точным live-сценарием или регрессионным тестом.

## Кандидат 0.1.1: исправление высоты списка аккаунтов

Нативное воспроизведение исходного дефекта показало, что верхняя область высотой
148 px отображала только две из четырёх строк и имела отдельную прокрутку наряду
со штатным деревом папок. CSS-кандидат 0.1.1 задаёт верхней области и её списку
естественную высоту без внутренней прокрутки. При очень коротком окне или большом
числе аккаунтов дереву может остаться меньше места.

Фокусные проверки `account-view.test.mjs` и `build.test.mjs` прошли: 17/17.
Сборка содержит 13 разрешённых файлов, манифест версии 0.1.1 и имеет размер
16 169 байт; две последовательные сборки дали SHA-256
`b39d7ac924043270331c681deb1fcb0e6d6bcc81ddbd3f649815426e6286ad77`.

Нативная проверка 0.1.1 PASS: штатное обновление с 0.1.0 завершилось, менеджер
дополнений показывает версию 0.1.1 включённой. В исходной почтовой вкладке пункт
All Accounts был выбран, все четыре строки были целиком видны над разделителем;
отдельной верхней прокрутки или пустой полосы под списком не было, штатная прокрутка
папок сохранилась. Количество и заголовок папок не изменились (455); сообщения не
выбирали, команды для них оставались недоступными. Осталась одна активная запись
установки с ожидаемым SHA-256. Conversations 4.3.16 и пользовательские CSS остались
активны и неизменны. Обновление на месте проверено; остальные перечисленные выше
нативные углы остаются непроверенными.

## Кандидат 0.1.2: счётчики сообщений и иконка

Кандидат 0.1.2 запрашивает рекурсивные счётчики непрочитанных и всех сообщений
корневой папки Thunderbird для каждого видимого аккаунта. Реализация использует
native API, а не обходит и вручную не суммирует каждую папку. Автоматический
адаптерный fixture проверяет рекурсивный аргумент и фильтрацию видимых аккаунтов;
он не моделирует собственную семантику подсчёта Thunderbird или виртуальные папки.
Поэтому физические/виртуальные границы не подтверждались отдельным нативным
суммированием папок. Непрочитанный значок скрыт при нуле; счётчик всех сообщений
для аккаунта и «Все аккаунты» виден при включённом переключателе штатной панели,
в том числе при нулевом значении. Обновление счётчиков меняет только значки и
доступные подписи, не меняя выбор, навигацию или историю/настройки. В нативной
проверке подтверждены отображение значков, сумма «Все аккаунты» по видимым
аккаунтам и работа переключателя; матрица приведена ниже.

Оригинальная статическая иконка использует самостоятельный SVG-исходник
`addon/icons/accountpane.svg` и PNG-размеры 16, 32, 48, 64 и 128 пикселей для
manifest. Исходный SVG остаётся в checkout и не входит в XPI; сборщик разрешает
только пять PNG-версий.

Полный автоматический прогон дал 142/142 PASS до последней косметической правки
цветовых переменных CSS. После неё повторно выполнены фокусные тесты сборщика:
`tests/build.test.mjs` — 4/4 PASS. Две последовательные сборки дали одинаковые
байты. XPI содержит 18 записей; CRC корректен, а содержимое каждой записи
совпадает с соответствующим исходником. Манифест указывает версию 0.1.2.

| Поле | Значение |
| --- | --- |
| Файл | `dist/accountpane-0.1.2.xpi` |
| Размер | 37 755 байт |
| SHA-256 | `9a0012d4aba829e4a6d44fffd38a34f30e017f2129bf8586aa1bf676f77db69b` |
| Записи XPI | 18, CRC PASS; все записи совпадают с исходниками |
| Нативная приёмка | Ограниченный PASS; дополнительные сценарии открыты |

В нативной проверке 0.1.2 подтверждены следующие пункты:

| Проверка | Результат |
| --- | --- |
| Включённое расширение и иконка в менеджере дополнений | PASS |
| Четыре строки аккаунтов и расположение счётчиков в Postbird Tangaroa | PASS: все строки видны; значки справа в штатном оранжевом цвете |
| Значки непрочитанных сообщений рядом с аккаунтами | PASS: отображались |
| «Все аккаунты»: сумма только по видимым аккаунтам | PASS |
| Переключатель общего счётчика: включение сразу показывает счётчики аккаунтов и итог; выключение восстанавливает исходный вид | PASS |
| Выбранные аккаунт/папка и состояние ранее открытого сообщения | Сохранены; строка письма не выделялась, флаги не менялись |
| Внешний вид счётчиков в Postbird Tangaroa | PASS; другие аспекты совместимости не проверялись |
| Conversations 4.3.16 | Оставался включён |

Устанавливался именно XPI с указанными выше размером и SHA-256; установка прошла
без перезапуска и переключения профиля. Фактические значения счётчиков, имена
аккаунтов и содержимое сообщений в журнал не записываются. Остальные ранее
отмеченные нативные сценарии остаются открытыми. PASS для высоты списка 0.1.1
выше относится только к старому кандидату.

## Кандидат 0.1.7: исключение Спама из счётчиков аккаунтов

Счётчики непрочитанных и всех сообщений аккаунта исключают Спам по нативному
признаку Junk folder. Исключается рекурсивный счётчик ветки физической папки Junk
целиком и только один раз; сопоставления по имени нет, вложенные junk-узлы не
вычитаются повторно. Виртуальные ветви уже исключены нативным подсчётом. Счётчики
непрочитанных и общих сообщений обрабатываются независимо. Неизвестный, ошибочный
или отрицательный результат остаётся недоступным; частичный или отрицательный итог
не подставляется. Счётчик строки самой папки не меняется. «Корзина» не исключается.

Общие счётчики аккаунтов в All Accounts используют обновляемые значения аккаунтов.
Изменение флага папки, меняющее её роль Junk, запускает обновление счётчика.
Настройка для отключения исключения или иные изменения схемы хранения не добавлены.

Полный автоматический прогон: 186/186 PASS; фокусная группа: 34 теста. Добавлены
регрессионные проверки; полный набор и две сборки прошли. XPI содержит 18
уникальных записей, CRC и соответствие архивных записей исходникам подтверждены.

| Поле | Значение |
| --- | --- |
| Версия / ID | 0.1.7 / `accountpane@stupalov.github.io` |
| Файл | `dist/accountpane-0.1.7.xpi` |
| Размер | 44 259 байт |
| SHA-256 | `b843dcb6f55e613c9baee9d77759ca27e32c42956b3e1477a8f2385a51390fb4` |
| Записи XPI | 18, CRC PASS; архивные записи совпадают с исходниками |
| Нативная проверка | Ограниченный smoke PASS; точное числовое равенство и общий счётчик в UI не проверялись |

В ходе нативной проверки AccountPane 0.1.7 установился и был включён. После
возврата в исходную почтовую вкладку и папку All Accounts оставался выбранным и
раскрытым; состояния All, Favorite и Recent не изменились, письмо не было выбрано
или открыто. Счётчик непрочитанных самой папки Спам оставался неизменным, а badge
непрочитанных аккаунта визуально уменьшился. Точное равенство разности не
подтверждено из-за параллельного поступления почты. Общий счётчик и свёрнутый
агрегат All Accounts в интерфейсе не проверялись; их покрывает автоматическая
проверка. Установленный XPI совпал с проверенным артефактом; дополнение включено.

## Кандидат 0.1.6: порядок аккаунтов и компактные подписи папок

Кандидат сохраняет схему настроек. Видимые аккаунты в All Accounts можно
перетаскивать между позициями дочернего списка; корень All Accounts закреплён.
Позиционная подсказка показывает вставку до или после строки; изменение порядка
передаётся штатному `MailServices.accounts.reorderAccounts`. Скрытые, отложенные
и чат-аккаунт ключи/слоты сохраняются. Drop не выбирает аккаунт или папку и не
меняет историю/навигацию. Отмена, drop из чужого списка и устаревшие элементы
игнорируются. Наблюдатель нативного порядка обновляет все открытые представления.

При выбранном конкретном аккаунте в компактных режимах папки показывают только
своё имя. Для этого временно применяется `_nameStyle=both` через собственную обёртку
`_setName`; отображается имя папки, а полное имя, счётчики, aria-label и title
остаются построенными из штатных метаданных. All Accounts восстанавливает
исходный формат. Переименования, перестроения дерева и очистка обёртки обновляют
представление. Корневая роль accessibility ownership восстановлена.

Манифест теперь допускает Gecko 157.0–158.*. Установленный Thunderbird 158 был
проверен статически по контрактам API; runtime-проверки в 158 не выполнялись.

Автоматический прогон: 181/181 PASS. Две последовательные сборки дали одинаковый
XPI; 18 уникальных записей, CRC и соответствие архивных записей исходникам
проверены.

| Поле | Значение |
| --- | --- |
| Версия / ID | 0.1.6 / `accountpane@stupalov.github.io` |
| Файл | `dist/accountpane-0.1.6.xpi` |
| Размер | 43 855 байт |
| SHA-256 | `e7ec1f459576643571788e7c70dbab7507635377b57f44aef27404c2fbc829db` |
| Записи XPI | 18, CRC PASS; архивные записи совпадают с исходниками |
| Нативная проверка | Первоначальная попытка заблокирована; функциональная приёмка не подтверждена |

## Первоначальная попытка нативной проверки 0.1.6

Управление рабочим приложением Thunderbird завершилось timeout при получении окна;
повтор после сброса CUA и поиска приложения по bundle ID завершился тем же timeout.
В этой попытке кандидат 0.1.6 не устанавливался и UI-действий не выполняли. Более
поздняя проверка метаданных подтвердила активный 0.1.6 в Thunderbird 158, но не
подтвердила его функциональное поведение.

Предобновленческая резервная копия была проверена отдельно. Поведение 0.1.6
подтверждается автоматическими тестами и статическим чтением API; более поздняя
проверка метаданных в Thunderbird 158 не заменяет функциональную приёмку. Runtime
проверка всех возможностей 0.1.6 и совместимости 158 отсутствует.

## Кандидат 0.1.5: режимы папок и выбор в общем дереве

Кандидат сохраняет схему настроек и поддерживает All, Favorites, Unread, Recent,
Unified и Tags. Явный выбор конкретного аккаунта открывает его первую доступную
папку в штатном порядке сортировки, обычно Inbox, и выбирает строку в All Folders.
Если этот режим выключен, он включается дополнительно без отключения остальных.
Выбор All Accounts сохраняет открытую папку; восстановление после перестроения
дерева продолжает использовать историю папок.

В режиме одного аккаунта головная строка All Folders скрыта, папки подняты на
верхний уровень; пустой корень без папок остаётся доступен. All Accounts
восстанавливает обычное дерево. Смешанные агрегаты Unified и Tags скрыты при
выборе конкретного аккаунта; реальные дочерние папки Unified остаются доступны.
Правый клик по аккаунту открывает штатное меню корня без навигации.

Автоматический прогон: 166/166 PASS. Две последовательные сборки дали идентичные
байты; XPI содержит 18 уникальных записей, CRC и соответствие архивных записей
исходникам проверены.

| Поле | Значение |
| --- | --- |
| Версия / ID | 0.1.5 / `accountpane@stupalov.github.io` |
| Файл | `dist/accountpane-0.1.5.xpi` |
| Размер | 41 996 байта |
| SHA-256 | `9ac03ce57fcc4bada04be57b1790dba0071d4b8113ff16d2255abfbe6b6d838b` |
| Записи XPI | 18, CRC PASS; архивные записи совпадают с исходниками |
| Нативная проверка | Ограниченный PASS; переключение режимов и явный выбор первой папки в GUI открыты |

### Ограниченная нативная проверка 0.1.5

В рабочем профиле установлен ровно проверенный XPI; менеджер показывал одну
активную запись 0.1.5. Conversations 4.3.16 и пользовательские настройки остались
без изменений.

| Проверка | Результат |
| --- | --- |
| Контекстное меню корня выбранного аккаунта по правому щелчку | PASS; Escape закрыл меню без навигации |
| Выбранный аккаунт в All Folders | PASS; корневая строка скрыта, папки подняты на уровень аккаунта |
| Выбор All Accounts | PASS; полное дерево восстановлено с исходным раскрытием |
| Текущая папка, выделенные сообщения и открытое письмо при смене вида | PASS; исходное состояние восстановлено, действий с письмом не выполняли |
| Активная запись дополнения и Conversations 4.3.16 | PASS; одна активная 0.1.5, Conversations остался включён |

Нативно не проверялись явный выбор первой отсортированной папки и переключение
Favorites, Unread, Unified, Tags и Recent. GUI-автоматизация не смогла надёжно
переключить окно Thunderbird в этой конфигурации; эти сценарии подтверждены
автотестами и чтением штатных API, но не считаются GUI-приёмкой. Также не
сертифицировались отдельные окна, клавиатура/assistive technology, полный перезапуск,
другие темы/версии и конфликты. Фактические названия, счётчики, URI и содержимое
писем в Git-документацию не записываются.

## Кандидат 0.1.4: нативная геометрия строк

Версия 0.1.4 не меняет выбор, раскрытие, счётчики, навигацию или хранение состояния.
Она ограничивает disclosure штатным 22-пиксельным слотом, использует штатный
`nav-down-sm` chevron и приводит поля, вложенность, подписи, badges и резерв
полосы прокрутки к геометрии folder tree. Корневая строка сохраняет высоту server
row, дочерние строки — высоту обычных folder rows.

Автоматический прогон: 148/148 PASS. Две сборки дали одинаковый SHA-256; XPI
содержит 18 уникальных записей, CRC и соответствие исходникам проверены.

| Поле | Значение |
| --- | --- |
| Версия / ID | 0.1.4 / `accountpane@stupalov.github.io` |
| Файл | `dist/accountpane-0.1.4.xpi` |
| Размер | 40 007 байт |
| SHA-256 | `46e161d3b347411128b3a03f43a79e08596c4e8d5896a23e46ad810a7b0aa9b1` |
| Записи XPI | 18, CRC PASS; архивные записи совпадают с исходниками |
| Нативная проверка | Ограниченный PASS по геометрии; остальные сценарии открыты |

## Нативная проверка геометрии 0.1.4

Установлен точный артефакт 0.1.4 с указанным выше SHA-256; в менеджере дополнений
была одна активная запись этой версии. В той же конфигурации оставался включён
Conversations 4.3.16.

| Проверка | Результат |
| --- | --- |
| Chevron disclosure при раскрытом и свёрнутом состояниях | PASS; контур, форма и размер совпадали со штатным chevron |
| Иконка и подпись корневой строки | PASS; выровнены по колонкам корневых аккаунтов штатного дерева |
| Иконка и подпись дочерней строки | PASS; выровнены по колонкам первого уровня папок |
| Высота корневой и дочерних строк | PASS; корень соответствует строке server, дети компактным строкам папок |
| Полоса прокрутки и дочерняя группа | PASS; стабильный правый gutter, внутренней прокрутки аккаунтов нет |
| Свёрнутое состояние | PASS; справа оставался только агрегатный значок |
| Текущий раздел/папка/сообщение | Не изменились; папка или сообщение не открывались |
| Возврат к исходному виду | PASS; восстановлена исходная вкладка и раскрытое состояние |

Проверка была визуальной и ограниченной указанным профилем. Другие темы, размеры
окна, отдельные окна, клавиатура/assistive technology, полный перезапуск,
изменение выбранного аккаунта и папки и конфликты дополнений не сертифицировались.
Пользовательские данные, фактические значения счётчиков и подписи в журнал не
записываются.

## Кандидат 0.1.3: дерево аккаунтов и сворачивание группы

Версия 0.1.3 заменяет плоский список доступных аккаунтов деревом: «Все аккаунты»
является корневой строкой, аккаунты вложены в группу, а раскрытие управляет только
видимостью этой группы. Оно не выбирает «Все аккаунты» и не меняет папку или
состояние сообщения. В свёрнутом состоянии корневая строка показывает агрегат
непрочитанных по всем отображённым аккаунтам, включая скрытые сворачиванием дочерние
строки. Индивидуальные счётчики остаются у аккаунтов. Счётчик всех сообщений
подчиняется штатному переключателю. Источник использует счётчики Thunderbird;
отдельная GUI-проверка их физической/виртуальной семантики для 0.1.3 не заявляется.

Раскрытие сохраняется как необязательное boolean-значение `accountsExpanded`; при
отсутствующем или неверном старом значении применяется `true`. Существующая панель
сохраняет своё состояние раскрытия в runtime и не прыгает вслед за записью другой
панели; новая или перезагруженная панель читает последнее сохранённое значение.

Клавиатурная модель использует ArrowLeft/ArrowRight для родителя, сворачивания,
раскрытия и первого дочернего элемента; ArrowUp/ArrowDown/Home/End перемещаются по
видимым строкам. Enter/Space выбирают сфокусированный аккаунт. Tab и модификаторы
передаются штатной навигации. При сворачивании сфокусированного ребёнка фокус
переходит на корень, а выбор аккаунта сохраняется.

«Все аккаунты» использует иконку облачной стопки, почтовые аккаунты — облако,
«Локальные папки» — монитор. Заголовок при отображении копирует
семейство шрифта, размер, начертание и высоту строки из вычисленного стиля заголовка
штатного дерева.

Автоматический прогон: 148/148 PASS (699 мс). Два последовательных запуска
сборщика дали идентичные байты; XPI содержит 18 уникальных записей из фиксированного
списка, CRC и соответствие содержимого архивных записей исходникам проверены.

| Поле | Значение |
| --- | --- |
| Версия / ID | 0.1.3 / `accountpane@stupalov.github.io` |
| Файл | `dist/accountpane-0.1.3.xpi` |
| Размер | 39 653 байта |
| SHA-256 | `3aa558a3b9d5beaa482433b9c25d2a84218d146c8299d1a7e28fcdeeee952e15` |
| Записи XPI | 18, CRC PASS; архивные записи совпадают с исходниками |
| Нативная проверка | Ограниченный PASS; дополнительные сценарии открыты |

## Ограниченная нативная проверка 0.1.3

Установлен именно XPI с приведённым выше SHA-256, под тем же ID; в менеджере
дополнений запись 0.1.3 включена и иконка отображалась. Проверка проводилась в
текущей конфигурации Thunderbird с Conversations 4.3.16, который оставался включён.

| Проверка | Результат |
| --- | --- |
| «Все аккаунты» как корень и дочерние строки в раскрытом виде | PASS; дочерние строки визуально вложены |
| Агрегат на корне при сворачивании; скрытие дочерних счётчиков; раскрытие обратно | PASS; агрегат соответствовал сумме дочерних значений, обратно восстановились значения и вид строк |
| Раскрытие/сворачивание без выбора корня или изменения текущей папки/сообщения | PASS; disclosure менял только вид группы |
| Иконка корня и почтовых строк, заголовок рядом с All/Favorites | PASS в проверенной конфигурации; заголовок визуально совпадал по размеру, начертанию и цвету |
| Цикл disable/enable дополнения | PASS; свёрнутое состояние сохранилось после повторного включения |
| Нативная запись и расширение | PASS; одна активная запись 0.1.3, Conversations 4.3.16 оставался включён |
| Обычный аккаунт, не-Inbox вложенная папка и прокрутка нижних папок | Состояние сохранено; открытое сообщение отсутствовало |
| Возврат к исходной вкладке Thunderbird | PASS; восстановлена начальная вкладка и раскрытый вид |

Во время проверки не менялись пользовательские CSS, учётные записи, метки папок,
почтовые строки или флаги писем. Значок «Локальные папки» не проверен: эта строка
была скрыта штатной настройкой. Native keyboard/assistive-technology сценарии
пропущены; их прохождение автоматических тестов не является GUI-приёмкой. Полный
перезапуск Thunderbird и переключение профиля не выполнялись, поэтому восстановление
после такого перезапуска нативно не подтверждено. Также не проверялись отдельное
окно, другие темы/версии, конфликты, изменение размера/короткое окно и прочие
сценарии совместимости. Точные пользовательские значения и подписи не записываются.
