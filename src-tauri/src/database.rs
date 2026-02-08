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

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
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
        ).unwrap();
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
        ).unwrap();
        conn
    }

    #[test]
    fn test_create_account() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO accounts (email, password) VALUES (?1, ?2)",
            ["test@example.com", "password123"],
        ).unwrap();

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM accounts", [], |row| row.get(0)).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_update_account() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO accounts (email, password) VALUES (?1, ?2)",
            ["test@example.com", "password123"],
        ).unwrap();

        conn.execute(
            "UPDATE accounts SET password = ?1 WHERE email = ?2",
            ["newpassword", "test@example.com"],
        ).unwrap();

        let password: String = conn.query_row(
            "SELECT password FROM accounts WHERE email = ?1",
            ["test@example.com"],
            |row| row.get(0)
        ).unwrap();
        assert_eq!(password, "newpassword");
    }

    #[test]
    fn test_delete_account() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO accounts (email, password) VALUES (?1, ?2)",
            ["test@example.com", "password123"],
        ).unwrap();

        conn.execute("DELETE FROM accounts WHERE email = ?1", ["test@example.com"]).unwrap();

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM accounts", [], |row| row.get(0)).unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_history_tracking() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO accounts (email, password) VALUES (?1, ?2)",
            ["test@example.com", "password123"],
        ).unwrap();

        let account_id: i64 = conn.query_row(
            "SELECT id FROM accounts WHERE email = ?1",
            ["test@example.com"],
            |row| row.get(0)
        ).unwrap();

        conn.execute(
            "INSERT INTO account_history (account_id, field_name, old_value, new_value) VALUES (?1, ?2, ?3, ?4)",
            params![account_id, "password", "password123", "newpassword"],
        ).unwrap();

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM account_history WHERE account_id = ?1",
            [account_id],
            |row| row.get(0)
        ).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_unique_email_constraint() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO accounts (email, password) VALUES (?1, ?2)",
            ["test@example.com", "password123"],
        ).unwrap();

        let result = conn.execute(
            "INSERT INTO accounts (email, password) VALUES (?1, ?2)",
            ["test@example.com", "password456"],
        );

        assert!(result.is_err());
    }

    #[test]
    fn test_sold_status_toggle() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO accounts (email, password, sold_status) VALUES (?1, ?2, ?3)",
            ["test@example.com", "password123", "unsold"],
        ).unwrap();

        conn.execute(
            "UPDATE accounts SET sold_status = 'sold' WHERE email = ?1",
            ["test@example.com"],
        ).unwrap();

        let status: String = conn.query_row(
            "SELECT sold_status FROM accounts WHERE email = ?1",
            ["test@example.com"],
            |row| row.get(0)
        ).unwrap();
        assert_eq!(status, "sold");
    }
}
