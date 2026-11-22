# 03: Input injection and screenshots in Bevy

Pinned version for this note: **Bevy 0.20.1** (latest stable on crates.io at time of writing; tag `v0.20.1`, commit `a0577b5c6a7b208719dd761c5c6a7a539e472a97`).

All source citations are paths inside the `bevyengine/bevy` repository at tag `v0.20.1` (e.g. `crates/bevy_input/src/lib.rs`). I read the source directly; I did not compile or run anything. Anything marked **inferred** is my reading of the code, not something the source states.

## Short answer

- Bevy 0.20 calls buffered events **Messages** (`add_message`, `MessageReader`, `MessageWriter`). Input is injected by writing the same `Message` types the winit backend writes; the input systems in `PreUpdate` then update `ButtonInput<_>`, `Touches` etc. as if the OS had sent them.
- Two things are easy to miss:
  1. `bevy_picking` (and so `bevy_ui` picking, `bevy_ui_widgets::Button`, `Pointer<_>` observers, `Hovered`) reads the aggregate `bevy_window::WindowEvent` message, not the individual `CursorMoved` / `MouseButtonInput` messages. To drive it you must write the `WindowEvent` wrapper as well.
  2. `Interaction` (the legacy bevy_ui component) is driven by the `ButtonInput<MouseButton>` / `Touches` resources **plus the `Window` component's cursor position**. A `CursorMoved` message alone does not move that cursor; you must also call `Window::set_physical_cursor_position`.
- **`Interaction` is deprecated in 0.20.0** (`#[deprecated(since = "0.20.0", note = "Use picking::hover::Hovered and ui::Pressed.")]`) and is slated for removal after 0.20. It still works in 0.20.1. The Agent should not make it the primary "is this pressed" signal; expose `Hovered`/`Pressed` too.
- Screenshots: spawn `Screenshot::primary_window()` (or `Screenshot::image(handle)` for headless) and observe `ScreenshotCaptured`. Capture is asynchronous and completes at least one frame later, and needs the render device to be polled.

## 1. Message types and what consumes them

`InputPlugin` (`crates/bevy_input/src/lib.rs`, `impl Plugin for InputPlugin`) registers:

| Device | Messages | Resources updated | System (schedule) |
|---|---|---|---|
| Keyboard | `KeyboardInput`, `KeyboardFocusLost` | `ButtonInput<KeyCode>`, `ButtonInput<Key>` | `keyboard_input_system` (`PreUpdate`, `InputSystems`) |
| Mouse | `MouseButtonInput`, `MouseMotion`, `MouseWheel` | `ButtonInput<MouseButton>`, `AccumulatedMouseMotion`, `AccumulatedMouseScroll` | `mouse_button_input_system`, accumulate systems (`PreUpdate`, `InputSystems`) |
| Touch | `TouchInput` | `Touches` | `touch_screen_input_system` (`PreUpdate`, `InputSystems`) |
| Gesture | `PinchGesture`, `RotationGesture`, `DoubleTapGesture`, `PanGesture` | none | none |
| Gamepad | `GamepadEvent`, `RawGamepadEvent`, ... | `Gamepad` components | `PreUpdate`, `InputSystems` |

Cursor position is not in `bevy_input`: `CursorMoved`, `CursorEntered`, `CursorLeft` live in `crates/bevy_window/src/event.rs`.

### Message field shapes (0.20.1)

- `KeyboardInput { key_code: KeyCode, logical_key: Key, state: ButtonState, text: Option<SmolStr>, repeat: bool, window: Entity }` (`bevy_input/src/keyboard.rs`). Both `key_code` and `logical_key` must be filled consistently: `keyboard_input_system` presses `ButtonInput<KeyCode>` from `key_code` and `ButtonInput<Key>` from `logical_key`. Text-entry widgets use `text`.
- `MouseButtonInput { button: MouseButton, state: ButtonState, window: Entity }` (`bevy_input/src/mouse.rs`).
- `TouchInput { phase: TouchPhase, position: Vec2, window: Entity, force: Option<ForceTouch>, id: u64 }` (`bevy_input/src/touch.rs`). Position is in logical pixels (**inferred** from `ui_focus_system` multiplying `touches_input.first_pressed_position()` by `window.scale_factor()`).
- `CursorMoved { window: Entity, position: Vec2 (logical px), delta: Option<Vec2> }` (`bevy_window/src/event.rs`).

