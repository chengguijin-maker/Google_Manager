import { vi } from 'vitest';

export const mockApi = {
  getAccounts: vi.fn().mockResolvedValue([]),
  batchImport: vi.fn().mockResolvedValue({ success: true, data: { success_count: 1, failed_count: 0, failed_emails: [] } }),
  updateAccount: vi.fn().mockResolvedValue({ success: true, data: {} }),
  deleteAccount: vi.fn().mockResolvedValue({ success: true }),
  toggleStatus: vi.fn().mockResolvedValue({ success: true, data: {} }),
  toggleSoldStatus: vi.fn().mockResolvedValue({ success: true, data: {} }),
  get2FACode: vi.fn().mockResolvedValue({ success: true, data: { code: '123456', expiry: 30 } }),
};

export default mockApi;
