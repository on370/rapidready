import { useEffect, useMemo, useState } from "react";
import { X, MousePointerClick } from "lucide-react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useLibraryStore, LibraryImage } from "../../../stores/libraryStore";
import { useCollectionsStore, findAlbumById } from "../../../stores/collectionsStore";
import { normalizePath, isVideoFilename } from "../../../utils/image";
import { InspectorPreviewCard } from "./inspector/InspectorPreviewCard";
import { InspectorCullingCard } from "./inspector/InspectorCullingCard";
import { InspectorTagsCard } from "./inspector/InspectorTagsCard";
import { InspectorFileInfoCard } from "./inspector/InspectorFileInfoCard";
import { InspectorCameraCard } from "./inspector/InspectorCameraCard";
import { InspectorGpsCard } from "./inspector/InspectorGpsCard";

interface LibraryInspectorProps {
  close: () => void;
}

export function LibraryInspector({ close }: LibraryInspectorProps) {
  const { t } = useTranslation('library');
  const { 
    images, activeImageIndex, 
    selectedPaths, updateImageMetadata, activeFolderPath, selectedFolderPaths,
    lastImportPaths, isViewingLastImport, rootPath 
  } = useLibraryStore();

  const activeCollectionId = useCollectionsStore((s) => s.activeCollectionId);
  const collectionsTree = useCollectionsStore((s) => s.collectionsTree);
  const activeCollection = useMemo(() => {
    return activeCollectionId ? findAlbumById(collectionsTree, activeCollectionId) : null;
  }, [activeCollectionId, collectionsTree]);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('rr_inspector_collapsed');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [section]: !prev[section] };
      try {
        localStorage.setItem('rr_inspector_collapsed', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const isCollapsed = (section: string) => !!collapsedSections[section];

  const normLastImport = useMemo(() => {
    return new Set(lastImportPaths.map(p => normalizePath(p)));
  }, [lastImportPaths]);

  const normActiveFolder = useMemo(() => {
    return activeFolderPath ? normalizePath(activeFolderPath) : null;
  }, [activeFolderPath]);

  const normRoot = useMemo(() => {
    return rootPath ? normalizePath(rootPath) : null;
  }, [rootPath]);

  const scopedImages = useMemo(() => {
    // When viewing an active collection, display collection images in their exact manual order!
    if (activeCollectionId) {
      if (!activeCollection) {
        return [];
      }
      const imgMap = new Map<string, LibraryImage>();
      for (const img of images) {
        imgMap.set(normalizePath(img.path), img);
      }
      const list: LibraryImage[] = [];
      for (const path of activeCollection.images) {
        const norm = normalizePath(path);
        const existing = imgMap.get(norm);
        if (existing) {
          list.push(existing);
        }
      }
      return list;
    }

    let list: LibraryImage[];
    if (isViewingLastImport) {
      list = images.filter(img => normLastImport.has(normalizePath(img.path)));
    } else if (
      selectedFolderPaths && 
      selectedFolderPaths.size > 0 && 
      !(selectedFolderPaths.size === 1 && normRoot && selectedFolderPaths.has(normRoot))
    ) {
      list = images.filter((img) => {
        const p = normalizePath(img.path);
        const lastSlash = p.lastIndexOf('/');
        const dir = lastSlash > 0 ? p.substring(0, lastSlash) : p;
        return selectedFolderPaths.has(dir);
      });
    } else if (normActiveFolder && normActiveFolder !== normRoot) {
      list = images.filter((img) => {
        const p = normalizePath(img.path);
        return p.startsWith(normActiveFolder + '/') || p === normActiveFolder;
      });
    } else {
      list = images;
    }
    return list.slice().sort((a, b) => a.path.localeCompare(b.path));
  }, [activeCollectionId, activeCollection, images, isViewingLastImport, normLastImport, selectedFolderPaths, normActiveFolder, normRoot]);

  const activeImage = useMemo(() => {
    if (selectedPaths.size === 0) return undefined;
    const candidate = scopedImages[activeImageIndex];
    if (candidate && selectedPaths.has(candidate.path)) {
      return candidate;
    }
    const found = scopedImages.find(img => selectedPaths.has(img.path));
    if (found) return found;
    return images.find(img => selectedPaths.has(img.path));
  }, [selectedPaths, scopedImages, activeImageIndex, images]);

  // Lazy-load detailed EXIF metadata when an image is selected
  useEffect(() => {
    if (!activeImage) return;
    if (activeImage.camera === undefined || activeImage.is_monochrome_preview === undefined || activeImage.exposure_bias === undefined) {
      let isMounted = true;
      invoke<{
        date: string | null;
        date_modified?: string | null;
        camera: string | null;
        lens: string | null;
        iso: string | null;
        aperture: string | null;
        shutter: string | null;
        focal_length?: string | null;
        exposure_bias?: string | null;
        width?: number | null;
        height?: number | null;
        is_raw?: boolean;
        is_monochrome_sensor?: boolean;
        is_monochrome_preview?: boolean;
        latitude?: number | null;
        longitude?: number | null;
        altitude?: number | null;
      }>('get_image_metadata', { path: activeImage.path })
        .then(meta => {
          if (isMounted && meta) {
            updateImageMetadata(activeImage.path, {
              camera: meta.camera || null,
              lens: meta.lens || null,
              iso: meta.iso || null,
              aperture: meta.aperture || null,
              shutter: meta.shutter || null,
              focal_length: meta.focal_length || null,
              exposure_bias: meta.exposure_bias || null,
              width: meta.width ?? null,
              height: meta.height ?? null,
              date: meta.date || activeImage.date,
              date_modified: meta.date_modified ?? null,
              is_raw: meta.is_raw ?? activeImage.is_raw,
              is_monochrome_sensor: meta.is_monochrome_sensor ?? false,
              is_monochrome_preview: meta.is_monochrome_preview ?? false,
              latitude: meta.latitude ?? null,
              longitude: meta.longitude ?? null,
              altitude: meta.altitude ?? null,
            });
          }
        })
        .catch(console.error);

      return () => { isMounted = false; };
    }
  }, [activeImage?.path, updateImageMetadata]);

  const isVideo = activeImage ? (activeImage.is_video ?? isVideoFilename(activeImage.name)) : false;
  const extension = activeImage?.name.split('.').pop()?.toUpperCase() || '';
  const isRaw = !isVideo && (activeImage?.is_raw ?? ['CR2', 'CR3', 'ARW', 'NEF', 'DNG', 'ORF', 'RAF', 'RW2', 'PEF', '3FR'].includes(extension));

  return (
    <div data-tour="library-inspector" className="w-full h-full flex-shrink-0 bg-app-panel flex flex-col min-h-0 overflow-hidden">
      {/* Inspector Header */}
      <div className="px-4 py-3 border-b border-app-border flex items-center justify-between flex-shrink-0">
        <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
          {t('inspector.title')}
        </h2>
        <button className="p-1 rounded hover:bg-app-hover transition-colors cursor-pointer" onClick={close}>
          <X className="w-3.5 h-3.5 text-txt-tertiary" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!activeImage ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-app-card border border-app-border flex items-center justify-center mb-3">
              <MousePointerClick className="w-6 h-6 text-txt-tertiary" />
            </div>
            <p className="text-sm font-semibold text-txt-primary">{t('inspector.noSelection')}</p>
            <p className="text-xs text-txt-tertiary mt-1 max-w-[200px]">{t('inspector.noSelectionDesc')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <InspectorPreviewCard
              activeImage={activeImage}
              isCollapsed={isCollapsed('preview')}
              onToggle={() => toggleSection('preview')}
              extension={extension}
              isVideo={isVideo}
              isRaw={isRaw}
            />

            <InspectorCullingCard
              activeImage={activeImage}
              isCollapsed={isCollapsed('culling')}
              onToggle={() => toggleSection('culling')}
            />

            <InspectorTagsCard
              activeImage={activeImage}
              scopedImages={scopedImages}
              isCollapsed={isCollapsed('tags')}
              onToggle={() => toggleSection('tags')}
            />

            <InspectorFileInfoCard
              activeImage={activeImage}
              isCollapsed={isCollapsed('fileInfo')}
              onToggle={() => toggleSection('fileInfo')}
              extension={extension}
              isRaw={isRaw}
            />

            <InspectorCameraCard
              activeImage={activeImage}
              isCollapsed={isCollapsed('camera')}
              onToggle={() => toggleSection('camera')}
            />

            <InspectorGpsCard
              activeImage={activeImage}
              isCollapsed={isCollapsed('location')}
              onToggle={() => toggleSection('location')}
            />
          </div>
        )}
      </div>
    </div>
  );
}
