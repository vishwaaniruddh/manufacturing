// client/src/views/MastersView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  Database, 
  MapPin, 
  Truck, 
  Users, 
  Boxes, 
  Package, 
  Plus,
  Download
} from 'lucide-react';
import Pagination, { usePagination } from '../components/Pagination';
import { exportToCsv } from '../utils/exportCsv';

export default function MastersView() {
  const [activeSubTab, setActiveSubTab] = useState('customers');
  const [loading, setLoading] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);

  const customersPagination = usePagination(customers, 10);
  const rawMaterialsPagination = usePagination(rawMaterials, 10);
  const couriersPagination = usePagination(couriers, 10);

  // Quick stock addition
  const [addingStockId, setAddingStockId] = useState(null);
  const [stockQty, setStockQty] = useState(50);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cRes, pRes, rmRes, crRes, coRes, stRes, ctRes] = await Promise.all([
        api.getCustomers(),
        api.getProducts(),
        api.getRawMaterials(),
        api.getCouriers(),
        api.getCountries(),
        api.getStates(),
        api.getCities()
      ]);
      setCustomers(cRes.data || []);
      setProducts(pRes.data || []);
      setRawMaterials(rmRes.data || []);
      setCouriers(crRes.data || []);
      setCountries(coRes.data || []);
      setStates(stRes.data || []);
      setCities(ctRes.data || []);
    } catch (err) {
      alert('Error fetching master data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddStock = async (rmId) => {
    if (!stockQty || stockQty <= 0) return;
    try {
      await api.addMaterialStock(rmId, Number(stockQty));
      alert('Stock updated successfully!');
      setAddingStockId(null);
      loadData();
    } catch (err) {
      alert('Failed to add stock: ' + err.message);
    }
  };

  return (
    <div className="space-y-3.5">
      
      {/* Header (ShadCN style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">
              Master Data Hub & Inventory Catalog
            </h1>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              Admin Configuration
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure system masters: Customers, Finished Products, Raw Materials, Couriers, and Geography.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex flex-wrap bg-slate-100 p-0.5 rounded-md border border-slate-200 gap-0.5 text-xs">
          {[
            { id: 'customers', label: 'Customers', icon: Users },
            { id: 'products', label: 'Products & BOM', icon: Package },
            { id: 'raw_materials', label: 'Raw Materials & Stock', icon: Boxes },
            { id: 'couriers', label: 'Couriers', icon: Truck },
            { id: 'geography', label: 'Geography', icon: MapPin },
          ].map((tab) => {
            const Icon = tab.icon;
            const isCurrent = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`px-2.5 py-1 rounded font-medium flex items-center gap-1 transition-colors ${
                  isCurrent ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="h-3 w-3" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. CUSTOMERS TAB */}
      {activeSubTab === 'customers' && (
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-2.5 bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span>Customer Accounts ({customers.length})</span>
            <button
              type="button"
              onClick={() =>
                exportToCsv(
                  'masters_customers',
                  [
                    { header: 'Company', accessor: 'company_name' },
                    { header: 'Contact Person', accessor: 'contact_person' },
                    { header: 'Email', accessor: 'email' },
                    { header: 'Phone', accessor: 'phone' },
                    { header: 'GST #', accessor: 'gst_number' },
                    { header: 'Status', accessor: 'status' }
                  ],
                  customers
                )
              }
              className="h-7 px-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-[11px] font-medium inline-flex items-center gap-1"
            >
              <Download className="h-3 w-3" /> Export
            </button>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 w-10 text-center">#</th>
                <th className="px-3.5 py-2">Company & Contact</th>
                <th className="px-3.5 py-2">Email & Phone</th>
                <th className="px-3.5 py-2">GST #</th>
                <th className="px-3.5 py-2">Location</th>
                <th className="px-3.5 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customersPagination.paginatedItems.map((c, idx) => (
                <tr key={c.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">
                    {customersPagination.startIndex + idx + 1}
                  </td>
                  <td className="px-3.5 py-2">
                    <p className="font-semibold text-slate-900">{c.company_name}</p>
                    <p className="text-[10px] text-slate-400">{c.contact_person}</p>
                  </td>
                  <td className="px-3.5 py-2 whitespace-nowrap">
                    <p className="text-slate-800">{c.email}</p>
                    <p className="text-[10px] text-slate-400">{c.phone}</p>
                  </td>
                  <td className="px-3.5 py-2 font-mono text-[11px]">{c.gst_number || '—'}</td>
                  <td className="px-3.5 py-2 max-w-xs truncate text-[11px] text-slate-600">
                    {c.address}, {c.city_name || 'Mumbai'}
                  </td>
                  <td className="px-3.5 py-2 whitespace-nowrap">
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            currentPage={customersPagination.currentPage}
            totalPages={customersPagination.totalPages}
            totalItems={customersPagination.totalItems}
            pageSize={customersPagination.pageSize}
            onPageChange={customersPagination.setCurrentPage}
          />
        </div>
      )}

      {/* 2. PRODUCTS & BOM TAB */}
      {activeSubTab === 'products' && (
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden divide-y divide-slate-100">
          <div className="p-2.5 bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-700">
            Finished Goods & Bill of Materials (BOM Recipes)
          </div>
          {products.map((p) => (
            <div key={p.id} className="p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                    {p.sku}
                  </span>
                  <span className="font-semibold text-slate-900 text-xs">{p.name}</span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">
                    {p.category}
                  </span>
                </div>
                <span className="font-bold text-slate-900 text-xs">₹{Number(p.unit_price).toLocaleString()} / {p.uom}</span>
              </div>

              {/* Sub-Assemblies (Components) */}
              {p.sub_assemblies && p.sub_assemblies.length > 0 && (
                <div className="bg-indigo-50/60 p-2 rounded border border-indigo-200 text-xs">
                  <span className="font-semibold text-indigo-800 text-[10px] block mb-1 uppercase tracking-wider">
                    Required Sub-Products / Sub-Assemblies ({p.sub_assemblies.length}):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {p.sub_assemblies.map((sub, idx) => (
                      <div key={idx} className="bg-white p-1.5 rounded border border-indigo-100 flex flex-col justify-between text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900">{sub.sub_product_name}</span>
                          <span className="font-mono text-[9px] text-indigo-600 bg-indigo-50 px-1 rounded">{sub.sub_product_sku}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                          <span>Req: <strong>{sub.quantity_required} {sub.uom}</strong></span>
                          <span>In Stock: <strong className={sub.current_stock > 0 ? 'text-emerald-700' : 'text-rose-600'}>{sub.current_stock} {sub.uom}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw Materials BOM */}
              {p.bom && p.bom.length > 0 && (
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-xs">
                  <span className="font-semibold text-slate-600 text-[10px] block mb-1 uppercase tracking-wider">
                    Raw Materials & Consumables Recipe:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    {p.bom.map((b, idx) => (
                      <div key={idx} className="bg-white p-1.5 rounded border border-slate-200 flex justify-between text-[11px]">
                        <span className="font-medium text-slate-800">{b.raw_material_name}</span>
                        <span className="font-semibold text-slate-900">{b.quantity_required} {b.uom}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 3. RAW MATERIALS & STOCK */}
      {activeSubTab === 'raw_materials' && (
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-2.5 bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span>Warehouse Raw Material Stock</span>
            <button
              type="button"
              onClick={() =>
                exportToCsv(
                  'masters_raw_materials',
                  [
                    { header: 'SKU', accessor: 'sku' },
                    { header: 'Material', accessor: 'name' },
                    { header: 'Location', accessor: 'location' },
                    { header: 'Current Stock', accessor: 'current_stock' },
                    { header: 'Reorder Level', accessor: 'reorder_level' },
                    { header: 'Unit Cost', accessor: 'unit_cost' }
                  ],
                  rawMaterials
                )
              }
              className="h-7 px-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-[11px] font-medium inline-flex items-center gap-1"
            >
              <Download className="h-3 w-3" /> Export
            </button>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 w-10 text-center">#</th>
                <th className="px-3.5 py-2">Material SKU & Name</th>
                <th className="px-3.5 py-2">Location</th>
                <th className="px-3.5 py-2 text-center">Current Stock</th>
                <th className="px-3.5 py-2 text-center">Reorder Lvl</th>
                <th className="px-3.5 py-2 text-right">Cost</th>
                <th className="px-3.5 py-2 text-right">Quick Add</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rawMaterialsPagination.paginatedItems.map((rm, idx) => (
                <tr key={rm.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">
                    {rawMaterialsPagination.startIndex + idx + 1}
                  </td>
                  <td className="px-3.5 py-2">
                    <p className="font-semibold text-slate-900">{rm.name}</p>
                    <span className="font-mono text-[10px] text-slate-400">{rm.sku}</span>
                  </td>
                  <td className="px-3.5 py-2 text-slate-600 text-[11px]">{rm.location}</td>
                  <td className="px-3.5 py-2 text-center font-bold">
                    <span className={Number(rm.current_stock) <= Number(rm.reorder_level) ? 'text-rose-600' : 'text-slate-900'}>
                      {rm.current_stock} {rm.uom}
                    </span>
                  </td>
                  <td className="px-3.5 py-2 text-center text-slate-400 text-[11px]">{rm.reorder_level} {rm.uom}</td>
                  <td className="px-3.5 py-2 text-right font-medium text-slate-700">₹{Number(rm.unit_cost).toLocaleString()}</td>
                  <td className="px-3.5 py-2 text-right">
                    {addingStockId === rm.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min="1"
                          value={stockQty}
                          onChange={(e) => setStockQty(e.target.value)}
                          className="w-14 p-0.5 text-center border rounded text-xs"
                        />
                        <button
                          onClick={() => handleAddStock(rm.id)}
                          className="h-6 px-1.5 bg-slate-900 text-white rounded text-[10px]"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => setAddingStockId(null)}
                          className="h-6 px-1.5 border rounded text-[10px]"
                        >
                          X
                        </button>
                      </div>
                    ) : (
                      <button
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
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            currentPage={rawMaterialsPagination.currentPage}
            totalPages={rawMaterialsPagination.totalPages}
            totalItems={rawMaterialsPagination.totalItems}
            pageSize={rawMaterialsPagination.pageSize}
            onPageChange={rawMaterialsPagination.setCurrentPage}
          />
        </div>
      )}

      {/* 4. COURIERS */}
      {activeSubTab === 'couriers' && (
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-2.5 bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span>Courier & Logistics Carriers</span>
            <button
              type="button"
              onClick={() =>
                exportToCsv(
                  'masters_couriers',
                  [
                    { header: 'Name', accessor: 'name' },
                    { header: 'Code', accessor: 'code' },
                    { header: 'Contact Person', accessor: 'contact_person' },
                    { header: 'Phone', accessor: 'phone' },
                    { header: 'Status', accessor: 'status' }
                  ],
                  couriers
                )
              }
              className="h-7 px-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-[11px] font-medium inline-flex items-center gap-1"
            >
              <Download className="h-3 w-3" /> Export
            </button>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/50 text-slate-600 border-b border-slate-200 font-semibold">
              <tr>
                <th className="px-3 py-2 w-10 text-center">#</th>
                <th className="px-3.5 py-2">Courier Name & Code</th>
                <th className="px-3.5 py-2">Contact & Phone</th>
                <th className="px-3.5 py-2">Tracking URL Pattern</th>
                <th className="px-3.5 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {couriersPagination.paginatedItems.map((c, idx) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">
                    {couriersPagination.startIndex + idx + 1}
                  </td>
                  <td className="px-3.5 py-2 font-semibold text-slate-900">{c.name} ({c.code})</td>
                  <td className="px-3.5 py-2 text-slate-600">{c.contact_person} • {c.phone}</td>
                  <td className="px-3.5 py-2 font-mono text-[10px] text-slate-400">{c.tracking_url_template}</td>
                  <td className="px-3.5 py-2 uppercase font-semibold text-emerald-700 text-[10px]">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            currentPage={couriersPagination.currentPage}
            totalPages={couriersPagination.totalPages}
            totalItems={couriersPagination.totalItems}
            pageSize={couriersPagination.pageSize}
            onPageChange={couriersPagination.setCurrentPage}
          />
        </div>
      )}

      {/* 5. GEOGRAPHY */}
      {activeSubTab === 'geography' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
          <div className="bg-white rounded-lg border border-slate-200 p-3">
            <h4 className="font-semibold text-slate-700 mb-1.5">Countries ({countries.length})</h4>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {countries.map(c => (
                <div key={c.id} className="p-1.5 bg-slate-50 rounded flex justify-between text-[11px]">
                  <span>{c.name}</span>
                  <span className="font-mono text-slate-400">{c.code}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-3">
            <h4 className="font-semibold text-slate-700 mb-1.5">States ({states.length})</h4>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {states.map(s => (
                <div key={s.id} className="p-1.5 bg-slate-50 rounded flex justify-between text-[11px]">
                  <span>{s.name}</span>
                  <span className="text-slate-400">{s.country_name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-3">
            <h4 className="font-semibold text-slate-700 mb-1.5">Cities ({cities.length})</h4>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {cities.map(c => (
                <div key={c.id} className="p-1.5 bg-slate-50 rounded flex justify-between text-[11px]">
                  <span>{c.name}</span>
                  <span className="text-slate-400">{c.state_name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
