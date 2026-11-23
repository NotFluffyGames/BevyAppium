//! The script method: a list of steps run one per frame; the reply is sent only
//! once the script has finished (reply-after-frame).
use bevy::input::ButtonState;
use bevy::input::keyboard::{Key, KeyboardInput};
use bevy::input::mouse::MouseButtonInput;
use bevy::prelude::*;
use bevy::reflect::GetPath;
use bevy::render::view::screenshot::{Screenshot, ScreenshotCaptured};
use bevy::window::{CursorMoved, PrimaryWindow, WindowEvent};
use bevy::remote::{BrpError, BrpResult, RemotePlugin};
use serde_json::{Value, json};
use std::collections::HashMap;

pub const METHOD: &str = "bevyappium.run";

pub fn build(app: &mut App, port: u16) {
    // BRP supplies the method dispatch. Its stock HTTP plugin is not used: it also opens a
    // second (render-world) port that cannot be turned off, so `transport` serves the one
    // BRP mailbox on a single loopback port instead.
    app.add_plugins(RemotePlugin::default().with_watching_method_main(METHOD, run_method))
        .add_systems(PostStartup, move |sender: Res<bevy::remote::BrpSender>| crate::transport::serve(port, (**sender).clone()))
        .init_resource::<Jobs>()
    // Steps run in `First`, after the message buffers swap and before input processing.
    .add_systems(First, drive_jobs.after(bevy::ecs::message::MessageUpdateSystems));
}

#[derive(Default)]
struct Job {
    steps: Vec<Value>,
    step: usize,
    waited: u32,
    /// Phase within a multi-frame step (click: move, press, release, settle).
    phase: u32,
    out: Vec<Value>,
}

/// Per-request state is keyed by a request id from the Driver: the handler
/// system instance is shared by all requests.
#[derive(Resource, Default)]
struct Jobs {
    running: HashMap<u64, Job>,
    done: HashMap<u64, Value>,
    /// Every id ever registered. BRP may call the handler again after the reply was
    /// sent; without this a finished script would be registered, and run, a second time.
    seen: std::collections::HashSet<u64>,
    /// Finished screenshots (base64 PNG) by job id, filled by the capture observer.
    shots: HashMap<u64, Result<String, String>>,
}

fn run_method(In(params): In<Option<Value>>, mut jobs: ResMut<Jobs>) -> BrpResult<Option<Value>> {
    let p = params.ok_or_else(|| BrpError::internal("missing params"))?;
    let id = p["id"].as_u64().ok_or_else(|| BrpError::internal("missing numeric id"))?;
    if let Some(done) = jobs.done.remove(&id) {
        return Ok(Some(done));
    }
    if jobs.seen.insert(id) {
        let steps = p["steps"].as_array().cloned().unwrap_or_default();
        jobs.running.insert(id, Job { steps, ..Job::default() });
    }
    Ok(None) // not yet: reply after the script finishes
}

fn drive_jobs(world: &mut World) {
    world.resource_scope(|world, mut jobs: Mut<Jobs>| {
        let ids: Vec<u64> = jobs.running.keys().copied().collect();
        for id in ids {
            let mut job = jobs.running.remove(&id).unwrap();
            let Some(step) = job.steps.get(job.step).cloned() else {
                jobs.done.insert(id, json!({ "results": job.out }));
                continue;
            };
            if run_step(world, &mut jobs, id, &mut job, &step) {
                job.step += 1;
            }
            jobs.running.insert(id, job);
        }
    });
}

/// Error codes sent to the Driver; the Driver maps each to a WebDriver error.
mod code {
    pub const NO_SUCH_ELEMENT: &str = "no such element";
    pub const STALE: &str = "stale element reference";
    pub const NOT_INTERACTABLE: &str = "element not interactable";
    pub const INVALID_SELECTOR: &str = "invalid selector";
    pub const INVALID_ARGUMENT: &str = "invalid argument";
    pub const UNKNOWN_COMMAND: &str = "unknown command";
    pub const UNKNOWN_ERROR: &str = "unknown error";
    pub const CAPTURE_FAILED: &str = "unable to capture screen";
}

