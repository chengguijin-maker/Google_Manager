// frontend/src/services/adapters/index.ts

import type { ApiAdapter } from '../types';
import { TauriAdapter } from './tauri-adapter';
import { HttpAdapter } from './http-adapter';

// 检测是否在 Tauri 环境中运行
const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

// 检测是否强制使用 HTTP 模式（用于测试）
const isHttpMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  // 检查 URL 参数或环境变量
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('use_http') === 'true' ||
         import.meta.env.VITE_USE_HTTP === 'true';
};

// 单例适配器实例
let adapterInstance: ApiAdapter | null = null;

/**
 * 获取 API 适配器
 *
 * - 在 Tauri 环境下使用 TauriAdapter（通过 invoke 调用）
 * - 在测试模式或非 Tauri 环境使用 HttpAdapter（通过 fetch 调用）
 */
export const getAdapter = (): ApiAdapter => {
  if (adapterInstance) {
    return adapterInstance;
  }

  if (isHttpMode() || !isTauri()) {
    console.log('[API] Using HttpAdapter (test/web mode)');
    adapterInstance = new HttpAdapter();
  } else {
    console.log('[API] Using TauriAdapter (production mode)');
    adapterInstance = new TauriAdapter();
  }

  return adapterInstance;
};

/**
 * 重置适配器实例（用于测试）
 */
export const resetAdapter = (): void => {
  adapterInstance = null;
};

/**
 * 设置自定义适配器（用于测试）
 */
export const setAdapter = (adapter: ApiAdapter): void => {
  adapterInstance = adapter;
};

// 导出适配器类以便直接使用
export { TauriAdapter } from './tauri-adapter';
export { HttpAdapter } from './http-adapter';
export type { ApiAdapter } from '../types';
