#[path = "../crypto.rs"]
mod crypto;
#[path = "../key_manager.rs"]
mod key_manager;
#[path = "../database.rs"]
mod database;

use database::{Account, AccountHistory};
use rusqlite::{params, Connection};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::env;
use std::fs;

#[derive(Debug)]
struct SnapshotData {
    active_accounts: Vec<Account>,
    deleted_accounts: Vec<Account>,
    histories: Vec<AccountHistory>,
}

#[derive(Debug)]
struct CompareResult {
    current_active_count: usize,
    snapshot_active_count: usize,
    current_deleted_count: usize,
    snapshot_deleted_count: usize,
    current_history_count: usize,
    snapshot_history_count: usize,
    active_hash_match: bool,
    deleted_hash_match: bool,
    history_hash_match: bool,
}

fn usage() {
    eprintln!(
        "用法: cargo run --manifest-path src-tauri/Cargo.toml --bin restore_text_snapshot -- <export.txt> [--apply]"
    );
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn normalize_account(mut account: Account) -> Account {
    account.recovery = normalize_optional(account.recovery);
    account.phone = normalize_optional(account.phone);
    account.secret = normalize_optional(account.secret);
    account.reg_year = normalize_optional(account.reg_year);
    account.country = normalize_optional(account.country);
    account.group_name = normalize_optional(account.group_name);
    account.remark = normalize_optional(account.remark);
    account.deleted_at = normalize_optional(account.deleted_at);
    account
}

fn extract_json_section<'a>(text: &'a str, start_marker: &str, end_marker: Option<&str>) -> Result<&'a str, String> {
    let start = text
        .find(start_marker)
        .ok_or_else(|| format!("未找到分段标记: {}", start_marker))?;
    let json_start = start + start_marker.len();
    let remainder = &text[json_start..];
    let json_end = match end_marker {
        Some(marker) => remainder
            .find(marker)
            .ok_or_else(|| format!("未找到结束分段标记: {}", marker))?,
        None => remainder.len(),
    };
    Ok(remainder[..json_end].trim())
}

fn parse_snapshot_file(path: &str) -> Result<SnapshotData, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("读取导出文件失败: {}", e))?;

    let active_json = extract_json_section(
        &text,
        "--- Active Accounts (JSON) ---",
        Some("--- Deleted Accounts (JSON) ---"),
    )?;
    let deleted_json = extract_json_section(
        &text,
        "--- Deleted Accounts (JSON) ---",
        Some("--- Account Histories By ID (JSON) ---"),
    )?;
    let histories_json = extract_json_section(
        &text,
        "--- Account Histories By ID (JSON) ---",
        Some("--- Backups (JSON) ---"),
    )?;

    let mut active_accounts: Vec<Account> = serde_json::from_str(active_json)
        .map_err(|e| format!("解析活跃账号 JSON 失败: {}", e))?;
    let mut deleted_accounts: Vec<Account> = serde_json::from_str(deleted_json)
        .map_err(|e| format!("解析已删除账号 JSON 失败: {}", e))?;
    let history_map: serde_json::Map<String, serde_json::Value> = serde_json::from_str(histories_json)
        .map_err(|e| format!("解析历史 JSON 失败: {}", e))?;

    active_accounts = active_accounts
        .into_iter()
        .map(normalize_account)
        .collect();
    deleted_accounts = deleted_accounts
        .into_iter()
        .map(normalize_account)
        .collect();

    active_accounts.sort_by_key(|account| account.id);
    deleted_accounts.sort_by_key(|account| account.id);

    let mut histories = Vec::new();
    for value in history_map.into_values() {
        let mut items: Vec<AccountHistory> = serde_json::from_value(value)
            .map_err(|e| format!("解析单账号历史失败: {}", e))?;
        histories.append(&mut items);
    }
    histories.sort_by_key(|history| history.id);

    Ok(SnapshotData {
        active_accounts,
        deleted_accounts,
        histories,
    })
}

fn fetch_all_histories(conn: &Connection) -> Result<Vec<AccountHistory>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, account_id, field_name, old_value, new_value, changed_at FROM account_history ORDER BY id ASC",
        )
        .map_err(|e| format!("查询历史失败: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(AccountHistory {
                id: row.get(0)?,
                account_id: row.get(1)?,
                field_name: row.get(2)?,
                old_value: row.get(3)?,
                new_value: row.get(4)?,
                changed_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("映射历史失败: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取历史失败: {}", e))
}

