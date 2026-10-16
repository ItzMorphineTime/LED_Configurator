// Tiny zero-dependency static file server used by the regression harness.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.cjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.wasm': 'application/wasm',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.hdr': 'application/octet-stream',
    '.exr': 'application/octet-stream',
};

/**
 * Start a static server rooted at `rootDir` on 127.0.0.1.
 * By default the port is ephemeral (what the harness uses); pass `{ port }` for a fixed port
 * (tools/serve.mjs). Resolves to { url, port, close() }.
 */
export function startStaticServer(rootDir, { port: listenPort = 0 } = {}) {
    const root = path.resolve(rootDir);
    const server = http.createServer((req, res) => {
        try {
            const u = new URL(req.url, 'http://127.0.0.1');
            let rel = decodeURIComponent(u.pathname);
            if (rel.endsWith('/')) rel += 'index.html';
            const filePath = path.resolve(root, '.' + rel);
            // Block path traversal outside the served root.
            if (filePath !== root && !filePath.startsWith(root + path.sep)) {
                res.writeHead(403); res.end('Forbidden'); return;
            }
            fs.stat(filePath, (err, st) => {
                if (err || !st.isFile()) {
                    if (rel === '/favicon.ico') { res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end(); return; }
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not found: ' + rel);
                    return;
                }
                const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
                res.writeHead(200, {
                    'Content-Type': type,
                    'Content-Length': st.size,
                    'Cache-Control': 'no-store',
                });
                if (req.method === 'HEAD') { res.end(); return; }
                fs.createReadStream(filePath).pipe(res);
            });
        } catch (e) {
            res.writeHead(500); res.end(String(e));
        }
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(listenPort, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                port,
                url: `http://127.0.0.1:${port}/`,
                close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
            });
        });
    });
}
