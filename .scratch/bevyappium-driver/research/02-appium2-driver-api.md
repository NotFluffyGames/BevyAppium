# 02 - Minimal Appium driver surface for a custom in-game Agent

Ticket 02 of the BevyAppium driver map. Question: what is the minimal Appium driver surface (BaseDriver, session lifecycle, capabilities, locator strategies, find/click/text/attribute/screenshot commands, custom execute methods) needed to run WebdriverIO/Selenium tests against a custom in-game **Agent**, and how is a driver packaged, installed locally and developed?

Date of research: 2026-11-22.

## Method and source caveat

- `appium.io` (the official docs site) was **not reachable** from the research sandbox (proxy 403 / DNS failure). No claim below is cited to the docs site. Everything is cited to **published npm tarballs**, which ship the TypeScript sources (`lib/*.ts`) and compiled JS of the packages that own the behaviour. Those are primary sources for the code, but not for prose guidance.
- Tarballs were downloaded with `npm pack` and read directly. Source paths below are relative to `package/` inside each tarball.
- Follow-up for a human or a session with network access: skim the "Build drivers" page at appium.io/docs/en/latest/developing/ to confirm the prose agrees with the code findings here.
- Nothing here was verified by actually running a driver end to end; install behaviour was read from CLI source, not exercised.

### Versions inspected (npm `latest` on 2026-11-22 unless noted)

| Package | Version | Notes |
|---|---|---|
| `appium` | 4.0.0 (published 2026-11-15) | dist-tags: `latest` 4.0.0, `beta` 4.0.0-beta.8, `rc` 3.0.0-rc.2 |
| `@appium/base-driver` | 11.0.0 | `BaseDriver` lives here; re-exported by `appium/driver.js` |
| `@appium/types` | 2.0.0 | `Driver`, `ExternalDriver`, `Constraints`, `MethodMap`, `ExecuteMethodMap` |
| `@appium/fake-driver` | 7.0.0 | Official reference/test driver, full TS source shipped |
| `appium-chromium-driver` | 5.0.0 | Proxy-style driver, small `package.json` example |
| `appium-mac2-driver` | 5.0.7 | Proxy-style driver with execute-method map |
| `webdriverio` / `webdriver` | 10.2.0 | Client side, for locator and session behaviour |
| `@appium/base-driver` (old line) | 9.18.0 | The Appium 2.19.0 era base driver |

**"Appium 2" vs now.** The map says "Appium 2 driver". Release history from `npm view appium time`: 2.0.0 on 2023-07-05, 2.19.0 on 2025-06-01, 3.0.0 on 2025-08-18, 4.0.0 on 2026-11-15. The current stable is Appium 4. Relevant differences for a new driver (read from `package.json` of each version):

- `appium@2.19.0`: Node `^14.17 || ^16.13 || >=18`, npm >=8, base-driver `^9.18.0`, CommonJS (no `"type": "module"` in base-driver 9.18.0).
- `appium@3.0.0`: Node `^20.19 || ^22.12 || >=24`, npm >=10, base-driver `^10.0.0`.
- `appium@4.0.0`: Node `^22.22.2 || ^24.15.0 || >=26.0.0`, npm >=10, base-driver `^11.0.0`, ESM (`"type": "module"`).
- Driver authoring model is the same across them: subclass `BaseDriver`, declare constraints, implement command methods, register `newMethodMap`/`executeMethodMap`. In 9.x the base commands were added via mixins (`lib/basedriver/commands/mixin.ts`); in 11.x they are assigned onto `BaseDriver.prototype` (`lib/basedriver/driver.ts`, `Object.assign(BaseDriver.prototype, {...})`). Subclass code does not care.
- Drivers declare the Appium range in `peerDependencies.appium`: current drivers use `^4.0.0-beta.8` (chromium 5.0.0, mac2 5.0.7) or `^4.0.0-beta.0` (fake-driver 7.0.0); older mac2 used `^2.4.1`.

