// frontend/src/__tests__/adapters.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAdapter, resetAdapter, setAdapter, TauriAdapter, HttpAdapter } from '../services/adapters/index';

describe('getAdapter 自动检测逻辑', () => {
  beforeEach(() => {
    // 每个测试前重置适配器实例
    resetAdapter();
    // 清除所有 mock
    vi.clearAllMocks();
  });

  it('应该在 window.__TAURI__ 存在时选择 TauriAdapter', () => {
    // 模拟 Tauri 环境
    Object.defineProperty(window, '__TAURI__', {
      value: { invoke: vi.fn() },
      writable: true,
      configurable: true,
    });

    // 确保没有 HTTP 模式标志
    delete (import.meta.env as any).VITE_USE_HTTP;
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
      configurable: true,
    });

    const adapter = getAdapter();
    expect(adapter).toBeInstanceOf(TauriAdapter);
  });

  it('应该在 VITE_USE_HTTP=true 时选择 HttpAdapter', () => {
    // 模拟 Tauri 环境存在，但环境变量强制使用 HTTP
    Object.defineProperty(window, '__TAURI__', {
      value: { invoke: vi.fn() },
      writable: true,
      configurable: true,
    });

    // 使用 vi.stubEnv 设置环境变量
    vi.stubEnv('VITE_USE_HTTP', 'true');

    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
      configurable: true,
    });

    resetAdapter();
    const adapter = getAdapter();
    expect(adapter).toBeInstanceOf(HttpAdapter);

    vi.unstubAllEnvs();
  });

  it('应该在 URL 参数 ?use_http=true 时选择 HttpAdapter', () => {
    // 模拟 Tauri 环境存在，但 URL 参数强制使用 HTTP
    Object.defineProperty(window, '__TAURI__', {
      value: { invoke: vi.fn() },
      writable: true,
      configurable: true,
    });

    // 清除环境变量
    delete (import.meta.env as any).VITE_USE_HTTP;

    // 设置 URL 参数
    Object.defineProperty(window, 'location', {
      value: { search: '?use_http=true' },
      writable: true,
      configurable: true,
    });

    resetAdapter();
    const adapter = getAdapter();
    expect(adapter).toBeInstanceOf(HttpAdapter);
  });

  it('应该在没有 window.__TAURI__ 时选择 HttpAdapter', () => {
    // 移除 Tauri 环境
    delete (window as any).__TAURI__;

    // 清除环境变量和 URL 参数
    delete (import.meta.env as any).VITE_USE_HTTP;
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
      configurable: true,
    });

    resetAdapter();
    const adapter = getAdapter();
    expect(adapter).toBeInstanceOf(HttpAdapter);
  });

  it('应该返回单例实例（多次调用返回同一实例）', () => {
    // 设置 Tauri 环境
    Object.defineProperty(window, '__TAURI__', {
      value: { invoke: vi.fn() },
      writable: true,
      configurable: true,
    });

    delete (import.meta.env as any).VITE_USE_HTTP;
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
      configurable: true,
    });

    const adapter1 = getAdapter();
    const adapter2 = getAdapter();
    expect(adapter1).toBe(adapter2);
  });

  it('应该在 resetAdapter 后重新创建实例', () => {
    // 设置 Tauri 环境
    Object.defineProperty(window, '__TAURI__', {
      value: { invoke: vi.fn() },
      writable: true,
      configurable: true,
    });

    delete (import.meta.env as any).VITE_USE_HTTP;
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
      configurable: true,
    });

    const adapter1 = getAdapter();
    resetAdapter();
    const adapter2 = getAdapter();
    expect(adapter1).not.toBe(adapter2);
    expect(adapter2).toBeInstanceOf(TauriAdapter);
  });

  it('setAdapter 应该允许设置自定义适配器', () => {
    const mockAdapter = {
      login: vi.fn(),
      checkAuth: vi.fn(),
      getAccounts: vi.fn(),
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      deleteAccount: vi.fn(),
      toggleStatus: vi.fn(),
      toggleSoldStatus: vi.fn(),
      batchImport: vi.fn(),
      generateTotp: vi.fn(),
      getAccountHistory: vi.fn(),
      exportDatabaseSql: vi.fn(),
      exportAccountsText: vi.fn(),
    };

    setAdapter(mockAdapter);
    const adapter = getAdapter();
    expect(adapter).toBe(mockAdapter);
  });

  it('URL 参数优先级应该高于默认检测', () => {
    // 即使有 __TAURI__，URL 参数也应该强制使用 HTTP
    Object.defineProperty(window, '__TAURI__', {
      value: { invoke: vi.fn() },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, 'location', {
      value: { search: '?use_http=true&other_param=value' },
      writable: true,
      configurable: true,
    });

    delete (import.meta.env as any).VITE_USE_HTTP;

    resetAdapter();
    const adapter = getAdapter();
    expect(adapter).toBeInstanceOf(HttpAdapter);
  });

  it('环境变量优先级应该高于默认检测', () => {
    // 即使有 __TAURI__，环境变量也应该强制使用 HTTP
    Object.defineProperty(window, '__TAURI__', {
      value: { invoke: vi.fn() },
      writable: true,
      configurable: true,
    });

    vi.stubEnv('VITE_USE_HTTP', 'true');

    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
      configurable: true,
    });

    resetAdapter();
    const adapter = getAdapter();
    expect(adapter).toBeInstanceOf(HttpAdapter);

    vi.unstubAllEnvs();
  });

  it('应该在 use_http 参数不为 true 时忽略该参数', () => {
    Object.defineProperty(window, '__TAURI__', {
      value: { invoke: vi.fn() },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, 'location', {
      value: { search: '?use_http=false' },
      writable: true,
      configurable: true,
    });

    delete (import.meta.env as any).VITE_USE_HTTP;

    resetAdapter();
    const adapter = getAdapter();
    expect(adapter).toBeInstanceOf(TauriAdapter);
  });
});
