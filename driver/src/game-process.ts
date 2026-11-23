import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { AgentClient } from './agent-client.js';

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address() as net.AddressInfo; s.close(() => resolve(port)); });
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Poll until the Agent answers, or fail with `fail()` when `abort()` says the wait is pointless. */
export async function waitForAgent(port: number, timeoutMs: number, abort: () => string | undefined = () => undefined): Promise<AgentClient> {
  const client = new AgentClient(port);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const why = abort();
    if (why) throw new Error(why);
    try { await client.run([]); return client; } catch { /* not up yet */ }
    if (Date.now() >= deadline) throw new Error(`The Agent did not open port ${port} within ${timeoutMs} ms`);
    await sleep(250);
  }
}

/** Launches the game binary with the Agent port and owns its lifetime. */
export class GameProcess {
  private child?: ChildProcess;
  private spawnError?: Error;
  /** Set once the game process has ended, for any reason. */
  exited?: { code: number | null; signal: NodeJS.Signals | null };

  constructor(readonly binary: string, readonly port: number) {}

  async start(timeoutMs: number): Promise<AgentClient> {
    this.child = spawn(this.binary, [], { env: { ...process.env, BEVYAPPIUM_PORT: String(this.port) }, stdio: 'inherit' });
    this.child.once('error', e => { this.spawnError = e; });
    this.child.once('exit', (code, signal) => { this.exited = { code, signal }; });
    try {
      return await waitForAgent(this.port, timeoutMs, () => this.problem());
    } catch (e) {
      this.stop();
      throw e;
    }
  }

  /** Why the game is no longer usable, if it is not. */
  problem(): string | undefined {
    if (this.spawnError) return `Could not launch the game binary '${this.binary}': ${this.spawnError.message}`;
    if (this.exited) return `The game exited${this.exited.signal ? ` (signal ${this.exited.signal})` : ` with code ${this.exited.code}`}`;
    return undefined;
  }

  stop() { this.child?.kill('SIGTERM'); this.child = undefined; }
}
