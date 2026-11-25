// client/src/views/DashboardView.jsx
import React, { useRef, useState } from 'react';
import { api } from '../services/api';
import {
  computePresetDates,
  formatReadableDate,
  formatInrFull
} from '../utils/dateRange';
import { exportToCsv } from '../utils/exportCsv';
import { canAccessTab, hasPermission } from '../utils/rbac';
import ExecutiveHeroCards from '../components/dashboard/ExecutiveHeroCards';
import ExecutiveChartsGrid from '../components/dashboard/ExecutiveChartsGrid';
import ExecutiveActionCenter from '../components/dashboard/ExecutiveActionCenter';
import {
  ArrowUpRight,
  Calendar,
  Clock,
  Download,
  History,
  LayoutDashboard,
  RefreshCw,
  Sparkles
} from 'lucide-react';

const DATE_PRESETS = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 Days' },
  { id: '30d', label: 'Last 30 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'quarter', label: 'This Quarter' },
  { id: 'year', label: 'This Year' }
];

const DOMAIN_FILTERS = [
  { id: 'all', label: 'Full Cockpit' },
  { id: 'finance', label: 'Finance & Sales' },
  { id: 'production', label: 'Shop Floor & QC' },
  { id: 'inventory', label: 'Inventory & Logistics' }
];

