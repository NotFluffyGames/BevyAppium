import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { AgentClient, DEFAULT_COMMAND_TIMEOUT_MS } from './agent-client.js';

/** How long to wait for the Agent port to open after launching (or attaching). */
export const DEFAULT_STARTUP_TIMEOUT_MS = 60000;
/** After SIGTERM, how long a game gets to exit before it is killed. */
const TERMINATE_GRACE_MS = 3000;

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address() as net.AddressInfo; s.close(() => resolve(port)); });
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface WaitOptions {
  startupTimeoutMs?: number;
  commandTimeoutMs?: number;
  /** Return a reason to stop waiting early (for example, the game already exited). */
  abort?: () => string | undefined;
}

/** Poll until the Agent answers; resolves with a client whose commands use `commandTimeoutMs`. */
export async function waitForAgent(port: number, opts: WaitOptions = {}): Promise<AgentClient> {
  const { startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS, commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, abort = () => undefined } = opts;
  const client = new AgentClient(port, commandTimeoutMs);
  const deadline = Date.now() + startupTimeoutMs;
  for (;;) {
    const why = abort();
    if (why) throw new Error(why);
    try { await client.run([], 2000); return client; } catch { /* not up yet */ }
    if (Date.now() >= deadline) throw new Error(`The Agent did not open port ${port} within ${startupTimeoutMs} ms`);
    await sleep(250);
  }
}

// If the Driver's process ends (Appium shut down or killed), do not leave games running.
const live = new Set<ChildProcess>();
process.on('exit', () => { for (const child of live) child.kill('SIGKILL'); });

/** Launches the game binary with the Agent port and owns its lifetime. */
export class GameProcess {
  private child?: ChildProcess;
  private spawnError?: Error;
  /** Set once the game process has ended, for any reason. */
  exited?: { code: number | null; signal: NodeJS.Signals | null };

  constructor(readonly binary: string, readonly port: number) {}

  async start(opts: WaitOptions = {}): Promise<AgentClient> {
    const child = spawn(this.binary, [], { env: { ...process.env, BEVYAPPIUM_PORT: String(this.port) }, stdio: 'inherit' });
    this.child = child;
    live.add(child);
    child.once('error', e => { this.spawnError = e; });
    child.once('exit', (code, signal) => { this.exited = { code, signal }; live.delete(child); });
    try {
      return await waitForAgent(this.port, { ...opts, abort: () => this.problem() });
    } catch (e) {
      await this.stop();
      throw e;
    }
  }

  /** Why the game is no longer usable, if it is not. */
  problem(): string | undefined {
    if (this.spawnError) return `Could not launch the game binary '${this.binary}': ${this.spawnError.message}`;
    if (this.exited) return `The game exited${this.exited.signal ? ` (signal ${this.exited.signal})` : ` with code ${this.exited.code}`}`;
    return undefined;
  }

  /** Ask the game to exit; if it has not within the grace period, kill it. Resolves once it is gone. */
  async stop(graceMs = TERMINATE_GRACE_MS): Promise<void> {
    const child = this.child;
    this.child = undefined;
    if (!child || !child.pid || this.exited) return;
    const gone = new Promise<void>(resolve => child.once('exit', () => resolve()));
    child.kill('SIGTERM');
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), graceMs); });
    const outcome = await Promise.race([gone.then(() => 'exited' as const), timedOut]);
    clearTimeout(timer);
    if (outcome === 'timeout') {
      child.kill('SIGKILL');
      await gone;
    }
  }
}
