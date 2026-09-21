import { useTranslation } from 'react-i18next';
import { SectionHeading, TipBox, FeatureCard } from '../HelpShared';
import { Hash, Clock, Image as ImageIcon, Sliders } from 'lucide-react';

export function HelpExport() {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title={
          isEn
            ? 'Export Engine (Photo Book & Web Galleries)'
            : 'Export-Engine (Fotobuch & Web-Galerien)'
        }
        subtitle={
          isEn
            ? 'Export collections as real files, sequentially numbered, and enforce exact order in photo book software and cloud services using synthetic linear EXIF timestamps.'
            : 'Sammlungen als echte Dateien exportieren, fortlaufend nummerieren und dank EXIF-Zeitsynthese die exakte Reihenfolge in Fotobuch-Software und Cloud-Diensten erzwingen.'
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <FeatureCard
          icon={<Hash className="w-4 h-4" />}
          title={isEn ? 'Custom Order as File Sequence' : 'Manuelle Reihenfolge als Sequenz'}
        >
          {isEn ? (
            <>
              Curated albums can be exported with sequential numbering (e.g.{' '}
              <code>001_Vacation.jpg</code> or <code>0001_IMG_4821.jpg</code>). RapidReady
              automatically calculates the required padding (<code>001–999</code> or{' '}
              <code>0001–9999</code>) based on the photo count.
            </>
          ) : (
            <>
              Kuratierte Alben können mit fortlaufender Nummerierung exportiert werden (z. B.{' '}
              <code>001_Urlaub.jpg</code> oder <code>0001_IMG_4821.jpg</code>). RapidReady ermittelt die
              benötigten Stellen (<code>001–999</code> bzw. <code>0001–9999</code>) vollautomatisch passend zur Fotoanzahl.
            </>
          )}
        </FeatureCard>

        <FeatureCard
          icon={<Clock className="w-4 h-4" />}
          title={isEn ? 'Linear EXIF Capture Times (+10s)' : 'Lineare EXIF-Aufnahmedaten (+10s)'}
        >
          {isEn
            ? 'The secret weapon for flawless photo books: writes strictly ascending capture timestamps in 10-second intervals into exported image files.'
            : 'Das Geheimnis für perfekte Fotobücher: Schreibt in 10-Sekunden-Schritten aufsteigende Aufnahmezeiten in die exportierten Bilddateien.'}
        </FeatureCard>

        <FeatureCard
          icon={<ImageIcon className="w-4 h-4" />}
          title={isEn ? 'Resolution Presets (Picasa Workflow)' : 'Bildgrößen-Presets (Picasa-Workflow)'}
        >
          {isEn ? (
            <>
              Choose from practical resolution tiers: <strong>Full Resolution</strong> (lossless copy for
              print), <strong>4K Ultra HD</strong> (3840px for TV & displays), <strong>Web Standard</strong>{' '}
              (2048px for cloud & WordPress), or <strong>Compact</strong> (1024px for email & chat).
            </>
          ) : (
            <>
              Wähle aus praxisnahen Auflösungsstufen: <strong>Volle Auflösung</strong> (verlustfreie Kopie für
              Druck), <strong>4K Ultra HD</strong> (3840px für TV & Displays), <strong>Web Standard</strong>{' '}
              (2048px für Cloud & WordPress) oder <strong>Kompakt</strong> (1024px für E-Mail & Chat).
            </>
          )}
        </FeatureCard>

        <FeatureCard
          icon={<Sliders className="w-4 h-4" />}
          title={isEn ? 'JPEG Quality Control' : 'JPEG-Qualitätskontrolle'}
        >
          {isEn
            ? 'When resizing, use the slider to finely tune JPEG compression quality (default: 90%) to achieve the optimal balance between file size and sharpness.'
            : 'Bei der Verkleinerung bestimmst Du per Schieberegler stufenlos die gewünschte JPEG-Qualität (Standard: 90%), um die optimale Balance zwischen Dateigröße und Bildschärfe zu erzielen.'}
        </FeatureCard>
      </div>

      {/* Deep-Dive into EXIF Synthesis */}
      <div className="p-4 bg-accent/10 border border-accent/30 rounded-xl flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent" />
          <h3 className="text-xs font-bold text-txt-primary uppercase tracking-wider">
            {isEn
              ? 'Why Linear EXIF Time Synthesis Is Essential'
              : 'Warum lineare EXIF-Zeitsynthese so entscheidend ist'}
          </h3>
        </div>
        <p className="text-xs text-txt-secondary leading-relaxed">
          {isEn ? (
            <>
              Many popular photo book layout tools (e.g. CEWE, Pixum, Saal Digital) as well as cloud photo
              services (Apple Photos, Google Photos, web galleries) <strong>ignore file names</strong> and
              strictly sort photos by internal EXIF capture timestamps.
            </>
          ) : (
            <>
              Viele gängige Fotobuch-Assistenten (z. B. CEWE, Pixum, Saal Digital) sowie Cloud-Dienste (Apple
              Fotos, Google Fotos, Web-Galerien) <strong>ignorieren Dateinamen</strong> und sortieren Fotos
              grundsätzlich nach dem internen EXIF-Aufnahmedatum.
            </>
          )}
        </p>
        <p className="text-xs text-txt-secondary leading-relaxed">
          {isEn ? (
            <>
              If you rearranged photos in your album manually (e.g. inserting detail shots between portraits),
              photo book software would destroy your curation. With <strong>&quot;Generate Linear EXIF Timestamps&quot;</strong>{' '}
              enabled, RapidReady assigns ascending timestamps to each photo.
            </>
          ) : (
            <>
              Wenn Du Fotos im Album manuell umsortiert hast (z. B. Detailaufnahmen zwischen Porträts platziert),
              würde die Fotobuch-Software diese mühsame Kuration wieder zerstören. Mit der aktivierten Option{' '}
              <strong>„Lineare EXIF-Aufnahmedaten erzeugen“</strong> versieht RapidReady jedes Foto mit einem
              streng aufsteigenden Aufnahmezeitpunkt.
            </>
          )}
        </p>
        <div className="p-2.5 bg-app-deepest/60 border border-accent/20 rounded-lg text-xs font-mono text-accent">
          {isEn
            ? 'Result: Your curated order is 100% preserved in all programs and cloud albums!'
            : 'Ergebnis: Deine kuratierte Reihenfolge bleibt in 100% aller Programme und Cloud-Alben exakt erhalten!'}
        </div>
      </div>

      <TipBox title={isEn ? 'Live Filename Preview' : 'Live-Dateinamen-Vorschau'}>
        {isEn ? (
          <>
            Directly in the export dialog, you see a live preview of the first two generated filenames (e.g.{' '}
            <code>1. Photobook_001.jpg • 2. Photobook_002.jpg</code>). You know exactly how files will look
            before clicking Start.
          </>
        ) : (
          <>
            Direkt im Export-Dialog siehst Du eine Live-Vorschau der ersten beiden Dateinamen (z. B.{' '}
            <code>1. Fotobuch_001.jpg • 2. Fotobuch_002.jpg</code>). So weißt Du vor dem Klick auf Start
            genau, wie das Ergebnis auf Deiner Festplatte heißen wird.
          </>
        )}
      </TipBox>
    </div>
  );
}
