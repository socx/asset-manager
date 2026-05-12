import { useEffect, useState } from 'react';
import PdfPreview from './PdfPreview';

export default function ThumbnailImage({
  thumbnailUrl,
  rawUrl,
  alt,
  className,
  lqip,
  accessToken,
  mimeType,
}: {
  thumbnailUrl: string;
  rawUrl: string;
  alt?: string;
  className?: string;
  lqip?: string | null;
  accessToken?: string | null;
  mimeType?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string>(thumbnailUrl || rawUrl);
  const src = thumbnailUrl || rawUrl;

  useEffect(() => {
    setLoaded(false);

    if (!accessToken) {
      setResolvedSrc(src);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    void (async () => {
      try {
        const res = await fetch(src, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
          throw new Error(`Preview request failed: ${res.status}`);
        }

        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setResolvedSrc(objectUrl);
        }
      } catch {
        if (!cancelled) {
          setResolvedSrc(src);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, src]);

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      {mimeType === 'application/pdf' ? (
        <PdfPreview
          src={rawUrl || thumbnailUrl}
          accessToken={accessToken}
          title={alt}
          pageLimit={1}
          className="h-full w-full"
        />
      ) : (
        <>
          {lqip ? (
            <img
              src={lqip}
              alt="placeholder"
              aria-hidden
              className={`absolute inset-0 h-full w-full object-cover rounded transition-opacity duration-300 ${loaded ? 'opacity-0' : 'opacity-100 blur-sm'}`}
            />
          ) : null}
          <img
            src={resolvedSrc}
            alt={alt ?? ''}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className={`h-full w-full object-cover rounded transition-transform duration-300 ${loaded ? 'scale-100 blur-0' : 'scale-105 blur-sm'}`}
          />
        </>
      )}
    </div>
  );
}
