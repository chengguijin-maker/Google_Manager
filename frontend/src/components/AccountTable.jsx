import {
    Search,
    Edit3,
    Trash2,
    Copy,
    History,
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { splitPhoneParts, formatCountryDisplay } from '../utils/phoneUtils';

const splitDateTime = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return { date: '-', time: '' };

    const normalized = raw.replace('T', ' ');
    const match = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}:\d{2}))?/);
    if (match) {
        return {
            date: match[1],
            time: match[2] || '--:--:--',
        };
    }

    const ts = Date.parse(raw);
    if (Number.isNaN(ts)) return { date: raw, time: '--:--:--' };
    const date = new Date(ts);
    return {
        date: date.toISOString().slice(0, 10),
        time: date.toTimeString().slice(0, 8),
    };
};

/**
 * 账号表格组件 - 渲染表头和表体
 */
const AccountTable = ({
    paginatedData,
    pagination,
    loading,
    darkMode,
    sortConfig,
    onSortChange,
    // 选择相关
    selectedIds,
    onToggleSelectAll,
    onToggleCheckbox,
    onRowMouseDown,
    onRowMouseEnter,
    // 编辑相关
    editingCell,
    editValue,
    setEditValue,
    inputRef,
    showSuggestions,
    filteredSuggestions,
    onCellClick,
    onCellDoubleClick,
    onEditableInputBlur,
    onKeyDown,
    onSelectSuggestion,
    // 操作相关
    toggleStatus,
    toggleSoldStatus,
    onEdit,
    onDelete,
    copyToClipboard,
    copyAllInfo,
    openHistoryDrawer,
    twoFACodes,
}) => {
    const selectAllCheckboxRef = useRef(null);
    const currentPageSelectedCount = paginatedData.reduce(
        (count, account) => count + (selectedIds.has(account.id) ? 1 : 0),
        0
    );
    const allCurrentPageSelected = paginatedData.length > 0 && currentPageSelectedCount === paginatedData.length;
    const partiallySelectedCurrentPage = currentPageSelectedCount > 0 && !allCurrentPageSelected;

    useEffect(() => {
        if (selectAllCheckboxRef.current) {
            selectAllCheckboxRef.current.indeterminate = partiallySelectedCurrentPage;
        }
    }, [partiallySelectedCurrentPage]);

    const renderSortIcon = (key) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <ArrowUpDown size={12} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />;
        }
        if (sortConfig.direction === 'asc') {
            return <ArrowUp size={12} className="text-blue-500" />;
        }
        return <ArrowDown size={12} className="text-blue-500" />;
    };

    const renderSortableHeader = (label, key, className, align = 'left') => (
        <th className={className}>
            <button
                type="button"
                onClick={() => onSortChange?.(key)}
                className={`w-full flex items-center gap-1 font-semibold transition-colors ${darkMode
                    ? 'text-slate-300 hover:text-blue-300'
                    : 'text-slate-500 hover:text-blue-600'} ${align === 'center' ? 'justify-center' : 'justify-start'}`}
                title={`按${label}排序`}
            >
                <span>{label}</span>
                {renderSortIcon(key)}
            </button>
        </th>
    );

    const renderSuggestionPanel = () => {
        if (!showSuggestions || !filteredSuggestions?.length) return null;
        return (
            <div className={`absolute z-20 mt-1 w-full rounded-lg shadow-lg border max-h-40 overflow-y-auto ${darkMode
                ? 'bg-slate-700 border-slate-600'
                : 'bg-white border-slate-200'}`}>
                {filteredSuggestions.map((item) => (
                    <button
                        key={item}
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelectSuggestion?.(item);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${darkMode
                            ? 'hover:bg-slate-600 text-slate-200'
                            : 'hover:bg-blue-50 text-slate-700'}`}
                    >
                        {item}
                    </button>
                ))}
            </div>
        );
    };

    const renderEditingInput = (placeholder = '') => (
        <div className="relative">
            <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={onKeyDown}
                onBlur={onEditableInputBlur}
                onMouseDown={(e) => e.stopPropagation()}
                className={`w-full h-8 px-2 text-sm rounded-md border border-blue-500 outline-none shadow-sm ${darkMode
                    ? 'bg-slate-700 text-slate-100'
                    : 'bg-white text-slate-800'}`}
                placeholder={placeholder}
            />
            {renderSuggestionPanel()}
        </div>
    );

    const renderEditableCell = (acc, field, value, label, maxWidth = '200px', placeholder = '') => {
        const isEditing = editingCell?.accountId === acc.id && editingCell?.field === field;

        if (isEditing) {
            return renderEditingInput(placeholder);
        }

        return (
            <span
                onClick={() => onCellClick(value, label)}
                onDoubleClick={(e) => onCellDoubleClick(e, acc.id, field, value)}
                onMouseDown={(e) => e.stopPropagation()}
                className={`cursor-pointer truncate block w-full leading-5 min-h-[20px] ${darkMode ? 'text-slate-300' : 'text-slate-600'} hover:text-blue-500 transition-colors`}
                style={{ maxWidth }}
                title={`单击复制，双击编辑：${value || '无'}`}
            >
                {value || <span className={darkMode ? 'text-slate-500 italic' : 'text-slate-400 italic'}>无</span>}
            </span>
        );
    };

    const renderGroupNameCell = (acc) => {
        const isEditing = editingCell?.accountId === acc.id && editingCell?.field === 'groupName';

        return isEditing ? (
            renderEditingInput('输入标签，多个标签用逗号分隔')
        ) : (
            <div className="flex flex-col gap-1">
                {acc.groupName ? (
                    acc.groupName.split(/[,，\s]+/).filter(Boolean).map((tag, i) => (
                        <span
                            key={i}
                            onClick={() => onCellClick(tag, '标签')}
                            onDoubleClick={(e) => onCellDoubleClick(e, acc.id, 'groupName', acc.groupName)}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`px-2 py-0.5 text-xs rounded-full cursor-pointer ${darkMode
                                ? 'bg-amber-900/30 text-amber-300 hover:bg-amber-800/50'
                                : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                            title="单击复制,双击编辑全部标签"
                        >
                            {tag}
                        </span>
                    ))
                ) : (
                    <button
                        type="button"
                        onDoubleClick={(e) => onCellDoubleClick(e, acc.id, 'groupName', '')}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`w-full h-7 text-left rounded-md px-1.5 cursor-pointer transition-colors ${darkMode
                            ? 'text-slate-500 italic hover:bg-slate-700/70'
                            : 'text-slate-400 italic hover:bg-blue-50'}`}
                        title="双击添加标签"
                    >
                        无
                    </button>
                )}
            </div>
        );
    };

    const renderPhoneCell = (acc) => {
        const isEditing = editingCell?.accountId === acc.id && editingCell?.field === 'phone';
        if (isEditing) {
            return renderEditingInput('支持格式：+86 138 1234 5678 / 13812345678 / 0086...');
        }

        if (!acc.phone) {
            return (
                <button
                    type="button"
                    onDoubleClick={(e) => onCellDoubleClick(e, acc.id, 'phone', '')}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`w-full h-7 text-left rounded-md px-1.5 cursor-pointer transition-colors ${darkMode
                        ? 'text-slate-500 italic hover:bg-slate-700/70'
                        : 'text-slate-400 italic hover:bg-blue-50'}`}
                    title="双击编辑手机号"
                >
                    无
                </button>
            );
        }

        const { countryCode, localNumber, normalized } = splitPhoneParts(acc.phone);
        const numberOnly = localNumber || normalized.replace(/^\+/, '');

        return (
            <div className="flex flex-col gap-1">
                <button
                    type="button"
                    onClick={() => onCellClick(normalized || acc.phone, '国别+手机号')}
                    onDoubleClick={(e) => onCellDoubleClick(e, acc.id, 'phone', acc.phone)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`w-full h-7 text-left text-xs cursor-pointer rounded-md px-1.5 transition-colors select-none truncate flex items-center ${darkMode
                        ? 'text-slate-400 hover:text-blue-300 hover:bg-slate-700/70'
                        : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'}`}
                    title="单击复制国别+手机号，双击编辑"
                >
                    {formatCountryDisplay(countryCode || '+86')}
                </button>
                <button
                    type="button"
                    onClick={() => onCellClick(numberOnly, '手机号')}
                    onDoubleClick={(e) => onCellDoubleClick(e, acc.id, 'phone', acc.phone)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`w-full h-7 text-left text-sm cursor-pointer font-medium rounded-md px-1.5 transition-colors select-none truncate flex items-center ${darkMode
                        ? 'text-slate-200 hover:text-blue-200 hover:bg-slate-700/70'
                        : 'text-slate-700 hover:text-blue-600 hover:bg-blue-50'}`}
                    title="单击仅复制手机号，双击编辑"
                >
                    {numberOnly}
                </button>
            </div>
        );
    };

    const renderTwoFACell = (acc) => {
        const isEditing = editingCell?.accountId === acc.id && editingCell?.field === 'secret';
        if (isEditing) {
            return renderEditingInput('输入 2FA 密钥');
        }

        if (!acc.secret) {
            return (
                <button
                    type="button"
                    onDoubleClick={(e) => onCellDoubleClick(e, acc.id, 'secret', '')}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`w-full h-7 text-left rounded-md px-1.5 cursor-pointer transition-colors ${darkMode
                        ? 'text-slate-500 italic hover:bg-slate-700/70'
                        : 'text-slate-400 italic hover:bg-blue-50'}`}
                    title="双击编辑2FA密钥"
                >
                    无
                </button>
            );
        }

        const codeInfo = twoFACodes[acc.id];

        return (
            <div className="flex flex-col gap-1">
                <button
                    type="button"
                    onClick={() => onCellClick(acc.secret, '2FA密钥')}
                    onDoubleClick={(e) => onCellDoubleClick(e, acc.id, 'secret', acc.secret)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`w-full h-7 text-left text-xs font-mono cursor-pointer rounded-md px-1.5 transition-colors select-none truncate flex items-center ${darkMode
                        ? 'text-slate-300 hover:text-blue-200 hover:bg-slate-700/70'
                        : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}
                    title="单击复制2FA密钥，双击编辑"
                >
                    {acc.secret}
                </button>
                {codeInfo ? (
                    <button
                        type="button"
                        onClick={() => onCellClick(codeInfo.code, '2FA验证码')}
                        onDoubleClick={(e) => onCellDoubleClick(e, acc.id, 'secret', acc.secret)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`w-full h-7 text-left text-sm font-mono font-semibold cursor-pointer rounded-md px-1.5 transition-colors select-none flex items-center gap-1.5 ${darkMode
                            ? 'text-green-300 hover:text-green-200 hover:bg-green-900/30'
                            : 'text-green-600 hover:text-green-700 hover:bg-green-50'}`}
                        title="单击复制2FA验证码，双击编辑密钥"
                    >
                        <span>{codeInfo.code}</span>
                        <span className="text-[11px] opacity-70">{codeInfo.expiry}s</span>
                    </button>
                ) : (
                    <span className={`text-xs px-1.5 py-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        验证码生成中...
                    </span>
                )}
            </div>
        );
    };

    const renderAccountLine = (acc, field, value, label, maxWidth, placeholder = '', variant = 'email') => {
        const isEditing = editingCell?.accountId === acc.id && editingCell?.field === field;
        if (isEditing) {
            return renderEditingInput(placeholder);
        }

        const textValue = String(value || '').trim();
        if (!textValue) {
            return (
                <button
                    type="button"
                    onDoubleClick={(e) => onCellDoubleClick(e, acc.id, field, '')}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`w-full h-7 text-left rounded-md px-1.5 cursor-pointer transition-colors ${darkMode
                        ? 'text-slate-500 italic hover:bg-slate-700/70'
                        : 'text-slate-400 italic hover:bg-blue-50'}`}
                    title={`双击编辑${label}`}
                >
                    无
                </button>
            );
        }

        const variantClass = variant === 'password'
            ? `${darkMode
                ? 'text-slate-300 hover:text-blue-200 hover:bg-slate-700/70'
                : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'} text-xs font-mono`
            : `${darkMode
                ? 'text-slate-200 hover:text-blue-200 hover:bg-slate-700/70'
                : 'text-slate-700 hover:text-blue-600 hover:bg-blue-50'} text-sm`;

        return (
            <button
                type="button"
                onClick={() => onCellClick(textValue, label)}
                onDoubleClick={(e) => onCellDoubleClick(e, acc.id, field, textValue)}
                onMouseDown={(e) => e.stopPropagation()}
                className={`w-full h-7 text-left cursor-pointer rounded-md px-1.5 transition-colors select-none truncate flex items-center ${variantClass}`}
                style={{ maxWidth }}
                title={`单击复制，双击编辑：${textValue}`}
            >
                {textValue}
            </button>
        );
    };

    const renderCreatedAtCell = (createdAt) => {
        const { date, time } = splitDateTime(createdAt);
        return (
            <div className="flex flex-col gap-1 leading-tight">
                <span className={`text-sm whitespace-nowrap ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                    {date}
                </span>
                <span className={`text-xs whitespace-nowrap ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {time || '-'}
                </span>
            </div>
        );
    };

    return (
        <div className={`rounded-3xl border shadow-sm overflow-hidden transition-colors ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[1280px] text-left border-collapse table-fixed">
                    <thead>
                        <tr className={`border-b text-xs font-semibold ${darkMode
                            ? 'bg-slate-700/50 border-slate-600 text-slate-400'
                            : 'bg-slate-50/50 border-slate-100 text-slate-400'}`}>
                            <th className="px-2 py-2.5 text-center w-[36px]">
                                <input
                                    ref={selectAllCheckboxRef}
                                    type="checkbox"
                                    checked={allCurrentPageSelected}
                                    onChange={() => onToggleSelectAll(paginatedData)}
                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                            </th>
                            {renderSortableHeader('序号', 'id', 'px-2 py-2.5 text-center w-[44px]', 'center')}
                            {renderSortableHeader('账号', 'email', 'px-3 py-2.5 w-[200px]')}
                            {renderSortableHeader('恢复', 'recovery', 'px-3 py-2.5 w-[120px]')}
                            {renderSortableHeader('2FA', 'secret', 'px-2 py-2.5 w-[90px]')}
                            {renderSortableHeader('手机', 'phone', 'px-2 py-2.5 w-[90px]')}
                            {renderSortableHeader('标签', 'groupName', 'px-2 py-2.5 w-[90px]')}
                            {renderSortableHeader('备注', 'remark', 'px-3 py-2.5 w-[100px]')}
                            {renderSortableHeader('状态', 'status', 'px-2 py-2.5 text-center w-[72px]', 'center')}
                            {renderSortableHeader('年份', 'regYear', 'px-2 py-2.5 text-center w-[56px]', 'center')}
                            {renderSortableHeader('国家', 'country', 'px-2 py-2.5 text-center w-[60px]', 'center')}
                            <th className="px-2 py-2.5 text-center w-[120px]">操作</th>
                            {renderSortableHeader('导入', 'createdAt', 'px-2 py-2.5 w-[120px]')}
                        </tr>
                    </thead>
                    <tbody className={`divide-y ${darkMode ? 'divide-slate-700' : 'divide-slate-100'}`}>
                        {loading ? (
                            <tr>
                                <td colSpan="13" className="px-6 py-20 text-center">
                                    <div className="flex flex-col items-center text-slate-400">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
                                        <p className="text-lg font-medium">加载中...</p>
                                    </div>
                                </td>
                            </tr>
                        ) : paginatedData.length > 0 ? paginatedData.map((acc, index) => (
                            <tr key={acc.id}
                                className={`transition-colors group ${darkMode
                                    ? (index % 2 === 0 ? 'bg-slate-800/80' : 'bg-slate-900/60') + ' hover:bg-slate-700/70'
                                    : (index % 2 === 0 ? 'bg-white' : 'bg-blue-50/60') + ' hover:bg-blue-100/70'}`}
                                onMouseDown={(e) => onRowMouseDown(e, acc.id)}
                                onMouseEnter={() => onRowMouseEnter(acc.id)}
                            >
                                {/* 复选框 */}
                                <td className="px-2 py-2.5 text-center">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(acc.id)}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            onToggleCheckbox(acc.id);
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                </td>
                                {/* 序号 */}
                                <td className="px-2 py-2.5 text-center">
                                    <span className={`inline-flex items-center justify-center w-6 h-6 text-xs font-bold rounded-lg ${darkMode
                                        ? 'bg-slate-700 text-slate-300'
                                        : 'bg-slate-100 text-slate-600'}`}>
                                        {(pagination.currentPage - 1) * pagination.pageSize + index + 1}
                                    </span>
                                </td>
                                {/* 账号 */}
                                <td className="px-3 py-2.5 max-w-[200px] align-top">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1">
                                            <div className="flex-1 min-w-0">
                                                {renderAccountLine(acc, 'email', acc.email, '邮箱', '170px', 'example@gmail.com', 'email')}
                                            </div>
                                            <button
                                                onClick={() => openHistoryDrawer(acc)}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                className={`p-1 rounded-md transition-all flex-shrink-0 ${darkMode
                                                    ? 'text-slate-500 hover:text-purple-400 hover:bg-slate-700'
                                                    : 'text-slate-300 hover:text-purple-500 hover:bg-purple-50'}`}
                                                title="查看修改历史"
                                            >
                                                <History size={12} />
                                            </button>
                                        </div>
                                        {renderAccountLine(acc, 'password', acc.password, '密码', '180px', 'password123', 'password')}
                                    </div>
                                </td>
                                {/* 恢复邮箱 */}
                                <td className="px-3 py-2.5 max-w-[120px] align-top">
                                    {renderEditableCell(acc, 'recovery', acc.recovery, '恢复邮箱', '110px', 'recovery@example.com')}
                                </td>
                                {/* 2FA密钥 */}
                                <td className="px-2 py-2.5 align-top">
                                    {renderTwoFACell(acc)}
                                </td>
                                {/* 手机号 */}
                                <td className="px-2 py-2.5 align-top">
                                    {renderPhoneCell(acc)}
                                </td>
                                {/* 标签 */}
                                <td className="px-2 py-2.5 align-top">
                                    {renderGroupNameCell(acc)}
                                </td>
                                {/* 备注 */}
                                <td className="px-3 py-2.5 align-top">
                                    {renderEditableCell(acc, 'remark', acc.remark, '备注', '90px')}
                                </td>
                                {/* 状态（合并 Pro/出售） */}
                                <td className="px-2 py-2.5 text-center">
                                    <div className="flex flex-col items-center gap-1">
                                        <button onClick={() => toggleStatus(acc.id)}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            title="点击切换 Pro 状态"
                                            className={`px-2 py-0.5 rounded-full text-xs font-black transition-all duration-300 transform active:scale-95 whitespace-nowrap ${acc.status === 'pro'
                                                ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                                                : 'bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200'}`}
                                        >
                                            {acc.status === 'pro' ? 'Pro' : '普通'}
                                        </button>
                                        <button onClick={() => toggleSoldStatus(acc.id, acc.soldStatus)}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            title="点击切换出售状态"
                                            className={`px-2 py-0.5 rounded-full text-xs font-black transition-all duration-300 transform active:scale-95 whitespace-nowrap ${acc.soldStatus === 'sold'
                                                ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                                                : 'bg-green-500/10 text-green-500 border border-green-500/20'}`}
                                        >
                                            {acc.soldStatus === 'sold' ? '已售' : '未售'}
                                        </button>
                                    </div>
                                </td>
                                {/* 年份 */}
                                <td className="px-2 py-2.5 text-center align-top">
                                    {renderEditableCell(acc, 'regYear', acc.regYear, '注册年份', '50px')}
                                </td>
                                {/* 国家 */}
                                <td className="px-2 py-2.5 text-center align-top">
                                    {renderEditableCell(acc, 'country', acc.country, '国家', '50px')}
                                </td>
                                {/* 操作 */}
                                <td className="px-2 py-2.5">
                                    <div className="flex items-center justify-center gap-0.5">
                                        <button onClick={() => onEdit(acc)} onMouseDown={(e) => e.stopPropagation()} className={`p-1 rounded-lg transition-all ${darkMode
                                            ? 'text-slate-400 hover:text-blue-400 hover:bg-slate-700'
                                            : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`} title="编辑">
                                            <Edit3 size={15} />
                                        </button>
                                        <button onClick={() => onDelete(acc.id)} onMouseDown={(e) => e.stopPropagation()} className={`p-1 rounded-lg transition-all ${darkMode
                                            ? 'text-slate-400 hover:text-red-400 hover:bg-slate-700'
                                            : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`} title="删除">
                                            <Trash2 size={15} />
                                        </button>
                                        <button onClick={() => copyAllInfo(acc)} onMouseDown={(e) => e.stopPropagation()} className={`p-1 rounded-lg transition-all ${darkMode
                                            ? 'text-slate-400 hover:text-purple-400 hover:bg-slate-700'
                                            : 'text-slate-400 hover:text-purple-600 hover:bg-purple-50'}`} title="复制全部信息">
                                            <Copy size={15} />
                                        </button>
                                    </div>
                                </td>
                                {/* 导入时间 */}
                                <td className="px-2 py-2.5 align-top">
                                    {renderCreatedAtCell(acc.createdAt)}
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="13" className="px-6 py-20 text-center">
                                    <div className="flex flex-col items-center text-slate-300">
                                        <Search size={48} className="mb-4 opacity-20" />
                                        <p className="text-lg font-medium">未找到相关账号</p>
                                        <p className="text-sm">尝试更换关键词或导入新账号</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AccountTable;
