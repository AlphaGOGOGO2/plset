// Builds the browser edition of PL SET and copies it into the starjoa site (public/proleague/app).
// Usage: node scripts/build-web.mjs [targetDir]
import { build } from 'vite';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const base = '/proleague/app/';
const out = path.resolve('dist-web');
const target = path.resolve(process.argv[2] ?? '../starjoa/public/proleague/app');

const typecheck = spawnSync('npx tsc -b', { stdio: 'inherit', shell: true, windowsHide: true });
if (typecheck.status) process.exit(typecheck.status);

process.env.PLSET_BASE = base;
process.env.PLSET_OUT = out;
await rm(out, { recursive: true, force: true });
await build({ configFile: path.resolve('vite.config.ts'), logLevel: 'warn' });

await rm(target, { recursive: true, force: true });
await mkdir(path.dirname(target), { recursive: true });
await cp(out, target, { recursive: true });
const assets = await readdir(path.join(target, 'assets'));
console.log(`PL SET web build (base ${base}) copied to ${target} with ${assets.length} asset files`);
