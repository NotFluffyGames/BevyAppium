# BevyAppium

Run [Appium](https://appium.io) tests against [Bevy](https://bevy.org) games. Write ordinary
WebDriver tests (WebdriverIO, Selenium, any client) that launch your game, find entities, click
them, read state, take screenshots and assert.

Two pieces:

- **Agent** (`agent/`, Rust): a Bevy plugin you add to your game behind an opt-in Cargo feature.
  It runs inside the game and answers the Driver.
- **Driver** (`driver/`, TypeScript): an Appium 4 driver, plus a `bevyappium` CLI, that launches
  (or attaches to) your game and translates WebDriver commands for the Agent.

Desktop first (Linux is what the tests run on). Android, adb and AWS Device Farm are a later effort;
the Driver and Agent talk over a plain TCP port so a port can be forwarded.

## Versions

| | |
|---|---|
| Bevy | **0.20.1**, pinned (one version only; updated when the owner chooses) |
| Rust | 1.97.1 or later (Bevy 0.20.1 requires it) |
| Appium | 4.x (ESM) |
| Node | 22.22.2 or later (or 24.15+) |

## Quick start

1. Add the Agent to your game and name the entities you want to find — see
   [docs/game-author-guide.md](docs/game-author-guide.md).
2. Build a test build with the feature on: `cargo build --features bevyappium`.
3. Install the Driver and write a test:

```bash
cd driver && npm install && npm run build
npx appium driver install --source=local .      # once; restart the Appium server after rebuilding
npx appium                                       # start the server (run under xvfb-run when headless)
```

```ts
import { remote } from 'webdriverio';

const browser = await remote({
  hostname: '127.0.0.1', port: 4723,
  capabilities: {
    platformName: 'Linux',
    'appium:automationName': 'Bevy',
    'appium:app': '/path/to/your/game',   // launch mode
  },
});
await browser.$('~PlayButton').click();                  // click: visible to the very next command
console.log(await browser.$('~Score').getText());
await browser.deleteSession();                           // terminates the game
```

Or let the CLI manage the server: `bevyappium run --app ./target/debug/my-game -- npx wdio run wdio.conf.ts`.

## Capabilities

| Capability | Meaning |
|---|---|
| `appium:app` | Path to the game binary. **Launch mode**: the Driver starts the game, owns it, and terminates it when the session ends. |
| `appium:agentPort` | With `app`: a fixed Agent port (default: a free one). Without `app`: **attach mode** — connect to a game you started with `BEVYAPPIUM_PORT=<port>`; it is left running at the end of the session. |
| `appium:agentStartupTimeout` | Milliseconds to wait for the Agent port (default 60000). |
| `appium:agentCommandTimeout` | Milliseconds one command may wait for the game's reply before the game counts as hung and the command fails (default 60000). |

## What you can do

**Locators** (every entity is findable):

| Strategy | Matches |
|---|---|
| `accessibility id` (`~Name`) and `id` | the entity's `Name`, exactly |
| `class name` | a component type, short (`Enemy`) or full (`my_game::Enemy`) path; no `Name` needed |

`xpath` and `css selector` are not supported and fail with `invalid selector`.

**Commands**

| Command | Notes |
|---|---|
| find element(s) | element id = the entity's index and generation; a despawned entity gives `stale element reference` |
| click | UI node: centre of its layout rectangle. World entity: its position projected through the active camera. Off-screen or no position: `element not interactable` |
| get text | the entity's `Text` |
| get attribute | `text`, `visible`, `enabled`, or a reflection path such as `Transform.translation.x` or `Node.width`; `null` if the component is not registered for reflection |
| is displayed / is enabled | displayed: visible (and for UI non-zero size); enabled: no `InteractionDisabled` |
| send keys | letters, digits, space, and WebDriver Enter/Tab/Backspace/Escape key codes |
| screenshot | base64 PNG of the primary window |
| page source | the entity hierarchy as XML |
| `execute('bevy: waitFrames', {frames: N})` | reply after N game frames |

When a session ends the game gets SIGTERM and, if it has not exited after 3 seconds, SIGKILL; games are also killed if the Appium process itself exits.

Every command is applied at a fixed point in the frame schedule and answered only after the frame
completes, so the next command sees its effect.

## CLI

```
bevyappium doctor [--json]                         check Node, Rust, display, Vulkan, system libraries
bevyappium inspect (--app <binary> | --port <n>)   explore the element tree: tree | find | text | attr | click | shot | quit
bevyappium run --app <binary> -- <command...>      start Appium with this driver and run <command>
```

`run` passes `APPIUM_HOST`, `APPIUM_PORT` and `BEVYAPPIUM_APP` to your command.

## Release builds contain no trace of the Agent

The Agent is behind the `enabled` Cargo feature, off by default; without it the plugin is empty and
none of its dependencies are compiled in. `scripts/check-stripped.sh` builds the example without the
feature and fails if the dependency tree or the binary still shows Agent traces (best effort on the
binary strings; it also catches another crate re-enabling Bevy's `bevy_remote` feature). Run
`scripts/check-stripped.sh --with-agent` to prove the check detects an enabled Agent.

## Limitations

- One pinned Bevy version; no mobile, iOS, or unmodified games (a game needs the Agent).
- No XPath; no click occlusion detection (a click lands where the element is, even if something covers it); no touch input.
- Headless runs need a virtual display plus a Vulkan driver (software rendering is fine) — `bevyappium doctor` checks.
- Components must be registered for reflection to be readable as attributes.

## Developing this repository

```bash
cd driver && npm install
npm test         # builds the Driver and the example game, starts Appium under a virtual display, runs everything
scripts/check-stripped.sh
```

Tests drive a real example game (`example/`) through a real Appium server — the Driver, Agent and
protocol together. Needs `xvfb`, a Vulkan driver (e.g. `mesa-vulkan-drivers`) and the Bevy Linux
libraries (`libasound2-dev libudev-dev libwayland-dev libxkbcommon-dev libx11-dev`, plus
`libxkbcommon-x11-0` at runtime).

## Design notes

- The Agent builds on Bevy's remote protocol (BRP) for method dispatch, with one custom method that
  runs a script of steps, one step per frame, and replies when the script finishes. BRP's own HTTP
  plugin is not used: it also opens a second (render-world) port that cannot be turned off, so the
  Agent serves the BRP mailbox itself, on one loopback-only port.
- Decisions and their history: `.scratch/bevyappium-driver/` (map, research, spec).
