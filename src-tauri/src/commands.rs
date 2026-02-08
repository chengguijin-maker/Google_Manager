use tauri::State;
use rusqlite::params;
use crate::database::{Database, Account, AccountHistory};

#[tauri::command]
pub fn get_accounts(db: State<Database>, search: Option<String>) -> Result<Vec<Account>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let (query, params_vec): (String, Vec<String>) = match &search {
        Some(s) if !s.is_empty() => {
            let search_pattern = format!("%{}%", s);
            (
                "SELECT id, email, password, recovery, secret, remark, status, sold_status, created_at, updated_at
                 FROM accounts WHERE email LIKE ?1 OR remark LIKE ?2 ORDER BY id DESC".to_string(),
                vec![search_pattern.clone(), search_pattern]
            )
        },
        _ => (
            "SELECT id, email, password, recovery, secret, remark, status, sold_status, created_at, updated_at
             FROM accounts ORDER BY id DESC".to_string(),
            vec![]
        ),
    };

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter()
        .map(|p| p as &dyn rusqlite::ToSql)
        .collect();

    let accounts = stmt.query_map(params_refs.as_slice(), |row| {
        Ok(Account {
            id: row.get(0)?,
            email: row.get(1)?,
            password: row.get(2)?,
            recovery: row.get(3)?,
            secret: row.get(4)?,
            remark: row.get(5)?,
            status: row.get(6)?,
            sold_status: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?;

    accounts.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_account(db: State<Database>, account: Account) -> Result<Account, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO accounts (email, password, recovery, secret, remark, status, sold_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![account.email, account.password, account.recovery, account.secret, account.remark, "pro", "unsold"],
    ).map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    let mut stmt = conn.prepare("SELECT id, email, password, recovery, secret, remark, status, sold_status, created_at, updated_at FROM accounts WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    stmt.query_row([id], |row| {
        Ok(Account {
            id: row.get(0)?,
            email: row.get(1)?,
            password: row.get(2)?,
            recovery: row.get(3)?,
            secret: row.get(4)?,
            remark: row.get(5)?,
            status: row.get(6)?,
            sold_status: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_account(db: State<Database>, id: i64, account: Account) -> Result<Account, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // 获取旧账号数据用于历史记录
    let old: Account = conn.query_row(
        "SELECT id, email, password, recovery, secret, remark, status, sold_status, created_at, updated_at FROM accounts WHERE id = ?1",
        [id],
        |row| Ok(Account {
            id: row.get(0)?,
            email: row.get(1)?,
            password: row.get(2)?,
            recovery: row.get(3)?,
            secret: row.get(4)?,
            remark: row.get(5)?,
            status: row.get(6)?,
            sold_status: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    ).map_err(|e| e.to_string())?;

    // 记录变更历史
    if old.password != account.password {
        conn.execute(
            "INSERT INTO account_history (account_id, field_name, old_value, new_value) VALUES (?1, ?2, ?3, ?4)",
            params![id, "password", old.password, account.password],
        ).ok();
    }
    if old.secret != account.secret {
        conn.execute(
            "INSERT INTO account_history (account_id, field_name, old_value, new_value) VALUES (?1, ?2, ?3, ?4)",
            params![id, "secret", old.secret, account.secret],
        ).ok();
    }
    if old.recovery != account.recovery {
        conn.execute(
            "INSERT INTO account_history (account_id, field_name, old_value, new_value) VALUES (?1, ?2, ?3, ?4)",
            params![id, "recovery", old.recovery, account.recovery],
        ).ok();
    }

    conn.execute(
        "UPDATE accounts SET email = ?1, password = ?2, recovery = ?3, secret = ?4, remark = ?5, updated_at = CURRENT_TIMESTAMP WHERE id = ?6",
        params![account.email, account.password, account.recovery, account.secret, account.remark, id],
    ).map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, email, password, recovery, secret, remark, status, sold_status, created_at, updated_at FROM accounts WHERE id = ?1",
        [id],
        |row| Ok(Account {
            id: row.get(0)?,
            email: row.get(1)?,
            password: row.get(2)?,
            recovery: row.get(3)?,
            secret: row.get(4)?,
            remark: row.get(5)?,
            status: row.get(6)?,
            sold_status: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_account(db: State<Database>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM accounts WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn toggle_sold_status(db: State<Database>, id: i64) -> Result<Account, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let current: String = conn.query_row(
        "SELECT sold_status FROM accounts WHERE id = ?1",
        [id],
        |row| row.get(0)
    ).map_err(|e| e.to_string())?;

    let new_status = if current == "sold" { "unsold" } else { "sold" };

    // 记录历史
    conn.execute(
        "INSERT INTO account_history (account_id, field_name, old_value, new_value) VALUES (?1, ?2, ?3, ?4)",
        params![id, "sold_status", current, new_status],
    ).ok();

    conn.execute(
        "UPDATE accounts SET sold_status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![new_status, id],
    ).map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, email, password, recovery, secret, remark, status, sold_status, created_at, updated_at FROM accounts WHERE id = ?1",
        [id],
        |row| Ok(Account {
            id: row.get(0)?,
            email: row.get(1)?,
            password: row.get(2)?,
            recovery: row.get(3)?,
            secret: row.get(4)?,
            remark: row.get(5)?,
            status: row.get(6)?,
            sold_status: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_status(db: State<Database>, id: i64) -> Result<Account, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let current: String = conn.query_row(
        "SELECT status FROM accounts WHERE id = ?1",
        [id],
        |row| row.get(0)
    ).map_err(|e| e.to_string())?;

    let new_status = if current == "pro" { "inactive" } else { "pro" };

    // 记录历史
    conn.execute(
        "INSERT INTO account_history (account_id, field_name, old_value, new_value) VALUES (?1, ?2, ?3, ?4)",
        params![id, "status", current, new_status],
    ).ok();

    conn.execute(
        "UPDATE accounts SET status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![new_status, id],
    ).map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, email, password, recovery, secret, remark, status, sold_status, created_at, updated_at FROM accounts WHERE id = ?1",
        [id],
        |row| Ok(Account {
            id: row.get(0)?,
            email: row.get(1)?,
            password: row.get(2)?,
            recovery: row.get(3)?,
            secret: row.get(4)?,
            remark: row.get(5)?,
            status: row.get(6)?,
            sold_status: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_account_history(db: State<Database>, account_id: i64) -> Result<Vec<AccountHistory>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, account_id, field_name, old_value, new_value, changed_at FROM account_history WHERE account_id = ?1 ORDER BY changed_at DESC"
    ).map_err(|e| e.to_string())?;

    let history = stmt.query_map([account_id], |row| {
        Ok(AccountHistory {
            id: row.get(0)?,
            account_id: row.get(1)?,
            field_name: row.get(2)?,
            old_value: row.get(3)?,
            new_value: row.get(4)?,
            changed_at: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    history.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct TotpResult {
    pub code: String,
    pub remaining: u32,
}

#[tauri::command]
pub fn generate_totp(secret: String) -> Result<TotpResult, String> {
    use totp_rs::{Algorithm, TOTP, Secret};
    use std::time::{SystemTime, UNIX_EPOCH};

    let secret_clean = secret.replace(" ", "").to_uppercase();

    let totp = TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        Secret::Encoded(secret_clean).to_bytes().map_err(|e| e.to_string())?,
    ).map_err(|e| e.to_string())?;

    let code = totp.generate_current().map_err(|e| e.to_string())?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    let remaining = 30 - (now % 30) as u32;

    Ok(TotpResult { code, remaining })
}

#[tauri::command]
pub fn batch_import(db: State<Database>, accounts: Vec<Account>) -> Result<BatchImportResult, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut success_count = 0;
    let mut fail_count = 0;

    for account in accounts {
        let result = conn.execute(
            "INSERT INTO accounts (email, password, recovery, secret, remark, status, sold_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![account.email, account.password, account.recovery, account.secret, account.remark, "pro", "unsold"],
        );

        match result {
            Ok(_) => success_count += 1,
            Err(_) => fail_count += 1,
        }
    }

    Ok(BatchImportResult { success_count, fail_count })
}

#[derive(serde::Serialize)]
pub struct BatchImportResult {
    pub success_count: i32,
    pub fail_count: i32,
}
