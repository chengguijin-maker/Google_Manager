# 迁移成功评价标准与测试方案

## 一、成功标准 (Success Criteria)

### 1. 功能完整性 (Functional Parity)

| 功能 | Flask 版本 | Tauri 版本 | 验收标准 |
|------|------------|------------|----------|
| 账号列表 | ✓ | ☐ | 能正确显示所有账号 |
| 创建账号 | ✓ | ☐ | 能创建新账号并持久化 |
| 编辑账号 | ✓ | ☐ | 能修改账号信息 |
| 删除账号 | ✓ | ☐ | 能删除账号 |
| 搜索功能 | ✓ | ☐ | 按邮箱/备注搜索正常 |
| 状态筛选 | ✓ | ☐ | 已售/未售筛选正常 |
| 批量导入 | ✓ | ☐ | 多种分隔符解析正确 |
| TOTP 生成 | ✓ | ☐ | 验证码与 Google 一致 |
| 修改历史 | ✓ | ☐ | 历史记录完整准确 |
| 暗色模式 | ✓ | ☐ | 主题切换正常 |
| 分页功能 | ✓ | ☐ | 分页逻辑正确 |

**通过标准: 100% 功能覆盖**

---

### 2. 性能指标 (Performance Metrics)

| 指标 | Flask 基准 | Tauri 目标 | 测试方法 |
|------|------------|------------|----------|
| 冷启动时间 | ~3s | < 1s | 计时器测量 |
| 列表加载 (1000条) | ~500ms | < 200ms | Performance API |
| TOTP 生成 | ~50ms | < 10ms | 多次取平均 |
| 内存占用 | ~100MB | < 50MB | 任务管理器 |
| 安装包大小 | N/A | < 20MB | 构建产物 |

---

### 3. 数据完整性 (Data Integrity)

| 检查项 | 验收标准 |
|--------|----------|
| 数据迁移 | 旧数据 100% 正确迁移 |
| 字段映射 | 所有字段正确对应 |
| 编码处理 | 中文/特殊字符无乱码 |
| 时间戳 | 时区处理正确 |

---

### 4. 跨平台兼容性 (Cross-Platform)

| 平台 | 测试项 |
|------|--------|
| **Windows 10+** | 安装、运行、托盘、自启动 |
| **macOS 12+** | 安装、运行、托盘、权限 |
| **Linux (Ubuntu 22.04)** | 安装、运行、依赖检查 |

---

## 二、测试方案

### Phase 1: 单元测试 (Rust 后端)

#### 1.1 数据库测试

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_database_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn test_create_account() {
        let conn = setup_test_db();
        let account = Account {
            email: "test@gmail.com".to_string(),
            password: "pass123".to_string(),
            ..Default::default()
        };

        let result = create_account(&conn, account);
        assert!(result.is_ok());

        let saved = get_account_by_id(&conn, result.unwrap().id);
        assert_eq!(saved.email, "test@gmail.com");
    }

    #[test]
    fn test_duplicate_email_rejected() {
        let conn = setup_test_db();
        create_account(&conn, Account { email: "dup@gmail.com".into(), .. });

        let result = create_account(&conn, Account { email: "dup@gmail.com".into(), .. });
        assert!(result.is_err());
    }

    #[test]
    fn test_search_accounts() {
        let conn = setup_test_db();
        create_account(&conn, Account { email: "alice@gmail.com".into(), .. });
        create_account(&conn, Account { email: "bob@gmail.com".into(), .. });

        let results = search_accounts(&conn, "alice");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].email, "alice@gmail.com");
    }
}
```

#### 1.2 TOTP 测试

```rust
#[test]
fn test_totp_generation() {
    // 使用已知的测试密钥
    let secret = "JBSWY3DPEHPK3PXP"; // Base32 encoded
    let result = generate_totp(secret.to_string());

    assert!(result.is_ok());
    let totp = result.unwrap();
    assert_eq!(totp.code.len(), 6);
    assert!(totp.remaining <= 30);
}

#[test]
fn test_totp_with_spaces() {
    // 确保空格被正确处理
    let secret = "JBSW Y3DP EHPK 3PXP";
    let result = generate_totp(secret.to_string());
    assert!(result.is_ok());
}

#[test]
fn test_totp_consistency() {
    // 验证与 pyotp 生成的结果一致
    let secret = "JBSWY3DPEHPK3PXP";

    // 在同一时间窗口内多次调用应返回相同结果
    let code1 = generate_totp(secret.to_string()).unwrap().code;
    let code2 = generate_totp(secret.to_string()).unwrap().code;
    assert_eq!(code1, code2);
}
```

#### 1.3 历史记录测试

```rust
#[test]
fn test_history_on_update() {
    let conn = setup_test_db();
    let account = create_account(&conn, Account {
        email: "test@gmail.com".into(),
        password: "old_pass".into(),
        ..Default::default()
    }).unwrap();

    update_account(&conn, account.id, Account {
        password: "new_pass".into(),
        ..account.clone()
    });

    let history = get_account_history(&conn, account.id);
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].field_name, "password");
    assert_eq!(history[0].old_value, Some("old_pass".to_string()));
    assert_eq!(history[0].new_value, Some("new_pass".to_string()));
}
```

---

### Phase 2: 集成测试 (Tauri Commands)

```rust
#[cfg(test)]
mod integration_tests {
    use tauri::test::{mock_builder, MockRuntime};

