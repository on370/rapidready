import { useTranslation } from 'react-i18next';
import { useSettingsStore, getRawDeveloperDisplayName } from '../../../../stores/settingsStore';
import { SectionHeading, Kbd, TipBox, InfoBox, FeatureCard } from '../HelpShared';
import {
  Sliders,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  Layers,
  FolderDown,
  Monitor,
} from 'lucide-react';

export function HelpRawDevelopers() {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');
  const { rawDeveloper, customRawDeveloperPath, shortcutPreset, sidecarMode, xmpNaming } = useSettingsStore();

  const devName = getRawDeveloperDisplayName(rawDeveloper, customRawDeveloperPath, isEn);
  const isDarktablePreset = shortcutPreset === 'darktable';
  const openShortcutKeys = isDarktablePreset ? ['Shift', 'R'] : ['R'];

  const sidecarModeLabel =
    sidecarMode === 'rrdata'
      ? 'RapidRAW Native (.rrdata)'
      : sidecarMode === 'dual'
      ? 'Dual-Sync (.rrdata + .xmp)'
      : 'Standard XMP (.xmp)';

  const xmpNamingLabel =
    xmpNaming === 'darktable'
      ? 'darktable (DT): <file>.<ext>.xmp'
      : 'Standard (STD): <stem>.xmp';

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title={
          isEn
            ? 'RAW Developers & Workflow Integration'
            : 'RAW-Entwickler & Workflow-Integration'
        }
        subtitle={
          isEn
            ? 'Seamlessly connect RapidReady with RapidRAW, darktable, Adobe Lightroom Classic, Capture One, or your custom editor.'
            : 'Nahtlose Integration von RapidReady mit RapidRAW, darktable, Adobe Lightroom Classic, Capture One oder Deiner bevorzugten Software.'
        }
      />

      {/* Active Configuration Overview Card */}
      <div className="p-4 bg-app-card border border-app-border rounded-xl flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xs font-bold text-txt-primary uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-4 h-4 text-accent" />
            {isEn ? 'Current Integration Setup' : 'Aktuelle Integrationseinstellungen'}
          </h3>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-accent/15 text-accent font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            {devName}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <div className="p-2.5 bg-app-panel border border-app-border rounded-lg flex flex-col gap-1">
            <span className="text-[10px] text-txt-tertiary uppercase font-semibold">
              {isEn ? 'Target Developer' : 'Ziel-Entwickler'}
            </span>
            <span className="text-xs font-semibold text-txt-primary">{devName}</span>
          </div>

          <div className="p-2.5 bg-app-panel border border-app-border rounded-lg flex flex-col gap-1">
            <span className="text-[10px] text-txt-tertiary uppercase font-semibold">
              {isEn ? 'Open Shortcut' : 'Öffnen-Shortcut'}
            </span>
            <div className="flex items-center gap-1">
              <Kbd keys={openShortcutKeys} />
            </div>
          </div>

          <div className="p-2.5 bg-app-panel border border-app-border rounded-lg flex flex-col gap-1">
            <span className="text-[10px] text-txt-tertiary uppercase font-semibold">
              {isEn ? 'Sidecar Mode' : 'Sidecar-Modus'}
            </span>
            <span className="text-xs font-semibold text-txt-primary leading-tight">{sidecarModeLabel}</span>
          </div>

          <div className="p-2.5 bg-app-panel border border-app-border rounded-lg flex flex-col gap-1">
            <span className="text-[10px] text-txt-tertiary uppercase font-semibold">
              {isEn ? 'XMP Naming' : 'XMP-Benennung'}
            </span>
            <span className="text-xs font-semibold text-txt-primary leading-tight font-mono">{xmpNamingLabel}</span>
          </div>
        </div>
      </div>

      {/* Direct Handoff & Auto-Launch Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <FeatureCard
          icon={<ExternalLink className="w-4 h-4" />}
          title={isEn ? `Direct Handoff to ${devName}` : `Direktübergabe an ${devName}`}
        >
          {isEn ? (
            <>
              Press <Kbd keys={openShortcutKeys} /> at any time while viewing a photo in Grid, Loupe, or Full
              Window to immediately open it in <strong>{devName}</strong>. You can also right-click the photo
              or use the Export menu in the culling toolbar.
            </>
          ) : (
            <>
              Drücke jederzeit <Kbd keys={openShortcutKeys} />, während Du ein Foto im Raster, der Lupe oder dem
              Vollfenster betrachtest, um es sofort in <strong>{devName}</strong> zu öffnen. Alternativ steht Dir
              der Befehl im Kontextmenü (Rechtsklick) sowie im Teilen-/Export-Menü zur Verfügung.
            </>
          )}
        </FeatureCard>

        <FeatureCard
          icon={<FolderDown className="w-4 h-4" />}
          title={isEn ? 'Direct Launch on Import Completion' : 'Direktstart nach Import-Abschluss'}
        >
          {isEn ? (
            <>
              When importing new media, RapidReady provides a convenient one-click action on the completion
              screen to open the newly imported destination folder directly in <strong>{devName}</strong>.
            </>
          ) : (
            <>
              Beim Importieren neuer Medien bietet RapidReady auf dem Abschlussbildschirm einen bequemen
              1-Klick-Button, um den neu importierten Zielordner sofort in <strong>{devName}</strong> zu öffnen.
            </>
          )}
        </FeatureCard>
      </div>

      {/* Recommended Setups for Developers */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-bold text-txt-primary uppercase tracking-wider flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent" />
          {isEn
            ? 'Recommended Setup by Application'
            : 'Empfohlene Konfigurationen nach Anwendung'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* RapidRAW */}
          <div className="p-3.5 bg-app-card border border-app-border rounded-xl flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-txt-primary flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" /> RapidRAW
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-400/10 text-amber-400 font-mono">
                Native
              </span>
            </div>
            <p className="text-[11px] text-txt-secondary leading-relaxed">
              {isEn
                ? 'High-performance RAW editor perfectly paired with RapidReady.'
                : 'Hochperformanter RAW-Entwickler, optimal abgestimmt auf RapidReady.'}
            </p>
            <div className="text-[11px] space-y-1.5 pt-1 border-t border-app-border/60">
              <div className="flex items-center justify-between text-txt-secondary">
                <span>{isEn ? 'Sidecar Mode:' : 'Sidecar-Modus:'}</span>
                <span className="font-medium text-txt-primary">.rrdata {isEn ? 'or' : 'oder'} Dual</span>
              </div>
              <div className="flex items-center justify-between text-txt-secondary">
                <span>{isEn ? 'XMP Naming:' : 'XMP-Benennung:'}</span>
                <span className="font-medium text-txt-primary">Standard (STD)</span>
              </div>
              <div className="flex items-center justify-between text-txt-secondary">
                <span>{isEn ? 'Shortcut Preset:' : 'Tastenbelegung:'}</span>
                <span className="font-medium text-txt-primary">Lightroom (<Kbd keys={['R']} />)</span>
              </div>
            </div>
          </div>

          {/* darktable */}
          <div className="p-3.5 bg-app-card border border-app-border rounded-xl flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-txt-primary flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> darktable
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-400/10 text-emerald-400 font-mono">
                Open Source
              </span>
            </div>
            <p className="text-[11px] text-txt-secondary leading-relaxed">
              {isEn
                ? 'Powerful open-source RAW workflow with dedicated per-extension sidecars.'
                : 'Mächtiger Open-Source-RAW-Workflow mit dateiendungsspezifischen Sidecars.'}
            </p>
            <div className="text-[11px] space-y-1.5 pt-1 border-t border-app-border/60">
              <div className="flex items-center justify-between text-txt-secondary">
                <span>{isEn ? 'Sidecar Mode:' : 'Sidecar-Modus:'}</span>
                <span className="font-medium text-txt-primary">Standard XMP {isEn ? 'or' : 'oder'} Dual</span>
              </div>
              <div className="flex items-center justify-between text-txt-secondary">
                <span>{isEn ? 'XMP Naming:' : 'XMP-Benennung:'}</span>
                <span className="font-medium text-txt-primary font-mono text-[10px]">DT (&lt;file&gt;.&lt;ext&gt;.xmp)</span>
              </div>
              <div className="flex items-center justify-between text-txt-secondary">
                <span>{isEn ? 'Shortcut Preset:' : 'Tastenbelegung:'}</span>
                <span className="font-medium text-txt-primary">darktable (<Kbd keys={['Shift', 'R']} />)</span>
              </div>
            </div>
          </div>

          {/* Adobe Lightroom Classic & Capture One */}
          <div className="p-3.5 bg-app-card border border-app-border rounded-xl flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-txt-primary flex items-center gap-1.5">
                <Monitor className="w-4 h-4 text-sky-400" /> Lightroom / C1
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-sky-400/10 text-sky-400 font-mono">
                Industry Std
              </span>
            </div>
            <p className="text-[11px] text-txt-secondary leading-relaxed">
              {isEn
                ? 'Adobe Lightroom Classic, Camera Raw, Bridge, and Capture One.'
                : 'Adobe Lightroom Classic, Camera Raw, Bridge und Capture One.'}
            </p>
            <div className="text-[11px] space-y-1.5 pt-1 border-t border-app-border/60">
              <div className="flex items-center justify-between text-txt-secondary">
                <span>{isEn ? 'Sidecar Mode:' : 'Sidecar-Modus:'}</span>
                <span className="font-medium text-txt-primary">Standard XMP {isEn ? 'or' : 'oder'} Dual</span>
              </div>
              <div className="flex items-center justify-between text-txt-secondary">
                <span>{isEn ? 'XMP Naming:' : 'XMP-Benennung:'}</span>
                <span className="font-medium text-txt-primary font-mono text-[10px]">STD (&lt;stem&gt;.xmp)</span>
              </div>
              <div className="flex items-center justify-between text-txt-secondary">
                <span>{isEn ? 'Shortcut Preset:' : 'Tastenbelegung:'}</span>
                <span className="font-medium text-txt-primary">Lightroom (<Kbd keys={['R']} />)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* darktable library.db sync note */}
      <InfoBox
        title={
          isEn
            ? 'darktable Integration Details (library.db & XMP Reload)'
            : 'darktable-Integrationshinweise (library.db & XMP-Abgleich)'
        }
      >
        {isEn ? (
          <>
            darktable caches image metadata in its internal database (<code>library.db</code>). When you modify ratings, flags, or color tags in RapidReady for photos already imported into darktable:
            <ul className="list-disc list-inside mt-1.5 space-y-1 text-[11px]">
              <li>
                <strong>Automatic startup synchronization:</strong> In darktable, go to <em>Settings &gt; Storage</em> and enable <em>&quot;Look for updated xmp files on startup&quot;</em>.
              </li>
              <li>
                <strong>Manual reload:</strong> In darktable&apos;s Lighttable view, select photos and choose <em>History stack &gt; Load sidecar file</em> or <em>Selected images &gt; Refresh XMP</em>.
              </li>
              <li>
                <strong>Color tags &amp; ratings:</strong> RapidReady natively maps darktable color labels (<code>&lt;darktable:colorlabels&gt;</code>) and hierarchical tags (<code>&lt;lr:hierarchicalSubject&gt;</code>) without losing development stacks.
              </li>
              <li>
                <strong>Why do some photos from darktable automatically show 1 star?</strong> By default, darktable assigns 1 star (<code>xmp:Rating=&quot;1&quot;</code>) to every image on import. You can disable this permanently in darktable under <em>Preferences &gt; Import &gt; &apos;Initial import rating: 0&apos;</em> (or reset ratings in RapidReady via <Kbd keys={['Cmd', 'A']} /> and pressing <Kbd keys={['0']} />).
              </li>
            </ul>
          </>
        ) : (
          <>
            darktable puffert Metadaten in seiner internen Datenbank (<code>library.db</code>). Wenn Du in RapidReady Bewertungen, Auswahlen oder Farblabels für Fotos änderst, die bereits in darktable vorhanden sind:
            <ul className="list-disc list-inside mt-1.5 space-y-1 text-[11px]">
              <li>
                <strong>Automatischer Startabgleich:</strong> Aktiviere in darktable unter <em>Einstellungen &gt; Speicher</em> die Option <em>„Nach aktualisierten XMP-Dateien beim Start suchen“</em>.
              </li>
              <li>
                <strong>Manuelles Neuladen:</strong> Wähle im Leuchttisch von darktable die Fotos aus und klicke auf <em>Verlaufsstapel &gt; Begleitdatei laden</em> oder <em>Ausgewählte Bilder &gt; XMP-Dateien aktualisieren</em>.
              </li>
              <li>
                <strong>Farbetiketten &amp; Bewertungen:</strong> RapidReady schreibt und liest darktables Farbetiketten (<code>&lt;darktable:colorlabels&gt;</code>) sowie hierarchische Stichwörter (<code>&lt;lr:hierarchicalSubject&gt;</code>) vollkommen verlustfrei.
              </li>
              <li>
                <strong>Warum zeigen manche Fotos aus darktable automatisch 1 Stern?</strong> darktable vergibt beim Import standardmäßig jedem Bild 1 Stern (<code>xmp:Rating=&quot;1&quot;</code>). Du kannst dies in darktable unter <em>Einstellungen &gt; Import &gt; ‚Anfängliche Bewertung beim Import: 0‘</em> dauerhaft abschalten (oder in RapidReady per <Kbd keys={['Cmd', 'A']} /> und Taste <Kbd keys={['0']} /> zurücksetzen).
              </li>
            </ul>
          </>
        )}
      </InfoBox>

      {/* Custom Application & System Default */}
      <TipBox
        title={
          isEn
            ? 'Custom Applications & System Default'
            : 'Eigene Applikationen & System-Standard'
        }
      >
        {isEn ? (
          <>
            You can configure RapidReady to open photos in any application of your choice (such as DxO PhotoLab, Capture One, Affinity Photo, or RawTherapee) by selecting <strong>&quot;Custom App…&quot;</strong> in Settings. Alternatively, choose <strong>&quot;System Default&quot;</strong> to delegate image opening to your operating system&apos;s registered default RAW viewer.
          </>
        ) : (
          <>
            Du kannst RapidReady so konfigurieren, dass Fotos in jeder beliebigen Software geöffnet werden (z. B. DxO PhotoLab, Capture One, Affinity Photo oder RawTherapee), indem Du in den Einstellungen <strong>„Eigene App…“</strong> wählst. Alternativ kannst Du mit <strong>„System-Standard“</strong> festlegen, dass das vom Betriebssystem registrierte Standardprogramm für RAW-Dateien gestartet wird.
          </>
        )}
      </TipBox>
    </div>
  );
}
