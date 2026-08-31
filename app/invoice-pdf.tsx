'use client';

import { useEffect, useState, useCallback, ChangeEvent, useImperativeHandle, forwardRef } from 'react';
import { AlertCircle, CheckCircle, X } from 'lucide-react';

interface PDFToExcelConverterProps {
    sendDataToParent: (data: string[][]) => void;
    saveAllowed: boolean;
    uploadLocked?: boolean;
    lockedCount?: number;
    onRevertClosingStock?: () => void;
    onReset?: () => void;
    onShowIdocs?: (idocs: Array<{id: string, idocNumber: string, fileName: string, timestamp: string}>) => void;
    onIdocExtracted?: (idoc: string, fileName: string, invoiceDate: string, usedFallback?: boolean) => void;
}

interface PDFToExcelConverterRef {
    confirmProcessing: () => void;
    loadAllIdocs: () => Promise<void>;
}

type TableData = string[][];

interface TextItem {
    text: string;
    x: number;
    y: number;
    w: number;
    page: number;
}

const INVOICE_HEADERS = ['Sl.No.', 'Brand Number', 'Brand Name', 'Product Type', 'Pack Type', 'Pack Qty/Size', 'Qty(Cases)', 'Qty(Bottles)', 'Rate/Case', 'Unit Rate/Btl', 'Total'];

// The depot has shipped ICDCs headed both "Sl.No." and "S.No.", with different
// column widths, so the table is located by geometry rather than by line text:
// a wide layout keeps each line item on one line, a narrow one wraps the brand
// name and pack size over three.
const SNO_HEADER = /^S\.?\s*l?\.?\s*No\.?$/i;
// first item of the totals block that follows the last line item
const SUMMARY_START = /^TIN$|^Particulars$|^Breakage|^Amount in words|Invoice\s*Value/i;
// page furniture that sits inside the table's y-range but is not table data
const NOISE = /^https?:\/\/|www\.|^\d{1,2}\/\d{1,2}\/\d{2},|^ICDC$/i;
// The page number ("3/5") shares its line with the footer URL. It has to be
// matched by position rather than by shape: a 90 ml pack size renders as
// "96 / 90", which no pattern can tell apart from a page number.
const PAGE_FOOTER = /^https?:\/\/|printicdcs/i;

