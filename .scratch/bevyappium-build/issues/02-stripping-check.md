---
label: ready-for-agent
status: open
spec: ../../bevyappium-driver/spec.md
---
# 02: Release-build stripping check

**What to build:** Seam 2. A maintainer can run one check that proves a release build of the example game contains no Agent traces.

**Blocked by:** 01 Walking skeleton

**Status:** ready-for-agent

- [ ] Builds the example game with the Agent feature off
- [ ] Fails if Agent or BRP dependencies appear in the dependency tree
- [ ] Best-effort: fails if the built binary contains Agent strings (crate names, method names, port)
- [ ] Detects another crate re-enabling Bevy's remote feature through feature unification
- [ ] Passes on a clean build and is shown to fail when the feature is on
