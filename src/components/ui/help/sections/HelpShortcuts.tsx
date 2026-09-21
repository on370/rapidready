import { useTranslation } from 'react-i18next';
import { SectionHeading, Kbd, TipBox } from '../HelpShared';

interface ShortcutItem {
  desc: string;
  keys: string[];
}

interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

export function HelpShortcuts() {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');

  const groups: ShortcutGroup[] = isEn
    ? [
        {
          title: 'Navigation & Views',
          items: [
            { desc: 'Next Image', keys: ['→', '|', 'J', '|', 'Space'] },
            { desc: 'Previous Image', keys: ['←', '|', 'K', '|', 'Shift', 'Space'] },
            { desc: 'Detail View (Loupe)', keys: ['E', '|', 'Enter'] },
            { desc: 'Grid View', keys: ['G'] },
            { desc: 'Back to all photos / Deselect', keys: ['Escape'] },
            { desc: 'Select All Images', keys: ['Cmd', 'A'] },
            { desc: 'Open Import View', keys: ['Cmd', '1'] },
            { desc: 'Open Library View', keys: ['Cmd', '2'] },
            { desc: 'Toggle Fullscreen', keys: ['Cmd', 'F'] },
          ],
        },
        {
          title: 'Culling & Rating',
          items: [
            { desc: 'Pick (Flag)', keys: ['P'] },
            { desc: 'Reject', keys: ['X'] },
            { desc: 'Unflag (Neutral)', keys: ['U'] },
            { desc: 'Rating 1 to 5 Stars', keys: ['1', '-', '5'] },
            { desc: 'Remove Rating', keys: ['0'] },
            { desc: 'Assign Red Label', keys: ['6'] },
            { desc: 'Assign Yellow Label', keys: ['7'] },
            { desc: 'Assign Green Label', keys: ['8'] },
            { desc: 'Assign Blue Label', keys: ['9'] },
          ],
        },
        {
          title: 'Zoom, Pan & Rotate',
          items: [
            { desc: 'Toggle 100% Zoom', keys: ['Z', '|', 'Click'] },
            { desc: 'Zoom In Stepwise', keys: ['+', '|', 'Scroll Up'] },
            { desc: 'Zoom Out Stepwise', keys: ['-', '|', 'Scroll Down'] },
            { desc: 'Pan / Drag Image', keys: ['Drag Mouse'] },
            { desc: 'Rotate Clockwise (90°)', keys: ['.', '|', 'Cmd', 'R'] },
            { desc: 'Rotate Counter-Clockwise', keys: [',', '|', 'Cmd', 'L'] },
          ],
        },
        {
          title: 'System & Workflow Integration',
          items: [
            { desc: 'Edit in RapidRAW', keys: ['R'] },
            { desc: 'Show in Explorer / Finder', keys: ['Cmd', 'Shift', 'F'] },
            { desc: 'Open Settings', keys: ['Cmd', ','] },
            { desc: 'Show Help & Manual', keys: ['F1', '|', 'Cmd', '/'] },
            { desc: 'Quit RapidReady', keys: ['Cmd', 'Q'] },
          ],
        },
      ]
    : [
        {
          title: 'Navigation & Ansichten',
          items: [
            { desc: 'Nächstes Bild', keys: ['→', '|', 'J', '|', 'Space'] },
            { desc: 'Vorheriges Bild', keys: ['←', '|', 'K', '|', 'Shift', 'Space'] },
            { desc: 'Detailansicht (Lupe)', keys: ['E', '|', 'Enter'] },
            { desc: 'Rasteransicht (Grid)', keys: ['G'] },
            { desc: 'Zurück zu allen Fotos / Deselect', keys: ['Escape'] },
            { desc: 'Alle Bilder auswählen', keys: ['Cmd', 'A'] },
            { desc: 'Import-Ansicht öffnen', keys: ['Cmd', '1'] },
            { desc: 'Bibliothek-Ansicht öffnen', keys: ['Cmd', '2'] },
            { desc: 'Vollbild umschalten', keys: ['Cmd', 'F'] },
          ],
        },
        {
          title: 'Culling & Bildbewertung',
          items: [
            { desc: 'Auswählen (Pick)', keys: ['P'] },
            { desc: 'Verwerfen (Reject)', keys: ['X'] },
            { desc: 'Markierung aufheben (Unflag)', keys: ['U'] },
            { desc: 'Sterne-Bewertung 1 bis 5', keys: ['1', '-', '5'] },
            { desc: 'Bewertung entfernen', keys: ['0'] },
            { desc: 'Rotes Farblabel zuweisen', keys: ['6'] },
            { desc: 'Gelbes Farblabel zuweisen', keys: ['7'] },
            { desc: 'Grünes Farblabel zuweisen', keys: ['8'] },
            { desc: 'Blaues Farblabel zuweisen', keys: ['9'] },
          ],
        },
        {
          title: 'Zoom, Pan & Drehung',
          items: [
            { desc: '100% Zoom umschalten', keys: ['Z', '|', 'Klick'] },
            { desc: 'Stufenweise vergrößern', keys: ['+', '|', 'Scroll Up'] },
            { desc: 'Stufenweise verkleinern', keys: ['-', '|', 'Scroll Down'] },
            { desc: 'Ausschnitt verschieben (Pan)', keys: ['Maus ziehen'] },
            { desc: 'Im Uhrzeigersinn drehen (90°)', keys: ['.', '|', 'Cmd', 'R'] },
            { desc: 'Gegen Uhrzeigersinn drehen', keys: [',', '|', 'Cmd', 'L'] },
          ],
        },
        {
          title: 'System & Workflow-Integration',
          items: [
            { desc: 'In RapidRAW bearbeiten', keys: ['R'] },
            { desc: 'Im Explorer / Finder anzeigen', keys: ['Cmd', 'Shift', 'F'] },
            { desc: 'Einstellungen öffnen', keys: ['Cmd', ','] },
            { desc: 'Hilfe & Handbuch anzeigen', keys: ['F1', '|', 'Cmd', '/'] },
            { desc: 'RapidReady beenden', keys: ['Cmd', 'Q'] },
          ],
        },
      ];

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading
        title={isEn ? 'Keyboard Shortcuts' : 'Tastatur-Kurzbefehle (Shortcuts)'}
        subtitle={
          isEn
            ? 'All keyboard shortcuts for blazing-fast culling, navigation, and rating without switching to the mouse.'
            : 'Sämtliche Tastaturbefehle für blitzschnelles Sichten, Navigieren und Bewerten ohne Mauswechsel.'
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {groups.map((group, idx) => (
          <div
            key={idx}
            className="p-4 bg-app-card border border-app-border rounded-xl flex flex-col gap-2.5 shadow-xs"
          >
            <h3 className="text-xs font-bold text-txt-secondary uppercase tracking-wider border-b border-app-border/40 pb-2">
              {group.title}
            </h3>
            <div className="flex flex-col divide-y divide-app-border/30">
              {group.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="text-txt-primary">{item.desc}</span>
                  <Kbd keys={item.keys} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <TipBox title={isEn ? 'Esc Key in Grid View' : 'Tipp zur Esc-Taste im Grid'}>
        {isEn ? (
          <>
            When viewing a subfolder, a collection, or the 'Last Import' view, simply press{' '}
            <Kbd keys={['Escape']} />. This clears any folder or album filter and immediately shows
            all photos in your library location.
          </>
        ) : (
          <>
            Wenn Du Dich in einem Unterordner, einer Sammlung oder der Ansicht „Letzter Import“ befindest,
            drücke einfach <Kbd keys={['Escape']} />. Dadurch wird die Auswahl aufgehoben und das Raster
            schaltet sofort zurück auf alle Fotos Deiner Bibliothek.
          </>
        )}
      </TipBox>
    </div>
  );
}
