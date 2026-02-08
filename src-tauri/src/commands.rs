use tauri::State;
use rusqlite::params;
use crate::database::{Database, Account, AccountHistory};

#[tauri::command]
pub fn get_accounts(db: State<Database>, search: Option<String>, sold_status: Option<String>) -> Result<Vec<Account>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut where_clauses = Vec::new();
    let mut params_vec: Vec<String> = Vec::new();

    // 搜索条件
    if let Some(s) = &search {
        if !s.is_empty() {
            let search_pattern = format!("%{}%", s);
            where_clauses.push("(email LIKE ? OR remark LIKE ?)".to_string());
            params_vec.push(search_pattern.clone());
            params_vec.push(search_pattern);
        }
    }

    // 出售状态筛选
    if let Some(status) = &sold_status {
        if status == "sold" || status == "unsold" {
            where_clauses.push("sold_status = ?".to_string());
            params_vec.push(status.clone());
        }
    }

    // 构建查询语句
    let query = if where_clauses.is_empty() {
        "SELECT id, email, password, recovery, secret, remark, status, sold_status, created_at, updated_at
         FROM accounts ORDER BY id DESC".to_string()
    } else {
        format!(
            "SELECT id, email, password, recovery, secret, remark, status, sold_status, created_at, updated_at
             FROM accounts WHERE {} ORDER BY id DESC",
            where_clauses.join(" AND ")
        )
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_totp_generation() {
        // 使用符合 RFC6238 标准的测试密钥（至少 128 位）
        let secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP".to_string();
        let result = generate_totp(secret);

        assert!(result.is_ok());
        let totp_result = result.unwrap();
        assert_eq!(totp_result.code.len(), 6);
        assert!(totp_result.remaining <= 30);
        assert!(totp_result.remaining >= 1);
    }

    #[test]
    fn test_totp_with_spaces() {
        // 测试带空格的密钥（应该被清理）
        let secret = "JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP".to_string();
        let result = generate_totp(secret);

        assert!(result.is_ok());
        let totp_result = result.unwrap();
        assert_eq!(totp_result.code.len(), 6);
    }

    #[test]
    fn test_totp_lowercase() {
        // 测试小写密钥（应该被转换为大写）
        let secret = "jbswy3dpehpk3pxpjbswy3dpehpk3pxp".to_string();
        let result = generate_totp(secret);

        assert!(result.is_ok());
    }

    #[test]
    fn test_totp_invalid_secret() {
        // 测试无效的密钥
        let secret = "invalid!@#".to_string();
        let result = generate_totp(secret);

        assert!(result.is_err());
    }

    #[test]
    fn test_totp_consistency() {
        // 同一秒内生成的 TOTP 应该一致
        let secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP".to_string();
        let result1 = generate_totp(secret.clone()).unwrap();
        let result2 = generate_totp(secret).unwrap();

        // 如果在同一个30秒窗口内，代码应该相同
        if result1.remaining == result2.remaining {
            assert_eq!(result1.code, result2.code);
        }
    }
}
