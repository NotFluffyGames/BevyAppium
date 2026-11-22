---
label: ready-for-agent
status: open
spec: ../../bevyappium-driver/spec.md
---
# 03: Element model: ids, locators, staleness

**What to build:** A test author can find one or many elements by accessibility id, `id` (exact `Name`) or class name (component type, short or full path), and element ids behave correctly over an entity's life.

**Blocked by:** 01 Walking skeleton

**Status:** ready-for-agent

- [ ] Every entity is findable; Name locators need `Name`, component locators do not
- [ ] Element id is the entity's index and generation as a string
- [ ] Acting on a despawned entity's id gives `stale element reference`, even if the index is reused
- [ ] Find-all returns every match; no match gives `no such element` cleanly
- [ ] XPath and other unsupported strategies fail with a clear not-supported error
