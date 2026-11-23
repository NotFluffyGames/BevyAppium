//! BevyAppium Agent: a Bevy plugin that lets the Appium Driver find and act on
//! entities in a running game.
//!
//! The `enabled` Cargo feature is off by default. Without it, [`BevyAppiumPlugin`]
//! compiles to an empty plugin: no extra dependencies, and no Agent strings (names,
//! environment variable, method names) in the binary, so release builds carry no
//! trace of the Agent. `scripts/check-stripped.sh` verifies this.

use bevy::prelude::*;

#[cfg(feature = "enabled")]
mod script;
#[cfg(feature = "enabled")]
mod transport;

/// Add this plugin to a game to make it drivable. Inert unless the `enabled`
/// feature is on.
#[cfg(feature = "enabled")]
#[derive(Debug, Clone)]
pub struct BevyAppiumPlugin {
    /// TCP port for the Agent (loopback only). Defaults to `BEVYAPPIUM_PORT` or 15702.
    pub port: u16,
}

#[cfg(feature = "enabled")]
impl Default for BevyAppiumPlugin {
    fn default() -> Self {
        let port = std::env::var("BEVYAPPIUM_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(15702);
        Self { port }
    }
}

#[cfg(feature = "enabled")]
impl BevyAppiumPlugin {
    /// Use a specific port instead of `BEVYAPPIUM_PORT` / 15702.
    pub fn with_port(mut self, port: u16) -> Self {
        self.port = port;
        self
    }
}

#[cfg(feature = "enabled")]
impl Plugin for BevyAppiumPlugin {
    fn build(&self, app: &mut App) {
        script::build(app, self.port);
    }
}

/// Without the `enabled` feature the plugin does nothing and carries no strings.
#[cfg(not(feature = "enabled"))]
#[derive(Default, Clone)]
pub struct BevyAppiumPlugin;

#[cfg(not(feature = "enabled"))]
impl BevyAppiumPlugin {
    /// No-op without the `enabled` feature.
    pub fn with_port(self, _port: u16) -> Self {
        self
    }
}

#[cfg(not(feature = "enabled"))]
impl Plugin for BevyAppiumPlugin {
    fn build(&self, _app: &mut App) {}

    // The default name is the type path, which would put the crate name in the binary.
    fn name(&self) -> &str {
        ""
    }
}
