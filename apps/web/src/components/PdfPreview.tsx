import { useEffect, useRef, useState } from 'react';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type RenderedPage = {
  dataUrl: string;
  width: number;
  height: number;
};

type PdfPreviewProps = {
  src: string;
  accessToken?: string | null;
  title?: string;
  className?: string;
  pageLimit?: number;
};

export default function PdfPreview({
  src,
  accessToken,
  title,
  className,
  pageLimit,
}: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setPages([]);
    setIsLoading(true);
    setHasError(false);

    void (async () => {
      try {
        const response = await fetch(src, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });

        if (!response.ok) {
          throw new Error(`Preview request failed: ${response.status}`);
        }

        const pdfBytes = new Uint8Array(await response.arrayBuffer());
        const pdfjs = await import('pdfjs-dist/build/pdf.mjs');

        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

        const loadingTask = pdfjs.getDocument({ data: pdfBytes });
        const pdf = await loadingTask.promise;
        const totalPages = pageLimit ? Math.min(pageLimit, pdf.numPages) : pdf.numPages;
        const renderedPages: RenderedPage[] = [];

        for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const availableWidth = containerRef.current?.clientWidth ?? (pageLimit === 1 ? 240 : 900);
          const targetWidth = pageLimit === 1 ? Math.min(availableWidth, 240) : Math.min(availableWidth, 900);
          const scale = Math.max(targetWidth / baseViewport.width, 0.6);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');

          if (!context) {
            throw new Error('Canvas rendering is unavailable.');
          }

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);

          await page.render({ canvasContext: context, viewport }).promise;

          renderedPages.push({
            dataUrl: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height,
          });

          page.cleanup();
        }

        await pdf.destroy();

        if (!cancelled) {
          setPages(renderedPages);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setPages([]);
          setHasError(true);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, pageLimit, src]);

  return (
    <div ref={containerRef} className={className}>
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center bg-white text-xs font-semibold uppercase tracking-wide text-red-600 dark:bg-gray-900 dark:text-red-400">
          PDF
        </div>
      ) : hasError || pages.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center bg-white text-xs font-semibold uppercase tracking-wide text-red-600 dark:bg-gray-900 dark:text-red-400">
          PDF
        </div>
      ) : pageLimit === 1 ? (
        <img
          src={pages[0].dataUrl}
          alt={title ?? 'PDF preview'}
          className="h-full w-full object-contain bg-white"
        />
      ) : (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          {pages.map((page, index) => (
            <img
              key={`${src}-${index + 1}`}
              src={page.dataUrl}
              alt={`${title ?? 'PDF preview'} page ${index + 1}`}
              className="w-full rounded bg-white object-contain shadow-sm"
              width={page.width}
              height={page.height}
            />
          ))}
        </div>
      )}
    </div>
  );
}