use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use rand::RngCore;

const V2_PREFIX: &str = "v2";

/// 加密 2FA 密钥（使用 AES-256-GCM）
pub fn encrypt_secret(secret: &str, master_key: &[u8; 32]) -> Result<String, String> {
    let cipher = Aes256Gcm::new(master_key.into());
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, secret.as_bytes())
        .map_err(|e| format!("加密失败: {}", e))?;

    let nonce_b64 = general_purpose::STANDARD.encode(nonce_bytes);
    let payload_b64 = general_purpose::STANDARD.encode(ciphertext);
    Ok(format!("{}:{}:{}", V2_PREFIX, nonce_b64, payload_b64))
}

/// 解密 2FA 密钥
pub fn decrypt_secret(encrypted: &str, master_key: &[u8; 32]) -> Result<String, String> {
    if let Some(rest) = encrypted.strip_prefix(&(V2_PREFIX.to_string() + ":")) {
        return decrypt_v2(rest, master_key);
    }
    Err("密文字段版本不受支持，仅允许 v2".to_string())
}

fn decrypt_v2(encoded: &str, master_key: &[u8; 32]) -> Result<String, String> {
    let mut parts = encoded.splitn(2, ':');
    let nonce_part = parts.next().ok_or_else(|| "缺少 nonce".to_string())?;
    let ciphertext_part = parts.next().ok_or_else(|| "缺少密文".to_string())?;

    let nonce_bytes = general_purpose::STANDARD
        .decode(nonce_part)
        .map_err(|e| format!("Nonce Base64 解码失败: {}", e))?;
    if nonce_bytes.len() != 12 {
        return Err("Nonce 长度非法".to_string());
    }

    let ciphertext = general_purpose::STANDARD
        .decode(ciphertext_part)
        .map_err(|e| format!("密文 Base64 解码失败: {}", e))?;

    let cipher = Aes256Gcm::new(master_key.into());
    let nonce = Nonce::from_slice(&nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| format!("解密失败: {}", e))?;

    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 转换失败: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_secret() {
        let secret = "JBSWY3DPEHPK3PXP";
        let master_key = [0x11u8; 32];

        let encrypted = encrypt_secret(secret, &master_key).unwrap();
        let decrypted = decrypt_secret(&encrypted, &master_key).unwrap();

        assert_eq!(secret, decrypted);
        assert!(encrypted.starts_with("v2:"));
    }

    #[test]
    fn test_decrypt_with_wrong_key() {
        let secret = "JBSWY3DPEHPK3PXP";
        let key1 = [0x22u8; 32];
        let key2 = [0x33u8; 32];

        let encrypted = encrypt_secret(secret, &key1).unwrap();
        let result = decrypt_secret(&encrypted, &key2);

        assert!(result.is_err());
    }

    #[test]
    fn test_v2_nonce_is_random() {
        let secret = "JBSWY3DPEHPK3PXP";
        let master_key = [0x44u8; 32];
        let enc1 = encrypt_secret(secret, &master_key).unwrap();
        let enc2 = encrypt_secret(secret, &master_key).unwrap();
        assert_ne!(enc1, enc2);
    }
}
