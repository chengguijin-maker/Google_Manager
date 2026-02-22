import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
const API_URL = process.env.E2E_API_URL || 'http://127.0.0.1:3001/api';
const HEADLESS = process.env.E2E_HEADLESS !== 'false';
const TIMEOUT = Number(process.env.E2E_TIMEOUT_MS || 12000);
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.GOOGLE_MANAGER_ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  throw new Error('请设置 E2E_ADMIN_PASSWORD 或 GOOGLE_MANAGER_ADMIN_PASSWORD');
}
const SESSION_TOKEN_KEY = 'gm_session_token';

const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-');
const runPrefix = `ui43_${Date.now().toString(36)}`;

const results = [];
const requestLog = [];
const consoleErrors = [];

const contextState = {
  runPrefix,
  seed: {},
  perf: null,
};
let apiSessionToken = null;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function ensureApiSessionToken() {
  if (apiSessionToken) return apiSessionToken;
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  const payload = await response.json().catch(() => null);
  const auth = payload?.data ?? payload;
  const token = auth?.session_token ?? auth?.sessionToken;
  ensure(response.ok, `E2E 种子登录失败: ${response.status}`);
  ensure(auth?.success === true, `E2E 种子登录被拒绝: ${auth?.message || 'unknown'}`);
  ensure(typeof token === 'string' && token.length > 0, 'E2E 种子登录未返回 session token');
  apiSessionToken = token;
  return apiSessionToken;
}

async function apiRequest(pathname, { method = 'GET', body } = {}) {
  const token = await ensureApiSessionToken();
  const response = await fetch(`${API_URL}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      apiSessionToken = null;
    }
    throw new Error(`API ${method} ${pathname} 失败: ${response.status} ${response.statusText} ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  }

  return payload;
}

function makeAccount(email, overrides = {}) {
  return {
    email,
    password: overrides.password || 'Pass@123456',
    recovery: overrides.recovery || '',
    phone: overrides.phone || '',
    secret: overrides.secret || '',
    reg_year: overrides.reg_year || '',
    country: overrides.country || '',
    group_name: overrides.group_name || '',
    remark: overrides.remark || '',
  };
}

async function seedData() {
  const totpSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  const tagGroup = `${runPrefix}_tag_group`;
  const ePrefix = `${runPrefix}_e_case_`;
  const statusEmail = `${runPrefix}_l_status@gmail.com`;
  const historyEmail = `${runPrefix}_j_history@gmail.com`;

  const accounts = [];

  accounts.push(makeAccount(`${runPrefix}_c_tag_01@gmail.com`, { group_name: tagGroup, remark: 'c03-tag' }));
  accounts.push(makeAccount(`${runPrefix}_c_tag_02@gmail.com`, { group_name: tagGroup, remark: 'c03-tag' }));

  for (let i = 1; i <= 6; i += 1) {
    accounts.push(makeAccount(`${ePrefix}${String(i).padStart(2, '0')}@gmail.com`, { remark: `e-case-${i}` }));
  }

  for (let i = 1; i <= 15; i += 1) {
    accounts.push(makeAccount(`${runPrefix}_i_page_${String(i).padStart(2, '0')}@gmail.com`, { remark: `i-case-${i}` }));
  }

  accounts.push(makeAccount(`${runPrefix}_d_delete@gmail.com`, { remark: 'd-delete', secret: totpSecret }));
  accounts.push(makeAccount(`${runPrefix}_d_undo@gmail.com`, { remark: 'd-undo', secret: totpSecret }));
  accounts.push(makeAccount(`${runPrefix}_d_edit@gmail.com`, { remark: '', secret: totpSecret, recovery: `${runPrefix}_d_edit_recovery@gmail.com` }));

  accounts.push(makeAccount(historyEmail, {
    recovery: `${runPrefix}_history_old@gmail.com`,
    secret: totpSecret,
    remark: 'history-target',
  }));

  accounts.push(makeAccount(statusEmail, {
    recovery: `${runPrefix}_status_recovery@gmail.com`,
    secret: totpSecret,
    remark: 'status-target',
  }));

  const payload = await apiRequest('/accounts/batch-import', {
    method: 'POST',
    body: { accounts },
  });

  const successCount = payload?.data?.success_count ?? payload?.data?.successCount ?? 0;
  ensure(successCount >= accounts.length, `预置数据导入不足: expected>=${accounts.length}, actual=${successCount}`);

  contextState.seed = {
    totpSecret,
    tagGroup,
    ePrefix,
    deleteEmail: `${runPrefix}_d_delete@gmail.com`,
    undoEmail: `${runPrefix}_d_undo@gmail.com`,
    editEmail: `${runPrefix}_d_edit@gmail.com`,
    historyEmail,
    statusEmail,
  };
}

async function resetServerData() {
  await apiRequest('/accounts/delete-all', { method: 'POST' });
  await apiRequest('/accounts/purge-all', { method: 'DELETE' });
}