### How a real OS event becomes messages (what to mimic)

`bevy_winit` (`crates/bevy_winit/src/state.rs`):
- On `WindowEvent::CursorMoved` it (a) calls `win.set_physical_cursor_position(Some(physical_position))` directly on the `Window` component, then (b) pushes a `CursorMoved` into an internal `bevy_window_events: Vec<bevy_window::WindowEvent>` buffer. `CursorLeft` sets the position to `None`.
- `forward_bevy_events` (same file, near line 920) drains that buffer and, for every item, writes the **specific** message (`world.write_message(e)`) **and** writes the whole batch as `Messages<bevy_window::WindowEvent>` (`write_batch`). So in a real run every input exists twice: individually and wrapped in `WindowEvent`.
- The runner calls `forward_bevy_events` before running `app.update()` (**inferred** from the batching design; I did not trace the full call order).

`bevy_window::WindowEvent` is an enum with one variant per message (`CursorMoved`, `MouseButtonInput`, `MouseWheel`, `TouchInput`, `KeyboardInput`, ...; `bevy_window/src/event.rs`, `pub enum WindowEvent`). It is registered with `app.add_message::<WindowEvent>()` in `bevy_window/src/lib.rs`.

## 2. Reaching bevy_ui

There are now two independent paths in `bevy_ui`.

### 2a. Legacy `Interaction` (deprecated in 0.20)

`crates/bevy_ui/src/focus.rs`:
- `Interaction` is `pub type Interaction = DeprecatedInteraction;` with `#[deprecated(since = "0.20.0", note = "Use picking::hover::Hovered and ui::Pressed.")]`; the enum carries `// TODO this should be removed in 0.20.` Using it from the Agent will emit deprecation warnings (`#[allow(deprecated)]` needed).
- `bevy_ui::widget::Button` still `#[require]`s it (`bevy_ui/src/widget/button.rs`).
- `ui_focus_system` is registered in `PreUpdate`, `.in_set(UiSystems::Focus).after(InputSystems)` (`bevy_ui/src/lib.rs`).
- Its inputs: `Res<ButtonInput<MouseButton>>`, `Res<Touches>`, `Res<UiStack>`, and `Query<&Window>`. The pointer position is `window.physical_cursor_position()`, falling back to `touches_input.first_pressed_position() * scale_factor`.
- Press is `mouse_button_input.just_pressed(MouseButton::Left) || touches_input.any_just_pressed()`; release is `just_released` / `any_just_released`.

Consequence for injection: to make `Interaction` change you need
1. the cursor position set on the `Window` (`Window::set_physical_cursor_position(Some(DVec2))` or `set_cursor_position(Some(Vec2))`, both `pub`, `bevy_window/src/window.rs`), and
2. `MouseButtonInput` written so `ButtonInput<MouseButton>` flips (or a `TouchInput`).

Writing only `CursorMoved` does not update `Window`'s cursor; only winit code does that. A touch-only injection works for `Interaction` without touching `Window` because of the `first_pressed_position` fallback, **provided the node is under the touch position** (**inferred**).

### 2b. Picking path (the 0.20 direction)

- `PointerInputPlugin` (`crates/bevy_picking/src/input.rs`) runs `mouse_pick_events` and `touch_pick_events` in `First`, in set `PickingSystems::Input`. `mouse_pick_events` takes `MessageReader<WindowEvent>` (the wrapper, **not** `MessageReader<CursorMoved>`) and matches `WindowEvent::CursorMoved`, `WindowEvent::MouseButtonInput`, `WindowEvent::MouseWheel`. Only `Left`, `Right`, `Middle` buttons are mapped; `Back`, `Forward`, `Other` are dropped. A button event uses the **last** `CursorMoved` position from a `Local<Vec2>` (`cursor_last`), so a click needs a prior `CursorMoved` in the same or earlier frame.
- The module doc says explicitly: "you can easily mock inputs" by writing `PointerInput` messages (`PointerId`, `Location`, `PointerAction`) directly, which skips the window layer entirely and works with no `Window`. This is the cleanest injection point for picking and is also what a future non-winit (e.g. Android adb) port could use (**inferred** suitability).
- `bevy_ui` adds `UiPickingPlugin` (`bevy_ui/src/picking_backend.rs`) when `bevy_picking` is enabled.
- `bevy_ui_widgets::Button` (`crates/bevy_ui_widgets/src/button.rs`) reacts to `PointerPress` / `PointerClick` / `PointerRelease` observers, inserts/removes `bevy_ui::Pressed` (`bevy_ui/src/interaction_states.rs`), and triggers `Activate`. Keyboard activation: `FocusedInput<KeyboardInput>` with `Enter` or `Space` (not repeat, state Pressed).
- Plugin set order (`bevy_picking/src/lib.rs`): `First`: `PickingSystems::Input` then `PostInput`, after `TimeSystems` and `MessageUpdateSystems`. `PreUpdate`: `ProcessInput`, `Backend`, `Hover`, `PostHover`, `Last` chained.

