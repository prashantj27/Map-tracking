import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { projectImagesQuery, deleteProjectImage } from '../../lib/imageStore';
import { usePermission } from '../../lib/permissions';
import { PLACEHOLDER_IMAGE } from '../../lib/projects';
import { ImageViewer, type GalleryImage } from './ImageViewer';
import { ImageUploader } from './ImageUploader';

/**
 * Project gallery. Shows uploaded images (linked by Project_Code) when any exist, otherwise a
 * single placeholder. When real photos are uploaded the placeholder is replaced automatically —
 * no code change required. Clicking a thumbnail opens the in-platform fullscreen viewer.
 */
export function ProjectGallery({ projectCode }: { projectCode: string }) {
  const uploaded = useLiveQuery(() => projectImagesQuery(projectCode), [projectCode]) || [];
  const canUpload = usePermission('project.image.upload');
  const canDelete = usePermission('project.image.delete');
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Object URLs cached per image id so surviving images keep their URL across add/delete (no
  // thumbnail/viewer flicker). Revoke only URLs whose id disappeared; revoke all on unmount.
  const urlCache = useRef(new Map<number, string>());
  const urls = useMemo(() => {
    const cache = urlCache.current;
    const liveIds = new Set(uploaded.map((u) => u.id));
    for (const [id, url] of cache) {
      if (!liveIds.has(id)) { URL.revokeObjectURL(url); cache.delete(id); }
    }
    return uploaded.map((u) => {
      let url = cache.get(u.id!);
      if (!url) { url = URL.createObjectURL(u.blob); cache.set(u.id!, url); }
      return url;
    });
  }, [uploaded]);
  useEffect(() => {
    const cache = urlCache.current;
    return () => { for (const url of cache.values()) URL.revokeObjectURL(url); cache.clear(); };
  }, []);

  const images: GalleryImage[] = uploaded.length
    ? uploaded.map((u, i) => ({ key: `up-${u.id}`, url: urls[i], name: u.name, imageId: u.id }))
    : [{ key: 'placeholder', url: PLACEHOLDER_IMAGE, name: 'sports-infrastructure.svg' }];

  const isPlaceholder = uploaded.length === 0;

  return (
    <div className="project-gallery">
      {isPlaceholder && (
        <p className="gallery-note dim small">
          Showing a placeholder image. Uploaded photos will appear here automatically.
        </p>
      )}

      <div className="gallery-grid">
        {images.map((im, i) => (
          <button
            key={im.key}
            className={`gallery-thumb${isPlaceholder ? ' placeholder' : ''}`}
            onClick={() => setViewerIndex(i)}
            aria-label={`Open image ${i + 1}`}
          >
            <img src={im.url} alt={im.name} loading="lazy" />
          </button>
        ))}
      </div>

      {canUpload && <ImageUploader projectCode={projectCode} />}

      {viewerIndex !== null && (
        <ImageViewer
          images={images}
          index={viewerIndex}
          onIndex={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          canDelete={canDelete}
          onDelete={async (im) => {
            if (im.imageId == null) return;
            await deleteProjectImage(im.imageId);
            if (uploaded.length <= 1) setViewerIndex(null); // deleted the last upload — close the viewer
          }}
        />
      )}
    </div>
  );
}
