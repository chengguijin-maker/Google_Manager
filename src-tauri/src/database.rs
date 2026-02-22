use crate::crypto;
use crate::key_manager;
use rusqlite::{params, Connection, Result, Row};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Account {
    pub id: i64,
    pub email: String,
    pub password: String,
    pub recovery: Option<String>,
    pub phone: Option<String>,
    pub secret: Option<String>,
    pub reg_year: Option<String>,
    pub country: Option<String>,
    pub group_name: Option<String>,
    pub remark: Option<String>,
    pub status: String,
    pub sold_status: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AccountInput {
    pub email: String,
    pub password: String,
    pub recovery: Option<String>,
    pub phone: Option<String>,
    pub secret: Option<String>,
    pub reg_year: Option<String>,
    pub country: Option<String>,
    pub group_name: Option<String>,
    pub remark: Option<String>,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupInfo {
    pub name: String,
    pub size_bytes: u64,
    pub created_at: String,
    pub checksum: Option<String>,
}

pub struct Database(pub Mutex<Connection>);

/// SELECT 列列表常量
pub const ACCOUNT_COLUMNS: &str = "id, email, password, recovery, phone, secret, reg_year, country, group_name, remark, status, sold_status, created_at, updated_at, deleted_at";

/// 需要追踪历史变更的字段（敏感字段 password/secret 不记录明文历史）
const TRACKED_FIELDS: &[(&str, fn(&Account) -> Option<&str>)] = &[
    ("email", |a| Some(&a.email)),
    ("recovery", |a| a.recovery.as_deref()),
    ("phone", |a| a.phone.as_deref()),
    ("reg_year", |a| a.reg_year.as_deref()),
    ("country", |a| a.country.as_deref()),
    ("group_name", |a| a.group_name.as_deref()),
    ("remark", |a| a.remark.as_deref()),
];

fn master_key() -> Result<[u8; 32], String> {
    key_manager::get_master_key()
}

fn data_decode_error(account_id: i64, field: &str, reason: &str) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        rusqlite::types::Type::Text,
        Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("账号 {} 字段 {} 解密失败: {}", account_id, field, reason),
        )),
    )
}

/// 从 Row 映射到 Account（解密 password 和 secret 字段）
pub fn map_row_to_account(row: &Row) -> rusqlite::Result<Account> {
    let key = master_key().map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(std::io::ErrorKind::Other, e)),
        )
    })?;

    let id: i64 = row.get("id")?;

    let encrypted_secret: Option<String> = row.get("secret")?;
    let secret = match encrypted_secret {
        Some(ref s) if !s.is_empty() => {
            Some(crypto::decrypt_secret(s, &key).map_err(|e| data_decode_error(id, "secret", &e))?)
        }
        _ => None,
    };

    // 解密密码
    let raw_password: String = row.get("password")?;
    let password = crypto::decrypt_secret(&raw_password, &key)
        .map_err(|e| data_decode_error(id, "password", &e))?;

    Ok(Account {
        id,
        email: row.get("email")?,
        password,
        recovery: row.get("recovery")?,
        phone: row.get("phone")?,
        secret,
        reg_year: row.get("reg_year")?,
        country: row.get("country")?,
        group_name: row.get("group_name")?,
        remark: row.get("remark")?,
        status: row.get("status")?,
        sold_status: row.get("sold_status")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        deleted_at: row.get("deleted_at")?,
    })
}

/// 通过 ID 查询单个账号
pub fn get_account_by_id(conn: &Connection, id: i64) -> Result<Account, String> {
    conn.query_row(
        &format!(
            "SELECT {} FROM accounts WHERE id = ?1 AND deleted_at IS NULL",
            ACCOUNT_COLUMNS
        ),
        [id],
        map_row_to_account,
    )
    .map_err(|e| e.to_string())
}

/// 查询账号列表（支持搜索和过滤）
pub fn query_accounts(
    conn: &Connection,
    search: Option<&str>,
    sold_status: Option<&str>,
) -> Result<Vec<Account>, String> {
    let mut where_clauses = vec!["deleted_at IS NULL".to_string()];
    let mut params_vec: Vec<String> = Vec::new();

    if let Some(s) = search {
        if !s.is_empty() {
            let pattern = format!("%{}%", s);
            where_clauses.push("(email LIKE ? OR remark LIKE ?)".to_string());
            params_vec.push(pattern.clone());
            params_vec.push(pattern);
        }
    }

    if let Some(status) = sold_status {
        if status == "sold" || status == "unsold" {
            where_clauses.push("sold_status = ?".to_string());
            params_vec.push(status.to_string());
        }
    }

    let query = format!(
        "SELECT {} FROM accounts WHERE {} ORDER BY id DESC",
        ACCOUNT_COLUMNS,
        where_clauses.join(" AND ")
    );

    let mut stmt = conn.prepare_cached(&query).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|p| p as &dyn rusqlite::ToSql)
        .collect();

    let rows = stmt
        .query_map(params_refs.as_slice(), map_row_to_account)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// 按 ID 列表查询账号
