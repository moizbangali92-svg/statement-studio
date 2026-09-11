// Statement Studio - storage backend tests
//
// Runs under plain Node, no Electron and no browser:
//     node test-import.js
//
// The browser tests drive the real localStorage adapter against an in-memory
// storage work-alike, so they exercise the same code path the browser build
// uses rather than a parallel mock.

'use strict';

const B = require('./Source/store-backend.js');
require('./Source/engine.js');
const E = globalThis.StatementEngine;

let passed = 0, failed = 0;
const results = [];

function check(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => { passed++; results.push(['PASS', name, '']); })
        .catch(err => { failed++; results.push(['FAIL', name, err && err.message ? err.message : String(err)]); });
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function equal(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${msg}\n      expected ${e}\n      actual   ${a}`);
}

// --------------------------------------------------------------- fixtures

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

// Built from the engine's own fresh state so fixtures satisfy validate(),
// the way a real saved company does.
const company = (name, end) => {
    const s = E.fresh(false);
    s.company.name = name;
    s.company.end = end;
    return JSON.stringify(s);
};

// A browser profile as the pre-desktop app actually leaves it: two companies,
// the legacy index, one undo snapshot, and a pre-multi-company legacy blob.
function browserProfile() {
    return B.memoryStorage({
        [B.COMPANY_PREFIX + ID_A]: company('Alpha Trading LLC', '2025-12-31'),
        [B.COMPANY_PREFIX + ID_B]: company('Beta Holdings FZE', '2025-12-31'),
        [B.COMPANY_PREFIX + ID_A + B.UNDO_SUFFIX]: company('Alpha Trading LLC', '2025-12-31'),
        [B.LEGACY_INDEX]: JSON.stringify([{ id: ID_A, name: 'Alpha Trading LLC', end: '2025-12-31' }]),
        [B.LEGACY_STATE]: company('Ancient Single Company', '2019-12-31'),
    });
}

// Mirrors main.js: companies and undo records live in separate stores, so an
// undo snapshot can never surface through list().
function fakeDesktopApi(seed) {
    const companies = new Map(Object.entries(seed || {}));
    const undo = new Map();
    return {
        isDesktop: true,
        async list() {
            return [...companies.keys()].map(id => ({ id, name: id, corrupt: false }));
        },
        async read(id) { return companies.has(id) ? companies.get(id) : null; },
        async write(id, text) { JSON.parse(text); companies.set(id, text); return true; },
        async remove(id) { companies.delete(id); undo.delete(id); return true; },
        async readUndo(id) { return undo.has(id) ? undo.get(id) : null; },
        async writeUndo(id, text) { undo.set(id, text); return true; },
        async clearUndo(id) { undo.delete(id); return true; },
        _companies: companies,
        _undo: undo,
    };
}

const browserBackend = seed =>
    B.createBackend(B.localStorageAdapter(seed || browserProfile()), { flushMs: 1 });

// ------------------------------------------------------------------ tests

async function main() {

    await check('key scheme: only company keys yield an id', () => {
        equal(B.idFromKey(B.COMPANY_PREFIX + ID_A), ID_A, 'company key should yield its id');
        equal(B.idFromKey(B.LEGACY_INDEX), null,
            'hoistx-companies-v1 must not be read as a company (this is what broke the prefix shim)');
        equal(B.idFromKey(B.COMPANY_PREFIX + ID_A + B.UNDO_SUFFIX), null,
            'an undo record must not be read as a company');
        equal(B.idFromKey(B.LEGACY_STATE), null, 'legacy single-company blob is not a company key');
        equal(B.idFromKey(B.COMPANY_PREFIX), null, 'bare prefix is not an id');
    });

    await check('browser: index is derived, index key and undo record excluded', async () => {
        const store = browserBackend();
        const info = await store.ready;
        equal(info.companies, 2, 'exactly the two real companies should hydrate');
        equal(store.list().map(c => c.name), ['Alpha Trading LLC', 'Beta Holdings FZE'], 'derived index');
        assert(!store.has(B.LEGACY_INDEX), 'index key must not appear as a company');
        assert(!store.list().some(c => c.id.endsWith(B.UNDO_SUFFIX)), 'no undo record in the list');
    });

    await check('browser: undo round-trips without creating a company', async () => {
        const ls = browserProfile();
        const store = browserBackend(ls);
        await store.ready;
        const before = store.list().length;

        await store.writeUndo(ID_B, company('Beta pre-import', '2025-12-31'));
        const raw = await store.readUndo(ID_B);
        assert(raw && JSON.parse(raw).company.name === 'Beta pre-import', 'undo should read back');
        equal(store.list().length, before, 'writing undo must not add a company');

        await store.clearUndo(ID_B);
        equal(await store.readUndo(ID_B), null, 'undo should clear');

        const fresh = browserBackend(ls);
        await fresh.ready;
        equal(fresh.list().length, before, 'undo traffic must not change the company count after rehydration');
    });

    await check('browser: write is cached, flushed, and survives rehydration', async () => {
        const ls = browserProfile();
        const store = browserBackend(ls);
        await store.ready;

        store.write(ID_A, company('Alpha Trading LLC (renamed)', '2026-12-31'));
        equal(JSON.parse(store.read(ID_A)).company.end, '2026-12-31', 'read should serve the cache immediately');
        await store.flush();

        const fresh = browserBackend(ls);
        await fresh.ready;
        const alpha = fresh.list().find(c => c.id === ID_A);
        equal(alpha.name, 'Alpha Trading LLC (renamed)', 'write should persist');
        equal(alpha.end, '2026-12-31', 'derived metadata should follow the written state');
    });

    await check('corrupt company is listed and removable, not a dead entry', async () => {
        const ls = browserProfile();
        ls.setItem(B.COMPANY_PREFIX + ID_B, '{ this is not json');
        const store = browserBackend(ls);
        await store.ready;

        const bad = store.list().find(c => c.id === ID_B);
        assert(bad, 'corrupt company must still be listed');
        assert(bad.corrupt === true, 'it must be flagged corrupt');
        assert(typeof bad.error === 'string' && bad.error.length, 'it must carry the parse error');
        assert(typeof store.read(ID_B) === 'string', 'its raw text must remain readable so it can be exported');

        await store.remove(ID_B);
        assert(!store.list().some(c => c.id === ID_B), 'it must be removable');
        equal(ls.getItem(B.COMPANY_PREFIX + ID_B), null, 'removal must clear the underlying key');
    });

    await check('remove clears the company and its undo record together', async () => {
        const ls = browserProfile();
        const store = browserBackend(ls);
        await store.ready;
        assert(await store.readUndo(ID_A), 'fixture should start with an undo record for A');

        await store.remove(ID_A);
        equal(ls.getItem(B.COMPANY_PREFIX + ID_A), null, 'company key cleared');
        equal(ls.getItem(B.COMPANY_PREFIX + ID_A + B.UNDO_SUFFIX), null, 'orphaned undo record cleared');
    });

    await check('desktop: same API, undo kept outside the companies store', async () => {
        const api = fakeDesktopApi({ [ID_A]: company('Alpha Trading LLC', '2025-12-31') });
        const store = B.createBackend(B.electronAdapter(api), { flushMs: 1 });
        await store.ready;

        equal(store.mode, 'desktop', 'adapter kind should surface as the mode');
        equal(store.list().map(c => c.name), ['Alpha Trading LLC'], 'hydrated from the directory listing');

        await store.writeUndo(ID_A, company('Alpha pre-import', '2025-12-31'));
        equal(api._companies.size, 1, 'undo must not land in the companies store');
        equal(api._undo.size, 1, 'undo must land in the undo store');

        store.write(ID_B, company('Gamma LLC', '2025-12-31'));
        await store.flush();
        equal(api._companies.size, 2, 'new company should reach the backing store');

        await store.remove(ID_A);
        equal([...api._companies.keys()], [ID_B], 'removal should reach the backing store');
        equal(api._undo.size, 0, 'removal should drop the undo record too');
    });

    await check('legacy keys are reachable for first-run migration', async () => {
        const store = browserBackend();
        await store.ready;
        const legacy = store.legacy.get(store.legacy.state);
        assert(legacy, 'pre-multi-company blob should be readable');
        equal(JSON.parse(legacy).company.name, 'Ancient Single Company', 'legacy blob content');
    });

    await check('guard: reads before hydration fail loudly rather than returning empty', async () => {
        const store = browserBackend();
        let threw = false;
        try { store.list(); } catch (e) { threw = /hydration/.test(e.message); }
        assert(threw, 'list() before ready must throw, not silently report zero companies');
        await store.ready;
    });

    // ----------------------------------------------- company-store.js itself

    // Loads the real Source/company-store.js against a real backend, so the
    // rewrite is covered rather than just the layer beneath it.
    async function loadCompanyStore(ls) {
        const store = browserBackend(ls);
        await store.ready;
        globalThis.StoreBackend = store;
        globalThis.sessionStorage = B.memoryStorage();
        delete require.cache[require.resolve('./Source/company-store.js')];
        require('./Source/company-store.js');
        return { store, CompanyStore: globalThis.CompanyStore };
    }

    await check('CompanyStore: init selects a company and returns its state text', async () => {
        const ls = browserProfile();
        const { CompanyStore } = await loadCompanyStore(ls);
        const text = CompanyStore.init();
        assert(typeof text === 'string', 'init should return the active company state');
        equal(CompanyStore.list().map(c => c.name), ['Alpha Trading LLC', 'Beta Holdings FZE'], 'derived list');
        assert(CompanyStore.active, 'an active company should be selected');
    });

    await check('CompanyStore: create then write persists without an index key', async () => {
        const ls = browserProfile();
        const { store, CompanyStore } = await loadCompanyStore(ls);
        CompanyStore.init();

        const state = CompanyStore.create('Gamma Contracting LLC');
        equal(state.company.name, 'Gamma Contracting LLC', 'create returns the new state');
        state.company.registration = 'LIC-999';
        CompanyStore.write(state);
        await store.flush();

        const indexBefore = ls.getItem(B.LEGACY_INDEX);
        const fresh = browserBackend(ls);
        await fresh.ready;
        equal(fresh.list().map(c => c.name),
            ['Alpha Trading LLC', 'Beta Holdings FZE', 'Gamma Contracting LLC'],
            'the new company survives rehydration');
        equal(ls.getItem(B.LEGACY_INDEX), indexBefore,
            'the legacy index must be left untouched, not maintained as a second source of truth');
    });

    await check('CompanyStore: first run migrates the pre-multi-company blob', async () => {
        const ls = B.memoryStorage({ [B.LEGACY_STATE]: company('Ancient Single Company', '2019-12-31') });
        const { CompanyStore } = await loadCompanyStore(ls);
        const text = CompanyStore.init();
        equal(JSON.parse(text).company.name, 'Ancient Single Company', 'legacy state should become the first company');
        equal(CompanyStore.list().length, 1, 'exactly one company after migration');
    });

    await check('CompanyStore: a damaged company is listed but refuses to open', async () => {
        const ls = browserProfile();
        ls.setItem(B.COMPANY_PREFIX + ID_B, '{ broken');
        const { CompanyStore } = await loadCompanyStore(ls);
        CompanyStore.init();

        const bad = CompanyStore.list().find(c => c.id === ID_B);
        assert(bad && bad.corrupt, 'damaged company must still be listed so it can be deleted or exported');

        let message = '';
        try { CompanyStore.select(ID_B); } catch (e) { message = e.message; }
        assert(/damaged/.test(message), `select should refuse with a clear message, got: ${message}`);

        await CompanyStore.remove(ID_B);
        assert(!CompanyStore.list().some(c => c.id === ID_B), 'and it must be removable');
    });

    // ---------------------------------------------------------------- report

    const width = Math.max(...results.map(r => r[1].length));
    for (const [status, name, detail] of results) {
        console.log(`  ${status}  ${name.padEnd(width)}${detail ? '\n        ' + detail : ''}`);
    }
    console.log(`\n  ${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
}

main();
