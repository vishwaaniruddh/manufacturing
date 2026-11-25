// client/src/components/dashboard/ExecutiveActionCenter.jsx
import React, { useMemo, useRef, useState } from 'react';
import Pagination, { usePagination } from '../Pagination';
import { exportToCsv } from '../../utils/exportCsv';
import { canAccessTab } from '../../utils/rbac';
import { formatInrCompact, formatInrFull } from '../../utils/dateRange';
import {
  AlertTriangle,
  Clock,
  Boxes,
  Activity,
  Search,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink
} from 'lucide-react';

const textCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const STATUS_BADGE = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  fulfilled: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
  in_production: 'bg-sky-50 text-sky-700 border-sky-200',
  dispatched: 'bg-sky-50 text-sky-700 border-sky-200',
  in_transit: 'bg-sky-50 text-sky-700 border-sky-200',
  verified: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  pending_purchase: 'bg-amber-50 text-amber-700 border-amber-200',
  partially_fulfilled: 'bg-amber-50 text-amber-700 border-amber-200',
  received: 'bg-amber-50 text-amber-700 border-amber-200',
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  open: 'bg-rose-50 text-rose-700 border-rose-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200'
};

function StatusBadge({ status }) {
  const key = String(status || '').toLowerCase();
  const cls = STATUS_BADGE[key] || 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold uppercase whitespace-nowrap ${cls}`}>
      {key.replace(/_/g, ' ') || '—'}
    </span>
  );
}

function SortableHeader({ columnKey, label, type = 'text', align = 'left', sortConfig, onSort }) {
  const isSorted = sortConfig.key === columnKey;
  const ariaSort = isSorted ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : undefined;

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      data-type={type}
      className={`p-0 border-b border-slate-200 bg-slate-50 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey, type)}
        className={`w-full min-h-[34px] px-3 py-2 flex items-center gap-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-500 ${
          align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
        }`}
      >
        <span>{label}</span>
        {isSorted ? (
          sortConfig.direction === 'asc' ? (
            <ArrowUp className="h-3 w-3 text-sky-600 shrink-0" aria-hidden="true" />
          ) : (
            <ArrowDown className="h-3 w-3 text-sky-600 shrink-0" aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-400 shrink-0 opacity-60" aria-hidden="true" />
        )}
      </button>
    </th>
  );
}

