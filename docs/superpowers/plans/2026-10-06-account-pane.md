# AccountPane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Отделить аккаунты от папок в левой панели Thunderbird и показывать папки выбранного аккаунта с обратимым возвратом к штатному интерфейсу.

**Architecture:** Сохранить штатное дерево Thunderbird и добавить над ним отдельный список аккаунтов. Чистая модель выбора отделена от адаптера Thunderbird, управления вкладками и стилей. Небольшой Experiment API подключает контроллер к почтовым вкладкам; все временные изменения интерфейса имеют парную очистку.

**Tech Stack:** JavaScript без сторонних зависимостей, Thunderbird Experiment API, HTML/CSS, локальные JSON-настройки в storage.local, Node.js built-in test runner, Python 3 для упаковки XPI.

**Spec:** [Согласованная спецификация](../specs/2026-10-06-account-pane-design.md).

## Global Constraints

- Название расширения: **AccountPane**.
- Репозиторий: `stupalov/thunderbird-account-pane`, приватный.
- Первой целевой конфигурацией является Thunderbird 157.0.1 на macOS с Apple Silicon.
- Первая версия проверяется с используемыми сейчас режимами «Избранные» и «Все папки».
- Чат-аккаунты и POP-аккаунты с перенаправлением в другой аккаунт не дублируются.
- В первой версии нет пользовательских групп, перестановки аккаунтов, отдельной панели инструментов, аватаров отправителей или изменений списка писем.
- Существующие пользовательские файлы CSS дополнение не переписывает.
- Не создаются, не удаляются и не перемещаются реальные папки или письма.
- Не меняются настройки серверов, идентификаторы аккаунтов, парольные файлы и глобальные флаги видимости серверов.
- В коде не должно быть внешних сетевых запросов, телеметрии, чтения содержимого писем или работы с паролями.
- Тестовые перемещения выполняются только на специально созданных тестовых письмах.
- Без Postbird Tangaroa используются штатные переменные оформления Thunderbird.
- Приватные профили и данные аккаунтов не попадают в Git, логи, скриншоты публикаций или артефакты сборки.

## Review Focus

1. Переход к папке другого аккаунта извне: ограничение переключается до штатного выбора строки; в «Все аккаунты» ограничение не возникает. Проверки: задачи 1, 2 и 4.
2. Исчезнувший аккаунт, переименованная или удалённая последняя папка: нет зависшего выбора; используется существующая папка того же аккаунта. Проверки: задачи 1 и 4.
3. Две вкладки, быстрое переключение и запоздалое сохранение: одна вкладка не меняет выбор другой, старый результат не перезаписывает новый. Проверки: задачи 4 и 5.
4. Скрытые строки, мультивыбор и раскрытие ветвей: клавиатура не попадает в чужие папки, общий мультивыбор не теряет элементы. Проверки: задачи 2 и 6.
5. Обновление внутренних элементов, конфликт с другим расширением и отключение в середине запуска: штатное дерево остаётся доступным, не остаются обработчики и скрытые ветви. Проверки: задачи 2, 5 и 6.

---

## Исходное состояние и проверенные внутренние точки

Начальная версия репозитория содержит только README, CHANGELOG, LICENSE, .gitignore и спецификацию.
Рабочий Thunderbird проверен по локальному архиву приложения; исходники приложения не изменяются.

Проверенные файлы Thunderbird 157.0.1:

- `chrome/messenger/content/messenger/about3Pane.xhtml`: `#folderPane`, `#folderTree`, шаблоны режимов.
- `chrome/messenger/content/messenger/about3Pane.js`: `folderPane.activeModes`, `folderPane.getRowForFolder()`, `displayFolder()`, `ensureFolderTreeRowIsVisible()`, событие `folderURIChanged`.
- `chrome/messenger/content/messenger/tree-listbox-mixin.mjs`: getter `rows` исключает потомков свёрнутых ветвей, но **не** строки, скрытые CSS. `getRowAtIndex()` и клавиатурная навигация используют `rows`.
- `chrome/messenger/content/messenger/tabmail.js`: `registerTabMonitor()`, `unregisterTabMonitor()`, `onTabOpened()`, `onTabClosing()`.
- `modules/ExtensionSupport.sys.mjs`: подключение к уже открытым и новым окнам.
- `chrome/messenger/content/messenger/parent/ext-mailTabs.js`: внешний выбор папки вызывает `ensureFolderTreeRowIsVisible(row)` и затем `folderTree.updateSelection(row)`.

