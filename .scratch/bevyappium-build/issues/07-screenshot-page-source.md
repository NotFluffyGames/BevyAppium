---
label: ready-for-agent
status: done
spec: ../../bevyappium-driver/spec.md
---
# 07: Screenshot and page source

**What to build:** A test author can take a screenshot of the game window and fetch the entity hierarchy as XML.

**Blocked by:** 01 Walking skeleton

**Status:** ready-for-agent

- [x] Standard WebDriver screenshot returns a base64 PNG of the primary window
- [x] Works headless under a virtual display with software rendering
- [x] The Agent waits the right number of frames for the async capture and does not time out or return a stale frame
- [x] Page source returns the entity hierarchy as XML (from parent-child relationships) including names and component types
