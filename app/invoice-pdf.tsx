'use client';

import {useEffect, useState} from 'react';
import { Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle, X } from 'lucide-react';


export default function PDFToExcelConverter({sendDataToParent}) {
    const [pdfFile, setPdfFile] = useState(null);
    const [tableData, setTableData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [converted, setConverted] = useState(false);
    const [error, setError] = useState('');
    const [idocNumber, setIdocNumber] = useState('');
    const [processedIdocs, setProcessedIdocs] = useState(new Set());
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [duplicateIdoc, setDuplicateIdoc] = useState('');

    console.log('manoj', tableData);

    useEffect(() => {
        sendDataToParent(tableData)
    }, [tableData]);


    const extractTextFromPDF = async (file) => {
        setLoading(true);
        setConverted(false);
        setError('');

        try {
            console.log('Starting PDF extraction...');

            // Use pdf.js from CDN
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';

            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });

            const pdfjsLib = window['pdfjs-dist/build/pdf'];
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;

            console.log(`PDF loaded: ${pdf.numPages} pages`);

            let allTextItems = [];

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();

                // Store items with their positions
                textContent.items.forEach(item => {
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

            console.log(`Extracted ${allTextItems.length} text items`);

            // Sort by page, then Y (top to bottom), then X (left to right)
            allTextItems.sort((a, b) => {
                if (a.page !== b.page) return a.page - b.page;
                if (Math.abs(a.y - b.y) > 5) return b.y - a.y;
                return a.x - b.x;
            });

            // Group items into rows based on Y position
            const rows = [];
            let currentRow = [];
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

            console.log(`Grouped into ${rows.length} rows`);
            console.log('First 10 rows:', rows.slice(0, 10));

            // 🔹 Extract the iDOC number (format: ICDC + digits)
            let extractedIdoc = '';
            try {
                const fullText = allTextItems.map(item => item.text).join(' ');
                const idocMatch = fullText.match(/\bICDC\d{15,20}\b/i);

                if (idocMatch) {
                    extractedIdoc = idocMatch[0];
                    console.log('✅ Extracted iDOC Number:', extractedIdoc);

                    // Check if this iDOC has already been processed
                    if (processedIdocs.has(extractedIdoc)) {
                        console.log('⚠️ Duplicate iDOC detected:', extractedIdoc);
                        setDuplicateIdoc(extractedIdoc);
                        setShowDuplicateModal(true);
                        setLoading(false);
                        setPdfFile(null);
                        return; // Stop processing
                    }

                    setIdocNumber(extractedIdoc);
                    // Add to processed set
                    setProcessedIdocs(prev => new Set([...prev, extractedIdoc]));
                } else {
                    console.log('⚠️ No iDOC number found in PDF text');
                    setError('No iDOC number found in this PDF');
                    setLoading(false);
                    setPdfFile(null);
                    return;
                }
            } catch (e) {
                console.log('Error extracting iDOC number:', e);
                setError('Error extracting iDOC number from PDF');
                setLoading(false);
                setPdfFile(null);
                return;
            }

            // Parse the extracted text into table format
            const parsedData = parseInvoiceText(rows);
            setTableData(parsedData);
            setConverted(true);

            console.log('Conversion complete!');

        } catch (err) {
            console.error('Error processing PDF:', err);
            setError('Failed to process PDF. Please try again or use a different file.');
        } finally {
            setLoading(false);
        }
    };

    const parseInvoiceText = (rows) => {
        console.log('Parsing', rows.length, 'rows');

        // Define headers for invoice table
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

        const tableData = [headers];
        let currentItem = null;
        let foundTableStart = false;

        for (let i = 0; i < rows.length; i++) {
            const line = rows[i].trim();

            // Skip until we find the table header
            if (!foundTableStart) {
                if (line.includes('Sl.No') && line.includes('Brand')) {
                    foundTableStart = true;
                    console.log('Found table start at row', i);
                    continue;
                }
                continue;
            }

            // Stop at summary section
            if (line.includes('TIN') || line.includes('Particulars') || line.includes('Invoice Qty')) {
                console.log('Found table end at row', i);
                break;
            }

            // Match invoice row pattern: number space number space text
            const match = line.match(/^(\d{1,2})\s+(\d{3,5})\s+(.+)/);

            if (match) {
                // Save previous item
                if (currentItem) {
                    console.log('Adding row:', currentItem[0], currentItem[2]);
                    tableData.push(currentItem);
                }

                const slNo = match[1];
                const brandNo = match[2];
                const restOfLine = match[3];

                // Parse the line more carefully
                // Pattern: BRAND NAME  PRODUCT_TYPE  PACK_TYPE  PACK_QTY  QTY_CASES  QTY_BOTTLES  RATE  UNIT_RATE  TOTAL

                // Find product type (IML, Beer, Duty Paid)
                let productTypeMatch = restOfLine.match(/(IML|Beer|Duty Paid)/);
                let brandName = '';
                let remaining = '';

                if (productTypeMatch) {
                    brandName = restOfLine.substring(0, productTypeMatch.index).trim();
                    remaining = restOfLine.substring(productTypeMatch.index).trim();
                } else {
                    brandName = restOfLine;
                    remaining = '';
                }

                // Parse remaining fields
                const parts = remaining.split(/\s+/);

                let productType = parts[0] || '';
                let packType = parts[1] || '';

                // Find pack quantity pattern (e.g., "12 / 650 ml")
                const packQtyMatch = remaining.match(/(\d+\s*\/\s*\d+\s*ml)/);
                let packQty = '';
                let afterPackQty = remaining;

                if (packQtyMatch) {
                    packQty = packQtyMatch[1];
                    afterPackQty = remaining.substring(remaining.indexOf(packQtyMatch[1]) + packQtyMatch[1].length).trim();
                }

                // Parse remaining numeric fields
                const numbers = afterPackQty.match(/[\d,]+\.?\d*/g) || [];

                currentItem = [
                    slNo,
                    brandNo,
                    brandName,
                    productType,
                    packType,
                    packQty,
                    numbers[0] || '',  // Qty Cases
                    numbers[1] || '',  // Qty Bottles
                    numbers[2] || '',  // Rate/Case
                    numbers[3] || '',  // Unit Rate
                    numbers[4] || ''   // Total
                ];
            } else if (currentItem) {
                // Check if this is a continuation of brand name
                const hasProductType = line.includes('IML') || line.includes('Beer') || line.includes('Duty Paid');
                const startsWithNumber = /^\d/.test(line);
                const isURL = line.includes('http') || line.includes('www');

                if (!hasProductType && !startsWithNumber && !isURL && line.length < 100) {
                    // Continuation of brand name
                    currentItem[2] += ' ' + line;
                } else if (hasProductType && !currentItem[3]) {
                    // This line contains additional data fields
                    const parts = line.split(/\s+/);

                    // Fill in missing fields
                    if (!currentItem[3]) currentItem[3] = parts[0] || ''; // Product Type
                    if (!currentItem[4]) currentItem[4] = parts[1] || ''; // Pack Type

                    // Find pack quantity
                    const packMatch = line.match(/(\d+\s*\/\s*\d+\s*ml)/);
                    if (packMatch && !currentItem[5]) {
                        currentItem[5] = packMatch[1];
                    }

                    // Get remaining numbers
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

        // Add last item
        if (currentItem) {
            console.log('Adding last row:', currentItem[0], currentItem[2]);
            tableData.push(currentItem);
        }

        console.log('Total parsed rows:', tableData.length - 1);

        if (tableData.length === 1) {
            tableData.push(['', '', 'No invoice data found in PDF', '', '', '', '', '', '', '', '']);
        }

        return tableData;
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            setError('Please upload a PDF file');
            return;
        }

        setPdfFile(file);
        setTableData([]);
        await extractTextFromPDF(file);
    };

    const closeDuplicateModal = () => {
        setShowDuplicateModal(false);
        setDuplicateIdoc('');
    };

    return (
        <div className="bg-gradient-to-br from-green-50 to-blue-100 sm:p-6 md:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8">
                    {error && (
                        <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-center gap-3">
                            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0"/>
                            <p className="text-red-700">{error}</p>
                        </div>
                    )}

                    {/* Current iDOC Display */}
                    {idocNumber && (
                        <div className="mb-6 bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                            <p className="text-sm text-blue-600 font-semibold">Current iDOC: {idocNumber}</p>
                            <p className="text-xs text-blue-500 mt-1">Total processed: {processedIdocs.size}</p>
                        </div>
                    )}

                    <div className="space-y-6">
                        <label className="block cursor-pointer">
                            <div
                                className="border-3 border-dashed text-black border-gray-300 rounded-xl p-3 hover:border-green-500 hover:bg-green-50 transition-all">
                                Enter PDF
                            </div>
                            <input
                                type="file"
                                className="hidden"
                                accept=".pdf"
                                onChange={handleFileUpload}
                            />
                        </label>
                    </div>
                </div>
            </div>

            {/* Duplicate iDOC Modal */}
            {showDuplicateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-red-100 rounded-full">
                                    <AlertCircle className="w-8 h-8 text-red-600"/>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-800">Duplicate PDF Detected</h2>
                                </div>
                            </div>
                            <button
                                onClick={closeDuplicateModal}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X className="w-6 h-6"/>
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
}