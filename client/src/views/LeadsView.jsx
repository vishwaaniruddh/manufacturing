// client/src/views/LeadsView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  UserPlus, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search, 
  Plus, 
  ArrowRight,
  AlertCircle,
  History,
  Download,
  FileSpreadsheet
} from 'lucide-react';
import { hasPermission } from '../utils/rbac';
import Pagination, { usePagination } from '../components/Pagination';
import { exportToCsv } from '../utils/exportCsv';
import LinkedPOBadges from '../components/LinkedPOBadges';

export default function LeadsView({
  currentUser,
  onSelectForQuotation,
  onViewQuotation,
  onViewPO,
  onOpenAudit,
  onOpenLeadEngine
}) {
  const [leads, setLeads] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(null); // { type: 'approve'|'reject', lead: item }
  const [actionRemarks, setActionRemarks] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  // Form state
  const [newLead, setNewLead] = useState({
    customer_id: '',
    title: '',
    requirement_details: '',
    estimated_value: '',
    source: 'Direct Inquiry',
    remarks: ''
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [leadsRes, custRes] = await Promise.all([
        api.getLeads(filterStatus),
        api.getCustomers()
      ]);
      setLeads(leadsRes.data || []);
      setCustomers(custRes.data || []);
    } catch (err) {
      alert('Error fetching leads: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterStatus]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!newLead.customer_id || !newLead.title) {
      alert('Please select a customer and provide a lead title.');
      return;
    }
    try {
      await api.createLead(newLead);
      setShowCreateModal(false);
      setNewLead({
        customer_id: '',
        title: '',
        requirement_details: '',
        estimated_value: '',
        source: 'Direct Inquiry',
        remarks: ''
      });
      loadData();
    } catch (err) {
      alert('Failed to create lead: ' + err.message);
    }
  };

  const handleApproveReject = async () => {
    if (!showActionModal) return;
    setActionSubmitting(true);
    try {
      if (showActionModal.type === 'approve') {
        await api.approveLead(showActionModal.lead.id, actionRemarks || 'Lead approved for technical quotation');
      } else {
        if (!actionRemarks) {
          alert('Remarks are required when rejecting a lead.');
          setActionSubmitting(false);
          return;
        }
        await api.rejectLead(showActionModal.lead.id, actionRemarks);
      }
      setShowActionModal(null);
      setActionRemarks('');
      loadData();
    } catch (err) {
      alert('Action failed: ' + err.message);
    } finally {
      setActionSubmitting(false);
    }
  };

  const filteredLeads = leads.filter(l => 
    l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.lead_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.customer_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const leadsPagination = usePagination(filteredLeads, 10);

  return (
    <div className="space-y-3.5">
      
      {/* Header bar (ShadCN style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">
              Stage 1 & 2: Lead Inward & Commercial Review
            </h1>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              Commercial Scope
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Capture prospective customer inquiries, review commercial feasibility, and approve for quotation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAudit && (
            <button
              onClick={() => onOpenAudit('leads')}
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
            >
              <History className="h-3.5 w-3.5" /> Lead Audit Trail
            </button>
          )}

          {hasPermission(currentUser, 'leads', 'create') && onOpenLeadEngine && (
            <button
              type="button"
              onClick={onOpenLeadEngine}
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Lead Engine / Excel Import
            </button>
          )}

          {hasPermission(currentUser, 'leads', 'create') && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Create Lead
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
            placeholder="Search lead #, title, or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs">
            {['', 'pending', 'approved', 'rejected'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
                  filterStatus === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
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
                'leads',
                [
                  { header: 'Lead #', accessor: 'lead_number' },
                  { header: 'Title', accessor: 'title' },
                  { header: 'Customer', accessor: 'customer_name' },
                  { header: 'Phone', accessor: 'customer_phone' },
                  { header: 'Est. Value', accessor: 'estimated_value' },
                  { header: 'Source', accessor: 'source' },
                  { header: 'Status', accessor: 'status' },
                  { header: 'Created Date', accessor: 'created_at' }
                ],
                filteredLeads
              )
            }
            title="Export filtered leads"
            className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Table (Compact ShadCN style) */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading leads...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No leads found. Create a new lead to begin.
          </div>
        ) : (
          <>
            <div className="px-3.5 py-2 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
              <span>Total Records: <strong className="text-slate-800">{filteredLeads.length}</strong></span>
              <span>Page {leadsPagination.currentPage} of {leadsPagination.totalPages}</span>
            </div>
            <div
              tabIndex={0}
              role="region"
              aria-label="Leads, linked quotations, and purchase orders table"
              className="overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                <tr>
                  <th scope="col" className="px-2.5 py-2.5 w-8 text-center">#</th>
                  <th scope="col" className="px-2.5 py-2.5 min-w-[220px] max-w-[300px] whitespace-nowrap">Lead # & Title</th>
                  <th scope="col" className="px-2.5 py-2.5">Customer</th>
                  <th scope="col" className="px-2.5 py-2.5">Est. Value</th>
                  <th scope="col" className="px-2.5 py-2.5">Source & Date</th>
                  <th scope="col" className="px-2.5 py-2.5">Status</th>
                  <th scope="col" className="px-2.5 py-2.5">Quotes & POs</th>
                  <th scope="col" className="px-2.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leadsPagination.paginatedItems.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-2.5 py-2.5 text-center font-mono text-[11px] text-slate-400">
                      {leadsPagination.startIndex + idx + 1}
                    </td>
                    
                    <td className="px-2.5 py-2.5 min-w-[220px] max-w-[300px]">
                      <span className="inline-block whitespace-nowrap font-mono text-[11px] font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {item.lead_number}
                      </span>
                      <p className="font-semibold text-slate-900 text-xs mt-1 leading-snug break-words">
                        {(() => {
                          const words = (item.title || '').trim().split(/\s+/).filter(Boolean);
                          if (words.length <= 6) return item.title;
                          return (
                            <>
                              {words.slice(0, 6).join(' ')}
                              <br />
                              {words.slice(6).join(' ')}
                            </>
                          );
                        })()}
                      </p>
                      {item.requirement_details && (
                        <p className="text-[11px] text-slate-500 line-clamp-1 max-w-[280px]">
                          {item.requirement_details}
                        </p>
                      )}
                    </td>

                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <p className="font-medium text-slate-800">{item.customer_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{item.customer_phone}</p>
                    </td>

                    <td className="px-2.5 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
                      ₹{Number(item.estimated_value).toLocaleString()}
                    </td>

                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <span className="text-slate-600">{item.source}</span>
                      <p className="text-[10px] text-slate-400">
                        {new Date(item.created_at).toLocaleDateString()}
                      </p>
                    </td>

                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      {item.status === 'approved' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Approved
                        </span>
                      )}
                      {item.status === 'rejected' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <XCircle className="h-3 w-3" /> Rejected
                        </span>
                      )}
                      {item.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="h-3 w-3" /> Pending Review
                        </span>
                      )}
                      {item.remarks && (
                        <p className="text-[10px] text-slate-400 italic max-w-[160px] truncate mt-0.5">
                          "{item.remarks}"
                        </p>
                      )}
                    </td>

                    <td className="px-2.5 py-2.5 space-y-1.5">
                      {(item.linked_quotations || []).length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          {item.linked_quotations.map((q) => (
                            <button
                              key={q.id}
                              type="button"
                              onClick={() => onViewQuotation && onViewQuotation(q.id)}
                              title={`Open ${q.quotation_number} (₹${Number(q.total_amount).toLocaleString()} • ${q.status})`}
                              className="px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
                            >
                              {q.quotation_number}
                            </button>
                          ))}
                        </div>
                      )}
                      <LinkedPOBadges
                        pos={item.linked_pos || []}
                        onViewPO={onViewPO}
                        emptyLabel="No POs"
                      />
                    </td>

                    <td className="px-2.5 py-2.5 text-right space-x-1 whitespace-nowrap">
                      <button
                        type="button"
                        disabled={item.status !== 'pending' || !hasPermission(currentUser, 'leads', 'approve')}
                        onClick={() => {
                          setShowActionModal({ type: 'approve', lead: item });
                          setActionRemarks('');
                        }}
                        className="h-7 px-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-medium text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600"
                      >
                        Approve
                      </button>

                      <button
                        type="button"
                        disabled={item.status !== 'pending' || !hasPermission(currentUser, 'leads', 'approve')}
                        onClick={() => {
                          setShowActionModal({ type: 'reject', lead: item });
                          setActionRemarks('');
                        }}
                        className="h-7 px-2 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-md font-medium text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                      >
                        Reject
                      </button>

                      <button
                        type="button"
                        disabled={item.status !== 'approved' || !hasPermission(currentUser, 'quotations', 'create')}
                        onClick={() => onSelectForQuotation(item)}
                        className="h-7 px-2 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-[11px] inline-flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-900"
                      >
                        + Quote <ArrowRight className="h-3 w-3" />
                      </button>
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
            currentPage={leadsPagination.currentPage}
            totalPages={leadsPagination.totalPages}
            totalItems={leadsPagination.totalItems}
            pageSize={leadsPagination.pageSize}
            onPageChange={leadsPagination.setCurrentPage}
          />
        )}
      </div>

      {/* CREATE LEAD MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-md w-full p-4 shadow-lg border border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900 mb-0.5">Create Inward Customer Lead</h2>
            <p className="text-xs text-slate-500 mb-3">Record prospect customer requirements.</p>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Customer *</label>
                <select
                  required
                  value={newLead.customer_id}
                  onChange={(e) => setNewLead({ ...newLead, customer_id: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">-- Choose Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.company_name} ({c.contact_person})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Lead Title / Subject *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Supply of 50 units High Torque Stepper Motors"
                  value={newLead.title}
                  onChange={(e) => setNewLead({ ...newLead, title: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Requirement Details</label>
                <textarea
                  rows="2"
                  placeholder="Provide technical specs, tolerances, application requirements..."
                  value={newLead.requirement_details}
                  onChange={(e) => setNewLead({ ...newLead, requirement_details: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Estimated Value (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="250000"
                    value={newLead.estimated_value}
                    onChange={(e) => setNewLead({ ...newLead, estimated_value: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Source</label>
                  <select
                    value={newLead.source}
                    onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="Direct Inquiry">Direct Inquiry</option>
                    <option value="Website">Website</option>
                    <option value="Exhibition Contact">Exhibition Contact</option>
                    <option value="Referral">Referral</option>
                  </select>
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
                  Save Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* APPROVE / REJECT MODAL */}
      {showActionModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-sm w-full p-4 shadow-lg border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              {showActionModal.type === 'approve' ? 'Approve Customer Lead' : 'Reject Customer Lead'}
            </h3>
            <p className="text-xs text-slate-500 mb-2">
              Lead #{showActionModal.lead.lead_number}
            </p>

            <div className="my-2.5">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Official Decision Remarks {showActionModal.type === 'reject' ? '*' : '(Optional)'}
              </label>
              <textarea
                rows="2"
                value={actionRemarks}
                onChange={(e) => setActionRemarks(e.target.value)}
                placeholder={showActionModal.type === 'approve' ? 'e.g. Commercial & technical feasibility verified.' : 'e.g. Specifications outside current plant capacity.'}
                className="w-full p-2 text-xs border border-slate-200 rounded-md focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={actionSubmitting}
                onClick={() => setShowActionModal(null)}
                className="h-8 px-3 border border-slate-200 text-slate-600 rounded-md font-medium text-xs hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionSubmitting}
                onClick={handleApproveReject}
                className={`h-8 px-3.5 text-white rounded-md font-medium text-xs transition-colors ${
                  showActionModal.type === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {actionSubmitting ? 'Processing...' : (showActionModal.type === 'approve' ? 'Confirm Approval' : 'Confirm Rejection')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
