use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::OnceLock;

use base64::{engine::general_purpose, Engine as _};
use rand::RngCore;

static MASTER_KEY_CACHE: OnceLock<Result<[u8; 32], String>> = OnceLock::new();

fn key_file_path() -> PathBuf {
    let mut path = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("googlemanager");
    if let Err(e) = fs::create_dir_all(&path) {
        log::error!("创建数据目录失败: {}", e);
    }
    path.push("master.key");
    path
}

fn parse_env_key(raw: &str) -> Result<[u8; 32], String> {
    let trimmed = raw.trim();
    let bytes = if trimmed.len() == 64 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        (0..trimmed.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&trimmed[i..i + 2], 16))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("环境变量主密钥 hex 解析失败: {}", e))?
    } else {
        general_purpose::STANDARD
            .decode(trimmed)
            .map_err(|e| format!("环境变量主密钥 Base64 解析失败: {}", e))?
    };

    if bytes.len() != 32 {
        return Err("环境变量主密钥长度必须是 32 字节".to_string());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&bytes);
    Ok(key)
}

fn read_or_create_key_file() -> Result<[u8; 32], String> {
    let key_path = key_file_path();
    if key_path.exists() {
        let mut data = Vec::new();
        let mut file =
            fs::File::open(&key_path).map_err(|e| format!("读取主密钥文件失败: {}", e))?;
        file.read_to_end(&mut data)
            .map_err(|e| format!("读取主密钥文件失败: {}", e))?;
        if data.len() != 32 {
            return Err("主密钥文件长度非法，期望 32 字节".to_string());
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&data);
        return Ok(key);
    }

    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);

    let mut options = OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    let mut file = options
        .open(&key_path)
        .map_err(|e| format!("创建主密钥文件失败: {}", e))?;
    file.write_all(&key)
        .map_err(|e| format!("写入主密钥文件失败: {}", e))?;
    file.sync_all()
        .map_err(|e| format!("刷新主密钥文件失败: {}", e))?;
    Ok(key)
}

pub fn get_master_key() -> Result<[u8; 32], String> {
    MASTER_KEY_CACHE
        .get_or_init(|| {
            if let Ok(env_key) = std::env::var("GOOGLE_MANAGER_MASTER_KEY") {
                parse_env_key(&env_key)
            } else {
                read_or_create_key_file()
            }
        })
        .clone()
}
