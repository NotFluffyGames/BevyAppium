# PROTOTYPE (throwaway) - ticket 04 round trip

Question: does a thin Driver<->Agent round trip work, and how do we get reply-after-frame?
Run: `cargo build` in `agent/`, then `node driver/roundtrip.mjs` (needs xvfb, lavapipe, Rust >= 1.97.1).

Verdict: works end to end on Bevy 0.20.1 (find by Name, click a bevy_ui_widgets Button, read text, wait N frames, PNG screenshot).

- Reply-after-frame: register ONE `with_watching_method_main`. Called WITHOUT the `+watch` suffix it returns a single plain JSON reply, sent only once the handler returns `Some`. The handler returns `None` while a multi-frame script runs. No SSE needed, no custom transport. Per-request state lives in a resource keyed by a client-supplied id (the handler system is shared).
- Input: clicks worked by writing `CursorMoved` and `MouseButtonInput` AND the `WindowEvent` wrapper, setting the window cursor, in `First` after `MessageUpdateSystems`, one step per frame (move, press, release).
- Round-trip latency here was ~160-480 ms per script under software rendering (lavapipe).
- Screenshot: `Screenshot::primary_window()` + `save_to_disk` gave a correct PNG after ~15 frames of waiting (not tuned). In-memory base64 not built.
- `Interaction` was not used; `bevy_ui_widgets::Button` + `Activate` observer worked.
- Env gotchas: Bevy 0.20.1 needs rustc >= 1.97.1; Linux needs libasound/libudev/wayland/xkbcommon-x11 dev libs; headless needs Xvfb plus a Vulkan ICD (mesa lavapipe).
- Not tested: reflection-path attributes, camera projection for world entities, stripping.
