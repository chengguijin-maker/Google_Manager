import React, { useState, useCallback, useRef, useEffect } from 'react';
import { UserPlus, FileText, Plus, Activity, Loader2 } from 'lucide-react';
import { parseImportText } from '../utils/importParser';
import { normalizePhoneNumber } from '../utils/phoneUtils';

/**
 * 防抖 Hook - 延迟执行函数，避免频繁调用
 * 包含 cleanup 逻辑以防止内存泄漏
 */
const useDebounce = (callback, delay = 300) => {
    const timeoutRef = useRef(null);

    // 组件卸载时清理定时器
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const debouncedCallback = useCallback((...args) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
            callback(...args);
        }, delay);
    }, [callback, delay]);
    return debouncedCallback;
};

const IMPORT_FORMAT_LINES = [
    '邮箱----密码----恢复邮箱----2FA密钥',
    '邮箱|密码|恢复邮箱|2FA密钥',
    '卡号：邮箱密码：密码----2FA密钥',
];

const IMPORT_EXTRA_RULE = '尾字段会自动识别手机号（默认+86）、注册年份（2015-2030）、国家、2FA链接。';

const IMPORT_PLACEHOLDER = `示例：
example@gmail.com----password123----recovery@example.com----JBSWY3DPEHPK3PXP
user@gmail.com|pass123|backup@gmail.com|5AMG4HOE2ZBVS2R5
demo@gmail.com----Pass@123----+8613812345678----2022----China----https://2fa.live/tok/jbswy3dpehpk3pxp
卡号：test@gmail.com密码：Pass@123----3TKXUZWOGOZRBFES`;

/**
 * 导入视图组件
 */
