<p align="center"><img src="addon/icons/accountpane-128.png" width="96" height="96" alt="AccountPane icon"></p>

# AccountPane

**English** · [Русский](README.ru.md) · [Features](#features) · [Screenshots](#screenshots) · [Installation](#installation) · [Usage](#usage)

A dedicated account list for Thunderbird, inspired by Postbox. Choose an account at the top of the folder pane and see just its folders below. Choose **All Accounts** to return to the full folder tree.

AccountPane began as an attempt to bring back the way of working with mail that Postbox offered, after Postbox stopped being updated and was abandoned. It adds the Postbox-style account list to Thunderbird and works with your existing accounts and Thunderbird's folder controls. For a matching Postbox-like appearance, see the companion theme [Thunderbird Tangaroa](https://github.com/stupalov/thunderbird-tangaroa).

**Beta:** requires **Thunderbird 140 ESR, Betterbird 140 or Thunderbird 157–158**. AccountPane was checked on Thunderbird 157–158 on macOS and on Thunderbird 140 ESR, Betterbird 140 and Thunderbird 158 on Windows 11. Versions 141–156 fall inside the manifest range but were not tested. Each new Thunderbird release gets an AccountPane update. Future Thunderbird changes to internal APIs may still require an AccountPane update.

## Features

- **One account at a time.** A separate account list keeps the folder pane focused on the account you choose. The duplicate account heading disappears from All Folders.
- **Account groups.** Keep related accounts together in your own collapsible groups. A collapsed group shows its combined message counters and new-mail star.
- **Account counters.** See unread and, when enabled in Thunderbird, total message counts. Spam/Junk and its subfolders are excluded from account totals.
- **Drag to reorder.** Move accounts within the list. The order is saved as Thunderbird's account order.
- **Familiar folder views.** Use All, Favorites, Unread, Recent, Unified, and Tags. Labels such as “Inbox — Work” become “Inbox” while viewing one account.
- **Move accounts between groups.** Drag an account onto a group header, or use **Move to Group** in its menu.
- **Native actions.** Right-click an account for Thunderbird's account context menu. Folder actions remain in the usual folder pane.
- **New-mail star.** An account shows Thunderbird's new-mail star while any of its folders outside Spam/Junk has new messages. A collapsed group shows it when any of its accounts does.
- **Keyboard navigation.** Navigate the account tree with the arrow keys and select with Enter or Space.

## Screenshots

These illustrative previews use fictional accounts and the actual AccountPane view and styles, rendered in a browser. They show light and dark styling; they are not captures of a running Thunderbird window.

*Light appearance: focus on one account and its folders.*

![AccountPane preview with fictional accounts in a light appearance](docs/images/accountpane-light.png)

*Dark appearance: All Accounts shows the complete account and folder tree.*

![AccountPane preview with fictional accounts in a dark appearance](docs/images/accountpane-dark.png)

## Installation

Download the latest `accountpane-*.xpi` from the [Releases](https://github.com/stupalov/thunderbird-account-pane/releases) page. If you have only the source code, see the [build instructions](docs/development.md#build-and-test).

1. Open Thunderbird → **Add-ons and Themes** → **Extensions**.
2. Open the gear menu and choose **Install Add-on From File…**.
3. Select the XPI, review the permissions, and confirm installation.
4. Check that AccountPane is enabled. **Accounts** appears above the folder tree.

To update, install the new XPI using the same menu. You do not need to remove the previous version first.

### Why the install prompt asks for full access

When you install AccountPane, Thunderbird shows "This add-on will have full, unrestricted access to Thunderbird, and your computer." This is not a permission AccountPane chooses; it is the only prompt Thunderbird has for any add-on that uses the Experiment API. AccountPane needs that API because Thunderbird has no WebExtension API for changing the folder pane: the account list can only be added by running code inside Thunderbird's own window, and Thunderbird treats all such code as fully trusted. Every folder-pane add-on built on Experiments shows the same text, whatever it actually does.

What AccountPane actually does with that access: it reads account and folder metadata (names, flags, message counts, the new-mail marker), moves accounts when you drag them, and stores the selected account, folder history and your account groups in the add-on's local storage. It does not read message bodies or passwords, makes no network requests and sends no telemetry. The source is open and the XPI build is reproducible, so the published file can be compared with the repository.

## Usage

- **Select an account** to show its folders and open its first available folder in Thunderbird's order, usually Inbox. All Folders is enabled if necessary; your other folder views stay enabled.
- **Select All Accounts** to show the full tree while keeping the current folder open.
- **Click the arrow beside a group** to collapse or expand its accounts. This does not change the selected account or open folder. Combined counters appear when the group is collapsed.
- **Drag an account above or below another** to change its order. This changes Thunderbird's account order across mail tabs, not just this panel.
- **Right-click an account** to open its native context menu without switching the open folder.
- **Right-click a group header** (or press the context-menu key, Shift+F10 on Windows/Linux, on a row) for the group menu; see [Account groups](#account-groups).
- **Use the keyboard:** Up/Down and Home/End move focus; Left/Right collapse, expand, or move between tree levels; Enter/Space select; Tab moves to the next control.

For a selected account, combined Unified/Tags rows that span accounts are hidden. Select All Accounts to restore the complete view.

### Account groups

**All Accounts** is the default group. While no account is in a group of your own, selecting it shows the full folder tree as before; once accounts are in your groups, it shows only the folders of the accounts it still contains.

- **Create a group:** right-click a group header and choose **New Account Group…**, or choose **Move to Group → New Account Group…** in an account's menu, which creates the group and moves that account into it.
- **Move an account:** drag it onto a group header, or drag it between the accounts of another group to move it and place it there. Dragging within a group still reorders accounts. **Move to Group** in the account menu lists all groups.
- **Select a group** to show the folders of its accounts. With several accounts, each account's root row stays in the folder pane. Group headers are always shown, even with one or no accounts; an empty group cannot be selected.
- **Group menu:** **Open in New Tab** and **Open in New Window** open the group's first available Inbox, or the first folder of the first account when no member has one (the window entry is hidden when your Thunderbird version lacks the native helper). **Rename…** works for every group; the default group can be renamed too, and an empty name restores "All Accounts". **Delete** is shown disabled for All Accounts; it returns the group's accounts to All Accounts and does not touch any mail.
- **Collapsed groups** show the sum of their accounts' counters and the new-mail star.
- **Keyboard:** press the context-menu key (Shift+F10 on Windows/Linux) on a group or account row to open its menu.
- **Limits:** Search Messages… and Settings… are not offered for groups, since Thunderbird's search and account settings work on a single folder or account; use the account menu for them. There are no nested groups, and groups cannot be reordered yet.

Groups (names, order, membership, collapsed state) are stored locally and shared by all windows; the selected group or account stays per tab or window. Settings migrate automatically from 0.1.x. Hidden accounts keep their group, removed accounts drop out, and new accounts land in All Accounts.

### Message counters

Unread and total counts sum the account's folders, excluding folders Thunderbird identifies as **Junk/Spam** and all their subfolders. The folder's designation matters: a normal folder simply named “Spam” is not automatically excluded. Trash remains included. All Accounts sums the visible accounts, and total counts follow Thunderbird's folder-pane total-count setting.

This exclusion is built into AccountPane and has no separate switch. The counters on the individual folders, including Spam, remain Thunderbird's own counters.

### Disable or remove

Open **Add-ons and Themes → Extensions**, then disable AccountPane or choose **Remove** from its menu. The standard folder tree is restored. Account order changes made by dragging remain saved in Thunderbird.

## More information

[Changelog](CHANGELOG.md) · [Development](docs/development.md) · [License](LICENSE)

AccountPane is an independent project, not an official Thunderbird or Postbox product. Licensed under MIT.