export default function DashboardView({
  currentUser,
  summary: initialSummary,
  onNavigate,
  onViewWorkOrder
}) {
  const [rangeSummary, setRangeSummary] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activePreset, setActivePreset] = useState('all');
  const [loadingRange, setLoadingRange] = useState(false);
  const [activeDomain, setActiveDomain] = useState('all');
  const [activeTableTab, setActiveTableTab] = useState('orders');
  const explorerRef = useRef(null);

  const isDefaultAllTime = activePreset === 'all' && !fromDate && !toDate;
  const summary = isDefaultAllTime ? (rangeSummary || initialSummary) : rangeSummary;

  const fetchRange = async (nextFrom, nextTo, presetKey = 'custom') => {
    setActivePreset(presetKey);
    setFromDate(nextFrom);
    setToDate(nextTo);
    setLoadingRange(true);
    try {
      const res = await api.getDashboard({ from_date: nextFrom, to_date: nextTo });
      setRangeSummary(res.data || null);
    } catch (err) {
      alert('Failed to load dashboard range: ' + err.message);
    } finally {
      setLoadingRange(false);
    }
  };

  const applyPreset = (presetId) => {
    const { from, to } = computePresetDates(presetId);
    fetchRange(from, to, presetId);
  };

  const handleJumpToExplorer = (tabId) => {
    setActiveTableTab(tabId);
    explorerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleExportSnapshot = () => {
    if (!summary) return;
    const {
      leads = {},
      quotations = {},
      purchase_orders = {},
      finance = {},
      manufacturing = {},
      qc = {},
      inventory = {},
      logistics = {},
      customer_service = {}
    } = summary;

    const kpiRows = [
      { category: 'Commercial', metric: 'Total Order Book', value: formatInrFull(finance.total_order_value), detail: `${purchase_orders.total || 0} POs` },
      { category: 'Finance', metric: 'Cash Collected', value: formatInrFull(finance.total_received), detail: `${finance.collection_percentage || 0}% realized (${finance.payment_count || 0} receipts)` },
      { category: 'Finance', metric: 'Period Receivables / Balance Due', value: formatInrFull(finance.balance_due), detail: `Live Total Due: ${formatInrFull(finance.all_time_receivable)}` },
      { category: 'Commercial', metric: 'Quotation Pipeline Value', value: formatInrFull(quotations.total_value), detail: `${quotations.total || 0} quotes (${quotations.conversion_rate || 0}% win)` },
      { category: 'Commercial', metric: 'Leads & Estimated Value', value: formatInrFull(leads.estimated_value), detail: `${leads.total || 0} leads (${leads.approved || 0} approved, ${leads.pending || 0} pending)` },
      { category: 'Production', metric: 'Work Orders', value: `${manufacturing.total_work_orders || 0}`, detail: `${manufacturing.in_progress || 0} active, ${manufacturing.completed || 0} completed` },
      { category: 'Quality Control', metric: 'QC Gate Pass Rate', value: `${qc.pass_rate ?? 100}%`, detail: `Unit Yield: ${qc.unit_yield_rate ?? 100}% (${qc.passed_units || 0} passed / ${qc.rejected_units || 0} rejected)` },
      { category: 'Inventory', metric: 'Live Raw Material Valuation', value: formatInrFull(inventory.total_stock_value), detail: `${inventory.total_materials || 0} SKUs, ${inventory.low_stock_alerts || 0} low stock alerts` },
      { category: 'MRP', metric: 'Pending Purchase Requisitions', value: `${inventory.pending_requisitions || 0}`, detail: `Pending Cost: ${formatInrFull(inventory.requisitions?.pending_cost)}` },
      { category: 'Logistics', metric: 'Dispatches', value: `${logistics.total_dispatches || 0}`, detail: `${logistics.delivered || 0} delivered, ${logistics.in_transit || 0} in transit` },
      { category: 'Customer Service', metric: 'RMA & Complaint Tickets', value: `${customer_service.total_complaints || 0}`, detail: `${customer_service.open_complaints || 0} open, ${customer_service.resolved_complaints || 0} resolved` }
    ];

    exportToCsv(
      'executive_owner_snapshot',
      [
        { header: 'Department', accessor: 'category' },
        { header: 'KPI Metric', accessor: 'metric' },
        { header: 'Value', accessor: 'value' },
        { header: 'Breakdown Detail', accessor: 'detail' }
      ],
      kpiRows
    );
  };

  if (!summary) {
    return (
      <div className="flex items-center justify-center p-12 text-xs text-slate-500">
        <Clock className="h-4 w-4 animate-spin mr-2" /> Loading Executive Owner Dashboard...
      </div>
    );
  }

  const activeRangeText =
    fromDate || toDate
      ? `${fromDate ? formatReadableDate(fromDate) : 'Start'} → ${toDate ? formatReadableDate(toDate) : 'Today'}`
      : 'All Time Historical';

  return (
    <div className="space-y-4">
      {/* EXECUTIVE HEADER, DOMAIN TABS & DATE RANGE SELECTOR */}
      <header className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-slate-900 text-white">
                <LayoutDashboard className="h-4 w-4" />
              </span>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Executive Owner Command Center
              </h1>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                {currentUser?.role_name || 'Administrator'}
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                {activeRangeText}
              </span>
              {loadingRange && (
                <span className="inline-flex items-center gap-1 text-[11px] text-sky-600 font-medium">
                  <RefreshCw className="h-3 w-3 animate-spin" /> Syncing metrics...
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              360° real-time business intelligence across revenue, cash realization, sales pipeline, 5-level production, quality, warehouse valuation, logistics &amp; RMA.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => fetchRange(fromDate, toDate, activePreset)}
              disabled={loadingRange}
              className="h-8 px-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-md font-medium text-xs shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingRange ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              type="button"
              onClick={handleExportSnapshot}
              className="h-8 px-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-md font-medium text-xs shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" /> Snapshot CSV
            </button>
            {hasPermission(currentUser, 'leads', 'create') && canAccessTab(currentUser, 'lead_engine') && (
              <button
                type="button"
                onClick={() => onNavigate('lead_engine')}
                className="h-8 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-md font-medium text-xs shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-sky-600" /> Lead Engine
              </button>
            )}
            {hasPermission(currentUser, 'leads', 'create') && (
              <button
                type="button"
                onClick={() => onNavigate('leads')}
                className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-xs shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                + New Lead <ArrowUpRight className="h-3 w-3" />
              </button>
            )}
            {canAccessTab(currentUser, 'audit_reports') && (
              <button
                type="button"
                onClick={() => onNavigate('audit_reports')}
                className="h-8 px-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-md font-medium text-xs shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <History className="h-3.5 w-3.5" /> Audit
              </button>
            )}
          </div>
        </div>

        {/* Date Range Presets + Custom Picker + Domain Scope Switcher */}
        <div className="pt-3 border-t border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 mr-1">
              <Calendar className="h-3.5 w-3.5 text-slate-500" /> Period:
            </span>
            {DATE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`h-7 px-2.5 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${
                  activePreset === p.id
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between xl:justify-end gap-2">
            {/* Custom Date Range Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchRange(fromDate, toDate, 'custom');
              }}
              className="flex flex-wrap items-center gap-1.5"
            >
              <label className="flex items-center gap-1 text-[11px] text-slate-500">
                From
                <input
                  type="date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-7 px-2 border border-slate-200 rounded-md text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-slate-500">
                To
                <input
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-7 px-2 border border-slate-200 rounded-md text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
              </label>
              <button
                type="submit"
                className="h-7 px-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-md text-[11px] font-medium cursor-pointer"
              >
                Apply
              </button>
              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => applyPreset('all')}
                  className="h-7 px-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-md text-[11px] font-medium cursor-pointer"
                >
                  Reset
                </button>
              )}
            </form>

            {/* Domain Filter Pills */}
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
              {DOMAIN_FILTERS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setActiveDomain(d.id)}
                  className={`px-2 py-1 rounded font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    activeDomain === d.id
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* INTERACTIVE HERO FINANCIAL & OPERATIONAL KPI CARDS */}
      <ExecutiveHeroCards
        currentUser={currentUser}
        summary={summary}
        onNavigate={onNavigate}
        onSelectExplorerTab={handleJumpToExplorer}
      />

      {/* INTERACTIVE DUAL-LIBRARY ANALYTICS CHARTS (Apache ECharts + Recharts) */}
      <ExecutiveChartsGrid
        currentUser={currentUser}
        summary={summary}
        activeDomain={activeDomain}
        onNavigate={onNavigate}
      />

      {/* LIVE WATCHLISTS & SORTABLE DATA EXPLORER TABLES */}
      <div ref={explorerRef}>
        <ExecutiveActionCenter
          currentUser={currentUser}
          summary={summary}
          activeTableTab={activeTableTab}
          onTableTabChange={setActiveTableTab}
          onNavigate={onNavigate}
          onViewWorkOrder={onViewWorkOrder}
        />
      </div>
    </div>
  );
}
