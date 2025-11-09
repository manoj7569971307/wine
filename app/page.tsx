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

function getFirstIndexValue(childDataRow: string[]): string {
    return childDataRow[5].split('/')[0].trim();
}

function getSecondIndexValue(childDataRow: string[]): string {
    return childDataRow[5].split('/')[1].trim();
}

export default function Home() {
    const [childData, setChildData] = useState([]);
    const [filterData, setFilterData] = useState([]);

    // Callback function to receive data from the child
    const handleDataFromChild = (data) => {
        setChildData(data);
    };

    // Function to filter wine data
    const filterWineData = () => {
        let filtered = [];

        for (let i = 0; i < sampleWinesData.length; i++) {
            for (let j = 0; j < childData.length; j++) {
                const issuePrice = Number(removeCommasAndDecimals(childData[j][8])) / Number(childData[j][6]);

                if (sampleWinesData[i]['Brand Number'] === childData[j][1] &&
                    sampleWinesData[i]['Issue Price'] === issuePrice) {
                    filtered.push({
                        brandNumber: sampleWinesData[i]['Brand Number'],
                        code: childData[j][1],
                        Mrp: sampleWinesData[i]['MRP'],
                        description: sampleWinesData[i]['Product Name'],
                        unit: childData[j][3],
                        group: childData[j][4],
                        quantity: Number(getFirstIndexValue(childData[j])) * childData[j][6],
                        size: getSecondIndexValue(childData[j]),
                        someField2: childData[j][7],
                        totalPrice: sampleWinesData[i]['Product Name'],
                        extraField1: childData[j][9],
                        extraField2: childData[j][10],
                    });
                }
            }
        }

        setFilterData(filtered);
    };

    // Effect hook to filter data when childData changes
    useEffect(() => {
        if (childData.length > 0) {
            filterWineData();
        }
    }, [childData]);

    // Log filtered data (for debugging)
    useEffect(() => {
        console.log('Filtered Data:', filterData, childData);
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
                                        <span className="text-gray-700 font-medium">Code:</span>
                                        <span>{item.code}</span>
                                    </div>
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
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            <footer className="bg-blue-600 p-4 mt-6 text-center text-white">
                <p>&copy; 2025 Wine Tracker. All Rights Reserved.</p>
            </footer>
        </div>
    );
}

