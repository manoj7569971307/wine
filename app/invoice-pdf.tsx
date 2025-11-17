'use client';

import { useEffect, useState, useCallback, ChangeEvent, useImperativeHandle, forwardRef } from 'react';
import { AlertCircle, CheckCircle, X } from 'lucide-react';

interface TextItem {
    text: string;
    x: number;
    y: number;
    page: number;
}

interface PDFToExcelConverterProps {
    sendDataToParent: (data: string[][]) => void;
    saveAllowed: boolean;
    onReset?: () => void;
}

interface PDFToExcelConverterRef {
    confirmProcessing: () => void;
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

const PDFToExcelConverter = forwardRef<PDFToExcelConverterRef, PDFToExcelConverterProps>(({ sendDataToParent, saveAllowed, onReset }, ref) => {
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [tableData, setTableData] = useState<TableData>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [converted, setConverted] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [idocNumber, setIdocNumber] = useState<string>('');
    const [processedIdocs, setProcessedIdocs] = useState<Set<string>>(new Set());
    const [showDuplicateModal, setShowDuplicateModal] = useState<boolean>(false);
    const [duplicateIdoc, setDuplicateIdoc] = useState<string>('');
    const [firebaseReady, setFirebaseReady] = useState<boolean>(false);

    // Load Firebase SDK
    useEffect(() => {
        // Only save when parent sends true AND idoc exists AND not saved before
        if (saveAllowed && idocNumber && firebaseReady) {
            saveIdocToDatabase(idocNumber, pdfFile?.name || "unknown.pdf");
        }
    }, [saveAllowed, idocNumber, firebaseReady]);

    useEffect(() => {
        const loadFirebase = async () => {
            try {
                // Load Firebase App
                const appScript = document.createElement('script');
                appScript.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js';

                await new Promise<void>((resolve, reject) => {
                    appScript.onload = () => resolve();
                    appScript.onerror = () => reject(new Error('Failed to load Firebase App'));
                    document.head.appendChild(appScript);
                });

                // Load Firebase Firestore
                const firestoreScript = document.createElement('script');
                firestoreScript.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js';

                await new Promise<void>((resolve, reject) => {
                    firestoreScript.onload = () => resolve();
                    firestoreScript.onerror = () => reject(new Error('Failed to load Firebase Firestore'));
                    document.head.appendChild(firestoreScript);
                });

                // Initialize Firebase
                const firebase = (window as any).firebase;
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }

                setFirebaseReady(true);
            } catch (err) {
                console.error('Error loading Firebase:', err);
            }
        };

        loadFirebase();
    }, []);

    useEffect(() => {
        sendDataToParent(tableData);
    }, [tableData, sendDataToParent]);

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

    const saveIdocToDatabase = async (idoc: string, fileName: string) => {
        try {
            const firebase = (window as any).firebase;
            const db = firebase.firestore();

            await db.collection('processedIdocs').add({
                idocNumber: idoc,
                fileName: fileName,
                processedAt: firebase.firestore.FieldValue.serverTimestamp(),
                timestamp: new Date().toISOString()
            });

            return true;
        } catch (err) {
            console.error('Error saving to database:', err);
            return false;
        }
    };

    const parseInvoiceText = useCallback((rows: string[]): TableData => {
        const headers = [
            'Sl.No.',
            'Brand Number',
            'Brand Name',
            'Product Type',
            'Pack Type',
            'Pack Qty/Size',
            'Qty(Cases)',
            'Qty(Bottles)',
            'Rate/Case',
            'Unit Rate/Btl',
            'Total'
        ];

        const tableData: TableData = [headers];
        let currentItem: string[] | null = null;
        let foundTableStart = false;

        for (let i = 0; i < rows.length; i++) {
            const line = rows[i].trim();

            if (!foundTableStart) {
                if (line.includes('Sl.No') && line.includes('Brand')) {
                    foundTableStart = true;
                    continue;
                }
                continue;
            }

            if (line.includes('TIN') || line.includes('Particulars') || line.includes('Invoice Qty')) {
                break;
            }

            const match = line.match(/^(\d{1,2})\s+(\d{3,5})\s+(.+)/);

            if (match) {
                if (currentItem) {
                    tableData.push(currentItem);
                }

                const [, slNo, brandNo, restOfLine] = match;
                const productTypeMatch = restOfLine.match(/(IML|Beer|Duty Paid)/);

                let brandName = '';
                let remaining = '';

                if (productTypeMatch) {
                    brandName = restOfLine.substring(0, productTypeMatch.index).trim();
                    remaining = restOfLine.substring(productTypeMatch.index!).trim();
                } else {
                    brandName = restOfLine;
                }

                const parts = remaining.split(/\s+/);
                const productType = parts[0] || '';
                const packType = parts[1] || '';

                const packQtyMatch = remaining.match(/(\d+\s*\/\s*\d+\s*ml)/);
                const packQty = packQtyMatch ? packQtyMatch[1] : '';
                const afterPackQty = packQtyMatch
                    ? remaining.substring(remaining.indexOf(packQtyMatch[1]) + packQtyMatch[1].length).trim()
                    : remaining;

                const numbers = afterPackQty.match(/[\d,]+\.?\d*/g) || [];

                currentItem = [
                    slNo,
                    brandNo,
                    brandName,
                    productType,
                    packType,
                    packQty,
                    numbers[0] || '',
                    numbers[1] || '',
                    numbers[2] || '',
                    numbers[3] || '',
                    numbers[4] || ''
                ];
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
                    if (packMatch && !currentItem[5]) {
                        currentItem[5] = packMatch[1];
                    }

                    const nums = line.match(/[\d,]+\.?\d*/g) || [];
                    let numIndex = 0;
                    for (let j = 6; j < 11; j++) {
                        if (!currentItem[j] && nums[numIndex]) {
                            currentItem[j] = nums[numIndex];
                            numIndex++;
                        }
                    }
                }
            }
        }

        if (currentItem) {
            tableData.push(currentItem);
        }

        if (tableData.length === 1) {
            tableData.push(['', '', 'No invoice data found in PDF', '', '', '', '', '', '', '', '']);
        }

        return tableData;
    }, []);