fn error(code: &str, message: impl ToString) -> Value {
    json!({ "error": { "code": code, "message": message.to_string() } })
}

/// Parse an element id; a despawned entity (even with a reused index) is stale.
fn element(world: &World, id: &str) -> Result<Entity, Value> {
    let entity = id.parse::<u64>().ok().and_then(Entity::try_from_bits).ok_or_else(|| error(code::NO_SUCH_ELEMENT, format!("bad element id {id}")))?;
    world.get_entity(entity).map(|_| entity).map_err(|_| error(code::STALE, format!("element {id} no longer exists")))
}

/// Resolve an element id and build the reply from it; a bad or stale id becomes the error reply.
fn with_element(world: &World, id: &str, f: impl FnOnce(&World, Entity) -> Value) -> Value {
    match element(world, id) {
        Ok(e) => f(world, e),
        Err(err) => err,
    }
}

fn primary_window(world: &mut World) -> Result<Entity, Value> {
    world.query_filtered::<Entity, With<PrimaryWindow>>().iter(world).next().ok_or_else(|| error(code::UNKNOWN_ERROR, "no primary window"))
}

fn find_by_name(world: &mut World, name: &str) -> Vec<Entity> {
    let mut q = world.query::<(Entity, &Name)>();
    q.iter(world).filter(|(_, n)| n.as_str() == name).map(|(e, _)| e).collect()
}

fn find_by_component(world: &World, path: &str) -> Vec<Entity> {
    let registry = world.resource::<AppTypeRegistry>().read();
    let Some(reg) = registry.get_with_type_path(path).or_else(|| registry.get_with_short_type_path(path)) else {
        return vec![];
    };
    let Some(cid) = world.components().get_valid_id(reg.type_id()) else {
        return vec![];
    };
    world.archetypes().iter().filter(|a| a.contains(cid)).flat_map(|a| a.entities().iter().map(|e| e.id())).collect()
}

/// Run one step. Returns true when the step is finished (false: run again next frame).
fn run_step(world: &mut World, jobs: &mut Jobs, job_id: u64, job: &mut Job, step: &Value) -> bool {
    if let Some(f) = step.get("find") {
        let (using, value) = (f["using"].as_str().unwrap_or(""), f["value"].as_str().unwrap_or(""));
        let found = match using {
            "name" => find_by_name(world, value),
            "component" => find_by_component(world, value),
            other => {
                job.out.push(error(code::INVALID_SELECTOR, format!("unsupported locator '{other}'")));
                return true;
            }
        };
        let ids: Vec<String> = found.iter().map(|e| e.to_bits().to_string()).collect();
        job.out.push(json!({ "elements": ids }));
    } else if let Some(id) = step["text"].as_str() {
        job.out.push(with_element(world, id, |world, e| match world.get::<Text>(e) {
            Some(t) => json!({ "text": t.0 }),
            None => error(code::NO_SUCH_ELEMENT, format!("element {id} has no text")),
        }));
    } else if step.get("screenshot").is_some() {
        return screenshot(world, jobs, job_id, job);
    } else if step.get("source").is_some() {
        job.out.push(json!({ "xml": page_source(world) }));
    } else if let Some(a) = step.get("attr") {
        let name = a["name"].as_str().unwrap_or("");
        job.out.push(with_element(world, a["element"].as_str().unwrap_or(""), |world, e| json!({ "value": attribute(world, e, name) })));
    } else if let Some(id) = step["displayed"].as_str() {
        job.out.push(with_element(world, id, |world, e| json!({ "value": displayed(world, e) })));
    } else if let Some(text) = step["keys"].as_str() {
        return keys(world, job, text);
    } else if let Some(id) = step["click"].as_str() {
        return click(world, job, id);
    } else if let Some(n) = step["wait"].as_u64() {
        if n == 0 {
            return true;
        }
        job.waited += 1;
        if u64::from(job.waited) <= n {
            return false;
        }
        job.waited = 0;
    } else {
        job.out.push(error(code::UNKNOWN_COMMAND, format!("unknown step: {step}")));
    }
    true
}

