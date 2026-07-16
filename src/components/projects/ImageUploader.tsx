import { useRef, useState } from 'react';
import { addProjectImages } from '../../lib/imageStore';

/**
 * Uploads images for a project (linked by Project_Code). Supports drag & drop, multiple
 * selection, and mobile camera capture. On success the gallery's live query refreshes
 * automatically — no callback plumbing needed.
 */
export function ImageUploader({ projectCode }: { projectCode: string }) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || (files as FileList).length === 0) return;
    setBusy(true);
    try {
      await addProjectImages(projectCode, files as FileList);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`img-uploader${dragOver ? ' dragover' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
    >
      <div className="img-uploader-icon" aria-hidden="true">＋</div>
      <div className="img-uploader-text">
        <strong>Upload Images</strong>
        <span className="dim small">Drag &amp; drop, or choose files</span>
      </div>
      <div className="img-uploader-actions">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Uploading…' : 'Choose files'}
        </button>
        <button type="button" className="secondary" onClick={() => cameraRef.current?.click()} disabled={busy}>
          <span aria-hidden="true">📷</span> Camera
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}