Это исходные точки адаптера, а не обещание совместимости с будущими версиями.
Во время реализации проверить дескрипторы и поведение на реальном тестовом профиле до подключения рабочего.

## Структура файлов

| Файл | Ответственность |
| --- | --- |
| `addon/manifest.json` | Идентификатор, версия, локализация, storage и Experiment API |
| `addon/background.js` | Загрузка и последовательное сохранение локальных настроек |
| `addon/lib/model.js` | Чистые функции фильтрации аккаунтов, выбора папки и состояния |
| `addon/experiment/schema.json` | Узкий интерфейс start/settingsChanged/onStateChanged |
| `addon/experiment/implementation.js` | Жизненный цикл Experiment и мост к background |
| `addon/experiment/lifecycle.js` | Подключение к окнам и почтовым вкладкам |
| `addon/experiment/thunderbird-adapter.js` | Аккаунты, папки и штатная навигация Thunderbird |
| `addon/experiment/tree-filter.js` | Обратимая фильтрация дерева и видимых строк |
| `addon/experiment/account-view.js` | Список аккаунтов, доступность и стили |
| `addon/experiment/controller.js` | Согласование модели, представления, дерева и событий |
| `addon/experiment/account-pane.css` | Только стили элементов AccountPane |
| `addon/_locales/en/messages.json`, `addon/_locales/ru/messages.json` | Подписи и описание |
| `tests/load-script.mjs` | Загрузка общих script-файлов в отдельный vm-контекст Node |
| `tests/model.test.mjs`, `tests/tree-filter.test.mjs` | Логика выбора и фильтрация |
| `tests/account-view.test.mjs`, `tests/controller.test.mjs` | Доступность и управление состоянием |
| `tests/lifecycle.test.mjs`, `tests/storage.test.mjs` | Окна, вкладки, очистка и порядок сохранений |
| `tests/fixtures.mjs` | Только искусственные аккаунты, папки и интерфейсные объекты |
| `scripts/build.py` | Упаковка только разрешённых файлов addon в XPI |
| `package.json` | Команды test и build, без зависимостей |
| `docs/testing.md` | Воспроизводимые проверки реального интерфейса |
| `README.md`, `CHANGELOG.md` | Статус реализации, установка и изменения |

Не создавать перечисленные продуктовые файлы на этапе составления плана.
Структура появляется по мере выполнения задач.

## Среда выполнения

Использовать Node.js 24 и Python 3. Если Node не доступен в PATH текущего чата,
получить путь к встроенному runtime через load_workspace_dependencies и запускать
его абсолютным путём. Для проверок и сборки npm не требуется; package.json
предоставляет только удобные команды для обычной установки Node.
Не устанавливать глобальные инструменты и сторонние зависимости.

## Общие интерфейсы реализации

Использовать обычные script-файлы с именованными экспортами в отдельном scope:
`AccountPaneModel`, `AccountPaneTreeFilter`, `AccountPaneView`,
`AccountPaneController`, `AccountPaneLifecycle`, `AccountPaneAdapter`.
Experiment загружает их через `Services.scriptloader.loadSubScript(url, scope)`;
тесты — через `node:vm`. Не загрязнять глобальный scope Thunderbird.

Форматы данных:

```js
// Account: id — ключ аккаунта; serverKey — ключ входящего сервера.
const account = {
  id: "account-a", serverKey: "server-a", name: "Fixture A",
  type: "imap", hidden: false, deferred: false, local: false
};
// Folder: иерархия сохраняет штатный порядок Thunderbird.
const folder = {
  uri: "mailbox://fixture-a/INBOX", accountId: "account-a",
  inbox: true, root: false, available: true
};
// Settings: null означает «Все аккаунты».
const settings = {
  version: 1, selectedAccountId: null,
  lastFolders: { "account-a": "mailbox://fixture-a/INBOX" }
};
// RuntimeState: отдельный объект на каждый about3Pane.
const state = { selectedAccountId: null };
```

