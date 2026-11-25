// client/src/views/PaymentsView.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import {
  CreditCard,
  Plus,
  Receipt,
  CheckCircle2,
  XCircle,
  Clock,
  History,
  Search,
  Download,
  Edit3,
  Trash2,
  ArrowRightLeft,
  RotateCcw,
  FileText,
  Printer,
  Users,
  Wallet,
  AlertTriangle,
  X,
  Building2,
  ExternalLink,
  BarChart3
} from 'lucide-react';
import { hasPermission } from '../utils/rbac';
import Pagination, { usePagination } from '../components/Pagination';
import { MediaUploader, MediaGallery } from '../components/MediaUploader';
import AccountingDashboardSection from '../components/AccountingDashboardSection';
import { exportToCsv } from '../utils/exportCsv';

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer (NEFT / RTGS / IMPS)' },
  { value: 'upi', label: 'UPI / QR Transfer' },
  { value: 'cheque', label: 'Cheque / Demand Draft' },
  { value: 'credit_card', label: 'Credit / Debit Card' },
  { value: 'cash', label: 'Cash Receipt' }
];

const EXCESS_HANDLING_LABELS = {
  none: '—',
  customer_credit: 'Customer Advance Credit',
  refund_pending: 'Refund Pending to Customer',
  adjust_next_po: 'Adjust in Next PO / Invoice',
  retained: 'Retained / Bank Rounding',
  refund_out: 'Excess Refunded Out',
  credit_transfer: 'Credit Transferred to PO'
};

const SPECIAL_TYPE_LABELS = {
  excess_refund: 'Excess Refund',
  credit_transfer: 'Credit Transfer Out',
  advance_adjustment: 'Excess Credit Applied'
};

function formatCurrency(val) {
  const num = Number(val || 0);
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function generateUtr(prefix = 'UTR') {
  return `${prefix}-${Math.floor(100000000 + Math.random() * 900000000)}`;
}

function getPoStatusBadgeClass(status) {
  switch (status) {
    case 'overpaid':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'fully_paid':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'partially_paid':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'pending_verification':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

function getReceiptStatusBadge(status) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Verified
      </span>
    );
  }
  if (status === 'received') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
        <Clock className="h-3 w-3" /> Pending Check
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
      <XCircle className="h-3 w-3" /> Rejected
    </span>
  );
}

const SECTION_TO_SUBTAB = {
  accounting_dashboard: 'dashboard',
  payments: 'transactions',
  accounting_po_balances: 'po_ledger',
  accounting_advances: 'advances',
  accounting_customers: 'customer_ledger'
};

const SUBTAB_TO_SECTION = {
  dashboard: 'accounting_dashboard',
  transactions: 'payments',
  po_ledger: 'accounting_po_balances',
  advances: 'accounting_advances',
  customer_ledger: 'accounting_customers'
};

