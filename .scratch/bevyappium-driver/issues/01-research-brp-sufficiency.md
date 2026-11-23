---
label: wayfinder:research
assignee: claude
blocked_by: []
status: closed
---
# Is BRP sufficient for the Agent?

## Question

Does Bevy's `bevy_remote` (BRP) cover what the Agent needs on the pinned Bevy version: entity/component queries, name lookup, change watching, custom methods for input injection and screenshots, running handlers at a fixed point in the frame, and reply-after-frame semantics? What must be custom? Can it be fully compiled out behind a Cargo feature?

## Resolution

Findings: branch `research/brp-sufficiency`, file `.scratch/bevyappium-driver/research/01-brp-sufficiency.md`. Read from `bevy_remote` 0.20.1 crate sources plus a `cargo tree` probe; two official examples seen only via a summarizer; nothing run.

Verdict: BRP is a good base but not sufficient alone.

- Covered: queries and name lookup (matching is client-side), change watching over SSE (one entity or event, not a query), custom methods as ordinary systems, input via `world.write_message` (key, mouse, touch and `WindowEvent` are reflect-registered), screenshots via spawning `Screenshot` plus observing `ScreenshotCaptured` (JSON image, heavy).
- Handlers all run in `RemoteLast`, right after `Last`; the plugin API can't move that.
- Must be custom: reply-after-frame and "wait N frames" (options: a `+watch` handler returning `None` until ready, owning the `BrpMessage` mailbox, or a custom transport; settle in the prototype), a one-call find, input sequencing and coordinate conversion, a base64 PNG screenshot method, lifecycle/health methods, and a guide on registering components for reflection.
- Compile-out works: with `bevy_remote` as `optional = true` behind a feature, `cargo tree` shows none of its dependencies when off. `Cargo.lock` still lists them, and another crate enabling Bevy's `bevy_remote` feature would switch it back on, so CI should check `cargo tree` and the binary.
- Quirks: use the `_main` method variants; a second render-world server starts on port 15703 by default; mailbox bounded at 16; an unknown method stalls other queued requests that frame.
- Not verified: `Name`/`Image` JSON shape, whether one frame between move/press/release suffices, repositioning `RemoteLast`, disabling the render-world server, full-mailbox behaviour.
