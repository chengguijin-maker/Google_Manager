use rand::{distributions::Alphanumeric, Rng};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use subtle::ConstantTimeEq;

const MAX_FAILED_ATTEMPTS: u8 = 3;
const BAN_DURATION_SECS: i64 = 24 * 60 * 60;
const SESSION_TTL_SECS: i64 = 7 * 24 * 60 * 60;

#[derive(Default)]
struct IpBanEntry {
    failed_attempts: u8,
    banned_until_epoch_secs: Option<i64>,
}

#[derive(Default)]
struct GlobalState {
    session_token: Option<String>,
    session_expires_epoch_secs: Option<i64>,
    ip_bans: HashMap<String, IpBanEntry>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct AuthResult {
    pub success: bool,
    pub banned: bool,
    pub message: String,
    pub session_token: Option<String>,
    pub expires_at_epoch_secs: Option<i64>,
}

fn state() -> &'static Mutex<GlobalState> {
    static STATE: OnceLock<Mutex<GlobalState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(GlobalState::default()))
}

fn now_epoch_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

fn admin_password() -> Result<String, String> {
    let value = std::env::var("GOOGLE_MANAGER_ADMIN_PASSWORD")
        .map_err(|_| "系统未配置 GOOGLE_MANAGER_ADMIN_PASSWORD，禁止登录".to_string())?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("GOOGLE_MANAGER_ADMIN_PASSWORD 不能为空，禁止登录".to_string());
    }
    Ok(trimmed.to_string())
}

fn new_session_token() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(64)
        .map(char::from)
        .collect()
}

fn clear_session(state: &mut GlobalState) {
    state.session_token = None;
    state.session_expires_epoch_secs = None;
}

fn sync_expired_state(state: &mut GlobalState, now: i64) {
    // 清理过期封禁和过期 session
    state.ip_bans.retain(|_, entry| {
        if let Some(until) = entry.banned_until_epoch_secs {
            if until <= now {
                entry.banned_until_epoch_secs = None;
            }
        }
        // 保留仍封禁中或有待计数的条目，其余丢弃防止无限增长
        entry.banned_until_epoch_secs.is_some() || entry.failed_attempts > 0
    });
    if let Some(expires_at) = state.session_expires_epoch_secs {
        if expires_at <= now {
            clear_session(state);
        }
    }
}

pub fn check_auth(session_token: Option<&str>) -> Result<AuthResult, String> {
    if let Err(message) = admin_password() {
        return Ok(AuthResult {
            success: false,
            banned: false,
            message,
            session_token: None,
            expires_at_epoch_secs: None,
        });
    }

    let now = now_epoch_secs();
    let mut gs = state().lock().map_err(|e| e.to_string())?;
    sync_expired_state(&mut gs, now);

    let provided = session_token.map(str::trim).filter(|v| !v.is_empty());
    let active = gs.session_token.clone();
    let expires_at = gs.session_expires_epoch_secs;

    match (provided, active, expires_at) {
        (Some(input), Some(current), Some(expires_at)) if input == current => Ok(AuthResult {
            success: true,
            banned: false,
            message: "已登录".to_string(),
            session_token: Some(current),
            expires_at_epoch_secs: Some(expires_at),
        }),
        _ => Ok(AuthResult {
            success: false,
            banned: false,
            message: "未登录或会话已失效，请重新登录".to_string(),
            session_token: None,
            expires_at_epoch_secs: None,
        }),
    }
}

pub fn require_auth(session_token: Option<&str>) -> Result<(), String> {
    let result = check_auth(session_token)?;
    if result.success {
        return Ok(());
    }
    Err(result.message)
}

pub fn login(password: &str, client_ip: &str) -> Result<AuthResult, String> {
    let configured_password = match admin_password() {
        Ok(value) => value,
        Err(message) => {
            return Ok(AuthResult {
                success: false,
                banned: false,
                message,
                session_token: None,
                expires_at_epoch_secs: None,
            });
        }
    };

    let now = now_epoch_secs();
    let mut gs = state().lock().map_err(|e| e.to_string())?;
    sync_expired_state(&mut gs, now);

    let entry = gs.ip_bans.entry(client_ip.to_string()).or_default();

    if let Some(until) = entry.banned_until_epoch_secs {
        if until > now {
            return Ok(AuthResult {
                success: false,
                banned: true,
                message: "密码错误次数过多，已封禁 24 小时".to_string(),
                session_token: None,
                expires_at_epoch_secs: None,
            });
        }
    }

    if password
        .as_bytes()
        .ct_eq(configured_password.as_bytes())
        .into()
    {
        // 登录成功：清除该 IP 的错误记录
        gs.ip_bans.remove(client_ip);
        let token = new_session_token();
        let expires_at = now + SESSION_TTL_SECS;
        gs.session_token = Some(token.clone());
        gs.session_expires_epoch_secs = Some(expires_at);
        return Ok(AuthResult {
            success: true,
            banned: false,
            message: "登录成功".to_string(),
            session_token: Some(token),
            expires_at_epoch_secs: Some(expires_at),
        });
    }

    let entry = gs.ip_bans.entry(client_ip.to_string()).or_default();
    entry.failed_attempts = entry.failed_attempts.saturating_add(1);
    if entry.failed_attempts >= MAX_FAILED_ATTEMPTS {
        entry.failed_attempts = 0;
        entry.banned_until_epoch_secs = Some(now + BAN_DURATION_SECS);
        // 封禁该 IP 时同时踢出当前 session
        clear_session(&mut gs);
        return Ok(AuthResult {
            success: false,
            banned: true,
            message: "密码错误次数过多，已封禁 24 小时".to_string(),
            session_token: None,
            expires_at_epoch_secs: None,
        });
    }

    let remaining = MAX_FAILED_ATTEMPTS - gs.ip_bans[client_ip].failed_attempts;
    Ok(AuthResult {
        success: false,
        banned: false,
        message: format!("密码错误，还可尝试 {} 次", remaining),
        session_token: None,
        expires_at_epoch_secs: None,
    })
}

