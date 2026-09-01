// Loads pdf.js from the CDN once per page and hands back the library.

const PDFJS_VERSION = '3.11.174';
const BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
const GLOBAL_KEY = 'pdfjs-dist/build/pdf';

let pending: Promise<any> | null = null;

export function loadPdfJs(): Promise<any> {
    const existing = (window as any)[GLOBAL_KEY];
    if (existing) return Promise.resolve(existing);
    if (pending) return pending;

    pending = new Promise<any>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${BASE}/pdf.min.js`;
        script.onload = () => {
            const lib = (window as any)[GLOBAL_KEY];
            if (!lib) {
                reject(new Error('PDF.js loaded but did not register itself'));
                return;
            }
            lib.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.js`;
            resolve(lib);
        };
        script.onerror = () => {
            pending = null;
            reject(new Error('Could not load PDF.js. Check your internet connection.'));
        };
        document.head.appendChild(script);
    });

    return pending;
}
