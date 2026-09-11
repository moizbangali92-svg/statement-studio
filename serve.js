// Statement Studio - local review server
//
//     node serve.js [port]
//
// Zero dependencies. Serves the project folder over http so both builds can be
// reviewed side by side:
//
//   /Source/index.html      the unbundled app - edit a file, reload, see it
//   /Statement Studio.html  the built bundle, exactly what ships
//
// Why this exists: opening Source/index.html straight off the disk gives the
// page a file:// origin, and Chrome refuses to construct a classic Worker from
// one ("cannot be accessed from origin 'null'"), so the Excel import throws
// before it starts. Over http the same code works, which makes Source/ usable
// for review instead of build-only.

'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json; charset=utf-8',
};

// Resolve inside ROOT or refuse. Blocks ../ traversal and absolute escapes.
function resolveSafe(pathname) {
    const decoded = decodeURIComponent(pathname);
    const target = path.resolve(ROOT, '.' + (decoded.startsWith('/') ? decoded : '/' + decoded));
    const rel = path.relative(ROOT, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return target;
}

async function listing(dir, pathname) {
    const names = await fsp.readdir(dir, { withFileTypes: true });
    const rows = names
        .filter((d) => !d.name.startsWith('.') && d.name !== 'node_modules')
        .sort((a, b) => b.isDirectory() - a.isDirectory() || a.name.localeCompare(b.name))
        .map((d) => {
            const href =
                path.posix.join(pathname, encodeURIComponent(d.name)) +
                (d.isDirectory() ? '/' : '');
            return `<li><a href="${href}">${d.name}${d.isDirectory() ? '/' : ''}</a></li>`;
        })
        .join('');
    return (
        `<!doctype html><meta charset="utf-8"><title>${pathname}</title>` +
        `<style>body{font:14px system-ui;margin:2rem;max-width:48rem}` +
        `li{margin:.25rem 0}a{color:#17698c}</style>` +
        `<h1>${pathname}</h1><ul>${rows}</ul>`
    );
}

const server = http.createServer(async (req, res) => {
    const pathname = url.parse(req.url).pathname;
    const target = resolveSafe(pathname);
    if (!target) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        return res.end('403 outside project root');
    }

    try {
        let stat = await fsp.stat(target);
        let file = target;

        if (stat.isDirectory()) {
            const index = path.join(target, 'index.html');
            if (fs.existsSync(index)) {
                file = index;
                stat = await fsp.stat(file);
            } else {
                const body = await listing(
                    target,
                    pathname.endsWith('/') ? pathname : pathname + '/',
                );
                res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                return res.end(body);
            }
        }

        res.writeHead(200, {
            'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'content-length': stat.size,
            // Always re-read from disk: this is a review server, not a CDN.
            'cache-control': 'no-store',
        });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(file).pipe(res);
        console.log(`  ${res.statusCode}  ${pathname}`);
    } catch (err) {
        const code = err.code === 'ENOENT' ? 404 : 500;
        res.writeHead(code, { 'content-type': 'text/plain' });
        res.end(`${code} ${err.code || 'error'}`);
        console.log(`  ${code}  ${pathname}`);
    }
});

server.listen(PORT, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${PORT}`;
    console.log(`\n  Statement Studio review server\n`);
    console.log(`    unbundled  ${base}/Source/index.html`);
    console.log(`    bundle     ${base}/${encodeURIComponent('Statement Studio.html')}`);
    console.log(`\n  Bound to 127.0.0.1 only. Ctrl+C to stop.\n`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`  port ${PORT} is already in use - try: node serve.js ${PORT + 1}`);
        process.exit(1);
    }
    throw err;
});
