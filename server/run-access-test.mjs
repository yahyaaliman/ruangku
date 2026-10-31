// Starts a disposable server/database; no production credentials are used.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
const binary = process.env.PB_TEST_BIN;
if (!binary) throw new Error('Set PB_TEST_BIN to PocketBase 0.40.6.');
const dir = await mkdtemp(path.join(tmpdir(), 'ruangku-access-'));
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const credentials = { email: 'test-admin@example.test', password: randomUUID() + 'Aa1!' };
const args = ['--dir=' + dir, '--hooksDir=' + path.resolve('server/pb_hooks'), '--migrationsDir=' + path.resolve('server/pb_migrations')];
let server, logs = '';
try {
  execFileSync(binary, ['superuser', 'upsert', credentials.email, credentials.password, ...args], { stdio: 'pipe', windowsHide: true });
  const auth = path.join(dir, 'test-auth.json'); await writeFile(auth, JSON.stringify(credentials));
  server = spawn(binary, ['serve', '--http=127.0.0.1:' + port, ...args], { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  server.stdout.on('data', b => logs = (logs + b).slice(-12000)); server.stderr.on('data', b => logs = (logs + b).slice(-12000));
  const base = 'http://127.0.0.1:' + port;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await fetch(base + '/api/health')).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Disposable PocketBase failed to start.');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server/test-access.mjs'], { stdio:'inherit', windowsHide:true, env:{...process.env,PB_TEST_URL:base,PB_TEST_AUTH:auth} });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('Access integration failed.')));
  });
} finally {
  if (server && server.exitCode === null) { const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped; }
  await rm(dir, { recursive: true, force: true });
}