**Recommendation for the spec:** target the current Appium line (4.x) and say so, rather than "Appium 2". The driver surface below is identical in shape for 2.x/3.x, so the choice only affects Node version, ESM, and the `peerDependencies.appium` range. Decide this explicitly in the spec. (Open question for the owner, see end.)

## 1. What a driver is

A driver is an npm package whose `package.json` contains an `appium` block and whose main module exports a class extending `BaseDriver`. The Appium server loads it by `mainClass` and routes WebDriver HTTP requests to methods on an instance of that class.

Sources: `appium@4.0.0` `lib/extension/manifest/schema.ts` (required manifest fields), `lib/extension/extension-config.ts` `requireAsync` (loads `mod[mainClass]`), `appium-chromium-driver@5.0.0/package.json`, `@appium/fake-driver@7.0.0/package.json`.

### package.json contract

Required in the `appium` block (validated at install, `lib/extension/manifest/validator.ts` and `schema.ts`): `driverName` (the short name used in `appium driver install`/`list`), `automationName` (matched against the `appium:automationName` capability), non-empty `platformNames` array, `mainClass` (a string naming an export of the entry module). Optional: `scripts` (named scripts runnable with `appium driver run <name> <script>`), `doctor.checks`, `schema` (for driver CLI args).

Minimal shape, copied from the structure of `appium-chromium-driver@5.0.0`:

```json
{
  "name": "appium-bevy-driver",
  "version": "0.1.0",
  "type": "module",
  "main": "./build/lib/index.js",
  "types": "./build/lib/index.d.ts",
  "exports": {".": {"types": "./build/lib/index.d.ts", "import": "./build/lib/index.js"}, "./package.json": "./package.json"},
  "files": ["build/lib", "README.md"],
  "peerDependencies": {"appium": "^4.0.0-beta.8"},
  "engines": {"node": "^22.22.2 || ^24.15.0 || >=26.0.0", "npm": ">=10"},
  "appium": {
    "driverName": "bevy",
    "automationName": "Bevy",
    "platformNames": ["Linux", "Mac", "Windows"],
    "mainClass": "BevyDriver"
  }
}
```

Notes:
- Import `BaseDriver`, `errors`, `util`, etc. from `appium/driver.js` and `appium/support.js` (this is what fake-driver and mac2 do; chromium uses `appium/driver.js` too). That is why `appium` is a **peer** dependency, not a dependency.
- `platformNames` values are free-form strings ("Fake", "Mac", `windows`/`mac`/`linux` in chromium); they are matched against the `platformName` capability. Pick a convention and keep it consistent.
- Compiled output is what `main` points at (`build/lib/index.js`); sources live in `lib/`. Both chromium and mac2 ship `build/lib` in `files`.

## 2. Server-to-driver dispatch (how commands reach your code)

Source: `@appium/base-driver@11.0.0` `lib/basedriver/driver.ts` (`executeCommand`), `lib/protocol/routes/w3c.ts` (route table).

- The route table maps each W3C endpoint to a **method name** on the driver, e.g. `POST /session/:sessionId/element/:elementId/click` -> `click`, `GET .../text` -> `getText`, `GET .../attribute/:name` -> `getAttribute`, `GET /session/:sessionId/screenshot` -> `getScreenshot`, `POST /session/:sessionId/execute/sync` -> `execute`, `POST /session/:sessionId/element` -> `findElement`, `DELETE /session/:sessionId` -> `deleteSession`, `POST /session` -> `createSession`, `GET /status` -> `getStatus`.
- `executeCommand` looks the method up as `this[cmd]`; **if it does not exist it throws `NotYetImplementedError`**. So you implement only what you need; unimplemented routes fail cleanly.
- Commands are serialized through a queue by default (`isCommandsQueueEnabled`), one at a time per driver instance, with a "new command timeout" that ends idle sessions (`newCommandTimeout` capability). This matches the map's "one command at a time" instinct and costs nothing to keep.
- Positional arguments are the route's `payloadParams` in order, followed by URL params. Examples from fake-driver 7.0.0 `lib/commands/element.ts`: `getText(elementId)`, `click(elementId)`, `getAttribute(attributeName, elementId)`, `setValue(text, elementId)`. For find: `findElement(strategy, selector)` and `findElementFromElement(strategy, selector, elementId)`.
- A driver may alternatively **proxy** a whole class of routes to another WebDriver server (`proxyActive`, `canProxy`, `getProxyAvoidList`, `proxyReqRes`, `proxyCommand`). Chromium and mac2 do this because their backends already speak WebDriver. See "Proxy vs handle" below; for BevyAppium the Agent does not speak WebDriver, so the driver should **handle** commands itself.

