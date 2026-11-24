// client/src/views/CustomerPortalView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  PackageCheck, 
  AlertTriangle, 
  CheckCircle2, 
  RotateCcw, 
  ThumbsUp, 
  ThumbsDown,
  Sparkles,
  History,
  Search,
  Download
} from 'lucide-react';
import { hasPermission } from '../utils/rbac';
import Pagination, { usePagination } from '../components/Pagination';
import { MediaUploader, MediaGallery } from '../components/MediaUploader';
import { exportToCsv } from '../utils/exportCsv';

export default function CustomerPortalView({ currentUser, preselectedDispatch, onPaymentReleased, onOpenAudit }) {
  const [dispatches, setDispatches] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [complaintSearch, setComplaintSearch] = useState('');
  const [complaintStatusFilter, setComplaintStatusFilter] = useState('');

  const filteredComplaints = complaints.filter((c) => {
    const matchesStatus = !complaintStatusFilter || c.status === complaintStatusFilter;
    const s = complaintSearch.toLowerCase();
    const matchesSearch =
      !s ||
      c.ticket_number?.toLowerCase().includes(s) ||
      c.title?.toLowerCase().includes(s) ||
      c.issue_details?.toLowerCase().includes(s) ||
      c.assigned_to_name?.toLowerCase().includes(s);
    return matchesStatus && matchesSearch;
  });

  const complaintsPagination = usePagination(filteredComplaints, 10);

  // Inward Inspection Modal
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [selectedDispatch, setSelectedDispatch] = useState(null);
  const [inspectorName, setInspectorName] = useState(currentUser?.name || 'David Miller (Client QC)');
  const [perfectCount, setPerfectCount] = useState(0);
  const [faultyCount, setFaultyCount] = useState(0);
  const [faultDescription, setFaultDescription] = useState('');
  const [overallRemarks, setOverallRemarks] = useState('');
  const [inspectMediaFiles, setInspectMediaFiles] = useState([]);
  const [complaintMediaMap, setComplaintMediaMap] = useState({});
  const [submittingInspect, setSubmittingInspect] = useState(false);

  // Final Payment Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentDispatch, setPaymentDispatch] = useState(null);
  const [finalAmount, setFinalAmount] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [releasingPayment, setReleasingPayment] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dRes, cRes, mRes, uRes] = await Promise.all([
        api.getDispatches(),
        api.getComplaints(),
        api.getMedia('customer_inspection'),
        api.getUsers()
      ]);
      setDispatches(dRes.data || []);
      setComplaints(cRes.data || []);
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
      (mRes.data || []).forEach((m) => {
        grouped[m.entity_id] = grouped[m.entity_id] || [];
        grouped[m.entity_id].push(m);
      });
      setComplaintMediaMap(grouped);
    } catch (err) {
      alert('Error fetching customer portal data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (preselectedDispatch) {
      openInspection(preselectedDispatch);
    }
  }, [preselectedDispatch]);

  const openInspection = (dispatchItem) => {
    setSelectedDispatch(dispatchItem);
    const target = dispatchItem.total_packages * 10 || 10;
    setPerfectCount(target);
    setFaultyCount(0);
    setFaultDescription('');
    setOverallRemarks('Goods arrived in intact outer packaging. Verified functional performance at factory site.');
    setInspectMediaFiles([]);
    setShowInspectionModal(true);
  };

  const handleInspectionSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDispatch) return;

    setSubmittingInspect(true);
    try {
      const overall = (faultyCount > 0) ? 'accepted_with_faults' : 'accepted_perfect';
      const payload = {
        dispatch_id: selectedDispatch.id,
        inspected_by_name: inspectorName,
        overall_status: overall,
        remarks: overallRemarks,
        items: [
          {
            product_id: selectedDispatch.product_id || 1,
            total_received: Number(perfectCount) + Number(faultyCount),
            perfect_qty: Number(perfectCount),
            faulty_qty: Number(faultyCount),
            fault_description: faultyCount > 0 ? faultDescription : null
          }
        ]
      };

      const res = await api.inspectDelivery(payload);
      if (inspectMediaFiles.length > 0 && selectedDispatch?.id) {
        await api.uploadMedia('customer_inspection', selectedDispatch.id, inspectMediaFiles, currentUser?.id || 1);
      }
      alert(res.message + (res.data?.complaint_ticket ? `\nAuto-generated Complaint RMA Ticket: ${res.data.complaint_ticket}` : ''));
      setInspectMediaFiles([]);
      setShowInspectionModal(false);
      loadData();
    } catch (err) {
      alert('Failed to record customer inspection: ' + err.message);
    } finally {
      setSubmittingInspect(false);
    }
  };

  const openPaymentRelease = (dispatchItem) => {
    setPaymentDispatch(dispatchItem);
    setFinalAmount(132750);
    setTransactionRef(`SETTLE-UTR-${Math.floor(10000000 + Math.random() * 90000000)}`);
    setShowPaymentModal(true);
  };

  const handleReleasePayment = async (e) => {
    e.preventDefault();
    if (!paymentDispatch) return;

    setReleasingPayment(true);
    try {
      const res = await api.releaseFinalPayment({
        po_id: paymentDispatch.po_id,
        amount: Number(finalAmount),
        transaction_reference: transactionRef,
        notes: 'Final balance released following customer inward quality acceptance'
      });
      alert(res.message);
      setShowPaymentModal(false);
      loadData();
      if (onPaymentReleased) onPaymentReleased();
    } catch (err) {
      alert('Failed to release final payment: ' + err.message);
    } finally {
      setReleasingPayment(false);
    }
  };

  const handleAssignTicket = async (ticketId, userId) => {
    try {
      await api.updateComplaint(ticketId, { assigned_to: userId || null });
      loadData();
    } catch (err) {
      alert('Failed to assign ticket: ' + err.message);
    }
  };

  const handleResolveTicket = async (ticketId) => {
    const notes = prompt('Enter resolution notes / replacement dispatch details:');
    if (!notes) return;
    try {
      await api.updateComplaint(ticketId, {
        status: 'resolved',
        return_material_status: 'replacement_issued',
        resolution_notes: notes
      });
      alert('Ticket resolved successfully! Replacement recorded.');
      loadData();
    } catch (err) {
      alert('Failed to resolve ticket: ' + err.message);
    }
  };

  return (
    <div className="space-y-3.5">
      
      {/* Header (ShadCN style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">
              Stage 11 & 12: Customer QC, RMA Tickets & Settlement
            </h1>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              Customer Assurance
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Client item-by-item verification (Perfect vs Faulty), automated RMA tickets, and final payment release.
          </p>
        </div>

        {onOpenAudit && (
          <button
            onClick={() => onOpenAudit('customer_portal')}
            className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
          >
            <History className="h-3.5 w-3.5" /> RMA Audit Trail
          </button>
        )}
      </div>

      {/* Dispatches Available for Inspection */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden divide-y divide-slate-100">
        <div className="p-3 bg-slate-50/80 border-b border-slate-200 flex justify-between items-center text-xs">
          <span className="font-semibold text-slate-700">Delivered Shipments Awaiting Client Acceptance</span>
          <span className="text-slate-400">{dispatches.length} Total</span>
        </div>

        {dispatches.map((d) => (
          <div key={d.id} className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-block whitespace-nowrap shrink-0 font-mono text-[11px] font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                  {d.dispatch_number}
                </span>
                <span className="font-semibold text-slate-900 text-xs">{d.product_name}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 break-words">
                Client: {d.customer_name} • Carrier: {d.courier_name} ({d.tracking_number}) • Challan: {d.delivery_challan_no}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {hasPermission(currentUser, 'customer_portal', 'inspect') && (
                <button
                  type="button"
                  onClick={() => openInspection(d)}
                  className="h-7 px-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <PackageCheck className="h-3 w-3 shrink-0" />
                  <span>{d.customer_inspected > 0 ? 'Re-Inspect' : 'Client QC Check'}</span>
                </button>
              )}

              {hasPermission(currentUser, 'payments', 'create') && (
                <button
                  type="button"
                  onClick={() => openPaymentRelease(d)}
                  className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="h-3 w-3 shrink-0" />
                  <span>Release Final Pay</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* RMA Complaint Tickets */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-3 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-rose-700 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> RMA Complaint Tickets & Defect Return Requests ({filteredComplaints.length})
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="h-3 w-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search ticket #, issue, assignee..."
                value={complaintSearch}
                onChange={(e) => setComplaintSearch(e.target.value)}
                className="pl-7 pr-2.5 py-1 text-xs bg-white border border-slate-200 rounded-md"
              />
            </div>
            <select
              value={complaintStatusFilter}
              onChange={(e) => setComplaintStatusFilter(e.target.value)}
              className="py-1 px-2 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="under_investigation">Under Investigation</option>
              <option value="resolved">Resolved</option>
            </select>
            <button
              type="button"
              onClick={() =>
                exportToCsv(
                  'rma_complaints',
                  [
                    { header: 'Ticket #', accessor: 'ticket_number' },
                    { header: 'Title', accessor: 'title' },
                    { header: 'Issue Details', accessor: 'issue_details' },
                    { header: 'RMA Return Status', accessor: 'return_material_status' },
                    { header: 'Assigned To', accessor: (c) => c.assigned_to_name || 'Unassigned' },
                    { header: 'Status', accessor: 'status' }
                  ],
                  filteredComplaints
                )
              }
              title="Export filtered tickets"
              className="h-7 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
            >
              <Download className="h-3 w-3" /> Export
            </button>
          </div>
        </div>

        {filteredComplaints.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            No active complaints. All customer deliveries accepted as 100% Perfect!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/50 text-slate-600 border-b border-slate-200 font-semibold">
              <tr>
                <th className="px-3 py-2 w-10 text-center">#</th>
                <th className="px-3.5 py-2">Ticket #</th>
                <th className="px-3.5 py-2">Customer & Issue</th>
                <th className="px-3.5 py-2">RMA Return Status</th>
                <th className="px-3.5 py-2">Assigned To</th>
                <th className="px-3.5 py-2">Evidence</th>
                <th className="px-3.5 py-2">Status</th>
                <th className="px-3.5 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {complaintsPagination.paginatedItems.map((c, idx) => (
                <tr key={c.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">
                    {complaintsPagination.startIndex + idx + 1}
                  </td>
                  <td className="px-3.5 py-2 font-mono font-semibold text-rose-700">{c.ticket_number}</td>
                  <td className="px-3.5 py-2">
                    <p className="font-semibold text-slate-900">{c.title}</p>
                    <p className="text-[11px] text-slate-500 truncate max-w-xs">{c.issue_details}</p>
                  </td>
                  <td className="px-3.5 py-2 text-[11px] text-slate-700 uppercase font-medium">
                    {c.return_material_status?.replace('_', ' ')}
                  </td>
                  <td className="px-3.5 py-2">
                    <select
                      aria-label={`Assign ticket ${c.ticket_number}`}
                      value={c.assigned_to || ''}
                      onChange={(e) => handleAssignTicket(c.id, e.target.value)}
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
                  <td className="px-3.5 py-2">
                    <MediaGallery attachments={complaintMediaMap[c.dispatch_id] || complaintMediaMap[c.id] || []} />
                  </td>
                  <td className="px-3.5 py-2">
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase ${
                      c.status === 'resolved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3.5 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      disabled={
                        c.status === 'resolved' ||
                        !(currentUser?.role_id === 1 || currentUser?.role_slug === 'admin' || currentUser?.role_slug === 'qc')
                      }
                      onClick={() => handleResolveTicket(c.id)}
                      className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-medium whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Resolve &amp; Replace
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
        {!loading && (
          <Pagination
            currentPage={complaintsPagination.currentPage}
            totalPages={complaintsPagination.totalPages}
            totalItems={complaintsPagination.totalItems}
            pageSize={complaintsPagination.pageSize}
            onPageChange={complaintsPagination.setCurrentPage}
          />
        )}
      </div>

      {/* INSPECTION MODAL */}
      {showInspectionModal && selectedDispatch && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-sm w-full p-4 shadow-lg border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-0.5">Client Inward Quality Check</h3>
            <p className="text-xs text-slate-500 mb-3">Dispatch #{selectedDispatch.dispatch_number}</p>

            <form onSubmit={handleInspectionSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-emerald-50/60 p-2.5 rounded border border-emerald-200">
                  <label className="block text-[11px] font-semibold text-emerald-800 mb-1 flex items-center gap-1">
                    <ThumbsUp className="h-3 w-3 text-emerald-600" /> Perfect Units
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={perfectCount}
                    onChange={(e) => setPerfectCount(e.target.value)}
                    className="w-full p-1 border border-emerald-300 rounded text-xs font-bold text-emerald-800"
                  />
                </div>
                <div className="bg-rose-50/60 p-2.5 rounded border border-rose-200">
                  <label className="block text-[11px] font-semibold text-rose-800 mb-1 flex items-center gap-1">
                    <ThumbsDown className="h-3 w-3 text-rose-600" /> Faulty Units
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={faultyCount}
                    onChange={(e) => setFaultyCount(e.target.value)}
                    className="w-full p-1 border border-rose-300 rounded text-xs font-bold text-rose-800"
                  />
                </div>
              </div>

              {Number(faultyCount) > 0 && (
                <div>
                  <label className="block font-medium text-rose-700 mb-1">Defect Description for RMA *</label>
                  <textarea
                    rows="2"
                    required
                    placeholder="e.g. 2 units showed excessive motor vibration..."
                    value={faultDescription}
                    onChange={(e) => setFaultDescription(e.target.value)}
                    className="w-full p-1.5 border border-rose-200 rounded text-xs"
                  />
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">Remarks</label>
                <textarea
                  rows="2"
                  value={overallRemarks}
                  onChange={(e) => setOverallRemarks(e.target.value)}
                  className="w-full p-1.5 border border-slate-200 rounded text-xs"
                />
              </div>

              <MediaUploader
                files={inspectMediaFiles}
                onChange={setInspectMediaFiles}
                label="Inspection / Defect Evidence (Photos, Videos, Docs)"
              />

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowInspectionModal(false)}
                  className="h-8 px-3 border border-slate-200 text-slate-600 rounded-md font-medium text-xs hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingInspect}
                  className="h-8 px-3.5 bg-slate-900 text-white rounded-md font-medium text-xs hover:bg-slate-800"
                >
                  {submittingInspect ? 'Saving...' : 'Confirm Inward QC'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FINAL PAYMENT RELEASE MODAL */}
      {showPaymentModal && paymentDispatch && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-sm w-full p-4 shadow-lg border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-0.5">Release Final Milestone Payment</h3>
            <p className="text-xs text-slate-500 mb-3">Stage 12: Order Lifecycle Settlement</p>

            <form onSubmit={handleReleasePayment} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Settlement Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={finalAmount}
                  onChange={(e) => setFinalAmount(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded font-bold text-emerald-700"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Bank UTR / Transaction Reference *</label>
                <input
                  type="text"
                  required
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded font-mono"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="h-8 px-3 border border-slate-200 text-slate-600 rounded-md font-medium text-xs hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={releasingPayment}
                  className="h-8 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-medium text-xs"
                >
                  {releasingPayment ? 'Releasing...' : 'Confirm Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
