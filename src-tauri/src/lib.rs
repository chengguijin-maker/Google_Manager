mod database;
mod commands;

use database::{Database, init_database};
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let conn = init_database().expect("Failed to initialize database");
    let db = Database(Mutex::new(conn));

    tauri::Builder::default()
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
            commands::toggle_status,
            commands::toggle_sold_status,
            commands::get_account_history,
            commands::generate_totp,
            commands::batch_import,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