## 3. Minimal command set for WebdriverIO/Selenium against an Agent

### Always required

| Method on driver | Why |
|---|---|
| constructor (calls `super(opts, shouldValidateCaps)`) | sets `desiredCapConstraints` and `locatorStrategies` |
| `createSession(w3cCaps)` | call `super.createSession` first, then launch the game / attach to the Agent; returns `[sessionId, caps]` |
| `deleteSession(sessionId)` | stop the game, then `await super.deleteSession(sessionId)` |
| `findElement(strategy, selector)` and `findElements(strategy, selector)` | route to the single method `findElOrEls(strategy, selector, mult, context?)` (see below) |
| `click(elementId)` | |
| `getText(elementId)` | |
| `getAttribute(name, elementId)` | |
| `getScreenshot()` | returns a **base64 PNG string** (fake-driver `getScreenshot(): Promise<string>`) |
| `execute(script, args)` | `POST /execute/sync`; WebdriverIO's `browser.execute` and `browser.executeScript` call this. BaseDriver does not implement it (only `executeMethod`). Delegate: `return await this.executeMethod(script, args)` |

### Strongly recommended (cheap, avoid surprising client behaviour)

- `getPageSource()` - overridden in fake-driver (`override getPageSource`); useful for debugging and for XPath over an entity tree. BaseDriver stub throws NotImplemented.
- `setValue(text, elementId)` and `clear(elementId)` for UI text input.
- `elementDisplayed(elementId)`, `elementEnabled(elementId)`, `getElementRect(elementId)`, `getName(elementId)`: WebdriverIO calls these for `isDisplayed`, `isEnabled`, `getSize/getLocation`, `waitForDisplayed`.
- `getWindowRect()`: WebdriverIO and the Appium image plugin use it (mac2 comments "needed to make image plugin work").
- `getStatus()`: BaseDriver returns `{}`; fine. `GET /status` is how clients and `appium` health checks poll.
- `performActions(actions)` / `releaseActions()` if you want W3C actions (pointer taps, key presses) rather than only `execute` methods. Not needed for the first slice; input can go through execute methods.

### Provided by BaseDriver (do not reimplement)

From `lib/basedriver/driver.ts` and `lib/basedriver/commands/*.ts`: timeouts (`timeouts`, `getTimeouts`, `setImplicitWait`, ... `implicitWaitForCondition`), settings (`updateSettings`/`getSettings`, needs a `DeviceSettings` assigned if you want them), capability processing and validation, the commands queue, new-command timeout, `getLog`/`getLogTypes` driven by `supportedLogTypes`, `getAppiumSessionCapabilities`, BiDi subscribe plumbing, `findElement`/`findElements`/`findElementFromElement`/`findElementsFromElement` as thin wrappers over `findElOrElsWithProcessing`.

### Find implementation specifics

Source: `@appium/base-driver@11.0.0` `lib/basedriver/commands/find.ts`, `lib/basedriver/core.ts` (`validateLocatorStrategy`), fake-driver 7.0.0 `lib/commands/find.ts`.

