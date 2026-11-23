// Talks to the in-game Agent: one JSON-RPC call per script, replied to after the script's frames ran.
export type Step = Record<string, unknown>;
export type StepResult = Record<string, any>;

/** How long one command may wait for the Agent's reply before the game is considered hung. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 60000;

/** The Agent could not be reached (game gone, port closed, connection reset, or no reply in time). */
export class AgentUnreachableError extends Error {}

export class AgentClient {
  private nextId = 1;
  constructor(private readonly port: number, private readonly commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {}

  get url() { return `http://127.0.0.1:${this.port}`; }

  /** Run steps in the game, one per frame. Resolves with one result per step output. */
  async run(steps: Step[], timeoutMs = this.commandTimeoutMs): Promise<StepResult[]> {
    const id = this.nextId++;
    let body: any;
    try {
      const res = await fetch(this.url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'bevyappium.run', params: { id, steps } }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      body = await res.json();
    } catch (e) {
      if ((e as Error).name === 'TimeoutError') {
        throw new AgentUnreachableError(`The Agent at ${this.url} did not reply within ${timeoutMs} ms; the game may be hung`);
      }
      throw new AgentUnreachableError(`Cannot reach the Agent at ${this.url}: ${(e as Error).message}`);
    }
    if (body.error) throw new Error(`Agent error: ${body.error.message}`);
    return body.result.results as StepResult[];
  }
}