    const extractTextFromPDF = useCallback(async (file: File): Promise<void> => {
        setLoading(true);
        setConverted(false);
        setError('');

        try {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';

            await new Promise<void>((resolve, reject) => {
                script.onload = () => resolve();
                script.onerror = () => reject(new Error('Failed to load PDF.js'));
                document.head.appendChild(script);
            });

            const pdfjsLib = (window as any)['pdfjs-dist/build/pdf'];
            pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            const allTextItems: TextItem[] = [];

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();

                textContent.items.forEach((item: any) => {
                    if (item.str && item.str.trim()) {
                        allTextItems.push({
                            text: item.str,
                            x: item.transform[4],
                            y: item.transform[5],
                            page: i
                        });
                    }
                });
            }

            allTextItems.sort((a, b) => {
                if (a.page !== b.page) return a.page - b.page;
                if (Math.abs(a.y - b.y) > 5) return b.y - a.y;
                return a.x - b.x;
            });

            const rows: string[] = [];
            let currentRow: TextItem[] = [];
            let lastY = allTextItems[0]?.y;

            allTextItems.forEach(item => {
                if (Math.abs(item.y - lastY) > 5) {
                    if (currentRow.length > 0) {
                        rows.push(currentRow.map(r => r.text).join(' '));
                        currentRow = [];
                    }
                    lastY = item.y;
                }
                currentRow.push(item);
            });

            if (currentRow.length > 0) {
                rows.push(currentRow.map(r => r.text).join(' '));
            }

            const fullText = allTextItems.map(item => item.text).join(' ');
            const idocMatch = fullText.match(/\bICDC\d{15,20}\b/i);

            if (!idocMatch) {
                setError('No iDOC number found in this PDF');
                setLoading(false);
                resetPdfState();
                return;
            }

            const extractedIdoc = idocMatch[0];

            // Check in local memory first
            if (processedIdocs.has(extractedIdoc)) {
                setDuplicateIdoc(extractedIdoc);
                setShowDuplicateModal(true);
                setLoading(false);
                return;
            }

            // Check in database if Firebase is ready
            if (firebaseReady) {
                const existsInDb = await checkIdocInDatabase(extractedIdoc);
                if (existsInDb) {
                    setDuplicateIdoc(extractedIdoc);
                    setShowDuplicateModal(true);
                    setLoading(false);
                    return;
                }
            }

            setIdocNumber(extractedIdoc);

            const parsedData = parseInvoiceText(rows);
            setTableData(parsedData);
            setConverted(true);

            // Save to database after successful processing
        } catch (err) {
            setError('Failed to process PDF. Please try again or use a different file.');
        } finally {
            setLoading(false);
        }
    }, [processedIdocs, parseInvoiceText, firebaseReady]);

    const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            setError('Please upload a PDF file');
            e.target.value = ''; // Clear input on error
            return;
        }

        setPdfFile(file);
        setTableData([]);
        await extractTextFromPDF(file);
        
        // Clear the input value after processing to allow re-upload of same file
        e.target.value = '';
    };

    const closeDuplicateModal = (): void => {
        setShowDuplicateModal(false);
        setDuplicateIdoc('');
        resetPdfState();
    };

    const resetPdfState = (): void => {
        setPdfFile(null);
        setTableData([]);
        setConverted(false);
        setError('');
        setIdocNumber('');
        // Reset file input
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) {
            fileInput.value = '';
        }
        // Call parent reset if provided
        if (onReset) {
            onReset();
        }
    };

    const confirmProcessing = (): void => {
        if (idocNumber) {
            setProcessedIdocs(prev => new Set([...prev, idocNumber]));
        }
    };

    useImperativeHandle(ref, () => ({
        confirmProcessing
    }));

    return (
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
                            </div>
                        </div>
                    )}

                    {idocNumber && (
                        <div className="mb-6 bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                            <p className="text-sm text-blue-600 font-semibold">Current iDOC: {idocNumber}</p>
                            <p className="text-xs text-blue-500 mt-1">Total processed: {processedIdocs.size}</p>
                        </div>
                    )}

                    <div className="space-y-4">
                        <label className="block">
                            <span className="text-gray-700 font-medium">Upload Invoice PDF</span>
                            <input
                                type="file"
                                accept=".pdf"
                                onChange={handleFileUpload}
                                className="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                            />
                        </label>
                    </div>
                </div>
            </div>

            {showDuplicateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-red-100 rounded-full">
                                    <AlertCircle className="w-8 h-8 text-red-600" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-800">Duplicate PDF Detected</h2>
                                </div>
                            </div>
                            <button
                                onClick={closeDuplicateModal}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                                aria-label="Close modal"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="mb-6">
                            <p className="text-gray-700 mb-4">
                                This PDF has already been processed. The iDOC number already exists:
                            </p>
                            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                                <p className="font-mono text-lg font-bold text-red-700 text-center">
                                    {duplicateIdoc}
                                </p>
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

            <style jsx>{`
        @keyframes scale-in {
          from {
            transform: scale(0.9);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
        </div>
    );
});

PDFToExcelConverter.displayName = 'PDFToExcelConverter';

export default PDFToExcelConverter;
export type { PDFToExcelConverterRef };