import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Users,
    UserPlus,
    ShieldCheck,
    CheckCircle2,
    Moon,
    Sun,
    LogOut
} from 'lucide-react';

// 导入服务和组件
import api from './services/api';
import AccountListView from './components/AccountListView';
import ImportView from './components/ImportView';
import LoginPage from './components/LoginPage';
import EditModal from './components/EditModal';
import { normalizePhoneNumber } from './utils/phoneUtils';
const App = () => {
    const [view, setView] = useState('list');
    const [accounts, setAccounts] = useState([]);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [soldStatusFilter, setSoldStatusFilter] = useState('all');
    const [groupFilter, setGroupFilter] = useState(null);
    const [notification, setNotification] = useState(null);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const notificationTimerRef = useRef(null);
    const latestLoadRequestIdRef = useRef(0);

    // Modals state
    const [editingAccount, setEditingAccount] = useState(null);

    // Undo state
    const [deletedAccounts, setDeletedAccounts] = useState([]);

    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [authChecking, setAuthChecking] = useState(true);

    // 暗色模式状态
    const [darkMode, setDarkMode] = useState(() => {
        // 从 localStorage 读取用户偏好
        const saved = localStorage.getItem('darkMode');
        return saved ? JSON.parse(saved) : false;
    });

    // 保存暗色模式设置到 localStorage
    useEffect(() => {
        localStorage.setItem('darkMode', JSON.stringify(darkMode));
    }, [darkMode]);

    useEffect(() => {
        let mounted = true;
        const verifySession = async () => {
            try {
                const result = await api.checkAuth();
                if (!mounted) return;
                setIsLoggedIn(Boolean(result?.success && !result?.banned));
            } catch {
                if (!mounted) return;
                setIsLoggedIn(false);
            } finally {
                if (mounted) {
                    setAuthChecking(false);
                }
            }
        };
        verifySession();
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        return () => {
            if (notificationTimerRef.current) {
                clearTimeout(notificationTimerRef.current);
                notificationTimerRef.current = null;
            }
        };
    }, []);

    // 搜索防抖，避免每次按键都触发后端查询
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
        }, 250);
        return () => clearTimeout(timer);
    }, [search]);

    // --- 加载账号数据 ---
    useEffect(() => {
        if (authChecking || !isLoggedIn) {
            setLoading(false);
            return;
        }
        loadAccounts(debouncedSearch, soldStatusFilter);
    }, [authChecking, isLoggedIn, debouncedSearch, soldStatusFilter]);

    const loadAccounts = async (searchValue = search, soldStatusFilterValue = soldStatusFilter) => {
        const requestId = ++latestLoadRequestIdRef.current;
        try {
            setLoading(true);
            const soldStatus = soldStatusFilterValue === 'all' ? null : soldStatusFilterValue;
            const data = await api.getAccounts(searchValue, soldStatus);
            if (requestId !== latestLoadRequestIdRef.current) return;
            setAccounts(data);
        } catch (error) {
            if (requestId !== latestLoadRequestIdRef.current) return;
            const message = String(error?.message || error || '');
            if (message.includes('未登录') || message.toLowerCase().includes('unauthorized')) {
                setIsLoggedIn(false);
                setAccounts([]);
                return;
            }
            console.error('加载账号失败:', error);
            showNotification('加载账号失败', 'error');
        } finally {
            if (requestId !== latestLoadRequestIdRef.current) return;
            setLoading(false);
        }
    };

    // 获取所有唯一的标签
    const allGroups = useMemo(() => {
        const groups = accounts
            .map(acc => acc.groupName)
            .filter(g => g && g.trim() !== '');
        return [...new Set(groups)].sort();
    }, [accounts]);


    // --- Helpers ---
    const showNotification = (msg, type = 'success') => {
        setNotification({ msg, type });

        if (notificationTimerRef.current) {
            clearTimeout(notificationTimerRef.current);
        }

        notificationTimerRef.current = setTimeout(() => {
            setNotification(null);
            notificationTimerRef.current = null;
        }, 5000);
    };

    const copyToClipboard = async (text, label) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const el = document.createElement('textarea');
            el.value = text;
            el.style.position = 'fixed';
            el.style.opacity = '0';
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        }
        showNotification(`已复制 ${label} 到剪切板`);
    };

    const handleLogout = async () => {
        await api.logout();
        setIsLoggedIn(false);
        setAccounts([]);
        setView('list');
        setSearch('');
        setDebouncedSearch('');
    };

    // 撤回删除
    const undoDelete = async () => {
        if (deletedAccounts.length === 0) return;
        try {
            const restoreResults = await Promise.allSettled(
                deletedAccounts.map(acc => api.restoreAccount(acc.id))
            );
            const successCount = restoreResults.filter(
                item => item.status === 'fulfilled' && item.value?.success
            ).length;

            if (successCount > 0) {
                await loadAccounts();
                showNotification(`已撤回 ${successCount} 个账号的删除`);
            } else {
                showNotification('撤回失败', 'error');
            }
        } catch (error) {
            console.error('撤回删除失败:', error);
            showNotification('撤回失败', 'error');
        }
        setDeletedAccounts([]);
    };

    const toggleStatus = async (id) => {
        try {
            const result = await api.toggleStatus(id);
            if (result.success) {
                setAccounts(accounts.map(acc =>
                    acc.id === id ? result.data : acc
                ));
            } else {
                showNotification(result.message || '切换状态失败', 'error');
            }
        } catch (error) {
            console.error('切换状态失败:', error);
            showNotification('切换状态失败', 'error');
        }
    };

    const toggleSoldStatus = async (id) => {
        try {
            const result = await api.toggleSoldStatus(id);
            if (result.success) {
                setAccounts(accounts.map(acc =>
                    acc.id === id ? result.data : acc
                ));
                const status = result.data.soldStatus === 'sold' ? '已售出' : '未售出';
                showNotification(`账号已标记为${status}`);
            } else {
                showNotification(result.message || '切换出售状态失败', 'error');
            }
        } catch (error) {
            console.error('切换出售状态失败:', error);
            showNotification('切换出售状态失败', 'error');
        }
    };

    // --- Handlers ---
    const handleDelete = async (id) => {
        try {
            // 保存要删除的账号用于撤回
            const accountToDelete = accounts.find(acc => acc.id === id);

            const result = await api.deleteAccount(id);
            if (result.success) {
                // 先设置 deletedAccounts，再更新 accounts
                if (accountToDelete) {
                    setDeletedAccounts([accountToDelete]);
                }
                setAccounts(prevAccounts => prevAccounts.filter(acc => acc.id !== id));
                // 使用 setTimeout 确保状态更新后再显示通知
                setTimeout(() => showNotification('账号已删除'), 0);
            } else {
                showNotification(result.message || '删除失败', 'error');
            }
        } catch (error) {
            console.error('删除失败:', error);
            showNotification('删除失败', 'error');
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const updated = {
            email: formData.get('email'),
            password: formData.get('password'),
            recovery: formData.get('recovery'),
            phone: normalizePhoneNumber(formData.get('phone') || '') || '',
            secret: (formData.get('secret') || '').replace(/\s/g, ''),
            regYear: formData.get('regYear'),
            country: formData.get('country'),
            groupName: editingAccount.groupName || '',
            remark: formData.get('remark'),
        };

        try {
            const result = await api.updateAccount(editingAccount.id, updated);
            if (result.success) {
                setAccounts(accounts.map(acc =>
                    acc.id === editingAccount.id ? result.data : acc
                ));
                showNotification('账号信息已更新');
            } else {
                showNotification(result.message || '更新失败', 'error');
            }
        } catch (error) {
            console.error('更新失败:', error);
            showNotification('更新失败', 'error');
        }
        setEditingAccount(null);
    };

    const handleImport = async (importedList) => {
        if (importing) return;
        setImporting(true);
        try {
            const result = await api.batchImport(importedList);
            if (result.success) {
                // 导入完成后重置筛选，避免“导入后看不到数据”
                setView('list');
                setSearch('');
                setSoldStatusFilter('all');
                setGroupFilter(null);
                await loadAccounts('', 'all');

                // 显示导入结果 - 使用API返回的属性名
                const successCount = result.successCount || 0;
                const failCount = result.failCount || 0;
                if (failCount > 0) {
                    // 失败可能来自重复账号、格式问题或字段校验失败
                    showNotification(
                        `成功导入 ${successCount} 个账号，${failCount} 个账号导入失败（可能重复或格式不合法）`,
                        successCount > 0 ? 'success' : 'error'
                    );
                } else {
                    showNotification(`成功导入 ${successCount} 个账号`);
                }
            } else {
                showNotification(result.message || '导入失败', 'error');
            }
        } catch (error) {
            console.error('导入失败:', error);
            showNotification('导入失败', 'error');
        } finally {
            setImporting(false);
        }
    };

    // 行内编辑保存
    const handleInlineEdit = async (id, field, value) => {
        try {
            const account = accounts.find(acc => acc.id === id);
            if (!account) return false;

            const editableFields = new Set(['email', 'password', 'recovery', 'phone', 'secret', 'groupName', 'remark', 'regYear', 'country']);
            if (!editableFields.has(field)) {
                return false;
            }

            const normalizedValue = field === 'secret'
                ? String(value || '').replace(/\s/g, '')
                : field === 'phone'
                    ? (normalizePhoneNumber(value) || '')
                : value;

            const result = await api.updateAccount(id, { [field]: normalizedValue });
            if (result.success) {
                const updatedAccount = result.data || { ...account, [field]: normalizedValue };
                setAccounts(prevAccounts =>
                    prevAccounts.map(acc => (acc.id === id ? updatedAccount : acc))
                );
                showNotification(field + ' 已更新');

                // 当 secret 字段更新时，2FA 验证码会由 AccountListView 内部自动更新
                return true;
            } else {
                showNotification(result.message || '更新失败', 'error');
                return false;
            }
        } catch (error) {
            console.error('更新失败:', error);
            showNotification('更新失败', 'error');
            return false;
        }
    };

    // 清空所有账号并重新导入测试数据
    const handleClearAndReimport = async () => {
        if (!confirm('确定要清空所有账号并重新导入测试数据吗？')) {
            return;
        }

        try {
            // 清空所有账号
            await api.deleteAllAccounts();
            showNotification('账号已清空');

            // 读取测试数据文件并导入
            const response = await fetch('/test-data.txt');
            if (!response.ok) {
                throw new Error('无法读取测试数据文件');
            }
            const testData = await response.text();

            // 解析测试数据
            const lines = testData.split('\n').filter(line => line.trim());
            const accounts = lines.map(line => {
                const parts = line.split('|');
                return {
                    email: parts[0]?.trim() || '',
                    password: parts[1]?.trim() || '',
                    recovery: parts[2]?.trim() || '',
                    phone: '',
                    secret: parts[3]?.trim() || '',
                    regYear: '',
                    country: '',
                    groupName: '',
                    remark: '',
                };
            });

            // 批量导入
            const result = await api.batchImport(accounts);
            if (result.success) {
                showNotification(`已导入 ${result.successCount} 个测试账号`);
                await loadAccounts();
            } else {
                showNotification(`导入失败：${result.failedCount} 个`, 'error');
            }
        } catch (error) {
            console.error('清空并重新导入失败:', error);
            showNotification('操作失败', 'error');
        }
    };

    // 批量删除处理
    const handleBatchDelete = async (ids) => {
        const idsArray = Array.from(ids);

        // 先保存要删除的账号用于撤回
        const accountsToDelete = accounts.filter(acc => idsArray.includes(acc.id));

        const deletePromises = idsArray.map(id =>
            api.deleteAccount(id)
                .then(result => ({ id, success: result.success }))
                .catch(error => {
                    console.error(`删除账号 ${id} 失败:`, error);
                    return { id, success: false, error };
                })
        );

        const results = await Promise.allSettled(deletePromises);

        // 收集成功删除的 ID
        const successfulIds = results
            .filter(r => r.status === 'fulfilled' && r.value.success)
            .map(r => r.value.id);

        // 更新 accounts 状态，移除已删除的账号
        if (successfulIds.length > 0) {
            // 保存成功删除的账号用于撤回
            const deletedItems = accountsToDelete.filter(acc => successfulIds.includes(acc.id));
            setDeletedAccounts(deletedItems);
            setAccounts(prevAccounts =>
                prevAccounts.filter(acc => !successfulIds.includes(acc.id))
            );
            // 使用 setTimeout 确保状态更新后再显示通知
            setTimeout(() => showNotification(`已删除 ${successfulIds.length} 个账号`), 0);
        }

        const failedCount = results.length - successfulIds.length;
        if (failedCount > 0) {
            showNotification(`${failedCount} 个账号删除失败`, 'error');
        }

        return { successfulIds, failedCount };
    };

    // 账号已由后端筛选搜索和出售状态，前端额外过滤标签
    const filteredAccounts = useMemo(() => {
        if (!groupFilter) return accounts;

        // 使用 Set 替代 array.includes() 以提高性能
        const filterSet = new Set([groupFilter]);

        return accounts.filter(acc => {
            const tags = String(acc.groupName || '')
                .split(/[,，\s]+/)
                .map(tag => tag.trim())
                .filter(Boolean);
            // 使用 some + Set.has 替代 includes
            return tags.some(tag => filterSet.has(tag));
        });
    }, [accounts, groupFilter]);

    const globalFontStyle = {
        fontFamily: '"Times New Roman", Times, serif',
    };

    if (authChecking) {
        return (
            <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
                <div className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    <span>正在验证登录状态...</span>
                </div>
            </div>
        );
    }

    // 未登录时显示登录页面
    if (!isLoggedIn) {
        return <LoginPage onLoginSuccess={() => setIsLoggedIn(true)} onClearAndReimport={handleClearAndReimport} darkMode={darkMode} />;
    }

    return (
        <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'}`} style={globalFontStyle}>
            <style>
                {
                    ` * {
                    font-family: "Times New Roman", Times, serif !important;
                }

                .font-mono {
                    font-family: ui-monospace, monospace !important;
                }

                `
                }
            </style>

            <nav className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} border-b sticky top-0 z-30 transition-colors duration-300`}>
                <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <div className="flex items-center gap-2">
                            <div className="bg-blue-600 p-2 rounded-lg">
                                <ShieldCheck className="text-white w-6 h-6" />
                            </div>
                            <span
                                className={`text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r ${darkMode ? 'from-blue-400 to-indigo-400' : 'from-blue-600 to-indigo-600'}`}>
                                GoogleManager
                            </span>
                        </div>

                        <div className="flex items-center gap-4">

                            <div className={`flex gap-1 ${darkMode ? 'bg-slate-700' : 'bg-slate-100'} p-1 rounded-xl`}>
                                <button onClick={() => setView('list')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${view === 'list' ?
                                        (darkMode ? 'bg-slate-600 shadow-sm text-blue-400' : 'bg-white shadow-sm text-blue-600')
                                        : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
                                >
                                    <Users size={18} />
                                    <span className="font-medium">账号列表</span>
                                </button>
                                <button onClick={() => setView('import')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${view === 'import' ?
                                        (darkMode ? 'bg-slate-600 shadow-sm text-blue-400' : 'bg-white shadow-sm text-blue-600')
                                        : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
                                >
                                    <UserPlus size={18} />
                                    <span className="font-medium">导入账号</span>
                                </button>
                            </div>

                            {/* 暗色模式切换按钮 */}
                            <button
                                onClick={() => setDarkMode(!darkMode)}
                                className={`p-2.5 rounded-xl transition-all ${darkMode
                                    ? 'bg-slate-700 text-yellow-400 hover:bg-slate-600'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                title={darkMode ? '切换亮色模式' : '切换暗色模式'}
                            >
                                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                            </button>
                            <button
                                onClick={handleLogout}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${darkMode
                                    ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                                title="退出登录"
                            >
                                <LogOut size={16} />
                                <span className="text-sm font-medium">退出</span>
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-[1600px] mx-auto px-4 py-8">
                {view === 'list' ? (
                    <AccountListView
                        accounts={filteredAccounts}
                        search={search}
                        setSearch={setSearch}
                        soldStatusFilter={soldStatusFilter}
                        setSoldStatusFilter={setSoldStatusFilter}
                        groupFilter={groupFilter}
                        setGroupFilter={setGroupFilter}
                        allGroups={allGroups}
                        copyToClipboard={copyToClipboard}
                        toggleStatus={toggleStatus}
                        toggleSoldStatus={toggleSoldStatus}
                        onEdit={setEditingAccount}
                        onDelete={handleDelete}
                        onBatchDelete={handleBatchDelete}
                        onInlineEdit={handleInlineEdit}
                        onRefreshAccounts={() => loadAccounts()}
                        loading={loading}
                        darkMode={darkMode}
                    />
                ) : (
                    <ImportView onImport={handleImport} onCancel={() => setView('list')} importing={importing} darkMode={darkMode} />
                )}
            </main>

            {/* Notification Toast */}
            {notification && (
                <div className={`fixed bottom-8 right-8 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl transition-all
            animate-bounce z-[100] ${notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                    }`}>
                    <CheckCircle2 size={20} />
                    <span className="font-medium">{notification.msg}</span>
                    {deletedAccounts.length > 0 && notification.type === 'success' && (
                        <button
                            onClick={undoDelete}
                            className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold transition-all"
                        >
                            撤回
                        </button>
                    )}
                </div>
            )}

            {/* Edit Modal */}
            <EditModal
                account={editingAccount}
                onClose={() => setEditingAccount(null)}
                onSubmit={handleUpdate}
            />

        </div>
    );
};

export default App;
