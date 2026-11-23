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
    case 'element not interactable': throw new errors.ElementNotInteractableError(e.message);
    case 'unable to capture screen': throw new errors.UnableToCaptureScreen(e.message);
    case 'invalid argument': throw new errors.InvalidArgumentError(e.message);
    case 'invalid selector': throw new errors.InvalidSelectorError(e.message);
    default: throw new errors.UnknownError(`${e.code}: ${e.message}`);
  }
}

export class BevyDriver extends BaseDriver<BevyConstraints> {
  static executeMethodMap = {
    'bevy: waitFrames': { command: 'waitFrames', params: { required: ['frames'] } },
  } as const;
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

  async click(elementId: string): Promise<void> {
    const [r] = await this.client().run([{ click: elementId }]);
    throwAgentError(r);
  }

  async getAttribute(name: string, elementId: string): Promise<string | null> {
    const [r] = await this.client().run([{ attr: { element: elementId, name } }]);
    throwAgentError(r);
    return (r.value as string | null) ?? null;
  }

  async elementDisplayed(elementId: string): Promise<boolean> {
    const [r] = await this.client().run([{ displayed: elementId }]);
    throwAgentError(r);
    return r.value as boolean;
  }

  async elementEnabled(elementId: string): Promise<boolean> {
    return (await this.getAttribute('enabled', elementId)) === 'true';
  }

  /** Send keys: the text is typed into the game (the game has no element focus concept here). */
  async setValue(text: string | string[], elementId: string): Promise<void> {
    const [r] = await this.client().run([{ keys: Array.isArray(text) ? text.join('') : text }]);
    throwAgentError(r);
  }

  async getScreenshot(): Promise<string> {
    const [r] = await this.client().run([{ screenshot: true }]);
    throwAgentError(r);
    return r.png as string;
  }

  async getPageSource(): Promise<string> {
    const [r] = await this.client().run([{ source: true }]);
    throwAgentError(r);
    return r.xml as string;
  }

  /** WebDriver "Execute Script": only `bevy: ...` extension commands are supported. */
  async execute(script: string, args?: unknown[]): Promise<unknown> {
    if (!script.startsWith('bevy:')) {
      throw new errors.InvalidArgumentError(`Unsupported script '${script}'. Use a 'bevy: ...' command.`);
    }
    return await this.executeMethod(script, [args?.[0] ?? {}]);
  }

  /** Custom command `bevy: waitFrames`: reply after N game frames have run. */
  async waitFrames(frames: number): Promise<void> {
    await this.client().run([{ wait: frames }]);
  }

  private client(): AgentClient {
    if (!this.agent) throw new errors.NoSuchDriverError('No game session');
    return this.agent;
  }
}
