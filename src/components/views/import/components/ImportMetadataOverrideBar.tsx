import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { 
  ChevronDown, ChevronRight, Calendar, FileText, 
  RotateCcw, Sparkles, AlertCircle 
} from "lucide-react";
import { useImportStore } from "../../../../stores/importStore";
import { useSettingsStore } from "../../../../stores/settingsStore";

export function ImportMetadataOverrideBar() {
  const { t } = useTranslation('import');
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    importDateOverrideEnabled,
    setImportDateOverrideEnabled,
    importDateOverride,
    setImportDateOverride,
    importEditorialEnabled,
    setImportEditorialEnabled,
    importTitle,
    setImportTitle,
    importDescription,
    setImportDescription,
    importArtistOverride,
    setImportArtistOverride,
    importCopyrightOverride,
    setImportCopyrightOverride,
    importUsageTermsOverride,
    setImportUsageTermsOverride,
    lastSessionImportOverride,
    applyLastSessionOverride,
  } = useImportStore();

  const {
    defaultArtist,
    defaultCopyright,
    defaultUsageTerms,
    autoApplyEditorialOnImport,
  } = useSettingsStore();

  const isOverrideActive = (importDateOverrideEnabled && importDateOverride.trim() !== '') || importEditorialEnabled;
  const isSettingsDefaultActive = autoApplyEditorialOnImport && (Boolean(defaultArtist.trim()) || Boolean(defaultCopyright.trim()));

  // Summary for previous session preview button
  const lastSessionPreview = useMemo(() => {
    if (!lastSessionImportOverride) return '';
    const parts: string[] = [];
    if (lastSessionImportOverride.dateOverrideEnabled && lastSessionImportOverride.dateOverride.trim()) {
      parts.push(lastSessionImportOverride.dateOverride.trim());
    }
    if (lastSessionImportOverride.editorialEnabled && lastSessionImportOverride.title.trim()) {
      parts.push(lastSessionImportOverride.title.trim());
    }
    return parts.join(' · ');
  }, [lastSessionImportOverride]);

  return (
    <div className="bg-app-card border border-app-border rounded-xl overflow-hidden transition-all duration-200">
      {/* Header bar */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-4 py-2.5 flex items-center justify-between cursor-pointer select-none hover:bg-app-hover/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-txt-tertiary flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-txt-tertiary flex-shrink-0" />
          )}
          <span className="text-xs font-semibold text-txt-primary">
            {t('preview.metadataBarTitle', 'Metadaten & Aufnahmedatum für diesen Import')}
          </span>

          {/* Status Badges */}
          {isOverrideActive ? (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>{t('preview.overrideActiveBadge', 'Manuelle Überschreibung aktiv')}</span>
            </span>
          ) : isSettingsDefaultActive ? (
            <span 
              className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent font-medium truncate max-w-[240px]"
              title={`${defaultArtist ? `Fotograf: ${defaultArtist}` : ''} ${defaultCopyright ? `· ${defaultCopyright}` : ''}`}
            >
              {t('preview.defaultMetadataActive', 'Stammdaten aktiv')}
              {defaultArtist ? ` (${defaultArtist})` : ''}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 ml-auto" onClick={(e) => e.stopPropagation()}>
          {/* Quick Apply Last Session Override Button */}
          {lastSessionImportOverride && !isOverrideActive && (
            <button
              type="button"
              onClick={applyLastSessionOverride}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent rounded-md transition-colors cursor-pointer"
              title={t('preview.applyLastSessionTooltip', 'Übernimmt Datum & Metadaten des vorherigen Imports')}
            >
              <RotateCcw className="w-3 h-3" />
              <span>
                {t('preview.applyLastSessionBtn', 'Werte vom letzten Import übernehmen')}
                {lastSessionPreview ? ` (${lastSessionPreview})` : ''}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded Grid Panel */}
      {isExpanded && (
        <div className="p-4 border-t border-app-border/60 bg-app-panel/40 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Column 1: Date Override for Scans */}
          <div className="p-3 bg-app-card border border-app-border/80 rounded-lg space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-accent" />
                <span className="font-semibold text-txt-primary">
                  {t('preview.dateOverrideColTitle', 'Aufnahmedatum überschreiben (Scans)')}
                </span>
              </div>
              <input
                type="checkbox"
                id="toggle-date-override"
                checked={importDateOverrideEnabled}
                onChange={(e) => setImportDateOverrideEnabled(e.target.checked)}
                className="rounded accent-accent cursor-pointer"
              />
            </div>

            <p className="text-[11px] text-txt-tertiary">
              {t('preview.dateOverrideDesc', 'Aufnahmedatum für alle importierten Dateien einheitlich festlegen')}
            </p>

            <div className={`space-y-2 transition-opacity ${importDateOverrideEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div>
                <input
                  type="text"
                  value={importDateOverride}
                  onChange={(e) => setImportDateOverride(e.target.value)}
                  placeholder="z. B. 1985-07-15, 1985-07 oder 1985"
                  className="w-full px-2.5 py-1.5 bg-app-panel border border-app-border rounded-md text-txt-primary text-xs font-mono placeholder:text-txt-tertiary/60 focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex items-start gap-1.5 text-[10px] text-txt-secondary bg-app-panel/60 p-2 rounded border border-app-border/40">
                <AlertCircle className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
                <span>
                  {t(
                    'preview.dateOverrideHint',
                    'Sortiert Dateien beim Import direkt in den entsprechenden Datums-Zielordner ein und speichert das Datum im Sidecar.'
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Column 2: Shoot-Title & Editorial Overrides */}
          <div className="p-3 bg-app-card border border-app-border/80 rounded-lg space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-accent" />
                <span className="font-semibold text-txt-primary">
                  {t('preview.editorialColTitle', 'Shoot-Titel & Redaktionelle Übersteuerung')}
                </span>
              </div>
              <input
                type="checkbox"
                id="toggle-editorial-override"
                checked={importEditorialEnabled}
                onChange={(e) => setImportEditorialEnabled(e.target.checked)}
                className="rounded accent-accent cursor-pointer"
              />
            </div>

            <p className="text-[11px] text-txt-tertiary">
              {t('preview.editorialDesc', 'Shoot-Titel, Beschreibung oder abweichende Urheberdaten setzen')}
            </p>

            <div className={`space-y-2 transition-opacity ${importEditorialEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div>
                <label className="text-[10px] text-txt-tertiary block mb-0.5">
                  {t('preview.shootTitleLabel', 'Titel / Event')}
                </label>
                <input
                  type="text"
                  value={importTitle}
                  onChange={(e) => setImportTitle(e.target.value)}
                  placeholder={t('preview.shootTitlePlaceholder', 'z. B. Sommerurlaub Schweden')}
                  className="w-full px-2.5 py-1.5 bg-app-panel border border-app-border rounded-md text-txt-primary text-xs placeholder:text-txt-tertiary/60 focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="text-[10px] text-txt-tertiary block mb-0.5">
                  {t('preview.shootDescLabel', 'Beschreibung')}
                </label>
                <input
                  type="text"
                  value={importDescription}
                  onChange={(e) => setImportDescription(e.target.value)}
                  placeholder={t('preview.shootDescPlaceholder', 'Optionale Beschreibung zum Shoot')}
                  className="w-full px-2.5 py-1.5 bg-app-panel border border-app-border rounded-md text-txt-primary text-xs placeholder:text-txt-tertiary/60 focus:outline-none focus:border-accent"
                />
              </div>

              {/* Optional Divergent Artist / Copyright / License */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-app-border/40">
                <div>
                  <label className="text-[10px] text-txt-tertiary block mb-0.5">
                    {t('preview.artistOverrideLabel', 'Fotograf (abweichend)')}
                  </label>
                  <input
                    type="text"
                    value={importArtistOverride}
                    onChange={(e) => setImportArtistOverride(e.target.value)}
                    placeholder={defaultArtist || t('editorial.artistPlaceholder', 'Max Mustermann')}
                    className="w-full px-2 py-1 bg-app-panel border border-app-border rounded text-txt-primary text-[11px] placeholder:text-txt-tertiary/60 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-txt-tertiary block mb-0.5">
                    {t('preview.copyrightOverrideLabel', 'Copyright (abweichend)')}
                  </label>
                  <input
                    type="text"
                    value={importCopyrightOverride}
                    onChange={(e) => setImportCopyrightOverride(e.target.value)}
                    placeholder={defaultCopyright || '© {year} Name'}
                    className="w-full px-2 py-1 bg-app-panel border border-app-border rounded text-txt-primary text-[11px] font-mono placeholder:text-txt-tertiary/60 focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-txt-tertiary block mb-0.5">
                    {t('preview.usageTermsOverrideLabel', 'Nutzungsbedingungen / Lizenz (abweichend)')}
                  </label>
                  <input
                    type="text"
                    value={importUsageTermsOverride}
                    onChange={(e) => setImportUsageTermsOverride(e.target.value)}
                    placeholder={defaultUsageTerms || t('editorial.usageTermsPlaceholder', 'CC-BY 4.0')}
                    className="w-full px-2 py-1 bg-app-panel border border-app-border rounded text-txt-primary text-[11px] placeholder:text-txt-tertiary/60 focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
