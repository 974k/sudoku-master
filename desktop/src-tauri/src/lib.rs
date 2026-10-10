// Sudoku Master for Windows (Tauri + Microsoft Edge WebView2).
//
// Shows the same game as the web build (copied into ../app) in a native window.
// Privacy:
//   * the page's Content Security Policy only allows Tauri's own IPC, so the
//     game cannot reach the internet; navigation away from the game is refused;
//   * no telemetry, crash reporting or background update checks: the updater
//     runs only when the player clicks Settings → Check for updates;
//   * updates are signed: an installer only runs if its signature matches the
//     public key built into this app.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{Map, Value, json};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, State, WebviewWindowBuilder};
use tauri_plugin_updater::{Update, UpdaterExt};

const RELEASES_PAGE: &str = "https://github.com/974k/sudoku-master/releases/latest";
/// Written once the progress saved by the 1.0.x (Electron) app has been offered
/// to the page, so it is never imported twice (e.g. after "Delete all data").
const LEGACY_MARKER: &str = "legacy-imported";

#[derive(Default)]
struct Updates {
    pending: Mutex<Option<Update>>,
    bytes: Mutex<Option<Vec<u8>>>,
    progress: Mutex<Option<u32>>,
}

fn version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

// ---------------------------------------------------------------------------
// commands used by the bridge in init.js

#[tauri::command]
fn desktop_info(app: AppHandle) -> Value {
    json!({ "version": version(&app), "portable": false, "packaged": !cfg!(debug_assertions) })
}

#[tauri::command]
async fn update_check(app: AppHandle, state: State<'_, Updates>) -> Result<Value, String> {
    let current = version(&app);
    let found = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    Ok(match found {
        Some(update) => {
            let version = update.version.clone();
            *state.pending.lock().unwrap() = Some(update);
            json!({ "status": "available", "current": current, "version": version })
        }
        None => json!({ "status": "latest", "current": current }),
    })
}