// Column anchors, matched against the header text items, left to right.
const COLUMN_ANCHORS: Array<{ col: number; re: RegExp }> = [
    { col: 0, re: SNO_HEADER },
    { col: 1, re: /^Number$/i },
    { col: 2, re: /^Brand\s+Name$/i },
    { col: 3, re: /^Product$/i },
    { col: 4, re: /^Pack$/i },
    { col: 5, re: /^(Pack\s*)?Qty\s*\/$/i },
    { col: 6, re: /^Qty\(Cases/i },
    { col: 7, re: /^Qty\(Bottles/i },
    { col: 8, re: /^Unit\s*Rate/i },
    { col: 10, re: /^Total$/i },
];

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

const parseInvoiceItems = (items: TextItem[]): TableData | null => {
    // 1. locate the header and derive the column anchor x positions
    const headerItem = items.find(i => SNO_HEADER.test(i.text.trim()));
    if (!headerItem) return null;

    const headerBand = items.filter(
        i => i.page === headerItem.page && i.y >= headerItem.y - 30 && i.y <= headerItem.y + 40
    );
    const headerBottom = Math.min(...headerBand.map(i => i.y));

    const anchors: Array<{ col: number; x: number }> = [];
    for (const { col, re } of COLUMN_ANCHORS) {
        // "Pack" labels both Pack Type and Pack Qty - col 4 is the leftmost one
        const hits = headerBand.filter(i => re.test(i.text.trim())).sort((a, b) => a.x - b.x);
        if (hits.length) anchors.push({ col, x: hits[0].x });
    }
    anchors.sort((a, b) => a.x - b.x);
    const snoAnchor = anchors.find(a => a.col === 0);
    if (!snoAnchor || !anchors.some(a => a.col === 10)) return null;

    // 2. find where the table ends (the totals block)
    const summary = items.find(
        i => SUMMARY_START.test(i.text.trim()) &&
            (i.page > headerItem.page || (i.page === headerItem.page && i.y < headerBottom))
    );
    const beforeSummary = (i: TextItem): boolean => {
        if (!summary) return true;
        if (i.page !== summary.page) return i.page < summary.page;
        return i.y > summary.y;
    };

    // 3. keep only the items inside the table body
    const footerY = new Map<number, number>();
    for (const i of items) {
        if (PAGE_FOOTER.test(i.text.trim())) footerY.set(i.page, i.y);
    }

    const body = items.filter(i => {
        if (NOISE.test(i.text.trim())) return false;
        if (!beforeSummary(i)) return false;
        if (i.page === headerItem.page && i.y >= headerBottom - 3) return false;
        const fy = footerY.get(i.page);
        if (fy !== undefined && Math.abs(i.y - fy) <= 5) return false;
        return true;
    });

    // a line item starts at a bare integer sitting in the Sl.No. column
    const records = body
        .filter(i => /^\d{1,3}$/.test(i.text.trim()) && Math.abs(i.x - snoAnchor.x) <= 20)
        .sort((a, b) => (a.page !== b.page ? a.page - b.page : b.y - a.y));
    if (!records.length) return null;

    // 4. group the items into one band per line item
    const bands = records.map((anchor, idx) => {
        const prev = records[idx - 1];
        const next = records[idx + 1];
        return {
            anchor,
            top: prev && prev.page === anchor.page ? (prev.y + anchor.y) / 2 : Infinity,
            bottom: next && next.page === anchor.page ? (anchor.y + next.y) / 2 : -Infinity,
            items: [] as TextItem[],
        };
    });
    for (const item of body) {
        const band = bands.find(b => b.anchor.page === item.page && item.y < b.top && item.y > b.bottom);
        if (band) band.items.push(item);
    }

    // 5. discover the columns by clustering the data items' x-spans
    const spans = bands.flatMap(b => b.items).map(i => [i.x, i.x + (i.w || 0)]).sort((a, b) => a[0] - b[0]);
    const clusters: number[][] = [];
    for (const [lo, hi] of spans) {
        const last = clusters[clusters.length - 1];
        if (last && lo <= last[1] + 2) last[1] = Math.max(last[1], hi);
        else clusters.push([lo, hi]);
    }

    const bounds: number[] = [];
    for (let i = 0; i < clusters.length - 1; i++) bounds.push((clusters[i][1] + clusters[i + 1][0]) / 2);
    const clusterOf = (x: number): number => {
        let k = 0;
        while (k < bounds.length && x >= bounds[k]) k++;
        return k;
    };

    // Clusters and header anchors are both left-to-right, so zip them when their
    // counts agree - more reliable than nearest-x, since a header label can sit
    // closer to the neighbouring column's data than to its own.
    const clusterCol = new Map<number, number>();
    if (clusters.length === anchors.length) {
        anchors.forEach((a, k) => clusterCol.set(k, a.col));
    } else {
        clusters.forEach((c, k) => {
            let best = anchors[0];
            let bestD = Infinity;
            for (const a of anchors) {
                const d = a.x >= c[0] && a.x <= c[1] ? 0 : Math.min(Math.abs(a.x - c[0]), Math.abs(a.x - c[1]));
                if (d < bestD) { bestD = d; best = a; }
            }
            clusterCol.set(k, best.col);
        });
    }

    // 6. emit one row per line item
    const rows: TableData = [INVOICE_HEADERS];
    for (const band of bands) {
        const cells: string[][] = Array.from({ length: 11 }, () => []);
        const sorted = [...band.items].sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x));
        for (const item of sorted) {
            const col = clusterCol.get(clusterOf(item.x));
            if (col !== undefined) cells[col].push(item.text.trim());
        }
        const row = cells.map(parts => norm(parts.join(' ')));

        // the Rate/Case cell holds "<per case> / <per bottle>"
        if (row[8].includes('/')) {
            const [perCase, perBottle] = row[8].split('/');
            row[8] = norm(perCase);
            row[9] = norm(perBottle);
        }
        row[1] = row[1] ? row[1].padStart(4, '0') : '';
        // a line item can straddle a page break, leaving a stray "ml" in the next
        // record's cell - rebuild the pack size from the first "<qty> / <size>" pair
        const pack = row[5].match(/(\d+)\s*\/\s*(\d+)/);
        row[5] = pack ? `${pack[1]} / ${pack[2]} ml` : row[5];

        rows.push(row);
    }
    return rows;
};

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBf-dvyFjMttuLD43V4MBBRbuvfbwBRKsI",
    authDomain: "wines-sheet.firebaseapp.com",
    projectId: "wines-sheet",
    storageBucket: "wines-sheet.firebasestorage.app",
    messagingSenderId: "313820033015",
    appId: "1:313820033015:web:75cc4ccf84217324bf08f2",
    measurementId: "G-C8JCT3DNNH"
};