async function runCase(id, name, fn) {
  const startedAt = Date.now();
  try {
    const note = await fn();
    const durationMs = Date.now() - startedAt;
    results.push({ id, name, status: 'PASS', durationMs, note: note || '' });
    console.log(`PASS ${id} ${name} (${durationMs}ms)`);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ id, name, status: 'FAIL', durationMs, note: message });
    console.error(`FAIL ${id} ${name} (${durationMs}ms): ${message}`);
  }
}

async function gotoHome(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(350);
}

async function login(page, password = ADMIN_PASSWORD) {
  const pwdInput = page.getByPlaceholder('请输入密码');
  await pwdInput.waitFor({ state: 'visible', timeout: TIMEOUT });
  await pwdInput.fill(password);
  await page.getByRole('button', { name: '进入系统' }).click();
  await page.getByRole('heading', { name: '账号库' }).waitFor({ state: 'visible', timeout: TIMEOUT });
}

async function ensureListPage(page) {
  const hasListHeading = await page.getByRole('heading', { name: '账号库' }).first().isVisible({ timeout: 1200 }).catch(() => false);
  if (hasListHeading) return;

  const hasLogin = await page.getByPlaceholder('请输入密码').isVisible({ timeout: 1200 }).catch(() => false);
  if (hasLogin) {
    await login(page);
    return;
  }

  const listTab = page.getByRole('button', { name: '账号列表' }).first();
  if (await listTab.isVisible({ timeout: 1200 }).catch(() => false)) {
    await listTab.click();
    await page.getByRole('heading', { name: '账号库' }).waitFor({ timeout: TIMEOUT });
  }
}

async function openImport(page, mode = 'single') {
  await ensureListPage(page);
  await page.getByRole('button', { name: '导入账号' }).first().click();
  await page.getByRole('heading', { name: '导入账号' }).waitFor({ state: 'visible', timeout: TIMEOUT });
  if (mode === 'batch') {
    await page.getByRole('button', { name: '批量导入' }).click();
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: TIMEOUT });
  } else {
    await page.getByRole('button', { name: '单个导入' }).click();
    await page.getByPlaceholder('example@gmail.com').waitFor({ state: 'visible', timeout: TIMEOUT });
  }
}

async function searchKeyword(page, keyword) {
  await ensureListPage(page);
  const searchInput = page.getByPlaceholder('搜索邮箱或备注内容...');
  await searchInput.fill(keyword);
  await page.waitForTimeout(450);
}

async function resetFilters(page) {
  await ensureListPage(page);

  const soldAllButton = page.getByRole('button', { name: '全部', exact: true }).first();
  if (await soldAllButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await soldAllButton.click();
  }

  const searchInput = page.getByPlaceholder('搜索邮箱或备注内容...');
  await searchInput.fill('');
  await page.waitForTimeout(350);

  const tagSelect = page.locator('select').filter({ has: page.locator('option', { hasText: '全部标签' }) }).first();
  if (await tagSelect.isVisible({ timeout: 800 }).catch(() => false)) {
    await tagSelect.selectOption('');
    await page.waitForTimeout(300);
  }
}

function rowByEmail(page, email) {
  return page.locator('tbody tr').filter({ has: page.getByText(email, { exact: true }) }).first();
}

async function expectRowVisible(page, email, timeout = TIMEOUT) {
  const row = rowByEmail(page, email);
  await row.waitFor({ state: 'visible', timeout });
  return row;
}

async function visibleDataRowCount(page) {
  return page.locator('tbody tr input[type="checkbox"]').count();
}

async function closeHistoryDrawer(page) {
  const drawer = page.locator('div.fixed.right-0.top-0.h-full').first();
  const isOpen = await drawer.isVisible({ timeout: 600 }).catch(() => false);
  if (!isOpen) return;

  const closeButton = drawer.locator('div.bg-gradient-to-r button').last();
  await closeButton.click({ force: true });
  await drawer.waitFor({ state: 'hidden', timeout: TIMEOUT }).catch(() => {});
}

async function batchImportThroughUI(page, text, options = {}) {
  const {
    expectedCount = null,
    expectMixedDialog = false,
  } = options;

  await openImport(page, 'batch');
  await page.locator('textarea').first().fill(text);
  await page.waitForTimeout(800);

  const mixedTitle = page.getByText('检测到多种导入格式');
  const hasMixedDialog = await mixedTitle.isVisible({ timeout: 1200 }).catch(() => false);
  if (expectMixedDialog) {
    ensure(hasMixedDialog, '预期出现“多种导入格式”对话框，但未出现');
  }
  if (hasMixedDialog) {
    await page.getByRole('button', { name: '确认导入' }).click();
  }

  if (expectedCount !== null) {
    const importBtn = page.getByRole('button', { name: new RegExp(`立即导入\\s*\\(${expectedCount}条\\)`) }).first();
    await importBtn.waitFor({ state: 'visible', timeout: TIMEOUT });
    await importBtn.click();
  } else {
    await page.getByRole('button', { name: /立即导入/ }).click();
  }

  await page.getByRole('heading', { name: '账号库' }).waitFor({ state: 'visible', timeout: TIMEOUT + 8000 });
  await page.waitForTimeout(600);
}