    #[test]
    fn test_get_accounts_command() {
        let app = mock_builder().build().unwrap();
        let window = app.get_window("main").unwrap();

        // 模拟前端调用
        let result: Vec<Account> = window.invoke("get_accounts", ()).unwrap();
        assert!(result.is_empty()); // 初始为空
    }

    #[test]
    fn test_full_crud_flow() {
        let app = mock_builder().build().unwrap();
        let window = app.get_window("main").unwrap();

        // Create
        let created: Account = window.invoke("create_account", Account {
            email: "test@gmail.com".into(),
            password: "pass".into(),
            ..Default::default()
        }).unwrap();
        assert!(created.id > 0);

        // Read
        let list: Vec<Account> = window.invoke("get_accounts", ()).unwrap();
        assert_eq!(list.len(), 1);

        // Update
        let updated: Account = window.invoke("update_account", (created.id, Account {
            password: "new_pass".into(),
            ..created.clone()
        })).unwrap();
        assert_eq!(updated.password, "new_pass");

        // Delete
        let _: () = window.invoke("delete_account", created.id).unwrap();
        let final_list: Vec<Account> = window.invoke("get_accounts", ()).unwrap();
        assert!(final_list.is_empty());
    }
}
```

---

### Phase 3: 端到端测试 (E2E)

使用 Playwright + Tauri WebDriver：

```typescript
// tests/e2e/accounts.spec.ts
import { test, expect } from '@playwright/test';

test.describe('账号管理', () => {
  test('创建账号流程', async ({ page }) => {
    // 点击导入按钮
    await page.click('[data-testid="import-btn"]');

    // 填写表单
    await page.fill('[data-testid="email-input"]', 'test@gmail.com');
    await page.fill('[data-testid="password-input"]', 'testpass');
    await page.fill('[data-testid="secret-input"]', 'JBSWY3DPEHPK3PXP');

    // 提交
    await page.click('[data-testid="submit-btn"]');

    // 验证列表中出现新账号
    await expect(page.locator('text=test@gmail.com')).toBeVisible();
  });

  test('TOTP 生成验证', async ({ page }) => {
    // 点击生成 2FA
    await page.click('[data-testid="2fa-btn"]');

    // 验证显示 6 位验证码
    const code = await page.locator('[data-testid="totp-code"]').textContent();
    expect(code).toMatch(/^\d{6}$/);

    // 验证倒计时存在
    await expect(page.locator('[data-testid="countdown"]')).toBeVisible();
  });

  test('批量导入', async ({ page }) => {
    await page.click('[data-testid="import-btn"]');
    await page.click('[data-testid="batch-mode"]');

    // 输入批量数据
    await page.fill('[data-testid="batch-input"]', `
      acc1@gmail.com——pass1——rec1@gmail.com——SECRET1——备注1
      acc2@gmail.com——pass2——rec2@gmail.com——SECRET2——备注2
    `);

    await page.click('[data-testid="preview-btn"]');

    // 验证预览
    await expect(page.locator('text=acc1@gmail.com')).toBeVisible();
    await expect(page.locator('text=acc2@gmail.com')).toBeVisible();

    await page.click('[data-testid="confirm-import"]');

    // 验证导入成功提示
    await expect(page.locator('text=成功导入 2 个账号')).toBeVisible();
  });

  test('搜索和筛选', async ({ page }) => {
    // 搜索
    await page.fill('[data-testid="search-input"]', 'test');
    await page.waitForTimeout(300); // debounce

    // 验证结果过滤
    const rows = await page.locator('[data-testid="account-row"]').count();
    expect(rows).toBeGreaterThan(0);

    // 状态筛选
    await page.selectOption('[data-testid="status-filter"]', 'sold');
    await page.waitForTimeout(300);
  });

  test('修改历史', async ({ page }) => {
    // 点击历史按钮
    await page.click('[data-testid="history-btn"]');

    // 验证抽屉打开
    await expect(page.locator('[data-testid="history-drawer"]')).toBeVisible();

    // 验证历史记录存在
    await expect(page.locator('[data-testid="history-item"]').first()).toBeVisible();
  });
});
```

---

### Phase 4: 数据迁移验证

```bash
#!/bin/bash
# scripts/verify-migration.sh

echo "=== 数据迁移验证 ==="

# 1. 对比记录数
OLD_COUNT=$(sqlite3 instance/accounts.db "SELECT COUNT(*) FROM accounts")
NEW_COUNT=$(sqlite3 ~/.googlemanager/data.db "SELECT COUNT(*) FROM accounts")

echo "旧数据库账号数: $OLD_COUNT"
echo "新数据库账号数: $NEW_COUNT"

