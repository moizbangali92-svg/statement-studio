'use strict';
const E = StatementEngine,
    $ = (s) => document.querySelector(s),
    esc = (s) =>
        String(s ?? '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
        );
let companyHome = true;
let state = E.fresh(false),
    tab = 'template',
    section = 'income',
    saveError = false;
// Storage hydrates asynchronously now; loading happens in boot() at the end of this file.
const periods = () => (state.company.comparative ? ['current', 'prior'] : ['current']);
const periodLabel = (p) => (p === 'current' ? state.company.end : state.company.priorEnd) || p;
const money = (n) => {
    const a = Math.abs(n).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return n < 0 ? '(' + a + ')' : n === 0 ? '—' : a;
};
const date = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s);
function toast(t) {
    $('#toast').textContent = t;
    $('#toast').classList.add('show');
    setTimeout(() => $('#toast').classList.remove('show'), 4500);
}
function save() {
    try {
        CompanyStore.write(state);
        saveError = false;
        $('#saved').textContent = 'Saved locally';
        hoistChanged();
    } catch (e) {
        saveError = true;
        $('#saved').textContent = 'Not saved — download backup';
    }
}
function title(k, h, p, action = '') {
    return `<div class="page-title"><div><span class="eyebrow">${k}</span><h1>${h}</h1><p>${p}</p></div>${action}</div>`;
}
function field(label, key, type = 'text') {
    return `<label>${label}<input type="${type === 'date' ? 'text' : type}" ${type === 'date' ? 'data-date-format="dmy" placeholder="DD/MM/YYYY" maxlength="10"' : ''} data-company="${key}" value="${esc(type === 'date' ? date(state.company[key]) : state.company[key])}"></label>`;
}
function checks() {
    return HM.checks(state);
}
function reportHtml() {
    return hoistReportHtml();
}
function reportView() {
    return hoistReportView();
}
function render() {
    if (companyHome) {
        renderCompanyHome();
        return;
    }
    $('#company-home').hidden = true;
    $('.app').hidden = false;
    renderCompanySwitcher();
    HoistDisclosureDrafts.populate(state);
    const pages = [
        ['company', '01', 'Company details'],
        ['figures', '02', 'Financial figures'],
        ['import', '↑', 'Trial balance import'],
        ['mapping', '03', 'Note mapping'],
        ['template', '04', 'Entity & authorisation'],
        ['policies', '05', 'Accounting policies'],
        ['support', '06', 'Supporting schedules'],
        ['cashdetail', '07', 'Cash-flow details'],
        ['tax', '08', 'Corporate tax'],
        ['disclosures', '09', 'Disclosures'],
        ['readiness', '10', 'Report readiness'],
        ['report', '11', 'Report preview'],
    ];
    $('#nav').innerHTML = pages
        .map(
            ([k, n, l]) =>
                `<button data-tab="${k}" class="${tab === k ? 'active' : ''}"><span>${n}</span>${l}</button>`,
        )
        .join('');
    $('#companybar').textContent = state.company.name || 'Untitled company';
    $('#saved').textContent = saveError ? 'Not saved — download backup' : 'Saved locally';
    const pending = HM.checks(state).filter((x) => !x.ok).length;
    $('#view').innerHTML =
        `<div class="demo"><span><b id="preparation-identity">${esc(preparationIdentity())}</b> · <span id="hoist-ready-count">${esc(readinessSummary(HM.checks(state)))}</span></span><button data-tab="readiness">View preparation status →</button></div>` +
        (state.demo
            ? '<div class="demo"><b>Illustrative data only</b><button data-action="new">Start blank report</button></div>'
            : '') +
        {
            company: companyView,
            figures: figuresView,
            import: tbImportView,
            mapping: mappingView,
            template: templateView,
            policies: policyView,
            support: supportView,
            cashdetail: cashDetailView,
            tax: taxView,
            disclosures: disclosureView,
            readiness: readinessView,
            checks: readinessView,
            notes: notesView,
            report: reportView,
        }[tab]();
}
function companyView() {
    return (
        title(
            '01 / SETUP',
            'Company details',
            'Set the entity, reporting dates and presentation for your report pack.',
        ) +
        `<section class="card"><h2>Reporting entity</h2><div class="form-grid">${field('Registered company name', 'name')}${field('Registration / licence number', 'registration')}${field('Registered address', 'address')}${field('Principal activity', 'activity')}${field('Manager / authorised signatory', 'manager')}<label>Presentation currency<select data-company="currency">${['AED', 'USD', 'EUR', 'GBP', 'SAR', 'INR'].map((v) => `<option ${state.company.currency === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div></section><section class="card"><h2>Reporting period</h2><div class="form-grid">${field('Period start', 'start', 'date')}${field('Period end', 'end', 'date')}</div><label class="checklabel"><input type="checkbox" data-company="comparative" ${state.company.comparative ? 'checked' : ''}> Include comparative figures</label>${state.company.comparative ? `<div class="form-grid">${field('Comparative period start', 'priorStart', 'date')}${field('Comparative period end', 'priorEnd', 'date')}</div>` : ''}</section><section class="card"><h2>Management report</h2><p class="muted">Describe the activities, performance and developments for the period. Names entered here do not constitute signatures.</p><textarea data-management rows="7" aria-label="Management report" placeholder="Write the management report…">${esc(state.management)}</textarea></section><section class="card"><h2>Report presentation</h2><label>Layout<select data-company="style"><option value="classic" ${state.company.style === 'classic' ? 'selected' : ''}>Classic — restrained serif typography</option><option value="ruled" ${state.company.style === 'ruled' ? 'selected' : ''}>Contemporary — ruled headings</option></select></label><p class="muted">Inspired by the structure and comparative tables in your five samples. Auditor opinions, signatures and stamps are not generated.</p><div class="actions"><button data-action="new">New blank report</button><button data-action="demo">Load illustrative example</button></div></section>`
    );
}
const sections = {
    income: 'Profit or loss',
    position: 'Financial position',
    equity: 'Equity movements',
    cash: 'Cash flows',
};
const sectionGroups = {
    income: ['revenue', 'cost', 'otherIncome', 'expense', 'finance', 'tax', 'oci'],
    position: [
        'noncurrentAsset',
        'currentAsset',
        'cash',
        'noncurrentLiability',
        'currentLiability',
        'capital',
        'reserve',
        'retained',
        'owner',
    ],
};
function figuresView() {
    const c = E.calc(state, 'current');
    return (
        title(
            '02 / PREPARE',
            'Financial figures',
            'Enter closing balances and period totals. Your statements update automatically.',
            `<div class="actions"><button data-tab="import" class="primary">↑ Import trial balance</button><button data-tab="report">View report ↗</button></div>`,
        ) +
        `<div class="metrics"><div><span>Revenue · ${esc(state.company.currency)}</span><strong>${money(c.sum('revenue'))}</strong></div><div><span>Profit / (loss)</span><strong>${money(c.profit)}</strong></div><div><span>Total assets</span><strong>${money(c.assets)}</strong></div><div class="${Math.abs(c.balance) < 0.005 ? 'good' : 'warning'}"><span>Balance difference</span><strong>${money(c.balance)}</strong><small>${Math.abs(c.balance) < 0.005 ? 'Financial position balances' : 'Review assets, liabilities and equity'}</small></div></div><div class="tabs">${Object.entries(
            sections,
        )
            .map(
                ([k, v]) =>
                    `<button data-section="${k}" class="${section === k ? 'selected' : ''}">${v}</button>`,
            )
            .join('')}</div>${sectionGroups[section] ? rowsEditor() : scheduleEditor()}`
    );
}
function numberInput(value, attrs, label) {
    return `<input class="amount" type="number" step="0.01" min="-1000000000000" max="1000000000000" value="${value}" ${attrs} aria-label="${esc(label)}">`;
}
function headers(first = 'Description', notes = false) {
    return `<thead><tr><th>${first}</th>${notes ? '<th>Note</th>' : ''}${periods()
        .map(
            (p) =>
                `<th class="numeric">${esc(periodLabel(p))}<small>${esc(state.company.currency)}</small></th>`,
        )
        .join('')}<th></th></tr></thead>`;
}
function rowsEditor() {
    return `<div class="hint">${section === 'income' ? 'Enter revenue and expenses as positive amounts. Expenses are deducted automatically. Use negative amounts for reversals.' : 'Enter net carrying values. Liabilities and capital are positive; accumulated losses and debit shareholders’ balances are negative.'}</div><section class="card table-card"><div class="table-scroll"><table class="editor">${headers('Account / line item', true)}<tbody>${sectionGroups[
        section
    ]
        .map(
            (g) =>
                `<tr class="group"><th colspan="${periods().length + 3}">${E.groups[g]}</th></tr>${state.rows
                    .filter((r) => r.group === g)
                    .map(
                        (r) =>
                            `<tr><td><input data-row="${esc(r.id)}" data-prop="label" value="${esc(r.label)}" aria-label="Line description"></td><td><select data-row="${esc(r.id)}" data-prop="note" aria-label="Linked note"><option value="">—</option>${state.notes.map((n, i) => `<option value="${esc(n.id)}" ${r.note === n.id ? 'selected' : ''}>${i + 1}. ${esc(n.title)}</option>`).join('')}</select></td>${periods()
                                .map(
                                    (p) =>
                                        `<td>${numberInput(r[p], `data-row="${esc(r.id)}" data-prop="${p}"`, r.label + ' ' + p)}</td>`,
                                )
                                .join(
                                    '',
                                )}<td><button class="icon" data-delete-row="${esc(r.id)}" aria-label="Delete ${esc(r.label)}">×</button></td></tr>`,
                    )
                    .join(
                        '',
                    )}<tr class="addrow"><td colspan="${periods().length + 3}"><button data-add="${g}">＋ Add line</button></td></tr>`,
        )
        .join('')}</tbody></table></div></section>`;
}
function scheduleEditor() {
    const cash = section === 'cash',
        kind = cash ? 'cash' : 'equity',
        fields = cash ? E.cashFields : E.eqFields;
    return `<div class="hint">${cash ? 'Indirect method: profit is linked automatically. Enter cash inflows as positive and outflows as negative. Enter actual movements; the app does not infer cash flows from closing balances.' : 'Opening balances and movements are entered separately for each period. Profit is linked automatically. Other comprehensive income is allocated to reserves; disclose its composition in the notes.'}</div><section class="card table-card"><div class="table-scroll"><table class="editor">${headers('Schedule input')}<tbody>${Object.entries(
        fields,
    )
        .map(
            ([k, l]) =>
                `<tr><td>${l}</td>${periods()
                    .map(
                        (p) =>
                            `<td>${numberInput(state[kind][p][k], `data-schedule="${kind}" data-period="${p}" data-key="${k}"`, l + ' ' + p)}</td>`,
                    )
                    .join('')}<td></td></tr>`,
        )
        .join(
            '',
        )}</tbody></table></div></section><section class="card"><h2>${cash ? 'Cash flow reconciliation' : 'Calculated closing equity'}</h2>${financialTable(
        cash
            ? [
                  ['Profit / (loss)', (p) => E.calc(state, p).profit],
                  ['Net operating cash flows', (p) => E.calc(state, p).operating],
                  ['Closing cash and cash equivalents', (p) => E.calc(state, p).closingCash],
                  ['Difference to financial position', (p) => E.calc(state, p).cashDifference],
              ]
            : Object.entries({
                  capital: 'Share capital',
                  reserve: 'Reserves',
                  retained: 'Retained earnings',
                  owner: 'Shareholders’ current account',
              }).map(([k, l]) => [l, (p) => E.calc(state, p).close[k]]),
    )}</section>`;
}
function notesView() {
    return (
        title(
            '03 / DISCLOSE',
            'Notes & policies',
            'Write company-specific disclosures and link them to statement lines.',
            `<button data-action="add-note">＋ Add note</button>`,
        ) +
        comparisonControls() +
        `<div class="hint">Use these headings as a starting point. Assess applicable accounting policies, tax, going concern and other disclosures with your accountant. The app does not determine compliance or calculate tax.</div>` +
        state.notes
            .map(
                (n, i) =>
                    `<section class="card note"><div class="note-heading"><span class="note-number">${String(i + 1).padStart(2, '0')}</span><input aria-label="Note ${i + 1} title" data-note="${esc(n.id)}" data-prop="title" value="${esc(n.title)}"><button class="icon" data-delete-note="${esc(n.id)}" aria-label="Delete note ${i + 1}">×</button></div>${n.autoGroup ? comparisonContent(n, true) + '<label>Explanation / additional disclosure</label>' : ''}<textarea rows="6" data-note="${esc(n.id)}" data-prop="body" placeholder="Enter disclosure…" aria-label="Note ${i + 1} text">${esc(n.body)}</textarea></section>`,
            )
            .join('')
    );
}
function financialTable(rows, notes = false) {
    return `<div class="table-scroll"><table class="financial">${headers('Particulars', notes)}<tbody>${rows
        .map((r) =>
            r.heading
                ? `<tr class="report-group"><th colspan="${periods().length + (notes ? 3 : 2)}">${esc(r.heading)}</th></tr>`
                : `<tr class="${r[2] ? 'total' : ''}"><td>${esc(r[0])}</td>${notes ? `<td>${esc(r[3] || '')}</td>` : ''}${periods()
                      .map((p) => `<td class="numeric">${money(r[1](p))}</td>`)
                      .join('')}<td></td></tr>`,
        )
        .join('')}</tbody></table></div>`;
}
function download() {
    const a = document.createElement('a');
    const u = URL.createObjectURL(
        new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }),
    );
    a.href = u;
    a.download =
        (state.company.name || 'statement').replace(/[^a-z0-9 -]/gi, '').trim() +
        '-' +
        state.company.end +
        '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
    toast('Backup downloaded. Keep this file to restore your draft.');
}
document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tab) {
        tab = b.dataset.tab;
        render();
        window.scrollTo(0, 0);
        return;
    }
    if (b.dataset.section) {
        section = b.dataset.section;
        render();
        return;
    }
    if (b.dataset.add) {
        state.rows.push({
            id: crypto.randomUUID(),
            label: 'New line',
            group: b.dataset.add,
            current: 0,
            prior: 0,
            note: '',
        });
        save();
        render();
        return;
    }
    if (b.dataset.deleteRow) {
        if (!confirm('Delete this financial line?')) return;
        state.rows = state.rows.filter((r) => r.id !== b.dataset.deleteRow);
        save();
        render();
        return;
    }
    if (b.dataset.deleteNote) {
        if (!confirm('Delete this note and remove its line references?')) return;
        state.notes = state.notes.filter((n) => n.id !== b.dataset.deleteNote);
        state.rows.forEach((r) => {
            if (r.note === b.dataset.deleteNote) r.note = '';
        });
        save();
        render();
        return;
    }
    switch (b.dataset.action) {
        case 'backup':
            download();
            break;
        case 'restore':
            $('#restore').click();
            break;
        case 'new':
        case 'demo':
            if (
                !confirm(
                    'Replace the current draft? Download a backup first if you want to keep it.',
                )
            )
                return;
            state = b.dataset.action === 'demo' ? createSampleReport() : E.fresh(false);
            tab = 'company';
            save();
            render();
            break;
        case 'add-note':
            state.notes.push({ id: crypto.randomUUID(), title: 'New disclosure', body: '' });
            save();
            render();
            break;
        case 'print':
            hoistGeneratePdf(true);
            break;
    }
});
document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'restore') return;
    let changed = false;
    if (t.dataset.dateFormat) {
        if (!saveDateField(t)) return;
        changed = true;
    } else if (t.dataset.company) {
        state.company[t.dataset.company] = t.type === 'checkbox' ? t.checked : t.value;
        changed = true;
    }
    if (t.hasAttribute('data-management')) {
        state.management = t.value;
        changed = true;
    }
    if (t.dataset.note) {
        const n = state.notes.find((n) => n.id === t.dataset.note);
        n[t.dataset.prop] = t.value;
        changed = true;
    }
    if (t.dataset.row) {
        const r = state.rows.find((r) => r.id === t.dataset.row),
            k = t.dataset.prop;
        if (['current', 'prior'].includes(k)) {
            if (!t.validity.valid || !Number.isFinite(Number(t.value))) {
                toast('Enter a valid amount with at most two decimal places.');
                render();
                return;
            }
            r[k] = Number(t.value);
        } else r[k] = t.value;
        changed = true;
    }
    if (t.dataset.schedule) {
        if (!t.validity.valid || !Number.isFinite(Number(t.value))) {
            toast('Enter a valid amount with at most two decimal places.');
            render();
            return;
        }
        state[t.dataset.schedule][t.dataset.period][t.dataset.key] = Number(t.value);
        changed = true;
    }
    if (changed) {
        save();
        if (t.dataset.company === 'comparative') {
            render();
        } else {
            $('#companybar').textContent = state.company.name || 'Untitled company';
            if (tab === 'figures') {
                const temp = document.createElement('div');
                temp.innerHTML = figuresView();
                const metric = $('.metrics');
                if (metric) metric.innerHTML = temp.querySelector('.metrics').innerHTML;
                const schedules = $('#view > section.card:not(.table-card)');
                const next = temp.querySelector('section.card:not(.table-card)');
                if (schedules && next) schedules.innerHTML = next.innerHTML;
            }
        }
    }
});
// Save text while typing without replacing the focused editor.
document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.dateFormat) {
        saveDateField(t);
        return;
    }
    if (t.hasAttribute('data-management')) {
        state.management = t.value;
        save();
    } else if (t.dataset.note) {
        state.notes.find((n) => n.id === t.dataset.note)[t.dataset.prop] = t.value;
        save();
    } else if (t.dataset.company && t.type !== 'checkbox') {
        state.company[t.dataset.company] = t.value;
        save();
    } else if (t.dataset.row && ['label', 'note'].includes(t.dataset.prop)) {
        state.rows.find((r) => r.id === t.dataset.row)[t.dataset.prop] = t.value;
        save();
    }
});
$('#restore').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        if (file.size > 3000000) throw Error('Backup must be under 3 MB.');
        const next = E.validate(JSON.parse(await file.text()));
        if (confirm('Replace the current draft with this backup?')) {
            state = next;
            save();
            render();
            toast('Draft restored.');
        }
    } catch (err) {
        toast('Could not restore: ' + err.message);
    } finally {
        e.target.value = '';
    }
});
window.addEventListener('beforeprint', () => {
    $('#print-report').innerHTML = reportHtml();
});

function renderCompanySwitcher() {
    const el = $('#company-switcher');
    if (el)
        el.innerHTML =
            '<button data-home-action="back" class="back-companies">← All companies</button>';
}
function renderCompanyHome() {
    const entries = CompanyStore.list();
    $('.app').hidden = true;
    const home = $('#company-home');
    home.hidden = false;
    home.innerHTML = `<div class="company-top"><a class="home-brand" href="#">Statement Studio</a><span>Financial statement preparation</span></div><div class="company-content"><div class="company-heading"><div><span class="eyebrow">YOUR WORKSPACE</span><h1>Companies</h1><p>Select a company to continue preparing its financial statements.</p></div><button class="primary" data-home-action="new">+ New company</button></div><form id="company-create" hidden><h2>Create company</h2><label>Registered company name<input id="new-company-name" required maxlength="250" placeholder="Enter company name" autocomplete="organization"></label><div><button type="submit" class="primary">Create & open workspace</button><button type="button" data-home-action="cancel">Cancel</button></div><p id="company-create-error" role="alert"></p></form><div class="company-list-head"><h2>Your companies <span>${entries.length}</span></h2><span>Each company has a separate preparation workspace</span></div><div class="company-grid">${entries.map((c) => `<article class="company-card"><div class="company-monogram" aria-hidden="true">${esc((c.name || 'C').slice(0, 1).toUpperCase())}</div><h2>${esc(c.name)}</h2><p>Reporting period ending <strong>${esc(date(c.end) || 'Not set')}</strong></p><div class="company-card-bottom"><span>Saved locally</span><button data-open-company="${esc(c.id)}" aria-label="Open ${esc(c.name)}">Open preparation →</button></div></article>`).join('')}</div><p class="company-home-note">Company files are stored in this browser. Download backups from each preparation workspace to keep a separate copy.</p></div>`;
}
function resetCompanySession() {
    tbSession = {
        sheets: [],
        sheet: 0,
        header: 0,
        columns: {},
        mode: 'split',
        decimal: 'dot',
        period: 'current',
        closeProfit: true,
        overrides: {},
        preview: null,
        reviewed: false,
        error: '',
        loading: false,
        name: '',
    };
    companyHome = false;
    tab = 'company';
    hoistChanged();
    render();
}
document.addEventListener('change', (e) => {
    if (e.target.id !== 'company-choice') return;
    try {
        if (!CompanyStore.blocked) CompanyStore.write(state);
        state = CompanyStore.select(e.target.value);
        saveError = false;
        resetCompanySession();
    } catch (err) {
        toast(err.message);
        renderCompanySwitcher();
    }
});
document.addEventListener('click', (e) => {
    if (e.target.id !== 'add-company') return;
    const name = prompt('Name of the new company / audit file:');
    if (!name?.trim()) return;
    try {
        if (!CompanyStore.blocked) CompanyStore.write(state);
        state = CompanyStore.create(name.trim());
        saveError = false;
        resetCompanySession();
        toast('New company created. Your other company files are saved.');
    } catch (err) {
        toast(err.message);
    }
});
window.addEventListener('storage', (e) => {
    CompanyStore.external(e.key);
    if (CompanyStore.blocked) {
        saveError = true;
        $('#saved').textContent = 'Changed in another tab - reload before editing';
    } else if (e.key === 'hoistx-companies-v1') renderCompanySwitcher();
});

document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
        if (b.dataset.openCompany) {
            state = CompanyStore.select(b.dataset.openCompany);
            saveError = false;
            resetCompanySession();
            window.scrollTo(0, 0);
        }
        if (b.dataset.homeAction === 'back') {
            if (!CompanyStore.blocked) CompanyStore.write(state);
            companyHome = true;
            render();
            window.scrollTo(0, 0);
        }
        if (b.dataset.homeAction === 'new') {
            $('#company-create').hidden = false;
            $('#new-company-name').focus();
        }
        if (b.dataset.homeAction === 'cancel') $('#company-create').hidden = true;
    } catch (err) {
        toast(err.message);
    }
});
document.addEventListener('submit', (e) => {
    if (e.target.id !== 'company-create') return;
    e.preventDefault();
    const name = $('#new-company-name').value.trim();
    if (!name) return;
    try {
        state = CompanyStore.create(name);
        saveError = false;
        resetCompanySession();
        window.scrollTo(0, 0);
    } catch (err) {
        $('#company-create-error').textContent = err.message;
    }
});

// Nothing may touch storage until StoreBackend has hydrated from disk / localStorage.
// Event listeners above are registered immediately; none can fire before the first render.
async function boot() {
    try {
        await StoreBackend.ready;
    } catch (err) {
        // Never present a blank page: an unreadable store must say so, and must not
        // be written over by a fresh empty state.
        const home = $('#company-home');
        home.hidden = false;
        home.innerHTML = `<div class="company-content"><div class="company-heading"><div><span class="eyebrow">STORAGE</span><h1>Could not load your companies</h1><p>${esc(err.message)}</p></div></div><p class="company-home-note">Your saved data has not been changed. Close and reopen the application. If this persists, restore a backup from the Backups folder.</p></div>`;
        return;
    }
    try {
        const old = CompanyStore.init();
        if (old) state = E.validate(JSON.parse(old));
    } catch (err) {
        saveError = true;
    }
    render();
    hoistChanged();
}
// A failed disk write is reported late, so surface it rather than losing it silently.
window.addEventListener('statementstudio:save-failed', (e) => {
    saveError = true;
    const el = $('#saved');
    if (el) el.textContent = 'Not saved — download backup';
});
boot();
