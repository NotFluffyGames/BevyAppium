---
label: wayfinder:map
---
# Map: BevyAppium driver

## Destination

A spec, ready for `/to-spec`, for a desktop-first Appium 2 driver plus Bevy plugin ("Agent") that runs automated tests against Bevy games. Personal-use package.

## Notes

- Domain language lives in `/CONTEXT.md` (Driver, Agent, Session, Element). Use `grilling` + `domain-modeling` for HITL tickets.
- Driver: real Appium 2 driver, TypeScript/Node; CLI is a subcommand of the npm package. Agent: Rust Bevy plugin in-process. Monorepo: `driver/` (npm), `agent/` (cargo).
- Protocol: build on `bevy_remote` (BRP) if research shows it is sufficient, else custom. Must work over a forwarded TCP port.
- Driver launches the game and owns its lifetime; attach mode (Agent port given) is a cheap extra.
- Elements are any entity (UI or world); locators by `Name`, marker or component type; UI nodes get click/text helpers.
- Input is injected as Bevy input events inside the game.
- Commands apply at one fixed point in the frame schedule; replies come after the frame completes; explicit "wait N frames" command.
- Screenshots via Bevy's own support, exposed as the WebDriver screenshot command.
- One pinned Bevy version, updated when the owner chooses.
- Release builds: Agent behind an opt-in Cargo feature, off by default, compiling to an empty plugin with no Agent deps. Best-effort CI check that a release build has no traces.
- Standing constraint: don't preclude a later Android/adb/Device Farm port.

## Decisions so far

- [What must an Appium 2 driver implement?](issues/02-research-appium2-driver-api.md): BaseDriver subclass with ~7 required commands, custom commands via `executeMethodMap`, no proxying; target Appium major still to choose (latest is 4.0.0).
- [How do input injection and screenshots work in Bevy?](issues/03-research-bevy-input-screenshot.md): inject Messages plus the `WindowEvent` wrapper and window cursor; screenshots via `Screenshot` + `ScreenshotCaptured` (async); Bevy 0.20.1 is the pin candidate.

## Not yet specified

- Virtual-time pause/stepping, if tests prove flaky.
- Test-authoring story and CLI shape.
- The example game used for tests and the stripping check.
- Wait/polling semantics for tests.

## Out of scope

- Android, adb, AWS Device Farm (later map; keep the protocol port-forward friendly).
- iOS.
- Unmodified games (no Agent).
- Multiple Bevy versions.