pub fn logout(session_token: Option<&str>) -> Result<(), String> {
    let mut gs = state().lock().map_err(|e| e.to_string())?;
    let provided = session_token.map(str::trim).filter(|v| !v.is_empty());
    if provided.is_none() {
        clear_session(&mut gs);
        return Ok(());
    }

    if let (Some(input), Some(current)) = (provided, gs.session_token.as_deref()) {
        if input == current {
            clear_session(&mut gs);
            return Ok(());
        }
    }

    Err("会话无效，退出失败".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    const TEST_IP: &str = "192.0.2.1";
    const OTHER_IP: &str = "192.0.2.2";

    fn test_guard() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .expect("test lock poisoned")
    }

    fn reset_state() {
        let mut gs = state().lock().expect("auth lock poisoned");
        gs.session_token = None;
        gs.session_expires_epoch_secs = None;
        gs.ip_bans.clear();
    }

    #[test]
    fn check_auth_without_session_should_fail() {
        let _guard = test_guard();
        std::env::set_var("GOOGLE_MANAGER_ADMIN_PASSWORD", "test-pass-123");
        reset_state();

        let result = check_auth(None).unwrap();
        assert!(!result.success);
        assert!(!result.banned);
        assert!(result.message.contains("未登录"));
    }

    #[test]
    fn login_without_config_should_fail_closed() {
        let _guard = test_guard();
        std::env::remove_var("GOOGLE_MANAGER_ADMIN_PASSWORD");
        reset_state();

        let result = login("anything", TEST_IP).unwrap();
        assert!(!result.success);
        assert!(!result.banned);
        assert!(result.message.contains("GOOGLE_MANAGER_ADMIN_PASSWORD"));
    }

    #[test]
    fn require_auth_should_reject_invalid_token() {
        let _guard = test_guard();
        std::env::set_var("GOOGLE_MANAGER_ADMIN_PASSWORD", "test-pass-123");
        reset_state();

        let login_result = login("test-pass-123", TEST_IP).unwrap();
        assert!(login_result.success);
        let valid_token = login_result.session_token.unwrap();

        assert!(require_auth(Some(&valid_token)).is_ok());
        assert!(require_auth(Some("invalid-token")).is_err());
    }

    #[test]
    fn login_should_ban_ip_after_three_failures() {
        let _guard = test_guard();
        std::env::set_var("GOOGLE_MANAGER_ADMIN_PASSWORD", "test-pass-123");
        reset_state();

        let r1 = login("wrong", TEST_IP).unwrap();
        assert!(!r1.success);
        assert!(!r1.banned);

        let r2 = login("wrong", TEST_IP).unwrap();
        assert!(!r2.success);
        assert!(!r2.banned);

        let r3 = login("wrong", TEST_IP).unwrap();
        assert!(!r3.success);
        assert!(r3.banned);
    }

    #[test]
    fn ban_should_not_affect_other_ip() {
        let _guard = test_guard();
        std::env::set_var("GOOGLE_MANAGER_ADMIN_PASSWORD", "test-pass-123");
        reset_state();

        // TEST_IP 连续失败 3 次被封禁
        for _ in 0..3 {
            login("wrong", TEST_IP).unwrap();
        }

        // OTHER_IP 仍可正常尝试
        let result = login("wrong", OTHER_IP).unwrap();
        assert!(!result.success);
        assert!(!result.banned);
    }

    #[test]
    fn successful_login_clears_ip_ban_counter() {
        let _guard = test_guard();
        std::env::set_var("GOOGLE_MANAGER_ADMIN_PASSWORD", "test-pass-123");
        reset_state();

        login("wrong", TEST_IP).unwrap();
        login("wrong", TEST_IP).unwrap();
        // 第 3 次用正确密码，计数应清零且不封禁
        let result = login("test-pass-123", TEST_IP).unwrap();
        assert!(result.success);
        assert!(!result.banned);
    }
}
