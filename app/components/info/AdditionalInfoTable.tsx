import React from 'react';

interface AdditionalInfoTableProps {
    field1Value: string;
    field2: string;
    field3Value: string;
    field4: string;
    field5Value: string;
    field6Value: string;
    field7Value: string;
    onField4Change: (value: string) => void;
}

export default function AdditionalInfoTable({
    field1Value,
    field2,
    field3Value,
    field4,
    field5Value,
    field6Value,
    field7Value,
    onField4Change
}: AdditionalInfoTableProps) {
    return (
        <div className="bg-white shadow-2xl rounded-2xl p-4 sm:p-6 animate-fadeIn">
            <h3 className="text-lg sm:text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600 mb-4">
                Additional Information
            </h3>
            <div className="overflow-hidden rounded-xl border-2 border-purple-200">
                <table className="w-full border-collapse">
                    <tbody>
                        <tr className="border-b border-gray-200 hover:bg-gradient-to-r hover:from-purple-50 hover:to-blue-50 transition-all">
                            <td className="py-3 px-4 font-semibold text-gray-700 bg-gradient-to-r from-purple-50 to-blue-50 border-r border-gray-300 w-40">
                                Total Sale
                            </td>
                            <td className="py-3 px-4">
                                <input
                                    type="text"
                                    value={field1Value}
                                    readOnly
                                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-900 font-semibold"
                                />
                            </td>
                        </tr>
                        <tr className="border-b border-gray-200 hover:bg-gradient-to-r hover:from-purple-50 hover:to-blue-50 transition-all">
                            <td className="py-3 px-4 font-semibold text-gray-700 bg-gradient-to-r from-purple-50 to-blue-50 border-r border-gray-300">
                                Opening Balance
                            </td>
                            <td className="py-3 px-4">
                                <input
                                    type="text"
                                    value={field2}
                                    readOnly
                                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-900 font-semibold"
                                />
                            </td>
                        </tr>
                        <tr className="border-b border-gray-200 hover:bg-gradient-to-r hover:from-purple-50 hover:to-blue-50 transition-all">
                            <td className="py-3 px-4 font-semibold text-gray-700 bg-gradient-to-r from-purple-50 to-blue-50 border-r border-gray-300">
                                Total
                            </td>
                            <td className="py-3 px-4">
                                <input
                                    type="text"
                                    value={field3Value}
                                    readOnly
                                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-900 font-semibold"
                                />
                            </td>
                        </tr>
                        <tr className="border-b border-gray-200 hover:bg-gradient-to-r hover:from-purple-50 hover:to-blue-50 transition-all">
                            <td className="py-3 px-4 font-semibold text-gray-700 bg-gradient-to-r from-purple-50 to-blue-50 border-r border-gray-300">
                                Jama
                            </td>
                            <td className="py-3 px-4">
                                <input
                                    type="text"
                                    value={field4}
                                    onChange={(e) => onField4Change(e.target.value)}
                                    className="w-full px-3 py-2 border-2 border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm text-gray-900 font-semibold transition-all hover:border-purple-400"
                                />
                            </td>
                        </tr>
                        <tr className="border-b border-gray-200 hover:bg-gradient-to-r hover:from-purple-50 hover:to-blue-50 transition-all">
                            <td className="py-3 px-4 font-semibold text-gray-700 bg-gradient-to-r from-purple-50 to-blue-50 border-r border-gray-300">
                                Total
                            </td>
                            <td className="py-3 px-4">
                                <input
                                    type="text"
                                    value={field5Value}
                                    readOnly
                                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-900 font-semibold"
                                />
                            </td>
                        </tr>
                        <tr className="border-b border-gray-200 hover:bg-gradient-to-r hover:from-purple-50 hover:to-blue-50 transition-all">
                            <td className="py-3 px-4 font-semibold text-gray-700 bg-gradient-to-r from-purple-50 to-blue-50 border-r border-gray-300">
                                Expenses
                            </td>
                            <td className="py-3 px-4">
                                <input
                                    type="text"
                                    value={field6Value}
                                    readOnly
                                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-900 font-semibold"
                                />
                            </td>
                        </tr>
                        <tr className="hover:bg-gradient-to-r hover:from-purple-50 hover:to-blue-50 transition-all">
                            <td className="py-3 px-4 font-semibold text-gray-700 bg-gradient-to-r from-purple-50 to-blue-50 border-r border-gray-300">
                                Closing Balance
                            </td>
                            <td className="py-3 px-4">
                                <input
                                    type="text"
                                    value={field7Value}
                                    readOnly
                                    className="w-full px-3 py-2 border-2 border-green-300 rounded-lg bg-green-50 text-sm text-green-700 font-bold"
                                />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
