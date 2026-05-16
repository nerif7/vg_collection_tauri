use tauri_plugin_dialog::DialogExt;

#[tauri::command]
fn get_userdata_dir() -> Result<String, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path.parent().ok_or("exe has no parent directory")?;
    Ok(exe_dir.join("userdata").to_string_lossy().into_owned())
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

    let Some(path) = path else { return Ok(None) };
    let p = path.into_path().map_err(|e| e.to_string())?;
    let content = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
    Ok(Some(content))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_userdata_dir,
            read_text_file,
            write_text_file,
            export_backup,
            import_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
