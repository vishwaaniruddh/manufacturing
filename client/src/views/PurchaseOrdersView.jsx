// client/src/views/PurchaseOrdersView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  FileCheck2, 
  Plus, 
  Search, 
  Boxes, 
  Receipt,
  Eye,
  History,
  ArrowRight,
  Download
} from 'lucide-react';
import { hasPermission } from '../utils/rbac';
import Pagination, { usePagination } from '../components/Pagination';
import { exportToCsv } from '../utils/exportCsv';

export default function PurchaseOrdersView({ currentUser, preselectedQuote, onCheckMaterials, onRecordPayment, onOpenAudit }) {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [approvedQuotations, setApprovedQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewPODetails, setViewPODetails] = useState(null);

  // Form
  const [newPO, setNewPO] = useState({
    quotation_id: '',
    customer_po_reference: '',
    po_date: new Date().toISOString().split('T')[0],
    delivery_deadline: '',
    payment_terms: '50% Advance on PO confirmation, 50% upon Level 5 QC & Dispatch',
    notes: '',
    attachment_url: ''
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [poRes, qRes] = await Promise.all([
        api.getPurchaseOrders(),
        api.getQuotations()
      ]);
      setPurchaseOrders(poRes.data || []);
      setApprovedQuotations((qRes.data || []).filter(q => q.status === 'approved'));
    } catch (err) {
      alert('Error fetching purchase orders: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (preselectedQuote && preselectedQuote.status === 'approved') {
      setNewPO(prev => ({
        ...prev,
        quotation_id: preselectedQuote.id,
        customer_po_reference: `CLIENT-PO-${Math.floor(1000 + Math.random() * 9000)}`
      }));
      setShowCreateModal(true);
    }
  }, [preselectedQuote]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!newPO.quotation_id || !newPO.customer_po_reference) {
      alert('Please select an approved quotation and enter the client Purchase Order number.');
      return;
    }
    try {
      await api.createPurchaseOrder(newPO);
      setShowCreateModal(false);
      setNewPO({
        quotation_id: '',
        customer_po_reference: '',
        po_date: new Date().toISOString().split('T')[0],
        delivery_deadline: '',
        payment_terms: '50% Advance on PO confirmation, 50% upon Level 5 QC & Dispatch',
        notes: '',
        attachment_url: ''
      });
      loadData();
    } catch (err) {
      alert('Failed to import purchase order: ' + err.message);
    }
  };

  const handleView = async (id) => {
    try {
      const res = await api.getPurchaseOrder(id);
      setViewPODetails(res.data);
    } catch (err) {
      alert('Failed to load PO details: ' + err.message);
    }
  };

  const filteredPOs = purchaseOrders.filter(po => {
    const matchesSearch =
      po.po_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.customer_po_reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.customer_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPayment = !paymentStatusFilter || po.payment_status === paymentStatusFilter;
    return matchesSearch && matchesPayment;
  });

  const poPagination = usePagination(filteredPOs, 10);

  return (
    <div className="space-y-3.5">
      
      {/* Header (ShadCN style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">
              Stage 4: Customer Purchase Orders (Sales PO)
            </h1>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              Contractual Order
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Confirmed customer purchase orders for production scheduling and payment collection.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAudit && (
            <button
              onClick={() => onOpenAudit('purchase_orders')}
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
            >
              <History className="h-3.5 w-3.5" /> PO Audit Trail
            </button>
          )}

          {hasPermission(currentUser, 'purchase_orders', 'create') && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Import Customer PO
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search PO #, client ref, or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={paymentStatusFilter}
            onChange={(e) => setPaymentStatusFilter(e.target.value)}
            className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
          >
            <option value="">All Payment Statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="fully_paid">Fully Paid</option>
          </select>
          <button
            type="button"
            onClick={() =>
              exportToCsv(
                'purchase_orders',
                [
                  { header: 'PO #', accessor: 'po_number' },
                  { header: 'Client Ref', accessor: 'customer_po_reference' },
                  { header: 'Customer', accessor: 'customer_name' },
                  { header: 'Order Total', accessor: 'total_amount' },
                  { header: 'Total Paid', accessor: 'total_paid' },
                  { header: 'Balance Due', accessor: 'balance_due' },
                  { header: 'Payment Status', accessor: 'payment_status' },
                  { header: 'Deadline', accessor: 'delivery_deadline' },
                  { header: 'Status', accessor: 'status' }
                ],
                filteredPOs
              )
            }
            title="Export filtered purchase orders"
            className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Table (Compact ShadCN style) */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading purchase orders...</div>
        ) : filteredPOs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No purchase orders recorded yet.
          </div>
        ) : (
          <>
            <div className="px-3.5 py-2 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
              <span>Total Records: <strong className="text-slate-800">{filteredPOs.length}</strong></span>
              <span>Page {poPagination.currentPage} of {poPagination.totalPages}</span>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="px-3 py-2.5 w-10 text-center">#</th>
                  <th className="px-3.5 py-2.5">PO # & Client Ref</th>
                  <th className="px-3.5 py-2.5">Customer</th>
                  <th className="px-3.5 py-2.5">Order Total</th>
                  <th className="px-3.5 py-2.5">Payment Status</th>
                  <th className="px-3.5 py-2.5">Deadline</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {poPagination.paginatedItems.map((po, idx) => (
                  <tr key={po.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">
                      {poPagination.startIndex + idx + 1}
                    </td>
                    
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className="font-mono text-[11px] font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                        {po.po_number}
                      </span>
                      <p className="text-[11px] font-medium text-slate-700 mt-0.5">
                        Ref: <span className="font-mono text-slate-500">{po.customer_po_reference}</span>
                      </p>
                    </td>

                    <td className="px-3.5 py-2.5">
                      <p className="font-semibold text-slate-900">{po.customer_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono truncate">{po.customer_email}</p>
                    </td>

                    <td className="px-3.5 py-2.5 font-bold text-slate-900 whitespace-nowrap">
                      ₹{Number(po.total_amount).toLocaleString()}
                    </td>

                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-emerald-600">
                          ₹{Number(po.total_paid).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          / Due: ₹{Number(po.balance_due).toLocaleString()}
                        </span>
                      </div>
                      <span className={`text-[10px] font-semibold uppercase ${
                        po.payment_status === 'fully_paid' ? 'text-emerald-700' : (po.payment_status === 'partially_paid' ? 'text-amber-700' : 'text-slate-400')
                      }`}>
                        {po.payment_status?.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className="font-medium text-slate-700">{po.delivery_deadline}</span>
                      <p className="text-[10px] text-slate-400">PO Date: {po.po_date}</p>
                    </td>

                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border ${
                        po.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : (po.status === 'in_production' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-slate-100 text-slate-700 border-slate-200')
                      }`}>
                        {po.status?.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="px-3.5 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => handleView(po.id)}
                        className="h-7 px-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-md text-[11px] font-medium"
                      >
                        <Eye className="h-3 w-3 inline mr-1" /> View
                      </button>

                      {hasPermission(currentUser, 'payments', 'create') && (
                        <button
                          onClick={() => onRecordPayment(po)}
                          className="h-7 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md font-medium text-[11px] inline-flex items-center gap-1"
                        >
                          <Receipt className="h-3 w-3" /> Pay
                        </button>
                      )}

                      {/* Only Production / Inventory / Admin can run Material Check */}
                      {(hasPermission(currentUser, 'inventory') || hasPermission(currentUser, 'manufacturing')) && (
                        <button
                          onClick={() => onCheckMaterials(po)}
                          className="h-7 px-2.5 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-[11px] inline-flex items-center gap-1"
                        >
                          <Boxes className="h-3 w-3" /> BOM Check <ArrowRight className="h-3 w-3" />
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
            currentPage={poPagination.currentPage}
            totalPages={poPagination.totalPages}
            totalItems={poPagination.totalItems}
            pageSize={poPagination.pageSize}
            onPageChange={poPagination.setCurrentPage}
          />
        )}
      </div>

      {/* CREATE PO MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-md w-full p-4 shadow-lg border border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900 mb-0.5">Import / Record Customer Purchase Order</h2>
            <p className="text-xs text-slate-500 mb-3">Register client Purchase Order.</p>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Approved Quotation *</label>
                <select
                  required
                  value={newPO.quotation_id}
                  onChange={(e) => setNewPO({ ...newPO, quotation_id: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">-- Choose Approved Quotation --</option>
                  {approvedQuotations.map((q) => (
                    <option key={q.id} value={q.id}>{q.quotation_number}: {q.customer_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Customer PO Reference # *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. APEX/PO/2026/089"
                  value={newPO.customer_po_reference}
                  onChange={(e) => setNewPO({ ...newPO, customer_po_reference: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs font-mono focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">PO Date *</label>
                  <input
                    type="date"
                    required
                    value={newPO.po_date}
                    onChange={(e) => setNewPO({ ...newPO, po_date: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Delivery Target *</label>
                  <input
                    type="date"
                    required
                    value={newPO.delivery_deadline}
                    onChange={(e) => setNewPO({ ...newPO, delivery_deadline: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Payment Terms</label>
                <input
                  type="text"
                  value={newPO.payment_terms}
                  onChange={(e) => setNewPO({ ...newPO, payment_terms: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs"
                />
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
                  Save Customer PO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW PO DETAILS MODAL */}
      {viewPODetails && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-md w-full p-4 shadow-lg border border-slate-200">
            <div className="flex items-center justify-between border-b pb-2.5 mb-2.5">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sales PO</span>
                <h3 className="text-sm font-bold text-slate-900">{viewPODetails.po_number}</h3>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-700">
                {viewPODetails.status}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-2 bg-slate-50 rounded border border-slate-200">
                <p className="font-semibold text-slate-900">{viewPODetails.customer_name}</p>
                <p className="text-slate-500">Ref: {viewPODetails.customer_po_reference} • Target: {viewPODetails.delivery_deadline}</p>
              </div>

              <div className="flex justify-between items-center bg-slate-50 p-2 rounded font-semibold text-slate-900">
                <span>Total Amount:</span>
                <span className="text-sm">₹{Number(viewPODetails.total_amount).toLocaleString()}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t mt-3">
              <button
                onClick={() => setViewPODetails(null)}
                className="h-8 px-4 bg-slate-900 text-white rounded-md text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
