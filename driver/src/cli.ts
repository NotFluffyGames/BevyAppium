#!/usr/bin/env node
// bevyappium CLI: `doctor` (environment check), `inspect` (explore a game's element tree),
// `run` (start Appium and run a test command against a game).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { AgentClient } from './agent-client.js';
import { GameProcess, freePort, waitForAgent } from './game-process.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(here, '..', '..');
const pkg = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));

const USAGE = `bevyappium <command>

  doctor [--json]                         check the environment (Node, display, Vulkan, Rust, system libraries)
  inspect (--app <binary> | --port <n>)   explore a game's element tree interactively
                                          commands: tree | find <name> | text <id> | attr <id> <name> | click <id> | shot <file.png> | quit
  run --app <binary> -- <command...>      start Appium with this driver and run <command>; it gets
                                          APPIUM_HOST, APPIUM_PORT and BEVYAPPIUM_APP in its environment
`;

// ---------- doctor ----------
type Check = { name: string; ok: boolean; detail: string; fix?: string };

function cmpVersion(a: string, b: string) {
  const [x, y] = [a, b].map(v => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}
const tool = (cmd: string, args: string[]) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); return r.error || r.status !== 0 ? undefined : (r.stdout || r.stderr).trim(); };

export function doctor(): Check[] {
  const checks: Check[] = [];
  const nodeV = process.versions.node;
  const okNode = [[22, 22, 2], [24, 15, 0]].some(([maj, min, pat]) => {
    const [a, b, c] = nodeV.split('.').map(Number); return a === maj ? cmpVersion(`${a}.${b}.${c}`, `${maj}.${min}.${pat}`) >= 0 : a > 24;
  });
  checks.push({ name: 'node', ok: okNode, detail: `Node ${nodeV}`, fix: 'Install Node 22.22.2+ (or 24.15+) — required by Appium 4' });

  const rustc = tool('rustc', ['--version']);
  const rv = rustc?.match(/rustc (\d+\.\d+\.\d+)/)?.[1];
  checks.push({ name: 'rust', ok: !!rv && cmpVersion(rv, '1.97.1') >= 0, detail: rustc ?? 'rustc not found', fix: 'Install Rust 1.97.1+ (Bevy 0.20.1 requires it): rustup update stable' });

  const display = !!process.env.DISPLAY || !!process.env.WAYLAND_DISPLAY;
  const xvfb = !!tool('which', ['Xvfb']) || !!tool('which', ['xvfb-run']);
  checks.push({ name: 'display', ok: display || xvfb, detail: display ? `display ${process.env.DISPLAY ?? process.env.WAYLAND_DISPLAY}` : xvfb ? 'no display set, Xvfb available' : 'no display and no Xvfb', fix: 'Set DISPLAY, or install Xvfb to run headless (xvfb-run <command>)' });

  const icdDirs = ['/usr/share/vulkan/icd.d', '/etc/vulkan/icd.d'];
  const icds = icdDirs.flatMap(d => existsSync(d) ? readdirSync(d) : []);
  const vk = !!process.env.VK_ICD_FILENAMES || icds.length > 0;
  checks.push({ name: 'vulkan', ok: vk, detail: vk ? (process.env.VK_ICD_FILENAMES ?? icds.join(', ')) : 'no Vulkan driver found', fix: 'Install a Vulkan driver; for software rendering: apt install mesa-vulkan-drivers' });

  if (process.platform === 'linux') {
    const libs = ['alsa', 'libudev', 'wayland-client', 'xkbcommon', 'x11'];
    const missing = libs.filter(l => spawnSync('pkg-config', ['--exists', l]).status !== 0);
    checks.push({ name: 'system-libraries', ok: missing.length === 0, detail: missing.length ? `missing: ${missing.join(', ')}` : 'all present', fix: 'apt install libasound2-dev libudev-dev libwayland-dev libxkbcommon-dev libx11-dev pkg-config (and libxkbcommon-x11-0 at runtime)' });
  }
  return checks;
}

// ---------- inspect ----------
function printTree(xml: string): string {
  const out: string[] = []; let depth = 0;
  for (const m of xml.matchAll(/<(\/?)Entity([^>]*?)(\/?)>/g)) {
    if (m[1]) { depth--; continue; }
    const attr = (k: string) => m[2].match(new RegExp(`${k}="([^"]*)"`))?.[1] ?? '';
    out.push(`${'  '.repeat(depth)}${attr('name') || '(unnamed)'}  id=${attr('id')}  [${attr('components')}]`);
    if (!m[3]) depth++;
  }
  return out.join('\n');
}

