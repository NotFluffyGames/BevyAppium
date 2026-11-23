import { BaseDriver, errors } from 'appium/driver.js';
import type { Constraints } from '@appium/types';
import { AgentClient, AgentUnreachableError, DEFAULT_COMMAND_TIMEOUT_MS, type Step, type StepResult } from './agent-client.js';
import { DEFAULT_STARTUP_TIMEOUT_MS, GameProcess, freePort, waitForAgent } from './game-process.js';

const W3C_ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';

const CONSTRAINTS = {
  /** Launch mode: path to the game binary. */
  app: { isString: true },
  /** Launch mode: fixed Agent port (default: a free one). Attach mode: the port of a running game. */
  agentPort: { isNumber: true },
  /** How long to wait for the Agent to open its port, in milliseconds. */
  agentStartupTimeout: { isNumber: true },
  /** How long one command may wait for the game's reply before the game counts as hung, in milliseconds. */
  agentCommandTimeout: { isNumber: true },
} as const satisfies Constraints;

type BevyConstraints = typeof CONSTRAINTS;

/** WebDriver locator strategy -> how the Agent matches it. */
const LOCATORS: Record<string, 'name' | 'component'> = { 'accessibility id': 'name', id: 'name', 'class name': 'component' };

/** Agent error code -> WebDriver error. Anything else becomes an unknown error. */
const AGENT_ERRORS: Record<string, new (message?: string) => Error> = {
  'stale element reference': errors.StaleElementReferenceError,
  'no such element': errors.NoSuchElementError,
  'element not interactable': errors.ElementNotInteractableError,
  'invalid selector': errors.InvalidSelectorError,
  'invalid argument': errors.InvalidArgumentError,
  'unable to capture screen': errors.UnableToCaptureScreen,
};

function throwAgentError(r: StepResult): void {
  const e = r.error as { code: string; message: string } | undefined;
  if (!e) return;
  const ErrorClass = AGENT_ERRORS[e.code];
  throw ErrorClass ? new ErrorClass(e.message) : new errors.UnknownError(`${e.code}: ${e.message}`);
}

const asElement = (id: string) => ({ ELEMENT: id, [W3C_ELEMENT]: id });

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
      const { app, agentPort, agentStartupTimeout, agentCommandTimeout } =
        this.opts as { app?: string; agentPort?: number; agentStartupTimeout?: number; agentCommandTimeout?: number };
      const wait = { startupTimeoutMs: agentStartupTimeout ?? DEFAULT_STARTUP_TIMEOUT_MS, commandTimeoutMs: agentCommandTimeout ?? DEFAULT_COMMAND_TIMEOUT_MS };
      if (app) {
        // Launch mode: the Driver starts the game and owns its lifetime.
        this.game = new GameProcess(app, agentPort ?? await freePort());
        this.agent = await this.game.start(wait);
      } else if (agentPort) {
        // Attach mode: the game is already running; the Driver never stops it.
        this.agent = await waitForAgent(agentPort, wait);
      } else {
        throw new Error('Set `appium:app` (path to the game binary) to launch a game, or `appium:agentPort` to attach to a running one');
      }
    } catch (e) {
      await this.deleteSession(sid);
      throw new errors.SessionNotCreatedError((e as Error).message);
    }
    return [sid, caps] as [string, typeof caps];
  }

  override async deleteSession(sessionId?: string | null) {
    const game = this.game;
    this.game = undefined;
    this.agent = undefined;
    await game?.stop();
    await super.deleteSession(sessionId);
  }

  override async findElOrEls(strategy: string, selector: string, mult: boolean) {
    const using = LOCATORS[strategy];
    if (!using) {
      throw new errors.InvalidSelectorError(`Unsupported locator strategy '${strategy}'. Supported: ${this.locatorStrategies.join(', ')}`);
    }
    const r = await this.step({ find: { using, value: selector } });
    const els = (r.elements as string[]).map(asElement);
    if (mult) return els as any;
    if (!els.length) throw new errors.NoSuchElementError();
    return els[0] as any;
  }

  async getText(elementId: string): Promise<string> {
    return (await this.step({ text: elementId })).text as string;
  }

  async click(elementId: string): Promise<void> {
    await this.step({ click: elementId });
  }

  async getAttribute(name: string, elementId: string): Promise<string | null> {
    return ((await this.step({ attr: { element: elementId, name } })).value as string | null) ?? null;
  }

  async elementDisplayed(elementId: string): Promise<boolean> {
    return (await this.step({ displayed: elementId })).value as boolean;
  }

  async elementEnabled(elementId: string): Promise<boolean> {
    return (await this.getAttribute('enabled', elementId)) === 'true';
  }

  /** Send keys: the text is typed into the game (the game has no element focus concept here). */
  async setValue(text: string | string[], _elementId: string): Promise<void> {
    await this.step({ keys: Array.isArray(text) ? text.join('') : text });
  }

  async getScreenshot(): Promise<string> {
    return (await this.step({ screenshot: true })).png as string;
  }

  async getPageSource(): Promise<string> {
    return (await this.step({ source: true })).xml as string;
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
    await this.run([{ wait: frames }]);
  }

  /** Run one step and return its result, turning an Agent error into the matching WebDriver error. */
  private async step(step: Step): Promise<StepResult> {
    const [result] = await this.run([step]);
    throwAgentError(result);
    return result;
  }

  /** Run steps in the game; if the Agent cannot be reached, say whether the game died. */
  private async run(steps: Step[]): Promise<StepResult[]> {
    if (!this.agent) throw new errors.NoSuchDriverError('No game session');
    try {
      return await this.agent.run(steps);
    } catch (e) {
      if (e instanceof AgentUnreachableError) {
        const why = this.game?.problem();
        throw new errors.UnknownError(why ? `${why}; the session is no longer usable` : e.message);
      }
      throw e;
    }
  }
}
