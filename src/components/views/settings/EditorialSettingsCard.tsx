import { useTranslation } from "react-i18next";
import { FileText, ShieldCheck } from "lucide-react";
import { useSettingsStore } from "../../../stores/settingsStore";

export function EditorialSettingsCard() {
  const { t } = useTranslation('settings');
  const {
    defaultArtist,
    setDefaultArtist,
    defaultCopyright,
    setDefaultCopyright,
    defaultUsageTerms,
    setDefaultUsageTerms,
    autoApplyEditorialOnImport,
    setAutoApplyEditorialOnImport,
  } = useSettingsStore();

  const currentYear = new Date().getFullYear().toString();
  const copyrightPreview = defaultCopyright ? defaultCopyright.replace(/\{year\}/g, currentYear) : '';

  const handleInsertYear = () => {
    const macro = '{year}';
    if (!defaultCopyright.includes(macro)) {
      setDefaultCopyright(defaultCopyright ? `${defaultCopyright} © {year}` : '© {year} ');
    } else {
      setDefaultCopyright(`${defaultCopyright} {year}`);
    }
  };

  return (
    <div className="bg-app-card border border-app-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-app-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-txt-secondary" />
          <div>
            <h3 className="text-sm font-semibold text-txt-primary">
              {t('editorial.title', 'Standard-Metadaten & Urheberrecht (Import-Vorbelegung)')}
            </h3>
            <p className="text-xs text-txt-secondary mt-0.5">
              {t('editorial.subtitle', 'Automatische Stammdaten für neue Importe und Sidecars')}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4 text-xs">
        {/* Toggle autoApplyEditorialOnImport */}
        <div className="flex items-center justify-between py-1">
          <div className="space-y-0.5">
            <span className="font-medium text-txt-primary">
              {t('editorial.autoApplyLabel', 'Beim Import automatisch in Sidecars eintragen')}
            </span>
            <p className="text-txt-tertiary text-[11px]">
              {t('editorial.autoApplyDesc', 'Schreibt Urheber- und Lizenzdaten bei jedem Import direkt in .rrdata / .xmp Sidecars')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoApplyEditorialOnImport}
            onClick={() => setAutoApplyEditorialOnImport(!autoApplyEditorialOnImport)}
            className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
              autoApplyEditorialOnImport ? 'bg-accent' : 'bg-app-border'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                autoApplyEditorialOnImport ? 'left-4.5' : 'left-1'
              }`}
            />
          </button>
        </div>

        {/* Inputs */}
        <div className={`space-y-3 pt-2 border-t border-app-border/40 transition-opacity ${autoApplyEditorialOnImport ? 'opacity-100' : 'opacity-50'}`}>
          {/* Artist */}
          <div className="space-y-1">
            <label className="text-txt-secondary block font-medium">
              {t('editorial.artistLabel', 'Fotograf / Urheber')}
            </label>
            <input
              type="text"
              value={defaultArtist}
              onChange={(e) => setDefaultArtist(e.target.value)}
              placeholder={t('editorial.artistPlaceholder', 'z. B. Max Mustermann')}
              className="w-full px-3 py-1.5 bg-app-panel border border-app-border rounded-lg text-txt-primary text-xs placeholder:text-txt-tertiary focus:outline-none focus:border-accent"
            />
          </div>

          {/* Copyright with {year} chip & Live preview */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-txt-secondary font-medium">
                {t('editorial.copyrightLabel', 'Copyright-Vermerk')}
              </label>
              <button
                type="button"
                onClick={handleInsertYear}
                className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent hover:bg-accent/25 transition-colors font-mono cursor-pointer"
                title={t('editorial.yearChipTooltip', 'Fügt den dynamischen Platzhalter {year} ein')}
              >
                + {'{year}'}
              </button>
            </div>
            <input
              type="text"
              value={defaultCopyright}
              onChange={(e) => setDefaultCopyright(e.target.value)}
              placeholder="z. B. © {year} Max Mustermann. Alle Rechte vorbehalten."
              className="w-full px-3 py-1.5 bg-app-panel border border-app-border rounded-lg text-txt-primary text-xs font-mono placeholder:text-txt-tertiary focus:outline-none focus:border-accent"
            />
            {defaultCopyright.includes('{year}') && (
              <p className="text-[11px] text-accent/80 font-mono pl-1">
                {t('editorial.previewPrefix', 'Vorschau')}: {copyrightPreview}
              </p>
            )}
          </div>

          {/* Usage Terms */}
          <div className="space-y-1">
            <label className="text-txt-secondary block font-medium">
              {t('editorial.usageTermsLabel', 'Nutzungsbedingungen / Lizenz')}
            </label>
            <input
              type="text"
              value={defaultUsageTerms}
              onChange={(e) => setDefaultUsageTerms(e.target.value)}
              placeholder={t('editorial.usageTermsPlaceholder', 'z. B. CC-BY 4.0 oder Nicht-kommerzielle Nutzung')}
              className="w-full px-3 py-1.5 bg-app-panel border border-app-border rounded-lg text-txt-primary text-xs placeholder:text-txt-tertiary focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Non-destructive guarantee note */}
        <div className="flex items-start gap-2 p-2.5 bg-app-panel/60 border border-app-border/60 rounded-lg text-txt-tertiary text-[11px]">
          <ShieldCheck className="w-4 h-4 text-accent/80 flex-shrink-0 mt-0.5" />
          <span>
            {t(
              'editorial.guaranteeNote',
              'Diese Stammdaten werden beim Import automatisch in die Sidecar-Dateien (.rrdata / .xmp) geschrieben. Kamera-Originale bleiben unangetastet.'
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
