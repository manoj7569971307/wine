'use client';

import { useState, useEffect } from 'react';
import { Wine, WineDocument, getAllWinesNoPagination, searchWines, addWine, updateWine, deleteWine, migrateWineData, isWineDatabaseEmpty, clearWineCache } from '../lib/wineDatabase';
import { Search, Plus, Edit2, Trash2, Download, Upload, RefreshCw, ArrowLeft, Save, X, AlertCircle, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { sampleWinesData } from '../sample-data';
import { useRouter } from 'next/navigation';

export default function AdminWineDataPage() {
    const router = useRouter();
    const [wines, setWines] = useState<WineDocument[]>([]);
    const [filteredWines, setFilteredWines] = useState<WineDocument[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingWine, setEditingWine] = useState<WineDocument | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(50);
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
    const [isMigrating, setIsMigrating] = useState(false);
    const [isDatabaseEmpty, setIsDatabaseEmpty] = useState(false);

    // Form state for add/edit
    const [formData, setFormData] = useState<Wine>({
        'S.no': 0,
        'Brand Number': '',
        'Size Code': '',
        'Pack Type': '',
        'Product Name': '',
        'Issue Price': 0,
        'Special Margin': 0,
        'MRP': 0,
        'Type': 'Local'
    });

    useEffect(() => {
        loadWines();
    }, []);

    useEffect(() => {
        if (searchQuery.trim() === '') {
            setFilteredWines(wines);
        } else {
            handleSearch();
        }
    }, [searchQuery, wines]);

    const loadWines = async () => {
        setLoading(true);
        try {
            // Always load sample data as the base
            const sampleWines: WineDocument[] = sampleWinesData.map((wine) => ({
                id: `sample-${wine['S.no']}`,
                'S.no': Number(wine['S.no']) || 0,
                'Brand Number': wine['Brand Number'],
                'Size Code': wine['Size Code'],
                'Pack Type': wine['Pack Type'],
                'Product Name': wine['Product Name'],
                'Issue Price': Number(wine['Issue Price']) || 0,
                'Special Margin': Number(wine['Special Margin']) || 0,
                'MRP': Number(wine['MRP']) || 0,
                'Type': wine['Type']
            }));

            // Load any database wines (these are edits/additions)
            const databaseWines = await getAllWinesNoPagination();

            // Merge: database wines override sample wines with same S.no
            const wineMap = new Map<number, WineDocument>();

            // First, add all sample wines
            sampleWines.forEach(wine => {
                const sno = Number(wine['S.no']) || 0;
                if (sno > 0) {  // Only add if S.no is valid
                    wineMap.set(sno, wine);
                }
            });

            // Then, override with database wines (edited or new)
            databaseWines.forEach(wine => {
                const sno = Number(wine['S.no']) || 0;
                if (sno > 0) {  // Only add if S.no is valid
                    wineMap.set(sno, wine);
                }
            });

            // Convert map to array and sort by S.no
            const mergedWines = Array.from(wineMap.values()).sort((a, b) =>
                Number(a['S.no']) - Number(b['S.no'])
            );

            setWines(mergedWines);
            setFilteredWines(mergedWines);
            setIsDatabaseEmpty(databaseWines.length === 0);
            setStatusMessage({
                type: 'success',
                message: `Loaded ${mergedWines.length} wines (${sampleWinesData.length} sample + ${databaseWines.length} from database)`
            });
        } catch (error) {
            console.error('Error loading wines:', error);
            setStatusMessage({ type: 'error', message: 'Failed to load wine data' });
        } finally {
            setLoading(false);
            setTimeout(() => setStatusMessage(null), 3000);
        }
    };

    const handleSearch = async () => {
        if (searchQuery.trim() === '') {
            setFilteredWines(wines);
            return;
        }

        const searchLower = searchQuery.toLowerCase();
        const results = wines.filter(wine =>
            wine['Product Name'].toLowerCase().includes(searchLower) ||
            String(wine['Brand Number']).toLowerCase().includes(searchLower) ||
            wine['Type'].toLowerCase().includes(searchLower) ||
            wine['Size Code'].toLowerCase().includes(searchLower)
        );

        setFilteredWines(results);
        setCurrentPage(1);
    };

    const handleAddWine = async () => {
        try {
            // Find the highest S.no
            const maxSno = wines.reduce((max, wine) => {
                const sno = Number(wine['S.no']) || 0;
                return Math.max(max, sno);
            }, 0);
            const newWineData = { ...formData, 'S.no': maxSno + 1 };

            await addWine(newWineData);
            clearWineCache();
            setShowAddModal(false);
            resetForm();
            await loadWines();
            setStatusMessage({ type: 'success', message: 'Wine added successfully' });
            setTimeout(() => setStatusMessage(null), 3000);
        } catch (error) {
            console.error('Error adding wine:', error);
            setStatusMessage({ type: 'error', message: 'Failed to add wine' });
            setTimeout(() => setStatusMessage(null), 3000);
        }
    };

    const handleEditWine = async () => {
        if (!editingWine) return;

        try {
            const { id, ...wineData } = formData as any;
            await updateWine(editingWine.id, wineData);
            clearWineCache();
            setShowEditModal(false);
            setEditingWine(null);
            resetForm();
            await loadWines();
            setStatusMessage({ type: 'success', message: 'Wine updated successfully' });
            setTimeout(() => setStatusMessage(null), 3000);
        } catch (error) {
            console.error('Error updating wine:', error);
            setStatusMessage({ type: 'error', message: 'Failed to update wine' });
            setTimeout(() => setStatusMessage(null), 3000);
        }
    };

    const handleDeleteWine = async (id: string, productName: string) => {
        if (!confirm(`Are you sure you want to delete "${productName}"?`)) return;

        try {
            await deleteWine(id);
            clearWineCache();
            await loadWines();
            setStatusMessage({ type: 'success', message: 'Wine deleted successfully' });
            setTimeout(() => setStatusMessage(null), 3000);
        } catch (error) {
            console.error('Error deleting wine:', error);
            setStatusMessage({ type: 'error', message: 'Failed to delete wine' });
            setTimeout(() => setStatusMessage(null), 3000);
        }
    };

    const handleMigrateSampleData = async () => {
        if (!confirm(`This will migrate ${sampleWinesData.length} wines from sample data to the database. Continue?`)) return;

        setIsMigrating(true);
        try {
            const result = await migrateWineData(sampleWinesData);
            clearWineCache();
            await loadWines();
            setStatusMessage({
                type: 'success',
                message: `Migration complete! ${result.success} wines imported${result.failed > 0 ? `, ${result.failed} failed` : ''}`
            });
            setTimeout(() => setStatusMessage(null), 5000);
        } catch (error) {
            console.error('Error migrating data:', error);
            setStatusMessage({ type: 'error', message: 'Migration failed' });
            setTimeout(() => setStatusMessage(null), 3000);
        } finally {
            setIsMigrating(false);
        }
    };

    const handleExportToExcel = () => {
        const exportData = filteredWines.map(({ id, ...wine }) => wine);
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Wine Data');
        XLSX.writeFile(wb, `wine-data-${new Date().toISOString().split('T')[0]}.xlsx`);
        setStatusMessage({ type: 'success', message: 'Exported to Excel successfully' });
        setTimeout(() => setStatusMessage(null), 3000);
    };

    const openEditModal = (wine: WineDocument) => {
        setEditingWine(wine);
        setFormData(wine);
        setShowEditModal(true);
    };

    const resetForm = () => {
        setFormData({
            'S.no': 0,
            'Brand Number': '',
            'Size Code': '',
            'Pack Type': '',
            'Product Name': '',
            'Issue Price': 0,
            'Special Margin': 0,
            'MRP': 0,
            'Type': 'Local'
        });
    };

    // Pagination
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentWines = filteredWines.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredWines.length / itemsPerPage);

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100 p-2 sm:p-4 md:p-6">
            <div className="max-w-[1800px] mx-auto">
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-4 sm:p-6 text-white">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div className="flex-1">
                                <h1 className="text-2xl sm:text-3xl font-bold">Wine Data Management</h1>
                                <p className="text-purple-100 mt-1 text-sm sm:text-base">
                                    Manage wine inventory database ({filteredWines.length} wines)
                                </p>
                            </div>
                            <button
                                onClick={() => router.back()}
                                className="bg-white text-purple-600 px-4 py-2 rounded-lg font-semibold hover:bg-purple-50 flex items-center gap-2"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back
                            </button>
                        </div>
                    </div>

                    {/* Status Message */}
                    {statusMessage && (
                        <div className={`p-4 ${statusMessage.type === 'success' ? 'bg-green-50 text-green-800' : statusMessage.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-800'} border-l-4 ${statusMessage.type === 'success' ? 'border-green-500' : statusMessage.type === 'error' ? 'border-red-500' : 'border-blue-500'} flex items-center gap-2`}>
                            {statusMessage.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                            <span>{statusMessage.message}</span>
                        </div>
                    )}

                    {/* Controls */}
                    <div className="p-4 sm:p-6 bg-gray-50 border-b">
                        <div className="flex flex-col lg:flex-row gap-3">
                            {/* Search Bar */}
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    type="text"
                                    placeholder="Search by name, brand number, type, or size..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900"
                                />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => { resetForm(); setShowAddModal(true); }}
                                    className="bg-gradient-to-r from-green-600 to-green-700 text-white px-4 py-3 rounded-lg font-semibold hover:from-green-700 hover:to-green-800 flex items-center gap-2"
                                >
                                    <Plus className="w-5 h-5" />
                                    Add Wine
                                </button>
                                <button
                                    onClick={handleExportToExcel}
                                    disabled={filteredWines.length === 0}
                                    className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 flex items-center gap-2 disabled:opacity-50"
                                >
                                    <Download className="w-5 h-5" />
                                    Export
                                </button>
                                <button
                                    onClick={loadWines}
                                    disabled={loading}
                                    className="bg-gray-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-gray-700 flex items-center gap-2"
                                >
                                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                                    Refresh
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        {loading ? (
                            <div className="flex justify-center items-center p-12">
                                <RefreshCw className="w-8 h-8 animate-spin text-purple-600" />
                            </div>
                        ) : currentWines.length === 0 ? (
                            <div className="text-center p-12 text-gray-500">
                                <p className="text-lg">No wines found</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-gray-100 border-b-2 border-gray-200">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">S.No</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Brand Number</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Product Name</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Size Code</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Pack Type</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Issue Price</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Special Margin</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">MRP</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Type</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {currentWines.map((wine) => (
                                        <tr key={wine.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm text-gray-900">{wine['S.no'] || ''}</td>
                                            <td className="px-4 py-3 text-sm text-gray-900">{wine['Brand Number']}</td>
                                            <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">{wine['Product Name']}</td>
                                            <td className="px-4 py-3 text-sm text-gray-900">{wine['Size Code']}</td>
                                            <td className="px-4 py-3 text-sm text-gray-900">{wine['Pack Type']}</td>
                                            <td className="px-4 py-3 text-sm text-gray-900">₹{wine['Issue Price']}</td>
                                            <td className="px-4 py-3 text-sm text-gray-900">{wine['Special Margin']}</td>
                                            <td className="px-4 py-3 text-sm text-gray-900">₹{wine['MRP']}</td>
                                            <td className="px-4 py-3 text-sm">
                                                <span className={`px-2 py-1 text-xs rounded-full ${wine['Type'] === 'Local' ? 'bg-green-100 text-green-800' :
                                                    wine['Type'] === 'Duty Free' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-purple-100 text-purple-800'
                                                    }`}>
                                                    {wine['Type']}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => openEditModal(wine)}
                                                        className="text-blue-600 hover:text-blue-800"
                                                        title="Edit"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteWine(wine.id, wine['Product Name'])}
                                                        className="text-red-600 hover:text-red-800"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="p-4 bg-gray-50 border-t flex justify-between items-center">
                            <div className="text-sm text-gray-700">
                                Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredWines.length)} of {filteredWines.length} wines
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-gray-700"
                                >
                                    Previous
                                </button>
                                <span className="px-4 py-2 bg-purple-600 text-white rounded-lg">
                                    {currentPage} / {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-gray-700"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Add/Edit Modal */}
            {(showAddModal || showEditModal) && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8">
                        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white flex justify-between items-center rounded-t-xl">
                            <h2 className="text-2xl font-bold">{showAddModal ? 'Add New Wine' : 'Edit Wine'}</h2>
                            <button onClick={() => { setShowAddModal(false); setShowEditModal(false); resetForm(); }} className="text-white hover:text-gray-200">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 max-h-[70vh] overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Brand Number *</label>
                                    <input
                                        type="text"
                                        value={formData['Brand Number']}
                                        onChange={(e) => setFormData({ ...formData, 'Brand Number': e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Size Code *</label>
                                    <input
                                        type="text"
                                        value={formData['Size Code']}
                                        onChange={(e) => setFormData({ ...formData, 'Size Code': e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Pack Type *</label>
                                    <select
                                        value={formData['Pack Type']}
                                        onChange={(e) => setFormData({ ...formData, 'Pack Type': e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900"
                                    >
                                        <option value="G">G</option>
                                        <option value="P">P</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Type *</label>
                                    <select
                                        value={formData['Type']}
                                        onChange={(e) => setFormData({ ...formData, 'Type': e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900"
                                    >
                                        <option value="Local">Local</option>
                                        <option value="Duty Free">Duty Free</option>
                                        <option value="Duty Paid">Duty Paid</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Product Name *</label>
                                    <input
                                        type="text"
                                        value={formData['Product Name']}
                                        onChange={(e) => setFormData({ ...formData, 'Product Name': e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Issue Price *</label>
                                    <input
                                        type="number"
                                        value={formData['Issue Price']}
                                        onChange={(e) => setFormData({ ...formData, 'Issue Price': parseFloat(e.target.value) || 0 })}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">MRP *</label>
                                    <input
                                        type="number"
                                        value={formData['MRP']}
                                        onChange={(e) => setFormData({ ...formData, 'MRP': parseFloat(e.target.value) || 0 })}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Special Margin</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={formData['Special Margin']}
                                        onChange={(e) => setFormData({ ...formData, 'Special Margin': parseFloat(e.target.value) || 0 })}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900"
                                    />
                                </div>
                            </div>
                            <div className="mt-6 flex gap-3">
                                <button
                                    onClick={showAddModal ? handleAddWine : handleEditWine}
                                    className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 flex items-center justify-center gap-2"
                                >
                                    <Save className="w-5 h-5" />
                                    {showAddModal ? 'Add Wine' : 'Save Changes'}
                                </button>
                                <button
                                    onClick={() => { setShowAddModal(false); setShowEditModal(false); resetForm(); }}
                                    className="px-6 py-3 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400"
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
