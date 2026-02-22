import { useMemo, useState, useCallback, useEffect } from 'react';
import {
    Search,
    Filter,
    Tag,
    Database,
    FileDown,
    RotateCcw,
    Trash2,
} from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import Pagination from './Pagination';
import usePagination from '../hooks/usePagination';
import useInlineEdit from '../hooks/useInlineEdit';
import useAccountSelection from '../hooks/useAccountSelection';
import useTwoFA from '../hooks/useTwoFA';
import HistoryDrawer from './HistoryDrawer';
import ExportDialog from './ExportDialog';
import BatchToolbar from './BatchToolbar';
import AccountTable from './AccountTable';
import api from '../services/api';

const REUSABLE_INLINE_FIELDS = ['recovery', 'phone', 'groupName', 'remark', 'regYear', 'country'];
const DEFAULT_EXPORT_CATEGORY_LABEL_TEMPLATE = '{index}. {groupField}: {groupValue}（共 {count} 条）';
const DEFAULT_EXPORT_CONFIG = Object.freeze({
    separator: '----',
    fields: ['email', 'password', 'recovery', 'secret'],
    includeStats: true,
    accountOrder: {
        field: 'id',
        direction: 'desc',
    },
    categorySort: {
        field: '',
        direction: 'asc',
    },
    categoryLabelTemplate: DEFAULT_EXPORT_CATEGORY_LABEL_TEMPLATE,
});

const buildEmptyRecentValues = () =>
    Object.fromEntries(REUSABLE_INLINE_FIELDS.map(field => [field, []]));

const extractReusableCandidates = (field, value) => {
    if (!REUSABLE_INLINE_FIELDS.includes(field)) return [];
    if (value === null || value === undefined) return [];

    if (field === 'groupName') {
        return String(value)
            .split(/[,，\s]+/)
            .map(item => item.trim())
            .filter(Boolean);
    }

    const normalized = String(value).trim();
    return normalized ? [normalized] : [];
};

const normalizeSortDirection = (direction, fallbackDirection) =>
    direction === 'asc' || direction === 'desc' ? direction : fallbackDirection;

const normalizeExportConfig = (rawConfig) => {
    const rawFields = Array.isArray(rawConfig?.fields)
        ? rawConfig.fields.filter(field => typeof field === 'string' && field.trim() !== '')
        : [];

    const separator = typeof rawConfig?.separator === 'string' && rawConfig.separator !== ''
        ? rawConfig.separator
        : DEFAULT_EXPORT_CONFIG.separator;

    const includeStats = typeof rawConfig?.includeStats === 'boolean'
        ? rawConfig.includeStats
        : DEFAULT_EXPORT_CONFIG.includeStats;

    const accountOrderField = typeof rawConfig?.accountOrder?.field === 'string'
        ? rawConfig.accountOrder.field
        : DEFAULT_EXPORT_CONFIG.accountOrder.field;

    const categorySortField = typeof rawConfig?.categorySort?.field === 'string'
        ? rawConfig.categorySort.field
        : DEFAULT_EXPORT_CONFIG.categorySort.field;

    const categoryLabelTemplate = typeof rawConfig?.categoryLabelTemplate === 'string'
        && rawConfig.categoryLabelTemplate.trim() !== ''
        ? rawConfig.categoryLabelTemplate
        : DEFAULT_EXPORT_CONFIG.categoryLabelTemplate;

    return {
        separator,
        fields: rawFields.length > 0 ? rawFields : [...DEFAULT_EXPORT_CONFIG.fields],
        includeStats,
        accountOrder: {
            field: accountOrderField,
            direction: normalizeSortDirection(
                rawConfig?.accountOrder?.direction,
                DEFAULT_EXPORT_CONFIG.accountOrder.direction
            ),
        },
        categorySort: {
            field: categorySortField,
            direction: normalizeSortDirection(
                rawConfig?.categorySort?.direction,
                DEFAULT_EXPORT_CONFIG.categorySort.direction
            ),
        },
        categoryLabelTemplate,
    };
};

/**
 * 账号列表视图组件（主容器）
 */
