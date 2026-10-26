# ATN listing texts for AccountPane

Copy-and-paste material for the addons.thunderbird.net developer hub. Keep the XPI identical to the GitHub release of the same version.

## Basic fields

| Field | Value |
|---|---|
| Name | AccountPane |
| Add-on ID (from the manifest, fixed) | `accountpane@stupalov.github.io` |
| Version | the manifest version of the uploaded XPI (0.2.3) |
| Category | Folders and Filters (alternative: User Interface) |
| Tags | accounts, folder pane, folders, postbox |
| License | MIT License |
| Homepage | https://github.com/stupalov/thunderbird-account-pane |
| Support site | https://github.com/stupalov/thunderbird-account-pane/issues |
| Privacy policy | none required; see "Privacy statement" below if the form asks |
| Icon | `addon/icons/accountpane-128.png` (also 64, 48, 32) |
| Screenshots | `docs/images/accountpane-light.png`, `docs/images/accountpane-dark.png` (fictional accounts, browser-rendered previews) |
| Experiment | yes: `experiment_apis.accountPane` |

## Summary (English, ≤ 250 characters)

A separate account list above the folder pane, Postbox-style. Pick an account or a group of accounts to see only their folders. Account groups, counters, drag-to-reorder, native context menu, keyboard navigation.

## Summary (Russian)

Отдельный список аккаунтов над панелью папок, как в Postbox. Выберите аккаунт или группу аккаунтов, чтобы видеть только их папки. Группы, счётчики, перетаскивание, штатное контекстное меню, клавиатура.

## Description (English)

AccountPane adds a dedicated account list at the top of Thunderbird's folder pane. Choose an account and the folder pane shows just that account's folders, opening its Inbox; choose All Accounts to get the full tree back while keeping the current folder open.

Features:
- One account at a time: the folder pane stays focused on the account you choose, in every folder view (All, Favorites, Unread, Recent, Unified, Tags).
- Account groups, as in Postbox: All Accounts is the default group; create your own groups, move accounts between them by drag and drop or the account menu (Move to Group), and select a group to see the folders of all its accounts. Collapsed groups show combined counters and the new-mail star.
- Unread and total counters per account; Spam/Junk folders are excluded from the sums.
- A star marks accounts with new messages, like Thunderbird's folders.
- Drag accounts to reorder them; the order is saved as Thunderbird's account order.
- Right-click an account for Thunderbird's own account context menu.
- Full keyboard navigation.
- English and Russian interface.

For a matching Postbox-like appearance, see the companion theme Tangaroa: https://addons.thunderbird.net/thunderbird/addon/tangaroa/

Why the install prompt asks for full access: AccountPane uses Thunderbird's Experiment API, because there is no WebExtension API for changing the folder pane. Thunderbird shows the same "full, unrestricted access" prompt for every Experiment add-on. AccountPane reads account and folder metadata, reorders accounts when you drag them and stores the selected account and your account groups locally. It does not read message bodies or passwords, makes no network requests and sends no telemetry. The source code is open and the XPI build is reproducible.

Requires Thunderbird 140 ESR, Betterbird 140 or Thunderbird 157–158. Beta: checked on Thunderbird 157–158 on macOS and on Thunderbird 140 ESR, Betterbird 140 and Thunderbird 158 on Windows 11. Independent project, not affiliated with Thunderbird or Postbox.

## Description (Russian)

AccountPane добавляет отдельный список аккаунтов в верхнюю часть панели папок Thunderbird. Выберите аккаунт — панель папок покажет только его папки и откроет «Входящие»; выберите «Все аккаунты», чтобы вернуть полное дерево, сохранив открытую папку.

Возможности:
- Один аккаунт за раз во всех режимах панели папок (Все, Избранные, Непрочитанные, Недавние, Объединённые, Метки).
- Группы аккаунтов, как в Postbox: «Все аккаунты» — группа по умолчанию; создавайте свои группы, переносите аккаунты перетаскиванием или через меню аккаунта («Переместить в группу») и выбирайте группу, чтобы видеть папки всех её аккаунтов. Свёрнутые группы показывают суммарные счётчики и звёздочку новых писем.
- Счётчики непрочитанных и всех писем по аккаунтам; папки Спама исключены из сумм.
- Звёздочка у аккаунтов с новыми письмами, как у папок Thunderbird.
- Перетаскивание аккаунтов; порядок сохраняется в самом Thunderbird.
- Штатное контекстное меню аккаунта по правому клику.
- Полное управление с клавиатуры.
- Интерфейс на английском и русском.

Для похожего на Postbox оформления есть тема-компаньон Tangaroa: https://addons.thunderbird.net/thunderbird/addon/tangaroa/

Почему при установке запрашивается полный доступ: AccountPane использует Experiment API, потому что штатного WebExtension-интерфейса для изменения панели папок нет. Thunderbird показывает одинаковый запрос «полный, неограниченный доступ» для любого Experiment-дополнения. AccountPane читает метаданные аккаунтов и папок, меняет порядок аккаунтов при перетаскивании и хранит выбранный аккаунт и группы аккаунтов локально. Он не читает содержимое писем и пароли, не выполняет сетевых запросов и не отправляет телеметрию. Исходный код открыт, сборка XPI воспроизводима.

Требуется Thunderbird 140 ESR, Betterbird 140 или Thunderbird 157–158. Бета: проверено в Thunderbird 157–158 на macOS и в Thunderbird 140 ESR, Betterbird 140 и Thunderbird 158 на Windows 11. Независимый проект, не связан с Thunderbird и Postbox.

## Notes to reviewer (English)

- Experiment API `accountPane` (`addon/experiment/`): injects an account list element into the folder pane of `about:3pane`, reads accounts and folders through `MailServices.accounts`, folder counts through `nsIMsgFolder.getNumUnread/getTotalMessages` and `hasNewMessages`, reorders accounts with `MailServices.accounts.reorderAccounts`, opens folders through the folder pane's own selection or, for a group's Open in New Tab/Window, through Thunderbird's own `MsgOpenNewTabForFolders`/`MsgOpenNewWindowForFolder`, adds group items to the native folder-pane context menu and its own group menu, asks for group names with `Services.prompt`, and listens to folder notifications (`nsIFolderListener`, `MailServices.mfn`). No network access, no message content, no password access, no telemetry.
- The background script only stores settings (`storage` permission) and relays them to the experiment.
- Source: https://github.com/stupalov/thunderbird-account-pane (tag v0.2.3). No minification or build step beyond zipping the `addon/` allowlist (`scripts/build.py`); the XPI SHA-256 is printed in the GitHub release notes.
- Tests: `node --test tests/*.test.mjs` (265 tests).
- `strict_min_version` is `140.0` so Thunderbird 140 ESR and Betterbird 140 users can install it; it was checked natively on 140 ESR and Betterbird 140. `strict_max_version` is `158.*`, the newest version the add-on was checked on; the catalogue requires an explicit maximum for Experiment add-ons.

## Privacy statement (if the form asks)

AccountPane does not collect, store or transmit personal data. It stores only its own settings (selected account or group, last folder per account, account group names and membership, collapsed state) in the add-on's local storage.
