# Game author guide

How to make your Bevy game drivable by BevyAppium. Pinned to **Bevy 0.20.1**.

## 1. Add the plugin behind a Cargo feature

In your game's `Cargo.toml`:

```toml
[dependencies]
bevyappium-agent = { path = "../path/to/BevyAppium/agent" }

[features]
# Turn the Agent on for test builds only.
bevyappium = ["bevyappium-agent/enabled"]
```

In your app:

```rust
use bevyappium_agent::BevyAppiumPlugin;

App::new()
    .add_plugins(DefaultPlugins)
    .add_plugins(BevyAppiumPlugin::default());
```

With the feature **off** the plugin is empty: nothing from the Agent is compiled into your game.
With it **on** the game listens on `127.0.0.1` (loopback only) on `BEVYAPPIUM_PORT`, or 15702 if
unset. The Driver sets the variable for you in launch mode; `.with_port(n)` overrides it.

Build the test version with `cargo build --features bevyappium`; ship without it.

## 2. Name the things tests should find

Locators find entities by their `Name` component:

```rust
commands.spawn((Name::new("PlayButton"), Button, /* ... */));
commands.spawn((Name::new("Score"), Text::new("0")));
```

Entities without a `Name` can still be found by component type (`class name` locator), for example
every `Enemy`.

## 3. Register components for reflection

Tests read game state with attributes such as `Enemy.health` or `Transform.translation.x`. That
works only for components registered for reflection:

```rust
#[derive(Component, Reflect, Default)]
#[reflect(Component)]
struct Enemy { health: f32 }
```

With Bevy's default features, deriving `Reflect` registers the type automatically; otherwise call
`app.register_type::<Enemy>()`. Components that are not registered return `null` as attributes (and
cannot be found with the `class name` locator).

## 4. Things to know

- **UI buttons** respond to clicks injected by the Driver when they use `bevy_ui_widgets::Button`
  (observe `Activate`) or any picking observer (`PointerClick`).
- **World entities** (2D sprites, meshes) need a picking backend enabled (Bevy's `picking`
  features) and sprites need an explicit `Pickable` component. A full-screen UI node blocks picking
  of anything behind it unless it is `Pickable::IGNORE`.
- **Hidden / disabled**: `visible` follows `InheritedVisibility`; `enabled` is false when the entity
  has the `InteractionDisabled` marker. Expose your own notion (for example "locked") as a component
  attribute.
- **Keyboard**: send keys arrive as ordinary `KeyboardInput` messages.
- **Frames**: the Driver injects input in `First` and replies after the frame completes, so tests do
  not need sleeps. Use `bevy: waitFrames` to let animations or timers progress.

## 5. Verify release builds are clean

```bash
scripts/check-stripped.sh                # release profile: dependency tree + binary scan
PROFILE=dev scripts/check-stripped.sh    # faster, for local runs
```

It fails if a build **without** the feature contains Agent traces. Beware: if another crate in
your tree enables Bevy's own `bevy_remote` feature, Cargo feature unification switches it on for
everyone, and the check will tell you.

## Limits

No XPath locators, no occlusion detection for clicks, no touch input, one Bevy version, desktop only.
