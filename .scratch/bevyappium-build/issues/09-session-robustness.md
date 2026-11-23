---
label: ready-for-agent
status: done
spec: ../../bevyappium-driver/spec.md
---
# 09: Session lifecycle robustness

**What to build:** Sessions fail clearly and clean up reliably in every launch and attach scenario.

**Blocked by:** 01 Walking skeleton

**Status:** ready-for-agent

- [x] Attach mode: connect to an already-running game by giving the Agent port
- [x] Agent port is configurable so several games can run in parallel; default binding is localhost only
- [x] The second render-world BRP server is off by default
- [x] A game crash mid-session fails the current command with a clear error and the session ends cleanly
- [x] A missing binary, a failed launch, or a port that never opens give clear session-creation errors
- [x] The game process is always terminated when the session ends, including on error
