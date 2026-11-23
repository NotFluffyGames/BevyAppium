---
label: ready-for-agent
status: done
spec: ../../bevyappium-driver/spec.md
---
# 03: Element model: ids, locators, staleness

**What to build:** A test author can find one or many elements by accessibility id, `id` (exact `Name`) or class name (component type, short or full path), and element ids behave correctly over an entity's life.

**Blocked by:** 01 Walking skeleton

**Status:** ready-for-agent

- [x] Every entity is findable; Name locators need `Name`, component locators do not
- [x] Element id is the entity's index and generation as a string
- [x] Acting on a despawned entity's id gives `stale element reference`, even if the index is reused
- [x] Find-all returns every match; no match gives `no such element` cleanly
- [x] XPath and other unsupported strategies fail with a clear not-supported error
