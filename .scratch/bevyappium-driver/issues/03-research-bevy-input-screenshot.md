---
label: wayfinder:research
assignee: claude
blocked_by: []
status: closed
---
# How do input injection and screenshots work in Bevy?

## Question

On the pinned Bevy version, how can the Agent inject mouse, keyboard and (later) touch input as Bevy events/resources, including bevy_ui interaction, and capture a screenshot of the primary window in-process (including headless)?

## Resolution

Findings: branch `research/bevy-input-screenshot`, file `.scratch/bevyappium-driver/research/03-bevy-input-screenshot.md`. Read from Bevy 0.20.1 source (latest stable); nothing compiled or run, unconfirmed claims marked "inferred".

- Input is injected as Messages (`KeyboardInput`, `MouseButtonInput`, `TouchInput`, `CursorMoved`), after the message swap in `First` and before `InputSystems`.
- Picking reads the `WindowEvent` wrapper, so the injector must write both the bare message and the wrapper (or write `PointerInput` directly). `ui_focus_system` also needs the window cursor set via `Window::set_cursor_position`.
- `Interaction` is deprecated in 0.20; expose `Hovered`/`Pressed`. Headless UI cameras rendering to an `Image` don't work with `Interaction`; they need the picking path (unverified).
- Screenshots: spawn `Screenshot::primary_window()`, observe `ScreenshotCaptured` (async, arrives a later frame, one per target per frame). Headless: no `WinitPlugin`, render to `Image`, `Screenshot::image(handle)`; still needs a GPU or software adapter.
- Timing: `just_pressed` lasts one frame; send move and press in separate frames; newly spawned nodes aren't hittable until next frame; a reactive winit loop may not run `Update` after off-thread injection.
- Open: which message touch picking reads, frames until `ScreenshotCaptured`, waking a reactive winit loop.