fn digest_json<T: Serialize>(value: &T) -> Result<String, String> {
    let bytes = serde_json::to_vec(value).map_err(|e| format!("序列化比较数据失败: {}", e))?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

fn compare_snapshot(conn: &Connection, snapshot: &SnapshotData) -> Result<CompareResult, String> {
    let mut current_active = database::query_accounts(conn, None, None)?;
    let mut current_deleted = database::query_deleted_accounts(conn)?;
    let current_histories = fetch_all_histories(conn)?;

    current_active = current_active.into_iter().map(normalize_account).collect();
    current_deleted = current_deleted.into_iter().map(normalize_account).collect();

    current_active.sort_by_key(|account| account.id);
    current_deleted.sort_by_key(|account| account.id);

    let active_hash_match = digest_json(&current_active)? == digest_json(&snapshot.active_accounts)?;
    let deleted_hash_match = digest_json(&current_deleted)? == digest_json(&snapshot.deleted_accounts)?;
    let history_hash_match = digest_json(&current_histories)? == digest_json(&snapshot.histories)?;

    Ok(CompareResult {
        current_active_count: current_active.len(),
        snapshot_active_count: snapshot.active_accounts.len(),
        current_deleted_count: current_deleted.len(),
        snapshot_deleted_count: snapshot.deleted_accounts.len(),
        current_history_count: current_histories.len(),
        snapshot_history_count: snapshot.histories.len(),
        active_hash_match,
        deleted_hash_match,
        history_hash_match,
    })
}

fn print_compare(compare: &CompareResult) {
    println!("=== 快照对比结果 ===");
    println!(
        "active: current={} snapshot={} hash_match={}",
        compare.current_active_count, compare.snapshot_active_count, compare.active_hash_match
    );
    println!(
        "deleted: current={} snapshot={} hash_match={}",
        compare.current_deleted_count, compare.snapshot_deleted_count, compare.deleted_hash_match
    );
    println!(
        "history: current={} snapshot={} hash_match={}",
        compare.current_history_count, compare.snapshot_history_count, compare.history_hash_match
    );
    println!(
        "exact_match={}",
        compare.active_hash_match && compare.deleted_hash_match && compare.history_hash_match
    );
}

fn restore_snapshot(conn: &mut Connection, snapshot: &SnapshotData) -> Result<(), String> {
    let backup_path = database::create_backup(conn, Some("before_text_snapshot_restore"))?;
    println!("已创建数据库备份: {}", backup_path.display());

    let key = key_manager::get_master_key()?;
    let max_account_id = snapshot
        .active_accounts
        .iter()
        .chain(snapshot.deleted_accounts.iter())
        .map(|account| account.id)
        .max()
        .unwrap_or(0);
    let max_history_id = snapshot
        .histories
        .iter()
        .map(|history| history.id)
        .max()
        .unwrap_or(0);

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("启动恢复事务失败: {}", e))?;

    tx.execute_batch(
        "DELETE FROM account_history;
         DELETE FROM accounts;",
    )
    .map_err(|e| format!("清空旧数据失败: {}", e))?;

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO accounts (
                    id, email, password, recovery, phone, secret, reg_year, country,
                    group_name, remark, status, sold_status, created_at, updated_at, deleted_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            )
            .map_err(|e| format!("准备账号插入语句失败: {}", e))?;

        for account in snapshot
            .active_accounts
            .iter()
            .chain(snapshot.deleted_accounts.iter())
        {
            let encrypted_password = crypto::encrypt_secret(&account.password, &key)?;
            let encrypted_secret = match account.secret.as_deref() {
                Some(secret) if !secret.is_empty() => Some(crypto::encrypt_secret(secret, &key)?),
                _ => None,
            };

            stmt.execute(params![
                account.id,
                account.email,
                encrypted_password,
                account.recovery,
                account.phone,
                encrypted_secret,
                account.reg_year,
                account.country,
                account.group_name,
                account.remark,
                account.status,
                account.sold_status,
                account.created_at,
                account.updated_at,
                account.deleted_at,
            ])
            .map_err(|e| format!("插入账号 {} 失败: {}", account.email, e))?;
        }
    }

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO account_history (
                    id, account_id, field_name, old_value, new_value, changed_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .map_err(|e| format!("准备历史插入语句失败: {}", e))?;

        for history in &snapshot.histories {
            stmt.execute(params![
                history.id,
                history.account_id,
                history.field_name,
                history.old_value,
                history.new_value,
                history.changed_at,
            ])
            .map_err(|e| format!("插入历史 {} 失败: {}", history.id, e))?;
        }
    }

    tx.execute("DELETE FROM sqlite_sequence WHERE name = 'accounts'", [])
        .map_err(|e| format!("重置 accounts 自增失败: {}", e))?;
    tx.execute(
        "DELETE FROM sqlite_sequence WHERE name = 'account_history'",
        [],
    )
    .map_err(|e| format!("重置 account_history 自增失败: {}", e))?;
    tx.execute(
        "INSERT INTO sqlite_sequence(name, seq) VALUES('accounts', ?1)",
        [max_account_id],
    )
    .map_err(|e| format!("写入 accounts 自增值失败: {}", e))?;
    tx.execute(
        "INSERT INTO sqlite_sequence(name, seq) VALUES('account_history', ?1)",
        [max_history_id],
    )
    .map_err(|e| format!("写入 account_history 自增值失败: {}", e))?;

    tx.commit().map_err(|e| format!("提交恢复事务失败: {}", e))?;
    Ok(())
}

fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let Some(snapshot_path) = args.next() else {
        usage();
        return Err("缺少导出文件路径".to_string());
    };
    let apply = args.any(|arg| arg == "--apply");

    let snapshot = parse_snapshot_file(&snapshot_path)?;
    let mut conn = database::init_database().map_err(|e| format!("初始化数据库失败: {}", e))?;

    let compare = compare_snapshot(&conn, &snapshot)?;
    print_compare(&compare);

    let exact_match = compare.active_hash_match && compare.deleted_hash_match && compare.history_hash_match;
    if !apply {
        println!("未指定 --apply，仅做对比，不写库。");
        return Ok(());
    }

    if exact_match {
        println!("当前数据库与快照完全一致，无需恢复。\n");
        return Ok(());
    }

    restore_snapshot(&mut conn, &snapshot)?;
    let verify = compare_snapshot(&conn, &snapshot)?;
    print_compare(&verify);

    let verify_ok = verify.active_hash_match && verify.deleted_hash_match && verify.history_hash_match;
    if !verify_ok {
        return Err("恢复后校验失败：数据库与快照仍不一致".to_string());
    }

    println!("恢复完成：数据库已与文本快照对齐。\n");
    Ok(())
}