pub fn query_accounts_by_ids(conn: &Connection, ids: &[i64]) -> Result<Vec<Account>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
    let query = format!(
        "SELECT {} FROM accounts WHERE id IN ({}) AND deleted_at IS NULL ORDER BY id DESC",
        ACCOUNT_COLUMNS,
        placeholders.join(", ")
    );
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::ToSql> =
        ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
    let rows = stmt
        .query_map(params_refs.as_slice(), map_row_to_account)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// 导出查询：按 ID 列表或搜索/过滤条件
pub fn query_accounts_for_export(
    conn: &Connection,
    account_ids: Option<&[i64]>,
    search: Option<&str>,
    sold_status: Option<&str>,
) -> Result<Vec<Account>, String> {
    if let Some(ids) = account_ids.filter(|ids| !ids.is_empty()) {
        query_accounts_by_ids(conn, ids)
    } else {
        query_accounts(conn, search, sold_status)
    }
}

/// 查询回收站账号
pub fn query_deleted_accounts(conn: &Connection) -> Result<Vec<Account>, String> {
    let query = format!(
        "SELECT {} FROM accounts WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC",
        ACCOUNT_COLUMNS
    );
    let mut stmt = conn.prepare_cached(&query).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], map_row_to_account)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// 创建账号
pub fn create_account(conn: &Connection, input: &AccountInput) -> Result<Account, String> {
    let key = master_key()?;
    // AES 加密密码
    let encrypted_password = crypto::encrypt_secret(&input.password, &key)?;

    // 加密 secret
    let encrypted_secret = match &input.secret {
        Some(secret) if !secret.is_empty() => Some(crypto::encrypt_secret(secret, &key)?),
        _ => None,
    };

    conn.execute(
        "INSERT INTO accounts (email, password, recovery, phone, secret, reg_year, country, group_name, remark, status, sold_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![input.email, encrypted_password, input.recovery, input.phone, encrypted_secret, input.reg_year, input.country, input.group_name, input.remark, "inactive", "unsold"],
    ).map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    get_account_by_id(conn, id)
}

/// 更新账号（含历史追踪）
pub fn update_account(conn: &Connection, id: i64, input: &AccountInput) -> Result<Account, String> {
    let old = get_account_by_id(conn, id)?;
    let key = master_key()?;

    // AES 加密密码
    let encrypted_password = crypto::encrypt_secret(&input.password, &key)?;

    // 加密 secret
    let encrypted_secret = match &input.secret {
        Some(secret) if !secret.is_empty() => Some(crypto::encrypt_secret(secret, &key)?),
        _ => None,
    };

    // 构造新账号用于字段对比
    let new_account = Account {
        id,
        email: input.email.clone(),
        password: input.password.clone(),
        recovery: input.recovery.clone(),
        phone: input.phone.clone(),
        secret: input.secret.clone(), // 历始 secret（用于历史记录）
        reg_year: input.reg_year.clone(),
        country: input.country.clone(),
        group_name: input.group_name.clone(),
        remark: input.remark.clone(),
        status: old.status.clone(),
        sold_status: old.sold_status.clone(),
        created_at: old.created_at.clone(),
        updated_at: old.updated_at.clone(),
        deleted_at: old.deleted_at.clone(),
    };

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("开启事务失败: {}", e))?;
    record_field_changes(&tx, id, &old, &new_account)?;
    tx.execute(
        "UPDATE accounts SET email = ?1, password = ?2, recovery = ?3, phone = ?4, secret = ?5, reg_year = ?6, country = ?7, group_name = ?8, remark = ?9, updated_at = CURRENT_TIMESTAMP WHERE id = ?10 AND deleted_at IS NULL",
        params![input.email, encrypted_password, input.recovery, input.phone, encrypted_secret, input.reg_year, input.country, input.group_name, input.remark, id],
    ).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    get_account_by_id(conn, id)
}

