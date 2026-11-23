---
label: ready-for-agent
status: done
spec: ../../bevyappium-driver/spec.md
---
# 10: CLI: inspect, run, doctor

**What to build:** A CLI user has three subcommands in the Driver package: an inspector for a running or launched game's element tree, a local suite runner that needs no manual Appium server, and an environment check.

**Blocked by:** 07 Screenshot and page source; 09 Session lifecycle robustness

**Status:** ready-for-agent

- [x] `inspect` launches or attaches to a game and shows its element tree interactively
- [x] `run` starts a server, runs a test suite against a game and prints results
- [x] `doctor` checks the Node version, display, Vulkan, Rust toolchain and system libraries and reports fixes
- [x] Each subcommand is covered by a test or an executed example
