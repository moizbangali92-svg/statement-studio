(function (root) {
    'use strict';
    const E =
        root.StatementEngine || (typeof require === 'function' ? require('./engine.js') : null);
    const defs = {
        5: ['Property, plant and equipment', ['noncurrentAsset']],
        6: ['Trade and other receivables', ['currentAsset']],
        7: ['Cash and bank balances', ['cash']],
        8: [
            'Related parties',
            ['currentAsset', 'noncurrentAsset', 'currentLiability', 'noncurrentLiability', 'owner'],
        ],
        9: ['Trade and other payables', ['currentLiability']],
        10: ['Employees’ end of service benefits', ['noncurrentLiability']],
        11: ['Share capital', ['capital']],
        12: ['Other income', ['otherIncome']],
        13: ['Salaries and other benefits', ['expense']],
        14: ['Administrative, selling and general expenses', ['expense']],
        20: ['Inventories', ['currentAsset']],
        21: ['Revenue', ['revenue']],
        22: ['Cost of sales', ['cost']],
        23: ['Finance costs', ['finance']],
        24: ['Borrowings', ['currentLiability', 'noncurrentLiability']],
        25: ['Other non-current assets', ['noncurrentAsset']],
        26: ['Other comprehensive income', ['oci']],
        27: ['Other equity balances', ['reserve', 'retained', 'owner']],
    };
    const policyDefs = {
        basis: [
            'Basis of preparation',
            'Enter the approved reporting framework (including edition where relevant), measurement basis, presentation currency and any departures.',
        ],
        going: [
            'Going concern',
            'Enter management’s assessment, funding support and any material uncertainties.',
        ],
        ppe: [
            'Property, plant and equipment / depreciation',
            'Describe initial and subsequent measurement, useful lives, depreciation method, residual values and impairment.',
        ],
        receivables: [
            'Receivables and impairment',
            'Describe measurement, impairment methodology, write-offs and key assumptions.',
        ],
        financial: [
            'Financial assets and liabilities',
            'Describe classification, measurement, interest recognition and derecognition.',
        ],
        employees: [
            'Employee benefits and provisions',
            'Describe the employee benefit valuation basis and recognition of provisions.',
        ],
        revenue: [
            'Revenue recognition',
            'Describe the recognition point for each significant goods or service revenue stream, variable consideration and returns.',
        ],
        leases: [
            'Leases',
            'Describe the treatment of leases under the selected framework, or explicitly state there are no leases.',
        ],
        fx: [
            'Foreign currencies',
            'Describe transaction rates, closing translation rates and recognition of exchange differences, or state no foreign-currency transactions.',
        ],
        cash: [
            'Cash and cash equivalents',
            'Define cash equivalents and treatment of restricted cash and overdrafts.',
        ],
        tax: [
            'Income tax and VAT',
            'Describe current/deferred tax and VAT accounting. Do not copy another company’s relief eligibility or tax dates.',
        ],
        inventory: [
            'Inventories',
            'Describe cost formula, cost components, net realisable value and write-downs.',
        ],
    };
    const narrativeDefs = {
        estimates: [
            '4. Critical judgements and estimation uncertainty',
            'Describe significant judgements and estimates, including useful lives and impairment assumptions.',
        ],
        related: [
            '8. Related parties',
            'Describe relationships, transaction terms, security, interest and repayment arrangements. State none if applicable.',
        ],
        risk: [
            '15. Financial instruments - risk management',
            'Describe capital, credit, liquidity, market and foreign currency risks relevant to this entity.',
        ],
        commitments: [
            '16. Contingencies and commitments',
            'Describe commitments and contingent liabilities, or explicitly confirm none.',
        ],
        tax: [
            '17. Corporate income tax',
            'Enter the entity’s reviewed tax position, current/deferred tax and any relief actually applicable.',
        ],
        events: [
            '18. Subsequent events',
            'Describe events up to authorisation, or explicitly confirm none.',
        ],
        comparatives: [
            '19. Comparative figures',
            'Explain restatements, reclassifications or different period lengths, if applicable.',
        ],
    };
    const ppeFields = {
        openCost: 'Opening cost',
        additions: 'Additions',
        disposals: 'Disposals at cost',
        transfers: 'Cost transfers / adjustments',
        openDep: 'Opening accumulated depreciation / impairment',
        charge: 'Depreciation charge',
        disposedDep: 'Depreciation on disposals',
        impairment: 'Impairment charge',
        otherDep: 'Other accumulated depreciation changes',
    };
    const eosFields = {
        opening: 'Opening provision',
        charge: 'Charge for the period',
        paid: 'Benefits paid',
        other: 'Other movements',
    };
    function fresh() {
        return {
            version: 1,
            info: {
                legalForm: '',
                issuer: '',
                incorporated: '',
                approvalDate: '',
                approvalBody: '',
                functionalCurrency: '',
                periodExplanation: '',
            },
            policies: Object.fromEntries(Object.keys(policyDefs).map((k) => [k, ''])),
            narrative: Object.fromEntries(Object.keys(narrativeDefs).map((k) => [k, ''])),
            ppe: [],
            related: [],
            shares: [],
            cashDetails: [],
            eos: {
                current: Object.fromEntries(Object.keys(eosFields).map((k) => [k, 0])),
                prior: Object.fromEntries(Object.keys(eosFields).map((k) => [k, 0])),
            },
            mappingReviewed: '',
            reviewed: '',
            explanations: {},
            auditorText: '',
        };
    }
    function ensure(s) {
        if (!s.hoist) s.hoist = fresh();
        return s.hoist;
    }
    function periods(s) {
        return s.company.comparative ? ['current', 'prior'] : ['current'];
    }
    function suggest(r) {
        if (defs[r.hoistNote]?.[1].includes(r.group)) return Number(r.hoistNote);
        const n = r.label.toLowerCase();
        if (
            /corporate tax|income tax|deferred tax/.test(n) &&
            [
                'tax',
                'currentAsset',
                'noncurrentAsset',
                'currentLiability',
                'noncurrentLiability',
            ].includes(r.group)
        )
            return 17;
        if (
            /related part|due (to|from).*group|shareholder.*loan/.test(n) &&
            defs[8][1].includes(r.group)
        )
            return 8;
        switch (r.group) {
            case 'noncurrentAsset':
                return /intangible|investment|right.of.use/.test(n) ? 25 : 5;
            case 'currentAsset':
                return /inventor|stock/.test(n) ? 20 : 6;
            case 'cash':
                return 7;
            case 'currentLiability':
                return /borrow|loan|overdraft/.test(n) ? 24 : 9;
            case 'noncurrentLiability':
                return /employee|gratuity|end.of.service|benefit/.test(n) ? 10 : 24;
            case 'expense':
                return /salar|wage|benefit|payroll/.test(n) ? 13 : 14;
            default:
                return {
                    capital: 11,
                    otherIncome: 12,
                    revenue: 21,
                    cost: 22,
                    finance: 23,
                    tax: 17,
                    oci: 26,
                    reserve: 27,
                    retained: 27,
                    owner: 27,
                }[r.group];
        }
    }
    function rows(s, n) {
        return s.rows.filter((r) => suggest(r) === Number(n));
    }
    function sum(s, n, p) {
        return E.add(rows(s, n).map((r) => r[p]));
    }
    function mappingStamp(s) {
        return JSON.stringify(s.rows.map((r) => [r.id, r.label, r.group, suggest(r)]));
    }
    function stamp(s) {
        const t = ensure(s);
        return JSON.stringify([
            s.company,
            s.rows,
            s.cash,
            s.equity,
            s.management,
            { ...t, reviewed: '' },
            s.notes,
        ]);
    }
    function ppeClose(a, p) {
        const x = a[p];
        const cost = E.add([x.openCost, x.additions, -x.disposals, x.transfers]),
            dep = E.add([x.openDep, x.charge, -x.disposedDep, x.impairment, x.otherDep]);
        return { cost, dep, net: E.add([cost, -dep]) };
    }
    function eosClose(t, p) {
        const x = t.eos[p];
        return E.add([x.opening, x.charge, -x.paid, x.other]);
    }
    function applicablePolicies(s) {
        return Object.keys(policyDefs).filter(
            (k) =>
                !{
                    ppe: !periods(s).some((p) => sum(s, 5, p)),
                    receivables: !periods(s).some((p) => sum(s, 6, p)),
                    employees: !periods(s).some((p) => sum(s, 10, p)),
                    inventory: !periods(s).some((p) => sum(s, 20, p)),
                }[k],
        );
    }
    function validate(s) {
        const t = s.hoist;
        if (!t) return s;
        if (t.version !== 1) throw Error('Unsupported Hoistx template backup.');
        const string = (v, max = 60000) => {
            if (typeof v !== 'string' || v.length > max) throw Error('Invalid template text.');
        };
        const num = (n) => {
            if (
                typeof n !== 'number' ||
                !Number.isFinite(n) ||
                Math.abs(n) > 1e12 ||
                Math.abs(n * 100 - Math.round(n * 100)) > 0.1
            )
                throw Error('Invalid schedule amount.');
        };
        for (const k of Object.keys(fresh().info)) string(t.info?.[k], 2000);
        for (const k of Object.keys(policyDefs)) string(t.policies?.[k]);
        for (const k of Object.keys(narrativeDefs)) string(t.narrative?.[k]);
        string(t.mappingReviewed, 1000000);
        string(t.reviewed, 4000000);
        string(t.auditorText);
        if (t.explanations) for (const v of Object.values(t.explanations)) string(v);
        for (const [key, max] of [
            ['ppe', 30],
            ['related', 100],
            ['shares', 100],
            ['cashDetails', 100],
        ]) {
            if (!Array.isArray(t[key]) || t[key].length > max)
                throw Error('Invalid supporting schedule.');
            t[key].forEach((r) => {
                string(r.id, 100);
                if (key === 'ppe') {
                    string(r.label, 500);
                    for (const p of ['current', 'prior'])
                        for (const f of Object.keys(ppeFields)) num(r[p]?.[f]);
                } else if (key === 'related') {
                    string(r.name, 500);
                    string(r.relationship, 500);
                    string(r.terms, 2000);
                    if (!['asset', 'liability', 'equity', 'transaction'].includes(r.kind))
                        throw Error('Invalid related-party classification.');
                    num(r.current);
                    num(r.prior);
                } else if (key === 'shares') {
                    string(r.name, 500);
                    string(r.nationality, 500);
                    num(r.par);
                    num(r.current);
                    num(r.prior);
                } else {
                    string(r.label, 500);
                    if (!Object.hasOwn(E.cashFields, r.kind) || r.kind === 'opening')
                        throw Error('Invalid cash movement category.');
                    num(r.current);
                    num(r.prior);
                }
            });
        }
        for (const p of ['current', 'prior'])
            for (const f of Object.keys(eosFields)) num(t.eos?.[p]?.[f]);
        for (const r of s.rows)
            if (r.hoistNote !== undefined && !defs[r.hoistNote]?.[1].includes(r.group))
                throw Error('Invalid statement note mapping.');
        return s;
    }
    function checks(s) {
        const t = ensure(s),
            out = [],
            add = (ok, title, detail, tab = 'template') =>
                out.push({ ok: !!ok, title, detail, tab }),
            date = (v) =>
                /^\d{4}-\d{2}-\d{2}$/.test(v) &&
                !Number.isNaN(Date.parse(v)) &&
                new Date(v).toISOString().slice(0, 10) === v;
        const eq = (a, b) => Math.abs(E.add([a, -b])) < 0.005;
        for (const [k, label] of [
            ['name', 'Registered company name'],
            ['registration', 'Licence / registration number'],
            ['address', 'Registered address'],
            ['activity', 'Principal activity'],
            ['manager', 'Authorised signatory'],
        ])
            add(s.company[k]?.trim(), label, 'Complete Company details.', 'company');
        for (const [k, label] of [
            ['legalForm', 'Legal form'],
            ['issuer', 'Licensing authority'],
            ['approvalBody', 'Authorising body'],
            ['functionalCurrency', 'Functional currency'],
        ])
            add(t.info[k].trim(), label, 'Complete the entity information.');
        add(date(t.info.incorporated), 'Incorporation date', 'Enter a valid incorporation date.');
        add(
            date(t.info.approvalDate) && t.info.approvalDate >= s.company.end,
            'Authorisation date',
            'Enter a date on or after the period end.',
        );
        add(
            date(s.company.start) &&
                date(s.company.end) &&
                s.company.start <= s.company.end &&
                (!s.company.comparative ||
                    (date(s.company.priorStart) &&
                        date(s.company.priorEnd) &&
                        s.company.priorStart <= s.company.priorEnd &&
                        s.company.priorEnd < s.company.start)),
            'Reporting dates',
            'Check current and comparative dates.',
            'company',
        );
        add(
            !s.demo,
            'Company data',
            'Replace the illustrative data with your own report.',
            'company',
        );
        add(
            t.mappingReviewed === mappingStamp(s),
            'Statement note mapping',
            'Review the proposed note for every account and confirm the mapping.',
            'mapping',
        );
        for (const k of applicablePolicies(s))
            add(
                t.policies[k].trim(),
                policyDefs[k][0],
                'Enter the entity-specific accounting policy.',
                'policies',
            );
        for (const k of Object.keys(narrativeDefs).filter(
            (k) => k !== 'comparatives' || s.company.comparative,
        ))
            add(
                t.narrative[k].trim(),
                narrativeDefs[k][0],
                'Complete this disclosure; explicitly state none when appropriate.',
                'disclosures',
            );
        for (const p of periods(s)) {
            const c = E.calc(s, p),
                label = p === 'current' ? s.company.end : s.company.priorEnd;
            add(
                eq(c.balance, 0),
                'Financial position ' + label,
                'Difference: ' + c.balance.toFixed(2),
                'figures',
            );
            add(
                eq(c.cashDifference, 0),
                'Cash reconciliation ' + label,
                'Difference: ' + c.cashDifference.toFixed(2),
                'figures',
            );
            add(
                c.equityDifferences.every((x) => eq(x.value, 0)),
                'Equity reconciliation ' + label,
                'Compare equity movements with closing equity.',
                'figures',
            );
            const pp = t.ppe.map((a) => ppeClose(a, p));
            add(
                eq(E.add(pp.map((a) => a.net)), sum(s, 5, p)),
                'Fixed assets reconciliation ' + label,
                'PPE schedule net book value must equal note 5.',
                'support',
            );
            add(
                t.ppe.every(
                    (a) =>
                        a.label.trim() &&
                        Object.entries(a[p]).every(
                            ([k, v]) => ['transfers', 'otherDep'].includes(k) || v >= 0,
                        ),
                ) && pp.every((a) => a.cost >= 0 && a.dep >= 0 && a.net >= 0),
                'Fixed assets values ' + label,
                'Costs, charges, disposals and net book values must be non-negative.',
                'support',
            );
            add(
                eq(eosClose(t, p), sum(s, 10, p)),
                'Employee benefits reconciliation ' + label,
                'Opening provision + charge - payments + other = note 10.',
                'support',
            );
            add(
                t.eos[p].opening >= 0 && t.eos[p].charge >= 0 && t.eos[p].paid >= 0,
                'Employee benefit inputs ' + label,
                'Enter positive opening provision, charge and payments.',
                'support',
            );
            add(
                eq(E.add(t.shares.map((r) => r[p] * r.par)), sum(s, 11, p)),
                'Share capital reconciliation ' + label,
                'Number of shares × nominal value must equal share capital.',
                'support',
            );
            for (const kind of ['asset', 'liability', 'equity']) {
                const target = E.add(
                    rows(s, 8)
                        .filter((r) =>
                            kind === 'asset'
                                ? ['currentAsset', 'noncurrentAsset'].includes(r.group)
                                : kind === 'liability'
                                  ? ['currentLiability', 'noncurrentLiability'].includes(r.group)
                                  : r.group === 'owner',
                        )
                        .map((r) => r[p]),
                );
                add(
                    eq(E.add(t.related.filter((r) => r.kind === kind).map((r) => r[p])), target),
                    'Related-party ' + kind + ' balances ' + label,
                    'Counterparty schedule must equal the corresponding note 8 balances.',
                    'support',
                );
            }
            for (const kind of Object.keys(E.cashFields).filter((k) => k !== 'opening'))
                add(
                    eq(
                        E.add(t.cashDetails.filter((r) => r.kind === kind).map((r) => r[p])),
                        s.cash[p][kind],
                    ),
                    'Cash-flow detail: ' + E.cashFields[kind] + ' ' + label,
                    'Detailed movements must match the cash-flow input.',
                    'cashdetail',
                );
        }
        add(
            t.related.every((r) => r.name.trim() && r.relationship.trim() && r.terms.trim()),
            'Related-party details',
            'Enter counterparty, relationship and terms for each row.',
            'support',
        );
        add(
            t.shares.every(
                (r) =>
                    r.name.trim() &&
                    r.nationality.trim() &&
                    r.par > 0 &&
                    r.current >= 0 &&
                    r.prior >= 0 &&
                    Number.isInteger(r.current) &&
                    Number.isInteger(r.prior),
            ),
            'Shareholder details',
            'Complete each shareholder and use whole, non-negative share counts.',
            'support',
        );
        add(
            t.cashDetails.every((r) => r.label.trim()),
            'Cash-flow descriptions',
            'Give each movement a meaningful description.',
            'cashdetail',
        );
        if (s.company.comparative) {
            add(
                eq(s.cash.current.opening, E.calc(s, 'prior').sum('cash')),
                'Opening cash continuity',
                'Opening cash must equal the comparative closing cash.',
                'figures',
            );
            add(
                ['Capital', 'Reserve', 'Retained', 'Owner'].every((k) =>
                    eq(s.equity.current['open' + k], E.calc(s, 'prior').sum(k.toLowerCase())),
                ),
                'Opening equity continuity',
                'Opening equity components must equal comparative closing balances.',
                'figures',
            );
            add(
                t.ppe.every(
                    (a) =>
                        eq(a.current.openCost, ppeClose(a, 'prior').cost) &&
                        eq(a.current.openDep, ppeClose(a, 'prior').dep),
                ),
                'Fixed assets continuity',
                'Current opening cost and depreciation must equal comparative closing balances.',
                'support',
            );
            add(
                eq(t.eos.current.opening, eosClose(t, 'prior')),
                'Employee benefits continuity',
                'Current opening provision must equal comparative closing provision.',
                'support',
            );
        }
        add(
            t.reviewed === stamp(s),
            'Final input review',
            'Confirm all inputs and disclosures after completing the checks.',
            'readiness',
        );
        return out;
    }
    root.HoistModel = {
        defs,
        policyDefs,
        narrativeDefs,
        ppeFields,
        eosFields,
        fresh,
        ensure,
        periods,
        suggest,
        rows,
        sum,
        mappingStamp,
        stamp,
        ppeClose,
        eosClose,
        applicablePolicies,
        validate,
        checks,
    };
    if (typeof module !== 'undefined') module.exports = root.HoistModel;
})(globalThis);
