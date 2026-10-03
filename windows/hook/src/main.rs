//! coucou-hook — the relay AI coding agents run on every hook event.
//!
//! Reads the hook JSON on stdin, adds a little terminal context, normalizes
//! events across agents (Claude Code, Gemini CLI, Antigravity, etc.), and hands
//! it to Coucou over the named pipe `\\.\pipe\coucou-<sid>` (Windows) or the Unix
//! socket `$XDG_RUNTIME_DIR/coucou.sock` (Linux).
//!
//! Hard rule (docs/CLAUDE.md): **never block the agent.**
//! * If the pipe does not exist — Coucou is closed — we exit 0 immediately with
//!   nothing on stdout, and the session carries on untouched.
//! * Every step runs under a deadline enforced by the main thread, so a pipe that
//!   accepts the connection and then stops reading cannot wedge the session
//!   either: we abandon the worker and exit.
//! * Only `PermissionRequest` waits for an answer, because approving from the
//!   island is the whole point. No answer means empty stdout, and Claude Code
//!   asks in the terminal exactly as if Coucou were not installed.
//!
//! Usage: `coucou-hook [--agent <name>] [--statusline] [--ask] [<EventName>]`

use std::io::{Read, Write};
use std::sync::mpsc;
use std::time::Duration;

/// Budget for getting a pipe connection. Beyond this the agent wins, always.
const CONNECT_TIMEOUT: Duration = Duration::from_millis(300);
/// Whole-run budget for an event nobody waits on: connect and write, no more.
const FIRE_AND_FORGET_BUDGET: Duration = Duration::from_secs(2);
/// How long a permission prompt may stay on screen before the terminal takes over.
const DECISION_BUDGET: Duration = Duration::from_secs(110);

/// Fields that are pointless to forward and can be enormous (a whole file read,
/// a full command output). The island never shows them.
const DROPPED_FIELDS: &[&str] = &["tool_response", "transcript_path"];
/// Longest string forwarded for any single field; the island truncates to far
/// less than this anyway.
const MAX_FIELD_LEN: usize = 2_000;

mod win;
use win::connect;