Подписи аккаунтов и URI берутся только из текущего профиля и остаются локальными.
В фикстурах и документации использовать исключительно искусственные значения.

### Task 1: Модель выбора и запасных вариантов

**Files:** Create `addon/lib/model.js`, `tests/load-script.mjs`, `tests/fixtures.mjs`,
`tests/model.test.mjs`, `package.json`.

**Interfaces:**
- Produces: `AccountPaneModel.visibleAccounts(accounts)` → Account[].
- Produces: `AccountPaneModel.resolveTarget(accountId, folders, lastFolders)` → Folder|null.
- Produces: `AccountPaneModel.initialAccount(accounts, folderAccountId, savedAccountId)` → string|null.
- Produces: `AccountPaneModel.followFolder(selectedAccountId, folderAccountId)` → string|null.
- Produces: `AccountPaneModel.sanitizeSettings(settings, accounts, folders)` → Settings.
- Produces: `AccountPaneModel.allowsFiltering(modes)` → boolean; допускаются только all/favorite.
- Test fixtures: `makeTreeFixture(accountIds)`, `makeControllerFixture()`,
  `makeDelayedStorage()` определяются в tests/fixtures.mjs при добавлении соответствующих тестов.
  Первый возвращает дерево с native rows/getRowAtIndex/selection и options для attach;
  второй — controller с fake adapter и журналом displayCalls;
  третий — storage с get/set, value и releaseFirst(), задерживающим первую set.

- [ ] **Step 1:** Добавить загрузчик общей модели и тесты на выбор папки.

```js
import { readFileSync } from "node:fs";
import vm from "node:vm";
export function loadScript(path, exportName, extra = {}) {
  const scope = vm.createContext({ ...extra });
  vm.runInContext(readFileSync(path, "utf8"), scope, { filename: path });
  return scope[exportName];
}
```

```js
test("deleted previous folder falls back to flagged inbox", () => {
  const folders = [
    { uri: "fixture://a/root", accountId: "a", root: true, available: true },
    { uri: "fixture://a/renamed", accountId: "a", inbox: true, available: true }
  ];
  assert.equal(model.resolveTarget("a", folders, { a: "fixture://a/deleted" }).uri,
    "fixture://a/renamed");
});
test("all accounts remains unrestricted on external navigation", () => {
  assert.equal(model.followFolder(null, "b"), null);
  assert.equal(model.followFolder("a", "b"), "b");
});
test("restored folder wins over saved global account", () => {
  assert.equal(model.initialAccount([{ id: "a" }, { id: "b" }], "b", "a"), "b");
});
```

- [ ] **Step 2:** Запустить `node --test tests/model.test.mjs`; подтвердить ошибку отсутствующей модели.
- [ ] **Step 3:** Реализовать чистые функции. Не выбирать чужую папку из lastFolders.

```js
resolveTarget(accountId, folders, lastFolders) {
  const own = folders.filter(f => f.accountId === accountId && f.available);
  return own.find(f => f.uri === lastFolders[accountId]) ??
    own.find(f => f.inbox && !f.root) ??
    own.find(f => !f.root) ??
    own.find(f => f.root) ?? null;
}
```

- [ ] **Step 4:** Добавить проверки: скрытые серверы, chat/im, deferred POP,
Local Folders, отсутствие Inbox, пустой аккаунт, чужой URI, удалённый аккаунт,
повреждённые настройки и режимы unified/tags/recent. Проверять порядок исходного массива,
а не сортировать аккаунты по имени.
- [ ] **Step 5:** Повторить тест; ожидается PASS. `package.json` задаёт
`"test": "node --test tests/*.test.mjs"`, `"build": "python3 scripts/build.py"`, без dependencies.
- [ ] **Step 6:** Проверить `git diff --check` и сделать локальный коммит
`Add account selection and folder fallback model`.

### Task 2: Обратимая фильтрация штатного дерева

