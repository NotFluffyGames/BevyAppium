import { remote } from 'webdriverio';
import { inject } from 'vitest';

export const W3C_ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';

/** Open a session with the Bevy driver; `extra` adds or overrides capabilities. */
export function connect(extra: Record<string, unknown> = {}) {
  return remote({
    hostname: '127.0.0.1', port: inject('appiumPort'), logLevel: 'error',
    capabilities: { platformName: 'Linux', 'appium:automationName': 'Bevy', ...extra } as WebdriverIO.Capabilities,
  });
}

/** Launch the example game and open a session on it. */
export const newSession = (extra: Record<string, unknown> = {}) => connect({ 'appium:app': inject('gameBinary'), ...extra });

export const elementId = (el: Record<string, any>) => el[W3C_ELEMENT] as string;

/** The element id of the entity with this `Name`, found with the raw find-element command. */
export async function findId(browser: WebdriverIO.Browser, name: string) {
  return elementId(await browser.findElement('accessibility id', name) as any);
}

/** A raw WebDriver request on the session, returning the HTTP status and the protocol `value`. */
export async function raw(browser: WebdriverIO.Browser, method: 'GET' | 'POST', suffix: string, body: unknown = {}) {
  const res = await fetch(`http://127.0.0.1:${inject('appiumPort')}/session/${browser.sessionId}${suffix}`, {
    method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, value: (await res.json() as any).value };
}

export const clickRaw = (browser: WebdriverIO.Browser, id: string) => raw(browser, 'POST', `/element/${id}/click`);
