import type {
  ApiAdapter,
  Account,
  AccountInput,
  BatchImportResult,
  TotpResult,
  ApiResponse,
  LoginResult,
  CheckAuthResult,
  ExportConfig,
  BackupInfo,
} from '../types';
import { snakeToCamel, camelToSnake } from '../utils';

type WrappedResponse<T> = ApiResponse<T> & {
  banned?: boolean;
  blocked?: boolean;
};

const AUTH_TOKEN_STORAGE_KEY = 'gm_session_token';

class HttpRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpRequestError';
    this.status = status;
  }
}

/**
 * HTTP 适配器 — 对接 Rust HTTP 测试服务器 (actix-web)
 * 用于 E2E 测试和非 Tauri 环境下的开发调试
 */
export class HttpAdapter implements ApiAdapter {
  private baseUrl: string;
  private sessionToken: string | null;

  constructor(baseUrl = import.meta.env.VITE_API_URL || '/api') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.sessionToken = this.loadSessionToken();
  }

  private loadSessionToken(): string | null {
    try {
      const value = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      return value && value.trim() !== '' ? value : null;
    } catch {
      return null;
    }
  }

  private saveSessionToken(token: string | null): void {
    this.sessionToken = token && token.trim() !== '' ? token : null;
    try {
      if (this.sessionToken) {
        localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, this.sessionToken);
      } else {
        localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }

  private buildUrl(path: string, query?: Record<string, string | undefined | null>): string {
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    const url = new URL(this.baseUrl + normalizedPath, window.location.origin);

    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          url.searchParams.set(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private unwrapData<T>(payload: unknown): T {
    if (payload && typeof payload === 'object') {
      const wrapped = payload as WrappedResponse<T>;
      if (typeof wrapped.success === 'boolean' && Object.prototype.hasOwnProperty.call(wrapped, 'data')) {
        return wrapped.data as T;
      }
    }

    return payload as T;
  }

  private extractErrorMessage(payload: unknown, fallback: string): string {
    if (payload && typeof payload === 'object') {
      const wrapped = payload as { message?: string; error?: string };
      if (typeof wrapped.message === 'string' && wrapped.message.trim() !== '') {
        return wrapped.message;
      }
      if (typeof wrapped.error === 'string' && wrapped.error.trim() !== '') {
        return wrapped.error;
      }
    }

    return fallback;
  }

  private async requestRaw(
    path: string,
    options: RequestInit = {},
    query?: Record<string, string | undefined | null>
  ): Promise<unknown> {
    const response = await fetch(this.buildUrl(path, query), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.sessionToken ? { Authorization: `Bearer ${this.sessionToken}` } : {}),
        ...(options.headers || {}),
      },
    });

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        this.saveSessionToken(null);
      }
      const message = this.extractErrorMessage(payload, response.statusText || '请求失败');
      throw new HttpRequestError(message, response.status);
    }

    return payload;
  }

  private async requestData<T>(
    path: string,
    options: RequestInit = {},
    query?: Record<string, string | undefined | null>
  ): Promise<T> {
    const payload = await this.requestRaw(path, options, query);
    return this.unwrapData<T>(payload);
  }

  async login(password: string): Promise<LoginResult> {
    const result = await this.requestData<Record<string, unknown>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    const token =
      typeof result?.session_token === 'string'
        ? result.session_token
        : (typeof result?.sessionToken === 'string' ? result.sessionToken : undefined);
    const success = Boolean(result?.success);
    if (success && token) {
      this.saveSessionToken(token);
    } else if (!success) {
      this.saveSessionToken(null);
    }
    return {
      success,
      banned: Boolean(result?.banned),
      message: typeof result?.message === 'string' ? result.message : undefined,
      sessionToken: token,
      expiresAtEpochSecs:
        typeof result?.expires_at_epoch_secs === 'number'
          ? result.expires_at_epoch_secs
          : (typeof result?.expiresAtEpochSecs === 'number' ? result.expiresAtEpochSecs : undefined),
    };
  }

  async checkAuth(): Promise<CheckAuthResult> {
    const result = await this.requestData<Record<string, unknown>>('/auth/check', { method: 'GET' });
    const token =
      typeof result?.session_token === 'string'
        ? result.session_token
        : (typeof result?.sessionToken === 'string' ? result.sessionToken : undefined);
    const success = Boolean(result?.success);
    if (success && token) {
      this.saveSessionToken(token);
    } else if (!success) {
      this.saveSessionToken(null);
    }
    return {
      success,
      banned: Boolean(result?.banned),
      message: typeof result?.message === 'string' ? result.message : undefined,
      sessionToken: token,
      expiresAtEpochSecs:
        typeof result?.expires_at_epoch_secs === 'number'
          ? result.expires_at_epoch_secs
          : (typeof result?.expiresAtEpochSecs === 'number' ? result.expiresAtEpochSecs : undefined),
    };
  }

  async logout(): Promise<void> {
    try {
      await this.requestRaw('/auth/logout', { method: 'POST' });
    } finally {
      this.saveSessionToken(null);
    }
  }

  async getAccounts(search?: string, soldStatus?: string): Promise<Account[]> {
    const list = await this.requestData<any[]>(
      '/accounts',
      { method: 'GET' },
      {
        search: search || undefined,
        sold_status: soldStatus || undefined,
      }
    );

    const accounts = Array.isArray(list) ? list : [];
    return accounts.map(item => snakeToCamel<Account>(item));
  }

  async createAccount(account: AccountInput): Promise<Account> {
    const payload = camelToSnake<Record<string, unknown>>(account as Record<string, unknown>);
    const result = await this.requestData<any>('/accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return snakeToCamel<Account>(result);
  }

  async updateAccount(id: number, account: Partial<AccountInput>): Promise<Account> {
    // 后端 PUT 要求完整 AccountInput，需要先获取当前数据再合并
    const currentAccount = await this.requestData<any>('/accounts/' + id, { method: 'GET' });
    const current = snakeToCamel<Account>(currentAccount);

    const completeAccount: Record<string, unknown> = {
      email: account.email ?? current.email,
      password: account.password ?? current.password,
      recovery: account.recovery ?? current.recovery ?? null,
      phone: account.phone ?? current.phone ?? null,
      secret: account.secret ?? current.secret ?? null,
      regYear: account.regYear ?? current.regYear ?? null,
      country: account.country ?? current.country ?? null,
      groupName: account.groupName ?? current.groupName ?? null,
      remark: account.remark ?? current.remark ?? null,
    };

    const payload = camelToSnake<Record<string, unknown>>(completeAccount);
    const result = await this.requestData<any>('/accounts/' + id, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return snakeToCamel<Account>(result);
  }

  async deleteAccount(id: number): Promise<void> {
    await this.requestRaw('/accounts/' + id, { method: 'DELETE' });
  }

  async toggleStatus(id: number): Promise<Account> {
    const result = await this.requestData<any>('/accounts/' + id + '/toggle-status', {
      method: 'POST',
    });
    return snakeToCamel<Account>(result);
  }

  async toggleSoldStatus(id: number): Promise<Account> {
    const result = await this.requestData<any>('/accounts/' + id + '/toggle-sold-status', {
      method: 'POST',
    });
    return snakeToCamel<Account>(result);
  }

  async batchImport(accounts: AccountInput[]): Promise<BatchImportResult> {
    const payload = {
      accounts: accounts.map(item => camelToSnake<Record<string, unknown>>(item as Record<string, unknown>)),
    };

    const result = await this.requestData<Record<string, unknown>>('/accounts/batch-import', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const normalized = snakeToCamel<Record<string, unknown>>(result || {});
    const successCount = Number(normalized.successCount ?? 0);
    const failCount = Number(normalized.failedCount ?? normalized.failCount ?? 0);

    return {
      successCount: Number.isFinite(successCount) ? successCount : 0,
      failCount: Number.isFinite(failCount) ? failCount : 0,
    };
  }

  async generateTotp(secret: string): Promise<TotpResult> {
    const result = await this.requestData<Record<string, unknown>>('/totp/generate', {
      method: 'POST',
      body: JSON.stringify({ secret }),
    });

    const normalized = snakeToCamel<Record<string, unknown>>(result || {});
    return {
      code: String(normalized.code ?? ''),
      remaining: Number(normalized.remaining ?? 0),
    };
  }

  async getAccountHistory(accountId: number): Promise<any[]> {
    const history = await this.requestData<any[]>('/accounts/' + accountId + '/history', {
      method: 'GET',
    });

    const rows = Array.isArray(history) ? history : [];
    return rows.map(item => snakeToCamel(item));
  }

  async exportDatabaseSql(): Promise<string> {
    throw new Error('HTTP 模式不支持数据库导出功能，请使用 Tauri 桌面模式');
  }

  async exportAccountsText(
    accountIds: number[] | null,
    search: string | null,
    soldStatus: string | null,
    config: ExportConfig,
  ): Promise<string> {
    throw new Error('HTTP 模式不支持账号导出功能，请使用 Tauri 桌面模式');
  }

  async deleteAllAccounts(): Promise<number> {
    const result = await this.requestData<number>('/accounts/delete-all', { method: 'POST' });
    return Number(result || 0);
  }

  async getDeletedAccounts(): Promise<Account[]> {
    const list = await this.requestData<any[]>('/accounts/deleted', { method: 'GET' });
    const accounts = Array.isArray(list) ? list : [];
    return accounts.map(item => snakeToCamel<Account>(item));
  }

  async restoreAccount(id: number): Promise<Account> {
    const result = await this.requestData<any>(`/accounts/${id}/restore`, { method: 'POST' });
    return snakeToCamel<Account>(result);
  }

  async purgeAccount(id: number): Promise<void> {
    await this.requestRaw(`/accounts/${id}/purge`, { method: 'DELETE' });
  }

  async purgeAllDeleted(): Promise<number> {
    const result = await this.requestData<number>('/accounts/purge-all', { method: 'DELETE' });
    return Number(result || 0);
  }

  async createBackup(reason?: string): Promise<string> {
    const result = await this.requestData<string>('/backups', {
      method: 'POST',
      body: JSON.stringify({ reason: reason || null }),
    });
    return String(result || '');
  }

  async listBackups(): Promise<BackupInfo[]> {
    const result = await this.requestData<any[]>('/backups', { method: 'GET' });
    const rows = Array.isArray(result) ? result : [];
    return rows.map(item => snakeToCamel<BackupInfo>(item));
  }

  async restoreBackup(backupName: string): Promise<void> {
    await this.requestRaw('/backups/restore', {
      method: 'POST',
      body: JSON.stringify({ backup_name: backupName }),
    });
  }
}
