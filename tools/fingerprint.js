// Statement Studio - behavioural fingerprint harness
//
//     node build.js
//     node tools/fingerprint.js record before.json      # on the current code
//     ...make your change...
//     node build.js
//     node tools/fingerprint.js record after.json
//     node tools/fingerprint.js compare before.json after.json
//
// Why this exists: test-import.js covers storage only. The statement engine,
// the report builder, the trial-balance parser and the PDF have no automated
// coverage at all, so a refactor that claims to preserve behaviour has nothing
// to prove it. This drives the real built bundle in a real browser and hashes
// what the app actually produces - the computed model, the readiness checks,
// the parsed trial balance, every tab's rendered DOM, and the generated PDF.
//
// It is a REGRESSION net, not a test suite: it says "this changed", never
// "this is correct". Record a baseline before you touch anything.
//
// Browser: needs Chrome, Edge or a Playwright chromium. Resolution order is
// $PW_EXECUTABLE, then the "chrome" channel, then "msedge", then any chromium
// under $PLAYWRIGHT_BROWSERS_PATH.

'use strict';

const path = require('path');
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const BUNDLE = 'Statement Studio.html';

// pdf-lib does not emit byte-identical output for identical input, so the PDF's
// hash differs run to run on an unchanged build. Its LENGTH is stable and is
// compared as a normal key; the hash is reported but never fails a comparison.
const UNSTABLE = new Set(['pdf:bytes']);

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

// Mask what is legitimately non-deterministic: company uuids, ISO timestamps
// and epoch milliseconds (ComparisonNotes mints note ids from Date.now()).
const mask = (s) =>
    String(s)
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID')
        .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, 'TIMESTAMP')
        .replace(/\b1[6-9]\d{11}\b/g, 'EPOCHMS');

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

// Try each way of getting a chromium until one launches.
async function launch(chromium) {
    const attempts = [];
    if (process.env.PW_EXECUTABLE) {
        attempts.push(['$PW_EXECUTABLE', { executablePath: process.env.PW_EXECUTABLE }]);
    }
    attempts.push(['playwright chromium', {}]);
    attempts.push(['installed Chrome', { channel: 'chrome' }]);
    attempts.push(['installed Edge', { channel: 'msedge' }]);

    const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (browsers && fs.existsSync(browsers)) {
        for (const dir of fs.readdirSync(browsers).filter((d) => d.startsWith('chromium-'))) {
            const exe = path.join(browsers, dir, 'chrome-linux', 'chrome');
            if (fs.existsSync(exe)) attempts.push([dir, { executablePath: exe }]);
        }
    }

    const tried = [];
    for (const [label, opts] of attempts) {
        try {
            const browser = await chromium.launch(opts);
            return { browser, via: label };
        } catch (err) {
            tried.push(`${label}: ${err.message.split('\n')[0]}`);
        }
    }
    throw new Error(
        'no usable chromium.\n  tried:\n    ' +
            tried.join('\n    ') +
            '\n  fix: install Chrome or Edge, run "npx playwright install chromium",' +
            '\n       or set PW_EXECUTABLE to a chromium binary.',
    );
}

