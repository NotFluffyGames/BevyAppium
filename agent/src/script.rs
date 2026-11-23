//! The script method: a list of steps run one per frame; the reply is sent only
//! once the script has finished (reply-after-frame).
use bevy::prelude::*;
use bevy::remote::{BrpError, BrpResult, RemotePlugin, http::RemoteHttpPlugin};
use serde_json::{Value, json};
use std::collections::HashMap;

pub const METHOD: &str = "bevyappium.run";

pub fn build(app: &mut App, port: u16) {
    app.add_plugins((
        RemotePlugin::default().with_watching_method_main(METHOD, run_method),
        RemoteHttpPlugin::default().with_port(port),
    ))
    .init_resource::<Jobs>()
    // Steps run in `First`, after the message buffers swap and before input processing.
    .add_systems(First, drive_jobs.after(bevy::ecs::message::MessageUpdateSystems));
}

#[derive(Default)]
struct Job {
    step: usize,
    waited: u32,
    out: Vec<Value>,
}

/// Per-request state is keyed by a request id from the Driver: the handler
/// system instance is shared by all requests.
#[derive(Resource, Default)]
struct Jobs {
    running: HashMap<u64, (Vec<Value>, Job)>,
    done: HashMap<u64, Value>,
}

fn run_method(In(params): In<Option<Value>>, mut jobs: ResMut<Jobs>) -> BrpResult<Option<Value>> {
    let p = params.ok_or_else(|| BrpError::internal("missing params"))?;
    let id = p["id"].as_u64().ok_or_else(|| BrpError::internal("missing numeric id"))?;
    if let Some(done) = jobs.done.remove(&id) {
        return Ok(Some(done));
    }
    if !jobs.running.contains_key(&id) {
        let steps = p["steps"].as_array().cloned().unwrap_or_default();
        jobs.running.insert(id, (steps, Job::default()));
    }
    Ok(None) // not yet: reply after the script finishes
}

fn drive_jobs(world: &mut World) {
    world.resource_scope(|world, mut jobs: Mut<Jobs>| {
        let ids: Vec<u64> = jobs.running.keys().copied().collect();
        for id in ids {
            let (steps, mut job) = jobs.running.remove(&id).unwrap();
            let Some(step) = steps.get(job.step) else {
                jobs.done.insert(id, json!({ "results": job.out }));
                continue;
            };
            if run_step(world, &mut job, step) {
                job.step += 1;
            }
            jobs.running.insert(id, (steps, job));
        }
    });
}

fn error(code: &str, message: impl ToString) -> Value {
    json!({ "error": { "code": code, "message": message.to_string() } })
}

/// Parse an element id; a despawned entity (even with a reused index) is stale.
fn element(world: &World, id: &str) -> Result<Entity, Value> {
    let entity = id.parse::<u64>().ok().and_then(Entity::try_from_bits).ok_or_else(|| error("no such element", format!("bad element id {id}")))?;
    world.get_entity(entity).map(|_| entity).map_err(|_| error("stale element reference", format!("element {id} no longer exists")))
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
fn run_step(world: &mut World, job: &mut Job, step: &Value) -> bool {
    if let Some(f) = step.get("find") {
        let (using, value) = (f["using"].as_str().unwrap_or(""), f["value"].as_str().unwrap_or(""));
        let found = match using {
            "name" => find_by_name(world, value),
            "component" => find_by_component(world, value),
            other => {
                job.out.push(error("invalid selector", format!("unsupported locator '{other}'")));
                return true;
            }
        };
        let ids: Vec<String> = found.iter().map(|e| e.to_bits().to_string()).collect();
        job.out.push(json!({ "elements": ids }));
    } else if let Some(id) = step["text"].as_str() {
        job.out.push(match element(world, id) {
            Err(e) => e,
            Ok(e) => match world.get::<Text>(e) {
                Some(t) => json!({ "text": t.0 }),
                None => error("no such element", format!("element {id} has no text")),
            },
        });
    } else if let Some(n) = step["wait"].as_u64() {
        job.waited += 1;
        if u64::from(job.waited) <= n {
            return false;
        }
        job.waited = 0;
    } else {
        job.out.push(error("unknown command", format!("unknown step: {step}")));
    }
    true
}
