use rusqlite::{Connection, Result};
use std::sync::Mutex;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Account {
    pub id: i64,
    pub email: String,
    pub password: String,
    pub recovery: Option<String>,
    pub secret: Option<String>,
    pub remark: Option<String>,
    pub status: String,
    pub sold_status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AccountHistory {
    pub id: i64,
    pub account_id: i64,
    pub field_name: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub changed_at: String,
}

pub struct Database(pub Mutex<Connection>);

pub fn get_db_path() -> PathBuf {
    let mut path = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("googlemanager");
    std::fs::create_dir_all(&path).ok();
    path.push("data.db");
    path
}

pub fn init_database() -> Result<Connection> {
    let conn = Connection::open(get_db_path())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            recovery TEXT,
            secret TEXT,
            remark TEXT,
            status TEXT DEFAULT 'pro',
            sold_status TEXT DEFAULT 'unsold',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS account_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            field_name TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )",
        [],
    )?;

    Ok(conn)
}
