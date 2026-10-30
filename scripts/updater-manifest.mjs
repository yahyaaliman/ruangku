// Run AFTER Authenticode signing: the updater signature covers the final installer.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const tag = process.env.GITHUB_REF_NAME;
if (tag !== `v${pkg.version}`) throw new Error('Tag rilis harus sama dengan versi package.json dan tauri.conf.json.');
const conf = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
if (conf.version !== pkg.version) throw new Error('Versi Tauri dan frontend berbeda.');
const dir = 'src-tauri/target/release/bundle/nsis';
const installers = (await readdir(dir)).filter(n => n.endsWith('.exe'));
if (installers.length !== 1) throw new Error('Harus ada tepat satu installer NSIS.');
if (!process.env.TAURI_SIGNING_PRIVATE_KEY || !process.env.RUANGKU_UPDATER_PUBLIC_KEY) throw new Error('Kunci updater wajib diatur untuk rilis.');
const file = path.join(dir, installers[0]);
execFileSync(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', 'signer', 'sign', '--app-version', pkg.version, file], { stdio: 'inherit' });
const signature = (await readFile(`${file}.sig`, 'utf8')).trim();
const repo = process.env.GITHUB_REPOSITORY;
if (repo !== 'yahyaaliman/ruangku') throw new Error('Alamat rilis berbeda dari endpoint updater yang tertanam.');
await writeFile('src-tauri/target/release/bundle/latest.json', JSON.stringify({
  version: pkg.version, notes: `Ruangku ${pkg.version}`, pub_date: new Date().toISOString(),
  platforms: { 'windows-x86_64': { signature, url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(installers[0])}` } },
}, null, 2));
