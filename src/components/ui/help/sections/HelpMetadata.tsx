import { useTranslation } from 'react-i18next';
import { SectionHeading, TipBox, InfoBox, FeatureCard } from '../HelpShared';
import { Tag, MapPin, Camera, FileCode, Copyright, Calendar } from 'lucide-react';

export function HelpMetadata() {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title={
          isEn
            ? 'Metadata, Rights, Dates & GPS'
            : 'Metadaten, Rechte, Datum & GPS'
        }
        subtitle={
          isEn
            ? 'EXIF camera parameters, editorial metadata & rights, non-destructive capture date correction, interactive OpenStreetMap geotagging, and batch tags — synchronized in .rrdata and XMP sidecars.'
            : 'EXIF-Kameradaten, redaktionelle Metadaten & Rechte, zerstörungsfreie Aufnahmedatum-Korrektur, interaktives OpenStreetMap-Geotagging und Batch-Tags – synchron gesichert in .rrdata- und XMP-Sidecars.'
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <FeatureCard
          icon={<Camera className="w-4 h-4" />}
          title={isEn ? 'File Inspector (Right Sidebar)' : 'Der Datei-Inspektor (Rechte Leiste)'}
        >
          {isEn
            ? 'On the right side you will find all photographic parameters at a glance: camera model, lens name, aperture, shutter speed, ISO sensitivity, focal length, and capture date.'
            : 'Auf der rechten Seite findest Du alle fotografischen Parameter auf einen Blick: Kameramodell, Objektivbezeichnung, Blende, Verschlusszeit, ISO-Empfindlichkeit, Brennweite und Aufnahmezeitpunkt.'}
        </FeatureCard>

        <FeatureCard
          icon={<Tag className="w-4 h-4" />}
          title={isEn ? 'Keywords (Batch Tagging)' : 'Stichwörter (Batch-Tagging)'}
        >
          {isEn
            ? 'Manage tags quickly and easily. When multiple photos are selected in the grid, type a new tag and press Enter to apply it to all selected images simultaneously.'
            : 'Verwalte Schlagwörter schnell und übersichtlich. Markierst Du mehrere Bilder im Raster, kannst Du ein neues Tag eingeben und es mit Enter gleichzeitig auf alle markierten Fotos anwenden.'}
        </FeatureCard>

        <FeatureCard
          icon={<MapPin className="w-4 h-4" />}
          title={isEn ? 'GPS & Interactive Map' : 'GPS & Interaktive Karte'}
        >
          {isEn ? (
            <>
              Expand the separate <strong>OpenStreetMap mini-map preview</strong> directly inside the Inspector (with zoom controls and offline fallback). Click the mini-map to open the <strong>internal Map Viewer</strong>, switch seamlessly to <strong>Edit Location</strong>, or launch Google Maps / OpenStreetMap externally as configured in Settings. Click the pencil icon (<code>✏️</code>) to open the unified <strong>Location Editor</strong> with combined <strong>place search &amp; coordinate input</strong> (search cities, addresses, or POIs, or paste Google/Apple Maps links &amp; DMS/DD/DMM coordinates), a draggable map pin, <strong>multi-selection candidate pins</strong> for 1-click transfer across selected photos, and <strong>Remove GPS</strong>. Use the <strong>Copy Location</strong> button next to the coordinates to copy them to your clipboard.
            </>
          ) : (
            <>
              Klappe die separate <strong>OpenStreetMap-Mini-Karten-Vorschau</strong> direkt im Inspektor auf (inklusive Zoom-Buttons und Offline-Fallback). Ein Klick auf die Mini-Karte öffnet den <strong>internen Karten-Viewer</strong> mit nahtlosem Wechsel zu <strong>Standort bearbeiten</strong> oder dem externen Link zu Google Maps / OpenStreetMap (konfigurierbar in den Einstellungen). Über das Stift-Symbol (<code>✏️</code>) öffnest Du den <strong>Standort-Editor</strong> mit kombinierter <strong>Ortssuche &amp; Koordinatenzeile</strong> (Städte/Adressen/POIs suchen oder Google-/Apple-Maps-Links bzw. DMS/DD/DMM-Koordinaten einfügen), verschiebbarem Pin, <strong>Kandidaten-Pins bei Mehrfachauswahl</strong> zum 1-Klick-Übernehmen auf alle markierten Fotos sowie <strong>GPS entfernen</strong>. Über das <strong>Kopieren-Icon</strong> neben den Koordinaten kopierst Du sie direkt in der Zwischenablage.
            </>
          )}
        </FeatureCard>

        <FeatureCard
          icon={<Copyright className="w-4 h-4" />}
          title={isEn ? 'Editorial Metadata & Rights' : 'Redaktionelle Metadaten & Rechte'}
        >
          {isEn ? (
            <>
              Non-destructively edit <strong>Title</strong>, <strong>Description</strong>, <strong>Artist / Creator</strong>, <strong>Copyright</strong> (supporting the dynamic <code>{'{year}'}</code> macro), and <strong>Usage Terms</strong>—for single photos or entire batches (showing <code>&lt;different values&gt;</code> when mixed). Configure permanent defaults in <strong>Settings</strong> and optionally pre-fill them during <strong>Import Step 2</strong>.
            </>
          ) : (
            <>
              Bearbeite <strong>Titel</strong>, <strong>Beschreibung</strong>, <strong>Fotograf / Urheber</strong>, <strong>Copyright-Vermerk</strong> (mit dynamischem <code>{'{year}'}</code>-Makro) und <strong>Nutzungsrechte</strong> absolut zerstörungsfrei – einzeln oder im Batch (mit <code>&lt;unterschiedliche Werte&gt;</code>-Anzeige). Hinterlege dauerhafte Stammdaten in den <strong>Einstellungen</strong> und übernimm sie geschützt in <strong>Import Schritt 2</strong>.
            </>
          )}
        </FeatureCard>

        <FeatureCard
          icon={<Calendar className="w-4 h-4" />}
          title={isEn ? 'Capture Date Honesty & Archive Relocation' : 'Aufnahmedatum-Korrektur & Archiv-Umzug'}
        >
          {isEn ? (
            <>
              Correct missing or wrong capture dates non-destructively via <strong>Set Date (Scan)</strong> for analog scans or <strong>Time Shift (±)</strong> for out-of-sync multi-camera clocks—stored safely in <code>.rrdata</code> / <code>.xmp</code> sidecars without touching original files. With <strong>1-Click Archive Relocation</strong>, move corrected photos cleanly into their matching archive date folder.
            </>
          ) : (
            <>
              Korrigiere fehlende oder verstellte Aufnahmezeiten zerstörungsfrei über <strong>Datum setzen (Scan)</strong> für analoge Scans oder <strong>Zeitversatz (±)</strong> für asynchrone Kamerauhren – sicher gespeichert in <code>.rrdata</code>-/<code>.xmp</code>-Sidecars ohne Veränderung der Originaldateien. Per <strong>1-Klick-Archiv-Umzug</strong> verschiebst Du korrigierte Fotos direkt in den passenden Datumsordner.
            </>
          )}
        </FeatureCard>

        <FeatureCard
          icon={<FileCode className="w-4 h-4" />}
          title={isEn ? 'Industry Standard XMP & .rrdata Sidecars' : 'Industriestandard XMP & .rrdata Sidecars'}
        >
          {isEn ? (
            <>
              RapidReady features full bidirectional sidecar synchronization supporting both native <code>.rrdata</code> and industry-standard Adobe <code>.xmp</code> files. Ratings, color labels, orientation, flags, editorial fields, capture date overrides, and GPS coordinates are preserved non-destructively without touching existing RAW development parameters (such as Lightroom <code>crs:*</code> or darktable history). Automatic Single Source of Truth (SSoT) resolution relies on filesystem timestamps (<code>mtime</code>), ensuring seamless roundtrips across Adobe Lightroom, Capture One, darktable, and Bridge—including Olympus <code>.ORF</code> and Capture One <code>.DNG</code>.
            </>
          ) : (
            <>
              RapidReady bietet volle, bidirektionale Sidecar-Synchronisation sowohl für native <code>.rrdata</code>- als auch für Industriestandard-Adobe-<code>.xmp</code>-Dateien. Bewertungen, Farblabels, Bildorientierung, Flags, Redaktionsdaten, Datums-Korrekturen und GPS-Koordinaten werden absolut zerstörungsfrei gepatcht, ohne vorhandene RAW-Entwicklungsparameter (wie Lightroom <code>crs:*</code> oder darktable-Verlaufsstapel) zu verändern. Dank automatischer Single Source of Truth (SSoT) via Dateizeitstempel (<code>mtime</code>) arbeiten Adobe Lightroom, Capture One, darktable und Bridge nahtlos Hand in Hand – inklusive voller Unterstützung für Olympus <code>.ORF</code> und Capture One <code>.DNG</code>.
            </>
          )}
        </FeatureCard>
      </div>

      <TipBox
        title={
          isEn
            ? 'Seamless Integration with Lightroom, darktable & Capture One'
            : 'Nahtlose Zusammenarbeit mit Lightroom, darktable & Capture One'
        }
      >
        {isEn
          ? 'With configurable sidecar modes (RapidRAW, Dual-Sync, and Standard XMP) and naming conventions (STD vs DT), Adobe Lightroom, Adobe Bridge, Capture One, and darktable recognize your ratings, color codes, tags, rights, and GPS coordinates directly.'
          : 'Dank konfigurierbarer Sidecar-Modi (RapidRAW, Dual-Sync und Standard-XMP) sowie flexibler Dateinamenskonventionen (STD vs DT) erkennen Adobe Lightroom, Adobe Bridge, Capture One und darktable Deine vergebenen Sterne, Farbcodes, Stichwörter, Rechte und GPS-Daten sofort.'}
      </TipBox>

      <InfoBox
        title={
          isEn
            ? 'Fast Tag Filtering in Filter Bar'
            : 'Schnelle Tag-Filterung in der Filterleiste'
        }
      >
        {isEn
          ? 'Use the filter bar in the top center to filter your library by existing tags. Clicking a keyword instantly isolates all matching images.'
          : 'Über die Filterleiste oben in der Mitte kannst Du die Ansicht nach vorhandenen Tags filtern. Ein Klick auf ein Schlagwort isoliert sofort alle Bilder dieses Themas.'}
      </InfoBox>
    </div>
  );
}