async function inspect(client: AgentClient, input: NodeJS.ReadableStream, output: NodeJS.WritableStream) {
  const say = (s: string) => output.write(s + '\n');
  const rl = readline.createInterface({ input, terminal: false });
  say('Connected. Commands: tree | find <name> | text <id> | attr <id> <name> | click <id> | shot <file.png> | quit');
  for await (const line of rl) {
    const [cmd, ...a] = line.trim().split(/\s+/);
    try {
      if (!cmd) continue;
      if (cmd === 'quit' || cmd === 'exit') break;
      else if (cmd === 'tree') say(printTree(((await client.run([{ source: true }]))[0].xml) as string));
      else if (cmd === 'find') say(JSON.stringify((await client.run([{ find: { using: 'name', value: a[0] } }]))[0]));
      else if (cmd === 'text') say(JSON.stringify((await client.run([{ text: a[0] }]))[0]));
      else if (cmd === 'attr') say(JSON.stringify((await client.run([{ attr: { element: a[0], name: a[1] } }]))[0]));
      else if (cmd === 'click') say(JSON.stringify((await client.run([{ click: a[0] }]))[0]));
      else if (cmd === 'shot') { const r = (await client.run([{ screenshot: true }]))[0]; if (r.png) { writeFileSync(a[0], Buffer.from(r.png, 'base64')); say(`saved ${a[0]}`); } else say(JSON.stringify(r)); }
      else say(`unknown command '${cmd}'`);
    } catch (e) { say(`error: ${(e as Error).message}`); }
  }
  rl.close();
}

// ---------- run ----------
async function startAppium(): Promise<{ port: number; stop: () => void }> {
  const require = createRequire(path.join(process.cwd(), 'noop.js'));
  const appiumBin = path.join(path.dirname(require.resolve('appium/package.json')), 'index.js');
  const home = mkdtempSync(path.join(tmpdir(), 'bevyappium-home-'));
  const env = { ...process.env, APPIUM_HOME: home };
  const inst = spawnSync('node', [appiumBin, 'driver', 'install', '--source=local', packageDir], { env, stdio: 'inherit' });
  if (inst.status !== 0) throw new Error('Could not install the driver into Appium');
  const port = await freePort();
  const server = spawn('node', [appiumBin, 'server', '--port', String(port), '--log-level', 'warn'], { env, stdio: 'inherit' });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/status`)).ok) break; } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 250));
  }
  return { port, stop: () => server.kill('SIGTERM') };
}

// ---------- main ----------
async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === 'doctor') {
    const { values } = parseArgs({ args: rest, options: { json: { type: 'boolean' } } });
    const checks = doctor();
    if (values.json) console.log(JSON.stringify(checks, null, 2));
    else for (const c of checks) console.log(`${c.ok ? '✔' : '✖'} ${c.name}: ${c.detail}${c.ok ? '' : `\n    fix: ${c.fix}`}`);
    return checks.every(c => c.ok) ? 0 : 1;
  }
  if (command === 'inspect') {
    const { values } = parseArgs({ args: rest, options: { app: { type: 'string' }, port: { type: 'string' } } });
    let game: GameProcess | undefined; let client: AgentClient;
    if (values.app) { game = new GameProcess(values.app, await freePort()); client = await game.start(60000); }
    else if (values.port) client = await waitForAgent(Number(values.port), 30000);
    else { console.error(USAGE); return 2; }
    try { await inspect(client, process.stdin, process.stdout); } finally { game?.stop(); }
    return 0;
  }
  if (command === 'run') {
    const dd = rest.indexOf('--');
    const { values } = parseArgs({ args: dd < 0 ? rest : rest.slice(0, dd), options: { app: { type: 'string' } } });
    const cmd = dd < 0 ? [] : rest.slice(dd + 1);
    if (!values.app || cmd.length === 0) { console.error(USAGE); return 2; }
    const appium = await startAppium();
    try {
      const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', env: { ...process.env, APPIUM_HOST: '127.0.0.1', APPIUM_PORT: String(appium.port), BEVYAPPIUM_APP: path.resolve(values.app) } });
      return r.status ?? 1;
    } finally { appium.stop(); }
  }
  console.error(USAGE); return command ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(c => process.exit(c), e => { console.error(e.message); process.exit(1); });
}
void pkg;
