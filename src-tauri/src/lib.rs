mod auth;
#[cfg(feature = "desktop")]
mod commands;
mod crypto;
mod database;
#[cfg(feature = "test-server")]
mod http_server;
mod key_manager;
mod totp;

pub use database::{init_database, Database};
#[cfg(feature = "test-server")]
pub use http_server::start_http_server;

#[cfg(feature = "test-server")]
use std::sync::Arc;
use std::sync::Mutex;

/// 启动 HTTP 测试服务器（不启动 Tauri GUI）
#[cfg(feature = "test-server")]
#[tokio::main]
pub async fn run_http_server(port: u16) {
    println!("Starting HTTP test server on http://localhost:{}", port);

    let conn = init_database().expect("Failed to initialize database");
    if let Err(e) = database::create_backup(&conn, Some("startup_http")) {
        log::warn!("HTTP 模式启动自动备份失败: {}", e);
    }
    let db = Arc::new(Database(Mutex::new(conn)));

    start_http_server(db, port)
        .await
        .expect("Failed to start HTTP server");
}

#[cfg(feature = "desktop")]
#[cfg_attr(all(feature = "desktop", mobile), tauri::mobile_entry_point)]
pub fn run() {
    let conn = init_database().expect("Failed to initialize database");
    if let Err(e) = database::create_backup(&conn, Some("startup")) {
        log::warn!("启动自动备份失败: {}", e);
    }
    let db = Database(Mutex::new(conn));

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(db)
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_accounts,
            commands::create_account,
            commands::update_account,
            commands::delete_account,
            commands::delete_all_accounts,
            commands::get_deleted_accounts,
            commands::restore_account,
            commands::purge_account,
            commands::purge_all_deleted,
            commands::create_backup,
            commands::list_backups,
            commands::restore_backup,
            commands::toggle_status,
            commands::toggle_sold_status,
            commands::get_account_history,
            commands::get_account_by_id,
            commands::check_auth,
            commands::login,
            commands::logout,
            commands::generate_totp,
            commands::batch_import,
            commands::export_database_sql,
            commands::export_accounts_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
