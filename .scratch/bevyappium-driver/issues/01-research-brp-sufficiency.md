---
label: wayfinder:research
assignee: claude
blocked_by: []
status: open
---
# Is BRP sufficient for the Agent?

## Question

Does Bevy's `bevy_remote` (BRP) cover what the Agent needs on the pinned Bevy version: entity/component queries, name lookup, change watching, custom methods for input injection and screenshots, running handlers at a fixed point in the frame, and reply-after-frame semantics? What must be custom? Can it be fully compiled out behind a Cargo feature?