const PDFToExcelConverter = forwardRef<PDFToExcelConverterRef, PDFToExcelConverterProps>(({ sendDataToParent, saveAllowed, uploadLocked = false, lockedCount = 0, onRevertClosingStock, onReset, onShowIdocs, onIdocExtracted }, ref) => {
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [tableData, setTableData] = useState<TableData>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [converted, setConverted] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [idocNumber, setIdocNumber] = useState<string>('');
    const [invoiceDate, setInvoiceDate] = useState<string>('');
    const [processedIdocs, setProcessedIdocs] = useState<Set<string>>(new Set());
    const [showDuplicateModal, setShowDuplicateModal] = useState<boolean>(false);
    const [duplicateIdoc, setDuplicateIdoc] = useState<string>('');
    const [firebaseReady, setFirebaseReady] = useState<boolean>(false);
    const [showIdocList, setShowIdocList] = useState<boolean>(false);
    const [idocList, setIdocList] = useState<Array<{id: string, idocNumber: string, fileName: string, timestamp: string, invoiceDate?: string}>>([]);

    useEffect(() => {
        const loadFirebase = async () => {
            try {
                const appScript = document.createElement('script');
                appScript.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js';
                await new Promise<void>((resolve, reject) => {
                    appScript.onload = () => resolve();
                    appScript.onerror = () => reject(new Error('Failed to load Firebase App'));
                    document.head.appendChild(appScript);
                });

                const firestoreScript = document.createElement('script');
                firestoreScript.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js';
                await new Promise<void>((resolve, reject) => {
                    firestoreScript.onload = () => resolve();
                    firestoreScript.onerror = () => reject(new Error('Failed to load Firebase Firestore'));
                    document.head.appendChild(firestoreScript);
                });

                const firebase = (window as any).firebase;
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }

                setFirebaseReady(true);

                const db = firebase.firestore();
                const querySnapshot = await db.collection('processedIdocs').get();
                const existingIdocs = new Set<string>();
                querySnapshot.docs.forEach((doc: any) => {
                    existingIdocs.add(doc.data().idocNumber);
                });
                setProcessedIdocs(existingIdocs);
            } catch (err) {
                console.error('Error loading Firebase:', err);
            }
        };

        loadFirebase();
    }, []);

    useEffect(() => {
        if (!showDuplicateModal) {
            sendDataToParent(tableData);
        }
    }, [tableData, sendDataToParent, showDuplicateModal]);

    const checkIdocInDatabase = async (idoc: string): Promise<boolean> => {
        try {
            const firebase = (window as any).firebase;
            const db = firebase.firestore();
            const querySnapshot = await db.collection('processedIdocs')
                .where('idocNumber', '==', idoc)
                .get();
            return !querySnapshot.empty;
        } catch (err) {
            console.error('Error checking iDOC in database:', err);
            return false;
        }
    };

    const extractWithPdfJs = useCallback(async (file: File): Promise<{ idocNumber: string; invoiceDate: string; tableData: TableData }> => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        await new Promise<void>((resolve, reject) => {
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load PDF.js'));
            document.head.appendChild(script);
        });

        const pdfjsLib = (window as any)['pdfjs-dist/build/pdf'];
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const allTextItems: TextItem[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            textContent.items.forEach((item: any) => {
                if (item.str && item.str.trim()) {
                    allTextItems.push({ text: item.str, x: item.transform[4], y: item.transform[5], w: item.width, page: i });
                }
            });
        }

        allTextItems.sort((a, b) => {
            if (a.page !== b.page) return a.page - b.page;
            if (Math.abs(a.y - b.y) > 5) return b.y - a.y;
            return a.x - b.x;
        });

        const fullText = allTextItems.map(item => item.text).join(' ');
        const idocMatch = fullText.match(/\bICDC\d{15,20}\b/i);
        const idocNumber = idocMatch ? idocMatch[0] : '';
        const dateMatch = fullText.match(/Invoice Date:\s*(\d{1,2}[-\/]\w{3}[-\/]\d{4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
        const invoiceDate = dateMatch ? dateMatch[1] : '';
        const tableData = parseInvoiceItems(allTextItems)
            ?? [INVOICE_HEADERS, ['', '', 'No invoice data found in PDF', '', '', '', '', '', '', '', '']];

        return { idocNumber, invoiceDate, tableData };
    }, []);

    const extractFromPDF = useCallback(async (file: File): Promise<void> => {
        setLoading(true);
        setConverted(false);
        setError('');

        let extractedIdoc = '';
        let extractedDate = '';
        let extractedTable: TableData = [];
        let usedFallback = false;

        try {
            // Try Claude API first
            const formData = new FormData();
            formData.append('pdf', file);
            const response = await fetch('/api/extract-pdf', { method: 'POST', body: formData });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'API failed');
            }

            const result = await response.json();
            extractedIdoc = result.idocNumber || '';
            extractedDate = result.invoiceDate || '';
            extractedTable = result.tableData || [];
            console.log('Claude API extraction success');
        } catch (apiErr: any) {
            // Claude API failed — fall back to pdf.js
            console.warn('Claude API failed, falling back to pdf.js:', apiErr.message);
            usedFallback = true;
            try {
                const fallback = await extractWithPdfJs(file);
                extractedIdoc = fallback.idocNumber;
                extractedDate = fallback.invoiceDate;
                extractedTable = fallback.tableData;
                console.log('pdf.js fallback extraction success');
            } catch (fallbackErr: any) {
                setError('Failed to process PDF. Please try again.');
                setLoading(false);
                return;
            }
        }

        if (!extractedIdoc) {
            setError('No ICDC number found in this PDF');
            setLoading(false);
            resetPdfState();
            return;
        }

        console.log('Extracted ICDC:', extractedIdoc, usedFallback ? '(via pdf.js fallback)' : '(via Claude API)');
        console.log('Extracted Date:', extractedDate);
        console.log('Extracted Table rows:', extractedTable.length);

        const isDuplicate = await checkIdocInDatabase(extractedIdoc);
        if (isDuplicate) {
            setDuplicateIdoc(extractedIdoc);
            setShowDuplicateModal(true);
            setLoading(false);
            resetPdfState();
            return;
        }

        setIdocNumber(extractedIdoc);
        setInvoiceDate(extractedDate);
        setTableData(extractedTable);
        setConverted(true);

        if (onIdocExtracted) {
            onIdocExtracted(extractedIdoc, file.name, extractedDate, usedFallback);
        }

        setLoading(false);
    }, [processedIdocs, firebaseReady, extractWithPdfJs]);

    const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!firebaseReady) {
            setError('Please wait for Firebase to initialize');
            e.target.value = '';
            return;
        }

        if (file.type !== 'application/pdf') {
            setError('Please upload a PDF file');
            e.target.value = '';
            return;
        }

        setPdfFile(file);
        setTableData([]);
        await extractFromPDF(file);
        e.target.value = '';
    };

    const closeDuplicateModal = (): void => {
        setShowDuplicateModal(false);
        setDuplicateIdoc('');
        setTableData([]);
        resetPdfState();
    };

    const resetPdfState = (): void => {
        setPdfFile(null);
        setTableData([]);
        setConverted(false);
        setError('');
        setIdocNumber('');
        setInvoiceDate('');
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        if (onReset) onReset();
    };

    const confirmProcessing = (): void => {
        if (idocNumber) {
            setProcessedIdocs(prev => new Set([...prev, idocNumber]));
        }
    };

    const loadAllIdocs = async (): Promise<void> => {
        try {
            const firebase = (window as any).firebase;
            const db = firebase.firestore();
            const querySnapshot = await db.collection('processedIdocs')
                .orderBy('timestamp', 'desc')
                .get();

            const idocs = querySnapshot.docs.map((doc: any) => ({
                id: doc.id,
                idocNumber: doc.data().idocNumber,
                fileName: doc.data().fileName,
                timestamp: doc.data().timestamp,
                invoiceDate: doc.data().invoiceDate
            }));

            const existingIdocs = new Set<string>();
            querySnapshot.docs.forEach((doc: any) => {
                existingIdocs.add(doc.data().idocNumber);
            });
            setProcessedIdocs(existingIdocs);
            setIdocList(idocs);

            if (onShowIdocs) {
                onShowIdocs(idocs);
            } else {
                setShowIdocList(true);
            }
        } catch (err) {
            console.error('Error loading iDOCs:', err);
            setError('Failed to load iDOC list');
        }
    };

    useImperativeHandle(ref, () => ({
        confirmProcessing,
        loadAllIdocs
    }));

    return (
        <>
        {/* Full-screen loader while Claude is processing invoice PDF */}
        {loading && (
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 max-w-sm w-full mx-4">
                    <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                    <p className="text-gray-800 font-bold text-lg text-center">Reading Invoice PDF</p>
                    <p className="text-gray-500 text-sm text-center">Claude AI is extracting table data, ICDC number and invoice date...</p>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="h-2 bg-blue-500 rounded-full animate-pulse w-2/3"></div>
                    </div>
                </div>
            </div>
        )}

        <div className="bg-gradient-to-br from-green-50 to-blue-100 sm:p-6 md:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8">
                    {error && (
                        <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-center gap-3">
                            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                            <p className="text-red-700">{error}</p>
                        </div>
                    )}

                    {converted && (
                        <div className="mb-6 bg-green-50 border-2 border-green-200 rounded-xl p-4 flex items-center gap-3">
                            <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                            <div>
                                <p className="text-green-700 font-semibold">PDF successfully processed!</p>
                                {idocNumber && (
                                    <p className="text-green-600 text-sm">
                                        iDOC Number: <span className="font-mono">{idocNumber}</span>
                                    </p>
                                )}
                                {invoiceDate && (
                                    <p className="text-green-600 text-sm">
                                        Invoice Date: <span className="font-mono">{invoiceDate}</span>
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {idocNumber && (
                        <div className="mb-6 bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                            <p className="text-sm text-blue-600 font-semibold">Current iDOC: {idocNumber}</p>
                            <p className="text-xs text-blue-500 mt-1">Total processed: {processedIdocs.size}</p>
                        </div>
                    )}

                    {!firebaseReady && (
                        <div className="mb-6 bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 flex items-center gap-3">
                            <div className="w-5 h-5 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-yellow-700 font-semibold">Initializing... Please wait</p>
                        </div>
                    )}

                    <div className="space-y-4">
                        <label className="block">
                            <span className="text-gray-700 font-medium">
                                {uploadLocked ? '🔒 Upload Invoice PDF' : 'Upload Invoice PDF'}
                            </span>
                            <input
                                type="file"
                                accept=".pdf"
                                onChange={handleFileUpload}
                                disabled={!firebaseReady || loading || uploadLocked}
                                className={`mt-2 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold ${firebaseReady && !loading && !uploadLocked ? 'file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100' : 'file:bg-gray-200 file:text-gray-400 cursor-not-allowed'}`}
                            />
                            {!firebaseReady && (
                                <p className="mt-2 text-xs text-gray-500">File upload will be enabled once ready</p>
                            )}
                        </label>

                        {uploadLocked && (
                            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
                                <p className="text-sm text-amber-800 font-semibold">
                                    Closing stock enter chestunnaru ({lockedCount} items ayindi).
                                </p>
                                <p className="mt-1 text-xs text-amber-700">
                                    Kotta invoice add cheste, ippatike count chesina numbers tappu avutayi.
                                    Anduke modata closing stock revert cheyyali.
                                </p>
                                <button
                                    type="button"
                                    onClick={onRevertClosingStock}
                                    className="mt-3 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 transition"
                                >
                                    Revert closing stock
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {showIdocList && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
                        <div className="bg-purple-600 text-white p-4 flex justify-between items-center">
                            <h2 className="text-xl font-bold">ICDC IDs ({idocList.length})</h2>
                            <button
                                onClick={() => setShowIdocList(false)}
                                className="text-white hover:bg-purple-700 rounded-full p-2 transition"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1">
                            {idocList.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">No PDFs processed yet</p>
                            ) : (
                                <div className="space-y-1">
                                    {idocList.map((item) => (
                                        <div key={item.id} className="p-2 hover:bg-purple-50 rounded">
                                            <p className="font-mono text-sm text-purple-700">{item.idocNumber}</p>
                                            {item.invoiceDate && (
                                                <p className="text-xs text-gray-600 mt-1">Date: {item.invoiceDate}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showDuplicateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-red-100 rounded-full">
                                    <AlertCircle className="w-8 h-8 text-red-600" />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-800">Duplicate PDF Detected</h2>
                            </div>
                            <button
                                onClick={closeDuplicateModal}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="mb-6">
                            <p className="text-gray-700 mb-4">
                                This PDF has already been processed. The iDOC number already exists:
                            </p>
                            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                                <p className="font-mono text-lg font-bold text-red-700 text-center">{duplicateIdoc}</p>
                            </div>
                            <p className="text-sm text-gray-600 mt-4">
                                Please upload a different PDF with a unique iDOC number.
                            </p>
                        </div>
                        <button
                            onClick={closeDuplicateModal}
                            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                        >
                            OK, Got It
                        </button>
                    </div>
                </div>
            )}
        </div>
        </>
    );
});

PDFToExcelConverter.displayName = 'PDFToExcelConverter';

export default PDFToExcelConverter;
export type { PDFToExcelConverterRef };
