---
label: ready-for-agent
status: open
spec: ../../bevyappium-driver/spec.md
---
# 01: Walking skeleton

**What to build:** A test author can install the Driver into Appium 4, start a session against the example Bevy game (built with the Agent feature), find an element with the accessibility-id locator, read its text, and delete the session, all from a headless WebdriverIO test. This also lays down the monorepo (Driver npm package, Agent cargo crate, example game) and the Seam 1 test harness (virtual display, software Vulkan) every later ticket reuses. The Agent is an opt-in Cargo feature, off by default. Reply-after-frame uses one watching BRP method called without the watch suffix, as proven in the prototype (branch `prototype/roundtrip`; reference only).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Driver installs into Appium 4 from a local path and appears in the driver list
- [ ] Starting a session launches the example game and waits for the Agent port; deleting the session terminates it
- [ ] Find by `~Name` returns an element; get text returns its label
- [ ] The whole flow runs headless in CI-style conditions (virtual display, software Vulkan) from one test command
- [ ] The Agent feature is off by default and the example builds both ways
