'use client';

import { useState, useEffect } from 'react';
import { db } from './lib/firebase';
import { collection, addDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { Store, Trash2, Plus, X, Wine } from 'lucide-react';


interface Shop {
  id: string;
  username: string;
  password: string;
}

export default function AdminPanel({ onBack }: { onBack: () => void }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newShop, setNewShop] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadShops();
  }, []);

  const loadShops = async () => {
    const querySnapshot = await getDocs(collection(db, 'shops'));
    const shopsData = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Shop));
    setShops(shopsData);
  };

  const handleAddShop = async () => {
    if (!newShop.username || !newShop.password) return;
    setLoading(true);
    await addDoc(collection(db, 'shops'), {
      username: newShop.username,
      password: newShop.password
    });
    setNewShop({ username: '', password: '' });
    setShowAddModal(false);
    await loadShops();
    setLoading(false);
  };

  const handleDeleteShop = async (id: string) => {
    if (!confirm('Delete this shop?')) return;
    setLoading(true);
    await deleteDoc(doc(db, 'shops', id));
    await loadShops();
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100 p-2 sm:p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-3 sm:p-4 md:p-6 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Shop Management</h1>
              <p className="text-purple-100 mt-1 text-sm sm:text-base">Manage shop accounts</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <a
                href="/admin-wine-data"
                className="bg-white text-purple-600 px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-semibold hover:bg-purple-50 flex items-center gap-2 justify-center flex-1 sm:flex-initial"
              >
                <Wine className="w-4 h-4" />
                Wine Data
              </a>
              <button onClick={onBack} className="bg-white text-purple-600 px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-semibold hover:bg-purple-50 flex-1 sm:flex-initial">
                Back
              </button>
            </div>
          </div>

          <div className="p-3 sm:p-4 md:p-6">
            <button
              onClick={() => setShowAddModal(true)}
              className="mb-4 sm:mb-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-sm sm:text-base font-semibold hover:from-purple-700 hover:to-blue-700 flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              Add Shop
            </button>

            <div className="grid gap-3 sm:gap-4">
              {shops.map((shop) => (
                <div key={shop.id} className="bg-gray-50 p-3 sm:p-4 rounded-lg flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <Store className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 text-sm sm:text-base truncate">{shop.username}</p>
                      <p className="text-xs sm:text-sm text-gray-500 truncate">Password: {shop.password}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteShop(shop.id)}
                    disabled={loading}
                    className="text-red-600 hover:text-red-800 p-2 flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-4 sm:p-6 text-white flex justify-between items-center">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold">Add New Shop</h2>
              <button onClick={() => setShowAddModal(false)} className="text-white hover:text-gray-200">
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                <input
                  type="text"
                  value={newShop.username}
                  onChange={(e) => setNewShop({ ...newShop, username: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900"
                  placeholder="Enter shop username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <input
                  type="text"
                  value={newShop.password}
                  onChange={(e) => setNewShop({ ...newShop, password: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900"
                  placeholder="Enter shop password"
                />
              </div>
              <button
                onClick={handleAddShop}
                disabled={loading || !newShop.username || !newShop.password}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-2 sm:py-3 text-sm sm:text-base rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 disabled:opacity-50"
              >
                Add Shop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
