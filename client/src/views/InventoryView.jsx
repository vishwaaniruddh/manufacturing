// client/src/views/InventoryView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  Package,
  Boxes,
  Search,
  Plus,
  Edit3,
  Trash2,
  X,
  Download
} from 'lucide-react';
import Pagination, { usePagination } from '../components/Pagination';
import { exportToCsv } from '../utils/exportCsv';

export default function InventoryView({ section = 'inventory_products' }) {
  const isProducts = section === 'inventory_products';
  const [products, setProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState('');

  // Quick stock addition
  const [addingStockId, setAddingStockId] = useState(null);
  const [stockQty, setStockQty] = useState(50);

  // Create / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formState, setFormState] = useState({});

  const loadData = async () => {
    setLoading(true);
    try {
      if (isProducts) {
        const res = await api.getProducts();
        setProducts(res.data || []);
      } else {
        const res = await api.getRawMaterials();
        setRawMaterials(res.data || []);
      }
    } catch (err) {
      alert('Error loading inventory data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSearchQuery('');
    setShowModal(false);
    loadData();
  }, [section]);

  const activeList = isProducts ? products : rawMaterials;
  const filtered = activeList.filter((item) => {
    if (!isProducts && stockFilter) {
      const isLow = Number(item.current_stock) <= Number(item.reorder_level);
      if (stockFilter === 'low' && !isLow) return false;
      if (stockFilter === 'ok' && isLow) return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.name?.toLowerCase().includes(q) ||
      item.sku?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q) ||
      item.location?.toLowerCase().includes(q)
    );
  });

  const pagination = usePagination(filtered, 10);

  const handleAddStock = async (rmId) => {
    if (!stockQty || stockQty <= 0) return;
    try {
      await api.addMaterialStock(rmId, Number(stockQty));
      setAddingStockId(null);
      loadData();
    } catch (err) {
      alert('Failed to add stock: ' + err.message);
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    if (isProducts) {
      setFormState({ sku: '', name: '', category: 'Finished Good', uom: 'Units', unit_price: 0, description: '', status: 'active' });
    } else {
      setFormState({ sku: '', name: '', category: 'Raw Material', uom: 'Units', current_stock: 0, reorder_level: 10, unit_cost: 0, location: 'Main Store', description: '', status: 'active' });
    }
    setShowModal(true);
  };

  const openEditModal = (row) => {
    setEditingId(row.id);
    setFormState({ ...row });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (isProducts) {
        if (editingId) await api.updateProduct(editingId, formState);
        else await api.createProduct(formState);
      } else {
        if (editingId) await api.updateRawMaterial(editingId, formState);
        else await api.createRawMaterial(formState);
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this record?')) return;
    try {
      if (isProducts) await api.deleteProduct(id);
      else await api.deleteRawMaterial(id);
      loadData();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            {isProducts ? <Package className="h-4 w-4 text-slate-700" /> : <Boxes className="h-4 w-4 text-slate-700" />}
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">
              {isProducts ? 'Inventory: Products & BOM' : 'Inventory: Raw Materials & Stock'}
            </h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              Inventory
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isProducts
              ? 'Finished goods, sub-assemblies, and Bill of Materials (BOM) recipes.'
              : 'Warehouse raw material inventory, reorder thresholds, and quick stock replenishment.'}
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium text-xs shadow-xs flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> {isProducts ? 'Add Product' : 'Add Raw Material'}
        </button>
      </div>

      {/* Filter & Export */}
      <div className="bg-white p-2.5 rounded-lg border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={isProducts ? 'Search SKU, product name, category...' : 'Search SKU, material name, location...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:ring-1 focus:ring-slate-900"
            />
          </div>
          {!isProducts && (
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Stock Levels</option>
              <option value="low">Low Stock (&le; Reorder)</option>
              <option value="ok">Healthy Stock</option>
            </select>
          )}
        </div>

        <button
          type="button"
          onClick={() =>
            isProducts
              ? exportToCsv(
                  'inventory_products',
                  [
                    { header: 'SKU', accessor: 'sku' },
                    { header: 'Product Name', accessor: 'name' },
                    { header: 'Category', accessor: 'category' },
                    { header: 'Unit Price', accessor: 'unit_price' },
                    { header: 'UOM', accessor: 'uom' }
                  ],
                  filtered
                )
              : exportToCsv(
                  'inventory_raw_materials',
                  [
                    { header: 'SKU', accessor: 'sku' },
                    { header: 'Material Name', accessor: 'name' },
                    { header: 'Location', accessor: 'location' },
                    { header: 'Current Stock', accessor: 'current_stock' },
                    { header: 'Reorder Level', accessor: 'reorder_level' },
                    { header: 'UOM', accessor: 'uom' },
                    { header: 'Unit Cost', accessor: 'unit_cost' }
                  ],
                  filtered
                )
          }
          title="Export filtered inventory"
          className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
        >
          <Download className="h-3.5 w-3.5" /> Export
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading inventory...</div>
        ) : pagination.totalItems === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No records found.</div>
        ) : (
          <>
            <div className="px-3.5 py-2 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
              <span>Total Records: <strong className="text-slate-800">{pagination.totalItems}</strong></span>
              <span>Page {pagination.currentPage} of {pagination.totalPages}</span>
            </div>
            {isProducts ? (
              <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="px-3 py-2.5 w-10 text-center">#</th>
                  <th className="px-3.5 py-2.5">SKU & Product Name</th>
                  <th className="px-3.5 py-2.5">Category</th>
                  <th className="px-3.5 py-2.5">BOM & Sub-Assemblies</th>
                  <th className="px-3.5 py-2.5 text-right">Unit Price</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagination.paginatedItems.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 align-top">
                    <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">
                      {pagination.startIndex + idx + 1}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className="font-mono text-[11px] font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                        {p.sku}
                      </span>
                      <p className="font-semibold text-slate-900 mt-1">{p.name}</p>
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                        {p.category}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="space-y-1">
                        {p.sub_assemblies && p.sub_assemblies.length > 0 && (
                          <div className="text-[10px] text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
                            <span className="font-semibold">Sub-Assemblies ({p.sub_assemblies.length}):</span>{' '}
                            {p.sub_assemblies.map((s) => `${s.sub_product_name} (${s.quantity_required} ${s.uom})`).join(', ')}
                          </div>
                        )}
                        {p.bom && p.bom.length > 0 && (
                          <div className="text-[10px] text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                            <span className="font-semibold">BOM ({p.bom.length}):</span>{' '}
                            {p.bom.map((b) => `${b.raw_material_name} (${b.quantity_required} ${b.uom})`).join(', ')}
                          </div>
                        )}
                        {(!p.sub_assemblies || p.sub_assemblies.length === 0) && (!p.bom || p.bom.length === 0) && (
                          <span className="text-[11px] text-slate-400">No BOM items</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
                      ₹{Number(p.unit_price).toLocaleString()} / {p.uom}
                    </td>
                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap space-x-1">
                      <button type="button" onClick={() => openEditModal(p)} className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100" title="Edit">
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => handleDelete(p.id)} className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="px-3 py-2.5 w-10 text-center">#</th>
                  <th className="px-3.5 py-2.5">Material SKU & Name</th>
                  <th className="px-3.5 py-2.5">Location</th>
                  <th className="px-3.5 py-2.5 text-center">Current Stock</th>
                  <th className="px-3.5 py-2.5 text-center">Reorder Lvl</th>
                  <th className="px-3.5 py-2.5 text-right">Unit Cost</th>
                  <th className="px-3.5 py-2.5 text-right">Quick Add</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagination.paginatedItems.map((rm, idx) => (
                  <tr key={rm.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">
                      {pagination.startIndex + idx + 1}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <p className="font-semibold text-slate-900">{rm.name}</p>
                      <span className="font-mono text-[10px] text-slate-400">{rm.sku}</span>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600 text-[11px]">{rm.location}</td>
                    <td className="px-3.5 py-2.5 text-center font-bold">
                      <span className={Number(rm.current_stock) <= Number(rm.reorder_level) ? 'text-rose-600' : 'text-slate-900'}>
                        {rm.current_stock} {rm.uom}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-center text-slate-400 text-[11px]">{rm.reorder_level} {rm.uom}</td>
                    <td className="px-3.5 py-2.5 text-right font-medium text-slate-700">₹{Number(rm.unit_cost).toLocaleString()}</td>
                    <td className="px-3.5 py-2.5 text-right">
                      {addingStockId === rm.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="1"
                            value={stockQty}
                            onChange={(e) => setStockQty(e.target.value)}
                            className="w-14 p-0.5 text-center border rounded text-xs"
                          />
                          <button type="button" onClick={() => handleAddStock(rm.id)} className="h-6 px-1.5 bg-slate-900 text-white rounded text-[10px]">
                            Add
                          </button>
                          <button type="button" onClick={() => setAddingStockId(null)} className="h-6 px-1.5 border rounded text-[10px]">
                            X
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingStockId(rm.id);
                            setStockQty(50);
                          }}
                          className="h-6 px-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-[10px] font-medium"
                        >
                          + Stock
                        </button>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap space-x-1">
                      <button type="button" onClick={() => openEditModal(rm)} className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100" title="Edit">
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => handleDelete(rm.id)} className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            )}
          </>
        )}

        {!loading && (
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setCurrentPage}
          />
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-md w-full p-4 shadow-lg border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h2 className="text-sm font-semibold text-slate-900">
                {editingId ? 'Edit' : 'Add'} {isProducts ? 'Product' : 'Raw Material'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">SKU *</label>
                  <input required value={formState.sku || ''} onChange={(e) => setFormState({ ...formState, sku: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md font-mono" />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category</label>
                  <input value={formState.category || ''} onChange={(e) => setFormState({ ...formState, category: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Name *</label>
                <input required value={formState.name || ''} onChange={(e) => setFormState({ ...formState, name: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
              </div>
              {isProducts ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Unit Price (₹) *</label>
                    <input type="number" step="0.01" required value={formState.unit_price ?? 0} onChange={(e) => setFormState({ ...formState, unit_price: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">UOM</label>
                    <input value={formState.uom || 'Units'} onChange={(e) => setFormState({ ...formState, uom: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Stock</label>
                      <input type="number" step="0.01" value={formState.current_stock ?? 0} onChange={(e) => setFormState({ ...formState, current_stock: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Reorder Lvl</label>
                      <input type="number" step="0.01" value={formState.reorder_level ?? 10} onChange={(e) => setFormState({ ...formState, reorder_level: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Unit Cost (₹)</label>
                      <input type="number" step="0.01" value={formState.unit_cost ?? 0} onChange={(e) => setFormState({ ...formState, unit_cost: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">UOM</label>
                      <input value={formState.uom || 'Units'} onChange={(e) => setFormState({ ...formState, uom: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Location</label>
                      <input value={formState.location || 'Main Store'} onChange={(e) => setFormState({ ...formState, location: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="h-8 px-3 border border-slate-200 text-slate-600 rounded-md font-medium hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" className="h-8 px-4 bg-slate-900 text-white rounded-md font-medium hover:bg-slate-800">
                  {editingId ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
