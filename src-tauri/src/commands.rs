use crate::auth::{self, AuthResult};
use crate::database::{
    self, Account, AccountHistory, AccountInput, BackupInfo, Database, ACCOUNT_COLUMNS,
    ExportAccountOrder, ExportCategorySort, ExportConfig, build_export_accounts_output,
};
use tauri::State;
fn require_auth(session_token: &str) -> Result<(), String> {
    auth::require_auth(Some(session_token))
}

#[tauri::command]
pub fn check_auth(session_token: Option<String>) -> Result<AuthResult, String> {
    auth::check_auth(session_token.as_deref())
}

#[tauri::command]
pub fn login(password: String) -> Result<AuthResult, String> {
    auth::login(&password)
}

#[tauri::command]
pub fn logout(session_token: Option<String>) -> Result<(), String> {
    auth::logout(session_token.as_deref())
}

#[tauri::command]
pub fn get_accounts(
    db: State<Database>,
    session_token: String,
    search: Option<String>,
    sold_status: Option<String>,
) -> Result<Vec<Account>, String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    database::query_accounts(&conn, search.as_deref(), sold_status.as_deref())
}

#[tauri::command]
pub fn create_account(
    db: State<Database>,
    session_token: String,
    account: AccountInput,
) -> Result<Account, String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    database::create_account(&conn, &account)
}

#[tauri::command]
pub fn update_account(
    db: State<Database>,
    session_token: String,
    id: i64,
    account: AccountInput,
) -> Result<Account, String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    database::update_account(&conn, id, &account)
}

#[tauri::command]
pub fn delete_account(db: State<Database>, session_token: String, id: i64) -> Result<(), String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    database::delete_account(&conn, id)
}

#[tauri::command]
pub fn delete_all_accounts(db: State<Database>, session_token: String) -> Result<usize, String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    database::delete_all_accounts(&conn)
}

#[tauri::command]
pub fn get_deleted_accounts(
    db: State<Database>,
    session_token: String,
) -> Result<Vec<Account>, String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    database::query_deleted_accounts(&conn)
}

#[tauri::command]
pub fn restore_account(
    db: State<Database>,
    session_token: String,
    id: i64,
) -> Result<Account, String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    database::restore_account(&conn, id)
}

#[tauri::command]
pub fn purge_account(db: State<Database>, session_token: String, id: i64) -> Result<(), String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    database::purge_account(&conn, id)
}

#[tauri::command]
pub fn purge_all_deleted(db: State<Database>, session_token: String) -> Result<usize, String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    database::purge_all_deleted(&conn)
}

#[tauri::command]
pub fn create_backup(
    db: State<Database>,
    session_token: String,
    reason: Option<String>,
) -> Result<String, String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let path = database::create_backup(&conn, reason.as_deref())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_backups(
    _db: State<Database>,
    session_token: String,
) -> Result<Vec<BackupInfo>, String> {
    require_auth(&session_token)?;
    database::list_backups()
}

#[tauri::command]
pub fn restore_backup(
    db: State<Database>,
    session_token: String,
    backup_name: String,
) -> Result<(), String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    database::restore_backup(&conn, &backup_name)
}

#[tauri::command]
pub fn toggle_sold_status(
    db: State<Database>,
    session_token: String,
    id: i64,
) -> Result<Account, String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    database::toggle_sold_status(&conn, id)
}

#[tauri::command]
pub fn toggle_status(
    db: State<Database>,
    session_token: String,
    id: i64,
) -> Result<Account, String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    database::toggle_status(&conn, id)
}

#[tauri::command]
pub fn get_account_history(
    db: State<Database>,
    session_token: String,
    account_id: i64,
) -> Result<Vec<AccountHistory>, String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    database::get_account_history(&conn, account_id)
}

#[tauri::command]
pub fn get_account_by_id(
    db: State<Database>,
    session_token: String,
    id: i64,
) -> Result<Account, String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    database::get_account_by_id(&conn, id)
}

#[derive(serde::Serialize)]
pub struct TotpResult {
    pub code: String,
    pub remaining: u32,
}

#[tauri::command]
pub fn generate_totp(secret: String, session_token: String) -> Result<TotpResult, String> {
    require_auth(&session_token)?;
    let result = crate::totp::generate_totp(&secret)?;
    Ok(TotpResult {
        code: result.code,
        remaining: result.remaining,
    })
}

#[derive(serde::Serialize)]
pub struct BatchImportResult {
    pub success_count: i32,
    pub failed_count: i32,
}