async function singleImportThroughUI(page, account) {
  await openImport(page, 'single');
  await page.getByPlaceholder('example@gmail.com').fill(account.email);
  await page.getByPlaceholder('输入密码').fill(account.password);
  if (account.recovery) await page.getByPlaceholder('recovery@example.com').fill(account.recovery);
  if (account.phone) await page.getByPlaceholder('默认+86，可填 +12192731268').fill(account.phone);
  if (account.secret) await page.getByPlaceholder('TOTP密钥').fill(account.secret);
  if (account.regYear) await page.getByPlaceholder('2021').fill(account.regYear);
  if (account.country) await page.getByPlaceholder('China / Japan / USA').fill(account.country);

  await page.getByRole('button', { name: '立即导入' }).click();
  await page.getByRole('heading', { name: '账号库' }).waitFor({ state: 'visible', timeout: TIMEOUT + 8000 });
  await page.waitForTimeout(600);
}

function buildBatchLine(email, password, recovery, secret, extra = []) {
  const parts = [email, password, recovery, secret, ...extra].filter(v => String(v ?? '').length > 0);
  return parts.join('----');
}

async function writeReport() {
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.length - passCount;

  const reportDir = path.join('e2e', 'reports');
  await fs.mkdir(reportDir, { recursive: true });

  const jsonPath = path.join(reportDir, `ui-regression-43-${stamp}.json`);
  const mdPath = path.join(reportDir, `ui-regression-43-${stamp}.md`);

  const payload = {
    generatedAt: new Date().toISOString(),
    runPrefix,
    baseUrl: BASE_URL,
    apiUrl: API_URL,
    passCount,
    failCount,
    total: results.length,
    results,
    perf: contextState.perf,
    consoleErrors,
    apiRequestCount: requestLog.length,
  };

  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf8');

  const lines = [];
  lines.push('# UI 回归结果（A-L 43 条）');
  lines.push('');
  lines.push(`- 生成时间: ${new Date().toISOString()}`);
  lines.push(`- Base URL: ${BASE_URL}`);
  lines.push(`- API URL: ${API_URL}`);
  lines.push(`- Run Prefix: ${runPrefix}`);
  lines.push(`- 结果: ${passCount}/${results.length} 通过，失败 ${failCount}`);
  if (contextState.perf) {
    lines.push(`- 性能: DCL ${contextState.perf.domContentLoadedMs.toFixed(1)}ms, FCP ${contextState.perf.fcpMs.toFixed(1)}ms, CLS ${contextState.perf.cls.toFixed(4)}, LCP ${contextState.perf.lcpMs.toFixed(1)}ms`);
  }
  lines.push('');
  lines.push('| ID | 用例 | 结果 | 说明 |');
  lines.push('|---|---|---|---|');
  for (const item of results) {
    const status = item.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
    const note = (item.note || '').replace(/\|/g, '/');
    lines.push(`| ${item.id} | ${item.name} | ${status} | ${note} |`);
  }

  await fs.writeFile(mdPath, lines.join('\n'), 'utf8');

  return { jsonPath, mdPath, passCount, failCount };
}

