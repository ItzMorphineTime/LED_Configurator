#!/usr/bin/env node
// Golden-master capture.
//   node tests/regression/run.mjs --root <dir-to-serve> --out <output-dir> [--only a,b] [--page index.html] [--chrome <path>]
import fs from 'node:fs';
import path from 'node:path';
import { startStaticServer } from './lib/server.mjs';
import { launchChrome } from './lib/cdp.mjs';
import { AppPage } from './lib/app.mjs';
import { Recorder } from './lib/recorder.mjs';
import { SCENARIOS } from './scenarios.mjs';

function parseArgs(argv) {
    const a = { page: 'index.html' };
    for (let i = 2; i < argv.length; i++) {
        const k = argv[i];
        const next = () => argv[++i];
        if (k === '--root') a.root = next();
        else if (k === '--out') a.out = next();
        else if (k === '--only') a.only = next().split(',').map((s) => s.trim()).filter(Boolean);
        else if (k === '--page') a.page = next();
        else if (k === '--chrome') a.chrome = next();
        else if (k === '--list') a.list = true;
        else if (k === '--help' || k === '-h') a.help = true;
        else throw new Error('Unknown argument: ' + k);
    }
    return a;
}

const USAGE = 'Usage: node tests/regression/run.mjs --root <dir-to-serve> --out <output-dir> [--only scenarioA,scenarioB] [--page index.html] [--chrome <path>] [--list]';

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) { console.log(USAGE); return 0; }
    if (args.list) {
        for (const [name, s] of Object.entries(SCENARIOS)) console.log(`${name.padEnd(18)} ${s.description}`);
        return 0;
    }
    if (!args.root || !args.out) { console.error(USAGE); return 2; }
    const root = path.resolve(args.root);
    const out = path.resolve(args.out);
    if (!fs.existsSync(path.join(root, args.page))) { console.error(`No ${args.page} under ${root}`); return 2; }

    const names = args.only || Object.keys(SCENARIOS);
    for (const n of names) if (!SCENARIOS[n]) { console.error(`Unknown scenario "${n}". Known: ${Object.keys(SCENARIOS).join(', ')}`); return 2; }

    // Prepare output dir: only wipe it if it is a previous harness output (has manifest.json) or empty.
    if (fs.existsSync(out)) {
        const entries = fs.readdirSync(out);
        if (entries.length && !entries.includes('manifest.json')) {
            console.error(`Refusing to overwrite non-harness directory ${out} (no manifest.json). Pick an empty/new --out.`);
            return 2;
        }
        if (!args.only) fs.rmSync(out, { recursive: true, force: true });
    }
    fs.mkdirSync(out, { recursive: true });

    // With --only, merge into an existing manifest so a single scenario can be refreshed.
    const manifestPath = path.join(out, 'manifest.json');
    let manifest = { meta: {}, scenarios: {} };
    if (args.only && fs.existsSync(manifestPath)) manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const server = await startStaticServer(root);
    let browser;
    const cleanup = async () => {
        try { if (browser) await browser.close(); } catch { /* ignore */ }
        try { await server.close(); } catch { /* ignore */ }
    };
    const onSignal = async () => { await cleanup(); process.exit(130); };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    let exitCode = 0;
    try {
        browser = await launchChrome({ chromePath: args.chrome });
        const appUrl = server.url + args.page;
        const meta = {
            root,
            page: args.page,
            capturedAt: new Date().toISOString(),
            browser: browser.version.Browser,
            userAgent: browser.version['User-Agent'],
            node: process.version,
            platform: `${process.platform} ${process.arch}`,
        };
        const prev = manifest.meta || {};
        if (args.only && prev.capturedAt) {
            // Merge: keep the original capture's provenance and log this partial refresh next to it.
            for (const k of ['root', 'page', 'browser']) {
                if (prev[k] && prev[k] !== meta[k]) console.warn(`WARNING: merging into a manifest captured with a different ${k}: "${prev[k]}" (now "${meta[k]}")`);
            }
            manifest.meta = { ...prev, partialCaptures: [...(prev.partialCaptures || []), { ...meta, scenarios: names }] };
        } else {
            manifest.meta = meta;
        }
        console.log(`Serving ${root} at ${server.url}  |  ${browser.version.Browser}  |  ${browser.chromePath}`);

        for (const name of names) {
            const t0 = Date.now();
            // Remove stale files of this scenario when refreshing selectively.
            fs.rmSync(path.join(out, name), { recursive: true, force: true });
            const rec = new Recorder(out, name);
            const recordRequests = SCENARIOS[name].recordRequests === true;   // opt-in request log -> network.json
            let app = null;
            let fatal = null;
            try {
                app = await AppPage.open(browser, appUrl, { recordRequests });
                await SCENARIOS[name].run({ app, rec });
            } catch (e) {
                fatal = e;
            }
            const errors = app ? app.errors : [];
            if (fatal) errors.push({ kind: 'harness', step: app ? app.step : 'load', message: String(fatal.message || fatal).split('\n')[0], raw: String(fatal.stack || fatal) });
            let dialogs = [];
            // Every page's dialogs: a scenario that opens fresh pages (AppPage.reload) keeps those of the pages it left.
            try { if (app) dialogs = await app.allDialogs(); } catch { if (app) dialogs = [...app.pastDialogs]; /* page may be gone */ }
            const requests = recordRequests ? (app ? app.externalRequests() : []) : undefined;
            const res = rec.finish({ errors, dialogs, requests });
            manifest.scenarios[name] = { description: SCENARIOS[name].description, durationMs: Date.now() - t0, outputs: res.outputs };
            if (app) await app.close().catch(() => {});
            const nErr = errors.length;
            const harnessErr = errors.filter((e) => e.kind === 'harness' || e.kind === 'network');
            console.log(`  ${name.padEnd(18)} ${String(Object.keys(res.outputs).length).padStart(3)} outputs  ${String(nErr).padStart(2)} errors  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
            for (const e of errors) console.log(`      [${e.kind}] (${e.step}) ${e.message}`);
            if (harnessErr.length) exitCode = 1;
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
        }
    } finally {
        await cleanup();
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Manifest: ${manifestPath}`);
    if (exitCode) console.log('NOTE: harness/network errors occurred (see above). Outputs were still written.');
    return exitCode;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
