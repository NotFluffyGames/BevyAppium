---
label: ready-for-agent
status: done
spec: ../../bevyappium-driver/spec.md
---
# 04: UI click with frame-synced replies

**What to build:** A test author can click a UI element and wait for frames, and the game reacts as if a user clicked. The reply to each command arrives only after the frame in which its effect happened.

**Blocked by:** 01 Walking skeleton

**Status:** ready-for-agent

- [x] Click on a UI node targets the centre of its computed layout rectangle
- [x] Pointer input writes both the bare messages and the window-event wrapper and sets the window cursor, so UI picking and buttons respond
- [x] Move, press and release happen on separate frames; input is injected after the message swap and before input processing
- [x] A custom Appium command waits N frames before replying
- [x] Per-request script state is isolated so concurrent requests do not interfere
- [x] Example game button click increments a visible counter, verified by a test
