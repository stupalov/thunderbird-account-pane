import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'docs/images');
const viewPath = resolve(root, 'addon/experiment/account-view.js');
const cssPath = resolve(root, 'addon/experiment/account-pane.css');
const viewSource = await readFile(viewPath, 'utf8');
const cssText = await readFile(cssPath, 'utf8');

if (/--pb-[\w-]+/.test(cssText)) {
  throw new Error('account-pane.css still contains --pb-* variables; wait for the CSS cleanup before rendering previews.');
}

const labels = {
  accounts: 'Accounts', allAccounts: 'All Accounts',
  collapseAccounts: 'Collapse accounts', expandAccounts: 'Expand accounts',
  unreadCount: '{count} unread', totalCount: '{count} messages',
  newMessages: 'new messages'
};
const accounts = [
  { id: 'personal', name: 'Personal', type: 'imap' },
  { id: 'work', name: 'Work', type: 'imap' },
  { id: 'local', name: 'Local Folders', type: 'none', local: true }
];
const folderSets = {
  light: [
    ['Inbox', '6'], ['Drafts', ''], ['Sent', ''],
    ['Archive', ''], ['Projects', ''], ['Junk', '4'], ['Trash', '']
  ],
  dark: [
    ['Personal', [['Inbox', '38'], ['Drafts', ''], ['Sent', ''], ['Archive', '']]],
    ['Work', [['Inbox', '6'], ['Drafts', ''], ['Sent', ''], ['Clients', '']]],
    ['Local Folders', [['Inbox', ''], ['Outbox', ''], ['Archives', '']]]
  ]
};

function row(label, count = '', depth = 0, selected = false) {
  return `<li class="native-folder${selected ? ' is-selected' : ''}" style="--folder-depth:${depth}"><span class="folder-glyph" aria-hidden="true"></span><span class="folder-label">${label}</span><span class="folder-count">${count}</span></li>`;
}

function folderMarkup(mode) {
  if (mode === 'light') {
    const favorites = [['Inbox', '6'], ['Projects', '']];
    return `<div class="native-mode-name mode-name">Favorite Folders</div><ul class="native-tree simplified-favorite">${favorites.map(([name, count], index) => row(name, count, 0, index === 0)).join('')}</ul><div class="native-mode-name mode-name">All Folders</div><ul class="native-tree">${folderSets.light.map(([name, count]) => row(name, count, 0, false)).join('')}</ul>`;
  }
  return `<div class="native-mode-name mode-name">All Folders</div><ul class="native-tree">${folderSets.dark.map(([name, folders]) => `<li class="native-account"><div class="native-account-name"><span class="folder-glyph"></span>${name}</div><ul>${folders.map(([folder, count], index) => row(folder, count, 1, name === 'Work' && index === 0)).join('')}</ul></li>`).join('')}</ul>`;
}