/// 删除账号
pub fn delete_account(conn: &Connection, id: i64) -> Result<(), String> {
    let changed = conn
        .execute(
            "UPDATE accounts SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?1 AND deleted_at IS NULL",
            [id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("账号不存在或已删除".to_string());
    }
    Ok(())
}

/// 删除所有账号
pub fn delete_all_accounts(conn: &Connection) -> Result<usize, String> {
    create_backup(conn, Some("before_delete_all"))?;
    let deleted = conn
        .execute(
            "UPDATE accounts SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL",
            [],
        )
        .map_err(|e| e.to_string())?;
    Ok(deleted)
}

/// 恢复账号
pub fn restore_account(conn: &Connection, id: i64) -> Result<Account, String> {
    let changed = conn
        .execute(
            "UPDATE accounts SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?1 AND deleted_at IS NOT NULL",
            [id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("账号不存在或未删除".to_string());
    }
    get_account_by_id(conn, id)
}

/// 永久删除账号
pub fn purge_account(conn: &Connection, id: i64) -> Result<(), String> {
    let changed = conn
        .execute(
            "DELETE FROM accounts WHERE id = ?1 AND deleted_at IS NOT NULL",
            [id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("账号不存在或未进入回收站".to_string());
    }
    Ok(())
}

/// 清空回收站
pub fn purge_all_deleted(conn: &Connection) -> Result<usize, String> {
    conn.execute("DELETE FROM accounts WHERE deleted_at IS NOT NULL", [])
        .map_err(|e| e.to_string())
}

/// 切换 status（inactive/pro）
pub fn toggle_status(conn: &Connection, id: i64) -> Result<Account, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("开启事务失败: {}", e))?;
    let current: String = tx
        .query_row(
            "SELECT status FROM accounts WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let new_status = if current == "pro" { "inactive" } else { "pro" };
    tx.execute(
        "INSERT INTO account_history (account_id, field_name, old_value, new_value) VALUES (?1, ?2, ?3, ?4)",
        params![id, "status", current, new_status],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE accounts SET status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2 AND deleted_at IS NULL",
        params![new_status, id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    get_account_by_id(conn, id)
}

/// 切换 sold_status（unsold/sold）
pub fn toggle_sold_status(conn: &Connection, id: i64) -> Result<Account, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("开启事务失败: {}", e))?;
    let current: String = tx
        .query_row(
            "SELECT sold_status FROM accounts WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let new_status = if current == "sold" { "unsold" } else { "sold" };
    tx.execute(
        "INSERT INTO account_history (account_id, field_name, old_value, new_value) VALUES (?1, ?2, ?3, ?4)",
        params![id, "sold_status", current, new_status],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE accounts SET sold_status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2 AND deleted_at IS NULL",
        params![new_status, id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    get_account_by_id(conn, id)
}

/// 批量导入（使用事务保证原子性）
pub fn batch_import(conn: &Connection, accounts: &[AccountInput]) -> Result<(i32, i32), String> {
    let mut success_count = 0i32;
    let mut failed_count = 0i32;
    let key = master_key()?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("开始事务失败: {}", e))?;
    let mut insert_stmt = tx
        .prepare_cached(
            "INSERT INTO accounts (email, password, recovery, phone, secret, reg_year, country, group_name, remark, status, sold_status, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL)"
        )
        .map_err(|e| format!("准备批量导入语句失败: {}", e))?;

    for account in accounts {
        // AES 加密密码
        let encrypted_password = match crypto::encrypt_secret(&account.password, &key) {
            Ok(h) => h,
            Err(e) => {
                log::warn!("密码加密失败 (email={}): {}", account.email, e);
                failed_count += 1;
                continue;
            }
        };

        // 加密 secret
        let encrypted_secret = match &account.secret {
            Some(secret) if !secret.is_empty() => match crypto::encrypt_secret(secret, &key) {
                Ok(encrypted) => Some(encrypted),
                Err(e) => {
                    log::warn!("Secret 加密失败 (email={}): {}", account.email, e);
                    failed_count += 1;
                    continue;
                }
            },
            _ => None,
        };

        let result = insert_stmt.execute(params![
            account.email,
            encrypted_password,
            account.recovery,
            account.phone,
            encrypted_secret,
            account.reg_year,
            account.country,
            account.group_name,
            account.remark,
            "inactive",
            "unsold"
        ]);
        match result {
            Ok(_) => success_count += 1,
            Err(e) => {
                log::warn!("批量导入单条失败 (email={}): {}", account.email, e);
                failed_count += 1;
            }
        }
    }

    drop(insert_stmt);
    tx.commit()
        .map_err(|e| format!("提交事务失败（已回滚）: {}", e))?;

    Ok((success_count, failed_count))
}

/// 获取账号历史
pub fn get_account_history(
    conn: &Connection,
    account_id: i64,
) -> Result<Vec<AccountHistory>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, account_id, field_name, old_value, new_value, changed_at FROM account_history WHERE account_id = ?1 ORDER BY changed_at DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([account_id], |row| {
            Ok(AccountHistory {
                id: row.get(0)?,
                account_id: row.get(1)?,
                field_name: row.get(2)?,
                old_value: row.get(3)?,
                new_value: row.get(4)?,
                changed_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// 记录字段变更历史（循环对比所有追踪字段）
fn record_field_changes(
    conn: &Connection,
    account_id: i64,
    old: &Account,
    new: &Account,
) -> Result<(), String> {
    for &(field_name, getter) in TRACKED_FIELDS {
        let old_val = getter(old);
        let new_val = getter(new);
        if old_val != new_val {
            conn.execute(
                "INSERT INTO account_history (account_id, field_name, old_value, new_value) VALUES (?1, ?2, ?3, ?4)",
                params![account_id, field_name, old_val, new_val],
            )
            .map_err(|e| format!("记录字段变更失败 (account_id={}, field={}): {}", account_id, field_name, e))?;
        }
    }
    Ok(())
}

fn data_dir() -> PathBuf {
    let mut path = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("googlemanager");
    if let Err(e) = fs::create_dir_all(&path) {
        log::error!("创建数据目录失败: {}", e);
    }
    path
}

pub fn get_db_path() -> PathBuf {
    let mut path = data_dir();
    path.push("data.db");
    path
}

fn backups_dir() -> Result<PathBuf, String> {
    let mut path = data_dir();
    path.push("backups");
    fs::create_dir_all(&path).map_err(|e| format!("创建备份目录失败: {}", e))?;
    Ok(path)
}

fn sanitize_backup_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("备份名称不能为空".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return Err("备份名称非法".to_string());
    }
    if !trimmed.ends_with(".db") {
        return Err("备份文件必须是 .db".to_string());
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
    {
        return Err("备份名称包含非法字符".to_string());
    }
    Ok(trimmed.to_string())
}

fn sanitize_reason(reason: Option<&str>) -> String {
    let mut cleaned = reason
        .unwrap_or("manual")
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect::<String>();
    while cleaned.contains("__") {
        cleaned = cleaned.replace("__", "_");
    }
    cleaned.trim_matches('_').to_string()
}

fn compute_file_sha256(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("读取备份失败: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("读取备份失败: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn cleanup_old_backups(dir: &Path, keep: usize) -> Result<(), String> {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|e| format!("读取备份目录失败: {}", e))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .path()
                .extension()
                .map(|ext| ext == "db")
                .unwrap_or(false)
        })
        .collect();

    entries.sort_by_key(|entry| {
        entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
    });
    entries.reverse();

    for old in entries.into_iter().skip(keep) {
        if let Err(e) = fs::remove_file(old.path()) {
            log::warn!("清理旧备份失败 ({}): {}", old.path().display(), e);
        }
        if let Err(e) = fs::remove_file(old.path().with_extension("json")) {
            if e.kind() != std::io::ErrorKind::NotFound {
                log::warn!(
                    "清理旧备份清单失败 ({}): {}",
                    old.path().with_extension("json").display(),
                    e
                );
            }
        }
    }
    Ok(())
}

/// 创建一致性备份（WAL 模式下使用 VACUUM INTO）
pub fn create_backup(conn: &Connection, reason: Option<&str>) -> Result<PathBuf, String> {
    match conn.path() {
        None => return Ok(PathBuf::from(":memory:backup_skipped")),
        Some(path) if path.is_empty() || path == ":memory:" => {
            return Ok(PathBuf::from(":memory:backup_skipped"));
        }
        _ => {}
    }

    let dir = backups_dir()?;
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S%.3f");
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let suffix = sanitize_reason(reason);
    let file_name = if suffix.is_empty() {
        format!("data_{}_{}.db", timestamp, nanos)
    } else {
        format!("data_{}_{}_{}.db", timestamp, suffix, nanos)
    };
    let backup_path = dir.join(file_name);
    if backup_path.exists() {
        let _ = fs::remove_file(&backup_path);
    }
    let escaped = backup_path.to_string_lossy().replace('\'', "''");

    conn.execute_batch("PRAGMA wal_checkpoint(FULL);")
        .map_err(|e| format!("WAL checkpoint 失败: {}", e))?;
    conn.execute_batch(&format!("VACUUM INTO '{}';", escaped))
        .map_err(|e| format!("创建备份失败: {}", e))?;

    let checksum = compute_file_sha256(&backup_path)?;
    let metadata = fs::metadata(&backup_path).map_err(|e| format!("读取备份信息失败: {}", e))?;
    let manifest = serde_json::json!({
        "created_at": chrono::Local::now().to_rfc3339(),
        "size_bytes": metadata.len(),
        "checksum": checksum,
    });
    let manifest_path = backup_path.with_extension("json");
    fs::write(
        &manifest_path,
        serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("写入备份清单失败: {}", e))?;

    cleanup_old_backups(&dir, 20)?;
    Ok(backup_path)
}

pub fn list_backups() -> Result<Vec<BackupInfo>, String> {
    let dir = backups_dir()?;
    let mut backups = Vec::new();

    for entry in fs::read_dir(&dir).map_err(|e| format!("读取备份目录失败: {}", e))? {
        let entry = match entry {
            Ok(v) => v,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.extension().map(|ext| ext == "db").unwrap_or(false) {
            continue;
        }

        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(v) => v.to_string(),
            None => continue,
        };
        let metadata = fs::metadata(&path).map_err(|e| format!("读取备份信息失败: {}", e))?;
        let modified = metadata.modified().ok();
        let created_at = modified
            .map(chrono::DateTime::<chrono::Local>::from)
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_else(|| "".to_string());

        let checksum = fs::read(path.with_extension("json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
            .and_then(|json| {
                json.get("checksum")
                    .and_then(|v| v.as_str())
                    .map(|v| v.to_string())
            });

        backups.push(BackupInfo {
            name,
            size_bytes: metadata.len(),
            created_at,
            checksum,
        });
    }

    backups.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(backups)
}

pub fn restore_backup(conn: &Connection, backup_name: &str) -> Result<(), String> {
    let backup_name = sanitize_backup_name(backup_name)?;
    let backup_path = backups_dir()?.join(&backup_name);
    if !backup_path.exists() {
        return Err("备份文件不存在".to_string());
    }

    let backup_conn = Connection::open(&backup_path).map_err(|e| format!("打开备份失败: {}", e))?;
    let integrity: String = backup_conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| format!("备份完整性检查失败: {}", e))?;
    if integrity.to_lowercase() != "ok" {
        return Err(format!("备份文件损坏: {}", integrity));
    }

    create_backup(conn, Some("before_restore"))?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("恢复事务启动失败: {}", e))?;
    tx.execute(
        "ATTACH DATABASE ?1 AS backup_db",
        [backup_path.to_string_lossy().to_string()],
    )
    .map_err(|e| format!("挂载备份库失败: {}", e))?;

    let has_deleted_col = {
        let mut stmt = tx
            .prepare("PRAGMA backup_db.table_info(accounts)")
            .map_err(|e| e.to_string())?;
        let cols = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?;
        let mut found = false;
        for col in cols {
            if col.unwrap_or_default() == "deleted_at" {
                found = true;
                break;
            }
        }
        found
    };

    tx.execute("DELETE FROM account_history", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM accounts", [])
        .map_err(|e| e.to_string())?;

    if has_deleted_col {
        tx.execute_batch(
            "INSERT INTO accounts (id, email, password, recovery, phone, secret, reg_year, country, group_name, remark, status, sold_status, created_at, updated_at, deleted_at)
             SELECT id, email, password, recovery, phone, secret, reg_year, country, group_name, remark, status, sold_status, created_at, updated_at, deleted_at
             FROM backup_db.accounts",
        )
        .map_err(|e| format!("恢复 accounts 失败: {}", e))?;
    } else {
        tx.execute_batch(
            "INSERT INTO accounts (id, email, password, recovery, phone, secret, reg_year, country, group_name, remark, status, sold_status, created_at, updated_at, deleted_at)
             SELECT id, email, password, recovery, phone, secret, reg_year, country, group_name, remark, status, sold_status, created_at, updated_at, NULL
             FROM backup_db.accounts",
        )
        .map_err(|e| format!("恢复 accounts 失败: {}", e))?;
    }

    let has_history_table: i64 = tx
        .query_row(
            "SELECT COUNT(1) FROM backup_db.sqlite_master WHERE type='table' AND name='account_history'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if has_history_table > 0 {
        tx.execute_batch(
            "INSERT INTO account_history (id, account_id, field_name, old_value, new_value, changed_at)
             SELECT id, account_id, field_name, old_value, new_value, changed_at
             FROM backup_db.account_history",
        )
        .map_err(|e| format!("恢复 account_history 失败: {}", e))?;
    }

    tx.execute_batch("DETACH DATABASE backup_db")
        .map_err(|e| format!("卸载备份库失败: {}", e))?;
    tx.commit()
        .map_err(|e| format!("提交恢复事务失败: {}", e))?;
    Ok(())
}

fn ensure_soft_delete_unique_migration(conn: &Connection) -> Result<(), String> {
    let schema: String = conn
        .query_row(
            "SELECT COALESCE(sql, '') FROM sqlite_master WHERE type='table' AND name='accounts'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let has_inline_unique = schema.to_lowercase().contains("email text unique");
    if !has_inline_unique {
        return Ok(());
    }

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("迁移事务启动失败: {}", e))?;
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS accounts_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            password TEXT NOT NULL,
            recovery TEXT,
            phone TEXT,
            secret TEXT,
            reg_year TEXT,
            country TEXT,
            group_name TEXT,
            remark TEXT,
            status TEXT DEFAULT 'inactive',
            sold_status TEXT DEFAULT 'unsold',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            deleted_at TEXT
        )",
    )
    .map_err(|e| format!("创建迁移表失败: {}", e))?;
    tx.execute_batch(
        "INSERT INTO accounts_new (id, email, password, recovery, phone, secret, reg_year, country, group_name, remark, status, sold_status, created_at, updated_at, deleted_at)
         SELECT id, email, password, recovery, phone, secret, reg_year, country, group_name, remark, status, sold_status, created_at, updated_at, deleted_at
         FROM accounts",
    )
    .map_err(|e| format!("迁移数据失败: {}", e))?;
    tx.execute_batch("DROP TABLE accounts")
        .map_err(|e| format!("替换旧表失败: {}", e))?;
    tx.execute_batch("ALTER TABLE accounts_new RENAME TO accounts")
        .map_err(|e| format!("重命名新表失败: {}", e))?;
    tx.commit().map_err(|e| format!("迁移提交失败: {}", e))?;
    Ok(())
}

pub fn init_database() -> Result<Connection> {
    let conn = Connection::open(get_db_path())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            password TEXT NOT NULL,
            recovery TEXT,
            phone TEXT,
            secret TEXT,
            reg_year TEXT,
            country TEXT,
            group_name TEXT,
            remark TEXT,
            status TEXT DEFAULT 'inactive',
            sold_status TEXT DEFAULT 'unsold',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            deleted_at TEXT
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

    // 数据库迁移：补齐字段（字段已存在时忽略）
    for col in &["phone", "reg_year", "country", "group_name", "deleted_at"] {
        let _ = conn.execute(&format!("ALTER TABLE accounts ADD COLUMN {} TEXT", col), []);
    }

    // 迁移旧版 email UNIQUE 约束到软删除友好的部分唯一索引
    ensure_soft_delete_unique_migration(&conn).map_err(|e| {
        rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("软删除迁移失败: {}", e),
        )))
    })?;

    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;",
    )?;

    // 创建索引，加速常用查询
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_accounts_sold_status ON accounts(sold_status)",
        [],
    )?;
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email_active ON accounts(email) WHERE deleted_at IS NULL",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_accounts_deleted_at ON accounts(deleted_at)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_account_history_account_id ON account_history(account_id)",
        [],
    )?;

    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                password TEXT NOT NULL,
                recovery TEXT,
                phone TEXT,
                secret TEXT,
                reg_year TEXT,
                country TEXT,
                group_name TEXT,
                remark TEXT,
                status TEXT DEFAULT 'inactive',
                sold_status TEXT DEFAULT 'unsold',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                deleted_at TEXT
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email_active ON accounts(email) WHERE deleted_at IS NULL",
            [],
        )
        .unwrap();
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
        )
        .unwrap();
        conn
    }

    fn encrypt_for_test(plain: &str) -> String {
        let key = crate::key_manager::get_master_key().unwrap();
        crate::crypto::encrypt_secret(plain, &key).unwrap()
    }

    #[test]
    fn test_create_account() {
        let conn = setup_test_db();
        let input = AccountInput {
            email: "test@example.com".to_string(),
            password: "password123".to_string(),
            recovery: None,
            phone: None,
            secret: None,
            reg_year: None,
            country: None,
            group_name: None,
            remark: Some("old-remark".to_string()),
        };
        let account = create_account(&conn, &input).unwrap();
        assert_eq!(account.email, "test@example.com");
        assert_eq!(account.status, "inactive");
    }

    #[test]
    fn test_update_account() {
        let conn = setup_test_db();
        let input = AccountInput {
            email: "test@example.com".to_string(),
            password: "password123".to_string(),
            recovery: None,
            phone: None,
            secret: None,
            reg_year: None,
            country: None,
            group_name: None,
            remark: None,
        };
        let account = create_account(&conn, &input).unwrap();

        // 验证密码已解密回原文
        assert_eq!(account.password, "password123");

        let updated_input = AccountInput {
            email: "test@example.com".to_string(),
            password: "newpassword".to_string(),
            recovery: None,
            phone: None,
            secret: None,
            reg_year: None,
            country: None,
            group_name: None,
            remark: Some("new-remark".to_string()),
        };
        let updated = update_account(&conn, account.id, &updated_input).unwrap();

        // 验证新密码已解密回原文
        assert_eq!(updated.password, "newpassword");

        // 验证历史追踪
        let history = get_account_history(&conn, account.id).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].field_name, "remark");
        assert!(history.iter().all(|h| h.field_name != "password"));
    }

    #[test]
    fn test_update_secret_should_not_write_history() {
        let conn = setup_test_db();
        let input = AccountInput {
            email: "secret-history@example.com".to_string(),
            password: "password123".to_string(),
            recovery: None,
            phone: None,
            secret: Some("JBSWY3DPEHPK3PXP".to_string()),
            reg_year: None,
            country: None,
            group_name: None,
            remark: None,
        };
        let account = create_account(&conn, &input).unwrap();

        let updated_input = AccountInput {
            email: "secret-history@example.com".to_string(),
            password: "password123".to_string(),
            recovery: None,
            phone: None,
            secret: Some("GEZDGNBVGY3TQOJQ".to_string()),
            reg_year: None,
            country: None,
            group_name: None,
            remark: None,
        };
        let _ = update_account(&conn, account.id, &updated_input).unwrap();

        let history = get_account_history(&conn, account.id).unwrap();
        assert!(history.iter().all(|h| h.field_name != "secret"));
    }

    #[test]
    fn test_delete_account() {
        let conn = setup_test_db();
        let input = AccountInput {
            email: "test@example.com".to_string(),
            password: "password123".to_string(),
            recovery: None,
            phone: None,
            secret: None,
            reg_year: None,
            country: None,
            group_name: None,
            remark: None,
        };
        let account = create_account(&conn, &input).unwrap();
        delete_account(&conn, account.id).unwrap();

        let active = query_accounts(&conn, None, None).unwrap();
        assert_eq!(active.len(), 0);

        let deleted_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM accounts WHERE deleted_at IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(deleted_count, 1);
    }

    #[test]
    fn test_history_tracking() {
        let conn = setup_test_db();
        let input = AccountInput {
            email: "test@example.com".to_string(),
            password: "password123".to_string(),
            recovery: None,
            phone: None,
            secret: None,
            reg_year: None,
            country: None,
            group_name: None,
            remark: None,
        };
        let account = create_account(&conn, &input).unwrap();

        conn.execute(
            "INSERT INTO account_history (account_id, field_name, old_value, new_value) VALUES (?1, ?2, ?3, ?4)",
            params![account.id, "password", "password123", "newpassword"],
        ).unwrap();

        let history = get_account_history(&conn, account.id).unwrap();
        assert_eq!(history.len(), 1);
    }

    #[test]
    fn test_unique_email_constraint() {
        let conn = setup_test_db();
        let input = AccountInput {
            email: "test@example.com".to_string(),
            password: "password123".to_string(),
            recovery: None,
            phone: None,
            secret: None,
            reg_year: None,
            country: None,
            group_name: None,
            remark: None,
        };
        create_account(&conn, &input).unwrap();
        let result = create_account(&conn, &input);
        assert!(result.is_err());
    }

    #[test]
    fn test_sold_status_toggle() {
        let conn = setup_test_db();
        let input = AccountInput {
            email: "test@example.com".to_string(),
            password: "password123".to_string(),
            recovery: None,
            phone: None,
            secret: None,
            reg_year: None,
            country: None,
            group_name: None,
            remark: None,
        };
        let account = create_account(&conn, &input).unwrap();
        assert_eq!(account.sold_status, "unsold");

        let toggled = toggle_sold_status(&conn, account.id).unwrap();
        assert_eq!(toggled.sold_status, "sold");
    }

    /// 生成全量测试数据（覆盖所有字段组合）
    fn generate_test_accounts() -> Vec<AccountInput> {
        vec![
            AccountInput {
                email: "alice@gmail.com".into(),
                password: "p0ss1899".into(),
                recovery: Some("recovery_alice@gmail.com".into()),
                phone: None,
                secret: Some("JBSWY3DPEHPK3PXP".into()),
                reg_year: None,
                country: None,
                group_name: None,
                remark: Some("备注A".into()),
            },
            AccountInput {
                email: "bob@gmail.com".into(),
                password: "b0bp@ss".into(),
                recovery: Some("recovery_bob@gmail.com".into()),
                phone: None,
                secret: Some("MFZWQ5DJNZTSA3TP".into()),
                reg_year: Some("2021".into()),
                country: Some("India".into()),
                group_name: None,
                remark: None,
            },
            AccountInput {
                email: "charlie@gmail.com".into(),
                password: "ch@r1ie99".into(),
                recovery: Some("rec_charlie@gmail.com".into()),
                phone: Some("13812345678".into()),
                secret: Some("GEZDGNBVGY3TQOJQ".into()),
                reg_year: None,
                country: None,
                group_name: None,
                remark: None,
            },
            AccountInput {
                email: "david@gmail.com".into(),
                password: "d@v1d890".into(),
                recovery: Some("rec_david@gmail.com".into()),
                phone: Some("+8615900001111".into()),
                secret: Some("KBAFEWSYJBCFQ3DP".into()),
                reg_year: None,
                country: None,
                group_name: None,
                remark: None,
            },
            AccountInput {
                email: "echo@gmail.com".into(),
                password: "ech0p@ss".into(),
                recovery: Some("rec_echo@gmail.com".into()),
                phone: None,
                secret: Some("JBSWY3DPEHPK3PXP".into()),
                reg_year: None,
                country: None,
                group_name: None,
                remark: None,
            },
            AccountInput {
                email: "frank@gmail.com".into(),
                password: "fr@nk890".into(),
                recovery: Some("rec_frank@gmail.com".into()),
                phone: None,
                secret: None,
                reg_year: None,
                country: None,
                group_name: Some("主号".into()),
                remark: Some("VIP".into()),
            },
            AccountInput {
                email: "grace@gmail.com".into(),
                password: "gr@ce901".into(),
                recovery: None,
                phone: None,
                secret: None,
                reg_year: Some("2020".into()),
                country: Some("China".into()),
                group_name: None,
                remark: None,
            },
            AccountInput {
                email: "min1@gmail.com".into(),
                password: "m1np@ss01".into(),
                recovery: None,
                phone: None,
                secret: None,
                reg_year: None,
                country: None,
                group_name: None,
                remark: None,
            },
        ]
    }

    #[test]
    fn test_batch_import_from_zero() {
        let conn = setup_test_db();
        let accounts = generate_test_accounts();
        let total = accounts.len() as i32;

        let (success, failed) = batch_import(&conn, &accounts).unwrap();
        assert_eq!(success, total);
        assert_eq!(failed, 0);

        // 验证数据库中的数量
        let all = query_accounts(&conn, None, None).unwrap();
        assert_eq!(all.len(), total as usize);

        // 逐条验证邮箱存在
        for input in &accounts {
            let found = all.iter().find(|a| a.email == input.email);
            assert!(found.is_some(), "未找到账号: {}", input.email);
        }
    }

    #[test]
    fn test_batch_import_fields_correct() {
        let conn = setup_test_db();
        let accounts = generate_test_accounts();
        batch_import(&conn, &accounts).unwrap();

        let all = query_accounts(&conn, None, None).unwrap();

        // 验证 bob 的年份和国家
        let bob = all.iter().find(|a| a.email == "bob@gmail.com").unwrap();
        assert_eq!(bob.reg_year.as_deref(), Some("2021"));
        assert_eq!(bob.country.as_deref(), Some("India"));

        // 验证 charlie 的手机号
        let charlie = all.iter().find(|a| a.email == "charlie@gmail.com").unwrap();
        assert_eq!(charlie.phone.as_deref(), Some("13812345678"));

        // 验证 frank 的分组和备注
        let frank = all.iter().find(|a| a.email == "frank@gmail.com").unwrap();
        assert_eq!(frank.group_name.as_deref(), Some("主号"));
        assert_eq!(frank.remark.as_deref(), Some("VIP"));

        // 验证 grace 的年份和国家
        let grace = all.iter().find(|a| a.email == "grace@gmail.com").unwrap();
        assert_eq!(grace.reg_year.as_deref(), Some("2020"));
        assert_eq!(grace.country.as_deref(), Some("China"));

        // 验证 min1 的可选字段为 None
        let min1 = all.iter().find(|a| a.email == "min1@gmail.com").unwrap();
        assert!(min1.recovery.is_none() || min1.recovery.as_deref() == Some(""));
        assert!(min1.secret.is_none() || min1.secret.as_deref() == Some(""));

        // 验证所有账号默认状态
        for acc in &all {
            assert_eq!(acc.status, "inactive");
            assert_eq!(acc.sold_status, "unsold");
        }
    }

    #[test]
    fn test_delete_all_then_reimport() {
        let conn = setup_test_db();
        let accounts = generate_test_accounts();
        let total = accounts.len() as i32;

        // 第一次导入
        batch_import(&conn, &accounts).unwrap();
        let count1 = query_accounts(&conn, None, None).unwrap().len();
        assert_eq!(count1, total as usize);

        // 清空
        let deleted = delete_all_accounts(&conn).unwrap();
        assert_eq!(deleted, total as usize);
        let count_after_delete = query_accounts(&conn, None, None).unwrap().len();
        assert_eq!(count_after_delete, 0);

        // 第二次导入
        let (success2, failed2) = batch_import(&conn, &accounts).unwrap();
        assert_eq!(success2, total);
        assert_eq!(failed2, 0);
        let count2 = query_accounts(&conn, None, None).unwrap().len();
        assert_eq!(count2, total as usize);
    }

    #[test]
    fn test_idempotent_clear_and_import_3_rounds() {
        let conn = setup_test_db();
        let accounts = generate_test_accounts();
        let total = accounts.len() as i32;

        for round in 1..=3 {
            // 清空（第一轮可能为空）
            delete_all_accounts(&conn).unwrap();
            let empty = query_accounts(&conn, None, None).unwrap();
            assert_eq!(empty.len(), 0, "第 {} 轮清空后不为空", round);

            // 导入
            let (success, failed) = batch_import(&conn, &accounts).unwrap();
            assert_eq!(success, total, "第 {} 轮导入成功数不一致", round);
            assert_eq!(failed, 0, "第 {} 轮有失败记录", round);

            // 验证
            let all = query_accounts(&conn, None, None).unwrap();
            assert_eq!(all.len(), total as usize, "第 {} 轮查询数量不一致", round);

            // 逐条验证邮箱
            for input in &accounts {
                let found = all.iter().find(|a| a.email == input.email);
                assert!(found.is_some(), "第 {} 轮未找到: {}", round, input.email);
            }
        }
    }

    #[test]
    fn test_batch_import_duplicate_email_fails_gracefully() {
        let conn = setup_test_db();
        let accounts = generate_test_accounts();
        batch_import(&conn, &accounts).unwrap();

        // 再次导入相同数据，应该全部失败（email UNIQUE 约束）
        let (success, failed) = batch_import(&conn, &accounts).unwrap();
        assert_eq!(success, 0);
        assert_eq!(failed, accounts.len() as i32);

        // 原数据不受影响
        let all = query_accounts(&conn, None, None).unwrap();
        assert_eq!(all.len(), accounts.len());
    }

    #[test]
    fn test_batch_import_secret_encryption() {
        let conn = setup_test_db();
        let accounts = vec![AccountInput {
            email: "secret_test@gmail.com".into(),
            password: "p@ss123".into(),
            recovery: None,
            phone: None,
            secret: Some("JBSWY3DPEHPK3PXP".into()),
            reg_year: None,
            country: None,
            group_name: None,
            remark: None,
        }];
        batch_import(&conn, &accounts).unwrap();

        // 通过 map_row_to_account 查询（会解密）
        let all = query_accounts(&conn, None, None).unwrap();
        assert_eq!(all.len(), 1);
        // secret 应该被解密回原值
        assert_eq!(all[0].secret.as_deref(), Some("JBSWY3DPEHPK3PXP"));

        // 直接查数据库，secret 应该是加密的（不等于原文）
        let raw: String = conn
            .query_row(
                "SELECT secret FROM accounts WHERE email = 'secret_test@gmail.com'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_ne!(raw, "JBSWY3DPEHPK3PXP", "secret 应该被加密存储");
    }

    #[test]
    fn test_query_accounts_rejects_unencrypted_password() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO accounts (email, password, status, sold_status) VALUES (?1, ?2, ?3, ?4)",
            params![
                "legacy_pwd@example.com",
                "plain-password",
                "inactive",
                "unsold"
            ],
        )
        .unwrap();

        let err = query_accounts(&conn, None, None).unwrap_err();
        assert!(err.contains("password"));
        assert!(err.contains("legacy_pwd@example.com") || err.contains("账号"));
    }

    #[test]
    fn test_query_accounts_rejects_invalid_secret_ciphertext() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO accounts (email, password, secret, status, sold_status) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                "legacy_secret@example.com",
                encrypt_for_test("pwd-ok"),
                "not-encrypted-secret",
                "inactive",
                "unsold"
            ],
        )
        .unwrap();

        let err = query_accounts(&conn, None, None).unwrap_err();
        assert!(err.contains("secret"));
        assert!(err.contains("legacy_secret@example.com") || err.contains("账号"));
    }

    #[test]
    fn test_query_accounts() {
        let conn = setup_test_db();
        let input1 = AccountInput {
            email: "alice@example.com".to_string(),
            password: "pwd1".to_string(),
            recovery: None,
            phone: None,
            secret: None,
            reg_year: None,
            country: None,
            group_name: None,
            remark: Some("target remark".to_string()),
        };
        let input2 = AccountInput {
            email: "bob@example.com".to_string(),
            password: "pwd2".to_string(),
            recovery: None,
            phone: None,
            secret: None,
            reg_year: None,
            country: None,
            group_name: None,
            remark: Some("other".to_string()),
        };
        create_account(&conn, &input1).unwrap();
        create_account(&conn, &input2).unwrap();

        // 全量查询
        let all = query_accounts(&conn, None, None).unwrap();
        assert_eq!(all.len(), 2);

        // 搜索
        let found = query_accounts(&conn, Some("alice"), None).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].email, "alice@example.com");
    }
}
