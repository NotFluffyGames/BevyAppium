// PROTOTYPE: throwaway. Answers ticket 04 (Driver<->Agent round trip, reply-after-frame).
use bevy::input::mouse::MouseButtonInput;
use bevy::input::ButtonState;
use bevy::prelude::*;
use bevy::ui_widgets::{Activate, Button};
use bevy::remote::{http::RemoteHttpPlugin, BrpError, BrpResult, RemotePlugin};
use bevy::render::view::screenshot::{save_to_disk, Screenshot};
use bevy::window::{CursorMoved, PrimaryWindow, WindowEvent};
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Component)]
struct Counter(u32);

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window { resolution: (400, 300).into(), ..default() }),
            ..default()
        }))
        .add_plugins((
            RemotePlugin::default().with_watching_method_main("bevyappium.run", run_method),
            RemoteHttpPlugin::default(),
        ))
        .init_resource::<Jobs>()
        .add_systems(Startup, setup)
        .add_observer(on_activate)
        // inject after message swap in First, before InputSystems (PreUpdate)
        .add_systems(First, drive_jobs.after(bevy::ecs::message::MessageUpdateSystems))
        .run();
}

fn setup(mut commands: Commands) {
    commands.spawn(Camera2d);
    commands
        .spawn(Node { width: percent(100), height: percent(100), flex_direction: FlexDirection::Column,
            justify_content: JustifyContent::Center, align_items: AlignItems::Center, row_gap: px(20), ..default() })
        .with_children(|p| {
            p.spawn((Name::new("ClickBtn"), Button, Node { width: px(160), height: px(60), justify_content: JustifyContent::Center, align_items: AlignItems::Center, ..default() },
                BackgroundColor(Color::srgb(0.2, 0.4, 0.8)))).with_children(|b| { b.spawn((Text::new("Click me"),)); });
            p.spawn((Name::new("Counter"), Counter(0), Text::new("count: 0")));
        });
}

fn on_activate(_: On<Activate>, mut c: Query<(&mut Counter, &mut Text)>) {
    for (mut n, mut t) in &mut c { n.0 += 1; t.0 = format!("count: {}", n.0); }
}

// ---- Agent: job runner. One step per frame, reply only when the script ends. ----
#[derive(Default)]
struct Job { step: usize, sub: u32, out: Vec<Value>, wait: u32 }
#[derive(Resource, Default)]
struct Jobs { jobs: HashMap<u64, Job>, queued: Vec<(u64, Vec<Value>)>, scripts: HashMap<u64, Vec<Value>>, done: HashMap<u64, Value> }

// Handler: register script on first call; return None until job done (reply-after-frame).
fn run_method(In(params): In<Option<Value>>, mut jobs: ResMut<Jobs>) -> BrpResult<Option<Value>> {
    let p = params.ok_or_else(|| BrpError::internal("missing params"))?;
    let id = p["id"].as_u64().ok_or_else(|| BrpError::internal("missing id"))?;
    if let Some(v) = jobs.done.remove(&id) { return Ok(Some(v)); }
    if !jobs.scripts.contains_key(&id) {
        let steps = p["steps"].as_array().cloned().unwrap_or_default();
        jobs.scripts.insert(id, steps);
        jobs.jobs.insert(id, Job::default());
    }
    Ok(None)
}

fn drive_jobs(
    mut commands: Commands,
    mut jobs: ResMut<Jobs>,
    names: Query<(Entity, &Name)>,
    nodes: Query<(&ComputedNode, &UiGlobalTransform)>,
    texts: Query<&Text>,
    mut window: Query<(Entity, &mut Window), With<PrimaryWindow>>,
    mut moved: MessageWriter<CursorMoved>,
    mut buttons: MessageWriter<MouseButtonInput>,
    mut wevents: MessageWriter<WindowEvent>,
) {
    let ids: Vec<u64> = jobs.jobs.keys().copied().collect();
    for id in ids {
        let steps = jobs.scripts[&id].clone();
        let mut job = jobs.jobs.remove(&id).unwrap();
        let Some(step) = steps.get(job.step) else {
            jobs.scripts.remove(&id);
            jobs.done.insert(id, json!({"results": job.out}));
            continue;
        };
        let find = |n: &str| names.iter().find(|(_, nm)| nm.as_str() == n).map(|(e, _)| e);
        let mut advance = true;
        if let Some(n) = step["find"].as_str() {
            job.out.push(json!({"find": n, "entity": find(n).map(|e| e.to_bits().to_string())}));
        } else if let Some(n) = step["text"].as_str() {
            let t = find(n).and_then(|e| texts.get(e).ok()).map(|t| t.0.clone());
            job.out.push(json!({"text": n, "value": t}));
        } else if let Some(n) = step["wait"].as_u64() {
            job.wait += 1;
            if job.wait <= n as u32 { advance = false } else { job.wait = 0 }
        } else if let Some(n) = step["click"].as_str() {
            // sub 0: move cursor; sub 1: press; sub 2: release. One per frame.
            let (wentity, mut win) = window.single_mut().unwrap();
            let target = find(n).and_then(|e| nodes.get(e).ok()).map(|(c, t)| {
                let s = c.inverse_scale_factor();
                Vec2::new(t.translation.x * s, t.translation.y * s)
            });
            match (target, job.sub) {
                (None, _) => { job.out.push(json!({"click": n, "error": "no such element"})); }
                (Some(pos), 0) => {
                    win.set_cursor_position(Some(pos));
                    let ev = CursorMoved { window: wentity, position: pos, delta: None };
                    moved.write(ev.clone()); wevents.write(WindowEvent::CursorMoved(ev));
                    job.sub = 1; advance = false;
                }
                (Some(_), 1) => {
                    let ev = MouseButtonInput { button: MouseButton::Left, state: ButtonState::Pressed, window: wentity };
                    buttons.write(ev.clone()); wevents.write(WindowEvent::MouseButtonInput(ev));
                    job.sub = 2; advance = false;
                }
                (Some(_), _) => {
                    let ev = MouseButtonInput { button: MouseButton::Left, state: ButtonState::Released, window: wentity };
                    buttons.write(ev.clone()); wevents.write(WindowEvent::MouseButtonInput(ev));
                    job.sub = 0; job.out.push(json!({"click": n, "ok": true}));
                }
            }
        } else if let Some(path) = step["screenshot"].as_str() {
            if job.sub == 0 {
                commands.spawn(Screenshot::primary_window()).observe(save_to_disk(path.to_string()));
                job.sub = 1; advance = false;
            } else {
                job.sub += 1;
                if job.sub > 15 { job.sub = 0; job.out.push(json!({"screenshot": path})); } else { advance = false }
            }
        }
        if advance { job.step += 1 }
        jobs.jobs.insert(id, job);
    }
}
