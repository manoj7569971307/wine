'use client';

import { sampleWinesData } from "@/app/sample-data";
import PDFToExcelConverter from "@/app/invoice-pdf";
import { useState, useEffect } from "react";

// Function to remove commas and decimals
function removeCommasAndDecimals(value) {
    // Remove commas using regex and parse the string as a number
    let cleanedValue = value.replace(/,/g, '');

    // Remove decimals (if any) by splitting on the decimal point and taking the integer part
    cleanedValue = cleanedValue.split('.')[0];

    return cleanedValue;
}

function getFirstIndexValue(childDataRow: string[]): string {
    // Split the string at '/' and return the first part (index 0), trimming any extra spaces
    return childDataRow[5].split('/')[0].trim();
}

function getSecondIndexValue(childDataRow: string[]): string {
    // Split the string at '/' and return the first part (index 0), trimming any extra spaces
    return childDataRow[5].split('/')[1].trim();
}


export default function Home() {
    const [childData, setChildData] = useState([]);
    const [filterData, setFilterData] = useState([]);

    // Callback function that will be passed to the child to receive data
    const handleDataFromChild = (data) => {
        setChildData(data);  // Update the state with the received data
    };

    // Function to filter data based on condition
    const filterWineData = () => {
        let filtered = [];

        for (let i = 0; i < sampleWinesData.length; i++) {
            for (let j = 0; j < childData.length; j++) {
                // Compare the 'Brand Number' and 'Issue Price'
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
                        quantity: Number(getFirstIndexValue(childData[j]))* childData[j][6],
                        size: getSecondIndexValue(childData[j]),
                        someField2: childData[j][7],
                        totalPrice: sampleWinesData[i]['Product Name'],
                        extraField1: childData[j][9],
                        extraField2: childData[j][10],
                    });
                }
            }
        }

        setFilterData(filtered);  // Update filter data state
    };

    // Effect hook to filter data when childData changes
    useEffect(() => {
        if (childData.length > 0) {
            filterWineData();  // Call filter when childData is updated
        }
    }, [childData]);

    // Log the filtered data to the console (you can remove this in production)
    useEffect(() => {
        console.log('Filtered Data:', filterData, childData);
    }, [filterData]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
            <p>{sampleWinesData[0]?.['Brand Number']}</p>
            <PDFToExcelConverter sendDataToParent={handleDataFromChild} />

            {filterData.length > 0 && (
                <>
                    {filterData.map((item, index) => (
                        <div key={index} className="bg-white shadow-md rounded-lg p-6 mb-4 w-full max-w-md">
                            <h2 className="text-xl font-semibold mb-4">Brand Number: {item.brandNumber}</h2>

                            {/* Each piece of information will be displayed as a block element in the list */}
                            <div className="mb-2">
                                <p className="text-gray-600">Code: {item.code}</p>
                            </div>
                            <div className="mb-2">
                                <p className="text-gray-600">MRP: {item.Mrp}</p>
                            </div>
                            <div className="mb-2">
                                <p className="text-gray-600">Description: {item.description}</p>
                            </div>
                            <div className="mb-2">
                                <p className="text-gray-600">Unit: {item.unit}</p>
                            </div>
                            <div className="mb-2">
                                <p className="text-gray-600">Group: {item.group}</p>
                            </div>
                            <div className="mb-2">
                                <p className="text-gray-600">Quantity: {item.quantity}</p>
                            </div>
                            <div className="mb-2">
                                <p className="text-gray-600">Size: {item.size}</p>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>

    );
}
