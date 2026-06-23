use crate::models::cli_session::{CliSession, CliSessionSummary};
use crate::services::cli_session_storage::CliSessionStorage;
use tauri::State;

#[tauri::command]
pub async fn list_cli_sessions(
    storage: State<'_, CliSessionStorage>,
) -> Result<Vec<CliSessionSummary>, String> {
    storage.list_sessions().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_cli_session(
    session_id: String,
    storage: State<'_, CliSessionStorage>,
) -> Result<CliSession, String> {
    storage.load_session(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_cli_session(
    session_id: String,
    storage: State<'_, CliSessionStorage>,
) -> Result<(), String> {
    storage
        .delete_session(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_cli_sessions(
    query: String,
    storage: State<'_, CliSessionStorage>,
) -> Result<Vec<CliSessionSummary>, String> {
    storage
        .search_sessions(&query)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_cli_session(
    session_id: String,
    format: String,
    storage: State<'_, CliSessionStorage>,
) -> Result<String, String> {
    match format.as_str() {
        "markdown" => storage
            .export_session_markdown(&session_id)
            .map_err(|e| e.to_string()),
        "json" => {
            let session = storage.load_session(&session_id).map_err(|e| e.to_string())?;
            serde_json::to_string_pretty(&session).map_err(|e| e.to_string())
        }
        _ => Err("Invalid format, use 'markdown' or 'json'".to_string()),
    }
}
