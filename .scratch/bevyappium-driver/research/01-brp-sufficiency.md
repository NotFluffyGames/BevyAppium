# Is BRP sufficient for the Agent?

Ticket: `.scratch/bevyappium-driver/issues/01-research-brp-sufficiency.md` (map ticket 01).
Date: 2026-11-22. Terms (Agent, Driver, Session, Element) are from `CONTEXT.md`.

## Answer

**Bevy version: 0.20.1** (latest stable on crates.io; published 2026-10-28; `bevy_remote` 0.20.1 is the same release train, 0.20.0 was 2026-10-08). [crates.io API: bevy_remote](https://crates.io/api/v1/crates/bevy_remote)

**BRP is a good base, not a sufficient whole.** It covers entity/component queries, name lookup (client-side), per-entity change watching, input injection (via reflected messages) and screenshots (via an official pattern). It does **not** give the Agent control over *when* a reply is sent, and it runs handlers at a fixed point (`RemoteLast`, right after `Last`) that you can use but not choose. Three things must be custom:

1. **Deferred replies / "wait N frames" / reply-after-frame.** Instant handlers reply synchronously inside the frame they run in. A reply that waits for later frames needs a custom layer (options below).
2. **Name (and marker) lookup ergonomics.** There is no value filter in `world.query`; match `Name` client-side, or add a custom `find` method.
3. **Screenshot and input wrappers** that match WebDriver semantics (PNG bytes, click = move + press + release, key press/release pairs). The primitives exist; the sequencing is yours.

It **can** be fully compiled out: with `bevy_remote` as an `optional` dependency behind an opt-in feature, the dependency tree has none of it when the feature is off (verified with `cargo tree`, see below).

## Coverage table

| Need | BRP 0.20.1 | Verdict |
|---|---|---|
| Entity/component queries | `world.query` (`data.components`/`option`/`has`, `filter.with`/`without`, `strict`), `world.get_components`, `world.list_components` | Covered |
| Lookup by `Name` | `Name` is reflected (`reflect(Component, ...)`, path `bevy_ecs::name::Name`), so `world.query` can return it; **no value predicate**, so filter client-side | Covered, client-side |
| Change watching | `world.get_components+watch`, `world.list_components+watch` (single entity, SSE stream), `world.observe+watch` (events/observers) | Partly: per entity only, no query-wide watch |
| Custom methods | `RemotePlugin::with_method_main` / `with_watching_method_main`, or `RemoteMethods::insert` at runtime; handler is a Bevy system `In<Option<Value>> -> BrpResult` | Covered |
| Input injection | `world.write_message` for any message with `ReflectMessage`; `KeyboardInput`, `MouseButtonInput`, `CursorMoved`/`WindowEvent`, `TouchInput` are reflect-registered | Covered by primitive |
| Screenshots | No dedicated method. Official pattern: `world.spawn_entity` a `Screenshot` component, then `world.observe+watch` on `ScreenshotCaptured` | Covered by pattern; heavy payload |
| Fixed point in frame | All handlers run in schedule `RemoteLast`, inserted after `Last` in `MainScheduleOrder`; set `RemoteSystems::ProcessRequests` | Fixed, not configurable via plugin API |
| Reply-after-frame | Instant handlers reply immediately, same frame. Effects of injected input land next frame | **Not covered** |
| Compile-out | `bevy_remote` is an optional crate; see below | Yes |

## Evidence

All source references are to the published 0.20.1 crates (`bevy_remote`, `bevy_input`, `bevy_window`, `bevy_render`, `bevy_ecs`, `bevy_internal`, `bevy`), downloaded from crates.io and read directly, plus the 0.20.1 `examples/remote/` files. docs.rs mirrors the same source: <https://docs.rs/bevy_remote/0.20.1/bevy_remote/>.

### Query, name lookup

- Method constants in `bevy_remote/src/builtin_methods.rs`: `world.get_components`, `world.query`, `world.spawn_entity`, `world.insert_components`, `world.remove_components`, `world.despawn_entity`, `world.reparent_entities`, `world.list_components`, `world.mutate_components`, `world.get_components+watch`, `world.list_components+watch`, `world.get_resources`/`insert`/`remove`/`mutate`/`list`, `world.trigger_event`, `world.write_message`, `registry.schema`, `schedule.list`, `world.observe+watch`, `schedule.graph`, plus `rpc.discover`.
- `world.query` params are `BrpQueryParams { data: BrpQuery { components, option, has }, filter: BrpQueryFilter { with, without }, strict }`. Filters are by component type only. There is no field-value predicate, so "find entity named X" means querying `bevy_ecs::name::Name` plus the components you want and matching in the Driver.
- `Name` is `#[derive(Reflect)] #[reflect(Component, Default, Debug, Clone, Hash, PartialEq)]` in `bevy_ecs/src/name.rs`. The JSON shape of `Name` (`HashedStr` inside) was not checked at runtime; confirm in the ticket 04 prototype.
- Component identifiers on the wire are full type paths, and only **reflect-registered** components are visible. Game components the Agent must see (markers, text helpers) need `#[derive(Reflect)]` and `app.register_type`. This is a requirement on game authors.

### Change watching

- `world.get_components+watch` (`process_remote_get_components_watching_request`) takes **one entity** and a component list, and each frame returns components whose change ticks show them changed since the system's last run, plus removed ones; returns `None` (no message) when nothing changed. Docs: "A map of components added or changed in the last tick".
- `world.list_components+watch` reports components added/removed on one entity.
- `world.observe+watch` registers an observer for a reflected `Event` (optionally scoped to an entity) and streams buffered events each poll.
- Watching is selected by the method name: `process_single_request` in `http.rs` does `request.method.contains("+watch")`, and the response becomes `text/event-stream` (SSE). Watches cannot be used in a JSON-RPC batch (the server returns `INVALID_REQUEST`).
- Gap: there is no query-wide "something changed under this selector" watch. An Element-level wait (e.g. wait until text changes) is either polling `world.query` from the Driver or a custom watching method.

### Custom methods and the fixed point in the frame

- `RemotePlugin` public builders: `with_method_main`, `with_method_render`, `with_watching_method_main`, `with_watching_method_render`. The generic `with_method`/`with_watching_method` are private, even though the crate docs example calls `.with_method(...)`; use the `_main` variants. `RemoteMethods::insert(name, RemoteMethodSystemId)` allows runtime registration.
- Handler types (`RemoteMethodHandler`): `Instant(System<In<Option<Value>>, Out = BrpResult>)` and `Watching(System<..., Out = BrpResult<Option<Value>>>)`. Handlers are ordinary Bevy systems, run through `world.run_system_with`, with full `&mut World` access available.
- Scheduling: `RemotePlugin::build` does `app.init_schedule(RemoteLast)` and `MainScheduleOrder.insert_after(Last, RemoteLast)`. Inside it, `RemoteSystems::ProcessRequests` (`process_remote_requests`, then `process_ongoing_watching_requests`) runs before `RemoteSystems::Cleanup`. So every handler runs at one fixed point: end of the main-world schedule, after `Last`. That matches the map's "commands apply at one fixed point". The plugin offers no option to choose another point; moving it would mean editing `MainScheduleOrder` yourself (not verified).
- Render sub-app: with the (default-on) `bevy_render` feature there is a **second** server on port 15703 for the render world, with its own `RemoteMethods`. Irrelevant for the Agent; avoid it by building `RemotePlugin` without render methods or ignoring the port. Not verified how to opt out cleanly; `RemotePlugin::default()` adds both sets.
- Mailbox: bounded channel of 16 (`CHANNEL_SIZE`), drained fully each frame by `process_remote_requests`. Observation: on an unknown method it does `return` (not `continue`), so any remaining queued requests that frame wait until the next frame.

### Reply-after-frame semantics (the gap)

- For a non-watch request the HTTP layer sends a `BrpMessage { method, params, sender }` to the world and awaits `result_receiver.recv()` once (`http.rs`, `process_single_request`).
- In `process_remote_requests`, an `Instant` handler is run and its return value is sent immediately with `message.sender.force_send(result)`. Thus the reply for request R arrives after `Last` of the frame in which R was handled, **before** any system reads what R changed. For input injected via `write_message`, the resulting `ButtonInput` / picking / UI updates happen in the next frame's `PreUpdate` and later (inference from Bevy's input systems consuming `MessageReader<KeyboardInput>` etc.; not run).
- `Instant` handlers return the reply as their value, so they cannot defer it. Ways to get "reply after frame N+k":
  1. **Watching handler with a `+watch` name.** Return `Ok(None)` until the condition holds (frame counter in a resource), then `Ok(Some(value))`; the client reads the first SSE `data:` line and closes. The handler is re-run every frame in `RemoteLast` until the stream closes (`RemoteWatchingRequests`, `remove_closed_watching_requests`). Cheap, stays inside BRP, but SSE framing is required of the Driver and the `Local`/state is shared across concurrent watchers of the same method (all requests of one method share one system instance), so keep per-request state in a resource keyed by a ticket id from `params`.
  2. **Own the mailbox.** `BrpReceiver`/`BrpSender`/`BrpMessage` are public. Skip `RemotePlugin`'s built-in dispatch (or register an Agent plugin that owns `BrpMessage.sender` and holds it in a pending queue) and complete it at the right frame. More control, more code, loses `process_remote_requests`.
  3. **Own the transport** (custom TCP/WebSocket), reusing BRP's method systems only where useful.
