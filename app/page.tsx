'use client';

import { sampleWinesData } from "@/app/sample-data";
import PDFToExcelConverter from "@/app/invoice-pdf";
import { useState, useEffect, useCallback } from "react";

interface WineData {
    'Brand Number': string | number;
    'Product Name': string;
    'Issue Price': number;
    'MRP': number;
}

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

type ChildDataRow = string[];
type ChildData = ChildDataRow[];

const removeCommasAndDecimals = (value: string): string => {
    const cleanedValue = value.replace(/,/g, '');
    return cleanedValue.split('.')[0];
};

const removeCommas = (value: string): number => {
    const cleanedValue = value.replace(/,/g, '');
    return parseFloat(cleanedValue);
};

export default function Home() {
    const [childData, setChildData] = useState<ChildData>([]);
    const [filterData, setFilterData] = useState<FilteredItem[]>([]);

    const handleDataFromChild = useCallback((data: ChildData): void => {
        setChildData(data);
    }, []);

    const filterWineData = useCallback((): void => {
        const filtered: FilteredItem[] = [...filterData];

        for (let j = 1; j < childData.length; j++) {
            try {
                if (!childData[j] || !childData[j][8] || !childData[j][6] || !childData[j][1]) {
                    continue;
                }

                const quantity = Number(childData[j][6]);
                const quantitySize = String(childData[j][5] || '');
                const [firstIndex, secondIndex] = quantitySize.includes('/')
                    ? quantitySize.split('/').map(s => s?.trim() || '')
                    : ['0', ''];

                if (quantity === 0 || isNaN(quantity)) {
                    continue;
                }

                let issuePrice: number;
                let rawPrice = removeCommasAndDecimals(String(childData[j][8]));

                if (Number(childData[j][7]) === 0) {
                    issuePrice = Number(rawPrice) / quantity;
                } else {
                    issuePrice = Math.ceil(
                        (Number(rawPrice) / ((quantity * Number(firstIndex)) + Number(childData[j][7]))) *
                        Number(firstIndex)
                    );
                    rawPrice = String(removeCommas(String(childData[j][8])));
                }

                if (isNaN(issuePrice)) {
                    continue;
                }

                const brandNumberFromChild = String(childData[j][1]).trim();

                for (let i = 0; i < sampleWinesData.length; i++) {
                    const wine = sampleWinesData[i] as WineData;
                    const brandNumberFromSample = String(wine['Brand Number']).trim();
                    const sampleIssuePrice = Number(wine['Issue Price']);

                    if (brandNumberFromChild === brandNumberFromSample) {
                        const priceDiff = Math.abs(issuePrice - sampleIssuePrice);

                        if (priceDiff < 1) {
                            const calculatedQuantity = firstIndex
                                ? (Number(firstIndex) * quantity) + Number(childData[j][7])
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
                                    category: childData[j][3] || '',
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
            } catch (error) {
                // Silent error handling - continue processing other rows
                continue;
            }
        }

        const sortedFiltered = filtered.sort((a, b) => {
            if (!a.particulars) return 1;
            if (!b.particulars) return -1;
            return a.particulars.localeCompare(b.particulars);
        });

        setFilterData(sortedFiltered);
    }, [childData, filterData]);

    useEffect(() => {
        if (childData.length > 0) {
            filterWineData();
        }
    }, [childData]);

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
                    <PDFToExcelConverter sendDataToParent={handleDataFromChild} />
                </div>

                {filterData.length > 0 && (
                    <div className="bg-white shadow-lg rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[800px]">
                                <thead>
                                <tr className="bg-purple-50 border-b-2 border-purple-200">
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs sm:text-sm font-semibold text-gray-700">
                                        Particulars
                                    </th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">
                                        Size
                                    </th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">
                                        Opening Stock
                                    </th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">
                                        Receipts
                                    </th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">
                                        Closing Stock
                                    </th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">
                                        Sales
                                    </th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-gray-700">
                                        Rate
                                    </th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-semibold text-gray-700">
                                        Amount
                                    </th>
                                </tr>
                                </thead>

                                <tbody>
                                {filterData.map((item, index) => (
                                    <tr
                                        key={index}
                                        className="border-b border-gray-200 hover:bg-purple-50 transition-colors"
                                    >
                                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-800">
                                            {item.particulars}
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                                                <span className="inline-block px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700 font-medium">
                                                    {item.size}
                                                </span>
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                                            <input
                                                type="number"
                                                value={item.openingStock}
                                                className="w-16 sm:w-20 px-2 py-1 text-center text-xs sm:text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                readOnly
                                            />
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-blue-600">
                                            {item.receipts}
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                                            <input
                                                type="number"
                                                value={item.closingStock}
                                                className="w-12 sm:w-16 px-2 py-1 text-center text-xs sm:text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                readOnly
                                            />
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                                                <span className="text-blue-600 font-semibold text-xs sm:text-sm">
                                                    {item.sales}
                                                </span>
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs sm:text-sm text-gray-800">
                                            ₹{item.rate}
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs sm:text-sm font-semibold text-green-600">
                                            {item.amount}
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="sm:hidden p-2 text-center text-xs text-gray-500 bg-gray-50">
                            ← Scroll horizontally to see all columns →
                        </div>
                    </div>
                )}

                {childData.length > 0 && filterData.length === 0 && (
                    <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-3 sm:p-4 rounded">
                        <p className="font-bold text-sm sm:text-base">No matches found</p>
                        <p className="text-xs sm:text-sm">
                            No wine data matched the uploaded invoice.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}

