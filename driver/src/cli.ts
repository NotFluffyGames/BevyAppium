#!/usr/bin/env node
// bevyappium CLI: `doctor` (environment check), `inspect` (explore a game's element tree),
// `run` (start Appium and run a test command against a game).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { AgentClient } from './agent-client.js';
import { startAppium } from './appium-server.js';
import { doctor } from './doctor.js';
import { GameProcess, freePort, waitForAgent } from './game-process.js';
import { inspect } from './inspect.js';

const driverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ATTACH_TIMEOUT_MS = 30000;

const USAGE = `bevyappium <command>

  doctor [--json]                         check the environment (Node, display, Vulkan, Rust, system libraries)
  inspect (--app <binary> | --port <n>)   explore a game's element tree interactively
                                          commands: tree | find <name> | text <id> | attr <id> <name> | click <id> | shot <file.png> | quit
  run --app <binary> -- <command...>      start Appium with this driver and run <command>; it gets
                                          APPIUM_HOST, APPIUM_PORT and BEVYAPPIUM_APP in its environment
`;

function runDoctor(args: string[]): number {
  const { values } = parseArgs({ args, options: { json: { type: 'boolean' } } });
  const checks = doctor();
  if (values.json) console.log(JSON.stringify(checks, null, 2));
  else for (const c of checks) console.log(`${c.ok ? '✔' : '✖'} ${c.name}: ${c.detail}${c.ok ? '' : `\n    fix: ${c.fix}`}`);
  return checks.every(c => c.ok) ? 0 : 1;
}

async function runInspect(args: string[]): Promise<number> {
  const { values } = parseArgs({ args, options: { app: { type: 'string' }, port: { type: 'string' } } });
  let game: GameProcess | undefined;
  let client: AgentClient;
  if (values.app) {
    game = new GameProcess(values.app, await freePort());
    client = await game.start();
  } else if (values.port) {
    client = await waitForAgent(Number(values.port), { startupTimeoutMs: ATTACH_TIMEOUT_MS });
  } else {
    console.error(USAGE);
    return 2;
  }
  try { await inspect(client, process.stdin, process.stdout); } finally { await game?.stop(); }
  return 0;
}

async function runTests(args: string[]): Promise<number> {
  const separator = args.indexOf('--');
  const { values } = parseArgs({ args: separator < 0 ? args : args.slice(0, separator), options: { app: { type: 'string' } } });
  const command = separator < 0 ? [] : args.slice(separator + 1);
  if (!values.app || command.length === 0) {
    console.error(USAGE);
    return 2;
  }
  const appium = await startAppium(driverDir);
  try {
    const env = { ...process.env, APPIUM_HOST: '127.0.0.1', APPIUM_PORT: String(appium.port), BEVYAPPIUM_APP: path.resolve(values.app) };
    return spawnSync(command[0], command.slice(1), { stdio: 'inherit', env }).status ?? 1;
  } finally { appium.stop(); }
}

async function main([command, ...args]: string[]): Promise<number> {
  if (command === 'doctor') return runDoctor(args);
  if (command === 'inspect') return await runInspect(args);
  if (command === 'run') return await runTests(args);
  console.error(USAGE);
  return command ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => process.exit(code), e => { console.error(e.message); process.exit(1); });
}