**Files:** Create `addon/experiment/tree-filter.js`, `tests/tree-filter.test.mjs`.
Extend `tests/fixtures.mjs` объектами fake tree/row.

**Interfaces:**
- Consumes: tree, `accountForRow(row): string|null`, `followTarget(accountId): void`.
- Produces: `AccountPaneTreeFilter.attach({ window, tree, accountForRow, followTarget })`
→ `{ apply(accountId), refresh(), dispose() }`.
- `accountId === null` снимает все добавленные ограничения.

- [ ] **Step 1:** Написать тест, где исходный getter rows возвращает папки двух аккаунтов,
а фильтр «a» возвращает только «a».

```js
test("filtered rows exclude foreign branches and restore exactly", () => {
  const fixture = makeTreeFixture(["a", "b"]);
  const original = fixture.tree.rows;
  const filter = filters.attach(fixture.options);
  filter.apply("a");
  assert.deepEqual(Array.from(fixture.tree.rows, r => r.accountId), ["a"]);
  filter.dispose();
  assert.deepEqual(Array.from(fixture.tree.rows), original);
  assert.equal(Object.hasOwn(fixture.tree, "rows"), false);
});
```

- [ ] **Step 2:** Запустить `node --test tests/tree-filter.test.mjs`; подтвердить FAIL до реализации.
- [ ] **Step 3:** Найти native getter rows по цепочке прототипов и сохранить own-дескрипторы
всех точек подключения. Добавить getter только экземпляру folderTree, не прототипу.

```js
Object.defineProperty(tree, "rows", {
  configurable: true,
  get() {
    const rows = nativeRowsGetter.call(tree);
    return selectedAccountId === null ? rows :
      rows.filter(row => accountForRow(row) === selectedAccountId);
  }
});
```

Внешний переход должен вызвать followTarget **до** native
`ensureFolderTreeRowIsVisible(row)` и `updateSelection(row, event)`.
Обёртки сохраняют this, аргументы, результат и исходные функции.
Для `swapSelection(rows)`: один аккаунт согласует ограничение,
несколько аккаунтов снимают его, сохраняя весь штатный мультивыбор.
Перед изменением проверять доступность методов и дескрипторов; при провале не подключаться.

- [ ] **Step 4:** Добавить каждому скрываемому элементу собственный атрибут
`data-accountpane-hidden`; обрабатывать серверные ветви all и отдельные папки favorite
по принадлежности реальному серверу, а не по тексту имени.

```css
#folderTree [data-accountpane-hidden="true"] {
  display: none !important;
}
```

Не присваивать server.hidden и не менять activeModes.
Наблюдать только изменения состава дерева; повторная разметка идемпотентна.
События изменения атрибутов AccountPane не должны создавать цикл наблюдения.

- [ ] **Step 5:** Проверить getter rowCount, getRowAtIndex, Home/End и свёрнутые ветви;
проверить All Accounts, внешний переход до native callback, mixed-account swapSelection,
динамически добавленный row и режим favorite без серверного предка.
- [ ] **Step 6:** Проверить повторный attach/dispose и конфликт обёрток:
восстанавливать дескриптор только если текущая обёртка всё ещё принадлежит AccountPane.
После dispose ранее захваченная сторонним кодом обёртка должна делегировать native
без фильтрации. Очистить только собственные атрибуты и observer.
- [ ] **Step 7:** Прогнать тесты и `git diff --check`; коммит
`Add reversible folder tree filtering`.

### Task 3: Представление списка аккаунтов

**Files:** Create `addon/experiment/account-view.js`, `addon/experiment/account-pane.css`,
`addon/_locales/en/messages.json`, `addon/_locales/ru/messages.json`,
`tests/account-view.test.mjs`.

**Interfaces:**
- Produces: `AccountPaneView.create({ document, folderPane, labels, onSelect, cssText })`
→ `{ render(accounts, selectedAccountId), dispose() }`.
- Consumes: Account[], выбранный id|null, callback `onSelect(accountId)`.
- labels: `{ accounts, allAccounts }`.

