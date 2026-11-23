//! Example game: a button and a counter. Test subject for BevyAppium.
use bevy::prelude::*;
use bevy::ui::InteractionDisabled;
use bevy::ui_widgets::{Activate, Button};
use bevyappium_agent::BevyAppiumPlugin;

#[derive(Component)]
struct Counter(u32);

/// Test fixtures: several same-named entities, a component with no `Name`, and a
/// short-lived entity (for stale-element tests).
#[derive(Component, Reflect, Default)]
#[reflect(Component)]
pub struct Enemy;

#[derive(Component, Reflect, Default)]
#[reflect(Component)]
pub struct Marker;

#[derive(Component)]
struct Fleeting(Timer);

/// Deliberately not registered for reflection: attributes on it read as null.
#[derive(Component)]
struct Secret(#[allow(dead_code)] u32);

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window { resolution: (400, 300).into(), ..default() }),
            ..default()
        }))
        .add_plugins(BevyAppiumPlugin::default())
        .add_systems(Startup, setup)
        .add_systems(Update, despawn_fleeting)
        .add_observer(on_activate)
        .run();
}

fn setup(mut commands: Commands) {
    commands.spawn(Camera2d);
    for _ in 0..3 {
        commands.spawn((Name::new("Enemy"), Enemy));
    }
    commands.spawn(Marker);
    commands.spawn((Name::new("Player"), Transform::from_xyz(10.0, 20.0, 0.0), Visibility::Visible, Secret(7)));
    commands.spawn((Name::new("Hidden"), Visibility::Hidden));
    commands.spawn((Name::new("Fleeting"), Text::new("fleeting"), Fleeting(Timer::from_seconds(2.0, TimerMode::Once))));
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
            p.spawn((
                Name::new("DisabledBtn"),
                Button,
                InteractionDisabled,
                Node { width: px(160), height: px(30), ..default() },
            ));
            p.spawn((Name::new("Collapsed"), Node { width: px(0), height: px(0), ..default() }));
            p.spawn((Name::new("Counter"), Counter(0), Text::new("count: 0")));
        });
}

fn on_activate(_: On<Activate>, mut c: Query<(&mut Counter, &mut Text)>) {
    for (mut n, mut t) in &mut c {
        n.0 += 1;
        t.0 = format!("count: {}", n.0);
    }
}

fn despawn_fleeting(mut commands: Commands, time: Res<Time>, mut q: Query<(Entity, &mut Fleeting)>) {
    for (e, mut f) in &mut q {
        if f.0.tick(time.delta()).is_finished() {
            commands.entity(e).despawn();
        }
    }
}
