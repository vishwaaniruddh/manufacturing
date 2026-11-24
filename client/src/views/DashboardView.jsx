// client/src/views/DashboardView.jsx
import React from 'react';
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
  History
} from 'lucide-react';
import { canAccessTab, hasPermission } from '../utils/rbac';

export default function DashboardView({ currentUser, summary, onNavigate }) {
  if (!summary) {
    return (
      <div className="flex items-center justify-center p-8 text-xs text-slate-500">
        <Clock className="h-4 w-4 animate-spin mr-1.5" /> Loading dashboard...
      </div>
    );
  }

  const { leads, quotations, purchase_orders, finance, manufacturing, inventory, logistics, customer_service } = summary;

  return (
    <div className="space-y-4">
      
      {/* Compact Header Bar (ShadCN style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">
              Operational & Financial Dashboard
            </h1>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              Role: {currentUser?.role_name || 'User'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Role-scoped view of active commercial inquiries, work orders, quality gates, and cash settlement.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasPermission(currentUser, 'leads', 'create') && (
            <button
              onClick={() => onNavigate('leads')}
              className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-slate-50 rounded-md font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5"
            >
              + New Lead <ArrowUpRight className="h-3 w-3" />
            </button>
          )}

          {canAccessTab(currentUser, 'audit_reports') && (
            <button
              onClick={() => onNavigate('audit_reports')}
              className="h-8 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-md font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5"
            >
              <History className="h-3 w-3" /> Audit Logs
            </button>
          )}
        </div>
      </div>

      {/* Compact Financial KPI Strip */}
      {canAccessTab(currentUser, 'payments') && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500">Total Orders Value</span>
            <p className="text-lg font-bold text-slate-900 mt-0.5">
              ₹{Number(finance.total_order_value || 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400">{purchase_orders.total} active POs</span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500">Payments Received</span>
            <p className="text-lg font-bold text-emerald-600 mt-0.5">
              ₹{Number(finance.total_received || 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-emerald-600 font-medium">
              {finance.collection_percentage}% collected
            </span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500">Balance Due</span>
            <p className="text-lg font-bold text-amber-600 mt-0.5">
              ₹{Number(finance.balance_due || 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400">Awaiting dispatch/QC</span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500">Work Orders Active</span>
            <p className="text-lg font-bold text-sky-600 mt-0.5">
              {manufacturing.in_progress} Orders
            </p>
            <span className="text-[10px] text-slate-400">{manufacturing.completed} Completed</span>
          </div>
        </div>
      )}

      {/* Grid of Key Pipeline Cards (Permission Filtered) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        
        {/* Card 1: Leads */}
        {canAccessTab(currentUser, 'leads') && (
          <div 
            onClick={() => onNavigate('leads')}
            className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-300 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">Leads Inward</span>
              <UserCheck className="h-4 w-4 text-slate-500" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl font-bold text-slate-900">{leads.total}</span>
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                {leads.approved} Approved
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {leads.pending} awaiting review
            </p>
          </div>
        )}

        {/* Card 2: Quotations & POs */}
        {canAccessTab(currentUser, 'quotations') && (
          <div 
            onClick={() => onNavigate('quotations')}
            className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-300 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">Quotations & POs</span>
              <FileSpreadsheet className="h-4 w-4 text-slate-500" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl font-bold text-slate-900">{quotations.total} Quotes</span>
              <span className="text-[10px] font-medium text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                {purchase_orders.total} POs
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              ₹{Number(quotations.total_value).toLocaleString()} in pipeline
            </p>
          </div>
        )}

        {/* Card 3: 5-Stage Manufacturing */}
        {canAccessTab(currentUser, 'manufacturing') && (
          <div 
            onClick={() => onNavigate('manufacturing')}
            className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-300 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">Manufacturing Floor</span>
              <Hammer className="h-4 w-4 text-slate-500" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl font-bold text-slate-900">{manufacturing.total_work_orders} Work Orders</span>
              <span className="text-[10px] font-medium text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200">
                {manufacturing.in_progress} In Progress
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {manufacturing.total_units_rejected} QC rejected units logged
            </p>
          </div>
        )}

        {/* Card 4: Quality & Customer Claims */}
        {canAccessTab(currentUser, 'customer_portal') && (
          <div 
            onClick={() => onNavigate('customer_portal')}
            className="bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs hover:border-slate-300 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500">Customer QC & Claims</span>
              <AlertTriangle className="h-4 w-4 text-slate-500" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl font-bold text-slate-900">{customer_service.total_complaints} Claims</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded border ${
                customer_service.open_complaints > 0
                  ? 'text-rose-700 bg-rose-50 border-rose-200'
                  : 'text-slate-600 bg-slate-50 border-slate-200'
              }`}>
                {customer_service.open_complaints} Open
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {logistics.delivered} shipments delivered
            </p>
          </div>
        )}

      </div>

      {/* 5-Level Manufacturing Stage Distribution (Only if authorized!) */}
      {canAccessTab(currentUser, 'manufacturing') && (
        <div className="bg-white rounded-lg p-3.5 border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                <Hammer className="h-3.5 w-3.5 text-slate-700" />
                Live Manufacturing Stages (Level 1 to Level 5)
              </h3>
              <p className="text-[11px] text-slate-500">
                Active batch distribution across verified QC quality gates
              </p>
            </div>
            <button
              onClick={() => onNavigate('manufacturing')}
              className="text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1"
            >
              Floor View <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { lvl: 1, name: 'L1: Sizing', desc: 'Raw Material Prep' },
              { lvl: 2, name: 'L2: Machining', desc: 'Winding & Turning' },
              { lvl: 3, name: 'L3: Assembly', desc: 'Rotor Balancing' },
              { lvl: 4, name: 'L4: Integration', desc: 'Housing & Bearing' },
              { lvl: 5, name: 'L5: Testing', desc: 'Burn-in & Packaging' },
            ].map((item) => {
              const count = manufacturing.level_distribution?.[item.lvl] || 0;
              return (
                <div
                  key={item.lvl}
                  className="p-2.5 rounded-md border border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-800">
                      {item.name}
                    </span>
                    <span className="h-5 w-5 rounded bg-white border border-slate-200 font-bold text-[11px] flex items-center justify-center text-slate-700">
                      {count}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
