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

fn drive_jobs(mut jobs: ResMut<Jobs>, names: Query<(Entity, &Name)>, texts: Query<&Text>) {
    let ids: Vec<u64> = jobs.running.keys().copied().collect();
    for id in ids {
        let (steps, mut job) = jobs.running.remove(&id).unwrap();
        let Some(step) = steps.get(job.step) else {
            jobs.done.insert(id, json!({ "results": job.out }));
            continue;
        };
        let mut advance = true;
        if let Some(name) = step["find"].as_str() {
            let found: Vec<String> = names.iter().filter(|(_, n)| n.as_str() == name).map(|(e, _)| e.to_bits().to_string()).collect();
            job.out.push(json!({ "elements": found }));
        } else if let Some(element) = step["text"].as_str() {
            let text = element
                .parse::<u64>()
                .ok()
                .and_then(Entity::try_from_bits)
                .and_then(|e| texts.get(e).ok())
                .map(|t| t.0.clone());
            job.out.push(json!({ "text": text }));
        } else if let Some(n) = step["wait"].as_u64() {
            job.waited += 1;
            if u64::from(job.waited) <= n {
                advance = false;
            } else {
                job.waited = 0;
            }
        } else {
            job.out.push(json!({ "error": format!("unknown step: {step}") }));
        }
        if advance {
            job.step += 1;
        }
        jobs.running.insert(id, (steps, job));
    }
}
