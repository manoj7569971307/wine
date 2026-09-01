'use client';

import { useState, useEffect } from 'react';
import { db } from './lib/firebase';
import { collection, addDoc, deleteDoc, doc, getDocs, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { Store, Trash2, Plus, X, FileText, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { loadPdfJs } from './lib/load-pdfjs';
import { parsePriceList, PriceListWine } from './lib/price-list-parser';

interface Shop {
  id: string;
  username: string;
  password: string;
}

interface PriceListInfo {
  totalEntries: number;
  priceListDate?: string;
  fileName?: string;
  uploadedBy?: string;
  uploadedAt?: { seconds: number };
}

interface ParsedPriceList {
  wines: PriceListWine[];
  priceListDate: string;
  fileName: string;
}

export default function AdminPanel({ onBack }: { onBack: () => void }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newShop, setNewShop] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);

  const [current, setCurrent] = useState<PriceListInfo | null>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [parsed, setParsed] = useState<ParsedPriceList | null>(null);
  const [priceListError, setPriceListError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    loadShops();
    loadCurrentPriceList();
  }, []);

  const loadCurrentPriceList = async () => {
    try {
      const q = query(collection(db, 'winesData'), orderBy('uploadedAt', 'desc'), limit(1));
      const snapshot = await getDocs(q);
      setCurrent(snapshot.empty ? null : (snapshot.docs[0].data() as PriceListInfo));
    } catch (error) {
      console.error('Error loading current price list:', error);
    }
  };

  const handlePriceListFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setParsing(true);
    setProgress(0);
    setParsed(null);
    setPriceListError('');
    setSavedMessage('');

    try {
      const pdfjsLib = await loadPdfJs();
      const buffer = await file.arrayBuffer();
      const result = await parsePriceList(buffer, pdfjsLib, (page, total) =>
        setProgress(Math.round((page / total) * 100)),
      );
      setParsed({ wines: result.wines, priceListDate: result.priceListDate, fileName: file.name });
    } catch (error: any) {
      setPriceListError(error?.message || 'Could not read this PDF.');
    } finally {
      setParsing(false);
    }
  };

  const handleSavePriceList = async () => {
    if (!parsed) return;
    setSaving(true);
    setPriceListError('');
    try {
      await addDoc(collection(db, 'winesData'), {
        wines: parsed.wines,
        totalEntries: parsed.wines.length,
        priceListDate: parsed.priceListDate,
        fileName: parsed.fileName,
        uploadedBy: 'Admin',
        uploadedAt: serverTimestamp(),
      });
      setSavedMessage(`Saved ${parsed.wines.length} items to Firebase.`);
      setParsed(null);
      await loadCurrentPriceList();
    } catch (error: any) {
      setPriceListError(error?.message || 'Could not save to Firebase.');
    } finally {
      setSaving(false);
    }
  };

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
            <button onClick={onBack} className="bg-white text-purple-600 px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-semibold hover:bg-purple-50 w-full sm:w-auto">
              Back
            </button>
          </div>

          <div className="p-3 sm:p-4 md:p-6">
            <button
              onClick={() => setShowAddModal(true)}
              className="mb-4 sm:mb-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-sm sm:text-base font-semibold hover:from-purple-700 hover:to-blue-700 flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              Add Shop
            </button>

            <div className="mb-6 border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-3 sm:px-4 py-3 flex items-center gap-2 border-b border-gray-200">
                <FileText className="w-5 h-5 text-purple-600 flex-shrink-0" />
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 text-sm sm:text-base">Price List</h2>
                  <p className="text-xs text-gray-500">
                    {current
                      ? `${current.totalEntries} items${current.priceListDate ? ` · dated ${current.priceListDate}` : ''}${current.uploadedAt ? ` · uploaded ${new Date(current.uploadedAt.seconds * 1000).toLocaleDateString()}` : ''}`
                      : 'No price list uploaded yet'}
                  </p>
                </div>
              </div>

              <div className="p-3 sm:p-4 space-y-3">
                {!parsing && !parsed && (
                  <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold cursor-pointer bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200">
                    <Upload className="w-4 h-4" />
                    Upload Price List PDF
                    <input type="file" accept="application/pdf" onChange={handlePriceListFile} className="hidden" />
                  </label>
                )}

                {parsing && (
                  <div>
                    <p className="text-sm text-gray-700 mb-2">Reading PDF… {progress}%</p>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-purple-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}

                {parsed && (
                  <div className="space-y-3">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 flex-shrink-0" />
                        {parsed.wines.length} items read from {parsed.fileName}
                      </p>
                      {parsed.priceListDate && (
                        <p className="text-xs text-green-700 mt-1">Price list date: {parsed.priceListDate}</p>
                      )}
                      {current && (
                        <p className="text-xs text-green-700 mt-1">
                          Replaces the current list of {current.totalEntries} items
                          {parsed.wines.length !== current.totalEntries &&
                            ` (${parsed.wines.length > current.totalEntries ? '+' : ''}${parsed.wines.length - current.totalEntries})`}
                        </p>
                      )}
                    </div>

                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                      {parsed.wines.slice(0, 5).map((w, i) => (
                        <div key={i} className="px-3 py-2 text-xs text-gray-700 flex justify-between gap-2">
                          <span className="truncate">{w.brandNumber} · {w.sizeCode}/{w.packType} · {w.productName}</span>
                          <span className="flex-shrink-0 font-medium">₹{w.issuePrice}</span>
                        </div>
                      ))}
                      <div className="px-3 py-2 text-xs text-gray-400">…and {parsed.wines.length - 5} more</div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleSavePriceList}
                        disabled={saving}
                        className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:from-purple-700 hover:to-blue-700 disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : 'Save to Firebase'}
                      </button>
                      <button
                        onClick={() => setParsed(null)}
                        disabled={saving}
                        className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {priceListError && (
                  <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{priceListError}</span>
                  </p>
                )}

                {savedMessage && (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    {savedMessage}
                  </p>
                )}
              </div>
            </div>

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
