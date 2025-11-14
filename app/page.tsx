'use client';

import { useState, useEffect, useCallback } from "react";
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { Save, CheckCircle, AlertCircle, Download, FileSpreadsheet, FileText, RefreshCw, LogOut } from 'lucide-react';
import * as XLSX from 'xlsx';
import { sampleWinesData } from "@/app/sample-data";
import PDFToExcelConverter from "@/app/invoice-pdf";
import LoginForm from "@/app/login";

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
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [userRole, setUserRole] = useState('');
    const [username, setUsername] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [selectedHistory, setSelectedHistory] = useState<any>(null);
    const [invoiceName, setInvoiceName] = useState('');

    // Handle closing stock change
    const handleClosingStockChange = (index: number, value: string) => {
        const newValue = parseInt(value) || 0;

        setFilterData(prevData => {
            const newData = [...prevData];
            const item = newData[index];

            // Update closing stock
            item.closingStock = newValue;

            // Calculate: opening stock + receipts = closing stock + sales
            // So: sales = opening stock + receipts - closing stock
            item.sales = item.openingStock + item.receipts - item.closingStock;

            // Calculate amount: sales * rate
            item.amount = `₹${(item.sales * item.rate).toFixed(2)}`;

            return newData;
        });
    };

    // Get collection name based on user
    const getCollectionName = () => {
        if (userRole === 'Admin') {
            return 'invoices_admin';
        } else {
            return `invoices_${username}`;
        }
    };

    // Get history collection name
    const getHistoryCollectionName = () => {
        if (userRole === 'Admin') {
            return 'history_admin';
        } else {
            return `history_${username}`;
        }
    };

    const handleDataFromChild = useCallback((data: ChildData): void => {
        setChildData(data);
        setSaveAllowed(false);
        setSaveStatus('idle');
    }, []);

    const filterWineData = useCallback((): void => {
        const filtered: FilteredItem[] = [...filterData];

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
        if (!username) {
            console.log('No username set, skipping load');
            return;
        }

        setIsLoading(true);
        try {
            const collectionName = getCollectionName();
            console.log('Loading from collection:', collectionName);

            const q = query(
                collection(db, collectionName),
                orderBy('createdAt', 'desc'),
                limit(1)
            );
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const data = querySnapshot.docs[0].data();
                console.log('Loaded data:', data);
                setFilterData(data.items || []);
                setSaveStatus('success');
                setSaveMessage('Data loaded successfully');
            } else {
                console.log('No data found in collection');
                setSaveStatus('idle');
                setSaveMessage('');
            }
        } catch (error) {
            console.error('Error loading from Firebase:', error);
            setSaveStatus('idle');
            setSaveMessage('');
        } finally {
            setIsLoading(false);
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const saveToFirebase = async () => {
        if (filterData.length === 0) {
            setSaveStatus('error');
            setSaveMessage('No data to save');
            setTimeout(() => setSaveStatus('idle'), 3000);
            return;
        }

        if (!username) {
            setSaveStatus('error');
            setSaveMessage('User not logged in');
            setTimeout(() => setSaveStatus('idle'), 3000);
            return;
        }

        // Check if closing stock is entered
        const hasClosingStock = filterData.some(item => item.closingStock > 0);

        setIsSaving(true);
        setSaveStatus('idle');

        try {
            const collectionName = getCollectionName();
            const historyCollectionName = getHistoryCollectionName();
            const saveDate = new Date().toISOString();

            console.log('Saving to collection:', collectionName);
            console.log('Data to save:', { itemCount: filterData.length, user: username, role: userRole });

            // Always save to history collection with invoice name or closing stock status
            await addDoc(collection(db, historyCollectionName), {
                items: filterData,
                timestamp: serverTimestamp(),
                totalItems: filterData.length,
                savedAt: saveDate,
                user: username,
                role: userRole,
                invoiceName: invoiceName || `Invoice ${new Date().toLocaleDateString()}`,
                hasClosingStock: hasClosingStock
            });

            // If closing stock is entered, update opening stock
            let updatedData;
            if (hasClosingStock) {
                updatedData = filterData.map(item => ({
                    ...item,
                    openingStock: item.closingStock > 0 ? item.closingStock : item.openingStock,
                    receipts: item.closingStock > 0 ? 0 : item.receipts,
                    closingStock: 0,
                    sales: 0,
                    amount: '₹0',
                }));
            } else {
                // Keep data as is if no closing stock
                updatedData = filterData;
            }

            // Save updated data to main collection (latest state)
            const docData = {
                items: updatedData,
                timestamp: serverTimestamp(),
                totalItems: updatedData.length,
                createdAt: saveDate,
                user: username,
                role: userRole
            };

            await addDoc(collection(db, collectionName), docData);

            // Update local state with new data
            setFilterData(updatedData);

            console.log('Document saved successfully');

            setSaveStatus('success');
            setSaveMessage(`Successfully saved ${filterData.length} items`);
            setSaveAllowed(false);
            setInvoiceName(''); // Reset invoice name
        } catch (error) {
            console.error('Error saving to Firebase:', error);
            console.error('Error details:', error);
            setSaveStatus('error');
            setSaveMessage(`Failed to save: ${error}`);
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus('idle'), 5000);
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
        XLSX.writeFile(workbook, `wine-invoice-${username}-${new Date().toISOString().split('T')[0]}.xlsx`);
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
                <title>Wine Invoice - ${username} - ${date}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h1 { color: #2563eb; text-align: center; margin-bottom: 10px; }
                    .date { text-align: center; color: #666; margin-bottom: 20px; }
                    .user-info { text-align: center; color: #666; margin-bottom: 20px; font-weight: bold; }
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
                <div class="user-info">${userRole}: ${username}</div>
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

    const handleLoginSuccess = (role: string, user: string) => {
        console.log('Login success - Role:', role, 'User:', user);
        setIsLoggedIn(true);
        setUserRole(role);
        setUsername(user);
    };

    const loadHistory = async () => {
        if (!username) return;

        setIsLoading(true);
        try {
            const historyCollectionName = getHistoryCollectionName();
            console.log('Loading history from:', historyCollectionName);

            const q = query(
                collection(db, historyCollectionName),
                orderBy('savedAt', 'desc')
            );
            const querySnapshot = await getDocs(q);

            const history = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            setHistoryData(history);
            setShowHistory(true);
        } catch (error) {
            console.error('Error loading history:', error);
            setSaveStatus('error');
            setSaveMessage('Failed to load history');
        } finally {
            setIsLoading(false);
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const downloadHistoryExcel = (historyItem: any) => {
        if (!historyItem.items || historyItem.items.length === 0) return;

        const worksheet = XLSX.utils.json_to_sheet(
            historyItem.items.map((item: FilteredItem) => ({
                'Particulars': item.particulars,
                'Size': item.size,
                'Opening Stock': item.openingStock,
                'Receipts': item.receipts,
                'Closing Stock': item.closingStock,
                'Sales': item.sales,
                'Rate': item.rate,
                'Amount': item.amount,
            }))
        );

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'History');
        const date = new Date(historyItem.savedAt).toLocaleDateString().replace(/\//g, '-');
        XLSX.writeFile(workbook, `history-${username}-${date}.xlsx`);
    };

    const viewHistorySheet = (record: any) => {
        setSelectedHistory(record);
    };

    const closeHistorySheet = () => {
        setSelectedHistory(null);
    };

    const handleLogout = () => {
        setIsLoggedIn(false);
        setUserRole('');
        setUsername('');
        setFilterData([]);
        setChildData([]);
        setSaveStatus('idle');
    };

    useEffect(() => {
        if (isLoggedIn && username) {
            loadFromFirebase();
        }
    }, [isLoggedIn, username]);

    useEffect(() => {
        if (childData.length > 0) filterWineData();
    }, [childData, filterWineData]);

    if (!isLoggedIn) {
        return <LoginForm onLoginSuccess={handleLoginSuccess} />;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-blue-600 p-3 sm:p-4 shadow-md">
                <div className="container mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-white text-xl sm:text-2xl md:text-3xl font-bold">
                            Wine Invoice Tracker
                        </h1>
                        <p className="text-blue-100 text-sm mt-1">
                            {userRole}: {username}
                        </p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-all"
                    >
                        <LogOut className="w-4 h-4" />
                        Logout
                    </button>
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
                                    {userRole === 'Shop Owner' && (
                                        <input
                                            type="text"
                                            placeholder="Invoice Name (optional)"
                                            value={invoiceName}
                                            onChange={(e) => setInvoiceName(e.target.value)}
                                            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    )}

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

                                    {userRole === 'Shop Owner' && (
                                        <button
                                            onClick={loadHistory}
                                            disabled={isLoading}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                                                isLoading
                                                    ? 'bg-gray-400 cursor-not-allowed'
                                                    : 'bg-purple-600 hover:bg-purple-700 text-white shadow-md hover:shadow-lg'
                                            }`}
                                        >
                                            <Download className="w-4 h-4" />
                                            History
                                        </button>
                                    )}

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
                                                <input type="number" value={item.openingStock} className="w-16 sm:w-20 px-2 py-1 text-center text-xs sm:text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 text-gray-900 focus:ring-blue-500" readOnly />
                                            </td>
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-blue-600">{item.receipts}</td>
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                                                <input
                                                    type="number"
                                                    value={item.closingStock}
                                                    onChange={(e) => handleClosingStockChange(index, e.target.value)}
                                                    disabled={userRole === 'Admin'}
                                                    className={`w-12 sm:w-16 px-2 py-1 text-center text-xs sm:text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 text-gray-900 focus:ring-blue-500 ${
                                                        userRole === 'Admin' ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                                                    }`}
                                                />
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

            {/* History Modal */}
            {showHistory && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-md w-full max-h-[70vh] overflow-hidden flex flex-col">
                        <div className="bg-purple-600 text-white p-4 flex justify-between items-center">
                            <h2 className="text-xl font-bold">Saved History</h2>
                            <button
                                onClick={() => setShowHistory(false)}
                                className="text-white hover:bg-purple-700 rounded-full p-2 transition"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            {historyData.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">No history found</p>
                            ) : (
                                <div className="space-y-2">
                                    {historyData.map((record) => (
                                        <button
                                            key={record.id}
                                            onClick={() => viewHistorySheet(record)}
                                            className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition"
                                        >
                                            <p className="font-semibold text-blue-600 hover:text-blue-700">
                                                {record.invoiceName || new Date(record.savedAt).toLocaleDateString('en-US', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </p>
                                            {record.hasClosingStock && (
                                                <span className="inline-block mt-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                                                    Closing Stock Entered
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* View History Sheet Modal */}
            {selectedHistory && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold">
                                    {new Date(selectedHistory.savedAt).toLocaleDateString('en-US', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </h2>
                                <p className="text-sm text-blue-100 mt-1">
                                    {new Date(selectedHistory.savedAt).toLocaleTimeString()}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => downloadHistoryExcel(selectedHistory)}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition"
                                >
                                    <FileSpreadsheet className="w-4 h-4" />
                                    Download
                                </button>
                                <button
                                    onClick={closeHistorySheet}
                                    className="text-white hover:bg-blue-700 rounded-full p-2 transition"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="bg-white shadow-lg rounded-lg overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[800px]">
                                        <thead>
                                        <tr className="bg-purple-50 border-b-2 border-purple-200">
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Particulars</th>
                                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Size</th>
                                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Opening Stock</th>
                                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Receipts</th>
                                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Closing Stock</th>
                                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Sales</th>
                                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Rate</th>
                                            <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Amount</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {selectedHistory.items.map((item: FilteredItem, index: number) => (
                                            <tr key={index} className="border-b border-gray-200 hover:bg-purple-50 transition-colors">
                                                <td className="px-4 py-3 text-sm text-gray-800">{item.particulars}</td>
                                                <td className="px-4 py-3 text-center">
                                                        <span className="inline-block px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700 font-medium">
                                                            {item.size}
                                                        </span>
                                                </td>
                                                <td className="px-4 py-3 text-center text-sm">{item.openingStock}</td>
                                                <td className="px-4 py-3 text-center text-sm font-semibold text-blue-600">{item.receipts}</td>
                                                <td className="px-4 py-3 text-center text-sm font-semibold text-green-600">{item.closingStock}</td>
                                                <td className="px-4 py-3 text-center text-sm font-semibold text-blue-600">{item.sales}</td>
                                                <td className="px-4 py-3 text-center text-sm text-gray-800">₹{item.rate}</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">{item.amount}</td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

