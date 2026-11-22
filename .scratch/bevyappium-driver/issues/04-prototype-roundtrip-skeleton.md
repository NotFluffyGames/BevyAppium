---
label: wayfinder:prototype
assignee: claude
blocked_by: []
status: closed
---
# Does a thin Driver↔Agent round trip feel right?

## Question

Prototype a walking skeleton: Driver launches a tiny Bevy game with the Agent feature, finds an entity by Name, clicks a UI button, reads text, takes a screenshot. What does the real element API and error model need to look like?

## Resolution

Prototype: branch `prototype/roundtrip` (notes in `prototype/NOTES.md`). Verdict, confirmed by the owner: the round trip works end to end on Bevy 0.20.1.

- Reply-after-frame: one `with_watching_method_main` handler called without `+watch` returns a single plain JSON reply once it returns `Some`; it returns `None` while a multi-frame script runs. Per-request state in a resource keyed by a client-supplied id.
- Input: write bare `CursorMoved`/`MouseButtonInput` plus the `WindowEvent` wrapper, set the window cursor, in `First` after `MessageUpdateSystems`, one step per frame (move, press, release). `bevy_ui_widgets::Button` + `Activate` responded.
- Screenshot: `Screenshot::primary_window()` produced a correct PNG (saved to disk; in-memory base64 not built).
- Env: rustc >= 1.97.1; Linux dev libs (alsa, udev, wayland, xkbcommon-x11); headless needs Xvfb + a Vulkan ICD (lavapipe).
- Untested: reflection-path attributes, camera projection, base64 screenshots, stripping check.
