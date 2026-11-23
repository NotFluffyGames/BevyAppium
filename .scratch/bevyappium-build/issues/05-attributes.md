---
label: ready-for-agent
status: done
spec: ../../bevyappium-driver/spec.md
---
# 05: Attributes, displayed, enabled

**What to build:** A test author can assert on game state through attributes and the displayed and enabled commands.

**Blocked by:** 03 Element model: ids, locators, staleness

**Status:** ready-for-agent

- [x] Attribute by reflection path (for example a transform coordinate, a UI node width) returns a string
- [x] Special attributes `text`, `visible` and `enabled` work
- [x] An attribute on an unregistered component returns null
- [x] Displayed means inherited visibility is visible and, for UI, non-zero size
- [x] Enabled means no interaction-disabled marker
