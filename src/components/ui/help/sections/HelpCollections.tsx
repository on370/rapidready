import { useTranslation } from 'react-i18next';
import { SectionHeading, Kbd, TipBox, FeatureCard } from '../HelpShared';
import { FolderTree, Move, ListPlus, Sparkles, FolderX } from 'lucide-react';

export function HelpCollections() {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title={isEn ? 'Collections, Albums & Custom Ordering' : 'Sammlungen, Alben & Reihenfolge'}
        subtitle={
          isEn
            ? 'Curate photos in virtual albums independently of physical disk folders and arrange them in any custom order.'
            : 'Fotos unabhängig von ihren physischen Festplatten-Ordnern in virtuellen Alben kuratieren und manuell anordnen.'
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <FeatureCard
          icon={<FolderTree className="w-4 h-4" />}
          title={isEn ? 'Virtual Albums vs. Physical Folders' : 'Virtuelle Alben vs. Physische Ordner'}
        >
          {isEn
            ? 'Your photos always stay at their real location on disk. Collections are purely virtual. A photo can be in as many albums as you like without duplicating disk space.'
            : 'Deine Fotos verbleiben immer an ihrem tatsächlichen Speicherort auf Deiner Festplatte. Sammlungen sind rein virtuelle Zusammenstellungen. Ein Foto kann in beliebig vielen Alben vorkommen, ohne zusätzlichen Speicherplatz zu belegen.'}
        </FeatureCard>

        <FeatureCard
          icon={<Move className="w-4 h-4" />}
          title={isEn ? 'Custom Ordering (Drag & Drop)' : 'Manuelle Reihenfolge (Drag & Drop)'}
        >
          {isEn
            ? 'In any collection, you can freely rearrange photos by dragging and dropping them into your desired order. This order is saved permanently and forms the basis for photo book exports.'
            : 'In jeder Sammlung kannst Du Fotos per Maus frei verschieben und in eine individuelle Abfolge bringen. Diese Reihenfolge wird dauerhaft gespeichert und bildet die Grundlage für den Fotobuch-Export.'}
        </FeatureCard>

        <FeatureCard
          icon={<ListPlus className="w-4 h-4" />}
          title={isEn ? 'Adding Photos to Albums' : 'Bilder zu Alben hinzufügen'}
        >
          {isEn ? (
            <>
              Select one or more photos in the grid, right-click, and choose{' '}
              <strong>&quot;Add to Collection&quot;</strong>. You can select an existing album or create
              a new one on the fly.
            </>
          ) : (
            <>
              Markiere ein oder mehrere Bilder im Raster, klicke mit der rechten Maustaste und wähle{' '}
              <strong>„Zu Sammlung hinzufügen“</strong>. Du kannst ein bestehendes Album wählen oder sofort ein
              neues erstellen.
            </>
          )}
        </FeatureCard>

        <FeatureCard
          icon={<Sparkles className="w-4 h-4" />}
          title={isEn ? 'The "Last Import" Collection' : 'Die Sammlung „Letzter Import“'}
        >
          {isEn
            ? 'Under "Collections" you will always find the automatically maintained list of your last import. A right-click lets you copy these photos into a permanent album with one click.'
            : 'Unter „Sammlungen“ findest Du stets die automatisch geführte Liste des letzten Imports. Per Rechtsklick kannst Du diese Fotos mit einem Klick in ein dauerhaftes Album übertragen.'}
        </FeatureCard>
      </div>

      <div className="p-4 bg-app-card border border-app-border rounded-xl flex flex-col gap-2.5">
        <h3 className="text-xs font-bold text-txt-primary uppercase tracking-wider flex items-center gap-2">
          <FolderX className="w-4 h-4 text-accent" />
          {isEn ? 'Remove from Collection vs. Physical Delete' : 'Aus Sammlung entfernen vs. Physisch löschen'}
        </h3>
        <p className="text-xs text-txt-secondary leading-relaxed">
          {isEn
            ? 'When you select and remove a photo in a collection, RapidReady cleanly distinguishes between options:'
            : 'Wenn Du ein Bild in einer Sammlung markierst und entfernst, unterscheidet RapidReady sauber zwischen den Optionen:'}
        </p>
        <ul className="text-xs text-txt-secondary list-disc pl-5 space-y-1.5 leading-relaxed">
          <li>
            {isEn ? (
              <>
                <strong>&quot;Remove from Album&quot;:</strong> Only removes the photo from the current
                album. The original file on disk remains untouched.
              </>
            ) : (
              <>
                <strong>„Aus Album entfernen“:</strong> Entfernt das Bild nur aus dem aktuellen Album. Die
                Originaldatei auf der Festplatte bleibt unberührt.
              </>
            )}
          </li>
          <li>
            {isEn ? (
              <>
                <strong>&quot;Remove from all Collections&quot;:</strong> If a photo exists in multiple
                albums, it is unlinked from all collections while the physical file is preserved.
              </>
            ) : (
              <>
                <strong>„Aus allen Sammlungen entfernen“:</strong> Wenn ein Bild in mehreren Alben liegt,
                wird die Verknüpfung in allen Sammlungen gelöst, die physische Datei bleibt erhalten.
              </>
            )}
          </li>
          <li>
            {isEn ? (
              <>
                <strong>&quot;Move to Trash / Recycle Bin&quot;:</strong> Safely moves the actual RAW/JPEG
                file including its XMP sidecar into the system recycle bin.
              </>
            ) : (
              <>
                <strong>„In den Papierkorb verschieben“:</strong> Verschiebt die tatsächliche RAW/JPEG-Datei
                inklusive XMP-Sidecar sicher in den System-Papierkorb.
              </>
            )}
          </li>
        </ul>
      </div>

      <TipBox title={isEn ? 'Grid Deselection with the Esc Key' : 'Deselektion im Grid mit der Esc-Taste'}>
        {isEn ? (
          <>
            Click on an album in the sidebar to view only its photos. Pressing <Kbd keys={['Escape']} /> in
            the grid deselects the album and instantly switches back to viewing all photos in your library.
          </>
        ) : (
          <>
            Klicke in der Seitenleiste auf ein Album, um nur dessen Fotos zu sehen. Drückst Du anschließend im
            Raster <Kbd keys={['Escape']} />, wird das Album sofort abgewählt und RapidReady schaltet nahtlos
            auf die Gesamtheit aller Fotos Deines Katalogs zurück.
          </>
        )}
      </TipBox>
    </div>
  );
}
