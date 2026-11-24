// client/src/views/TicketsView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  Ticket,
  Plus,
  Search,
  Download,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X
} from 'lucide-react';
import Pagination, { usePagination } from '../components/Pagination';
import { MediaUploader, MediaGallery } from '../components/MediaUploader';
import { exportToCsv } from '../utils/exportCsv';

const SEVERITY_BADGE = {
  critical: 'bg-rose-100 text-rose-800 border-rose-300',
  high: 'bg-rose-50 text-rose-700 border-rose-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200'
};

const STATUS_BADGE = {
  open: 'bg-rose-50 text-rose-700 border-rose-200',
  under_investigation: 'bg-amber-50 text-amber-700 border-amber-200',
  approved_for_return: 'bg-sky-50 text-sky-700 border-sky-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-slate-100 text-slate-700 border-slate-200'
};

export default function TicketsView({ currentUser }) {
  const [tickets, setTickets] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [mediaMap, setMediaMap] = useState({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  // Create Ticket Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTicket, setNewTicket] = useState({
    po_id: '',
    title: '',
    issue_details: '',
    severity: 'high',
    return_material_status: 'requested',
    assigned_to: ''
  });
  const [createMediaFiles, setCreateMediaFiles] = useState([]);

  // Manage / Detail Modal
  const [activeTicket, setActiveTicket] = useState(null);
  const [manageForm, setManageForm] = useState({
    status: 'open',
    return_material_status: 'requested',
    assigned_to: '',
    resolution_notes: ''
  });
  const [manageMediaFiles, setManageMediaFiles] = useState([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tRes, poRes, uRes, mInspRes, mTktRes] = await Promise.all([
        api.getComplaints(),
        api.getPurchaseOrders(),
        api.getUsers(),
        api.getMedia('customer_inspection'),
        api.getMedia('ticket')
      ]);
      setTickets(tRes.data || []);
      setPurchaseOrders(poRes.data || []);
      setAssignableUsers(
        (uRes.data || []).filter((u) => {
          const slug = (u.role_slug || '').toLowerCase();
          const roleName = (u.role_name || '').toLowerCase();
          return (
            slug === 'sales' ||
            slug === 'production' ||
            slug === 'admin' ||
            roleName.includes('manager') ||
            roleName.includes('sales')
          );
        })
      );

      const grouped = {};
      [...(mInspRes.data || []), ...(mTktRes.data || [])].forEach((m) => {
        grouped[m.entity_id] = grouped[m.entity_id] || [];
        grouped[m.entity_id].push(m);
      });
      setMediaMap(grouped);
    } catch (err) {
      alert('Failed to load tickets: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredTickets = tickets.filter((t) => {
    const matchesStatus = !statusFilter || t.status === statusFilter;
    const matchesSeverity = !severityFilter || t.severity === severityFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      t.ticket_number?.toLowerCase().includes(q) ||
      t.title?.toLowerCase().includes(q) ||
      t.customer_name?.toLowerCase().includes(q) ||
      t.po_number?.toLowerCase().includes(q) ||
      t.assigned_to_name?.toLowerCase().includes(q);
    return matchesStatus && matchesSeverity && matchesSearch;
  });

  const pagination = usePagination(filteredTickets, 10);

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const investigatingCount = tickets.filter((t) => t.status === 'under_investigation' || t.status === 'approved_for_return').length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;
  const highCritCount = tickets.filter((t) => t.severity === 'high' || t.severity === 'critical').length;

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createComplaint(newTicket);
      const createdId = res.data?.id;
      if (createMediaFiles.length > 0 && createdId) {
        await api.uploadMedia('ticket', createdId, createMediaFiles, currentUser?.id || 1);
      }
      setShowCreateModal(false);
      setNewTicket({
        po_id: '',
        title: '',
        issue_details: '',
        severity: 'high',
        return_material_status: 'requested',
        assigned_to: ''
      });
      setCreateMediaFiles([]);
      loadData();
    } catch (err) {
      alert('Failed to create ticket: ' + err.message);
    }
  };

  const openManageModal = (t) => {
    setActiveTicket(t);
    setManageForm({
      status: t.status || 'open',
      return_material_status: t.return_material_status || 'requested',
      assigned_to: t.assigned_to || '',
      resolution_notes: t.resolution_notes || ''
    });
    setManageMediaFiles([]);
  };

  const handleManageSubmit = async (e) => {
    e.preventDefault();
    if (!activeTicket) return;
    try {
      await api.updateComplaint(activeTicket.id, manageForm);
      if (manageMediaFiles.length > 0) {
        await api.uploadMedia('ticket', activeTicket.id, manageMediaFiles, currentUser?.id || 1);
      }
      setActiveTicket(null);
      setManageMediaFiles([]);
      loadData();
    } catch (err) {
      alert('Failed to update ticket: ' + err.message);
    }
  };

  const handleQuickAssign = async (ticketId, userId) => {
    try {
      await api.updateComplaint(ticketId, { assigned_to: userId || null });
      loadData();
    } catch (err) {
      alert('Assignment failed: ' + err.message);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-rose-600" />
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">
              Ticketing Engine &amp; RMA Resolution Desk
            </h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
              Support &amp; Claims
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Track defect claims, assign tickets to Managers or Sales Executives, attach evidence, and manage RMA resolution.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium text-xs shadow-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" /> Raise Ticket
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500">Total Tickets</span>
          <p className="text-lg font-bold text-slate-900 mt-0.5">{tickets.length}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-medium text-rose-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Open
          </span>
          <p className="text-lg font-bold text-rose-600 mt-0.5">{openCount}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-medium text-amber-600 flex items-center gap-1">
            <Clock className="h-3 w-3" /> Investigating
          </span>
          <p className="text-lg font-bold text-amber-600 mt-0.5">{investigatingCount}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Resolved
          </span>
          <p className="text-lg font-bold text-emerald-600 mt-0.5">{resolvedCount}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500">High / Critical</span>
          <p className="text-lg font-bold text-slate-900 mt-0.5">{highCritCount}</p>
        </div>
      </div>

      {/* Filters & Export */}
      <div className="bg-white p-2.5 rounded-lg border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search ticket #, customer, PO, assignee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="under_investigation">Under Investigation</option>
            <option value="approved_for_return">Approved for Return</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
          >
            <option value="">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() =>
            exportToCsv(
              'tickets',
              [
                { header: 'Ticket #', accessor: 'ticket_number' },
                { header: 'Customer', accessor: 'customer_name' },
                { header: 'PO #', accessor: 'po_number' },
                { header: 'Title', accessor: 'title' },
                { header: 'Issue Details', accessor: 'issue_details' },
                { header: 'Severity', accessor: 'severity' },
                { header: 'Assigned To', accessor: (t) => t.assigned_to_name || 'Unassigned' },
                { header: 'RMA Status', accessor: 'return_material_status' },
                { header: 'Status', accessor: 'status' },
                { header: 'Resolution Notes', accessor: 'resolution_notes' }
              ],
              filteredTickets
            )
          }
          className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs whitespace-nowrap cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" /> Export
        </button>
      </div>

      {/* Tickets Table */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading tickets...</div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No tickets match your filters.</div>
        ) : (
          <>
            <div className="px-3.5 py-2 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
              <span>Total Records: <strong className="text-slate-800">{filteredTickets.length}</strong></span>
              <span>Page {pagination.currentPage} of {pagination.totalPages}</span>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 w-10 text-center">#</th>
                  <th className="px-3.5 py-2.5">Ticket #</th>
                  <th className="px-3.5 py-2.5">Customer &amp; PO</th>
                  <th className="px-3.5 py-2.5">Issue &amp; Severity</th>
                  <th className="px-3.5 py-2.5">Assigned To</th>
                  <th className="px-3.5 py-2.5">Evidence</th>
                  <th className="px-3.5 py-2.5">RMA Return</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagination.paginatedItems.map((t, idx) => (
                  <tr key={t.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">
                      {pagination.startIndex + idx + 1}
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className="font-mono text-[11px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                        {t.ticket_number}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-0.5">{t.created_at?.slice(0, 10)}</p>
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <p className="font-semibold text-slate-900">{t.customer_name}</p>
                      <span className="font-mono text-[10px] text-slate-500">{t.po_number}</span>
                    </td>
                    <td className="px-3.5 py-2.5 max-w-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.2 rounded border text-[9px] font-bold uppercase ${SEVERITY_BADGE[t.severity] || SEVERITY_BADGE.medium}`}>
                          {t.severity}
                        </span>
                        <span className="font-semibold text-slate-900 truncate">{t.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{t.issue_details}</p>
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <select
                        aria-label={`Assign ticket ${t.ticket_number}`}
                        value={t.assigned_to || ''}
                        onChange={(e) => handleQuickAssign(t.id, e.target.value)}
                        className="p-1 border border-slate-200 rounded text-[11px] bg-white text-slate-700 max-w-[165px]"
                      >
                        <option value="">-- Unassigned --</option>
                        {assignableUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role_name})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <MediaGallery attachments={mediaMap[t.id] || []} />
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap text-[11px] font-medium text-slate-700 uppercase">
                      {t.return_material_status?.replace(/_/g, ' ')}
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold uppercase ${STATUS_BADGE[t.status] || STATUS_BADGE.open}`}>
                        {t.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openManageModal(t)}
                        className="h-7 px-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                      >
                        <Eye className="h-3 w-3" /> Manage
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
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setCurrentPage}
          />
        )}
      </div>

      {/* CREATE TICKET MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-md w-full p-4 shadow-lg border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Raise New Support / RMA Ticket</h2>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Purchase Order *</label>
                <select
                  required
                  value={newTicket.po_id}
                  onChange={(e) => setNewTicket({ ...newTicket, po_id: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md"
                >
                  <option value="">-- Select PO --</option>
                  {purchaseOrders.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.po_number}: {po.customer_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Ticket Title *</label>
                <input
                  required
                  placeholder="e.g. Damaged packaging or motor calibration issue"
                  value={newTicket.title}
                  onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Severity</label>
                  <select
                    value={newTicket.severity}
                    onChange={(e) => setNewTicket({ ...newTicket, severity: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Assign To</label>
                  <select
                    value={newTicket.assigned_to}
                    onChange={(e) => setNewTicket({ ...newTicket, assigned_to: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md"
                  >
                    <option value="">-- Unassigned --</option>
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role_name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Issue Details *</label>
                <textarea
                  required
                  rows="3"
                  value={newTicket.issue_details}
                  onChange={(e) => setNewTicket({ ...newTicket, issue_details: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md resize-y"
                />
              </div>

              <MediaUploader files={createMediaFiles} onChange={setCreateMediaFiles} label="Attach Evidence (Photos, Videos, Docs)" />

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowCreateModal(false)} className="h-8 px-3 border border-slate-200 rounded-md text-slate-600 font-medium">
                  Cancel
                </button>
                <button type="submit" className="h-8 px-4 bg-slate-900 text-white rounded-md font-medium">
                  Create Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANAGE TICKET MODAL */}
      {activeTicket && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-lg w-full p-4 shadow-lg border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <div>
                <span className="font-mono text-[11px] font-bold text-rose-700">{activeTicket.ticket_number}</span>
                <h2 className="text-sm font-semibold text-slate-900">{activeTicket.title}</h2>
              </div>
              <button type="button" onClick={() => setActiveTicket(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs space-y-1 mb-3">
              <p className="font-semibold text-slate-800">{activeTicket.customer_name} • {activeTicket.po_number}</p>
              <p className="text-slate-600">{activeTicket.issue_details}</p>
              {(mediaMap[activeTicket.id] || []).length > 0 && (
                <div className="pt-1.5 flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Attached:</span>
                  <MediaGallery attachments={mediaMap[activeTicket.id]} />
                </div>
              )}
            </div>

            <form onSubmit={handleManageSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Ticket Status</label>
                  <select
                    value={manageForm.status}
                    onChange={(e) => setManageForm({ ...manageForm, status: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md"
                  >
                    <option value="open">Open</option>
                    <option value="under_investigation">Under Investigation</option>
                    <option value="approved_for_return">Approved for Return</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">RMA Return Status</label>
                  <select
                    value={manageForm.return_material_status}
                    onChange={(e) => setManageForm({ ...manageForm, return_material_status: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md"
                  >
                    <option value="not_required">Not Required</option>
                    <option value="requested">Requested</option>
                    <option value="returned_in_transit">Returned In Transit</option>
                    <option value="received_at_factory">Received at Factory</option>
                    <option value="replacement_issued">Replacement Issued</option>
                    <option value="refund_issued">Refund Issued</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Assigned Manager / Sales Executive</label>
                <select
                  value={manageForm.assigned_to}
                  onChange={(e) => setManageForm({ ...manageForm, assigned_to: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md"
                >
                  <option value="">-- Unassigned --</option>
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Resolution Notes</label>
                <textarea
                  rows="3"
                  placeholder="Record investigation findings, replacement challan, or resolution summary..."
                  value={manageForm.resolution_notes}
                  onChange={(e) => setManageForm({ ...manageForm, resolution_notes: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md resize-y"
                />
              </div>

              <MediaUploader files={manageMediaFiles} onChange={setManageMediaFiles} label="Add More Evidence (Optional)" />

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setActiveTicket(null)} className="h-8 px-3 border border-slate-200 rounded-md text-slate-600 font-medium">
                  Cancel
                </button>
                <button type="submit" className="h-8 px-4 bg-slate-900 text-white rounded-md font-medium">
                  Update Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