/// Frames to let the game react to a click before replying, so the next command sees its effect.
const SETTLE_FRAMES: u32 = 2;

/// A click is move, press, release on successive frames, then a short settle.
fn click(world: &mut World, job: &mut Job, id: &str) -> bool {
    let entity = match element(world, id) {
        Ok(e) => e,
        Err(e) => {
            job.out.push(e);
            return true;
        }
    };
    let pos = match click_position(world, entity) {
        Ok(p) => p,
        Err(why) => {
            job.out.push(error(code::NOT_INTERACTABLE, format!("element {id}: {why}")));
            return true;
        }
    };
    let window = match primary_window(world) {
        Ok(w) => w,
        Err(e) => {
            job.out.push(e);
            return true;
        }
    };
    match job.phase {
        0 => {
            if let Some(mut w) = world.get_mut::<Window>(window) {
                w.set_cursor_position(Some(pos));
            }
            let ev = CursorMoved { window, position: pos, delta: None };
            world.write_message(ev.clone());
            world.write_message(WindowEvent::CursorMoved(ev));
        }
        1 | 2 => {
            let state = if job.phase == 1 { ButtonState::Pressed } else { ButtonState::Released };
            let ev = MouseButtonInput { button: MouseButton::Left, state, window };
            world.write_message(ev);
            world.write_message(WindowEvent::MouseButtonInput(ev));
        }
        p if p < 3 + SETTLE_FRAMES => {}
        _ => {
            job.phase = 0;
            job.out.push(json!({ "ok": true }));
            return true;
        }
    }
    job.phase += 1;
    false
}

/// Centre of a UI node in logical window coordinates.
fn ui_center(world: &World, e: Entity) -> Option<Vec2> {
    let node = world.get::<ComputedNode>(e)?;
    let t = world.get::<UiGlobalTransform>(e)?;
    let s = node.inverse_scale_factor();
    Some(Vec2::new(t.translation.x * s, t.translation.y * s))
}

/// Visible (inherited) and, for UI nodes, non-zero size.
fn displayed(world: &World, e: Entity) -> bool {
    let visible = world.get::<InheritedVisibility>(e).is_some_and(|v| v.get());
    let sized = world.get::<ComputedNode>(e).is_none_or(|n| n.size().x > 0.0 && n.size().y > 0.0);
    visible && sized
}

/// Attribute by name: `text`, `visible`, `enabled`, else a reflection path
/// `Component.field.sub` (null when not exposed through reflection).
fn attribute(world: &World, e: Entity, name: &str) -> Option<String> {
    match name {
        "text" => return world.get::<Text>(e).map(|t| t.0.clone()),
        "visible" => return Some(world.get::<InheritedVisibility>(e).is_some_and(|v| v.get()).to_string()),
        "enabled" => return Some((!world.entity(e).contains::<bevy::ui::InteractionDisabled>()).to_string()),
        _ => {}
    }
    let (component, path) = name.split_once('.').map_or((name, ""), |(c, p)| (c, p));
    let registry = world.resource::<AppTypeRegistry>().read();
    let reg = registry.get_with_type_path(component).or_else(|| registry.get_with_short_type_path(component))?;
    let reflected = reg.data::<ReflectComponent>()?.reflect(world.entity(e))?;
    let value: &dyn PartialReflect = if path.is_empty() { reflected.as_partial_reflect() } else { reflected.reflect_path(path).ok()? };
    Some(format_value(value))
}

