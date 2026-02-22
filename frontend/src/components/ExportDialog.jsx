import { useState, useEffect } from 'react';
import { X, ChevronUp, ChevronDown, FileText } from 'lucide-react';

const DEFAULT_CATEGORY_LABEL_TEMPLATE = '{index}. {groupField}: {groupValue}（共 {count} 条）';

const separatorOptions = [
    { value: '----', label: '四横线 (----)', description: '与导入格式兼容' },
    { value: '|', label: '竖线 (|)', description: '常用分隔符' },
    { value: '---', label: '三横线 (---)', description: '简洁分隔' },
    { value: '\t', label: 'Tab', description: 'TSV 格式' },
    { value: 'custom', label: '自定义', description: '输入自定义分隔符' },
];

const availableFields = [
    { value: 'email', label: '邮箱', defaultSelected: true },
    { value: 'password', label: '密码', defaultSelected: true },
    { value: 'recovery', label: '恢复邮箱', defaultSelected: true },
    { value: 'secret', label: '2FA密钥', defaultSelected: true },
    { value: 'phone', label: '手机号', defaultSelected: false },
    { value: 'reg_year', label: '注册年份', defaultSelected: false },
    { value: 'country', label: '国家', defaultSelected: false },
    { value: 'group_name', label: '标签', defaultSelected: false },
    { value: 'remark', label: '备注', defaultSelected: false },
    { value: 'status', label: '状态', defaultSelected: false },
    { value: 'sold_status', label: '出售状态', defaultSelected: false },
];

const accountOrderFieldOptions = [
    { value: 'id', label: '导入序号(ID)' },
    { value: 'email', label: '邮箱' },
    { value: 'recovery', label: '恢复邮箱' },
    { value: 'phone', label: '手机号' },
    { value: 'reg_year', label: '注册年份' },
    { value: 'country', label: '国家' },
    { value: 'group_name', label: '标签' },
    { value: 'status', label: '状态' },
    { value: 'sold_status', label: '出售状态' },
    { value: 'created_at', label: '创建时间' },
    { value: 'updated_at', label: '更新时间' },
];

const categorySortFieldOptions = [
    { value: '', label: '不分类（仅排序）' },
    { value: 'group_name', label: '标签' },
    { value: 'country', label: '国家' },
    { value: 'reg_year', label: '注册年份' },
    { value: 'status', label: '状态' },
    { value: 'sold_status', label: '出售状态' },
];

const directionOptions = [
    { value: 'asc', label: '升序' },
    { value: 'desc', label: '降序' },
];

const fieldLabelMap = {
    id: '导入序号(ID)',
    email: '邮箱',
    password: '密码',
    recovery: '恢复邮箱',
    phone: '手机号',
    secret: '2FA密钥',
    reg_year: '注册年份',
    country: '国家',
    group_name: '标签',
    remark: '备注',
    status: '状态',
    sold_status: '出售状态',
    created_at: '创建时间',
    updated_at: '更新时间',
};

/**
 * 导出配置对话框组件
 */
