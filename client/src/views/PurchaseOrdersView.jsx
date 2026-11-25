// client/src/views/PurchaseOrdersView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  Plus,
  Search,
  Boxes,
  Receipt,
  Eye,
  Edit3,
  History,
  ArrowRight,
  Download
} from 'lucide-react';
import { hasPermission } from '../utils/rbac';
import Pagination, { usePagination } from '../components/Pagination';
import { exportToCsv } from '../utils/exportCsv';

export default function PurchaseOrdersView({
  currentUser,
  onCreatePO,
  onViewPO,
  onEditPO,
  onCheckMaterials,
  onRecordPayment,
  onOpenAudit
}) {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const poRes = await api.getPurchaseOrders();
      setPurchaseOrders(poRes.data || []);
    } catch (err) {
      alert('Error fetching purchase orders: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredPOs = purchaseOrders.filter((po) => {
    const s = searchQuery.toLowerCase();
    const matchesSearch =
      !s ||
      po.po_number?.toLowerCase().includes(s) ||
      po.customer_po_reference?.toLowerCase().includes(s) ||
      po.customer_name?.toLowerCase().includes(s) ||
      po.quotation_number?.toLowerCase().includes(s);
    const matchesPayment = !paymentStatusFilter || po.payment_status === paymentStatusFilter;
    return matchesSearch && matchesPayment;
  });

  const poPagination = usePagination(filteredPOs, 10);
  const canCreateOrEdit = hasPermission(currentUser, 'purchase_orders', 'create');

  return (
    <div className="space-y-3.5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 id="po-list-heading" className="text-base font-semibold text-slate-900 tracking-tight">
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
              type="button"
              onClick={() => onOpenAudit('purchase_orders')}
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
            >
              <History className="h-3.5 w-3.5" /> PO Audit Trail
            </button>
          )}

          {canCreateOrEdit && (
            <button
              type="button"
              onClick={() => onCreatePO && onCreatePO()}
              className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Create Customer PO
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search */}
      <search className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <label htmlFor="po-search-input" className="sr-only">
            Search Purchase Orders
          </label>
          <input
            id="po-search-input"
            type="search"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Search PO #, client ref, quote #, or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="po-payment-filter" className="sr-only">
            Filter by Payment Status
          </label>
          <select
            id="po-payment-filter"
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
                  { header: 'Quote #', accessor: 'quotation_number' },
                  { header: 'Customer', accessor: 'customer_name' },
                  { header: 'Items', accessor: 'item_count' },
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
      </search>

      {/* Table */}
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
              <span>
                Total Records: <strong className="text-slate-800">{filteredPOs.length}</strong>
              </span>
              <span>
                Page {poPagination.currentPage} of {poPagination.totalPages}
              </span>
            </div>
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="po-list-heading"
              className="overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                  <tr>
                    <th scope="col" className="px-2.5 py-2.5 w-8 text-center">#</th>
                    <th scope="col" className="px-2.5 py-2.5">PO # & Client Ref</th>
                    <th scope="col" className="px-2.5 py-2.5">Customer & Quote</th>
                    <th scope="col" className="px-2.5 py-2.5">Items & Deadline</th>
                    <th scope="col" className="px-2.5 py-2.5">Order Total</th>
                    <th scope="col" className="px-2.5 py-2.5">Payment Status</th>
                    <th scope="col" className="px-2.5 py-2.5">Status</th>
                    <th scope="col" className="px-2.5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {poPagination.paginatedItems.map((po, idx) => {
                    const lockedEdit = ['completed', 'cancelled'].includes(po.status);
                    return (
                      <tr key={po.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-2.5 py-2.5 text-center font-mono text-[11px] text-slate-400">
                          {poPagination.startIndex + idx + 1}
                        </td>

                        <td className="px-2.5 py-2.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onViewPO && onViewPO(po.id)}
                            className="font-mono text-[11px] font-semibold text-sky-700 hover:text-sky-900 bg-sky-50/70 hover:bg-sky-100/70 px-1.5 py-0.5 rounded border border-sky-200 transition-colors"
                          >
                            {po.po_number}
                          </button>
                          <p className="text-[11px] font-medium text-slate-700 mt-0.5">
                            Ref: <span className="font-mono text-slate-500">{po.customer_po_reference}</span>
                          </p>
                        </td>

                        <td className="px-2.5 py-2.5">
                          <p className="font-semibold text-slate-900 truncate max-w-[175px]">{po.customer_name}</p>
                          <p className="text-[10px] text-slate-500 font-mono truncate">
                            {po.quotation_number}
                          </p>
                        </td>

                        <td className="px-2.5 py-2.5 whitespace-nowrap">
                          <span className="font-medium text-slate-700">{po.item_count ?? 0} Items</span>
                          <p className="text-[10px] text-slate-400">Due: {po.delivery_deadline}</p>
                        </td>

                        <td className="px-2.5 py-2.5 font-bold text-slate-900 whitespace-nowrap">
                          ₹{Number(po.total_amount).toLocaleString()}
                          {Number(po.tax_amount || 0) > 0 && (
                            <span className="block text-[10px] font-normal text-slate-400">
                              Tax: ₹{Number(po.tax_amount).toLocaleString()}
                            </span>
                          )}
                        </td>

                        <td className="px-2.5 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-emerald-600">
                              ₹{Number(po.total_paid).toLocaleString()}
                            </span>
                            {Number(po.excess_amount || 0) > 0 ? (
                              <span className="text-[10px] font-semibold text-violet-700 bg-violet-50 px-1.5 py-0.2 rounded border border-violet-200">
                                +₹{Number(po.excess_amount).toLocaleString()} Extra
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">
                                / Due: ₹{Number(po.balance_due).toLocaleString()}
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-[10px] font-semibold uppercase ${
                              po.payment_status === 'overpaid'
                                ? 'text-violet-700'
                                : po.payment_status === 'fully_paid'
                                ? 'text-emerald-700'
                                : po.payment_status === 'partially_paid'
                                ? 'text-amber-700'
                                : po.payment_status === 'pending_verification'
                                ? 'text-sky-700'
                                : 'text-slate-400'
                            }`}
                          >
                            {po.payment_status?.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="px-2.5 py-2.5 whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase border ${
                              po.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : po.status === 'in_production'
                                ? 'bg-sky-50 text-sky-700 border-sky-200'
                                : po.status === 'cancelled'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {po.status?.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="px-2.5 py-2.5 text-right space-x-1 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onViewPO && onViewPO(po.id)}
                            className="h-7 px-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-md text-[11px] font-medium"
                          >
                            <Eye className="h-3 w-3 inline mr-0.5" /> View
                          </button>

                          <button
                            type="button"
                            disabled={lockedEdit || !canCreateOrEdit}
                            onClick={() => onEditPO && onEditPO(po.id)}
                            className="h-7 px-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-md text-[11px] font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          >
                            <Edit3 className="h-3 w-3 inline mr-0.5" /> Edit
                          </button>

                          {hasPermission(currentUser, 'payments', 'create') && (
                            <button
                              type="button"
                              onClick={() => onRecordPayment && onRecordPayment(po)}
                              className="h-7 px-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md font-medium text-[11px] inline-flex items-center gap-1"
                            >
                              <Receipt className="h-3 w-3" /> Pay
                            </button>
                          )}

                          {(hasPermission(currentUser, 'inventory') || hasPermission(currentUser, 'manufacturing')) && (
                            <button
                              type="button"
                              onClick={() => onCheckMaterials && onCheckMaterials(po)}
                              className="h-7 px-2 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-[11px] inline-flex items-center gap-1"
                            >
                              <Boxes className="h-3 w-3" /> BOM Check <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
    </div>
  );
}
