import { useTranslation } from 'react-i18next';
import { SectionHeading, TipBox, InfoBox, FeatureCard } from '../HelpShared';
import { Tag, MapPin, Camera, FileCode } from 'lucide-react';

export function HelpMetadata() {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title={
          isEn
            ? 'Metadata, Keywords (Tags) & GPS'
            : 'Metadaten, Stichwörter (Tags) & GPS'
        }
        subtitle={
          isEn
            ? 'Comprehensive EXIF camera parameters, geolocation mapping, and batch tag management — synchronized in standard XMP sidecars.'
            : 'Umfassende EXIF-Kameradaten, Geokoordinaten einsehen und Tags im Batch-Verfahren verwalten – synchron gesichert in XMP-Sidecars.'
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
          title={isEn ? 'GPS Location Coordinates' : 'GPS-Standortdaten'}
        >
          {isEn
            ? 'Photos with embedded geolocation show latitude and longitude directly in the inspector. Click the map link to open the exact shooting location in your web browser.'
            : 'Fotos mit integrierten Geodaten zeigen Breiten- und Längengrad direkt im Inspektor an. Über den Karten-Link kannst Du den exakten Aufnahmeort in Deinem Webbrowser aufrufen.'}
        </FeatureCard>

        <FeatureCard
          icon={<FileCode className="w-4 h-4" />}
          title={isEn ? 'Industry Standard XMP & .rrdata Sidecars' : 'Industriestandard XMP & .rrdata Sidecars'}
        >
          {isEn ? (
            <>
              RapidReady features full bidirectional sidecar synchronization supporting both native <code>.rrdata</code> and industry-standard Adobe <code>.xmp</code> files. Ratings, color labels, orientation, flags, and GPS coordinates are preserved non-destructively without touching existing RAW development parameters (such as Lightroom <code>crs:*</code> or darktable history). Automatic Single Source of Truth (SSoT) resolution relies on filesystem timestamps (<code>mtime</code>), ensuring seamless roundtrips across Adobe Lightroom, Capture One, darktable, and Bridge—including Olympus <code>.ORF</code> and Capture One <code>.DNG</code>.
            </>
          ) : (
            <>
              RapidReady bietet volle, bidirektionale Sidecar-Synchronisation sowohl für native <code>.rrdata</code>- als auch für Industriestandard-Adobe-<code>.xmp</code>-Dateien. Bewertungen, Farblabels, Bildorientierung, Flags und GPS-Koordinaten werden absolut zerstörungsfrei gepatcht, ohne vorhandene RAW-Entwicklungsparameter (wie Lightroom <code>crs:*</code> oder darktable-Verlaufsstapel) zu verändern. Dank automatischer Single Source of Truth (SSoT) via Dateizeitstempel (<code>mtime</code>) arbeiten Adobe Lightroom, Capture One, darktable und Bridge nahtlos Hand in Hand – inklusive voller Unterstützung für Olympus <code>.ORF</code> und Capture One <code>.DNG</code>.
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
          ? 'With configurable sidecar modes (RapidRAW, Dual-Sync, and Standard XMP) and naming conventions (STD vs DT), Adobe Lightroom, Adobe Bridge, Capture One, and darktable recognize your ratings, color codes, tags, and GPS coordinates directly.'
          : 'Dank konfigurierbarer Sidecar-Modi (RapidRAW, Dual-Sync und Standard-XMP) sowie flexibler Dateinamenskonventionen (STD vs DT) erkennen Adobe Lightroom, Adobe Bridge, Capture One und darktable Deine vergebenen Sterne, Farbcodes, Stichwörter und GPS-Daten sofort.'}
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
