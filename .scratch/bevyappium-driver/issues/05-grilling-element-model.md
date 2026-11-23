---
label: wayfinder:grilling
assignee: claude
blocked_by: []
status: closed
---
# What is the Element model?

## Question

How do Bevy entities map to WebDriver elements: element ids and staleness when entities despawn, locator strategies and syntax, attributes/properties exposed from components, which actions apply to which elements?

## Resolution

- **Identity:** element id is the entity's full bits (index + generation) as a string. A despawned entity yields `stale element reference`; reused indexes never match an old id.
- **Locators (v1):** `accessibility id` (`~x`) and `id` match `Name` exactly; `class name` matches a component type (short or full path). XPath is deferred to fog. `getPageSource` returns the hierarchy as XML (from `ChildOf`) for debugging.
- **Findable:** every entity. Name locators need `Name`; component locators need nothing.
- **Attributes:** `getAttribute(name)` reads reflected data by path (e.g. `Transform.translation.x`, `Node.width`) as a string; special names `text`, `visible`, `enabled`. Unregistered components return null; the game author guide says to register them for reflection.
- **Click:** injected pointer at a screen position. UI node: centre of its computed layout rect. World entity: world position projected through its camera. Off-screen projection fails with `element not interactable`. Occlusion detection is fog.
- **Displayed:** inherited visibility is visible and, for UI, non-zero size. **Enabled:** no `InteractionDisabled` marker (bevy_ui_widgets); games with their own notion expose it as an attribute.
