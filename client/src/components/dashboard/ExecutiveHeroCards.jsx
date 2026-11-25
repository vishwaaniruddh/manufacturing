// client/src/components/dashboard/ExecutiveHeroCards.jsx
import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip
} from 'recharts';
import {
  IndianRupee,
  CreditCard,
  TrendingUp,
  FileSpreadsheet,
  ArrowUpRight,
  UserCheck,
  Hammer,
  ShieldCheck,
  ClipboardList,
  Boxes,
  Truck,
  PackageCheck,
  Ticket,
  AlertTriangle
} from 'lucide-react';
import { canAccessTab } from '../../utils/rbac';
import { formatInrCompact, formatInrFull } from '../../utils/dateRange';

function MiniSparkline({ data, dataKey, seriesLabel, stroke, fill, idSuffix }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-9 w-full rounded bg-slate-100/40 flex items-center justify-center text-[10px] text-slate-400">
        No trend data in range
      </div>
    );
  }

  return (
    <div className="h-9 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 3, left: 3, bottom: 1 }}>
          <defs>
            <linearGradient id={`spark-${idSuffix}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={fill} stopOpacity={0.35} />
              <stop offset="95%" stopColor={fill} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <RechartsTooltip
            contentStyle={{
              fontSize: '10px',
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#0f172a'
            }}
            formatter={(val) => [formatInrCompact(val), seriesLabel]}
            labelFormatter={(label) => label || 'Date'}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            name={seriesLabel}
            stroke={stroke}
            strokeWidth={1.75}
            fill={`url(#spark-${idSuffix})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ExecutiveHeroCards({
  currentUser,
  summary,
  onNavigate,
  onSelectExplorerTab
}) {
  const {
    leads = {},
    quotations = {},
    purchase_orders = {},
    finance = {},
    manufacturing = {},
    qc = {},
    inventory = {},
    logistics = {},
    customer_service = {},
    analytics = {}
  } = summary || {};

  const trend = (analytics.revenue_trend || []).map((d) => ({
    date: d.date,
    po_value: Number(d.po_value || 0),
    cash_collected: Number(d.cash_collected || 0),
    quote_value: Number(d.quote_value || 0),
    lead_value: Number(d.lead_value || 0)
  }));

  const safeNav = (tab) => {
    if (canAccessTab(currentUser, tab)) {
      onNavigate(tab);
    }
  };

  const statPillClass =
    'px-2 py-1 rounded-md text-[10px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500';

  const overdueCount = Number(purchase_orders.overdue_count || 0);
  const custInsp = customer_service.inspections || {};
  const reqStats = inventory.requisitions || {};
  const totalUnitFlow = Number(qc.passed_units || 0) + Number(qc.rejected_units || 0);

  return (
    <div className="space-y-3">
      {/* ROW 1: 4 EXECUTIVE FINANCIAL & COMMERCIAL HERO CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Hero Card 1: Order Book */}
        <article className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white p-4 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between gap-2.5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => safeNav('purchase_orders')}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-300 hover:text-white cursor-pointer group whitespace-nowrap"
              >
                <IndianRupee className="h-3.5 w-3.5 text-sky-400" />
                <span>Total Order Book</span>
                <ArrowUpRight className="h-3 w-3 opacity-60 group-hover:opacity-100" />
              </button>
              <span className="text-[10px] font-medium text-slate-300 whitespace-nowrap">
                Avg: <strong className="text-white">{formatInrCompact(purchase_orders.avg_order_value)}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => safeNav('purchase_orders')}
              className="block text-left text-2xl font-bold tracking-tight mt-1 hover:text-sky-300 cursor-pointer"
              title={formatInrFull(finance.total_order_value)}
            >
              {formatInrFull(finance.total_order_value)}
            </button>
          </div>

          <MiniSparkline
            data={trend}
            dataKey="po_value"
            seriesLabel="PO Bookings"
            stroke="#38bdf8"
            fill="#38bdf8"
            idSuffix="po"
          />

          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-700/70">
            <button
              type="button"
              onClick={() => safeNav('purchase_orders')}
              className={`${statPillClass} bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700`}
            >
              {purchase_orders.total || 0} POs
            </button>
            <button
              type="button"
              onClick={() => safeNav('purchase_orders')}
              className={`${statPillClass} bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30`}
            >
              {purchase_orders.completed || 0} Done
            </button>
            <button
              type="button"
              onClick={() => safeNav('manufacturing')}
              className={`${statPillClass} bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30`}
            >
              {purchase_orders.in_production || 0} In Prod
            </button>
            {overdueCount > 0 && (
              <button
                type="button"
                onClick={() => onSelectExplorerTab && onSelectExplorerTab('deadlines')}
                className={`${statPillClass} bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/40 inline-flex items-center gap-1`}
              >
                <AlertTriangle className="h-3 w-3" /> {overdueCount} Overdue
              </button>
            )}
          </div>
        </article>

        {/* Hero Card 2: Cash Collections */}
        <article className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs hover:border-emerald-300 flex flex-col justify-between gap-2.5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => safeNav('payments')}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-emerald-700 cursor-pointer group whitespace-nowrap"
              >
                <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
                <span>Cash Collected</span>
                <ArrowUpRight className="h-3 w-3 opacity-50 group-hover:opacity-100" />
              </button>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                {finance.collection_percentage || 0}% ({finance.payment_count || 0})
              </span>
            </div>
            <button
              type="button"
              onClick={() => safeNav('payments')}
              className="block text-left text-2xl font-bold text-emerald-600 tracking-tight mt-1 hover:text-emerald-700 cursor-pointer"
            >
              {formatInrFull(finance.total_received)}
            </button>
          </div>

          <MiniSparkline
            data={trend}
            dataKey="cash_collected"
            seriesLabel="Cash Collected"
            stroke="#10b981"
            fill="#10b981"
            idSuffix="cash"
          />

          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-emerald-500"
                style={{
                  width: `${finance.total_order_value > 0 ? Math.min(100, (Number(finance.advance_received || 0) / Number(finance.total_order_value)) * 100) : 0}%`
                }}
                title="Advance Collections"
              />
              <div
                className="h-full bg-teal-600"
                style={{
                  width: `${finance.total_order_value > 0 ? Math.min(100, (Number(finance.final_received || 0) / Number(finance.total_order_value)) * 100) : 0}%`
                }}
                title="Final Settlements"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => safeNav('payments')}
                className={`${statPillClass} bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200`}
              >
                Adv: {formatInrCompact(finance.advance_received)}
              </button>
              <button
                type="button"
                onClick={() => safeNav('payments')}
                className={`${statPillClass} bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200`}
              >
                Final: {formatInrCompact(finance.final_received)}
              </button>
              {Number(finance.milestone_received || 0) > 0 && (
                <button
                  type="button"
                  onClick={() => safeNav('payments')}
                  className={`${statPillClass} bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200`}
                >
                  Mile: {formatInrCompact(finance.milestone_received)}
                </button>
              )}
            </div>
          </div>
        </article>

        {/* Hero Card 3: Accounts Receivable & Payment Status */}
        <article className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs hover:border-amber-300 flex flex-col justify-between gap-2.5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => safeNav('payments')}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-amber-700 cursor-pointer group whitespace-nowrap"
              >
                <TrendingUp className="h-3.5 w-3.5 text-amber-600" />
                <span>Accounts Receivable</span>
                <ArrowUpRight className="h-3 w-3 opacity-50 group-hover:opacity-100" />
              </button>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                {purchase_orders.due_7d_count || 0} Due 7d
              </span>
            </div>
            <button
              type="button"
              onClick={() => safeNav('payments')}
              className="block text-left text-2xl font-bold text-amber-600 tracking-tight mt-1 hover:text-amber-700 cursor-pointer"
            >
              {formatInrFull(finance.balance_due)}
            </button>
            <div className="flex items-center justify-between gap-2 mt-1.5">
              <p className="text-[11px] text-slate-500">
                Live Total Due: <strong className="text-slate-800">{formatInrCompact(finance.all_time_receivable)}</strong>
              </p>
              {overdueCount > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectExplorerTab && onSelectExplorerTab('deadlines')}
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer whitespace-nowrap"
                >
                  {formatInrCompact(purchase_orders.overdue_value)} Risk
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>PO Payment Health</span>
              <span className="font-semibold text-slate-700">{purchase_orders.total || 0} Orders</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => safeNav('purchase_orders')}
                className={`${statPillClass} bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200`}
              >
                {purchase_orders.fully_paid || 0} Fully Paid
              </button>
              <button
                type="button"
                onClick={() => safeNav('payments')}
                className={`${statPillClass} bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200`}
              >
                {purchase_orders.partially_paid || 0} Partial
              </button>
              <button
                type="button"
                onClick={() => safeNav('payments')}
                className={`${statPillClass} bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200`}
              >
                {purchase_orders.unpaid || 0} Unpaid
              </button>
            </div>
          </div>
        </article>

        {/* Hero Card 4: Quotation & Commercial Pipeline */}
        <article className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs hover:border-sky-300 flex flex-col justify-between gap-2.5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => safeNav('quotations')}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-sky-700 cursor-pointer group whitespace-nowrap"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-sky-600" />
                <span>Quotation Pipeline</span>
                <ArrowUpRight className="h-3 w-3 opacity-50 group-hover:opacity-100" />
              </button>
              <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                {quotations.conversion_rate || 0}% Win
              </span>
            </div>
            <button
              type="button"
              onClick={() => safeNav('quotations')}
              className="block text-left text-2xl font-bold text-slate-900 tracking-tight mt-1 hover:text-sky-700 cursor-pointer"
            >
              {formatInrFull(quotations.total_value)}
            </button>
          </div>

          <MiniSparkline
            data={trend}
            dataKey="quote_value"
            seriesLabel="Quotation Value"
            stroke="#0284c7"
            fill="#0ea5e9"
            idSuffix="quote"
          />

          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => safeNav('quotations')}
              className={`${statPillClass} bg-slate-100 hover:bg-slate-200 text-slate-700`}
            >
              {quotations.draft || 0} Draft
            </button>
            <button
              type="button"
              onClick={() => safeNav('quotations')}
              className={`${statPillClass} bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200`}
            >
              {quotations.approved || 0} Appr ({formatInrCompact(quotations.approved_value)})
            </button>
            <button
              type="button"
              onClick={() => safeNav('leads')}
              className={`${statPillClass} bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200`}
            >
              {leads.total || 0} Leads
            </button>
          </div>
        </article>
      </div>

      {/* ROW 2: 8 OPERATIONAL DEPARTMENT COMMAND CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* 1. Leads & Sales Intake */}
        <article className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-300">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => safeNav('leads')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 hover:text-sky-700 cursor-pointer"
            >
              <UserCheck className="h-3.5 w-3.5 text-indigo-600" /> Leads &amp; Sales Intake
            </button>
            <button
              type="button"
              onClick={() => safeNav('lead_engine')}
              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-sky-700 hover:underline cursor-pointer"
            >
              Engine <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <button
              type="button"
              onClick={() => safeNav('leads')}
              className="text-xl font-bold text-slate-900 hover:text-sky-700 cursor-pointer"
            >
              {leads.total || 0} <span className="text-[11px] font-medium text-slate-500">Inquiries</span>
            </button>
            <span className="text-[11px] font-semibold text-slate-700">
              {formatInrCompact(leads.estimated_value)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={() => safeNav('leads')}
              className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold hover:bg-amber-100 cursor-pointer"
            >
              {leads.pending || 0} Pending
            </button>
            <button
              type="button"
              onClick={() => safeNav('leads')}
              className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100 cursor-pointer"
            >
              {leads.approved || 0} Appr ({leads.approval_rate || 0}%)
            </button>
            <button
              type="button"
              onClick={() => safeNav('leads')}
              className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
            >
              {leads.rejected || 0} Rej
            </button>
          </div>
        </article>

        {/* 2. 5-Level Manufacturing Floor */}
        <article className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-300">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => safeNav('manufacturing')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 hover:text-sky-700 cursor-pointer"
            >
              <Hammer className="h-3.5 w-3.5 text-sky-600" /> 5-Level Production
            </button>
            <button
              type="button"
              onClick={() => onSelectExplorerTab && onSelectExplorerTab('work_orders')}
              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Table <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <button
              type="button"
              onClick={() => safeNav('manufacturing')}
              className="text-xl font-bold text-slate-900 hover:text-sky-700 cursor-pointer"
            >
              {manufacturing.total_work_orders || 0}{' '}
              <span className="text-[11px] font-medium text-slate-500">WOs</span>
            </button>
            <span className="text-[11px] text-slate-600">
              <strong className="text-slate-900">{manufacturing.total_completed_units || 0}</strong> /{' '}
              {manufacturing.total_target_units || 0} units
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={() => safeNav('manufacturing')}
              className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-semibold hover:bg-sky-100 cursor-pointer"
            >
              {manufacturing.in_progress || 0} Running
            </button>
            <button
              type="button"
              onClick={() => safeNav('manufacturing')}
              className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100 cursor-pointer"
            >
              {manufacturing.completed || 0} Completed
            </button>
            {(manufacturing.pending_materials || 0) > 0 && (
              <button
                type="button"
                onClick={() => safeNav('mrp')}
                className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold hover:bg-amber-100 cursor-pointer"
              >
                {manufacturing.pending_materials} Hold
              </button>
            )}
          </div>
        </article>

        {/* 3. Quality Control Gates */}
        <article className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-300">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => safeNav('qc')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 hover:text-emerald-700 cursor-pointer"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Quality Control Gates
            </button>
            <button
              type="button"
              onClick={() => safeNav('qc')}
              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 hover:underline cursor-pointer"
            >
              Inspect <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <button
              type="button"
              onClick={() => safeNav('qc')}
              className="text-xl font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
            >
              {qc.pass_rate ?? 100}%{' '}
              <span className="text-[11px] font-medium text-slate-500">Gate Pass</span>
            </button>
            <span className="text-[11px] font-semibold text-slate-700">
              Yield: {qc.unit_yield_rate ?? 100}%
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={() => safeNav('qc')}
              className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
            >
              {qc.total_inspections || 0} Checks
            </button>
            <button
              type="button"
              onClick={() => safeNav('qc')}
              className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100 cursor-pointer"
            >
              {qc.passed_units || 0} / {totalUnitFlow} Units OK
            </button>
            <button
              type="button"
              onClick={() => safeNav('qc')}
              className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold hover:bg-rose-100 cursor-pointer"
            >
              {qc.rejected_units || 0} Rej
            </button>
          </div>
        </article>

        {/* 4. MRP & Material Requisitions */}
        <article className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-300">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => safeNav('mrp')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 hover:text-sky-700 cursor-pointer"
            >
              <ClipboardList className="h-3.5 w-3.5 text-amber-600" /> MRP &amp; Requisitions
            </button>
            <button
              type="button"
              onClick={() => onSelectExplorerTab && onSelectExplorerTab('requisitions')}
              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Queue <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <button
              type="button"
              onClick={() => safeNav('mrp')}
              className={`text-xl font-bold cursor-pointer ${
                inventory.pending_requisitions > 0 ? 'text-amber-600 hover:text-amber-700' : 'text-slate-900'
              }`}
            >
              {inventory.pending_requisitions || 0}{' '}
              <span className="text-[11px] font-medium text-slate-500">Pending Buy</span>
            </button>
            <span className="text-[11px] font-semibold text-slate-700">
              Need {formatInrCompact(reqStats.pending_cost)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={() => safeNav('mrp')}
              className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100 cursor-pointer"
            >
              {reqStats.fulfilled || 0} Fulfilled
            </button>
            <button
              type="button"
              onClick={() => safeNav('mrp')}
              className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
            >
              Total Spend: {formatInrCompact(reqStats.total_cost)}
            </button>
          </div>
        </article>

        {/* 5. Warehouse & BOM Valuation (Live Snapshot) */}
        <article className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-300">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => safeNav('inventory_raw_materials')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 hover:text-sky-700 cursor-pointer"
            >
              <Boxes className={`h-3.5 w-3.5 ${inventory.low_stock_alerts > 0 ? 'text-rose-600' : 'text-emerald-600'}`} />{' '}
              Warehouse Valuation
            </button>
            <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
              Live
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <button
              type="button"
              onClick={() => safeNav('inventory_raw_materials')}
              className="text-xl font-bold text-slate-900 hover:text-sky-700 cursor-pointer"
            >
              {formatInrCompact(
                Number(inventory.total_stock_value || 0) + Number(inventory.finished_goods_stock_value || 0)
              )}
            </button>
            <button
              type="button"
              onClick={() => onSelectExplorerTab && onSelectExplorerTab('alerts')}
              className={`text-[11px] font-semibold cursor-pointer ${
                inventory.low_stock_alerts > 0 ? 'text-rose-600 hover:underline' : 'text-emerald-600'
              }`}
            >
              {inventory.low_stock_alerts || 0} Low Stock
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={() => safeNav('inventory_raw_materials')}
              className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
            >
              Raw ({inventory.total_materials || 0}): {formatInrCompact(inventory.total_stock_value)}
            </button>
            <button
              type="button"
              onClick={() => safeNav('inventory_products')}
              className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 cursor-pointer"
            >
              FG ({inventory.total_products || 0}): {formatInrCompact(inventory.finished_goods_stock_value)}
            </button>
          </div>
        </article>

        {/* 6. Logistics & Dispatches */}
        <article className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-300">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => safeNav('dispatch')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 hover:text-sky-700 cursor-pointer"
            >
              <Truck className="h-3.5 w-3.5 text-sky-600" /> Logistics &amp; Dispatches
            </button>
            <button
              type="button"
              onClick={() => onSelectExplorerTab && onSelectExplorerTab('dispatches')}
              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Track <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <button
              type="button"
              onClick={() => safeNav('dispatch')}
              className="text-xl font-bold text-slate-900 hover:text-sky-700 cursor-pointer"
            >
              {logistics.total_dispatches || 0}{' '}
              <span className="text-[11px] font-medium text-slate-500">Shipments</span>
            </button>
            <span className="text-[11px] font-semibold text-emerald-700">
              {logistics.total_dispatches > 0
                ? `${Math.round(((logistics.delivered || 0) / logistics.total_dispatches) * 100)}% Delivered`
                : '0% Delivered'}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={() => safeNav('dispatch')}
              className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 font-semibold hover:bg-sky-100 cursor-pointer"
            >
              {logistics.in_transit || 0} In Transit
            </button>
            <button
              type="button"
              onClick={() => safeNav('dispatch')}
              className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100 cursor-pointer"
            >
              {logistics.delivered || 0} Delivered
            </button>
            {(logistics.returned || 0) > 0 && (
              <button
                type="button"
                onClick={() => safeNav('dispatch')}
                className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold hover:bg-rose-100 cursor-pointer"
              >
                {logistics.returned} Returned
              </button>
            )}
          </div>
        </article>

        {/* 7. Client Inward QC (Stage 11) */}
        <article className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-300">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => safeNav('customer_portal')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 hover:text-sky-700 cursor-pointer"
            >
              <PackageCheck className="h-3.5 w-3.5 text-teal-600" /> Client Inward QC
            </button>
            <button
              type="button"
              onClick={() => safeNav('customer_portal')}
              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-sky-700 hover:underline cursor-pointer"
            >
              Portal <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <button
              type="button"
              onClick={() => safeNav('customer_portal')}
              className="text-xl font-bold text-slate-900 hover:text-sky-700 cursor-pointer"
            >
              {custInsp.total || 0}{' '}
              <span className="text-[11px] font-medium text-slate-500">Sign-offs</span>
            </button>
            <span className="text-[11px] font-semibold text-teal-700">
              {custInsp.accepted_perfect || 0} Perfect
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={() => safeNav('customer_portal')}
              className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100 cursor-pointer"
            >
              {custInsp.accepted_perfect || 0} Clean Accept
            </button>
            <button
              type="button"
              onClick={() => safeNav('customer_portal')}
              className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold hover:bg-amber-100 cursor-pointer"
            >
              {(Number(custInsp.accepted_with_faults || 0) + Number(custInsp.rejected_faulty || 0))} Faults
            </button>
          </div>
        </article>

        {/* 8. RMA & Service Desk */}
        <article className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-300">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => safeNav('tickets')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 hover:text-rose-700 cursor-pointer"
            >
              <Ticket className={`h-3.5 w-3.5 ${customer_service.open_complaints > 0 ? 'text-rose-600' : 'text-slate-500'}`} />{' '}
              RMA &amp; Service Desk
            </button>
            <button
              type="button"
              onClick={() => onSelectExplorerTab && onSelectExplorerTab('alerts')}
              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Tickets <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <button
              type="button"
              onClick={() => safeNav('tickets')}
              className={`text-xl font-bold cursor-pointer ${
                customer_service.open_complaints > 0 ? 'text-rose-600 hover:text-rose-700' : 'text-slate-900'
              }`}
            >
              {customer_service.open_complaints || 0}{' '}
              <span className="text-[11px] font-medium text-slate-500">Open RMA</span>
            </button>
            <span className="text-[11px] text-slate-600">
              {customer_service.total_complaints || 0} Total
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={() => safeNav('tickets')}
              className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100 cursor-pointer"
            >
              {customer_service.resolved_complaints || 0} Resolved
            </button>
            <button
              type="button"
              onClick={() => safeNav('tickets')}
              className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold hover:bg-rose-100 cursor-pointer"
            >
              {(Number(customer_service.by_severity?.critical || 0) + Number(customer_service.by_severity?.high || 0))} High/Crit
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
