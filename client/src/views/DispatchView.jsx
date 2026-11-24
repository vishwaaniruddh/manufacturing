// client/src/views/DispatchView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  Truck, 
  Plus, 
  Search, 
  CheckCircle2, 
  Clock, 
  ExternalLink,
  ArrowRight,
  PackageCheck,
  History
} from 'lucide-react';
import { hasPermission } from '../utils/rbac';

export default function DispatchView({ currentUser, preselectedWorkOrder, onCustomerInspect, onOpenAudit }) {
  const [dispatches, setDispatches] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [completedWorkOrders, setCompletedWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDispatch, setNewDispatch] = useState({
    work_order_id: '',
    courier_id: '',
    tracking_number: '',
    dispatch_date: new Date().toISOString().split('T')[0],
    estimated_delivery_date: '',
    total_packages: 1,
    delivery_challan_no: '',
    vehicle_no: '',
    remarks: 'Industrial packaging with corner buffers and shrink wrap'
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [dRes, cRes, woRes] = await Promise.all([
        api.getDispatches(),
        api.getCouriers(),
        api.getWorkOrders()
      ]);
      setDispatches(dRes.data || []);
      setCouriers(cRes.data || []);
      setCompletedWorkOrders((woRes.data || []).filter(w => w.status === 'completed'));
    } catch (err) {
      alert('Error fetching dispatch data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (preselectedWorkOrder && preselectedWorkOrder.status === 'completed') {
      setNewDispatch(prev => ({
        ...prev,
        work_order_id: preselectedWorkOrder.id,
        tracking_number: `TRK-${Math.floor(10000000 + Math.random() * 90000000)}`,
        delivery_challan_no: `DC/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`
      }));
      setShowCreateModal(true);
    }
  }, [preselectedWorkOrder]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!newDispatch.work_order_id || !newDispatch.courier_id || !newDispatch.tracking_number) {
      alert('Please select a completed work order, courier partner, and tracking number.');
      return;
    }

    try {
      await api.createDispatch(newDispatch);
      setShowCreateModal(false);
      setNewDispatch({
        work_order_id: '',
        courier_id: '',
        tracking_number: '',
        dispatch_date: new Date().toISOString().split('T')[0],
        estimated_delivery_date: '',
        total_packages: 1,
        delivery_challan_no: '',
        vehicle_no: '',
        remarks: 'Industrial packaging with corner buffers and shrink wrap'
      });
      loadData();
    } catch (err) {
      alert('Failed to create dispatch: ' + err.message);
    }
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      await api.updateDispatchStatus(id, status);
      loadData();
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    }
  };

  return (
    <div className="space-y-3.5">
      
      {/* Header (ShadCN style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">
              Stage 10: Dispatch & Logistics Management
            </h1>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              Logistics
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Delivery Challan preparation, courier carrier tracking, and shipping management.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAudit && (
            <button
              onClick={() => onOpenAudit('dispatch')}
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
            >
              <History className="h-3.5 w-3.5" /> Dispatch Audit
            </button>
          )}

          {hasPermission(currentUser, 'dispatch', 'manage') && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Create Dispatch
            </button>
          )}
        </div>
      </div>

      {/* Table (Compact ShadCN style) */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading dispatches...</div>
        ) : dispatches.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No dispatches created yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="px-3.5 py-2">Dispatch # & Challan</th>
                  <th className="px-3.5 py-2">Customer</th>
                  <th className="px-3.5 py-2">Product</th>
                  <th className="px-3.5 py-2">Carrier & Tracking</th>
                  <th className="px-3.5 py-2">Status</th>
                  <th className="px-3.5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dispatches.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/60 transition-colors">
                    
                    <td className="px-3.5 py-2 whitespace-nowrap">
                      <span className="font-mono text-[11px] font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                        {d.dispatch_number}
                      </span>
                      <p className="text-[10px] text-slate-500 mt-0.5">Challan: {d.delivery_challan_no}</p>
                    </td>

                    <td className="px-3.5 py-2">
                      <p className="font-semibold text-slate-900">{d.customer_name}</p>
                      <p className="text-[10px] text-slate-400 truncate max-w-xs">{d.delivery_address}</p>
                    </td>

                    <td className="px-3.5 py-2 whitespace-nowrap">
                      <p className="font-medium text-slate-800">{d.product_name}</p>
                      <span className="text-[10px] text-slate-400">{d.total_packages} Package(s)</span>
                    </td>

                    <td className="px-3.5 py-2 whitespace-nowrap">
                      <span className="font-semibold text-slate-800">{d.courier_name}</span>
                      <p className="font-mono text-[10px] text-slate-600">{d.tracking_number}</p>
                    </td>

                    <td className="px-3.5 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border ${
                        d.status === 'delivered'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : (d.status === 'in_transit' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-slate-100 text-slate-700 border-slate-200')
                      }`}>
                        {d.status?.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="px-3.5 py-2 text-right space-x-1 whitespace-nowrap">
                      {d.status !== 'delivered' && hasPermission(currentUser, 'dispatch', 'manage') && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus(d.id, 'in_transit')}
                            className="h-6 px-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-[10px] font-medium"
                          >
                            In Transit
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(d.id, 'delivered')}
                            className="h-6 px-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-medium"
                          >
                            Delivered
                          </button>
                        </>
                      )}

                      {/* Customer inward check trigger */}
                      {hasPermission(currentUser, 'customer_portal') && (
                        <button
                          onClick={() => onCustomerInspect(d)}
                          className="h-6 px-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-[10px] font-medium inline-flex items-center gap-1"
                        >
                          <PackageCheck className="h-3 w-3" /> Client QC <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE DISPATCH MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-sm w-full p-4 shadow-lg border border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900 mb-0.5">Create Dispatch Shipment</h2>
            <p className="text-xs text-slate-500 mb-3">Assign carrier logistics to completed products.</p>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Completed Work Order *</label>
                <select
                  required
                  value={newDispatch.work_order_id}
                  onChange={(e) => setNewDispatch({ ...newDispatch, work_order_id: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">-- Choose Completed Job --</option>
                  {completedWorkOrders.map((wo) => (
                    <option key={wo.id} value={wo.id}>{wo.work_order_number}: {wo.product_name} ({wo.completed_quantity} Units)</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Courier Carrier *</label>
                  <select
                    required
                    value={newDispatch.courier_id}
                    onChange={(e) => setNewDispatch({ ...newDispatch, courier_id: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs"
                  >
                    <option value="">-- Choose Courier --</option>
                    {couriers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tracking # *</label>
                  <input
                    type="text"
                    required
                    placeholder="AWB / Tracking #"
                    value={newDispatch.tracking_number}
                    onChange={(e) => setNewDispatch({ ...newDispatch, tracking_number: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Dispatch Date *</label>
                  <input
                    type="date"
                    required
                    value={newDispatch.dispatch_date}
                    onChange={(e) => setNewDispatch({ ...newDispatch, dispatch_date: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Total Packages</label>
                  <input
                    type="number"
                    min="1"
                    value={newDispatch.total_packages}
                    onChange={(e) => setNewDispatch({ ...newDispatch, total_packages: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs text-center"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="h-8 px-3 border border-slate-200 text-slate-600 rounded-md font-medium text-xs hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-8 px-4 bg-slate-900 text-white rounded-md font-medium text-xs hover:bg-slate-800"
                >
                  Save Dispatch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
