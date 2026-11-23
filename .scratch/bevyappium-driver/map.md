---
label: wayfinder:map
---
# Map: BevyAppium driver

Status: no open tickets. Way is clear. Spec published: [spec.md](spec.md) (`ready-for-agent`).

## Destination

A spec, ready for `/to-spec`, for a desktop-first Appium 2 driver plus Bevy plugin ("Agent") that runs automated tests against Bevy games. Personal-use package.

## Notes

- Domain language lives in `/CONTEXT.md` (Driver, Agent, Session, Element). Use `grilling` + `domain-modeling` for HITL tickets.
- Driver: real Appium driver targeting Appium 4 (ESM, Node >= 22.22.2), TypeScript; CLI is a subcommand of the npm package. Agent: Rust Bevy plugin in-process. Monorepo: `driver/` (npm), `agent/` (cargo).
- Protocol: build on `bevy_remote` (BRP) with custom methods on top (research 01). Must work over a forwarded TCP port.
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
- [Is BRP sufficient for the Agent?](issues/01-research-brp-sufficiency.md): good base, not sufficient alone. Build on BRP plus custom methods (wait-frames, find, input sequencing, PNG screenshot); compile-out via optional dep works. Bevy 0.20.1.
- [What is the Element model?](issues/05-grilling-element-model.md): id = entity bits (stale on despawn); locators `~`/`id` by `Name`, `class name` by component; attributes by reflect path; click via layout centre or camera projection; XPath deferred.
- [Does a thin Driver↔Agent round trip feel right?](issues/04-prototype-roundtrip-skeleton.md): yes. Reply-after-frame via one watching BRP method called without `+watch`; clicks via bare messages + `WindowEvent` wrapper + window cursor, one step per frame; prototype on `prototype/roundtrip`.

## Not yet specified

- XPath locator support (needs hierarchy XML plus an XPath engine).
- Click occlusion detection.
- Virtual-time pause/stepping, if tests prove flaky.
- Test-authoring story and CLI shape.
- The example game used for tests and the stripping check.
- Wait/polling semantics for tests.

## Out of scope

- Android, adb, AWS Device Farm (later map; keep the protocol port-forward friendly).
- iOS.
- Unmodified games (no Agent).
- Multiple Bevy versions.
