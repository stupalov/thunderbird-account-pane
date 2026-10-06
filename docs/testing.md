# AccountPane testing

Target: Thunderbird 157.0.1 on macOS with Apple Silicon. The packaged compatibility
range is 157.0.1–157.*; other releases remain unverified.

Automated checks use Node.js 24 built-in tests and Python 3, with no dependencies:

```sh
node --test tests/*.test.mjs
python3 scripts/build.py
```

The builder emits `dist/accountpane-0.1.0.xpi` and its SHA-256. It includes only
explicitly listed addon files, validates JSON and manifest references, rejects
symlinks, and excludes test fixtures, documentation, profiles and Git metadata.
Rebuilding unchanged inputs produces identical bytes.

## Native acceptance remains pending

Synthetic tests and read-only native source inspection have passed during
implementation. No live installation or test-profile acceptance has been
performed. Obtain explicit approval for the Experiment's unrestricted access
prompt before installing this concrete XPI. The `storage` permission shown in the
manifest does not limit an Experiment's privileged native access.

Use a separate designated test profile; keep the working profile closed and
unchanged. Keep protective preferences intact. Do not weaken add-on signature,
Experiment, or security preferences to bypass an installation refusal. If the
application declines installation, record the reason and stop that path.

Prepare only synthetic IMAP/POP accounts, Local Folders, and disposable test
messages. Do not copy private profiles, passwords, mail, account labels or URIs
into the repository, logs, screenshots or release artifacts. Only synthetic
messages may be moved during acceptance.

## Native checks on the approved test profile

1. Start with existing mail tabs and open another mail tab while initialization
   is pending. AccountPane should attach once per initialized `about:3pane`
   document, after Thunderbird restores the current native folder. Message,
   calendar and other tabs should stay untouched. Close a pending tab and
   disable the add-on during startup; no late pane should appear.
2. In All Folders and Favorites, select each synthetic account and All Accounts.
   Verify native folder ordering, indentation, collapsing, multiselection,
   focus, arrow keys and Tab navigation. Test a favorite-only account with no
   visible folder row; the interface should fall back to All Accounts.
3. Navigate from another native UI surface into a different account's folder.
   Restricted selection should follow its owner before native row selection.
   All Accounts should remain unrestricted. Unsupported tree modes should
   leave the native tree usable.
4. Open two mail tabs, switch accounts quickly, and open different synthetic
   folders. Each tab should retain its own runtime choice; shared persisted
   history should retain each latest actual folder opening. Restart the add-on
   and verify current native folder ownership takes precedence at attachment.
5. Rename/delete a synthetic remembered folder and remove a synthetic account.
   Verify a same-account navigable fallback or All Accounts; no stuck hidden
   tree should remain. Toggle Local Folders visibility and rebuild native tree
   modes; observe that restrictions refresh.
6. Disable the add-on with open and loading tabs. Check that the account list,
   added style, tree wrappers, observers, tab monitors and listeners are gone,
   native selection is available, and user CSS is unchanged. Re-enable and
   verify one attachment per document. Repeat with another add-on modifying
   the same native hook: unsupported hooks must leave the native pane usable.

Document outcomes with synthetic fixture descriptions and fixed diagnostic
codes only. UI layout, native observer timing, shutdown cleanup, keyboard and
cross-extension behavior require these live checks; automated checks do not
claim them passed.
