# Statement Studio - build and desktop packaging

`Source/` is the truth. `Statement Studio.html` is generated from it by
`build.js` and should never be edited by hand - the next build overwrites it.

## Build

    node build.js

Inlines every `Source/` script, `style.css`, the vendor libraries and the
embedded report fonts into a single `Statement Studio.html` (~6.9 MB). That one
file is what the browser shortcut and the Electron window both load.

The build is reproducible: rebuilding from a clean checkout produces the
committed bundle byte for byte. It stays that way because of `.gitattributes` -
`build.js` embeds `Source/trial-balance-template.csv` verbatim as base64 without
the CRLF -> LF normalisation it applies to every other source, so that file is
pinned to CRLF on checkout. Remove that rule and the bundle's bytes start
depending on which machine built it.

## Formatting

    npm run format          # prettier --write .
    npm run format:check    # fails if anything is unformatted

`Source/` was hand-minified when it came over from the Hoistx builder - app.js
was 31 KB on 75 lines, hoist-ui.js 20 KB on 28. It is now formatted with
prettier (config in `.prettierrc`). Keep it that way; run the formatter before
committing.

`.prettierignore` exists for a reason. Do not format:

- `Statement Studio.html` - generated, overwritten by every build.
- `Source/vendor/` - third-party, shipped minified.
- `Source/report-fonts.js` - 4 MB of base64 font data, not code.
- `Source/index.html` - `build.js` matches its `<script src>` and
  `<link rel="stylesheet">` tags with regexes that assume one tag per line.
  Reformatting it breaks the build.

The reformat was verified three ways, and the same checks apply to any future
one: every file's AST (parsed with acorn, positions stripped) is byte-identical
before and after; the 13 storage tests pass; and a Chromium harness comparing
36 behavioural fingerprints - the computed statement model, readiness checks,
the trial-balance parser, the rendered DOM of all 12 tabs, and the generated
PDF - matched on 35. The 36th is the PDF's own bytes, which differ run to run
on an identical build; its length was unchanged at 80,664.

## Tests

    node test-import.js

13 storage tests, plain Node, no Electron and no browser. They drive the real
localStorage adapter against an in-memory work-alike, so they exercise the same
code path the browser build uses. Run them before packaging.

## Desktop app

    npm install
    npm start          # runs build.js, then electron .

No adaptation step. `Source/store-backend.js` picks its backend at runtime:
`window.electronAPI.isDesktop` selects the JSON-file adapter, otherwise it falls
back to localStorage. `app.js` awaits `StoreBackend.ready` before touching
storage, so hydration is already handled.

(The earlier `desktop-bridge.js` shim and its two manual adaptation points are
gone - removed in 94d5821, replaced by the backend abstraction in 5f5f0e3.)

### Export your companies first

**Export every company from the browser version before you start using the
desktop app.** The Electron build has its own empty storage. Package first and
migrate later and you will open the new app, see nothing, and think it is
broken.

### What the desktop build gives you

- Companies stored as JSON files in `%APPDATA%/Statement Studio/companies/`
  instead of localStorage. Covered by File History, OneDrive, any backup tool.
- No 5 MB quota.
- Atomic writes - a crash mid-save leaves the previous file intact.
- Deleted companies copied to `backups/` first.
- A full snapshot on every launch, 30 kept.
- Corrupt companies still listed, so delete/export can reach them.
- Trial-balance undo records kept outside `companies/`, so a restore point can
  never surface as if it were a company.

## Installer

    npm run dist

Output lands in `dist/`. Put a 256x256 `build/icon.ico` in place first, or
remove the `icon` line from package.json.

## Known gaps

- **Fonts.** `Source/report-fonts.js` embeds two ~1.6 MB fonts. If those are
  Calibri, redistributing the installer redistributes a Microsoft font. Swap to
  Carlito - metric-compatible, so statements will not reflow - before handing
  the installer to anyone.
- **Unsigned.** Windows SmartScreen will warn on the installer. Fine for your
  own machine; get a code-signing certificate before distributing.
- **Client data stays out of git.** `Backups/` and `Reports/` hold company JSON
  exports and generated statement PDFs. They are in `.gitignore`; keep them
  there.
