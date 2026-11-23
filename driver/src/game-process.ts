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

/** Launches the game binary with the Agent port and owns its lifetime. */
export class GameProcess {
  private child?: ChildProcess;
  constructor(readonly binary: string, readonly port: number) {}

  async start(timeoutMs = 60000): Promise<AgentClient> {
    this.child = spawn(this.binary, [], { env: { ...process.env, BEVYAPPIUM_PORT: String(this.port) }, stdio: 'inherit' });
    const client = new AgentClient(this.port);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try { await client.run([]); return client; } catch { await new Promise(r => setTimeout(r, 250)); }
    }
    this.stop();
    throw new Error(`Game did not open the Agent port ${this.port} within ${timeoutMs} ms`);
  }

  stop() { this.child?.kill('SIGTERM'); this.child = undefined; }
}
