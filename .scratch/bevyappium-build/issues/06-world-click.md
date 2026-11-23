---
label: ready-for-agent
status: done
spec: ../../bevyappium-driver/spec.md
---
# 06: Click on world entities

**What to build:** A test author can click a world (2D or 3D) entity, which is projected through its camera to a screen position.

**Blocked by:** 03 Element model: ids, locators, staleness; 04 UI click with frame-synced replies

**Status:** ready-for-agent

- [x] Click on a world entity injects a pointer at its projected screen position and the game reacts
- [x] A click whose projection is off-screen fails with `element not interactable`
- [x] Example game includes a clickable world entity covered by a test
- [x] Occlusion detection is explicitly not included
