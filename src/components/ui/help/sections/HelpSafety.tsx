import { useTranslation } from 'react-i18next';
import { SectionHeading, Kbd, TipBox, InfoBox, FeatureCard } from '../HelpShared';
import { Trash2, ShieldAlert, Sparkles, FolderSearch } from 'lucide-react';

export function HelpSafety() {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title={
          isEn
            ? 'File Management, Safety & RAW Link'
            : 'Dateiverwaltung, Sicherheit & RAW-Link'
        }
        subtitle={
          isEn
            ? 'Safety guardrails preventing data loss, native operating system trash, and seamless handover to RapidRAW.'
            : 'Sicherheits-Guardrails vor Datenverlust, echter Betriebssystem-Papierkorb und nahtlose Übergabe an RapidRAW.'
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <FeatureCard
          icon={<Trash2 className="w-4 h-4" />}
          title={isEn ? 'True System Recycle Bin' : 'Echter System-Papierkorb'}
        >
          {isEn
            ? 'When you delete photos or folders in RapidReady, they are never irrevocably purged from disk. Instead, RAW files, JPEGs, and their XMP sidecars are moved to your operating system trash (Windows Recycle Bin or macOS Trash).'
            : 'Wenn Du Fotos oder Ordner in RapidReady löschst, werden sie nicht unwiderruflich von der Festplatte getilgt. Stattdessen wandern die RAW-Dateien, JPEGs und ihre XMP-Sidecars in den regulären Papierkorb Deines Betriebssystems (Windows Papierkorb bzw. macOS Trash).'}
        </FeatureCard>

        <FeatureCard
          icon={<ShieldAlert className="w-4 h-4" />}
          title={isEn ? 'Safety Guardrails' : 'Sicherheits-Guardrails'}
        >
          {isEn
            ? 'Before any delete operation, RapidReady checks whether the path is a protected system directory (e.g. Desktop, Documents, root drive, or Windows folders). Such locations can never be deleted by accident.'
            : 'RapidReady prüft vor jedem Löschvorgang, ob es sich um geschützte Systemordner (z. B. Desktop, Dokumente, Stammverzeichnisse oder Windows-Ordner) handelt. Solche Pfade können niemals versehentlich gelöscht werden.'}
        </FeatureCard>

        <FeatureCard
          icon={<Sparkles className="w-4 h-4" />}
          title={isEn ? 'Direct Link to RapidRAW' : 'Direktlink zu RapidRAW'}
        >
          {isEn ? (
            <>
              Press <Kbd keys={['R']} /> at any time to open the currently selected photo directly in the
              powerful RAW developer RapidRAW for seamless editing.
            </>
          ) : (
            <>
              Drücke jederzeit die Taste <Kbd keys={['R']} />, um das aktuell ausgewählte Foto sofort im
              leistungsfähigen RAW-Entwickler RapidRAW zu öffnen und nahtlos weiterzubearbeiten.
            </>
          )}
        </FeatureCard>

        <FeatureCard
          icon={<FolderSearch className="w-4 h-4" />}
          title={isEn ? 'Show in Explorer / Finder' : 'Im Explorer / Finder anzeigen'}
        >
          {isEn ? (
            <>
              Press <Kbd keys={['Cmd', 'Shift', 'F']} /> (or right-click) to open your system file manager
              with the selected photo pre-highlighted.
            </>
          ) : (
            <>
              Mit der Tastenkombination <Kbd keys={['Cmd', 'Shift', 'F']} /> (oder per Rechtsklick) öffnest Du
              den Dateimanager Deines Betriebssystems mit direkt markierter Bilddatei.
            </>
          )}
        </FeatureCard>
      </div>

      <TipBox
        title={
          isEn
            ? 'Safe Recovery from the Recycle Bin'
            : 'Sicherer Rückweg aus dem Papierkorb'
        }
      >
        {isEn
          ? 'If you ever delete photos by mistake, simply open your Windows Recycle Bin or macOS Trash and choose "Restore". Photos and their metadata sidecars return to their exact original folder.'
          : 'Solltest Du versehentlich Fotos gelöscht haben, öffne einfach den Windows-Papierkorb und wähle „Wiederherstellen“. Die Fotos und deren Metadaten-Sidecars landen wieder an ihrem ursprünglichen Platz.'}
      </TipBox>

      <InfoBox
        title={
          isEn
            ? 'Multi-Selection in Folder Tree'
            : 'Mehrfachauswahl im Verzeichnisbaum'
        }
      >
        {isEn ? (
          <>
            In the library folder tree, hold <Kbd keys={['Cmd']} /> to select multiple non-contiguous
            folders at once, or use <Kbd keys={['Shift']} /> to select a contiguous range.
          </>
        ) : (
          <>
            Im Bibliotheks-Ordnerbaum kannst Du mit gedrückter <Kbd keys={['Cmd']} />-Taste mehrere beliebige
            Ordner gleichzeitig auswählen oder mit <Kbd keys={['Shift']} /> einen zusammenhängenden
            Bereich markieren.
          </>
        )}
      </InfoBox>
    </div>
  );
}