- [ ] **Step 1:** Написать тест render: первый пункт All Accounts, затем аккаунты
в исходном порядке, aria-selected выбранного аккаунта и отсутствие дубликатов после второго render.
Использовать минимальный fake DOM для контракта, не проверять детали CSS через fake DOM.
- [ ] **Step 2:** Запустить `node --test tests/account-view.test.mjs`; подтвердить FAIL.
- [ ] **Step 3:** Создать section `#accountpane-accounts` в существующем folderPane,
heading и listbox с option-строками. Имена добавлять через textContent.

```js
const label = document.createElement("span");
label.textContent = account.name;
option.setAttribute("role", "option");
option.setAttribute("aria-selected", String(account.id === selectedAccountId));
```

Click выбирает пункт. ArrowUp/ArrowDown/Home/End меняют фокус в списке;
Enter/Space выбирают текущий пункт. Tab переходит к штатному дереву.
Не использовать имена аккаунтов как HTML, селекторы, CSS-классы или DOM id.

- [ ] **Step 4:** Использовать scoped CSS и переменные с fallback.

```css
#accountpane-accounts {
  flex: 0 0 auto;
  max-height: 35%;
  min-height: 64px;
  color: var(--pb-sidebar-text, var(--sidebar-color, inherit));
  background: var(--pb-bg-sidebar, var(--sidebar-background, transparent));
  font-size: var(--pb-folder-name-size, inherit);
}
#accountpane-list {
  overflow-y: auto;
  max-height: min(28vh, 280px);
}
#accountpane-list [aria-selected="true"] {
  background: var(--pb-selection-bg, var(--treeitem-background-active, Highlight));
  color: var(--pb-selection-text, var(--treeitem-text-active, HighlightText));
}
```

При недостаточной высоте окна верхний список сжимается; штатному дереву
оставляется место и его собственная прокрутка.
Учитывать скрытую splitter-ом левую панель: её состояние не менять.
Проверить fallback системного шрифта и видимый :focus-visible.

- [ ] **Step 5:** Тестировать имя `<img src=x>` как обычный текст, переключение с клавиатуры,
dispose обработчиков и локализованные подписи. Реальную прокрутку и стили проверить в задаче 6.
- [ ] **Step 6:** Прогнать тесты и проверку diff; коммит
`Add accessible account list and theme styling`.

### Task 4: Контроллер навигации и локальное состояние

**Files:** Create `addon/experiment/controller.js`, `addon/experiment/thunderbird-adapter.js`,
`tests/controller.test.mjs`.

**Interfaces:**
- Consumes: model, filter, view и adapter:
`listAccounts(): Account[]`, `listFolders(accountId): Folder[]`,
`currentFolder(): Folder|null`, `activeModes(): string[]`,
`displayFolder(uri): void`, `onFolderChanged(callback): disposer`,
`onAccountsChanged(callback): disposer`, `onModesChanged(callback): disposer`.
- Produces: `AccountPaneController.create({ adapter, model, filter, view, settings, save })`
→ `{ selectAccount(id), followFolder(id), updateSettings(settings), dispose() }`.
- save принимает patch `{ selectedAccountId?, lastFolder?: { accountId, uri } }`;
каждая вкладка хранит runtime selectedAccountId отдельно.

- [ ] **Step 1:** Тестировать возвращение к последней папке через fake adapter.

```js
test("switching back restores each account folder", () => {
  const { controller, adapter } = makeControllerFixture();
  controller.selectAccount("a");
  adapter.emitFolder({ accountId: "a", uri: "fixture://a/commits" });
  controller.selectAccount("b");
  controller.selectAccount("a");
  assert.equal(adapter.lastDisplayedUri, "fixture://a/commits");
});
test("all accounts does not call displayFolder", () => {
  const { controller, adapter } = makeControllerFixture();
  controller.selectAccount(null);
  assert.equal(adapter.displayCalls.length, 0);
});
```

- [ ] **Step 2:** Запустить `node --test tests/controller.test.mjs`; подтвердить FAIL.
- [ ] **Step 3:** Реализовать порядок выбора: проверить режимы → определить target →
поменять runtime selection → обновить filter/view → вызвать adapter.displayFolder.
Сохранение последней папки идёт по событию фактического открытия, а не по намерению.

