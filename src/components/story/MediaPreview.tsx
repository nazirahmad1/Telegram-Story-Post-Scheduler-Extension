import { useEffect, useState } from "react";

interface MediaPreviewProps {
  file: File;
  caption?: string;
}

/**
 * Just the preview surface — no upload/remove controls here, callers keep
 * those in their own dropzone UI. Revokes its object URL on unmount/file
 * change so switching files repeatedly doesn't leak memory.
 */
export function MediaPreview({ file, caption }: MediaPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const isVideo = file.type.startsWith("video/");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return null;

  return (
    <div className="story-preview">
      {isVideo ? (
        <video src={url} muted autoPlay loop playsInline />
      ) : (
        <img src={url} alt="" />
      )}
      {caption && (
        <div className="story-preview-caption">
          <span>{caption}</span>
        </div>
      )}
    </div>
  );
}