fn format_value(v: &dyn PartialReflect) -> String {
    if let Some(s) = v.try_downcast_ref::<String>() {
        return s.clone();
    }
    if let Some(f) = v.try_downcast_ref::<f32>() {
        return f.to_string();
    }
    if let Some(f) = v.try_downcast_ref::<f64>() {
        return f.to_string();
    }
    format!("{v:?}")
}

/// Frames to wait for the asynchronous capture before giving up.
const SCREENSHOT_TIMEOUT_FRAMES: u32 = 600;

/// Capture the primary window. The capture arrives some frames later; the reply waits for it.
fn screenshot(world: &mut World, jobs: &mut Jobs, id: u64, job: &mut Job) -> bool {
    if job.phase == 0 {
        world.spawn(Screenshot::primary_window()).observe(move |captured: On<ScreenshotCaptured>, mut jobs: ResMut<Jobs>| {
            jobs.shots.insert(id, encode_png(captured.image.clone()));
        });
        job.phase = 1;
        return false;
    }
    if let Some(shot) = jobs.shots.remove(&id) {
        job.phase = 0;
        job.out.push(match shot {
            Ok(png) => json!({ "png": png }),
            Err(e) => error(code::CAPTURE_FAILED, e),
        });
        return true;
    }
    job.phase += 1;
    if job.phase > SCREENSHOT_TIMEOUT_FRAMES {
        job.phase = 0;
        job.out.push(error(code::CAPTURE_FAILED, "timed out waiting for the capture"));
        return true;
    }
    false
}

fn encode_png(image: Image) -> Result<String, String> {
    use base64::Engine;
    let dynamic = image.try_into_dynamic().map_err(|e| e.to_string())?;
    // Screenshots can carry an alpha channel the PNG viewer does not need.
    let rgb = image::DynamicImage::ImageRgb8(dynamic.into_rgb8());
    let mut bytes = std::io::Cursor::new(Vec::new());
    rgb.write_to(&mut bytes, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes.into_inner()))
}

/// The entity hierarchy as XML: one `Entity` element per entity, children nested.
fn page_source(world: &World) -> String {
    fn esc(s: &str) -> String {
        s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
    }
    fn node(world: &World, e: Entity, out: &mut String) {
        let name = world.get::<Name>(e).map(|n| n.as_str().to_string()).unwrap_or_default();
        let components: Vec<String> = world
            .inspect_entity(e)
            .map(|infos| infos.map(|(_, c)| c.name().shortname().to_string()).collect())
            .unwrap_or_default();
        out.push_str(&format!("<Entity id=\"{}\" name=\"{}\" components=\"{}\"", e.to_bits(), esc(&name), esc(&components.join(","))));
        match world.get::<Children>(e) {
            Some(children) if !children.is_empty() => {
                out.push('>');
                for c in children.iter() {
                    node(world, c, out);
                }
                out.push_str("</Entity>");
            }
            _ => out.push_str("/>"),
        }
    }
    let mut out = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?><World>");
    let mut roots = world.try_query_filtered::<Entity, Without<ChildOf>>().expect("query");
    for e in roots.iter(world) {
        node(world, e, &mut out);
    }
    out.push_str("</World>");
    out
}

const LETTERS: [KeyCode; 26] = [
    KeyCode::KeyA, KeyCode::KeyB, KeyCode::KeyC, KeyCode::KeyD, KeyCode::KeyE, KeyCode::KeyF, KeyCode::KeyG,
    KeyCode::KeyH, KeyCode::KeyI, KeyCode::KeyJ, KeyCode::KeyK, KeyCode::KeyL, KeyCode::KeyM, KeyCode::KeyN,
    KeyCode::KeyO, KeyCode::KeyP, KeyCode::KeyQ, KeyCode::KeyR, KeyCode::KeyS, KeyCode::KeyT, KeyCode::KeyU,
    KeyCode::KeyV, KeyCode::KeyW, KeyCode::KeyX, KeyCode::KeyY, KeyCode::KeyZ,
];
const DIGITS: [KeyCode; 10] = [
    KeyCode::Digit0, KeyCode::Digit1, KeyCode::Digit2, KeyCode::Digit3, KeyCode::Digit4,
    KeyCode::Digit5, KeyCode::Digit6, KeyCode::Digit7, KeyCode::Digit8, KeyCode::Digit9,
];

