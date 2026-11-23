---
label: wayfinder:research
assignee: claude
blocked_by: []
status: closed
---
# What must an Appium 2 driver implement?

## Question

What is the minimal Appium 2 driver surface (BaseDriver, session lifecycle, capabilities, locator strategies, find/click/text/attribute/screenshot commands, custom commands/execute methods) needed to run WebdriverIO/Selenium tests against the Agent? How is a driver packaged, installed and developed locally?

## Resolution

Findings: branch `research/appium2-driver-api`, file `.scratch/bevyappium-driver/research/02-appium2-driver-api.md`. Docs site was unreachable; read published npm tarballs instead (not run end to end).

- Driver = npm package with an `appium` block in `package.json`, exporting a class extending `BaseDriver` (peer dep `appium`).
- Must implement: `createSession`/`deleteSession`, `findElOrEls`, `click`, `getText`, `getAttribute`, `getScreenshot`, and `execute` (delegating to `executeMethod`). Recommended: `getPageSource`, `setValue`, `elementDisplayed`, `elementEnabled`, `getElementRect`, `getWindowRect`.
- Custom commands via `static executeMethodMap` (e.g. `'bevy: waitFrames'`), usable from any client.
- No proxying: the Agent isn't WebDriver, so the Driver translates commands itself.
- Local dev: `appium driver install --source=local <path>`; build first; restart server after rebuilds; isolate `APPIUM_HOME`.
- Open: latest Appium is 4.0.0 (ESM, Node >= 22.22.2); the driver shape is nearly identical to 2.x/3.x, so the spec must name a target major. Also open: XPath support, element id stability, WebdriverIO locator handling for `platformName: 'Linux'`.