Which path to target: games using `Button` + `Interaction` (old tutorials, most existing code) need 2a; games using `bevy_ui_widgets` / `Pointer<_>` observers need 2b. Writing `WindowEvent` + setting the `Window` cursor + writing the individual messages covers both, at the cost of mimicking winit's double write.

## 3. Recommended injection recipe (mouse click at logical (x, y))

Mimic `bevy_winit::forward_bevy_events`, in one system (or exclusive system), for the primary window entity `w`:

1. `window.set_cursor_position(Some(Vec2::new(x, y)))` (logical px; this is what keeps `Interaction` and `Window::cursor_position()` consistent).
2. Write `CursorMoved { window: w, position, delta: None-or-diff }` as the individual message **and** `WindowEvent::CursorMoved(..)`.
3. Write `MouseButtonInput { button: Left, state: Pressed, window: w }` as the individual message **and** `WindowEvent::MouseButtonInput(..)`.
4. Release in a later frame (see timing below), same double write.

Keyboard: write `KeyboardInput` individually (updates `ButtonInput<KeyCode>`/`<Key>` and text input) and wrap in `WindowEvent::KeyboardInput` if anything reads the wrapper. Touch: write `TouchInput` (+ `WindowEvent::TouchInput`); `touch_pick_events` lives in `bevy_picking/src/input.rs` (I did not read its internals, so confirm which message type it reads before relying on it).

Alternatively for picking-only targets, write `PointerInput` directly (see 2b).

## 4. Frame-timing caveats

All from source; the "when" is inferred from schedule definitions.

1. **Messages are double-buffered.** `message_update_system` runs in `First` on every sub-app (`bevy_app/src/sub_app.rs`, comment "we schedule a `message_update_system` in `First`") and swaps buffers. Practical rule: write injected messages **after** `message_update_system` and **before** the readers, i.e. from a system in `First` ordered after `MessageUpdateSystems` (as `PickingSystems::Input` is, per `.after(MessageUpdateSystems)`), or at the very start of `PreUpdate` before `InputSystems`. A write in `Last`/`PostUpdate` is seen by frame N+1's `PreUpdate` (note `mouse_pick_events` runs in `First`, so a message written in `Update` is seen by it next frame).
2. **Ordering against `InputSystems`.** `ButtonInput<_>` is cleared of `just_*` flags and rebuilt each `PreUpdate` by the `*_input_system`s (e.g. `keyboard_input_system` calls `clear()` then replays messages). So `just_pressed` is visible for exactly one frame, after `InputSystems`. Writing after `InputSystems` in the same frame delays the effect to the next frame.
3. **A press and release in the same frame** is handled specially by `ui_focus_system` ("if the mouse was simultaneously released, reset this Interaction in the next frame", `focus.rs`, `entities_to_reset`), so a same-frame click is observable but `Pressed` would be momentary. For a deterministic test, release one frame later.
4. **Hover needs a frame before click.** `Interaction::Hovered` is derived from the cursor position each frame; `mouse_pick_events` uses the last `CursorMoved` position for button events. So send move and press in separate frames for reliability. **Inferred**, not documented.
5. **Layout lags.** `UiStack` and `ComputedNode` update in `PostUpdate`, so a node spawned in frame N is only hittable from frame N+1's `PreUpdate`. Element queries and clicks right after spawn can miss.
6. **Reactive winit loop.** With `WinitSettings::desktop_app()` or an unfocused window the loop is `reactive` / `reactive_low_power` (`bevy_winit/src/winit_config.rs`) and may not run `Update` until an event or timeout. Injecting messages from another thread without a winit wakeup can stall. The Agent should either use `WinitSettings::game()` (continuous when focused) or send `RequestRedraw`. **Inferred** from `UpdateMode` names; I did not trace the wait logic.
7. **Focus loss clears keys.** `KeyboardFocusLost` calls `release_all` on `ButtonInput<KeyCode>` (`keyboard_input_system`). A real window losing focus mid-test will drop injected held keys.