fn main() {
    // Parse argv first so agent identity is always known, even if stdin is empty or invalid
    let mut agent = String::new();
    let mut arg_event = String::new();
    let mut is_statusline = false;
    {
        let mut it = std::env::args().skip(1);
        while let Some(arg) = it.next() {
            if arg == "--agent" {
                agent = it.next().unwrap_or_default();
            } else if arg == "--statusline" {
                is_statusline = true;
            } else if !arg.starts_with('-') && arg_event.is_empty() {
                arg_event = arg;
            }
        }
    }

    let default_exit = |event_name: &str| -> ! {
        if agent == "antigravity" || agent == "gemini" {
            let mut out = std::io::stdout();
            if event_name == "PreToolUse" || event_name == "BeforeTool" {
                let _ = writeln!(out, r#"{{"decision":"allow"}}"#);
            } else {
                let _ = writeln!(out, "{{}}");
            }
            let _ = out.flush();
        }
        std::process::exit(0);
    };

    let Some((payload, event)) = read_event(&agent, &arg_event, is_statusline) else {
        default_exit(&arg_event);
    };

    let waits_for_answer = event == "PermissionRequest";
    let budget = if waits_for_answer { DECISION_BUDGET } else { FIRE_AND_FORGET_BUDGET };

    // The worker owns every blocking call. If it overruns the budget we simply
    // stop listening and exit: the process dying takes the pipe handle with it.
    let (tx, rx) = mpsc::channel::<Option<String>>();
    std::thread::spawn(move || {
        let _ = tx.send(talk(&payload, waits_for_answer));
    });

    let mut answered = false;
    if let Ok(Some(decision)) = rx.recv_timeout(budget) {
        if let Some(json) = decision_json(&decision) {
            let mut out = std::io::stdout();
            let _ = writeln!(out, "{json}");
            let _ = out.flush();
            answered = true;
        }
    }

    // Antigravity and Gemini CLI expect a JSON object on stdout (empty = no decision).
    if !answered && (agent == "antigravity" || agent == "gemini") {
        let mut out = std::io::stdout();
        if event == "PreToolUse" || arg_event == "BeforeTool" || arg_event == "PreToolUse" {
            let _ = writeln!(out, r#"{{"decision":"allow"}}"#);
        } else {
            let _ = writeln!(out, "{{}}");
        }
        let _ = out.flush();
    }

    std::process::exit(0);
}

/// The documented PermissionRequest output.
fn decision_json(decision: &str) -> Option<String> {
    let behavior = match decision.trim() {
        "allow" | "always" => r#"{"behavior":"allow"}"#.to_string(),
        "deny" => r#"{"behavior":"deny","message":"Denied from Coucou"}"#.to_string(),
        _ => return None,
    };
    Some(format!(
        r#"{{"hookSpecificOutput":{{"hookEventName":"PermissionRequest","decision":{behavior}}}}}"#
    ))
}

fn normalize_event(name: &str) -> String {
    match name {
        "BeforeTool" | "BeforeToolSelection" => "PreToolUse".to_string(),
        "AfterTool" | "AfterModel" | "PostInvocation" => "PostToolUse".to_string(),
        "BeforeAgent" | "PreInvocation" => "UserPromptSubmit".to_string(),
        "AfterAgent" => "Stop".to_string(),
        "startup" => "SessionStart".to_string(),
        "exit" => "SessionEnd".to_string(),
        other => other.to_string(),
    }
}

fn normalize_tool_fields(map: &mut serde_json::Map<String, serde_json::Value>) {
    if !map.contains_key("tool_name") {
        let tool_val = map.get("toolCall").cloned().or_else(|| map.get("tool").cloned());
        if let Some(serde_json::Value::Object(tool_obj)) = tool_val {
            if let Some(name) = tool_obj.get("name").and_then(|v| v.as_str()) {
                map.insert("tool_name".into(), serde_json::Value::String(name.to_string()));
            }
            if !map.contains_key("tool_input") {
                if let Some(serde_json::Value::Object(args)) = tool_obj.get("args") {
                    let mut input = args.clone();
                    for (src, dst) in [
                        ("CommandLine", "command"),
                        ("FilePath", "file_path"),
                        ("TargetFile", "file_path"),
                        ("AbsolutePath", "file_path"),
                        ("Path", "path"),
                        ("DirectoryPath", "path"),
                        ("SearchPath", "path"),
                        ("Url", "url"),
                        ("Query", "query"),
                        ("Pattern", "pattern"),
                    ] {
                        if let Some(val) = input.get(src).cloned() {
                            input.insert(dst.into(), val);
                        }
                    }
                    map.insert("tool_input".into(), serde_json::Value::Object(input));
                }
            }
        } else if let Some(serde_json::Value::String(name)) = map.get("tool") {
            map.insert("tool_name".into(), serde_json::Value::String(name.clone()));
        }
    }

    if !map.contains_key("session_id") {
        for key in ["conversationId", "conversation_id", "sessionId", "GEMINI_SESSION_ID"] {
            if let Some(val) = map.get(key).and_then(|v| v.as_str()) {
                if !val.is_empty() {
                    map.insert("session_id".into(), serde_json::Value::String(val.to_string()));
                    break;
                }
            }
        }
        if !map.contains_key("session_id") {
            if let Ok(sid) = std::env::var("GEMINI_SESSION_ID") {
                if !sid.is_empty() {
                    map.insert("session_id".into(), serde_json::Value::String(sid));
                }
            }
        }
    }
}

/// Reads stdin and returns the payload to forward plus the normalized event name.
fn read_event(agent: &str, arg_event: &str, is_statusline: bool) -> Option<(String, String)> {
    let mut raw = Vec::new();
    let _ = std::io::stdin().read_to_end(&mut raw);

    // Some shells hand us a UTF-8 BOM; serde_json would choke on it.
    if raw.starts_with(&[0xEF, 0xBB, 0xBF]) {
        raw.drain(..3);
    }

    if raw.is_empty() && !is_statusline {
        return None;
    }

    let mut payload = if raw.is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_slice::<serde_json::Value>(&raw).ok()?
    };
    let map = payload.as_object_mut()?;

    if is_statusline {
        let relay = serde_json::json!({
            "coucou_kind": "statusline",
            "session_id": map.get("session_id").and_then(|v| v.as_str()).unwrap_or_default(),
            "rate_limits": map.get("rate_limits").cloned().unwrap_or_else(|| serde_json::json!({})),
        });
        let mut line = relay.to_string();
        line.push('\n');
        return Some((line, "statusline".into()));
    }

    if !agent.is_empty() {
        map.insert("coucou_agent".into(), serde_json::Value::String(agent.to_string()));
    }

    let raw_event = map
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| arg_event.to_string());

    let event = normalize_event(&raw_event);
    map.insert("hook_event_name".into(), serde_json::Value::String(event.clone()));

    normalize_tool_fields(map);

    for field in DROPPED_FIELDS {
        map.remove(*field);
    }

    let cwd_missing = map
        .get("cwd")
        .and_then(|v| v.as_str())
        .map(str::is_empty)
        .unwrap_or(true);
    if cwd_missing {
        if let Some(serde_json::Value::Array(roots)) = map.get("workspacePaths").or_else(|| map.get("workspace_roots")) {
            if let Some(first) = roots.first().and_then(|v| v.as_str()) {
                map.insert("cwd".into(), serde_json::Value::String(first.to_string()));
            }
        }
        if map.get("cwd").and_then(|v| v.as_str()).map(str::is_empty).unwrap_or(true) {
            if let Ok(cwd) = std::env::current_dir() {
                map.insert(
                    "cwd".into(),
                    serde_json::Value::String(cwd.to_string_lossy().to_string()),
                );
            }
        }
    }

    for (key, var) in [
        ("term_program", "TERM_PROGRAM"),
        ("wt_session", "WT_SESSION"),
        ("term_session_id", "TERM_SESSION_ID"),
        ("vscode_pid", "VSCODE_PID"),
        ("session_pid", "CLAUDE_CODE_SSE_PORT"),
    ] {
        if !map.contains_key(key) {
            let value = std::env::var(var).unwrap_or_default();
            map.insert(key.into(), serde_json::Value::String(value));
        }
    }

    truncate_strings(&mut payload);

    let mut line = payload.to_string();
    line.push('\n');
    Some((line, event))
}