- Recommendation for the spec: the "wait N frames" command and "reply after the frame completes" are the strongest reason to treat BRP as a *library to reuse* (query/get/spawn/schema/write_message) rather than as the whole protocol. Decide between option 1 and 2 in ticket 04's prototype.

### Input injection

- `world.write_message` (`process_remote_write_message_request`) looks up a type by full path, requires `ReflectMessage` in the registry, deserializes the JSON with `TypedReflectDeserializer`, and writes it with `ReflectMessage::write_message`. Returns `null`.
- In `bevy_input` 0.20.1, `KeyboardInput`, `KeyboardFocusLost`, `MouseButtonInput`, `MouseMotion`, `MouseWheel`, `TouchInput` carry `reflect(..., Message)`; `bevy_window::WindowEvent` is likewise reflect `Message` (the umbrella enum used by the official example).
- Official demo: `examples/remote/integration_test.rs` (0.20.1) finds a `FeathersButton` via `world.query`, reads window scale factor via query, then sends `WindowEvent` messages: `CursorMoved { window, position (logical), delta }`, then `MouseButtonInput { button: "Left", state: "Pressed", window }`, then `Released`. Its comments: "The picking system needs both press and release to generate a PointerClick." It has no explicit frame wait between steps. (Read via a page summarizer; confirm exact JSON against the file before relying on it.)
- Must be custom: the Driver-facing semantics (click = resolve Element center, convert physical to logical pixels, send three messages with the right ordering and frame spacing; key down/up; text entry; scroll). Whether sending moves/presses in the *same* frame is enough for picking, or each needs its own frame, is exactly what reply-after-frame is for, and is untested here.

