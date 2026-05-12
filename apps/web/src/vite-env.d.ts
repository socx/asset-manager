/// <reference types="vite/client" />

declare module 'pdfjs-dist/build/pdf.mjs' {
  export * from 'pdfjs-dist';
}

declare module 'pdfjs-dist/build/pdf.worker.min.mjs' {
  const src: string;
  export default src;
}