const ImportView = ({ onImport, onCancel, importing = false }) => {
    const [importMode, setImportMode] = useState('single');
    const [text, setText] = useState('');
    const [preview, setPreview] = useState([]);
    const [detectedFormats, setDetectedFormats] = useState([]);
    const [showFormatConfirm, setShowFormatConfirm] = useState(false);
    const [isParsing, setIsParsing] = useState(false);

    // 单个账号导入的表单状态
    const [singleForm, setSingleForm] = useState({
        email: '',
        password: '',
        recovery: '',
        phone: '',
        secret: '',
        reg_year: '',
        country: '',
        group_name: '',
    });

    // 实际解析函数
    const parseAndSetPreview = useCallback((val) => {
        const { parsed, detectedFormats: formats } = parseImportText(val);
        setPreview(parsed);

        if (formats.length > 0) {
            setDetectedFormats(formats);
            setShowFormatConfirm(true);
        } else {
            setDetectedFormats([]);
            setShowFormatConfirm(false);
        }
        setIsParsing(false);
    }, []);

    // 防抖版本的解析函数（300ms 延迟）
    const debouncedParse = useDebounce(parseAndSetPreview, 300);

    const handleParse = (val) => {
        setText(val);
        // 仅在有内容时才显示解析状态，避免空输入时也显示 PARSING
        if (val.trim()) {
            setIsParsing(true);
            debouncedParse(val);
        } else {
            setPreview([]);
            setIsParsing(false);
            setDetectedFormats([]);
            setShowFormatConfirm(false);
        }
    };

    const handleSingleFormChange = (field, value) => {
        setSingleForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSingleImport = () => {
        if (importing) return;
        if (!singleForm.email.trim() || !singleForm.password.trim()) return;
        onImport([{
            email: singleForm.email.trim(),
            password: singleForm.password.trim(),
            recovery: singleForm.recovery.trim(),
            phone: normalizePhoneNumber(singleForm.phone.trim()) || '',
            secret: singleForm.secret.trim().replace(/\s/g, ''),
            reg_year: singleForm.reg_year.trim(),
            country: singleForm.country.trim(),
            group_name: '',
            remark: '',
        }]);
    };

    const isSingleFormValid = singleForm.email.trim() && singleForm.password.trim();

    const renderSingleFormField = (label, field, type, placeholder, required) => (
        <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">
                {label} {required
                    ? <span className="text-red-500">*</span>
                    : <span className="text-slate-400 text-xs">(可选)</span>}
            </label>
            <input
                type={type}
                value={singleForm[field]}
                onChange={(e) => handleSingleFormChange(field, e.target.value)}
                disabled={importing}
                placeholder={placeholder}
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all ${importing
                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-50 border-slate-200'}`}
            />
        </div>
    );

    const renderPreviewItem = (item, idx, isSingle) => (
        <div key={idx} className={`bg-slate-800/50 p-${isSingle ? '4' : '3'} rounded-xl border border-slate-700/50 ${isSingle ? '' : 'text-xs'}`}>
            <div className={`flex justify-between ${isSingle ? 'mb-3' : 'mb-1'}`}>
                <span className={`text-blue-400 font-bold ${isSingle ? 'text-lg' : ''}`}>{item.email || '未知账号'}</span>
                <span className="text-slate-500">#{idx + 1}</span>
            </div>
            {isSingle ? (
                <div className="grid grid-cols-1 gap-2 text-sm">
                    {[
                        ['密码', '•'.repeat(item.password?.length || 0), !!item.password],
                        ['恢复邮箱', item.recovery || '未设置', !!item.recovery],
                        ['手机号', item.phone || '未设置', !!item.phone],
                        ['2FA密钥', item.secret ? '已设置' : '未设置', !!item.secret],
                        ['注册年份', item.reg_year || '未设置', !!item.reg_year],
                        ['国家', item.country || '未设置', !!item.country],
                    ].map(([label, value, hasValue], i, arr) => (
                        <div key={label} className={`flex justify-between ${i < arr.length - 1 ? 'border-b border-slate-800/50' : ''} pb-2 pt-1`}>
                            <span className="text-slate-500">{label}:</span>
                            <span className={hasValue
                                ? (label === '2FA密钥' ? 'text-green-400' : (label === '密码' ? 'text-slate-300 font-mono' : 'text-slate-300'))
                                : 'text-slate-600 italic'}>{value}</span>
                        </div>
                    ))}
                    <div className="flex justify-between pt-1">
                        <span className="text-slate-500">状态:</span>
                        <span className="text-amber-400">未开启 (默认)</span>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-1 text-slate-400 mt-2">
                    <div className="flex justify-between border-b border-slate-800/50 pb-1 pt-1">
                        <span className="text-slate-500">状态:</span> <span className="text-slate-400">未开启 (默认)</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800/50 pb-1 pt-1">
                        <span className="text-slate-500">备注:</span> <span className="text-green-400">{item.remark || '无'}</span>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto animate-in fade-in zoom-in-95 duration-500">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900">导入账号</h1>
                <p className="text-slate-500">导入后状态默认设为"未开启"</p>
            </div>

            {/* 切换标签 */}
            <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
                {[
                    { key: 'single', icon: <UserPlus size={18} />, label: '单个导入' },
                    { key: 'batch', icon: <FileText size={18} />, label: '批量导入' },
                ].map(({ key, icon, label }) => (
                    <button
                        key={key}
                        disabled={importing}
                        onClick={() => setImportMode(key)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all ${importMode === key
                            ? 'bg-white shadow-sm text-blue-600'
                            : 'text-slate-500 hover:text-slate-700'} ${importing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                        {icon}
                        {label}
                    </button>
                ))}
            </div>

            {importMode === 'single' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 mb-6 text-blue-600">
                                <UserPlus size={20} />
                                <h2 className="font-bold">单个账号信息</h2>
                            </div>
                            <div className="space-y-4">
                                {renderSingleFormField('邮箱账号', 'email', 'email', 'example@gmail.com', true)}
                                {renderSingleFormField('登录密码', 'password', 'text', '输入密码', true)}
                                {renderSingleFormField('恢复邮箱', 'recovery', 'email', 'recovery@example.com', false)}
                                {renderSingleFormField('手机号', 'phone', 'text', '默认+86，可填 +12192731268', false)}
                                {renderSingleFormField('2FA 密钥', 'secret', 'text', 'TOTP密钥', false)}
                                <div className="grid grid-cols-2 gap-4">
                                    {renderSingleFormField('注册年份', 'reg_year', 'text', '2021', false)}
                                    {renderSingleFormField('国家', 'country', 'text', 'China / Japan / USA', false)}
                                </div>
                            </div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                            <p className="text-xs font-semibold text-slate-700 mb-2">行格式参考（与批量解析一致）</p>
                            <div className="text-xs text-slate-500 space-y-1">
                                {IMPORT_FORMAT_LINES.map((line) => (
                                    <p key={line}>• {line}</p>
                                ))}
                                <p>{IMPORT_EXTRA_RULE}</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button
                                onClick={onCancel}
                                disabled={importing}
                                className={`flex-1 py-4 border rounded-2xl font-bold transition-all ${importing
                                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            >
                                返回列表
                            </button>
                            <button
                                disabled={!isSingleFormValid || importing}
                                onClick={handleSingleImport}
                                className={`flex-1 py-4 px-8 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${isSingleFormValid && !importing
                                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                            >
                                {importing ? (
                                    <>
                                        <Loader2 size={20} className="animate-spin" />
                                        导入中...
                                    </>
                                ) : (
                                    <>
                                        <Plus size={20} />
                                        立即导入
                                    </>
                                )}
                            </button>
                        </div>
                        {importing && (
                            <p className="text-xs text-blue-600 px-1">正在导入账号，请勿重复点击...</p>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl h-[516px] flex flex-col">
                            <div className="flex items-center gap-2 mb-6 border-b border-slate-800 pb-4">
                                <div className={`w-2 h-2 rounded-full ${isSingleFormValid ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`}></div>
                                <h2 className="font-bold">实时预览 (Real-time Preview)</h2>
                            </div>
                            {isSingleFormValid ? (
                                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                                    {renderPreviewItem(singleForm, 0, true)}
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 text-center px-8">
                                    <UserPlus size={48} className="mb-4 opacity-10" />
                                    <p>请填写账号信息</p>
                                    <p className="text-xs mt-2 italic text-slate-500">邮箱和密码为必填项</p>
                                </div>
                            )}
                            <div className="mt-4 pt-4 border-t border-slate-800 text-[10px] text-slate-500 flex justify-between uppercase tracking-widest">
                                <span>Status: {isSingleFormValid ? 'READY' : 'WAITING'}</span>
                                <span>Count: {isSingleFormValid ? 1 : 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 mb-4 text-blue-600">
                                <FileText size={20} />
                                <h2 className="font-bold">粘贴数据区域</h2>
                            </div>
                            <p className="text-xs text-slate-400 mb-3 bg-slate-50 p-3 rounded-lg border border-dashed border-slate-200">
                                支持多种格式：<br/>
                                • {IMPORT_FORMAT_LINES[0]}<br/>
                                • {IMPORT_FORMAT_LINES[1]}<br/>
                                • {IMPORT_FORMAT_LINES[2]}<br/>
                                支持分隔符：| ---- —— --- --<br/>
                                {IMPORT_EXTRA_RULE}
                            </p>
                            <textarea
                                className="w-full h-80 px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm resize-none"
                                placeholder={IMPORT_PLACEHOLDER}
                                disabled={importing}
                                value={text} onChange={(e) => handleParse(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-4">
                            <button
                                onClick={onCancel}
                                disabled={importing}
                                className={`flex-1 py-4 border rounded-2xl font-bold transition-all ${importing
                                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            >
                                返回列表
                            </button>
                            <button
                                disabled={preview.length === 0 || importing}
                                onClick={() => {
                                    if (!importing) onImport(preview);
                                }}
                                className={`flex-2 py-4 px-8 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${preview.length > 0 && !importing ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                            >
                                {importing ? (
                                    <>
                                        <Loader2 size={20} className="animate-spin" />
                                        导入中...
                                    </>
                                ) : (
                                    <>
                                        <Plus size={20} />
                                        {`立即导入 ${preview.length > 0 ? `(${preview.length}条)` : ''}`}
                                    </>
                                )}
                            </button>
                        </div>
                        {importing && (
                            <p className="text-xs text-blue-600 px-1">导入进行中，完成后将自动返回列表。</p>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl h-[516px] flex flex-col">
                            <div className="flex items-center gap-2 mb-6 border-b border-slate-800 pb-4">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                <h2 className="font-bold">实时预览 (Real-time Preview)</h2>
                            </div>
                            {preview.length > 0 ? (
                                <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                                    {preview.map((item, idx) => renderPreviewItem(item, idx, false))}
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 text-center px-8">
                                    <Activity size={48} className="mb-4 opacity-10" />
                                    <p>等待解析数据...</p>
                                    <p className="text-xs mt-2 italic text-slate-500">所有导入项初始状态均为"未开启"</p>
                                </div>
                            )}
                            <div className="mt-4 pt-4 border-t border-slate-800 text-[10px] text-slate-500 flex justify-between uppercase tracking-widest">
                                <span>Status: {isParsing ? 'PARSING...' : 'OK'}</span>
                                <span>Count: {preview.length}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 格式确认对话框 */}
            {showFormatConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">检测到多种导入格式</h3>
                        <p className="text-slate-600 mb-4">系统检测到您的导入文本包含多种不同的格式规则：</p>
                        <ul className="list-disc list-inside text-sm text-slate-600 mb-4 space-y-1 bg-amber-50 p-4 rounded-lg border border-amber-200">
                            {detectedFormats.map((format, i) => (
                                <li key={i} className="text-amber-800">{format}</li>
                            ))}
                        </ul>
                        <p className="text-slate-600 mb-6 text-sm">请确认解析结果是否正确，或返回修改导入文本使用统一格式。</p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => { setShowFormatConfirm(false); setText(''); setPreview([]); setDetectedFormats([]); }}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-all font-medium"
                            >
                                返回修改
                            </button>
                            <button
                                onClick={() => setShowFormatConfirm(false)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium shadow-lg shadow-blue-200"
                            >
                                确认导入
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImportView;
