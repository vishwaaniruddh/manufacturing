// client/src/views/QuotationsView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  FileSpreadsheet, 
  Plus, 
  Trash2, 
  Eye, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ArrowRight,
  History
} from 'lucide-react';
import { hasPermission } from '../utils/rbac';

export default function QuotationsView({ currentUser, preselectedLead, onGeneratePO, onOpenAudit }) {
  const [quotations, setQuotations] = useState([]);
  const [approvedLeads, setApprovedLeads] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewQuotationModal, setViewQuotationModal] = useState(null);

  // Form
  const [formData, setFormData] = useState({
    lead_id: '',
    valid_until: '',
    terms_conditions: "1. 50% advance on PO confirmation, balance 50% prior to dispatch.\n2. Delivery lead time: 3 weeks.\n3. Standard 12-month factory defect warranty.",
    remarks: '',
    items: [
      { product_id: '', quantity: 1, unit_price: 0, tax_percent: 18 }
    ]
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [qRes, lRes, pRes] = await Promise.all([
        api.getQuotations(),
        api.getLeads('approved'),
        api.getProducts()
      ]);
      setQuotations(qRes.data || []);
      setApprovedLeads(lRes.data || []);
      setProducts(pRes.data || []);
    } catch (err) {
      alert('Error loading quotations data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (preselectedLead && preselectedLead.status === 'approved') {
      setFormData(prev => ({
        ...prev,
        lead_id: preselectedLead.id
      }));
      setShowCreateModal(true);
    }
  }, [preselectedLead]);

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { product_id: '', quantity: 1, unit_price: 0, tax_percent: 18 }]
    }));
  };

  const removeItem = (idx) => {
    if (formData.items.length === 1) return;
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx)
    }));
  };

  const updateItem = (idx, field, val) => {
    const updated = [...formData.items];
    updated[idx][field] = val;
    if (field === 'product_id') {
      const prod = products.find(p => p.id == val);
      if (prod) {
        updated[idx].unit_price = Number(prod.unit_price);
      }
    }
    setFormData(prev => ({ ...prev, items: updated }));
  };

  const subtotal = formData.items.reduce((acc, it) => acc + (Number(it.quantity || 0) * Number(it.unit_price || 0)), 0);
  const taxAmount = formData.items.reduce((acc, it) => {
    const lineTotal = Number(it.quantity || 0) * Number(it.unit_price || 0);
    return acc + (lineTotal * (Number(it.tax_percent || 18) / 100));
  }, 0);
  const grandTotal = subtotal + taxAmount;

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.lead_id) {
      alert('Please select an approved lead.');
      return;
    }
    try {
      await api.createQuotation(formData);
      setShowCreateModal(false);
      setFormData({
        lead_id: '',
        valid_until: '',
        terms_conditions: "1. 50% advance on PO confirmation, balance prior to dispatch.\n2. Delivery time: 3 weeks.\n3. 12-month standard warranty.",
        remarks: '',
        items: [{ product_id: '', quantity: 1, unit_price: 0, tax_percent: 18 }]
      });
      loadData();
    } catch (err) {
      alert('Failed to save quotation: ' + err.message);
    }
  };

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

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this quotation?')) return;
    try {
      await api.deleteQuotation(id);
      loadData();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleView = async (id) => {
    try {
      const res = await api.getQuotation(id);
      setViewQuotationModal(res.data);
    } catch (err) {
      alert('Failed to load quotation: ' + err.message);
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
              onClick={() => onOpenAudit('quotations')}
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
            >
              <History className="h-3.5 w-3.5" /> Quote Audit Trail
            </button>
          )}

          {hasPermission(currentUser, 'quotations', 'create') && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Create Quotation
            </button>
          )}
        </div>
      </div>

      {/* Table (Compact ShadCN style) */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading quotations...</div>
        ) : quotations.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No quotations found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="px-3.5 py-2.5">Quote # & Rev</th>
                  <th className="px-3.5 py-2.5">Lead & Client</th>
                  <th className="px-3.5 py-2.5">Items & Valid Date</th>
                  <th className="px-3.5 py-2.5">Total Amount</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotations.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50/60 transition-colors">
                    
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                          {q.quotation_number}
                        </span>
                        <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-slate-100 text-slate-600">
                          R{q.revision_number}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">{q.quotation_date}</span>
                    </td>

                    <td className="px-3.5 py-2.5">
                      <p className="font-semibold text-slate-900">{q.customer_name}</p>
                      <p className="text-[11px] text-slate-500 truncate max-w-xs">{q.lead_title}</p>
                    </td>

                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className="font-medium text-slate-700">{q.item_count} Items</span>
                      <p className="text-[10px] text-slate-400">Valid: {q.valid_until}</p>
                    </td>

                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <p className="font-bold text-slate-900">
                        ₹{Number(q.total_amount).toLocaleString()}
                      </p>
                      <span className="text-[10px] text-slate-400">
                        Tax: ₹{Number(q.tax_amount).toLocaleString()}
                      </span>
                    </td>

                    <td className="px-3.5 py-2.5 whitespace-nowrap">
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

                    <td className="px-3.5 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => handleView(q.id)}
                        className="h-7 px-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-md text-[11px] font-medium"
                      >
                        <Eye className="h-3.5 w-3.5 inline mr-1" /> View
                      </button>

                      {q.status === 'draft' && hasPermission(currentUser, 'quotations', 'approve') && (
                        <>
                          <button
                            onClick={() => handleApproveQuotation(q.id)}
                            className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-medium text-[11px]"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectQuotation(q.id)}
                            className="h-7 px-2.5 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-md font-medium text-[11px]"
                          >
                            Reject
                          </button>
                        </>
                      )}

                      {q.status === 'approved' && hasPermission(currentUser, 'purchase_orders', 'create') && (
                        <button
                          onClick={() => onGeneratePO(q)}
                          className="h-7 px-2.5 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-[11px] inline-flex items-center gap-1"
                        >
                          + PO <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE QUOTATION MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-xl w-full p-4 shadow-lg border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-sm font-semibold text-slate-900 mb-0.5">Create Commercial Quotation</h2>
            <p className="text-xs text-slate-500 mb-3">Define product quantities, unit rates, and taxes.</p>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Approved Lead *</label>
                <select
                  required
                  value={formData.lead_id}
                  onChange={(e) => setFormData({ ...formData, lead_id: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md text-xs focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">-- Choose Approved Lead --</option>
                  {approvedLeads.map((l) => (
                    <option key={l.id} value={l.id}>{l.lead_number}: {l.title} ({l.customer_name})</option>
                  ))}
                </select>
              </div>

              {/* Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-800">Quotation Line Items</label>
                  <button
                    type="button"
                    onClick={addItem}
                    className="text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add Product
                  </button>
                </div>

                <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-md border border-slate-200">
                  {formData.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 bg-white p-2 rounded border border-slate-200">
                      <select
                        required
                        value={item.product_id}
                        onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                        className="flex-1 p-1 border border-slate-200 rounded text-xs"
                      >
                        <option value="">-- Select Product --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                        className="w-16 p-1 border border-slate-200 rounded text-xs text-center"
                      />

                      <input
                        type="number"
                        step="0.01"
                        placeholder="Rate (₹)"
                        value={item.unit_price}
                        onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                        className="w-24 p-1 border border-slate-200 rounded text-xs text-right font-medium"
                      />

                      <input
                        type="number"
                        placeholder="Tax%"
                        value={item.tax_percent}
                        onChange={(e) => updateItem(idx, 'tax_percent', e.target.value)}
                        className="w-14 p-1 border border-slate-200 rounded text-xs text-center"
                      />

                      {formData.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="text-right text-xs font-semibold text-slate-900 pr-2">
                  Grand Total (inc. Tax): ₹{grandTotal.toLocaleString()}
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Commercial Terms</label>
                <textarea
                  rows="2"
                  value={formData.terms_conditions}
                  onChange={(e) => setFormData({ ...formData, terms_conditions: e.target.value })}
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
                  Save & Issue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW QUOTATION MODAL */}
      {viewQuotationModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-lg w-full p-5 shadow-lg border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Commercial Proposal</span>
                <h3 className="text-base font-bold text-slate-900">{viewQuotationModal.quotation_number}</h3>
                <p className="text-xs text-slate-500">Revision: #{viewQuotationModal.revision_number} • Date: {viewQuotationModal.quotation_date}</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-700">
                {viewQuotationModal.status}
              </span>
            </div>

            <div className="space-y-3 text-xs mb-4">
              <div className="p-2.5 bg-slate-50 rounded-md border border-slate-200">
                <p className="font-semibold text-slate-900">{viewQuotationModal.customer_name}</p>
                <p className="text-slate-500">{viewQuotationModal.customer_address}</p>
              </div>

              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="p-2">Item</th>
                      <th className="p-2 text-center">Qty</th>
                      <th className="p-2 text-right">Rate</th>
                      <th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewQuotationModal.items?.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-medium">{it.product_name}</td>
                        <td className="p-2 text-center">{it.quantity} {it.uom}</td>
                        <td className="p-2 text-right">₹{Number(it.unit_price).toLocaleString()}</td>
                        <td className="p-2 text-right font-bold">₹{Number(it.total_price).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-md font-semibold text-slate-900">
                <span>Grand Total:</span>
                <span className="text-sm">₹{Number(viewQuotationModal.total_amount).toLocaleString()}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t">
              <button
                onClick={() => setViewQuotationModal(null)}
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
