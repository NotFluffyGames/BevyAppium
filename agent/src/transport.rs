//! Minimal HTTP transport for the BRP mailbox: JSON-RPC over `POST /`, loopback only,
//! one port. Connections are served on their own threads and closed after each reply.
use bevy::remote::{BrpMessage, BrpResult};
use serde_json::{Value, json};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};

const MAX_BODY: usize = 4 * 1024 * 1024;

/// Listen on `127.0.0.1:port` and forward requests to the BRP mailbox.
pub fn serve(port: u16, mailbox: async_channel::Sender<BrpMessage>) {
    let listener = match TcpListener::bind((Ipv4Addr::LOCALHOST, port)) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("bevyappium: cannot listen on 127.0.0.1:{port}: {e}");
            return;
        }
    };
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let mailbox = mailbox.clone();
            std::thread::spawn(move || {
                let _ = handle(stream, &mailbox);
            });
        }
    });
}

fn handle(mut stream: TcpStream, mailbox: &async_channel::Sender<BrpMessage>) -> std::io::Result<()> {
    let body = read_body(&stream)?;
    let reply = match serde_json::from_slice::<Value>(&body) {
        Err(e) => json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": format!("parse error: {e}") } }),
        Ok(request) => {
            let id = request.get("id").cloned().unwrap_or(Value::Null);
            match request.get("method").and_then(Value::as_str) {
                None => json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32600, "message": "missing method" } }),
                Some(method) => {
                    let (tx, rx) = async_channel::bounded::<BrpResult>(1);
                    let message = BrpMessage { method: method.to_string(), params: request.get("params").cloned(), sender: tx };
                    if mailbox.send_blocking(message).is_err() {
                        json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32603, "message": "the game is shutting down" } })
                    } else {
                        match rx.recv_blocking() {
                            Ok(Ok(result)) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
                            Ok(Err(error)) => json!({ "jsonrpc": "2.0", "id": id, "error": serde_json::to_value(error).unwrap_or(Value::Null) }),
                            Err(_) => json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32603, "message": "the game is shutting down" } }),
                        }
                    }
                }
            }
        }
    };
    let payload = reply.to_string();
    write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}",
        payload.len()
    )?;
    stream.flush()
}

/// Read one HTTP request and return its body.
fn read_body(stream: &TcpStream) -> std::io::Result<Vec<u8>> {
    let mut reader = BufReader::new(stream);
    let mut length = 0usize;
    let mut line = String::new();
    reader.read_line(&mut line)?; // request line
    loop {
        line.clear();
        if reader.read_line(&mut line)? == 0 || line == "\r\n" || line == "\n" {
            break;
        }
        if let Some((name, value)) = line.split_once(':')
            && name.trim().eq_ignore_ascii_case("content-length")
        {
            length = value.trim().parse().unwrap_or(0);
        }
    }
    if length > MAX_BODY {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "request too large"));
    }
    let mut body = vec![0; length];
    reader.read_exact(&mut body)?;
    Ok(body)
}
