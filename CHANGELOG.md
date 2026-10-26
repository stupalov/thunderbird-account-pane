# Changelog

User-facing changes are listed newest first. These are beta versions; inclusion here does not imply a published release package or validation on every supported platform.

## 0.2.3

- Account rows and group headers have the same height as Thunderbird's folder rows. The height is taken from the folder pane, so it follows the density setting and themes; group headers lose their extra padding.
- An empty account group's header is aligned with the other headers again: the space of its (invisible) expand arrow is always kept.

## 0.2.2

- Linux and macOS: the "Move to Group" item looks as in 0.2.0 again. The 0.2.1 indent fix is now applied on Windows only; on Linux (GTK) it drew an empty icon box and an extra indent.

## 0.2.1

- Windows: the "Move to Group" item in the account context menu is now indented like Thunderbird's own items.

## 0.2.0

- Account groups. **All Accounts** is now the default group; create your own groups with **New Account Group…** and keep related accounts together. Each group header can be collapsed and shows the sum of its accounts' counters and the new-mail star while collapsed.
- Selecting a group shows the folders of its accounts only (several accounts keep their root rows). While no account is in a user group, All Accounts still shows the full native folder tree as before; once accounts are in groups, it shows only its own accounts' folders.
- Right-click a group header (or press the context-menu key or Shift+F10) for **Open in New Tab**, **Open in New Window**, **New Account Group…**, **Rename…** and **Delete**. Deleting a group returns its accounts to All Accounts and does not touch mail. The default group can be renamed; an empty name restores "All Accounts".
- The account context menu gains **Move to Group**. You can also drag an account onto a group header, or between the accounts of another group, to move it. Dragging within a group still reorders accounts.
- Groups (names, order, membership, collapsed state) are stored locally and shared by all windows. Settings from 0.1.x migrate automatically to settings version 2. Hidden accounts keep their group, removed accounts drop out and new accounts land in All Accounts.
- **Search Messages…** and **Settings…** are intentionally not offered for groups, because Thunderbird's search and account settings work on a single folder or account; the account menu keeps them. There are no nested groups, and groups cannot be reordered yet.

## 0.1.13

- Support Thunderbird 140 ESR and Betterbird 140: `strict_min_version` is now `140.0` (maximum stays `158.*`).
- Fix for Thunderbird 140 ESR: selecting an account opened the account's start page instead of its Inbox, because ESR 140 has neither `nsIMsgFolder.localizedName` nor `FolderUtils.compareFolders`. AccountPane now falls back to the folder `name` and to the same sort order as the ESR 140 folder pane. Behaviour on Thunderbird 157–158 is unchanged.

## 0.1.12

- Set `strict_max_version` to `158.*`: the add-on catalogue requires an explicit maximum for Experiment add-ons. Each new Thunderbird release will need an AccountPane update (or a compatibility edit in the catalogue).

## 0.1.11

- Remove the explicit `strict_max_version` from the manifest (the catalogue validator rejects `*`); superseded by 0.1.12.

## 0.1.10

- Show Thunderbird's new-mail star on an account when any of its folders outside Spam/Junk has new messages; All Accounts shows it while collapsed if any account does.

## 0.1.9

- Remove the upper Thunderbird version cap while retaining the minimum of 157.0, so browser upgrades do not require a manifest-only AccountPane update. Changes to Thunderbird internals may still require code updates.

## 0.1.8

- Follow Thunderbird's native theme colors without requiring Postbird or another custom theme.
- Redesign and center the extension icon around the separate account-and-folder pane layout.
- Add an English user guide, a Russian translation, and light/dark illustrative previews.

## 0.1.7

- Exclude Spam/Junk folders and their descendants from account unread and total counts, including All Accounts. Individual folder counters remain unchanged.

## 0.1.6

- Drag accounts to change their saved Thunderbird order.
- Show shorter folder names in Favorites, Recent, and other compact views when one account is selected; restore account-qualified names in All Accounts.

## 0.1.5

- Right-click an account to open its native Thunderbird context menu.
- Hide the duplicate account heading in All Folders when viewing one account.
- Open the first available folder, usually Inbox, when selecting an account.
- Keep account filtering working with All, Favorites, Unread, Recent, Unified, and Tags views enabled together.

## 0.1.4

- Align account rows, indentation, widths, and expand/collapse arrows with the native folder tree.

## 0.1.3

- Group accounts under a collapsible All Accounts row, with combined counters when collapsed.
- Match the Accounts heading to native folder headings and add account-type icons.

## 0.1.2

- Add the extension icon and account unread/total message counters.

## 0.1.1

- Fix the account list shrinking and gaining an unnecessary scrollbar in All Accounts.

## 0.1.0

- Introduce a separate account list above Thunderbird's folder tree.
- Filter folders by account, return to All Accounts, and retain local folder history.
- Add keyboard navigation and English/Russian interface labels.

See the [development history](docs/development-history.md) and [testing journal](docs/testing.md) for the original implementation notes and validation limits.
