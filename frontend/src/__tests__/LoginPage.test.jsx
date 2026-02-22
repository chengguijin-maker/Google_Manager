import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from '../components/LoginPage';
import api from '../services/api';

// Mock the api module
vi.mock('../services/api', () => ({
  default: {
    login: vi.fn(),
    checkAuth: vi.fn(),
  },
}));

describe('LoginPage 组件', () => {
  const mockOnLoginSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default mock implementation for checkAuth
    api.checkAuth.mockResolvedValue({ banned: false });
  });

  it('渲染登录表单', async () => {
    render(<LoginPage onLoginSuccess={mockOnLoginSuccess} darkMode={false} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/请输入密码/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /进入系统/i })).toBeInTheDocument();
    expect(screen.getByText(/GoogleManager/i)).toBeInTheDocument();
  });

  it('空密码点击登录显示错误提示', async () => {
    render(<LoginPage onLoginSuccess={mockOnLoginSuccess} darkMode={false} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/请输入密码/i)).toBeInTheDocument();
    });

    const loginButton = screen.getByRole('button', { name: /进入系统/i });
    await userEvent.click(loginButton);

    // 应该显示错误提示
    await waitFor(() => {
      expect(screen.getByText(/请输入密码/i)).toBeInTheDocument();
    });
    expect(mockOnLoginSuccess).not.toHaveBeenCalled();
  });

  it('输入密码后成功登录', async () => {
    api.login.mockResolvedValue({ success: true });

    render(<LoginPage onLoginSuccess={mockOnLoginSuccess} darkMode={false} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/请输入密码/i)).toBeInTheDocument();
    });

    const passwordInput = screen.getByPlaceholderText(/请输入密码/i);
    const loginButton = screen.getByRole('button', { name: /进入系统/i });

    await userEvent.type(passwordInput, 'admin123');
    await userEvent.click(loginButton);

    await waitFor(() => {
      expect(mockOnLoginSuccess).toHaveBeenCalled();
    });
    expect(api.login).toHaveBeenCalledWith('admin123');
  });

  it('登录失败显示错误消息', async () => {
    api.login.mockResolvedValue({ success: false, message: '密码错误' });

    render(<LoginPage onLoginSuccess={mockOnLoginSuccess} darkMode={false} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/请输入密码/i)).toBeInTheDocument();
    });

    const passwordInput = screen.getByPlaceholderText(/请输入密码/i);
    const loginButton = screen.getByRole('button', { name: /进入系统/i });

    await userEvent.type(passwordInput, 'wrongpassword');
    await userEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText(/密码错误/i)).toBeInTheDocument();
    });
    expect(mockOnLoginSuccess).not.toHaveBeenCalled();
  });

  it('登录成功后不再写入旧版 localStorage 登录时间戳', async () => {
    api.login.mockResolvedValue({ success: true });

    render(<LoginPage onLoginSuccess={mockOnLoginSuccess} darkMode={false} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/请输入密码/i)).toBeInTheDocument();
    });

    const passwordInput = screen.getByPlaceholderText(/请输入密码/i);
    const loginButton = screen.getByRole('button', { name: /进入系统/i });

    await userEvent.type(passwordInput, 'test123');
    await userEvent.click(loginButton);

    await waitFor(() => {
      expect(mockOnLoginSuccess).toHaveBeenCalled();
    });
    expect(localStorage.getItem('loginData')).toBeNull();
  });

  it('暗色模式渲染正确', async () => {
    render(<LoginPage onLoginSuccess={mockOnLoginSuccess} darkMode={true} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/请输入密码/i)).toBeInTheDocument();
    });

    // 检查暗色模式背景类名
    const mainContainer = screen.getByPlaceholderText(/请输入密码/i).closest('.min-h-screen');
    expect(mainContainer).toHaveClass('bg-slate-900');
  });

  it('显示封禁状态', async () => {
    api.checkAuth.mockResolvedValue({
      banned: true,
      message: 'IP 已被封禁 24 小时'
    });

    render(<LoginPage onLoginSuccess={mockOnLoginSuccess} darkMode={false} />);

    await waitFor(() => {
      expect(screen.getByText(/访问被拒绝/i)).toBeInTheDocument();
      expect(screen.getByText(/IP 已被封禁 24 小时/i)).toBeInTheDocument();
    });

    // 不应显示登录表单
    expect(screen.queryByPlaceholderText(/请输入密码/i)).not.toBeInTheDocument();
  });

  it('登录时显示加载状态', async () => {
    api.login.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ success: true }), 100)));

    render(<LoginPage onLoginSuccess={mockOnLoginSuccess} darkMode={false} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/请输入密码/i)).toBeInTheDocument();
    });

    const passwordInput = screen.getByPlaceholderText(/请输入密码/i);
    const loginButton = screen.getByRole('button', { name: /进入系统/i });

    await userEvent.type(passwordInput, 'test123');
    await userEvent.click(loginButton);

    // 应该显示加载状态
    await waitFor(() => {
      expect(screen.getByText(/验证中.../i)).toBeInTheDocument();
    });
  });

  it('切换密码可见性', async () => {
    render(<LoginPage onLoginSuccess={mockOnLoginSuccess} darkMode={false} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/请输入密码/i)).toBeInTheDocument();
    });

    const passwordInput = screen.getByPlaceholderText(/请输入密码/i);

    // 初始状态应该是 password 类型
    expect(passwordInput).toHaveAttribute('type', 'password');

    // 点击眼睛图标切换
    const toggleButton = screen.getByRole('button', { name: '' });
    await userEvent.click(toggleButton);

    // 应该变成 text 类型
    expect(passwordInput).toHaveAttribute('type', 'text');

    // 再次点击切换回来
    await userEvent.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('API 调用失败显示通用错误', async () => {
    api.login.mockRejectedValue(new Error('Network error'));

    render(<LoginPage onLoginSuccess={mockOnLoginSuccess} darkMode={false} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/请输入密码/i)).toBeInTheDocument();
    });

    const passwordInput = screen.getByPlaceholderText(/请输入密码/i);
    const loginButton = screen.getByRole('button', { name: /进入系统/i });

    await userEvent.type(passwordInput, 'test123');
    await userEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText(/登录失败，请稍后重试/i)).toBeInTheDocument();
    });
  });

  it('封禁消息中包含"封禁"关键字时设置封禁状态', async () => {
    api.login.mockResolvedValue({
      success: false,
      message: '密码错误次数过多，已被封禁 24 小时'
    });

    render(<LoginPage onLoginSuccess={mockOnLoginSuccess} darkMode={false} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/请输入密码/i)).toBeInTheDocument();
    });

    const passwordInput = screen.getByPlaceholderText(/请输入密码/i);
    const loginButton = screen.getByRole('button', { name: /进入系统/i });

    await userEvent.type(passwordInput, 'wrongpassword');
    await userEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText(/访问被拒绝/i)).toBeInTheDocument();
      expect(screen.getByText(/密码错误次数过多，已被封禁 24 小时/i)).toBeInTheDocument();
    });
  });
});
