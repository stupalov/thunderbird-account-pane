# Changelog

User-facing changes are listed newest first. These are beta versions; inclusion here does not imply a published release package or validation on every supported platform.

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
