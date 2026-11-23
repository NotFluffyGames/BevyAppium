import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync, chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { connect, newSession, raw } from './helpers.js';

const session = connect;

/** TCP listeners as "addrHex:port" read from the kernel table. */
const listeners = () => readFileSync('/proc/net/tcp', 'utf8').split('\n').slice(1)
  .map(l => l.trim().split(/\s+/)).filter(c => c[3] === '0A').map(c => { const [a, p] = c[1].split(':'); return { addr: a, port: parseInt(p, 16) }; });
const gamePids = () => { try { return execFileSync('pgrep', ['-f', 'target/debug/bevyappium-example'], { encoding: 'utf8' }).trim().split('\n').map(Number); } catch { return []; } };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const until = async (pred: () => boolean, ms = 10000) => { for (let i = 0; i < ms / 100 && !pred(); i++) await sleep(100); };
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

describe('session lifecycle robustness', () => {
  const started: ChildProcess[] = [];
  afterEach(() => { started.splice(0).forEach(c => c.kill('SIGKILL')); });

  it('attach mode connects to a running game and leaves it running', async () => {
    const port = 15900 + Math.floor(Math.random() * 90);
    const game = spawn(inject('gameBinary'), [], { env: { ...process.env, ...inject('gameEnv'), BEVYAPPIUM_PORT: String(port) }, stdio: 'ignore' });
    started.push(game);
    const browser = await session({ 'appium:agentPort': port });
    expect(await browser.$('~Counter').getText()).toBe('count: 0');
    await browser.deleteSession();
    await sleep(500);
    expect(alive(game.pid!)).toBe(true);
  });

  it('launch mode uses a configured Agent port, bound to localhost only, and no second server', async () => {
    const port = 15800 + Math.floor(Math.random() * 90);
    const browser = await session({ 'appium:app': inject('gameBinary'), 'appium:agentPort': port });
    try {
      expect((await fetch(`http://127.0.0.1:${port}`, { method: 'POST', body: '{}' })).status).toBeGreaterThan(0);
      const mine = listeners().filter(l => l.port === port);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every(l => l.addr === '0100007F')).toBe(true); // 127.0.0.1 only
      expect(listeners().some(l => l.port === 15703)).toBe(false); // render-world server is off
    } finally { await browser.deleteSession(); }
  });

  it('a game crash mid-session fails the command with a clear error', async () => {
    const browser = await newSession();
    const [pid] = gamePids();
    process.kill(pid, 'SIGKILL');
    await until(() => !alive(pid));
    const res = await raw(browser, 'POST', '/element', { using: 'accessibility id', value: 'Counter' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.value)).toMatch(/The game exited/);
    await browser.deleteSession();
  });

  it('a missing binary fails session creation clearly', async () => {
    await expect(session({ 'appium:app': '/no/such/game' })).rejects.toThrow(/Could not launch the game binary/);
  });

  it('a game that exits immediately fails session creation clearly', async () => {
    await expect(session({ 'appium:app': '/bin/false' })).rejects.toThrow(/The game exited with code 1/);
  });

  it('an Agent port that never opens times out and the game is terminated', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'never-opens-'));
    const script = path.join(dir, 'never-opens-game');
    writeFileSync(script, '#!/bin/sh\nexec sleep 60\n'); chmodSync(script, 0o755);
    await expect(session({ 'appium:app': script, 'appium:agentStartupTimeout': 1500 })).rejects.toThrow(/did not open port/);
    await sleep(500);
    let leaked = ''; try { leaked = execFileSync('pgrep', ['-f', 'sleep 60'], { encoding: 'utf8' }); } catch { /* none */ }
    expect(leaked.trim()).toBe('');
  });

  it('a session without app or agentPort is rejected', async () => {
    await expect(session({})).rejects.toThrow(/appium:app/);
  });

  /** A fake game (node script) that serves the Agent port; see test/fixtures/stubborn-game.mjs. */
  const fakeGame = () => {
    const script = path.join(mkdtempSync(path.join(tmpdir(), 'fake-game-')), 'fake-game');
    writeFileSync(script, `#!/bin/sh\nexec ${process.execPath} ${path.resolve(__dirname, 'fixtures/stubborn-game.mjs')}\n`);
    chmodSync(script, 0o755);
    return script;
  };
  const processAlive = (pattern: string) => { try { return execFileSync('pgrep', ['-f', pattern], { encoding: 'utf8' }).trim() !== ''; } catch { return false; } };

  it('a game that ignores SIGTERM is killed when the session ends', async () => {
    const browser = await session({ 'appium:app': fakeGame() });
    expect(processAlive('stubborn-game.mjs')).toBe(true);
    await browser.deleteSession();
    expect(processAlive('stubborn-game.mjs')).toBe(false); // killed, not leaked
  });

  it('a hung game fails the command instead of blocking, and the session still ends cleanly', async () => {
    const browser = await session({ 'appium:app': fakeGame(), 'appium:agentCommandTimeout': 1500 });
    // the fake answered the startup probes; now freeze it so it accepts connections but never replies
    const [pid] = execFileSync('pgrep', ['-f', 'stubborn-game.mjs'], { encoding: 'utf8' }).trim().split('\n').map(Number);
    process.kill(pid, 'SIGSTOP');
    const started = Date.now();
    const res = await raw(browser, 'POST', '/element', { using: 'accessibility id', value: 'Anything' });
    expect(Date.now() - started).toBeLessThan(10000);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.value)).toMatch(/did not reply/);
    process.kill(pid, 'SIGCONT');
    await browser.deleteSession();
    expect(processAlive('stubborn-game.mjs')).toBe(false);
  });
});
