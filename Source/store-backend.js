// Statement Studio - storage backend
//
// One API over three environments:
//   desktop  - Electron IPC; each company is a JSON file under userData
//   browser  - localStorage, using the same keys the pre-desktop app wrote
//   memory   - injected fake storage, used by test-import.js under plain Node
//
// The company index is always DERIVED from the backing store, never stored
// alongside it. The earlier prefix-shim design kept hoistx-companies-v1 in
// localStorage while companies moved to disk: two sources of truth that
// silently diverge the moment either side is cleared.
//
// Reads are synchronous against an in-memory cache hydrated at boot, so the
// existing synchronous call sites keep working. Writes are queued and
// coalesced to one flush per FLUSH_MS.

(function (root) {
    'use strict';

    const COMPANY_PREFIX = 'hoistx-company-';
    const UNDO_SUFFIX = '-undo';
    const LEGACY_INDEX = 'hoistx-companies-v1'; // no longer authoritative
    const LEGACY_STATE = 'hoistx-statement-builder-v1'; // pre-multi-company
    const LEGACY_UNDO = 'hoistx-before-tb-v1';
    const FLUSH_MS = 400;

    const companyKey = (id) => COMPANY_PREFIX + id;
    const undoKey = (id) => COMPANY_PREFIX + id + UNDO_SUFFIX;

    // A key names a company only when it carries the prefix AND is not an undo
    // record. hoistx-companies-v1 fails the prefix test (it diverges at "compani"
    // vs "company"), which is exactly why a single prefix could never work.
    function idFromKey(key) {
        if (typeof key !== 'string') return null;
        if (!key.startsWith(COMPANY_PREFIX)) return null;
        if (key.endsWith(UNDO_SUFFIX)) return null;
        return key.slice(COMPANY_PREFIX.length) || null;
    }

    // ------------------------------------------------------------------ storage

    // Minimal localStorage work-alike so tests exercise the real browser path.
    function memoryStorage(seed) {
        const map = new Map(Object.entries(seed || {}));
        return {
            get length() {
                return map.size;
            },
            key(i) {
                return [...map.keys()][i] ?? null;
            },
            getItem(k) {
                return map.has(k) ? map.get(k) : null;
            },
            setItem(k, v) {
                map.set(String(k), String(v));
            },
            removeItem(k) {
                map.delete(String(k));
            },
            clear() {
                map.clear();
            },
            _dump() {
                return Object.fromEntries(map);
            },
        };
    }

    // ----------------------------------------------------------------- adapters

    function localStorageAdapter(ls) {
        return {
            kind: 'browser',
            async listIds() {
                const ids = [];
                for (let i = 0; i < ls.length; i++) {
                    const id = idFromKey(ls.key(i));
                    if (id) ids.push(id);
                }
                return ids;
            },
            async read(id) {
                return ls.getItem(companyKey(id));
            },
            async write(id, text) {
                ls.setItem(companyKey(id), text);
            },
            async remove(id) {
                ls.removeItem(companyKey(id));
                ls.removeItem(undoKey(id));
            },
            async readUndo(id) {
                return ls.getItem(undoKey(id));
            },
            async writeUndo(id, text) {
                ls.setItem(undoKey(id), text);
            },
            async clearUndo(id) {
                ls.removeItem(undoKey(id));
            },
            raw: ls,
        };
    }

    function electronAdapter(api) {
        return {
            kind: 'desktop',
            async listIds() {
                return (await api.list()).map((e) => e.id);
            },
            async read(id) {
                return api.read(id);
            },
            async write(id, text) {
                return api.write(id, text);
            },
            async remove(id) {
                return api.remove(id);
            },
            async readUndo(id) {
                return api.readUndo(id);
            },
            async writeUndo(id, text) {
                return api.writeUndo(id, text);
            },
            async clearUndo(id) {
                return api.clearUndo(id);
            },
            raw: api,
        };
    }

    // ------------------------------------------------------------------ backend

    function createBackend(adapter, options) {
        const opts = options || {};
        const flushMs = opts.flushMs === undefined ? FLUSH_MS : opts.flushMs;
        const cache = new Map(); // id -> { text, name, end, corrupt, error }
        const dirty = new Set();
        let flushTimer = null;
        let lastError = null;
        let hydrated = false;

        function describe(text) {
            try {
                const data = JSON.parse(text);
                return {
                    text,
                    name: (data && data.company && data.company.name) || '',
                    end: (data && data.company && data.company.end) || '',
                    corrupt: false,
                };
            } catch (err) {
                // Keep the text. A company we cannot parse must still be listed,
                // exportable and deletable rather than becoming a dead entry.
                return { text, name: '', end: '', corrupt: true, error: String(err.message) };
            }
        }

        function emit(name, detail) {
            if (typeof root.dispatchEvent !== 'function' || typeof root.CustomEvent !== 'function')
                return;
            try {
                root.dispatchEvent(new root.CustomEvent(name, { detail }));
            } catch (e) {
                /* non-DOM host */
            }
        }

        function markDirty(id) {
            dirty.add(id);
            if (flushTimer !== null) return;
            flushTimer = setTimeout(function () {
                flushTimer = null;
                flush();
            }, flushMs);
        }

        async function flush() {
            const pending = [...dirty];
            dirty.clear();
            for (const id of pending) {
                const entry = cache.get(id);
                if (entry === undefined) continue; // removed before the flush ran
                try {
                    await adapter.write(id, entry.text);
                    lastError = null;
                } catch (err) {
                    lastError = err;
                    dirty.add(id); // retry on the next flush
                    emit('statementstudio:save-failed', { id, error: String(err) });
                }
            }
            return lastError;
        }

        const ready = (async () => {
            const ids = await adapter.listIds();
            for (const id of ids) {
                try {
                    const text = await adapter.read(id);
                    if (text === null || text === undefined) continue;
                    cache.set(id, describe(text));
                } catch (err) {
                    cache.set(id, {
                        text: null,
                        name: '',
                        end: '',
                        corrupt: true,
                        error: String(err.message),
                    });
                }
            }
            hydrated = true;
            const corrupt = [...cache.entries()].filter((e) => e[1].corrupt).map((e) => e[0]);
            return { companies: cache.size - corrupt.length, corrupt };
        })();

        function requireHydrated() {
            if (!hydrated)
                throw new Error(
                    'StoreBackend used before hydration; await StoreBackend.ready first.',
                );
        }

        return {
            available: true,
            mode: adapter.kind,
            ready,
            get hydrated() {
                return hydrated;
            },
            lastError: () => lastError,
            flush,

            // The index, derived. Sorted so both modes present the same order.
            list() {
                requireHydrated();
                return [...cache.entries()]
                    .map((e) => ({
                        id: e[0],
                        name: e[1].name,
                        end: e[1].end,
                        corrupt: e[1].corrupt,
                        error: e[1].error,
                    }))
                    .sort(
                        (a, b) =>
                            (a.name || '￿').localeCompare(b.name || '￿') ||
                            a.id.localeCompare(b.id),
                    );
            },
            has(id) {
                requireHydrated();
                return cache.has(id);
            },
            read(id) {
                requireHydrated();
                const c = cache.get(id);
                return c ? c.text : null;
            },
            write(id, text) {
                requireHydrated();
                if (typeof text !== 'string')
                    throw new Error('StoreBackend.write expects a JSON string');
                cache.set(id, describe(text));
                markDirty(id);
            },
            async remove(id) {
                requireHydrated();
                cache.delete(id);
                dirty.delete(id);
                await adapter.remove(id); // deletions are never lazy
                return true;
            },

            // Undo snapshots are full company states. They are deliberately not
            // hydrated (they would double memory) and, on desktop, are stored
            // outside the companies directory so they are never listed as companies.
            readUndo(id) {
                return adapter.readUndo(id);
            },
            writeUndo(id, text) {
                return adapter.writeUndo(id, text);
            },
            clearUndo(id) {
                return adapter.clearUndo(id);
            },

            // Cross-tab detection in browser mode; inert on desktop.
            storageKeyFor: companyKey,
            idFromKey,

            // Legacy keys, read once by company-store.js during first-run migration.
            legacy: {
                index: LEGACY_INDEX,
                state: LEGACY_STATE,
                undo: LEGACY_UNDO,
                get(key) {
                    if (adapter.kind !== 'browser') return null;
                    try {
                        return adapter.raw.getItem(key);
                    } catch (e) {
                        return null;
                    }
                },
            },

            // Desktop-only extras; null in browser mode.
            desktop: adapter.kind === 'desktop' ? adapter.raw : null,
        };
    }

    // ------------------------------------------------------------------ install

    function autoAdapter() {
        const api = root.electronAPI;
        if (api && api.isDesktop) return electronAdapter(api);
        try {
            const ls = root.localStorage;
            if (ls && typeof ls.getItem === 'function' && typeof ls.key === 'function') {
                return localStorageAdapter(ls);
            }
        } catch (e) {
            /* storage disabled */
        }
        return null;
    }

    const factories = {
        createBackend,
        localStorageAdapter,
        electronAdapter,
        memoryStorage,
        companyKey,
        undoKey,
        idFromKey,
        COMPANY_PREFIX,
        UNDO_SUFFIX,
        LEGACY_INDEX,
        LEGACY_STATE,
        LEGACY_UNDO,
    };

    const adapter = autoAdapter();
    root.StoreBackend = Object.assign(
        adapter ? createBackend(adapter) : { available: false, mode: 'none' },
        factories,
    );

    if (typeof module !== 'undefined' && module.exports) module.exports = root.StoreBackend;
})(globalThis);
