'use client';

import { sampleWinesData } from "@/app/sample-data";
import PDFToExcelConverter from "@/app/invoice-pdf";
import { useState, useEffect } from "react";

// Function to remove commas and decimals
function removeCommasAndDecimals(value) {
    let cleanedValue = value.replace(/,/g, '');
    cleanedValue = cleanedValue.split('.')[0];
    return cleanedValue;
}
function removeCommas(value) {
    let cleanedValue = value.replace(/,/g, '');
    return parseFloat(cleanedValue);
}
//
//
// function getFirstIndexValue(childDataRow: string[]): string {
//     if (!childDataRow[5] || !childDataRow[5].includes('/')) return '0';
//     return childDataRow[5].split('/')[0].trim();
// }
//
// function getSecondIndexValue(childDataRow: string[]): string {
//     if (!childDataRow[5] || !childDataRow[5].includes('/')) return '';
//     return childDataRow[5].split('/')[1].trim();
// }

export default function Home() {
    const [childData, setChildData] = useState([]);
    const [filterData, setFilterData] = useState([]);

    // Callback function to receive data from the child
    const handleDataFromChild = (data) => {
        setChildData(data);
    };

    // Function to filter wine data - FIXED VERSION (No Duplicates)
    const filterWineData = () => {
        let filtered = [...filterData]; // Start with existing filtered data
        let unmatched = [];

        // Debug logging
        console.log('Starting filter with:', {
            sampleWinesCount: sampleWinesData.length,
            childDataCount: childData.length - 1 // Excluding header
        });

        // Process each row from childData (invoice data)
        for (let j = 1; j < childData.length; j++) {
            try {
                // Add safety checks for childData
                if (!childData[j] || !childData[j][8] || !childData[j][6] || !childData[j][1]) {
                    console.warn(`Missing critical data at row ${j}:`, childData[j]);
                    continue;
                }

                // Calculate issue price with proper error handling
                const quantity = Number(childData[j][6]);
                const quantitySize = String(childData[j][5] || '');
                const [firstIndex, secondIndex] = quantitySize.includes('/')
                    ? quantitySize.split('/').map(s => s?.trim() || '')
                    : ['0', ''];

                if (quantity === 0 || isNaN(quantity)) {
                    console.warn(`Invalid quantity at row ${j}:`, childData[j][6]);
                    continue;
                }
                let issuePrice;
                let rawPrice = removeCommasAndDecimals(String(childData[j][8]));
                if(Number(childData[j][7]) === 0){
                    issuePrice = Number(rawPrice) / quantity;
                }else {
                    issuePrice = Math.ceil((Number(rawPrice)/((quantity * Number(firstIndex)) + Number(childData[j][7]))) * Number(firstIndex));
                    rawPrice = removeCommas(String(childData[j][8]));
                }

                if (isNaN(issuePrice)) {
                    console.warn(`Invalid issue price calculation at row ${j}`);
                    continue;
                }

                // Convert brand number to string for comparison
                const brandNumberFromChild = String(childData[j][1]).trim();

                console.log(`Row ${j}: Brand="${brandNumberFromChild}", IssuePrice=${issuePrice.toFixed(2)}, Qty=${quantity}`);

                // Find the matching wine in sampleWinesData
                let matchFound = false;
                let potentialMatches = [];

                for (let i = 0; i < sampleWinesData.length; i++) {
                    const brandNumberFromSample = String(sampleWinesData[i]['Brand Number']).trim();
                    const sampleIssuePrice = Number(sampleWinesData[i]['Issue Price']);

                    // Check brand number match first
                    if (brandNumberFromChild === brandNumberFromSample) {
                        const priceDiff = Math.abs(issuePrice - sampleIssuePrice);
                        potentialMatches.push({
                            index: i,
                            mrp: sampleWinesData[i]['MRP'],
                            issuePrice: sampleIssuePrice,
                            priceDiff: priceDiff
                        });

                        // Match on brand number AND issue price (with tolerance)
                        if (priceDiff < 1) {
                            console.log(`✓ Match found for row ${j}: Brand=${brandNumberFromChild}, MRP=${sampleWinesData[i]['MRP']}, IssuePrice=${sampleIssuePrice}`);

                            const calculatedQuantity = firstIndex ? (Number(firstIndex) * quantity) + Number(childData[j][7]) : quantity;

                            // Check if this item already exists in filtered data
                            const existingItemIndex = filtered.findIndex(
                                item => item.brandNumber === sampleWinesData[i]['Brand Number'] &&
                                    Math.abs(Number(item.issuePrice) - issuePrice) < 1
                            );

                            if (existingItemIndex !== -1) {
                                // Item exists, just add to quantity
                                filtered[existingItemIndex].quantity += calculatedQuantity;
                                console.log(`✓ Updated quantity for Brand ${brandNumberFromChild}: +${calculatedQuantity} = ${filtered[existingItemIndex].quantity}`);
                            } else {
                                // New item, add to filtered array
                                filtered.push({
                                    brandNumber: sampleWinesData[i]['Brand Number'],
                                    Mrp: sampleWinesData[i]['MRP'],
                                    description: sampleWinesData[i]['Product Name'],
                                    unit: childData[j][3] || '',
                                    group: childData[j][4] || '',
                                    quantity: calculatedQuantity,
                                    size: secondIndex || '',
                                    someField2: childData[j][7] || '',
                                    totalPrice: childData[j][8] || '',
                                    issuePrice: issuePrice.toFixed(2),
                                    extraField1: childData[j][9] || '',
                                    extraField2: childData[j][10] || '',
                                    invoiceRow: j,// Track which invoice row this came from
                                });
                            }

                            matchFound = true;
                            break; // Stop after first match to avoid duplicates
                        }
                    }
                }
            } catch (error) {
                console.error(`Error processing row ${j}:`, error, childData[j]);
            }
        }

        console.log(`✓ Matched: ${filtered.length} items`);
        console.log(`✗ Unmatched: ${unmatched.length} items`);
        if (unmatched.length > 0) {
            console.table(unmatched);
        }

        // Assuming filtered is an array of objects with a 'description' property
        const sortedFiltered = filtered.sort((a, b) => {
            if (!a.description) return 1; // handle missing descriptions
            if (!b.description) return -1;
            return a.description.localeCompare(b.description);
        });
        setFilterData(sortedFiltered);
    };

    // Effect hook to filter data when childData changes
    useEffect(() => {
        if (childData.length > 0) {
            filterWineData();
        }
    }, [childData]);

    // Log filtered data (for debugging)
    useEffect(() => {
        console.log('Filtered Data:', filterData);
        if (childData.length > 0) {
            console.log('Sample brand numbers:', sampleWinesData.slice(0, 5).map(w => w['Brand Number']));
            console.log('Child brand numbers:', childData.slice(1, 6).map(row => row[1]));
        }
    }, [filterData]);

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-black text-gray-800 dark:text-white font-sans">
            <header className="bg-blue-600 p-4 shadow-md">
                <div className="container mx-auto flex justify-between items-center">
                    <h1 className="text-white text-3xl font-bold">Wine Invoice Tracker</h1>
                    <p className="text-white">Your product details and pricing at a glance</p>
                </div>
            </header>

            <main className="container mx-auto p-6">
                <div className="bg-white shadow-lg rounded-lg p-6 mb-6">
                    <h2 className="text-xl font-semibold text-blue-600 mb-4">Sample Data</h2>
                    <p className="text-gray-600">Brand Number: {sampleWinesData[0]?.['Brand Number']}</p>
                    <PDFToExcelConverter sendDataToParent={handleDataFromChild} />
                </div>

                {filterData.length > 0 && (
                    <div className="space-y-6">
                        {filterData.map((item, index) => (
                            <div key={index} className="bg-white shadow-md rounded-lg p-6">
                                <h3 className="text-xl font-semibold text-blue-700 mb-4">Brand Number: {item.brandNumber}</h3>
                                <div className="space-y-3 text-black">
                                    <div className="flex justify-between">
                                        <span className="text-gray-700 font-medium">MRP:</span>
                                        <span>{item.Mrp}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-700 font-medium">Description:</span>
                                        <span>{item.description}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-700 font-medium">Unit:</span>
                                        <span>{item.unit}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-700 font-medium">Group:</span>
                                        <span>{item.group}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-700 font-medium">Quantity:</span>
                                        <span>{item.quantity}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-700 font-medium">Size:</span>
                                        <span>{item.size}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-700 font-medium">Total Price:</span>
                                        <span>{item.totalPrice}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-700 font-medium">Issue Price:</span>
                                        <span>{item.issuePrice}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {childData.length > 0 && filterData.length === 0 && (
                    <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded">
                        <p className="font-bold">No matches found</p>
                        <p>Check the console for debugging information about brand numbers and prices.</p>
                    </div>
                )}
            </main>

            <footer className="bg-blue-600 p-4 mt-6 text-center text-white">
                <p>&copy; 2025 Wine Tracker. All Rights Reserved.</p>
            </footer>
        </div>
    );
}

