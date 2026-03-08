import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import HistoryDrawer from '../components/HistoryDrawer';

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    checkAuth: vi.fn(),
    getAccounts: vi.fn(),
    logout: vi.fn(),
    getAccountHistory: vi.fn(),
  },
}));

vi.mock('../services/api', () => ({
  default: mockApi,
}));

vi.mock('../components/AccountListView', () => ({
  default: () => <div data-testid="account-list-view">账号列表内容</div>,
}));

vi.mock('../components/ImportView', () => ({
  default: () => <div data-testid="import-view">导入页内容</div>,
}));

vi.mock('../components/LoginPage', () => ({
  default: () => <div data-testid="login-page">登录页</div>,
}));

vi.mock('../components/EditModal', () => ({
  default: () => null,
}));

describe('移动端布局回归', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockApi.checkAuth.mockResolvedValue({ success: true });
    mockApi.getAccounts.mockResolvedValue([]);
    mockApi.logout.mockResolvedValue({ success: true });
    mockApi.getAccountHistory.mockResolvedValue({ success: true, data: [] });
  });

  it('App 顶栏使用移动端纵向布局并将视图切换器改为两列网格', async () => {
    const { container } = render(<App />);

    await screen.findByRole('button', { name: '账号列表' });

    const navLayout = container.querySelector('nav > div > div');
    expect(navLayout).toHaveClass('flex-col');
    expect(navLayout.className).toContain('sm:flex-row');

    const viewSwitcher = screen.getByRole('button', { name: '账号列表' }).parentElement;
    expect(viewSwitcher).toHaveClass('grid');
    expect(viewSwitcher).toHaveClass('grid-cols-2');
    expect(viewSwitcher.className).toContain('sm:flex');
  });

  it('HistoryDrawer 在移动端使用全宽并限制最大宽度 420px', async () => {
    const { container } = render(
      <HistoryDrawer
        isOpen={true}
        onClose={vi.fn()}
        account={{ id: 1, email: 'mobile-test@gmail.com' }}
        darkMode={false}
      />
    );

    await waitFor(() => {
      expect(mockApi.getAccountHistory).toHaveBeenCalledWith(1);
    });

    const drawerPanel = container.querySelector('div.fixed.right-0.top-0.h-full');
    expect(drawerPanel).not.toBeNull();
    expect(drawerPanel).toHaveClass('w-full');
    expect(drawerPanel).toHaveClass('max-w-[420px]');
    expect(drawerPanel.className).toContain('sm:w-[420px]');
  });
});
