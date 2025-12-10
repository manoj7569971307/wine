'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface ShopManagementProps {
    shops: string[];
    onAddShop: (shopName: string) => void;
    onDeleteShop: (shopName: string) => void;
    onClose: () => void;
}

export default function ShopManagement({ shops, onAddShop, onDeleteShop, onClose }: ShopManagementProps) {
    const [newShopName, setNewShopName] = useState('');

    const handleAdd = () => {
        if (newShopName.trim()) {
            onAddShop(newShopName.trim());
            setNewShopName('');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl max-w-md w-full">
                <div className="bg-purple-600 text-white p-4 rounded-t-lg flex justify-between items-center">
                    <h2 className="text-xl font-bold">Manage Shops</h2>
                    <button onClick={onClose} className="text-white hover:bg-purple-700 rounded-full p-2">✕</button>
                </div>
                <div className="p-6">
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Add New Shop</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newShopName}
                                onChange={(e) => setNewShopName(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                                placeholder="Enter shop name"
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-900"
                            />
                            <button
                                onClick={handleAdd}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Add
                            </button>
                        </div>
                    </div>
                    <div className="border-t pt-4">
                        <h3 className="text-sm font-medium text-gray-700 mb-3">Existing Shops ({shops.length})</h3>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {shops.map((shop) => (
                                <div key={shop} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                                    <span className="font-medium text-gray-800 capitalize">{shop}</span>
                                    <button
                                        onClick={() => onDeleteShop(shop)}
                                        className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
