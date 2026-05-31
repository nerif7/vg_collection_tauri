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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_userdata_dir,
            read_text_file,
            write_text_file,
            export_backup,
            import_backup,
            download_image,
            list_dir_files,
            delete_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