### Screenshots

- No built-in screenshot method. `bevy_render::view::window::screenshot` defines `Screenshot(pub RenderTarget)` (`reflect(Component, Debug)`) and `ScreenshotCaptured` (`EntityEvent`, `reflect(Debug, Event)`), so both are usable through BRP.
- The 0.20.1 integration example: spawn an entity with component `Screenshot` = `{"Window": "Primary"}` via `world.spawn_entity`, then `world.observe+watch` with `event = ScreenshotCaptured` and read the SSE stream until the event arrives; the image comes back as serialized `bevy::image::Image` JSON, which the example converts and saves. Comment in the example: "The window must be visible (not fully occluded) for the GPU to render content. If the window is hidden, the screenshot will be black".
- Custom needed: a `screenshot` method that returns PNG (base64) to match the WebDriver `GET /screenshot`, handles the observer/stream plumbing, and times out. Serialized `Image` as JSON is large; a custom handler that encodes PNG in-process is a better fit. Headless / hidden window behavior is a limit to flag in the spec.

### Compile-out behind an opt-in feature

- `bevy_remote` 0.20.1 `Cargo.toml`: `default = ["http", "bevy_asset", "bevy_render"]`; `http` pulls `async-io`, `hyper`, `smol-hyper`, `http-body-util`; unconditional deps include `bevy_dev_tools` (with `schedule_data`), `serde_json`, `async-channel`, `anyhow`, `bevy_log`. The HTTP transport is `#![cfg(not(target_family = "wasm"))]`.
- `bevy` exposes it as feature `bevy_remote = ["bevy_internal/bevy_remote"]`, and `bevy_internal` enables `bevy_remote` plus `serialize` on non-wasm targets with default features. Turning it on therefore also enables `serialize` across Bevy crates; that is a build difference only when the Agent feature is on.
- **Verified**: a probe crate with `bevy = "=0.20.1"` (no default features) and `bevy_remote = { version = "=0.20.1", optional = true }` behind `agent = ["dep:bevy_remote"]`. `cargo tree -e normal`: with the feature **off**, `bevy_remote`, `hyper`, `async-io`, `serde_json`, `http-body-util`, `smol-hyper`, `async-channel`, `bevy_dev_tools` are all absent (284 lines of output); with it **on** they appear (1553 lines). `cargo tree` is dependency resolution, not a compiled-binary inspection.
- Design: Agent crate defines `AgentPlugin` always; with `#[cfg(feature = "agent")]` it adds `RemotePlugin`/`RemoteHttpPlugin` and custom methods, otherwise `impl Plugin for AgentPlugin { fn build(&self, _: &mut App) {} }`. All Agent-only deps (`bevy_remote`, `serde_json`, image encoders) must be `optional = true` and listed only through `dep:` in the feature. Keep the `agent` feature out of `default` and ensure no other dependency enables Bevy's `bevy_remote` feature (feature unification would re-enable it; `cargo tree -e features -i bevy_remote` in CI checks that).
- Caveat for "no traces": with the feature off, `Cargo.lock` still lists the packages (resolution is feature-agnostic) but they are not built. The map's best-effort check should assert on `cargo tree` and on the binary (e.g. absence of `bevy_remote`/`15702` strings), not on `Cargo.lock`.

