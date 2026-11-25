// client/src/views/QuotationDetailView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  History,
  Save,
  FileSpreadsheet,
  Building2,
  Calendar,
  Download
} from 'lucide-react';
import { hasPermission } from '../utils/rbac';
import Pagination, { usePagination } from '../components/Pagination';
import { exportToCsv } from '../utils/exportCsv';

const DEFAULT_TERMS =
  '1. 50% advance on PO confirmation, balance 50% prior to dispatch.\n' +
  '2. Delivery lead time: 3 weeks.\n' +
  '3. Standard 12-month factory defect warranty.';

function getDefaultValidUntil() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
}

export default function QuotationDetailView({
  currentUser,
  quotationId,
  mode = 'view', // 'create' | 'edit' | 'view'
  preselectedLead,
  onBack,
  onNavigateMode,
  onGeneratePO,
  onViewPO,
  onOpenAudit,
  onSaved
}) {
  const isCreate = mode === 'create';
  const isEdit = mode === 'edit';
  const isView = mode === 'view';
  const isFormMode = isCreate || isEdit;

  const [quotation, setQuotation] = useState(null);
  const [approvedLeads, setApprovedLeads] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const viewItemsPagination = usePagination(quotation?.items || [], 10);

  const [formData, setFormData] = useState({
    lead_id: '',
    valid_until: getDefaultValidUntil(),
    terms_conditions: DEFAULT_TERMS,
    remarks: '',
    status: 'draft',
    items: [{ product_id: '', quantity: 1, unit_price: 0, tax_percent: 18 }]
  });

  const loadData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const promises = [api.getProducts()];
      if (isCreate) {
        promises.push(api.getLeads('approved'));
      } else if (quotationId) {
        promises.push(api.getQuotation(quotationId));
      }

      const results = await Promise.all(promises);
      setProducts(results[0].data || []);

      if (isCreate) {
        const leads = results[1]?.data || [];
        setApprovedLeads(leads);
        setQuotation(null);
        setFormData({
          lead_id: preselectedLead?.status === 'approved' ? String(preselectedLead.id) : '',
          valid_until: getDefaultValidUntil(),
          terms_conditions: DEFAULT_TERMS,
          remarks: '',
          status: 'draft',
          items: [{ product_id: '', quantity: 1, unit_price: 0, tax_percent: 18 }]
        });
      } else if (results[1]?.data) {
        const q = results[1].data;
        setQuotation(q);
        setFormData({
          lead_id: String(q.lead_id || ''),
          valid_until: q.valid_until || getDefaultValidUntil(),
          terms_conditions: q.terms_conditions || DEFAULT_TERMS,
          remarks: q.remarks || '',
          status: q.status || 'draft',
          items:
            q.items && q.items.length > 0
              ? q.items.map((it) => ({
                  product_id: String(it.product_id),
                  quantity: Number(it.quantity),
                  unit_price: Number(it.unit_price),
                  tax_percent: Number(it.tax_percent ?? 18)
                }))
              : [{ product_id: '', quantity: 1, unit_price: 0, tax_percent: 18 }]
        });
      }
    } catch (err) {
      setErrorMsg('Failed to load quotation data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [quotationId, mode, preselectedLead]);

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { product_id: '', quantity: 1, unit_price: 0, tax_percent: 18 }]
    }));
  };

  const removeItem = (idx) => {
    if (formData.items.length === 1) return;
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx)
    }));
  };

  const updateItem = (idx, field, val) => {
    setFormData((prev) => {
      const updated = prev.items.map((item, i) => {
        if (i !== idx) return item;
        const next = { ...item, [field]: val };
        if (field === 'product_id') {
          const prod = products.find((p) => String(p.id) === String(val));
          if (prod) {
            next.unit_price = Number(prod.unit_price);
          }
        }
        return next;
      });
      return { ...prev, items: updated };
    });
  };

  const subtotal = formData.items.reduce(
    (acc, it) => acc + Number(it.quantity || 0) * Number(it.unit_price || 0),
    0
  );
  const taxAmount = formData.items.reduce((acc, it) => {
    const lineTotal = Number(it.quantity || 0) * Number(it.unit_price || 0);
    return acc + lineTotal * (Number(it.tax_percent ?? 18) / 100);
  }, 0);
  const grandTotal = subtotal + taxAmount;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');

    if (isCreate && !formData.lead_id) {
      setErrorMsg('Please select an approved lead.');
      document.getElementById('quote-lead-id')?.focus();
      return;
    }

    const hasInvalidProduct = formData.items.some((it) => !it.product_id);
    if (hasInvalidProduct) {
      setErrorMsg('Please select a product for every line item.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        created_by: currentUser?.id || 1,
        items: formData.items.map((it) => ({
          product_id: Number(it.product_id),
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          tax_percent: Number(it.tax_percent ?? 18)
        }))
      };

      if (isCreate) {
        const res = await api.createQuotation(payload);
        const createdId = res.data?.id;
        setStatusMsg('Quotation created successfully.');
        if (onSaved) onSaved();
        if (createdId && onNavigateMode) {
          onNavigateMode(createdId, 'view');
        } else {
          onBack();
        }
      } else if (isEdit && quotationId) {
        await api.updateQuotation(quotationId, payload);
        setStatusMsg('Quotation updated successfully.');
        if (onSaved) onSaved();
        if (onNavigateMode) {
          onNavigateMode(quotationId, 'view');
        } else {
          loadData();
        }
      }
    } catch (err) {
      setErrorMsg('Failed to save quotation: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!window.confirm('Mark this quotation as APPROVED by client?')) return;
    try {
      await api.approveQuotation(quotationId);
      setStatusMsg('Quotation approved.');
      if (onSaved) onSaved();
      loadData();
    } catch (err) {
      setErrorMsg('Approval failed: ' + err.message);
    }
  };

  const handleReject = async () => {
    const reason = prompt('Please enter reason for quotation rejection:');
    if (!reason) return;
    try {
      await api.rejectQuotation(quotationId, reason);
      setStatusMsg('Quotation marked as rejected.');
      if (onSaved) onSaved();
      loadData();
    } catch (err) {
      setErrorMsg('Rejection failed: ' + err.message);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this draft quotation? This cannot be undone.')) return;
    try {
      await api.deleteQuotation(quotationId);
      if (onSaved) onSaved();
      onBack();
    } catch (err) {
      setErrorMsg('Delete failed: ' + err.message);
    }
  };

  const selectedLeadObj = isCreate
    ? approvedLeads.find((l) => String(l.id) === String(formData.lead_id))
    : null;

  const canCreateOrEdit = hasPermission(currentUser, 'quotations', 'create');
  const canApprove = hasPermission(currentUser, 'quotations', 'approve');
  const canCreatePO = hasPermission(currentUser, 'purchase_orders', 'create');

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200/90 p-8 text-center text-xs text-slate-500">
        Loading quotation workspace...
      </div>
    );
  }

  if (!isCreate && !quotation) {
    return (
      <div className="bg-white rounded-lg border border-slate-200/90 p-8 text-center space-y-3">
        <p className="text-xs text-rose-600 font-medium">{errorMsg || 'Quotation not found.'}</p>
        <button
          type="button"
          onClick={onBack}
          title="Back to Quotations"
          aria-label="Back to Quotations"
          className="p-1.5 bg-slate-900 text-white rounded-md inline-flex items-center justify-center hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* Top Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            title="Back to Quotations"
            aria-label="Back to Quotations"
            className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-slate-700" />
              <h1 className="text-base font-semibold text-slate-900 tracking-tight">
                {isCreate
                  ? 'Create Commercial Quotation'
                  : isEdit
                  ? `Edit Quotation: ${quotation.quotation_number}`
                  : `Quotation: ${quotation.quotation_number}`}
              </h1>

              {isCreate ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                  New Proposal
                </span>
              ) : (
                <>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700 border border-slate-200">
                    R{quotation.revision_number}
                  </span>
                  {quotation.status === 'approved' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="h-3 w-3" /> Approved
                    </span>
                  )}
                  {quotation.status === 'draft' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <Clock className="h-3 w-3" /> Draft
                    </span>
                  )}
                  {quotation.status === 'rejected' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                      <XCircle className="h-3 w-3" /> Rejected
                    </span>
                  )}
                </>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isCreate
                ? 'Select an approved lead, configure line items, unit rates, GST, and commercial terms.'
                : isEdit
                ? 'Update line items, pricing, validity date, and commercial terms.'
                : `Issued on ${quotation.quotation_date} • Valid until ${quotation.valid_until}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenAudit && (
            <button
              type="button"
              onClick={() => onOpenAudit('quotations')}
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
            >
              <History className="h-3.5 w-3.5" /> Audit Trail
            </button>
          )}

          {isView && quotationId && (
            <>
              <a
                href={api.getQuotationPdfUrl(quotationId)}
                target="_blank"
                rel="noreferrer"
                className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-rose-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
                title="Download Quotation PDF"
              >
                <Download className="h-3.5 w-3.5" /> PDF
              </a>
              <a
                href={api.getQuotationExcelUrl(quotationId)}
                target="_blank"
                rel="noreferrer"
                className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-emerald-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
                title="Download Quotation Excel"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
              </a>
            </>
          )}

          {isView && quotation.status !== 'approved' && canCreateOrEdit && (
            <button
              type="button"
              onClick={() => onNavigateMode(quotationId, 'edit')}
              className="h-8 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-md text-xs font-medium flex items-center gap-1.5 shadow-xs"
            >
              <Edit3 className="h-3.5 w-3.5" /> Edit Quotation
            </button>
          )}

          {isView && quotation.status === 'draft' && canCreateOrEdit && (
            <button
              type="button"
              onClick={handleDelete}
              className="h-8 px-2.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}

          {isView && quotation.status === 'draft' && canApprove && (
            <>
              <button
                type="button"
                onClick={handleApprove}
                className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-medium text-xs shadow-xs"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={handleReject}
                className="h-8 px-3 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-md font-medium text-xs shadow-xs"
              >
                Reject
              </button>
            </>
          )}

          {isView && quotation.status === 'approved' && canCreatePO && (
            <button
              type="button"
              onClick={() => onGeneratePO(quotation)}
              className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-xs inline-flex items-center gap-1.5 shadow-xs"
            >
              + Generate PO <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Live Status / Error Feedback */}
      <div aria-live="polite">
        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
            {errorMsg}
          </div>
        )}
        {statusMsg && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
            {statusMsg}
          </div>
        )}
      </div>

      {/* Main Content Form / View */}
      <form onSubmit={handleSubmit} className="space-y-3.5" aria-label="Commercial Quotation Form">
        {/* Section 1: Lead, Customer & Dates */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          <div className="lg:col-span-2 bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs space-y-3">
            <h2 className="text-xs font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-slate-500" />
              Lead & Customer Details
            </h2>

            {isCreate ? (
              <div className="space-y-3">
                <div>
                  <label htmlFor="quote-lead-id" className="block text-xs font-medium text-slate-700 mb-1">
                    Approved Lead <span className="text-rose-600" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="quote-lead-id"
                    name="lead_id"
                    required
                    value={formData.lead_id}
                    onChange={(e) => setFormData({ ...formData, lead_id: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs bg-white focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="">-- Choose Approved Lead --</option>
                    {approvedLeads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.lead_number}: {l.title} ({l.customer_name})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedLeadObj && (
                  <div className="p-3 bg-slate-50 rounded-md border border-slate-200 text-xs space-y-1">
                    <p className="font-semibold text-slate-900">{selectedLeadObj.customer_name}</p>
                    <p className="text-slate-600">
                      Lead: <span className="font-mono font-medium">{selectedLeadObj.lead_number}</span> — {selectedLeadObj.title}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-md border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer</span>
                  <p className="font-semibold text-slate-900">{quotation.customer_name}</p>
                  {quotation.customer_address && <p className="text-slate-500">{quotation.customer_address}</p>}
                  {quotation.customer_gst && (
                    <p className="text-slate-600 font-mono text-[11px]">GST: {quotation.customer_gst}</p>
                  )}
                  {(quotation.customer_email || quotation.customer_phone) && (
                    <p className="text-slate-500">
                      {[quotation.customer_email, quotation.customer_phone].filter(Boolean).join(' • ')}
                    </p>
                  )}
                </div>

                <div className="p-3 bg-slate-50 rounded-md border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Linked Lead</span>
                  <p className="font-mono font-semibold text-slate-900">{quotation.lead_number}</p>
                  <p className="text-slate-600">{quotation.lead_title}</p>
                  <p className="text-slate-500 text-[11px]">
                    Quote Date: {quotation.quotation_date} • Rev #{quotation.revision_number}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Validity & Remarks */}
          <div className="bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs space-y-3">
            <h2 className="text-xs font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              Validity & Notes
            </h2>

            <div>
              <label htmlFor="quote-valid-until" className="block text-xs font-medium text-slate-700 mb-1">
                Valid Until
              </label>
              {isFormMode ? (
                <input
                  id="quote-valid-until"
                  name="valid_until"
                  type="date"
                  value={formData.valid_until}
                  onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-slate-900"
                />
              ) : (
                <p className="p-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-medium text-slate-800">
                  {quotation.valid_until || '—'}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="quote-remarks" className="block text-xs font-medium text-slate-700 mb-1">
                Internal / Revision Remarks
              </label>
              {isFormMode ? (
                <textarea
                  id="quote-remarks"
                  name="remarks"
                  rows="2"
                  placeholder="Optional notes or revision summary..."
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs resize-y"
                />
              ) : (
                <p className="p-2 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600 min-h-[3.25rem] whitespace-pre-wrap">
                  {quotation.remarks || 'No remarks recorded.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Quotation Line Items */}
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/80 bg-slate-50/50">
            <div>
              <h2 className="text-xs font-semibold text-slate-900">Quotation Line Items</h2>
              <p className="text-[11px] text-slate-500">
                {isFormMode
                  ? 'Add products, specify quantities, unit rates, and applicable GST %.'
                  : `${quotation.items?.length || 0} line item(s) in this proposal.`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isView && (quotation?.items || []).length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    exportToCsv(
                      `quotation_${quotation.quotation_number}_items`,
                      [
                        { header: 'Product', accessor: 'product_name' },
                        { header: 'SKU', accessor: 'product_sku' },
                        { header: 'Qty', accessor: (it) => `${it.quantity} ${it.uom || ''}`.trim() },
                        { header: 'Unit Rate', accessor: 'unit_price' },
                        { header: 'Tax %', accessor: (it) => it.tax_percent ?? 18 },
                        { header: 'Line Total', accessor: 'total_price' }
                      ],
                      quotation.items
                    )
                  }
                  className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
                >
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
              )}
              {isFormMode && (
                <button
                  type="button"
                  onClick={addItem}
                  className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Product
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="px-3 py-2.5 w-10 text-center">#</th>
                  <th className="px-4 py-2.5">Product {isFormMode && '*'}</th>
                  <th className="px-3 py-2.5 w-28 text-center">Qty {isFormMode && '*'}</th>
                  <th className="px-3 py-2.5 w-36 text-right">Unit Rate (₹) {isFormMode && '*'}</th>
                  <th className="px-3 py-2.5 w-24 text-center">Tax (%)</th>
                  <th className="px-4 py-2.5 w-36 text-right">Line Total (inc. Tax)</th>
                  {isFormMode && <th className="px-3 py-2.5 w-14 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isFormMode
                  ? formData.items.map((item, idx) => {
                      const lineSub = Number(item.quantity || 0) * Number(item.unit_price || 0);
                      const lineIncTax = lineSub * (1 + Number(item.tax_percent ?? 18) / 100);
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-2.5">
                            <label htmlFor={`item-product-${idx}`} className="sr-only">
                              Product for row {idx + 1}
                            </label>
                            <select
                              id={`item-product-${idx}`}
                              name={`items[${idx}][product_id]`}
                              required
                              value={item.product_id}
                              onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                              className="w-full p-2 border border-slate-200 rounded-md text-xs bg-white"
                            >
                              <option value="">-- Select Product --</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.sku} - {p.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2.5">
                            <label htmlFor={`item-qty-${idx}`} className="sr-only">
                              Quantity for row {idx + 1}
                            </label>
                            <input
                              id={`item-qty-${idx}`}
                              name={`items[${idx}][quantity]`}
                              type="number"
                              min="1"
                              required
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                              className="w-full p-2 border border-slate-200 rounded-md text-xs text-center"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <label htmlFor={`item-rate-${idx}`} className="sr-only">
                              Unit rate for row {idx + 1}
                            </label>
                            <input
                              id={`item-rate-${idx}`}
                              name={`items[${idx}][unit_price]`}
                              type="number"
                              step="0.01"
                              min="0"
                              required
                              value={item.unit_price}
                              onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                              className="w-full p-2 border border-slate-200 rounded-md text-xs text-right font-medium"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <label htmlFor={`item-tax-${idx}`} className="sr-only">
                              Tax percentage for row {idx + 1}
                            </label>
                            <input
                              id={`item-tax-${idx}`}
                              name={`items[${idx}][tax_percent]`}
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.tax_percent}
                              onChange={(e) => updateItem(idx, 'tax_percent', e.target.value)}
                              className="w-full p-2 border border-slate-200 rounded-md text-xs text-center"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                            ₹{lineIncTax.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {formData.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                title="Remove line item"
                                aria-label={`Remove line item ${idx + 1}`}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  : viewItemsPagination.paginatedItems.map((it, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">
                          {viewItemsPagination.startIndex + idx + 1}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-slate-900">{it.product_name}</p>
                          {it.product_sku && (
                            <span className="text-[10px] font-mono text-slate-400">{it.product_sku}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {it.quantity} {it.uom}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          ₹{Number(it.unit_price).toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-center">{Number(it.tax_percent ?? 18)}%</td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                          ₹{Number(it.total_price).toLocaleString()}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {isView && (
            <Pagination
              currentPage={viewItemsPagination.currentPage}
              totalPages={viewItemsPagination.totalPages}
              totalItems={viewItemsPagination.totalItems}
              pageSize={viewItemsPagination.pageSize}
              onPageChange={viewItemsPagination.setCurrentPage}
            />
          )}
        </div>

        {/* Section 3: Commercial Terms & Financial Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          <div className="lg:col-span-2 bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs">
            <label htmlFor="quote-terms" className="block text-xs font-semibold text-slate-800 mb-1.5">
              Commercial Terms & Conditions
            </label>
            {isFormMode ? (
              <textarea
                id="quote-terms"
                name="terms_conditions"
                rows="4"
                value={formData.terms_conditions}
                onChange={(e) => setFormData({ ...formData, terms_conditions: e.target.value })}
                className="w-full p-2.5 border border-slate-200 rounded-md text-xs resize-y focus:ring-1 focus:ring-slate-900"
              />
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700 whitespace-pre-wrap">
                {quotation.terms_conditions || 'Standard commercial terms apply.'}
              </div>
            )}
          </div>

          <div className="bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs flex flex-col justify-between space-y-3">
            <div className="space-y-2 text-xs">
              <h2 className="font-semibold text-slate-800 uppercase tracking-wider text-[11px]">
                Pricing Summary
              </h2>
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-medium text-slate-900">
                  ₹{(isFormMode ? subtotal : Number(quotation.subtotal)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax (GST)</span>
                <span className="font-medium text-slate-900">
                  ₹{(isFormMode ? taxAmount : Number(quotation.tax_amount)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-bold text-slate-900">
                <span>Grand Total</span>
                <span>
                  ₹{(isFormMode ? grandTotal : Number(quotation.total_amount)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {isFormMode && (
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    if (isEdit && quotationId && onNavigateMode) {
                      onNavigateMode(quotationId, 'view');
                    } else {
                      onBack();
                    }
                  }}
                  className="h-9 px-3.5 border border-slate-200 text-slate-700 rounded-md font-medium text-xs hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-9 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-md font-medium text-xs inline-flex items-center gap-1.5 shadow-xs"
                >
                  <Save className="h-3.5 w-3.5" />
                  {submitting
                    ? 'Saving...'
                    : isCreate
                    ? 'Save & Issue'
                    : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Linked Purchase Orders in View Mode */}
        {isView && quotation.purchase_orders && quotation.purchase_orders.length > 0 && (
          <div className="bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs space-y-2">
            <h2 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
              Linked Customer Purchase Orders
            </h2>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
              {quotation.purchase_orders.map((po) => (
                <div key={po.id} className="px-3 py-2 flex items-center justify-between text-xs">
                  <div>
                    {onViewPO ? (
                      <button
                        type="button"
                        onClick={() => onViewPO(po.id)}
                        className="font-mono font-semibold text-sky-700 hover:underline"
                      >
                        {po.po_number}
                      </button>
                    ) : (
                      <span className="font-mono font-semibold text-slate-900">{po.po_number}</span>
                    )}
                    <span className="text-slate-500 ml-2">Date: {po.po_date}</span>
                  </div>
                  <span className="font-semibold text-slate-900">
                    ₹{Number(po.total_amount).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
