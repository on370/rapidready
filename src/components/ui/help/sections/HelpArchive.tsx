import { useTranslation } from 'react-i18next';
import { SectionHeading, Kbd, TipBox, FeatureCard } from '../HelpShared';
import { Zap, Database, RefreshCw, RotateCw, Server, FolderSync } from 'lucide-react';

export function HelpArchive() {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title={
          isEn
            ? 'Archive, Scanning & High-Speed Cache'
            : 'Archiv, Scan & High-Speed-Cache'
        }
        subtitle={
          isEn
            ? 'Understand RapidReady\'s two-phase architecture, background SSD caching, and smart archive synchronization.'
            : 'Verstehe RapidReadys zweistufige Architektur, den SSD-Cache und die Synchronisierungs-Optionen des Archivs.'
        }
      />

      {/* Two-Phase Architecture */}
      <div className="p-4 bg-app-card border border-app-border rounded-xl flex flex-col gap-3">
        <h3 className="text-xs font-bold text-txt-primary uppercase tracking-wider flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" />
          {isEn
            ? 'Two-Phase Architecture (Discovery vs. Caching)'
            : 'Zweistufige Architektur (Dateiscan vs. Cache-Aufbau)'}
        </h3>
        <p className="text-xs text-txt-secondary leading-relaxed">
          {isEn
            ? 'RapidReady decouples file discovery from thumbnail rendering so you never have to wait before you can start culling:'
            : 'RapidReady trennt die Dateierfassung strikt vom Rendern der Vorschaubilder, damit Du ohne Wartezeit sofort mit dem Sichten beginnen kannst:'}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div className="p-3 bg-app-panel border border-app-border rounded-lg flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="font-semibold text-accent text-xs">
                {isEn
                  ? 'Phase 1: Instant File Discovery'
                  : 'Phase 1: Blitzschneller Dateiscan'}
              </span>
            </div>
            <p className="text-[11px] text-txt-secondary leading-relaxed">
              {isEn
                ? 'RapidReady scans your directories at maximum storage speed. Discovered photos appear in the grid immediately and can be reviewed, flagged, and rated right away while the scanner continues in the background.'
                : 'RapidReady liest Verzeichnisse rasend schnell ein. Gefundene Fotos erscheinen sofort im Grid und können sofort gesichtet, bewertet und markiert werden, noch während der Scanner im Hintergrund weiterläuft.'}
            </p>
          </div>

          <div className="p-3 bg-app-panel border border-app-border rounded-lg flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="font-semibold text-amber-300 text-xs">
                {isEn
                  ? 'Phase 2: Local High-Speed SSD Cache'
                  : 'Phase 2: Lokaler SSD-Cache'}
              </span>
            </div>
            <p className="text-[11px] text-txt-secondary leading-relaxed">
              {isEn ? (
                <>
                  In the background, high-resolution preview thumbnails and EXIF metadata are indexed into a local SQLite database on your internal SSD. Once cached, subsequent launches are instantaneous and grid scrolling maintains 60–120 FPS — <strong>even if your NAS is asleep or an external drive is disconnected</strong>.
                </>
              ) : (
                <>
                  Parallel werden hochauflösende Thumbnails und EXIF-Metadaten auf die lokale interne SSD in eine SQLite-Datenbank geschrieben. Das dauert beim ersten Mal auf großen RAW-Archiven etwas, sorgt aber dafür, dass spätere Starts verzögerungsfrei sind und das Scrollen mit 60–120 FPS funktioniert – <strong>selbst wenn das NAS im Ruhezustand schläft oder die externe Platte getrennt ist</strong>.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* The Sync & Refresh Menu */}
      <div className="flex flex-col gap-2.5">
        <h3 className="text-xs font-bold text-txt-primary uppercase tracking-wider flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-accent" />
          {isEn
            ? 'Archive Refresh & Sync Menu'
            : 'Das Aktualisierungs-Menü'}
        </h3>
        <p className="text-xs text-txt-secondary leading-relaxed">
          {isEn
            ? 'Click the circular refresh icon next to ARCHIVE in the left sidebar to access specific update modes:'
            : 'Über das kreisförmige Symbol neben ARCHIV in der linken Seitenleiste stehen drei gezielte Aktualisierungs-Aktionen bereit:'}
        </p>

        <div className="grid grid-cols-1 gap-2.5 pt-1">
          <FeatureCard
            icon={<FolderSync className="w-4 h-4" />}
            title={
              isEn
                ? 'Refresh Current Folder'
                : 'Aktuellen Ordner aktualisieren'
            }
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-txt-primary">
                  {isEn ? 'Shortcut:' : 'Tastaturbefehl:'}
                </span>
                <Kbd keys={['F5']} />
              </div>
              <p className="text-[11px] text-txt-secondary leading-relaxed">
                {isEn
                  ? 'Checks only the currently viewed folder for new, modified, or deleted files (e.g. right after exporting or copying new shots into that folder).'
                  : 'Prüft nur den momentan geöffneten Ordner auf neue oder gelöschte Dateien (z. B. wenn gerade ein Karten-Export hineinkopiert wurde).'}
              </p>
            </div>
          </FeatureCard>

          <FeatureCard
            icon={<RotateCw className="w-4 h-4" />}
            title={
              isEn
                ? 'Synchronize Entire Archive (Delta Sync)'
                : 'Gesamtes Archiv synchronisieren (Delta-Sync)'
            }
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-txt-primary">
                  {isEn ? 'Shortcut:' : 'Tastaturbefehl:'}
                </span>
                <Kbd keys={['Shift', 'F5']} />
              </div>
              <p className="text-[11px] text-txt-secondary leading-relaxed">
                {isEn
                  ? 'A fast delta sync across your entire archive tree. Reconciles directory changes, new photos, and deleted items without re-rendering existing cached thumbnails.'
                  : 'Schneller Delta-Sync über das gesamte Archiv. Gleicht Dateiänderungen, neue Fotos und gelöschte Dateien ab, ohne bestehende Thumbnails neu zu rendern.'}
              </p>
            </div>
          </FeatureCard>

          <FeatureCard
            icon={<Database className="w-4 h-4" />}
            title={
              isEn
                ? 'Completely Rebuild Archive Index & Cache...'
                : 'Archiv-Index & Cache vollständig neu aufbauen...'
            }
          >
            <p className="text-[11px] text-txt-secondary leading-relaxed">
              {isEn
                ? 'Purges the local database and rebuilds all index entries and thumbnails from scratch. Recommended if files were reorganized outside RapidReady or after resolving disk corruption.'
                : 'Bereinigt den Cache komplett und baut Index sowie Vorschauen von Grund auf neu auf (z. B. bei Dateibeschädigungen oder umfassender externer Reorganisation).'}
            </p>
          </FeatureCard>
        </div>
      </div>

      {/* NAS Pro-Tip */}
      <TipBox
        title={
          isEn
            ? 'Optimized for NAS & Network Drives'
            : 'Praxis-Tipp für NAS- & Netzwerkspeicher'
        }
      >
        <div className="flex items-start gap-2.5">
          <Server className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
          <p>
            {isEn
              ? 'By separating file discovery and caching all thumbnails onto your local internal SSD, RapidReady eliminates network bottlenecks. Once cached, scrolling through your library is buttery-smooth with zero network latency — and your NAS drives won\'t have to spin up for every single image you view.'
              : 'Durch die Trennung in schnellen Dateiscan und die lokale SSD-Speicherung aller Thumbnails ist RapidReady ideal für langsame NAS-Verbindungen. Nach dem Cache-Aufbau scrollst Du absolut flüssig ohne Netzwerklatenz durch Tausende Bilder — und das NAS muss beim Scrollen nicht mehr für jedes einzelne Foto aufgeweckt werden.'}
          </p>
        </div>
      </TipBox>
    </div>
  );
}
