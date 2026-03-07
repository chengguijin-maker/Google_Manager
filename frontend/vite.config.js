import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const normalizeBasePath = (value) => {
    if (!value || value === '/') {
        return '/'
    }

    const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
    return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const frontendHost = process.env.GOOGLE_MANAGER_FRONTEND_HOST || '0.0.0.0'
const frontendPort = Number(process.env.GOOGLE_MANAGER_FRONTEND_PORT || '5173')
const apiTarget = process.env.GOOGLE_MANAGER_API_TARGET || 'http://127.0.0.1:3001'
const basePath = normalizeBasePath(process.env.GOOGLE_MANAGER_BASE_PATH || '/')
const apiBasePath = process.env.VITE_API_URL || (basePath === '/' ? '/api' : `${basePath.slice(0, -1)}/api`)
const allowedHosts = true
const hmrHost = process.env.GOOGLE_MANAGER_HMR_HOST
const hmrProtocol = process.env.GOOGLE_MANAGER_HMR_PROTOCOL || 'wss'
const hmrClientPort = Number(process.env.GOOGLE_MANAGER_HMR_CLIENT_PORT || '443')
const hmrPath = process.env.GOOGLE_MANAGER_HMR_PATH || basePath

const hmrConfig = hmrHost
    ? {
        protocol: hmrProtocol,
        host: hmrHost,
        clientPort: hmrClientPort,
        path: hmrPath,
    }
    : undefined

const proxy = {
    '/api': {
        target: apiTarget,
        changeOrigin: true,
    },
}

if (apiBasePath !== '/api') {
    proxy[apiBasePath] = {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(new RegExp(`^${escapeRegex(apiBasePath)}`), '/api'),
    }
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: basePath,
    define: {
        'import.meta.env.VITE_API_URL': JSON.stringify(apiBasePath),
    },
    build: {
        outDir: path.resolve(__dirname, '../static'),
        emptyOutDir: true,
    },
    server: {
        host: frontendHost,
        port: frontendPort,
        strictPort: true,
        allowedHosts,
        ...(hmrConfig ? { hmr: hmrConfig } : {}),
        proxy,
    },
    preview: {
        host: frontendHost,
        port: frontendPort,
        strictPort: true,
        allowedHosts,
    },
})
