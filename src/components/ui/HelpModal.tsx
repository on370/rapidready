import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Search,
  BookOpen,
  Keyboard,
  FolderDown,
  Zap,
  FolderTree,
  Download,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { Kbd } from './help/HelpShared';

import { HelpShortcuts } from './help/sections/HelpShortcuts';
import { HelpImport } from './help/sections/HelpImport';
import { HelpCulling } from './help/sections/HelpCulling';
import { HelpCollections } from './help/sections/HelpCollections';
import { HelpExport } from './help/sections/HelpExport';
import { HelpMetadata } from './help/sections/HelpMetadata';
import { HelpSafety } from './help/sections/HelpSafety';

type SectionId = 'shortcuts' | 'import' | 'culling' | 'collections' | 'export' | 'metadata' | 'safety';

interface HelpSection {
  id: SectionId;
  title: string;
  shortTitle: string;
  icon: React.ReactNode;
  keywords: string[];
  component: React.ComponentType;
}

export function HelpModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('shortcuts');
  const [searchQuery, setSearchQuery] = useState('');
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith('en');

  const contentRef = useRef<HTMLElement>(null);

  // Reset scroll position to top whenever activeSection changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeSection]);

  const sections: HelpSection[] = useMemo(
    () => [
      {
        id: 'shortcuts',
        title: isEn ? 'Keyboard Shortcuts' : 'Tastatur-Kurzbefehle',
        shortTitle: 'Shortcuts',
        icon: <Keyboard className="w-4 h-4" />,
        keywords: [
          'shortcuts',
          'keyboard',
          'tastatur',
          'tasten',
          'navigation',
          'grid',
          'raster',
          'lupe',
          'loupe',
          'esc',
          'rating',
          'bewertung',
          'rotate',
          'drehen',
        ],
        component: HelpShortcuts,
      },
      {
        id: 'import',
        title: isEn ? 'Import & Folder Profiles' : 'Import & Ordner-Profile',
        shortTitle: isEn ? 'Import & Profiles' : 'Import & Profile',
        icon: <FolderDown className="w-4 h-4" />,
        keywords: [
          'import',
          'sd card',
          'sd-karte',
          'speicherkarte',
          'usb',
          'source',
          'quelle',
          'destination',
          'target',
          'zielordner',
          'profiles',
          'profile',
          'last import',
          'letzter import',
          'date',
          'datum',
          'format',
        ],
        component: HelpImport,
      },
      {
        id: 'culling',
        title: isEn ? 'Culling & Fast Screening' : 'Culling & Schnelles Sichten',
        shortTitle: isEn ? 'Culling & Screening' : 'Culling & Sichten',
        icon: <Zap className="w-4 h-4" />,
        keywords: [
          'culling',
          'screening',
          'sichten',
          'pick',
          'reject',
          'unflag',
          'traffic light',
          'ampel',
          'auto-advance',
          'stars',
          'sterne',
          'colors',
          'farben',
          'filter',
          'zoom',
          'lupe',
          'loupe',
        ],
        component: HelpCulling,
      },
      {
        id: 'collections',
        title: isEn ? 'Collections & Albums' : 'Sammlungen & Alben',
        shortTitle: isEn ? 'Collections' : 'Sammlungen',
        icon: <FolderTree className="w-4 h-4" />,
        keywords: [
          'collections',
          'sammlungen',
          'albums',
          'alben',
          'drag',
          'drop',
          'order',
          'reihenfolge',
          'remove',
          'entfernen',
          'virtual',
          'virtuell',
          'assign',
          'zuweisen',
          'esc',
          'deselect',
        ],
        component: HelpCollections,
      },
      {
        id: 'export',
        title: isEn ? 'Export Engine & Photo Book' : 'Export-Engine & Fotobuch',
        shortTitle: isEn ? 'Export & Books' : 'Export & Fotobuch',
        icon: <Download className="w-4 h-4" />,
        keywords: [
          'export',
          'photo book',
          'fotobuch',
          'sequence',
          'sequenz',
          'numbering',
          'nummerierung',
          'exif',
          'timestamp',
          'zeitstempel',
          'linear',
          'quality',
          'qualität',
          'jpeg',
          '4k',
          'resolution',
          'auflösung',
        ],
        component: HelpExport,
      },
      {
        id: 'metadata',
        title: isEn ? 'Metadata, Tags & GPS' : 'Metadaten, Tags & GPS',
        shortTitle: isEn ? 'Metadata & GPS' : 'Metadaten & GPS',
        icon: <Tag className="w-4 h-4" />,
        keywords: [
          'metadata',
          'metadaten',
          'exif',
          'inspector',
          'inspektor',
          'camera',
          'kamera',
          'lens',
          'objektiv',
          'tags',
          'keywords',
          'stichwörter',
          'gps',
          'coordinates',
          'koordinaten',
          'xmp',
          'sidecars',
        ],
        component: HelpMetadata,
      },
      {
        id: 'safety',
        title: isEn ? 'Safety, Trash & RAW Link' : 'Sicherheit, Papierkorb & RAW',
        shortTitle: isEn ? 'Safety & RAW' : 'Sicherheit & RAW',
        icon: <ShieldCheck className="w-4 h-4" />,
        keywords: [
          'safety',
          'sicherheit',
          'trash',
          'recycle',
          'papierkorb',
          'delete',
          'löschen',
          'restore',
          'wiederherstellen',
          'rapidraw',
          'explorer',
          'finder',
          'guardrails',
        ],
        component: HelpSafety,
      },
    ],
    [isEn]
  );

  // Filter sections by search query
  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter((s) => {
      return (
        s.title.toLowerCase().includes(q) ||
        s.shortTitle.toLowerCase().includes(q) ||
        s.keywords.some((k) => k.includes(q))
      );
    });
  }, [sections, searchQuery]);

  // Active section component
  const ActiveComponent = useMemo(() => {
    const active = sections.find((s) => s.id === activeSection);
    return active ? active.component : HelpShortcuts;
  }, [sections, activeSection]);

  // Keyboard navigation: Cmd+?, F1, Escape, ArrowUp/Down for article scroll, ArrowLeft/Right for section switch
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey && e.key === '/') || e.key === 'F1') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        return;
      }
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        return;
      }

      // If user is focused inside a text input (e.g. search box), don't intercept arrow keys
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      if (isInput) {
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        contentRef.current?.scrollBy({ top: -120, behavior: 'smooth' });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        contentRef.current?.scrollBy({ top: 120, behavior: 'smooth' });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const list = filteredSections.length > 0 ? filteredSections : sections;
        setActiveSection((curr) => {
          const idx = list.findIndex((s) => s.id === curr);
          if (idx === -1) return list[0]?.id || 'shortcuts';
          const prevIdx = (idx - 1 + list.length) % list.length;
          return list[prevIdx].id;
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const list = filteredSections.length > 0 ? filteredSections : sections;
        setActiveSection((curr) => {
          const idx = list.findIndex((s) => s.id === curr);
          if (idx === -1) return list[0]?.id || 'shortcuts';
          const nextIdx = (idx + 1) % list.length;
          return list[nextIdx].id;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredSections, sections]);

  // Listen to Tauri events from the native Help menu (macOS / app menu)
  useEffect(() => {
    const unlisten = listen('toggle-help-modal', () => {
      setIsOpen((prev) => !prev);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150 select-none overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsOpen(false);
      }}
    >
      <div
        className="w-full max-w-5xl bg-app-panel border border-app-border rounded-xl shadow-2xl flex flex-col max-h-[88vh] h-[88vh] text-txt-primary overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Pinned at top */}
        <div className="px-5 py-3.5 border-b border-app-border flex items-center justify-between flex-shrink-0 bg-app-panel">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent flex-shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-txt-primary">
                {isEn ? 'RapidReady Help & Manual' : 'RapidReady Hilfe & Handbuch'}
              </h2>
              <p className="text-xs text-txt-tertiary">
                {isEn
                  ? 'Documentation, workflows, and keyboard shortcuts'
                  : 'Dokumentation, Workflows und Tastaturkürzel'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg text-txt-tertiary hover:text-txt-primary hover:bg-app-hover transition-colors cursor-pointer"
            title={isEn ? 'Close (Esc)' : 'Schließen (Esc)'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Master-Detail Layout Body */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left Sidebar (Navigation & Search) */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-app-border bg-app-panel/40 flex flex-col flex-shrink-0 p-3 gap-2 overflow-y-auto">
            {/* Search Box */}
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-2.5 text-txt-tertiary pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isEn ? 'Search help...' : 'In Hilfe suchen...'}
                className="w-full pl-8 pr-7 py-1.5 bg-app-card border border-app-border rounded-lg text-xs text-txt-primary placeholder:text-txt-tertiary focus:outline-none focus:border-accent transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-txt-tertiary hover:text-txt-primary p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Navigation Category List */}
            <nav className="flex flex-col gap-1 mt-1">
              {filteredSections.length > 0 ? (
                filteredSections.map((item) => {
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveSection(item.id);
                        if (contentRef.current) {
                          contentRef.current.scrollTop = 0;
                        }
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left cursor-pointer ${
                        isActive
                          ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
                          : 'text-txt-secondary hover:text-txt-primary hover:bg-app-hover/60 border border-transparent'
                      }`}
                    >
                      <span className={isActive ? 'text-accent' : 'text-txt-tertiary'}>
                        {item.icon}
                      </span>
                      <span className="truncate">{item.title}</span>
                    </button>
                  );
                })
              ) : (
                <div className="p-3 text-center text-xs text-txt-tertiary">
                  {isEn ? `No results for "${searchQuery}"` : `Keine Treffer für „${searchQuery}“`}
                </div>
              )}
            </nav>
          </div>

          {/* Right Main Content Panel */}
          <main
            ref={contentRef}
            className="flex-1 min-h-0 overflow-y-auto p-5 md:p-7 bg-app-deepest/20 select-text"
          >
            <ActiveComponent />
          </main>
        </div>

        {/* Pinned Footer */}
        <div className="px-5 py-2.5 border-t border-app-border bg-app-panel flex items-center justify-between flex-shrink-0 text-xs text-txt-tertiary">
          <div className="flex items-center gap-1.5 text-[11px] truncate">
            <span>{isEn ? 'Tip:' : 'Tipp:'}</span>
            <Kbd keys={['F1']} />
            <span>{isEn ? 'or' : 'oder'}</span>
            <Kbd keys={['Cmd', '/']} />
            <span>
              {isEn ? 'opens this help anytime.' : 'öffnet diese Hilfe jederzeit.'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="px-4 py-1.5 rounded-lg bg-app-card hover:bg-app-hover border border-app-border text-txt-secondary hover:text-txt-primary transition-colors cursor-pointer text-xs font-medium flex-shrink-0 ml-2"
          >
            {isEn ? 'Close' : 'Schließen'}
          </button>
        </div>
      </div>
    </div>
  );
}