#[tauri::command]
pub fn batch_import(
    db: State<Database>,
    session_token: String,
    accounts: Vec<AccountInput>,
) -> Result<BatchImportResult, String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let (success_count, failed_count) = database::batch_import(&conn, &accounts)?;
    Ok(BatchImportResult {
        success_count,
        failed_count,
    })
}

#[tauri::command]
pub fn export_database_sql(db: State<Database>, session_token: String) -> Result<String, String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut output = String::new();

    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    output.push_str(&format!(
        "-- Google Manager Database Export\n-- Export Time: {}\n-- Version: 0.1.0\n\n",
        now
    ));

    // 导出 CREATE TABLE 语句
    let mut stmt = conn.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).map_err(|e| e.to_string())?;

    let schemas: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    for schema in &schemas {
        output.push_str(&format!("{};\n\n", schema));
    }

    // 导出 accounts 表数据
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {} FROM accounts ORDER BY id",
            ACCOUNT_COLUMNS
        ))
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, String>(12)?,
                row.get::<_, String>(13)?,
                row.get::<_, Option<String>>(14)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let escape = |s: &str| s.replace('\'', "''");
    let sql_val = |opt: &Option<String>| match opt {
        Some(v) => format!("'{}'", escape(v)),
        None => "NULL".to_string(),
    };

    for row in rows {
        let (
            id,
            email,
            password,
            recovery,
            phone,
            secret,
            reg_year,
            country,
            group_name,
            remark,
            status,
            sold_status,
            created_at,
            updated_at,
            deleted_at,
        ) = row.map_err(|e| e.to_string())?;
        output.push_str(&format!(
            "INSERT INTO accounts (id, email, password, recovery, phone, secret, reg_year, country, group_name, remark, status, sold_status, created_at, updated_at, deleted_at) VALUES ({}, '{}', '{}', {}, {}, {}, {}, {}, {}, {}, '{}', '{}', '{}', '{}', {});\n",
            id, escape(&email), escape(&password),
            sql_val(&recovery), sql_val(&phone), sql_val(&secret),
            sql_val(&reg_year), sql_val(&country), sql_val(&group_name), sql_val(&remark),
            escape(&status), escape(&sold_status), escape(&created_at), escape(&updated_at), sql_val(&deleted_at),
        ));
    }

    output.push('\n');

    // 导出 account_history 表数据
    let mut stmt = conn.prepare(
        "SELECT id, account_id, field_name, old_value, new_value, changed_at FROM account_history ORDER BY id"
    ).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (id, account_id, field_name, old_value, new_value, changed_at) =
            row.map_err(|e| e.to_string())?;
        output.push_str(&format!(
            "INSERT INTO account_history (id, account_id, field_name, old_value, new_value, changed_at) VALUES ({}, {}, '{}', {}, {}, '{}');\n",
            id, account_id, escape(&field_name),
            sql_val(&old_value), sql_val(&new_value), escape(&changed_at),
        ));
    }

    Ok(output)
}

