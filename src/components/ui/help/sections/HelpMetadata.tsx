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
          title={isEn ? 'Industry Standard XMP Sidecars' : 'Industriestandard XMP-Sidecars'}
          badge={isEn ? 'Coming Soon' : 'In Vorbereitung'}
        >
          {isEn ? (
            <>
              Ratings, color labels, and keywords are currently managed without delay in RapidReady&apos;s local high-speed database. Direct, bidirectional synchronization with standard <code>.xmp</code> sidecar files for seamless exchange with Lightroom, Capture One, and RapidRAW is currently in preparation and will arrive in an upcoming update.
            </>
          ) : (
            <>
              Bewertungen, Farblabels und Stichwörter werden aktuell verzögerungsfrei in RapidReadys lokaler Hochgeschwindigkeits-Datenbank verwaltet. Die direkte, bidirektionale Synchronisation in standards-konforme <code>.xmp</code>-Dateien für den nahtlosen Austausch mit Lightroom, Capture One und RapidRAW befindet sich in Vorbereitung und folgt in einem kommenden Update.
            </>
          )}
        </FeatureCard>
      </div>

      <TipBox
        title={
          isEn
            ? 'Seamless Integration with Lightroom & Capture One'
            : 'Nahtlose Zusammenarbeit mit Lightroom & Capture One'
        }
      >
        {isEn
          ? 'With the upcoming XMP sidecar update, Adobe Lightroom, Adobe Bridge, Capture One, and RapidRAW will automatically recognize your star ratings, color codes, and tags as soon as you open the folders.'
          : 'Mit dem bevorstehenden XMP-Sidecar-Update werden Adobe Lightroom, Adobe Bridge, Capture One und RapidRAW Deine vergebenen Sterne, Farbcodes und Stichwörter automatisch erkennen, sobald Du die Ordner dort öffnest.'}
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
