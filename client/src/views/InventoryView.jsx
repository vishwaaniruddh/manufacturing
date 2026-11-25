// client/src/views/InventoryView.jsx
import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import {
  Package,
  Boxes,
  Search,
  Plus,
  Edit3,
  Trash2,
  X,
  Download,
  Layers
} from 'lucide-react';
import Pagination, { usePagination } from '../components/Pagination';
import { exportToCsv } from '../utils/exportCsv';

export default function InventoryView({ section = 'inventory_products' }) {
  const isProducts = section === 'inventory_products';
  const [products, setProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState('');

  // Quick stock addition
  const [addingStockId, setAddingStockId] = useState(null);
  const [stockQty, setStockQty] = useState(50);

  // Create / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formState, setFormState] = useState({});
  const [focusSection, setFocusSection] = useState('details');
  const bomSectionRef = useRef(null);

  const loadData = async () => {
    setLoading(true);
    try {
      if (isProducts) {
        const [pRes, rmRes] = await Promise.all([api.getProducts(), api.getRawMaterials()]);
        setProducts(pRes.data || []);
        setRawMaterials(rmRes.data || []);
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

  useEffect(() => {
    if (showModal && isProducts && focusSection === 'bom') {
      const timer = setTimeout(() => {
        bomSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [showModal, isProducts, focusSection]);

  const activeList = isProducts ? products : rawMaterials;
  const filtered = activeList.filter((item) => {
    if (!isProducts && stockFilter) {
      const isLow = Number(item.current_stock) <= Number(item.reorder_level);
      if (stockFilter === 'low' && !isLow) return false;
      if (stockFilter === 'ok' && isLow) return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchBasic =
      item.name?.toLowerCase().includes(q) ||
      item.sku?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q) ||
      item.location?.toLowerCase().includes(q);
    if (matchBasic) return true;
    if (isProducts) {
      return (
        (item.sub_assemblies || []).some(
          (s) => s.sub_product_name?.toLowerCase().includes(q) || s.sub_product_sku?.toLowerCase().includes(q)
        ) ||
        (item.bom || []).some(
          (b) => b.raw_material_name?.toLowerCase().includes(q) || b.raw_material_sku?.toLowerCase().includes(q)
        )
      );
    }
    return false;
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
    setFocusSection('details');
    if (isProducts) {
      setFormState({
        sku: '',
        name: '',
        category: 'Finished Good',
        product_type: 'finished_good',
        uom: 'Units',
        unit_price: 0,
        current_stock: 0,
        reorder_level: 5,
        description: '',
        status: 'active',
        sub_assemblies: [],
        bom: []
      });
    } else {
      setFormState({ sku: '', name: '', category: 'Raw Material', uom: 'Units', current_stock: 0, reorder_level: 10, unit_cost: 0, location: 'Main Store', description: '', status: 'active' });
    }
    setShowModal(true);
  };

  const openEditModal = (row, initialFocus = 'details') => {
    setEditingId(row.id);
    setFocusSection(initialFocus);
    if (isProducts) {
      setFormState({
        ...row,
        product_type: row.product_type || 'finished_good',
        current_stock: row.current_stock ?? 0,
        reorder_level: row.reorder_level ?? 5,
        sub_assemblies: (row.sub_assemblies || []).map((s) => ({
          sub_product_id: String(s.sub_product_id),
          quantity_required: s.quantity_required ?? 1,
          notes: s.notes || ''
        })),
        bom: (row.bom || []).map((b) => ({
          raw_material_id: String(b.raw_material_id),
          quantity_required: b.quantity_required ?? 1
        }))
      });
    } else {
      setFormState({ ...row });
    }
    setShowModal(true);
  };

  const addSubAssemblyRow = () => {
    setFormState((prev) => ({
      ...prev,
      sub_assemblies: [...(prev.sub_assemblies || []), { sub_product_id: '', quantity_required: 1, notes: '' }]
    }));
  };

  const updateSubAssemblyRow = (idx, patch) => {
    setFormState((prev) => ({
      ...prev,
      sub_assemblies: (prev.sub_assemblies || []).map((row, i) => (i === idx ? { ...row, ...patch } : row))
    }));
  };

  const removeSubAssemblyRow = (idx) => {
    setFormState((prev) => ({
      ...prev,
      sub_assemblies: (prev.sub_assemblies || []).filter((_, i) => i !== idx)
    }));
  };

  const addBomRow = () => {
    setFormState((prev) => ({
      ...prev,
      bom: [...(prev.bom || []), { raw_material_id: '', quantity_required: 1 }]
    }));
  };

  const updateBomRow = (idx, patch) => {
    setFormState((prev) => ({
      ...prev,
      bom: (prev.bom || []).map((row, i) => (i === idx ? { ...row, ...patch } : row))
    }));
  };

  const removeBomRow = (idx) => {
    setFormState((prev) => ({
      ...prev,
      bom: (prev.bom || []).filter((_, i) => i !== idx)
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (isProducts) {
      const subRows = formState.sub_assemblies || [];
      const bomRows = formState.bom || [];
      const invalidSub = subRows.some((s) => !s.sub_product_id || Number(s.quantity_required) <= 0);
      if (invalidSub) {
        alert('Please select a Sub-Assembly product and enter a quantity greater than 0 for every sub-assembly row (or remove empty rows).');
        return;
      }
      const invalidBom = bomRows.some((b) => !b.raw_material_id || Number(b.quantity_required) <= 0);
      if (invalidBom) {
        alert('Please select a Raw Material and enter a quantity greater than 0 for every BOM row (or remove empty rows).');
        return;
      }
    }

    setSaving(true);
    try {
      if (isProducts) {
        const payload = {
          sku: formState.sku,
          name: formState.name,
          category: formState.category,
          product_type: formState.product_type || 'finished_good',
          uom: formState.uom || 'Units',
          unit_price: Number(formState.unit_price || 0),
          current_stock: Number(formState.current_stock || 0),
          reorder_level: Number(formState.reorder_level ?? 5),
          description: formState.description || null,
          status: formState.status || 'active',
          sub_assemblies: (formState.sub_assemblies || []).map((s) => ({
            sub_product_id: Number(s.sub_product_id),
            quantity_required: Number(s.quantity_required),
            notes: s.notes || ''
          })),
          bom: (formState.bom || []).map((b) => ({
            raw_material_id: Number(b.raw_material_id),
            quantity_required: Number(b.quantity_required)
          }))
        };
        if (editingId) await api.updateProduct(editingId, payload);
        else await api.createProduct(payload);
      } else {
        if (editingId) await api.updateRawMaterial(editingId, formState);
        else await api.createRawMaterial(formState);
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
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
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                          {p.sku}
                        </span>
                        {p.product_type === 'sub_assembly' && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Sub-Assembly · Stock: {Number(p.current_stock || 0)}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-slate-900 mt-1">{p.name}</p>
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                        {p.category}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="space-y-1.5">
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
                        <div className="flex flex-wrap items-center gap-2">
                          {(!p.sub_assemblies || p.sub_assemblies.length === 0) && (!p.bom || p.bom.length === 0) && (
                            <span className="text-[11px] text-slate-400">No BOM items</span>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(p, 'bom')}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border border-slate-200 bg-white hover:bg-slate-900 hover:text-white hover:border-slate-900 text-slate-700 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                            {(p.sub_assemblies?.length || 0) + (p.bom?.length || 0) > 0
                              ? 'Edit BOM / Sub-Assemblies'
                              : 'Add BOM / Sub-Assembly'}
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
                      ₹{Number(p.unit_price).toLocaleString()} / {p.uom}
                    </td>
                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap space-x-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(p, 'bom')}
                        className="p-1 text-indigo-600 hover:text-indigo-900 rounded hover:bg-indigo-50"
                        title="Assign BOM & Sub-Assemblies"
                      >
                        <Layers className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => openEditModal(p, 'details')} className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100" title="Edit Product & BOM">
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
          <div className={`bg-white rounded-lg ${isProducts ? 'max-w-3xl' : 'max-w-md'} w-full max-h-[90vh] flex flex-col shadow-lg border border-slate-200 overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/60 shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {editingId ? 'Edit' : 'Add'} {isProducts ? 'Product, BOM & Sub-Assemblies' : 'Raw Material'}
                </h2>
                {isProducts && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Configure product master details along with child sub-assemblies and raw material BOM recipe.
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden text-xs">
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {isProducts ? (
                  <>
                    {/* Basic Product Info */}
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">SKU *</label>
                          <input required value={formState.sku || ''} onChange={(e) => setFormState({ ...formState, sku: e.target.value })} placeholder="e.g. FG-GBX-4004" className="w-full p-2 border border-slate-200 rounded-md font-mono" />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">Product Type</label>
                          <select
                            value={formState.product_type || 'finished_good'}
                            onChange={(e) => setFormState({ ...formState, product_type: e.target.value })}
                            className="w-full p-2 border border-slate-200 rounded-md bg-white"
                          >
                            <option value="finished_good">Finished Good</option>
                            <option value="sub_assembly">Sub-Assembly</option>
                          </select>
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">Category</label>
                          <input value={formState.category || ''} onChange={(e) => setFormState({ ...formState, category: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">UOM</label>
                          <input value={formState.uom || 'Units'} onChange={(e) => setFormState({ ...formState, uom: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <div className="sm:col-span-2">
                          <label className="block font-medium text-slate-700 mb-1">Product Name *</label>
                          <input required value={formState.name || ''} onChange={(e) => setFormState({ ...formState, name: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">Unit Price (₹) *</label>
                          <input type="number" step="0.01" required value={formState.unit_price ?? 0} onChange={(e) => setFormState({ ...formState, unit_price: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">Current Stock</label>
                          <input type="number" step="0.01" value={formState.current_stock ?? 0} onChange={(e) => setFormState({ ...formState, current_stock: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                        </div>
                      </div>
                    </div>

                    {/* BOM & Sub-Assemblies Section */}
                    <div
                      ref={bomSectionRef}
                      className={`space-y-3 pt-3 border-t border-slate-200 ${focusSection === 'bom' ? 'ring-1 ring-indigo-200 rounded-lg p-3 bg-slate-50/40' : ''}`}
                    >
                      {/* Sub-Assemblies Builder */}
                      <div className="rounded-lg border border-indigo-200/80 bg-indigo-50/30 p-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-indigo-950 text-xs flex items-center gap-1.5">
                              <Layers className="h-3.5 w-3.5 text-indigo-600" />
                              Sub-Assemblies ({(formState.sub_assemblies || []).length})
                            </h3>
                            <p className="text-[10px] text-indigo-700/80">
                              Child assemblies or sub-products required per 1 unit of this product.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={addSubAssemblyRow}
                            className="h-7 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-[11px] font-medium inline-flex items-center gap-1 shrink-0"
                          >
                            <Plus className="h-3 w-3" /> Add Sub-Assembly
                          </button>
                        </div>

                        {(formState.sub_assemblies || []).length === 0 ? (
                          <div className="text-[11px] text-slate-500 bg-white/80 border border-dashed border-indigo-200 rounded-md px-3 py-2.5 text-center">
                            No sub-assemblies assigned. Click <strong>Add Sub-Assembly</strong> to attach a sub-product.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {(formState.sub_assemblies || []).map((row, idx) => {
                              const pickedIds = new Set(
                                (formState.sub_assemblies || [])
                                  .filter((_, i) => i !== idx)
                                  .map((r) => String(r.sub_product_id))
                                  .filter(Boolean)
                              );
                              const candidates = [...products]
                                .filter((cand) => Number(cand.id) !== Number(editingId))
                                .sort((a, b) => {
                                  const aSub = a.product_type === 'sub_assembly' ? 0 : 1;
                                  const bSub = b.product_type === 'sub_assembly' ? 0 : 1;
                                  if (aSub !== bSub) return aSub - bSub;
                                  return String(a.name || '').localeCompare(String(b.name || ''));
                                });
                              const selectedProd = products.find((p) => String(p.id) === String(row.sub_product_id));

                              return (
                                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-md border border-indigo-100">
                                  <div className="col-span-12 sm:col-span-5">
                                    <select
                                      value={row.sub_product_id || ''}
                                      onChange={(e) => updateSubAssemblyRow(idx, { sub_product_id: e.target.value })}
                                      className="w-full p-1.5 border border-slate-200 rounded bg-white text-[11px]"
                                    >
                                      <option value="">-- Select Sub-Assembly / Product --</option>
                                      {candidates.map((cand) => (
                                        <option key={cand.id} value={cand.id} disabled={pickedIds.has(String(cand.id))}>
                                          {cand.product_type === 'sub_assembly' ? '[Sub]' : '[Product]'} {cand.sku} — {cand.name} (Stock: {Number(cand.current_stock || 0)})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="col-span-5 sm:col-span-2">
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        step="0.0001"
                                        min="0.0001"
                                        value={row.quantity_required ?? 1}
                                        onChange={(e) => updateSubAssemblyRow(idx, { quantity_required: e.target.value })}
                                        title="Quantity required per parent unit"
                                        className="w-full p-1.5 border border-slate-200 rounded text-[11px] text-center font-mono"
                                      />
                                      <span className="text-[10px] text-slate-400 shrink-0">{selectedProd?.uom || 'Units'}</span>
                                    </div>
                                  </div>
                                  <div className="col-span-5 sm:col-span-4">
                                    <input
                                      type="text"
                                      placeholder="Role / notes (optional)"
                                      value={row.notes || ''}
                                      onChange={(e) => updateSubAssemblyRow(idx, { notes: e.target.value })}
                                      className="w-full p-1.5 border border-slate-200 rounded text-[11px]"
                                    />
                                  </div>
                                  <div className="col-span-2 sm:col-span-1 text-right">
                                    <button
                                      type="button"
                                      onClick={() => removeSubAssemblyRow(idx)}
                                      className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                                      title="Remove sub-assembly"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Raw Material BOM Builder */}
                      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                              <Boxes className="h-3.5 w-3.5 text-slate-700" />
                              Raw Materials BOM ({(formState.bom || []).length})
                            </h3>
                            <p className="text-[10px] text-slate-500">
                              Raw materials and consumables consumed per 1 unit produced.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={addBomRow}
                            className="h-7 px-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-[11px] font-medium inline-flex items-center gap-1 shrink-0"
                          >
                            <Plus className="h-3 w-3" /> Add Raw Material
                          </button>
                        </div>

                        {(formState.bom || []).length === 0 ? (
                          <div className="text-[11px] text-slate-500 bg-white border border-dashed border-slate-200 rounded-md px-3 py-2.5 text-center">
                            No raw materials in BOM. Click <strong>Add Raw Material</strong> to define material consumption.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {(formState.bom || []).map((row, idx) => {
                              const pickedIds = new Set(
                                (formState.bom || [])
                                  .filter((_, i) => i !== idx)
                                  .map((r) => String(r.raw_material_id))
                                  .filter(Boolean)
                              );
                              const selectedRm = rawMaterials.find((rm) => String(rm.id) === String(row.raw_material_id));
                              const lineCost = selectedRm
                                ? Number(row.quantity_required || 0) * Number(selectedRm.unit_cost || 0)
                                : 0;

                              return (
                                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-md border border-slate-200">
                                  <div className="col-span-12 sm:col-span-6">
                                    <select
                                      value={row.raw_material_id || ''}
                                      onChange={(e) => updateBomRow(idx, { raw_material_id: e.target.value })}
                                      className="w-full p-1.5 border border-slate-200 rounded bg-white text-[11px]"
                                    >
                                      <option value="">-- Select Raw Material --</option>
                                      {rawMaterials.map((rm) => (
                                        <option key={rm.id} value={rm.id} disabled={pickedIds.has(String(rm.id))}>
                                          {rm.sku} — {rm.name} (Stock: {Number(rm.current_stock || 0)} {rm.uom} · ₹{Number(rm.unit_cost || 0)})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="col-span-6 sm:col-span-3">
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        step="0.0001"
                                        min="0.0001"
                                        value={row.quantity_required ?? 1}
                                        onChange={(e) => updateBomRow(idx, { quantity_required: e.target.value })}
                                        title="Quantity required per unit"
                                        className="w-full p-1.5 border border-slate-200 rounded text-[11px] text-center font-mono"
                                      />
                                      <span className="text-[10px] text-slate-500 shrink-0 w-11 truncate">
                                        {selectedRm?.uom || 'Units'}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="col-span-4 sm:col-span-2 text-right font-mono text-[11px] text-slate-700">
                                    ₹{lineCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                  </div>
                                  <div className="col-span-2 sm:col-span-1 text-right">
                                    <button
                                      type="button"
                                      onClick={() => removeBomRow(idx)}
                                      className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                                      title="Remove raw material"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Component Cost Preview */}
                      {((formState.sub_assemblies || []).length > 0 || (formState.bom || []).length > 0) && (() => {
                        const subCost = (formState.sub_assemblies || []).reduce((sum, r) => {
                          const p = products.find((cand) => String(cand.id) === String(r.sub_product_id));
                          return sum + Number(r.quantity_required || 0) * Number(p?.unit_price || 0);
                        }, 0);
                        const rmCost = (formState.bom || []).reduce((sum, r) => {
                          const rm = rawMaterials.find((cand) => String(cand.id) === String(r.raw_material_id));
                          return sum + Number(r.quantity_required || 0) * Number(rm?.unit_cost || 0);
                        }, 0);
                        return (
                          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-100/80 rounded-md border border-slate-200 text-[11px] text-slate-700">
                            <span>
                              Sub-Assemblies Est.: <strong className="text-indigo-700">₹{subCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                              {' · '}
                              Raw Materials Est.: <strong className="text-slate-900">₹{rmCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                            </span>
                            <span>
                              Total Component Cost / Unit: <strong className="text-slate-900">₹{(subCost + rmCost).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </>
                ) : (
                  <>
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
              </div>

              <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
                <button type="button" onClick={() => setShowModal(false)} className="h-8 px-3 border border-slate-200 bg-white text-slate-600 rounded-md font-medium hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="h-8 px-4 bg-slate-900 text-white rounded-md font-medium hover:bg-slate-800 disabled:opacity-50">
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
