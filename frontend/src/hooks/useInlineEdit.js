import { useState, useRef, useEffect, useMemo } from 'react';
import { normalizePhoneNumber } from '../utils/phoneUtils';

export const CLICK_COPY_DELAY_MS = 320;

/**
 * 行内编辑 Hook
 * 管理单元格的双击编辑、保存、取消逻辑
 */
const useInlineEdit = ({ onInlineEdit, allGroups, recentValuesByField = {} }) => {
    // 编辑状态：{ accountId, field, originalValue }
    const [editingCell, setEditingCell] = useState(null);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef(null);

    // 通用自动建议显示状态
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Refs for race condition fixes
    const isSelectingSuggestionRef = useRef(false);

    // 单击延迟计时器引用
    const clickTimerRef = useRef(null);

    const getSuggestionsForField = (field) => {
        if (!field) return [];
        const recent = recentValuesByField[field] || [];
        if (recent.length > 0) return recent.slice(0, 5);
        if (field === 'groupName' && Array.isArray(allGroups)) return allGroups.slice(0, 5);
        return [];
    };

    const activeField = editingCell?.field || 'groupName';
    const activeSuggestions = useMemo(
        () => getSuggestionsForField(activeField),
        [activeField, allGroups, recentValuesByField]
    );

    // 过滤建议
    const filteredSuggestions = useMemo(() => {
        const keyword = String(editValue || '').trim().toLowerCase();
        if (!keyword) return activeSuggestions.slice(0, 5);
        return activeSuggestions
            .filter(item => item.toLowerCase().includes(keyword))
            .slice(0, 5);
    }, [activeSuggestions, editValue]);

    // 当输入框打开时聚焦，避免焦点切换导致页面滚动
    useEffect(() => {
        if (editingCell && inputRef.current) {
            try {
                inputRef.current.focus({ preventScroll: true });
            } catch {
                inputRef.current.focus();
            }
            inputRef.current.select();
        }
    }, [editingCell]);

    useEffect(() => {
        return () => {
            if (clickTimerRef.current) {
                clearTimeout(clickTimerRef.current);
                clickTimerRef.current = null;
            }
        };
    }, []);

    // 单击复制（延迟执行，如果发生双击则取消）
    const handleCellClick = (value, label, copyToClipboard) => {
        if (value && !editingCell) {
            if (clickTimerRef.current) {
                clearTimeout(clickTimerRef.current);
            }
            clickTimerRef.current = setTimeout(() => {
                copyToClipboard(value, label);
                clickTimerRef.current = null;
            }, CLICK_COPY_DELAY_MS);
        }
    };

    // 双击进入编辑模式
    const handleCellDoubleClick = (e, accountId, field, currentValue) => {
        e.stopPropagation();
        if (typeof e.preventDefault === 'function') {
            e.preventDefault();
        }
        if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
        }
        const safeValue = currentValue || '';
        setEditingCell({ accountId, field, originalValue: safeValue });
        setEditValue(safeValue);
        setShowSuggestions(getSuggestionsForField(field).length > 0);
    };

    // 保存编辑（值未变化时不提交，避免切换编辑目标时界面跳动）
    const saveEdit = () => {
        if (!editingCell) {
            cancelEdit();
            return;
        }

        const originalValue = String(editingCell.originalValue ?? '');
        let currentValue = String(editValue ?? '');
        if (editingCell.field === 'phone' && currentValue) {
            currentValue = normalizePhoneNumber(currentValue);
        }
        if (originalValue === currentValue) {
            cancelEdit();
            return;
        }

        if (onInlineEdit) {
            onInlineEdit(editingCell.accountId, editingCell.field, currentValue);
        }
        cancelEdit();
    };

    // 处理输入框失焦 - 防止与建议选择竞态
    const handleEditableInputBlur = () => {
        if (!isSelectingSuggestionRef.current) {
            saveEdit();
        } else {
            isSelectingSuggestionRef.current = false;
        }
    };

    // 取消编辑
    const cancelEdit = () => {
        setEditingCell(null);
        setEditValue('');
        setShowSuggestions(false);
        isSelectingSuggestionRef.current = false;
    };

    // 键盘事件处理
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            saveEdit();
        } else if (e.key === 'Escape') {
            cancelEdit();
        }
    };

    // 选择建议
    const selectSuggestion = (value) => {
        isSelectingSuggestionRef.current = true;
        if (editingCell && onInlineEdit) {
            onInlineEdit(editingCell.accountId, editingCell.field, value);
        }
        cancelEdit();
    };

    return {
        editingCell,
        editValue,
        setEditValue,
        inputRef,
        showSuggestions,
        filteredSuggestions,
        handleCellClick,
        handleCellDoubleClick,
        handleEditableInputBlur,
        handleKeyDown,
        selectSuggestion,
        cancelEdit,
    };
};

export default useInlineEdit;
