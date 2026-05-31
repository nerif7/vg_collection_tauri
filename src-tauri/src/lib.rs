use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt as _;

fn bytes_to_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = chunk.get(1).copied().unwrap_or(0) as usize;
        let b2 = chunk.get(2).copied().unwrap_or(0) as usize;
        out.push(TABLE[b0 >> 2]);
        out.push(TABLE[((b0 & 3) << 4) | (b1 >> 4)]);
        out.push(if chunk.len() > 1 { TABLE[((b1 & 15) << 2) | (b2 >> 6)] } else { b'=' });
        out.push(if chunk.len() > 2 { TABLE[b2 & 63] } else { b'=' });
    }
    String::from_utf8(out).unwrap()
}

#[tauri::command]
fn get_userdata_dir(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        return Ok(dir.to_string_lossy().into_owned());
    }
    #[cfg(not(target_os = "android"))]
    {
        drop(app);
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_dir = exe_path.parent().ok_or("exe has no parent directory")?;
        Ok(exe_dir.join("userdata").to_string_lossy().into_owned())
    }
}

#[tauri::command]
fn read_text_file(path: String) -> Result<Option<String>, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
    Ok(Some(content))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn export_backup(app: tauri::AppHandle, content: String) -> Result<bool, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("JSON Backup", &["json"])
        .set_file_name("vg_collection_backup.json")
        .blocking_save_file();

    let Some(path) = path else { return Ok(false) };
    let p = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(p, content).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
async fn import_backup(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("JSON Backup", &["json"])
        .blocking_pick_file();

    let Some(file_path) = path else { return Ok(None) };
    let bytes = app.fs().read(file_path).map_err(|e| e.to_string())?;
    let content = String::from_utf8(bytes).map_err(|e| e.to_string())?;
    Ok(Some(content))
}

#[tauri::command]
async fn download_image(url: String, path: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let res = client.get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    let b64 = bytes_to_base64(&bytes);
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, &b64).map_err(|e| e.to_string())?;
    Ok(b64)
}

#[tauri::command]
fn list_dir_files(path: String) -> Result<Vec<String>, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Ok(vec![]);
    }
    let entries = std::fs::read_dir(p).map_err(|e| e.to_string())?;
    let files: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    Ok(files)
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_file_mtime(path: String) -> Result<u64, String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let mtime = meta.modified().map_err(|e| e.to_string())?;
    let ms = mtime
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    Ok(ms)
}

#[tauri::command]
async fn start_oauth_listener(app: tauri::AppHandle) -> Result<u16, String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 4096];
            let n = stream.read(&mut buf).unwrap_or(0);
            let request = String::from_utf8_lossy(&buf[..n]);

            let url = request
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1))
                .map(|path| format!("http://127.0.0.1:{}{}", port, path))
                .unwrap_or_default();

            // Return a friendly page — prompts user to return to the app
            let body = "<html><body style='font-family:sans-serif;text-align:center;padding:60px'>\
                <h2>✅ Authentication successful</h2>\
                <p>Return to the <strong>VG Collection</strong> app to complete sign in.</p>\
                </body></html>";
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{}",
                body.len(), body
            );
            let _ = stream.write_all(response.as_bytes());

            // Save callback URL to file — JS polls this when app resumes (reliable on Android)
            use tauri::Manager;
            if let Ok(data_dir) = app.path().app_data_dir() {
                let pending = data_dir.join("userdata").join("pending-oauth.txt");
                if let Some(parent) = pending.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let _ = std::fs::write(&pending, &url);
            }

            // Also try event (works when app is in foreground/desktop)
            let _ = tauri::Emitter::emit(&app, "oauth-callback", url);
        }
    });

    Ok(port)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn read_pending_oauth() -> Result<Option<String>, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("no parent")?
        .to_path_buf();
    let pending = exe_dir.join("userdata").join("pending-oauth.txt");
    if !pending.exists() { return Ok(None); }
    let url = std::fs::read_to_string(&pending).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&pending);
    Ok(Some(url))
}

#[cfg(target_os = "android")]
#[tauri::command]
fn read_pending_oauth() -> Result<Option<String>, String> {
    Ok(None) // Android uses read_pending_oauth_android instead
}

#[tauri::command]
async fn read_pending_oauth_android(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri::Manager;
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let pending = data_dir.join("userdata").join("pending-oauth.txt");
    if !pending.exists() { return Ok(None); }
    let url = std::fs::read_to_string(&pending).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&pending);
    Ok(Some(url))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            get_userdata_dir,
            read_text_file,
            write_text_file,
            export_backup,
            import_backup,
            download_image,
            list_dir_files,
            delete_file,
            get_file_mtime,
            start_oauth_listener,
            read_pending_oauth,
            read_pending_oauth_android,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
