import { BaseDriver, errors } from 'appium/driver.js';
import type { Constraints } from '@appium/types';
import { AgentClient, type StepResult } from './agent-client.js';
import { GameProcess, freePort } from './game-process.js';

const W3C_ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';

const CONSTRAINTS = {
  app: { isString: true },
  agentPort: { isNumber: true },
} as const satisfies Constraints;

type BevyConstraints = typeof CONSTRAINTS;

/** WebDriver locator strategy -> Agent find mode. */
const LOCATORS: Record<string, string> = { 'accessibility id': 'name', id: 'name', 'class name': 'component' };

/** Map an Agent error result to the matching WebDriver error. */
function throwAgentError(r: StepResult): void {
  const e = r.error as { code: string; message: string } | undefined;
  if (!e) return;
  switch (e.code) {
    case 'stale element reference': throw new errors.StaleElementReferenceError(e.message);
    case 'no such element': throw new errors.NoSuchElementError(e.message);
    case 'invalid selector': throw new errors.InvalidSelectorError(e.message);
    default: throw new errors.UnknownError(`${e.code}: ${e.message}`);
  }
}

export class BevyDriver extends BaseDriver<BevyConstraints> {
  static executeMethodMap = {} as const;
  override desiredCapConstraints = CONSTRAINTS;
  override locatorStrategies = ['accessibility id', 'id', 'class name'];

  private game?: GameProcess;
  private agent?: AgentClient;

  override async createSession(...args: Parameters<BaseDriver<BevyConstraints>['createSession']>) {
    const [sid, caps] = await super.createSession(...args);
    try {
      const { app } = this.opts as { app?: string };
      if (!app) throw new errors.SessionNotCreatedError('The `appium:app` capability (path to the game binary) is required');
      const port = await freePort();
      this.game = new GameProcess(app, port);
      this.agent = await this.game.start();
    } catch (e) {
      await this.deleteSession(sid);
      throw e;
    }
    return [sid, caps] as [string, typeof caps];
  }

  override async deleteSession(sessionId?: string | null) {
    this.game?.stop();
    this.game = undefined;
    this.agent = undefined;
    await super.deleteSession(sessionId);
  }

  override async findElOrEls(strategy: string, selector: string, mult: boolean) {
    const using = LOCATORS[strategy];
    if (!using) {
      throw new errors.InvalidSelectorError(`Unsupported locator strategy '${strategy}'. Supported: ${this.locatorStrategies.join(', ')}`);
    }
    const [r] = await this.client().run([{ find: { using, value: selector } }]);
    throwAgentError(r);
    const els = (r.elements as string[]).map(id => ({ ELEMENT: id, [W3C_ELEMENT]: id }));
    if (mult) return els as any;
    if (!els.length) throw new errors.NoSuchElementError();
    return els[0] as any;
  }

  async getText(elementId: string): Promise<string> {
    const [r] = await this.client().run([{ text: elementId }]);
    throwAgentError(r);
    return r.text as string;
  }

  private client(): AgentClient {
    if (!this.agent) throw new errors.NoSuchDriverError('No game session');
    return this.agent;
  }
}
