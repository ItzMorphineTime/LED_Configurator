#!/usr/bin/env node
/**
 * Zero-dependency static server for local development.
 *
 *   node tools/serve.mjs [--port 8000] [--root .]
 *
 * ES modules do not load from file://, so the configurator must be served over HTTP. This reuses
 * the golden-master harness server (tests/regression/lib/server.mjs), which serves .js and .mjs as
 * `text/javascript`. Some static servers on Windows take the MIME type from the registry and serve
 * JavaScript as text/plain, which browsers refuse for module scripts.
 *
 * The server listens on 127.0.0.1 only (not reachable from the network). Stop it with Ctrl+C.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startStaticServer } from '../tests/regression/lib/server.mjs';

const USAGE = 'Usage: node tools/serve.mjs [--port 8000] [--root .]';

/**
 * Parse the command line.
 * @param {string[]} argv process.argv
 * @returns {{port: number, root: string, help: boolean}}
 */
function parseArgs(argv) {
    const args = { port: 8000, root: '.', help: false };
    for (let i = 2; i < argv.length; i++) {
        const k = argv[i];
        if (k === '--port') args.port = Number(argv[++i]);
        else if (k === '--root') args.root = argv[++i];
        else if (k === '--help' || k === '-h') args.help = true;
        else throw new Error(`Unknown argument: ${k}\n${USAGE}`);
    }
    if (!Number.isInteger(args.port) || args.port < 0 || args.port > 65535) throw new Error(`Bad --port value\n${USAGE}`);
    if (typeof args.root !== 'string' || !args.root) throw new Error(`Missing --root value\n${USAGE}`);
    return args;
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) { console.log(USAGE); return; }
    const root = path.resolve(args.root);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`Not a directory: ${root}`);

    const server = await startStaticServer(root, { port: args.port });
    console.log(`Serving ${root}`);
    console.log(`  ${server.url}`);
    if (!fs.existsSync(path.join(root, 'index.html'))) console.log('  (note: no index.html in this directory)');
    console.log('Press Ctrl+C to stop.');

    const stop = async () => { await server.close(); process.exit(0); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}

main().catch((e) => {
    console.error(e.code === 'EADDRINUSE' ? `Port already in use: ${e.message}` : e.message || e);
    process.exit(1);
});
