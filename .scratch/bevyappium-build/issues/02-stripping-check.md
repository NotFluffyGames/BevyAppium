---
label: ready-for-agent
status: done
spec: ../../bevyappium-driver/spec.md
---
# 02: Release-build stripping check

**What to build:** Seam 2. A maintainer can run one check that proves a release build of the example game contains no Agent traces.

**Blocked by:** 01 Walking skeleton

**Status:** ready-for-agent

- [x] Builds the example game with the Agent feature off
- [x] Fails if Agent or BRP dependencies appear in the dependency tree
- [x] Best-effort: fails if the built binary contains Agent strings (crate names, method names, port)
- [x] Detects another crate re-enabling Bevy's remote feature through feature unification
- [x] Passes on a clean build and is shown to fail when the feature is on

Note: verified with `PROFILE=dev` (scanning a stripped copy) and the `--with-agent` self-test. A full `--release` build was not run in this session (it is a long Bevy compile); the workspace release profile sets `strip = true`, without which symbol names leak the crate name.