- In base-driver 11.0.0 `findElement`/`findElements` already call `findElOrElsWithProcessing(strategy, selector, mult, context)`, which calls `this.validateLocatorStrategy(strategy)` against `this.locatorStrategies`, then your **`findElOrEls(strategy, selector, mult, context?)`**, and optionally prints the page source on failure (`printPageSourceOnFindFailure` cap). So the minimal override is one method: `findElOrEls`. (Fake-driver overrides all four wrappers too, but that is not required by the base class design; it is the older pattern.) Mac2 5.0.7 also just assigns `findElOrEls`.
- `this.locatorStrategies` is a plain string array you set in the constructor (chromium: `['css selector','link text','partial link text','tag name','xpath']`; mac2: includes `'accessibility id'`, `'id'`, `'name'`, `'class name'`, `'xpath'`, plus vendor strategies). An unsupported strategy yields `InvalidSelectorError`.
- A found element is returned as an object with **both** keys: `{ELEMENT: id, [W3C_WEB_ELEMENT_IDENTIFIER]: id}` (fake-driver `wrapNewEl`; `W3C_WEB_ELEMENT_IDENTIFIER` from `util` in `appium/support.js`). The driver owns an id -> element map per session; later commands get `elementId` as the string id.
- Not found: `findElements` returns `[]`; `findElement` throws `errors.NoSuchElementError`.
- **Implicit wait is not applied by the base class around `findElOrEls`.** `BaseDriver.implicitWaitForCondition(condFn)` exists (retries every 500 ms up to `implicitWaitMs`) and a driver that wants WebdriverIO's `setTimeout({implicit})` to work should wrap its lookup in it. WebdriverIO's own `waitFor*` commands poll on the client side, so tests work without this.
- `printPageSourceOnFindFailure` requires a working `getPageSource`.

### Locator strategies WebdriverIO will actually send

Source: `webdriverio@10.2.0` `build/index.js` (`defineStrategy`, `findStrategy`), around lines 15414-15650.

- `$('~foo')` -> strategy `accessibility id`, value `foo`.
- `$('id=foo')` -> `id`; `$('//xpath')` -> `xpath`; `$('name')`-style class prefixes (`UIA...`, `XCUIElementType...`, `android.widget...`) -> `class name`; `$('<tag>')` -> `tag name`; `$('=text')` -> `link text`.
- A direct form `strategy:value` is passed through when the strategy is one of `id|css selector|xpath|link text|partial link text|name|tag name|class name|-android uiautomator|-android datamatcher|-android viewmatcher|-android viewtag|-ios uiautomation|-ios predicate string|-ios class chain|accessibility id`. Anything else (CSS in a native/mobile session) is handled by the "mobile" vs "web" branch of the selector, which depends on how WebdriverIO classifies the session from its capabilities.
- Appium custom strategies (arbitrary names) are only reachable through the direct `name:value` form if the name is in that regex, otherwise via `driver.findElement('custom strategy', value)` low-level calls. For the map's locators by `Name`, marker or component type, the practical mapping is: `accessibility id` or `id` -> Bevy `Name`; `class name` -> component type or marker; `xpath` -> a synthesised tree (see open questions). A custom strategy string would need to be written as a direct call, not via `$()` shorthand.

### Capabilities

Source: `@appium/types@2.0.0` `lib/constraints.ts`, base-driver `lib/basedriver/capabilities.ts`, `lib/basedriver/driver.ts` `createSession`.

