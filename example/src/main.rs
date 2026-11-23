//! Example game: a button and a counter. Test subject for BevyAppium.
use bevy::prelude::*;
use bevy::ui_widgets::{Activate, Button};
use bevyappium_agent::BevyAppiumPlugin;

#[derive(Component)]
struct Counter(u32);

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window { resolution: (400, 300).into(), ..default() }),
            ..default()
        }))
        .add_plugins(BevyAppiumPlugin::default())
        .add_systems(Startup, setup)
        .add_observer(on_activate)
        .run();
}

fn setup(mut commands: Commands) {
    commands.spawn(Camera2d);
    commands
        .spawn(Node {
            width: percent(100),
            height: percent(100),
            flex_direction: FlexDirection::Column,
            justify_content: JustifyContent::Center,
            align_items: AlignItems::Center,
            row_gap: px(20),
            ..default()
        })
        .with_children(|p| {
            p.spawn((
                Name::new("ClickBtn"),
                Button,
                Node { width: px(160), height: px(60), justify_content: JustifyContent::Center, align_items: AlignItems::Center, ..default() },
                BackgroundColor(Color::srgb(0.2, 0.4, 0.8)),
            ))
            .with_children(|b| {
                b.spawn(Text::new("Click me"));
            });
            p.spawn((Name::new("Counter"), Counter(0), Text::new("count: 0")));
        });
}

fn on_activate(_: On<Activate>, mut c: Query<(&mut Counter, &mut Text)>) {
    for (mut n, mut t) in &mut c {
        n.0 += 1;
        t.0 = format!("count: {}", n.0);
    }
}
