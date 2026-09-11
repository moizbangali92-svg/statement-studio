# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An offline financial statement preparation tool for accountants: import a trial
balance, map accounts, and print a comparative statement pack (income statement,
financial position, cash flow, equity, notes) as PDF. It ships two ways from one
codebase — a single self-contained HTML file opened in a browser, and an Electron
desktop app. No server, no network, no accounts.

## Commands

    node build.js           # Source/ -> "Statement Studio.html" (the only artefact that ships)
    node test-import.js     # 13 storage tests; plain Node, no Electron, no browser
    node serve.js [port]    # serves the folder on 127.0.0.1:8080
    npm run format          # prettier --write .
    npm run format:check    # fails if anything is unformatted
    npm start               # build, then launch Electron
    npm run dist            # build, then electron-builder --win -> dist/

`test-import.js` is a hand-rolled runner with no filter flag. To run one case,
comment out the others or call its `check()` blocks directly — there is no
`--grep`.

Open `http://127.0.0.1:8080/Source/index.html` to work on unbundled sources
(edit, reload, see it) and `/Statement%20Studio.html` to check the built bundle.
Do **not** open either off `file://`: Chrome refuses to construct a classic
Worker from a `null` origin, so the Excel import throws before it starts.
`serve.js` exists purely for this.

## Architecture

### Source/ is the truth; the bundle is generated

`Statement Studio.html` (~7 MB) is produced by `build.js` and is committed.
Never edit it — the next build silently overwrites your changes. `build.js`
inlines every script and `style.css`, embeds `tb-worker.js` as a JSON string
(a `file://` page cannot construct a classic Worker, so `tb-ui.js` turns that
string into a `blob:` Worker), folds `xlsx.full.min.js` into the worker in place
of its `importScripts`, and converts the CSV template to a `data:` URI.

The build is reproducible: a clean checkout rebuilds the committed bundle byte
for byte. After changing anything under `Source/`, run `node build.js` and commit
the regenerated bundle with it.

### There are no modules

`Source/*.js` are plain scripts concatenated into one global scope. Two styles
coexist:

- **IIFE + global export** — `engine.js`, `hoist-model.js`, `hoist-report.js`,
  `trial-balance.js`, `store-backend.js`, `company-store.js`, `hoist-pdf.js`,
  `hoist-tax.js`, `comparison-notes.js`, `hoist-disclosure-drafts.js`. These
  attach to `globalThis` (`StatementEngine`, `HoistModel`, `HoistReport`,
  `TrialBalance`, `StoreBackend`, `CompanyStore`, `HoistPDF`, `HoistTax`,
  `ComparisonNotes`, `HoistDisclosureDrafts`); eight of the ten also
  `module.exports` so `test-import.js` can `require()` them under plain Node —
  `company-store.js` and `hoist-disclosure-drafts.js` do not.
- **bare top-level functions** — `app.js`, `hoist-ui.js`, `tb-ui.js`,
  `comparison-ui.js`. These declare globals like `taxView()` and `tbImportView()`
  that `app.js`'s `render()` dispatch table calls by name, and they read and
  write `app.js`'s module-level `state`. They are fragments of one program split
  across files, not independent units.

Consequence: **script order in `Source/index.html` is load-bearing.** A file that
uses `HoistModel` must come after `hoist-model.js`. `app.js` is last.

### The state object

One plain JSON object per company, defined and validated in `engine.js`:

```
{ version: 1, demo, company{name,…,start,end,priorStart,priorEnd,currency,
                            comparative,style}, 
  rows: [{id,label,group,current,prior,note}],   // group is one of 16 keys
  cash:   {current:{…}, prior:{…}},              // cash-flow schedule
  equity: {current:{…}, prior:{…}},              // equity movement schedule
  notes: [{id,title,body,autoGroup?,autoReviewed?}],
  management, comparisonSettings? }
```

`StatementEngine.calc(state, period)` derives everything reported — profit,
totals, closing cash, closing equity, and the reconciliation differences the
readiness checks test against zero. `HoistModel` layers the Hoistx disclosure
model on top (`ensure`, `checks`, `applicablePolicies`, PPE/EOS schedules), and
`HoistReport.build(state)` turns the pair into the printable section/block
structure that both the HTML preview and the PDF render from.

