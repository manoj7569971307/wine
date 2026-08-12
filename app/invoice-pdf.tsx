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

    const parseInvoiceText = useCallback((rows: string[]): TableData => {
        const headers = ['Sl.No.', 'Brand Number', 'Brand Name', 'Product Type', 'Pack Type', 'Pack Qty/Size', 'Qty(Cases)', 'Qty(Bottles)', 'Rate/Case', 'Unit Rate/Btl', 'Total'];
        const tableData: TableData = [headers];
        let currentItem: string[] | null = null;
        let foundTableStart = false;

        for (let i = 0; i < rows.length; i++) {
            const line = rows[i].trim();
            if (!foundTableStart) {
                if (line.includes('Sl.No') && line.includes('Brand')) { foundTableStart = true; }
                continue;
            }
            if (line.includes('Invoice Qty') || line.includes('Particulars')) break;

            const match = line.match(/^(\d{1,2})\s+(\d{3,5})\s+(.+)/);
            if (match) {
                if (currentItem) tableData.push(currentItem);
                const [, slNo, brandNo, restOfLine] = match;
                const productTypeMatch = restOfLine.match(/(IML|Beer|Duty Paid)/);
                let brandName = '', remaining = '';
                if (productTypeMatch) {
                    brandName = restOfLine.substring(0, productTypeMatch.index).trim();
                    remaining = restOfLine.substring(productTypeMatch.index!).trim();
                } else { brandName = restOfLine; }
                const parts = remaining.split(/\s+/);
                const packQtyMatch = remaining.match(/(\d+\s*\/\s*\d+\s*ml)/);
                const packQty = packQtyMatch ? packQtyMatch[1] : '';
                const afterPackQty = packQtyMatch ? remaining.substring(remaining.indexOf(packQtyMatch[1]) + packQtyMatch[1].length).trim() : remaining;
                const numbers = afterPackQty.match(/[\d,]+\.?\d*/g) || [];
                currentItem = [slNo, brandNo.padStart(4, '0'), brandName, parts[0] || '', parts[1] || '', packQty, numbers[0] || '', numbers[1] || '', numbers[2] || '', numbers[3] || '', numbers[4] || ''];
            } else if (currentItem) {
                const hasProductType = /IML|Beer|Duty Paid/.test(line);
                const startsWithNumber = /^\d/.test(line);
                const isURL = /https?:\/\/|www\./.test(line);
                if (!hasProductType && !startsWithNumber && !isURL && line.length < 100) {
                    currentItem[2] += ' ' + line;
                } else if (hasProductType && !currentItem[3]) {
                    const parts = line.split(/\s+/);
                    if (!currentItem[3]) currentItem[3] = parts[0] || '';
                    if (!currentItem[4]) currentItem[4] = parts[1] || '';
                    const packMatch = line.match(/(\d+\s*\/\s*\d+\s*ml)/);
                    if (packMatch && !currentItem[5]) currentItem[5] = packMatch[1];
                    const nums = line.match(/[\d,]+\.?\d*/g) || [];
                    let numIndex = 0;
                    for (let j = 6; j < 11; j++) {
                        if (!currentItem[j] && nums[numIndex]) { currentItem[j] = nums[numIndex]; numIndex++; }
                    }
                }
            }
        }
        if (currentItem) tableData.push(currentItem);
        if (tableData.length === 1) tableData.push(['', '', 'No invoice data found in PDF', '', '', '', '', '', '', '', '']);
        return tableData;
    }, []);

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
        const allTextItems: { text: string; x: number; y: number; page: number }[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            textContent.items.forEach((item: any) => {
                if (item.str && item.str.trim()) {
                    allTextItems.push({ text: item.str, x: item.transform[4], y: item.transform[5], page: i });
                }
            });
        }

        allTextItems.sort((a, b) => {
            if (a.page !== b.page) return a.page - b.page;
            if (Math.abs(a.y - b.y) > 5) return b.y - a.y;
            return a.x - b.x;
        });

        const rows: string[] = [];
        let currentRow: typeof allTextItems = [];
        let lastY = allTextItems[0]?.y;
        allTextItems.forEach(item => {
            if (Math.abs(item.y - lastY) > 5) {
                if (currentRow.length > 0) { rows.push(currentRow.map(r => r.text).join(' ')); currentRow = []; }
                lastY = item.y;
            }
            currentRow.push(item);
        });
        if (currentRow.length > 0) rows.push(currentRow.map(r => r.text).join(' '));

        const fullText = allTextItems.map(item => item.text).join(' ');
        const idocMatch = fullText.match(/\bICDC\d{15,20}\b/i);
        const idocNumber = idocMatch ? idocMatch[0] : '';
        const dateMatch = fullText.match(/Invoice Date:\s*(\d{1,2}[-\/]\w{3}[-\/]\d{4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
        const invoiceDate = dateMatch ? dateMatch[1] : '';
        const tableData = parseInvoiceText(rows);

        return { idocNumber, invoiceDate, tableData };
    }, [parseInvoiceText]);

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