## What must be custom (summary)

1. Reply timing: a deferred-reply mechanism and a `wait_frames(n)` command (watching-method trick or owned mailbox).
2. Element location helpers (by `Name`, marker component, component type) and a one-call "find" so the Driver does not download whole worlds; plus UI helpers (click/text).
3. Input sequencing (click, key, text, scroll) and coordinate conversion, built on `world.write_message`.
4. Screenshot method returning PNG, built on `Screenshot` + `ScreenshotCaptured`.
5. Session/lifecycle surface (ready/health, quit), reflection registration guidance for game components, and a localhost-bound server note: `RemoteHttpPlugin` defaults to `127.0.0.1:15702` (`DEFAULT_ADDR`/`DEFAULT_PORT`); forwarding over adb or SSH works with a port forward, but binding to a non-loopback address is an explicit `with_address` and unauthenticated.
6. Optional: a query-wide change watch if polling proves too slow.

## Open points (not verified)

- JSON shape of `Name` and `Image` on the wire; do a ticket 04 round trip.
- Whether a single frame is enough between `CursorMoved`, press and release for picking, or the three messages need frame spacing.
- Whether `RemoteLast` can be re-positioned via `MainScheduleOrder` without forking, and whether the render-world server (port 15703) can be disabled without losing the main one.
- Behavior when the bounded mailbox (16) is full, and under a frame-paced (headless or `ScheduleRunnerPlugin`) loop.

## Sources

- crates.io versions: <https://crates.io/api/v1/crates/bevy_remote> (0.20.1 = max stable, 2026-10-28)
- bevy_remote 0.20.1 docs/source: <https://docs.rs/bevy_remote/0.20.1/bevy_remote/> (files read: `Cargo.toml.orig`, `src/lib.rs`, `src/builtin_methods.rs`, `src/http.rs` from the crates.io tarball)
- `bevy_input` 0.20.1 (`keyboard.rs`, `mouse.rs`, `touch.rs`), `bevy_window` 0.20.1 (`event.rs`), `bevy_render` 0.20.1 (`view/window/screenshot.rs`), `bevy_ecs` 0.20.1 (`name.rs`), `bevy_internal` / `bevy` 0.20.1 `Cargo.toml.orig`; tarballs via `https://crates.io/api/v1/crates/<crate>/0.20.1/download`
- Official example, tag v0.20.1: `examples/remote/integration_test.rs` and `examples/remote/app_under_test.rs` in the `bevyengine/bevy` repository (fetched from raw.githubusercontent.com; summarised by a fetch tool, not read in full)
