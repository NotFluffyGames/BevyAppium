//! BevyAppium Agent: a Bevy plugin that lets the Appium Driver find and act on
//! entities in a running game.
//!
//! The `enabled` Cargo feature is off by default. Without it, [`BevyAppiumPlugin`]
//! compiles to an empty plugin and pulls in no extra dependencies, so release
//! builds carry no trace of the Agent.

use bevy::prelude::*;

#[cfg(feature = "enabled")]
mod script;
#[cfg(feature = "enabled")]
mod transport;

/// Add this plugin to a game to make it drivable. Inert unless the `enabled`
/// feature is on.
#[derive(Debug, Clone)]
pub struct BevyAppiumPlugin {
    /// TCP port for the Agent. Defaults to `BEVYAPPIUM_PORT` or 15702.
    pub port: u16,
}

impl Default for BevyAppiumPlugin {
    fn default() -> Self {
        let port = std::env::var("BEVYAPPIUM_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(15702);
        Self { port }
    }
}

#[cfg(feature = "enabled")]
impl Plugin for BevyAppiumPlugin {
    fn build(&self, app: &mut App) {
        script::build(app, self.port);
    }
}

#[cfg(not(feature = "enabled"))]
impl Plugin for BevyAppiumPlugin {
    fn build(&self, _app: &mut App) {}
}
