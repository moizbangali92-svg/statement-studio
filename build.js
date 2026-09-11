// Statement Studio - Source -> single-file bundle
//
//     node build.js
//
// Produces "Statement Studio.html": the one artefact the browser shortcut and
// the Electron window both load. Source/ is the truth; this file is generated.
//
// The recipe was reverse-engineered from the bundle that shipped before this
// script existed, so output stays structurally identical to it:
//   - every source is normalised CRLF -> LF and inlined verbatim
//   - style.css replaces the <link> tag
//   - the XLSX worker is embedded as a JSON string, because a file:// page
//     cannot construct a classic Worker (SecurityError, origin 'null');
//     tb-ui.js turns that string into a blob: Worker, which file:// does allow
//   - the worker's importScripts() is replaced inline for the same reason:
//     a blob: worker cannot resolve a relative script path
//   - the CSV template becomes a data: URI

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'Source');
const OUT = path.join(__dirname, 'Statement Studio.html');
const WORKER = 'tb-worker.js';
const XLSX = 'vendor/xlsx.full.min.js';
const TEMPLATE = 'trial-balance-template.csv';

function readText(rel) {
    const full = path.join(SRC, rel);
    if (!fs.existsSync(full)) throw new Error(`build: missing source file ${rel}`);
    return fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
}

// An inlined script ends at the first literal </script in its text, whatever
// the surrounding quotes. Nothing in Source/ trips this today; fail loudly
// rather than silently emit a bundle that truncates mid-file.
function assertInlineable(rel, text) {
    if (/<\/script/i.test(text)) {
        throw new Error(`build: ${rel} contains a literal </script and cannot be inlined verbatim`);
    }
}

// JSON for embedding in HTML: escape every "<" so the payload can never form a
// closing tag, and escape non-ASCII so the blob survives any charset handling.
// ">" and "&" are left alone - neither can terminate a script element.
function jsonForScriptElement(value) {
    return JSON.stringify(value).replace(
        /[^\x20-\x7E]|</g,
        (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'),
    );
}

function build() {
    let html = readText('index.html');

    // ---- stylesheet ----------------------------------------------------
    const linkTag = /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/i;
    const link = html.match(linkTag);
    if (!link) throw new Error('build: no <link rel="stylesheet"> found in index.html');
    // Replacer functions throughout: a replacement STRING would interpret $1,
    // $& and $' inside the inlined file and silently corrupt it.
    html = html.replace(linkTag, () => `<style>${readText(link[1])}</style>`);

    // ---- the Excel worker, with its dependency folded in ---------------
    const workerSrc = readText(WORKER);
    // Consume the call but not its newline, so the seam matches the original.
    const importLine = /importScripts\((['"])([^'"]+)\1\);?/;
    const imp = workerSrc.match(importLine);
    if (!imp) throw new Error(`build: expected an importScripts() call in ${WORKER}`);
    const xlsxSrc = readText(imp[2]);
    const workerPayload = workerSrc
        .replace(importLine, '') // drop the import
        .replace(/^'use strict';\n/, (m) => m + xlsxSrc);
    assertInlineable(WORKER, workerPayload);

    // ---- scripts -------------------------------------------------------
    const scriptTag = /<script src="([^"]+)"><\/script>/g;
    const inlined = [];
    let first = true;

    html = html.replace(scriptTag, (_match, rel) => {
        let text = readText(rel);

        // The CSV template has no file to point at once bundled.
        if (text.includes(TEMPLATE)) {
            const b64 = fs.readFileSync(path.join(SRC, TEMPLATE)).toString('base64');
            text = text.split(`href="${TEMPLATE}"`).join(`href="data:text/csv;base64,${b64}"`);
        }

        assertInlineable(rel, text);
        inlined.push(rel);

        const tag = `<script>${text}</script>`;
        if (!first) return tag;
        first = false;
        // The worker payload must exist before tb-ui.js looks for it.
        return `<script id="embedded-tb-worker" type="application/json">${jsonForScriptElement(workerPayload)}</script>${tag}`;
    });

    if (!inlined.length) throw new Error('build: no <script src> tags found in index.html');

    // ---- checks --------------------------------------------------------
    const opens = (html.match(/<script/g) || []).length;
    const closes = (html.match(/<\/script>/g) || []).length;
    if (opens !== closes)
        throw new Error(`build: unbalanced script tags (${opens} open, ${closes} close)`);
    if (opens !== inlined.length + 1)
        throw new Error(`build: expected ${inlined.length + 1} script blocks, produced ${opens}`);
    if (/<script src=/.test(html)) throw new Error('build: a <script src> survived inlining');
    if (/<link\s+rel="stylesheet"/i.test(html))
        throw new Error('build: a stylesheet link survived inlining');

    fs.writeFileSync(OUT, html, 'utf8');
    return {
        bytes: Buffer.byteLength(html, 'utf8'),
        scripts: inlined,
        worker: workerPayload.length,
    };
}

try {
    const r = build();
    const mb = (r.bytes / 1024 / 1024).toFixed(2);
    console.log(`  built  Statement Studio.html  ${r.bytes.toLocaleString()} bytes (${mb} MB)`);
    console.log(
        `         ${r.scripts.length} scripts inlined, worker payload ${r.worker.toLocaleString()} chars`,
    );
    console.log(`         ${r.scripts.join(', ')}`);
} catch (err) {
    console.error(`  ${err.message}`);
    process.exit(1);
}
