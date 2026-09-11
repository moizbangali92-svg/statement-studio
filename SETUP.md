# Statement Studio - Electron packaging

Written without access to the source, so treat the two marked spots as
adaptation points. Everything else is boilerplate and should work as-is.

## Before you start

**Export every company from the current browser version first.** The Electron
app has its own empty storage. If you package first and migrate later, you will
open the new app, see nothing, and think it is broken.

Also: `git init` and commit before any of this.

## Install

Copy `main.js`, `preload.js`, `package.json`, `desktop-bridge.js` into the
Statement Studio folder, then:

    npm install
    npm start

## Two things to adapt

1. **`desktop-bridge.js`, `PREFIX`** - set it to the real localStorage key
   prefix `company-store.js` uses. Find it with:

       grep -n "localStorage" Source/company-store.js

2. **Load order** - `desktop-bridge.js` must load before `company-store.js`,
   and the app must wait for hydration. In `Source/index.html`:

       <script src="desktop-bridge.js"></script>
       ...
       <script>
         (StatementStudioDesktop.ready || Promise.resolve())
           .then(() => { /* existing boot call */ });
       </script>

   The build script must inline it the same way as the other sources.

## What this gives you

- Companies stored as JSON files in `%APPDATA%/Statement Studio/companies/`
  instead of localStorage. Covered by File History, OneDrive, any backup tool.
- No 5 MB quota.
- Atomic writes - a crash mid-save leaves the previous file intact.
- Deleted companies copied to `backups/` first.
- A full snapshot on every launch, 30 kept.
- Corrupt companies still listed, so delete/export can reach them.
- Writes coalesced to one disk write per 400 ms, so per-keystroke saving is fine.

## Build the installer

    npm run dist

Output lands in `dist/`. Put a 256x256 `build/icon.ico` in place first, or
remove the `icon` line from package.json.

## Known gaps

- Unsigned. Windows SmartScreen will warn on the installer. Fine for your own
  machine; get a code-signing certificate before handing it to anyone else.
- `npm run dist` is wired to run `build.js`, which does not exist yet - that is
  the Source -> bundle build script. Either write it first or change the
  `build` script to `echo skip`.
- Calibri is still embedded. That becomes a real licensing problem the moment
  you distribute the installer. Swap to Carlito before then.