async function record(outFile) {
    let chromium;
    try {
        ({ chromium } = require('playwright-core'));
    } catch {
        throw new Error('playwright-core is not installed. Run: npm install');
    }
    if (!fs.existsSync(path.join(REPO, BUNDLE))) {
        throw new Error(`${BUNDLE} is missing. Run: node build.js`);
    }

    const port = await freePort();
    const server = spawn(process.execPath, ['serve.js', String(port)], {
        cwd: REPO,
        stdio: 'ignore',
    });
    const { browser, via } = await launch(chromium).catch((err) => {
        server.kill();
        throw err;
    });
    console.log(`  browser    ${via}`);

    const out = { recorded: new Date().toISOString(), errors: [], parts: {} };
    try {
        const page = await browser.newPage();
        page.on('pageerror', (e) => out.errors.push(String(e.message)));
        page.on('console', (m) => {
            if (m.type() !== 'error') return;
            // The browser asks for a favicon that is not there. The message text
            // does not name it - only the location does - so match on the URL.
            const from = (m.location() && m.location().url) || '';
            if (/favicon\.ico$/i.test(from)) return;
            out.errors.push('console: ' + m.text() + (from ? '  <- ' + from : ''));
        });

        await page.goto(`http://127.0.0.1:${port}/${encodeURIComponent(BUNDLE)}`, {
            waitUntil: 'load',
        });

        // ---- the company picker, then into the workspace -------------------
        await page.waitForFunction(
            () => document.querySelector('#company-home')?.innerHTML.length,
            {
                timeout: 30000,
            },
        );
        out.parts['dom:company-home'] = sha(
            mask(await page.$eval('#company-home', (e) => e.innerHTML)),
        );
        await page.evaluate(() => {
            const b = Array.from(document.querySelectorAll('#company-home button')).find((x) =>
                /Open preparation/.test(x.innerText),
            );
            if (!b) throw new Error('no "Open preparation" button on the company picker');
            b.click();
        });
        await page.waitForFunction(() => document.querySelectorAll('#nav button').length > 0, {
            timeout: 30000,
        });

        // ---- pure computation: the accounting output itself -----------------
        // Each probe is value-or-error. An identical thrown message before and
        // after is as good an equivalence signal as an identical value, so a
        // probe whose signature drifts still guards the code behind it.
        const computed = await page.evaluate(() => {
            const r = {};
            const probe = (name, fn) => {
                try {
                    r[name] = JSON.stringify(fn()) ?? 'undefined';
                } catch (e) {
                    r[name] = 'THREW: ' + e.message;
                }
            };
            const s = createSampleReport();
            probe('state', () => s);
            probe('model', () => HoistReport.build(s));
            probe('checks', () => HoistModel.checks(s));
            probe('periods', () => HoistModel.periods(s));
            probe('policies', () => HoistModel.applicablePolicies(s));
            probe('rows', () => HoistModel.rows(s));
            probe('mappingStamp', () => HoistModel.mappingStamp(s));
            probe('engineCalc', () => StatementEngine.calc(s));
            probe('engineGroups', () => StatementEngine.groups);
            probe('engineFreshDemo', () => StatementEngine.fresh(true));
            probe('engineFreshBlank', () => StatementEngine.fresh(false));
            probe('engineValidate', () => StatementEngine.validate(JSON.parse(JSON.stringify(s))));
            probe('taxFields', () => HoistTax.fields);
            probe('taxFresh', () => HoistTax.fresh());
            probe('taxCalc', () => HoistTax.calc(s));
            probe('cmpSettings', () => ComparisonNotes.settings(s));
            probe('cmpGenerate', () => ComparisonNotes.generate(s));
            const csv =
                'Account Code,Account Name,Debit,Credit,Category\n' +
                '1000,Cash,1400,0,cash\n4000,Revenue,0,1000,revenue\n' +
                '5000,Cost,600,0,cost\n,Total,2000,2000,\n';
            probe('tbParse', () => TrialBalance.parseDelimited(csv));
            probe('tbAmount', () => [
                TrialBalance.amount('1,234.50'),
                TrialBalance.amount('(99)'),
                TrialBalance.amount('AED 12'),
                TrialBalance.amount(''),
            ]);
            probe('tbAutoColumns', () =>
                TrialBalance.autoColumns(TrialBalance.parseDelimited(csv)),
            );
            probe('reportFmt', () => [
                HoistReport.fmt(0),
                HoistReport.fmt(1234.5),
                HoistReport.fmt(-1234.5),
                HoistReport.fmt(null),
            ]);
            return r;
        });
        for (const [k, v] of Object.entries(computed)) out.parts['compute:' + k] = sha(mask(v));

        // ---- rendered DOM of every tab --------------------------------------
        const tabs = await page.$$eval('#nav button', (bs) => bs.map((b) => b.dataset.tab));
        out.tabs = tabs;
        for (const t of tabs) {
            await page.click(`#nav button[data-tab="${t}"]`);
            await page.waitForTimeout(120);
            out.parts['tab:' + t] = sha(mask(await page.$eval('#view', (e) => e.innerHTML)));
        }
        out.parts['dom:print-report'] = sha(
            mask(await page.$eval('#print-report', (e) => e.innerHTML)),
        );

        // ---- every tab again, this time over the sample report --------------
        // The pass above renders a blank company, so it guards UI structure but
        // is blind to the arithmetic. Swapping app.js's module-level `state` for
        // the populated sample makes the same DOM sensitive to the engine: a
        // sign error in the profit formula shows up here, not just in compute:*.
        await page.evaluate(() => {
            state = createSampleReport();
            render();
        });
        for (const t of tabs) {
            await page.click(`#nav button[data-tab="${t}"]`);
            await page.waitForTimeout(120);
            out.parts[`tab:${t}@sample`] = sha(mask(await page.$eval('#view', (e) => e.innerHTML)));
        }

        // ---- the generated PDF ----------------------------------------------
        const bytes = await page.evaluate(async () => {
            const pdf = await HoistPDF.create(createSampleReport());
            return Array.from(pdf);
        });
        const buf = Buffer.from(bytes);
        const text = buf
            .toString('latin1')
            .replace(/\/(CreationDate|ModDate)\s*\(([^)]*)\)/g, '/$1 (X)')
            .replace(/\/ID\s*\[[^\]]*\]/g, '/ID [X]');
        out.parts['pdf:bytes'] = sha(mask(text));
        out.parts['pdf:length'] = String(buf.length);
    } finally {
        await browser.close();
        server.kill();
    }

    fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
    const stable = Object.keys(out.parts).filter((k) => !UNSTABLE.has(k)).length;
    console.log(
        `  recorded   ${stable} stable + ${UNSTABLE.size} unstable fingerprints -> ${outFile}`,
    );
    if (out.errors.length) {
        console.log('  PAGE ERRORS:');
        for (const e of out.errors) console.log('    ' + e);
    }
    return out;
}

