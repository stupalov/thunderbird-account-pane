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

The package contains a fixed allowlist of 19 add-on files, including five PNG icon sizes. The source SVG, documentation, tests, profiles, mail, and secrets are not packaged. Unchanged inputs produce the same bytes across repeated builds. Generated XPI files are not source-controlled.

To also build the variant for the add-on catalogue, run `python3 scripts/build.py --catalogue`. It writes `dist/accountpane-<version>-atn.xpi`, identical except that `update_url` is removed from the manifest (the catalogue rejects `update_url` for listed add-ons). `python3 scripts/update-manifest.py` then generates `dist/updates.json` from `dist/accountpane-<version>.xpi` (version and Gecko bounds from the manifest inside the XPI, SHA-256 of the file); it refuses the catalogue variant.

Keep the manifest, package metadata, builder's version validation/output path, and build tests in sync when changing versions. The add-on ID is `accountpane@stupalov.github.io`.

## Self-hosted updates and release checklist

The manifest's `update_url` is `https://github.com/stupalov/thunderbird-account-pane/releases/latest/download/updates.json`. GitHub redirects `releases/latest/download/<asset>` to the newest release's asset with that name, so `main` never changes for a release. Thunderbird follows the redirect, and needs no add-on signing; it verifies `update_hash` instead. If the redirect ever proves unreliable, fall back to committing `updates.json` under `updates/` on `main` and pointing `update_url` at `raw.githubusercontent.com`; this costs a commit per release.

**`releases/latest` ignores pre-releases** and answers 404 when a repository has only pre-releases. Publish every release that carries `updates.json` as a normal release (not "Set as a pre-release"), or the feed is not found.

Checklist for version X.Y.Z (first rule: the release must not be a pre-release; create it as a draft, attach both files, then publish, so there is no 404 window):

1. Bump the version in `addon/manifest.json`, `package.json`, the version pins in `scripts/build.py` and `tests/build.test.mjs`; update `CHANGELOG.md`.
2. `node --test tests/*.test.mjs`.
3. `python3 scripts/build.py --catalogue` builds `dist/accountpane-X.Y.Z.xpi` and `dist/accountpane-X.Y.Z-atn.xpi`.
4. `python3 scripts/update-manifest.py` generates `dist/updates.json`.
5. Create the tag `vX.Y.Z` and a draft GitHub release, publish it as a normal (non-pre-release) release after attaching; attach `accountpane-X.Y.Z.xpi` and `updates.json` (fixed name, exactly that). Attach the `-atn` XPI only if it is needed for a catalogue upload.
6. GitHub picks "latest" by the tagged commit date, so release from the newest commit. Check `curl -sIL https://github.com/stupalov/thunderbird-account-pane/releases/latest/download/updates.json` ends in 200 and the content matches.

Verification on a release: install the previous release's XPI (0.2.4 or later), publish a newer one, then Add-ons Manager → gear menu → **Check for Updates**. On failure, open the Error Console (Ctrl/Cmd+Shift+J) and look for `addons.update-checker` and `addons.xpi` warnings (set `extensions.logging.enabled` to true in the Config Editor for more detail): a 404 or parse error means the feed is unreachable (pre-release, wrong asset name); a hash mismatch means `updates.json` was generated from a different XPI than the attached one; no offer at all usually means the version is not higher or the `strict_max_version` excludes the running Thunderbird.

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

The current manifest sets `strict_min_version: "140.0"` and `strict_max_version: "159.*"`. The minimum covers Thunderbird 140 ESR and Betterbird 140, both checked natively; versions 141–156 are inside the range but untested. The add-on catalogue requires an explicit maximum for Experiment add-ons, so each new Thunderbird release needs a manifest update (or a compatibility edit in the catalogue). This is a forward-compatibility policy for the distributed XPI, not a claim that future internal APIs have been tested. Experiment extensions retain the explicit maximum field; compatibility policy for an add-on-directory submission must be reviewed separately. The Experiment installer compares platform versions: Thunderbird 157.0.1 reports a `Milestone` of 157.0, so a minimum of 157.0.1 incorrectly rejected that target. The manifest range is an installation boundary, not certification of every version or platform.

