import { useTranslation } from 'react-i18next';
import { SectionHeading, StepRow, TipBox, InfoBox, FeatureCard } from '../HelpShared';
import { HardDrive, Layers, Sparkles, Sliders } from 'lucide-react';

export function HelpImport() {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title={isEn ? 'Fast Import & Folder Profiles' : 'Schneller Import & Ordner-Profile'}
        subtitle={
          isEn
            ? 'Ingest photos from memory cards or hard drives, automatically organize by date, and assign directly to collections.'
            : 'Fotos von Speicherkarten oder Festplatten einlesen, automatisch nach Datum ordnen und direkt Sammlungen zuweisen.'
        }
      />

      <div className="flex flex-col gap-2.5">
        <h3 className="text-xs font-bold text-txt-secondary uppercase tracking-wider">
          {isEn ? 'The 2-Stage Import Workflow' : 'Der 2-Stufen-Import-Workflow'}
        </h3>
        <StepRow
          step={1}
          title={isEn ? 'Step 1: Select Source & Scan' : 'Schritt 1: Quelle auswählen & scannen'}
          description={
            isEn
              ? 'Connected SD cards and USB drives are automatically detected in the left sidebar. Alternatively, browse any folder on your computer. A single click starts the fast preview scan.'
              : 'Eingesteckte SD-Karten und USB-Sticks werden in der linken Leiste automatisch erkannt. Alternativ kannst Du jeden beliebigen Ordner Deines Computers durchsuchen. Ein Klick startet den schnellen Vorschauscan.'
          }
        />
        <StepRow
          step={2}
          title={isEn ? 'Step 2: Destination Structure & Album' : 'Schritt 2: Zielstruktur & Album festlegen'}
          description={
            isEn
              ? 'In the second step, choose your target folder on your hard drive, the folder date pattern (e.g., Year/Date), and optionally an album to add the photos to.'
              : 'Im zweiten Schritt wählst Du das Zielverzeichnis auf Deiner Festplatte, das Ordner-Datumsformat (z. B. Jahr/Datum) und optional ein Album, dem die Fotos hinzugefügt werden sollen.'
          }
        />
        <StepRow
          step={3}
          title={isEn ? 'Step 3: Run Import & Confirmation' : 'Schritt 3: Import ausführen & Bestätigung'}
          description={
            isEn
              ? 'Photos and their matching RAW sidecar files are safely copied. Once completed, you have direct access to the imported photos or can jump straight into the target album.'
              : 'Die Bilder und deren RAW-Begleitdateien werden sicher kopiert. Nach Abschluss hast Du direkten Zugriff auf die importierten Fotos oder kannst sofort in das Zielalbum wechseln.'
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 my-2">
        <FeatureCard
          icon={<HardDrive className="w-4 h-4" />}
          title={isEn ? 'Automatic Media Detection' : 'Automatische Medien-Erkennung'}
        >
          {isEn
            ? 'RapidReady monitors the system for newly connected memory cards and cameras. Free and used storage space is clearly displayed.'
            : 'RapidReady überwacht das System auf neu angeschlossene Speicherkarten und Kameras. Freier und belegter Speicherplatz werden übersichtlich dargestellt.'}
        </FeatureCard>

        <FeatureCard
          icon={<Sliders className="w-4 h-4" />}
          title={isEn ? 'Reusable Import Profiles' : 'Wiederverwendbare Import-Profile'}
        >
          {isEn
            ? 'Save your preferred destination paths and date formats as profiles (e.g., "Sony A7 IV – Client Jobs" or "Vacation & Travel"). One click restores all parameters.'
            : 'Speichere Deine bevorzugten Zielpfade und Datumsformate als Profil ab (z. B. „Sony A7 IV – Aufträge“ oder „Urlaub & Reise“). Ein Klick stellt alle Parameter wieder her.'}
        </FeatureCard>

        <FeatureCard
          icon={<Layers className="w-4 h-4" />}
          title={isEn ? 'Direct Collection Assignment' : 'Direkte Sammlungs-Zuweisung'}
        >
          {isEn
            ? 'Assign imported photos to an existing album right during ingest, or create a new album on the fly. This eliminates manual sorting after import.'
            : 'Weise importierte Fotos direkt beim Einlesen einem bestehenden Album zu oder erstelle on-the-fly ein neues Album. Das spart den manuellen Sortierschritt nach dem Import.'}
        </FeatureCard>

        <FeatureCard
          icon={<Sparkles className="w-4 h-4" />}
          title={isEn ? 'Smart "Last Import" Collection' : 'Intelligente Sammlung „Letzter Import“'}
        >
          {isEn
            ? 'Regardless of target folder or album assignment, RapidReady always keeps track of the photos from the most recent import in an automatic virtual collection.'
            : 'Unabhängig von Zielordner oder Sammlungszuweisung merkt sich RapidReady stets die Fotos des letzten Imports in einer automatischen virtuellen Sammlung.'}
        </FeatureCard>
      </div>

      <TipBox title={isEn ? 'RAW + JPEG & Sidecars as a Unit' : 'RAW + JPEG & Sidecars als Einheit'}>
        {isEn
          ? 'If your camera shoots RAW and JPEG simultaneously or XMP sidecars already exist, RapidReady always treats these matching files as a single logical unit. No metadata file is ever lost during import and copying.'
          : 'Wenn Deine Kamera RAW und JPEG gleichzeitig aufnimmt, oder bereits XMP-Sidecar-Dateien existieren, behandelt RapidReady diese zusammengehörigen Dateien immer als logische Einheit. Beim Importieren und Kopieren geht keine Metadaten-Datei verloren.'}
      </TipBox>

      <InfoBox
        title={
          isEn
            ? 'Notice on Windows Default Picture Folder'
            : 'Warnung bei Windows-Standardordner'
        }
      >
        {isEn
          ? 'If the default "Pictures" folder is selected as the import target, RapidReady displays a subtle hint. You can permanently dismiss this warning using the close button if this is your desired main directory.'
          : 'Wenn als Importziel der Standardordner „Bilder“ aktiv ist, weist RapidReady dezent darauf hin. Du kannst diesen Hinweis über das kleine Kreuz dauerhaft ausblenden, falls dies Dein gewünschter Hauptordner ist.'}
      </InfoBox>
    </div>
  );
}
