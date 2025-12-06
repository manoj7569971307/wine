'use client';

import { useState, useEffect, useCallback, useRef } from "react";
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, where, doc, updateDoc } from 'firebase/firestore';
import { Save, CheckCircle, AlertCircle, Download, FileSpreadsheet, FileText, RefreshCw, LogOut, Pencil } from 'lucide-react';
import * as XLSX from 'xlsx';
import { sampleWinesData } from "@/app/sample-data";
import PDFToExcelConverter, { PDFToExcelConverterRef } from "@/app/invoice-pdf";
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
    tranIn: number;
    tranOut: number;
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

const calcBalance = (f1?: string, f2?: string, f4?: string, f6?: string): string =>
    ((+(f1 || '0')) + (+(f2 || '0')) + (+(f4 || '0')) - (+(f6 || '0'))).toString();

// Date format helpers
const formatDateForDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    if (dateStr.includes('/')) return dateStr; // Already in dd/mm/yyyy format
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

const formatDateForInput = (dateStr: string): string => {
    if (!dateStr) return '';
    if (dateStr.includes('-')) return dateStr; // Already in yyyy-mm-dd format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`; // yyyy-mm-dd
    }
    return dateStr;
};

const formatDateFromInput = (dateStr: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

export default function Home() {
    const pdfConverterRef = useRef<PDFToExcelConverterRef>(null);
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
    const [field1, setField1] = useState('');
    const [field2, setField2] = useState('');
    const [field3, setField3] = useState('');
    const [field4, setField4] = useState('');
    const [field5, setField5] = useState('');
    const [field6, setField6] = useState('');
    const [field7, setField7] = useState('');
    const [paymentData, setPaymentData] = useState([{ phonepe: '', cash: '', amount: '', comments: '', date: '' }]);
    const [selectedMonth, setSelectedMonth] = useState('');
    const [showShopSelection, setShowShopSelection] = useState(false);
    const [availableShops, setAvailableShops] = useState<string[]>([]);
    const [selectedShop, setSelectedShop] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [consolidatedData, setConsolidatedData] = useState<any>(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [pendingData, setPendingData] = useState<FilteredItem[]>([]);
    const [pdfTotal, setPdfTotal] = useState(0);
    const [matchedItemsCount, setMatchedItemsCount] = useState(0);
    const [sheetFromDate, setSheetFromDate] = useState('');
    const [sheetToDate, setSheetToDate] = useState('');
    const [lastSavedToDate, setLastSavedToDate] = useState('');
    const [editingHistory, setEditingHistory] = useState<any>(null);
    const [editedHistoryData, setEditedHistoryData] = useState<FilteredItem[]>([]);
    const [editedPaymentData, setEditedPaymentData] = useState<any[]>([]);
    const [editedAdditionalInfo, setEditedAdditionalInfo] = useState<any>({});
    const [editedDates, setEditedDates] = useState({ from: '', to: '' });
    const [autoSaveTimeout, setAutoSaveTimeout] = useState<NodeJS.Timeout | null>(null);
    const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [showClosingStockView, setShowClosingStockView] = useState(false);
    const [originalClosingStocks, setOriginalClosingStocks] = useState<{[key: string]: number}>({});
    const [showIdocList, setShowIdocList] = useState(false);
    const [idocList, setIdocList] = useState<Array<{id: string, idocNumber: string, fileName: string, timestamp: string}>>([]);

    // Calculate field values
    const totalSaleAmount = filterData.reduce((sum, item) => {
        const amount = parseFloat(item.amount.replace('₹', '').replace(',', '')) || 0;
        return sum + amount;
    }, 0);

    const field1Value = totalSaleAmount.toString();
    const field3Value = (parseFloat(field1Value) + parseFloat(field2 || '0')).toString();
    const field5Value = (parseFloat(field3Value) + parseFloat(field4 || '0')).toString();

    // Calculate payment totals
    const phonepeTotal = paymentData.reduce((sum, p) => sum + (parseFloat(p.phonepe) || 0), 0);
    const cashTotal = paymentData.reduce((sum, p) => sum + (parseFloat(p.cash) || 0), 0);
    const amountTotal = paymentData.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalExpenses = phonepeTotal + cashTotal + amountTotal;

    const field6Value = totalExpenses.toString();
    const field7Value = Math.abs(parseFloat(field5Value) - parseFloat(field6Value)).toString();

    // Check if this is the latest sheet (no saved sheet after current to date)
    const isLatestSheet = !sheetToDate || !lastSavedToDate || sheetToDate >= lastSavedToDate;

    // Auto-save function for real-time updates
    const autoSaveToFirebase = async (updatedData: FilteredItem[]) => {
        if (!username || updatedData.length === 0) return;

        try {
            const collectionName = getCollectionName();
            const historyCollectionName = getHistoryCollectionName();
            const saveDate = new Date().toISOString();

            // Calculate updated totals
            const newTotalSale = updatedData.reduce((sum, item) => {
                const amount = parseFloat(item.amount.replace('₹', '').replace(',', '')) || 0;
                return sum + amount;
            }, 0);

            // Update main collection
            await addDoc(collection(db, collectionName), {
                items: updatedData,
                timestamp: serverTimestamp(),
                totalItems: updatedData.length,
                createdAt: saveDate,
                user: username,
                role: userRole,
                field1: newTotalSale.toString(),
                field2: field2,
                field3: (newTotalSale + parseFloat(field2 || '0')).toString(),
                field4: field4,
                field5: (newTotalSale + parseFloat(field2 || '0') + parseFloat(field4 || '0')).toString(),
                field6: field6Value,
                field7: Math.abs((newTotalSale + parseFloat(field2 || '0') + parseFloat(field4 || '0')) - parseFloat(field6Value || '0')).toString(),
                sheetFromDate: sheetFromDate,
                sheetToDate: sheetToDate,
                autoSave: true
            });

            console.log('Auto-saved to Firebase');
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    };

    // Debounced auto-save function for history edits
    const debouncedAutoSaveHistoryEdits = useCallback((updatedItems?: FilteredItem[], updatedAdditionalInfo?: any, updatedPaymentData?: any[]) => {
        if (autoSaveTimeout) {
            clearTimeout(autoSaveTimeout);
        }

        setAutoSaveStatus('saving');

        const timeout = setTimeout(async () => {
            if (!editingHistory || !username) {
                setAutoSaveStatus('idle');
                return;
            }

            try {
                const historyCollectionName = getHistoryCollectionName();
                const historyDocRef = doc(db, historyCollectionName, editingHistory.id);

                const updateData: any = {
                    lastAutoSavedAt: serverTimestamp()
                };

                if (updatedItems) {
                    updateData.items = updatedItems;
                }

                if (updatedAdditionalInfo) {
                    updateData.field1 = updatedAdditionalInfo.field1;
                    updateData.field2 = updatedAdditionalInfo.field2;
                    updateData.field3 = updatedAdditionalInfo.field3;
                    updateData.field4 = updatedAdditionalInfo.field4;
                    updateData.field5 = updatedAdditionalInfo.field5;
                    updateData.field6 = updatedAdditionalInfo.field6;
                    updateData.field7 = updatedAdditionalInfo.field7;
                }

                if (updatedPaymentData) {
                    updateData.paymentData = updatedPaymentData;
                }

                await updateDoc(historyDocRef, updateData);
                console.log('History auto-saved to Firebase');
                setAutoSaveStatus('saved');
                
                // Reset status after showing saved state
                setTimeout(() => setAutoSaveStatus('idle'), 2000);
            } catch (error) {
                console.error('History auto-save failed:', error);
                setAutoSaveStatus('idle');
            }
        }, 1000); // 1 second debounce

        setAutoSaveTimeout(timeout);
    }, [autoSaveTimeout, editingHistory, username]);

    // Handle closing stock change with auto-save
    const handleClosingStockChange = async (index: number, value: string) => {
        const newValue = parseInt(value) || 0;
        if (newValue < 0) return;

        setFilterData(prevData => {
            const newData = [...prevData];
            const item = newData[index];

            // Ensure all values are numbers
            const openingStock = Number(item.openingStock) || 0;
            const receipts = Number(item.receipts) || 0;
            const tranIn = Number(item.tranIn) || 0;
            const tranOut = Number(item.tranOut) || 0;
            const rate = Number(item.rate) || 0;
            const totalColumn = openingStock + receipts + tranIn - tranOut;
            if (newValue > totalColumn) return prevData;
            item.closingStock = newValue;
            item.sales = openingStock + receipts + tranIn - newValue - tranOut;
            item.amount = `₹${(item.sales * rate).toFixed(2)}`;
            setTimeout(() => autoSaveToFirebase(newData), 100);

            return newData;
        });
    };

    // Handle tran in change
    const handleTranInChange = (index: number, value: string) => {
        const newValue = parseInt(value) || 0;
        if (newValue < 0) return;

        setFilterData(prevData => {
            const newData = [...prevData];
            const item = newData[index];
            item.tranIn = newValue;
            const openingStock = Number(item.openingStock) || 0;
            const receipts = Number(item.receipts) || 0;
            const tranOut = Number(item.tranOut) || 0;
            const closingStock = Number(item.closingStock) || 0;
            const rate = Number(item.rate) || 0;
            item.sales = openingStock + receipts + newValue - closingStock - tranOut;
            item.amount = `₹${(item.sales * rate).toFixed(2)}`;

            return newData;
        });
    };

    const handleTranOutChange = (index: number, value: string) => {
        if (!isLatestSheet) return;

        const newValue = parseInt(value) || 0;
        if (newValue < 0) return;

        setFilterData(prevData => {
            const newData = [...prevData];
            const item = newData[index];
            const openingStock = Number(item.openingStock) || 0;
            const receipts = Number(item.receipts) || 0;
            const tranIn = Number(item.tranIn) || 0;
            const closingStock = Number(item.closingStock) || 0;
            const rate = Number(item.rate) || 0;
            const availableForTranOut = openingStock + receipts + tranIn;
            if (newValue > availableForTranOut) return prevData;
            item.tranOut = newValue;
            item.sales = openingStock + receipts + tranIn - closingStock - newValue;
            item.amount = `₹${(item.sales * rate).toFixed(2)}`;

            return newData;
        });
    };

    const getCollectionName = () => {
        if (userRole === 'Admin') {
            return selectedShop === 'admin' ? 'invoices_admin' : `invoices_${selectedShop}`;
        } else {
            return `invoices_${username}`;
        }
    };

    const getHistoryCollectionName = () => {
        if (userRole === 'Admin') {
            return selectedShop === 'admin' ? 'history_admin' : `history_${selectedShop}`;
        } else {
            return `history_${username}`;
        }
    };

    const handleDataFromChild = useCallback((data: ChildData): void => {
        setChildData(data);
        setSaveAllowed(false);
        setSaveStatus('idle');
    }, []);

    const handlePdfReset = useCallback((): void => {
        setChildData([]);
        setPendingData([]);
        setPdfTotal(0);
        setMatchedItemsCount(0);
        setShowConfirmModal(false);
    }, []);

    const handlePdfConfirm = useCallback((): void => {
        pdfConverterRef.current?.confirmProcessing();
    }, []);

    const filterWineData = useCallback((): void => {
        const filtered: FilteredItem[] = [...filterData];
        let totalAmount = 0;
        let matchedCount = 0;

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

                    matchedCount++;

                    const calculatedQuantity = firstIndex
                        ? (Number(firstIndex) * quantity) + Number(row[7])
                        : quantity;

                    const itemTotal = (issuePrice / Number(firstIndex)) * calculatedQuantity;
                    totalAmount += itemTotal;

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
                            tranIn: 0,
                            tranOut: 0,
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

        console.log('Total PDF Amount:', totalAmount);
        setPdfTotal(totalAmount);
        setMatchedItemsCount(matchedCount);
        setPendingData(filtered.sort((a, b) => a.particulars?.localeCompare(b.particulars || '') || 0));
        setShowConfirmModal(true);
    }, [childData, filterData]);

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
                setField1(data.field1 || '');
                setField2(data.field2 || '');
                setField3(data.field3 || '');
                setField4(data.field4 || '');
                setField5(data.field5 || '');
                setField6(data.field6 || '');
                setField7(data.field7 || '');
                // Only load dates if they exist, otherwise keep current auto-generated dates
                if (data.sheetFromDate) setSheetFromDate(data.sheetFromDate);
                if (data.sheetToDate) setSheetToDate(data.sheetToDate);
                // Set last saved to date for validation
                if (data.sheetToDate) setLastSavedToDate(data.sheetToDate);
                // Don't load payment data - always start fresh
                setPaymentData([{ phonepe: '', cash: '', amount: '', comments: '', date: '' }]);
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
            await addDoc(collection(db, historyCollectionName), {
                items: filterData,
                timestamp: serverTimestamp(),
                totalItems: filterData.length,
                savedAt: saveDate,
                user: username,
                role: userRole,
                invoiceName: invoiceName || `Invoice ${new Date().toLocaleDateString()}`,
                hasClosingStock: hasClosingStock,
                field1: field1Value,
                field2: field2,
                field3: field3Value,
                field4: field4,
                field5: field5Value,
                field6: field6Value,
                field7: field7Value,
                paymentData: paymentData,
                sheetFromDate: sheetFromDate,
                sheetToDate: sheetToDate
            });

            // Update opening stock based on closing stock or receipts
            let updatedData = filterData.map(item => {
                if (item.closingStock > 0) {
                    // If closing stock is entered, use it as next opening stock
                    return {
                        ...item,
                        openingStock: item.closingStock,
                        receipts: 0,
                        tranIn: 0,
                        tranOut: 0,
                        closingStock: 0,
                        sales: 0,
                        amount: '₹0',
                    };
                } else {
                    return {
                        ...item,
                        openingStock: hasClosingStock ? item.openingStock + item.receipts : item.openingStock,
                        receipts: hasClosingStock ? 0 : item.receipts,
                        tranIn: 0,
                        tranOut: 0,
                        closingStock: 0,
                        sales: 0,
                        amount: '₹0',
                    };
                }
            });
            const docData = {
                items: updatedData,
                timestamp: serverTimestamp(),
                totalItems: updatedData.length,
                createdAt: saveDate,
                user: username,
                role: userRole,
                field1: field1Value,
                field2: field2,
                field3: field3Value,
                field4: field4,
                field5: field5Value,
                field6: field6Value,
                field7: field7Value,
                sheetFromDate: sheetFromDate,
                sheetToDate: sheetToDate
            };

            await addDoc(collection(db, collectionName), docData);
            setFilterData(updatedData);
            setSaveStatus('success');
            setSaveMessage(`Successfully saved ${filterData.length} items`);
            setSaveAllowed(false);
            setInvoiceName('');
            const currentClosingBalance = field7Value;
            setField2(currentClosingBalance);
            setField4(''); // Clear Jama
            setPaymentData([{ phonepe: '', cash: '', amount: '', comments: '', date: '' }]);
            if (sheetToDate) {
                const parts = sheetToDate.split('/');
                if (parts.length === 3) {
                    const nextDay = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                    nextDay.setDate(nextDay.getDate());
                    setSheetFromDate(formatDateForDisplay(nextDay.toISOString()));
                }
                setLastSavedToDate(sheetToDate); // Update last saved date
                setSheetToDate(''); // Clear to date for next sheet
            }
        } catch (error) {
            setSaveStatus('error');
            setSaveMessage(`Failed to save: ${error}`);
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus('idle'), 5000);
        }
    };

    const handleLoginSuccess = (role: string, user: string) => {
        setIsLoggedIn(true);
        setUserRole(role);
        setUsername(user);

        // Save login data to localStorage with 24-hour expiration
        const expiresAt = new Date().getTime() + (24 * 60 * 60 * 1000); // 24 hours
        localStorage.setItem('wineAppLogin', JSON.stringify({
            isLoggedIn: true,
            userRole: role,
            username: user,
            expiresAt
        }));

        if (role === 'Admin') {
            loadAvailableShops();
            setShowShopSelection(true);
        }
    };

    const loadAvailableShops = async () => {
        try {
            const collections = await getDocs(query(collection(db, 'invoices_admin')));
            const shops = new Set<string>();
            const allCollections = [
                'shop1', 'shop2', 'shop3', 'shop4', 'shop_4', 'shop5', 'shop6', 'shop7', 'shop8', 'shop9', 'shop10',
                'shop11', 'shop12', 'shop13', 'shop14', 'shop15', 'shop16', 'shop17', 'shop18', 'shop19', 'shop20',
                'shop21', 'shop22', 'shop23', 'shop24', 'shop25', 'shop26', 'shop27', 'shop28', 'shop29', 'shop30',
                'shop31', 'shop32', 'shop33', 'shop34', 'shop35', 'shop36', 'shop37', 'shop38', 'shop39', 'shop40'
            ];
            setAvailableShops(allCollections);
        } catch (error) {
            console.error('Error loading shops:', error);
            // Fallback to predefined shops
            setAvailableShops([
                'shop1', 'shop2', 'shop3', 'shop4', 'shop_4', 'shop5', 'shop6', 'shop7', 'shop8', 'shop9', 'shop10',
                'shop11', 'shop12', 'shop13', 'shop14', 'shop15', 'shop16', 'shop17', 'shop18', 'shop19', 'shop20',
                'shop21', 'shop22', 'shop23', 'shop24', 'shop25', 'shop26', 'shop27', 'shop28', 'shop29', 'shop30',
                'shop31', 'shop32', 'shop33', 'shop34', 'shop35', 'shop36', 'shop37', 'shop38', 'shop39', 'shop40'
            ]);
        }
    };

    const selectShop = (shopName: string) => {
        setSelectedShop(shopName);
        setUsername(shopName);
        setShowShopSelection(false);

        // Clear all data when switching shops
        setFilterData([]);
        setField1('');
        setField2('');
        setField3('');
        setField4('');
        setField5('');
        setField6('');
        setField7('');
        setPaymentData([{ phonepe: '', cash: '', amount: '', comments: '', date: '' }]);
        setSheetFromDate('');
        setSheetToDate('');
        setChildData([]);

        // Update localStorage with selected shop
        const loginData = JSON.parse(localStorage.getItem('wineAppLogin') || '{}');
        const expiresAt = new Date().getTime() + (24 * 60 * 60 * 1000); // 24 hours
        localStorage.setItem('wineAppLogin', JSON.stringify({
            ...loginData,
            selectedShop: shopName,
            expiresAt
        }));
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

        const data = historyItem.items.map((item: FilteredItem) => ({
            'Particulars': item.particulars,
            'Size': item.size,
            'Opening Stock': item.openingStock,
            'Receipts': item.receipts,
            'Tran In': item.tranIn,
            'Tran Out': item.tranOut,
            'Total': (item.openingStock || 0) + (item.receipts || 0) + (item.tranIn || 0),
            'Closing Stock': item.closingStock,
            'Sales': item.sales,
            'Rate': item.rate,
            'Amount': item.amount,
        }));

        data.push({
            'Particulars': 'TOTAL',
            'Size': '-',
            'Opening Stock': historyItem.items.reduce((sum: number, item: FilteredItem) => sum + (item.openingStock || 0), 0),
            'Receipts': historyItem.items.reduce((sum: number, item: FilteredItem) => sum + (item.receipts || 0), 0),
            'Tran In': historyItem.items.reduce((sum: number, item: FilteredItem) => sum + (item.tranIn || 0), 0),
            'Tran Out': historyItem.items.reduce((sum: number, item: FilteredItem) => sum + (item.tranOut || 0), 0),
            'Total': historyItem.items.reduce((sum: number, item: FilteredItem) => sum + (item.openingStock || 0) + (item.receipts || 0) + (item.tranIn || 0), 0),
            'Closing Stock': historyItem.items.reduce((sum: number, item: FilteredItem) => sum + (item.closingStock || 0), 0),
            'Sales': historyItem.items.reduce((sum: number, item: FilteredItem) => sum + (item.sales || 0), 0),
            'Rate': '-',
            'Amount': `₹${historyItem.items.reduce((sum: number, item: FilteredItem) => {
                const amount = parseFloat(item.amount.replace('₹', '').replace(/,/g, '')) || 0;
                return sum + amount;
            }, 0).toLocaleString()}`,

        });

        data.push({
            'Particulars': 'CLOSING STOCK TOTAL AMOUNT',
            'Size': '',
            'Opening Stock': '',
            'Receipts': '',
            'Tran In': '',
            'Tran Out': '',
            'Closing Stock': '',
            'Sales': '',
            'Rate': '',
            'Amount': `₹${historyItem.items.reduce((sum: number, item: FilteredItem) => sum + ((item.closingStock || 0) * (item.rate || 0)), 0).toLocaleString()}`,
            'Brand Number': '',
            'Issue Price': '',
        });

        data.push({});
        if (historyItem.sheetFromDate || historyItem.sheetToDate) {
            data.push({ 'Particulars': 'SHEET PERIOD' });
            data.push({ 'Particulars': 'From Date', 'Size': historyItem.sheetFromDate || 'Not specified' });
            data.push({ 'Particulars': 'To Date', 'Size': historyItem.sheetToDate || 'Not specified' });
            data.push({});
        }
        data.push({ 'Particulars': 'ADDITIONAL INFORMATION' });
        data.push({ 'Particulars': 'Total Sale', 'Size': historyItem.field1 || '0' });
        data.push({ 'Particulars': 'Opening Balance', 'Size': historyItem.field2 || '0' });
        data.push({ 'Particulars': 'Total', 'Size': historyItem.field3 || '0' });
        data.push({ 'Particulars': 'Jama', 'Size': historyItem.field4 || '0' });
        data.push({ 'Particulars': 'Total', 'Size': historyItem.field5 || '0' });
        data.push({ 'Particulars': 'Expenses', 'Size': historyItem.field6 || '0' });
        data.push({ 'Particulars': 'Closing Balance', 'Size': historyItem.field7 || '0' });

        data.push({});
        data.push({ 'Particulars': 'PAYMENT INFORMATION' });
        if (historyItem.paymentData && historyItem.paymentData.length > 0) {
            historyItem.paymentData.forEach((payment: any, index: number) => {
                data.push({
                    'Particulars': `Payment ${index + 1}`,
                    'Size': `Date: ${payment.date}${payment.recordDate ? ` (${payment.recordDate})` : ''}`,
                    'Opening Stock': `PhonePe: ${payment.phonepe}`,
                    'Receipts': `Cash: ${payment.cash}`,
                    'Tran In': `Amount: ${payment.amount}`,
                    'Tran Out': `Comments: ${payment.comments}`,
                    'Closing Stock': '',
                    'Sales': '',
                    'Rate': '',
                    'Amount': '',
                    'Brand Number': '',
                    'Issue Price': '',
                });
            });
        } else {
            data.push({
                'Particulars': 'No payment information available',
                'Size': '',
                'Opening Stock': '',
                'Receipts': '',
                'Tran In': '',
                'Tran Out': '',
                'Closing Stock': '',
                'Sales': '',
                'Rate': '',
                'Amount': '',
                'Brand Number': '',
                'Issue Price': '',
            });
        }

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'History');
        const filename = consolidatedData ?
            `consolidated-${username}-${consolidatedData.startDate}-to-${consolidatedData.endDate}.xlsx` :
            `history-${username}-${new Date(historyItem.savedAt).toLocaleDateString().replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(workbook, filename);
    };

    // Mobile detection utility
    const isMobile = () => {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            window.innerWidth <= 768;
    };

    const downloadHistoryPDF = (historyItem: any) => {
        if (!historyItem.items || historyItem.items.length === 0) return;

        const title = consolidatedData ?
            `Consolidated Report: ${consolidatedData.startDate} to ${consolidatedData.endDate}` :
            `History - ${new Date(historyItem.savedAt).toLocaleDateString()}`;
        const subtitle = consolidatedData ?
            `${consolidatedData.recordCount} sheets consolidated` :
            new Date(historyItem.savedAt).toLocaleTimeString();
        const filename = consolidatedData ?
            `consolidated-${username}-${consolidatedData.startDate}-to-${consolidatedData.endDate}` :
            `history-${username}-${new Date(historyItem.savedAt).toLocaleDateString().replace(/\//g, '-')}`;

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${title}</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; margin: 0; }
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
                    @media (max-width: 768px) {
                        body { padding: 10px; }
                        table { font-size: 12px; }
                        th, td { padding: 6px; }
                    }
                </style>
            </head>
            <body>
                <h1>${consolidatedData ? 'Consolidated Report' : 'Wine Invoice History'}</h1>
                <div class="user-info">${userRole}: ${username}</div>
                <div class="date">${subtitle}</div>
                ${(historyItem.sheetFromDate || historyItem.sheetToDate) ? `
                    <div style="margin-bottom: 20px; padding: 15px; background-color: #f0f9ff; border-left: 4px solid #2563eb;">
                        <h3 style="color: #2563eb; margin: 0 0 10px 0;">Sheet Period</h3>
                        <p style="margin: 5px 0;"><strong>From:</strong> ${historyItem.sheetFromDate || 'Not specified'}</p>
                        <p style="margin: 5px 0;"><strong>To:</strong> ${historyItem.sheetToDate || 'Not specified'}</p>
                    </div>
                ` : ''}
                <table>
                    <thead>
                        <tr>
                            <th>Particulars</th>
                            <th class="text-center">Size</th>
                            <th class="text-center">Opening Stock</th>
                            <th class="text-center">Receipts</th>
                            <th class="text-center">Tran In</th>
                            <th class="text-center">Tran Out</th>
                            <th class="text-center">Total</th>
                            <th class="text-center">Closing Stock</th>
                            <th class="text-center">Sales</th>
                            <th class="text-center">Rate</th>
                            <th class="text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${historyItem.items.map((item: FilteredItem) => `
                            <tr>
                                <td>${item.particulars}</td>
                                <td class="text-center">${item.size}</td>
                                <td class="text-center">${item.openingStock || 0}</td>
                                <td class="text-center">${item.receipts || 0}</td>
                                <td class="text-center">${item.tranIn || 0}</td>
                                <td class="text-center">${item.tranOut || 0}</td>
                                <td class="text-center">${(item.openingStock || 0) + (item.receipts || 0) + (item.tranIn || 0)}</td>
                                <td class="text-center">${item.closingStock || 0}</td>
                                <td class="text-center">${item.sales || 0}</td>
                                <td class="text-center">₹${item.rate}</td>
                                <td class="text-right">${item.amount}</td>
                            </tr>
                        `).join('')}
                        <tr style="background-color: #f3f4f6; border-top: 2px solid #d1d5db; font-weight: bold;">
                            <td>TOTAL</td>
                            <td class="text-center">-</td>
                            <td class="text-center">${historyItem.items.reduce((sum: number, item: FilteredItem) => sum + (item.openingStock || 0), 0)}</td>
                            <td class="text-center">${historyItem.items.reduce((sum: number, item: FilteredItem) => sum + (item.receipts || 0), 0)}</td>
                            <td class="text-center">${historyItem.items.reduce((sum: number, item: FilteredItem) => sum + (item.tranIn || 0), 0)}</td>
                            <td class="text-center">${historyItem.items.reduce((sum: number, item: FilteredItem) => sum + (item.tranOut || 0), 0)}</td>
                            <td class="text-center">${historyItem.items.reduce((sum: number, item: FilteredItem) => sum + (item.openingStock || 0) + (item.receipts || 0) + (item.tranIn || 0), 0)}</td>
                            <td class="text-center">${historyItem.items.reduce((sum: number, item: FilteredItem) => sum + (item.closingStock || 0), 0)}</td>
                            <td class="text-center">${historyItem.items.reduce((sum: number, item: FilteredItem) => sum + (item.sales || 0), 0)}</td>
                            <td class="text-center">-</td>
                            <td class="text-right">₹${historyItem.items.reduce((sum: number, item: FilteredItem) => {
            const amount = parseFloat(item.amount.replace('₹', '').replace(/,/g, '')) || 0;
            return sum + amount;
        }, 0).toLocaleString()}</td>
                        </tr>
                        <tr style="background-color: #eff6ff; font-weight: bold;">
                            <td colspan="10">CLOSING STOCK TOTAL AMOUNT</td>
                            <td class="text-right">₹${historyItem.items.reduce((sum: number, item: FilteredItem) => {
            return sum + ((item.closingStock || 0) * (item.rate || 0));
        }, 0).toLocaleString()}</td>
                        </tr>
                    </tbody>
                </table>
                
                <div style="margin-top: 30px;">
                    <h3 style="color: #2563eb; margin-bottom: 15px;">Additional Information</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f3e8ff;">Total Sale</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${historyItem.field1 || '0'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f3e8ff;">Opening Balance</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${historyItem.field2 || '0'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f3e8ff;">Total</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${historyItem.field3 || '0'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f3e8ff;">Jama</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${historyItem.field4 || '0'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f3e8ff;">Total</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${historyItem.field5 || '0'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f3e8ff;">Expenses</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${historyItem.field6 || '0'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background-color: #f3e8ff;">Closing Balance</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${historyItem.field7 || '0'}</td>
                        </tr>
                    </table>
                </div>
                
                <div style="margin-top: 30px;">
                    <h3 style="color: #2563eb; margin-bottom: 15px;">Payment Information${consolidatedData ? ` (Consolidated from ${consolidatedData.recordCount} sheets)` : ''}</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background-color: #f3e8ff;">
                                <th style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Date</th>
                                ${consolidatedData ? '<th style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Sheet Date</th>' : ''}
                                <th style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">PhonePe</th>
                                <th style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Cash</th>
                                <th style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Amount</th>
                                <th style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Comments</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${historyItem.paymentData && historyItem.paymentData.length > 0 ?
                historyItem.paymentData.filter((p: any) => p.date || p.phonepe || p.cash || p.amount || p.comments).map((payment: any) => `
                                    <tr>
                                        <td style="padding: 10px; border: 1px solid #ddd;">${payment.date || '-'}</td>
                                        ${consolidatedData ? `<td style="padding: 10px; border: 1px solid #ddd;">${payment.recordDate || ''}</td>` : ''}
                                        <td style="padding: 10px; border: 1px solid #ddd;">${payment.phonepe || '0'}</td>
                                        <td style="padding: 10px; border: 1px solid #ddd;">${payment.cash || '0'}</td>
                                        <td style="padding: 10px; border: 1px solid #ddd;">${payment.amount || '0'}</td>
                                        <td style="padding: 10px; border: 1px solid #ddd;">${payment.comments || '-'}</td>
                                    </tr>
                                `).join('') + `
                                <tr style="background-color: #f3f4f6; font-weight: bold;">
                                    <td style="padding: 10px; border: 1px solid #ddd;">TOTAL</td>
                                    ${consolidatedData ? '<td style="padding: 10px; border: 1px solid #ddd;">-</td>' : ''}
                                    <td style="padding: 10px; border: 1px solid #ddd;">${historyItem.paymentData.reduce((sum: number, p: any) => sum + (parseFloat(p.phonepe) || 0), 0)}</td>
                                    <td style="padding: 10px; border: 1px solid #ddd;">${historyItem.paymentData.reduce((sum: number, p: any) => sum + (parseFloat(p.cash) || 0), 0)}</td>
                                    <td style="padding: 10px; border: 1px solid #ddd;">${historyItem.paymentData.reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0)}</td>
                                    <td style="padding: 10px; border: 1px solid #ddd;">-</td>
                                </tr>` :
                `<tr><td colspan="${consolidatedData ? '6' : '5'}" style="padding: 20px; text-align: center; color: #666; border: 1px solid #ddd;">No payment information available</td></tr>`
            }
                        </tbody>
                    </table>
                </div>
            </body>
            </html>
        `;

        if (isMobile()) {
            // For mobile devices, create a blob and trigger direct download
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename + '.html';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            // For desktop, use the print window approach
            const printWindow = window.open('', '', 'height=800,width=1000');
            if (!printWindow) return;

            printWindow.document.write(htmlContent);
            printWindow.document.close();

            printWindow.onload = () => {
                printWindow.print();
                printWindow.onafterprint = () => printWindow.close();
            };
        }
    };

    const viewHistorySheet = (record: any) => {
        setSelectedHistory(record);
    };

    const viewClosingStock = (record: any) => {
        setSelectedHistory(record);
        setShowClosingStockView(true);
    };

    const closeHistorySheet = () => {
        // Clear any pending auto-save
        if (autoSaveTimeout) {
            clearTimeout(autoSaveTimeout);
            setAutoSaveTimeout(null);
        }
        
        setAutoSaveStatus('idle');
        setSelectedHistory(null);
        setConsolidatedData(null);
        setEditingHistory(null);
        setEditedHistoryData([]);
        setEditedPaymentData([]);
        setEditedAdditionalInfo({});
        setEditedDates({ from: '', to: '' });
        setOriginalClosingStocks({});
        setShowClosingStockView(false);
    };

    const startEditHistory = (record: any) => {
        setEditingHistory(record);
        // Deep copy the items to avoid mutating the original
        setEditedHistoryData(JSON.parse(JSON.stringify(record.items || [])));
        // Initialize edited payment data
        setEditedPaymentData(JSON.parse(JSON.stringify(record.paymentData || [])));
        // Initialize edited additional info
        setEditedAdditionalInfo({
            field1: record.field1 || '',
            field2: record.field2 || '',
            field3: record.field3 || '',
            field4: record.field4 || '',
            field5: record.field5 || '',
            field6: record.field6 || '',
            field7: record.field7 || '',
        });
        // Initialize edited dates
        setEditedDates({
            from: formatDateForInput(record.sheetFromDate || ''),
            to: formatDateForInput(record.sheetToDate || '')
        });
        // Store original closing stocks for comparison
        const originalStocks: {[key: string]: number} = {};
        if (record.items) {
            record.items.forEach((item: FilteredItem, index: number) => {
                const key = `${item.particulars}_${item.rate}`;
                originalStocks[key] = item.closingStock || 0;
            });
        }
        setOriginalClosingStocks(originalStocks);
    };

    const handleHistoryFieldChange = (itemIndex: number, field: string, value: string) => {
        const updatedData = [...editedHistoryData];
        const item = updatedData[itemIndex];
        
        // Parse and validate input (ensure non-negative values)
        const numValue = Math.max(0, parseInt(value) || 0);

        if (field === 'closingStock') {
            // Validate closing stock doesn't exceed available stock
            const availableStock = (item.openingStock || 0) + (item.receipts || 0) + (item.tranIn || 0) - (item.tranOut || 0);
            item.closingStock = Math.min(numValue, availableStock);
        } else if (field === 'tranIn') {
            item.tranIn = numValue;
        } else if (field === 'tranOut') {
            // Validate tran out doesn't exceed available stock
            const availableForTranOut = (item.openingStock || 0) + (item.receipts || 0) + (item.tranIn || 0);
            item.tranOut = Math.min(numValue, availableForTranOut);
        } else if (field === 'openingStock') {
            item.openingStock = numValue;
        } else if (field === 'receipts') {
            item.receipts = numValue;
        }

        // Recalculate sales: Sales = (Opening Stock + Receipts + Tran In) - Closing Stock - Tran Out
        const total = (item.openingStock || 0) + (item.receipts || 0) + (item.tranIn || 0);
        item.sales = Math.max(0, total - (item.closingStock || 0) - (item.tranOut || 0));

        // Calculate amount = sales * rate (not closing stock * rate)
        const amount = (item.sales || 0) * (item.rate || 0);
        item.amount = `₹${amount.toFixed(2)}`;

        setEditedHistoryData(updatedData);

        // Recalculate total sale amount in additional info
        const newTotalSale = updatedData.reduce((sum, dataItem) => {
            const itemAmount = parseFloat(dataItem.amount.replace('₹', '').replace(',', '')) || 0;
            return sum + itemAmount;
        }, 0);

        const updatedAdditionalInfo = {
            ...editedAdditionalInfo,
            field1: newTotalSale.toString(),
            field3: (newTotalSale + parseFloat(editedAdditionalInfo.field2 || '0')).toString(),
            field5: (newTotalSale + parseFloat(editedAdditionalInfo.field2 || '0') + parseFloat(editedAdditionalInfo.field4 || '0')).toString(),
            field7: Math.abs((newTotalSale + parseFloat(editedAdditionalInfo.field2 || '0') + parseFloat(editedAdditionalInfo.field4 || '0')) - parseFloat(editedAdditionalInfo.field6 || '0')).toString()
        };
        
        setEditedAdditionalInfo(updatedAdditionalInfo);

        // Auto-save to Firebase with debounce
        debouncedAutoSaveHistoryEdits(updatedData, updatedAdditionalInfo);
    };

    const handleEditedPaymentChange = (index: number, field: string, value: string) => {
        const updatedPaymentData = [...editedPaymentData];
        updatedPaymentData[index] = {
            ...updatedPaymentData[index],
            [field]: value
        };
        setEditedPaymentData(updatedPaymentData);
        
        // Recalculate total expenses in additional info
        const phonepeTotal = updatedPaymentData.reduce((sum, p) => sum + (parseFloat(p.phonepe) || 0), 0);
        const cashTotal = updatedPaymentData.reduce((sum, p) => sum + (parseFloat(p.cash) || 0), 0);
        const amountTotal = updatedPaymentData.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        const totalExpenses = phonepeTotal + cashTotal + amountTotal;
        
        const updatedInfo = {
            ...editedAdditionalInfo,
            field6: totalExpenses.toString()
        };
        
        // Recalculate field7 (closing balance)
        const field1Val = parseFloat(updatedInfo.field1 || '0');
        const field2Val = parseFloat(updatedInfo.field2 || '0');
        const field4Val = parseFloat(updatedInfo.field4 || '0');
        updatedInfo.field7 = Math.abs((field1Val + field2Val + field4Val) - totalExpenses).toString();
        
        setEditedAdditionalInfo(updatedInfo);
        
        // Auto-save to Firebase with debounce
        debouncedAutoSaveHistoryEdits(editedHistoryData, updatedInfo, updatedPaymentData);
    };

    const handleEditedAdditionalInfoChange = (field: string, value: string) => {
        const updatedInfo = {
            ...editedAdditionalInfo,
            [field]: value
        };
        
        // Recalculate dependent fields
        if (field === 'field2' || field === 'field4' || field === 'field6') {
            const field1Val = parseFloat(updatedInfo.field1 || '0');
            const field2Val = parseFloat(updatedInfo.field2 || '0');
            const field4Val = parseFloat(updatedInfo.field4 || '0');
            const field6Val = parseFloat(updatedInfo.field6 || '0');
            
            updatedInfo.field3 = (field1Val + field2Val).toString();
            updatedInfo.field5 = (field1Val + field2Val + field4Val).toString();
            updatedInfo.field7 = Math.abs((field1Val + field2Val + field4Val) - field6Val).toString();
        }
        
        setEditedAdditionalInfo(updatedInfo);
        
        // Auto-save to Firebase with debounce
        debouncedAutoSaveHistoryEdits(editedHistoryData, updatedInfo);
    };

    const handleEditedDateChange = (field: 'from' | 'to', value: string) => {
        // Value from input type="date" is already in yyyy-mm-dd format
        setEditedDates((prev) => ({
            ...prev,
            [field]: value
        }));
    };

    const saveHistoryEdits = async () => {
        if (!editingHistory || !username) return;

        // Validation: Check if From Date is empty
        if (!editedDates.from) {
            alert('From Date cannot be empty.');
            return;
        }

        setIsSaving(true);
        try {
            const historyCollectionName = getHistoryCollectionName();
            const historyDocRef = doc(db, historyCollectionName, editingHistory.id);

            // Update the history document with edited items
            await updateDoc(historyDocRef, {
                items: editedHistoryData,
                paymentData: editedPaymentData,
                ...editedAdditionalInfo,
                sheetFromDate: formatDateFromInput(editedDates.from),
                sheetToDate: formatDateFromInput(editedDates.to),
                lastEditedAt: serverTimestamp()
            });

            // Update main sheet based on closing stock changes
            try {
                const collectionName = getCollectionName();
                const mainQuery = query(
                    collection(db, collectionName),
                    orderBy('createdAt', 'desc'),
                    limit(1)
                );
                const mainSnapshot = await getDocs(mainQuery);

                if (!mainSnapshot.empty) {
                    const latestDoc = mainSnapshot.docs[0];
                    const latestDocRef = doc(db, collectionName, latestDoc.id);
                    const currentMainData = latestDoc.data();
                    
                    // Update main sheet items based on closing stock changes
                    const updatedMainItems = [...(currentMainData.items || [])];
                    let hasChanges = false;

                    editedHistoryData.forEach((editedItem: FilteredItem) => {
                        const key = `${editedItem.particulars}_${editedItem.rate}`;
                        const originalClosingStock = originalClosingStocks[key] || 0;
                        const newClosingStock = editedItem.closingStock || 0;
                        
                        // Only update if closing stock actually changed
                        if (originalClosingStock !== newClosingStock) {
                            const mainItemIndex = updatedMainItems.findIndex(
                                (mainItem: FilteredItem) => 
                                    mainItem.particulars === editedItem.particulars && 
                                    mainItem.rate === editedItem.rate
                            );
                            
                            if (mainItemIndex !== -1) {
                                // Update opening stock in main sheet with new closing stock
                                updatedMainItems[mainItemIndex].openingStock = newClosingStock;
                                hasChanges = true;
                            }
                        }
                    });

                    // Update the main collection with modified items and recalculated balances
                    if (hasChanges) {
                        const closingBalance = parseFloat(editedAdditionalInfo.field7 || '0');
                        const currentField1 = parseFloat(field1Value || '0');
                        const newField3 = currentField1 + closingBalance;
                        const currentField4 = parseFloat(field4 || '0');
                        const newField5 = newField3 + currentField4;
                        const currentField6 = parseFloat(field6Value || '0');
                        const newField7 = Math.abs(newField5 - currentField6);

                        await updateDoc(latestDocRef, {
                            items: updatedMainItems,
                            field2: closingBalance.toString(),
                            field3: newField3.toString(),
                            field5: newField5.toString(),
                            field7: newField7.toString()
                        });
                        
                        // Update local state
                        setFilterData(updatedMainItems);
                        setField2(closingBalance.toString());
                    }
                }
            } catch (mainCollectionError) {
                console.error('Error updating main collection:', mainCollectionError);
                setSaveMessage('History updated, but main collection update failed. Please reload and save again.');
            }

            // Reload history to reflect changes
            await loadHistory();

            setSaveStatus('success');
            setSaveMessage('History updated successfully! Main sheet updated with closing stock changes.');

            // Close edit mode
            setEditingHistory(null);
            setEditedHistoryData([]);
            setSelectedHistory(null);
            setOriginalClosingStocks({});
        } catch (error) {
            console.error('Error saving history edits:', error);
            setSaveStatus('error');
            setSaveMessage('Failed to save history edits');
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const cancelHistoryEdit = () => {
        // Clear any pending auto-save
        if (autoSaveTimeout) {
            clearTimeout(autoSaveTimeout);
            setAutoSaveTimeout(null);
        }
        
        setAutoSaveStatus('idle');
        setEditingHistory(null);
        setEditedHistoryData([]);
        setEditedPaymentData([]);
        setEditedAdditionalInfo({});
        setEditedDates({ from: '', to: '' });
        setOriginalClosingStocks({});
    };


    const consolidateSheets = async () => {
        if (!startDate || !endDate || !username) return;

        try {
            // Parse date helper function
            const parseDate = (dateStr: string) => {
                if (!dateStr) return null;
                if (dateStr.includes('/')) {
                    const parts = dateStr.split('/');
                    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
                return dateStr;
            };

            // Filter records that have closing stock and overlap with the selected date range
            const matchingRecords = historyData.filter((record: any) => {
                if (!record.hasClosingStock) return false;

                const sheetStart = parseDate(record.sheetFromDate);
                const sheetEnd = parseDate(record.sheetToDate);

                if (!sheetStart || !sheetEnd) return false;

                // Check if the sheet period overlaps with the selected range
                return sheetStart <= endDate && sheetEnd >= startDate;
            });

            if (matchingRecords.length === 0) {
                alert('No records found with closing stock data in the selected date range.');
                return;
            }

            // Sort records by date to get first and last sheets
            const sortedRecords = matchingRecords.sort((a: any, b: any) => {
                const dateA = parseDate(a.sheetToDate) || '0';
                const dateB = parseDate(b.sheetToDate) || '0';
                return dateA.localeCompare(dateB);
            });

            const firstSheet = sortedRecords[0];
            const lastSheet = sortedRecords[sortedRecords.length - 1];

            // Get particulars from the last sheet
            const consolidatedItems: { [key: string]: FilteredItem } = {};
            const allPaymentData: any[] = [];

            // Initialize with particulars from last sheet
            if (lastSheet.items && Array.isArray(lastSheet.items)) {
                lastSheet.items.forEach((item: FilteredItem) => {
                    const key = `${item.particulars}_${item.rate}`;
                    consolidatedItems[key] = {
                        ...item,
                        openingStock: 0, // Will be set from first sheet
                        receipts: 0, // Will be summed from all sheets
                        tranIn: 0, // Will be summed from all sheets
                        tranOut: 0, // Will be summed from all sheets
                        closingStock: item.closingStock || 0, // From last sheet
                        sales: 0 // Will be summed from all sheets
                    };
                });
            }

            // Set opening stock from first sheet
            if (firstSheet.items && Array.isArray(firstSheet.items)) {
                firstSheet.items.forEach((item: FilteredItem) => {
                    const key = `${item.particulars}_${item.rate}`;
                    if (consolidatedItems[key]) {
                        consolidatedItems[key].openingStock = item.openingStock || 0;
                    }
                });
            }

            // Sum receipts, tranIn, tranOut, and sales from all sheets
            sortedRecords.forEach((record: any) => {
                if (record.items && Array.isArray(record.items)) {
                    record.items.forEach((item: FilteredItem) => {
                        const key = `${item.particulars}_${item.rate}`;

                        if (consolidatedItems[key]) {
                            // Sum these values from all sheets
                            consolidatedItems[key].receipts += item.receipts || 0;
                            consolidatedItems[key].tranIn += item.tranIn || 0;
                            consolidatedItems[key].tranOut += item.tranOut || 0;
                            consolidatedItems[key].sales += item.sales || 0;

                            // Recalculate amount based on total sales
                            const totalSales = consolidatedItems[key].sales;
                            consolidatedItems[key].amount = `₹${(totalSales * consolidatedItems[key].rate).toFixed(2)}`;
                        }
                    });
                }

                // Consolidate payment data with record date information
                if (record.paymentData && Array.isArray(record.paymentData)) {
                    record.paymentData.forEach((payment: any) => {
                        // Only include payments that have actual data
                        if (payment.date || payment.phonepe || payment.cash || payment.amount || payment.comments) {
                            allPaymentData.push({
                                ...payment,
                                recordDate: `${record.sheetFromDate || 'N/A'} to ${record.sheetToDate || 'N/A'}`
                            });
                        }
                    });
                }
            });

            // Sum field values from all sheets, but use opening balance from first sheet
            let totalField1 = 0;
            let totalField2 = parseFloat(firstSheet.field2 || '0'); // Opening balance from first sheet
            let totalField4 = 0;
            let totalField6 = 0;

            sortedRecords.forEach((record: any) => {
                totalField1 += parseFloat(record.field1 || '0');
                // Skip field2 - already set from first sheet
                totalField4 += parseFloat(record.field4 || '0');
                totalField6 += parseFloat(record.field6 || '0');
            });

            // Calculate derived fields correctly
            const totalField3 = totalField1 + totalField2; // Total = Total Sale + Opening Balance
            const totalField5 = totalField3 + totalField4; // Total = field3 + Jama
            const totalField7 = totalField5 - totalField6; // Closing Balance = field5 - Expenses

            // Convert consolidated items back to array
            const consolidatedItemsArray = Object.values(consolidatedItems);

            // Create consolidated record
            const consolidatedRecord = {
                items: consolidatedItemsArray,
                paymentData: allPaymentData,
                field1: totalField1.toString(),
                field2: totalField2.toString(),
                field3: totalField3.toString(),
                field4: totalField4.toString(),
                field5: totalField5.toString(),
                field6: totalField6.toString(),
                field7: totalField7.toString(),
                sheetFromDate: startDate,
                sheetToDate: endDate,
                savedAt: new Date().toISOString()
            };

            // Set consolidated data info
            setConsolidatedData({
                startDate,
                endDate,
                recordCount: matchingRecords.length
            });

            // Show the consolidated record
            setSelectedHistory(consolidatedRecord);
            setShowHistory(false);

        } catch (error) {
            console.error('Error consolidating sheets:', error);
            alert('Error consolidating sheets. Please try again.');
        }
    };



    const handleLogout = () => {
        setIsLoggedIn(false);
        setUserRole('');
        setUsername('');
        setFilterData([]);
        setChildData([]);
        setSaveStatus('idle');
        localStorage.removeItem('wineAppLogin');
    };

    // Check for stored login data on component mount
    useEffect(() => {
        const storedLoginData = localStorage.getItem('wineAppLogin');
        if (storedLoginData) {
            const { isLoggedIn, userRole, username, selectedShop, expiresAt } = JSON.parse(storedLoginData);
            if (new Date().getTime() < expiresAt) {
                setIsLoggedIn(isLoggedIn);
                setUserRole(userRole);
                setUsername(username);
                if (selectedShop) setSelectedShop(selectedShop);
            } else {
                localStorage.removeItem('wineAppLogin');
            }
        }
    }, []);

    useEffect(() => {
        if (isLoggedIn && username) {
            // Clear all data before loading new shop data
            setFilterData([]);
            setField1('');
            setField2('');
            setField3('');
            setField4('');
            setField5('');
            setField6('');
            setField7('');
            setPaymentData([{ phonepe: '', cash: '', amount: '', comments: '', date: '' }]);
            setSheetFromDate('');
            setSheetToDate('');
            setChildData([]);

            loadFromFirebase();
        }
    }, [isLoggedIn, username]);

    useEffect(() => {
        if (childData.length > 0) filterWineData();
    }, [childData, filterWineData]);

    // Update field1 when filterData changes (for real-time total sale calculation)
    useEffect(() => {
        if (filterData.length > 0) {
            const newTotalSale = filterData.reduce((sum, item) => {
                const amount = parseFloat(item.amount.replace('₹', '').replace(',', '')) || 0;
                return sum + amount;
            }, 0);
            setField1(newTotalSale.toString());
        }
    }, [filterData]);

    // Cleanup auto-save timeout on unmount
    useEffect(() => {
        return () => {
            if (autoSaveTimeout) {
                clearTimeout(autoSaveTimeout);
            }
        };
    }, [autoSaveTimeout]);

    if (!isLoggedIn) {
        return <LoginForm onLoginSuccess={handleLoginSuccess} />;
    }

    if (userRole === 'Admin' && showShopSelection) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
                    <div className="text-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">Select Shop</h2>
                        <p className="text-gray-600">Choose which shop's data you want to view</p>
                    </div>
                    <div className="space-y-3">
                        {availableShops.map((shop) => (
                            <button
                                key={shop}
                                onClick={() => selectShop(shop)}
                                className="w-full px-4 py-3 text-left border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all"
                            >
                                <p className="font-semibold text-blue-600 capitalize">{shop}</p>
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => {
                            setShowShopSelection(false);
                            setSelectedShop('admin');
                            setUsername('admin');
                        }}
                        className="w-full mt-4 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all"
                    >
                        View Admin Data
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-blue-600 p-3 sm:p-4 shadow-md">
                <div className="container mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-white text-xl sm:text-2xl md:text-3xl font-bold">
                            {userRole === 'Shop Owner' ? username : 'Wine Invoice Tracker'}
                        </h1>
                        <p className="text-blue-100 text-sm mt-1">
                            {userRole}{userRole === 'Admin' && selectedShop && selectedShop !== 'admin' && ` (Viewing: ${selectedShop})`}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {userRole === 'Admin' && (
                            <button
                                onClick={() => setShowShopSelection(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-all"
                            >
                                Switch Shop
                            </button>
                        )}
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-all"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto p-2 sm:p-4 md:p-6">
                <div className="bg-white shadow-lg rounded-lg p-3 sm:p-4 md:p-6 mb-4 sm:mb-6">
                    <div className="text-center mb-4 p-3 bg-blue-50 rounded-lg">
                        <h2 className="text-lg font-semibold text-blue-800">
                            {new Date().toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </h2>
                    </div>
                    <PDFToExcelConverter
                        ref={pdfConverterRef}
                        sendDataToParent={handleDataFromChild}
                        saveAllowed={saveAllowed}
                        onReset={handlePdfReset}
                        onShowIdocs={(idocs) => {
                            setIdocList(idocs);
                            setShowIdocList(true);
                        }}
                    />
                </div>

                {filterData.length > 0 && (
                    <>
                        <div className="mb-4 bg-white shadow-lg rounded-lg p-4">
                            {userRole === 'Shop Owner' && (
                                <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                                    <h3 className="text-sm font-semibold text-blue-800 mb-3">Sheet Information</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {/*<input*/}
                                        {/*    type="text"*/}
                                        {/*    placeholder="Invoice Name (optional)"*/}
                                        {/*    value={invoiceName}*/}
                                        {/*    onChange={(e) => setInvoiceName(e.target.value)}*/}
                                        {/*    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"*/}
                                        {/*/>*/}
                                        <div className="flex flex-col">
                                            <label className="text-xs text-gray-600 mb-1">From Date</label>
                                            <input
                                                type="date"
                                                value={formatDateForInput(sheetFromDate)}
                                                onChange={(e) => setSheetFromDate(formatDateFromInput(e.target.value))}
                                                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-xs text-gray-600 mb-1">To Date</label>
                                            <input
                                                type="date"
                                                value={formatDateForInput(sheetToDate)}
                                                onChange={(e) => setSheetToDate(formatDateFromInput(e.target.value))}
                                                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-3">

                                    <button
                                        onClick={() => {
                                            saveToFirebase();
                                            setSaveAllowed(true);
                                        }}
                                        disabled={isSaving}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${isSaving
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
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${isLoading
                                            ? 'bg-gray-400 cursor-not-allowed'
                                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
                                            }`}
                                    >
                                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                                        {isLoading ? 'Loading...' : 'Load'}
                                    </button>

                                    {(userRole === 'Shop Owner' || (userRole === 'Admin' && selectedShop && selectedShop !== 'admin')) && (
                                        <>
                                            <button
                                                onClick={loadHistory}
                                                disabled={isLoading}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${isLoading
                                                    ? 'bg-gray-400 cursor-not-allowed'
                                                    : 'bg-purple-600 hover:bg-purple-700 text-white shadow-md hover:shadow-lg'
                                                    }`}
                                            >
                                                <Download className="w-4 h-4" />
                                                History
                                            </button>
                                            <button
                                                onClick={() => pdfConverterRef.current?.loadAllIdocs()}
                                                disabled={isLoading}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${isLoading
                                                    ? 'bg-gray-400 cursor-not-allowed'
                                                    : 'bg-orange-600 hover:bg-orange-700 text-white shadow-md hover:shadow-lg'
                                                    }`}
                                            >
                                                ID's
                                            </button>
                                        </>
                                    )}

                                    <div className="h-6 w-px bg-gray-300"></div>

                                    {/*<button*/}
                                    {/*    onClick={downloadExcel}*/}
                                    {/*    className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all"*/}
                                    {/*>*/}
                                    {/*    <FileSpreadsheet className="w-4 h-4" />*/}
                                    {/*    Excel*/}
                                    {/*</button>*/}

                                    {/*<button*/}
                                    {/*    onClick={downloadPDF}*/}
                                    {/*    className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-red-600 hover:bg-red-700 text-white shadow-md hover:shadow-lg transition-all"*/}
                                    {/*>*/}
                                    {/*    <FileText className="w-4 h-4" />*/}
                                    {/*    PDF*/}
                                    {/*</button>*/}

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
                                            <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">Tran In</th>
                                            <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">Tran Out</th>
                                            <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">Total</th>
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
                                                <td className="px-2 sm:px-4 py-2 sm:py-3 text-center text-gray-900">
                                                    <input type="number" value={item.openingStock} className="w-16 sm:w-20 px-2 py-1 text-center text-xs sm:text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 text-gray-900 focus:ring-blue-500" readOnly />
                                                </td>
                                                <td className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-blue-600">{item.receipts}</td>
                                                <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                                                    <input
                                                        type="number"
                                                        value={item.tranIn}
                                                        onChange={(e) => handleTranInChange(index, e.target.value)}
                                                        disabled={userRole === 'Admin'}
                                                        className={`w-12 sm:w-16 px-2 py-1 text-center text-xs sm:text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 text-gray-900 focus:ring-blue-500 ${userRole === 'Admin' ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                                                            }`}
                                                    />
                                                </td>
                                                <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                                                    <input
                                                        type="number"
                                                        value={item.tranOut}
                                                        onChange={(e) => handleTranOutChange(index, e.target.value)}
                                                        disabled={userRole === 'Admin'}
                                                        className={`w-12 sm:w-16 px-2 py-1 text-center text-xs sm:text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 text-gray-900 focus:ring-blue-500 ${userRole === 'Admin' ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                                                            }`}
                                                    />
                                                </td>
                                                <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                                                    <span className="text-purple-600 font-semibold text-xs sm:text-sm">
                                                        {(item.openingStock || 0) + (item.receipts || 0) + (item.tranIn || 0) - (item.tranOut || 0)}
                                                    </span>
                                                </td>
                                                <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                                                    <input
                                                        type="number"
                                                        value={item.closingStock}
                                                        onChange={(e) => handleClosingStockChange(index, e.target.value)}
                                                        disabled={userRole === 'Admin'}
                                                        className={`w-12 sm:w-16 px-2 py-1 text-center text-xs sm:text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 text-gray-900 focus:ring-blue-500 ${userRole === 'Admin' ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
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
                                    <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                                        <tr className="font-bold">
                                            <td className="px-2 sm:px-4 py-3 text-sm text-gray-800">TOTAL</td>
                                            <td className="px-2 sm:px-4 py-3 text-center">-</td>
                                            <td className="px-2 sm:px-4 py-3 text-center text-sm text-gray-900">
                                                {filterData.reduce((sum, item) => sum + item.openingStock, 0)}
                                            </td>
                                            <td className="px-2 sm:px-4 py-3 text-center text-sm text-blue-600">
                                                {filterData.reduce((sum, item) => sum + item.receipts, 0)}
                                            </td>
                                            <td className="px-2 sm:px-4 py-3 text-center text-sm text-gray-900">
                                                {filterData.reduce((sum, item) => sum + item.tranIn, 0)}
                                            </td>
                                            <td className="px-2 sm:px-4 py-3 text-center text-sm text-gray-900">
                                                {filterData.reduce((sum, item) => sum + item.tranOut, 0)}
                                            </td>
                                            <td className="px-2 sm:px-4 py-3 text-center text-sm text-purple-600">
                                                {filterData.reduce((sum, item) => sum + (item.openingStock || 0) + (item.receipts || 0) + (item.tranIn || 0), 0)}
                                            </td>
                                            <td className="px-2 sm:px-4 py-3 text-center text-sm text-gray-900">
                                                {filterData.reduce((sum, item) => sum + item.closingStock, 0)}
                                            </td>
                                            <td className="px-2 sm:px-4 py-3 text-center text-sm text-gray-900">
                                                {filterData.reduce((sum, item) => sum + item.sales, 0)}
                                            </td>
                                            <td className="px-2 sm:px-4 py-3 text-center">-</td>
                                            <td className="px-2 sm:px-4 py-3 text-right text-sm text-green-600">
                                                ₹{filterData.reduce((sum, item) => {
                                                    const amount = parseFloat(item.amount.replace('₹', '').replace(',', '')) || 0;
                                                    return sum + amount;
                                                }, 0).toLocaleString()}
                                            </td>
                                        </tr>
                                        <tr className="font-bold bg-blue-50">
                                            <td className="px-2 sm:px-4 py-3 text-sm text-gray-800" colSpan={10}>CLOSING STOCK TOTAL AMOUNT</td>
                                            <td className="px-2 sm:px-4 py-3 text-right text-sm text-purple-600">
                                                ₹{filterData.reduce((sum, item) => {
                                                    return sum + (item.closingStock * item.rate);
                                                }, 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            <div className="sm:hidden p-2 text-center text-xs text-gray-500 bg-gray-50">
                                ← Scroll horizontally to see all columns →
                            </div>
                        </div>

                        {/* Additional Fields Table */}
                        <div className="bg-white shadow-lg rounded-lg p-4 mt-4">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Additional Information</h3>
                            <div className="overflow-hidden">
                                <table className="w-full border-collapse border border-gray-300">
                                    <tbody>
                                        <tr className="border-b border-gray-200">
                                            <td className="py-2 px-3 font-medium text-gray-700 bg-gray-50 border-r border-gray-300 w-32">Total Sale</td>
                                            <td className="py-2 px-3">
                                                <input
                                                    type="text"
                                                    value={field1Value}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-gray-300 rounded bg-gray-100 text-sm text-gray-900"
                                                />
                                            </td>
                                        </tr>
                                        <tr className="border-b border-gray-200">
                                            <td className="py-2 px-3 font-medium text-gray-700 bg-gray-50 border-r border-gray-300 w-32">Opening Balance</td>
                                            <td className="py-2 px-3">
                                                <input
                                                    type="text"
                                                    value={field2}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-gray-300 rounded bg-gray-100 text-sm text-gray-900"
                                                />
                                            </td>
                                        </tr>
                                        <tr className="border-b border-gray-200">
                                            <td className="py-2 px-3 font-medium text-gray-700 bg-gray-50 border-r border-gray-300 w-32">Total</td>
                                            <td className="py-2 px-3">
                                                <input
                                                    type="text"
                                                    value={field3Value}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-gray-300 rounded bg-gray-100 text-sm text-gray-900"
                                                />
                                            </td>
                                        </tr>
                                        <tr className="border-b border-gray-200">
                                            <td className="py-2 px-3 font-medium text-gray-700 bg-gray-50 border-r border-gray-300 w-32">Jama</td>
                                            <td className="py-2 px-3">
                                                <input
                                                    type="text"
                                                    value={field4}
                                                    onChange={(e) => setField4(e.target.value)}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm text-gray-900"
                                                />
                                            </td>
                                        </tr>
                                        <tr className="border-b border-gray-200">
                                            <td className="py-2 px-3 font-medium text-gray-700 bg-gray-50 border-r border-gray-300 w-32">Total</td>
                                            <td className="py-2 px-3">
                                                <input
                                                    type="text"
                                                    value={field5Value}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-gray-300 rounded bg-gray-100 text-sm text-gray-900"
                                                />
                                            </td>
                                        </tr>
                                        <tr className="border-b border-gray-200">
                                            <td className="py-2 px-3 font-medium text-gray-700 bg-gray-50 border-r border-gray-300 w-32">Expenses</td>
                                            <td className="py-2 px-3">
                                                <input
                                                    type="text"
                                                    value={field6Value}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-gray-300 rounded bg-gray-100 text-sm text-gray-900"
                                                />
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="py-2 px-3 font-medium text-gray-700 bg-gray-50 border-r border-gray-300 w-32">Closing Balance</td>
                                            <td className="py-2 px-3">
                                                <input
                                                    type="text"
                                                    value={field7Value}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-gray-300 rounded bg-gray-100 text-sm text-gray-900"
                                                />
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Payment Sheet */}
                        <div className="bg-white shadow-lg rounded-lg p-4 mt-4">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Payment Information</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse border border-gray-300">
                                    <thead>
                                        <tr className="bg-purple-50">
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border border-gray-300">Date</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border border-gray-300">PhonePe</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border border-gray-300">Cash</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border border-gray-300">Amount</th>
                                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border border-gray-300">Comments</th>
                                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border border-gray-300">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paymentData.map((row, index) => (
                                            <tr key={index} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 border border-gray-300">
                                                    <input
                                                        type="date"
                                                        value={row.date}
                                                        onChange={(e) => {
                                                            const newData = [...paymentData];
                                                            newData[index].date = e.target.value;
                                                            setPaymentData(newData);
                                                        }}
                                                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm text-gray-900"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 border border-gray-300">
                                                    <input
                                                        type="number"
                                                        value={row.phonepe}
                                                        onChange={(e) => {
                                                            const newData = [...paymentData];
                                                            newData[index].phonepe = e.target.value;
                                                            setPaymentData(newData);
                                                        }}
                                                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm text-gray-900"
                                                        placeholder="PhonePe amount"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 border border-gray-300">
                                                    <input
                                                        type="number"
                                                        value={row.cash}
                                                        onChange={(e) => {
                                                            const newData = [...paymentData];
                                                            newData[index].cash = e.target.value;
                                                            setPaymentData(newData);
                                                        }}
                                                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm text-gray-900"
                                                        placeholder="Cash amount"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 border border-gray-300">
                                                    <input
                                                        type="number"
                                                        value={row.amount}
                                                        onChange={(e) => {
                                                            const newData = [...paymentData];
                                                            newData[index].amount = e.target.value;
                                                            setPaymentData(newData);
                                                        }}
                                                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm text-gray-900"
                                                        placeholder="Total amount"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 border border-gray-300">
                                                    <input
                                                        type="text"
                                                        value={row.comments}
                                                        onChange={(e) => {
                                                            const newData = [...paymentData];
                                                            newData[index].comments = e.target.value;
                                                            setPaymentData(newData);
                                                        }}
                                                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm text-gray-900"
                                                        placeholder="Comments"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 border border-gray-300 text-center">
                                                    {paymentData.length > 1 && (
                                                        <button
                                                            onClick={() => {
                                                                const newData = paymentData.filter((_, i) => i !== index);
                                                                setPaymentData(newData);
                                                            }}
                                                            className="text-red-600 hover:text-red-800 text-sm"
                                                        >
                                                            Remove
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="bg-gray-100 font-semibold">
                                            <td className="px-4 py-3 border border-gray-300 text-sm">TOTAL</td>
                                            <td className="px-4 py-3 border border-gray-300 text-sm">{phonepeTotal}</td>
                                            <td className="px-4 py-3 border border-gray-300 text-sm">{cashTotal}</td>
                                            <td className="px-4 py-3 border border-gray-300 text-sm">{amountTotal}</td>
                                            <td className="px-4 py-3 border border-gray-300 text-sm">-</td>
                                            <td className="px-4 py-3 border border-gray-300 text-sm">-</td>
                                        </tr>
                                    </tbody>
                                </table>
                                <button
                                    onClick={() => setPaymentData([...paymentData, { phonepe: '', cash: '', amount: '', comments: '', date: '' }])}
                                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                                >
                                    Add Row
                                </button>
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

            {/* ICDC IDs Modal */}
            {showIdocList && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-md w-full max-h-[70vh] overflow-hidden flex flex-col">
                        <div className="bg-orange-600 text-white p-4 flex justify-between items-center">
                            <h2 className="text-xl font-bold">ICDC IDs ({idocList.length})</h2>
                            <button
                                onClick={() => setShowIdocList(false)}
                                className="text-white hover:bg-orange-700 rounded-full p-2 transition"
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
                                        <div key={item.id} className="p-2 hover:bg-orange-50 rounded">
                                            <p className="font-mono text-sm text-orange-700">{item.idocNumber}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

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
                            <div className="mb-4 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Month</label>
                                    <input
                                        type="month"
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm text-gray-900"
                                    />
                                </div>
                                <div className="border-t pt-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Consolidate Date Range</label>
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <label className="block text-xs text-gray-600 mb-1">Start Date</label>
                                                <input
                                                    type="date"
                                                    value={startDate}
                                                    onChange={(e) => setStartDate(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm text-gray-900"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-xs text-gray-600 mb-1">End Date</label>
                                                <input
                                                    type="date"
                                                    value={endDate}
                                                    onChange={(e) => setEndDate(e.target.value)}
                                                    min={startDate}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm text-gray-900"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-center">
                                            <button
                                                onClick={consolidateSheets}
                                                disabled={!startDate || !endDate}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 text-sm transition-colors"
                                                title={!startDate || !endDate ? 'Please select both start and end dates' : 'Consolidate sheets in date range'}
                                            >
                                                Consolidate
                                            </button>
                                        </div>
                                        {startDate && endDate && startDate > endDate && (
                                            <p className="text-xs text-red-600 mt-1">End date must be after start date</p>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-600 mt-2">Consolidates all sheets with closing stock data that overlap with the selected date range</p>

                                    {/* Debug Information */}
                                    {startDate && endDate && (
                                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                                            <p className="text-xs font-medium text-gray-700 mb-2">Debug Info:</p>
                                            <p className="text-xs text-gray-600">Total records: {historyData.length}</p>
                                            <p className="text-xs text-gray-600">Records with closing stock: {historyData.filter(r => r.hasClosingStock).length}</p>
                                            <p className="text-xs text-gray-600">Selected range: {startDate} to {endDate}</p>
                                            <p className="text-xs text-gray-600">
                                                Matching records: {historyData.filter((r: any) => {
                                                    if (!r.hasClosingStock) return false;
                                                    const parseDate = (dateStr: string) => {
                                                        if (!dateStr) return null;
                                                        if (dateStr.includes('/')) {
                                                            const parts = dateStr.split('/');
                                                            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                                                        }
                                                        return dateStr;
                                                    };
                                                    const sheetStart = parseDate(r.sheetFromDate);
                                                    const sheetEnd = parseDate(r.sheetToDate);
                                                    if (!sheetStart || !sheetEnd) return false;
                                                    return sheetStart <= endDate && sheetEnd >= startDate;
                                                }).length}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {historyData.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">No history records found</p>
                            ) : historyData.filter(record => record.hasClosingStock).length === 0 ? (
                                <div className="text-center py-8">
                                    <p className="text-gray-500 mb-2">No closing stock history found</p>
                                    <p className="text-xs text-gray-400">Found {historyData.length} total records, but none have closing stock data</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {historyData
                                        .filter(record => record.hasClosingStock)
                                        .filter(record => {
                                            if (!selectedMonth) return true;
                                            const recordDate = new Date(record.savedAt);
                                            const recordMonth = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}`;
                                            return recordMonth === selectedMonth;
                                        })
                                        .map((record, index) => {
                                            // Check if this record matches the selected date range
                                            const isMatched = startDate && endDate && (() => {
                                                const parseDate = (dateStr: string) => {
                                                    if (!dateStr) return null;
                                                    if (dateStr.includes('/')) {
                                                        const parts = dateStr.split('/');
                                                        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                                                    }
                                                    return dateStr;
                                                };
                                                const sheetStart = parseDate(record.sheetFromDate);
                                                const sheetEnd = parseDate(record.sheetToDate);
                                                if (!sheetStart || !sheetEnd) return false;
                                                return sheetStart <= endDate && sheetEnd >= startDate;
                                            })();

                                            const isLatest = index === 0;
                                            const canEdit = isLatest && userRole === 'Shop Owner';

                                            return (
                                                <div key={record.id} className="relative">
                                                    <button
                                                        onClick={() => viewHistorySheet(record)}
                                                        className={`w-full text-left px-4 py-3 border rounded-lg transition ${isMatched
                                                            ? 'border-green-400 bg-green-50 hover:bg-green-100'
                                                            : 'border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                                                            }`}
                                                    >
                                                        <div className="flex justify-between items-start">
                                                            <div className="flex-1">
                                                                <p className="font-semibold text-blue-600 hover:text-blue-700">
                                                                    {/*{record.invoiceName || new Date(record.savedAt).toLocaleDateString('en-US', {*/}
                                                                    {/*    year: 'numeric',*/}
                                                                    {/*    month: 'long',*/}
                                                                    {/*    day: 'numeric',*/}
                                                                    {/*    hour: '2-digit',*/}
                                                                    {/*    minute: '2-digit'*/}
                                                                    {/*})}*/}
                                                                    Period: {record.sheetFromDate || 'N/A'} to {record.sheetToDate || 'N/A'}
                                                                </p>
                                                                {/*{(record.sheetFromDate || record.sheetToDate) && (*/}
                                                                {/*    <p className="text-xs text-gray-600 mt-1">*/}
                                                                {/*        Period: {record.sheetFromDate || 'N/A'} to {record.sheetToDate || 'N/A'}*/}
                                                                {/*    </p>*/}
                                                                {/*)}*/}
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    {record.hasClosingStock && (
                                                                        <span className="inline-block px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                                                                            Closing Stock Entered
                                                                        </span>
                                                                    )}
                                                                    {record.hasClosingStock && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                viewClosingStock(record);
                                                                            }}
                                                                            className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
                                                                        >
                                                                            Closing Stock
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {canEdit && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        startEditHistory(record);
                                                                        viewHistorySheet(record);
                                                                    }}
                                                                    className="ml-2 p-2 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors"
                                                                    title="Edit this entry"
                                                                >
                                                                    <Pencil size={18} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    {historyData
                                        .filter(record => record.hasClosingStock)
                                        .filter(record => {
                                            if (!selectedMonth) return true;
                                            const recordDate = new Date(record.savedAt);
                                            const recordMonth = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}`;
                                            return recordMonth === selectedMonth;
                                        }).length === 0 && selectedMonth && (
                                            <p className="text-center text-gray-500 py-8">No closing stock records found for selected month</p>
                                        )}
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
                        <div className={`${editingHistory ? 'bg-purple-600' : showClosingStockView ? 'bg-green-600' : 'bg-blue-600'} text-white p-4 flex justify-between items-center`}>
                            <div>
                                <h2 className="text-xl font-bold">
                                    {editingHistory && <span className="mr-2">✏️ Editing:</span>}
                                    {showClosingStockView && <span className="mr-2">📦 Closing Stock:</span>}
                                    {consolidatedData ?
                                        `Consolidated: ${consolidatedData.startDate} to ${consolidatedData.endDate}` :
                                        new Date(selectedHistory.savedAt).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                        })
                                    }
                                </h2>
                                <div className="flex items-center gap-3 mt-1">
                                    <p className="text-sm text-blue-100">
                                        {editingHistory ?
                                            'Edit closing stock, tran in, and tran out values' :
                                            consolidatedData ?
                                                `${consolidatedData.recordCount} sheets consolidated` :
                                                new Date(selectedHistory.savedAt).toLocaleTimeString()
                                        }
                                    </p>
                                    {editingHistory && (
                                        <div className="flex items-center gap-2">
                                            {autoSaveStatus === 'saving' && (
                                                <div className="flex items-center gap-1 text-xs text-yellow-200">
                                                    <div className="w-3 h-3 border-2 border-yellow-200 border-t-transparent rounded-full animate-spin"></div>
                                                    <span>Saving...</span>
                                                </div>
                                            )}
                                            {autoSaveStatus === 'saved' && (
                                                <div className="flex items-center gap-1 text-xs text-green-200">
                                                    <CheckCircle className="w-3 h-3" />
                                                    <span>Auto-saved</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2 items-center">
                                {editingHistory ? (
                                    <>
                                        <button
                                            onClick={saveHistoryEdits}
                                            disabled={isSaving}
                                            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition disabled:bg-gray-400 text-sm"
                                        >
                                            <Save className="w-4 h-4" />
                                            <span className="hidden sm:inline">{isSaving ? 'Saving...' : 'Save'}</span>
                                        </button>
                                        <button
                                            onClick={cancelHistoryEdit}
                                            disabled={isSaving}
                                            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition disabled:bg-gray-400 text-sm"
                                        >
                                            <span className="hidden sm:inline">Cancel</span>
                                            <span className="sm:hidden">✕</span>
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => downloadHistoryExcel(selectedHistory)}
                                            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition text-sm"
                                        >
                                            <FileSpreadsheet className="w-4 h-4" />
                                            <span className="hidden sm:inline">Excel</span>
                                        </button>
                                        <button
                                            onClick={() => downloadHistoryPDF(selectedHistory)}
                                            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition text-sm"
                                        >
                                            <FileText className="w-4 h-4" />
                                            <span className="hidden sm:inline">PDF</span>
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={closeHistorySheet}
                                    className="text-white hover:bg-blue-700 hover:bg-opacity-20 rounded-full p-2 transition min-w-[40px] min-h-[40px] flex items-center justify-center"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="bg-white shadow-lg rounded-lg overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className={`${showClosingStockView ? 'bg-green-50 border-b-2 border-green-200' : 'bg-purple-50 border-b-2 border-purple-200'}`}>
                                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Particulars</th>
                                                {showClosingStockView ? 
                                                    ['Size', 'Closing Stock', 'Rate'].map((h, i) => (
                                                        <th key={h} className={`px-4 py-3 text-sm font-semibold text-gray-700 ${i === 2 ? 'text-right' : 'text-center'}`}>{h}</th>
                                                    )) :
                                                    ['Size', 'Opening Stock', 'Receipts', 'Tran In', 'Tran Out', 'Closing Stock', 'Sales', 'Rate', 'Amount'].map((h, i) => (
                                                        <th key={h} className={`px-4 py-3 text-sm font-semibold text-gray-700 ${i === 8 ? 'text-right' : 'text-center'}`}>{h}</th>
                                                    ))
                                                }
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(editingHistory ? editedHistoryData : selectedHistory.items).map((item: FilteredItem, i: number) => (
                                                <tr key={i} className={`border-b border-gray-200 ${showClosingStockView ? 'hover:bg-green-50' : 'hover:bg-purple-50'}`}>
                                                    <td className="px-4 py-3 text-sm text-gray-800">{item.particulars}</td>
                                                    <td className="px-4 py-3 text-center text-sm"><span className={`px-2 py-1 text-xs rounded-full ${showClosingStockView ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>{item.size}</span></td>
                                                    {showClosingStockView ? (
                                                        // Closing Stock View - Only show closing stock and rate
                                                        <>
                                                            <td className="px-4 py-3 text-center text-sm font-semibold text-green-600">{item.closingStock}</td>
                                                            <td className="px-4 py-3 text-right text-sm text-gray-900">₹{item.rate}</td>
                                                        </>
                                                    ) : (
                                                        // Full View - Show all columns
                                                        <>
                                                            <td className="px-4 py-3 text-center text-sm text-gray-900">
                                                                {editingHistory ? (
                                                                    <input
                                                                        type="number"
                                                                        value={item.openingStock || 0}
                                                                        onChange={(e) => handleHistoryFieldChange(i, 'openingStock', e.target.value)}
                                                                        className="w-20 px-2 py-1 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
                                                                        min="0"
                                                                    />
                                                                ) : (
                                                                    item.openingStock
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-center text-sm font-semibold text-blue-600">
                                                                {editingHistory ? (
                                                                    <input
                                                                        type="number"
                                                                        value={item.receipts || 0}
                                                                        onChange={(e) => handleHistoryFieldChange(i, 'receipts', e.target.value)}
                                                                        className="w-20 px-2 py-1 border border-blue-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                                                                        min="0"
                                                                    />
                                                                ) : (
                                                                    item.receipts
                                                                )}
                                                            </td>

                                                            {/* Tran In - Editable in edit mode */}
                                                            <td className="px-4 py-3 text-center text-sm font-semibold text-orange-600">
                                                                {editingHistory ? (
                                                                    <input
                                                                        type="number"
                                                                        value={item.tranIn || 0}
                                                                        onChange={(e) => handleHistoryFieldChange(i, 'tranIn', e.target.value)}
                                                                        className="w-20 px-2 py-1 border border-orange-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900"
                                                                        min="0"
                                                                    />
                                                                ) : (
                                                                    item.tranIn
                                                                )}
                                                            </td>

                                                            {/* Tran Out - Editable in edit mode */}
                                                            <td className="px-4 py-3 text-center text-sm font-semibold text-purple-600">
                                                                {editingHistory ? (
                                                                    <input
                                                                        type="number"
                                                                        value={item.tranOut || 0}
                                                                        onChange={(e) => handleHistoryFieldChange(i, 'tranOut', e.target.value)}
                                                                        className="w-20 px-2 py-1 border border-purple-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
                                                                        min="0"
                                                                        max={(item.openingStock || 0) + (item.receipts || 0) + (item.tranIn || 0)}
                                                                    />
                                                                ) : (
                                                                    item.tranOut
                                                                )}
                                                            </td>

                                                            {/* Closing Stock - Editable in edit mode */}
                                                            <td className="px-4 py-3 text-center text-sm font-semibold text-green-600">
                                                                {editingHistory ? (
                                                                    <input
                                                                        type="number"
                                                                        value={item.closingStock || 0}
                                                                        onChange={(e) => handleHistoryFieldChange(i, 'closingStock', e.target.value)}
                                                                        className="w-20 px-2 py-1 border border-green-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900"
                                                                        min="0"
                                                                        max={(item.openingStock || 0) + (item.receipts || 0) + (item.tranIn || 0) - (item.tranOut || 0)}
                                                                    />
                                                                ) : (
                                                                    item.closingStock
                                                                )}
                                                            </td>

                                                            <td className="px-4 py-3 text-center text-sm font-semibold text-blue-600">{item.sales}</td>
                                                            <td className="px-4 py-3 text-center text-sm text-gray-900">₹{item.rate}</td>
                                                            <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">{item.amount}</td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Sheet Period Information in History */}
                            {(selectedHistory.sheetFromDate || selectedHistory.sheetToDate || editingHistory) && (
                                <div className="bg-white shadow-lg rounded-lg p-4 mt-4">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Sheet Period</h3>
                                    <div className="overflow-hidden">
                                        <table className="w-full border-collapse border border-gray-300">
                                            <tbody>
                                                <tr className="border-b border-gray-200">
                                                    <td className="py-2 px-3 font-medium text-gray-700 bg-gray-50 border-r border-gray-300 w-32">From Date</td>
                                                    <td className="py-2 px-3 text-sm text-gray-900">
                                                        {editingHistory ? (
                                                            <input
                                                                type="date"
                                                                value={editedDates.from}
                                                                onChange={(e) => handleEditedDateChange('from', e.target.value)}
                                                                className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
                                                            />
                                                        ) : (
                                                            selectedHistory.sheetFromDate || 'Not specified'
                                                        )}
                                                    </td>
                                                </tr>
                                                <tr className="border-b border-gray-200">
                                                    <td className="py-2 px-3 font-medium text-gray-700 bg-gray-50 border-r border-gray-300 w-32">To Date</td>
                                                    <td className="py-2 px-3 text-sm text-gray-900">
                                                        {editingHistory ? (
                                                            <input
                                                                type="date"
                                                                value={editedDates.to}
                                                                onChange={(e) => handleEditedDateChange('to', e.target.value)}
                                                                className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
                                                            />
                                                        ) : (
                                                            selectedHistory.sheetToDate || 'Not specified'
                                                        )}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Additional Information in History */}
                            {(selectedHistory.field1 || selectedHistory.field2 || selectedHistory.field3 || selectedHistory.field4 || selectedHistory.field5 || selectedHistory.field6 || consolidatedData || editingHistory) && (
                                <div className="bg-white shadow-lg rounded-lg p-4 mt-4">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Additional Information</h3>
                                    <div className="overflow-hidden">
                                        <table className="w-full border-collapse border border-gray-300">
                                            <tbody>
                                                {editingHistory ? (
                                                    // Edit Mode for Additional Info
                                                    [
                                                        ['Total Sale', 'field1'],
                                                        ['Opening Balance', 'field2'],
                                                        ['Total', 'field3'],
                                                        ['Jama', 'field4'],
                                                        ['Total', 'field5'],
                                                        ['Expenses', 'field6'],
                                                        ['Closing Balance', 'field7']
                                                    ].map(([label, field]) => (
                                                        <tr key={field} className="border-b border-gray-200">
                                                            <td className="py-2 px-3 font-medium text-gray-700 bg-gray-50 border-r border-gray-300 w-32">{label}</td>
                                                            <td className="py-2 px-3">
                                                                <input
                                                                    type="text"
                                                                    value={editedAdditionalInfo[field] || ''}
                                                                    onChange={(e) => handleEditedAdditionalInfoChange(field, e.target.value)}
                                                                    className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm text-gray-900"
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    // View Mode for Additional Info
                                                    ([['Total Sale', selectedHistory.field1], ['Opening Balance', selectedHistory.field2], ['Total', selectedHistory.field3], ['Jama', selectedHistory.field4], ['Total', selectedHistory.field5], ['Expenses', selectedHistory.field6], ['Closing Balance', selectedHistory.field7 || calcBalance(selectedHistory.field1, selectedHistory.field2, selectedHistory.field4, selectedHistory.field6)]] as [string, string | undefined][]).map(([label, value]) => (
                                                        <tr key={label} className="border-b border-gray-200">
                                                            <td className="py-2 px-3 font-medium text-gray-700 bg-gray-50 border-r border-gray-300 w-32">{label as string}</td>
                                                            <td className="py-2 px-3 text-sm text-gray-900">{value || '0'}</td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Payment Information in History - Always show */}
                            <div className="bg-white shadow-lg rounded-lg p-4 mt-4">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                                    Payment Information {consolidatedData && <span className="text-sm text-gray-600">(Consolidated from {consolidatedData.recordCount} sheets)</span>}
                                </h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse border border-gray-300">
                                        <thead>
                                            <tr className="bg-purple-50">
                                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border border-gray-300">Date</th>
                                                {consolidatedData && <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border border-gray-300">Sheet Date</th>}
                                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border border-gray-300">PhonePe</th>
                                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border border-gray-300">Cash</th>
                                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border border-gray-300">Amount</th>
                                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border border-gray-300">Comments</th>
                                                {editingHistory && <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border border-gray-300">Action</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {editingHistory ? (
                                                // Edit Mode for Payment Info
                                                editedPaymentData.map((p: any, i: number) => (
                                                    <tr key={i} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 border border-gray-300">
                                                            <input
                                                                type="date"
                                                                value={formatDateForInput(p.date || '')}
                                                                onChange={(e) => handleEditedPaymentChange(i, 'date', formatDateFromInput(e.target.value))}
                                                                className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm text-gray-900"
                                                            />
                                                        </td>
                                                        {consolidatedData && <td className="px-4 py-3 border border-gray-300 text-gray-500">-</td>}
                                                        <td className="px-4 py-3 border border-gray-300">
                                                            <input
                                                                type="number"
                                                                value={p.phonepe || ''}
                                                                onChange={(e) => handleEditedPaymentChange(i, 'phonepe', e.target.value)}
                                                                className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm text-gray-900"
                                                                placeholder="PhonePe"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 border border-gray-300">
                                                            <input
                                                                type="number"
                                                                value={p.cash || ''}
                                                                onChange={(e) => handleEditedPaymentChange(i, 'cash', e.target.value)}
                                                                className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm text-gray-900"
                                                                placeholder="Cash"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 border border-gray-300">
                                                            <input
                                                                type="number"
                                                                value={p.amount || ''}
                                                                onChange={(e) => handleEditedPaymentChange(i, 'amount', e.target.value)}
                                                                className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm text-gray-900"
                                                                placeholder="Amount"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 border border-gray-300">
                                                            <input
                                                                type="text"
                                                                value={p.comments || ''}
                                                                onChange={(e) => handleEditedPaymentChange(i, 'comments', e.target.value)}
                                                                className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm text-gray-900"
                                                                placeholder="Comments"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 border border-gray-300 text-center">
                                                            <button
                                                                onClick={() => {
                                                                    const newData = editedPaymentData.filter((_, idx) => idx !== i);
                                                                    setEditedPaymentData(newData);
                                                                }}
                                                                className="text-red-600 hover:text-red-800 text-sm"
                                                            >
                                                                Remove
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                // View Mode for Payment Info
                                                selectedHistory.paymentData && selectedHistory.paymentData.length > 0 ? (
                                                    selectedHistory.paymentData.map((p: any, i: number) => (
                                                        <tr key={i} className="hover:bg-gray-50">
                                                            <td className="px-4 py-3 text-sm border border-gray-300 text-gray-900">{p.date}</td>
                                                            {consolidatedData && <td className="px-4 py-3 text-sm border border-gray-300 text-gray-500">{p.recordDate}</td>}
                                                            <td className="px-4 py-3 text-sm border border-gray-300 text-gray-900">{p.phonepe}</td>
                                                            <td className="px-4 py-3 text-sm border border-gray-300 text-gray-900">{p.cash}</td>
                                                            <td className="px-4 py-3 text-sm border border-gray-300 text-gray-900">{p.amount}</td>
                                                            <td className="px-4 py-3 text-sm border border-gray-300 text-gray-900">{p.comments}</td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan={consolidatedData ? 6 : 5} className="px-4 py-8 text-center text-gray-500 border border-gray-300">
                                                            No payment information available
                                                        </td>
                                                    </tr>
                                                )
                                            )}

                                            {/* Add Row Button in Edit Mode */}
                                            {editingHistory && (
                                                <tr>
                                                    <td colSpan={7} className="px-4 py-2 border border-gray-300">
                                                        <button
                                                            onClick={() => setEditedPaymentData([...editedPaymentData, { phonepe: '', cash: '', amount: '', comments: '', date: '' }])}
                                                            className="text-sm text-purple-600 hover:text-purple-800 font-semibold flex items-center gap-1"
                                                        >
                                                            + Add Payment Row
                                                        </button>
                                                    </td>
                                                </tr>
                                            )}

                                            {/* Totals Row */}
                                            {(editingHistory ? editedPaymentData : selectedHistory.paymentData) && (editingHistory ? editedPaymentData : selectedHistory.paymentData).length > 0 && (
                                                <tr className="bg-gray-100 font-semibold">
                                                    <td className="px-4 py-3 text-sm border border-gray-300 text-gray-900">TOTAL</td>
                                                    {consolidatedData && <td className="px-4 py-3 text-sm border border-gray-300 text-gray-900">-</td>}
                                                    <td className="px-4 py-3 text-sm border border-gray-300 text-gray-900">
                                                        {(editingHistory ? editedPaymentData : selectedHistory.paymentData)?.reduce((sum: number, p: any) => sum + (parseFloat(p.phonepe) || 0), 0) || 0}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm border border-gray-300 text-gray-900">
                                                        {(editingHistory ? editedPaymentData : selectedHistory.paymentData)?.reduce((sum: number, p: any) => sum + (parseFloat(p.cash) || 0), 0) || 0}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm border border-gray-300 text-gray-900">
                                                        {(editingHistory ? editedPaymentData : selectedHistory.paymentData)?.reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0) || 0}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm border border-gray-300 text-gray-900">-</td>
                                                    {editingHistory && <td className="px-4 py-3 text-sm border border-gray-300 text-gray-900">-</td>}
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* PDF Confirmation Modal */}
            {showConfirmModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-md w-full">
                        <div className="bg-blue-600 text-white p-4 rounded-t-lg">
                            <h2 className="text-xl font-bold">Confirm PDF Data</h2>
                        </div>
                        <div className="p-6">
                            <p className="text-gray-700 mb-4">
                                PDF data processed successfully.
                            </p>
                            <div className="bg-blue-50 p-4 rounded-lg mb-4">
                                <p className="font-semibold text-blue-800 mb-2">
                                    Items Found: {matchedItemsCount}
                                </p>
                                <p className="font-semibold text-blue-800">
                                    Total Amount: ₹{pdfTotal.toFixed(2)}
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setFilterData(pendingData);
                                        setShowConfirmModal(false);
                                        setPendingData([]);
                                        setChildData([]);
                                        setPdfTotal(0);
                                        setMatchedItemsCount(0);
                                        handlePdfConfirm();
                                    }}
                                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition"
                                >
                                    Add
                                </button>
                                <button
                                    onClick={() => {
                                        handlePdfReset();
                                    }}
                                    className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

