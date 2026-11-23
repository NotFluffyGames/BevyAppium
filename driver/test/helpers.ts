import { remote } from 'webdriverio';
import { inject } from 'vitest';

export function newSession() {
  return remote({
    hostname: '127.0.0.1', port: inject('appiumPort'), logLevel: 'error',
    capabilities: { platformName: 'Linux', 'appium:automationName': 'Bevy', 'appium:app': inject('gameBinary') } as WebdriverIO.Capabilities,
  });
}
export const elementId = (el: { ELEMENT?: string; [k: string]: any }) => el['element-6066-11e4-a52e-4f735466cecf'] as string;