## 5. Screenshots

Source: `crates/bevy_render/src/view/window/screenshot.rs` (`ScreenshotPlugin`, registered by `crates/bevy_render/src/view/window/mod.rs`).

API:
```rust
commands.spawn(Screenshot::primary_window())      // or Screenshot::window(entity) / ::image(Handle<Image>) / ::texture_view(h)
    .observe(|ev: On<ScreenshotCaptured>| { let img: &Image = &ev.image; /* encode */ });
// or ready-made: .observe(save_to_disk("shot.png"))
```
- `Screenshot(pub RenderTarget)`; constructors `window`, `primary_window`, `image`, `texture_view`.
- `ScreenshotCaptured` is an `EntityEvent` carrying `entity` and `image: Image` (deref to `Image`). Convert with `Image::try_into_dynamic()` (as `save_to_disk` does) to encode PNG in memory with the `image` crate; the Agent does not have to write to disk.
- Marker components: `Capturing` (being captured), `Captured` (done; the screenshot entity is despawned by `clear_screenshots` in `First`).
- The doc comment on `Screenshot` states: "Screenshots are captured asynchronously and may not be available immediately after the frame that the component is spawned on."

Pipeline (what determines timing):
1. Main world, frame N: entity with `Screenshot` is spawned (via `Commands`, so it exists after the command flush).
2. `extract_screenshots` (`ExtractSchedule`, render app) finds `Screenshot` without `Capturing`, normalizes the target, and inserts `Capturing` on the main-world entity. Duplicate targets in the same frame are skipped with a warning and the extra entity is despawned. **Only one screenshot per render target per frame.**
3. `prepare_screenshots` (`RenderSystems::PrepareViews`) allocates a texture + readback buffer, and re-targets the view output to it; a copy-to-screen pass then draws the screenshot texture back to the real surface.
4. `collect_screenshots` (called from `renderer/mod.rs`) spawns an async task on `AsyncComputeTaskPool` that `map_async`s the buffer; its comment: "The polling for this map call is done every frame when the command queue is submitted." Rows are un-padded (256-byte alignment), and the `Image` is sent over an `mpsc` channel.
5. `trigger_screenshots` (`Update`) drains the channel and `commands.trigger(ScreenshotCaptured)`. So the result arrives in the **`Update` of a later frame**, at minimum N+1 and possibly more (GPU latency; `PipelinedRenderingPlugin` adds further lag, **inferred**).
6. `Captured` is inserted, and `clear_screenshots` despawns the entity next `First`.

Caveats:
- The returned `Image` has the surface/target format (`texture_view_format` or surface config format; often `Bgra8UnormSrgb`/`Rgba8UnormSrgb`). HDR targets give float formats; `save_to_disk` handles this and warns on clipping.
- Screenshot reflects the frame **as rendered**, i.e. state after the frame N update, not state at the instant the request arrived. For "screenshot after my click", inject, run frames until effects settle, then spawn the screenshot, then wait for the `ScreenshotCaptured` observer.
- Sizing is the surface configuration, i.e. physical pixels.

### Headless / no window

