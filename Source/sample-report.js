(function (root) {
    const E = root.StatementEngine,
        M = root.HoistModel;
    function createSampleReport() {
        const s = E.fresh(true);
        s.demo = true;
        s.illustrative = true;
        s.company = {
            ...s.company,
            name: 'Illustrative Trading LLC',
            registration: 'EXAMPLE-001',
            address: 'Dubai, United Arab Emirates (illustrative)',
            activity: 'Trading of equipment and spare parts',
            manager: 'Example Manager',
            start: '2025-01-01',
            end: '2025-12-31',
            priorStart: '2024-01-01',
            priorEnd: '2024-12-31',
        };
        s.management = '';
        const t = M.ensure(s);
        Object.assign(t.info, {
            legalForm: 'limited liability company',
            issuer: 'Example licensing authority',
            incorporated: '2020-01-01',
            approvalDate: '2026-06-30',
            approvalBody: 'the management',
            functionalCurrency: 'AED',
        });
        const policyTexts = {
            basis: 'These illustrative financial statements use historical cost information to demonstrate the report template. This example does not assert compliance with a financial reporting framework and must not be used as company financial statements.',
            going: 'For this illustrative example, management assumes that the entity will continue operating for the foreseeable future. Real company reports must describe the actual going concern assessment and any material uncertainties.',
            ppe: 'Property, plant and equipment are shown at recorded cost less accumulated depreciation and impairment. In this example, depreciation is calculated on a straight-line basis over the assessed useful lives. Actual useful lives, residual values and impairment assessments must be provided by the reporting entity.',
            receivables:
                'Receivables are shown net of recorded allowances. The impairment assessment for a real entity must consider collectability and the methodology required by its selected reporting framework.',
            financial:
                'Financial asset and liability balances in this example are the amounts entered in the financial figures. The reporting entity must describe its classification, measurement, interest recognition and derecognition policies.',
            employees:
                'Employee benefit obligations are based on the recorded provision and the movements entered in the supporting schedule. Actual valuation assumptions and the applicable policy must be supplied for a company report.',
            revenue:
                'Revenue in this example represents equipment sales during the period. The company must specify the actual recognition point, treatment of returns and discounts, and any service revenue recognition policy.',
            leases: 'No lease balances are included in this illustrative data set. This statement does not establish whether a real company has leases.',
            fx: 'Amounts in the illustrative data set are presented in AED. A real report must describe the treatment of foreign-currency transactions and monetary balances where relevant.',
            cash: 'For this example, cash and cash equivalents comprise the bank balances entered in the financial position. Restricted balances and overdraft arrangements, if any, require separate consideration.',
            tax: 'Tax expense comprises the current and deferred tax amounts entered in the tax schedule. The example illustrates reconciliation mechanics only and does not determine tax eligibility, filing requirements or tax relief.',
            inventory:
                'Inventories in this illustrative data set are recorded at the entered closing value. The reporting entity must specify its cost formula and the assessment of net realisable value.',
        };
        Object.assign(t.policies, policyTexts);
        Object.assign(t.narrative, {
            estimates:
                'The illustrative figures demonstrate a fixed-asset roll-forward and a provision for employee benefits. They are not based on management estimates for an actual company. A real report should disclose material useful-life, impairment and other estimation assumptions.',
            related:
                'No related-party balances or transactions are included in this illustrative data set.',
            risk: 'The illustrative entity has cash, receivables and payables. Its report would describe the actual policies for customer credit assessment, collection, funding and liquidity monitoring. No unverified risk-management procedures are asserted in this demonstration.',
            commitments:
                'No commitments or contingent liabilities are included in the illustrative data set. Management must confirm the position for a real company.',
            tax: 'This example contains a current-tax expense of AED 10,000 solely to demonstrate the corporate tax disclosure and reconciliation. It is not a tax computation and does not claim any UAE exemption or relief.',
            events: 'No subsequent events are included in this illustrative data set. Management must assess events through the authorisation date for a real report.',
            comparatives:
                'Comparative amounts are presented for the preceding twelve-month period. The figures are illustrative and are not extracted from the supplied audited statements.',
        });
        const pp = () => Object.fromEntries(Object.keys(M.ppeFields).map((k) => [k, 0]));
        t.ppe = [
            {
                id: 'p1',
                label: 'Office and trading equipment',
                current: {
                    ...pp(),
                    openCost: 300000,
                    additions: 80000,
                    openDep: 100000,
                    charge: 30000,
                },
                prior: {
                    ...pp(),
                    openCost: 250000,
                    additions: 50000,
                    openDep: 80000,
                    charge: 20000,
                },
            },
        ];
        t.eos = {
            current: { opening: 15000, charge: 5000, paid: 0, other: 0 },
            prior: { opening: 10000, charge: 5000, paid: 0, other: 0 },
        };
        t.shares = [
            {
                id: 's1',
                name: 'Example Shareholder',
                nationality: 'Example nationality',
                par: 1,
                current: 300000,
                prior: 300000,
            },
        ];
        s.rows.find((r) => r.group === 'tax').current = 10000;
        s.rows.find((r) => r.group === 'retained').current = 180000;
        s.rows.push({
            id: 'tax-payable',
            label: 'Corporate income tax payable',
            group: 'currentLiability',
            hoistNote: 17,
            current: 10000,
            prior: 0,
            note: '',
        });
        s.cash.current.operatingOther = 10000;
        t.cashDetails = Object.keys(E.cashFields)
            .filter((k) => k !== 'opening' && (s.cash.current[k] || s.cash.prior[k]))
            .map((k, i) => ({
                id: 'cf' + i,
                kind: k,
                label:
                    k === 'operatingOther' ? 'Current tax expense not yet paid' : E.cashFields[k],
                current: s.cash.current[k],
                prior: s.cash.prior[k],
            }));
        Object.assign(t.tax, {
            registration: 'Illustrative registration only - not a real TRN',
            regime: 'Illustrative tax scenario; no eligibility conclusion',
            basis: 'The tax figures demonstrate the representation of current tax, an effective-tax bridge and payable movements. The AED 7,100 reconciling reduction is an illustrative adjustment and is not attributed to any actual tax law provision. The comparative tax expense and deferred tax balances are nil in this data set.',
        });
        Object.assign(t.tax.current, {
            referenceRate: 9,
            taxableIncome: 190000,
            currentExpense: 10000,
            otherEffect: -7100,
            closingPayable: 10000,
        });
        s.cash.current.noncash = 35000;
        s.cash.current.investing = -80000;
        s.cash.prior.noncash = 25000;
        s.cash.prior.working = -35000;
        s.cash.prior.investing = -50000;
        s.cash.prior.financing = -30000;
        t.cashDetails = Object.keys(E.cashFields)
            .filter((k) => k !== 'opening' && (s.cash.current[k] || s.cash.prior[k]))
            .map((k, i) => ({
                id: 'cf' + i,
                kind: k,
                label:
                    k === 'noncash'
                        ? 'Depreciation and employee benefit provision'
                        : k === 'operatingOther'
                          ? 'Current tax expense not yet paid'
                          : E.cashFields[k],
                current: s.cash.current[k],
                prior: s.cash.prior[k],
            }));
        t.risks = {};
        for (const [key, def] of Object.entries(HoistDisclosureDrafts.riskDefs))
            t.risks[key] =
                'Illustrative ' +
                def[0].toLowerCase() +
                ': this demonstration does not include an assessment of actual company exposures or controls. Replace with the reporting entity’s reviewed information.';
        t.mappingReviewed = M.mappingStamp(s);
        t.reviewed = '';
        return s;
    }

    root.createSampleReport = createSampleReport;
})(globalThis);
