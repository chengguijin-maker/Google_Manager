import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountListView from '../components/AccountListView';
import api from '../services/api';
import { save } from '@tauri-apps/plugin-dialog';

vi.mock('../components/HistoryDrawer', () => ({
  default: () => null,
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: vi.fn(),
}));

vi.mock('../services/api', () => ({
  default: {
    exportAccountsText: vi.fn(),
    exportDatabaseSql: vi.fn(),
  },
}));

const mockAccounts = [
  {
    id: 1,
    email: 'first@gmail.com',
    password: 'pass-1',
    recovery: 'recover-1@gmail.com',
    secret: 'SECRET-1',
    status: 'pro',
    soldStatus: 'unsold',
    groupName: '组A',
    remark: '第一条',
    createdAt: '2024-01-01',
  },
  {
    id: 2,
    email: 'second@gmail.com',
    password: 'pass-2',
    recovery: 'recover-2@gmail.com',
    secret: 'SECRET-2',
    status: 'inactive',
    soldStatus: 'sold',
    groupName: '组A',
    remark: '第二条',
    createdAt: '2024-01-02',
  },
];

const createDefaultProps = (overrides = {}) => ({
  accounts: mockAccounts,
  search: '',
  setSearch: vi.fn(),
  soldStatusFilter: 'all',
  setSoldStatusFilter: vi.fn(),
  groupFilter: null,
  setGroupFilter: vi.fn(),
  allGroups: ['组A'],
  copyToClipboard: vi.fn(),
  twoFACodes: {},
  toggleStatus: vi.fn(),
  toggleSoldStatus: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onBatchDelete: vi.fn(),
  onInlineEdit: vi.fn(),
  loading: false,
  onSearchChange: vi.fn(),
  darkMode: false,
  ...overrides,
});

describe('AccountListView 导出弹窗与参数', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.exportAccountsText.mockResolvedValue({ success: true, data: 'mock export result' });
    api.exportDatabaseSql.mockResolvedValue({ success: true, data: 'mock sql' });
    save.mockResolvedValue(null);
  });

  it('筛选模式显示数量并传递 search 参数', async () => {
    const user = userEvent.setup();
    const props = createDefaultProps({ search: 'first' });

    render(<AccountListView {...props} />);

    await user.click(screen.getByRole('button', { name: '导出账号' }));

    expect(screen.getByText('将导出当前筛选结果，共 2 条')).toBeInTheDocument();
    expect(screen.getByText(/first@gmail.com----pass-1----recover-1@gmail.com----SECRET-1/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '导出' }));

    await waitFor(() => {
        expect(api.exportAccountsText).toHaveBeenCalledWith(
        null,
        'first',
        null,
        expect.objectContaining({
          separator: '----',
          accountOrder: { field: 'id', direction: 'desc' },
          categorySort: { field: '', direction: 'asc' },
          categoryLabelTemplate: '{index}. {groupField}: {groupValue}（共 {count} 条）',
        }),
      );
    });
  });

  it('标签筛选模式通过 accountIds 传递当前筛选结果', async () => {
    const user = userEvent.setup();
    const props = createDefaultProps({ groupFilter: '组A' });

    render(<AccountListView {...props} />);

    await user.click(screen.getByRole('button', { name: '导出账号' }));
    expect(screen.getByText('将导出当前筛选结果，共 2 条')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '导出' }));

    await waitFor(() => {
      expect(api.exportAccountsText).toHaveBeenCalledWith(
        [1, 2],
        null,
        null,
        expect.any(Object),
      );
    });
  });

  it('选中模式优先于筛选并传递选中账号ID', async () => {
    const user = userEvent.setup();
    const props = createDefaultProps({ search: 'first', groupFilter: '组A' });

    render(<AccountListView {...props} />);

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    await user.click(screen.getByRole('button', { name: '导出账号' }));
    expect(screen.getByText('将导出选中的账号，共 1 条')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '导出' }));

    await waitFor(() => {
      expect(api.exportAccountsText).toHaveBeenCalledWith(
        [1],
        null,
        null,
        expect.any(Object),
      );
    });
  });

  it('导出时传递账号顺序、分类排序和分类标签模板配置', async () => {
    const user = userEvent.setup();
    const props = createDefaultProps();

    render(<AccountListView {...props} />);

    await user.click(screen.getByRole('button', { name: '导出账号' }));

    await user.selectOptions(screen.getByLabelText('账号顺序字段'), 'email');
    await user.selectOptions(screen.getByLabelText('账号顺序方向'), 'asc');
    await user.selectOptions(screen.getByLabelText('分类字段'), 'country');
    await user.selectOptions(screen.getByLabelText('分类顺序'), 'desc');

    const categoryLabelTemplateInput = screen.getByLabelText('分类标签模板');
    await user.clear(categoryLabelTemplateInput);
    fireEvent.change(categoryLabelTemplateInput, {
      target: { value: '[{index}] {groupField}-{groupValue} 共{count}条' },
    });

    await user.click(screen.getByRole('button', { name: '导出' }));

    await waitFor(() => {
      expect(api.exportAccountsText).toHaveBeenCalledWith(
        null,
        null,
        null,
        expect.objectContaining({
          accountOrder: { field: 'email', direction: 'asc' },
          categorySort: { field: 'country', direction: 'desc' },
          categoryLabelTemplate: '[{index}] {groupField}-{groupValue} 共{count}条',
        }),
      );
    });
  });
});
