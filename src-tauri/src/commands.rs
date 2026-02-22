use crate::auth::{self, AuthResult};
use crate::database::{
    self, Account, AccountHistory, AccountInput, BackupInfo, Database, ACCOUNT_COLUMNS,
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

#[derive(serde::Deserialize, Debug, Clone, Default)]
pub struct ExportAccountOrder {
    pub field: Option<String>,
    pub direction: Option<String>,
}

#[derive(serde::Deserialize, Debug, Clone, Default)]
pub struct ExportCategorySort {
    pub field: Option<String>,
    pub direction: Option<String>,
}

#[derive(serde::Deserialize, Debug, Clone)]
pub struct ExportConfig {
    pub separator: String,
    pub fields: Vec<String>,
    pub include_stats: bool,
    #[serde(default)]
    pub account_order: ExportAccountOrder,
    #[serde(default)]
    pub category_sort: ExportCategorySort,
    #[serde(default)]
    pub category_label_template: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ExportField {
    Id,
    Email,
    Password,
    Recovery,
    Phone,
    Secret,
    RegYear,
    Country,
    GroupName,
    Remark,
    Status,
    SoldStatus,
    CreatedAt,
    UpdatedAt,
    DeletedAt,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SortDirection {
    Asc,
    Desc,
}

const DEFAULT_GROUP_LABEL_TEMPLATE: &str =
    "{index}. {groupField}: {groupValue}（共 {count} 条）";

impl ExportField {
    fn from_config(field: Option<&str>) -> Option<Self> {
        let normalized = field?.trim().to_ascii_lowercase();
        match normalized.as_str() {
            "id" => Some(Self::Id),
            "email" => Some(Self::Email),
            "password" => Some(Self::Password),
            "recovery" => Some(Self::Recovery),
            "phone" => Some(Self::Phone),
            "secret" => Some(Self::Secret),
            "reg_year" => Some(Self::RegYear),
            "country" => Some(Self::Country),
            "group_name" => Some(Self::GroupName),
            "remark" => Some(Self::Remark),
            "status" => Some(Self::Status),
            "sold_status" => Some(Self::SoldStatus),
            "created_at" => Some(Self::CreatedAt),
            "updated_at" => Some(Self::UpdatedAt),
            "deleted_at" => Some(Self::DeletedAt),
            _ => None,
        }
    }

    fn as_config_name(self) -> &'static str {
        match self {
            Self::Id => "id",
            Self::Email => "email",
            Self::Password => "password",
            Self::Recovery => "recovery",
            Self::Phone => "phone",
            Self::Secret => "secret",
            Self::RegYear => "reg_year",
            Self::Country => "country",
            Self::GroupName => "group_name",
            Self::Remark => "remark",
            Self::Status => "status",
            Self::SoldStatus => "sold_status",
            Self::CreatedAt => "created_at",
            Self::UpdatedAt => "updated_at",
            Self::DeletedAt => "deleted_at",
        }
    }

    fn compare_accounts(self, left: &Account, right: &Account) -> std::cmp::Ordering {
        match self {
            Self::Id => left.id.cmp(&right.id),
            Self::Email => left.email.cmp(&right.email),
            Self::Password => left.password.cmp(&right.password),
            Self::Recovery => left
                .recovery
                .as_deref()
                .unwrap_or("")
                .cmp(right.recovery.as_deref().unwrap_or("")),
            Self::Phone => left
                .phone
                .as_deref()
                .unwrap_or("")
                .cmp(right.phone.as_deref().unwrap_or("")),
            Self::Secret => left
                .secret
                .as_deref()
                .unwrap_or("")
                .cmp(right.secret.as_deref().unwrap_or("")),
            Self::RegYear => left
                .reg_year
                .as_deref()
                .unwrap_or("")
                .cmp(right.reg_year.as_deref().unwrap_or("")),
            Self::Country => left
                .country
                .as_deref()
                .unwrap_or("")
                .cmp(right.country.as_deref().unwrap_or("")),
            Self::GroupName => left
                .group_name
                .as_deref()
                .unwrap_or("")
                .cmp(right.group_name.as_deref().unwrap_or("")),
            Self::Remark => left
                .remark
                .as_deref()
                .unwrap_or("")
                .cmp(right.remark.as_deref().unwrap_or("")),
            Self::Status => left.status.cmp(&right.status),
            Self::SoldStatus => left.sold_status.cmp(&right.sold_status),
            Self::CreatedAt => left.created_at.cmp(&right.created_at),
            Self::UpdatedAt => left.updated_at.cmp(&right.updated_at),
            Self::DeletedAt => left
                .deleted_at
                .as_deref()
                .unwrap_or("")
                .cmp(right.deleted_at.as_deref().unwrap_or("")),
        }
    }

    fn export_value(self, account: &Account) -> String {
        match self {
            Self::Id => account.id.to_string(),
            Self::Email => account.email.clone(),
            Self::Password => account.password.clone(),
            Self::Recovery => account.recovery.clone().unwrap_or_default(),
            Self::Phone => account.phone.clone().unwrap_or_default(),
            Self::Secret => account.secret.clone().unwrap_or_default(),
            Self::RegYear => account.reg_year.clone().unwrap_or_default(),
            Self::Country => account.country.clone().unwrap_or_default(),
            Self::GroupName => account.group_name.clone().unwrap_or_default(),
            Self::Remark => account.remark.clone().unwrap_or_default(),
            Self::Status => account.status.clone(),
            Self::SoldStatus => account.sold_status.clone(),
            Self::CreatedAt => account.created_at.clone(),
            Self::UpdatedAt => account.updated_at.clone(),
            Self::DeletedAt => account.deleted_at.clone().unwrap_or_default(),
        }
    }
}

impl SortDirection {
    fn from_config(direction: Option<&str>) -> Self {
        let normalized = direction
            .map(|value| value.trim().to_ascii_lowercase())
            .unwrap_or_default();

        match normalized.as_str() {
            "desc" | "descending" => Self::Desc,
            _ => Self::Asc,
        }
    }
}

fn apply_export_sort(accounts: &mut [Account], config: &ExportConfig) {
    let Some(sort_field) = ExportField::from_config(config.account_order.field.as_deref()) else {
        return;
    };

    let sort_direction = SortDirection::from_config(config.account_order.direction.as_deref());
    accounts.sort_by(|left, right| {
        let ordering = sort_field.compare_accounts(left, right);
        match sort_direction {
            SortDirection::Asc => ordering,
            SortDirection::Desc => ordering.reverse(),
        }
    });
}

fn build_account_export_line(account: &Account, config: &ExportConfig) -> String {
    let field_values: Vec<String> = config
        .fields
        .iter()
        .map(|field| {
            ExportField::from_config(Some(field.as_str()))
                .map(|parsed_field| parsed_field.export_value(account))
                .unwrap_or_default()
        })
        .collect();
    field_values.join(&config.separator)
}

fn render_group_label(
    group_label_template: &str,
    group_field: ExportField,
    group_value: &str,
    group_count: usize,
    group_index: usize,
) -> String {
    let display_value = if group_value.trim().is_empty() {
        "未设置"
    } else {
        group_value
    };
    let field_name = group_field.as_config_name();

    group_label_template
        .replace("{index}", &group_index.to_string())
        .replace("{groupField}", field_name)
        .replace("{field}", field_name)
        .replace("{groupValue}", display_value)
        .replace("{value}", display_value)
        .replace("{count}", &group_count.to_string())
}

fn build_flat_export_output(accounts: &[Account], config: &ExportConfig) -> String {
    let mut output = String::new();
    for account in accounts {
        output.push_str(&build_account_export_line(account, config));
        output.push('\n');
    }
    output
}

fn build_grouped_export_output(
    accounts: Vec<Account>,
    config: &ExportConfig,
    group_field: ExportField,
) -> String {
    let mut grouped_accounts: std::collections::HashMap<String, Vec<Account>> =
        std::collections::HashMap::new();
    for account in accounts {
        let group_key = group_field.export_value(&account);
        grouped_accounts.entry(group_key).or_default().push(account);
    }

    let mut group_keys: Vec<String> = grouped_accounts.keys().cloned().collect();
    group_keys.sort();
    if SortDirection::from_config(config.category_sort.direction.as_deref()) == SortDirection::Desc
    {
        group_keys.reverse();
    }

    let group_label_template = config
        .category_label_template
        .as_deref()
        .map(str::trim)
        .filter(|template| !template.is_empty())
        .unwrap_or(DEFAULT_GROUP_LABEL_TEMPLATE);

    let mut output = String::new();
    let group_count = group_keys.len();
    for (index, group_key) in group_keys.into_iter().enumerate() {
        let Some(accounts_in_group) = grouped_accounts.remove(&group_key) else {
            continue;
        };

        output.push_str(&render_group_label(
            group_label_template,
            group_field,
            &group_key,
            accounts_in_group.len(),
            index + 1,
        ));
        output.push('\n');

        for account in &accounts_in_group {
            output.push_str(&build_account_export_line(account, config));
            output.push('\n');
        }

        if index + 1 < group_count {
            output.push('\n');
        }
    }

    output
}

fn build_export_accounts_output(mut accounts: Vec<Account>, config: &ExportConfig) -> String {
    apply_export_sort(&mut accounts, config);

    if let Some(group_field) = ExportField::from_config(config.category_sort.field.as_deref()) {
        return build_grouped_export_output(accounts, config, group_field);
    }

    build_flat_export_output(&accounts, config)
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
