# BevyAppium

Automated UI and gameplay testing for Bevy games, driven through the Appium ecosystem.

## Language

**Driver**:
The Appium 2 driver. It speaks the WebDriver protocol to test clients and translates their commands into calls on an **Agent**.

**Agent**:
The Bevy plugin a game author adds to their game. It runs inside the game process and exposes the game's entities and UI to the **Driver**, and injects input into it.

**Session**:
One test client's lifetime against one running game, from launch to quit.

**Element**:
Something a test can locate and act on: a Bevy entity (UI node or world entity) as seen through the Driver.

## Relationships

- A **Session** has exactly one **Driver** and one **Agent**.
- A game without an **Agent** cannot be driven.