async function main() {
  await resetServerData();
  await seedData();

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });

  await context.addInitScript(() => {
    window.__e2ePerf = { cls: 0, lcp: 0 };
    try {
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const last = entries[entries.length - 1];
        if (last) {
          window.__e2ePerf.lcp = last.startTime;
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      // ignore
    }

    try {
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__e2ePerf.cls += entry.value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // ignore
    }
  });

  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('response', async response => {
    const url = response.url();
    if (!url.includes('/api/')) return;
    requestLog.push({
      method: response.request().method(),
      url,
      status: response.status(),
    });
  });

  await runCase('A01', '页面加载', async () => {
    await gotoHome(page);
    const bodyText = await page.locator('body').innerText();
    ensure(bodyText.includes('GoogleManager'), '页面未渲染 GoogleManager 标识');
    return '页面基础元素已加载';
  });

  await runCase('A02', '登录流程', async () => {
    await page.evaluate((sessionTokenKey) => {
      localStorage.removeItem(sessionTokenKey);
    }, SESSION_TOKEN_KEY);
    await gotoHome(page);
    await login(page);
    return '已进入账号库页面';
  });

  const b01Email = `${runPrefix}_b01@gmail.com`;
  const b02Email = `${runPrefix}_b02_a@gmail.com`;
  const b03Email = `${runPrefix}_b03_a@gmail.com`;
  const b04Email = `${runPrefix}_b04_a@gmail.com`;
  const b05Email = `${runPrefix}_b05@gmail.com`;
  const b06Email = `${runPrefix}_b06@gmail.com`;
  const b07Email = `${runPrefix}_b07@gmail.com`;

  await runCase('B01', '单个账号导入', async () => {
    await singleImportThroughUI(page, {
      email: b01Email,
      password: 'B01Pass!234',
      recovery: `${runPrefix}_b01_recovery@gmail.com`,
      phone: '+8613812345678',
      secret: contextState.seed.totpSecret,
      regYear: '2022',
      country: 'China',
    });
    await searchKeyword(page, b01Email);
    await expectRowVisible(page, b01Email);
    return b01Email;
  });

  await runCase('B02', '批量导入(----分隔)', async () => {
    const lines = [
      buildBatchLine(b02Email, 'B02Pass!1', `${runPrefix}_b02_rec1@gmail.com`, contextState.seed.totpSecret),
      buildBatchLine(`${runPrefix}_b02_b@gmail.com`, 'B02Pass!2', `${runPrefix}_b02_rec2@gmail.com`, contextState.seed.totpSecret),
    ];
    await batchImportThroughUI(page, lines.join('\n'), { expectedCount: 2 });
    await searchKeyword(page, b02Email);
    await expectRowVisible(page, b02Email);
    return '2 条 ---- 分隔导入成功';
  });

  await runCase('B03', '批量导入(|分隔)', async () => {
    const line1 = `${b03Email}|B03Pass!1|${runPrefix}_b03_rec1@gmail.com|${contextState.seed.totpSecret}`;
    const line2 = `${runPrefix}_b03_b@gmail.com|B03Pass!2|${runPrefix}_b03_rec2@gmail.com|${contextState.seed.totpSecret}`;
    await batchImportThroughUI(page, `${line1}\n${line2}`, { expectedCount: 2 });
    await searchKeyword(page, b03Email);
    await expectRowVisible(page, b03Email);
    return '2 条 | 分隔导入成功';
  });

  await runCase('B04', '混合分隔符导入', async () => {
    const mixedText = [
      buildBatchLine(b04Email, 'B04Pass!1', `${runPrefix}_b04_rec1@gmail.com`, contextState.seed.totpSecret),
      `${runPrefix}_b04_b@gmail.com|B04Pass!2|${runPrefix}_b04_rec2@gmail.com|${contextState.seed.totpSecret}`,
    ].join('\n');

    await batchImportThroughUI(page, mixedText, { expectedCount: 2, expectMixedDialog: true });
    await searchKeyword(page, b04Email);
    await expectRowVisible(page, b04Email);
    return '混合分隔符导入 + 对话框确认成功';
  });

  await runCase('B05', '含年份国家导入', async () => {
    const line = buildBatchLine(
      b05Email,
      'B05Pass!1',
      `${runPrefix}_b05_rec@gmail.com`,
      contextState.seed.totpSecret,
      ['2020', 'India']
    );
    await batchImportThroughUI(page, line, { expectedCount: 1 });
    await searchKeyword(page, b05Email);
    const row = await expectRowVisible(page, b05Email);
    const rowText = await row.innerText();
    ensure(rowText.includes('2020'), '年份列未显示 2020');
    ensure(rowText.toLowerCase().includes('india'), '国家列未显示 India');
    return '年份/国家字段显示正常';
  });

  await runCase('B06', '跳过注释行', async () => {
    const content = [
      '# 注释一',
      '// 注释二',
      buildBatchLine(b06Email, 'B06Pass!1', `${runPrefix}_b06_rec@gmail.com`, contextState.seed.totpSecret),
    ].join('\n');

    await batchImportThroughUI(page, content, { expectedCount: 1 });
    await searchKeyword(page, b06Email);
    await expectRowVisible(page, b06Email);
    return '仅导入有效行';
  });

  await runCase('B07', '含手机号导入', async () => {
    const line = buildBatchLine(
      b07Email,
      'B07Pass!1',
      `${runPrefix}_b07_rec@gmail.com`,
      contextState.seed.totpSecret,
      ['+1 219-273-1268', 'USA']
    );
    await batchImportThroughUI(page, line, { expectedCount: 1 });
    await searchKeyword(page, b07Email);
    const row = await expectRowVisible(page, b07Email);
    const rowText = cleanText(await row.innerText());
    ensure(rowText.includes('US 美国 (+1)'), '手机号国别未正确显示为 US 美国 (+1)');
    ensure(rowText.includes('2192731268'), '手机号本地号码未正确显示');
    return '手机号国别/号码解析显示正常';
  });

  await runCase('B08', '批量导入数量验证', async () => {
    const lines = [];
    for (let i = 1; i <= 5; i += 1) {
      lines.push(buildBatchLine(
        `${runPrefix}_b08_${i}@gmail.com`,
        `B08Pass!${i}`,
        `${runPrefix}_b08_rec_${i}@gmail.com`,
        contextState.seed.totpSecret,
      ));
    }

    await batchImportThroughUI(page, lines.join('\n'), { expectedCount: 5 });
    await searchKeyword(page, `${runPrefix}_b08_`);
    const count = await visibleDataRowCount(page);
    ensure(count === 5, `预期 5 条，实际 ${count} 条`);
    return '5 条导入数量准确';
  });

  await runCase('C01', '按邮箱搜索', async () => {
    await searchKeyword(page, b03Email);
    await expectRowVisible(page, b03Email);
    const count = await visibleDataRowCount(page);
    ensure(count === 1, `预期搜索结果 1 条，实际 ${count}`);
    return '邮箱搜索命中 1 条';
  });

  await runCase('C02', '搜索无结果', async () => {
    await searchKeyword(page, `${runPrefix}_not_exists_abcdefg`);
    await page.getByText('未找到相关账号').waitFor({ state: 'visible', timeout: TIMEOUT });
    return '空结果状态正常';
  });

  await runCase('C03', '按标签过滤', async () => {
    await resetFilters(page);
    const tagSelect = page.locator('select').filter({ has: page.locator('option', { hasText: '全部标签' }) }).first();
    await tagSelect.waitFor({ state: 'visible', timeout: TIMEOUT });
    await tagSelect.selectOption(contextState.seed.tagGroup);
    await page.waitForTimeout(400);

    const count = await visibleDataRowCount(page);
    ensure(count >= 2, `标签过滤后记录数不足，实际 ${count}`);

    const firstRowText = await page.locator('tbody tr').first().innerText();
    ensure(firstRowText.includes(contextState.seed.tagGroup), '过滤后标签列未显示目标标签');

    await tagSelect.selectOption('');
    await page.waitForTimeout(300);
    return `标签过滤命中 ${count} 条`;
  });

  await runCase('D01', '删除账号', async () => {
    await searchKeyword(page, contextState.seed.deleteEmail);
    const row = await expectRowVisible(page, contextState.seed.deleteEmail);
    await row.getByTitle('删除').click();
    await page.getByText('账号已删除').waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.waitForTimeout(400);

    const exists = await rowByEmail(page, contextState.seed.deleteEmail).count();
    ensure(exists === 0, '删除后账号仍然存在');
    return contextState.seed.deleteEmail;
  });

  await runCase('D02', '撤回删除', async () => {
    await searchKeyword(page, contextState.seed.undoEmail);
    const row = await expectRowVisible(page, contextState.seed.undoEmail);
    await row.getByTitle('删除').click();
    await page.getByText('账号已删除').waitFor({ state: 'visible', timeout: TIMEOUT });

    const undoButton = page.getByRole('button', { name: '撤回' }).first();
    await undoButton.waitFor({ state: 'visible', timeout: TIMEOUT });
    await undoButton.evaluate((el) => el.click());

    await page.getByText('已撤回').waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.waitForTimeout(600);
    await expectRowVisible(page, contextState.seed.undoEmail);
    return contextState.seed.undoEmail;
  });

  await runCase('D03', '双击编辑备注', async () => {
    await searchKeyword(page, contextState.seed.editEmail);
    const row = await expectRowVisible(page, contextState.seed.editEmail);

    const remarkCell = row.locator('td').nth(7);
    await remarkCell.locator('span,button').first().dblclick();

    const input = remarkCell.locator('input').first();
    await input.waitFor({ state: 'visible', timeout: TIMEOUT });
    const remarkText = `${runPrefix}_d03_备注更新`;
    await input.fill(remarkText);
    await input.press('Enter');

    await page.waitForTimeout(600);
    const text = await row.innerText();
    ensure(text.includes(remarkText), '备注未更新为新值');
    return remarkText;
  });

  await runCase('D04', '2FA 验证码生成', async () => {
    await searchKeyword(page, contextState.seed.editEmail);
    const row = await expectRowVisible(page, contextState.seed.editEmail);
    const twoFaCellText = cleanText(await row.locator('td').nth(4).innerText());
    const codeMatch = twoFaCellText.match(/(\d{6})\d{1,2}s$/) || twoFaCellText.match(/\b(\d{6})\b/);
    ensure(Boolean(codeMatch), `2FA 验证码未显示 6 位数字: ${twoFaCellText}`);
    return codeMatch[1];
  });

  await runCase('D05', '2FA 密钥显示', async () => {
    await searchKeyword(page, contextState.seed.editEmail);
    const row = await expectRowVisible(page, contextState.seed.editEmail);
    const twoFaCellText = cleanText(await row.locator('td').nth(4).innerText());
    ensure(twoFaCellText.includes(contextState.seed.totpSecret.slice(0, 10)), '2FA 密钥列未显示预期密钥');
    return contextState.seed.totpSecret.slice(0, 10);
  });

  await runCase('E01', '复选框选择', async () => {
    await searchKeyword(page, contextState.seed.ePrefix);
    const checkboxes = page.locator('tbody tr input[type="checkbox"]');
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();

    const toolbar = page.getByText('已选中 2 个账号');
    await toolbar.waitFor({ state: 'visible', timeout: TIMEOUT });
    return '选中数量=2';
  });

  await runCase('E02', 'Ctrl+点击多选', async () => {
    const clearBtn = page.getByRole('button', { name: '取消选择' });
    await clearBtn.click();

    const rows = page.locator('tbody tr');
    await rows.nth(0).click({ modifiers: ['Control'] });
    await rows.nth(2).click({ modifiers: ['Control'] });

    await page.getByText('已选中 2 个账号').waitFor({ state: 'visible', timeout: TIMEOUT });
    return 'Ctrl 多选 2 条';
  });

  await runCase('E03', 'Shift+范围选择', async () => {
    await page.getByRole('button', { name: '取消选择' }).click();

    const rows = page.locator('tbody tr');
    await rows.nth(0).click();
    await rows.nth(3).click({ modifiers: ['Shift'] });

    await page.getByText('已选中 4 个账号').waitFor({ state: 'visible', timeout: TIMEOUT });
    return 'Shift 范围选中 4 条';
  });

  await runCase('E04', '批量删除', async () => {
    const beforeCount = await visibleDataRowCount(page);
    await page.getByRole('button', { name: '批量删除' }).click();
    await page.getByText('已删除').waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.waitForTimeout(600);

    const afterCount = await visibleDataRowCount(page);
    ensure(afterCount < beforeCount, `批量删除未生效: before=${beforeCount}, after=${afterCount}`);
    return `${beforeCount} -> ${afterCount}`;
  });

  await runCase('E05', '批量撤回删除', async () => {
    const beforeUndoCount = await visibleDataRowCount(page);

    const undoBtn = page.getByRole('button', { name: '撤回' }).first();
    await undoBtn.waitFor({ state: 'visible', timeout: TIMEOUT });
    await undoBtn.evaluate((el) => el.click());

    await page.getByText('已撤回').waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.waitForTimeout(700);

    const afterUndoCount = await visibleDataRowCount(page);
    ensure(afterUndoCount > beforeUndoCount, `撤回后数量未恢复: before=${beforeUndoCount}, after=${afterUndoCount}`);
    return `${beforeUndoCount} -> ${afterUndoCount}`;
  });

  const batchTagValue = `${runPrefix}_batch_tag`;

  await runCase('E06', '批量编辑标签', async () => {
    const clearBtn = page.getByRole('button', { name: '取消选择' });
    if (await clearBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await clearBtn.click();
    }

    const checkboxes = page.locator('tbody tr input[type="checkbox"]');
    const available = await checkboxes.count();
    ensure(available >= 3, `批量编辑标签前可见行数不足 3，实际 ${available}`);
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await checkboxes.nth(2).click();

    page.once('dialog', async dialog => {
      if (dialog.type() === 'prompt') {
        await dialog.accept(batchTagValue);
      } else {
        await dialog.accept();
      }
    });

    await page.getByRole('button', { name: '批量设置标签' }).click();
    let matched = 0;
    for (let i = 0; i < 24; i += 1) {
      matched = await page.locator('tbody tr').filter({ hasText: batchTagValue }).count();
      if (matched >= 3) break;
      await page.waitForTimeout(250);
    }
    ensure(matched >= 3, `预期至少 3 条账号标签更新，实际 ${matched}`);
    return `标签更新条数 ${matched}`;
  });

  await runCase('E07', '全选功能', async () => {
    const clearBtn = page.getByRole('button', { name: '取消选择' });
    if (await clearBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      await clearBtn.click();
    }

    const headerCheckbox = page.locator('thead input[type="checkbox"]').first();
    await headerCheckbox.click();

    const visibleCount = await visibleDataRowCount(page);
    await page.getByText(`已选中 ${visibleCount} 个账号`).waitFor({ state: 'visible', timeout: TIMEOUT });

    await page.getByRole('button', { name: '取消选择' }).click();
    return `全选 ${visibleCount} 条`; 
  });

  await runCase('F01', '导出按钮显示', async () => {
    await resetFilters(page);
    await page.getByRole('button', { name: '导出数据库' }).waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.getByRole('button', { name: '导出账号' }).waitFor({ state: 'visible', timeout: TIMEOUT });
    return '导出按钮可见';
  });

  await runCase('F02', '导出弹窗验证', async () => {
    await page.getByRole('button', { name: '导出账号' }).click();
    await page.getByRole('heading', { name: '导出账号配置' }).waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.locator('label').filter({ hasText: '分隔符' }).first().waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.locator('label').filter({ hasText: '预览（示例前1到2行）' }).first().waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.getByRole('button', { name: '取消' }).click();
    await page.waitForTimeout(300);
    return '导出配置弹窗元素完整';
  });

  await runCase('G01', '列顺序验证', async () => {
    const headerTexts = await page.locator('thead tr th').evaluateAll((ths) => {
      return ths
        .map((th) => th.innerText.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    });

    const expected = ['序号', '账号', '恢复', '2FA', '手机', '标签', '备注', '状态', '年份', '国家', '操作', '导入'];
    ensure(JSON.stringify(headerTexts) === JSON.stringify(expected), `列顺序不一致: actual=${JSON.stringify(headerTexts)}`);
    return expected.join(' -> ');
  });

  await runCase('G02', '标签列显示', async () => {
    await searchKeyword(page, contextState.seed.ePrefix);
    const taggedCount = await page.locator('tbody tr').filter({ hasText: batchTagValue }).count();
    ensure(taggedCount >= 1, '标签列未显示批量标签');
    return `标签列包含 ${batchTagValue}`;
  });

  await runCase('H01', '网络请求监控', async () => {
    const hasGetAccounts = requestLog.some(r => r.method === 'GET' && r.url.includes('/api/accounts') && r.status === 200);
    const hasBatchImport = requestLog.some(r => r.method === 'POST' && r.url.includes('/api/accounts/batch-import') && r.status === 200);
    const hasUpdate = requestLog.some(r => (r.method === 'PUT' || r.method === 'POST') && (r.url.includes('/toggle-status') || r.url.includes('/toggle-sold-status') || /\/api\/accounts\/\d+$/.test(r.url)) && r.status === 200);

    ensure(hasGetAccounts, '未捕获到 GET /api/accounts 200 请求');
    ensure(hasBatchImport, '未捕获到批量导入请求');
    ensure(hasUpdate, '未捕获到更新/状态切换请求');

    return `API 请求数 ${requestLog.length}`;
  });

  await runCase('H02', '控制台无错误', async () => {
    ensure(consoleErrors.length === 0, `发现 console.error: ${consoleErrors.join(' | ')}`);
    return 'console.error = 0';
  });

  await runCase('H03', '页面性能基线', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await ensureListPage(page);
    await page.waitForTimeout(1000);

    const perf = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const fcpEntry = performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint');
      return {
        domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : 0,
        loadMs: nav ? nav.loadEventEnd : 0,
        fcpMs: fcpEntry ? fcpEntry.startTime : 0,
        cls: window.__e2ePerf?.cls || 0,
        lcpMs: window.__e2ePerf?.lcp || 0,
      };
    });

    ensure(perf.domContentLoadedMs > 0 && perf.domContentLoadedMs < 5000, `DCL 异常: ${perf.domContentLoadedMs}`);
    ensure(perf.cls <= 0.1, `CLS 过高: ${perf.cls}`);

    contextState.perf = perf;
    return `DCL=${perf.domContentLoadedMs.toFixed(1)}ms CLS=${perf.cls.toFixed(4)} LCP=${perf.lcpMs.toFixed(1)}ms`;
  });

  await runCase('H04', '暗色模式验证', async () => {
    const toggle = page.locator('button[title*="模式"]').first();
    const beforeTitle = await toggle.getAttribute('title');
    await toggle.click();
    await page.waitForTimeout(250);
    const afterTitle = await toggle.getAttribute('title');

    ensure(beforeTitle !== afterTitle, '暗色模式切换按钮 title 未变化');

    const navClass = await page.locator('nav').first().getAttribute('class');
    if (String(afterTitle).includes('亮色')) {
      ensure(String(navClass).includes('bg-slate-800'), '切换暗色后导航栏未变为深色');
    } else {
      ensure(String(navClass).includes('bg-white'), '切换亮色后导航栏未变为浅色');
    }

    return `${beforeTitle} -> ${afterTitle}`;
  });

  await runCase('I01', '分页显示', async () => {
    await resetFilters(page);
    const paginationInfo = page.locator('text=/共\\s*\\d+\\s*条记录，\\s*第\\s*\\d+\\s*\\/\\s*\\d+\\s*页/').first();
    await paginationInfo.waitFor({ state: 'visible', timeout: TIMEOUT });
    const text = cleanText(await paginationInfo.innerText());
    const match = text.match(/第\s*(\d+)\s*\/\s*(\d+)\s*页/);
    ensure(match, `分页文本格式异常: ${text}`);
    ensure(Number(match[2]) >= 2, `总页数不足，无法验证翻页: ${text}`);
    return text;
  });

  await runCase('I02', '翻页操作', async () => {
    const infoLocator = page.locator('text=/共\\s*\\d+\\s*条记录，\\s*第\\s*\\d+\\s*\\/\\s*\\d+\\s*页/').first();
    const before = cleanText(await infoLocator.innerText());
    await page.getByTitle('下一页').click();
    await page.waitForTimeout(500);
    const after = cleanText(await infoLocator.innerText());
    ensure(before !== after, `翻页后页码未变化: ${before}`);
    ensure(/第\s*2\s*\//.test(after), `翻页后未到第 2 页: ${after}`);
    return `${before} -> ${after}`;
  });

  await runCase('I03', '每页数量切换', async () => {
    const pageSizeSelect = page.locator('select').filter({ has: page.locator('option', { hasText: '10 条' }) }).first();
    await pageSizeSelect.selectOption('20');
    await page.waitForTimeout(500);

    const count = await visibleDataRowCount(page);
    ensure(count <= 20, `切换 20 条后，当前行数异常: ${count}`);

    const info = cleanText(await page.locator('text=/共\\s*\\d+\\s*条记录，\\s*第\\s*\\d+\\s*\\/\\s*\\d+\\s*页/').first().innerText());
    return `${info}, 当前行数=${count}`;
  });

  await runCase('J01', '打开历史抽屉', async () => {
    await searchKeyword(page, contextState.seed.historyEmail);
    const row = await expectRowVisible(page, contextState.seed.historyEmail);
    await row.getByTitle('查看修改历史').click();
    await page.getByRole('heading', { name: '修改历史' }).waitFor({ state: 'visible', timeout: TIMEOUT });

    const currentAccountText = await page.locator('p:has-text("当前账号")').first().innerText();
    ensure(currentAccountText.includes('当前账号'), '历史抽屉未显示当前账号区域');

    await closeHistoryDrawer(page);
    return '历史抽屉可打开';
  });

  await runCase('J02', '历史内容验证', async () => {
    await closeHistoryDrawer(page);
    await searchKeyword(page, contextState.seed.historyEmail);
    const row = await expectRowVisible(page, contextState.seed.historyEmail);

    const recoveryCell = row.locator('td').nth(3);
    await recoveryCell.locator('button,span').first().dblclick();

    const input = recoveryCell.locator('input').first();
    await input.waitFor({ state: 'visible', timeout: TIMEOUT });
    const newRecovery = `${runPrefix}_history_new@gmail.com`;
    await input.fill(newRecovery);
    await input.press('Enter');

    await page.waitForTimeout(700);

    await row.getByTitle('查看修改历史').click();
    await page.getByRole('heading', { name: '修改历史' }).waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.getByText('恢复邮箱修改记录').waitFor({ state: 'visible', timeout: TIMEOUT });

    const drawerText = await page.locator('div.fixed.right-0').innerText();
    ensure(drawerText.includes(newRecovery), '历史抽屉未显示新恢复邮箱');
    ensure(drawerText.includes(`${runPrefix}_history_old@gmail.com`), '历史抽屉未显示旧恢复邮箱');

    await closeHistoryDrawer(page);
    return '恢复邮箱变更历史已记录';
  });

  await runCase('K01', '登录失败校验', async () => {
    await page.evaluate((sessionTokenKey) => {
      localStorage.removeItem(sessionTokenKey);
    }, SESSION_TOKEN_KEY);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '进入系统' }).click();
    await page.getByText('请输入密码').waitFor({ state: 'visible', timeout: TIMEOUT });
    return '空密码校验提示正常';
  });

  await runCase('K02', '密码可见性切换', async () => {
    const pwdInput = page.getByPlaceholder('请输入密码');
    await pwdInput.waitFor({ state: 'visible', timeout: TIMEOUT });

    ensure((await pwdInput.getAttribute('type')) === 'password', '初始密码框 type 不是 password');

    const eyeBtn = page.locator('input[placeholder="请输入密码"] + button').first();
    await eyeBtn.click();
    ensure((await pwdInput.getAttribute('type')) === 'text', '点击眼睛后 type 未变为 text');

    await eyeBtn.click();
    ensure((await pwdInput.getAttribute('type')) === 'password', '再次点击后 type 未恢复为 password');

    await pwdInput.fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: '进入系统' }).click();
    await page.getByRole('heading', { name: '账号库' }).waitFor({ state: 'visible', timeout: TIMEOUT });
    return '密码显示/隐藏切换正常';
  });

  await runCase('L01', '状态切换', async () => {
    await searchKeyword(page, contextState.seed.statusEmail);
    const row = await expectRowVisible(page, contextState.seed.statusEmail);

    const statusBtn = row.locator('td').nth(8).getByRole('button').nth(0);
    const before = cleanText(await statusBtn.innerText());
    await statusBtn.click();
    await page.waitForTimeout(400);
    const after = cleanText(await statusBtn.innerText());

    ensure(before !== after, `状态未变化: ${before}`);
    return `${before} -> ${after}`;
  });

  await runCase('L02', '出售状态切换', async () => {
    await searchKeyword(page, contextState.seed.statusEmail);
    const row = await expectRowVisible(page, contextState.seed.statusEmail);

    const soldBtn = row.locator('td').nth(8).getByRole('button').nth(1);
    const before = cleanText(await soldBtn.innerText());

    if (before === '已售') {
      page.once('dialog', async dialog => {
        await dialog.accept();
      });
    }

    await soldBtn.click();
    await page.waitForTimeout(500);
    const after = cleanText(await soldBtn.innerText());
    ensure(before !== after, `出售状态未变化: ${before}`);
    return `${before} -> ${after}`;
  });

  await runCase('L03', '出售状态筛选', async () => {
    await searchKeyword(page, contextState.seed.statusEmail);
    await page.getByRole('button', { name: '已售出' }).click();
    await page.waitForTimeout(500);

    const count = await visibleDataRowCount(page);
    ensure(count >= 1, '已售出筛选后无数据');

    const soldTexts = await page.locator('tbody tr td:nth-child(9) button:nth-child(2)').allInnerTexts();
    ensure(soldTexts.every(text => cleanText(text) === '已售'), `筛选后存在非已售项: ${JSON.stringify(soldTexts)}`);

    await page.getByRole('button', { name: '全部', exact: true }).click();
    await page.waitForTimeout(250);
    return `已售筛选命中 ${count} 条`;
  });

  await browser.close();

  const report = await writeReport();

  const failCount = results.filter(r => r.status === 'FAIL').length;
  console.log(`\n回归完成: ${results.length - failCount}/${results.length} 通过`);
  console.log(`报告: ${report.mdPath}`);
  console.log(`明细: ${report.jsonPath}`);

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    const report = await writeReport();
    console.error(`报告已写入: ${report.mdPath}`);
  } catch {
    // ignore
  }
  process.exit(1);
});
