# Developing AccountPane

[User guide](../README.md) · [Русский](../README.ru.md) · [Testing journal](testing.md) · [Changelog](../CHANGELOG.md)

## Build and test

From the repository root, using Node.js 24 and Python 3:

```sh
node --test tests/*.test.mjs
python3 scripts/build.py
```

No third-party dependencies or npm installation are needed. The builder creates `dist/accountpane-<version>.xpi` and prints its SHA-256. On macOS, compare a supplied checksum with:

```sh
shasum -a 256 dist/accountpane-*.xpi
```

The package contains a fixed allowlist of 18 add-on files, including five PNG icon sizes. The source SVG, documentation, tests, profiles, mail, and secrets are not packaged. Unchanged inputs produce the same bytes across repeated builds. Generated XPI files are not source-controlled.

Keep the manifest, package metadata, builder's version validation/output path, and build tests in sync when changing versions. The add-on ID is `accountpane@stupalov.github.io`.

## Optional image tooling

The normal build and test commands above need no third-party dependencies. To regenerate the PNG icons from their SVG source and the documentation previews, install these optional tools from the repository root:

```sh
npm install --no-save --package-lock=false sharp playwright
npx playwright install chromium
node scripts/render-icons.mjs
node scripts/preview-accountpane.mjs
```

The icon script updates the five PNG sizes in `addon/icons/`. The preview script uses the actual AccountPane view and styles with fictional accounts and writes the light/dark images to `docs/images/`. These browser-rendered illustrations do not replace native Thunderbird checks. Review the generated images before committing them; optional tooling is not packaged in the XPI.

## Compatibility and integration

The current manifest sets `strict_min_version: "157.0"` and `strict_max_version: "*"`. The explicit wildcard keeps future Thunderbird updates from disabling the add-on solely because of a version cap. This is a forward-compatibility policy for the distributed XPI, not a claim that future internal APIs have been tested. Experiment extensions retain the explicit maximum field; compatibility policy for an add-on-directory submission must be reviewed separately. The Experiment installer compares platform versions: Thunderbird 157.0.1 reports a `Milestone` of 157.0, so a minimum of 157.0.1 incorrectly rejected that target. The manifest range is an installation boundary, not certification of every version or platform.

AccountPane integrates with Thunderbird's internal folder-pane APIs. Supported views are All, Favorites, Unread, Recent, Unified, and Tags. Selecting an account enables All Folders when needed, retaining the other enabled views. Mixed-account Unified/Tags aggregates are hidden for a selected account, while physical account folders remain available. All Accounts restores the native view. If required integration points are unavailable, the implementation is designed to leave the native pane available.

Account ordering uses `MailServices.accounts.reorderAccounts`. Only visible accounts are reordered; hidden, chat, and deferred-account slots retain their positions. Reordering persists in Thunderbird and is not reverted by disabling AccountPane.

Counter calculation starts from Thunderbird's recursive folder counts and subtracts each physical Junk branch once, including its descendants. Virtual folders are skipped during exclusion discovery because native recursive counts already skip them. A failed or inconsistent read stays unknown rather than becoming a misleading partial sum. Unread and total metrics are handled independently. Native folder-row counters are not modified.

The account heading and row geometry are derived from the native folder pane where available, with CSS fallbacks. Styling should use Thunderbird's native properties and theme-neutral fallbacks, without requiring another theme's private variables. Use the supplied previews as illustrations, not evidence of native theme compatibility.

## Permissions and local data

Experiment APIs trigger Thunderbird's full-access permission prompt. The implementation currently reads account/folder metadata, attaches reversible panel elements and handlers, and stores account selection, expansion state, and last-folder URIs in `storage.local`. It does not read message bodies/passwords or make external network requests. This describes current behavior; it does not restrict Experiment privileges.

Never commit personal profiles, account addresses, folder URIs, messages, passwords, or unredacted diagnostics. Documentation previews use fictional accounts.

## Validation

Run the automated suite and check the packaged files against the source allowlist. When changing behavior, also exercise the relevant native scenarios in [the testing journal](testing.md); an automated pass does not establish native acceptance.

Native testing has been limited to macOS. Earlier 0.1.0 beta testing covered core account/folder/history/tab behavior in a disposable profile, with additional-window, loading-race, conflict, and some keyboard scenarios left open. The 0.1.6 automatic suite passed 181 tests, but the GUI attempt timed out before installation; later metadata established that it was installed, not that its new interactions had been accepted. Version 0.1.7 passed 186 tests and a limited native smoke check: installation and a reduced account unread counter were observed while Spam's own counter remained. Incoming mail prevented confirmation of an exact numerical difference; the total counter and collapsed combined count were not checked in the UI.

Historical artifact hashes, sizes, installation failures, and per-scenario results remain in [docs/testing.md](testing.md). Do not interpret these historical checks as validation of a later build.

For experimental native checks, use a clearly identified disposable profile with fictional accounts and messages. Preserve the user's working profile, open conversations, and settings. Do not copy real mail or credential stores into a test fixture or repository. Record the exact tested build and distinguish a UI observation from static checks or mock tests.

Use Thunderbird's **Install Add-on From File…** to update an existing installation in place. An earlier remove-then-immediately-reinstall attempt left the add-on absent; its cause was not established. If standard disable/remove does not restore the folder pane, leave the add-on disabled and restart Thunderbird before investigating. Restore any local backup only with Thunderbird closed and without replacing mail or password stores.

## Design history

[Archived development changelog](development-history.md) preserves the original detailed notes.

- [Original specification](superpowers/specs/2026-10-06-account-pane-design.md)
- [Original implementation plan](superpowers/plans/2026-10-06-account-pane.md)

These documents capture the original design; current source and user documentation describe the present behavior.
