import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { 
  ChevronDown, ChevronRight, FileText, Pencil, 
  Trash2, Check, Info 
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { LibraryImage, useLibraryStore } from "../../../../stores/libraryStore";
import { useToastStore } from "../../../../stores/toastStore";

interface InspectorEditorialCardProps {
  activeImage: LibraryImage;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function InspectorEditorialCard({
  activeImage,
  isCollapsed,
  onToggle,
}: InspectorEditorialCardProps) {
  const { t } = useTranslation('library');
  const { images, selectedPaths, updateImageMetadata } = useLibraryStore();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form field states
  const [titleVal, setTitleVal] = useState('');
  const [descVal, setDescVal] = useState('');
  const [artistVal, setArtistVal] = useState('');
  const [copyrightVal, setCopyrightVal] = useState('');
  const [usageVal, setUsageVal] = useState('');

  // Conflict placeholders when multi-selection has differing values
  const [conflicts, setConflicts] = useState<{ [k: string]: boolean }>({});
  // Track which fields the user actually touched
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());

  // Reset editing mode whenever active image path changes
  useEffect(() => {
    setIsEditing(false);
    setDirtyFields(new Set());
  }, [activeImage.path]);

  // Determine all target images (selection + stack members)
  const targetImages = useMemo(() => {
    const basePaths = selectedPaths.has(activeImage.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : [activeImage.path];

    const result: LibraryImage[] = [];
    const seen = new Set<string>();

    for (const p of basePaths) {
      const img = images.find(i => i.path === p);
      if (img && !seen.has(img.path)) {
        seen.add(img.path);
        result.push(img);
        if (img.stackMembers) {
          for (const m of img.stackMembers) {
            if (!seen.has(m.path)) {
              seen.add(m.path);
              result.push(m);
            }
          }
        }
      }
    }
    return result.length > 0 ? result : [activeImage];
  }, [selectedPaths, activeImage, images]);

  const startEditing = () => {
    const newConflicts: { [k: string]: boolean } = {};

    const getFieldVal = (img: LibraryImage, key: 'title' | 'description' | 'artist' | 'copyright' | 'usage_terms') => {
      if (key === 'artist') return img.artist ?? img.exif_artist ?? '';
      if (key === 'copyright') return img.copyright ?? img.exif_copyright ?? '';
      if (key === 'description') return img.description ?? img.exif_description ?? '';
      return (img[key] as string | undefined) ?? '';
    };

    const checkUniform = (key: 'title' | 'description' | 'artist' | 'copyright' | 'usage_terms') => {
      if (targetImages.length <= 1) return { uniform: true, value: getFieldVal(targetImages[0] || activeImage, key) };
      const first = getFieldVal(targetImages[0], key);
      const isUniform = targetImages.every(img => getFieldVal(img, key) === first);
      return { uniform: isUniform, value: isUniform ? first : '' };
    };

    const tRes = checkUniform('title');
    newConflicts['title'] = !tRes.uniform;
    setTitleVal(tRes.value);

    const dRes = checkUniform('description');
    newConflicts['description'] = !dRes.uniform;
    setDescVal(dRes.value);

    const aRes = checkUniform('artist');
    newConflicts['artist'] = !aRes.uniform;
    setArtistVal(aRes.value);

    const cRes = checkUniform('copyright');
    newConflicts['copyright'] = !cRes.uniform;
    setCopyrightVal(cRes.value);

    const uRes = checkUniform('usage_terms');
    newConflicts['usage_terms'] = !uRes.uniform;
    setUsageVal(uRes.value);

    setConflicts(newConflicts);
    setDirtyFields(new Set());
    setIsEditing(true);
  };

  const handleFieldChange = (field: string, value: string, setter: (val: string) => void) => {
    setter(value);
    setDirtyFields(prev => new Set(prev).add(field));
  };

  const handleInsertYearMacro = () => {
    const addition = '© {year} ';
    setCopyrightVal(prev => prev ? `${addition}${prev}` : addition);
    setDirtyFields(prev => new Set(prev).add('copyright'));
  };

  const handleSave = async () => {
    if (dirtyFields.size === 0) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      // Check if copyright is dirty and contains {year} macro
      const hasYearMacro = dirtyFields.has('copyright') && copyrightVal.includes('{year}');

      if (hasYearMacro) {
        // Group images by 4-digit capture year
        const yearGroups = new Map<string, string[]>();
        for (const img of targetImages) {
          const year = img.date ? img.date.substring(0, 4) : new Date().getFullYear().toString();
          const list = yearGroups.get(year) || [];
          list.push(img.path);
          yearGroups.set(year, list);
        }

        for (const [year, paths] of yearGroups.entries()) {
          const resolvedCopyright = copyrightVal.replace(/\{year\}/g, year);
          await invoke('set_editorial_batch', {
            paths,
            title: dirtyFields.has('title') ? titleVal : null,
            description: dirtyFields.has('description') ? descVal : null,
            artist: dirtyFields.has('artist') ? artistVal : null,
            copyright: resolvedCopyright,
            usageTerms: dirtyFields.has('usage_terms') ? usageVal : null,
          });

          for (const p of paths) {
            const updates: Partial<LibraryImage> = {};
            if (dirtyFields.has('title')) updates.title = titleVal || null;
            if (dirtyFields.has('description')) updates.description = descVal || null;
            if (dirtyFields.has('artist')) updates.artist = artistVal || null;
            updates.copyright = resolvedCopyright || null;
            if (dirtyFields.has('usage_terms')) updates.usage_terms = usageVal || null;

            const existingImg = images.find(i => i.path === p);
            const updatedCulling = existingImg?.culling ? { ...existingImg.culling, ...updates } : undefined;
            updateImageMetadata(p, { ...updates, ...(updatedCulling ? { culling: updatedCulling } : {}) });
          }
        }
      } else {
        const allPaths = targetImages.map(img => img.path);
        await invoke('set_editorial_batch', {
          paths: allPaths,
          title: dirtyFields.has('title') ? titleVal : null,
          description: dirtyFields.has('description') ? descVal : null,
          artist: dirtyFields.has('artist') ? artistVal : null,
          copyright: dirtyFields.has('copyright') ? copyrightVal : null,
          usageTerms: dirtyFields.has('usage_terms') ? usageVal : null,
        });

        for (const p of allPaths) {
          const updates: Partial<LibraryImage> = {};
          if (dirtyFields.has('title')) updates.title = titleVal || null;
          if (dirtyFields.has('description')) updates.description = descVal || null;
          if (dirtyFields.has('artist')) updates.artist = artistVal || null;
          if (dirtyFields.has('copyright')) updates.copyright = copyrightVal || null;
          if (dirtyFields.has('usage_terms')) updates.usage_terms = usageVal || null;

          const existingImg = images.find(i => i.path === p);
          const updatedCulling = existingImg?.culling ? { ...existingImg.culling, ...updates } : undefined;
          updateImageMetadata(p, { ...updates, ...(updatedCulling ? { culling: updatedCulling } : {}) });
        }
      }

      useToastStore.getState().showSuccess(
        t('inspector.editorialSavedToast', 'Redaktionelle Metadaten gespeichert.'),
        t('inspector.editorialTitle', 'Redaktionell & Rechte')
      );
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save editorial metadata:', err);
      useToastStore.getState().showError(
        String(err),
        t('inspector.editorialSaveFailed', 'Fehler beim Speichern der redaktionellen Daten')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToExif = async () => {
    setIsSaving(true);
    try {
      const allPaths = targetImages.map(img => img.path);
      // Passing empty strings clears sidecar overrides in set_editorial_batch
      await invoke('set_editorial_batch', {
        paths: allPaths,
        title: "",
        description: "",
        artist: "",
        copyright: "",
        usageTerms: "",
      });

      for (const p of allPaths) {
        const cleared: Partial<LibraryImage> = {
          title: null,
          description: null,
          artist: null,
          copyright: null,
          usage_terms: null,
        };
        const existingImg = images.find(i => i.path === p);
        const updatedCulling = existingImg?.culling ? {
          ...existingImg.culling,
          title: undefined,
          description: undefined,
          artist: undefined,
          copyright: undefined,
          usage_terms: undefined,
        } : undefined;
        updateImageMetadata(p, { ...cleared, ...(updatedCulling ? { culling: updatedCulling } : {}) });
      }

      useToastStore.getState().showSuccess(
        t('inspector.editorialResetToast', 'Redaktionelle Metadaten zurückgesetzt.'),
        t('inspector.editorialTitle', 'Redaktionell & Rechte')
      );
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to reset editorial metadata:', err);
      useToastStore.getState().showError(
        String(err),
        t('inspector.editorialSaveFailed', 'Fehler beim Speichern der redaktionellen Daten')
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Effective values for view mode
  const effectiveArtist = activeImage.artist || activeImage.exif_artist;
  const isExifArtist = !activeImage.artist && Boolean(activeImage.exif_artist);

  const effectiveCopyright = activeImage.copyright || activeImage.exif_copyright;
  const isExifCopyright = !activeImage.copyright && Boolean(activeImage.exif_copyright);

  const effectiveTitle = activeImage.title;
  const effectiveDesc = activeImage.description || activeImage.exif_description;
  const effectiveUsage = activeImage.usage_terms;

  const hasAnyEditorial = Boolean(
    effectiveTitle || effectiveDesc || effectiveArtist || effectiveCopyright || effectiveUsage
  );

  return (
    <div className="bg-app-card border border-app-border rounded-xl p-3 space-y-2.5">
      {/* Header */}
      <div 
        onClick={onToggle}
        className={`flex items-center justify-between cursor-pointer select-none group ${!isCollapsed ? 'border-b border-app-border/50 pb-1.5' : ''}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          )}
          <FileText className="w-3.5 h-3.5 text-txt-tertiary group-hover:text-txt-secondary transition-colors flex-shrink-0" />
          <span className="text-xs font-semibold text-txt-primary truncate">
            {t('inspector.editorialTitle', 'Redaktionell & Rechte')}
          </span>
        </div>

        {!isEditing && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
            className="p-1 rounded text-txt-tertiary hover:text-txt-primary hover:bg-app-hover transition-colors"
            title={t('inspector.editEditorial', 'Redaktionelle Angaben bearbeiten')}
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>

      {!isCollapsed && (
        <>
          {isEditing ? (
            <div className="space-y-2 text-[11px]">
              {/* Batch notification */}
              {targetImages.length > 1 && (
                <div className="text-[10px] text-accent/90 bg-accent/10 border border-accent/20 rounded-md px-2 py-1 flex items-center gap-1.5">
                  <Info className="w-3 h-3 flex-shrink-0" />
                  <span>{t('inspector.editorialBatchBadge', { count: targetImages.length })}</span>
                </div>
              )}

              {/* Title input */}
              <div className="space-y-0.5">
                <label className="text-[10px] text-txt-tertiary block">
                  {t('inspector.editorialTitleField', 'Titel')}
                </label>
                <input
                  type="text"
                  value={titleVal}
                  onChange={(e) => handleFieldChange('title', e.target.value, setTitleVal)}
                  placeholder={conflicts['title'] ? t('inspector.variousValues', '<verschiedene Werte>') : t('inspector.editorialTitleField', 'Titel')}
                  className="w-full px-2 py-1 bg-app-panel border border-app-border rounded text-txt-primary text-[11px] placeholder:text-txt-tertiary/60 focus:outline-none focus:border-accent"
                />
              </div>

              {/* Description textarea */}
              <div className="space-y-0.5">
                <label className="text-[10px] text-txt-tertiary block">
                  {t('inspector.editorialDescription', 'Beschreibung')}
                </label>
                <textarea
                  rows={2}
                  value={descVal}
                  onChange={(e) => handleFieldChange('description', e.target.value, setDescVal)}
                  placeholder={conflicts['description'] ? t('inspector.variousValues', '<verschiedene Werte>') : t('inspector.editorialDescription', 'Beschreibung')}
                  className="w-full px-2 py-1 bg-app-panel border border-app-border rounded text-txt-primary text-[11px] placeholder:text-txt-tertiary/60 focus:outline-none focus:border-accent resize-none"
                />
              </div>

              {/* Artist input */}
              <div className="space-y-0.5">
                <label className="text-[10px] text-txt-tertiary block">
                  {t('inspector.editorialArtist', 'Fotograf / Künstler')}
                </label>
                <input
                  type="text"
                  value={artistVal}
                  onChange={(e) => handleFieldChange('artist', e.target.value, setArtistVal)}
                  placeholder={conflicts['artist'] ? t('inspector.variousValues', '<verschiedene Werte>') : t('inspector.editorialArtist', 'Fotograf / Künstler')}
                  className="w-full px-2 py-1 bg-app-panel border border-app-border rounded text-txt-primary text-[11px] placeholder:text-txt-tertiary/60 focus:outline-none focus:border-accent"
                />
              </div>

              {/* Copyright input with macro chip */}
              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-txt-tertiary">
                    {t('inspector.editorialCopyright', 'Copyright')}
                  </label>
                  <button
                    type="button"
                    onClick={handleInsertYearMacro}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent hover:bg-accent/25 transition-colors font-mono cursor-pointer"
                    title="Fügt © {year} ein (wird pro Bild mit dem jeweiligen Aufnahmejahr ersetzt)"
                  >
                    + © {'{year}'}
                  </button>
                </div>
                <input
                  type="text"
                  value={copyrightVal}
                  onChange={(e) => handleFieldChange('copyright', e.target.value, setCopyrightVal)}
                  placeholder={conflicts['copyright'] ? t('inspector.variousValues', '<verschiedene Werte>') : 'z. B. © {year} Max Mustermann'}
                  className="w-full px-2 py-1 bg-app-panel border border-app-border rounded text-txt-primary text-[11px] placeholder:text-txt-tertiary/60 focus:outline-none focus:border-accent font-mono"
                />
              </div>

              {/* Usage Terms input */}
              <div className="space-y-0.5">
                <label className="text-[10px] text-txt-tertiary block">
                  {t('inspector.editorialUsageTerms', 'Nutzungsrechte')}
                </label>
                <input
                  type="text"
                  value={usageVal}
                  onChange={(e) => handleFieldChange('usage_terms', e.target.value, setUsageVal)}
                  placeholder={conflicts['usage_terms'] ? t('inspector.variousValues', '<verschiedene Werte>') : t('inspector.editorialUsageTerms', 'Nutzungsrechte')}
                  className="w-full px-2 py-1 bg-app-panel border border-app-border rounded text-txt-primary text-[11px] placeholder:text-txt-tertiary/60 focus:outline-none focus:border-accent"
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-1 border-t border-app-border/40 mt-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleResetToExif}
                  className="flex items-center gap-1 text-[10px] text-txt-secondary hover:text-red-400 hover:bg-red-500/10 px-2 py-1 rounded transition-colors"
                  title={t('inspector.resetEditorial', 'Zurücksetzen (EXIF wiederherstellen)')}
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{t('common.reset', 'Zurücksetzen')}</span>
                </button>

                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setIsEditing(false)}
                    className="px-2.5 py-1 text-[11px] text-txt-secondary hover:text-txt-primary hover:bg-app-hover rounded transition-colors"
                  >
                    {t('common.cancel', 'Abbrechen')}
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSave}
                    className="px-3 py-1 text-[11px] font-medium bg-accent hover:bg-accent-hover text-app-deepest disabled:opacity-40 rounded shadow transition-colors flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    <span>{t('common.save', 'Speichern')}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {hasAnyEditorial ? (
                <div className="space-y-1.5 text-[11px]">
                  {effectiveTitle && (
                    <div>
                      <span className="text-txt-tertiary block text-[10px]">
                        {t('inspector.editorialTitleField', 'Titel')}
                      </span>
                      <p className="text-txt-primary font-medium truncate select-text" title={effectiveTitle}>
                        {effectiveTitle}
                      </p>
                    </div>
                  )}

                  {effectiveDesc && (
                    <div>
                      <span className="text-txt-tertiary block text-[10px]">
                        {t('inspector.editorialDescription', 'Beschreibung')}
                      </span>
                      <p className="text-txt-secondary text-[10px] line-clamp-3 select-text whitespace-pre-wrap" title={effectiveDesc}>
                        {effectiveDesc}
                      </p>
                    </div>
                  )}

                  {effectiveArtist && (
                    <div>
                      <span className="text-txt-tertiary block text-[10px]">
                        {t('inspector.editorialArtist', 'Fotograf / Künstler')}
                        {isExifArtist && (
                          <span className="text-[9px] text-txt-tertiary/70 ml-1 font-mono">(EXIF)</span>
                        )}
                      </span>
                      <p className="text-txt-primary font-medium truncate select-text" title={effectiveArtist}>
                        {effectiveArtist}
                      </p>
                    </div>
                  )}

                  {effectiveCopyright && (
                    <div>
                      <span className="text-txt-tertiary block text-[10px]">
                        {t('inspector.editorialCopyright', 'Copyright')}
                        {isExifCopyright && (
                          <span className="text-[9px] text-txt-tertiary/70 ml-1 font-mono">(EXIF)</span>
                        )}
                      </span>
                      <p className="text-txt-primary font-medium truncate select-text" title={effectiveCopyright}>
                        {effectiveCopyright}
                      </p>
                    </div>
                  )}

                  {effectiveUsage && (
                    <div>
                      <span className="text-txt-tertiary block text-[10px]">
                        {t('inspector.editorialUsageTerms', 'Nutzungsrechte')}
                      </span>
                      <p className="text-txt-secondary text-[10px] truncate select-text" title={effectiveUsage}>
                        {effectiveUsage}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between text-[11px] text-txt-tertiary">
                  <span className="text-[10px]">{t('inspector.noEditorial', 'Keine Angaben – Stift klicken zum Bearbeiten')}</span>
                  <button
                    onClick={startEditing}
                    className="text-[10px] text-accent hover:underline hover:text-accent/80 transition-colors flex items-center gap-1 ml-2 flex-shrink-0"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                    <span>{t('common.edit', 'Bearbeiten')}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