**Money is computed in integer cents.** `engine.js` has `cents()` and `add()`;
every arithmetic path goes through `add([...])` rather than `+`. Keep it that
way — floating-point drift in a balance sheet shows up as a failing check, not a
rounding artefact.

`StatementEngine.validate()` is a hard schema validator with explicit limits
(≤500 rows, ≤100 notes, |amount| ≤ 1e12, known group keys only) and it throws
rather than coercing. Every load path runs it. Widen it deliberately, never
incidentally.

### Storage

`store-backend.js` is one API over three environments, chosen at runtime by
`autoAdapter()`:

| environment | adapter | where data lives |
|---|---|---|
| Electron | `electronAdapter` (`window.electronAPI.isDesktop`) | JSON files under `%APPDATA%/Statement Studio/companies/` |
| browser | `localStorageAdapter` | `localStorage`, keys `hoistx-company-<id>` |
| tests | `memoryStorage` | injected fake |

Two invariants worth preserving, both learned the hard way and documented in the
file's header:

1. **The company index is derived, never stored.** An earlier design kept
   `hoistx-companies-v1` alongside the records; two sources of truth diverge the
   moment either is cleared. `idFromKey()` is the whole index.
2. **Reads are synchronous against a cache hydrated at boot.** Call sites stay
   synchronous; writes are queued and coalesced to one flush per 400 ms.
   `app.js`'s `boot()` awaits `StoreBackend.ready` before touching storage, and
   reading before hydration throws loudly rather than reporting zero companies.

Undo records (`…-undo`) live outside the companies store on desktop and are
excluded from the index in the browser, so a restore point can never surface as
a company. Corrupt companies are still listed, flagged `corrupt`, and remain
readable so they can be exported or deleted.

`main.js` adds atomic writes (temp file + rename), a copy to `backups/` before
delete, and a full snapshot on every launch with 30 kept. `preload.js` exposes
only the `cs:*` IPC surface; the renderer never sees Node.

## Constraints that will bite you

- **`Source/index.html` must not be formatted.** `build.js` matches its
  `<script src>` and `<link rel="stylesheet">` tags with regexes that assume one
  tag per line. It is in `.prettierignore` for this reason.
- **`*.csv` is pinned to CRLF in `.gitattributes`.** `build.js` embeds
  `trial-balance-template.csv` verbatim as base64 without the CRLF→LF
  normalisation it applies to every other source, so the checkout's bytes reach
  the bundle. Remove the rule and the build stops being reproducible.
- **`Backups/` and `Reports/` hold client data** — company JSON exports and
  generated statement PDFs. They are gitignored. Keep them that way.
- **`Source/report-fonts.js` embeds Microsoft Calibri** (regular + bold, ~3.3 MB,
  © 2025 Microsoft). Embedding it in generated PDFs is permitted; redistributing
  it inside the installer is not — the font's own licence restricts use to the
  Microsoft product it shipped with. Swap to Carlito (metric-compatible, so
  statements will not reflow) before `npm run dist` goes to anyone else. The repo
  must stay private until then.

## Verifying a change

The 13 tests cover storage only. Nothing automatically covers the accounting
engine, the report builder or the PDF, so for changes there, drive the app in a
browser over `serve.js` and compare output before and after. The reformat commit
(`7c10d75`) used an AST-equivalence check plus a Chromium fingerprint harness
comparing the computed model, the readiness checks, every tab's DOM and the
generated PDF; that approach is a reasonable template for any refactor claiming
to preserve behaviour.

## Known dead code

`app.js` still carries the pre-Hoistx report path: `legacyChecks`,
`checksView`, `noteNo`, `reportRows`, `legacyReportHtml` and `legacyReportView`
(~275 of its 862 lines). `checks()`, `reportHtml()` and `reportView()` are thin
shims that delegate to `HoistModel`/`hoist-ui.js` instead. Nothing calls the
legacy functions. `financialTable()` sits among them but *is* live — the
schedule editor uses it.
