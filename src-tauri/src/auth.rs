use rand::{distributions::Alphanumeric, Rng};
use std::sync::{Mutex, OnceLock};
use subtle::ConstantTimeEq;

const MAX_FAILED_ATTEMPTS: u8 = 3;
const BAN_DURATION_SECS: i64 = 24 * 60 * 60;
const SESSION_TTL_SECS: i64 = 7 * 24 * 60 * 60;

#[derive(Default)]
struct AuthState {
    failed_attempts: u8,
    banned_until_epoch_secs: Option<i64>,
    session_token: Option<String>,
    session_expires_epoch_secs: Option<i64>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct AuthResult {
    pub success: bool,
    pub banned: bool,
    pub message: String,
    pub session_token: Option<String>,
    pub expires_at_epoch_secs: Option<i64>,
}

fn state() -> &'static Mutex<AuthState> {
    static STATE: OnceLock<Mutex<AuthState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(AuthState::default()))
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

fn clear_session(auth: &mut AuthState) {
    auth.session_token = None;
    auth.session_expires_epoch_secs = None;
}

fn sync_expired_state(auth: &mut AuthState, now: i64) {
    if let Some(until) = auth.banned_until_epoch_secs {
        if until <= now {
            auth.banned_until_epoch_secs = None;
        }
    }
    if let Some(expires_at) = auth.session_expires_epoch_secs {
        if expires_at <= now {
            clear_session(auth);
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
    let mut auth = state().lock().map_err(|e| e.to_string())?;
    sync_expired_state(&mut auth, now);

    if let Some(until) = auth.banned_until_epoch_secs {
        if until > now {
            return Ok(AuthResult {
                success: false,
                banned: true,
                message: "账号已被封禁，请稍后再试".to_string(),
                session_token: None,
                expires_at_epoch_secs: None,
            });
        }
    }

    let provided = session_token.map(str::trim).filter(|v| !v.is_empty());
    let active = auth.session_token.clone();
    let expires_at = auth.session_expires_epoch_secs;

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

pub fn login(password: &str) -> Result<AuthResult, String> {
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
    let mut auth = state().lock().map_err(|e| e.to_string())?;
    sync_expired_state(&mut auth, now);

    if let Some(until) = auth.banned_until_epoch_secs {
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
        auth.failed_attempts = 0;
        auth.banned_until_epoch_secs = None;
        let token = new_session_token();
        let expires_at = now + SESSION_TTL_SECS;
        auth.session_token = Some(token.clone());
        auth.session_expires_epoch_secs = Some(expires_at);
        return Ok(AuthResult {
            success: true,
            banned: false,
            message: "登录成功".to_string(),
            session_token: Some(token),
            expires_at_epoch_secs: Some(expires_at),
        });
    }

    auth.failed_attempts = auth.failed_attempts.saturating_add(1);
    if auth.failed_attempts >= MAX_FAILED_ATTEMPTS {
        auth.failed_attempts = 0;
        auth.banned_until_epoch_secs = Some(now + BAN_DURATION_SECS);
        clear_session(&mut auth);
        return Ok(AuthResult {
            success: false,
            banned: true,
            message: "密码错误次数过多，已封禁 24 小时".to_string(),
            session_token: None,
            expires_at_epoch_secs: None,
        });
    }

    Ok(AuthResult {
        success: false,
        banned: false,
        message: format!(
            "密码错误，还可尝试 {} 次",
            MAX_FAILED_ATTEMPTS - auth.failed_attempts
        ),
        session_token: None,
        expires_at_epoch_secs: None,
    })
}

pub fn logout(session_token: Option<&str>) -> Result<(), String> {
    let mut auth = state().lock().map_err(|e| e.to_string())?;
    let provided = session_token.map(str::trim).filter(|v| !v.is_empty());
    if provided.is_none() {
        clear_session(&mut auth);
        return Ok(());
    }

    if let (Some(input), Some(current)) = (provided, auth.session_token.as_deref()) {
        if input == current {
            clear_session(&mut auth);
            return Ok(());
        }
    }

    Err("会话无效，退出失败".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn test_guard() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .expect("test lock poisoned")
    }

    fn reset_state() {
        let mut auth = state().lock().expect("auth lock poisoned");
        auth.failed_attempts = 0;
        auth.banned_until_epoch_secs = None;
        auth.session_token = None;
        auth.session_expires_epoch_secs = None;
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

        let result = login("anything").unwrap();
        assert!(!result.success);
        assert!(!result.banned);
        assert!(result.message.contains("GOOGLE_MANAGER_ADMIN_PASSWORD"));
    }

    #[test]
    fn require_auth_should_reject_invalid_token() {
        let _guard = test_guard();
        std::env::set_var("GOOGLE_MANAGER_ADMIN_PASSWORD", "test-pass-123");
        reset_state();

        let login_result = login("test-pass-123").unwrap();
        assert!(login_result.success);
        let valid_token = login_result.session_token.unwrap();

        assert!(require_auth(Some(&valid_token)).is_ok());
        assert!(require_auth(Some("invalid-token")).is_err());
    }

    #[test]
    fn login_should_ban_after_three_failures() {
        let _guard = test_guard();
        std::env::set_var("GOOGLE_MANAGER_ADMIN_PASSWORD", "test-pass-123");
        reset_state();

        let r1 = login("wrong").unwrap();
        assert!(!r1.success);
        assert!(!r1.banned);

        let r2 = login("wrong").unwrap();
        assert!(!r2.success);
        assert!(!r2.banned);

        let r3 = login("wrong").unwrap();
        assert!(!r3.success);
        assert!(r3.banned);

        let status = check_auth(None).unwrap();
        assert!(!status.success);
        assert!(status.banned);
    }
}