#[tauri::command]
async fn update_download(state: State<'_, Updates>) -> Result<Value, String> {
    let update = state.pending.lock().unwrap().clone().ok_or("No update to download")?;
    let progress = &state.progress;
    *progress.lock().unwrap() = Some(0);
    let mut received: u64 = 0;
    let bytes = update
        .download(
            |chunk, total| {
                received += chunk as u64;
                if let Some(total) = total.filter(|t| *t > 0) {
                    *progress.lock().unwrap() = Some((received * 100 / total).min(100) as u32);
                }
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    *state.bytes.lock().unwrap() = Some(bytes);
    Ok(json!({ "status": "ready" }))
}

#[tauri::command]
fn update_install(state: State<'_, Updates>) -> Result<(), String> {
    let update = state.pending.lock().unwrap().take().ok_or("No update to install")?;
    let bytes = state.bytes.lock().unwrap().take().ok_or("The update has not been downloaded")?;
    // Verifies the signature, then hands over to the installer, which closes
    // this app and starts the new version.
    update.install(bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_progress(state: State<'_, Updates>) -> Option<u32> {
    *state.progress.lock().unwrap()
}

#[tauri::command]
fn open_releases_page() {
    let _ = std::process::Command::new("explorer").arg(RELEASES_PAGE).spawn();
}

#[tauri::command]
fn legacy_import_done(app: AppHandle) {
    if let Ok(dir) = app.path().app_local_data_dir() {
        let _ = fs::create_dir_all(&dir);
        let _ = fs::write(dir.join(LEGACY_MARKER), b"1");
    }
}

/// Opt-in self-test (SUDOKU_SMOKE_TEST=<report path>): writes the report from smoke.js.
#[tauri::command]
fn smoke_report(app: AppHandle, report: Value) {
    let Some(path) = std::env::var_os("SUDOKU_SMOKE_TEST") else { return };
    let mut path = PathBuf::from(path);
    if std::env::var_os("SUDOKU_SMOKE_UPDATE").is_some() {
        path = PathBuf::from(format!("{}.{}.json", path.display(), version(&app)));
    }
    let _ = fs::write(&path, serde_json::to_string_pretty(&report).unwrap_or_default());
    // While an update installs, the installer closes the app itself.
    if !report.get("installing").and_then(Value::as_bool).unwrap_or(false) {
        app.exit(0);
    }
}

// ---------------------------------------------------------------------------
// progress saved by the 1.0.x (Electron) app

fn legacy_storage(app: &AppHandle) -> Option<Map<String, Value>> {
    if app.path().app_local_data_dir().ok()?.join(LEGACY_MARKER).exists() {
        return None;
    }
    let dir = std::env::var_os("SUDOKU_LEGACY_DIR").map(PathBuf::from).or_else(|| {
        std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join("Sudoku Master").join("Local Storage").join("leveldb"))
    })?;
    read_chromium_local_storage(&dir, "app://sudoku").ok().filter(|m| !m.is_empty())
}

/// Reads the game's keys from Chromium's localStorage database (LevelDB),
/// working on a temporary copy so the original is never modified.
fn read_chromium_local_storage(dir: &Path, origin: &str) -> Result<Map<String, Value>, String> {
    if !dir.is_dir() {
        return Ok(Map::new());
    }
    let tmp = std::env::temp_dir().join(format!("sudoku-master-legacy-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_name() != "LOCK" && entry.path().is_file() {
            fs::copy(entry.path(), tmp.join(entry.file_name())).map_err(|e| e.to_string())?;
        }
    }
    let result = read_keys(&tmp, origin);
    let _ = fs::remove_dir_all(&tmp);
    result
}

fn read_keys(db_dir: &Path, origin: &str) -> Result<Map<String, Value>, String> {
    use rusty_leveldb::LdbIterator;
    let mut options = rusty_leveldb::Options::default();
    options.create_if_missing = false;
    let mut db = rusty_leveldb::DB::open(db_dir, options).map_err(|e| e.to_string())?;
    // Keys look like "_" + origin + "\0" + encoded key.
    let mut prefix = b"_".to_vec();
    prefix.extend_from_slice(origin.as_bytes());
    prefix.push(0);
    let mut out = Map::new();
    let mut it = db.new_iter().map_err(|e| e.to_string())?;
    while let Some((key, value)) = it.next() {
        let Some(rest) = key.strip_prefix(prefix.as_slice()) else { continue };
        if let (Some(k), Some(v)) = (decode_chromium_string(rest), decode_chromium_string(&value)) {
            if k.starts_with("sudoku-master:") {
                out.insert(k, Value::String(v));
            }
        }
    }
    Ok(out)
}

/// Chromium tags stored strings with one byte: 0 = UTF-16LE, 1 = Latin-1.
fn decode_chromium_string(bytes: &[u8]) -> Option<String> {
    let (&tag, data) = bytes.split_first()?;
    match tag {
        0 if data.len() % 2 == 0 => {
            let units: Vec<u16> = data.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
            String::from_utf16(&units).ok()
        }
        1 => Some(data.iter().map(|&b| b as char).collect()),
        _ => None,
    }
}

// ---------------------------------------------------------------------------

fn init_script(legacy: Option<&Map<String, Value>>) -> String {
    let data = legacy.map(|m| Value::Object(m.clone()).to_string()).unwrap_or_else(|| "null".into());
    include_str!("init.js").replace("__LEGACY_DATA__", &data)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let smoke = std::env::var_os("SUDOKU_SMOKE_TEST").is_some();
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Updates::default())
        .invoke_handler(tauri::generate_handler![
            desktop_info,
            update_check,
            update_download,
            update_install,
            update_progress,
            open_releases_page,
            legacy_import_done,
            smoke_report
        ])
        .setup(move |app| {
            let legacy = legacy_storage(app.handle());
            let config = app.config().app.windows.first().cloned().ok_or("missing window config")?;
            let smoke_js = include_str!("smoke.js").replace(
                "__MODE__",
                &serde_json::to_string(&std::env::var("SUDOKU_SMOKE_UPDATE").unwrap_or_default()).unwrap_or_default(),
            );
            WebviewWindowBuilder::from_config(app.handle(), &config)?
                .initialization_script(init_script(legacy.as_ref()))
                // only the game itself may be shown in the window
                .on_navigation(|url| url.host_str() == Some("tauri.localhost") || url.scheme() == "tauri")
                .on_page_load(move |window, payload| {
                    if payload.event() != PageLoadEvent::Finished {
                        return;
                    }
                    if smoke {
                        let _ = window.eval(&smoke_js); // the self-test runs without showing a window
                    } else {
                        let _ = window.show();
                    }
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Sudoku Master");
}

#[cfg(test)]
mod tests {
    use super::decode_chromium_string;

    #[test]
    fn decodes_chromium_strings() {
        assert_eq!(decode_chromium_string(b"\x01sudoku-master:profile").as_deref(), Some("sudoku-master:profile"));
        assert_eq!(decode_chromium_string(&[0, b'h', 0, b'i', 0]).as_deref(), Some("hi"));
        assert_eq!(decode_chromium_string(&[0, b'h']), None);
        assert_eq!(decode_chromium_string(b""), None);
    }
}