- Constraints are declared as a plain object using the validate.js-style vocabulary: `{app: {presence: true, isString: true}, runClock: {isBoolean: true}}` (fake-driver `desired-caps.ts`). Others used in mac2 `constraints.ts`: `isNumber`, `isString`, `isBoolean`, `isArray`, `isObject`. The driver sets `desiredCapConstraints` (a class field in fake-driver, `structuredClone(CONSTRAINTS)` in mac2's constructor).
- `BASE_DESIRED_CAP_CONSTRAINTS` always applies: `platformName` (**required**, string), `app`, `platformVersion`, `webSocketUrl` (bool), `newCommandTimeout`, `automationName`, `noReset`, `fullReset`, `printPageSourceOnFindFailure`.
- Clients send vendor capabilities with the `appium:` prefix (`appium:automationName`, `appium:app`, `appium:port`...). `processCapabilities` strips the prefix and validates; unknown caps are logged as warnings with a "did you mean" suggestion (`logExtraCaps`), not rejected.
- `createSession(w3cCapabilities)` in BaseDriver: rejects non-W3C capability objects, processes and validates caps, generates `sessionId` with `util.uuidV4()`, sets `this.caps`/`this.opts`, returns `[sessionId, caps]`. A concrete driver overrides it, calls `super.createSession(...)` first, then does its own startup using `this.opts` (merged `initialOpts` + caps).
- If startup fails after `super.createSession`, clean up (mac2 calls `this.deleteSession()` in its catch). A failed session creation must not leave the game process running.
- `newCommandTimeout` is honoured by the base class; set a sensible default (e.g. 60 s idle) so abandoned sessions kill the launched game.
- `webSocketUrl: true` in caps just makes BiDi optional; a driver that does not provide a `bidiProxyUrl` simply returns no `webSocketUrl`, and `webdriver@10.2.0` only opens BiDi when the returned capability is a string (`typeof instance.capabilities.webSocketUrl === "string"`, `webdriverio/build/index.js` ~line 11087). Verified by reading the client; not run.

### Session lifecycle for the Agent

Pattern, from fake-driver `createSession`/`deleteSession` and mac2 `createSession`/`deleteSession`:

1. `super.createSession(caps)` (validation, id, options).
2. Launch the game process (`opts.app` = executable path, or a custom cap) with the Agent port in env/args, or in attach mode skip launching and just connect to the given port.
3. Connect to the Agent and block until it answers (own timeout cap, like mac2's `serverStartupTimeout`).
4. Return `[sessionId, caps]`. Error -> kill child, rethrow.
5. `deleteSession`: ask the Agent to quit, kill if it does not, then `await super.deleteSession(sessionId)` in a `finally`.

Also consider `startUnexpectedShutdown(err)` (BaseDriver) when the game process dies mid-session, so the server drops the session instead of hanging commands (it emits `onUnexpectedShutdown` which rejects in-flight commands, `driver.ts` `executeCommand`).

### Custom "execute methods"

Source: `@appium/base-driver@11.0.0` `lib/basedriver/commands/execute.ts`; fake-driver `lib/command-maps/execute-method-map.ts`; mac2 `execute-method-map.js`, `commands/execute.js`.

- The driver exposes `static executeMethodMap = {...}`: key is the script string, value `{command: '<driverMethodName>', params: {required: [...], optional: [...]}}`. Keys follow the convention `'<prefix>: <name>'` (`'fake: addition'`, `'macos: click'`). Use `'bevy: ...'`.
- Client call: `driver.execute('bevy: waitFrames', {frames: 3})`. WebdriverIO sends `POST /session/:id/execute/sync` with `{script, args}`; `args` is an array whose first element is the params object. The driver's `execute(script, args)` calls `this.executeMethod(script, args)`, which looks up the map entry, validates required/optional params, and calls the named driver method positionally in the order `required` then `optional`.
- Unknown script -> `UnsupportedOperationError` with a Levenshtein "did you mean" suggestion and the list of available methods (built in `executeMethod`).
- Mac2's own `execute` normalises `args` (`Array.isArray(args) ? args[0] : args`) and prefixes; fake-driver passes straight through. Either is fine.
- A second mechanism, `static newMethodMap`, adds **new REST routes** (e.g. `'/session/:sessionId/fakedriver'` with `GET`/`POST` and `payloadParams`). Mac2 uses it only for two screen-recording routes. Execute methods are the better fit for BevyAppium: they work from every client library with no client extension, which fits "WebdriverIO/Selenium tests" and a later non-JS client.
- Candidates for the first execute-method set (from the map): `bevy: waitFrames`, `bevy: queryEntities`, `bevy: sendInput`/`bevy: click` (injected input), `bevy: getComponent`. Names are a design decision for the spec, not Appium's.

### Proxy vs handle

- Proxying (`canProxy() -> true`, `proxyActive() -> true`, `proxyReqRes`, `proxyCommand`, plus `getProxyAvoidList` regexes for routes the driver must handle itself) forwards unhandled W3C routes to an upstream WebDriver server. Chromium and mac2 use it because Chromedriver/WebDriverAgentMac already speak the protocol (`chromium driver.js` `NO_PROXY`, `proxyReqRes = this._cd.proxyReq.bind(...)`).
- BevyAppium's Agent exposes entities, not W3C. **Do not proxy.** Leave `canProxy`/`proxyActive` at their defaults (BaseDriver `core.ts`: not proxying) and implement the handful of commands above by translating to the Agent's protocol. The ticket on BRP (bevy_remote) decides what the Agent side speaks; nothing in the Appium contract constrains it, since it is behind your driver.

## 4. Packaging, local install and development loop

### Local install

Source: `appium@4.0.0` `lib/cli/extension-command.ts` `_install`, `lib/extension/manifest/install-types.ts`, `lib/utils/npm.ts`.

- `appium driver install --source=local /absolute/or/relative/path/to/driver` (the install spec is a path). `_install` resolves the path with `path.resolve(installSpec)`, hands it to `installViaNpm`, and records `installType: 'local'`. `--package` must **not** be combined with `--source=local` (hard error in `_install`).
- Internally it is `npm install` of the directory into `APPIUM_HOME` (default `~/.appium`), with `--install-links=false` (`lib/utils/npm.ts` line ~223) so npm **symlinks** the directory instead of copying it. The list output says "(linked from <path>)" (`_formatInstallText`). Net effect: edits to the built output are picked up without reinstalling.
- The install then validates the manifest (`config.getProblems`): missing `mainClass`/`platformNames`/`automationName`/`driverName`, or a duplicate `automationName` among installed drivers, fails the install with a summary.
- Because `main` is `build/lib/index.js`, **you must build (`tsc`) before installing**, and again after source changes. Appium imports the entry point itself; internal imports are cached by Node.
- Hot reload: setting `APPIUM_RELOAD_EXTENSIONS` makes `requireAsync` re-import the entry point (unique `?reload=N` query for ESM, `require.cache` eviction for CJS). The code comment says it reloads **only the entry point, not files it imports**, so in practice restart the server after rebuilds.
- Use an isolated home while developing: `APPIUM_HOME=$PWD/.appium-home appium driver install --source=local .` so you do not touch `~/.appium`.
- `appium driver list --installed`, `appium driver uninstall bevy`, `appium driver update`, `appium driver doctor bevy` (driver may supply `doctor.checks` in `package.json`), `appium driver run bevy <script>` (scripts declared in the `appium.scripts` map; chromium declares `install-chromedriver`, mac2 declares `open-wda`).
- Start the server: `appium` (default port 4723; add `--use-drivers=bevy` to load only that driver, `--log-level debug`). Clients connect to `http://localhost:4723` (default base path `/`).
- `--source=npm` / bare `appium driver install bevy` only works for a name registered in Appium's known-driver list; a personal driver is installed by `--source=npm <pkg-name>`, `--source=github`/`git`, or `local`.
- Publishing is a normal `npm publish` (chromium `publishConfig.access: public`). For a personal-use package, `local` install from the monorepo's `driver/` directory is sufficient and no publish is needed. Personal-use distribution later: `--source=git|github --package=<name>`, or a tarball path.

### Dev dependencies and conventions seen in reference drivers

- `appium` as a dev dependency (for types and a local server in tests) plus peer dependency; `@appium/types` for `Constraints`, `MethodMap`, `ExecuteMethodMap` types.
- fake-driver 7.0.0 uses `as const satisfies Constraints`, `satisfies ExecuteMethodMap<FakeDriver>`, and `satisfies MethodMap<FakeDriver>` so renaming a driver method breaks compilation of the maps. Worth copying.
- Command implementations are free functions with `this: Driver` assigned as class fields or `Object.assign(Driver.prototype, {...})` (fake-driver and mac2 respectively), purely for file organization.
- Engine range: copy the `engines` of the target Appium major (4.x: Node `^22.22.2 || ^24.15.0 || >=26.0.0`).

### Test loop for the driver

- Unit-test commands against a stub Agent; `@appium/test-support` (4.1.5) exists for mocha-based server helpers (version only checked, not read).
- Smoke test with the real stack: `appium` running, a WebdriverIO script with `capabilities: {platformName: 'Linux', 'appium:automationName': 'Bevy', 'appium:app': '/path/to/game'}`, `hostname: 'localhost'`, `port: 4723`, and the calls `$('~play-button').click()`, `getText()`, `getAttribute()`, `browser.saveScreenshot()`, `browser.execute('bevy: waitFrames', {frames: 2})`.

## 5. What this means for the spec

Minimal surface for the first vertical slice:

1. Package: `driver/` npm package, ESM, `appium` block with `driverName: bevy`, `automationName: Bevy`, `platformNames`, `mainClass: BevyDriver`, `peerDependencies.appium` per the chosen Appium line.
2. `BevyDriver extends BaseDriver`: constraints (`app` or `agentPort` for attach mode, `startupTimeout`, `args`, `env`), `locatorStrategies = ['accessibility id', 'id', 'class name', 'xpath']` (final set decided by the locator ticket).
3. Methods: `createSession`, `deleteSession`, `findElOrEls`, `click`, `getText`, `getAttribute`, `getScreenshot`, `execute` + `executeMethodMap`, plus `getPageSource`, `setValue`, `elementDisplayed`, `elementEnabled`, `getElementRect`, `getWindowRect`.
4. No proxying. All translation to the Agent protocol happens inside these methods.
5. Dev loop: `tsc` -> `appium driver install --source=local ./driver` (symlinked) -> restart `appium` -> WDIO script.

## Open questions for the owner or later tickets

1. **Appium line.** "Appium 2" no longer matches current: 4.0.0 is latest and requires Node 22.22.2+/24.15+. Target 4.x, or pin to 2.x/3.x for an older toolchain? The driver code is nearly identical; ESM and the peer range differ.
2. **XPath.** Appium conventionally supports `xpath` against `getPageSource()` XML. Supporting it means serializing the entity tree to XML and running an XPath engine in the driver (or Agent). Fake-driver does this with an `xpath` library over its XML model. Not needed for the minimal slice; decide in the locator ticket.
3. **Element identity.** The driver owns an `elementId` -> handle map per session (fake-driver `elMap`). Bevy `Entity` ids are reusable after despawn (generation counter), so stale-element detection should map to `StaleElementReferenceError`; the id scheme is an Agent-protocol decision.
4. **Prose docs unverified.** appium.io was unreachable; confirm the prose "build a driver" guidance (including any guidance on `appium driver install` flags and ESM vs CJS) once network allows.
5. **WebdriverIO capability classification.** WDIO decides "mobile vs web" locator handling from the session capabilities; whether `platformName: 'Linux'` with `appium:automationName` triggers the mobile path was not run. If it does not, `$('~name')` should still map to `accessibility id` (the `~` prefix branch is unconditional in `defineStrategy`), but CSS-style selectors would be treated as web CSS. Check with a smoke test once a skeleton driver exists.