function pageMarkup(mode) {
  const dark = mode === 'dark';
  const description = dark
    ? 'See every account at a glance, then continue in the familiar folder tree below.'
    : 'Choose an account to focus its folders. Favorites are shown as a compact folder list.';
  return `<!doctype html><html lang="en" data-theme="${dark ? 'dark' : 'light'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AccountPane preview</title><style>
    :root { color-scheme: ${dark ? 'dark' : 'light'}; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 700px; padding: 34px; background: ${dark ? '#171b22' : '#eef2f7'}; color: ${dark ? '#e9edf4' : '#263246'}; }
    .layout { width: 1032px; margin: 0 auto; display: grid; grid-template-columns: 310px 1fr; gap: 34px; align-items: center; }
    .mail-window { overflow: hidden; border-radius: 13px; box-shadow: 0 20px 55px #11182738; border: 1px solid ${dark ? '#3d4652' : '#d5dce6'}; background: ${dark ? '#242a33' : '#fff'}; }
    .chrome { height: 37px; padding: 0 13px; display: flex; align-items: center; gap: 7px; background: ${dark ? '#303742' : '#f5f7fa'}; border-bottom: 1px solid ${dark ? '#414a57' : '#e2e7ee'}; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: ${dark ? '#657080' : '#b7c0cc'}; }
    .window-title { margin-left: 5px; color: ${dark ? '#aeb8c7' : '#677589'}; font-size: 11px; }
    .content { min-height: 585px; }
    .folder-pane { overflow: hidden; background: ${dark ? '#20252d' : '#fff'}; color: ${dark ? '#d7dce5' : '#304057'}; font: 13px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    #folderTree { padding: 0 0 9px; }
    .native-mode-name { padding: 14px 14px 8px; color: ${dark ? '#b0bac9' : '#718096'}; font-size: 12px; font-weight: 650; }
    .native-section-name { padding: 8px 14px 5px; color: ${dark ? '#b0bac9' : '#718096'}; font-size: 11px; font-weight: 650; }
    .native-tree, .native-tree ul { list-style: none; margin: 0; padding: 0; }
    .native-account-name { height: 29px; padding: 0 12px; display: flex; align-items: center; gap: 8px; color: ${dark ? '#dce2eb' : '#34445a'}; font-weight: 600; }
    .native-folder { height: 28px; padding: 0 12px 0 calc(15px + var(--folder-depth) * 17px); display: flex; align-items: center; gap: 8px; }
    .native-folder.is-selected { margin: 0 5px; padding-left: calc(10px + var(--folder-depth) * 17px); border-radius: 4px; background: ${dark ? '#354b69' : '#e6f0ff'}; color: ${dark ? '#f0f5ff' : '#164f9b'}; }
    .folder-glyph { position: relative; width: 14px; height: 10px; flex: 0 0 14px; border: 1.4px solid ${dark ? '#9ba9bb' : '#7a8ba1'}; border-radius: 2px; opacity: .88; }
    .folder-glyph::before { content: ''; position: absolute; left: 1px; top: -3px; width: 6px; height: 3px; border: 1.2px solid ${dark ? '#9ba9bb' : '#7a8ba1'}; border-bottom: 0; border-radius: 2px 2px 0 0; }
    .folder-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .folder-count { color: ${dark ? '#8995a6' : '#8793a4'}; font-size: 11px; }
    .caption { align-self: center; }
    .eyebrow { margin: 0 0 10px; color: ${dark ? '#91b8ee' : '#3a72ba'}; text-transform: uppercase; letter-spacing: .13em; font-size: 10px; font-weight: 700; }
    h1 { margin: 0 0 12px; font-size: 26px; line-height: 1.15; letter-spacing: -.025em; }
    .caption p { max-width: 380px; margin: 0; color: ${dark ? '#adb7c5' : '#627186'}; font-size: 14px; line-height: 1.65; }
    .caption .demo { margin-top: 18px; font-size: 11px; color: ${dark ? '#7f8b9c' : '#8995a5'}; }
  </style><style id="native-theme-tokens">
    /* Fixture values represent Thunderbird's native light and dark folder-pane theme tokens. */
    html[data-theme="light"] #folderPane { --sidebar-color:#304057; --sidebar-background:#fff; --sidebar-border:#e2e7ee; --folder-mode-name-padding:6px; --list-item-min-height:28px; --list-item-buttons-size:22px; --list-container-border:transparent; --list-container-border-hover:#d8e1ec; --list-container-border-selected-focused:transparent; --treeitem-background-hover:#f2f6fb; --treeitem-background-active:#e6f0ff; --treeitem-text-active:#164f9b; --folderpane-unread-count-background:#e8edf4; --folderpane-unread-count-text:#43536a; --folderpane-total-count-background:#e8edf4; --folderpane-total-count-text:#43536a; --folder-color-folder:#647a96; }
    html[data-theme="dark"] #folderPane { --sidebar-color:#d7dce5; --sidebar-background:#20252d; --sidebar-border:#414a57; --folder-mode-name-padding:6px; --list-item-min-height:28px; --list-item-buttons-size:22px; --list-container-border:transparent; --list-container-border-hover:#566273; --list-container-border-selected-focused:transparent; --treeitem-background-hover:#2d3540; --treeitem-background-active:#354b69; --treeitem-text-active:#f0f5ff; --folderpane-unread-count-background:#51657f; --folderpane-unread-count-text:#f2f5f9; --folderpane-total-count-background:#51657f; --folderpane-total-count-text:#f0f5ff; --folder-color-folder:#a9bbd4; }
  </style></head><body><main class="layout"><section class="mail-window" aria-label="Illustrative mail application panel"><div class="chrome"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="window-title">Mail · AccountPane preview</span></div><div class="content"><div class="folder-pane" id="folderPane"><section id="folderTree">${folderMarkup(mode)}</section></div></div></section><section class="caption"><p class="eyebrow">AccountPane · ${dark ? 'Dark theme' : 'Light theme'}</p><h1>${dark ? 'All accounts, in one view' : 'Focus on one account'}</h1><p>${description}</p><p class="demo">Preview • demo accounts · fictional data only</p></section></main><script>${viewSource}</script><script>
    const view = AccountPaneView.create({ document, folderPane: document.getElementById('folderPane'), labels: ${JSON.stringify(labels)}, onSelect() {} , cssText: ${JSON.stringify(cssText)} });
    view.render(${JSON.stringify(accounts)}, ${JSON.stringify(dark ? null : 'work')});
    view.setExpanded(true);
    view.updateCounts({ showTotal: false, accounts: { personal: { unread: 38, total: 9487 }, work: { unread: 6, total: 2376 }, local: { unread: 0, total: 3144 } } });
    for (const icon of document.querySelectorAll('.accountpane-disclosure-icon')) icon.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="m3 6 5 5 5-5" fill="none" stroke="${dark ? '#f0f5ff' : '#304057'}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  </script></body></html>`;
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.ACCOUNTPANE_PREVIEW_CHROME });
try {
  for (const mode of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 1 });
    await page.setContent(pageMarkup(mode), { waitUntil: 'domcontentloaded' });
    await page.locator('#accountpane-list').waitFor({ state: 'visible' });
    const report = await page.evaluate(async (mode) => {
      const panel = document.querySelector('.mail-window');
      const heading = document.querySelector('#accountpane-heading');
      const selected = document.querySelector('#accountpane-list [aria-selected="true"]');
      const panelRect = panel.getBoundingClientRect();
      const inspectEntry = selected || document.querySelector('.accountpane-child');
      const originalSelection = selected?.getAttribute('aria-selected') || 'false';
      if (!selected) inspectEntry.setAttribute('aria-selected', 'true');
      const selectedRow = inspectEntry.querySelector('.accountpane-row');
      const badge = document.querySelector('.accountpane-unread-count:not(:empty)');
      const colorSnapshot = () => ({
        selectedBackground: getComputedStyle(selectedRow).backgroundColor,
        badgeBackground: getComputedStyle(badge).backgroundColor,
        headingSize: getComputedStyle(heading).fontSize,
        headingWeight: getComputedStyle(heading).fontWeight
      });
      const originalTheme = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = originalTheme === 'light' ? 'dark' : 'light';
      await new Promise(requestAnimationFrame);
      const switchedColors = colorSnapshot();
      document.documentElement.dataset.theme = originalTheme;
      await new Promise(requestAnimationFrame);
      const restoredColors = colorSnapshot();
      const tokenStyle = document.getElementById('native-theme-tokens');
      const tokenCss = tokenStyle.textContent;
      tokenStyle.remove();
      const fallbackColors = colorSnapshot();
      const restoredTokenStyle = document.createElement('style');
      restoredTokenStyle.id = 'native-theme-tokens';
      restoredTokenStyle.textContent = tokenCss;
      document.head.append(restoredTokenStyle);
      if (!selected) inspectEntry.setAttribute('aria-selected', 'false');
      return {
        viewRendered: Boolean(heading && document.querySelectorAll('#accountpane-list [role="treeitem"]').length === 4),
        heading: heading?.textContent,
        selected: originalSelection === 'true' ? selected?.querySelector('.accountpane-name')?.textContent : undefined,
        panelWidth: Math.round(panelRect.width),
        overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
        badgeVisible: Boolean(badge && badge.getBoundingClientRect().width > 0),
        switchedColors,
        restoredColors,
        fallbackColors,
        fixtureThemeTokens: 'checked through theme switch and removed for fallback check'
      };
    }, mode);
    const expectedSelected = mode === 'light' ? 'Work' : 'All Accounts';
    if (!report.viewRendered || report.panelWidth !== 310 || report.overflow || !report.badgeVisible ||
        report.restoredColors.headingSize === '16px' ||
        report.switchedColors.selectedBackground === report.restoredColors.selectedBackground ||
        report.switchedColors.badgeBackground === report.restoredColors.badgeBackground ||
        report.fallbackColors.headingSize === '16px' || report.fallbackColors.badgeBackground === 'rgba(0, 0, 0, 0)' ||
        report.restoredColors.headingWeight !== '650') {
      throw new Error(`${mode} preview visual check failed: ${JSON.stringify(report)}`);
    }
    if (mode === 'light' && report.selected !== expectedSelected) throw new Error(`Expected Work selection: ${JSON.stringify(report)}`);
    if (report.selected !== expectedSelected) throw new Error(`Expected ${expectedSelected} selection: ${JSON.stringify(report)}`);
    await page.screenshot({ path: resolve(output, `accountpane-${mode}.png`) });
    console.log(`${mode}: ${JSON.stringify(report)}`);
    await page.close();
  }
} finally {
  await browser.close();
}
