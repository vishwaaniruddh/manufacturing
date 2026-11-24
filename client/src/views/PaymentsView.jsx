// client/src/views/PaymentsView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  CreditCard, 
  Plus, 
  Receipt, 
  CheckCircle2, 
  Calendar, 
  History,
  Search,
  Download
} from 'lucide-react';
import { hasPermission } from '../utils/rbac';
import Pagination, { usePagination } from '../components/Pagination';
import { MediaUploader, MediaGallery } from '../components/MediaUploader';
import { exportToCsv } from '../utils/exportCsv';

export default function PaymentsView({ currentUser, preselectedPO, onClearPreselectedPO, onOpenAudit }) {
  const [payments, setPayments] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [paymentMediaMap, setPaymentMediaMap] = useState({});
  const [paymentMediaFiles, setPaymentMediaFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPOFilter, setSelectedPOFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const filteredPayments = payments.filter((p) => {
    const matchesType = !typeFilter || p.payment_type === typeFilter;
    const s = searchQuery.toLowerCase();
    const matchesSearch =
      !s ||
      p.payment_number?.toLowerCase().includes(s) ||
      p.customer_name?.toLowerCase().includes(s) ||
      p.po_number?.toLowerCase().includes(s) ||
      p.transaction_reference?.toLowerCase().includes(s);
    return matchesType && matchesSearch;
  });

  const paymentsPagination = usePagination(filteredPayments, 10);

  // Record Payment Modal
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [newPayment, setNewPayment] = useState({
    po_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    amount: '',
    payment_method: 'bank_transfer',
    transaction_reference: '',
    payment_type: 'advance',
    notes: ''
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, poRes, ptRes, mRes] = await Promise.all([
        api.getPayments(selectedPOFilter),
        api.getPurchaseOrders(),
        api.getPaymentTypes(),
        api.getMedia('payment')
      ]);
      setPayments(pRes.data || []);
      setPurchaseOrders(poRes.data || []);
      setPaymentTypes((ptRes.data || []).filter((pt) => pt.status === 'active'));
      const grouped = {};
      (mRes.data || []).forEach((m) => {
        grouped[m.entity_id] = grouped[m.entity_id] || [];
        grouped[m.entity_id].push(m);
      });
      setPaymentMediaMap(grouped);
    } catch (err) {
      alert('Error fetching payments: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedPOFilter]);

  useEffect(() => {
    if (preselectedPO?.id) {
      const poIdStr = String(preselectedPO.id);
      const due = Number(preselectedPO.balance_due ?? preselectedPO.total_amount * 0.5);
      const paid = Number(preselectedPO.total_paid || 0);
      setSelectedPOFilter(poIdStr);
      setNewPayment({
        po_id: poIdStr,
        payment_date: new Date().toISOString().split('T')[0],
        amount: due > 0 ? Math.round(due) : '',
        payment_method: 'bank_transfer',
        transaction_reference: `UTR-${Math.floor(100000000 + Math.random() * 900000000)}`,
        payment_type: paid > 0 ? 'final' : 'advance',
        notes: ''
      });
      if (due > 0) {
        setShowRecordModal(true);
      }
      if (onClearPreselectedPO) {
        onClearPreselectedPO();
      }
    }
  }, [preselectedPO]);

  const handleRecordSubmit = async (e) => {
    e.preventDefault();
    if (!newPayment.po_id || !newPayment.amount || !newPayment.transaction_reference) {
      alert('Please select PO, payment amount, and transaction reference/UTR.');
      return;
    }

    try {
      const payRes = await api.recordPayment(newPayment);
      const createdPayId = payRes.data?.id;
      if (paymentMediaFiles.length > 0 && createdPayId) {
        await api.uploadMedia('payment', createdPayId, paymentMediaFiles, currentUser?.id || 1);
      }
      setPaymentMediaFiles([]);
      setShowRecordModal(false);
      setNewPayment({
        po_id: '',
        payment_date: new Date().toISOString().split('T')[0],
        amount: '',
        payment_method: 'bank_transfer',
        transaction_reference: '',
        payment_type: 'advance',
        notes: ''
      });
      loadData();
    } catch (err) {
      alert('Failed to record payment: ' + err.message);
    }
  };

  const totalReceived = payments.reduce((acc, p) => acc + (p.status === 'verified' ? Number(p.amount) : 0), 0);

  return (
    <div className="space-y-3.5">
      
      {/* Header (ShadCN style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">
              Stage 5 & 12: Inward Payment Ledger
            </h1>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              Financial Reconciliation
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit-tracked client payments received against Quotations and Sales POs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAudit && (
            <button
              onClick={() => onOpenAudit('payments')}
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
            >
              <History className="h-3.5 w-3.5" /> Payment Audit Trail
            </button>
          )}

          {hasPermission(currentUser, 'payments', 'create') && (
            <button
              onClick={() => setShowRecordModal(true)}
              className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Record Payment
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards (ShadCN style) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500">Total Transactions</span>
          <p className="text-lg font-bold text-slate-900 mt-0.5">{payments.length} Receipts</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500">Collected Funds</span>
          <p className="text-lg font-bold text-emerald-600 mt-0.5">₹{totalReceived.toLocaleString()}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500">Bank Reconciliation</span>
          <p className="text-lg font-bold text-slate-800 mt-0.5">100% Verified UTR</p>
        </div>
      </div>

      {/* Filter & Export */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search receipt #, PO #, UTR..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-slate-900"
            />
          </div>
          <select
            value={selectedPOFilter}
            onChange={(e) => setSelectedPOFilter(e.target.value)}
            className="h-8 px-2 border border-slate-200 rounded-md text-xs bg-white text-slate-700 font-medium"
          >
            <option value="">All Orders</option>
            {purchaseOrders.map((po) => (
              <option key={po.id} value={po.id}>{po.po_number}: {po.customer_name}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 px-2 border border-slate-200 rounded-md text-xs bg-white text-slate-700 font-medium"
          >
            <option value="">All Payment Types</option>
            {paymentTypes.map((pt) => (
              <option key={pt.id} value={pt.code}>{pt.name}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() =>
            exportToCsv(
              'payments',
              [
                { header: 'Receipt #', accessor: 'payment_number' },
                { header: 'Date', accessor: 'payment_date' },
                { header: 'PO #', accessor: 'po_number' },
                { header: 'Customer', accessor: 'customer_name' },
                { header: 'Amount', accessor: 'amount' },
                { header: 'Method', accessor: 'payment_method' },
                { header: 'UTR Reference', accessor: 'transaction_reference' },
                { header: 'Type', accessor: 'payment_type' },
                { header: 'Status', accessor: 'status' }
              ],
              filteredPayments
            )
          }
          title="Export filtered payments"
          className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
        >
          <Download className="h-3.5 w-3.5" /> Export
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading ledger...</div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No payments recorded yet.
          </div>
        ) : (
          <>
            <div className="px-3.5 py-2 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
              <span>Total Records: <strong className="text-slate-800">{filteredPayments.length}</strong></span>
              <span>Page {paymentsPagination.currentPage} of {paymentsPagination.totalPages}</span>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="px-3 py-2.5 w-10 text-center">#</th>
                  <th className="px-3.5 py-2.5">Receipt # & Date</th>
                  <th className="px-3.5 py-2.5">PO & Client</th>
                  <th className="px-3.5 py-2.5">Amount</th>
                  <th className="px-3.5 py-2.5">Mode & UTR Reference</th>
                  <th className="px-3.5 py-2.5">Type</th>
                  <th className="px-3.5 py-2.5">Evidence</th>
                  <th className="px-3.5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentsPagination.paginatedItems.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">
                      {paymentsPagination.startIndex + idx + 1}
                    </td>
                    
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className="font-mono text-[11px] font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                        {p.payment_number}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-0.5">{p.payment_date}</p>
                    </td>

                    <td className="px-3.5 py-2.5">
                      <p className="font-semibold text-slate-900">{p.customer_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{p.po_number}</p>
                    </td>

                    <td className="px-3.5 py-2.5 font-bold text-emerald-600 whitespace-nowrap">
                      ₹{Number(p.amount).toLocaleString()}
                    </td>

                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className="uppercase text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                        {p.payment_method?.replace('_', ' ')}
                      </span>
                      <p className="text-[10px] font-mono text-slate-600 mt-0.5">{p.transaction_reference}</p>
                    </td>

                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold capitalize bg-slate-100 text-slate-700">
                        {p.payment_type}
                      </span>
                    </td>

                    <td className="px-3.5 py-2.5">
                      <MediaGallery attachments={paymentMediaMap[p.id] || []} />
                    </td>

                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3" /> Verified
                      </span>
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
            currentPage={paymentsPagination.currentPage}
            totalPages={paymentsPagination.totalPages}
            totalItems={paymentsPagination.totalItems}
            pageSize={paymentsPagination.pageSize}
            onPageChange={paymentsPagination.setCurrentPage}
          />
        )}
      </div>

      {/* RECORD PAYMENT MODAL */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-sm w-full p-4 shadow-lg border border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900 mb-0.5">Record Inward Payment</h2>
            <p className="text-xs text-slate-500 mb-3">Record client payment against PO.</p>

            <form onSubmit={handleRecordSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Purchase Order *</label>
                <select
                  required
                  value={newPayment.po_id}
                  onChange={(e) => setNewPayment({ ...newPayment, po_id: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">-- Choose Customer PO --</option>
                  {purchaseOrders.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.po_number}: {po.customer_name} (₹{Number(po.total_amount).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newPayment.amount}
                    onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={newPayment.payment_date}
                    onChange={(e) => setNewPayment({ ...newPayment, payment_date: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Payment Type *</label>
                <select
                  required
                  value={newPayment.payment_type}
                  onChange={(e) => setNewPayment({ ...newPayment, payment_type: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">-- Select Payment Type --</option>
                  {paymentTypes.map((pt) => (
                    <option key={pt.id} value={pt.code}>
                      {pt.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">UTR Reference # *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HDFC-NEFT-994400192"
                  value={newPayment.transaction_reference}
                  onChange={(e) => setNewPayment({ ...newPayment, transaction_reference: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs font-mono"
                />
              </div>

              <MediaUploader
                files={paymentMediaFiles}
                onChange={setPaymentMediaFiles}
                label="Payment Proof / Receipt Screenshots (Optional)"
              />

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRecordModal(false)}
                  className="h-8 px-3 border border-slate-200 text-slate-600 rounded-md font-medium text-xs hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-8 px-4 bg-slate-900 text-white rounded-md font-medium text-xs hover:bg-slate-800"
                >
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
