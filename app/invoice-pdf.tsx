'use client';

import {useEffect, useState} from 'react';
import { Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';


export default function PDFToExcelConverter({sendDataToParent}) {
    const [pdfFile, setPdfFile] = useState(null);
    const [tableData, setTableData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [converted, setConverted] = useState(false);
    const [error, setError] = useState('');
    console.log('manoj', tableData)
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

    const downloadExcel = () => {
        if (tableData.length === 0) {
            setError('No data to download');
            return;
        }

        console.log('Downloading CSV with data:', tableData);

        // Create list from CSV data
        const dataList = tableData.slice(1).map((row, index) => {
            const headers = tableData[0];
            const obj = {};
            headers.forEach((header, i) => {
                obj[header] = row[i] || '';
            });
            return obj;
        });

        console.log('=== CSV DATA AS LIST ===');
        console.log('Total Items:', dataList.length);
        console.log('List:', dataList);
        console.log('=== JSON FORMAT ===');
        console.log(JSON.stringify(dataList, null, 2));

        // Create CSV content (Excel can open CSV files)
        const csvContent = tableData.map(row =>
            row.map(cell => {
                // Escape cells with commas or quotes
                const cellStr = String(cell || '');
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                    return `"${cellStr.replace(/"/g, '""')}"`;
                }
                return cellStr;
            }).join(',')
        ).join('\r\n');

        console.log('=== CSV CONTENT ===');
        console.log(csvContent);

        // Create blob and download
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], {type: 'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', pdfFile ? pdfFile.name.replace('.pdf', '.csv') : 'invoice_data.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log('Download triggered');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 p-8">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-2xl shadow-2xl p-8">
                    <div className="text-center mb-8">
                        <div className="inline-block p-4 bg-green-100 rounded-full mb-4">
                            <FileSpreadsheet className="w-12 h-12 text-green-600"/>
                        </div>
                        <h1 className="text-4xl font-bold text-gray-800 mb-2">
                            PDF to Excel Converter
                        </h1>
                        <p className="text-gray-600">
                            Upload a PDF invoice and download it as CSV (Excel compatible)
                        </p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-center gap-3">
                            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0"/>
                            <p className="text-red-700">{error}</p>
                        </div>
                    )}

                    {/* Upload Section */}
                    <div className="space-y-6">
                        <label className="block cursor-pointer">
                            <div
                                className="border-3 border-dashed border-gray-300 rounded-xl p-12 hover:border-green-500 hover:bg-green-50 transition-all">
                                <div className="flex flex-col items-center">
                                    <Upload className="w-16 h-16 text-gray-400 mb-4"/>
                                    {pdfFile ? (
                                        <div className="text-center">
                                            <p className="text-lg font-semibold text-green-600 mb-2">
                                                ✓ {pdfFile.name}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                Click to upload a different file
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="text-center">
                                            <p className="text-lg font-semibold text-gray-700 mb-2">
                                                Click to upload PDF
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                Select your invoice PDF file
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <input
                                type="file"
                                className="hidden"
                                accept=".pdf"
                                onChange={handleFileUpload}
                            />
                        </label>

                        {/* Loading State */}
                        {loading && (
                            <div className="text-center py-8">
                                <div
                                    className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-green-600 mb-4"></div>
                                <p className="text-lg text-gray-600 font-medium">
                                    Converting PDF to Excel...
                                </p>
                                <p className="text-sm text-gray-500 mt-2">
                                    This may take a moment
                                </p>
                            </div>
                        )}

                        {/* Success State */}
                        {converted && !loading && (
                            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <CheckCircle className="w-12 h-12 text-green-600"/>
                                        <div>
                                            <h3 className="text-xl font-bold text-gray-800">
                                                Conversion Complete!
                                            </h3>
                                            <p className="text-gray-600">
                                                {tableData.length - 1} rows extracted from PDF
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={downloadExcel}
                                        className="flex items-center gap-3 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1 font-semibold"
                                    >
                                        <Download className="w-5 h-5"/>
                                        Download CSV
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Preview Table */}
                        {converted && !loading && tableData.length > 0 && (
                            <div className="mt-6">
                                <h3 className="text-lg font-bold text-gray-800 mb-4">
                                    Preview (First 10 rows)
                                </h3>
                                <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-96">
                                    <table className="min-w-full border-collapse bg-white text-sm">
                                        <thead className="bg-green-600 text-white sticky top-0">
                                        <tr>
                                            {tableData[0]?.map((header, i) => (
                                                <th
                                                    key={i}
                                                    className="border border-green-500 px-3 py-2 text-left font-semibold whitespace-nowrap"
                                                >
                                                    {header}
                                                </th>
                                            ))}
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {tableData.slice(1, 11).map((row, i) => (
                                            <tr
                                                key={i}
                                                className={`hover:bg-green-50 ${i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
                                            >
                                                {row.map((cell, j) => (
                                                    <td
                                                        key={j}
                                                        className="border border-gray-300 px-3 py-2 text-gray-700"
                                                    >
                                                        {cell}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                                {tableData.length > 11 && (
                                    <p className="text-center text-gray-500 mt-3 text-sm">
                                        ... and {tableData.length - 11} more rows
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}