export default function ExecutiveActionCenter({
  currentUser,
  summary,
  activeTableTab,
  onTableTabChange,
  onNavigate,
  onViewWorkOrder
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, type: 'text', direction: 'asc' });
  const [sortAnnouncement, setSortAnnouncement] = useState('');
  const tabRefs = useRef({});

  const safeNav = (tab, opts) => {
    if (canAccessTab(currentUser, tab)) {
      onNavigate(tab, opts);
    }
  };

  const tables = summary?.tables;
  const inventory = summary?.inventory;
  const deadlineWatchlist = tables?.deadline_watchlist || [];
  const recentTickets = tables?.recent_tickets || [];
  const recentAuditLogs = tables?.recent_audit_logs || [];
  const lowStockItems = inventory?.low_stock_items || [];

  const explorerTabs = useMemo(
    () => [
      { id: 'orders', label: 'Sales POs', count: tables?.recent_orders?.length || 0 },
      { id: 'deadlines', label: 'Deadlines Risk', count: tables?.deadline_watchlist?.length || 0 },
      { id: 'work_orders', label: 'Work Orders', count: tables?.active_work_orders?.length || 0 },
      { id: 'leads', label: 'Leads', count: tables?.recent_leads?.length || 0 },
      { id: 'quotations', label: 'Quotations', count: tables?.recent_quotations?.length || 0 },
      { id: 'payments', label: 'Payments', count: tables?.recent_payments?.length || 0 },
      { id: 'requisitions', label: 'MRP Reqs', count: tables?.recent_requisitions?.length || 0 },
      { id: 'dispatches', label: 'Dispatches', count: tables?.recent_dispatches?.length || 0 },
      {
        id: 'alerts',
        label: 'Stock & RMA',
        count: (inventory?.low_stock_items?.length || 0) + (tables?.recent_tickets?.length || 0)
      },
      { id: 'audit', label: 'Audit Trail', count: tables?.recent_audit_logs?.length || 0 }
    ],
    [tables, inventory]
  );

  const selectTab = (tabId) => {
    onTableTabChange(tabId);
    setSearchTerm('');
    setSortConfig({ key: null, type: 'text', direction: 'asc' });
    setCurrentPage(1);
    const btn = tabRefs.current[tabId];
    if (btn) {
      btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  const handleTabKeyDown = (e, currentIdx) => {
    let nextIdx = null;
    if (e.key === 'ArrowRight') nextIdx = (currentIdx + 1) % explorerTabs.length;
    else if (e.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + explorerTabs.length) % explorerTabs.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = explorerTabs.length - 1;

    if (nextIdx !== null) {
      e.preventDefault();
      const targetTab = explorerTabs[nextIdx];
      selectTab(targetTab.id);
      tabRefs.current[targetTab.id]?.focus();
    }
  };

  const handleSort = (key, type = 'text') => {
    setSortConfig((prev) => {
      const nextDir = prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc';
      setSortAnnouncement(`Sorted by ${key.replace(/_/g, ' ')}, ${nextDir === 'asc' ? 'ascending' : 'descending'}`);
      return { key, type, direction: nextDir };
    });
  };

  const activeRawRows = useMemo(() => {
    const t = tables || {};
    switch (activeTableTab) {
      case 'orders':
        return (t.recent_orders || []).map((r) => ({
          ...r,
          balance_due: Math.max(0, Number(r.total_amount || 0) - Number(r.paid_amount || 0)),
          excess_amount: Math.max(0, Number(r.paid_amount || 0) - Number(r.total_amount || 0))
        }));
      case 'deadlines':
        return t.deadline_watchlist || [];
      case 'work_orders':
        return t.active_work_orders || [];
      case 'leads':
        return t.recent_leads || [];
      case 'quotations':
        return t.recent_quotations || [];
      case 'payments':
        return t.recent_payments || [];
      case 'requisitions':
        return t.recent_requisitions || [];
      case 'dispatches':
        return t.recent_dispatches || [];
      case 'audit':
        return t.recent_audit_logs || [];
      default:
        return [];
    }
  }, [activeTableTab, tables]);

  const filteredAndSortedRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const filtered = q
      ? activeRawRows.filter((row) =>
          Object.values(row).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q))
        )
      : activeRawRows;

    if (!sortConfig.key) return filtered;

    const factor = sortConfig.direction === 'asc' ? 1 : -1;
    const key = sortConfig.key;
    const type = sortConfig.type;

    return [...filtered].sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      if (type === 'number') {
        return factor * ((Number(va) || 0) - (Number(vb) || 0));
      }
      return factor * textCollator.compare(String(va ?? ''), String(vb ?? ''));
    });
  }, [activeRawRows, searchTerm, sortConfig]);

  const {
    currentPage,
    setCurrentPage,
    totalPages,
    totalItems,
    pageSize,
    startIndex,
    paginatedItems
  } = usePagination(filteredAndSortedRows, 8);

  const handleExportCurrentTab = () => {
    const columnsByTab = {
      orders: [
        { header: 'PO #', accessor: 'po_number' },
        { header: 'Customer', accessor: 'customer_name' },
        { header: 'PO Date', accessor: 'po_date' },
        { header: 'Deadline', accessor: 'delivery_deadline' },
        { header: 'Order Value', accessor: 'total_amount' },
        { header: 'Paid', accessor: 'paid_amount' },
        { header: 'Balance Due', accessor: 'balance_due' },
        { header: 'Status', accessor: 'status' }
      ],
      deadlines: [
        { header: 'PO #', accessor: 'po_number' },
        { header: 'Customer', accessor: 'customer_name' },
        { header: 'Deadline', accessor: 'delivery_deadline' },
        { header: 'Days Left', accessor: 'days_left' },
        { header: 'Order Value', accessor: 'total_amount' },
        { header: 'Status', accessor: 'status' }
      ],
      work_orders: [
        { header: 'WO #', accessor: 'work_order_number' },
        { header: 'Product', accessor: 'product_name' },
        { header: 'PO #', accessor: 'po_number' },
        { header: 'Stage', accessor: (r) => `L${r.current_level}/5` },
        { header: 'Target Qty', accessor: 'target_quantity' },
        { header: 'Rejected Qty', accessor: 'rejected_quantity' },
        { header: 'Status', accessor: 'status' }
      ],
      leads: [
        { header: 'Lead #', accessor: 'lead_number' },
        { header: 'Title', accessor: 'title' },
        { header: 'Customer', accessor: 'customer_name' },
        { header: 'Source', accessor: 'source' },
        { header: 'Est Value', accessor: 'estimated_value' },
        { header: 'Status', accessor: 'status' }
      ],
      quotations: [
        { header: 'Quote #', accessor: 'quotation_number' },
        { header: 'Customer', accessor: 'customer_name' },
        { header: 'Date', accessor: 'quotation_date' },
        { header: 'Valid Until', accessor: 'valid_until' },
        { header: 'Total Amount', accessor: 'total_amount' },
        { header: 'Status', accessor: 'status' }
      ],
      payments: [
        { header: 'Receipt #', accessor: 'payment_number' },
        { header: 'Customer', accessor: 'customer_name' },
        { header: 'PO #', accessor: 'po_number' },
        { header: 'Date', accessor: 'payment_date' },
        { header: 'Type', accessor: 'payment_type' },
        { header: 'Amount', accessor: 'amount' }
      ],
      requisitions: [
        { header: 'Req #', accessor: 'requisition_number' },
        { header: 'PO #', accessor: 'po_number' },
        { header: 'Customer', accessor: 'customer_name' },
        { header: 'Requested By', accessor: 'requested_by_name' },
        { header: 'Est Cost', accessor: 'total_estimated_cost' },
        { header: 'Status', accessor: 'status' }
      ],
      dispatches: [
        { header: 'Dispatch #', accessor: 'dispatch_number' },
        { header: 'Challan #', accessor: 'delivery_challan_no' },
        { header: 'Customer', accessor: 'customer_name' },
        { header: 'Courier', accessor: 'courier_name' },
        { header: 'Tracking', accessor: 'tracking_number' },
        { header: 'Status', accessor: 'status' }
      ],
      audit: [
        { header: 'Timestamp', accessor: 'created_at' },
        { header: 'User', accessor: 'user_name' },
        { header: 'Role', accessor: 'role_name' },
        { header: 'Module', accessor: 'module' },
        { header: 'Action', accessor: 'action' },
        { header: 'Details', accessor: 'details' }
      ]
    };

    const cols = columnsByTab[activeTableTab];
    if (!cols) return;
    exportToCsv(`owner_dashboard_${activeTableTab}`, cols, filteredAndSortedRows);
  };

  return (
    <div className="space-y-4">
      {/* EXECUTIVE ATTENTION WATCHLIST STRIP (3 Cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Watchlist 1: Delivery Deadlines & Overdue Orders */}
        <article className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              <h3 className="text-xs font-semibold text-slate-900">Delivery Deadlines Watchlist</h3>
            </div>
            <button
              type="button"
              onClick={() => selectTab('deadlines')}
              className="text-[10px] font-semibold text-sky-700 hover:underline cursor-pointer"
            >
              View All ({deadlineWatchlist.length}) →
            </button>
          </div>
          <div className="divide-y divide-slate-100 flex-1">
            {deadlineWatchlist.length === 0 ? (
              <p className="p-4 text-xs text-slate-400 text-center">No pending PO deadlines.</p>
            ) : (
              deadlineWatchlist.slice(0, 4).map((po) => {
                const daysLeft = Number(po.days_left ?? 0);
                const overdue = daysLeft < 0;
                const dueSoon = !overdue && daysLeft <= 7;
                return (
                  <button
                    key={po.id}
                    type="button"
                    onClick={() => safeNav('purchase_orders')}
                    className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-slate-900">{po.po_number}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            overdue
                              ? 'bg-rose-100 text-rose-700'
                              : dueSoon
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {overdue ? `${Math.abs(daysLeft)}d Overdue` : `${daysLeft}d left`}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">{po.customer_name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-slate-900">{formatInrCompact(po.total_amount)}</p>
                      <p className="text-[10px] text-slate-500">{po.delivery_deadline}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </article>

        {/* Watchlist 2: Low Stock Materials & Urgent MRP */}
        <article className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Boxes className={`h-3.5 w-3.5 ${lowStockItems.length > 0 ? 'text-rose-600' : 'text-emerald-600'}`} />
              <h3 className="text-xs font-semibold text-slate-900">Low Stock &amp; Reorder Alerts</h3>
            </div>
            <button
              type="button"
              onClick={() => safeNav('inventory_raw_materials')}
              className="text-[10px] font-semibold text-sky-700 hover:underline cursor-pointer"
            >
              Stockroom ({lowStockItems.length}) →
            </button>
          </div>
          <div className="divide-y divide-slate-100 flex-1">
            {lowStockItems.length === 0 ? (
              <div className="p-4 text-xs text-emerald-700 text-center">All raw materials are above reorder levels.</div>
            ) : (
              lowStockItems.slice(0, 4).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => safeNav('inventory_raw_materials')}
                  className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-left hover:bg-rose-50/40 transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{m.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {m.sku} • {m.location}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-rose-600">
                      {Number(m.current_stock)} / {Number(m.reorder_level)} {m.uom}
                    </p>
                    <p className="text-[10px] text-rose-500 font-medium">
                      Short: {Number(m.shortage || 0)} {m.uom}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </article>

        {/* Watchlist 3: Open RMA & Recent Team Audit Feed */}
        <article className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-sky-600" />
              <h3 className="text-xs font-semibold text-slate-900">Live Activity &amp; Open RMA</h3>
            </div>
            <button
              type="button"
              onClick={() => safeNav('audit_reports')}
              className="text-[10px] font-semibold text-sky-700 hover:underline cursor-pointer"
            >
              Audit Logs →
            </button>
          </div>
          <div className="divide-y divide-slate-100 flex-1">
            {recentTickets.filter((t) => ['open', 'under_investigation', 'approved_for_return'].includes(t.status)).slice(0, 1).map((t) => (
              <button
                key={`rma-${t.id}`}
                type="button"
                onClick={() => safeNav('tickets')}
                className="w-full px-3.5 py-2 bg-rose-50/60 hover:bg-rose-50 flex items-center justify-between gap-2 text-left cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-rose-600 shrink-0" />
                    <span className="font-mono text-[11px] font-bold text-rose-700">{t.ticket_number}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-[11px] text-slate-800 truncate mt-0.5">{t.title}</p>
                </div>
                <ExternalLink className="h-3 w-3 text-rose-500 shrink-0" />
              </button>
            ))}

            {recentAuditLogs.length === 0 ? (
              <p className="p-4 text-xs text-slate-400 text-center">No recent activity in selected range.</p>
            ) : (
              recentAuditLogs.slice(0, 3).map((log) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => safeNav('audit_reports')}
                  className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-900 truncate">
                      {log.user_name}{' '}
                      <span className="font-normal text-slate-500">
                        • {log.module}/{log.action}
                      </span>
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">{log.details}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                    {String(log.created_at || '').slice(5, 16)}
                  </span>
                </button>
              ))
            )}
          </div>
        </article>
      </div>

      {/* FULL-WIDTH INTERACTIVE OWNER DATA EXPLORER */}
      <section className="relative bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Scrollable Single-Row Accessible Tablist */}
        <div
          role="tablist"
          aria-label="Owner dashboard operational datasets"
          className="flex items-center overflow-x-auto flex-nowrap border-b border-slate-200 bg-slate-50/70 px-2 pt-1.5 gap-1"
        >
          {explorerTabs.map((t, idx) => {
            const selected = activeTableTab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(t.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                className={`relative shrink-0 px-3 py-2 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors border-b-2 focus-visible:outline-2 focus-visible:outline-sky-500 ${
                  selected
                    ? 'text-slate-950 border-slate-900 font-semibold bg-white rounded-t-md'
                    : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-100/80 rounded-t-md'
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    selected ? 'bg-slate-900 text-white' : 'bg-slate-200/80 text-slate-700'
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Table Top Controls Bar (Search + Total Records + Export) */}
        {activeTableTab !== 'alerts' && (
          <div className="px-3.5 py-2.5 border-b border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder={`Filter ${explorerTabs.find((x) => x.id === activeTableTab)?.label || 'records'}...`}
                  className="h-8 pl-8 pr-3 w-56 sm:w-64 text-xs border border-slate-200 rounded-md bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
              </div>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-700">
                Total Records: <strong className="text-slate-900">{totalItems}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden md:inline text-[11px] text-slate-400">
                Click column headers to sort • Click any row to open module
              </span>
              <button
                type="button"
                onClick={handleExportCurrentTab}
                className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" /> Export CSV
              </button>
            </div>
          </div>
        )}

        {/* Screen-reader sort announcement */}
        <div role="status" className="sr-only">
          {sortAnnouncement}
        </div>

        {/* Tab Panels */}
        {activeTableTab !== 'alerts' ? (
          <div
            role="tabpanel"
            aria-labelledby={`tab-${activeTableTab}`}
            className="w-full"
          >
            <div
              tabIndex={0}
              role="region"
              aria-labelledby={`caption-${activeTableTab}`}
              className="overflow-x-auto"
            >
              {activeTableTab === 'orders' && (
                <table className="w-full min-w-[760px] text-left text-xs border-collapse">
                  <caption id="caption-orders" className="sr-only">
                    Recent Sales Purchase Orders
                  </caption>
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-3 py-2 w-10 text-center border-b border-slate-200 text-slate-600">#</th>
                      <SortableHeader columnKey="po_number" label="PO #" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="customer_name" label="Customer" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="po_date" label="PO Date" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="delivery_deadline" label="Deadline" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="total_amount" label="Order Value" type="number" align="right" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="paid_amount" label="Paid" type="number" align="right" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="balance_due" label="Due" type="number" align="right" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="status" label="Status" sortConfig={sortConfig} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedItems.length === 0 ? (
                      <tr><td colSpan={9} className="p-8 text-center text-slate-400">No purchase orders match filter.</td></tr>
                    ) : (
                      paginatedItems.map((po, idx) => (
                        <tr
                          key={po.id}
                          onClick={() => safeNav('purchase_orders')}
                          className="hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">{startIndex + idx + 1}</td>
                          <td className="px-3 py-2.5 font-mono font-semibold text-slate-900 whitespace-nowrap">{po.po_number}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{po.customer_name}</td>
                          <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{po.po_date}</td>
                          <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{po.delivery_deadline}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">{formatInrFull(po.total_amount)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-emerald-600">{formatInrFull(po.paid_amount)}</td>
                          <td className={`px-3 py-2.5 text-right font-semibold ${po.excess_amount > 0 ? 'text-violet-700' : po.balance_due > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {po.excess_amount > 0 ? `+${formatInrFull(po.excess_amount)} Extra` : formatInrFull(po.balance_due)}
                          </td>
                          <td className="px-3 py-2.5"><StatusBadge status={po.status} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {activeTableTab === 'deadlines' && (
                <table className="w-full min-w-[700px] text-left text-xs border-collapse">
                  <caption id="caption-deadlines" className="sr-only">Open Purchase Orders Deadlines Risk</caption>
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-3 py-2 w-10 text-center border-b border-slate-200 text-slate-600">#</th>
                      <SortableHeader columnKey="po_number" label="PO #" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="customer_name" label="Customer" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="delivery_deadline" label="Deadline" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="days_left" label="Schedule Risk" type="number" align="center" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="total_amount" label="Order Value" type="number" align="right" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="status" label="Status" sortConfig={sortConfig} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedItems.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-slate-400">No open deadline obligations.</td></tr>
                    ) : (
                      paginatedItems.map((po, idx) => {
                        const dLeft = Number(po.days_left ?? 0);
                        return (
                          <tr key={po.id} onClick={() => safeNav('purchase_orders')} className="hover:bg-slate-50 cursor-pointer">
                            <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">{startIndex + idx + 1}</td>
                            <td className="px-3 py-2.5 font-mono font-semibold text-slate-900">{po.po_number}</td>
                            <td className="px-3 py-2.5 font-medium text-slate-800">{po.customer_name}</td>
                            <td className="px-3 py-2.5 text-slate-600">{po.delivery_deadline}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  dLeft < 0
                                    ? 'bg-rose-100 text-rose-700'
                                    : dLeft <= 7
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                {dLeft < 0 ? `${Math.abs(dLeft)} days overdue` : `${dLeft} days left`}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-slate-900">{formatInrFull(po.total_amount)}</td>
                            <td className="px-3 py-2.5"><StatusBadge status={po.status} /></td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}

              {activeTableTab === 'work_orders' && (
                <table className="w-full min-w-[740px] text-left text-xs border-collapse">
                  <caption id="caption-work_orders" className="sr-only">Manufacturing Work Orders</caption>
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-3 py-2 w-10 text-center border-b border-slate-200 text-slate-600">#</th>
                      <SortableHeader columnKey="work_order_number" label="WO #" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="product_name" label="Product" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="po_number" label="PO #" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="current_level" label="Stage" type="number" align="center" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="target_quantity" label="Target / Comp / Rej" type="number" align="center" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="material_status" label="Materials" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="status" label="Status" sortConfig={sortConfig} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedItems.length === 0 ? (
                      <tr><td colSpan={8} className="p-8 text-center text-slate-400">No work orders in range.</td></tr>
                    ) : (
                      paginatedItems.map((wo, idx) => (
                        <tr
                          key={wo.id}
                          onClick={() => (onViewWorkOrder ? onViewWorkOrder(wo.id) : safeNav('manufacturing'))}
                          className="hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">{startIndex + idx + 1}</td>
                          <td className="px-3 py-2.5 font-mono font-semibold text-slate-900">{wo.work_order_number}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{wo.product_name}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-500">{wo.po_number}</td>
                          <td className="px-3 py-2.5 text-center font-bold text-sky-700">L{wo.current_level} / 5</td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className="font-semibold text-slate-900">{wo.target_quantity}</span> /{' '}
                            <span className="text-emerald-700">{wo.completed_quantity || 0}</span> /{' '}
                            <span className="text-rose-600">{wo.rejected_quantity || 0}</span>
                          </td>
                          <td className="px-3 py-2.5"><StatusBadge status={wo.material_status} /></td>
                          <td className="px-3 py-2.5"><StatusBadge status={wo.status} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {activeTableTab === 'leads' && (
                <table className="w-full min-w-[720px] text-left text-xs border-collapse">
                  <caption id="caption-leads" className="sr-only">Recent Leads</caption>
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-3 py-2 w-10 text-center border-b border-slate-200 text-slate-600">#</th>
                      <SortableHeader columnKey="lead_number" label="Lead # & Title" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="customer_name" label="Customer" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="source" label="Source" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="priority" label="Priority" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="estimated_value" label="Est. Value" type="number" align="right" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="status" label="Status" sortConfig={sortConfig} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedItems.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-slate-400">No leads in range.</td></tr>
                    ) : (
                      paginatedItems.map((l, idx) => (
                        <tr key={l.id} onClick={() => safeNav('leads')} className="hover:bg-slate-50 cursor-pointer">
                          <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">{startIndex + idx + 1}</td>
                          <td className="px-3 py-2.5">
                            <span className="font-mono font-semibold text-slate-900">{l.lead_number}</span>
                            <p className="text-[11px] text-slate-600 truncate max-w-[230px]" title={l.title}>{l.title}</p>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{l.customer_name || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-600">{l.source}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={l.priority || 'medium'} /></td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">{formatInrFull(l.estimated_value)}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={l.status} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {activeTableTab === 'quotations' && (
                <table className="w-full min-w-[680px] text-left text-xs border-collapse">
                  <caption id="caption-quotations" className="sr-only">Recent Commercial Quotations</caption>
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-3 py-2 w-10 text-center border-b border-slate-200 text-slate-600">#</th>
                      <SortableHeader columnKey="quotation_number" label="Quote #" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="customer_name" label="Customer" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="quotation_date" label="Date" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="valid_until" label="Valid Until" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="total_amount" label="Total Value" type="number" align="right" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="status" label="Status" sortConfig={sortConfig} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedItems.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-slate-400">No quotations in range.</td></tr>
                    ) : (
                      paginatedItems.map((q, idx) => (
                        <tr
                          key={q.id}
                          onClick={() => safeNav('quotation_detail', { quotationId: q.id, quotationMode: 'view' })}
                          className="hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">{startIndex + idx + 1}</td>
                          <td className="px-3 py-2.5 font-mono font-semibold text-sky-700">{q.quotation_number}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{q.customer_name}</td>
                          <td className="px-3 py-2.5 text-slate-500">{q.quotation_date}</td>
                          <td className="px-3 py-2.5 text-slate-500">{q.valid_until}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">{formatInrFull(q.total_amount)}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={q.status} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {activeTableTab === 'payments' && (
                <table className="w-full min-w-[700px] text-left text-xs border-collapse">
                  <caption id="caption-payments" className="sr-only">Verified Client Payments</caption>
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-3 py-2 w-10 text-center border-b border-slate-200 text-slate-600">#</th>
                      <SortableHeader columnKey="payment_number" label="Receipt #" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="customer_name" label="Customer" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="po_number" label="PO #" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="payment_date" label="Date" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="payment_type" label="Type" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="amount" label="Amount" type="number" align="right" sortConfig={sortConfig} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedItems.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-slate-400">No payments in range.</td></tr>
                    ) : (
                      paginatedItems.map((p, idx) => (
                        <tr key={p.id} onClick={() => safeNav('payments')} className="hover:bg-slate-50 cursor-pointer">
                          <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">{startIndex + idx + 1}</td>
                          <td className="px-3 py-2.5 font-mono font-semibold text-slate-900">{p.payment_number}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{p.customer_name}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-500">{p.po_number}</td>
                          <td className="px-3 py-2.5 text-slate-500">{p.payment_date}</td>
                          <td className="px-3 py-2.5 capitalize text-slate-700">{p.payment_type}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-emerald-600">{formatInrFull(p.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {activeTableTab === 'requisitions' && (
                <table className="w-full min-w-[680px] text-left text-xs border-collapse">
                  <caption id="caption-requisitions" className="sr-only">MRP Material Requisitions</caption>
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-3 py-2 w-10 text-center border-b border-slate-200 text-slate-600">#</th>
                      <SortableHeader columnKey="requisition_number" label="Requisition #" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="po_number" label="PO #" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="customer_name" label="Customer" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="requested_by_name" label="Requested By" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="total_estimated_cost" label="Est. Cost" type="number" align="right" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="status" label="Status" sortConfig={sortConfig} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedItems.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-slate-400">No requisitions in range.</td></tr>
                    ) : (
                      paginatedItems.map((mr, idx) => (
                        <tr key={mr.id} onClick={() => safeNav('mrp')} className="hover:bg-slate-50 cursor-pointer">
                          <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">{startIndex + idx + 1}</td>
                          <td className="px-3 py-2.5 font-mono font-semibold text-slate-900">{mr.requisition_number}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-500">{mr.po_number}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{mr.customer_name}</td>
                          <td className="px-3 py-2.5 text-slate-600">{mr.requested_by_name || 'MRP Engine'}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">{formatInrFull(mr.total_estimated_cost)}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={mr.status} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {activeTableTab === 'dispatches' && (
                <table className="w-full min-w-[700px] text-left text-xs border-collapse">
                  <caption id="caption-dispatches" className="sr-only">Logistics Dispatches</caption>
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-3 py-2 w-10 text-center border-b border-slate-200 text-slate-600">#</th>
                      <SortableHeader columnKey="dispatch_number" label="Dispatch # & Challan" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="customer_name" label="Customer" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="courier_name" label="Courier & Tracking" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="dispatch_date" label="Date" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="status" label="Status" sortConfig={sortConfig} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedItems.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-slate-400">No dispatches in range.</td></tr>
                    ) : (
                      paginatedItems.map((d, idx) => (
                        <tr key={d.id} onClick={() => safeNav('dispatch')} className="hover:bg-slate-50 cursor-pointer">
                          <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">{startIndex + idx + 1}</td>
                          <td className="px-3 py-2.5">
                            <span className="font-mono font-semibold text-slate-900">{d.dispatch_number}</span>
                            <p className="text-[10px] text-slate-500">Challan: {d.delivery_challan_no}</p>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{d.customer_name}</td>
                          <td className="px-3 py-2.5">
                            <span className="font-medium text-slate-800">{d.courier_name}</span>
                            <p className="text-[10px] font-mono text-slate-500">
                              {d.tracking_number}{d.lr_number ? ` • LR: ${d.lr_number}` : ''}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">{d.dispatch_date}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={d.status} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {activeTableTab === 'audit' && (
                <table className="w-full min-w-[740px] text-left text-xs border-collapse">
                  <caption id="caption-audit" className="sr-only">Live Audit Trail</caption>
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-3 py-2 w-10 text-center border-b border-slate-200 text-slate-600">#</th>
                      <SortableHeader columnKey="created_at" label="Timestamp" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="user_name" label="User & Role" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="module" label="Module" sortConfig={sortConfig} onSort={handleSort} />
                      <SortableHeader columnKey="action" label="Action" sortConfig={sortConfig} onSort={handleSort} />
                      <th scope="col" className="px-3 py-2 border-b border-slate-200 text-slate-700 font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedItems.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-slate-400">No audit activity in range.</td></tr>
                    ) : (
                      paginatedItems.map((log, idx) => (
                        <tr key={log.id} onClick={() => safeNav('audit_reports')} className="hover:bg-slate-50 cursor-pointer">
                          <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">{startIndex + idx + 1}</td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">{log.created_at}</td>
                          <td className="px-3 py-2.5">
                            <span className="font-semibold text-slate-900">{log.user_name}</span>
                            <p className="text-[10px] text-slate-500">{log.role_name}</p>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] uppercase text-sky-700">{log.module}</td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-slate-700">{log.action}</td>
                          <td className="px-3 py-2.5 text-slate-600 max-w-[300px] truncate" title={log.details}>{log.details}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          </div>
        ) : (
          /* Alerts Split Panel: Low Stock Materials + RMA Tickets */
          <div
            role="tabpanel"
            aria-labelledby="tab-alerts"
            className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200"
          >
            <div tabIndex={0} role="region" aria-label="Low stock materials" className="overflow-x-auto">
              <div className="px-3.5 py-2.5 bg-rose-50/60 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-rose-800">
                  Low Stock Raw Materials ({lowStockItems.length} Records)
                </span>
                <button
                  type="button"
                  onClick={() => safeNav('inventory_raw_materials')}
                  className="text-[11px] font-medium text-rose-700 hover:underline cursor-pointer"
                >
                  Open Warehouse →
                </button>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-3 py-2 w-10 text-center">#</th>
                    <th scope="col" className="px-3 py-2">Material &amp; Location</th>
                    <th scope="col" className="px-3 py-2 text-center">Stock / Reorder</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowStockItems.length === 0 ? (
                    <tr><td colSpan={3} className="p-6 text-center text-slate-400">All materials healthy.</td></tr>
                  ) : (
                    lowStockItems.map((m, idx) => (
                      <tr key={m.id} onClick={() => safeNav('inventory_raw_materials')} className="hover:bg-slate-50 cursor-pointer">
                        <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-900">{m.name}</p>
                          <p className="text-[10px] font-mono text-slate-500">{m.sku} • {m.location}</p>
                        </td>
                        <td className="px-3 py-2 text-center font-bold text-rose-600 whitespace-nowrap">
                          {Number(m.current_stock)} / {Number(m.reorder_level)} {m.uom}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div tabIndex={0} role="region" aria-label="RMA and Complaint Tickets" className="overflow-x-auto">
              <div className="px-3.5 py-2.5 bg-amber-50/60 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-900">
                  RMA &amp; Complaint Tickets ({recentTickets.length} Records)
                </span>
                <button
                  type="button"
                  onClick={() => safeNav('tickets')}
                  className="text-[11px] font-medium text-amber-800 hover:underline cursor-pointer"
                >
                  Open Service Desk →
                </button>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-3 py-2 w-10 text-center">#</th>
                    <th scope="col" className="px-3 py-2">Ticket # &amp; Title</th>
                    <th scope="col" className="px-3 py-2">Severity</th>
                    <th scope="col" className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentTickets.length === 0 ? (
                    <tr><td colSpan={4} className="p-6 text-center text-slate-400">No RMA tickets in range.</td></tr>
                  ) : (
                    recentTickets.map((t, idx) => (
                      <tr key={t.id} onClick={() => safeNav('tickets')} className="hover:bg-slate-50 cursor-pointer">
                        <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <span className="font-mono font-semibold text-rose-700">{t.ticket_number}</span>
                          <p className="text-[11px] text-slate-700 truncate max-w-[200px]" title={t.title}>{t.title}</p>
                        </td>
                        <td className="px-3 py-2"><StatusBadge status={t.severity} /></td>
                        <td className="px-3 py-2"><StatusBadge status={t.status} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
