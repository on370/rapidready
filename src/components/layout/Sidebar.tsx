import { Download, Images, Settings, CircleHelp, Info, Loader2, ChevronsLeft, ChevronsRight } from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { useImportStore } from "../../stores/importStore";
import { useSettingsStore } from "../../stores/settingsStore";

export type ViewType = "import" | "library" | "tools" | "settings";

interface SidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { t } = useTranslation('common');
  const isScanning = useImportStore((state) => state.isScanning);
  const sidebarExpanded = useSettingsStore((state) => state.sidebarExpanded);
  const setSidebarExpanded = useSettingsStore((state) => state.setSidebarExpanded);

  const NavButton = ({
    view,
    icon: Icon,
    iconClassName,
    label,
    shortLabel,
  }: {
    view: ViewType;
    icon: React.ComponentType<{ className?: string }>;
    iconClassName?: string;
    label: string;
    shortLabel?: string;
  }) => {
    const isActive = activeView === view;
    const displayText = shortLabel || label;

    if (sidebarExpanded) {
      return (
        <button
          type="button"
          className={`w-full h-10 px-3 rounded-lg flex items-center gap-3 justify-start transition-all duration-150 hover:bg-app-hover relative cursor-pointer ${
            isActive ? 'bg-app-hover text-accent font-semibold' : 'text-txt-secondary hover:text-txt-primary'
          }`}
          onClick={() => onViewChange(view)}
        >
          <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${iconClassName || ''}`} />
          <span className="text-xs font-medium truncate">{displayText}</span>
          {view === 'import' && isScanning && (
            <span className="ml-auto w-2 h-2 rounded-full bg-accent animate-ping" />
          )}
        </button>
      );
    }

    return (
      <button
        type="button"
        className={`nav-btn w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 hover:bg-app-hover relative cursor-pointer ${
          isActive ? 'bg-app-hover text-accent' : 'text-txt-secondary hover:text-txt-primary'
        }`}
        onClick={() => onViewChange(view)}
      >
        <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${iconClassName || ''}`} />
        {view === 'import' && isScanning && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent animate-ping" />
        )}
        <span className="tooltip">{label}</span>
      </button>
    );
  };

  return (
    <nav
      data-tour="sidebar-nav"
      className={`bg-app-panel border-r border-app-border flex flex-col py-3 flex-shrink-0 z-10 transition-[width] duration-200 ease-in-out select-none ${
        sidebarExpanded ? 'w-[152px] px-2.5' : 'w-[60px] items-center px-0'
      }`}
    >
      {/* Top nav items */}
      <div className={`flex flex-col gap-1 flex-1 w-full ${sidebarExpanded ? 'items-stretch' : 'items-center'}`}>
        <NavButton
          view="import"
          icon={isScanning ? Loader2 : Download}
          iconClassName={isScanning ? "animate-spin text-accent" : ""}
          label={isScanning ? t("nav.importScanning") : t("nav.import")}
          shortLabel={isScanning ? t("nav.importScanning") : t("nav.import")}
        />
        <NavButton
          view="library"
          icon={Images}
          label={t("nav.library")}
          shortLabel={t("nav.library")}
        />
        {/* v0.2 roadmap: Tools & Dashboard */}
        {/* <NavButton view="tools" icon={Wrench} label={t("nav.tools")} /> */}
      </div>

      {/* Bottom nav items */}
      <div
        data-tour="sidebar-bottom"
        className={`flex flex-col gap-1 w-full ${sidebarExpanded ? 'items-stretch' : 'items-center'}`}
      >
        {sidebarExpanded ? (
          <button
            type="button"
            className="w-full h-10 px-3 rounded-lg flex items-center gap-3 justify-start transition-all duration-150 text-txt-secondary hover:bg-app-hover hover:text-txt-primary cursor-pointer"
            onClick={() => window.dispatchEvent(new Event('open-about-modal'))}
          >
            <Info className="w-[18px] h-[18px] flex-shrink-0" />
            <span className="text-xs font-medium truncate">{t("nav.aboutShort")}</span>
          </button>
        ) : (
          <button
            type="button"
            className="nav-btn w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 text-txt-secondary hover:bg-app-hover hover:text-txt-primary cursor-pointer relative"
            onClick={() => window.dispatchEvent(new Event('open-about-modal'))}
          >
            <Info className="w-[18px] h-[18px]" />
            <span className="tooltip">{t("nav.about")}</span>
          </button>
        )}

        {sidebarExpanded ? (
          <button
            type="button"
            className="w-full h-10 px-3 rounded-lg flex items-center gap-3 justify-start transition-all duration-150 text-txt-secondary hover:bg-app-hover hover:text-txt-primary cursor-pointer"
            onClick={() => emit('toggle-help-modal')}
          >
            <CircleHelp className="w-[18px] h-[18px] flex-shrink-0" />
            <span className="text-xs font-medium truncate">{t("nav.help")}</span>
          </button>
        ) : (
          <button
            type="button"
            className="nav-btn w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 text-txt-secondary hover:bg-app-hover hover:text-txt-primary cursor-pointer relative"
            onClick={() => emit('toggle-help-modal')}
          >
            <CircleHelp className="w-[18px] h-[18px]" />
            <span className="tooltip">{t("nav.help")}</span>
          </button>
        )}

        {/* Bottom: Settings */}
        <NavButton
          view="settings"
          icon={Settings}
          label={t("nav.settings")}
          shortLabel={t("nav.settings")}
        />

        {/* Separator */}
        <div className="h-px bg-app-border my-1 w-full" />

        {/* Footer Toggle */}
        {sidebarExpanded ? (
          <button
            type="button"
            onClick={() => setSidebarExpanded(false)}
            className="w-full h-9 px-3 rounded-lg flex items-center gap-2.5 bg-app-card/70 hover:bg-app-hover border border-app-border/70 text-txt-secondary hover:text-txt-primary transition-all cursor-pointer"
          >
            <ChevronsLeft className="w-4 h-4 flex-shrink-0 text-accent" />
            <span className="text-xs font-medium truncate">{t("nav.collapse")}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSidebarExpanded(true)}
            className="nav-btn w-10 h-9 rounded-lg flex items-center justify-center text-txt-tertiary hover:text-txt-primary hover:bg-app-hover transition-all cursor-pointer relative"
          >
            <ChevronsRight className="w-[18px] h-[18px]" />
            <span className="tooltip">{t("nav.expandTooltip")}</span>
          </button>
        )}
      </div>
    </nav>
  );
}
