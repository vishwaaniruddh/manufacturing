// client/src/components/AccountingDashboardSection.jsx
import React, { useMemo } from 'react';
import EChartWrapper from './dashboard/EChartWrapper';
import {
  CheckCircle2,
  XCircle,
  Edit3,
  FileText,
  ArrowRightLeft,
  Plus,
  Clock,
  Wallet,
  CreditCard,
  TrendingUp,
  ExternalLink
} from 'lucide-react';

const METHOD_COLORS = ['#0f172a', '#0284c7', '#10b981', '#7c3aed', '#f59e0b'];

export default function AccountingDashboardSection({
  kpis = {},
  analytics = {},
  payments = [],
  poLedgers = [],
  canManagePayments = false,
  formatCurrency,
  paymentTypeLabel,
  onNavigateSection,
  onViewPO,
  onRecordPayment,
  onEditPayment,
  onQuickStatusChange,
  onSettleExcess,
  onViewVoucher
}) {
  const byMethod = useMemo(() => analytics.by_method || [], [analytics.by_method]);
  const byType = useMemo(() => analytics.by_type || [], [analytics.by_type]);
  const advanceStats = analytics.advance_stats || {};

  const pendingQueue = useMemo(
    () => payments.filter((p) => p.status === 'received'),
    [payments]
  );

  const overpaidPOs = useMemo(
    () => poLedgers.filter((po) => Number(po.excess_amount || 0) > 0.009),
    [poLedgers]
  );

  const openReceivablePOs = useMemo(
    () => poLedgers.filter((po) => po.po_status !== 'cancelled' && Number(po.balance_due || 0) > 0.009),
    [poLedgers]
  );

  const recentReceipts = useMemo(() => payments.slice(0, 6), [payments]);

  const methodChartOption = useMemo(() => {
    const data = byMethod.map((item, idx) => ({
      name: String(item.method || 'bank_transfer').replace(/_/g, ' ').toUpperCase(),
      value: Number(item.amount || 0),
      count: Number(item.count || 0),
      itemStyle: { color: METHOD_COLORS[idx % METHOD_COLORS.length] }
    }));

    return {
      tooltip: {
        trigger: 'item',
        formatter: (p) =>
          `<strong>${p.name}</strong><br/>Collected: ${formatCurrency(p.value)} (${p.percent}%)<br/>Receipts: ${p.data?.count || 0}`
      },
      legend: {
        bottom: 0,
        textStyle: { fontSize: 10, color: '#475569' }
      },
      series: [
        {
          name: 'Payment Mode',
          type: 'pie',
          radius: ['45%', '72%'],
          center: ['50%', '43%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          data: data.length > 0 ? data : [{ name: 'No Verified Collections', value: 0, itemStyle: { color: '#e2e8f0' } }]
        }
      ]
    };
  }, [byMethod, formatCurrency]);

  const typeChartOption = useMemo(() => {
    const labels = byType.map((t) => paymentTypeLabel(t.payment_type));
    const values = byType.map((t) => Number(t.amount || 0));

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const item = Array.isArray(params) ? params[0] : params;
          if (!item) return '';
          const row = byType[item.dataIndex];
          return `<strong>${item.name}</strong><br/>Total: ${formatCurrency(item.value)}<br/>Receipts: ${row?.count || 0}`;
        }
      },
      grid: { left: 16, right: 16, top: 18, bottom: 28, containLabel: true },
      xAxis: {
        type: 'category',
        data: labels.length > 0 ? labels : ['No Data'],
        axisLabel: { fontSize: 10, color: '#475569', interval: 0 }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 10,
          color: '#64748b',
          formatter: (v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`)
        },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 38,
          data: values.length > 0 ? values : [0],
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: (params) => (Number(params.value) < 0 ? '#e11d48' : '#0f172a')
          }
        }
      ]
    };
  }, [byType, formatCurrency, paymentTypeLabel]);

  return (
    <div className="space-y-3.5">
      {/* Advance & Reconciliation Highlight Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Advance Payments Collected</span>
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <p className="text-lg font-bold text-slate-900 mt-0.5">
            {formatCurrency(advanceStats.advance_total || 0)}
          </p>
          <span className="text-[10px] text-slate-400">
            {advanceStats.advance_count || 0} verified advance receipt(s)
          </span>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Excess &amp; Overpaid Credit Pool</span>
            <Wallet className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <p className={`text-lg font-bold mt-0.5 ${Number(kpis.total_excess_received || 0) > 0 ? 'text-violet-700' : 'text-slate-800'}`}>
            {Number(kpis.total_excess_received || 0) > 0 ? `+${formatCurrency(kpis.total_excess_received)}` : '₹0'}
          </p>
          <span className="text-[10px] text-slate-400">
            Refunded: {formatCurrency(advanceStats.refund_total || 0)} · Transferred: {formatCurrency(advanceStats.transfer_total || 0)}
          </span>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Awaiting Verification</span>
            <Clock className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <p className={`text-lg font-bold mt-0.5 ${pendingQueue.length > 0 ? 'text-amber-700' : 'text-slate-800'}`}>
            {formatCurrency(kpis.total_pending_verification || 0)}
          </p>
          <span className="text-[10px] text-slate-400">
            {pendingQueue.length} pending receipt(s) · {kpis.rejected_count || 0} rejected
          </span>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Quick Accounting Actions</span>
            <CreditCard className="h-3.5 w-3.5 text-sky-600" />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {canManagePayments && (
              <button
                type="button"
                onClick={() => onRecordPayment && onRecordPayment(null, { payment_type: 'advance' })}
                className="h-7 px-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-[11px] font-medium inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Record Advance
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigateSection && onNavigateSection('accounting_advances')}
              className="h-7 px-2.5 bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 rounded text-[11px] font-medium inline-flex items-center gap-1"
            >
              <ArrowRightLeft className="h-3 w-3" /> Advances &amp; Excess
            </button>
          </div>
        </div>
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <div className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-xs font-semibold text-slate-900">Verified Collections by Payment Mode</h2>
              <p className="text-[11px] text-slate-500">Channel mix across Bank Transfer, UPI, Cheque, Card, and Cash</p>
            </div>
            <span className="text-[11px] font-semibold text-emerald-700">{formatCurrency(kpis.total_verified_collected)}</span>
          </div>
          <EChartWrapper option={methodChartOption} height={220} />
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-xs font-semibold text-slate-900">Cashflow by Payment Type &amp; Adjustments</h2>
              <p className="text-[11px] text-slate-500">Advances, milestones, final settlements, and excess refunds</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection && onNavigateSection('payments')}
              className="text-[11px] text-sky-700 hover:underline font-medium"
            >
              Open Full Ledger →
            </button>
          </div>
          <EChartWrapper option={typeChartOption} height={220} />
        </div>
      </div>

      {/* Action Queues: Pending Verifications & Overpaid / Excess Credits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* Pending Verification Queue */}
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-3.5 py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-slate-900">
                Pending Payment Verifications ({pendingQueue.length})
              </h2>
              <p className="text-[10px] text-slate-500">Review cheques, NEFT holds, or unverified entries to verify, edit, or reject.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection && onNavigateSection('payments', { statusFilter: 'received' })}
              className="text-[11px] font-medium text-sky-700 hover:underline"
            >
              View All
            </button>
          </div>

          {pendingQueue.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 space-y-2">
              <p>All recorded receipts are currently verified.</p>
              {canManagePayments && (
                <button
                  type="button"
                  onClick={() => onRecordPayment && onRecordPayment(null, { status: 'received', payment_method: 'cheque' })}
                  className="h-7 px-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-[11px] font-medium"
                >
                  + Log Pending Cheque / Hold Receipt
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingQueue.map((p) => (
                <div key={p.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-semibold text-slate-900">{p.payment_number}</span>
                      <span className="text-[10px] uppercase bg-amber-50 text-amber-700 border border-amber-200 px-1.5 rounded font-semibold">
                        {p.payment_method?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 truncate">
                      {p.customer_name} · {p.po_number} · Ref: {p.transaction_reference}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <strong className="text-amber-700">{formatCurrency(p.amount)}</strong>
                    {canManagePayments && (
                      <>
                        <button
                          type="button"
                          onClick={() => onQuickStatusChange(p, 'verified')}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                          title="Verify Payment"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onQuickStatusChange(p, 'rejected')}
                          className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                          title="Reject Payment"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditPayment(p)}
                          className="p-1 text-slate-500 hover:bg-slate-100 rounded"
                          title="Edit Receipt"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Excess & Overpaid POs Queue */}
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-3.5 py-2.5 bg-violet-50/50 border-b border-violet-200/80 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-violet-950">
                Overpaid POs &amp; Excess Credit Balances ({overpaidPOs.length})
              </h2>
              <p className="text-[10px] text-violet-700">Customer payments exceeding PO totals — refund or transfer credit.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection && onNavigateSection('accounting_advances')}
              className="text-[11px] font-medium text-violet-700 hover:underline"
            >
              Manage Advances →
            </button>
          </div>

          {overpaidPOs.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No excess or overpaid customer credit held right now.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {overpaidPOs.map((po) => (
                <div key={po.po_id} className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {onViewPO ? (
                        <button
                          type="button"
                          onClick={() => onViewPO(po.po_id)}
                          className="font-mono font-semibold text-sky-700 hover:underline inline-flex items-center gap-0.5"
                        >
                          {po.po_number} <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      ) : (
                        <span className="font-mono font-semibold text-slate-900">{po.po_number}</span>
                      )}
                      <span className="text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-1.5 rounded">
                        +{formatCurrency(po.excess_amount)} Extra
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 truncate">
                      {po.customer_name} · Total: {formatCurrency(po.po_total)} · Paid: {formatCurrency(po.verified_paid)}
                    </p>
                  </div>
                  {canManagePayments && (
                    <button
                      type="button"
                      onClick={() => onSettleExcess(po)}
                      className="h-7 px-2.5 bg-violet-700 hover:bg-violet-800 text-white rounded text-[11px] font-medium inline-flex items-center gap-1 shrink-0"
                    >
                      <ArrowRightLeft className="h-3 w-3" /> Settle Excess
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Open Receivables & Recent Receipts (Quick Update) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-3.5 py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-900">
              Open Receivables ({openReceivablePOs.length})
            </h2>
            <button
              type="button"
              onClick={() => onNavigateSection && onNavigateSection('accounting_po_balances')}
              className="text-[11px] font-medium text-sky-700 hover:underline"
            >
              PO Balances →
            </button>
          </div>
          {openReceivablePOs.length === 0 ? (
            <div className="p-6 text-center text-xs text-emerald-700">
              All active Purchase Orders have zero open balance due.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {openReceivablePOs.slice(0, 6).map((po) => (
                <div key={po.po_id} className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">
                      {po.po_number} · {po.customer_name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Total: {formatCurrency(po.po_total)} · Paid: {formatCurrency(po.verified_paid)} ({po.percent_paid}%)
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <strong className="text-amber-700">Due: {formatCurrency(po.balance_due)}</strong>
                    {canManagePayments && (
                      <button
                        type="button"
                        onClick={() => onRecordPayment(po)}
                        className="h-7 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[11px] font-medium"
                      >
                        + Collect
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-3.5 py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-900">
              Recent Receipts (Quick Update &amp; Voucher)
            </h2>
            <button
              type="button"
              onClick={() => onNavigateSection && onNavigateSection('payments')}
              className="text-[11px] font-medium text-sky-700 hover:underline"
            >
              All Receipts →
            </button>
          </div>
          {recentReceipts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No payments recorded yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentReceipts.map((p) => (
                <div key={p.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-semibold text-slate-900">{p.payment_number}</span>
                      <span className="text-[10px] text-slate-500">{p.payment_date}</span>
                      {Number(p.excess_amount || 0) > 0 && (
                        <span className="text-[9px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-1 rounded">
                          +{formatCurrency(p.excess_amount)} Extra
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">
                      {p.customer_name} · {p.po_number} · {paymentTypeLabel(p.payment_type)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <strong className={Number(p.amount) < 0 ? 'text-rose-700 mr-1' : 'text-emerald-700 mr-1'}>
                      {Number(p.amount) < 0 ? `-${formatCurrency(Math.abs(Number(p.amount)))}` : formatCurrency(p.amount)}
                    </strong>
                    <button
                      type="button"
                      onClick={() => onViewVoucher(p)}
                      className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
                      title="Receipt Voucher"
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </button>
                    {canManagePayments && (
                      <button
                        type="button"
                        onClick={() => onEditPayment(p)}
                        className="p-1 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100"
                        title="Update Payment"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
