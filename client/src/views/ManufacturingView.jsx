// client/src/views/ManufacturingView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  Boxes, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  ShoppingCart, 
  Play, 
  Clock, 
  Hammer, 
  ArrowRight,
  RefreshCw,
  History,
  Download
} from 'lucide-react';
import { hasPermission } from '../utils/rbac';
import Pagination, { usePagination } from '../components/Pagination';
import { exportToCsv } from '../utils/exportCsv';

export default function ManufacturingView({
  currentUser,
  mode = 'manufacturing',
  initialPO,
  onViewWorkOrder,
  onOpenAudit,
  onNavigateTab
}) {
  const [subTab, setSubTab] = useState(() => (mode === 'mrp' || initialPO?.id ? 'lookup' : 'work_orders'));
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(false);

  // Selected PO
  const [selectedPOId, setSelectedPOId] = useState(initialPO?.id || '');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [bomSearch, setBomSearch] = useState('');
  const [bomAvailabilityFilter, setBomAvailabilityFilter] = useState('');

  const filteredSubAssemblies = (lookupResult?.sub_assemblies || []).filter((sub) => {
    const matchesSearch = !bomSearch || sub.name?.toLowerCase().includes(bomSearch.toLowerCase()) || sub.sku?.toLowerCase().includes(bomSearch.toLowerCase());
    const matchesAvail = !bomAvailabilityFilter || (bomAvailabilityFilter === 'available' ? sub.is_available : !sub.is_available);
    return matchesSearch && matchesAvail;
  });

  const filteredMaterials = (lookupResult?.materials || []).filter((m) => {
    const matchesSearch = !bomSearch || m.name?.toLowerCase().includes(bomSearch.toLowerCase()) || m.sku?.toLowerCase().includes(bomSearch.toLowerCase());
    const matchesAvail = !bomAvailabilityFilter || (bomAvailabilityFilter === 'available' ? m.is_available : !m.is_available);
    return matchesSearch && matchesAvail;
  });

  const subAssembliesPagination = usePagination(filteredSubAssemblies, 10);
  const materialsPagination = usePagination(filteredMaterials, 10);

  // Requisition
  const [requisitionRemarks, setRequisitionRemarks] = useState('');
  const [reqSubmitting, setReqSubmitting] = useState(false);

  // Launch Work order
  const [operatorName, setOperatorName] = useState('Production Line Tech A');
  const [launchingWO, setLaunchingWO] = useState(false);

  const loadBaseData = async () => {
    setLoading(true);
    try {
      const [poRes, woRes, reqRes] = await Promise.all([
        api.getPurchaseOrders(),
        api.getWorkOrders(),
        api.getRequisitions()
      ]);
      setPurchaseOrders(poRes.data || []);
      setWorkOrders(woRes.data || []);
      setRequisitions(reqRes.data || []);
    } catch (err) {
      alert('Failed to load manufacturing data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    if (initialPO?.id) {
      setSelectedPOId(initialPO.id);
      setSubTab('lookup');
      handleCheckMaterials(initialPO.id);
    }
  }, [initialPO]);

  useEffect(() => {
    if (!initialPO?.id) {
      setSubTab(mode === 'mrp' ? 'lookup' : 'work_orders');
    }
  }, [mode]);

  const handleSelectSubTab = (nextSubTab) => {
    setSubTab(nextSubTab);
    if (onNavigateTab) {
      const targetMode = nextSubTab === 'work_orders' ? 'manufacturing' : 'mrp';
      if (targetMode !== mode) {
        onNavigateTab(targetMode);
      }
    }
  };

  const handleCheckMaterials = async (poId) => {
    const idToUse = poId || selectedPOId;
    if (!idToUse) return;
    setLookupLoading(true);
    try {
      const res = await api.checkMaterials({ po_id: idToUse });
      setLookupResult(res.data);
    } catch (err) {
      alert('Material lookup failed: ' + err.message);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleRaiseRequisition = async () => {
    if (!lookupResult || !selectedPOId) return;
    setReqSubmitting(true);
    try {
      const shortfallMaterials = (lookupResult.materials || [])
        .filter(m => m.shortfall > 0)
        .map(m => ({
          item_type: 'raw_material',
          raw_material_id: m.raw_material_id,
          shortfall_qty: m.shortfall,
          total_required: m.total_required,
          current_stock: m.current_stock,
          unit_cost: m.unit_cost,
          shortfall_cost: m.shortfall_cost
        }));

      const shortfallSubs = (lookupResult.sub_assemblies || [])
        .filter(s => s.shortfall > 0)
        .map(s => ({
          item_type: 'sub_product',
          sub_product_id: s.sub_product_id,
          shortfall_qty: s.shortfall,
          total_required: s.total_required,
          current_stock: s.current_stock,
          unit_cost: s.unit_cost,
          shortfall_cost: s.shortfall_cost
        }));

      const allShortfall = [...shortfallSubs, ...shortfallMaterials];

      if (allShortfall.length === 0) {
        alert('All sub-assemblies and raw materials are already in stock!');
        return;
      }

      await api.createRequisition({
        po_id: selectedPOId,
        items: allShortfall,
        remarks: requisitionRemarks || 'Sub-products & material shortfall requested for production fulfillment'
      });
      alert('Material & Sub-Product Purchase Requisition forwarded to Accounts team!');
      setSubTab('requisitions');
      loadBaseData();
    } catch (err) {
      alert('Requisition failed: ' + err.message);
    } finally {
      setReqSubmitting(false);
    }
  };

  const handleFulfillRequisition = async (reqId) => {
    if (!window.confirm('Fulfill this material requisition and replenish warehouse stock?')) return;
    try {
      await api.fulfillRequisition(reqId);
      alert('Materials received into inventory stock!');
      loadBaseData();
      if (selectedPOId) handleCheckMaterials(selectedPOId);
    } catch (err) {
      alert('Fulfillment failed: ' + err.message);
    }
  };

  const handleStartWorkOrder = async () => {
    if (!selectedPOId || !lookupResult) return;
    setLaunchingWO(true);
    try {
      const poDetails = await api.getPurchaseOrder(selectedPOId);
      const firstItem = poDetails.data?.items?.[0];
      if (!firstItem) {
        alert('No items found in selected PO');
        setLaunchingWO(false);
        return;
      }

      const res = await api.startWorkOrder({
        po_id: selectedPOId,
        product_id: firstItem.product_id,
        target_quantity: firstItem.quantity,
        operator_name: operatorName
      });

      alert(res.message);
      setSubTab('work_orders');
      loadBaseData();
      onViewWorkOrder(res.data?.id);
    } catch (err) {
      alert('Failed to launch manufacturing: ' + err.message);
    } finally {
      setLaunchingWO(false);
    }
  };

  return (
    <div className="space-y-3.5">
      
      {/* Header (ShadCN style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">
              {mode === 'mrp'
                ? 'Stage 7: BOM Inventory Check & Material Requisitions'
                : 'Stage 8: 5-Level Manufacturing & Work Orders'}
            </h1>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              {mode === 'mrp' ? 'Inventory & MRP' : 'Floor Operations'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {mode === 'mrp'
              ? 'Explode Purchase Order BOMs against warehouse stock and raise shortfall material requisitions.'
              : 'Track active 5-level production work orders, operator assignments, and floor progress.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAudit && (
            <button
              onClick={() => onOpenAudit(mode === 'mrp' ? 'inventory' : 'manufacturing')}
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
            >
              <History className="h-3.5 w-3.5" /> {mode === 'mrp' ? 'MRP Audit Trail' : 'Floor Audit Trail'}
            </button>
          )}

          {/* Subtabs */}
          <div className="flex bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs">
            <button
              onClick={() => handleSelectSubTab('lookup')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                subTab === 'lookup' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              BOM Check
            </button>
            <button
              onClick={() => handleSelectSubTab('requisitions')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                subTab === 'requisitions' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Requisitions ({requisitions.length})
            </button>
            <button
              onClick={() => handleSelectSubTab('work_orders')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                subTab === 'work_orders' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Work Orders ({workOrders.length})
            </button>
          </div>
        </div>
      </div>

      {/* SUBTAB 1: BOM LOOKUP */}
      {subTab === 'lookup' && (
        <div className="space-y-3.5">
          <div className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Select Purchase Order to Run Inventory Check:
              </label>
              <select
                value={selectedPOId}
                onChange={(e) => {
                  setSelectedPOId(e.target.value);
                  handleCheckMaterials(e.target.value);
                }}
                className="w-full p-2 border border-slate-200 rounded-md text-xs font-medium focus:ring-1 focus:ring-slate-900"
              >
                <option value="">-- Choose Purchase Order --</option>
                {purchaseOrders.map((po) => (
                  <option key={po.id} value={po.id}>{po.po_number}: {po.customer_name} (Ref: {po.customer_po_reference})</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => handleCheckMaterials()}
              disabled={!selectedPOId || lookupLoading}
              className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium text-xs shadow-xs flex items-center justify-center gap-1.5 self-end sm:self-auto disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${lookupLoading ? 'animate-spin' : ''}`} /> Run Check
            </button>
          </div>

          {lookupLoading ? (
            <div className="bg-white p-6 text-center text-xs text-slate-500 rounded-lg border border-slate-200">
              Checking warehouse stock...
            </div>
          ) : lookupResult ? (
            <div className="space-y-3.5">
              {/* Status Banner (Compact ShadCN style) */}
              <div className={`p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                lookupResult.material_status === 'full'
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                  : (lookupResult.material_status === 'partial'
                      ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900')
              }`}>
                <div className="flex items-center gap-2.5">
                  {lookupResult.material_status === 'full' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                  )}
                  <div>
                    <h3 className="text-xs font-bold">
                      {lookupResult.material_status === 'full' && 'Fully Available in Warehouse — Eligible to Start Manufacturing!'}
                      {lookupResult.material_status === 'partial' && 'Partially Available — Sub-Product or Material Shortfall Detected'}
                      {lookupResult.material_status === 'not_found' && 'Not Found in Inventory — Full Procurement Required'}
                    </h3>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      {lookupResult.total_sub_assemblies_count > 0 && (
                        <span className="mr-2">
                          <strong>Sub-Products:</strong> {lookupResult.available_sub_assemblies_count} of {lookupResult.total_sub_assemblies_count} ready.
                        </span>
                      )}
                      <span>
                        <strong>Raw Materials:</strong> {lookupResult.available_materials_count} of {lookupResult.total_materials_count} in stock.
                      </span>
                      {lookupResult.total_shortfall_cost > 0 && (
                        <span className="ml-2 font-semibold">
                          Total Shortfall Cost: ₹{Number(lookupResult.total_shortfall_cost).toLocaleString()}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {lookupResult.is_eligible_for_manufacturing && hasPermission(currentUser, 'manufacturing', 'start') && (
                  <button
                    onClick={handleStartWorkOrder}
                    disabled={launchingWO}
                    className="h-8 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-semibold text-xs shadow-xs flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    {launchingWO ? 'Starting...' : 'Start 5-Stage Work Order'}
                  </button>
                )}
              </div>

              {/* SECTION 1: SUB-PRODUCTS / SUB-ASSEMBLIES (Multi-Level BOM) */}
              {lookupResult.sub_assemblies && lookupResult.sub_assemblies.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-indigo-600"></span>
                      <h4 className="text-xs font-semibold text-slate-900 tracking-tight">
                        Required Sub-Products & Component Assemblies
                      </h4>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Multi-Level BOM ({lookupResult.sub_assemblies.length} Sub-Products)
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder="Filter BOM..."
                        value={bomSearch}
                        onChange={(e) => setBomSearch(e.target.value)}
                        className="h-7 px-2 text-xs bg-white border border-slate-200 rounded-md"
                      />
                      <select
                        value={bomAvailabilityFilter}
                        onChange={(e) => setBomAvailabilityFilter(e.target.value)}
                        className="h-7 px-2 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
                      >
                        <option value="">All Status</option>
                        <option value="available">Ready / Available</option>
                        <option value="shortage">Shortage</option>
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          exportToCsv(
                            'bom_sub_assemblies',
                            [
                              { header: 'Name', accessor: 'name' },
                              { header: 'SKU', accessor: 'sku' },
                              { header: 'Category', accessor: 'category' },
                              { header: 'Required', accessor: (s) => `${s.total_required} ${s.uom}` },
                              { header: 'In Stock', accessor: (s) => `${s.current_stock} ${s.uom}` },
                              { header: 'Shortfall', accessor: (s) => `${s.shortfall} ${s.uom}` },
                              { header: 'Unit Cost', accessor: 'unit_cost' },
                              { header: 'Shortfall Cost', accessor: 'shortfall_cost' }
                            ],
                            filteredSubAssemblies
                          )
                        }
                        className="h-7 px-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1"
                      >
                        <Download className="h-3 w-3" /> Export
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border border-indigo-100 shadow-xs overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-indigo-50/60 text-slate-700 font-semibold border-b border-indigo-100">
                        <tr>
                          <th className="px-3 py-2 w-10 text-center">#</th>
                          <th className="px-3.5 py-2">Sub-Product / Component Name</th>
                          <th className="px-3.5 py-2">Module Role / Spec</th>
                          <th className="px-3.5 py-2 text-center">Required</th>
                          <th className="px-3.5 py-2 text-center">In Stock</th>
                          <th className="px-3.5 py-2 text-center">Shortfall</th>
                          <th className="px-3.5 py-2 text-right">Unit Cost</th>
                          <th className="px-3.5 py-2 text-right">Shortfall Cost</th>
                          <th className="px-3.5 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-indigo-50">
                        {subAssembliesPagination.paginatedItems.map((sub, idx) => (
                          <tr key={sub.sub_product_id} className="hover:bg-indigo-50/20">
                            <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">
                              {subAssembliesPagination.startIndex + idx + 1}
                            </td>
                            <td className="px-3.5 py-2">
                              <p className="font-semibold text-slate-900">{sub.name}</p>
                              <span className="font-mono text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                                {sub.sku}
                              </span>
                            </td>
                            <td className="px-3.5 py-2 text-slate-600">
                              <p className="text-[11px] font-medium text-slate-800">{sub.category}</p>
                              <p className="text-[10px] text-slate-400">{sub.notes || 'Modular Sub-Assembly'}</p>
                            </td>
                            <td className="px-3.5 py-2 text-center font-medium text-slate-800">{sub.total_required} {sub.uom}</td>
                            <td className="px-3.5 py-2 text-center font-medium text-slate-700">{sub.current_stock} {sub.uom}</td>
                            <td className="px-3.5 py-2 text-center">
                              {sub.shortfall > 0 ? (
                                <span className="font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 text-[10px]">
                                  -{sub.shortfall} {sub.uom}
                                </span>
                              ) : (
                                <span className="text-emerald-700 font-semibold text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  Sufficient
                                </span>
                              )}
                            </td>
                            <td className="px-3.5 py-2 text-right text-slate-600">₹{Number(sub.unit_cost).toLocaleString()}</td>
                            <td className="px-3.5 py-2 text-right font-semibold text-slate-900">
                              {sub.shortfall > 0 ? `₹${Number(sub.shortfall_cost).toLocaleString()}` : '—'}
                            </td>
                            <td className="px-3.5 py-2 text-center">
                              {sub.is_available ? (
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  Ready in Stock
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                  Shortage
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Pagination
                      currentPage={subAssembliesPagination.currentPage}
                      totalPages={subAssembliesPagination.totalPages}
                      totalItems={subAssembliesPagination.totalItems}
                      pageSize={subAssembliesPagination.pageSize}
                      onPageChange={subAssembliesPagination.setCurrentPage}
                    />
                  </div>
                </div>
              )}

              {/* SECTION 2: RAW MATERIALS & HARDWARE */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-slate-700"></span>
                    <h4 className="text-xs font-semibold text-slate-900 tracking-tight">
                      Raw Materials, Consumables & Packaging Items
                    </h4>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      Inventory Items ({lookupResult.materials?.length || 0})
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium flex items-center gap-2">
                    {lookupResult.available_materials_count} of {lookupResult.total_materials_count} materials available
                    <button
                      type="button"
                      onClick={() =>
                        exportToCsv(
                          'bom_raw_materials',
                          [
                            { header: 'Name', accessor: 'name' },
                            { header: 'SKU', accessor: 'sku' },
                            { header: 'Required', accessor: (m) => `${m.total_required} ${m.uom}` },
                            { header: 'In Stock', accessor: (m) => `${m.current_stock} ${m.uom}` },
                            { header: 'Shortfall', accessor: (m) => `${m.shortfall} ${m.uom}` },
                            { header: 'Unit Cost', accessor: 'unit_cost' },
                            { header: 'Shortfall Cost', accessor: 'shortfall_cost' }
                          ],
                          filteredMaterials
                        )
                      }
                      className="h-7 px-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1"
                    >
                      <Download className="h-3 w-3" /> Export
                    </button>
                  </span>
                </div>

                <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 w-10 text-center">#</th>
                        <th className="px-3.5 py-2">Material SKU & Name</th>
                        <th className="px-3.5 py-2 text-center">Required</th>
                        <th className="px-3.5 py-2 text-center">In Stock</th>
                        <th className="px-3.5 py-2 text-center">Shortfall</th>
                        <th className="px-3.5 py-2 text-right">Unit Cost</th>
                        <th className="px-3.5 py-2 text-right">Shortfall Cost</th>
                        <th className="px-3.5 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {materialsPagination.paginatedItems.map((m, idx) => (
                        <tr key={m.raw_material_id} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">
                            {materialsPagination.startIndex + idx + 1}
                          </td>
                          <td className="px-3.5 py-2">
                            <p className="font-semibold text-slate-900">{m.name}</p>
                            <span className="font-mono text-[10px] text-slate-400">{m.sku}</span>
                          </td>
                          <td className="px-3.5 py-2 text-center font-medium">{m.total_required} {m.uom}</td>
                          <td className="px-3.5 py-2 text-center text-slate-600">{m.current_stock} {m.uom}</td>
                          <td className="px-3.5 py-2 text-center">
                            {m.shortfall > 0 ? (
                              <span className="font-bold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 text-[10px]">
                                -{m.shortfall} {m.uom}
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-medium text-[11px]">Sufficient</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2 text-right text-slate-600">₹{Number(m.unit_cost).toLocaleString()}</td>
                          <td className="px-3.5 py-2 text-right font-semibold text-slate-900">
                            {m.shortfall > 0 ? `₹${Number(m.shortfall_cost).toLocaleString()}` : '—'}
                          </td>
                          <td className="px-3.5 py-2 text-center">
                            {m.is_available ? (
                              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Available</span>
                            ) : (
                              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Shortage</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination
                    currentPage={materialsPagination.currentPage}
                    totalPages={materialsPagination.totalPages}
                    totalItems={materialsPagination.totalItems}
                    pageSize={materialsPagination.pageSize}
                    onPageChange={materialsPagination.setCurrentPage}
                  />
                </div>
              </div>

              {/* Shortfall action */}
              {!lookupResult.is_eligible_for_manufacturing && hasPermission(currentUser, 'inventory', 'requisition') && (
                <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 flex flex-col sm:flex-row items-center gap-2.5">
                  <input
                    type="text"
                    placeholder="Urgent procurement remarks for Accounts team..."
                    value={requisitionRemarks}
                    onChange={(e) => setRequisitionRemarks(e.target.value)}
                    className="flex-1 p-1.5 text-xs bg-white border border-amber-200 rounded-md"
                  />
                  <button
                    onClick={handleRaiseRequisition}
                    disabled={reqSubmitting}
                    className="h-8 px-3.5 bg-amber-600 hover:bg-amber-500 text-white rounded-md font-medium text-xs whitespace-nowrap"
                  >
                    {reqSubmitting ? 'Sending...' : 'Send Requisition to Accounts'}
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* SUBTAB 2: REQUISITIONS */}
      {subTab === 'requisitions' && (
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden divide-y divide-slate-100">
          {requisitions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No active material requisitions.</div>
          ) : (
            requisitions.map((req) => (
              <div key={req.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                      {req.requisition_number}
                    </span>
                    <span className="font-semibold text-slate-900 text-xs">{req.po_number} ({req.customer_name})</span>
                    <span className="text-[10px] text-slate-400">by {req.requested_by_name || 'Production'}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Est. Shortfall Cost: ₹{Number(req.total_estimated_cost).toLocaleString()} {req.remarks ? `• ${req.remarks}` : ''}
                  </p>

                  {/* Items Breakdown badges */}
                  {req.items && req.items.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {req.items.map((it, idx) => {
                        const isSub = it.item_type === 'sub_product' || !!it.sub_product_name;
                        return (
                          <span
                            key={idx}
                            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border font-medium ${
                              isSub
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${isSub ? 'bg-indigo-500' : 'bg-slate-400'}`}></span>
                            <span className="font-semibold">{isSub ? 'Sub-Product' : 'Material'}:</span>
                            {it.item_name || it.sub_product_name || it.raw_material_name} (+{it.shortfall_qty} {it.item_uom || it.uom})
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {req.status === 'pending_purchase' ? (
                    (currentUser?.role_id === 1 || currentUser?.role_slug === 'accounts' || currentUser?.role_slug === 'admin') && (
                      <button
                        onClick={() => handleFulfillRequisition(req.id)}
                        className="h-7 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[11px] font-medium"
                      >
                        Procure & Receive Stock
                      </button>
                    )
                  ) : (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Fulfilled in Stock
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* SUBTAB 3: WORK ORDERS */}
      {subTab === 'work_orders' && (
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden divide-y divide-slate-100">
          {workOrders.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No work orders launched yet.</div>
          ) : (
            workOrders.map((wo) => (
              <div key={wo.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                      {wo.work_order_number}
                    </span>
                    <span className="font-semibold text-slate-900 text-xs">{wo.product_name}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    PO: {wo.po_number} • Target: {wo.target_quantity} {wo.uom}
                  </p>
                </div>

                {/* 5 Levels indicator */}
                <div className="flex items-center space-x-1">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <div
                      key={lvl}
                      className={`h-5 w-5 rounded text-[10px] font-bold flex items-center justify-center ${
                        lvl < wo.current_level || wo.status === 'completed'
                          ? 'bg-emerald-600 text-white'
                          : (lvl === wo.current_level && wo.status === 'in_progress' ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-400')
                      }`}
                    >
                      L{lvl}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase text-slate-700">
                    {wo.status?.replace('_', ' ')}
                  </span>
                  <button
                    onClick={() => onViewWorkOrder(wo.id)}
                    className="h-7 px-2.5 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md text-[11px] font-medium flex items-center gap-1"
                  >
                    View Stages <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

    </div>
  );
}