const AccountListView = ({
    accounts,
    search,
    setSearch,
    soldStatusFilter,
    setSoldStatusFilter,
    groupFilter,
    setGroupFilter,
    allGroups,
    copyToClipboard,
    twoFACodes: externalTwoFACodes,
    toggleStatus,
    toggleSoldStatus,
    onEdit,
    onDelete,
    onBatchDelete,
    onInlineEdit,
    onRefreshAccounts,
    loading,
    onSearchChange,
    darkMode
}) => {
    const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
    const [inlineRecentValuesByField, setInlineRecentValuesByField] = useState(() => buildEmptyRecentValues());

    const sortedAccounts = useMemo(() => {
        if (!sortConfig.key || !sortConfig.direction) return accounts;

        const isEmpty = (value) => value === null || value === undefined || String(value).trim() === '';
        const compareNullableText = (a, b, direction) => {
            const aEmpty = isEmpty(a);
            const bEmpty = isEmpty(b);
            if (aEmpty && bEmpty) return 0;
            if (aEmpty) return direction === 'asc' ? 1 : -1;
            if (bEmpty) return direction === 'asc' ? -1 : 1;
            const result = String(a).localeCompare(String(b), 'zh-CN', { numeric: true, sensitivity: 'base' });
            return direction === 'asc' ? result : -result;
        };

        const direction = sortConfig.direction;
        const sorted = [...accounts].sort((a, b) => {
            switch (sortConfig.key) {
                case 'id': {
                    const aId = Number(a.id) || 0;
                    const bId = Number(b.id) || 0;
                    return direction === 'asc' ? aId - bId : bId - aId;
                }
                case 'email':
                case 'recovery':
                case 'secret':
                case 'phone':
                case 'groupName':
                case 'remark':
                case 'country': {
                    return compareNullableText(a[sortConfig.key], b[sortConfig.key], direction);
                }
                case 'regYear': {
                    const aYear = Number.parseInt(a.regYear, 10);
                    const bYear = Number.parseInt(b.regYear, 10);
                    const aValid = Number.isFinite(aYear) ? aYear : null;
                    const bValid = Number.isFinite(bYear) ? bYear : null;
                    if (aValid === null && bValid === null) return 0;
                    if (aValid === null) return direction === 'asc' ? 1 : -1;
                    if (bValid === null) return direction === 'asc' ? -1 : 1;
                    return direction === 'asc' ? aValid - bValid : bValid - aValid;
                }
                case 'status': {
                    const statusRank = { inactive: 0, pro: 1 };
                    const soldRank = { unsold: 0, sold: 1 };
                    const aStatus = statusRank[a.status] ?? -1;
                    const bStatus = statusRank[b.status] ?? -1;
                    if (aStatus !== bStatus) {
                        return direction === 'asc' ? aStatus - bStatus : bStatus - aStatus;
                    }

                    const aSold = soldRank[a.soldStatus] ?? -1;
                    const bSold = soldRank[b.soldStatus] ?? -1;
                    return direction === 'asc' ? aSold - bSold : bSold - aSold;
                }
                case 'createdAt': {
                    const aTs = Date.parse(a.createdAt || '');
                    const bTs = Date.parse(b.createdAt || '');
                    const aValid = Number.isNaN(aTs) ? null : aTs;
                    const bValid = Number.isNaN(bTs) ? null : bTs;
                    if (aValid === null && bValid === null) {
                        return compareNullableText(a.createdAt, b.createdAt, direction);
                    }
                    if (aValid === null) return direction === 'asc' ? 1 : -1;
                    if (bValid === null) return direction === 'asc' ? -1 : 1;
                    return direction === 'asc' ? aValid - bValid : bValid - aValid;
                }
                default:
                    return 0;
            }
        });

        return sorted;
    }, [accounts, sortConfig]);

    const pagination = usePagination(sortedAccounts, 10);

    // 2FA 验证码：只处理当前页可见账号
    const { twoFACodes: visibleTwoFACodes } = useTwoFA(pagination.paginatedData);
    const twoFACodes = externalTwoFACodes ?? visibleTwoFACodes;

    // 可复用列的最近 5 条值（用于行内编辑自动补全）
    const accountRecentValuesByField = useMemo(() => {
        const byField = Object.fromEntries(REUSABLE_INLINE_FIELDS.map(field => [field, []]));
        const seenByField = Object.fromEntries(REUSABLE_INLINE_FIELDS.map(field => [field, new Set()]));

        // accounts 默认后端按 id DESC 返回，直接线性扫描可避免每次 n log n 排序
        for (const account of accounts) {
            for (const field of REUSABLE_INLINE_FIELDS) {
                if (byField[field].length >= 5) continue;

                const rawValue = account?.[field];
                if (!rawValue) continue;

                const candidates = field === 'groupName'
                    ? String(rawValue).split(/[,，\s]+/).map(item => item.trim()).filter(Boolean)
                    : [String(rawValue).trim()];

                for (const candidate of candidates) {
                    if (!candidate || seenByField[field].has(candidate)) continue;
                    seenByField[field].add(candidate);
                    byField[field].push(candidate);
                    if (byField[field].length >= 5) break;
                }
            }

            if (REUSABLE_INLINE_FIELDS.every(field => byField[field].length >= 5)) break;
        }

        return byField;
    }, [accounts]);

    const recentValuesByField = useMemo(() => {
        const merged = buildEmptyRecentValues();

        for (const field of REUSABLE_INLINE_FIELDS) {
            const result = [];
            const seen = new Set();
            const sources = [
                inlineRecentValuesByField[field] || [],
                accountRecentValuesByField[field] || [],
            ];

            for (const source of sources) {
                for (const item of source) {
                    const normalized = String(item || '').trim();
                    if (!normalized || seen.has(normalized)) continue;
                    seen.add(normalized);
                    result.push(normalized);
                    if (result.length >= 5) break;
                }
                if (result.length >= 5) break;
            }

            merged[field] = result;
        }

        return merged;
    }, [inlineRecentValuesByField, accountRecentValuesByField]);

    const trackRecentInlineValue = useCallback((field, value) => {
        const candidates = extractReusableCandidates(field, value);
        if (candidates.length === 0) return;

        setInlineRecentValuesByField(prev => {
            const next = { ...prev };
            const current = Array.isArray(prev[field]) ? prev[field] : [];
            const updated = [...current];

            for (const candidate of candidates) {
                const existingIndex = updated.indexOf(candidate);
                if (existingIndex >= 0) {
                    updated.splice(existingIndex, 1);
                }
                updated.unshift(candidate);
            }

            next[field] = updated.slice(0, 5);
            return next;
        });
    }, []);

    const handleInlineEditWithRecent = useCallback((id, field, value) => {
        trackRecentInlineValue(field, value);
        if (typeof onInlineEdit === 'function') {
            return onInlineEdit(id, field, value);
        }
        return Promise.resolve(false);
    }, [onInlineEdit, trackRecentInlineValue]);

    // 历史抽屉状态
    const [historyDrawer, setHistoryDrawer] = useState({ isOpen: false, account: null });

    // 批量处理状态
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);

    // 导出对话框状态
    const [exportDialog, setExportDialog] = useState({ isOpen: false, mode: 'all' });
    const [recycleDrawer, setRecycleDrawer] = useState({ isOpen: false, loading: false, accounts: [] });

    // 行内编辑 Hook
    const inlineEdit = useInlineEdit({ onInlineEdit: handleInlineEditWithRecent, allGroups, recentValuesByField });

    // 多选 Hook
    const selection = useAccountSelection();
    const currentResultAccountIds = useMemo(
        () => sortedAccounts.map(account => account.id),
        [sortedAccounts]
    );

    const normalizedSearchKeyword = (search || '').trim();
    const hasSoldStatusFilter = soldStatusFilter !== 'all';
    const hasGroupNameFilter = Boolean(groupFilter);
    const selectedAccountIds = Array.from(selection.selectedIds);
    const selectedAccountsForExport = accounts.filter(account => selection.selectedIds.has(account.id));

    const getCurrentExportMode = () => {
        if (selectedAccountIds.length > 0) return 'selected';
        if (normalizedSearchKeyword || hasSoldStatusFilter || hasGroupNameFilter) return 'filtered';
        return 'all';
    };

    const buildExportRequestParams = (mode) => {
        if (mode === 'selected') {
            return { accountIds: selectedAccountIds, searchParam: null, soldStatusParam: null };
        }
        if (mode === 'filtered') {
            if (hasGroupNameFilter) {
                return { accountIds: accounts.map(a => a.id), searchParam: null, soldStatusParam: null };
            }
            return {
                accountIds: null,
                searchParam: normalizedSearchKeyword || null,
                soldStatusParam: hasSoldStatusFilter ? soldStatusFilter : null,
            };
        }
        return { accountIds: null, searchParam: null, soldStatusParam: null };
    };

    const exportScopeCounts = {
        selected: selectedAccountIds.length,
        filtered: accounts.length,
        all: accounts.length,
    };

    const previewAccountsForExport = exportDialog.mode === 'selected'
        ? selectedAccountsForExport
        : accounts;

    // 筛选切换或结果集变更时，清理不在当前结果中的残留选中 ID
    useEffect(() => {
        selection.keepOnlyCurrentResultIds(currentResultAccountIds);
    }, [selection.keepOnlyCurrentResultIds, currentResultAccountIds]);

    const handleSelectAllCurrentResult = useCallback(() => {
        selection.selectAllCurrentResult(currentResultAccountIds);
    }, [selection.selectAllCurrentResult, currentResultAccountIds]);

    const canSelectAllCurrentResult = (
        selection.selectedIds.size > 0 &&
        selection.selectedIds.size < currentResultAccountIds.length
    );

    const handleSortChange = (key) => {
        setSortConfig(prev => {
            if (prev.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
        pagination.resetPage();
    };

    // 搜索时重置到第一页
    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        pagination.resetPage();
        if (onSearchChange) onSearchChange(e.target.value);
    };

    // 历史抽屉
    const openHistoryDrawer = (account) => setHistoryDrawer({ isOpen: true, account });
    const closeHistoryDrawer = () => setHistoryDrawer({ isOpen: false, account: null });

    // 复制全部信息
    const copyAllInfo = (acc) => {
        const cleanSecret = acc.secret ? acc.secret.replace(/\s/g, '') : '';
        const fullInfo = `邮箱账号：${acc.email}
密码：${acc.password}
恢复邮箱：${acc.recovery}
手机号：${acc.phone || '无'}
注册年份：${acc.regYear || '无'}
国家：${acc.country || '无'}
谷歌验证码获取：https://2fa.run/2fa/${cleanSecret}
【账号到手后必备工作】：https://qcn4p837qb99.feishu.cn/wiki/S2bFwQ5vBifHgCkrmgrcAUzlnJd?from=from_copylink`;
        copyToClipboard(fullInfo, '全部信息');
    };

    // 批量删除
    const handleBatchDelete = async () => {
        if (selection.selectedIds.size === 0 || isBatchProcessing) return;
        setIsBatchProcessing(true);
        try {
            await onBatchDelete(selection.selectedIds);
            selection.clearSelection();
        } catch (error) {
            console.error('批量删除失败:', error);
        } finally {
            setIsBatchProcessing(false);
        }
    };

    // 批量编辑
    const handleBatchEdit = useCallback(async (field, fieldLabel) => {
        if (selection.selectedIds.size === 0 || isBatchProcessing) return;

        const value = window.prompt(`请输入要设置的${fieldLabel}（将应用到选中的 ${selection.selectedIds.size} 个账号）：`);
        if (value === null) return;

        if (field === 'regYear' && value.trim() !== '') {
            if (!/^\d{4}$/.test(value.trim())) {
                alert('注册年份必须是4位数字（如：2021）');
                return;
            }
        }

        setIsBatchProcessing(true);
        try {
            const updatePromises = Array.from(selection.selectedIds).map(id =>
                handleInlineEditWithRecent(id, field, value)
                    .then(success => ({ id, success }))
                    .catch(error => {
                        console.error(`更新账号 ${id} 失败:`, error);
                        return { id, success: false, error };
                    })
            );

            const results = await Promise.allSettled(updatePromises);
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failCount = results.length - successCount;

            if (failCount > 0 && successCount === 0) {
                alert(`批量更新失败，共 ${failCount} 个账号`);
            } else if (failCount > 0) {
                alert(`成功更新 ${successCount} 个账号，${failCount} 个失败`);
            }

            selection.clearSelection();
        } catch (error) {
            console.error('批量编辑失败:', error);
            alert('批量编辑失败');
        } finally {
            setIsBatchProcessing(false);
        }
    }, [selection, isBatchProcessing, handleInlineEditWithRecent]);

    // 导出数据库
    const handleExportDatabase = async () => {
        try {
            const result = await api.exportDatabaseSql();
            if (!result.success) { alert('导出失败: ' + result.message); return; }

            const dateStr = new Date().toISOString().split('T')[0];
            const filePath = await save({
                defaultPath: `google_manager_backup_${dateStr}.sql`,
                filters: [{ name: 'SQL Files', extensions: ['sql'] }]
            });

            if (filePath) {
                await writeTextFile(filePath, result.data);
                alert('数据库导出成功！');
            }
        } catch (error) {
            console.error('导出数据库失败:', error);
            alert('导出失败: ' + error.message);
        }
    };

    // 导出账号
    const handleOpenExportDialog = () => {
        setExportDialog({ isOpen: true, mode: getCurrentExportMode() });
    };

    const handleExportAccounts = async (config) => {
        try {
            const { accountIds, searchParam, soldStatusParam } = buildExportRequestParams(exportDialog.mode);
            const normalizedConfig = normalizeExportConfig(config);
            const result = await api.exportAccountsText(accountIds, searchParam, soldStatusParam, normalizedConfig);
            if (!result.success) { alert('导出失败: ' + result.message); return; }

            const dateStr = new Date().toISOString().split('T')[0];
            const filePath = await save({
                defaultPath: `accounts_export_${dateStr}.txt`,
                filters: [{ name: 'Text Files', extensions: ['txt'] }]
            });

            if (filePath) {
                await writeTextFile(filePath, result.data);
                setExportDialog({ isOpen: false, mode: 'all' });
                alert('账号导出成功！');
            }
        } catch (error) {
            console.error('导出账号失败:', error);
            alert('导出失败: ' + error.message);
        }
    };

    const loadDeletedAccounts = async () => {
        setRecycleDrawer(prev => ({ ...prev, loading: true }));
        try {
            const result = await api.getDeletedAccounts();
            if (result.success) {
                setRecycleDrawer(prev => ({ ...prev, accounts: result.data || [], loading: false }));
            } else {
                setRecycleDrawer(prev => ({ ...prev, loading: false }));
                alert(result.message || '加载回收站失败');
            }
        } catch (error) {
            setRecycleDrawer(prev => ({ ...prev, loading: false }));
            alert(error.message || '加载回收站失败');
        }
    };

    const openRecycleDrawer = async () => {
        setRecycleDrawer(prev => ({ ...prev, isOpen: true }));
        await loadDeletedAccounts();
    };

    const closeRecycleDrawer = () => {
        setRecycleDrawer({ isOpen: false, loading: false, accounts: [] });
    };

    const handleRestoreDeleted = async (id) => {
        const result = await api.restoreAccount(id);
        if (!result.success) {
            alert(result.message || '恢复失败');
            return;
        }
        await loadDeletedAccounts();
        if (onRefreshAccounts) {
            await onRefreshAccounts();
        }
    };

    const handlePurgeDeleted = async (id) => {
        if (!window.confirm('确定永久删除该账号吗？此操作不可撤销。')) return;
        const result = await api.purgeAccount(id);
        if (!result.success) {
            alert(result.message || '永久删除失败');
            return;
        }
        await loadDeletedAccounts();
    };

    const handlePurgeAllDeleted = async () => {
        if (!window.confirm('确定清空回收站吗？此操作不可撤销。')) return;
        const result = await api.purgeAllDeleted();
        if (!result.success) {
            alert(result.message || '清空回收站失败');
            return;
        }
        await loadDeletedAccounts();
    };

    return (
        <>
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>账号库</h1>
                        <p className={darkMode ? 'text-slate-400' : 'text-slate-500'}>管理您的所有谷歌账号资产</p>
                    </div>
                    <div className="relative w-full md:w-80">
                        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={18} />
                        <input
                            type="text"
                            placeholder="搜索邮箱或备注内容..."
                            value={search}
                            onChange={handleSearchChange}
                            className={`w-full pl-10 pr-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm ${darkMode
                                ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500'
                                : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400'} border`}
                        />
                    </div>
                </div>

                {/* 筛选按钮 */}
                <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                            <Filter size={16} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                            <span className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>出售状态：</span>
                        </div>
                        <div className={`flex gap-1 p-1 rounded-xl ${darkMode ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
                            {[
                                { key: 'all', label: '全部', color: darkMode ? 'bg-slate-600 text-white shadow' : 'bg-white text-slate-800 shadow' },
                                { key: 'unsold', label: '未售出', color: 'bg-green-500 text-white shadow' },
                                { key: 'sold', label: '已售出', color: 'bg-red-500 text-white shadow' },
                            ].map(({ key, label, color }) => (
                                <button
                                    key={key}
                                    onClick={() => { setSoldStatusFilter(key); pagination.resetPage(); }}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${soldStatusFilter === key
                                        ? color
                                        : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 标签筛选 */}
                    {allGroups && allGroups.length > 0 && (
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                                <Tag size={16} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                                <span className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>标签：</span>
                            </div>
                            <select
                                value={groupFilter || ''}
                                onChange={(e) => { setGroupFilter(e.target.value || null); pagination.resetPage(); }}
                                className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all outline-none ${darkMode
                                    ? 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}
                            >
                                <option value="">全部标签</option>
                                {allGroups.map(group => (
                                    <option key={group} value={group}>{group}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* 导出按钮 */}
                    <div className="flex items-center gap-2 ml-auto">
                        <button
                            onClick={handleExportDatabase}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-medium transition-all shadow-sm"
                            title="导出整个数据库为 SQL 文件"
                        >
                            <Database size={18} />
                            <span>导出数据库</span>
                        </button>
                        <button
                            onClick={handleOpenExportDialog}
                            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-all shadow-sm"
                            title="导出账号为文本文件"
                        >
                            <FileDown size={18} />
                            <span>导出账号</span>
                        </button>
                        <button
                            onClick={openRecycleDrawer}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all shadow-sm ${
                                darkMode
                                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-100'
                                    : 'bg-slate-700 hover:bg-slate-800 text-white'
                            }`}
                            title="查看回收站账号"
                        >
                            <Trash2 size={18} />
                            <span>回收站</span>
                        </button>
                    </div>
                </div>

                {/* 批量操作工具栏 */}
                <BatchToolbar
                    selectedCount={selection.selectedIds.size}
                    totalResultCount={currentResultAccountIds.length}
                    canSelectAllCurrentResult={canSelectAllCurrentResult}
                    isBatchProcessing={isBatchProcessing}
                    onSelectAllCurrentResult={handleSelectAllCurrentResult}
                    onBatchEdit={handleBatchEdit}
                    onBatchDelete={handleBatchDelete}
                    onClearSelection={selection.clearSelection}
                    darkMode={darkMode}
                />

                {/* 表格 */}
                <AccountTable
                    paginatedData={pagination.paginatedData}
                    pagination={pagination}
                    loading={loading}
                    darkMode={darkMode}
                    sortConfig={sortConfig}
                    onSortChange={handleSortChange}
                    selectedIds={selection.selectedIds}
                    onToggleSelectAll={selection.toggleSelectAll}
                    onToggleCheckbox={selection.toggleCheckbox}
                    onRowMouseDown={(e, accId) => selection.handleRowMouseDown(e, accId, pagination.paginatedData, inlineEdit.editingCell)}
                    onRowMouseEnter={(accId) => selection.handleRowMouseEnter(accId, pagination.paginatedData)}
                    editingCell={inlineEdit.editingCell}
                    editValue={inlineEdit.editValue}
                    setEditValue={inlineEdit.setEditValue}
                    inputRef={inlineEdit.inputRef}
                    showSuggestions={inlineEdit.showSuggestions}
                    filteredSuggestions={inlineEdit.filteredSuggestions}
                    onCellClick={(value, label) => inlineEdit.handleCellClick(value, label, copyToClipboard)}
                    onCellDoubleClick={inlineEdit.handleCellDoubleClick}
                    onEditableInputBlur={inlineEdit.handleEditableInputBlur}
                    onKeyDown={inlineEdit.handleKeyDown}
                    onSelectSuggestion={inlineEdit.selectSuggestion}
                    toggleStatus={toggleStatus}
                    toggleSoldStatus={toggleSoldStatus}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    copyToClipboard={copyToClipboard}
                    copyAllInfo={copyAllInfo}
                    openHistoryDrawer={openHistoryDrawer}
                    twoFACodes={twoFACodes}
                />

                {/* 分页 */}
                {!loading && accounts.length > 0 && (
                    <Pagination
                        currentPage={pagination.currentPage}
                        totalPages={pagination.totalPages}
                        totalItems={pagination.totalItems}
                        pageSize={pagination.pageSize}
                        onPageChange={pagination.goToPage}
                        onPageSizeChange={pagination.changePageSize}
                        hasNextPage={pagination.hasNextPage}
                        hasPrevPage={pagination.hasPrevPage}
                    />
                )}
            </div>

            {/* 历史记录抽屉 */}
            <HistoryDrawer
                isOpen={historyDrawer.isOpen}
                onClose={closeHistoryDrawer}
                account={historyDrawer.account}
                darkMode={darkMode}
            />

            {/* 导出配置对话框 */}
            <ExportDialog
                isOpen={exportDialog.isOpen}
                onClose={() => setExportDialog({ isOpen: false, mode: 'all' })}
                onExport={handleExportAccounts}
                exportMode={exportDialog.mode}
                exportScopeCounts={exportScopeCounts}
                previewAccounts={previewAccountsForExport}
                darkMode={darkMode}
            />

            {recycleDrawer.isOpen && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className={`w-full max-w-3xl rounded-2xl shadow-2xl border ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`}>
                        <div className={`px-6 py-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                            <div className="flex items-center gap-2">
                                <Trash2 size={18} />
                                <h3 className="text-lg font-semibold">回收站</h3>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                                    {recycleDrawer.accounts.length} 条
                                </span>
                            </div>
                            <button
                                onClick={closeRecycleDrawer}
                                className={`text-sm px-3 py-1 rounded-lg ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                            >
                                关闭
                            </button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-2">
                            {recycleDrawer.loading ? (
                                <div className="text-center py-10 text-slate-500">加载中...</div>
                            ) : recycleDrawer.accounts.length === 0 ? (
                                <div className="text-center py-10 text-slate-500">回收站为空</div>
                            ) : recycleDrawer.accounts.map(acc => (
                                <div
                                    key={acc.id}
                                    className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${
                                        darkMode ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-slate-50'
                                    }`}
                                >
                                    <div className="min-w-0">
                                        <p className="font-medium truncate">{acc.email}</p>
                                        <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                            删除时间：{acc.deletedAt || '-'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => handleRestoreDeleted(acc.id)}
                                            className="px-3 py-1.5 text-xs rounded-lg bg-green-600 hover:bg-green-700 text-white flex items-center gap-1"
                                        >
                                            <RotateCcw size={14} />
                                            恢复
                                        </button>
                                        <button
                                            onClick={() => handlePurgeDeleted(acc.id)}
                                            className="px-3 py-1.5 text-xs rounded-lg bg-red-600 hover:bg-red-700 text-white"
                                        >
                                            永久删除
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className={`px-6 py-4 border-t flex justify-between items-center ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                            <button
                                onClick={loadDeletedAccounts}
                                className={`px-3 py-1.5 text-sm rounded-lg ${darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-100 hover:bg-slate-200'}`}
                            >
                                刷新
                            </button>
                            <button
                                onClick={handlePurgeAllDeleted}
                                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white"
                            >
                                清空回收站
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AccountListView;
