(function (root) {
    'use strict';
    const E =
        root.StatementEngine || (typeof require === 'function' ? require('./engine.js') : null);
    const creditGroups = new Set([
        'revenue',
        'otherIncome',
        'oci',
        'noncurrentLiability',
        'currentLiability',
        'capital',
        'reserve',
        'retained',
        'owner',
    ]);
    const norm = (s) =>
        String(s ?? '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
    function parseDelimited(text, delimiter) {
        text = String(text).replace(/^\uFEFF/, '');
        if (!delimiter) {
            const choices = [];
            for (const d of ['\t', ';', ','])
                try {
                    const grid = parseDelimited(text, d);
                    const score = Math.max(
                        0,
                        ...grid.slice(0, 30).map((r) => {
                            const c = autoColumns(r);
                            return (
                                (c.name >= 0 ? 20 : 0) +
                                (c.debit >= 0 ? 10 : 0) +
                                (c.credit >= 0 ? 10 : 0) +
                                (c.balance >= 0 ? 10 : 0) +
                                Math.min(r.length, 9)
                            );
                        }),
                    );
                    choices.push({ grid, score });
                } catch {}
            if (!choices.length)
                throw Error(
                    'Cannot parse the delimited file. Check quotation marks and separators.',
                );
            return choices.sort((a, b) => b.score - a.score)[0].grid;
        }
        const rows = [];
        let row = [],
            cell = '',
            quoted = false,
            closed = false;
        const pushCell = () => {
            row.push(cell);
            cell = '';
            closed = false;
            if (row.length > 100) throw Error('Maximum 100 columns.');
        };
        const pushRow = () => {
            pushCell();
            rows.push(row);
            row = [];
            if (rows.length > 5000) throw Error('Maximum 5,000 source rows.');
        };
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (quoted) {
                if (c === '"') {
                    if (text[i + 1] === '"') {
                        cell += '"';
                        i++;
                    } else {
                        quoted = false;
                        closed = true;
                    }
                } else cell += c;
                continue;
            }
            if (c === '"') {
                if (cell || closed) throw Error('Invalid quotation in delimited file.');
                quoted = true;
            } else if (c === delimiter) pushCell();
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && text[i + 1] === '\n') i++;
                pushRow();
            } else {
                if (closed && !/\s/.test(c)) throw Error('Unexpected text after a quoted value.');
                if (!closed) cell += c;
            }
        }
        if (quoted) throw Error('Unclosed quotation in file.');
        if (cell || row.length || closed) pushRow();
        return rows;
    }
    function amount(v, decimal = 'dot') {
        if (
            v === undefined ||
            v === null ||
            String(v).trim() === '' ||
            ['-', '—'].includes(String(v).trim())
        )
            return 0;
        if (typeof v === 'object')
            throw Error('Formula has no saved numeric result. Recalculate and save the workbook.');
        if (typeof v === 'number') {
            if (
                !Number.isFinite(v) ||
                Math.abs(v) > 1e10 ||
                Math.abs(v * 100 - Math.round(v * 100)) > 0.001
            )
                throw Error(
                    'Amount must be finite, within 10 billion and have at most two decimals.',
                );
            return Math.round(v * 100) / 100;
        }
        let s = String(v).trim(),
            negative = false;
        if (/^\(.*\)$/.test(s)) {
            negative = true;
            s = s.slice(1, -1).trim();
        }
        if (/^[+-]/.test(s)) {
            if (negative) throw Error('Ambiguous negative amount.');
            negative = s[0] === '-';
            s = s.slice(1);
        }
        const re =
            decimal === 'comma'
                ? /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/
                : /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
        if (!re.test(s))
            throw Error(
                'Invalid amount “' + String(v).slice(0, 40) + '”. Check the decimal format.',
            );
        s = decimal === 'comma' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
        return amount(Number(s) * (negative ? -1 : 1), decimal);
    }
    function suggest(name) {
        const n = norm(name);
        const rules = [
            [
                /accumulated depreciation|property|plant|equipment|fixed asset|intangible|right.of.use/,
                'noncurrentAsset',
            ],
            [/retained|accumulated loss|opening profit/, 'retained'],
            [/share.*capital|paid.up capital/, 'capital'],
            [/reserve/, 'reserve'],
            [/shareholder.*account|owner.*account/, 'owner'],
            [/overdraft/, 'currentLiability'],
            [/cash|petty cash|bank balance|bank account/, 'cash'],
            [/income tax expense|corporate tax expense/, 'tax'],
            [/interest expense|finance cost|finance charge/, 'finance'],
            [/cost of sales|cost of goods|direct cost|purchases/, 'cost'],
            [/other income|interest income|gain on/, 'otherIncome'],
            [/revenue|sales|service income/, 'revenue'],
            [/inventory|inventories|stock|receivable|prepaid|prepayment|deposit/, 'currentAsset'],
            [/end.of.service|gratuity|long.term loan|non.current liabil/, 'noncurrentLiability'],
            [/payable|accrual|vat|tax liability|short.term loan/, 'currentLiability'],
            [
                /expense|salary|salaries|wages|rent|utilities|depreciation|insurance|repair|marketing|fee/,
                'expense',
            ],
        ];
        return rules.find(([r]) => r.test(n))?.[1] || '';
    }
    function autoColumns(row) {
        const names = row.map(norm);
        const find = (patterns) => names.findIndex((n) => patterns.some((p) => p.test(n)));
        return {
            code: find([/^(account |ledger )?(code|number|no\.?|id)$/, /^a\/c code$/]),
            name: find([
                /^(account|ledger)( name| description)?$/,
                /^(description|particulars|name)$/,
            ]),
            debit: find([/^(closing |current )?(debit|dr)( balance| amount)?$/]),
            credit: find([/^(closing |current )?(credit|cr)( balance| amount)?$/]),
            balance: find([/^(closing |net |signed )?balance$/]),
            group: find([/^(group|category|statement category)$/]),
        };
    }
    function prepare(grid, options, overrides = {}) {
        const { header, columns, mode = 'split', decimal = 'dot' } = options;
        if (!Number.isInteger(header) || header < 0 || header >= grid.length)
            throw Error('Select the header row.');
        const required = ['name', ...(mode === 'split' ? ['debit', 'credit'] : ['balance'])];
        const used = required.map((k) => columns[k]);
        if (used.some((i) => !Number.isInteger(i) || i < 0) || new Set(used).size !== used.length)
            throw Error('Map distinct account name and amount columns.');
        for (const k of ['code', 'group'])
            if (columns[k] >= 0) {
                if (used.includes(columns[k])) throw Error('Map each field to a different column.');
                used.push(columns[k]);
            }
        const rows = [];
        for (let i = header + 1; i < grid.length; i++) {
            const source = grid[i];
            if (!source.some((v) => String(v ?? '').trim())) continue;
            const name = String(source[columns.name] ?? '').trim(),
                code = columns.code >= 0 ? String(source[columns.code] ?? '').trim() : '';
            const total = /^(grand\s+)?total(s)?(\s|$)|^sub[ -]?total(\s|$)/i.test(name);
            const override = overrides[i] || {};
            const included = override.included ?? !total;
            const groupText = columns.group >= 0 ? String(source[columns.group] ?? '').trim() : '';
            const importedGroup = Object.keys(E.groups).find(
                (k) => k === groupText || norm(E.groups[k]) === norm(groupText),
            );
            const group = override.group ?? importedGroup ?? suggest(name);
            const r = {
                source: i,
                name,
                code,
                group,
                included,
                total,
                debit: 0,
                credit: 0,
                net: 0,
                error: '',
            };
            try {
                if (!name) throw Error('Missing account name.');
                if (name.length > 900 || code.length > 100)
                    throw Error('Account name or code is too long.');
                if (mode === 'split') {
                    r.debit = amount(source[columns.debit], decimal);
                    r.credit = amount(source[columns.credit], decimal);
                    if (r.debit < 0 || r.credit < 0)
                        throw Error(
                            'Debit and credit columns must be positive; put reversals on the opposite side.',
                        );
                } else {
                    const n =
                        amount(source[columns.balance], decimal) *
                        (mode === 'creditPositive' ? -1 : 1);
                    r.debit = Math.max(n, 0);
                    r.credit = Math.max(-n, 0);
                }
                r.net = E.add([r.debit, -r.credit]);
            } catch (err) {
                r.error = err.message;
            }
            rows.push(r);
        }
        const included = rows.filter((r) => r.included);
        const identities = new Set();
        for (const r of included) {
            const key = r.code ? 'code:' + norm(r.code) : 'name:' + norm(r.name);
            r.key = key;
            if (identities.has(key))
                r.error =
                    r.error ||
                    'Duplicate account code / name. Consolidate duplicate accounts before import.';
            identities.add(key);
        }
        const debit = E.add(included.map((r) => r.debit)),
            credit = E.add(included.map((r) => r.credit)),
            difference = E.add([debit, -credit]);
        const errors = included.filter((r) => r.error),
            unmapped = included.filter((r) => !Object.hasOwn(E.groups, r.group));
        return {
            rows,
            debit,
            credit,
            difference,
            errors,
            unmapped,
            count: included.length,
            valid:
                included.length > 0 &&
                included.length <= 495 &&
                !errors.length &&
                !unmapped.length &&
                difference === 0,
        };
    }
    function apply(existing, preview, period, closeProfit) {
        if (!['current', 'prior'].includes(period)) throw Error('Select a reporting period.');
        if (!preview.valid)
            throw Error('Balance the trial balance and resolve all errors and mappings first.');
        const s = structuredClone(existing),
            other = period === 'current' ? 'prior' : 'current';
        if (s.demo) {
            s.rows = [];
            const blank = E.fresh();
            s.cash = blank.cash;
            s.equity = blank.equity;
            if (s.company.name === 'Example Trading LLC') s.company.name = '';
            if (s.management.startsWith('Illustrative report only.')) s.management = '';
            s.demo = false;
        }
        for (const r of s.rows) r[period] = 0;
        let idx = 0;
        for (const r of preview.rows.filter((r) => r.included)) {
            let existingRow = s.rows.find((x) => x.tbKey === r.key);
            if (!existingRow)
                existingRow = s.rows.find(
                    (x) =>
                        !x.tbKey &&
                        !x.tbGenerated &&
                        norm(x.label) === norm(r.name) &&
                        x.group === r.group,
                );
            if (existingRow && existingRow.group !== r.group && existingRow[other] !== 0)
                throw Error(
                    'Account ' +
                        r.name +
                        ' has a different category in the other period. Keep its category consistent or amend the other period first.',
                );
            if (!existingRow) {
                existingRow = {
                    id: 'tb-' + period + '-' + Date.now() + '-' + idx++,
                    label: r.name,
                    group: r.group,
                    current: 0,
                    prior: 0,
                    note: '',
                };
                s.rows.push(existingRow);
            }
            Object.assign(existingRow, { group: r.group, tbKey: r.key, tbCode: r.code });
            existingRow[period] = E.add([r.net]) * (creditGroups.has(r.group) ? -1 : 1);
        }
        if (closeProfit) {
            const c = E.calc(s, period);
            for (const [group, value, description] of [
                ['retained', c.profit, 'Current-period profit / (loss) — TB closing transfer'],
                ['reserve', c.sum('oci'), 'Other comprehensive income — TB closing transfer'],
            ]) {
                let r = s.rows.find((x) => x.tbGenerated === group);
                if (!r) {
                    r = {
                        id: 'tb-close-' + group,
                        label: description,
                        group,
                        current: 0,
                        prior: 0,
                        note: '',
                        tbGenerated: group,
                    };
                    s.rows.push(r);
                }
                r[period] = value;
            }
        }
        s.rows = s.rows.filter((r) => r.current !== 0 || r.prior !== 0 || r.tbKey || r.note);
        if (s.rows.length > 500)
            throw Error(
                'The combined report exceeds 500 lines. Consolidate your trial balance first.',
            );
        if (period === 'prior') s.company.comparative = true;
        s.lastTBImport = {
            period,
            count: preview.count,
            debit: preview.debit,
            credit: preview.credit,
            closeProfit,
            at: new Date().toISOString(),
        };
        return E.validate(s);
    }
    root.TrialBalance = { parseDelimited, amount, suggest, autoColumns, prepare, apply };
    if (typeof module !== 'undefined') module.exports = root.TrialBalance;
})(globalThis);
