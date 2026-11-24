// client/src/views/DashboardView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  TrendingUp,
  CreditCard,
  Hammer,
  AlertTriangle,
  UserCheck,
  FileSpreadsheet,
  Boxes,
  Truck,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  History,
  Calendar,
  RefreshCw,
  IndianRupee,
  Building2,
  Sparkles,
  Ticket
} from 'lucide-react';
import { canAccessTab, hasPermission } from '../utils/rbac';

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

export default function DashboardView({ currentUser, summary: initialSummary, onNavigate, onViewWorkOrder }) {
  const [summary, setSummary] = useState(initialSummary);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activePreset, setActivePreset] = useState('all');
  const [loadingRange, setLoadingRange] = useState(false);
  const [activeTableTab, setActiveTableTab] = useState('orders'); // 'orders' | 'work_orders' | 'payments' | 'alerts'

  useEffect(() => {
    if (initialSummary && activePreset === 'all' && !fromDate && !toDate) {
      setSummary(initialSummary);
    }
  }, [initialSummary]);

  const fetchRange = async (nextFrom, nextTo, presetKey = 'custom') => {
    setActivePreset(presetKey);
    setFromDate(nextFrom);
    setToDate(nextTo);
    setLoadingRange(true);
    try {
      const res = await api.getDashboard({ from_date: nextFrom, to_date: nextTo });
      setSummary(res.data || null);
    } catch (err) {
      alert('Failed to load dashboard range: ' + err.message);
    } finally {
      setLoadingRange(false);
    }
  };

  const applyPreset = (preset) => {
    const today = new Date();
    if (preset === 'all') {
      fetchRange('', '', 'all');
    } else if (preset === 'today') {
      const t = formatDate(today);
      fetchRange(t, t, 'today');
    } else if (preset === '7d') {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      fetchRange(formatDate(d), formatDate(today), '7d');
    } else if (preset === '30d') {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      fetchRange(formatDate(d), formatDate(today), '30d');
    } else if (preset === 'month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      fetchRange(formatDate(first), formatDate(today), 'month');
    }
  };

  if (!summary) {
    return (
      <div className="flex items-center justify-center p-8 text-xs text-slate-500">
        <Clock className="h-4 w-4 animate-spin mr-1.5" /> Loading executive dashboard...
      </div>
    );
  }

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
    analytics = {},
    tables = {}
  } = summary;

  const levelDist = manufacturing.level_distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const maxLevelCount = Math.max(1, ...Object.values(levelDist).map(Number));

  const leadsBySource = analytics.leads_by_source || [];
  const maxSourceCount = Math.max(1, ...leadsBySource.map((s) => Number(s.count || 0)));
  const topCustomers = analytics.top_customers || [];

  const recentOrders = tables.recent_orders || [];
  const activeWorkOrders = tables.active_work_orders || [];
  const recentPayments = tables.recent_payments || [];
  const recentTickets = tables.recent_tickets || [];
  const recentLeads = tables.recent_leads || [];
  const recentQuotations = tables.recent_quotations || [];
  const recentDispatches = tables.recent_dispatches || [];
  const lowStockItems = inventory.low_stock_items || [];

  return (
    <div className="space-y-4">
      {/* Executive Header + Date Range Selector */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold text-slate-900 tracking-tight">
                Executive Owner Dashboard
              </h1>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                {currentUser?.role_name || 'Administrator'}
              </span>
              {loadingRange && (
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                  <RefreshCw className="h-3 w-3 animate-spin" /> Updating...
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Complete real-time business overview: revenue, cash flow, sales pipeline, 5-level production, quality, inventory &amp; RMA.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasPermission(currentUser, 'leads', 'create') && canAccessTab(currentUser, 'lead_engine') && (
              <button
                type="button"
                onClick={() => onNavigate('lead_engine')}
                className="h-8 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-md font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-sky-600" /> Lead Engine
              </button>
            )}
            {hasPermission(currentUser, 'leads', 'create') && (
              <button
                type="button"
                onClick={() => onNavigate('leads')}
                className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                + New Lead <ArrowUpRight className="h-3 w-3" />
              </button>
            )}
            {canAccessTab(currentUser, 'audit_reports') && (
              <button
                type="button"
                onClick={() => onNavigate('audit_reports')}
                className="h-8 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-md font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <History className="h-3 w-3" /> Audit Logs
              </button>
            )}
          </div>
        </div>

        {/* Date Range Filter Bar */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 mr-1">
              <Calendar className="h-3.5 w-3.5 text-slate-500" /> Date Range:
            </span>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: '7d', label: 'Last 7 Days' },
              { id: '30d', label: 'Last 30 Days' },
              { id: 'month', label: 'This Month' }
            ].map((p) => (
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

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-[11px] text-slate-500">
              From
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-7 px-2 border border-slate-200 rounded-md text-xs text-slate-800 bg-white"
              />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-slate-500">
              To
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-7 px-2 border border-slate-200 rounded-md text-xs text-slate-800 bg-white"
              />
            </label>
            <button
              type="button"
              onClick={() => fetchRange(fromDate, toDate, 'custom')}
              className="h-7 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-md text-[11px] font-medium cursor-pointer"
            >
              Apply
            </button>
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => applyPreset('all')}
                className="h-7 px-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-md text-[11px] font-medium cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ROW 1: EXECUTIVE FINANCIAL HERO CARDS (All Clickable) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => canAccessTab(currentUser, 'purchase_orders') && onNavigate('purchase_orders')}
          className="text-left bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 rounded-lg shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-300">Total Order Book</span>
            <IndianRupee className="h-4 w-4 text-sky-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <p className="text-2xl font-bold mt-1.5">
            ₹{Number(finance.total_order_value || 0).toLocaleString()}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-300">
            <span>{purchase_orders.total || 0} Customer POs</span>
            <span className="text-sky-300 font-medium">{purchase_orders.completed || 0} Completed →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => canAccessTab(currentUser, 'payments') && onNavigate('payments')}
          className="text-left bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs hover:border-emerald-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">Cash Collected</span>
            <CreditCard className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-1.5">
            ₹{Number(finance.total_received || 0).toLocaleString()}
          </p>
          <div className="mt-2 space-y-1">
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${Math.min(100, Number(finance.collection_percentage || 0))}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Adv: ₹{Number(finance.advance_received || 0).toLocaleString()}</span>
              <span className="font-semibold text-emerald-700">{finance.collection_percentage || 0}% collected →</span>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => canAccessTab(currentUser, 'payments') && onNavigate('payments')}
          className="text-left bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs hover:border-amber-300 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">Receivables / Balance Due</span>
            <TrendingUp className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-1.5">
            ₹{Number(finance.balance_due || 0).toLocaleString()}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>Pending collections</span>
            <span className="text-amber-700 font-medium">View Ledger →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => canAccessTab(currentUser, 'quotations') && onNavigate('quotations')}
          className="text-left bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs hover:border-sky-300 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">Quotation Pipeline</span>
            <FileSpreadsheet className="h-4 w-4 text-sky-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1.5">
            ₹{Number(quotations.total_value || 0).toLocaleString()}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>{quotations.total || 0} Quotes ({quotations.approved || 0} Approved)</span>
            <span className="text-sky-700 font-semibold">{quotations.conversion_rate || 0}% Win →</span>
          </div>
        </button>
      </div>

      {/* ROW 2: OPERATIONAL & RISK CARDS (All Clickable) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {canAccessTab(currentUser, 'leads') && (
          <button
            type="button"
            onClick={() => onNavigate('leads')}
            className="text-left bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-400 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">Leads</span>
              <UserCheck className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <p className="text-lg font-bold text-slate-900 mt-1">{leads.total || 0}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              <span className="text-amber-600 font-semibold">{leads.pending || 0} Pending</span> • {leads.approved || 0} Appr.
            </p>
          </button>
        )}

        {canAccessTab(currentUser, 'manufacturing') && (
          <button
            type="button"
            onClick={() => onNavigate('manufacturing')}
            className="text-left bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-400 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">Work Orders</span>
              <Hammer className="h-3.5 w-3.5 text-sky-600" />
            </div>
            <p className="text-lg font-bold text-slate-900 mt-1">{manufacturing.total_work_orders || 0}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              <span className="text-sky-600 font-semibold">{manufacturing.in_progress || 0} Active</span> • {manufacturing.completed || 0} Done
            </p>
          </button>
        )}

        {canAccessTab(currentUser, 'qc') && (
          <button
            type="button"
            onClick={() => onNavigate('qc')}
            className="text-left bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-400 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">QC Pass Rate</span>
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <p className="text-lg font-bold text-emerald-600 mt-1">{qc.pass_rate ?? 100}%</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {qc.total_inspections || 0} Gates • {manufacturing.total_units_rejected || 0} Rejected
            </p>
          </button>
        )}

        {canAccessTab(currentUser, 'inventory_raw_materials') && (
          <button
            type="button"
            onClick={() => onNavigate('inventory_raw_materials')}
            className="text-left bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-400 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">Inventory &amp; Alerts</span>
              <Boxes className={`h-3.5 w-3.5 ${inventory.low_stock_alerts > 0 ? 'text-rose-600' : 'text-emerald-600'}`} />
            </div>
            <p className={`text-lg font-bold mt-1 ${inventory.low_stock_alerts > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {inventory.low_stock_alerts || 0} <span className="text-xs font-medium text-slate-500">Low</span>
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 truncate">
              Stock: ₹{Number(inventory.total_stock_value || 0).toLocaleString()} • {inventory.pending_requisitions || 0} Req.
            </p>
          </button>
        )}

        {canAccessTab(currentUser, 'dispatch') && (
          <button
            type="button"
            onClick={() => onNavigate('dispatch')}
            className="text-left bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-400 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">Dispatches</span>
              <Truck className="h-3.5 w-3.5 text-slate-600" />
            </div>
            <p className="text-lg font-bold text-slate-900 mt-1">{logistics.total_dispatches || 0}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              <span className="text-sky-600 font-semibold">{logistics.in_transit || 0} Transit</span> • {logistics.delivered || 0} Deliv.
            </p>
          </button>
        )}

        {canAccessTab(currentUser, 'tickets') && (
          <button
            type="button"
            onClick={() => onNavigate('tickets')}
            className="text-left bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-400 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">RMA &amp; Tickets</span>
              <Ticket className={`h-3.5 w-3.5 ${customer_service.open_complaints > 0 ? 'text-rose-600' : 'text-slate-500'}`} />
            </div>
            <p className="text-lg font-bold text-slate-900 mt-1">{customer_service.total_complaints || 0}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              <span className={customer_service.open_complaints > 0 ? 'text-rose-600 font-semibold' : 'text-slate-500'}>
                {customer_service.open_complaints || 0} Open
              </span>{' '}
              • {customer_service.resolved_complaints || 0} Resolved
            </p>
          </button>
        )}
      </div>

      {/* ROW 3: INTERACTIVE ANALYTICS WIDGETS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Widget 1: 5-Level Manufacturing Floor Distribution */}
        <div className="bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-slate-900">5-Level Production Floor Distribution</h2>
              <p className="text-[11px] text-slate-500">Click any stage to open active Manufacturing Work Orders</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('manufacturing')}
              className="text-[11px] font-medium text-sky-700 hover:underline cursor-pointer"
            >
              Open Floor →
            </button>
          </div>

          <div className="space-y-2">
            {[
              { lvl: 1, name: 'Level 1: Core Assembly & Stator' },
              { lvl: 2, name: 'Level 2: Rotor & Winding' },
              { lvl: 3, name: 'Level 3: Encoder & Electronics' },
              { lvl: 4, name: 'Level 4: Dyno Load & Thermal Test' },
              { lvl: 5, name: 'Level 5: Final Calibration & Pack' }
            ].map((st) => {
              const count = Number(levelDist[st.lvl] || 0);
              const pct = Math.round((count / maxLevelCount) * 100);
              return (
                <button
                  key={st.lvl}
                  type="button"
                  onClick={() => onNavigate('manufacturing')}
                  className="w-full text-left group cursor-pointer"
                >
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="font-medium text-slate-700 group-hover:text-slate-900">{st.name}</span>
                    <span className="font-bold text-slate-900">{count} WO(s)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-800 group-hover:bg-sky-600 rounded-full transition-all"
                      style={{ width: `${count > 0 ? Math.max(8, pct) : 0}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Widget 2: Commercial Conversion Funnel */}
        <div className="bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-slate-900">Commercial &amp; Cash Conversion Funnel</h2>
              <p className="text-[11px] text-slate-500">Click any stage to drill into its module</p>
            </div>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <button
              type="button"
              onClick={() => onNavigate('leads')}
              className="p-3 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left cursor-pointer transition-colors"
            >
              <span className="text-[10px] font-bold uppercase text-slate-400">1. Leads</span>
              <p className="text-base font-bold text-slate-900 mt-0.5">{leads.total || 0} Inquiries</p>
              <p className="text-[11px] text-slate-500">Est. ₹{Number(leads.estimated_value || 0).toLocaleString()}</p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('quotations')}
              className="p-3 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left cursor-pointer transition-colors"
            >
              <span className="text-[10px] font-bold uppercase text-slate-400">2. Quotations</span>
              <p className="text-base font-bold text-slate-900 mt-0.5">{quotations.total || 0} Proposals</p>
              <p className="text-[11px] text-sky-700 font-medium">{quotations.conversion_rate || 0}% Approved</p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('purchase_orders')}
              className="p-3 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left cursor-pointer transition-colors"
            >
              <span className="text-[10px] font-bold uppercase text-slate-400">3. Sales POs</span>
              <p className="text-base font-bold text-slate-900 mt-0.5">{purchase_orders.total || 0} Orders</p>
              <p className="text-[11px] text-slate-500">₹{Number(purchase_orders.total_value || 0).toLocaleString()}</p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="p-3 rounded-md bg-emerald-50/70 hover:bg-emerald-50 border border-emerald-200 text-left cursor-pointer transition-colors"
            >
              <span className="text-[10px] font-bold uppercase text-emerald-700">4. Realized Cash</span>
              <p className="text-base font-bold text-emerald-700 mt-0.5">
                ₹{Number(finance.total_received || 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-emerald-700 font-medium">{finance.collection_percentage || 0}% Collected</p>
            </button>
          </div>
        </div>
      </div>

      {/* ROW 3B: LEAD SOURCES & TOP CUSTOMERS (All Clickable) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Widget 3: Lead Source Mix */}
        <div className="bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-slate-900">Lead Sources &amp; Inquiry Mix</h2>
              <p className="text-[11px] text-slate-500">Where inquiries originate (click to open Leads / Engine)</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('lead_engine')}
              className="text-[11px] font-medium text-sky-700 hover:underline cursor-pointer"
            >
              Lead Engine →
            </button>
          </div>

          {leadsBySource.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No leads recorded in this date range.</p>
          ) : (
            <div className="space-y-2">
              {leadsBySource.map((src) => {
                const cnt = Number(src.count || 0);
                const pct = Math.round((cnt / maxSourceCount) * 100);
                return (
                  <button
                    key={src.source}
                    type="button"
                    onClick={() => onNavigate('leads')}
                    className="w-full text-left group cursor-pointer"
                  >
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="font-medium text-slate-700 group-hover:text-slate-900">{src.source}</span>
                      <span className="text-slate-600">
                        <strong className="text-slate-900">{cnt}</strong> lead(s) • ₹{Number(src.est_value || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-600 group-hover:bg-sky-500 rounded-full transition-all"
                        style={{ width: `${cnt > 0 ? Math.max(8, pct) : 0}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Widget 4: Top Customers by Order Value */}
        <div className="bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-slate-900">Top Customers by Order Book</h2>
              <p className="text-[11px] text-slate-500">Click any account to review Sales POs &amp; collections</p>
            </div>
            <Building2 className="h-4 w-4 text-slate-500" />
          </div>

          {topCustomers.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No customer orders in this date range.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {topCustomers.map((cust) => {
                const total = Number(cust.total_value || 0);
                const paid = Number(cust.paid_amount || 0);
                const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
                return (
                  <button
                    key={cust.id}
                    type="button"
                    onClick={() => onNavigate('purchase_orders')}
                    className="w-full py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-50 px-1.5 rounded transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{cust.company_name}</p>
                      <p className="text-[10px] text-slate-500">{cust.order_count} PO(s) • {pct}% collected</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-slate-900">₹{total.toLocaleString()}</p>
                      <p className="text-[10px] text-emerald-600 font-medium">Paid: ₹{paid.toLocaleString()}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ROW 4: INTERACTIVE OWNER DATA TABLES */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-3 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {[
              { id: 'orders', label: `Recent POs (${recentOrders.length})` },
              { id: 'work_orders', label: `Work Orders (${activeWorkOrders.length})` },
              { id: 'leads', label: `Leads (${recentLeads.length})` },
              { id: 'quotations', label: `Quotations (${recentQuotations.length})` },
              { id: 'payments', label: `Payments (${recentPayments.length})` },
              { id: 'dispatches', label: `Dispatches (${recentDispatches.length})` },
              { id: 'alerts', label: `Alerts (${lowStockItems.length}) & RMA (${recentTickets.length})` }
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTableTab(t.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  activeTableTab === t.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">Click any row to open its full module</span>
        </div>

        <div className="overflow-x-auto">
          {activeTableTab === 'orders' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 w-10 text-center">#</th>
                  <th className="px-3.5 py-2">PO #</th>
                  <th className="px-3.5 py-2">Customer</th>
                  <th className="px-3.5 py-2">PO Date</th>
                  <th className="px-3.5 py-2 text-right">Order Value</th>
                  <th className="px-3.5 py-2 text-right">Paid</th>
                  <th className="px-3.5 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOrders.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-slate-400">No purchase orders in range.</td></tr>
                ) : (
                  recentOrders.map((po, idx) => (
                    <tr
                      key={po.id}
                      onClick={() => onNavigate('purchase_orders')}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
                      <td className="px-3.5 py-2 font-mono font-semibold text-slate-900">{po.po_number}</td>
                      <td className="px-3.5 py-2 font-medium text-slate-800">{po.customer_name}</td>
                      <td className="px-3.5 py-2 text-slate-500">{po.po_date}</td>
                      <td className="px-3.5 py-2 text-right font-bold text-slate-900">₹{Number(po.total_amount).toLocaleString()}</td>
                      <td className="px-3.5 py-2 text-right font-semibold text-emerald-600">₹{Number(po.paid_amount).toLocaleString()}</td>
                      <td className="px-3.5 py-2 uppercase text-[10px] font-semibold text-slate-700">{po.status?.replace('_', ' ')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTableTab === 'work_orders' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 w-10 text-center">#</th>
                  <th className="px-3.5 py-2">WO #</th>
                  <th className="px-3.5 py-2">Product</th>
                  <th className="px-3.5 py-2">PO #</th>
                  <th className="px-3.5 py-2 text-center">Stage</th>
                  <th className="px-3.5 py-2 text-center">Target / Rej</th>
                  <th className="px-3.5 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeWorkOrders.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-slate-400">No work orders in range.</td></tr>
                ) : (
                  activeWorkOrders.map((wo, idx) => (
                    <tr
                      key={wo.id}
                      onClick={() => (onViewWorkOrder ? onViewWorkOrder(wo.id) : onNavigate('manufacturing'))}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
                      <td className="px-3.5 py-2 font-mono font-semibold text-slate-900">{wo.work_order_number}</td>
                      <td className="px-3.5 py-2 font-medium text-slate-800">{wo.product_name}</td>
                      <td className="px-3.5 py-2 font-mono text-slate-500">{wo.po_number}</td>
                      <td className="px-3.5 py-2 text-center font-bold text-sky-700">L{wo.current_level} / 5</td>
                      <td className="px-3.5 py-2 text-center">{wo.target_quantity} / <span className="text-rose-600">{wo.rejected_quantity}</span></td>
                      <td className="px-3.5 py-2 uppercase text-[10px] font-semibold text-slate-700">{wo.status?.replace('_', ' ')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTableTab === 'leads' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 w-10 text-center">#</th>
                  <th className="px-3.5 py-2">Lead # &amp; Title</th>
                  <th className="px-3.5 py-2">Customer</th>
                  <th className="px-3.5 py-2">Source</th>
                  <th className="px-3.5 py-2">Priority</th>
                  <th className="px-3.5 py-2 text-right">Est. Value</th>
                  <th className="px-3.5 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentLeads.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-slate-400">No leads in range.</td></tr>
                ) : (
                  recentLeads.map((l, idx) => (
                    <tr
                      key={l.id}
                      onClick={() => onNavigate('leads')}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
                      <td className="px-3.5 py-2">
                        <span className="font-mono font-semibold text-slate-900">{l.lead_number}</span>
                        <p className="text-[11px] text-slate-600 truncate max-w-[220px]">{l.title}</p>
                      </td>
                      <td className="px-3.5 py-2 font-medium text-slate-800">{l.customer_name || '—'}</td>
                      <td className="px-3.5 py-2 text-slate-600">{l.source}</td>
                      <td className="px-3.5 py-2 uppercase text-[10px] font-semibold text-slate-700">{l.priority || 'medium'}</td>
                      <td className="px-3.5 py-2 text-right font-bold text-slate-900">₹{Number(l.estimated_value || 0).toLocaleString()}</td>
                      <td className="px-3.5 py-2 uppercase text-[10px] font-semibold text-slate-700">{l.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTableTab === 'quotations' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 w-10 text-center">#</th>
                  <th className="px-3.5 py-2">Quote #</th>
                  <th className="px-3.5 py-2">Customer</th>
                  <th className="px-3.5 py-2">Date</th>
                  <th className="px-3.5 py-2 text-right">Total Amount</th>
                  <th className="px-3.5 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentQuotations.length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-slate-400">No quotations in range.</td></tr>
                ) : (
                  recentQuotations.map((q, idx) => (
                    <tr
                      key={q.id}
                      onClick={() => onNavigate('quotations')}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
                      <td className="px-3.5 py-2 font-mono font-semibold text-slate-900">{q.quotation_number}</td>
                      <td className="px-3.5 py-2 font-medium text-slate-800">{q.customer_name}</td>
                      <td className="px-3.5 py-2 text-slate-500">{q.quotation_date}</td>
                      <td className="px-3.5 py-2 text-right font-bold text-slate-900">₹{Number(q.total_amount || 0).toLocaleString()}</td>
                      <td className="px-3.5 py-2 uppercase text-[10px] font-semibold text-slate-700">{q.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTableTab === 'dispatches' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 w-10 text-center">#</th>
                  <th className="px-3.5 py-2">Dispatch # &amp; Challan</th>
                  <th className="px-3.5 py-2">Customer</th>
                  <th className="px-3.5 py-2">Courier &amp; Tracking / LR</th>
                  <th className="px-3.5 py-2">Date</th>
                  <th className="px-3.5 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentDispatches.length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-slate-400">No dispatches in range.</td></tr>
                ) : (
                  recentDispatches.map((d, idx) => (
                    <tr
                      key={d.id}
                      onClick={() => onNavigate('dispatch')}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
                      <td className="px-3.5 py-2">
                        <span className="font-mono font-semibold text-slate-900">{d.dispatch_number}</span>
                        <p className="text-[10px] text-slate-500">Challan: {d.delivery_challan_no}</p>
                      </td>
                      <td className="px-3.5 py-2 font-medium text-slate-800">{d.customer_name}</td>
                      <td className="px-3.5 py-2">
                        <span className="font-medium text-slate-800">{d.courier_name}</span>
                        <p className="text-[10px] font-mono text-slate-500">
                          {d.tracking_number}{d.lr_number ? ` • LR: ${d.lr_number}` : ''}
                        </p>
                      </td>
                      <td className="px-3.5 py-2 text-slate-500">{d.dispatch_date}</td>
                      <td className="px-3.5 py-2 uppercase text-[10px] font-semibold text-slate-700">{d.status?.replace('_', ' ')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTableTab === 'payments' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 w-10 text-center">#</th>
                  <th className="px-3.5 py-2">Receipt #</th>
                  <th className="px-3.5 py-2">Customer</th>
                  <th className="px-3.5 py-2">PO #</th>
                  <th className="px-3.5 py-2">Date</th>
                  <th className="px-3.5 py-2">Type</th>
                  <th className="px-3.5 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentPayments.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-slate-400">No payments in range.</td></tr>
                ) : (
                  recentPayments.map((p, idx) => (
                    <tr
                      key={p.id}
                      onClick={() => onNavigate('payments')}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
                      <td className="px-3.5 py-2 font-mono font-semibold text-slate-900">{p.payment_number}</td>
                      <td className="px-3.5 py-2 font-medium text-slate-800">{p.customer_name}</td>
                      <td className="px-3.5 py-2 font-mono text-slate-500">{p.po_number}</td>
                      <td className="px-3.5 py-2 text-slate-500">{p.payment_date}</td>
                      <td className="px-3.5 py-2 capitalize text-slate-700">{p.payment_type}</td>
                      <td className="px-3.5 py-2 text-right font-bold text-emerald-600">₹{Number(p.amount).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTableTab === 'alerts' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
              <div>
                <div className="px-3.5 py-2 bg-rose-50/50 text-[11px] font-semibold text-rose-800 border-b border-slate-200">
                  Low Stock Raw Materials ({lowStockItems.length})
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 w-10 text-center">#</th>
                      <th className="px-3 py-2">Material</th>
                      <th className="px-3 py-2 text-center">Stock / Reorder</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lowStockItems.length === 0 ? (
                      <tr><td colSpan={3} className="p-4 text-center text-slate-400">All materials healthy.</td></tr>
                    ) : (
                      lowStockItems.map((m, idx) => (
                        <tr
                          key={m.id}
                          onClick={() => onNavigate('inventory_raw_materials')}
                          className="hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">{m.name} <span className="text-[10px] font-mono text-slate-400">({m.sku})</span></td>
                          <td className="px-3 py-2 text-center font-bold text-rose-600">{m.current_stock} / {m.reorder_level} {m.uom}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <div className="px-3.5 py-2 bg-amber-50/50 text-[11px] font-semibold text-amber-900 border-b border-slate-200">
                  Recent RMA &amp; Complaint Tickets ({recentTickets.length})
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 w-10 text-center">#</th>
                      <th className="px-3 py-2">Ticket # &amp; Title</th>
                      <th className="px-3 py-2">Assigned</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentTickets.length === 0 ? (
                      <tr><td colSpan={4} className="p-4 text-center text-slate-400">No RMA tickets in range.</td></tr>
                    ) : (
                      recentTickets.map((t, idx) => (
                        <tr
                          key={t.id}
                          onClick={() => onNavigate('tickets')}
                          className="hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <span className="font-mono font-semibold text-rose-700">{t.ticket_number}</span>
                            <p className="text-[11px] text-slate-700 truncate max-w-[180px]">{t.title}</p>
                          </td>
                          <td className="px-3 py-2 text-[11px] text-slate-600">{t.assigned_to_name || 'Unassigned'}</td>
                          <td className="px-3 py-2 uppercase text-[10px] font-semibold text-slate-700">{t.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
