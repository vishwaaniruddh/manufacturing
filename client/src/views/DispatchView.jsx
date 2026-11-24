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
  History,
  Download
} from 'lucide-react';
import { hasPermission } from '../utils/rbac';
import Pagination, { usePagination } from '../components/Pagination';
import { MediaUploader, MediaGallery } from '../components/MediaUploader';
import { exportToCsv } from '../utils/exportCsv';

export default function DispatchView({ currentUser, preselectedWorkOrder, onCustomerInspect, onOpenAudit }) {
  const [dispatches, setDispatches] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [completedWorkOrders, setCompletedWorkOrders] = useState([]);
  const [dispatchMediaMap, setDispatchMediaMap] = useState({});
  const [dispatchMediaFiles, setDispatchMediaFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filteredDispatches = dispatches.filter((d) => {
    const matchesStatus = !statusFilter || d.status === statusFilter;
    const s = searchQuery.toLowerCase();
    const matchesSearch =
      !s ||
      d.dispatch_number?.toLowerCase().includes(s) ||
      d.delivery_challan_no?.toLowerCase().includes(s) ||
      d.customer_name?.toLowerCase().includes(s) ||
      d.tracking_number?.toLowerCase().includes(s) ||
      d.lr_number?.toLowerCase().includes(s);
    return matchesStatus && matchesSearch;
  });

  const dispatchPagination = usePagination(filteredDispatches, 10);

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deliverModalDispatch, setDeliverModalDispatch] = useState(null);
  const [deliverForm, setDeliverForm] = useState({
    actual_delivery_date: new Date().toISOString().split('T')[0],
    lr_number: '',
    received_by: '',
    delivery_remarks: ''
  });
  const [podFiles, setPodFiles] = useState([]);
  const [challanFiles, setChallanFiles] = useState([]);
  const [lrFiles, setLrFiles] = useState([]);
  const [submittingDelivery, setSubmittingDelivery] = useState(false);
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
      const [dRes, cRes, woRes, mRes] = await Promise.all([
        api.getDispatches(),
        api.getCouriers(),
        api.getWorkOrders(),
        api.getMedia('dispatch')
      ]);
      setDispatches(dRes.data || []);
      setCouriers(cRes.data || []);
      setCompletedWorkOrders((woRes.data || []).filter(w => w.status === 'completed'));
      const grouped = {};
      (mRes.data || []).forEach((m) => {
        grouped[m.entity_id] = grouped[m.entity_id] || [];
        grouped[m.entity_id].push(m);
      });
      setDispatchMediaMap(grouped);
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
      const dispRes = await api.createDispatch(newDispatch);
      const createdDispId = dispRes.data?.id;
      if (dispatchMediaFiles.length > 0 && createdDispId) {
        await api.uploadMedia('dispatch', createdDispId, dispatchMediaFiles, currentUser?.id || 1);
      }
      setDispatchMediaFiles([]);
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

  const openDeliverModal = (dispatch) => {
    setDeliverModalDispatch(dispatch);
    setDeliverForm({
      actual_delivery_date: new Date().toISOString().split('T')[0],
      lr_number: dispatch.lr_number || '',
      received_by: dispatch.received_by || '',
      delivery_remarks: dispatch.delivery_remarks || ''
    });
    setPodFiles([]);
    setChallanFiles([]);
    setLrFiles([]);
  };

  const handleConfirmDelivery = async (e) => {
    e.preventDefault();
    if (!deliverModalDispatch) return;
    if (podFiles.length === 0) {
      alert('Please upload at least one Proof of Delivery (POD) file.');
      return;
    }

    setSubmittingDelivery(true);
    try {
      const userId = currentUser?.id || 1;
      const dispId = deliverModalDispatch.id;

      await api.uploadMedia('dispatch', dispId, podFiles, userId, 'POD');
      if (challanFiles.length > 0) {
        await api.uploadMedia('dispatch', dispId, challanFiles, userId, 'Challan');
      }
      if (lrFiles.length > 0) {
        await api.uploadMedia('dispatch', dispId, lrFiles, userId, 'LR Copy');
      }

      await api.updateDispatchStatus(dispId, 'delivered', deliverForm);
      setDeliverModalDispatch(null);
      setPodFiles([]);
      setChallanFiles([]);
      setLrFiles([]);
      loadData();
    } catch (err) {
      alert('Failed to mark dispatch as delivered: ' + err.message);
    } finally {
      setSubmittingDelivery(false);
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

      {/* Filter & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search dispatch #, challan, LR, customer, tracking..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-slate-900"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
          >
            <option value="">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="dispatched">Dispatched</option>
            <option value="in_transit">In Transit</option>
            <option value="delivered">Delivered</option>
          </select>
          <button
            type="button"
            onClick={() =>
              exportToCsv(
                'dispatches',
                [
                  { header: 'Dispatch #', accessor: 'dispatch_number' },
                  { header: 'Challan #', accessor: 'delivery_challan_no' },
                  { header: 'LR #', accessor: 'lr_number' },
                  { header: 'Customer', accessor: 'customer_name' },
                  { header: 'Product', accessor: 'product_name' },
                  { header: 'Packages', accessor: 'total_packages' },
                  { header: 'Courier', accessor: 'courier_name' },
                  { header: 'Tracking #', accessor: 'tracking_number' },
                  { header: 'Status', accessor: 'status' }
                ],
                filteredDispatches
              )
            }
            title="Export filtered dispatches"
            className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Table (Compact ShadCN style) */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading dispatches...</div>
        ) : filteredDispatches.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No dispatches created yet.
          </div>
        ) : (
          <>
            <div className="px-3.5 py-2 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
              <span>Total Records: <strong className="text-slate-800">{filteredDispatches.length}</strong></span>
              <span>Page {dispatchPagination.currentPage} of {dispatchPagination.totalPages}</span>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="px-3 py-2 w-10 text-center">#</th>
                  <th className="px-3.5 py-2">Dispatch # & Challan</th>
                  <th className="px-3.5 py-2">Customer</th>
                  <th className="px-3.5 py-2">Product</th>
                  <th className="px-3.5 py-2">Carrier & Tracking</th>
                  <th className="px-3.5 py-2">Evidence</th>
                  <th className="px-3.5 py-2">Status</th>
                  <th className="px-3.5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dispatchPagination.paginatedItems.map((d, idx) => (
                  <tr key={d.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">
                      {dispatchPagination.startIndex + idx + 1}
                    </td>
                    
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
                      {d.lr_number && (
                        <p className="font-mono text-[10px] text-sky-700">LR: {d.lr_number}</p>
                      )}
                    </td>

                    <td className="px-3.5 py-2">
                      <MediaGallery attachments={dispatchMediaMap[d.id] || []} />
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
                            type="button"
                            onClick={() => openDeliverModal(d)}
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
          </>
        )}
        {!loading && (
          <Pagination
            currentPage={dispatchPagination.currentPage}
            totalPages={dispatchPagination.totalPages}
            totalItems={dispatchPagination.totalItems}
            pageSize={dispatchPagination.pageSize}
            onPageChange={dispatchPagination.setCurrentPage}
          />
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

              <MediaUploader
                files={dispatchMediaFiles}
                onChange={setDispatchMediaFiles}
                label="Packaging / Challan / Dispatch Evidence (Optional)"
              />

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

      {/* MARK DELIVERED & UPLOAD PROOF MODAL */}
      {deliverModalDispatch && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-lg w-full p-4 shadow-lg border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Confirm Delivery &amp; Upload Documents</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  <span className="font-mono font-semibold text-slate-700">{deliverModalDispatch.dispatch_number}</span>
                  {' • '}Challan: <span className="font-mono">{deliverModalDispatch.delivery_challan_no}</span>
                  {' • '}{deliverModalDispatch.customer_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeliverModalDispatch(null)}
                className="text-slate-400 hover:text-slate-600 text-xs px-1.5 py-0.5"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmDelivery} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Delivery Date *</label>
                  <input
                    type="date"
                    required
                    value={deliverForm.actual_delivery_date}
                    onChange={(e) => setDeliverForm({ ...deliverForm, actual_delivery_date: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">LR / Bilty Number</label>
                  <input
                    type="text"
                    placeholder="e.g. LR-2026-8842"
                    value={deliverForm.lr_number}
                    onChange={(e) => setDeliverForm({ ...deliverForm, lr_number: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs font-mono focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Received By</label>
                  <input
                    type="text"
                    placeholder="Receiver name"
                    value={deliverForm.received_by}
                    onChange={(e) => setDeliverForm({ ...deliverForm, received_by: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-md bg-emerald-50/50 border border-emerald-200/80 space-y-2.5">
                <MediaUploader
                  files={podFiles}
                  onChange={setPodFiles}
                  label="1. Proof of Delivery (POD) * (Signed slip / photo)"
                />
                <MediaUploader
                  files={challanFiles}
                  onChange={setChallanFiles}
                  label="2. Delivery Challan Copy (Signed / stamped)"
                />
                <MediaUploader
                  files={lrFiles}
                  onChange={setLrFiles}
                  label="3. LR (Lorry Receipt) Copy"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Delivery Remarks</label>
                <textarea
                  rows={2}
                  placeholder="Optional condition notes or handoff details..."
                  value={deliverForm.delivery_remarks}
                  onChange={(e) => setDeliverForm({ ...deliverForm, delivery_remarks: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={submittingDelivery}
                  onClick={() => setDeliverModalDispatch(null)}
                  className="h-8 px-3 border border-slate-200 text-slate-600 rounded-md font-medium text-xs hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDelivery}
                  className="h-8 px-4 bg-emerald-600 text-white rounded-md font-medium text-xs hover:bg-emerald-500 disabled:opacity-50"
                >
                  {submittingDelivery ? 'Uploading & Saving...' : 'Confirm Delivered'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