- `Screenshot::primary_window()` needs a primary window with a surface. In `extract_screenshots`, `render_target.normalize(primary_window)` returns `None` without a window and the code warns "Unknown render target for screenshot, skipping".
- Headless: disable `WinitPlugin`, set `WindowPlugin { primary_window: None, exit_condition: ExitCondition::DontExit, .. }`, render the camera to an `Image` target (`Image::new_target_texture(w, h, format, None)`, `asset_usage = RenderAssetUsages::RENDER_WORLD`, camera gets a `RenderTarget` from the image handle), and use `Screenshot::image(handle)`. See `examples/app/externally_driven_headless_renderer.rs` (uses `RenderPlugin { synchronous_pipeline_compilation: true, .. }`, owns the update loop via `SubApps`) and `examples/app/headless_renderer.rs` (uses `ScheduleRunnerPlugin::run_loop`, a hand-rolled GPU copy). The first is the one that uses `Screenshot::image` and `save_to_disk`.
- The `externally_driven_headless_renderer` example waits for rendering with `render_device.wgpu_device().poll(PollType::Wait { .. })` after each `update()` and runs "a couple" extra updates "to let screenshot gpu readback", i.e. the readback needs the device polled. Under a normal runner this happens inside the render submit.
- **UI in headless:** `ui_focus_system` only handles cameras whose target normalizes to `NormalizedRenderTarget::Window` ("Interactions are only supported for cameras rendering to a window", `focus.rs`). So `Interaction` does **not** work with a UI camera rendering to an `Image` target. Headless UI testing must go through the picking path (`PointerInput` with a `Location` whose `target` is the image target) or through direct `Pressed`/`Activate` manipulation. Picking's `Location.target` is a `NormalizedRenderTarget`, which includes images, so picking looks viable (**inferred**; I did not verify `UiPickingPlugin` supports image targets end to end). This is an open question for the Agent design.
- A GPU (or software adapter such as llvmpipe/lavapipe) is still required; there is no CPU-only render path (**inferred** from the wgpu readback design). The headless examples note winit "will panic in environments without a display server", which is why it is disabled.

## 6. Implications for the Agent design

- Agent inject point: one system in `First` ordered `.after(MessageUpdateSystems)`, before `PickingSystems::Input`, drains a command queue (filled by the protocol thread) and writes messages. Or, for picking-only, write `PointerInput`. This is consistent with the map's "commands apply at one fixed point in the frame schedule".
- "Press, wait N frames, release" is modelled as messages in separate frames; `ButtonInput` state is derived from messages, so no resource needs forcing.
- Do not rely on `Interaction` for assertions; prefer `Hovered`/`Pressed` and keep `Interaction` best-effort behind `#[allow(deprecated)]`.
- Screenshot command is naturally async: reply after `ScreenshotCaptured`, and encode PNG via the `image` crate. Needs a render-capable build; for CI use headless-with-image-target or a virtual display (Xvfb) with a software Vulkan/GL adapter.
- Touch: injection is straightforward at the message level (`TouchInput`), and `ui_focus_system` already consumes `Touches`; verify which message `touch_pick_events` reads when implementing.

## 7. Open questions (not resolved from source alone)

1. Exact call order inside `winit_runner` between `forward_bevy_events` and `app.update()`, and what wakes a reactive loop when messages are injected off-thread.
2. Does `UiPickingPlugin` hit-test UI cameras rendering to an `Image` target (needed for headless UI)?
3. Which message `touch_pick_events` reads (`WindowEvent::TouchInput` vs `TouchInput`).
4. Minimum number of frames between `Screenshot` spawn and `ScreenshotCaptured` with and without `PipelinedRenderingPlugin`; measure empirically.
5. `bevy_dev_tools::EasyScreenshotPlugin` (`crates/bevy_dev_tools/src/easy_screenshot.rs`) exists; I only saw its existence, not its behaviour.

## Sources

- `crates/bevy_input/src/{lib,keyboard,mouse,touch}.rs`, v0.20.1
- `crates/bevy_window/src/{event,window,lib}.rs`
- `crates/bevy_winit/src/{state,winit_config,lib}.rs`
- `crates/bevy_picking/src/{input,lib}.rs`
- `crates/bevy_ui/src/{focus,lib,interaction_states}.rs`, `crates/bevy_ui/src/widget/button.rs`
- `crates/bevy_ui_widgets/src/button.rs`
- `crates/bevy_ecs/src/message/update.rs`, `crates/bevy_app/src/sub_app.rs`
- `crates/bevy_render/src/view/window/screenshot.rs`, `crates/bevy_render/src/renderer/mod.rs`
- `examples/window/screenshot.rs`, `examples/app/externally_driven_headless_renderer.rs`, `examples/app/headless_renderer.rs`
- Repo: https://github.com/bevyengine/bevy (tag `v0.20.1`); version from https://crates.io/api/v1/crates/bevy
