---
label: ready-for-agent
status: open
spec: ../../bevyappium-driver/spec.md
---
# 09: Session lifecycle robustness

**What to build:** Sessions fail clearly and clean up reliably in every launch and attach scenario.

**Blocked by:** 01 Walking skeleton

**Status:** ready-for-agent

- [ ] Attach mode: connect to an already-running game by giving the Agent port
- [ ] Agent port is configurable so several games can run in parallel; default binding is localhost only
- [ ] The second render-world BRP server is off by default
- [ ] A game crash mid-session fails the current command with a clear error and the session ends cleanly
- [ ] A missing binary, a failed launch, or a port that never opens give clear session-creation errors
- [ ] The game process is always terminated when the session ends, including on error