Thunderbird 140 ESR (and Betterbird 140) differs from 157+ in two internals the adapter uses: `nsIMsgFolder.localizedName` and `FolderUtils.compareFolders` do not exist there. The adapter falls back to the folder `name` and to the ESR 140 folder-pane order (sort order, then a base-sensitivity name collator); keep these fallbacks while 140 is in the supported range.

AccountPane integrates with Thunderbird's internal folder-pane APIs. Folder filtering accepts a set of accounts: selecting a group with several accounts keeps each account's root row in the pane. Supported views are All, Favorites, Unread, Recent, Unified, and Tags. Selecting an account enables All Folders when needed, retaining the other enabled views. Mixed-account Unified/Tags aggregates are hidden for a selected account, while physical account folders remain available. All Accounts restores the native view. If required integration points are unavailable, the implementation is designed to leave the native pane available.

Account ordering uses `MailServices.accounts.reorderAccounts`. Only visible accounts are reordered; hidden, chat, and deferred-account slots retain their positions. Reordering persists in Thunderbird and is not reverted by disabling AccountPane.

Counter calculation starts from Thunderbird's recursive folder counts and subtracts each physical Junk branch once, including its descendants. Virtual folders are skipped during exclusion discovery because native recursive counts already skip them. A failed or inconsistent read stays unknown rather than becoming a misleading partial sum. Unread and total metrics are handled independently. Native folder-row counters are not modified.

The account heading and row geometry are derived from the native folder pane where available, with CSS fallbacks. Styling should use Thunderbird's native properties and theme-neutral fallbacks, without requiring another theme's private variables. Use the supplied previews as illustrations, not evidence of native theme compatibility.

## Permissions and local data

Experiment APIs trigger Thunderbird's full-access permission prompt. The implementation currently reads account/folder metadata, attaches reversible panel elements and handlers, and stores account selection, expansion state, last-folder URIs, and account groups (names, order, membership, and collapsed state, settings version 2) in `storage.local`. `lib/groups.js` holds the group model and is loaded by both the background script and the experiment, so group rules live in one place. It does not read message bodies/passwords or make external network requests. This describes current behavior; it does not restrict Experiment privileges.

Never commit personal profiles, account addresses, folder URIs, messages, passwords, or unredacted diagnostics. Documentation previews use fictional accounts.

## Validation

Run the automated suite and check the packaged files against the source allowlist. When changing behavior, also exercise the relevant native scenarios in [the testing journal](testing.md); an automated pass does not establish native acceptance.

Native testing covers macOS (Thunderbird 157–158) and Windows 11 (Thunderbird 140 ESR, Betterbird 140 and Thunderbird 158). Earlier 0.1.0 beta testing covered core account/folder/history/tab behavior in a disposable profile, with additional-window, loading-race, conflict, and some keyboard scenarios left open. The 0.1.6 automatic suite passed 181 tests, but the GUI attempt timed out before installation; later metadata established that it was installed, not that its new interactions had been accepted. Version 0.1.7 passed 186 tests and a limited native smoke check: installation and a reduced account unread counter were observed while Spam's own counter remained. Incoming mail prevented confirmation of an exact numerical difference; the total counter and collapsed combined count were not checked in the UI.

Historical artifact hashes, sizes, installation failures, and per-scenario results remain in [docs/testing.md](testing.md). Do not interpret these historical checks as validation of a later build.

For experimental native checks, use a clearly identified disposable profile with fictional accounts and messages. Preserve the user's working profile, open conversations, and settings. Do not copy real mail or credential stores into a test fixture or repository. Record the exact tested build and distinguish a UI observation from static checks or mock tests.

Use Thunderbird's **Install Add-on From File…** to update an existing installation in place. An earlier remove-then-immediately-reinstall attempt left the add-on absent; its cause was not established. If standard disable/remove does not restore the folder pane, leave the add-on disabled and restart Thunderbird before investigating. Restore any local backup only with Thunderbird closed and without replacing mail or password stores.

## Design history

[Archived development changelog](development-history.md) preserves the original detailed notes.

- [Original specification](superpowers/specs/2026-10-06-account-pane-design.md)
- [Original implementation plan](superpowers/plans/2026-10-06-account-pane.md)

These documents capture the original design; current source and user documentation describe the present behavior.
