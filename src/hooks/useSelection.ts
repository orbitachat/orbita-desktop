// src/hooks/useSelection.ts
import { useState, useCallback, useEffect, useMemo } from 'react';

export function useSelection() {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const enterSelectionMode = useCallback((messageId: string) => {
    setIsSelectionMode(true);
    setSelectedIds(new Set([messageId]));
  }, []);

  const toggleSelection = useCallback((messageId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Автоматический выход при 0 выбранных сообщений
  useEffect(() => {
    if (isSelectionMode && selectedIds.size === 0) {
      exitSelectionMode();
    }
  }, [isSelectionMode, selectedIds.size, exitSelectionMode]);

  return useMemo(
    () => ({
      isSelectionMode,
      selectedIds,
      enterSelectionMode,
      toggleSelection,
      exitSelectionMode,
      clearSelection,
    }),
    [isSelectionMode, selectedIds, enterSelectionMode, toggleSelection, exitSelectionMode, clearSelection]
  );
}