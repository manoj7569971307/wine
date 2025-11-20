'use client';

import { useState, useEffect, useCallback } from "react";
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { Save, CheckCircle, AlertCircle, Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { sampleWinesData } from "@/app/sample-data";
import PDFToExcelConverter from "@/app/invoice-pdf";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

interface FilteredItem {
    particulars: string;
    category: string;
    rate: number;
    receiptDate: string;
    openingStock: number;
    receipts: number;
    sales: number;
    closingStock: number;
    size: string;
    amount: string;
    brandNumber: string | number;
    issuePrice: string;
}

type ChildData = string[][];

const removeCommasAndDecimals = (value: string): string =>
    value.replace(/,/g, '').split('.')[0];

const removeCommas = (value: string): number =>
    parseFloat(value.replace(/,/g, ''));

export default function Home() {
    const [childData, setChildData] = useState<ChildData>([]);
    const [filterData, setFilterData] = useState<FilteredItem[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [saveAllowed, setSaveAllowed] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [saveMessage, setSaveMessage] = useState('');

    const handleDataFromChild = useCallback((data: ChildData): void => {
        setChildData(data);
        setSaveAllowed(false);
        setSaveStatus('idle');
    }, []);

    const filterWineData = useCallback((): void => {
        const filtered: FilteredItem[] = [];

        for (let j = 1; j < childData.length; j++) {
            const row = childData[j];
            if (!row?.[8] || !row[6] || !row[1]) continue;

            const quantity = Number(row[6]);
            if (quantity === 0 || isNaN(quantity)) continue;

            const quantitySize = String(row[5] || '');
            const [firstIndex, secondIndex] = quantitySize.includes('/')
                ? quantitySize.split('/').map(s => s?.trim() || '')
                : ['0', ''];

            let issuePrice: number;
            let rawPrice = removeCommasAndDecimals(String(row[8]));

            if (Number(row[7]) === 0) {
                issuePrice = Number(rawPrice) / quantity;
            } else {
                issuePrice = Math.ceil(
                    (Number(rawPrice) / ((quantity * Number(firstIndex)) + Number(row[7]))) *
                    Number(firstIndex)
                );
                rawPrice = String(removeCommas(String(row[8])));
            }

            if (isNaN(issuePrice)) continue;

            const brandNumberFromChild = String(row[1]).trim();

            for (const wine of sampleWinesData) {
                const brandNumberFromSample = String(wine['Brand Number']).trim();
                const sampleIssuePrice = Number(wine['Issue Price']);

                if (brandNumberFromChild === brandNumberFromSample &&
                    Math.abs(issuePrice - sampleIssuePrice) < 1) {

                    const calculatedQuantity = firstIndex
                        ? (Number(firstIndex) * quantity) + Number(row[7])
                        : quantity;

                    const existingItemIndex = filtered.findIndex(
                        item => item.brandNumber === wine['Brand Number'] &&
                            Math.abs(Number(item.issuePrice) - issuePrice) < 1
                    );

                    if (existingItemIndex !== -1) {
                        filtered[existingItemIndex].receipts += calculatedQuantity;
                    } else {
                        filtered.push({
                            particulars: wine['Product Name'],
                            category: row[3] || '',
                            rate: wine['MRP'],
                            receiptDate: new Date().toISOString().split('T')[0],
                            openingStock: 0,
                            receipts: calculatedQuantity,
                            sales: 0,
                            closingStock: 0,
                            size: secondIndex,
                            amount: '₹0',
                            brandNumber: wine['Brand Number'],
                            issuePrice: issuePrice.toFixed(2),
                        });
                    }
                    break;
                }
            }
        }

        setFilterData(filtered.sort((a, b) =>
            a.particulars?.localeCompare(b.particulars || '') || 0
        ));
    }, [childData]);

    const loadFromFirebase = async () => {
        setIsLoading(true);
        try {
            const q = query(collection(db, 'invoices'), orderBy('timestamp', 'desc'), limit(1));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const data = querySnapshot.docs[0].data();
                setFilterData(data.items || []);
                setSaveStatus('success');
                setSaveMessage('Data loaded successfully');
            } else {
                setSaveStatus('error');
                setSaveMessage('No saved data found');
            }
        } catch (error) {
            console.error('Error loading from Firebase:', error);
            setSaveStatus('error');
            setSaveMessage('Failed to load data');
        } finally {
            setIsLoading(false);
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const saveToFirebase = async () => {
        if (filterData.length === 0) {
            setSaveStatus('error');
            setSaveMessage('No data to save');
            return;
        }

        setIsSaving(true);
        setSaveStatus('idle');

        try {
            await addDoc(collection(db, 'invoices'), {
                items: filterData,
                timestamp: serverTimestamp(),
                totalItems: filterData.length,
                createdAt: new Date().toISOString()
            });

            setSaveStatus('success');
            setSaveMessage(`Successfully saved ${filterData.length} items`);
            setSaveAllowed(false);
        } catch (error) {
            console.error('Error saving to Firebase:', error);
            setSaveStatus('error');
            setSaveMessage('Failed to save data. Please try again.');
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const downloadExcel = () => {
        if (filterData.length === 0) return;

        const worksheet = XLSX.utils.json_to_sheet(
            filterData.map(item => ({
                'Particulars': item.particulars,
                'Size': item.size,
                'Opening Stock': item.openingStock,
                'Receipts': item.receipts,
                'Closing Stock': item.closingStock,
                'Sales': item.sales,
                'Rate': item.rate,
                'Amount': item.amount,
                'Brand Number': item.brandNumber,
                'Issue Price': item.issuePrice,
            }))
        );

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Wine Invoice');
        XLSX.writeFile(workbook, `wine-invoice-${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const downloadPDF = () => {
        if (filterData.length === 0) return;

        const printWindow = window.open('', '', 'height=800,width=1000');
        if (!printWindow) return;

        const date = new Date().toLocaleDateString();
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Wine Invoice - ${date}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h1 { color: #2563eb; text-align: center; margin-bottom: 10px; }
                    .date { text-align: center; color: #666; margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { background-color: #f3e8ff; padding: 12px; text-align: left; border: 1px solid #ddd; font-weight: bold; }
                    td { padding: 10px; border: 1px solid #ddd; }
                    tr:nth-child(even) { background-color: #f9f9f9; }
                    .text-center { text-align: center; }
                    .text-right { text-align: right; }
                    @media print { body { padding: 10px; } }
                </style>
            </head>
            <body>
                <h1>Wine Invoice Tracker</h1>
                <div class="date">Generated on: ${date}</div>
                <table>
                    <thead>
                        <tr>
                            <th>Particulars</th>
                            <th class="text-center">Size</th>
                            <th class="text-center">Opening Stock</th>
                            <th class="text-center">Receipts</th>
                            <th class="text-center">Closing Stock</th>
                            <th class="text-center">Sales</th>
                            <th class="text-center">Rate</th>
                            <th class="text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filterData.map(item => `
                            <tr>
                                <td>${item.particulars}</td>
                                <td class="text-center">${item.size}</td>
                                <td class="text-center">${item.openingStock}</td>
                                <td class="text-center">${item.receipts}</td>
                                <td class="text-center">${item.closingStock}</td>
                                <td class="text-center">${item.sales}</td>
                                <td class="text-center">₹${item.rate}</td>
                                <td class="text-right">${item.amount}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <script>
                    window.onload = () => {
                        window.print();
                        window.onafterprint = () => window.close();
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    useEffect(() => {
        loadFromFirebase();
    }, []);

    useEffect(() => {
        if (childData.length > 0) filterWineData();
    }, [childData, filterWineData]);

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-blue-600 p-3 sm:p-4 shadow-md">
                <div className="container mx-auto">
                    <h1 className="text-white text-xl sm:text-2xl md:text-3xl font-bold">
                        Wine Invoice Tracker
                    </h1>
                </div>
            </header>

            <main className="container mx-auto p-2 sm:p-4 md:p-6">
                <div className="bg-white shadow-lg rounded-lg p-3 sm:p-4 md:p-6 mb-4 sm:mb-6">
                    <PDFToExcelConverter sendDataToParent={handleDataFromChild} saveAllowed={saveAllowed} />
                </div>

                {filterData.length > 0 && (
                    <>
                        <div className="mb-4 bg-white shadow-lg rounded-lg p-4">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        onClick={() => {
                                            saveToFirebase();
                                            setSaveAllowed(true);
                                        }}
                                        disabled={isSaving}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                                            isSaving
                                                ? 'bg-gray-400 cursor-not-allowed'
                                                : 'bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg'
                                        }`}
                                    >
                                        <Save className="w-4 h-4" />
                                        {isSaving ? 'Saving...' : 'Save'}
                                    </button>

                                    <button
                                        onClick={loadFromFirebase}
                                        disabled={isLoading}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                                            isLoading
                                                ? 'bg-gray-400 cursor-not-allowed'
                                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
                                        }`}
                                    >
                                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                                        {isLoading ? 'Loading...' : 'Load'}
                                    </button>

                                    <div className="h-6 w-px bg-gray-300"></div>

                                    <button
                                        onClick={downloadExcel}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all"
                                    >
                                        <FileSpreadsheet className="w-4 h-4" />
                                        Excel
                                    </button>

                                    <button
                                        onClick={downloadPDF}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-red-600 hover:bg-red-700 text-white shadow-md hover:shadow-lg transition-all"
                                    >
                                        <FileText className="w-4 h-4" />
                                        PDF
                                    </button>

                                    {saveStatus === 'success' && (
                                        <div className="flex items-center gap-2 text-green-600">
                                            <CheckCircle className="w-5 h-5" />
                                            <span className="font-medium text-sm">{saveMessage}</span>
                                        </div>
                                    )}

                                    {saveStatus === 'error' && (
                                        <div className="flex items-center gap-2 text-red-600">
                                            <AlertCircle className="w-5 h-5" />
                                            <span className="font-medium text-sm">{saveMessage}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="text-sm text-gray-600 font-medium">
                                    {filterData.length} item{filterData.length !== 1 ? 's' : ''}
                                </div>
                            </div>
                        </div>

                        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[800px]">
                                    <thead>
                                    <tr className="bg-purple-50 border-b-2 border-purple-200">
                                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">Particulars</th>
                                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">Size</th>
                                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">Opening Stock</th>
                                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">Receipts</th>
                                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">Closing Stock</th>
                                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">Sales</th>
                                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">Rate</th>
                                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-semibold text-gray-700">Amount</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {filterData.map((item, index) => (
                                        <tr key={index} className="border-b border-gray-200 hover:bg-purple-50 transition-colors">
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-800">{item.particulars}</td>
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                                                    <span className="inline-block px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700 font-medium">
                                                        {item.size}
                                                    </span>
                                            </td>
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                                                <input type="number" value={item.openingStock} className="w-16 sm:w-20 px-2 py-1 text-center text-xs sm:text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" readOnly />
                                            </td>
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-blue-600">{item.receipts}</td>
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                                                <input type="number" value={item.closingStock} className="w-12 sm:w-16 px-2 py-1 text-center text-xs sm:text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" readOnly />
                                            </td>
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                                                <span className="text-blue-600 font-semibold text-xs sm:text-sm">{item.sales}</span>
                                            </td>
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm text-gray-800">₹{item.rate}</td>
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-semibold text-green-600">{item.amount}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="sm:hidden p-2 text-center text-xs text-gray-500 bg-gray-50">
                                ← Scroll horizontally to see all columns →
                            </div>
                        </div>
                    </>
                )}

                {childData.length > 0 && filterData.length === 0 && (
                    <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-3 sm:p-4 rounded">
                        <p className="font-bold text-sm sm:text-base">No matches found</p>
                        <p className="text-xs sm:text-sm">No wine data matched the uploaded invoice.</p>
                    </div>
                )}

                {!isLoading && filterData.length === 0 && childData.length === 0 && (
                    <div className="bg-blue-50 border-l-4 border-blue-500 text-blue-700 p-3 sm:p-4 rounded">
                        <p className="font-bold text-sm sm:text-base">Welcome!</p>
                        <p className="text-xs sm:text-sm">Upload a PDF to start, or click "Load" to retrieve your last saved data.</p>
                    </div>
                )}
            </main>
        </div>
    );
}