function compare(aFile, bFile) {
    const a = JSON.parse(fs.readFileSync(aFile, 'utf8'));
    const b = JSON.parse(fs.readFileSync(bFile, 'utf8'));
    const keys = [...new Set([...Object.keys(a.parts), ...Object.keys(b.parts)])].sort();

    const changed = [];
    const noisy = [];
    for (const k of keys) {
        if (a.parts[k] === b.parts[k]) continue;
        (UNSTABLE.has(k) ? noisy : changed).push([k, a.parts[k], b.parts[k]]);
    }

    console.log(`  ${path.basename(aFile)} -> ${path.basename(bFile)}`);
    console.log(`  ${keys.length - changed.length - noisy.length} of ${keys.length} identical`);
    if (a.errors.length !== b.errors.length) {
        console.log(`  PAGE ERRORS: ${a.errors.length} -> ${b.errors.length}`);
    }
    for (const [k, x, y] of noisy) {
        console.log(`  unstable (ignored)  ${k}  ${x} -> ${y}`);
    }
    if (!changed.length) {
        console.log('  NO BEHAVIOURAL DIFFERENCES');
        return 0;
    }
    console.log('  CHANGED:');
    for (const [k, x, y] of changed) console.log(`    ${k.padEnd(26)} ${x} -> ${y}`);
    return 1;
}

const [cmd, x, y] = process.argv.slice(2);
(async () => {
    if (cmd === 'record' && x) process.exit((await record(x)) ? 0 : 0);
    else if (cmd === 'compare' && x && y) process.exit(compare(x, y));
    else {
        console.error(
            'usage:\n  node tools/fingerprint.js record <out.json>' +
                '\n  node tools/fingerprint.js compare <before.json> <after.json>',
        );
        process.exit(2);
    }
})().catch((err) => {
    console.error('  fingerprint failed: ' + err.message);
    process.exit(1);
});