```js
function followFolder(accountId) {
  const next = model.followFolder(state.selectedAccountId, accountId);
  if (next === state.selectedAccountId) return;
  state.selectedAccountId = next;
  filter.apply(next);
  view.render(adapter.listAccounts(), next);
}
```

Смена режима за пределы all/favorite выбирает null без записи activeModes.
Вызов из tree-filter не должен повторно инициировать displayFolder.

- [ ] **Step 4:** Adapter использует MailServices.accounts.accounts в штатном порядке,
account.incomingServer, rootFolder и специальные nsMsgFolderFlags для Inbox.
Папки обходятся без открытия баз писем; при невозможности получить папку она пропускается.
URI последней папки валидируется на принадлежность аккаунту и существование.

- [ ] **Step 5:** Подключить folderURIChanged, prefs observer изменения списка аккаунтов
и folder listeners переименования/удаления папок. Изменение имён отражать при refresh;
аккаунт выбирать по стабильному ключу, не имени. Собственные observers снимать при dispose.
За изменением состава режимов следить по mode-контейнерам, без изменения XULStore.

- [ ] **Step 6:** Проверить удаление аккаунта, удаление/переименование папки,
две вкладки с разными выборами, быстрые a→b→a, external navigation, неподдерживаемый режим,
первое подключение с текущей папкой и пустые Local Folders.
При получении обновлённых общих settings не перезаписывать runtime selection другой вкладки.
- [ ] **Step 7:** Тесты и diff должны пройти; коммит
`Connect account navigation and local folder history`.

### Task 5: Experiment, вкладки, настройки и первая сборка

**Files:** Create `addon/manifest.json`, `addon/background.js`,
`addon/experiment/schema.json`, `addon/experiment/implementation.js`,
`addon/experiment/lifecycle.js`, `tests/lifecycle.test.mjs`,
`tests/storage.test.mjs`, `scripts/build.py`, `docs/testing.md`.

**Interfaces:**
- Experiment `accountPane.start(settings)` подключает контроллеры.
- Experiment `accountPane.settingsChanged(settings)` обновляет доступную историю папок.
- Experiment Event `accountPane.onStateChanged` отдаёт только локальный settings patch.
- Lifecycle `AccountPaneLifecycle.create({ hooks, attachPane })` →
`{ start(), dispose() }`; `attachPane(window)` возвращает disposer.
- Produces: `AccountPaneStorage.createWriter(storage, initialSettings)` →
  `{ save(patch), flush() }`, именованный экспорт из background.js для vm-тестов.
- Settings save queue принимает patches и сохраняет Settings целиком последовательно.

- [ ] **Step 1:** Написать тесты lifecycle: уже открытая вкладка, новая вкладка,
закрытие, повторный запуск, dispose до загрузки about3Pane и несовместимый pane.
Проверить, что attach вызывается один раз на документ, а каждый disposer — один раз.
- [ ] **Step 2:** Добавить тест сохранений с искусственно задержанной первой записью.

```js
test("queued writes preserve latest account and both folder histories", async () => {
  const storage = makeDelayedStorage();
  const writer = storageModule.createWriter(storage, {
    version: 1, selectedAccountId: null, lastFolders: {}
  });
  writer.save({ selectedAccountId: "a",
    lastFolder: { accountId: "a", uri: "fixture://a/one" } });
  writer.save({ selectedAccountId: "b",
    lastFolder: { accountId: "b", uri: "fixture://b/two" } });
  storage.releaseFirst();
  await writer.flush();
  assert.equal(storage.value.selectedAccountId, "b");
  assert.equal(storage.value.lastFolders.a, "fixture://a/one");
  assert.equal(storage.value.lastFolders.b, "fixture://b/two");
});
```

- [ ] **Step 3:** Подтвердить FAIL обоих тестов, затем реализовать очередь:
chain.then(() => merge(currentSettings, patch)).then(storage.set).
После ошибки сохранения интерфейс продолжает работать; следующий patch не теряется.
В диагностике выводить фиксированный код ошибки без URI и содержимого settings.