if [ "$OLD_COUNT" != "$NEW_COUNT" ]; then
    echo "❌ 记录数不匹配!"
    exit 1
fi

# 2. 抽样校验
echo ""
echo "=== 抽样校验 (前5条) ==="

sqlite3 instance/accounts.db "SELECT id, email FROM accounts LIMIT 5" > /tmp/old_sample.txt
sqlite3 ~/.googlemanager/data.db "SELECT id, email FROM accounts LIMIT 5" > /tmp/new_sample.txt

if diff /tmp/old_sample.txt /tmp/new_sample.txt; then
    echo "✓ 抽样数据一致"
else
    echo "❌ 抽样数据不一致!"
    exit 1
fi

# 3. 历史记录验证
OLD_HISTORY=$(sqlite3 instance/accounts.db "SELECT COUNT(*) FROM account_history")
NEW_HISTORY=$(sqlite3 ~/.googlemanager/data.db "SELECT COUNT(*) FROM account_history")

echo ""
echo "历史记录数 - 旧: $OLD_HISTORY, 新: $NEW_HISTORY"

if [ "$OLD_HISTORY" != "$NEW_HISTORY" ]; then
    echo "❌ 历史记录数不匹配!"
    exit 1
fi

echo ""
echo "✅ 数据迁移验证通过!"
```

---

### Phase 5: 性能基准测试

```typescript
// tests/benchmark/performance.ts
import { performance } from 'perf_hooks';

async function benchmarkColdStart() {
  const start = performance.now();

  // 启动应用
  const app = await startTauriApp();
  await app.waitForSelector('[data-testid="account-list"]');

  const duration = performance.now() - start;
  console.log(`冷启动时间: ${duration}ms`);

  expect(duration).toBeLessThan(1000); // < 1s

  await app.close();
}

async function benchmarkListLoad() {
  // 准备 1000 条测试数据
  await seedTestData(1000);

  const start = performance.now();
  const accounts = await invoke('get_accounts', {});
  const duration = performance.now() - start;

  console.log(`加载 1000 条数据: ${duration}ms`);
  expect(duration).toBeLessThan(200); // < 200ms
}

async function benchmarkTotpGeneration() {
  const iterations = 100;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    await invoke('generate_totp', { secret: 'JBSWY3DPEHPK3PXP' });
  }

  const avgDuration = (performance.now() - start) / iterations;
  console.log(`TOTP 生成平均耗时: ${avgDuration}ms`);
  expect(avgDuration).toBeLessThan(10); // < 10ms
}
```

---

### Phase 6: 跨平台验证清单

#### Windows

- [ ] 安装程序 (.msi/.exe) 正常运行
- [ ] 开机自启动配置正常
- [ ] 系统托盘图标显示正确
- [ ] 右键菜单功能正常
- [ ] 高 DPI 显示正常
- [ ] 中文路径处理正常

#### macOS

- [ ] .dmg 安装正常
- [ ] 应用签名验证通过
- [ ] 系统权限请求正常
- [ ] Dock 图标显示正确
- [ ] 菜单栏托盘正常
- [ ] M1/M2 芯片兼容

#### Linux

- [ ] AppImage 可执行
- [ ] .deb 包安装正常
- [ ] 系统托盘适配
- [ ] 桌面文件关联正常
- [ ] GTK/Qt 主题适配

---

## 三、测试执行计划

| 阶段 | 测试类型 | 工具 | 自动化 | 时间 |
|------|----------|------|--------|------|
| 1 | 单元测试 (Rust) | cargo test | ✓ | 30min |
| 2 | 集成测试 | Tauri Test | ✓ | 30min |
| 3 | E2E 测试 | Playwright | ✓ | 1h |
| 4 | 数据迁移验证 | Bash Script | ✓ | 15min |
| 5 | 性能测试 | 自定义脚本 | ✓ | 30min |
| 6 | 跨平台验证 | 手动 | ✗ | 2h |

**总计: 约 5 小时**

---

## 四、验收检查表 (Go/No-Go)

### 必须通过 (Blocker)

- [ ] 所有功能测试通过 (100%)
- [ ] 数据迁移验证通过
- [ ] 冷启动时间 < 1s
- [ ] 无数据丢失或损坏
- [ ] 主平台 (Windows/macOS) 测试通过

### 建议通过 (Nice-to-have)

- [ ] Linux 平台测试通过
- [ ] 内存占用 < 50MB
- [ ] 安装包 < 20MB
- [ ] 性能基准全部达标

---

## 五、回滚方案

如果迁移失败，执行以下步骤：

1. **保留旧版本**
   ```bash
   # 迁移前备份
   cp -r Google_Manager Google_Manager_backup
   ```

2. **数据库备份**
   ```bash
   cp instance/accounts.db instance/accounts.db.backup
   ```

3. **快速回滚**
   ```bash
   # 如果迁移失败
   cd Google_Manager_backup
   make dev  # 恢复旧版本运行
   ```

4. **用户通知**
   - 提供旧版本下载链接
   - 说明已知问题和修复计划
