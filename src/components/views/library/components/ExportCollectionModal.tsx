import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Download, Folder, X, Loader2, ChevronDown } from 'lucide-react';
import {
  useCollectionsStore,
  CollectionExportOptions,
  ExportResizeMode,
  ExportProgress,
} from '../../../../stores/collectionsStore';
import { useToastStore } from '../../../../stores/toastStore';

export function ExportCollectionModal() {
  const { t } = useTranslation('library');
  const { isExportModalOpen, exportTarget, closeExportModal, exportCollection, cancelExport } =
    useCollectionsStore();

  const [destinationDir, setDestinationDir] = useState('');
  const [filenamePrefix, setFilenamePrefix] = useState('');
  const [isSequential, setIsSequential] = useState(true);
  const [preserveOriginalName, setPreserveOriginalName] = useState(false);
  const [sizePreset, setSizePreset] = useState<'original' | '4k' | '2048' | '1024' | 'custom'>('original');
  const [customWidth, setCustomWidth] = useState<number>(2048);
  const [customHeight, setCustomHeight] = useState<number>(2048);
  const [jpegQuality, setJpegQuality] = useState<number>(90);
  const [synthesizeExifDates, setSynthesizeExifDates] = useState(true);

  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkScroll = useCallback(() => {
    if (!scrollEl) return;
    const hasMore = scrollEl.scrollTop + scrollEl.clientHeight < scrollEl.scrollHeight - 12;
    setCanScrollDown(hasMore);
  }, [scrollEl]);

  // Auto-calculated zero-padding digits based on collection size (min 3 digits)
  const autoDigits = exportTarget ? Math.max(3, String(exportTarget.images.length).length) : 3;

  // Initialize defaults when modal opens
  useEffect(() => {
    if (exportTarget) {
      const sanitized = exportTarget.name
        .replace(/[^a-zA-Z0-9_\-äöüÄÖÜß]/g, '_')
        .replace(/_+/g, '_');
      setFilenamePrefix(`${sanitized}_`);
      setProgress(null);
      setIsExporting(false);
      setIsSequential(true);
    }
  }, [exportTarget]);

  // Handle Escape key to close modal (if not currently exporting)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExporting) {
        closeExportModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExporting, closeExportModal]);

  // Listen to export progress
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    listen<ExportProgress>('collection-export-progress', (event) => {
      setProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Monitor scrollability and update floating indicator whenever element mounts or content changes
  useEffect(() => {
    if (!scrollEl) {
      setCanScrollDown(false);
      return;
    }

    // Check immediately and on animation frames / timers for layout settling
    checkScroll();
    const t1 = setTimeout(checkScroll, 50);
    const t2 = setTimeout(checkScroll, 150);
    const t3 = setTimeout(checkScroll, 350);

    scrollEl.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll, { passive: true });

    let observer: ResizeObserver | null = null;
    try {
      observer = new ResizeObserver(() => {
        checkScroll();
      });
      observer.observe(scrollEl);
      if (scrollEl.firstElementChild) {
        observer.observe(scrollEl.firstElementChild);
      }
    } catch (err) {
      console.error('ResizeObserver failed:', err);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      scrollEl.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
      if (observer) observer.disconnect();
    };
  }, [scrollEl, checkScroll, isSequential, sizePreset, customWidth, customHeight]);

  const handleScrollToBottom = () => {
    if (!scrollEl) return;
    scrollEl.scrollTo({
      top: scrollEl.scrollHeight,
      behavior: 'smooth',
    });
  };

  if (!isExportModalOpen || !exportTarget) return null;

  const handlePickDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('exportModal.pickDirTitle', 'Zielordner für Export auswählen'),
      });
      if (selected && typeof selected === 'string') {
        setDestinationDir(selected);
      }
    } catch (err) {
      console.error('Failed to select directory:', err);
    }
  };

  const handleStartExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destinationDir.trim()) {
      useToastStore.getState().showError(t('exportModal.errNoDir', 'Bitte wähle einen Zielordner aus.'));
      return;
    }

    let resizeMode: ExportResizeMode;
    switch (sizePreset) {
      case 'original':
        resizeMode = { mode: 'original' };
        break;
      case '4k':
        resizeMode = { mode: 'longEdge', value: 3840 };
        break;
      case '2048':
        resizeMode = { mode: 'longEdge', value: 2048 };
        break;
      case '1024':
        resizeMode = { mode: 'longEdge', value: 1024 };
        break;
      case 'custom':
        resizeMode = { mode: 'custom', value: { width: customWidth, height: customHeight } };
        break;
    }

    const options: CollectionExportOptions = {
      albumId: exportTarget.id,
      destinationDir,
      filenamePrefix,
      digits: autoDigits,
      preserveOriginalName,
      resizeMode,
      jpegQuality,
      synthesizeExifDates: isSequential ? synthesizeExifDates : false,
      isSequential,
    };

    try {
      setIsExporting(true);
      setProgress({ current: 0, total: exportTarget.images.length, filename: '' });
      const exportedCount = await exportCollection(options);
      setIsExporting(false);
      useToastStore.getState().showSuccess(
        t('exportModal.exportSuccess', {
          count: exportedCount,
          defaultValue: `${exportedCount} Fotos erfolgreich exportiert!`,
        })
      );
      closeExportModal();
    } catch (err) {
      setIsExporting(false);
      useToastStore.getState().showError(String(err));
    }
  };

  const previewNum1 = String(1).padStart(autoDigits, '0');
  const previewNum2 = String(2).padStart(autoDigits, '0');
  const sampleName1 = isSequential
    ? (preserveOriginalName ? `${filenamePrefix}${previewNum1}_IMG_001.jpg` : `${filenamePrefix}${previewNum1}.jpg`)
    : `${filenamePrefix}IMG_001.jpg`;
  const sampleName2 = isSequential
    ? (preserveOriginalName ? `${filenamePrefix}${previewNum2}_IMG_002.jpg` : `${filenamePrefix}${previewNum2}.jpg`)
    : `${filenamePrefix}IMG_002.jpg`;

  const percent = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExporting) closeExportModal();
      }}
    >
      <form
        onSubmit={handleStartExport}
        className="bg-app-panel border border-app-border rounded-xl shadow-2xl w-full max-w-lg md:max-w-xl flex flex-col max-h-[85vh] text-txt-primary animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
      >
        {/* Header - Pinned at top */}
        <div className="px-5 py-3.5 border-b border-app-border flex items-center justify-between flex-shrink-0 bg-app-panel">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent flex-shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">{t('exportModal.title', 'Sammlung exportieren')}</h2>
              <p className="text-xs text-txt-tertiary">
                {exportTarget.name} ({exportTarget.images.length} {t('exportModal.photosCount', 'Fotos')})
              </p>
            </div>
          </div>
          {!isExporting && (
            <button
              type="button"
              onClick={closeExportModal}
              className="p-1.5 hover:bg-app-hover rounded-lg text-txt-tertiary hover:text-txt-primary transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Scrollable Form Body with Floating Indicator */}
        <div className="relative flex-1 min-h-0 flex flex-col">
          <div
            ref={setScrollEl}
            className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3.5 text-xs pr-3 scroll-smooth"
          >
          {/* Card 1: Target Folder */}
          <div className="p-3.5 bg-app-card rounded-lg border border-app-border flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-txt-secondary flex items-center gap-1.5 text-xs">
                <Folder className="w-3.5 h-3.5 text-accent" />
                {t('exportModal.destDirLabel', 'Zielordner (Echte Kopien)')}
              </label>
              {destinationDir && (
                <span className="text-[10px] text-emerald-400/90 font-medium">Bereit zum Export</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={destinationDir}
                placeholder={t('exportModal.destDirPlaceholder', 'Ordner auf Festplatte oder USB-Stick auswählen...')}
                className="flex-1 px-3 py-1.5 bg-app-panel border border-app-border rounded-lg text-txt-primary text-xs truncate focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={handlePickDirectory}
                disabled={isExporting}
                className="px-3.5 py-1.5 bg-app-panel hover:bg-app-hover border border-app-border rounded-lg text-txt-primary font-medium text-xs transition-colors cursor-pointer flex-shrink-0"
              >
                {t('exportModal.browse', 'Durchsuchen...')}
              </button>
            </div>
          </div>

          {/* Card 2: Sequential Mode & Filenames */}
          <div className="p-3.5 bg-app-card rounded-lg border border-app-border flex flex-col gap-3">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isSequential}
                onChange={(e) => setIsSequential(e.target.checked)}
                disabled={isExporting}
                className="mt-0.5 rounded accent-accent cursor-pointer"
              />
              <div className="flex flex-col">
                <span className="font-semibold text-txt-primary text-xs">
                  {t('exportModal.sequentialTitle', 'Manuelle Reihenfolge als Sequenz erzwingen (Fotobuch & Web)')}
                </span>
                <span className="text-[11px] text-txt-secondary leading-relaxed mt-0.5">
                  {t(
                    'exportModal.sequentialDesc',
                    'Nummeriert die Dateien fortlaufend und erzeugt aufsteigende EXIF-Aufnahmedaten. Garantiert die exakte Reihenfolge in Fotobuch-Software und Web-Galerien.'
                  )}
                </span>
              </div>
            </label>

            {isSequential ? (
              <div className="pt-3 border-t border-app-border/40 flex flex-col gap-2.5">
                {/* Prefix input & Auto-digits badge side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-txt-secondary">
                      {t('exportModal.prefixLabel', 'Dateinamen-Präfix (optional)')}
                    </label>
                    <input
                      type="text"
                      value={filenamePrefix}
                      onChange={(e) => setFilenamePrefix(e.target.value)}
                      disabled={isExporting}
                      placeholder="z. B. Fotobuch_"
                      className="w-full px-3 py-1.5 bg-app-panel border border-app-border rounded-lg text-txt-primary focus:outline-none focus:border-accent text-xs font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-txt-secondary">
                      {t('exportModal.numberingLabel', 'Nummerierung:')}
                    </span>
                    <div className="px-3 py-1.5 bg-app-panel border border-app-border/60 rounded-lg text-accent font-mono text-xs flex items-center justify-between">
                      <span>{autoDigits}-stellig</span>
                      <span className="text-txt-tertiary text-[10px]">
                        {autoDigits === 3 ? '001 – 999' : '0001 – 9999'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Preserve Original Name Checkbox */}
                <label className="flex items-center gap-2.5 cursor-pointer select-none text-txt-secondary text-[11px]">
                  <input
                    type="checkbox"
                    checked={preserveOriginalName}
                    onChange={(e) => setPreserveOriginalName(e.target.checked)}
                    disabled={isExporting}
                    className="rounded accent-accent cursor-pointer"
                  />
                  <span>
                    {t(
                      'exportModal.preserveOriginal',
                      'Original-Dateiname nach der Nummer beibehalten (z. B. 001_IMG_4821.jpg)'
                    )}
                  </span>
                </label>

                {/* Synthetic EXIF Date Checkbox */}
                <div className="p-2.5 bg-accent/10 border border-accent/25 rounded-lg flex flex-col gap-1">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none font-semibold text-txt-primary text-xs">
                    <input
                      type="checkbox"
                      checked={synthesizeExifDates}
                      onChange={(e) => setSynthesizeExifDates(e.target.checked)}
                      disabled={isExporting}
                      className="rounded accent-accent cursor-pointer"
                    />
                    <span>{t('exportModal.synthesizeExif', 'Lineare EXIF-Aufnahmedaten erzeugen (+10s pro Foto)')}</span>
                  </label>
                  <p className="text-[11px] text-txt-secondary leading-relaxed pl-[22px]">
                    {t(
                      'exportModal.synthesizeExifHint',
                      'Schreibt aufsteigende Aufnahmezeiten in die Dateien. Garantiert die exakte Reihenfolge selbst bei Cloud-Alben und Web-Galerien, die Dateinamen ignorieren und nach Aufnahmedatum sortieren.'
                    )}
                  </p>
                </div>

                {/* Live Filename Preview directly inside naming card */}
                <div className="p-2.5 bg-app-panel/70 border border-app-border/60 rounded-lg flex flex-col gap-1 font-mono text-[11px]">
                  <span className="text-[10px] font-sans uppercase font-bold text-txt-tertiary tracking-wider">
                    {t('exportModal.preview', 'Vorschau der exportierten Dateinamen:')}
                  </span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-accent text-xs">
                    <span className="truncate">1. {sampleName1}</span>
                    <span className="text-txt-tertiary font-sans">•</span>
                    <span className="truncate">2. {sampleName2}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="pt-3 border-t border-app-border/40 flex flex-col gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-txt-secondary">
                    {t('exportModal.prefixOptionalLabel', 'Präfix vor Originalnamen (optional)')}
                  </label>
                  <input
                    type="text"
                    value={filenamePrefix}
                    onChange={(e) => setFilenamePrefix(e.target.value)}
                    disabled={isExporting}
                    placeholder={t('exportModal.prefixPlaceholder', 'leer lassen für unveränderte Dateinamen')}
                    className="px-3 py-1.5 bg-app-panel border border-app-border rounded-lg text-txt-primary focus:outline-none focus:border-accent text-xs font-mono"
                  />
                </div>

                {/* Live Filename Preview */}
                <div className="p-2.5 bg-app-panel/70 border border-app-border/60 rounded-lg flex flex-col gap-1 font-mono text-[11px]">
                  <span className="text-[10px] font-sans uppercase font-bold text-txt-tertiary tracking-wider">
                    {t('exportModal.preview', 'Vorschau der exportierten Dateinamen:')}
                  </span>
                  <div className="text-accent text-xs truncate">
                    {sampleName1}
                  </div>
                </div>

                <p className="text-[11px] text-txt-tertiary">
                  {t(
                    'exportModal.standardExportHint',
                    'Dateien werden als 1:1 Kopien mit ihren Original-Aufnahmedaten exportiert.'
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Card 3: Image Sizing & Quality */}
          <div className="p-3.5 bg-app-card rounded-lg border border-app-border flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-txt-secondary text-xs">
                  {t('exportModal.sizingLabel', 'Bildgröße & Auflösung')}
                </label>
                {sizePreset !== 'original' && (
                  <span className="text-[10px] text-accent font-medium">JPEG-Konvertierung</span>
                )}
              </div>
              <select
                value={sizePreset}
                onChange={(e) => setSizePreset(e.target.value as any)}
                disabled={isExporting}
                className="px-3 py-2 bg-app-panel border border-app-border rounded-lg text-txt-primary focus:outline-none focus:border-accent text-xs cursor-pointer"
              >
                <option value="original">{t('exportModal.presetOriginal', 'Volle Auflösung / Original (Verlustfreie Kopie, ideal für Druck/Fotobuch)')}</option>
                <option value="4k">{t('exportModal.preset4k', '4K Ultra HD (3840px lange Kante – TV-Shows & 4K-Displays)')}</option>
                <option value="2048">{t('exportModal.preset2048', 'Web Standard / Full HD (2048px lange Kante – WordPress & Cloud)')}</option>
                <option value="1024">{t('exportModal.preset1024', 'Kompakt / E-Mail (1024px lange Kante – Schnellversand & Chat)')}</option>
                <option value="custom">{t('exportModal.presetCustom', 'Benutzerdefiniert...')}</option>
              </select>
            </div>

            {/* Custom Size & Quality Sliders (if not original) */}
            {sizePreset !== 'original' && (
              <div className="pt-2.5 border-t border-app-border/40 flex flex-col gap-3">
                {sizePreset === 'custom' && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-txt-secondary font-semibold">Max. Breite (px)</label>
                      <input
                        type="number"
                        value={customWidth}
                        onChange={(e) => setCustomWidth(Math.max(100, parseInt(e.target.value) || 100))}
                        className="w-full px-2.5 py-1.5 bg-app-panel border border-app-border rounded-lg text-txt-primary text-xs focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-txt-secondary font-semibold">Max. Höhe (px)</label>
                      <input
                        type="number"
                        value={customHeight}
                        onChange={(e) => setCustomHeight(Math.max(100, parseInt(e.target.value) || 100))}
                        className="w-full px-2.5 py-1.5 bg-app-panel border border-app-border rounded-lg text-txt-primary text-xs focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-[11px] text-txt-secondary">
                    <span>{t('exportModal.qualityLabel', 'JPEG-Qualität:')}</span>
                    <span className="font-semibold text-txt-primary font-mono">{jpegQuality}%</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="100"
                    value={jpegQuality}
                    onChange={(e) => setJpegQuality(parseInt(e.target.value))}
                    className="accent-accent cursor-pointer w-full"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Progress Indicator (when exporting) */}
          {isExporting && (
            <div className="flex flex-col gap-2 p-3.5 bg-app-card rounded-lg border border-accent/40 shadow-sm animate-in fade-in">
              <div className="flex justify-between text-xs">
                <span className="text-txt-primary font-medium flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                  {t('exportModal.exporting', 'Exportiere...')} ({progress?.current || 0} / {progress?.total || 0})
                </span>
                <span className="font-mono text-accent font-bold">{percent}%</span>
              </div>
              <div className="w-full h-2 bg-app-panel rounded-full overflow-hidden border border-app-border/50">
                <div
                  className="h-full bg-accent transition-all duration-150"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {progress?.filename && (
                <span className="text-[10px] text-txt-tertiary truncate font-mono">
                  {progress.filename}
                </span>
              )}
            </div>
          )}
        </div>

          {/* Floating Scroll Indicator Overlay (like in ImportSourceStep) */}
          {canScrollDown && (
            <>
              <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-[#151518] via-[#151518]/85 to-transparent pointer-events-none z-10" />
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 animate-in fade-in zoom-in-90 duration-150">
                <button
                  type="button"
                  onClick={handleScrollToBottom}
                  title={t('exportModal.scrollDownHint', { defaultValue: 'Nach unten scrollen (weitere Einstellungen)' })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1c1c21]/95 border border-app-border text-xs text-txt-secondary hover:text-white hover:border-accent shadow-xl backdrop-blur-md transition-all cursor-pointer group active:scale-95"
                >
                  <span className="text-[11px] font-medium">
                    {t('exportModal.moreOptions', { defaultValue: 'Weitere Einstellungen' })}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-accent animate-bounce" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Pinned Footer */}
        <div className="px-5 py-3.5 border-t border-app-border bg-app-panel flex items-center justify-between flex-shrink-0">
          <div className="text-[11px] text-txt-tertiary truncate mr-2">
            {exportTarget.images.length} {t('exportModal.photosCount', 'Fotos')}
            <span className="mx-1.5">•</span>
            {sizePreset === 'original'
              ? t('exportModal.presetOriginalBadge', 'Originalgröße')
              : `${sizePreset.toUpperCase()} (${jpegQuality}%)`}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isExporting ? (
              <button
                type="button"
                onClick={cancelExport}
                className="px-4 py-2 bg-red-500/20 text-red-300 hover:bg-red-500/30 rounded-lg font-medium text-xs transition-colors cursor-pointer"
              >
                {t('common.cancel', 'Abbrechen')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={closeExportModal}
                  className="px-4 py-2 hover:bg-app-hover rounded-lg text-txt-secondary text-xs transition-colors cursor-pointer"
                >
                  {t('common.cancel', 'Abbrechen')}
                </button>
                <button
                  type="submit"
                  disabled={!destinationDir}
                  className="px-5 py-2 bg-accent text-white font-medium text-xs rounded-lg hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-md shadow-accent/20 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t('exportModal.startExport', 'Exportieren starten')}
                </button>
              </>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
