import { useTranslation } from 'react-i18next';
import { SectionHeading, Kbd, TipBox, FeatureCard } from '../HelpShared';
import { Zap, CheckCircle2, XCircle, Flag, ZoomIn, Eye, ArrowRightToLine } from 'lucide-react';

export function HelpCulling() {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title={isEn ? 'Culling & Fast Screening' : 'Culling & Schnelles Sichten'}
        subtitle={
          isEn
            ? 'Review, rate, filter hundreds of photos in record time, and safely separate keepers from rejects.'
            : 'Hunderte von Fotos in Rekordzeit sichten, bewerten, filtern und den Ausschuss sicher trennen.'
        }
      />

      {/* The Traffic Light Principle */}
      <div className="p-4 bg-app-card border border-app-border rounded-xl flex flex-col gap-3">
        <h3 className="text-xs font-bold text-txt-primary uppercase tracking-wider flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" />
          {isEn ? 'The Traffic Light Principle (Picks & Rejects)' : 'Das Ampel-Prinzip (Picks & Rejects)'}
        </h3>
        <p className="text-xs text-txt-secondary leading-relaxed">
          {isEn
            ? 'Instead of tediously comparing every photo, RapidReady uses the proven three-state culling principle:'
            : 'Statt mühsam jedes Foto zu vergleichen, nutzt RapidReady das bewährte Culling-Prinzip aus drei Zuständen:'}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-400 text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {isEn ? 'Pick (Keep)' : 'Pick (Auswahl)'}
              </span>
              <Kbd keys={['P']} />
            </div>
            <p className="text-[11px] text-txt-secondary leading-relaxed">
              {isEn
                ? 'Marks your favorites and keepers for further editing and export.'
                : 'Markiert Deine Favoriten und gelungenen Fotos für die spätere Weiterverarbeitung.'}
            </p>
          </div>

          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-red-400 text-xs flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" /> {isEn ? 'Reject (Discard)' : 'Reject (Ausschuss)'}
              </span>
              <Kbd keys={['X']} />
            </div>
            <p className="text-[11px] text-txt-secondary leading-relaxed">
              {isEn
                ? 'Mark blurry or misexposed shots. Use the filter to review and purge all rejects in one click.'
                : 'Unscharfe oder fehlbelichtete Bilder markieren. Über den Filter lassen sich alle Rejects auf einen Klick prüfen und löschen.'}
            </p>
          </div>

          <div className="p-3 bg-app-panel border border-app-border rounded-lg flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-txt-primary text-xs flex items-center gap-1.5">
                <Flag className="w-3.5 h-3.5 text-txt-tertiary" /> {isEn ? 'Neutral (Unflag)' : 'Neutral (Unflag)'}
              </span>
              <Kbd keys={['U']} />
            </div>
            <p className="text-[11px] text-txt-secondary leading-relaxed">
              {isEn
                ? 'Clears any flag from the photo and resets it to the neutral state.'
                : 'Entfernt jede Flagge vom Bild und setzt es in den neutralen Zustand zurück.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <FeatureCard
          icon={<ArrowRightToLine className="w-4 h-4" />}
          title={isEn ? 'Auto-Advance' : 'Auto-Advance (Automatischer Sprung)'}
        >
          {isEn ? (
            <>
              When <strong>&quot;Auto-Advance&quot;</strong> is enabled in the top toolbar, RapidReady
              automatically advances to the next photo after any rating (<Kbd keys={['P']} />,{' '}
              <Kbd keys={['X']} />, or stars). You can keep one hand on the keyboard and cull photos in
              seconds.
            </>
          ) : (
            <>
              Wenn in der oberen Werkzeugleiste die Option <strong>„Auto-Advance“</strong> aktiv ist, springt
              RapidReady nach jeder Bewertung (<Kbd keys={['P']} />, <Kbd keys={['X']} /> oder Sternen)
              automatisch zum nächsten Foto. Du kannst eine Hand auf der Tastatur lassen und Fotos im
              Sekundentakt bewerten.
            </>
          )}
        </FeatureCard>

        <FeatureCard
          icon={<Eye className="w-4 h-4" />}
          title={isEn ? 'Star Ratings (1–5) & Color Labels' : 'Sterne (1–5) & Farbcodes'}
        >
          {isEn ? (
            <>
              Assign star ratings with keys <Kbd keys={['1']} /> through <Kbd keys={['5']} /> (or{' '}
              <Kbd keys={['0']} /> to reset) and color labels with <Kbd keys={['6']} /> (Red),{' '}
              <Kbd keys={['7']} /> (Yellow), <Kbd keys={['8']} /> (Green), <Kbd keys={['9']} /> (Blue).
            </>
          ) : (
            <>
              Vergib Sterne-Bewertungen mit den Ziffern <Kbd keys={['1']} /> bis <Kbd keys={['5']} /> (oder{' '}
              <Kbd keys={['0']} /> zum Zurücksetzen) und Farbetiketten mit <Kbd keys={['6']} /> (Rot),{' '}
              <Kbd keys={['7']} /> (Gelb), <Kbd keys={['8']} /> (Grün), <Kbd keys={['9']} /> (Blau).
            </>
          )}
        </FeatureCard>

        <FeatureCard
          icon={<ZoomIn className="w-4 h-4" />}
          title={isEn ? 'Detail Loupe & 100% Sharpness Check' : 'Detail-Lupe & 100%-Schärfeprüfung'}
        >
          {isEn ? (
            <>
              Press <Kbd keys={['E']} /> or <Kbd keys={['Enter']} /> to switch to the full-screen loupe.
              Clicking the image toggles 100% zoom instantly for critical sharpness check. Hold and drag
              the left mouse button to pan.
            </>
          ) : (
            <>
              Drücke <Kbd keys={['E']} /> oder <Kbd keys={['Enter']} />, um in die Vollbild-Lupe zu wechseln.
              Ein Klick ins Bild schaltet sofort auf 100% Zoom zur Schärfenkontrolle. Mit gedrückter linker
              Maustaste verschiebst Du den Bildausschnitt.
            </>
          )}
        </FeatureCard>

        <FeatureCard
          icon={<Eye className="w-4 h-4" />}
          title={isEn ? 'Smart Filter Bar' : 'Intelligente Filterleiste'}
        >
          {isEn
            ? 'In the top right filter bar, filter your view to only show "Picks", photos with 3+ stars, or specific color labels with one click. Keep total clarity even with thousands of photos.'
            : 'In der Filterleiste oben rechts blendest Du mit einem Klick nur noch „Picks“, Bilder mit 3+ Sternen oder einer bestimmten Farbkennzeichnung ein. So behältst Du selbst in tausenden Bildern die volle Übersicht.'}
        </FeatureCard>
      </div>

      <TipBox title={isEn ? 'Fast Navigation with Spacebar' : 'Schnellblättern mit der Leertaste'}>
        {isEn ? (
          <>
            Use <Kbd keys={['Space']} /> to advance to the next image and{' '}
            <Kbd keys={['Shift', 'Space']} /> to go back. Combined with <Kbd keys={['P']} /> and{' '}
            <Kbd keys={['X']} />, this is the fastest culling workflow available.
          </>
        ) : (
          <>
            Du kannst zum Vorblättern bequem die <Kbd keys={['Space']} /> (Leertaste) nutzen und mit{' '}
            <Kbd keys={['Shift', 'Space']} /> zurückblättern. Zusammen mit <Kbd keys={['P']} /> und{' '}
            <Kbd keys={['X']} /> ist dies der schnellste Culling-Workflow der Fotobranche.
          </>
        )}
      </TipBox>
    </div>
  );
}
