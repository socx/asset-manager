import { useState } from 'react';

export default function ThumbnailImage({
  thumbnailUrl,
  rawUrl,
  alt,
  className,
  lqip,
}: {
  thumbnailUrl: string;
  rawUrl: string;
  alt?: string;
  className?: string;
  lqip?: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const src = thumbnailUrl || rawUrl;

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`} style={{ width: '48px', height: '32px' }}>
      {lqip ? (
        <img
          src={lqip}
          alt="placeholder"
          aria-hidden
          className={`absolute inset-0 w-full h-full object-cover rounded transition-opacity duration-300 ${loaded ? 'opacity-0' : 'opacity-100 blur-sm'}`}
        />
      ) : null}
      <img
        src={src}
        alt={alt ?? ''}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover rounded transition-transform duration-300 ${loaded ? 'scale-100 blur-0' : 'scale-105 blur-sm'}`}
      />
    </div>
  );
}
