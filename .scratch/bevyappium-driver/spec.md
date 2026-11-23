---
label: ready-for-agent
type: spec
source_map: map.md
status: open
---
# Spec: BevyAppium, an Appium 4 driver for Bevy games (desktop first)

Vocabulary follows `/CONTEXT.md`: **Driver**, **Agent**, **Session**, **Element**, **Element id**, **Locator**.
Sources: the closed map tickets (research on `research/brp-sufficiency`, `research/appium2-driver-api`, `research/bevy-input-screenshot`; prototype on `prototype/roundtrip`).

## Problem Statement

I make Bevy games and want to test them the way people test apps with Appium: write ordinary WebDriver tests (WebdriverIO, Selenium, any client) that launch the game, find things in it, click them, read state, take screenshots, and assert. Today Bevy has no such tooling. Raw BRP exposes the world but cannot sequence input, wait for frames, or look like WebDriver, and OS-level automation cannot see inside a game. I also need release builds of my games to contain no trace of the test tooling.

## Solution

Two pieces in one repository:

- An **Agent**, a Bevy plugin behind an opt-in Cargo feature. It runs inside the game, builds on Bevy's remote protocol (BRP), and adds the methods BRP lacks: waiting for frames, one-call find, input sequencing, and PNG screenshots.
- A **Driver**, an Appium 4 driver (TypeScript, ESM) that launches the game (or attaches to a running one), translates WebDriver commands into Agent calls, and exposes a CLI as a subcommand of the same package.

