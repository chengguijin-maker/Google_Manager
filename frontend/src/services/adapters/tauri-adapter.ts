import { invoke } from '@tauri-apps/api/core';
import type {
  ApiAdapter,
  Account,
  AccountInput,
  BatchImportResult,
  TotpResult,
  LoginResult,
  CheckAuthResult,
  ExportConfig,
  BackupInfo,
} from '../types';
import { snakeToCamel, camelToSnake } from '../utils';

const AUTH_TOKEN_STORAGE_KEY = 'gm_session_token';

export class TauriAdapter implements ApiAdapter {
  private sessionToken: string | null;

  constructor() {
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

  private prepareInvokeArgs(args?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!args) {
      return undefined;
    }
    return camelToSnake<Record<string, unknown>>(args);
  }

  private async invokeWithSnake<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const invokeArgs = this.prepareInvokeArgs(args);
    return await invoke<T>(command, invokeArgs);
  }

  private requireSessionToken(): string {
    if (!this.sessionToken) {
      throw new Error('未登录或会话已失效，请重新登录');
    }
    return this.sessionToken;
  }

  private async invokeAuthed<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const sessionToken = this.requireSessionToken();
    try {
      return await this.invokeWithSnake<T>(command, {
        ...(args || {}),
        sessionToken,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('未登录') || message.toLowerCase().includes('unauthorized')) {
        this.saveSessionToken(null);
      }
      throw error;
    }
  }

  private normalizeAuthPayload(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') {
      return {};
    }
    return snakeToCamel<Record<string, unknown>>(payload as Record<string, unknown>);
  }

  async login(password: string): Promise<LoginResult> {
    try {
      const payload = await this.invokeWithSnake<unknown>('login', { password });
      const auth = this.normalizeAuthPayload(payload);
      const success = Boolean(auth.success);
      const token = typeof auth.sessionToken === 'string' ? auth.sessionToken : undefined;
      if (success && token) {
        this.saveSessionToken(token);
      } else if (!success) {
        this.saveSessionToken(null);
      }
      return {
        success,
        message: typeof auth.message === 'string' ? auth.message : undefined,
        banned: Boolean(auth.banned),
        sessionToken: token,
        expiresAtEpochSecs: typeof auth.expiresAtEpochSecs === 'number' ? auth.expiresAtEpochSecs : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.saveSessionToken(null);
      return {
        success: false,
        message,
        banned: message.includes('封禁'),
      };
    }
  }

  async checkAuth(): Promise<CheckAuthResult> {
    try {
      const payload = await this.invokeWithSnake<unknown>('check_auth', {
        sessionToken: this.sessionToken || null,
      });
      const auth = this.normalizeAuthPayload(payload);
      const success = Boolean(auth.success);
      const token = typeof auth.sessionToken === 'string' ? auth.sessionToken : undefined;
      if (success && token) {
        this.saveSessionToken(token);
      } else if (!success) {
        this.saveSessionToken(null);
      }
      return {
        success,
        banned: Boolean(auth.banned),
        message: typeof auth.message === 'string' ? auth.message : undefined,
        sessionToken: token,
        expiresAtEpochSecs: typeof auth.expiresAtEpochSecs === 'number' ? auth.expiresAtEpochSecs : undefined,
      };
    } catch (error) {
      this.saveSessionToken(null);
      return {
        success: false,
        banned: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async logout(): Promise<void> {
    try {
      await this.invokeWithSnake('logout', {
        sessionToken: this.sessionToken || null,
      });
    } finally {
      this.saveSessionToken(null);
    }
  }

  private async buildCompleteAccountPayload(id: number, account: Partial<AccountInput>): Promise<Record<string, unknown>> {
    const raw = await this.invokeAuthed<any>('get_account_by_id', { id });
    const currentAccount = snakeToCamel<Account>(raw);

    if (!currentAccount) {
      throw new Error('账号 ' + id + ' 不存在，无法补全更新数据');
    }

    return {
      id,
      email: account.email ?? currentAccount.email,
      password: account.password ?? currentAccount.password,
      recovery: account.recovery ?? currentAccount.recovery ?? null,
      phone: account.phone ?? currentAccount.phone ?? null,
      secret: account.secret ?? currentAccount.secret ?? null,
      regYear: account.regYear ?? currentAccount.regYear ?? null,
      country: account.country ?? currentAccount.country ?? null,
      groupName: account.groupName ?? currentAccount.groupName ?? null,
      remark: account.remark ?? currentAccount.remark ?? null,
      status: currentAccount.status,
      soldStatus: currentAccount.soldStatus,
      createdAt: currentAccount.createdAt,
      updatedAt: currentAccount.updatedAt,
    };
  }

  async getAccounts(search?: string, soldStatus?: string): Promise<Account[]> {
    const accounts = await this.invokeAuthed<any[]>('get_accounts', {
      search: search || null,
      soldStatus: soldStatus || null,
    });
    const accountList = Array.isArray(accounts) ? accounts : [];
    return accountList.map(item => snakeToCamel<Account>(item));
  }

  async createAccount(account: AccountInput): Promise<Account> {
    const result = await this.invokeAuthed<any>('create_account', { account });
    return snakeToCamel<Account>(result);
  }

  async updateAccount(id: number, account: Partial<AccountInput>): Promise<Account> {
    const completeAccount = await this.buildCompleteAccountPayload(id, account);
    const result = await this.invokeAuthed<any>('update_account', { id, account: completeAccount });
    return snakeToCamel<Account>(result);
  }

  async deleteAccount(id: number): Promise<void> {
    await this.invokeAuthed('delete_account', { id });
  }

  async toggleStatus(id: number): Promise<Account> {
    const result = await this.invokeAuthed<any>('toggle_status', { id });
    return snakeToCamel<Account>(result);
  }

  async toggleSoldStatus(id: number): Promise<Account> {
    const result = await this.invokeAuthed<any>('toggle_sold_status', { id });
    return snakeToCamel<Account>(result);
  }

  async batchImport(accounts: AccountInput[]): Promise<BatchImportResult> {
    const result = await this.invokeAuthed<any>('batch_import', { accounts });
    const data = snakeToCamel<Record<string, unknown>>((result || {}) as Record<string, unknown>);

    const successCount = Number(data.successCount ?? 0);
    const failCount = Number(data.failCount ?? data.failedCount ?? 0);

    return {
      successCount: Number.isFinite(successCount) ? successCount : 0,
      failCount: Number.isFinite(failCount) ? failCount : 0,
    };
  }

  async generateTotp(secret: string): Promise<TotpResult> {
    const result = await this.invokeAuthed<any>('generate_totp', { secret });
    const data = snakeToCamel<Record<string, unknown>>((result || {}) as Record<string, unknown>);
    return {
      code: String(data.code ?? ''),
      remaining: Number(data.remaining ?? 0),
    };
  }

  async getAccountHistory(accountId: number): Promise<any[]> {
    const history = await this.invokeAuthed<any[]>('get_account_history', { accountId });
    const historyList = Array.isArray(history) ? history : [];
    return historyList.map(item => snakeToCamel(item));
  }

  async exportDatabaseSql(): Promise<string> {
    return await this.invokeAuthed<string>('export_database_sql');
  }

  async exportAccountsText(
    accountIds: number[] | null,
    search: string | null,
    soldStatus: string | null,
    config: ExportConfig,
  ): Promise<string> {
    return await this.invokeAuthed<string>('export_accounts_text', {
      accountIds: accountIds || null,
      search: search || null,
      soldStatus: soldStatus || null,
      config,
    });
  }

  async deleteAllAccounts(): Promise<number> {
    return await this.invokeAuthed<number>('delete_all_accounts');
  }

  async getDeletedAccounts(): Promise<Account[]> {
    const accounts = await this.invokeAuthed<any[]>('get_deleted_accounts');
    const accountList = Array.isArray(accounts) ? accounts : [];
    return accountList.map(item => snakeToCamel<Account>(item));
  }

  async restoreAccount(id: number): Promise<Account> {
    const result = await this.invokeAuthed<any>('restore_account', { id });
    return snakeToCamel<Account>(result);
  }

  async purgeAccount(id: number): Promise<void> {
    await this.invokeAuthed('purge_account', { id });
  }

  async purgeAllDeleted(): Promise<number> {
    return await this.invokeAuthed<number>('purge_all_deleted');
  }

  async createBackup(reason?: string): Promise<string> {
    return await this.invokeAuthed<string>('create_backup', {
      reason: reason || null,
    });
  }

  async listBackups(): Promise<BackupInfo[]> {
    const list = await this.invokeAuthed<any[]>('list_backups');
    const backups = Array.isArray(list) ? list : [];
    return backups.map(item => snakeToCamel<BackupInfo>(item));
  }

  async restoreBackup(backupName: string): Promise<void> {
    await this.invokeAuthed('restore_backup', { backupName });
  }
}