#[tauri::command]
pub fn export_accounts_text(
    db: State<Database>,
    session_token: String,
    account_ids: Option<Vec<i64>>,
    search: Option<String>,
    sold_status: Option<String>,
    config: ExportConfig,
) -> Result<String, String> {
    require_auth(&session_token)?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let accounts = database::query_accounts_for_export(
        &conn,
        account_ids.as_deref(),
        search.as_deref(),
        sold_status.as_deref(),
    )?;

    let mut output = String::new();

    // 统计汇总
    if config.include_stats {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let total = accounts.len();
        let pro_count = accounts.iter().filter(|a| a.status == "pro").count();
        let normal_count = total - pro_count;
        let sold_count = accounts.iter().filter(|a| a.sold_status == "sold").count();
        let unsold_count = total - sold_count;

        output.push_str(&format!("========== 账号统计汇总 ==========\n"));
        output.push_str(&format!("导出时间: {}\n", now));
        output.push_str(&format!("总账号数: {}\n", total));
        output.push_str(&format!(
            "Pro账号: {} | 普通账号: {}\n",
            pro_count, normal_count
        ));
        output.push_str(&format!(
            "已售出: {} | 未售出: {}\n",
            sold_count, unsold_count
        ));

        // 标签分布
        let mut group_counts: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        for acc in &accounts {
            if let Some(ref g) = acc.group_name {
                if !g.is_empty() {
                    for tag in g.split(|c: char| c == ',' || c == '，' || c.is_whitespace()) {
                        let tag = tag.trim();
                        if !tag.is_empty() {
                            *group_counts.entry(tag.to_string()).or_insert(0) += 1;
                        }
                    }
                }
            }
        }
        if !group_counts.is_empty() {
            output.push_str("\n标签分布:\n");
            let mut groups: Vec<_> = group_counts.into_iter().collect();
            groups.sort_by(|a, b| b.1.cmp(&a.1));
            for (name, count) in &groups {
                output.push_str(&format!("  - {}: {} 个\n", name, count));
            }
        }

        // 国家分布
        let mut country_counts: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        for acc in &accounts {
            if let Some(ref c) = acc.country {
                if !c.is_empty() {
                    *country_counts.entry(c.clone()).or_insert(0) += 1;
                }
            }
        }
        if !country_counts.is_empty() {
            output.push_str("\n国家分布:\n");
            let mut countries: Vec<_> = country_counts.into_iter().collect();
            countries.sort_by(|a, b| b.1.cmp(&a.1));
            for (name, count) in &countries {
                output.push_str(&format!("  - {}: {} 个\n", name, count));
            }
        }

        // 注册年份分布
        let mut year_counts: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        for acc in &accounts {
            if let Some(ref y) = acc.reg_year {
                if !y.is_empty() {
                    *year_counts.entry(y.clone()).or_insert(0) += 1;
                }
            }
        }
        if !year_counts.is_empty() {
            output.push_str("\n注册年份分布:\n");
            let mut years: Vec<_> = year_counts.into_iter().collect();
            years.sort_by(|a, b| a.0.cmp(&b.0));
            for (year, count) in &years {
                output.push_str(&format!("  - {}: {} 个\n", year, count));
            }
        }

        output.push_str("=====================================\n\n");
    }

    // 导出账号数据（在内存中完成排序/分组，避免动态 SQL 带来的注入风险）
    output.push_str(&build_export_accounts_output(accounts, &config));

    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{params, Connection};

    fn encrypt_for_test(plain: &str) -> String {
        let key = crate::key_manager::get_master_key().unwrap();
        crate::crypto::encrypt_secret(plain, &key).unwrap()
    }

    fn setup_export_query_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS accounts (\
                id INTEGER PRIMARY KEY AUTOINCREMENT,\
                email TEXT NOT NULL,\
                password TEXT NOT NULL,\
                recovery TEXT,\
                phone TEXT,\
                secret TEXT,\
                reg_year TEXT,\
                country TEXT,\
                group_name TEXT,\
                remark TEXT,\
                status TEXT DEFAULT \"inactive\",\
                sold_status TEXT DEFAULT \"unsold\",\
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,\
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,\
                deleted_at TEXT\
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email_active ON accounts(email) WHERE deleted_at IS NULL",
            [],
        )
        .unwrap();
        conn
    }

    fn build_test_account(id: i64, email: &str, country: Option<&str>) -> Account {
        Account {
            id,
            email: email.to_string(),
            password: "pwd".to_string(),
            recovery: None,
            phone: None,
            secret: None,
            reg_year: None,
            country: country.map(|value| value.to_string()),
            group_name: None,
            remark: None,
            status: "inactive".to_string(),
            sold_status: "unsold".to_string(),
            created_at: "2026-01-01 00:00:00".to_string(),
            updated_at: "2026-01-01 00:00:00".to_string(),
            deleted_at: None,
        }
    }

    fn build_base_export_config() -> ExportConfig {
        ExportConfig {
            separator: "----".to_string(),
            fields: vec!["email".to_string()],
            include_stats: false,
            account_order: ExportAccountOrder::default(),
            category_sort: ExportCategorySort::default(),
            category_label_template: None,
        }
    }

    #[test]
    fn test_export_query_uses_search_branch_when_account_ids_is_empty() {
        let conn = setup_export_query_test_db();
        let encrypted_pwd1 = encrypt_for_test("pwd1");
        let encrypted_pwd2 = encrypt_for_test("pwd2");

        conn.execute(
            "INSERT INTO accounts (email, password, remark, status, sold_status) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["matched@example.com", encrypted_pwd1, "target remark", "pro", "sold"],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO accounts (email, password, remark, status, sold_status) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["other@example.com", encrypted_pwd2, "other remark", "inactive", "unsold"],
        )
        .unwrap();

        let empty_ids: [i64; 0] = [];
        let accounts = database::query_accounts_for_export(
            &conn,
            Some(&empty_ids),
            Some("target"),
            Some("sold"),
        )
        .unwrap();

        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].email, "matched@example.com");
    }

    #[test]
    fn test_export_output_keeps_original_order_without_sort_or_group() {
        let accounts = vec![
            build_test_account(3, "c@example.com", Some("US")),
            build_test_account(2, "a@example.com", Some("CN")),
        ];
        let config = build_base_export_config();

        let output = build_export_accounts_output(accounts, &config);

        assert_eq!(output, "c@example.com\na@example.com\n");
    }

    #[test]
    fn test_export_output_applies_sort_field_and_direction() {
        let accounts = vec![
            build_test_account(3, "c@example.com", Some("US")),
            build_test_account(2, "a@example.com", Some("CN")),
            build_test_account(1, "b@example.com", Some("CN")),
        ];
        let mut config = build_base_export_config();
        config.account_order.field = Some("email".to_string());
        config.account_order.direction = Some("asc".to_string());

        let asc_output = build_export_accounts_output(accounts.clone(), &config);
        assert_eq!(asc_output, "a@example.com\nb@example.com\nc@example.com\n");

        config.account_order.direction = Some("desc".to_string());
        let desc_output = build_export_accounts_output(accounts, &config);
        assert_eq!(desc_output, "c@example.com\nb@example.com\na@example.com\n");
    }

    #[test]
    fn test_export_output_applies_group_field_direction_and_template() {
        let accounts = vec![
            build_test_account(3, "c@example.com", Some("CN")),
            build_test_account(2, "a@example.com", Some("US")),
            build_test_account(1, "b@example.com", Some("CN")),
        ];
        let mut config = build_base_export_config();
        config.account_order.field = Some("email".to_string());
        config.account_order.direction = Some("asc".to_string());
        config.category_sort.field = Some("country".to_string());
        config.category_sort.direction = Some("desc".to_string());
        config.category_label_template =
            Some("分组:{index}:{groupField}:{groupValue}:{count}".to_string());

        let output = build_export_accounts_output(accounts, &config);

        assert_eq!(
            output,
            "分组:1:country:US:1\na@example.com\n\n分组:2:country:CN:2\nb@example.com\nc@example.com\n"
        );
    }

    #[test]
    fn test_export_output_uses_default_group_template_when_template_empty() {
        let accounts = vec![build_test_account(1, "a@example.com", None)];
        let mut config = build_base_export_config();
        config.category_sort.field = Some("country".to_string());
        config.category_label_template = Some("   ".to_string());

        let output = build_export_accounts_output(accounts, &config);

        assert_eq!(output, "1. country: 未设置（共 1 条）\na@example.com\n");
    }

    #[test]
    fn test_export_output_ignores_invalid_sort_and_group_config() {
        let accounts = vec![
            build_test_account(3, "c@example.com", Some("US")),
            build_test_account(2, "a@example.com", Some("CN")),
        ];
        let mut config = build_base_export_config();
        config.account_order.field = Some("not_exists".to_string());
        config.account_order.direction = Some("invalid_direction".to_string());
        config.category_sort.field = Some("also_not_exists".to_string());
        config.category_sort.direction = Some("invalid_direction".to_string());

        let output = build_export_accounts_output(accounts, &config);

        assert_eq!(output, "c@example.com\na@example.com\n");
    }

    #[test]
    fn test_totp_generation() {
        let secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP".to_string();
        let result = crate::totp::generate_totp(&secret);

        assert!(result.is_ok());
        let totp_result = result.unwrap();
        assert_eq!(totp_result.code.len(), 6);
        assert!(totp_result.remaining <= 30);
        assert!(totp_result.remaining >= 1);
    }

    #[test]
    fn test_totp_with_spaces() {
        let secret = "JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP".to_string();
        let result = crate::totp::generate_totp(&secret);

        assert!(result.is_ok());
        let totp_result = result.unwrap();
        assert_eq!(totp_result.code.len(), 6);
    }

    #[test]
    fn test_totp_lowercase() {
        let secret = "jbswy3dpehpk3pxpjbswy3dpehpk3pxp".to_string();
        let result = crate::totp::generate_totp(&secret);

        assert!(result.is_ok());
    }

    #[test]
    fn test_totp_invalid_secret() {
        let secret = "invalid!@#".to_string();
        let result = crate::totp::generate_totp(&secret);

        assert!(result.is_err());
    }

    #[test]
    fn test_totp_consistency() {
        let secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP".to_string();
        let result1 = crate::totp::generate_totp(&secret).unwrap();
        let result2 = crate::totp::generate_totp(&secret).unwrap();

        if result1.remaining == result2.remaining {
            assert_eq!(result1.code, result2.code);
        }
    }
}
