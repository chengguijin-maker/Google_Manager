import { useState, useRef, useEffect, useMemo } from 'react';
import { normalizePhoneNumber } from '../utils/phoneUtils';
import {
    appendUniqueLine,
    isMultilineField,
    normalizeMultiValueValue,
} from '../utils/multiValueField';

export const CLICK_COPY_DELAY_MS = 320;

const focusEditableField = (element, multiline = false) => {
    if (!element) return;

    try {
        element.focus({ preventScroll: true });
    } catch {
        element.focus();
    }

    if (typeof element.setSelectionRange !== 'function') return;

    if (multiline) {
        const length = String(element.value || '').length;
        element.setSelectionRange(length, length);
        return;
    }

    element.select();
};

const useInlineEdit = ({ onInlineEdit, allGroups, recentValuesByField = {} }) => {
    const [editingCell, setEditingCell] = useState(null);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef(null);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const isSelectingSuggestionRef = useRef(false);
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

    const filteredSuggestions = useMemo(() => {
        const keyword = String(editValue || '').trim().toLowerCase();
        if (!keyword) return activeSuggestions.slice(0, 5);
        return activeSuggestions
            .filter(item => item.toLowerCase().includes(keyword))
            .slice(0, 5);
    }, [activeSuggestions, editValue]);

    useEffect(() => {
        if (!editingCell || !inputRef.current) return;
        focusEditableField(inputRef.current, isMultilineField(editingCell.field));
    }, [editingCell]);

    useEffect(() => {
        if (!editingCell || !inputRef.current || !isMultilineField(editingCell.field)) return;
        const element = inputRef.current;
        element.style.height = 'auto';
        element.style.height = `${Math.min(Math.max(element.scrollHeight, 96), 260)}px`;
    }, [editingCell, editValue]);

    useEffect(() => {
        return () => {
            if (clickTimerRef.current) {
                clearTimeout(clickTimerRef.current);
                clickTimerRef.current = null;
            }
        };
    }, []);

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

    const cancelEdit = () => {
        setEditingCell(null);
        setEditValue('');
        setShowSuggestions(false);
        isSelectingSuggestionRef.current = false;
    };

    const saveEdit = () => {
        if (!editingCell) {
            cancelEdit();
            return;
        }

        const originalValue = normalizeMultiValueValue(editingCell.field, String(editingCell.originalValue ?? ''));
        let currentValue = String(editValue ?? '');

        if (editingCell.field === 'phone' && currentValue) {
            currentValue = normalizePhoneNumber(currentValue);
        }
        if (isMultilineField(editingCell.field)) {
            currentValue = normalizeMultiValueValue(editingCell.field, currentValue);
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

    const handleEditableInputBlur = () => {
        if (!isSelectingSuggestionRef.current) {
            saveEdit();
        } else {
            isSelectingSuggestionRef.current = false;
        }
    };

    const handleKeyDown = (e) => {
        if (!editingCell) return;

        const multiline = isMultilineField(editingCell.field);
        if (e.key === 'Escape') {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            cancelEdit();
            return;
        }

        if (multiline) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                if (typeof e.preventDefault === 'function') e.preventDefault();
                saveEdit();
            }
            return;
        }

        if (e.key === 'Enter') {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            saveEdit();
        }
    };

    const selectSuggestion = (value) => {
        isSelectingSuggestionRef.current = true;

        if (!editingCell) {
            cancelEdit();
            return;
        }

        if (isMultilineField(editingCell.field)) {
            setEditValue(prev => appendUniqueLine(editingCell.field, prev, value));
            setShowSuggestions(getSuggestionsForField(editingCell.field).length > 0);
            queueMicrotask(() => {
                focusEditableField(inputRef.current, true);
            });
            isSelectingSuggestionRef.current = false;
            return;
        }

        if (onInlineEdit) {
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
        isMultilineEditing: isMultilineField(editingCell?.field),
    };
};

export default useInlineEdit;
