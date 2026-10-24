# ATN listing texts for Tangaroa

Copy-and-paste material for the addons.thunderbird.net developer hub. Keep the XPI identical to the GitHub release of the same version.

## Basic fields

| Field | Value |
|---|---|
| Name | Tangaroa |
| Add-on ID (from the manifest, fixed) | `tangaroa@stupalov.github.io` |
| Type | Theme (static theme with `theme_experiment`) |
| Version | the manifest version of the uploaded XPI (0.2.1) |
| Category | Themes |
| Tags | postbox, tangaroa, dark, light, navy |
| License | MIT License (theme); the adapted Postbird stylesheet is MIT, kept as `LICENSE-Postbird` |
| Homepage | https://github.com/stupalov/thunderbird-tangaroa |
| Support site | https://github.com/stupalov/thunderbird-tangaroa/issues |
| Icon | `theme/icons/tangaroa-64.png` (also 48, 32) |
| Screenshots | `docs/images/tangaroa-light.png`, `docs/images/tangaroa-dark.png` (test profile, fictional accounts) |
| Preview | `theme/preview.png` is inside the XPI; ATN may also generate its own from the manifest colours |

## Summary (English, ≤ 250 characters)

The Postbox Tangaroa look for Thunderbird: dark navy folder pane, light list and reading area, orange unread badges. Includes a dark variant that follows the system colour scheme. Works in table and card views.

## Summary (Russian)

Оформление Postbox Tangaroa для Thunderbird: тёмно-синяя панель папок, светлые список и область чтения, оранжевые счётчики. Есть тёмный вариант, следующий за цветовой схемой системы. Работает в табличном виде и в карточках.

## Description (English)

Tangaroa reproduces the look of the Postbox mail client with its Tangaroa theme in Thunderbird: a dark navy folder pane, a light message list and reading area, orange unread badges, blue selection and the system font. It was made after Postbox stopped being updated, to keep the familiar look of mail in Thunderbird. The stylesheet is adapted from Postbird (MIT) with the Tangaroa palette.

- Light variant: the Postbox Tangaroa palette unchanged.
- Dark variant: based on Postbox Midnight with Tangaroa's key colours. The theme follows the system colour scheme; nothing to configure.
- Styles the main window in table and card views: toolbar, tabs, folder pane, message list, message header, quick filter, menus, status bar.
- Pairs with the AccountPane extension, which adds a Postbox-style account list above the folder pane: https://github.com/stupalov/thunderbird-account-pane

Known limitation: in the dark variant the body of an open message keeps Thunderbird's own dark-reader colours; a theme cannot style message content. The toggle in the message header shows a message in light colours.

Requires Thunderbird 157 or newer. Beta: checked on Thunderbird 158 on macOS and Windows 11. Independent project, not affiliated with Thunderbird or Postbox.

## Description (Russian)

Tangaroa воспроизводит в Thunderbird оформление почтового клиента Postbox с темой Tangaroa: тёмно-синяя панель папок, светлые список писем и область чтения, оранжевые счётчики непрочитанных, голубое выделение и системный шрифт. Тема сделана после того, как Postbox перестал обновляться, чтобы сохранить привычный вид почты в Thunderbird. Стили адаптированы из Postbird (MIT) с палитрой Tangaroa.

- Светлый вариант: палитра Postbox Tangaroa без изменений.
- Тёмный вариант: на основе Postbox Midnight с ключевыми цветами Tangaroa. Тема следует цветовой схеме системы, настраивать ничего не нужно.
- Оформляет главное окно в табличном виде и в карточках: панель инструментов, вкладки, панель папок, список писем, заголовок письма, быстрый фильтр, меню, строку состояния.
- Сочетается с расширением AccountPane, добавляющим список аккаунтов над панелью папок, как в Postbox: https://github.com/stupalov/thunderbird-account-pane

Известное ограничение: в тёмном варианте тело открытого письма остаётся в цветах тёмного режима чтения Thunderbird; тема не может оформлять содержимое письма. Переключатель в заголовке письма показывает его в светлых цветах.

Требуется Thunderbird 157 или новее. Бета: проверено на Thunderbird 158 на macOS и Windows 11. Независимый проект, не связан с Thunderbird и Postbox.

## Notes to reviewer (English)

- Static theme: `manifest.json` with `theme`, `dark_theme` and `theme_experiment`; no scripts, no permissions, no network access.
- `theme_experiment.stylesheet` (`tangaroa.css`) styles the main window (`messenger.xhtml`, `about:3pane`, `about:message`) using Thunderbird's own CSS variables and plain DOM selectors; custom `tg_*` colour keys are mapped to `--tg-*` variables. The light/dark palettes come from Postbox theme exports (colour values only); no Postbox assets are included.
- `preview.png` at the XPI root is the theme card preview.
- Source: https://github.com/stupalov/thunderbird-tangaroa (tag v0.2.1); reproducible build via `scripts/build.py`, 18 tests via `node --test tests/*.test.mjs`; SHA-256 in the GitHub release notes.
- `strict_max_version` is `*` on purpose; a manifest-only update can set an explicit maximum if required.

## Privacy statement (if the form asks)

Tangaroa is a theme. It contains no code, collects no data and makes no network requests.
