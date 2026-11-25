// client/src/views/QuotationsView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  Plus,
  Eye,
  Edit3,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  History,
  Search,
  Download
} from 'lucide-react';
import { hasPermission } from '../utils/rbac';
import Pagination, { usePagination } from '../components/Pagination';
import { exportToCsv } from '../utils/exportCsv';
import LinkedPOBadges from '../components/LinkedPOBadges';

export default function QuotationsView({
  currentUser,
  onCreateQuotation,
  onViewQuotation,
  onEditQuotation,
  onGeneratePO,
  onViewPO,
  onOpenAudit
}) {
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filteredQuotations = quotations.filter((q) => {
    const matchesStatus = !statusFilter || q.status === statusFilter;
    const s = searchQuery.toLowerCase();
    const matchesSearch =
      !s ||
      q.quotation_number?.toLowerCase().includes(s) ||
      q.customer_name?.toLowerCase().includes(s) ||
      q.lead_title?.toLowerCase().includes(s);
    return matchesStatus && matchesSearch;
  });

  const quotesPagination = usePagination(filteredQuotations, 10);

  const loadData = async () => {
    setLoading(true);
    try {
      const qRes = await api.getQuotations();
      setQuotations(qRes.data || []);
    } catch (err) {
      alert('Error loading quotations data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApproveQuotation = async (id) => {
    if (!window.confirm('Mark this quotation as APPROVED by client?')) return;
    try {
      await api.approveQuotation(id);
      loadData();
    } catch (err) {
      alert('Approval failed: ' + err.message);
    }
  };

  const handleRejectQuotation = async (id) => {
    const reason = prompt('Please enter reason for quotation rejection:');
    if (!reason) return;
    try {
      await api.rejectQuotation(id, reason);
      loadData();
    } catch (err) {
      alert('Rejection failed: ' + err.message);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Header (ShadCN style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">
              Stage 3: Commercial Quotations & Multi-Revisions
            </h1>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              Commercial Proposal
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Pricing proposals with automatic GST/tax calculations and revision numbering (R1, R2...).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAudit && (
            <button
              type="button"
              onClick={() => onOpenAudit('quotations')}
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
            >
              <History className="h-3.5 w-3.5" /> Quote Audit Trail
            </button>
          )}

          {hasPermission(currentUser, 'quotations', 'create') && (
            <button
              type="button"
              onClick={() => onCreateQuotation && onCreateQuotation()}
              className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Create Quotation
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search quote #, customer, or lead..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs">
            {['', 'draft', 'approved', 'rejected'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
                  statusFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st || 'All'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              exportToCsv(
                'quotations',
                [
                  { header: 'Quote #', accessor: 'quotation_number' },
                  { header: 'Rev', accessor: (q) => `R${q.revision_number}` },
                  { header: 'Quote Date', accessor: 'quotation_date' },
                  { header: 'Customer', accessor: 'customer_name' },
                  { header: 'Lead Title', accessor: 'lead_title' },
                  { header: 'Items', accessor: 'item_count' },
                  { header: 'Valid Until', accessor: 'valid_until' },
                  { header: 'Tax Amount', accessor: 'tax_amount' },
                  { header: 'Total Amount', accessor: 'total_amount' },
                  { header: 'Status', accessor: 'status' }
                ],
                filteredQuotations
              )
            }
            title="Export filtered quotations"
            className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Table (Compact ShadCN style) */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading quotations...</div>
        ) : filteredQuotations.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No quotations found.
          </div>
        ) : (
          <>
            <div className="px-3.5 py-2 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
              <span>Total Records: <strong className="text-slate-800">{filteredQuotations.length}</strong></span>
              <span>Page {quotesPagination.currentPage} of {quotesPagination.totalPages}</span>
            </div>
            <div
              tabIndex={0}
              role="region"
              aria-label="Quotations and linked purchase orders table"
              className="overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                <tr>
                  <th scope="col" className="px-2.5 py-2.5 w-8 text-center">#</th>
                  <th scope="col" className="px-2.5 py-2.5">Quote # & Rev</th>
                  <th scope="col" className="px-2.5 py-2.5">Lead & Client</th>
                  <th scope="col" className="px-2.5 py-2.5">Items & Valid Date</th>
                  <th scope="col" className="px-2.5 py-2.5">Total Amount</th>
                  <th scope="col" className="px-2.5 py-2.5">Status</th>
                  <th scope="col" className="px-2.5 py-2.5">Purchase Orders</th>
                  <th scope="col" className="px-2.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotesPagination.paginatedItems.map((q, idx) => (
                  <tr key={q.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-2.5 py-2.5 text-center font-mono text-[11px] text-slate-400">
                      {quotesPagination.startIndex + idx + 1}
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onViewQuotation && onViewQuotation(q.id)}
                          className="font-mono text-[11px] font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded border border-slate-200 transition-colors cursor-pointer"
                        >
                          {q.quotation_number}
                        </button>
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-600">
                          R{q.revision_number}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">{q.quotation_date}</span>
                    </td>

                    <td className="px-2.5 py-2.5">
                      <p className="font-semibold text-slate-900 truncate max-w-[170px]">{q.customer_name}</p>
                      <p className="text-[11px] text-slate-500 truncate max-w-[170px]">
                        {q.lead_number ? `${q.lead_number} • ` : ''}{q.lead_title}
                      </p>
                    </td>

                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <span className="font-medium text-slate-700">{q.item_count} Items</span>
                      <p className="text-[10px] text-slate-400">Valid: {q.valid_until}</p>
                    </td>

                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <p className="font-bold text-slate-900">
                        ₹{Number(q.total_amount).toLocaleString()}
                      </p>
                      <span className="text-[10px] text-slate-400">
                        Tax: ₹{Number(q.tax_amount).toLocaleString()}
                      </span>
                    </td>

                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      {q.status === 'approved' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Approved
                        </span>
                      )}
                      {q.status === 'draft' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="h-3 w-3" /> Draft
                        </span>
                      )}
                      {q.status === 'rejected' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <XCircle className="h-3 w-3" /> Rejected
                        </span>
                      )}
                    </td>

                    <td className="px-2.5 py-2.5">
                      <LinkedPOBadges
                        pos={q.linked_pos || []}
                        fallbackPos={q.lead_linked_pos || []}
                        onViewPO={onViewPO}
                        emptyLabel="No POs"
                      />
                    </td>

                    <td className="px-2.5 py-2.5 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1 max-w-[235px] ml-auto">
                      <a
                        href={api.getQuotationPdfUrl(q.id)}
                        target="_blank"
                        rel="noreferrer"
                        title="Download Quotation PDF"
                        className="h-7 px-1.5 border border-slate-200 text-rose-700 hover:bg-rose-50 rounded-md text-[11px] font-medium inline-flex items-center gap-1"
                      >
                        <Download className="h-3 w-3" /> PDF
                      </a>

                      <a
                        href={api.getQuotationExcelUrl(q.id)}
                        target="_blank"
                        rel="noreferrer"
                        title="Download Quotation Excel"
                        className="h-7 px-1.5 border border-slate-200 text-emerald-700 hover:bg-emerald-50 rounded-md text-[11px] font-medium inline-flex items-center gap-1"
                      >
                        <Download className="h-3 w-3" /> XLS
                      </a>

                      <button
                        type="button"
                        onClick={() => onViewQuotation && onViewQuotation(q.id)}
                        className="h-7 px-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-md text-[11px] font-medium inline-flex items-center gap-0.5"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>

                      <button
                        type="button"
                        disabled={q.status === 'approved' || !hasPermission(currentUser, 'quotations', 'create')}
                        onClick={() => onEditQuotation && onEditQuotation(q.id)}
                        className="h-7 px-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-md text-[11px] font-medium inline-flex items-center gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> Edit
                      </button>

                      <button
                        type="button"
                        disabled={q.status !== 'draft' || !hasPermission(currentUser, 'quotations', 'approve')}
                        onClick={() => handleApproveQuotation(q.id)}
                        className="h-7 px-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-medium text-[11px] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600"
                      >
                        Approve
                      </button>

                      <button
                        type="button"
                        disabled={q.status !== 'draft' || !hasPermission(currentUser, 'quotations', 'approve')}
                        onClick={() => handleRejectQuotation(q.id)}
                        className="h-7 px-2 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-md font-medium text-[11px] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                      >
                        Reject
                      </button>

                      <button
                        type="button"
                        disabled={q.status !== 'approved' || !hasPermission(currentUser, 'purchase_orders', 'create')}
                        onClick={() => onGeneratePO(q)}
                        className="h-7 px-2 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-[11px] inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-900"
                      >
                        + PO <ArrowRight className="h-3 w-3" />
                      </button>
                      </div>
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
            currentPage={quotesPagination.currentPage}
            totalPages={quotesPagination.totalPages}
            totalItems={quotesPagination.totalItems}
            pageSize={quotesPagination.pageSize}
            onPageChange={quotesPagination.setCurrentPage}
          />
        )}
      </div>
    </div>
  );
}