/// Caps every string in the payload. A single Write can carry a whole file.
fn truncate_strings(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::String(s) => {
            if s.len() > MAX_FIELD_LEN {
                let mut end = MAX_FIELD_LEN;
                while end > 0 && !s.is_char_boundary(end) {
                    end -= 1;
                }
                s.truncate(end);
                s.push('…');
            }
        }
        serde_json::Value::Array(items) => items.iter_mut().for_each(truncate_strings),
        serde_json::Value::Object(map) => map.values_mut().for_each(truncate_strings),
        _ => {}
    }
}

/// Connect, send, and — for a permission request — wait for the island's word.
fn talk(payload: &str, waits_for_answer: bool) -> Option<String> {
    let mut pipe = connect()?;

    if pipe.write_all(payload.as_bytes()).is_err() {
        return None;
    }
    let _ = pipe.flush();

    if !waits_for_answer {
        return None;
    }

    let mut buf = Vec::new();
    let mut chunk = [0u8; 1024];
    loop {
        match pipe.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                if buf.contains(&b'\n') {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    let answer = String::from_utf8_lossy(&buf).trim().to_string();
    (!answer.is_empty()).then_some(answer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decision_json_matches_the_documented_shape() {
        assert_eq!(
            decision_json("allow").unwrap(),
            r#"{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}"#
        );
        assert_eq!(
            decision_json("deny").unwrap(),
            r#"{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Denied from Coucou"}}}"#
        );
        assert!(decision_json("always").unwrap().contains(r#""behavior":"allow""#));
    }

    #[test]
    fn normalizes_antigravity_and_gemini_events() {
        assert_eq!(normalize_event("PreInvocation"), "UserPromptSubmit");
        assert_eq!(normalize_event("PostInvocation"), "PostToolUse");
        assert_eq!(normalize_event("BeforeTool"), "PreToolUse");
        assert_eq!(normalize_event("AfterTool"), "PostToolUse");
    }

    #[test]
    fn long_strings_are_cut_on_a_char_boundary() {
        let mut v = serde_json::json!({ "tool_input": { "content": "é".repeat(4000) } });
        truncate_strings(&mut v);
        let s = v["tool_input"]["content"].as_str().unwrap();
        assert!(s.len() <= MAX_FIELD_LEN + 4);
        assert!(s.ends_with('…'));
    }
}
