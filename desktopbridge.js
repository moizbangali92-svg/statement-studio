// Statement Studio - desktop storage bridge
//
// Must load BEFORE company-store.js.
//
// The existing app calls localStorage synchronously; disk IPC is async. This
// hydrates every company into memory at boot, serves reads from that cache so
// existing sync code is unchanged, and flushes writes to disk in the background.
// Under a plain browser it does nothing and real localStorage is used.

(function () {
    'use strict';

    const api = globalThis.electronAPI;
    if (!api || !api.isDesktop) {
        globalThis.StatementStudioDesktop = { available: false };
        return; // browser: leave localStorage alone
    }

    // Keys the app owns. Anything outside this prefix stays in localStorage
    // (UI preferences and similar are fine there - they are not client data).
    const PREFIX = 'ss:';          // <-- set to the app's real company key prefix
    const cache = new Map();       // key -> string
    const dirty = new Set();
    let flushTimer = null;
    let lastError = null;

    const keyFor = (id) => PREFIX + id;
    const idFor = (key) => key.slice(PREFIX.length);

    // ------------------------------------------------------------ flushing

    function markDirty(key) {
        dirty.add(key);
        if (flushTimer) return;
        // Coalesce keystroke-rate writes into one disk write per 400 ms.
        flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 400);
    }

    async function flush() {
        const pending = [...dirty];
        dirty.clear();
        for (const key of pending) {
            const value = cache.get(key);
            try {
                if (value === undefined) await api.remove(idFor(key));
                else await api.write(idFor(key), value);
                lastError = null;
            } catch (err) {
                lastError = err;
                dirty.add(key); // keep it queued; try again on the next flush
                console.error('[StatementStudio] failed to save', key, err);
                window.dispatchEvent(new CustomEvent('ss:save-failed', { detail: { key, error: String(err) } }));
            }
        }
    }

    // Never lose the last few hundred milliseconds of edits on quit.
    window.addEventListener('beforeunload', () => {
        if (dirty.size) flush();
    });

    // ------------------------------------------------------------ shim

    const shim = {
        getItem(key) {
            if (!key.startsWith(PREFIX)) return window.__realLocalStorage.getItem(key);
            return cache.has(key) ? cache.get(key) : null;
        },
        setItem(key, value) {
            if (!key.startsWith(PREFIX)) return window.__realLocalStorage.setItem(key, value);
            cache.set(key, String(value));
            markDirty(key);
        },
        removeItem(key) {
            if (!key.startsWith(PREFIX)) return window.__realLocalStorage.removeItem(key);
            cache.delete(key);
            markDirty(key);
        },
        clear() {
            for (const key of [...cache.keys()]) { cache.delete(key); markDirty(key); }
        },
        key(i) { return [...cache.keys()][i] ?? null; },
        get length() { return cache.size; },
    };

    // ------------------------------------------------------------ boot

    // Hydrate synchronously-enough: the app must not read storage until this
    // resolves, so index.html should await StatementStudioDesktop.ready.
    const ready = (async () => {
        const entries = await api.list();
        const corrupt = [];
        for (const entry of entries) {
            if (entry.corrupt) { corrupt.push(entry); continue; }
            try {
                cache.set(keyFor(entry.id), await api.read(entry.id));
            } catch (err) {
                corrupt.push({ ...entry, corrupt: true, error: String(err) });
            }
        }

        window.__realLocalStorage = window.localStorage;
        Object.defineProperty(window, 'localStorage', { value: shim, configurable: true });

        return { companies: entries.length - corrupt.length, corrupt };
    })();

    globalThis.StatementStudioDesktop = {
        available: true,
        ready,
        flush,
        lastError: () => lastError,
        // Expose the raw file operations for delete/rename/repair UI.
        removeCompany: (id) => { cache.delete(keyFor(id)); return api.remove(id); },
        renameCompany: (id, next) => api.rename(id, next),
        exportAll: () => api.exportAll(),
        importBackup: async () => {
            const result = await api.importBackup();
            if (result.imported) location.reload();
            return result;
        },
        snapshot: () => api.snapshot(),
        dataDir: () => api.dataDir(),
        revealDataDir: () => api.revealDataDir(),
    };
})();
