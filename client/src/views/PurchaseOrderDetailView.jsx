// client/src/views/PurchaseOrderDetailView.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit3,
  FileCheck2,
  Building2,
  Calendar,
  History,
  Save,
  Download,
  Boxes,
  Receipt,
  RefreshCw,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { hasPermission } from '../utils/rbac';
import Pagination, { usePagination } from '../components/Pagination';
import { exportToCsv } from '../utils/exportCsv';
import { MediaUploader, MediaGallery } from '../components/MediaUploader';

const DEFAULT_PAYMENT_TERMS = '50% Advance on PO confirmation, 50% upon Level 5 QC & Dispatch';

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function getDefaultDeadline() {
  const d = new Date();
  d.setDate(d.getDate() + 21);
  return d.toISOString().split('T')[0];
}

function mapQuoteItemsToPOItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return [{ product_id: '', quantity: 1, unit_price: 0, tax_percent: 18 }];
  }
  return items.map((it) => ({
    product_id: String(it.product_id),
    quantity: Number(it.quantity),
    unit_price: Number(it.unit_price),
    tax_percent: Number(it.tax_percent ?? 18)
  }));
}

export default function PurchaseOrderDetailView({
  currentUser,
  poId,
  mode = 'view', // 'create' | 'edit' | 'view'
  preselectedQuote,
  onBack,
  onNavigateMode,
  onCheckMaterials,
  onRecordPayment,
  onViewWorkOrder,
  onOpenAudit,
  onSaved
}) {
  const isCreate = mode === 'create';
  const isEdit = mode === 'edit';
  const isView = mode === 'view';
  const isFormMode = isCreate || isEdit;

  const [purchaseOrder, setPurchaseOrder] = useState(null);
  const [approvedQuotations, setApprovedQuotations] = useState([]);
  const [selectedQuoteDetails, setSelectedQuoteDetails] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingQuoteItems, setLoadingQuoteItems] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [touched, setTouched] = useState({});
  const [mediaFiles, setMediaFiles] = useState([]);

  const viewItemsPagination = usePagination(purchaseOrder?.items || [], 10);

  const [formData, setFormData] = useState({
    quotation_id: '',
    customer_po_reference: '',
    po_date: getTodayDate(),
    delivery_deadline: getDefaultDeadline(),
    payment_terms: DEFAULT_PAYMENT_TERMS,
    status: 'received',
    notes: '',
    items: [{ product_id: '', quantity: 1, unit_price: 0, tax_percent: 18 }]
  });

  const applyQuoteItems = useCallback(async (quotationId) => {
    if (!quotationId) {
      setSelectedQuoteDetails(null);
      return;
    }
    setLoadingQuoteItems(true);
    try {
      const qRes = await api.getQuotation(quotationId);
      const qData = qRes.data || null;
      setSelectedQuoteDetails(qData);
      if (qData?.items) {
        setFormData((prev) => ({
          ...prev,
          quotation_id: String(quotationId),
          items: mapQuoteItemsToPOItems(qData.items)
        }));
      }
    } catch (err) {
      setErrorMsg('Failed to load quotation line items: ' + err.message);
    } finally {
      setLoadingQuoteItems(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    setTouched({});
    setMediaFiles([]);
    try {
      const promises = [api.getProducts()];
      if (isCreate) {
        promises.push(api.getQuotations());
      } else if (poId) {
        promises.push(api.getPurchaseOrder(poId));
      }

      const results = await Promise.all(promises);
      setProducts(results[0].data || []);

      if (isCreate) {
        const allQuotes = results[1]?.data || [];
        const approved = allQuotes.filter((q) => q.status === 'approved');
        setApprovedQuotations(approved);
        setPurchaseOrder(null);

        const initialQuoteId =
          preselectedQuote?.status === 'approved' ? String(preselectedQuote.id) : '';

        setFormData({
          quotation_id: initialQuoteId,
          customer_po_reference: initialQuoteId
            ? `CLIENT-PO-${Math.floor(1000 + Math.random() * 9000)}`
            : '',
          po_date: getTodayDate(),
          delivery_deadline: getDefaultDeadline(),
          payment_terms: DEFAULT_PAYMENT_TERMS,
          status: 'received',
          notes: '',
          items: [{ product_id: '', quantity: 1, unit_price: 0, tax_percent: 18 }]
        });

        if (initialQuoteId) {
          await applyQuoteItems(initialQuoteId);
        } else {
          setSelectedQuoteDetails(null);
        }
      } else if (results[1]?.data) {
        const po = results[1].data;
        setPurchaseOrder(po);
        setFormData({
          quotation_id: String(po.quotation_id || ''),
          customer_po_reference: po.customer_po_reference || '',
          po_date: po.po_date || getTodayDate(),
          delivery_deadline: po.delivery_deadline || getDefaultDeadline(),
          payment_terms: po.payment_terms || DEFAULT_PAYMENT_TERMS,
          status: po.status || 'received',
          notes: po.notes || '',
          items: mapQuoteItemsToPOItems(po.items || [])
        });
      }
    } catch (err) {
      setErrorMsg('Failed to load purchase order data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [isCreate, mode, poId, preselectedQuote, applyQuoteItems]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleQuotationChange = async (nextQuoteId) => {
    setFormData((prev) => ({ ...prev, quotation_id: nextQuoteId }));
    if (nextQuoteId) {
      await applyQuoteItems(nextQuoteId);
    } else {
      setSelectedQuoteDetails(null);
    }
  };

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
    const lineSub = Number(it.quantity || 0) * Number(it.unit_price || 0);
    return acc + lineSub * (Number(it.tax_percent ?? 18) / 100);
  }, 0);
  const grandTotal = subtotal + taxAmount;

  const markTouched = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const isQuoteInvalid = isCreate && touched.quotation_id && !formData.quotation_id;
  const isRefInvalid = isFormMode && touched.customer_po_reference && !formData.customer_po_reference.trim();
  const isDeadlineInvalid = isFormMode && touched.delivery_deadline && !formData.delivery_deadline;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');
    setTouched({
      quotation_id: true,
      customer_po_reference: true,
      po_date: true,
      delivery_deadline: true
    });

    if (isCreate && !formData.quotation_id) {
      setErrorMsg('Please select an approved quotation.');
      document.getElementById('po-quotation-id')?.focus();
      return;
    }

    if (!formData.customer_po_reference.trim()) {
      setErrorMsg('Please enter the Customer PO Reference #.');
      document.getElementById('po-customer-ref')?.focus();
      return;
    }

    if (!formData.delivery_deadline) {
      setErrorMsg('Please select a Delivery Target date.');
      document.getElementById('po-delivery-deadline')?.focus();
      return;
    }

    const firstBadIdx = formData.items.findIndex(
      (it) => !it.product_id || Number(it.quantity) <= 0 || Number(it.unit_price) < 0
    );
    if (firstBadIdx !== -1) {
      setErrorMsg(`Row ${firstBadIdx + 1}: Select a product and enter a valid quantity and unit rate.`);
      document.getElementById(`po-item-product-${firstBadIdx}`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        quotation_id: Number(formData.quotation_id),
        customer_po_reference: formData.customer_po_reference.trim(),
        po_date: formData.po_date,
        delivery_deadline: formData.delivery_deadline,
        payment_terms: formData.payment_terms,
        status: formData.status,
        notes: formData.notes,
        items: formData.items.map((it) => ({
          product_id: Number(it.product_id),
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          tax_percent: Number(it.tax_percent ?? 18)
        }))
      };

      if (isCreate) {
        const res = await api.createPurchaseOrder(payload);
        const createdId = res.data?.id;
        if (createdId && mediaFiles.length > 0) {
          await api.uploadMedia('purchase_order', createdId, mediaFiles, currentUser?.id || 1, 'Customer PO');
        }
        setStatusMsg('Purchase order created successfully.');
        if (onSaved) onSaved();
        if (createdId && onNavigateMode) {
          onNavigateMode(createdId, 'view');
        } else {
          onBack();
        }
      } else if (isEdit && poId) {
        await api.updatePurchaseOrder(poId, payload);
        if (mediaFiles.length > 0) {
          await api.uploadMedia('purchase_order', poId, mediaFiles, currentUser?.id || 1, 'Customer PO');
        }
        setStatusMsg('Purchase order updated successfully.');
        if (onSaved) onSaved();
        if (onNavigateMode) {
          onNavigateMode(poId, 'view');
        } else {
          await loadData();
        }
      }
    } catch (err) {
      setErrorMsg('Failed to save purchase order: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePO = async () => {
    if (!window.confirm('Delete this Purchase Order? This cannot be undone.')) return;
    try {
      await api.deletePurchaseOrder(poId);
      if (onSaved) onSaved();
      onBack();
    } catch (err) {
      setErrorMsg('Failed to delete purchase order: ' + err.message);
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm('Remove this PO attachment?')) return;
    try {
      await api.deleteMedia(attachmentId);
      await loadData();
    } catch (err) {
      setErrorMsg('Failed to delete attachment: ' + err.message);
    }
  };

  const canCreateOrEdit = hasPermission(currentUser, 'purchase_orders', 'create');
  const canRecordPayment = hasPermission(currentUser, 'payments', 'create');
  const canCheckBOM = hasPermission(currentUser, 'inventory') || hasPermission(currentUser, 'manufacturing');

  const isEditableStatus = purchaseOrder && !['completed', 'cancelled'].includes(purchaseOrder.status);
  const canDeletePO =
    isView &&
    canCreateOrEdit &&
    purchaseOrder?.status === 'received' &&
    Number(purchaseOrder?.work_orders?.length || 0) === 0 &&
    Number(purchaseOrder?.payments?.length || 0) === 0;

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200/90 p-8 text-center text-xs text-slate-500">
        Loading purchase order workspace...
      </div>
    );
  }

  if (!isCreate && !purchaseOrder) {
    return (
      <div className="bg-white rounded-lg border border-slate-200/90 p-8 text-center space-y-3">
        <p className="text-xs text-rose-600 font-medium">{errorMsg || 'Purchase order not found.'}</p>
        <button
          type="button"
          onClick={onBack}
          title="Back to Customer Purchase Orders"
          aria-label="Back to Customer Purchase Orders"
          className="h-8 px-3 bg-slate-900 text-white rounded-md text-xs font-medium inline-flex items-center gap-1.5 hover:bg-slate-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Sales POs
        </button>
      </div>
    );
  }

  const activeCustomerSummary = isCreate ? selectedQuoteDetails : purchaseOrder;

  return (
    <div className="space-y-3.5">
      {/* Top Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            title="Back to Customer Purchase Orders"
            aria-label="Back to Customer Purchase Orders"
            className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-slate-700" />
              <h1 id="po-form-heading" className="text-base font-semibold text-slate-900 tracking-tight">
                {isCreate
                  ? 'Create Customer Purchase Order'
                  : isEdit
                  ? `Edit Purchase Order: ${purchaseOrder.po_number}`
                  : `Purchase Order: ${purchaseOrder.po_number}`}
              </h1>

              {isCreate ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                  New Sales PO
                </span>
              ) : (
                <>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border ${
                      purchaseOrder.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : purchaseOrder.status === 'in_production'
                        ? 'bg-sky-50 text-sky-700 border-sky-200'
                        : purchaseOrder.status === 'cancelled'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {purchaseOrder.status?.replace('_', ' ')}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border ${
                      purchaseOrder.payment_status === 'fully_paid'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : purchaseOrder.payment_status === 'partially_paid'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    {purchaseOrder.payment_status?.replace('_', ' ')}
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isCreate
                ? 'Select an approved quotation, configure PO line items, quantities, unit rates, GST, and delivery schedule.'
                : isEdit
                ? 'Update customer PO reference, line items, pricing, delivery deadline, and payment terms.'
                : `Client Ref: ${purchaseOrder.customer_po_reference} • PO Date: ${purchaseOrder.po_date} • Target Delivery: ${purchaseOrder.delivery_deadline}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenAudit && (
            <button
              type="button"
              onClick={() => onOpenAudit('purchase_orders')}
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
            >
              <History className="h-3.5 w-3.5" /> Audit Trail
            </button>
          )}

          {isView && isEditableStatus && canCreateOrEdit && (
            <button
              type="button"
              onClick={() => onNavigateMode(poId, 'edit')}
              className="h-8 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-md text-xs font-medium inline-flex items-center gap-1.5 shadow-xs"
            >
              <Edit3 className="h-3.5 w-3.5" /> Edit PO
            </button>
          )}

          {canDeletePO && (
            <button
              type="button"
              onClick={handleDeletePO}
              className="h-8 px-2.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}

          {isView && canRecordPayment && (
            <button
              type="button"
              onClick={() => onRecordPayment && onRecordPayment(purchaseOrder)}
              className="h-8 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md font-medium text-xs inline-flex items-center gap-1 shadow-xs"
            >
              <Receipt className="h-3.5 w-3.5" /> Pay
            </button>
          )}

          {isView && canCheckBOM && (
            <button
              type="button"
              onClick={() => onCheckMaterials && onCheckMaterials(purchaseOrder)}
              className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-xs inline-flex items-center gap-1.5 shadow-xs"
            >
              <Boxes className="h-3.5 w-3.5" /> BOM Check <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Live Feedback Banner */}
      <div aria-live="polite">
        {errorMsg && (
          <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {statusMsg && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
            {statusMsg}
          </div>
        )}
      </div>

      {/* Main Form */}
      <form
        method="POST"
        onSubmit={handleSubmit}
        noValidate
        aria-labelledby="po-form-heading"
        className="space-y-3.5"
      >
        {/* Section 1: Customer, Quotation & PO Reference + Dates */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          <div className="lg:col-span-2 bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs space-y-3">
            <h2 className="text-xs font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-slate-500" />
              Customer, Quotation & Reference
            </h2>

            {isCreate ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="po-quotation-id" className="block text-xs font-medium text-slate-700 mb-1">
                    Approved Quotation <span className="text-rose-600" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="po-quotation-id"
                    name="quotation_id"
                    required
                    aria-invalid={isQuoteInvalid ? 'true' : undefined}
                    value={formData.quotation_id}
                    onBlur={() => markTouched('quotation_id')}
                    onChange={(e) => handleQuotationChange(e.target.value)}
                    className={`w-full p-2 border rounded-md text-xs bg-white focus:ring-1 focus:ring-slate-900 ${
                      isQuoteInvalid ? 'border-rose-400' : 'border-slate-200'
                    }`}
                  >
                    <option value="">-- Choose Approved Quotation --</option>
                    {approvedQuotations.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.quotation_number}: {q.customer_name} (₹{Number(q.total_amount).toLocaleString()})
                      </option>
                    ))}
                  </select>
                  {approvedQuotations.length === 0 && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      No approved quotations available yet. Approve a quotation in Stage 3 first.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="po-customer-ref" className="block text-xs font-medium text-slate-700 mb-1">
                    Customer PO Reference # <span className="text-rose-600" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="po-customer-ref"
                    name="customer_po_reference"
                    type="text"
                    required
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={isRefInvalid ? 'true' : undefined}
                    placeholder="e.g. CLIENT-PO-2026-001"
                    value={formData.customer_po_reference}
                    onBlur={() => markTouched('customer_po_reference')}
                    onChange={(e) => setFormData({ ...formData, customer_po_reference: e.target.value })}
                    className={`w-full p-2 border rounded-md text-xs font-mono focus:ring-1 focus:ring-slate-900 ${
                      isRefInvalid ? 'border-rose-400' : 'border-slate-200'
                    }`}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <label htmlFor="po-customer-ref" className="block text-xs font-medium text-slate-700 mb-1">
                    Customer PO Reference # {isEdit && <span className="text-rose-600" aria-hidden="true">*</span>}
                  </label>
                  {isFormMode ? (
                    <input
                      id="po-customer-ref"
                      name="customer_po_reference"
                      type="text"
                      required
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      aria-invalid={isRefInvalid ? 'true' : undefined}
                      value={formData.customer_po_reference}
                      onBlur={() => markTouched('customer_po_reference')}
                      onChange={(e) => setFormData({ ...formData, customer_po_reference: e.target.value })}
                      className={`w-full p-2 border rounded-md text-xs font-mono focus:ring-1 focus:ring-slate-900 ${
                        isRefInvalid ? 'border-rose-400' : 'border-slate-200'
                      }`}
                    />
                  ) : (
                    <p className="p-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono font-semibold text-slate-900">
                      {purchaseOrder.customer_po_reference}
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeCustomerSummary && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-md border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer</span>
                  <p className="font-semibold text-slate-900">{activeCustomerSummary.customer_name}</p>
                  {activeCustomerSummary.customer_address && (
                    <p className="text-slate-500">{activeCustomerSummary.customer_address}</p>
                  )}
                  {activeCustomerSummary.gst_number && (
                    <p className="text-slate-600 font-mono text-[11px]">GST: {activeCustomerSummary.gst_number}</p>
                  )}
                  {(activeCustomerSummary.customer_email || activeCustomerSummary.customer_phone) && (
                    <p className="text-slate-500">
                      {[activeCustomerSummary.customer_email, activeCustomerSummary.customer_phone].filter(Boolean).join(' • ')}
                    </p>
                  )}
                </div>

                <div className="p-3 bg-slate-50 rounded-md border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Linked Quotation & Lead
                  </span>
                  <p className="font-mono font-semibold text-slate-900">
                    {activeCustomerSummary.quotation_number}
                  </p>
                  <p className="text-slate-600">
                    <span className="font-mono">{activeCustomerSummary.lead_number}</span>
                    {activeCustomerSummary.lead_title ? ` — ${activeCustomerSummary.lead_title}` : ''}
                  </p>
                  {activeCustomerSummary.quotation_date && (
                    <p className="text-slate-500 text-[11px]">
                      Quote Date: {activeCustomerSummary.quotation_date}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Dates, Status & Notes */}
          <div className="bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs space-y-3">
            <h2 className="text-xs font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              Schedule & Status
            </h2>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="po-date" className="block text-xs font-medium text-slate-700 mb-1">
                  PO Date {isFormMode && <span className="text-rose-600" aria-hidden="true">*</span>}
                </label>
                {isFormMode ? (
                  <input
                    id="po-date"
                    name="po_date"
                    type="date"
                    required
                    value={formData.po_date}
                    onChange={(e) => setFormData({ ...formData, po_date: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-slate-900"
                  />
                ) : (
                  <p className="p-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-medium text-slate-800">
                    {purchaseOrder.po_date || '—'}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="po-delivery-deadline" className="block text-xs font-medium text-slate-700 mb-1">
                  Delivery Target {isFormMode && <span className="text-rose-600" aria-hidden="true">*</span>}
                </label>
                {isFormMode ? (
                  <input
                    id="po-delivery-deadline"
                    name="delivery_deadline"
                    type="date"
                    required
                    aria-invalid={isDeadlineInvalid ? 'true' : undefined}
                    value={formData.delivery_deadline}
                    onBlur={() => markTouched('delivery_deadline')}
                    onChange={(e) => setFormData({ ...formData, delivery_deadline: e.target.value })}
                    className={`w-full p-2 border rounded-md text-xs focus:ring-1 focus:ring-slate-900 ${
                      isDeadlineInvalid ? 'border-rose-400' : 'border-slate-200'
                    }`}
                  />
                ) : (
                  <p className="p-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-medium text-slate-800">
                    {purchaseOrder.delivery_deadline || '—'}
                  </p>
                )}
              </div>
            </div>

            {isEdit && (
              <div>
                <label htmlFor="po-status" className="block text-xs font-medium text-slate-700 mb-1">
                  PO Status
                </label>
                <select
                  id="po-status"
                  name="status"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs bg-white focus:ring-1 focus:ring-slate-900"
                >
                  <option value="received">Received</option>
                  <option value="verified">Verified</option>
                  <option value="in_production">In Production</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            )}

            <div>
              <label htmlFor="po-notes" className="block text-xs font-medium text-slate-700 mb-1">
                Internal / Order Notes
              </label>
              {isFormMode ? (
                <textarea
                  id="po-notes"
                  name="notes"
                  rows="2"
                  placeholder="Optional customer instructions or order remarks..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs resize-y"
                />
              ) : (
                <p className="p-2 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600 min-h-[3.25rem] whitespace-pre-wrap">
                  {purchaseOrder.notes || 'No remarks recorded.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Purchase Order Line Items */}
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-b border-slate-200/80 bg-slate-50/50">
            <div>
              <h2 id="po-items-heading" className="text-xs font-semibold text-slate-900">
                Purchase Order Line Items
              </h2>
              <p className="text-[11px] text-slate-500">
                {loadingQuoteItems
                  ? 'Loading line items from selected quotation...'
                  : isFormMode
                  ? 'Add products, adjust quantities, unit rates, and applicable GST %.'
                  : `${purchaseOrder.items?.length || 0} line item(s) in this purchase order.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isView && (purchaseOrder?.items || []).length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    exportToCsv(
                      `po_${purchaseOrder.po_number}_items`,
                      [
                        { header: 'Product', accessor: 'product_name' },
                        { header: 'SKU', accessor: 'product_sku' },
                        { header: 'Qty', accessor: (it) => `${it.quantity} ${it.uom || ''}`.trim() },
                        { header: 'Unit Rate', accessor: 'unit_price' },
                        { header: 'Tax %', accessor: (it) => it.tax_percent ?? 18 },
                        { header: 'Line Total', accessor: 'total_price' }
                      ],
                      purchaseOrder.items
                    )
                  }
                  className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
                >
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
              )}
              {isCreate && formData.quotation_id && (
                <button
                  type="button"
                  disabled={loadingQuoteItems}
                  onClick={() => applyQuoteItems(formData.quotation_id)}
                  className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingQuoteItems ? 'animate-spin' : ''}`} />
                  Load Quote Items
                </button>
              )}
              {isFormMode && (
                <button
                  type="button"
                  onClick={addItem}
                  className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Product
                </button>
              )}
            </div>
          </div>

          {isEdit && Number(purchaseOrder?.work_order_count || 0) > 0 && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-[11px] font-medium">
              {purchaseOrder.work_order_count} work order(s) are already linked to this PO. Updating line items recalculates PO totals without modifying existing work orders.
            </div>
          )}

          <div
            tabIndex={0}
            role="region"
            aria-labelledby="po-items-heading"
            className="overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80 sticky top-0 z-10">
                <tr>
                  <th scope="col" className="px-3 py-2.5 w-10 text-center">#</th>
                  <th scope="col" className="px-4 py-2.5">Product {isFormMode && '*'}</th>
                  <th scope="col" className="px-3 py-2.5 w-28 text-center">Qty {isFormMode && '*'}</th>
                  <th scope="col" className="px-3 py-2.5 w-36 text-right">Unit Rate (₹) {isFormMode && '*'}</th>
                  <th scope="col" className="px-3 py-2.5 w-24 text-center">Tax (%)</th>
                  <th scope="col" className="px-4 py-2.5 w-36 text-right">Line Total (inc. Tax)</th>
                  {isFormMode && <th scope="col" className="px-3 py-2.5 w-14 text-center">Action</th>}
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
                          <td className="px-4 py-2.5 min-w-[220px]">
                            <label htmlFor={`po-item-product-${idx}`} className="sr-only">
                              Product for row {idx + 1}
                            </label>
                            <select
                              id={`po-item-product-${idx}`}
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
                            <label htmlFor={`po-item-qty-${idx}`} className="sr-only">
                              Quantity for row {idx + 1}
                            </label>
                            <input
                              id={`po-item-qty-${idx}`}
                              name={`items[${idx}][quantity]`}
                              type="number"
                              min="1"
                              step="any"
                              required
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                              className="w-full p-2 border border-slate-200 rounded-md text-xs text-center"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <label htmlFor={`po-item-rate-${idx}`} className="sr-only">
                              Unit rate for row {idx + 1}
                            </label>
                            <input
                              id={`po-item-rate-${idx}`}
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
                            <label htmlFor={`po-item-tax-${idx}`} className="sr-only">
                              Tax percentage for row {idx + 1}
                            </label>
                            <input
                              id={`po-item-tax-${idx}`}
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
                      <tr key={it.id || idx}>
                        <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">
                          {viewItemsPagination.startIndex + idx + 1}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-slate-900">{it.product_name}</p>
                          {it.product_sku && (
                            <span className="text-[10px] font-mono text-slate-400">{it.product_sku}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          {it.quantity} {it.uom}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          ₹{Number(it.unit_price).toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-center">{Number(it.tax_percent ?? 18)}%</td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
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

        {/* Section 3: Payment Terms, Optional Proof & Order Financial Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          <div className="lg:col-span-2 bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs space-y-3">
            <div>
              <label htmlFor="po-payment-terms" className="block text-xs font-semibold text-slate-800 mb-1.5">
                Payment & Commercial Terms
              </label>
              {isFormMode ? (
                <textarea
                  id="po-payment-terms"
                  name="payment_terms"
                  rows="3"
                  value={formData.payment_terms}
                  onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-md text-xs resize-y focus:ring-1 focus:ring-slate-900"
                />
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700 whitespace-pre-wrap">
                  {purchaseOrder.payment_terms || DEFAULT_PAYMENT_TERMS}
                </div>
              )}
            </div>

            {isFormMode ? (
              <div className="space-y-2">
                {isEdit && purchaseOrder?.attachments?.length > 0 && (
                  <div className="p-2.5 bg-slate-50 rounded-md border border-slate-200 space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-700 block">
                      Existing Attachments ({purchaseOrder.attachments.length})
                    </span>
                    <MediaGallery
                      attachments={purchaseOrder.attachments}
                      onDelete={handleDeleteAttachment}
                    />
                  </div>
                )}
                <MediaUploader
                  files={mediaFiles}
                  onChange={setMediaFiles}
                  label="PO Document / Media Proof (Optional)"
                />
              </div>
            ) : (
              purchaseOrder?.attachments?.length > 0 && (
                <div className="pt-1 space-y-1.5">
                  <span className="text-xs font-semibold text-slate-800 block">
                    PO Document / Media Attachments
                  </span>
                  <MediaGallery attachments={purchaseOrder.attachments} />
                </div>
              )
            )}
          </div>

          <div className="bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs flex flex-col justify-between space-y-3">
            <div className="space-y-2 text-xs">
              <h2 className="font-semibold text-slate-800 uppercase tracking-wider text-[11px]">
                Order Summary
              </h2>
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-medium text-slate-900">
                  ₹{(isFormMode ? subtotal : Number(purchaseOrder.subtotal)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Tax (GST)</span>
                <span className="font-medium text-slate-900">
                  ₹{(isFormMode ? taxAmount : Number(purchaseOrder.tax_amount)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-bold text-slate-900">
                <span>Grand Total</span>
                <span>
                  ₹{(isFormMode ? grandTotal : Number(purchaseOrder.total_amount)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>

              {isView && (
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <div className="flex justify-between text-emerald-700">
                    <span>Verified Paid</span>
                    <span className="font-semibold">
                      ₹{Number(purchaseOrder.total_paid || 0).toLocaleString()}
                    </span>
                  </div>
                  {Number(purchaseOrder.pending_paid || 0) > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>Pending Verification</span>
                      <span className="font-semibold">
                        ₹{Number(purchaseOrder.pending_paid).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-700">
                    <span>Balance Due</span>
                    <span className="font-semibold">
                      ₹{Number(purchaseOrder.balance_due || 0).toLocaleString()}
                    </span>
                  </div>
                  {Number(purchaseOrder.excess_amount || 0) > 0 && (
                    <div className="flex justify-between text-violet-700 bg-violet-50 px-2 py-1 rounded border border-violet-200">
                      <span className="font-medium">Extra / Excess Credit</span>
                      <span className="font-bold">
                        +₹{Number(purchaseOrder.excess_amount).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {isFormMode && (
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    if (isEdit && poId && onNavigateMode) {
                      onNavigateMode(poId, 'view');
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
                    ? 'Save Customer PO'
                    : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Linked Work Orders & Payments in View Mode */}
        {isView && (purchaseOrder.work_orders?.length > 0 || purchaseOrder.payments?.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {purchaseOrder.work_orders?.length > 0 && (
              <div className="bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs space-y-2">
                <h2 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                  Linked Work Orders ({purchaseOrder.work_orders.length})
                </h2>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                  {purchaseOrder.work_orders.map((wo) => (
                    <div key={wo.id} className="px-3 py-2 flex items-center justify-between text-xs gap-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onViewWorkOrder && onViewWorkOrder(wo.id)}
                          className="font-mono font-semibold text-sky-700 hover:underline"
                        >
                          {wo.wo_number}
                        </button>
                        <p className="text-[11px] text-slate-500 truncate">
                          {wo.product_name} ({wo.target_quantity} Units)
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-700 shrink-0">
                        {wo.status?.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {purchaseOrder.payments?.length > 0 && (
              <div className="bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs space-y-2">
                <h2 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                  Recorded Payments ({purchaseOrder.payments.length})
                </h2>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                  {purchaseOrder.payments.map((pay) => (
                    <div key={pay.id} className="px-3 py-2 flex items-center justify-between text-xs gap-2">
                      <div>
                        <span className="font-medium text-slate-900 capitalize">
                          {pay.payment_type?.replace('_', ' ')} • {(pay.payment_method || pay.payment_mode || '').replace('_', ' ')}
                        </span>
                        <p className="text-[11px] text-slate-500">
                          {pay.payment_date} {(pay.transaction_reference || pay.transaction_ref) ? `• Ref: ${pay.transaction_reference || pay.transaction_ref}` : ''}
                          {Number(pay.excess_amount || 0) > 0 && (
                            <span className="ml-1.5 text-violet-700 font-semibold">
                              (+₹{Number(pay.excess_amount).toLocaleString()} Extra)
                            </span>
                          )}
                        </p>
                      </div>
                      <span className={`font-semibold whitespace-nowrap ${Number(pay.amount) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {Number(pay.amount) < 0 ? `-₹${Math.abs(Number(pay.amount)).toLocaleString()}` : `₹${Number(pay.amount).toLocaleString()}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
