<p align="center"><img src="addon/icons/accountpane-128.png" width="96" height="96" alt="AccountPane icon"></p>

# AccountPane

**English** · [Русский](README.ru.md) · [Features](#features) · [Screenshots](#screenshots) · [Installation](#installation) · [Usage](#usage)

A dedicated account list for Thunderbird, inspired by Postbox. Choose an account at the top of the folder pane and see just its folders below. Choose **All Accounts** to return to the full folder tree.

AccountPane works with your existing accounts and Thunderbird's folder controls. It is designed to follow the active Thunderbird theme; no separate theme, custom CSS, or Postbird installation is required. English and Russian interface labels are included.

**Beta:** requires Thunderbird **157 or newer**, with no upper version cap. Native testing so far covers versions 157–158 on macOS. Future Thunderbird changes to internal APIs may still require an AccountPane update.

## Features

- **One account at a time.** A separate account list keeps the folder pane focused on the account you choose. The duplicate account heading disappears from All Folders.
- **A collapsible account group.** Collapse All Accounts to save space and show its combined message counters.
- **Account counters.** See unread and, when enabled in Thunderbird, total message counts. Spam/Junk and its subfolders are excluded from account totals.
- **Drag to reorder.** Move accounts within the list. The order is saved as Thunderbird's account order.
- **Familiar folder views.** Use All, Favorites, Unread, Recent, Unified, and Tags. Labels such as “Inbox — Work” become “Inbox” while viewing one account.
- **Native actions.** Right-click an account for Thunderbird's account context menu. Folder actions remain in the usual folder pane.
- **Keyboard navigation.** Navigate the account tree with the arrow keys and select with Enter or Space.

## Screenshots

These illustrative previews use fictional accounts and the actual AccountPane view and styles, rendered in a browser. They show light and dark styling; they are not captures of a running Thunderbird window.

*Light appearance: focus on one account and its folders.*

![AccountPane preview with fictional accounts in a light appearance](docs/images/accountpane-light.png)

*Dark appearance: All Accounts shows the complete account and folder tree.*

![AccountPane preview with fictional accounts in a dark appearance](docs/images/accountpane-dark.png)

## Installation

Install the supplied `accountpane-*.xpi` file. A public release package is not currently published; if you have only the source code, see the [build instructions](docs/development.md#build-and-test).

1. Open Thunderbird → **Add-ons and Themes** → **Extensions**.
2. Open the gear menu and choose **Install Add-on From File…**.
3. Select the XPI, review the permissions, and confirm installation.
4. Check that AccountPane is enabled. **Accounts** appears above the folder tree.

To update, install the new XPI using the same menu. You do not need to remove the previous version first.

**Permissions:** AccountPane uses Thunderbird's Experiment API to integrate with the folder pane, so Thunderbird requests full, unrestricted access. The current implementation reads account and folder metadata and stores local selection and folder-history settings. It does not read message bodies or passwords and makes no external network requests or telemetry submissions. Experiment access itself is broader than this behavior.

## Usage

- **Select an account** to show its folders and open its first available folder in Thunderbird's order, usually Inbox. All Folders is enabled if necessary; your other folder views stay enabled.
- **Select All Accounts** to show the full tree while keeping the current folder open.
- **Click the arrow beside All Accounts** to collapse or expand the account list. This does not change the selected account or open folder. Combined counters appear when the group is collapsed.
- **Drag an account above or below another** to change its order. This changes Thunderbird's account order across mail tabs, not just this panel.
- **Right-click an account** to open its native context menu without switching the open folder.
- **Use the keyboard:** Up/Down and Home/End move focus; Left/Right collapse, expand, or move between tree levels; Enter/Space select; Tab moves to the next control.

For a selected account, combined Unified/Tags rows that span accounts are hidden. Select All Accounts to restore the complete view.

### Message counters

Unread and total counts sum the account's folders, excluding folders Thunderbird identifies as **Junk/Spam** and all their subfolders. The folder's designation matters: a normal folder simply named “Spam” is not automatically excluded. Trash remains included. All Accounts sums the visible accounts, and total counts follow Thunderbird's folder-pane total-count setting.

This exclusion is built into AccountPane and has no separate switch. The counters on the individual folders, including Spam, remain Thunderbird's own counters.

### Disable or remove

Open **Add-ons and Themes → Extensions**, then disable AccountPane or choose **Remove** from its menu. The standard folder tree is restored. Account order changes made by dragging remain saved in Thunderbird.

## More information

[Changelog](CHANGELOG.md) · [Development](docs/development.md) · [License](LICENSE)

AccountPane is an independent project, not an official Thunderbird or Postbox product. Licensed under MIT.
