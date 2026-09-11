// Statement Studio - Electron main process
// Persists companies as real JSON files instead of localStorage.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

// ---------------------------------------------------------------- paths

const dataDir = () => path.join(app.getPath('userData'), 'companies');
const backupDir = () => path.join(app.getPath('userData'), 'backups');
// Undo snapshots are full company states. They live OUTSIDE companies/ so that
// listCompanies() can never surface a restore point as if it were a company.
const undoDir = () => path.join(app.getPath('userData'), 'undo');
const fileFor = (id) => path.join(dataDir(), `${safeId(id)}.json`);
const undoFileFor = (id) => path.join(undoDir(), `${safeId(id)}.json`);

// Company ids come from the renderer. Never let one escape the data dir.
function safeId(id) {
    const s = String(id).replace(/[^A-Za-z0-9._-]/g, '_');
    if (!s || s === '.' || s === '..') throw new Error(`Unsafe company id: ${id}`);
    return s;
}

async function ensureDirs() {
    await fsp.mkdir(dataDir(), { recursive: true });
    await fsp.mkdir(backupDir(), { recursive: true });
    await fsp.mkdir(undoDir(), { recursive: true });
}

// ---------------------------------------------------------------- storage

// Write to a temp file then rename. A crash mid-write leaves the old file
// intact rather than a truncated one - this is financial data.
async function writeAtomic(target, text) {
    const tmp = `${target}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, text, 'utf8');
    await fsp.rename(tmp, target);
}

async function listCompanies() {
    await ensureDirs();
    const names = await fsp.readdir(dataDir());
    const out = [];
    for (const name of names) {
        if (!name.endsWith('.json')) continue;
        const full = path.join(dataDir(), name);
        const id = name.slice(0, -5);
        try {
            const raw = await fsp.readFile(full, 'utf8');
            const data = JSON.parse(raw);
            const stat = await fsp.stat(full);
            out.push({
                id,
                name: data?.name || data?.company?.name || id,
                bytes: stat.size,
                modified: stat.mtimeMs,
                corrupt: false,
            });
        } catch (err) {
            // A company that fails to parse must still be listed, so the UI
            // can offer delete / export instead of a dead entry.
            out.push({ id, name: id, bytes: 0, modified: 0, corrupt: true, error: String(err.message) });
        }
    }
    return out.sort((a, b) => b.modified - a.modified);
}

async function readCompany(id) {
    await ensureDirs();
    try {
        return await fsp.readFile(fileFor(id), 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') return null;   // absent is not corrupt
        throw err;
    }
}

// ---------------------------------------------------------------- undo

async function readUndo(id) {
    await ensureDirs();
    try {
        return await fsp.readFile(undoFileFor(id), 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

async function writeUndo(id, text) {
    await ensureDirs();
    if (typeof text !== 'string') throw new Error('writeUndo expects a JSON string');
    JSON.parse(text);
    await writeAtomic(undoFileFor(id), text);
    return true;
}

async function clearUndo(id) {
    await ensureDirs();
    await fsp.rm(undoFileFor(id), { force: true });
    return true;
}

async function writeCompany(id, text) {
    await ensureDirs();
    if (typeof text !== 'string') throw new Error('writeCompany expects a JSON string');
    JSON.parse(text); // refuse to persist anything that will not read back
    await writeAtomic(fileFor(id), text);
    return true;
}

async function deleteCompany(id) {
    // Keep a copy. Deleting a client's prepared statements should be undoable.
    await ensureDirs();
    const src = fileFor(id);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupDir(), `${safeId(id)}.deleted-${stamp}.json`);
    try {
        await fsp.copyFile(src, dest);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
    await fsp.rm(src, { force: true });
    await fsp.rm(undoFileFor(id), { force: true });   // no orphaned restore points
    return true;
}

async function renameCompany(id, nextId) {
    await ensureDirs();
    const from = fileFor(id);
    const to = fileFor(nextId);
    if (from !== to) {
        if (fs.existsSync(to)) throw new Error(`A company with id "${nextId}" already exists`);
        await fsp.rename(from, to);
    }
    return true;
}

// Snapshot every company into one timestamped file. Cheap insurance.
async function snapshotAll() {
    await ensureDirs();
    const names = (await fsp.readdir(dataDir())).filter((n) => n.endsWith('.json'));
    const bundle = {};
    for (const name of names) {
        bundle[name.slice(0, -5)] = await fsp.readFile(path.join(dataDir(), name), 'utf8');
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupDir(), `snapshot-${stamp}.json`);
    await writeAtomic(dest, JSON.stringify({ version: 1, created: Date.now(), companies: bundle }, null, 2));
    await pruneSnapshots();
    return dest;
}

// Keep the 30 most recent snapshots.
async function pruneSnapshots() {
    const files = (await fsp.readdir(backupDir()))
        .filter((n) => n.startsWith('snapshot-'))
        .sort();
    for (const name of files.slice(0, Math.max(0, files.length - 30))) {
        await fsp.rm(path.join(backupDir(), name), { force: true });
    }
}

// ---------------------------------------------------------------- ipc

function registerIpc() {
    ipcMain.handle('cs:list', () => listCompanies());
    ipcMain.handle('cs:read', (_e, id) => readCompany(id));
    ipcMain.handle('cs:write', (_e, id, text) => writeCompany(id, text));
    ipcMain.handle('cs:delete', (_e, id) => deleteCompany(id));
    ipcMain.handle('cs:rename', (_e, id, nextId) => renameCompany(id, nextId));
    ipcMain.handle('cs:readUndo', (_e, id) => readUndo(id));
    ipcMain.handle('cs:writeUndo', (_e, id, text) => writeUndo(id, text));
    ipcMain.handle('cs:clearUndo', (_e, id) => clearUndo(id));
    ipcMain.handle('cs:snapshot', () => snapshotAll());
    ipcMain.handle('cs:dataDir', () => app.getPath('userData'));
    ipcMain.handle('cs:reveal', () => shell.openPath(dataDir()));

    ipcMain.handle('cs:importBackup', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Import Statement Studio backup',
            filters: [{ name: 'JSON backup', extensions: ['json'] }],
            properties: ['openFile'],
        });
        if (canceled || !filePaths[0]) return { imported: 0, canceled: true };

        const parsed = JSON.parse(await fsp.readFile(filePaths[0], 'utf8'));
        await ensureDirs();
        let imported = 0;

        // Accept both the snapshot bundle above and a single exported company.
        if (parsed && parsed.companies && typeof parsed.companies === 'object') {
            for (const [id, text] of Object.entries(parsed.companies)) {
                await writeCompany(id, typeof text === 'string' ? text : JSON.stringify(text));
                imported += 1;
            }
        } else {
            const id = parsed?.id || parsed?.name || `imported-${Date.now()}`;
            await writeCompany(id, JSON.stringify(parsed));
            imported = 1;
        }
        return { imported, canceled: false, from: filePaths[0] };
    });

    ipcMain.handle('cs:exportAll', async () => {
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Export all companies',
            defaultPath: `statement-studio-backup-${new Date().toISOString().slice(0, 10)}.json`,
            filters: [{ name: 'JSON backup', extensions: ['json'] }],
        });
        if (canceled || !filePath) return { canceled: true };
        const src = await snapshotAll();
        await fsp.copyFile(src, filePath);
        return { canceled: false, path: filePath };
    });
}

// ---------------------------------------------------------------- window

function createWindow() {
    const win = new BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: '#ffffff',
        show: false,
        title: 'Statement Studio',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false, // preload needs require(); the renderer stays isolated
        },
    });

    win.once('ready-to-show', () => win.show());
    win.loadFile(path.join(__dirname, 'Statement Studio.html'));

    // External links open in the real browser, not inside the app.
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    return win;
}

app.whenReady().then(async () => {
    await ensureDirs();
    registerIpc();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// One snapshot per launch, once the app has settled.
app.on('ready', () => {
    setTimeout(() => { snapshotAll().catch(() => {}); }, 5000);
});
