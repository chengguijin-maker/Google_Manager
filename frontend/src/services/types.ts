// frontend/src/services/types.ts

export interface Account {
  id: number;
  email: string;
  password: string;
  recovery: string | null;
  phone: string | null;
  secret: string | null;
  regYear: string | null;
  country: string | null;
  groupName: string | null;
  remark: string | null;
  status: 'pro' | 'inactive';
  soldStatus: 'sold' | 'unsold';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface AccountInput {
  email: string;
  password: string;
  recovery?: string;
  phone?: string;
  secret?: string;
  regYear?: string;
  country?: string;
  groupName?: string;
  remark?: string;
}

export interface LoginResult {
  success: boolean;
  message?: string;
  banned?: boolean;
  sessionToken?: string;
  expiresAtEpochSecs?: number;
}

export interface CheckAuthResult {
  success: boolean;
  banned: boolean;
  message?: string;
  sessionToken?: string;
  expiresAtEpochSecs?: number;
}

export interface BatchImportResult {
  successCount: number;
  failCount: number;
}

export interface TotpResult {
  code: string;
  remaining: number;
}

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
  checksum?: string | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export type ExportDataField =
  | 'email'
  | 'password'
  | 'recovery'
  | 'phone'
  | 'secret'
  | 'reg_year'
  | 'country'
  | 'group_name'
  | 'remark'
  | 'status'
  | 'sold_status';

export type ExportSortDirection = 'asc' | 'desc';

export type ExportAccountOrderField =
  | 'id'
  | 'email'
  | 'recovery'
  | 'phone'
  | 'reg_year'
  | 'country'
  | 'group_name'
  | 'status'
  | 'sold_status'
  | 'created_at'
  | 'updated_at';

export type ExportCategoryField =
  | ''
  | 'group_name'
  | 'country'
  | 'reg_year'
  | 'status'
  | 'sold_status';

export interface ExportAccountOrderConfig {
  field: ExportAccountOrderField;
  direction: ExportSortDirection;
}

export interface ExportCategorySortConfig {
  field: ExportCategoryField;
  direction: ExportSortDirection;
}

export interface ExportConfig {
  separator: string;
  fields: ExportDataField[];
  includeStats: boolean;
  accountOrder: ExportAccountOrderConfig;
  categorySort: ExportCategorySortConfig;
  categoryLabelTemplate: string;
}

export interface ApiAdapter {
  login(password: string): Promise<LoginResult>;
  checkAuth(): Promise<CheckAuthResult>;
  logout(): Promise<void>;
  getAccounts(search?: string, soldStatus?: string): Promise<Account[]>;
  getDeletedAccounts(): Promise<Account[]>;
  createAccount(account: AccountInput): Promise<Account>;
  updateAccount(id: number, account: Partial<AccountInput>): Promise<Account>;
  deleteAccount(id: number): Promise<void>;
  restoreAccount(id: number): Promise<Account>;
  purgeAccount(id: number): Promise<void>;
  purgeAllDeleted(): Promise<number>;
  deleteAllAccounts(): Promise<number>;
  toggleStatus(id: number): Promise<Account>;
  toggleSoldStatus(id: number): Promise<Account>;
  batchImport(accounts: AccountInput[]): Promise<BatchImportResult>;
  generateTotp(secret: string): Promise<TotpResult>;
  getAccountHistory(accountId: number): Promise<any[]>;
  createBackup(reason?: string): Promise<string>;
  listBackups(): Promise<BackupInfo[]>;
  restoreBackup(backupName: string): Promise<void>;
  exportDatabaseSql(): Promise<string>;
  exportAccountsText(
    accountIds: number[] | null,
    search: string | null,
    soldStatus: string | null,
    config: ExportConfig,
  ): Promise<string>;
}