First version targets desktop (Linux, with macOS and Windows following from Bevy's own portability) on a single pinned Bevy version (0.20.1). Mobile (adb, AWS Device Farm) is a later effort, but nothing here may preclude it: the Driver and Agent talk over a plain TCP port that can be forwarded.

## User Stories

1. As a game developer, I want to add the Agent plugin to my game behind a Cargo feature, so that I can opt in to automation only for test builds.
2. As a game developer, I want the Agent to compile to nothing when the feature is off, so that release builds carry no test code, dependencies or strings.
3. As a game developer, I want a documented way to verify a release build has no Agent traces, so that I can trust what I ship.
4. As a game developer, I want a clear guide on registering my components for reflection, so that tests can read my game state.
5. As a game developer, I want to give entities a `Name`, so that tests can find them by name.
6. As a test author, I want to install the Driver with the standard Appium driver install command, so that it behaves like any other Appium driver.
7. As a test author, I want to start a session by passing the path to my game binary as a capability, so that the Driver launches and owns the game.
8. As a test author, I want the session to fail with a clear error if the game binary is missing, fails to start, or never opens the Agent port, so that I can diagnose setup problems.
9. As a test author, I want to attach to an already-running game by giving the Agent's port, so that I can debug against a game I started myself.
10. As a test author, I want the game process to be terminated when the session ends, so that tests never leak processes.
11. As a test author, I want a crash of the game mid-session to fail the current command with a clear error, so that I do not wait on a dead game.
12. As a test author, I want to use any Appium client library, so that I can write tests in the language I prefer.
13. As a test author, I want to find an element with the accessibility-id locator (`~Name`), so that I can target named entities concisely.
14. As a test author, I want the `id` locator to match `Name` exactly, so that familiar locator habits work.
15. As a test author, I want to find elements by component type with the class-name locator, so that I can target entities that have no `Name`.
16. As a test author, I want to find multiple elements with the same locator, so that I can assert on collections (for example all enemies).
17. As a test author, I want a find to return "no such element" cleanly when nothing matches, so that I can assert absence.
18. As a test author, I want every entity to be findable, whether UI node or world entity, so that I can test gameplay as well as menus.
19. As a test author, I want element ids to go stale when the entity despawns, so that I get a `stale element reference` error instead of acting on the wrong entity.
20. As a test author, I want a reused entity index never to match an old element id, so that stale references are always detected.
21. As a test author, I want to click a UI element and have the game react as if a user clicked, so that I can test menus and buttons.
22. As a test author, I want to click a world entity, projected through its camera, so that I can test gameplay interactions.
23. As a test author, I want a click on an off-screen element to fail with `element not interactable`, so that silent misses do not hide bugs.
24. As a test author, I want to read an element's text, so that I can assert on labels and counters.
25. As a test author, I want to read an element attribute by reflection path (for example a transform coordinate or a UI node width), so that I can assert on arbitrary game state.
26. As a test author, I want the special attributes `text`, `visible` and `enabled`, so that common UI assertions are one call.
27. As a test author, I want an attribute on an unregistered component to return null, so that I can tell "not exposed" from an error.
28. As a test author, I want to ask whether an element is displayed (visible, and for UI non-zero size), so that I can assert visibility.
29. As a test author, I want to ask whether an element is enabled (no interaction-disabled marker), so that I can assert disabled buttons.
30. As a test author, I want to send keys to the game, so that I can test keyboard input.
31. As a test author, I want input to be applied deterministically at a fixed point in the frame and acknowledged only after that frame completes, so that my next command sees its effect.
32. As a test author, I want a custom command to wait N frames, so that I can let the game settle without sleeping.
33. As a test author, I want to take a screenshot of the game window as a standard WebDriver screenshot, so that I can attach it to failed tests.
34. As a test author, I want screenshots to work headless (virtual display, software rendering), so that I can run in CI.
35. As a test author, I want to fetch the page source as XML of the entity hierarchy, so that I can inspect what the Driver sees when debugging.
36. As a test author, I want unsupported locator strategies (for example XPath) to fail with a clear "not supported" error, so that I know it is a limitation, not a typo.
37. As a test author, I want an unknown or unregistered command to fail clearly, so that I can tell what the Driver does not implement.
38. As a CLI user, I want a command that launches a game and opens an interactive inspection of its element tree, so that I can discover names and components.
39. As a CLI user, I want a command that runs a test suite against a game locally, so that I do not need to start the Appium server by hand.
40. As a CLI user, I want a command that checks my environment (Node version, display, Vulkan, Rust toolchain), so that I can fix setup problems quickly.
41. As a CI maintainer, I want the whole flow to run headless under a virtual display with software rendering, so that tests run on any Linux runner.
42. As a CI maintainer, I want a check that fails the build if a release build contains Agent dependencies or strings, so that stripping cannot regress.
43. As a CI maintainer, I want the check to also catch another crate re-enabling Bevy's remote feature, so that feature unification cannot silently re-add the Agent.
44. As a maintainer, I want the Agent to run only on the default local address, so that a test build does not expose the game to the network.
45. As a maintainer, I want the second render-world BRP server off by default, so that only one port is used and open.
46. As a maintainer, I want the Agent port to be configurable, so that I can run several games in parallel.
47. As a maintainer, I want one pinned Bevy version, documented clearly, so that I know exactly what is supported and update it only when I choose.
48. As a maintainer, I want the protocol to work over a forwarded TCP port, so that a later mobile port needs no redesign.
49. As a maintainer, I want an example game in the repository used by all tests, so that the tests are runnable and documented by example.
50. As a maintainer, I want a README covering install, a first test, the Agent setup and the limitations, so that I remember how it works months later.

## Implementation Decisions

**Modules**
- **Agent** (Rust crate): a Bevy plugin gated by an opt-in Cargo feature, off by default. With the feature off, the plugin type still exists but does nothing and its dependencies (BRP and its HTTP stack) are optional and not compiled in.
- **Driver** (TypeScript, ESM, Appium 4, Node 22.22.2 or later): a driver class extending the Appium base driver, packaged with the manifest block Appium requires, `appium` as a peer dependency. The CLI is a subcommand of this same package.
- One repository, two packages: the Driver as an npm package and the Agent as a cargo crate. An example game crate lives alongside as the test subject.

**Agent protocol (builds on BRP)**
- Use Bevy's remote protocol and HTTP transport on the default local address; port configurable; the render-world server off.
- One custom **script method** registered as a watching method and called without the watch suffix, so it returns a single plain JSON reply only when the script finishes. The handler returns "not yet" while the script is still running (this is how reply-after-frame works). Per-request state lives in a resource keyed by a request id supplied by the Driver, because the handler system is shared across requests.
- Scripts are ordered lists of steps executed one frame at a time: find, read text, read attribute, wait N frames, click, key press, screenshot. The Driver may send a whole sequence for one WebDriver command (a click is move, press, release over successive frames).
- Methods run at one fixed point in the frame schedule; input steps are injected after the message buffers swap and before input processing, so the game sees them next.
- Additional custom methods: one-call find (by name or component type, returning element ids), page source (hierarchy XML), lifecycle/health, and PNG screenshot returning base64.
- Use the method-registration variants that Bevy actually exposes publicly (the main-world ones). Handle the known BRP quirks: bounded mailbox, an unknown method stalling queued requests, and the second server.

**Input injection**
- Mouse and keyboard are injected as Bevy messages. For pointer input write both the bare message and the window-event wrapper that picking reads, and set the window cursor position, otherwise UI picking does not see the input. Touch is later work.
- Moving the cursor, pressing and releasing happen on separate frames.
- The Driver exposes `Hovered`/`Pressed`-style state, not the deprecated interaction component.

**Element model** (decided in the Element-model ticket)
- Element id is the entity's full bits (index plus generation) as a string; a despawned entity yields a stale-element error.
- Locators in v1: accessibility id and `id` (exact `Name` match), and class name (component type, short or full path). XPath is not supported in v1; page source still returns the hierarchy as XML for debugging.
- Every entity is findable. Name locators need `Name`; component locators need no `Name`.
- Attributes: reflection path read as a string; special attributes `text`, `visible`, `enabled`. Unregistered components return null.
- Click: UI node, the centre of its computed layout rectangle; world entity, its world position projected through its camera. Off-screen projection fails as not interactable. Occlusion detection is not in v1.
- Displayed: inherited visibility is visible and, for UI, non-zero size. Enabled: no interaction-disabled marker.

**Driver commands (Appium 4)**
- Required: session create and delete, find element(s), click, get text, get attribute, screenshot, execute (delegating to the Appium execute-method map). Recommended: page source, send keys, displayed, enabled, element rect, window rect.
- Custom commands (via the execute-method map) for waiting N frames and any Agent-specific extras.
- No proxying: the Agent is not a WebDriver server, so the Driver translates every command itself.
- Capabilities: a path to the game binary (launch mode) or the Agent port (attach mode), plus optional extra arguments and environment; the Appium base capabilities apply.
- The Driver owns the game process in launch mode: start, wait for the port, terminate at session end, detect crash and fail the current command.
- Local development flow: build, install from a local path, restart the server after rebuilds, isolate the Appium home.

**Stripping**
- The Agent is behind an opt-in Cargo feature, off by default. With it off, nothing from the Agent or BRP appears in the dependency tree.
- Best-effort binary check on top (see Testing Decisions). Another crate enabling Bevy's remote feature defeats the stripping through feature unification, so the check must also look for that.

**Environment and versions**
- Bevy 0.20.1 pinned; requires Rust 1.97.1 or later.
- Headless Linux runs need a virtual display plus a Vulkan driver (software rendering is fine) and the usual audio, udev, windowing and xkb system libraries.

**Prototype-derived note**: the prototype (branch `prototype/roundtrip`) confirmed the reply-after-frame design, the click injection sequence and a working PNG screenshot on 0.20.1. Its code is a reference only, not a base to build on.

## Testing Decisions

A good test exercises external behaviour only: what a WebDriver client sees and what the game does, never Agent internals such as frame stepping or BRP handler shapes.

**Seam 1 (main): a WebDriver session against the real example game.** A test starts an Appium server with the Driver installed, opens a session with a standard client (WebdriverIO) that launches the example game built with the Agent feature, and drives it through the normal WebDriver API. It runs headless under a virtual display with software Vulkan. It covers: find by each locator, click on UI and world entities, text, attributes (reflected, special, unregistered), displayed and enabled, send keys, wait-frames, screenshot, page source, launch and attach modes, and failure paths (stale element, not interactable, unsupported locator, game crash mid-session, missing binary, port never opens). This single seam exercises the Driver, Agent, protocol and frame handling together.

**Seam 2 (small): the release-build stripping check.** A script builds the example game with the Agent feature off and asserts that none of the Agent's or BRP's dependencies appear in the dependency tree; as a best-effort addition it scans the built binary for Agent strings and flags another crate re-enabling Bevy's remote feature.

Deliberately not tested: Agent internals in isolation; the Driver against a mocked Agent (a mock would drift from real BRP behaviour, which has many quirks).

Prior art: none in the repo (greenfield). The prototype's round-trip script is a rough reference for launching the game headless.

## Out of Scope

- Android, adb and AWS Device Farm (a later map; keep the protocol port-forward friendly).
- iOS.
- Unmodified games with no Agent.
- Multiple Bevy versions.
- XPath locators, click occlusion detection and virtual-time pause/stepping (fog, to revisit if needed).
- Touch input.

## Further Notes

- Still undecided and left to the implementer or a later map: the test-authoring story beyond the example tests, exact CLI command names and output formats, the example game's content, and wait/polling semantics beyond the explicit wait-frames command.
- Unverified in research and worth checking early while building: how names and images appear in BRP's JSON, whether one frame between cursor move, press and release always suffices for picking, repositioning the BRP schedule, how a reactive winit loop wakes for off-thread injection, headless UI cameras that render to an image, and in-memory base64 screenshots.
- The Appium 4 line is chosen for the Driver; the driver shape is nearly identical to 2.x and 3.x, so nothing here depends on that choice beyond the Node range and peer dependency.
