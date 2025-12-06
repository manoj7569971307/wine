import React from 'react';

interface ShopSelectionProps {
    availableShops: string[];
    onSelectShop: (shop: string) => void;
    onViewAdmin: () => void;
}

export default function ShopSelection({
    availableShops,
    onSelectShop,
    onViewAdmin
}: ShopSelectionProps) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 flex items-center justify-center p-4">
            <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl max-w-md w-full p-8 animate-scaleUp border border-purple-200">
                <div className="text-center mb-6">
                    <div className="text-5xl mb-4">🏪</div>
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 mb-2">
                        Select Shop
                    </h2>
                    <p className="text-gray-600">Choose which shop's data you want to view</p>
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                    {availableShops.map((shop) => (
                        <button
                            key={shop}
                            onClick={() => onSelectShop(shop)}
                            className="w-full px-6 py-4 text-left border-2 border-purple-200 rounded-xl hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 hover:border-purple-400 transition-all hover:scale-105 hover:shadow-lg group"
                        >
                            <p className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 capitalize group-hover:from-blue-700 group-hover:to-purple-700">
                                {shop}
                            </p>
                        </button>
                    ))}
                </div>
                <button
                    onClick={onViewAdmin}
                    className="w-full mt-6 px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl hover:from-gray-700 hover:to-gray-800 transition-all font-semibold shadow-lg hover:shadow-xl hover:scale-105"
                >
                    View Admin Data
                </button>
            </div>
        </div>
    );
}