const ExportDialog = ({
    isOpen,
    onClose,
    onExport,
    exportMode,
    darkMode,
    exportScopeCounts = {},
    previewAccounts = [],
}) => {
    const defaultSelectedFields = availableFields
        .filter((field) => field.defaultSelected)
        .map((field) => field.value);

    const [separator, setSeparator] = useState('----');
    const [customSeparator, setCustomSeparator] = useState('');
    const [includeStats, setIncludeStats] = useState(true);
    const [selectedFields, setSelectedFields] = useState(defaultSelectedFields);
    const [accountOrderField, setAccountOrderField] = useState('id');
    const [accountOrderDirection, setAccountOrderDirection] = useState('desc');
    const [categorySortField, setCategorySortField] = useState('');
    const [categorySortDirection, setCategorySortDirection] = useState('asc');
    const [categoryLabelTemplate, setCategoryLabelTemplate] = useState(DEFAULT_CATEGORY_LABEL_TEMPLATE);

    const normalizeFieldValue = (value) => {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value);
    };

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setSeparator('----');
        setCustomSeparator('');
        setIncludeStats(true);
        setSelectedFields(defaultSelectedFields);
        setAccountOrderField('id');
        setAccountOrderDirection('desc');
        setCategorySortField('');
        setCategorySortDirection('asc');
        setCategoryLabelTemplate(DEFAULT_CATEGORY_LABEL_TEMPLATE);
    }, [isOpen]);

    if (!isOpen) return null;

    const getActualSeparator = () => {
        if (separator === 'custom') {
            return customSeparator || '----';
        }
        return separator;
    };

    const toggleField = (fieldValue) => {
        setSelectedFields((previousFields) => {
            if (previousFields.includes(fieldValue)) {
                return previousFields.filter((field) => field !== fieldValue);
            }
            return [...previousFields, fieldValue];
        });
    };

    const moveFieldUp = (fieldValue) => {
        const fieldIndex = selectedFields.indexOf(fieldValue);
        if (fieldIndex <= 0) {
            return;
        }

        const reorderedFields = [...selectedFields];
        [reorderedFields[fieldIndex - 1], reorderedFields[fieldIndex]] =
            [reorderedFields[fieldIndex], reorderedFields[fieldIndex - 1]];
        setSelectedFields(reorderedFields);
    };

    const moveFieldDown = (fieldValue) => {
        const fieldIndex = selectedFields.indexOf(fieldValue);
        if (fieldIndex < 0 || fieldIndex >= selectedFields.length - 1) {
            return;
        }

        const reorderedFields = [...selectedFields];
        [reorderedFields[fieldIndex], reorderedFields[fieldIndex + 1]] =
            [reorderedFields[fieldIndex + 1], reorderedFields[fieldIndex]];
        setSelectedFields(reorderedFields);
    };

    const getCurrentExportCount = () => {
        if (exportMode === 'selected') {
            return exportScopeCounts.selected ?? 0;
        }
        if (exportMode === 'filtered') {
            return exportScopeCounts.filtered ?? 0;
        }
        return exportScopeCounts.all ?? 0;
    };

    const getExportModeDescription = () => {
        const currentCount = getCurrentExportCount();
        if (exportMode === 'selected') {
            return `将导出选中的账号，共 ${currentCount} 条`;
        }
        if (exportMode === 'filtered') {
            return `将导出当前筛选结果，共 ${currentCount} 条`;
        }
        return `将导出全部账号，共 ${currentCount} 条`;
    };

    const getPreviewFieldValue = (account, field) => {
        switch (field) {
            case 'email':
                return normalizeFieldValue(account?.email);
            case 'password':
                return normalizeFieldValue(account?.password);
            case 'recovery':
                return normalizeFieldValue(account?.recovery);
            case 'secret':
                return normalizeFieldValue(account?.secret);
            case 'phone':
                return normalizeFieldValue(account?.phone);
            case 'reg_year':
                return normalizeFieldValue(account?.regYear ?? account?.reg_year);
            case 'country':
                return normalizeFieldValue(account?.country);
            case 'group_name':
                return normalizeFieldValue(account?.groupName ?? account?.group_name);
            case 'remark':
                return normalizeFieldValue(account?.remark);
            case 'status':
                return normalizeFieldValue(account?.status);
            case 'sold_status':
                return normalizeFieldValue(account?.soldStatus ?? account?.sold_status);
            case 'id':
                return normalizeFieldValue(account?.id);
            case 'created_at':
                return normalizeFieldValue(account?.createdAt ?? account?.created_at);
            case 'updated_at':
                return normalizeFieldValue(account?.updatedAt ?? account?.updated_at);
            default:
                return '';
        }
    };

    const buildCategoryLabelPreview = () => {
        if (!categorySortField) {
            return '未启用分类标签';
        }

        const sampleAccount = Array.isArray(previewAccounts) && previewAccounts.length > 0
            ? previewAccounts[0]
            : null;
        const categoryFieldLabel = fieldLabelMap[categorySortField] || categorySortField;
        const sampleGroupValue = getPreviewFieldValue(sampleAccount, categorySortField) || '未分类';
        const template = categoryLabelTemplate.trim() || DEFAULT_CATEGORY_LABEL_TEMPLATE;

        return template
            .replaceAll('{index}', '1')
            .replaceAll('{groupField}', categoryFieldLabel)
            .replaceAll('{groupValue}', sampleGroupValue)
            .replaceAll('{count}', String(getCurrentExportCount()));
    };

    const generatePreview = () => {
        if (selectedFields.length === 0) {
            return '(未选择任何字段)';
        }
        if (!Array.isArray(previewAccounts) || previewAccounts.length === 0) {
            return '(当前导出范围没有可预览账号)';
        }

        const actualSeparator = getActualSeparator();
        const previewLines = previewAccounts.slice(0, 2).map((account) => {
            const lineValues = selectedFields.map((field) => getPreviewFieldValue(account, field));
            return lineValues.join(actualSeparator);
        });

        return previewLines.join('\n');
    };

    const handleExport = () => {
        if (selectedFields.length === 0) {
            alert('请至少选择一个字段');
            return;
        }

        const normalizedCategoryLabelTemplate = categoryLabelTemplate.trim() || DEFAULT_CATEGORY_LABEL_TEMPLATE;

        const exportConfig = {
            separator: getActualSeparator(),
            fields: selectedFields,
            includeStats,
            accountOrder: {
                field: accountOrderField,
                direction: accountOrderDirection,
            },
            categorySort: {
                field: categorySortField,
                direction: categorySortDirection,
            },
            categoryLabelTemplate: normalizedCategoryLabelTemplate,
        };

        onExport(exportConfig);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 ${
                darkMode ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-900'
            }`}>
                <div className={`sticky top-0 z-10 flex items-center justify-between p-6 border-b ${
                    darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                }`}>
                    <div>
                        <h2 className="text-2xl font-bold">导出账号配置</h2>
                        <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {getExportModeDescription()}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className={`p-2 rounded-lg transition-colors ${
                            darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                        }`}
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-semibold mb-3">分隔符</label>
                        <div className="grid grid-cols-2 gap-2">
                            {separatorOptions.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => setSeparator(option.value)}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                        separator === option.value
                                            ? (darkMode
                                                ? 'border-blue-500 bg-blue-900/30'
                                                : 'border-blue-500 bg-blue-50')
                                            : (darkMode
                                                ? 'border-slate-700 hover:border-slate-600'
                                                : 'border-slate-200 hover:border-slate-300')
                                    }`}
                                >
                                    <div className="font-medium">{option.label}</div>
                                    <div className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {option.description}
                                    </div>
                                </button>
                            ))}
                        </div>
                        {separator === 'custom' && (
                            <input
                                type="text"
                                value={customSeparator}
                                onChange={(event) => setCustomSeparator(event.target.value)}
                                placeholder="输入自定义分隔符"
                                className={`mt-3 w-full px-4 py-2 rounded-lg border ${
                                    darkMode
                                        ? 'bg-slate-700 border-slate-600 text-slate-100'
                                        : 'bg-white border-slate-300 text-slate-900'
                                }`}
                            />
                        )}
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <label className="text-sm font-semibold">包含统计汇总</label>
                            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                在文件开头显示账号统计信息
                            </p>
                        </div>
                        <button
                            onClick={() => setIncludeStats(!includeStats)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                                includeStats
                                    ? 'bg-blue-500'
                                    : (darkMode ? 'bg-slate-700' : 'bg-slate-300')
                            }`}
                        >
                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                includeStats ? 'translate-x-6' : ''
                            }`} />
                        </button>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-3">账号顺序</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="account-order-field" className="block text-xs mb-1">账号顺序字段</label>
                                <select
                                    id="account-order-field"
                                    value={accountOrderField}
                                    onChange={(event) => setAccountOrderField(event.target.value)}
                                    className={`w-full px-3 py-2 rounded-lg border ${
                                        darkMode
                                            ? 'bg-slate-700 border-slate-600 text-slate-100'
                                            : 'bg-white border-slate-300 text-slate-900'
                                    }`}
                                >
                                    {accountOrderFieldOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="account-order-direction" className="block text-xs mb-1">账号顺序方向</label>
                                <select
                                    id="account-order-direction"
                                    value={accountOrderDirection}
                                    onChange={(event) => setAccountOrderDirection(event.target.value)}
                                    className={`w-full px-3 py-2 rounded-lg border ${
                                        darkMode
                                            ? 'bg-slate-700 border-slate-600 text-slate-100'
                                            : 'bg-white border-slate-300 text-slate-900'
                                    }`}
                                >
                                    {directionOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-3">分类排序与标签格式</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="category-sort-field" className="block text-xs mb-1">分类字段</label>
                                <select
                                    id="category-sort-field"
                                    value={categorySortField}
                                    onChange={(event) => setCategorySortField(event.target.value)}
                                    className={`w-full px-3 py-2 rounded-lg border ${
                                        darkMode
                                            ? 'bg-slate-700 border-slate-600 text-slate-100'
                                            : 'bg-white border-slate-300 text-slate-900'
                                    }`}
                                >
                                    {categorySortFieldOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="category-sort-direction" className="block text-xs mb-1">分类顺序</label>
                                <select
                                    id="category-sort-direction"
                                    value={categorySortDirection}
                                    onChange={(event) => setCategorySortDirection(event.target.value)}
                                    className={`w-full px-3 py-2 rounded-lg border ${
                                        darkMode
                                            ? 'bg-slate-700 border-slate-600 text-slate-100'
                                            : 'bg-white border-slate-300 text-slate-900'
                                    }`}
                                >
                                    {directionOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="mt-3">
                            <label htmlFor="category-label-template" className="block text-xs mb-1">分类标签模板</label>
                            <input
                                id="category-label-template"
                                type="text"
                                value={categoryLabelTemplate}
                                onChange={(event) => setCategoryLabelTemplate(event.target.value)}
                                placeholder={DEFAULT_CATEGORY_LABEL_TEMPLATE}
                                className={`w-full px-3 py-2 rounded-lg border ${
                                    darkMode
                                        ? 'bg-slate-700 border-slate-600 text-slate-100'
                                        : 'bg-white border-slate-300 text-slate-900'
                                }`}
                            />
                            <p className={`text-xs mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                支持变量：{'{index}'} {'{groupField}'} {'{groupValue}'} {'{count}'}
                            </p>
                            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                模板示例：{buildCategoryLabelPreview()}
                            </p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-3">选择导出字段（可调整顺序）</label>
                        <div className="space-y-2">
                            {availableFields.map((field) => {
                                const isSelected = selectedFields.includes(field.value);
                                const selectedIndex = selectedFields.indexOf(field.value);

                                return (
                                    <div
                                        key={field.value}
                                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                            isSelected
                                                ? (darkMode
                                                    ? 'border-blue-500 bg-blue-900/20'
                                                    : 'border-blue-500 bg-blue-50')
                                                : (darkMode
                                                    ? 'border-slate-700'
                                                    : 'border-slate-200')
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleField(field.value)}
                                            className="w-4 h-4"
                                        />
                                        <span className="flex-1">{field.label}</span>
                                        {isSelected && (
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-bold px-2 py-1 rounded ${
                                                    darkMode ? 'bg-slate-700' : 'bg-slate-200'
                                                }`}>
                                                    #{selectedIndex + 1}
                                                </span>
                                                <button
                                                    onClick={() => moveFieldUp(field.value)}
                                                    disabled={selectedIndex === 0}
                                                    className={`p-1 rounded ${
                                                        selectedIndex === 0
                                                            ? 'opacity-30 cursor-not-allowed'
                                                            : (darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-200')
                                                    }`}
                                                >
                                                    <ChevronUp size={16} />
                                                </button>
                                                <button
                                                    onClick={() => moveFieldDown(field.value)}
                                                    disabled={selectedIndex === selectedFields.length - 1}
                                                    className={`p-1 rounded ${
                                                        selectedIndex === selectedFields.length - 1
                                                            ? 'opacity-30 cursor-not-allowed'
                                                            : (darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-200')
                                                    }`}
                                                >
                                                    <ChevronDown size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-3">预览（示例前1到2行）</label>
                        <div className={`p-4 rounded-lg font-mono text-sm whitespace-pre-wrap break-all ${
                            darkMode ? 'bg-slate-900 text-slate-300' : 'bg-slate-100 text-slate-700'
                        }`}>
                            {generatePreview()}
                        </div>
                    </div>
                </div>

                <div className={`sticky bottom-0 flex items-center justify-end gap-3 p-6 border-t ${
                    darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                }`}>
                    <button
                        onClick={onClose}
                        className={`px-6 py-2.5 rounded-lg font-medium transition-colors ${
                            darkMode
                                ? 'bg-slate-700 hover:bg-slate-600 text-slate-100'
                                : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
                        }`}
                    >
                        取消
                    </button>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
                    >
                        <FileText size={18} />
                        导出
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExportDialog;