- [ ] **Step 4:** Manifest задаёт имя AccountPane, id `accountpane@stupalov.github.io`,
версию 0.1.0, default_locale en, permission storage, один Experiment API.
Начальный strict_min_version 157.0.1, strict_max_version 157.*.
Не расширять диапазон, пока не проверена другая ветка Thunderbird.

```json
{
  "manifest_version": 2,
  "name": "AccountPane",
  "version": "0.1.0",
  "default_locale": "en",
  "description": "__MSG_extensionDescription__",
  "permissions": ["storage"],
  "background": { "scripts": ["background.js"] },
  "browser_specific_settings": {
    "gecko": {
      "id": "accountpane@stupalov.github.io",
      "strict_min_version": "157.0.1",
      "strict_max_version": "157.*"
    }
  },
  "experiment_apis": {
    "accountPane": {
      "schema": "experiment/schema.json",
      "parent": {
        "scopes": ["addon_parent"],
        "paths": [["accountPane"]],
        "script": "experiment/implementation.js"
      }
    }
  }
}
```

- [ ] **Step 5:** Background сначала регистрирует onStateChanged, затем загружает
storage.local и вызывает start. Experiment получает labels из extension.localeData,
загружает script-файлы в собственный scope и CSS текст в память без сетевого доступа.
Интерфейс Event реализуется через ExtensionCommon.EventManager.

Lifecycle использует ExtensionSupport для messenger.xhtml и tabmail tab-monitor.
Проверяет существующие tabInfo и browser.contentWindow; attach выполняется только
для about3Pane с готовыми folderPane/folderTree.
Для ещё загружающегося browser использовать одноразовый load listener и повторную проверку.
Прекратить ожидание при закрытии вкладки, отключении или несовместимости.

- [ ] **Step 6:** onShutdown снимает window listeners, tab monitors, load listeners,
контроллеры и observers; при отключении вне завершения приложения вызывает
`Services.obs.notifyObservers(null, "startupcache-invalidate", null)`.
Не изменять чужие обработчики и пользовательские CSS.

- [ ] **Step 7:** scripts/build.py берёт только заранее перечисленные addon-файлы,
проверяет JSON и ссылки manifest, создаёт `dist/accountpane-0.1.0.xpi`.
Не архивировать каталог профиля, docs, тесты, .git или произвольные untracked-файлы.

```python
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for relative in sorted(allowed_files):
        path = addon_root / relative
        if not path.is_file() or path.is_symlink():
            raise ValueError("Missing or unsafe build input")
        archive.write(path, relative)
```

- [ ] **Step 8:** `node --test tests/*.test.mjs`, syntax checks всех JS и `python3 scripts/build.py`
завершаются успешно. Перечитать zip manifest, проверить версию, id и SHA-256.
Записать условия тестового профиля в docs/testing.md; не объявлять live-проверки пройденными.
Коммит `Package AccountPane and manage extension lifecycle`.

### Task 6: Проверка реального Thunderbird и подготовка установки

**Files:** Modify `docs/testing.md`, `README.md`, `CHANGELOG.md`;
при обнаруженных дефектах — только затронутые addon/test файлы.

**Interfaces:** Готовый XPI задачи 5, тестовая конфигурация Thunderbird 157.0.1
и согласованная спецификация.

- [ ] **Step 1:** До установки получить согласие на новый Experiment full-access prompt.
Предъявить конкретную собранную версию, её исходники, набор доступа и путь отката.
Не отключать проверку подписей, другие защитные настройки или Gatekeeper для обхода ошибки.
До согласия продолжать только сборку и независимые проверки.

- [ ] **Step 2:** В отдельном тестовом профиле подготовить искусственные папки
и почтовые аккаунты без реальных серверов/паролей. Не копировать личный профиль в Git.
Для проверки нескольких аккаунтов допустимы локальные offline POP-конфигурации
с отключёнными проверками почты и разными локальными хранилищами.
Все действия с приложением выполнять через разрешённое native UI управление.

