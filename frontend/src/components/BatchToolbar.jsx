import {
    Tag,
    Phone,
    Globe,
    Calendar,
    Trash2,
    X,
    CheckSquare,
    ListChecks,
} from 'lucide-react';

/**
 * 批量操作工具栏组件
 */
const BatchToolbar = ({
    selectedCount,
    totalResultCount,
    canSelectAllCurrentResult,
    isBatchProcessing,
    onSelectAllCurrentResult,
    onBatchEdit,
    onBatchDelete,
    onClearSelection,
    darkMode,
}) => {
    if (selectedCount === 0) return null;

    const btnBase = `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${isBatchProcessing ? 'opacity-50 cursor-not-allowed' : ''}`;

    return (
        <div className={`rounded-xl border shadow-lg p-4 transition-all animate-in slide-in-from-top-2 ${darkMode
            ? 'bg-blue-900/30 border-blue-700/50 backdrop-blur-sm'
            : 'bg-blue-50 border-blue-200'}`}>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <CheckSquare size={20} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
                    <span className={`text-sm font-semibold ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                        已选中 {selectedCount} 个账号
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {canSelectAllCurrentResult && (
                        <button
                            onClick={onSelectAllCurrentResult}
                            disabled={isBatchProcessing}
                            className={`${btnBase} ${darkMode
                                ? 'bg-blue-900/50 text-blue-200 hover:bg-blue-800 border border-blue-700/60'
                                : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300'}`}
                            title={`一键选中当前结果全部 ${totalResultCount} 个账号`}
                        >
                            <ListChecks size={16} />
                            <span>全选当前结果（{totalResultCount}）</span>
                        </button>
                    )}

                    <button
                        onClick={() => onBatchEdit('groupName', '标签')}
                        disabled={isBatchProcessing}
                        className={`${btnBase} ${darkMode
                            ? 'bg-amber-900/50 text-amber-300 hover:bg-amber-800 border border-amber-700/50'
                            : 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300'}`}
                        title="为选中账号设置标签"
                    >
                        <Tag size={16} />
                        <span>批量设置标签</span>
                    </button>

                    <button
                        onClick={() => onBatchEdit('phone', '手机号')}
                        disabled={isBatchProcessing}
                        className={`${btnBase} ${darkMode
                            ? 'bg-green-900/50 text-green-300 hover:bg-green-800 border border-green-700/50'
                            : 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-300'}`}
                        title="为选中账号设置手机号"
                    >
                        <Phone size={16} />
                        <span>批量设置手机号</span>
                    </button>

                    <button
                        onClick={() => onBatchEdit('country', '国家')}
                        disabled={isBatchProcessing}
                        className={`${btnBase} ${darkMode
                            ? 'bg-purple-900/50 text-purple-300 hover:bg-purple-800 border border-purple-700/50'
                            : 'bg-purple-100 text-purple-700 hover:bg-purple-200 border border-purple-300'}`}
                        title="为选中账号设置国家"
                    >
                        <Globe size={16} />
                        <span>批量设置国家</span>
                    </button>

                    <button
                        onClick={() => onBatchEdit('regYear', '注册年份')}
                        disabled={isBatchProcessing}
                        className={`${btnBase} ${darkMode
                            ? 'bg-indigo-900/50 text-indigo-300 hover:bg-indigo-800 border border-indigo-700/50'
                            : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border border-indigo-300'}`}
                        title="为选中账号设置注册年份"
                    >
                        <Calendar size={16} />
                        <span>批量设置年份</span>
                    </button>

                    <div className={`h-8 w-[1px] ${darkMode ? 'bg-slate-600' : 'bg-slate-300'}`}></div>

                    <button
                        onClick={onBatchDelete}
                        disabled={isBatchProcessing}
                        className={`${btnBase} ${darkMode
                            ? 'bg-red-900/50 text-red-300 hover:bg-red-800 border border-red-700/50'
                            : 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-300'}`}
                        title="删除选中的账号"
                    >
                        <Trash2 size={16} />
                        <span>批量删除</span>
                    </button>

                    <button
                        onClick={onClearSelection}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${darkMode
                            ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600'
                            : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-300'}`}
                        title="取消选择"
                    >
                        <X size={16} />
                        <span>取消选择</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BatchToolbar;
