import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Tag, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { LibraryImage, useLibraryStore } from "../../../../stores/libraryStore";
import { useToastStore } from "../../../../stores/toastStore";

interface InspectorTagsCardProps {
  activeImage: LibraryImage;
  scopedImages: LibraryImage[];
  isCollapsed: boolean;
  onToggle: () => void;
}

export function InspectorTagsCard({
  activeImage,
  scopedImages,
  isCollapsed,
  onToggle,
}: InspectorTagsCardProps) {
  const { t } = useTranslation('library');
  const { images, selectedPaths, updateCullingState } = useLibraryStore();

  const [tagInput, setTagInput] = useState('');
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const tagInputContainerRef = useRef<HTMLDivElement>(null);

  // Close tag suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagInputContainerRef.current && !tagInputContainerRef.current.contains(e.target as Node)) {
        setIsSuggestOpen(false);
      }
    };
    if (isSuggestOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSuggestOpen]);

  const allFolderTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const img of scopedImages) {
      for (const t of img.culling.tags) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [scopedImages]);

  const suggestions = useMemo(() => {
    const lowerInput = tagInput.trim().toLowerCase();
    const assignedSet = new Set(activeImage.culling.tags.map(t => t.toLowerCase()));
    
    return allFolderTags.filter(item => {
      if (assignedSet.has(item.name.toLowerCase())) return false;
      if (lowerInput) {
        return item.name.toLowerCase().includes(lowerInput);
      }
      return true;
    });
  }, [allFolderTags, activeImage.culling.tags, tagInput]);

  const handleAddSpecificTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim();
    if (!trimmed) return;
    if (activeImage.culling.tags.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      setTagInput('');
      setIsSuggestOpen(false);
      return;
    }
    const newTags = [...activeImage.culling.tags, trimmed];

    const pathsToUpdate = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    if (pathsToUpdate.length > 1) {
      for (const p of pathsToUpdate) {
        const img = images.find(i => i.path === p);
        if (img && !img.culling.tags.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
          const updated = [...img.culling.tags, trimmed];
          const idx = images.findIndex(i => i.path === p);
          if (idx !== -1) updateCullingState(idx, { tags: updated });
        }
      }
      invoke<{ total: number; succeeded: number; failed: number }>('set_culling_state_batch', {
        paths: pathsToUpdate,
        addTag: trimmed,
      }).then((res) => {
        if (res && res.failed > 0) {
          useToastStore.getState().showWarning(
            t('errors.batchSaveFailed', { failed: res.failed, total: res.total, defaultValue: `Fehler beim Speichern von ${res.failed} von ${res.total} Dateien.` }),
            t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
          );
        }
      }).catch((err) => {
        console.error('Failed to add tag batch:', err);
        useToastStore.getState().showError(
          t('errors.cullingSaveFailedDesc', { defaultValue: 'Die Sidecar-Datei (.rrdata) konnte nicht geschrieben werden.' }),
          t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
        );
      });
    } else {
      const globalIndex = images.findIndex(img => img.path === activeImage.path);
      if (globalIndex !== -1) updateCullingState(globalIndex, { tags: newTags });
      invoke('set_culling_state', { 
        path: activeImage.path, 
        flag: activeImage.culling.flag, 
        rating: activeImage.culling.rating, 
        color: activeImage.culling.color,
        tags: newTags,
      }).catch((err) => {
        console.error('Failed to add tag:', err);
        useToastStore.getState().showError(
          t('errors.cullingSaveFailedDesc', { defaultValue: 'Die Sidecar-Datei (.rrdata) konnte nicht geschrieben werden.' }),
          t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
        );
      });
    }
    setTagInput('');
    setIsSuggestOpen(false);
    setHighlightedIndex(-1);
  };

  const handleAddTag = () => {
    if (isSuggestOpen && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
      handleAddSpecificTag(suggestions[highlightedIndex].name);
    } else {
      handleAddSpecificTag(tagInput);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isSuggestOpen) {
        setIsSuggestOpen(true);
        setHighlightedIndex(0);
      } else if (suggestions.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isSuggestOpen && suggestions.length > 0) {
        setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === 'Escape') {
      setIsSuggestOpen(false);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = activeImage.culling.tags.filter(t => t !== tagToRemove);

    const pathsToUpdate = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    if (pathsToUpdate.length > 1) {
      for (const p of pathsToUpdate) {
        const img = images.find(i => i.path === p);
        if (img && img.culling.tags.includes(tagToRemove)) {
          const updated = img.culling.tags.filter(t => t !== tagToRemove);
          const idx = images.findIndex(i => i.path === p);
          if (idx !== -1) updateCullingState(idx, { tags: updated });
        }
      }
      invoke<{ total: number; succeeded: number; failed: number }>('set_culling_state_batch', {
        paths: pathsToUpdate,
        removeTag: tagToRemove,
      }).then((res) => {
        if (res && res.failed > 0) {
          useToastStore.getState().showWarning(
            t('errors.batchSaveFailed', { failed: res.failed, total: res.total, defaultValue: `Fehler beim Speichern von ${res.failed} von ${res.total} Dateien.` }),
            t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
          );
        }
      }).catch((err) => {
        console.error('Failed to remove tag batch:', err);
        useToastStore.getState().showError(
          t('errors.cullingSaveFailedDesc', { defaultValue: 'Die Sidecar-Datei (.rrdata) konnte nicht geschrieben werden.' }),
          t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
        );
      });
    } else {
      const globalIndex = images.findIndex(img => img.path === activeImage.path);
      if (globalIndex !== -1) updateCullingState(globalIndex, { tags: newTags });
      invoke('set_culling_state', { 
        path: activeImage.path, 
        flag: activeImage.culling.flag, 
        rating: activeImage.culling.rating, 
        color: activeImage.culling.color,
        tags: newTags,
      }).catch((err) => {
        console.error('Failed to remove tag:', err);
        useToastStore.getState().showError(
          t('errors.cullingSaveFailedDesc', { defaultValue: 'Die Sidecar-Datei (.rrdata) konnte nicht geschrieben werden.' }),
          t('errors.cullingSaveFailed', { defaultValue: 'Fehler beim Speichern' })
        );
      });
    }
  };

  return (
    <div className="bg-app-card border border-app-border rounded-xl p-3 space-y-2.5">
      <div 
        onClick={onToggle}
        className="flex items-center justify-between cursor-pointer select-none group"
      >
        <div className="flex items-center gap-1.5">
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors" />
          )}
          <Tag className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors" />
          <h3 className="text-[10px] font-semibold text-txt-tertiary uppercase tracking-wider group-hover:text-txt-secondary transition-colors">
            {t('inspector.tags')}
          </h3>
        </div>
        {activeImage.culling.tags.length > 0 && (
          <span className="text-[10px] text-txt-tertiary font-mono bg-app-panel px-1.5 py-0.2 rounded border border-app-border">
            {activeImage.culling.tags.length}
          </span>
        )}
      </div>

      {!isCollapsed && (
        <>
          {/* Tag Pills */}
          <div className="flex flex-wrap gap-1.5 min-h-[24px]">
            {activeImage.culling.tags.length === 0 ? (
              <span className="text-xs text-txt-tertiary italic py-0.5">
                {t('inspector.noTags')}
              </span>
            ) : (
              activeImage.culling.tags.map((tag) => (
                <span 
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-app-panel border border-app-border text-xs text-txt-primary hover:border-accent/40 transition-colors"
                >
                  <span>{tag}</span>
                  <button 
                    onClick={() => handleRemoveTag(tag)}
                    className="text-txt-tertiary hover:text-danger rounded transition-colors cursor-pointer p-0.5"
                    title={t('inspector.removeTagTooltip', { tag })}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Tag Input with Autocomplete */}
          <div className="relative" ref={tagInputContainerRef}>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value);
                setIsSuggestOpen(true);
                setHighlightedIndex(-1);
              }}
              onFocus={() => {
                setIsSuggestOpen(true);
                setHighlightedIndex(-1);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder={t('inspector.addTag')}
              className="w-full bg-app-panel border border-app-border rounded-lg px-2.5 py-1.5 text-xs text-txt-primary placeholder:text-txt-tertiary focus:outline-none focus:border-accent transition-colors pr-7"
            />
            {tagInput.trim().length > 0 && (
              <button
                onClick={() => handleAddSpecificTag(tagInput)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 bg-accent text-white text-[10px] font-semibold rounded hover:bg-accent/80 transition-colors cursor-pointer"
              >
                +
              </button>
            )}

            {/* Autocomplete Suggestions Dropdown */}
            {isSuggestOpen && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto bg-[#161619]/95 backdrop-blur-md border border-app-border rounded-xl shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-txt-tertiary border-b border-app-border/40 mb-0.5">
                  {t('inspector.suggestions')}
                </div>
                {suggestions.map((item, idx) => {
                  const isHighlighted = highlightedIndex === idx;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleAddSpecificTag(item.name);
                      }}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-left ${
                        isHighlighted ? 'bg-accent text-white' : 'text-txt-primary hover:bg-app-hover'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <Tag className={`w-3 h-3 ${isHighlighted ? 'text-white' : 'text-txt-tertiary'}`} />
                        <span className="font-medium truncate">{item.name}</span>
                      </div>
                      <span className={`text-[10px] font-mono ml-2 ${isHighlighted ? 'text-white/80' : 'text-txt-tertiary'}`}>
                        {item.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