/// Map one character (or WebDriver special-key code point) to a physical and logical key.
fn key_for(c: char) -> Option<(KeyCode, Key)> {
    Some(match c {
        'a'..='z' => (LETTERS[c as usize - 'a' as usize], Key::Character(c.to_string().into())),
        'A'..='Z' => (LETTERS[c as usize - 'A' as usize], Key::Character(c.to_string().into())),
        '0'..='9' => (DIGITS[c as usize - '0' as usize], Key::Character(c.to_string().into())),
        ' ' => (KeyCode::Space, Key::Space),
        '\u{E003}' => (KeyCode::Backspace, Key::Backspace),
        '\u{E004}' => (KeyCode::Tab, Key::Tab),
        '\u{E007}' | '\n' => (KeyCode::Enter, Key::Enter),
        '\u{E00C}' => (KeyCode::Escape, Key::Escape),
        _ => return None,
    })
}

/// Type text: per character a press frame then a release frame, then a short settle.
fn keys(world: &mut World, job: &mut Job, text: &str) -> bool {
    let chars: Vec<char> = text.chars().collect();
    let mapped: Option<Vec<(KeyCode, Key)>> = chars.iter().map(|c| key_for(*c)).collect();
    let Some(mapped) = mapped else {
        let bad = chars.iter().find(|c| key_for(**c).is_none()).copied().unwrap_or('?');
        job.out.push(error(code::INVALID_ARGUMENT, format!("unsupported character {bad:?}")));
        return true;
    };
    let window = match primary_window(world) {
        Ok(w) => w,
        Err(e) => {
            job.out.push(e);
            return true;
        }
    };
    let typing_frames = 2 * mapped.len() as u32;
    let phase = job.phase;
    if phase < typing_frames {
        let (key_code, logical_key) = mapped[(phase / 2) as usize].clone();
        let state = if phase.is_multiple_of(2) { ButtonState::Pressed } else { ButtonState::Released };
        let ev = KeyboardInput { key_code, logical_key, state, text: None, repeat: false, window };
        world.write_message(ev.clone());
        world.write_message(WindowEvent::KeyboardInput(ev));
    } else if phase >= typing_frames + SETTLE_FRAMES {
        job.phase = 0;
        job.out.push(json!({ "ok": true }));
        return true;
    }
    job.phase += 1;
    false
}

/// Where to click an element: a UI node's layout centre, or a world entity's position
/// projected through a camera. Fails when it has no screen position or projects off-screen.
fn click_position(world: &mut World, e: Entity) -> Result<Vec2, &'static str> {
    if let Some(pos) = ui_center(world, e) {
        return Ok(pos);
    }
    let world_pos = world.get::<GlobalTransform>(e).ok_or("it has no position and is not a UI node")?.translation();
    let mut cameras = world.query::<(&Camera, &GlobalTransform)>();
    let mut on_screen = None;
    let mut any = false;
    for (camera, transform) in cameras.iter(world) {
        if !camera.is_active {
            continue;
        }
        any = true;
        let (Ok(p), Some(size)) = (camera.world_to_viewport(transform, world_pos), camera.logical_viewport_size()) else {
            continue;
        };
        if p.x >= 0.0 && p.y >= 0.0 && p.x <= size.x && p.y <= size.y {
            on_screen = Some(p);
            break;
        }
    }
    if !any {
        return Err("there is no active camera");
    }
    on_screen.ok_or("it is outside the camera view")
}