- [ ] **Step 3:** Установить XPI и проверить: All Accounts, два аккаунта, nested folders,
favorite mode, отсутствие Inbox и пустые Local Folders. Следить за тем, что штатные
счётчики и выбранная папка соответствуют видимой строке.

- [ ] **Step 4:** Проверить keyboard ArrowUp/Down/Home/End/PageUp/PageDown,
раскрытие, контекстное меню, внешний переход и смешанный мультивыбор.
Перетаскивать только искусственное тестовое письмо между тестовыми папками.
Убедиться, что перенос исполняется штатным Thunderbird ровно один раз.

- [ ] **Step 5:** Перезапустить Thunderbird; открыть вторую почтовую вкладку и окно;
проверить независимость выбора, last folder и быстрые переключения.
Поменять штатный режим на unified, затем вернуть all/favorite:
дополнение остаётся в All Accounts до явного выбора аккаунта.

- [ ] **Step 6:** Отключить и включить дополнение дважды. Проверить полное дерево,
исходные дескрипторы, отсутствие дублирующихся списков и правильную текущую папку.
Проверить закрытие вкладки в момент загрузки и fail-open при недоступной точке подключения.
Любой дефект сначала воспроизвести тестом либо точным live-сценарием, затем исправить.

- [ ] **Step 7:** Проверить штатную тему и Postbird Tangaroa: системный шрифт,
13 px в текущей Tangaroa, видимое выделение, узкое/низкое окно и две независимые прокрутки.
Проверить Conversations 4.3.16 в тестовой конфигурации или согласованном рабочем профиле,
не используя отправку реальной почты.

- [ ] **Step 8:** Для рабочего профиля перед установкой закрыть Thunderbird и
сохранить резервную копию затрагиваемых UI-настроек и данных дополнения.
Не копировать профиль для тестирования в более старую версию Thunderbird.
После установки подтвердить AccountPane 0.1.0 active=true и его наличие в интерфейсе.
Показать пользователю результат без публикации личных адресов и писем.

- [ ] **Step 9:** Обновить README установкой, отключением, доступом и точной проверенной версией;
CHANGELOG — фактически реализованным поведением; docs/testing.md — результатами,
которые действительно проверены. Открытые ограничения перечислить явно.
Коммит `Document verified AccountPane installation and behaviour`.

## Критерии завершения

- Каждое согласованное требование имеет проверку в задачах 1–6.
- Автоматические тесты, syntax checks и сборка прошли на окончательном коде.
- XPI не содержит профиля, почты или секретов.
- Live UI проверка подтверждает переключение аккаунтов, клавиатуру и штатные действия папок.
- Отключение восстанавливает обычную панель.
- Название, код и штатное оформление не привязаны к Tangaroa.
- Пользователь получает XPI, короткую инструкцию и точные ограничения совместимости.

## История Git и публикация

Каждая задача заканчивается небольшим локальным коммитом только после проверок.
Изменения для пользователя группируются по смыслу; без AI-trailers и произвольных
сопутствующих правок. Перед публикацией проверить diff и отсутствие приватных данных.
Исходники и документы отправляются в существующий приватный репозиторий;
сборки публикуются только после проверки и отдельного согласования способа доставки.

## Самопроверка плана

- Интерфейс и доступность: задача 3; штатное дерево и keyboard semantics: задача 2.
- Папки, favorites, All Accounts и unsupported modes: задачи 1, 2, 4 и 6.
- Вкладки, сохранение и удаление аккаунтов/папок: задачи 1, 4, 5 и 6.
- Стили, отсутствие изменения CSS и тема по умолчанию: задачи 3 и 6.
- Ограничения доступа, cleanup и fail-open: задачи 2, 5 и 6.
- Версия, упаковка и инструкции: задачи 5 и 6.
- Пять Review Focus связаны с конкретными тестами и live-сценариями.
- Общие имена интерфейсов совпадают между задачами.
- Параллельная реализация не требуется: компоненты используют последовательные интерфейсы.

## Следующий шаг

План ожидает проверки пользователем. Рекомендованное выполнение — последовательно
в текущем чате одним исполнителем, с проверкой после каждой задачи.
Продуктовый код и установка начинаются после подтверждения плана.
