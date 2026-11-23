// Talks to the in-game Agent: one JSON-RPC call per script, replied to after the script's frames ran.
export type Step = Record<string, unknown>;
export type StepResult = Record<string, any>;

/** The Agent could not be reached (game gone, port closed, connection reset). */
export class AgentUnreachableError extends Error {}

export class AgentClient {
  private nextId = 1;
  constructor(private readonly port: number) {}

  get url() { return `http://127.0.0.1:${this.port}`; }

  /** Run steps in the game, one per frame. Resolves with one result per step output. */
  async run(steps: Step[]): Promise<StepResult[]> {
    const id = this.nextId++;
    let body: any;
    try {
      const res = await fetch(this.url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'bevyappium.run', params: { id, steps } }),
      });
      body = await res.json();
    } catch (e) {
      throw new AgentUnreachableError(`Cannot reach the Agent at ${this.url}: ${(e as Error).message}`);
    }
    if (body.error) throw new Error(`Agent error: ${body.error.message}`);
    return body.result.results as StepResult[];
  }
}
