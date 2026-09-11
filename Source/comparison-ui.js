'use strict';
function comparisonControls() {
    const c = ComparisonNotes.settings(state);
    return `<section class="card"><h2>Automatic comparison notes</h2><p class="muted">Generate notes from your mapped accounts. Figures and supporting breakdowns stay in sync when you edit or import balances. Your explanations are kept separately.</p><div class="form-grid"><label>Flag movements of at least (${esc(state.company.currency)})<input type="number" min="0" max="1000000000000" step="0.01" data-comparison-setting="amount" value="${c.amount}"></label><label>And at least (%)<input type="number" min="0" max="100000" step="0.1" data-comparison-setting="percent" value="${c.percent}"></label></div><p class="muted">New balances and sign changes use the amount threshold only. These thresholds highlight movements for explanation; they do not determine accounting materiality. Current and comparative periods are compared as entered, without annualisation.</p><button class="primary" data-comparison-action="generate" ${state.company.comparative ? '' : 'disabled'}>Generate comparison notes</button>${!state.company.comparative ? '<p class="muted">Enable comparative figures in Company details to generate notes.</p>' : ''}</section>`;
}
function comparisonTable(d) {
    return `<div class="table-scroll"><table class="financial comparison-table"><thead><tr><th>Particulars</th><th class="numeric">${esc(state.company.end)}</th>${state.company.comparative ? `<th class="numeric">${esc(state.company.priorEnd)}</th><th class="numeric">Change</th><th class="numeric">Change %</th>` : ''}</tr></thead><tbody>${[...d.items, { label: 'Total', current: d.current, prior: d.prior, ...d.total, total: true }].map((r) => `<tr class="${r.total ? 'total' : ''}"><td>${esc(r.label)}</td><td class="numeric">${money(r.current)}</td>${state.company.comparative ? `<td class="numeric">${money(r.prior)}</td><td class="numeric">${money(r.change)}</td><td class="numeric">${r.percent === null ? 'N/A' : r.percent.toFixed(1) + '%'}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}
function comparisonContent(n, editing = false) {
    const d = ComparisonNotes.detail(state, n);
    return `<div class="comparison-generated"><p class="muted">${editing ? 'Automatically calculated · ' : ''}Amounts in ${esc(state.company.currency)}${editing ? ' · ' + (d.reviewed ? 'Reviewed against current figures' : 'Review required') : ''}</p><div class="prose">${esc(d.narrative)}</div>${comparisonTable(d)}${state.company.comparative ? '<p class="muted">N/A: percentage is undefined for a nil comparative or not meaningful for negative comparative balances and sign reversals.</p>' : ''}${d.needsExplanation && !n.body.trim() ? '<p class="report-warning">Explanation required for the highlighted movements.</p>' : ''}${editing ? `<div class="actions"><button data-comparison-review="${esc(n.id)}">Mark reviewed</button><span class="muted">${d.items.filter((r) => r.significant).length} account movements flagged</span></div>` : ''}</div>`;
}
document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.dataset.comparisonSetting) return;
    if (!t.validity.valid || t.value === '') {
        toast('Enter a valid non-negative threshold.');
        render();
        return;
    }
    state.comparisonSettings = {
        ...ComparisonNotes.settings(state),
        [t.dataset.comparisonSetting]: Number(t.value),
    };
    save();
    render();
});
document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.comparisonAction === 'generate') {
        try {
            const result = ComparisonNotes.generate(state);
            state = result.state;
            save();
            render();
            toast(`${result.added} comparison notes added. Existing explanations retained.`);
        } catch (err) {
            toast(err.message);
        }
    }
    if (b.dataset.comparisonReview) {
        const n = state.notes.find((n) => n.id === b.dataset.comparisonReview),
            d = ComparisonNotes.detail(state, n);
        if (d.needsExplanation && !n.body.trim()) {
            toast(
                'Add an explanation for the significant movements before marking this note reviewed.',
            );
            return;
        }
        n.autoReviewed = d.fingerprint;
        save();
        render();
    }
});