export default function PaymentsView({
  currentUser,
  section = 'payments',
  onSectionChange,
  preselectedPO,
  onClearPreselectedPO,
  onViewPO,
  onOpenAudit
}) {
  const [activeSubTab, setActiveSubTab] = useState(() => SECTION_TO_SUBTAB[section] || 'transactions');
  const [payments, setPayments] = useState([]);
  const [poLedgers, setPoLedgers] = useState([]);
  const [customerLedgers, setCustomerLedgers] = useState([]);
  const [analytics, setAnalytics] = useState({
    by_method: [],
    by_type: [],
    advance_stats: {},
    po_status_breakdown: {}
  });
  const [kpis, setKpis] = useState({
    total_contract_value: 0,
    total_verified_collected: 0,
    total_pending_verification: 0,
    pending_count: 0,
    total_rejected: 0,
    rejected_count: 0,
    total_balance_due: 0,
    unpaid_or_partial_pos: 0,
    total_excess_received: 0,
    overpaid_pos: 0,
    fully_paid_pos: 0,
    total_pos: 0,
    receipt_count: 0,
    collection_rate: 0
  });
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [paymentMediaMap, setPaymentMediaMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [advShowAll, setAdvShowAll] = useState(false);

  // Filters for Transactions Ledger
  const [selectedPOFilter, setSelectedPOFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [excessOnlyFilter, setExcessOnlyFilter] = useState(false);

  // Filters for PO Ledger
  const [poSearchQuery, setPoSearchQuery] = useState('');
  const [poStatusFilter, setPoStatusFilter] = useState('');

  // Filters for Customer Ledger
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Record / Edit Payment Modal
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentMediaFiles, setPaymentMediaFiles] = useState([]);
  const [newPayment, setNewPayment] = useState({
    po_id: '',
    payment_date: getTodayDate(),
    instrument_date: '',
    amount: '',
    payment_method: 'bank_transfer',
    transaction_reference: '',
    bank_name: '',
    payer_name: '',
    payment_type: 'advance',
    status: 'verified',
    excess_handling: 'customer_credit',
    notes: ''
  });

  // Settle / Refund / Transfer Excess Modal
  const [settleModalPO, setSettleModalPO] = useState(null);
  const [savingSettle, setSavingSettle] = useState(false);
  const [settleForm, setSettleForm] = useState({
    action: 'refund',
    target_po_id: '',
    amount: '',
    payment_date: getTodayDate(),
    payment_method: 'bank_transfer',
    transaction_reference: '',
    bank_name: '',
    notes: ''
  });

  // Receipt Voucher Modal
  const [voucherPayment, setVoucherPayment] = useState(null);

  const canManagePayments =
    hasPermission(currentUser, 'payments', 'create') ||
    hasPermission(currentUser, 'payments', 'edit') ||
    currentUser?.role_slug === 'accounts' ||
    currentUser?.role_id === 1 ||
    currentUser?.role_slug === 'admin';

  useEffect(() => {
    const mapped = SECTION_TO_SUBTAB[section];
    if (mapped) {
      setActiveSubTab(mapped);
    }
    setShowRecordModal(false);
    setEditingPayment(null);
    setSettleModalPO(null);
    setVoucherPayment(null);
  }, [section]);

  const switchSubTab = useCallback(
    (nextSubTabOrSection, opts = {}) => {
      const targetSub = SECTION_TO_SUBTAB[nextSubTabOrSection] || nextSubTabOrSection;
      setActiveSubTab(targetSub);
      if (opts.statusFilter !== undefined) setStatusFilter(opts.statusFilter);
      if (opts.poStatusFilter !== undefined) setPoStatusFilter(opts.poStatusFilter);
      if (opts.selectedPOFilter !== undefined) setSelectedPOFilter(opts.selectedPOFilter);
      const targetSection = SUBTAB_TO_SECTION[targetSub];
      if (onSectionChange && targetSection && targetSection !== section) {
        onSectionChange(targetSection);
      }
    },
    [onSectionChange, section]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerRes, ptRes, mRes] = await Promise.all([
        api.getPaymentsLedger(),
        api.getPaymentTypes(),
        api.getMedia('payment')
      ]);

      const ld = ledgerRes.data || {};
      setPayments(ld.payments || []);
      setPoLedgers(ld.po_ledgers || []);
      setCustomerLedgers(ld.customer_ledgers || []);
      if (ld.analytics) {
        setAnalytics(ld.analytics);
      }
      if (ld.kpis) {
        setKpis(ld.kpis);
      }
      setPaymentTypes((ptRes.data || []).filter((pt) => pt.status === 'active'));

      const grouped = {};
      (mRes.data || []).forEach((m) => {
        grouped[m.entity_id] = grouped[m.entity_id] || [];
        grouped[m.entity_id].push(m);
      });
      setPaymentMediaMap(grouped);
    } catch (err) {
      alert('Error fetching payments ledger: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (preselectedPO?.id) {
      const poIdStr = String(preselectedPO.id);
      const due = Number(preselectedPO.balance_due ?? preselectedPO.total_amount * 0.5);
      const paid = Number(preselectedPO.total_paid || 0);
      setActiveSubTab('transactions');
      setSelectedPOFilter(poIdStr);
      setEditingPayment(null);
      setPaymentMediaFiles([]);
      setNewPayment({
        po_id: poIdStr,
        payment_date: getTodayDate(),
        instrument_date: '',
        amount: due > 0 ? String(Math.round(due * 100) / 100) : '',
        payment_method: 'bank_transfer',
        transaction_reference: generateUtr('UTR'),
        bank_name: '',
        payer_name: preselectedPO.customer_name || '',
        payment_type: paid > 0 ? 'final' : 'advance',
        status: 'verified',
        excess_handling: 'customer_credit',
        notes: ''
      });
      setShowRecordModal(true);
      if (onClearPreselectedPO) {
        onClearPreselectedPO();
      }
    }
  }, [preselectedPO, onClearPreselectedPO]);

  const paymentTypeLabel = useCallback(
    (code) => {
      if (SPECIAL_TYPE_LABELS[code]) return SPECIAL_TYPE_LABELS[code];
      const match = paymentTypes.find((pt) => pt.code === code);
      return match ? match.name : (code || 'Payment').replace(/_/g, ' ');
    },
    [paymentTypes]
  );

  // Filtered Transactions
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (selectedPOFilter && String(p.po_id) !== String(selectedPOFilter)) return false;
      if (typeFilter && p.payment_type !== typeFilter) return false;
      if (methodFilter && p.payment_method !== methodFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      if (excessOnlyFilter && Number(p.excess_amount || 0) <= 0 && Number(p.po_excess_amount || 0) <= 0) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const s = searchQuery.toLowerCase();
      return (
        p.payment_number?.toLowerCase().includes(s) ||
        p.customer_name?.toLowerCase().includes(s) ||
        p.po_number?.toLowerCase().includes(s) ||
        p.transaction_reference?.toLowerCase().includes(s) ||
        p.bank_name?.toLowerCase().includes(s) ||
        p.payer_name?.toLowerCase().includes(s) ||
        p.notes?.toLowerCase().includes(s)
      );
    });
  }, [payments, selectedPOFilter, typeFilter, methodFilter, statusFilter, excessOnlyFilter, searchQuery]);

  // Filtered PO Ledgers
  const filteredPoLedgers = useMemo(() => {
    return poLedgers.filter((po) => {
      if (poStatusFilter && po.payment_status !== poStatusFilter) return false;
      if (!poSearchQuery.trim()) return true;
      const s = poSearchQuery.toLowerCase();
      return (
        po.po_number?.toLowerCase().includes(s) ||
        po.customer_po_reference?.toLowerCase().includes(s) ||
        po.customer_name?.toLowerCase().includes(s) ||
        po.quotation_number?.toLowerCase().includes(s)
      );
    });
  }, [poLedgers, poStatusFilter, poSearchQuery]);

  // Filtered Customer Ledgers
  const filteredCustomerLedgers = useMemo(() => {
    return customerLedgers.filter((c) => {
      if (!customerSearchQuery.trim()) return true;
      const s = customerSearchQuery.toLowerCase();
      return (
        c.customer_name?.toLowerCase().includes(s) ||
        c.customer_email?.toLowerCase().includes(s) ||
        c.customer_phone?.toLowerCase().includes(s)
      );
    });
  }, [customerLedgers, customerSearchQuery]);

  const paymentsPagination = usePagination(filteredPayments, 10);
  const poPagination = usePagination(filteredPoLedgers, 10);
  const customerPagination = usePagination(filteredCustomerLedgers, 10);

  // Live PO Projection inside Record / Edit Modal
  const selectedModalPoLedger = useMemo(() => {
    if (!newPayment.po_id) return null;
    return poLedgers.find((po) => String(po.po_id) === String(newPayment.po_id)) || null;
  }, [poLedgers, newPayment.po_id]);

  const modalProjection = useMemo(() => {
    if (!selectedModalPoLedger) return null;
    const poTotal = Number(selectedModalPoLedger.po_total || 0);
    let baselineVerified = Number(selectedModalPoLedger.verified_paid || 0);

    // If editing an already-verified receipt on the same PO, exclude its prior contribution before adding the edited amount
    if (
      editingPayment &&
      String(editingPayment.po_id) === String(selectedModalPoLedger.po_id) &&
      editingPayment.status === 'verified'
    ) {
      baselineVerified -= Number(editingPayment.amount || 0);
    }

    const enteredAmt = Number(newPayment.amount || 0);
    const willCountAsVerified = newPayment.status === 'verified';
    const projectedVerified = willCountAsVerified ? baselineVerified + enteredAmt : baselineVerified;

    const currentDue = Math.max(0, Math.round((poTotal - baselineVerified) * 100) / 100);
    const currentExcess = Math.max(0, Math.round((baselineVerified - poTotal) * 100) / 100);
    const projectedDue = Math.max(0, Math.round((poTotal - projectedVerified) * 100) / 100);
    const projectedExcess = Math.max(0, Math.round((projectedVerified - poTotal) * 100) / 100);
    const appliedFromThisPayment =
      willCountAsVerified && enteredAmt > 0 ? Math.min(enteredAmt, currentDue) : 0;
    const excessFromThisPayment =
      willCountAsVerified && enteredAmt > 0 ? Math.max(0, Math.round((enteredAmt - currentDue) * 100) / 100) : 0;

    return {
      poTotal,
      baselineVerified: Math.round(baselineVerified * 100) / 100,
      currentDue,
      currentExcess,
      enteredAmt,
      willCountAsVerified,
      projectedVerified: Math.round(projectedVerified * 100) / 100,
      projectedDue,
      projectedExcess,
      appliedFromThisPayment: Math.round(appliedFromThisPayment * 100) / 100,
      excessFromThisPayment,
      isOverpaidAfter: projectedExcess > 0.009
    };
  }, [selectedModalPoLedger, editingPayment, newPayment.amount, newPayment.status]);

  const openNewPaymentModal = (poLedger = null, overrides = {}) => {
    setEditingPayment(null);
    setPaymentMediaFiles([]);
    const prePoId = overrides.po_id ?? (poLedger ? String(poLedger.po_id) : selectedPOFilter || '');
    const matchedPo = poLedgers.find((p) => String(p.po_id) === String(prePoId));
    const due = matchedPo ? Number(matchedPo.balance_due || 0) : 0;
    const paid = matchedPo ? Number(matchedPo.verified_paid || 0) : 0;

    setNewPayment({
      po_id: prePoId,
      payment_date: getTodayDate(),
      instrument_date: '',
      amount: overrides.amount ?? (due > 0 ? String(due) : ''),
      payment_method: overrides.payment_method || 'bank_transfer',
      transaction_reference: generateUtr('UTR'),
      bank_name: '',
      payer_name: matchedPo?.customer_name || '',
      payment_type: overrides.payment_type || (paid > 0 ? (due > 0 ? 'final' : 'advance') : 'advance'),
      status: overrides.status || 'verified',
      excess_handling: overrides.excess_handling || 'customer_credit',
      notes: overrides.notes || ''
    });
    setShowRecordModal(true);
  };

  const handleQuickExcessHandlingChange = async (payment, nextHandling) => {
    try {
      await api.updatePayment(payment.id, { excess_handling: nextHandling });
      await loadData();
    } catch (err) {
      alert('Failed to update excess treatment: ' + err.message);
    }
  };

  const openEditPaymentModal = (pay) => {
    setEditingPayment(pay);
    setPaymentMediaFiles([]);
    setNewPayment({
      po_id: String(pay.po_id),
      payment_date: pay.payment_date || getTodayDate(),
      instrument_date: pay.instrument_date || '',
      amount: String(pay.amount ?? ''),
      payment_method: pay.payment_method || 'bank_transfer',
      transaction_reference: pay.transaction_reference || '',
      bank_name: pay.bank_name || '',
      payer_name: pay.payer_name || pay.customer_name || '',
      payment_type: pay.payment_type || 'milestone',
      status: pay.status || 'verified',
      excess_handling: pay.excess_handling && pay.excess_handling !== 'none' ? pay.excess_handling : 'customer_credit',
      notes: pay.notes || ''
    });
    setShowRecordModal(true);
  };

  const handleRecordSubmit = async (e) => {
    e.preventDefault();
    if (savingPayment) return;
    if (!newPayment.po_id || newPayment.amount === '' || !newPayment.transaction_reference.trim()) {
      alert('Please select PO, enter payment amount, and provide transaction reference / UTR.');
      return;
    }

    setSavingPayment(true);
    try {
      const payload = {
        ...newPayment,
        po_id: Number(newPayment.po_id),
        amount: Number(newPayment.amount),
        excess_handling: modalProjection?.isOverpaidAfter ? (newPayment.excess_handling || 'customer_credit') : 'none'
      };

      if (editingPayment) {
        await api.updatePayment(editingPayment.id, payload);
        if (paymentMediaFiles.length > 0) {
          await api.uploadMedia('payment', editingPayment.id, paymentMediaFiles, currentUser?.id || 1);
        }
      } else {
        const payRes = await api.recordPayment(payload);
        const createdPayId = payRes.data?.id;
        if (paymentMediaFiles.length > 0 && createdPayId) {
          await api.uploadMedia('payment', createdPayId, paymentMediaFiles, currentUser?.id || 1);
        }
      }

      setPaymentMediaFiles([]);
      setShowRecordModal(false);
      setEditingPayment(null);
      await loadData();
    } catch (err) {
      alert('Failed to save payment: ' + err.message);
    } finally {
      setSavingPayment(false);
    }
  };

  const handleQuickStatusChange = async (payment, nextStatus) => {
    const label = nextStatus === 'verified' ? 'Verify' : nextStatus === 'rejected' ? 'Reject' : 'Mark Pending';
    let notes = payment.notes || '';
    if (nextStatus === 'rejected') {
      const reason = window.prompt(`Reason for rejecting ${payment.payment_number} (optional):`, '');
      if (reason === null) return;
      if (reason.trim()) notes = reason.trim();
    } else if (!window.confirm(`${label} payment ${payment.payment_number} (${formatCurrency(payment.amount)})?`)) {
      return;
    }

    try {
      await api.updatePaymentStatus(payment.id, {
        status: nextStatus,
        notes,
        verified_by: currentUser?.name || 'System Admin'
      });
      await loadData();
    } catch (err) {
      alert('Status update failed: ' + err.message);
    }
  };

  const handleDeletePayment = async (payment) => {
    if (!window.confirm(`Delete receipt ${payment.payment_number} (${formatCurrency(payment.amount)})? PO balance and excess credit will automatically recalculate.`)) {
      return;
    }
    try {
      await api.deletePayment(payment.id);
      await loadData();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const openSettleExcessModal = (poLedger) => {
    const otherOpenCustomerPOs = poLedgers.filter(
      (p) =>
        Number(p.customer_id) === Number(poLedger.customer_id) &&
        Number(p.po_id) !== Number(poLedger.po_id) &&
        p.po_status !== 'cancelled'
    );
    const defaultTarget =
      otherOpenCustomerPOs.find((p) => Number(p.balance_due || 0) > 0) || otherOpenCustomerPOs[0] || null;

    setSettleModalPO(poLedger);
    setSettleForm({
      action: defaultTarget ? 'transfer_to_po' : 'refund',
      target_po_id: defaultTarget ? String(defaultTarget.po_id) : '',
      amount: String(poLedger.excess_amount || 0),
      payment_date: getTodayDate(),
      payment_method: 'bank_transfer',
      transaction_reference: generateUtr(defaultTarget ? 'ADJ' : 'REF'),
      bank_name: '',
      notes: ''
    });
  };

  const handleSettleExcessSubmit = async (e) => {
    e.preventDefault();
    if (!settleModalPO || savingSettle) return;
    if (!settleForm.amount || Number(settleForm.amount) <= 0) {
      alert('Enter a valid positive settlement amount.');
      return;
    }
    if (settleForm.action === 'transfer_to_po' && !settleForm.target_po_id) {
      alert('Select a target Purchase Order for credit transfer.');
      return;
    }

    setSavingSettle(true);
    try {
      await api.settleExcessPayment({
        po_id: Number(settleModalPO.po_id),
        action: settleForm.action,
        target_po_id: settleForm.target_po_id ? Number(settleForm.target_po_id) : null,
        amount: Number(settleForm.amount),
        payment_date: settleForm.payment_date,
        payment_method: settleForm.payment_method,
        transaction_reference: settleForm.transaction_reference,
        bank_name: settleForm.bank_name,
        notes: settleForm.notes
      });
      setSettleModalPO(null);
      await loadData();
    } catch (err) {
      alert('Excess settlement failed: ' + err.message);
    } finally {
      setSavingSettle(false);
    }
  };

  const settleTargetOptions = useMemo(() => {
    if (!settleModalPO) return [];
    return poLedgers.filter(
      (p) =>
        Number(p.customer_id) === Number(settleModalPO.customer_id) &&
        Number(p.po_id) !== Number(settleModalPO.po_id) &&
        p.po_status !== 'cancelled'
    );
  }, [poLedgers, settleModalPO]);

  const handlePrintVoucher = () => {
    window.print();
  };

  return (
    <div className="space-y-3.5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            {activeSubTab === 'dashboard' ? (
              <BarChart3 className="h-4 w-4 text-slate-700" />
            ) : activeSubTab === 'advances' ? (
              <ArrowRightLeft className="h-4 w-4 text-violet-700" />
            ) : (
              <CreditCard className="h-4 w-4 text-slate-700" />
            )}
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">
              {activeSubTab === 'dashboard'
                ? 'Accounting & Finance Dashboard'
                : activeSubTab === 'advances'
                ? 'Advances, Excess Credits & Settlements'
                : activeSubTab === 'po_ledger'
                ? 'PO Payment Balances & Dues'
                : activeSubTab === 'customer_ledger'
                ? 'Customer Financial Accounts'
                : 'Payments, Receipts & Reconciliation'}
            </h1>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              Accounting &amp; Finance
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Track collections, order balances, customer advances, overpaid credits, refunds, and update payment statuses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenAudit && (
            <button
              type="button"
              onClick={() => onOpenAudit('payments')}
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
            >
              <History className="h-3.5 w-3.5" /> Payment Audit Trail
            </button>
          )}

          {canManagePayments && (
            <>
              <button
                type="button"
                onClick={() => openNewPaymentModal(null, { payment_type: 'advance' })}
                className="h-8 px-2.5 bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 rounded-md font-medium text-xs transition-colors flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Record Advance
              </button>
              <button
                type="button"
                onClick={() => openNewPaymentModal()}
                className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" /> Record Payment
              </button>
            </>
          )}
        </div>
      </div>

      {/* 5 Live Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500">Active PO Contract Value</span>
          <p className="text-lg font-bold text-slate-900 mt-0.5">{formatCurrency(kpis.total_contract_value)}</p>
          <span className="text-[10px] text-slate-400">
            {kpis.total_pos} Active PO(s) · {kpis.fully_paid_pos + kpis.overpaid_pos} Settled
          </span>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500">Verified Collected Funds</span>
          <p className="text-lg font-bold text-emerald-600 mt-0.5">{formatCurrency(kpis.total_verified_collected)}</p>
          <span className="text-[10px] text-emerald-700/80 font-medium">
            {kpis.collection_rate}% of PO Value · {kpis.receipt_count} Receipts
          </span>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500">Open Balance Due</span>
          <p className={`text-lg font-bold mt-0.5 ${kpis.total_balance_due > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
            {formatCurrency(kpis.total_balance_due)}
          </p>
          <span className="text-[10px] text-slate-400">
            {kpis.unpaid_or_partial_pos} PO(s) awaiting balance
          </span>
        </div>

        <button
          type="button"
          onClick={() => switchSubTab('po_ledger', { poStatusFilter: kpis.total_excess_received > 0 ? 'overpaid' : '' })}
          className={`text-left p-3 rounded-lg border shadow-xs transition-colors ${
            kpis.total_excess_received > 0
              ? 'bg-violet-50/70 border-violet-200 hover:bg-violet-50'
              : 'bg-white border-slate-200/90 hover:bg-slate-50'
          }`}
        >
          <span className="text-[11px] font-medium text-violet-700 flex items-center justify-between">
            Extra / Excess Received
            <Wallet className="h-3.5 w-3.5 text-violet-600" />
          </span>
          <p className={`text-lg font-bold mt-0.5 ${kpis.total_excess_received > 0 ? 'text-violet-700' : 'text-slate-700'}`}>
            {kpis.total_excess_received > 0 ? `+${formatCurrency(kpis.total_excess_received)}` : '₹0'}
          </p>
          <span className="text-[10px] text-violet-600/90 font-medium">
            {kpis.overpaid_pos} Overpaid PO(s) · Click to manage
          </span>
        </button>

        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500">Pending Verification / Rejected</span>
          <p className="text-lg font-bold text-slate-800 mt-0.5">
            {formatCurrency(kpis.total_pending_verification)}
          </p>
          <span className="text-[10px] text-slate-400">
            {kpis.pending_count} Pending · {kpis.rejected_count} Rejected ({formatCurrency(kpis.total_rejected)})
          </span>
        </div>
      </div>

      {/* Excess Alert Strip when any PO has Extra Received Amount */}
      {kpis.total_excess_received > 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-start sm:items-center gap-2 text-violet-900">
            <AlertTriangle className="h-4 w-4 text-violet-600 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong>Extra / Excess Payment Recorded:</strong>{' '}
              <strong>+{formatCurrency(kpis.total_excess_received)}</strong> received above contract value across{' '}
              <strong>{kpis.overpaid_pos}</strong> PO(s). You can keep it as customer advance credit, refund it, or transfer it to another PO.
            </span>
          </div>
          <button
            type="button"
            onClick={() => switchSubTab('advances')}
            className="h-7 px-2.5 bg-violet-700 hover:bg-violet-800 text-white rounded-md text-[11px] font-medium shrink-0 self-start sm:self-auto"
          >
            Manage Advances &amp; Excess
          </button>
        </div>
      )}

      {/* Module Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-1.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div className="flex flex-wrap gap-1 text-xs">
          <button
            type="button"
            onClick={() => switchSubTab('dashboard')}
            className={`px-3 py-1.5 rounded-md font-medium inline-flex items-center gap-1.5 ${
              activeSubTab === 'dashboard'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Dashboard
          </button>

          <button
            type="button"
            onClick={() => switchSubTab('transactions')}
            className={`px-3 py-1.5 rounded-md font-medium inline-flex items-center gap-1.5 ${
              activeSubTab === 'transactions'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Receipt className="h-3.5 w-3.5" />
            Payments &amp; Receipts ({payments.length})
          </button>

          <button
            type="button"
            onClick={() => switchSubTab('po_ledger')}
            className={`px-3 py-1.5 rounded-md font-medium inline-flex items-center gap-1.5 ${
              activeSubTab === 'po_ledger'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Wallet className="h-3.5 w-3.5" />
            PO Balances ({poLedgers.length})
          </button>

          <button
            type="button"
            onClick={() => switchSubTab('advances')}
            className={`px-3 py-1.5 rounded-md font-medium inline-flex items-center gap-1.5 ${
              activeSubTab === 'advances'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Advances &amp; Excess
            {kpis.overpaid_pos > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700">
                {kpis.overpaid_pos} Extra
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => switchSubTab('customer_ledger')}
            className={`px-3 py-1.5 rounded-md font-medium inline-flex items-center gap-1.5 ${
              activeSubTab === 'customer_ledger'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Customer Accounts ({customerLedgers.length})
          </button>
        </div>

        {selectedPOFilter && activeSubTab === 'transactions' && (
          <button
            type="button"
            onClick={() => setSelectedPOFilter('')}
            className="text-[11px] text-slate-600 hover:text-slate-900 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 inline-flex items-center gap-1"
          >
            Filtered by PO · Clear <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* === TAB 0: ACCOUNTING DASHBOARD === */}
      {activeSubTab === 'dashboard' && (
        <AccountingDashboardSection
          kpis={kpis}
          analytics={analytics}
          payments={payments}
          poLedgers={poLedgers}
          canManagePayments={canManagePayments}
          formatCurrency={formatCurrency}
          paymentTypeLabel={paymentTypeLabel}
          onNavigateSection={(sec, opts) => switchSubTab(sec, opts)}
          onViewPO={onViewPO}
          onRecordPayment={openNewPaymentModal}
          onEditPayment={openEditPaymentModal}
          onQuickStatusChange={handleQuickStatusChange}
          onSettleExcess={openSettleExcessModal}
          onViewVoucher={setVoucherPayment}
        />
      )}

      {/* === TAB 1: TRANSACTIONS LEDGER === */}
      {activeSubTab === 'transactions' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px]">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search receipt #, PO #, UTR, bank..."
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
                <option value="">All POs</option>
                {poLedgers.map((po) => (
                  <option key={po.po_id} value={po.po_id}>
                    {po.po_number}: {po.customer_name}
                  </option>
                ))}
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-8 px-2 border border-slate-200 rounded-md text-xs bg-white text-slate-700 font-medium"
              >
                <option value="">All Types</option>
                {paymentTypes.map((pt) => (
                  <option key={pt.id} value={pt.code}>{pt.name}</option>
                ))}
                <option value="excess_refund">Excess Refund</option>
                <option value="credit_transfer">Credit Transfer Out</option>
                <option value="advance_adjustment">Excess Credit Applied</option>
              </select>

              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="h-8 px-2 border border-slate-200 rounded-md text-xs bg-white text-slate-700 font-medium"
              >
                <option value="">All Modes</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 px-2 border border-slate-200 rounded-md text-xs bg-white text-slate-700 font-medium"
              >
                <option value="">All Statuses</option>
                <option value="verified">Verified</option>
                <option value="received">Pending Check</option>
                <option value="rejected">Rejected</option>
              </select>

              <label className="inline-flex items-center gap-1.5 h-8 px-2.5 bg-white border border-slate-200 rounded-md text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={excessOnlyFilter}
                  onChange={(e) => setExcessOnlyFilter(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>With Extra / Overpaid</span>
              </label>
            </div>

            <button
              type="button"
              onClick={() =>
                exportToCsv(
                  'payments_transactions',
                  [
                    { header: 'Receipt #', accessor: 'payment_number' },
                    { header: 'Date', accessor: 'payment_date' },
                    { header: 'PO #', accessor: 'po_number' },
                    { header: 'PO Total', accessor: 'po_total_amount' },
                    { header: 'Customer', accessor: 'customer_name' },
                    { header: 'Amount', accessor: 'amount' },
                    { header: 'Applied To PO', accessor: 'applied_amount' },
                    { header: 'Extra / Excess', accessor: 'excess_amount' },
                    { header: 'Excess Handling', accessor: (r) => EXCESS_HANDLING_LABELS[r.excess_handling] || r.excess_handling },
                    { header: 'Method', accessor: 'payment_method' },
                    { header: 'Bank / Channel', accessor: 'bank_name' },
                    { header: 'Payer', accessor: 'payer_name' },
                    { header: 'UTR Reference', accessor: 'transaction_reference' },
                    { header: 'Type', accessor: 'payment_type' },
                    { header: 'Status', accessor: 'status' },
                    { header: 'Notes', accessor: 'notes' }
                  ],
                  filteredPayments
                )
              }
              title="Export filtered transactions"
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading payment ledger...</div>
            ) : filteredPayments.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No payments match your filters.</div>
            ) : (
              <>
                <div className="px-3.5 py-2 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Total Receipts: <strong className="text-slate-800">{filteredPayments.length}</strong></span>
                  <span>Page {paymentsPagination.currentPage} of {paymentsPagination.totalPages}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                      <tr>
                        <th className="px-2 py-2.5 w-7 text-center">#</th>
                        <th className="px-2 py-2.5">Receipt # &amp; Date</th>
                        <th className="px-2 py-2.5">PO &amp; Client</th>
                        <th className="px-2 py-2.5">Amount &amp; Allocation</th>
                        <th className="px-2 py-2.5">Mode &amp; UTR</th>
                        <th className="px-2 py-2.5">Type &amp; Notes</th>
                        <th className="px-2 py-2.5">Evidence</th>
                        <th className="px-2 py-2.5">Status</th>
                        <th className="px-2 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paymentsPagination.paginatedItems.map((p, idx) => {
                        const amt = Number(p.amount || 0);
                        const excessRec = Number(p.excess_amount || 0);
                        const appliedRec = Number(p.applied_amount || 0);
                        const isNegative = amt < 0;

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/60 transition-colors align-top">
                            <td className="px-2 py-2.5 text-center font-mono text-[11px] text-slate-400">
                              {paymentsPagination.startIndex + idx + 1}
                            </td>

                            <td className="px-2 py-2.5 whitespace-nowrap">
                              <span className="font-mono text-[11px] font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                                {p.payment_number}
                              </span>
                              <p className="text-[10px] text-slate-500 mt-1">{p.payment_date}</p>
                              {p.instrument_date && p.instrument_date !== p.payment_date && (
                                <p className="text-[10px] text-slate-400">Clr: {p.instrument_date}</p>
                              )}
                            </td>

                            <td className="px-2 py-2.5 whitespace-nowrap">
                              <p className="font-semibold text-slate-900 truncate max-w-[140px]" title={p.customer_name}>
                                {p.customer_name}
                              </p>
                              <div className="mt-0.5 whitespace-nowrap">
                                {onViewPO ? (
                                  <button
                                    type="button"
                                    onClick={() => onViewPO(p.po_id)}
                                    className="text-[10px] font-mono font-semibold text-sky-700 hover:underline inline-flex items-center gap-0.5 whitespace-nowrap shrink-0"
                                  >
                                    {p.po_number} <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">{p.po_number}</span>
                                )}
                              </div>
                              <p className="text-[9px] text-slate-400 whitespace-nowrap">
                                PO: {formatCurrency(p.po_total_amount)}
                              </p>
                            </td>

                            <td className="px-2 py-2.5 whitespace-nowrap">
                              <p className={`font-bold ${isNegative ? 'text-rose-700' : 'text-emerald-600'}`}>
                                {isNegative ? `-${formatCurrency(Math.abs(amt))}` : formatCurrency(amt)}
                              </p>
                              {p.status === 'verified' && !isNegative && (
                                <div className="text-[10px] text-slate-500 mt-0.5 space-y-0.5">
                                  <div>To PO: <strong className="text-slate-700">{formatCurrency(appliedRec)}</strong></div>
                                  {excessRec > 0 && (
                                    <div>
                                      <span className="inline-block px-1.5 py-0.2 rounded bg-violet-50 text-violet-700 border border-violet-200 font-semibold">
                                        +{formatCurrency(excessRec)} Extra
                                      </span>
                                      {p.excess_handling && p.excess_handling !== 'none' && (
                                        <p className="text-[9px] text-violet-600 mt-0.5">
                                          {EXCESS_HANDLING_LABELS[p.excess_handling] || p.excess_handling}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              {isNegative && (
                                <span className="inline-block text-[10px] text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 mt-0.5">
                                  {EXCESS_HANDLING_LABELS[p.excess_handling] || 'Adjustment Out'}
                                </span>
                              )}
                            </td>

                            <td className="px-2 py-2.5 whitespace-nowrap">
                              <span className="uppercase text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                                {p.payment_method?.replace(/_/g, ' ')}
                              </span>
                              <p className="text-[10px] font-mono text-slate-700 mt-0.5">{p.transaction_reference}</p>
                              {(p.bank_name || p.payer_name) && (
                                <p className="text-[10px] text-slate-400 truncate max-w-[125px]">
                                  {[p.bank_name, p.payer_name].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </td>

                            <td className="px-2 py-2.5 max-w-[120px]">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold capitalize bg-slate-100 text-slate-700 whitespace-nowrap">
                                {paymentTypeLabel(p.payment_type)}
                              </span>
                              {p.notes && (
                                <p className="text-[10px] text-slate-500 mt-1 line-clamp-2" title={p.notes}>
                                  {p.notes}
                                </p>
                              )}
                            </td>

                            <td className="px-2 py-2.5 max-w-[125px]">
                              <MediaGallery attachments={paymentMediaMap[p.id] || []} />
                            </td>

                            <td className="px-2 py-2.5 whitespace-nowrap">
                              {getReceiptStatusBadge(p.status)}
                              {p.verified_by && p.status === 'verified' && (
                                <p className="text-[9px] text-slate-400 mt-0.5">by {p.verified_by}</p>
                              )}
                            </td>

                            <td className="px-2 py-2.5 text-right whitespace-nowrap space-x-0.5">
                              <button
                                type="button"
                                onClick={() => setVoucherPayment(p)}
                                className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
                                title="View Receipt Voucher"
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </button>

                              {canManagePayments && p.status !== 'verified' && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickStatusChange(p, 'verified')}
                                  className="p-1 text-emerald-600 hover:text-emerald-800 rounded hover:bg-emerald-50"
                                  title="Verify Payment"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {canManagePayments && p.status === 'received' && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickStatusChange(p, 'rejected')}
                                  className="p-1 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-50"
                                  title="Reject Payment"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {canManagePayments && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditPaymentModal(p)}
                                    className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
                                    title="Edit Receipt"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePayment(p)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                                    title="Delete Receipt"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
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
                currentPage={paymentsPagination.currentPage}
                totalPages={paymentsPagination.totalPages}
                totalItems={paymentsPagination.totalItems}
                pageSize={paymentsPagination.pageSize}
                onPageChange={paymentsPagination.setCurrentPage}
              />
            )}
          </div>
        </>
      )}

      {/* === TAB 2: PO BALANCE & EXCESS LEDGER === */}
      {activeSubTab === 'po_ledger' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px]">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search PO #, ref, customer, quote..."
                  value={poSearchQuery}
                  onChange={(e) => setPoSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <select
                value={poStatusFilter}
                onChange={(e) => setPoStatusFilter(e.target.value)}
                className="h-8 px-2.5 border border-slate-200 rounded-md text-xs bg-white text-slate-700 font-medium"
              >
                <option value="">All Payment Statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="pending_verification">Pending Verification</option>
                <option value="fully_paid">Fully Paid</option>
                <option value="overpaid">Overpaid / Has Extra Credit</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() =>
                exportToCsv(
                  'po_payment_balances',
                  [
                    { header: 'PO #', accessor: 'po_number' },
                    { header: 'Client PO Ref', accessor: 'customer_po_reference' },
                    { header: 'Customer', accessor: 'customer_name' },
                    { header: 'PO Date', accessor: 'po_date' },
                    { header: 'PO Total', accessor: 'po_total' },
                    { header: 'Verified Paid', accessor: 'verified_paid' },
                    { header: 'Pending Verification', accessor: 'pending_paid' },
                    { header: 'Balance Due', accessor: 'balance_due' },
                    { header: 'Extra / Excess Received', accessor: 'excess_amount' },
                    { header: '% Collected', accessor: 'percent_paid' },
                    { header: 'Payment Status', accessor: 'payment_status' }
                  ],
                  filteredPoLedgers
                )
              }
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading PO balances...</div>
            ) : filteredPoLedgers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No purchase orders match your filter.</div>
            ) : (
              <>
                <div className="px-3.5 py-2 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Orders Listed: <strong className="text-slate-800">{filteredPoLedgers.length}</strong></span>
                  <span>Page {poPagination.currentPage} of {poPagination.totalPages}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                      <tr>
                        <th className="px-3 py-2.5 w-10 text-center">#</th>
                        <th className="px-3.5 py-2.5">PO # &amp; Customer</th>
                        <th className="px-3.5 py-2.5 text-right">PO Total</th>
                        <th className="px-3.5 py-2.5">Verified Paid &amp; Progress</th>
                        <th className="px-3.5 py-2.5 text-right">Balance Due / Extra Credit</th>
                        <th className="px-3.5 py-2.5">Payment Status</th>
                        <th className="px-3.5 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {poPagination.paginatedItems.map((po, idx) => {
                        const pct = Math.min(100, Number(po.percent_paid || 0));
                        const hasExcess = Number(po.excess_amount || 0) > 0.009;
                        const hasDue = Number(po.balance_due || 0) > 0.009;

                        return (
                          <tr key={po.po_id} className="hover:bg-slate-50/60 align-top">
                            <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">
                              {poPagination.startIndex + idx + 1}
                            </td>

                            <td className="px-3.5 py-2.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {onViewPO ? (
                                  <button
                                    type="button"
                                    onClick={() => onViewPO(po.po_id)}
                                    className="font-mono font-semibold text-sky-700 hover:underline inline-flex items-center gap-0.5 whitespace-nowrap shrink-0"
                                  >
                                    {po.po_number} <ExternalLink className="h-3 w-3 shrink-0" />
                                  </button>
                                ) : (
                                  <span className="font-mono font-semibold text-slate-900 whitespace-nowrap">{po.po_number}</span>
                                )}
                                <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">{po.customer_po_reference}</span>
                              </div>
                              <p className="font-semibold text-slate-900 mt-0.5">{po.customer_name}</p>
                              <p className="text-[10px] text-slate-400">
                                {po.po_date} · {po.payment_terms || 'Standard terms'}
                              </p>
                            </td>

                            <td className="px-3.5 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
                              {formatCurrency(po.po_total)}
                              <p className="text-[10px] font-normal text-slate-400">{po.receipt_count} receipt(s)</p>
                            </td>

                            <td className="px-3.5 py-2.5 min-w-[180px]">
                              <div className="flex items-center justify-between text-[11px] mb-1">
                                <span className="font-semibold text-emerald-700">{formatCurrency(po.verified_paid)}</span>
                                <span className="text-slate-500 font-mono text-[10px]">{po.percent_paid}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    hasExcess ? 'bg-violet-600' : pct >= 99.9 ? 'bg-emerald-600' : 'bg-amber-500'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              {Number(po.pending_paid || 0) > 0 && (
                                <p className="text-[10px] text-amber-700 mt-1">
                                  Pending check: {formatCurrency(po.pending_paid)}
                                </p>
                              )}
                            </td>

                            <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                              {hasExcess ? (
                                <div className="inline-flex flex-col items-end">
                                  <span className="text-[11px] font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded border border-violet-200">
                                    +{formatCurrency(po.excess_amount)} Extra
                                  </span>
                                  <span className="text-[10px] text-slate-400 mt-0.5">Due: ₹0</span>
                                </div>
                              ) : hasDue ? (
                                <span className="font-bold text-amber-700">
                                  Due: {formatCurrency(po.balance_due)}
                                </span>
                              ) : (
                                <span className="text-emerald-700 font-semibold">₹0 (Settled)</span>
                              )}
                            </td>

                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${getPoStatusBadgeClass(
                                  po.payment_status
                                )}`}
                              >
                                {po.payment_status?.replace(/_/g, ' ')}
                              </span>
                            </td>

                            <td className="px-3.5 py-2.5 text-right whitespace-nowrap space-x-1">
                              {canManagePayments && (
                                <button
                                  type="button"
                                  onClick={() => openNewPaymentModal(po)}
                                  className="h-7 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[11px] font-medium inline-flex items-center gap-1"
                                >
                                  <Plus className="h-3 w-3" /> Pay
                                </button>
                              )}

                              {canManagePayments && hasExcess && (
                                <button
                                  type="button"
                                  onClick={() => openSettleExcessModal(po)}
                                  className="h-7 px-2 bg-violet-600 hover:bg-violet-700 text-white rounded text-[11px] font-medium inline-flex items-center gap-1"
                                >
                                  <ArrowRightLeft className="h-3 w-3" /> Settle Excess
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPOFilter(String(po.po_id));
                                  switchSubTab('transactions');
                                }}
                                className="h-7 px-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-[11px] font-medium"
                              >
                                Receipts ({po.receipt_count})
                              </button>
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
        </>
      )}

      {/* === TAB 3: ADVANCES, EXCESS CREDITS & SETTLEMENTS === */}
      {activeSubTab === 'advances' && (() => {
        const advStats = analytics.advance_stats || {};
        const overpaidPOs = poLedgers.filter((po) => Number(po.excess_amount || 0) > 0.009);
        const advanceAndExcessRows = advShowAll
          ? payments
          : payments.filter(
              (p) =>
                ['advance', 'advance_adjustment', 'credit_transfer', 'excess_refund', 'retention'].includes(p.payment_type) ||
                Number(p.excess_amount || 0) !== 0 ||
                p.status !== 'verified'
            );

        return (
          <div className="space-y-3.5">
            {/* Advance Metrics Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
                <span className="text-[11px] font-medium text-slate-500">Advance Payments Collected</span>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{formatCurrency(advStats.advance_total || 0)}</p>
                <span className="text-[10px] text-slate-400">{advStats.advance_count || 0} verified advance receipt(s)</span>
              </div>

              <div className="bg-violet-50/70 p-3 rounded-lg border border-violet-200 shadow-xs">
                <span className="text-[11px] font-medium text-violet-700">Available Extra / Excess Credits</span>
                <p className="text-lg font-bold text-violet-700 mt-0.5">
                  {Number(kpis.total_excess_received || 0) > 0 ? `+${formatCurrency(kpis.total_excess_received)}` : '₹0'}
                </p>
                <span className="text-[10px] text-violet-600">{overpaidPOs.length} PO(s) holding overpaid credit</span>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
                <span className="text-[11px] font-medium text-slate-500">Credits Transferred Across POs</span>
                <p className="text-lg font-bold text-sky-700 mt-0.5">{formatCurrency(advStats.transfer_total || 0)}</p>
                <span className="text-[10px] text-slate-400">{advStats.transfer_count || 0} PO-to-PO adjustment(s)</span>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
                <span className="text-[11px] font-medium text-slate-500">Excess Refunds Issued</span>
                <p className="text-lg font-bold text-rose-700 mt-0.5">{formatCurrency(advStats.refund_total || 0)}</p>
                <span className="text-[10px] text-slate-400">{advStats.refund_count || 0} refund voucher(s)</span>
              </div>
            </div>

            {/* Quick Advance Controls */}
            {canManagePayments && (
              <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <p className="font-semibold text-slate-900">Advance &amp; Overpayment Operations</p>
                  <p className="text-[11px] text-slate-500">
                    Record advance deposits, hold pending cheques, reclassify excess credit treatment, transfer to another PO, or issue refunds.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openNewPaymentModal(null, { payment_type: 'advance', status: 'verified' })}
                    className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium inline-flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Record Advance Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => openNewPaymentModal(null, { payment_type: 'advance', status: 'received', payment_method: 'cheque' })}
                    className="h-8 px-3 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-md font-medium inline-flex items-center gap-1"
                  >
                    <Clock className="h-3.5 w-3.5" /> Log Pending Cheque / Hold
                  </button>
                </div>
              </div>
            )}

            {/* POs Holding Excess Credit */}
            <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="px-3.5 py-2.5 bg-violet-50/60 border-b border-violet-200/80 flex items-center justify-between">
                <h2 className="text-xs font-semibold text-violet-950">
                  Orders Holding Excess / Extra Paid Balance ({overpaidPOs.length})
                </h2>
                <span className="text-[11px] text-violet-700">Settle by refunding or transferring credit to another PO</span>
              </div>
              {overpaidPOs.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">No POs currently hold excess/overpaid credit.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {overpaidPOs.map((po) => (
                    <div key={po.po_id} className="px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-slate-900">{po.po_number}</span>
                          <span className="font-semibold text-slate-800">{po.customer_name}</span>
                          <span className="px-1.5 py-0.2 rounded bg-violet-50 text-violet-700 border border-violet-200 font-bold text-[10px]">
                            +{formatCurrency(po.excess_amount)} Excess Credit
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          PO Contract: {formatCurrency(po.po_total)} · Verified Paid: {formatCurrency(po.verified_paid)} · Balance Due: ₹0
                        </p>
                      </div>
                      {canManagePayments && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openSettleExcessModal(po)}
                            className="h-7 px-2.5 bg-violet-700 hover:bg-violet-800 text-white rounded text-[11px] font-medium inline-flex items-center gap-1"
                          >
                            <ArrowRightLeft className="h-3 w-3" /> Refund / Transfer Excess
                          </button>
                          <button
                            type="button"
                            onClick={() => switchSubTab('transactions', { selectedPOFilter: String(po.po_id) })}
                            className="h-7 px-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded text-[11px] font-medium"
                          >
                            View Receipts ({po.receipt_count})
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Advance, Excess & Verification Adjustment Ledger (with Inline Update!) */}
            <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="px-3.5 py-2.5 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-semibold text-slate-900">
                    Advances, Excess Credits &amp; Verification Updates ({advanceAndExcessRows.length})
                  </h2>
                  <p className="text-[10px] text-slate-500">Update excess credit treatment inline, verify/reject holds, or edit payment details directly.</p>
                </div>
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={advShowAll}
                    onChange={(e) => setAdvShowAll(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Show all {payments.length} receipts</span>
                </label>
              </div>
              {advanceAndExcessRows.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">No advance or excess receipts found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                      <tr>
                        <th className="px-2.5 py-2.5">Receipt &amp; Date</th>
                        <th className="px-2.5 py-2.5">PO &amp; Client</th>
                        <th className="px-2.5 py-2.5">Type &amp; Mode</th>
                        <th className="px-2.5 py-2.5 text-right">Amount / Extra</th>
                        <th className="px-2.5 py-2.5">Excess Treatment</th>
                        <th className="px-2.5 py-2.5">Status</th>
                        <th className="px-2.5 py-2.5 text-right">Update Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {advanceAndExcessRows.map((p) => {
                        const excessRec = Number(p.excess_amount || 0);
                        const amt = Number(p.amount || 0);
                        return (
                          <tr key={p.id} className="hover:bg-slate-50/60 align-top">
                            <td className="px-2.5 py-2.5 whitespace-nowrap">
                              <span className="font-mono text-[11px] font-semibold text-slate-900">{p.payment_number}</span>
                              <p className="text-[10px] text-slate-500">{p.payment_date}</p>
                            </td>
                            <td className="px-2.5 py-2.5 whitespace-nowrap">
                              <p className="font-semibold text-slate-900">{p.customer_name}</p>
                              <p className="text-[10px] font-mono text-slate-500">{p.po_number}</p>
                            </td>
                            <td className="px-2.5 py-2.5 whitespace-nowrap">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold capitalize bg-slate-100 text-slate-700">
                                {paymentTypeLabel(p.payment_type)}
                              </span>
                              <p className="text-[10px] font-mono text-slate-500 mt-0.5">{p.transaction_reference}</p>
                            </td>
                            <td className="px-2.5 py-2.5 text-right whitespace-nowrap">
                              <p className={`font-bold ${amt < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {amt < 0 ? `-${formatCurrency(Math.abs(amt))}` : formatCurrency(amt)}
                              </p>
                              {excessRec > 0 && (
                                <span className="inline-block text-[10px] font-semibold text-violet-700 bg-violet-50 px-1.5 rounded border border-violet-200 mt-0.5">
                                  +{formatCurrency(excessRec)} Extra
                                </span>
                              )}
                            </td>
                            <td className="px-2.5 py-2.5 whitespace-nowrap">
                              {excessRec > 0 && canManagePayments ? (
                                <select
                                  aria-label={`Excess treatment for ${p.payment_number}`}
                                  value={p.excess_handling || 'customer_credit'}
                                  onChange={(e) => handleQuickExcessHandlingChange(p, e.target.value)}
                                  className="p-1 border border-violet-200 rounded bg-violet-50/60 text-[11px] text-violet-900 font-medium"
                                >
                                  <option value="customer_credit">Customer Advance Credit</option>
                                  <option value="adjust_next_po">Adjust in Next PO</option>
                                  <option value="refund_pending">Refund Pending</option>
                                  <option value="retained">Retained / Rounding</option>
                                </select>
                              ) : (
                                <span className="text-[11px] text-slate-500">
                                  {EXCESS_HANDLING_LABELS[p.excess_handling] || '—'}
                                </span>
                              )}
                            </td>
                            <td className="px-2.5 py-2.5 whitespace-nowrap">{getReceiptStatusBadge(p.status)}</td>
                            <td className="px-2.5 py-2.5 text-right whitespace-nowrap space-x-1">
                              <button
                                type="button"
                                onClick={() => setVoucherPayment(p)}
                                className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
                                title="Receipt Voucher"
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </button>
                              {canManagePayments && p.status !== 'verified' && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickStatusChange(p, 'verified')}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                  title="Verify Payment"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canManagePayments && (
                                <button
                                  type="button"
                                  onClick={() => openEditPaymentModal(p)}
                                  className="h-6 px-2 border border-slate-200 bg-white hover:bg-slate-900 hover:text-white rounded text-[11px] font-medium inline-flex items-center gap-1"
                                >
                                  <Edit3 className="h-3 w-3" /> Update
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* === TAB 4: CUSTOMER ACCOUNTS SUMMARY === */}
      {activeSubTab === 'customer_ledger' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="relative min-w-[240px]">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search customer name, email, phone..."
                value={customerSearchQuery}
                onChange={(e) => setCustomerSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                exportToCsv(
                  'customer_payment_accounts',
                  [
                    { header: 'Customer', accessor: 'customer_name' },
                    { header: 'POs', accessor: 'po_count' },
                    { header: 'Receipts', accessor: 'receipt_count' },
                    { header: 'Contract Value', accessor: 'total_po_value' },
                    { header: 'Verified Paid', accessor: 'total_verified_paid' },
                    { header: 'Pending Verification', accessor: 'total_pending_paid' },
                    { header: 'Balance Due', accessor: 'total_balance_due' },
                    { header: 'Extra Credit', accessor: 'total_excess_credit' },
                    { header: 'Net Receivable', accessor: 'net_receivable' }
                  ],
                  filteredCustomerLedgers
                )
              }
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading customer accounts...</div>
            ) : filteredCustomerLedgers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No customer financial records found.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                      <tr>
                        <th className="px-3 py-2.5 w-10 text-center">#</th>
                        <th className="px-3.5 py-2.5">Customer</th>
                        <th className="px-3.5 py-2.5 text-center">Orders / Receipts</th>
                        <th className="px-3.5 py-2.5 text-right">Contract Value</th>
                        <th className="px-3.5 py-2.5 text-right">Verified Paid</th>
                        <th className="px-3.5 py-2.5 text-right">Open Due</th>
                        <th className="px-3.5 py-2.5 text-right">Extra Credit Held</th>
                        <th className="px-3.5 py-2.5 text-right">Net Account Position</th>
                        <th className="px-3.5 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customerPagination.paginatedItems.map((c, idx) => {
                        const net = Number(c.net_receivable || 0);
                        return (
                          <tr key={c.customer_id} className="hover:bg-slate-50/60">
                            <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">
                              {customerPagination.startIndex + idx + 1}
                            </td>
                            <td className="px-3.5 py-2.5">
                              <p className="font-semibold text-slate-900">{c.customer_name}</p>
                              <p className="text-[10px] text-slate-400">
                                {[c.customer_email, c.customer_phone].filter(Boolean).join(' · ') || 'Active account'}
                              </p>
                            </td>
                            <td className="px-3.5 py-2.5 text-center text-slate-600">
                              {c.po_count} PO(s) · {c.receipt_count} receipt(s)
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-semibold text-slate-900">
                              {formatCurrency(c.total_po_value)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-semibold text-emerald-700">
                              {formatCurrency(c.total_verified_paid)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-semibold text-amber-700">
                              {formatCurrency(c.total_balance_due)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right">
                              {Number(c.total_excess_credit || 0) > 0 ? (
                                <span className="px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 font-bold text-[11px]">
                                  +{formatCurrency(c.total_excess_credit)}
                                </span>
                              ) : (
                                <span className="text-slate-400">₹0</span>
                              )}
                            </td>
                            <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                              {net < -0.009 ? (
                                <span className="text-violet-700 font-bold">
                                  Credit Balance +{formatCurrency(Math.abs(net))}
                                </span>
                              ) : net > 0.009 ? (
                                <span className="text-amber-700 font-bold">
                                  Receivable {formatCurrency(net)}
                                </span>
                              ) : (
                                <span className="text-emerald-700 font-semibold">Balanced (₹0)</span>
                              )}
                            </td>
                            <td className="px-3.5 py-2.5 text-right whitespace-nowrap space-x-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setPoSearchQuery(c.customer_name);
                                  setPoStatusFilter('');
                                  switchSubTab('po_ledger');
                                }}
                                className="h-7 px-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-[11px] font-medium"
                              >
                                View POs
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  currentPage={customerPagination.currentPage}
                  totalPages={customerPagination.totalPages}
                  totalItems={customerPagination.totalItems}
                  pageSize={customerPagination.pageSize}
                  onPageChange={customerPagination.setCurrentPage}
                />
              </>
            )}
          </div>
        </>
      )}

      {/* === MODAL 1: RECORD / EDIT PAYMENT === */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[92vh] flex flex-col shadow-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60 shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {editingPayment ? `Edit Payment ${editingPayment.payment_number}` : 'Record Inward Payment'}
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Partial settlements, full PO payments, and higher/advance payments with automatic excess credit tracking.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRecordModal(false);
                  setEditingPayment(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleRecordSubmit} className="flex flex-col flex-1 overflow-hidden text-xs">
              <div className="p-4 space-y-3 overflow-y-auto flex-1">
                {/* PO Selector */}
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Purchase Order *</label>
                  <select
                    required
                    value={newPayment.po_id}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      const found = poLedgers.find((po) => String(po.po_id) === String(nextId));
                      setNewPayment((prev) => ({
                        ...prev,
                        po_id: nextId,
                        payer_name: prev.payer_name || found?.customer_name || '',
                        amount:
                          !editingPayment && found
                            ? String(Number(found.balance_due || 0) > 0 ? found.balance_due : prev.amount)
                            : prev.amount
                      }));
                    }}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs bg-white focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="">-- Choose Customer PO --</option>
                    {poLedgers.map((po) => (
                      <option key={po.po_id} value={po.po_id}>
                        {po.po_number}: {po.customer_name} (Total: {formatCurrency(po.po_total)} ·{' '}
                        {Number(po.excess_amount || 0) > 0
                          ? `Extra: +${formatCurrency(po.excess_amount)}`
                          : `Due: ${formatCurrency(po.balance_due)}`}
                        )
                      </option>
                    ))}
                  </select>
                </div>

                {/* Live PO Financial Snapshot & Presets */}
                {modalProjection && selectedModalPoLedger && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">PO Contract Total</span>
                        <strong className="text-slate-900">{formatCurrency(modalProjection.poTotal)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Prior Verified Paid</span>
                        <strong className="text-emerald-700">{formatCurrency(modalProjection.baselineVerified)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Current Balance Due</span>
                        <strong className={modalProjection.currentDue > 0 ? 'text-amber-700' : 'text-slate-700'}>
                          {formatCurrency(modalProjection.currentDue)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Prior Extra Credit</span>
                        <strong className={modalProjection.currentExcess > 0 ? 'text-violet-700' : 'text-slate-700'}>
                          {modalProjection.currentExcess > 0 ? `+${formatCurrency(modalProjection.currentExcess)}` : '₹0'}
                        </strong>
                      </div>
                    </div>

                    {!editingPayment && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200/80">
                        <span className="text-[10px] font-medium text-slate-500 mr-1">Quick Fill:</span>
                        {modalProjection.currentDue > 0 && (
                          <button
                            type="button"
                            onClick={() => setNewPayment((p) => ({ ...p, amount: String(modalProjection.currentDue) }))}
                            className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-900 hover:text-white text-[10px] font-medium"
                          >
                            Balance Due ({formatCurrency(modalProjection.currentDue)})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setNewPayment((p) => ({
                              ...p,
                              amount: String(Math.round(modalProjection.poTotal * 0.5 * 100) / 100),
                              payment_type: 'advance'
                            }))
                          }
                          className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-900 hover:text-white text-[10px] font-medium"
                        >
                          50% Advance ({formatCurrency(Math.round(modalProjection.poTotal * 0.5 * 100) / 100)})
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setNewPayment((p) => ({
                              ...p,
                              amount: String(Math.round(modalProjection.poTotal * 0.25 * 100) / 100),
                              payment_type: 'milestone'
                            }))
                          }
                          className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-900 hover:text-white text-[10px] font-medium"
                        >
                          25% Milestone ({formatCurrency(Math.round(modalProjection.poTotal * 0.25 * 100) / 100)})
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Amount + Dates */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
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
                    <label className="block font-medium text-slate-700 mb-1">Payment Date *</label>
                    <input
                      type="date"
                      required
                      value={newPayment.payment_date}
                      onChange={(e) => setNewPayment({ ...newPayment, payment_date: e.target.value })}
                      className="w-full p-2 border border-slate-200 rounded-md text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Clearance / Cheque Date</label>
                    <input
                      type="date"
                      value={newPayment.instrument_date || ''}
                      onChange={(e) => setNewPayment({ ...newPayment, instrument_date: e.target.value })}
                      className="w-full p-2 border border-slate-200 rounded-md text-xs"
                    />
                  </div>
                </div>

                {/* Live Post-Payment Balance / Excess Projection Alert */}
                {modalProjection && Number(newPayment.amount || 0) > 0 && (
                  <div
                    className={`rounded-md p-2.5 border text-[11px] space-y-2 ${
                      modalProjection.isOverpaidAfter
                        ? 'bg-violet-50 border-violet-200 text-violet-900'
                        : modalProjection.projectedDue === 0 && modalProjection.willCountAsVerified
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50/70 border-amber-200 text-amber-900'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1 font-medium">
                      {!modalProjection.willCountAsVerified ? (
                        <span>
                          Receipt will save as <strong>{newPayment.status.replace('_', ' ')}</strong> — PO balance remains{' '}
                          <strong>{formatCurrency(modalProjection.currentDue)}</strong> until verified.
                        </span>
                      ) : modalProjection.isOverpaidAfter ? (
                        <span>
                          Higher than PO Balance!{' '}
                          {modalProjection.appliedFromThisPayment > 0 && (
                            <>Applied to PO: <strong>{formatCurrency(modalProjection.appliedFromThisPayment)}</strong> · </>
                          )}
                          Extra Recorded from Receipt:{' '}
                          <strong>+{formatCurrency(modalProjection.excessFromThisPayment)}</strong> (Total PO Excess:{' '}
                          <strong>+{formatCurrency(modalProjection.projectedExcess)}</strong>)
                        </span>
                      ) : modalProjection.projectedDue <= 0.009 ? (
                        <span>This payment settles {selectedModalPoLedger?.po_number} in full (₹0 balance due).</span>
                      ) : (
                        <span>
                          After this payment: Remaining Balance Due ={' '}
                          <strong>{formatCurrency(modalProjection.projectedDue)}</strong>
                        </span>
                      )}
                    </div>

                    {modalProjection.isOverpaidAfter && (
                      <div>
                        <label className="block font-semibold text-violet-900 mb-1">
                          How should the extra received amount be recorded?
                        </label>
                        <select
                          value={newPayment.excess_handling || 'customer_credit'}
                          onChange={(e) => setNewPayment({ ...newPayment, excess_handling: e.target.value })}
                          className="w-full p-1.5 border border-violet-300 rounded bg-white text-xs text-slate-900"
                        >
                          <option value="customer_credit">Hold as Customer Advance Credit (Available for Refund / Transfer)</option>
                          <option value="adjust_next_po">Adjust Against Next PO / Invoice</option>
                          <option value="refund_pending">Mark for Refund Pending to Customer</option>
                          <option value="retained">Retain as Charges / Rounding Difference</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Payment Type, Method, Verification Status */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Payment Type *</label>
                    <select
                      required
                      value={newPayment.payment_type}
                      onChange={(e) => setNewPayment({ ...newPayment, payment_type: e.target.value })}
                      className="w-full p-2 border border-slate-200 rounded-md text-xs bg-white focus:ring-1 focus:ring-slate-900"
                    >
                      <option value="">-- Select Type --</option>
                      {paymentTypes.map((pt) => (
                        <option key={pt.id} value={pt.code}>
                          {pt.name}
                        </option>
                      ))}
                      {editingPayment && SPECIAL_TYPE_LABELS[newPayment.payment_type] && (
                        <option value={newPayment.payment_type}>
                          {SPECIAL_TYPE_LABELS[newPayment.payment_type]}
                        </option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Payment Method *</label>
                    <select
                      required
                      value={newPayment.payment_method}
                      onChange={(e) => setNewPayment({ ...newPayment, payment_method: e.target.value })}
                      className="w-full p-2 border border-slate-200 rounded-md text-xs bg-white focus:ring-1 focus:ring-slate-900"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Verification Status</label>
                    <select
                      value={newPayment.status}
                      onChange={(e) => setNewPayment({ ...newPayment, status: e.target.value })}
                      className="w-full p-2 border border-slate-200 rounded-md text-xs bg-white focus:ring-1 focus:ring-slate-900"
                    >
                      <option value="verified">Verified &amp; Cleared</option>
                      <option value="received">Received (Pending Check)</option>
                      <option value="rejected">Rejected / Bounced</option>
                    </select>
                  </div>
                </div>

                {/* UTR Reference, Bank Name, Payer */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-medium text-slate-700">UTR / Ref # *</label>
                      <button
                        type="button"
                        onClick={() => setNewPayment((p) => ({ ...p, transaction_reference: generateUtr('UTR') }))}
                        className="text-[10px] text-sky-700 hover:underline font-medium"
                      >
                        Generate
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. HDFC-NEFT-994400192"
                      value={newPayment.transaction_reference}
                      onChange={(e) => setNewPayment({ ...newPayment, transaction_reference: e.target.value })}
                      className="w-full p-2 border border-slate-200 rounded-md text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Bank / UPI App / Cheque #</label>
                    <input
                      type="text"
                      placeholder="e.g. HDFC Bank Current A/c"
                      value={newPayment.bank_name || ''}
                      onChange={(e) => setNewPayment({ ...newPayment, bank_name: e.target.value })}
                      className="w-full p-2 border border-slate-200 rounded-md text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Payer / Remitter Name</label>
                    <input
                      type="text"
                      placeholder="Account / Company name"
                      value={newPayment.payer_name || ''}
                      onChange={(e) => setNewPayment({ ...newPayment, payer_name: e.target.value })}
                      className="w-full p-2 border border-slate-200 rounded-md text-xs"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Remarks / Settlement Notes</label>
                  <textarea
                    rows="2"
                    placeholder="Optional installment details, TDS note, or excess credit agreement..."
                    value={newPayment.notes || ''}
                    onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md text-xs resize-y"
                  />
                </div>

                <MediaUploader
                  files={paymentMediaFiles}
                  onChange={setPaymentMediaFiles}
                  label="Payment Proof / Receipt Screenshots (Optional)"
                />
              </div>

              <div className="flex justify-end space-x-2 px-4 py-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowRecordModal(false);
                    setEditingPayment(null);
                  }}
                  className="h-8 px-3 border border-slate-200 bg-white text-slate-600 rounded-md font-medium text-xs hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPayment}
                  className="h-8 px-4 bg-slate-900 text-white rounded-md font-medium text-xs hover:bg-slate-800 disabled:opacity-50"
                >
                  {savingPayment ? 'Saving...' : editingPayment ? 'Update Receipt' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === MODAL 2: SETTLE / REFUND / TRANSFER EXCESS CREDIT === */}
      {settleModalPO && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-lg w-full p-4 shadow-lg border border-slate-200 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Settle Extra / Excess Credit ({settleModalPO.po_number})
                </h2>
                <p className="text-[11px] text-slate-500">{settleModalPO.customer_name}</p>
              </div>
              <button type="button" onClick={() => setSettleModalPO(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="bg-violet-50 border border-violet-200 rounded-md p-2.5 text-xs grid grid-cols-3 gap-2">
              <div>
                <span className="text-[10px] text-violet-700 block">PO Total</span>
                <strong className="text-slate-900">{formatCurrency(settleModalPO.po_total)}</strong>
              </div>
              <div>
                <span className="text-[10px] text-violet-700 block">Verified Paid</span>
                <strong className="text-emerald-700">{formatCurrency(settleModalPO.verified_paid)}</strong>
              </div>
              <div>
                <span className="text-[10px] text-violet-700 block">Available Excess</span>
                <strong className="text-violet-800">+{formatCurrency(settleModalPO.excess_amount)}</strong>
              </div>
            </div>

            <form onSubmit={handleSettleExcessSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSettleForm((f) => ({ ...f, action: 'refund', transaction_reference: generateUtr('REF') }))}
                  className={`p-2.5 rounded-md border text-left transition-colors ${
                    settleForm.action === 'refund'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1">
                    <RotateCcw className="h-3.5 w-3.5" /> Refund to Customer
                  </div>
                  <p className={`text-[10px] mt-0.5 ${settleForm.action === 'refund' ? 'text-slate-300' : 'text-slate-500'}`}>
                    Record bank/UPI refund out
                  </p>
                </button>

                <button
                  type="button"
                  disabled={settleTargetOptions.length === 0}
                  onClick={() =>
                    setSettleForm((f) => ({
                      ...f,
                      action: 'transfer_to_po',
                      target_po_id: f.target_po_id || String(settleTargetOptions[0]?.po_id || ''),
                      transaction_reference: generateUtr('ADJ')
                    }))
                  }
                  className={`p-2.5 rounded-md border text-left transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                    settleForm.action === 'transfer_to_po'
                      ? 'border-violet-700 bg-violet-700 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1">
                    <ArrowRightLeft className="h-3.5 w-3.5" /> Transfer to Another PO
                  </div>
                  <p className={`text-[10px] mt-0.5 ${settleForm.action === 'transfer_to_po' ? 'text-violet-100' : 'text-slate-500'}`}>
                    {settleTargetOptions.length > 0
                      ? `${settleTargetOptions.length} other PO(s) found`
                      : 'No other PO for this client'}
                  </p>
                </button>
              </div>

              {settleForm.action === 'transfer_to_po' && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Target Purchase Order *</label>
                  <select
                    required
                    value={settleForm.target_po_id}
                    onChange={(e) => setSettleForm({ ...settleForm, target_po_id: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md bg-white text-xs"
                  >
                    <option value="">-- Choose Target PO --</option>
                    {settleTargetOptions.map((po) => (
                      <option key={po.po_id} value={po.po_id}>
                        {po.po_number} (Total: {formatCurrency(po.po_total)} · Due: {formatCurrency(po.balance_due)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Settlement Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={Number(settleModalPO.excess_amount || 0)}
                    required
                    value={settleForm.amount}
                    onChange={(e) => setSettleForm({ ...settleForm, amount: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md font-bold"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={settleForm.payment_date}
                    onChange={(e) => setSettleForm({ ...settleForm, payment_date: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Method</label>
                  <select
                    value={settleForm.payment_method}
                    onChange={(e) => setSettleForm({ ...settleForm, payment_method: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md bg-white"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Reference # *</label>
                  <input
                    type="text"
                    required
                    value={settleForm.transaction_reference}
                    onChange={(e) => setSettleForm({ ...settleForm, transaction_reference: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-md font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="Optional remark for audit trail..."
                  value={settleForm.notes}
                  onChange={(e) => setSettleForm({ ...settleForm, notes: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSettleModalPO(null)}
                  className="h-8 px-3 border border-slate-200 text-slate-600 rounded-md font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSettle}
                  className="h-8 px-4 bg-violet-700 hover:bg-violet-800 text-white rounded-md font-medium disabled:opacity-50"
                >
                  {savingSettle
                    ? 'Processing...'
                    : settleForm.action === 'transfer_to_po'
                    ? 'Transfer Credit'
                    : 'Record Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === MODAL 3: PRINTABLE RECEIPT VOUCHER === */}
      {voucherPayment && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-lg w-full p-5 shadow-lg border border-slate-200 space-y-4 text-xs">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Payment Receipt Voucher
                </span>
                <h2 className="text-base font-bold text-slate-900 font-mono mt-0.5">
                  {voucherPayment.payment_number}
                </h2>
                <p className="text-[11px] text-slate-500">Date: {voucherPayment.payment_date}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {getReceiptStatusBadge(voucherPayment.status)}
                <button
                  type="button"
                  onClick={() => setVoucherPayment(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-md border border-slate-200">
              <div>
                <span className="text-[10px] font-semibold uppercase text-slate-400 flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Received From
                </span>
                <p className="font-semibold text-slate-900 mt-0.5">{voucherPayment.customer_name}</p>
                {voucherPayment.customer_gst && (
                  <p className="font-mono text-[10px] text-slate-500">GST: {voucherPayment.customer_gst}</p>
                )}
                {voucherPayment.payer_name && (
                  <p className="text-[10px] text-slate-500">Payer: {voucherPayment.payer_name}</p>
                )}
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase text-slate-400">Against Order</span>
                <p className="font-mono font-semibold text-slate-900 mt-0.5">{voucherPayment.po_number}</p>
                <p className="text-[10px] text-slate-500">PO Total: {formatCurrency(voucherPayment.po_total_amount)}</p>
                <p className="text-[10px] text-slate-500">Ref: {voucherPayment.customer_po_reference}</p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-600">Transaction Amount</span>
                <strong className={`text-sm ${Number(voucherPayment.amount) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {Number(voucherPayment.amount) < 0
                    ? `-${formatCurrency(Math.abs(Number(voucherPayment.amount)))}`
                    : formatCurrency(voucherPayment.amount)}
                </strong>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-600">Applied Toward PO Balance</span>
                <strong className="text-slate-900">{formatCurrency(voucherPayment.applied_amount || 0)}</strong>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-600">Extra / Overpaid Credit Recorded</span>
                <strong className={Number(voucherPayment.excess_amount || 0) > 0 ? 'text-violet-700' : 'text-slate-700'}>
                  {Number(voucherPayment.excess_amount || 0) > 0
                    ? `+${formatCurrency(voucherPayment.excess_amount)}`
                    : '₹0'}
                </strong>
              </div>
              {voucherPayment.excess_handling && voucherPayment.excess_handling !== 'none' && (
                <div className="flex justify-between px-3 py-2 bg-violet-50/60">
                  <span className="text-violet-800">Excess Credit Treatment</span>
                  <strong className="text-violet-900">
                    {EXCESS_HANDLING_LABELS[voucherPayment.excess_handling] || voucherPayment.excess_handling}
                  </strong>
                </div>
              )}
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-600">Mode &amp; UTR / Reference</span>
                <span className="font-mono text-slate-900">
                  {voucherPayment.payment_method?.replace(/_/g, ' ').toUpperCase()} · {voucherPayment.transaction_reference}
                </span>
              </div>
              {voucherPayment.bank_name && (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-slate-600">Bank / Channel</span>
                  <span className="text-slate-900">{voucherPayment.bank_name}</span>
                </div>
              )}
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-600">Payment Type</span>
                <span className="capitalize text-slate-900">{paymentTypeLabel(voucherPayment.payment_type)}</span>
              </div>
            </div>

            {voucherPayment.notes && (
              <div className="bg-slate-50 p-2.5 rounded border border-slate-200 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">Remarks: </span>
                {voucherPayment.notes}
              </div>
            )}

            {(paymentMediaMap[voucherPayment.id] || []).length > 0 && (
              <div>
                <span className="text-[11px] font-semibold text-slate-700 block mb-1">Attached Proof</span>
                <MediaGallery attachments={paymentMediaMap[voucherPayment.id]} />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handlePrintVoucher}
                className="h-8 px-3 border border-slate-200 text-slate-700 rounded-md font-medium hover:bg-slate-50 inline-flex items-center gap-1"
              >
                <Printer className="h-3.5 w-3.5" /> Print Voucher
              </button>
              <button
                type="button"
                onClick={() => setVoucherPayment(null)}
                className="h-8 px-4 bg-slate-900 text-white rounded-md font-medium hover:bg-slate-800"
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
