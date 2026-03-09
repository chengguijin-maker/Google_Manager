import React from 'react';
import { X } from 'lucide-react';

const textareaClassName = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-y min-h-[108px] leading-6';
const inputClassName = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all';

const EditModal = ({ account, onClose, onSubmit }) => {
    if (!account) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-xl font-bold text-slate-800">编辑账号信息</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>
                <form onSubmit={onSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">邮箱账号</label>
                            <input name="email" defaultValue={account.email} required className={inputClassName} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">登录密码</label>
                            <input name="password" defaultValue={account.password} required className={inputClassName} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">恢复邮箱</label>
                            <input name="recovery" defaultValue={account.recovery} className={inputClassName} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">手机号</label>
                            <input name="phone" defaultValue={account.phone} className={inputClassName} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">2FA 密钥</label>
                            <input name="secret" defaultValue={account.secret} className={inputClassName} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-500 mb-1">注册年份</label>
                                <input name="regYear" defaultValue={account.regYear} placeholder="如：2021" className={inputClassName} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-500 mb-1">国家</label>
                                <input name="country" defaultValue={account.country} placeholder="如：China" className={inputClassName} />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">标签</label>
                            <textarea
                                name="groupName"
                                defaultValue={account.groupName || ''}
                                placeholder="每行一个标签，支持逗号或换行粘贴"
                                className={textareaClassName}
                            />
                            <p className="mt-1 text-xs text-slate-400">每行一个标签，保存时会自动去空、去重。</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">备注信息</label>
                            <textarea
                                name="remark"
                                defaultValue={account.remark || ''}
                                placeholder="每行一条备注，例如：推特绑定、备用机登录等"
                                className={textareaClassName}
                            />
                            <p className="mt-1 text-xs text-slate-400">每行一条，便于逐项管理和后续查看。</p>
                        </div>
                    </div>
                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={onClose} className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition-all">取消</button>
                        <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all">确认保存</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditModal;
