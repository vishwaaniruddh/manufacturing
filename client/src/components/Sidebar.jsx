// client/src/components/Sidebar.jsx
import React from 'react';
import {
  LayoutDashboard,
  UserCheck,
  FileSpreadsheet,
  FileCheck2,
  CreditCard,
  Boxes,
  Hammer,
  ClipboardCheck,
  Truck,
  AlertTriangle,
  Database,
  ShieldCheck,
  History,
  ChevronRight
} from 'lucide-react';
import { canAccessTab } from '../utils/rbac';

export default function Sidebar({ currentUser, activeTab, setActiveTab, counts = {} }) {
  const navSections = [
    {
      title: 'Sales & Commercial',
      items: [
        { id: 'dashboard', label: 'Dashboard Overview', icon: LayoutDashboard },
        { id: 'leads', label: '1 & 2. Leads Inward & Approval', icon: UserCheck, badge: counts.leads },
        { id: 'quotations', label: '3. Commercial Quotations', icon: FileSpreadsheet, badge: counts.quotations },
        { id: 'purchase_orders', label: '4. Customer Sales POs', icon: FileCheck2, badge: counts.pos },
        { id: 'payments', label: '5 & 12. Client Payments', icon: CreditCard, badge: counts.payments },
      ]
    },
    {
      title: 'Production & Logistics',
      items: [
        { id: 'mrp', label: '7. BOM Inventory & Requisitions', icon: Boxes, badge: counts.requisitions },
        { id: 'manufacturing', label: '8. 5-Level Manufacturing', icon: Hammer, badge: counts.workOrders },
        { id: 'qc', label: '9. Quality Control Gates', icon: ClipboardCheck, badge: counts.qc },
        { id: 'dispatch', label: '10. Dispatch & Logistics', icon: Truck, badge: counts.dispatches },
      ]
    },
    {
      title: 'Client Quality & Claims',
      items: [
        { id: 'customer_portal', label: '11. Customer Inward QC & RMA', icon: AlertTriangle, badge: counts.complaints },
      ]
    },
    {
      title: 'Governance & Auditing',
      items: [
        { id: 'audit_reports', label: 'Audit Reports & Session Logs', icon: History },
        { id: 'masters', label: 'Master Data Hub', icon: Database },
        { id: 'users_matrix', label: 'Users & RBAC Matrix', icon: ShieldCheck },
      ]
    }
  ];

  return (
    <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col flex-shrink-0 min-h-[calc(100vh-3.25rem)] text-slate-300">
      <div className="p-2.5 space-y-4 flex-1 overflow-y-auto">
        {navSections.map((section, idx) => {
          // Filter items based on user's active permissions!
          const accessibleItems = section.items.filter(item => canAccessTab(currentUser, item.id));
          if (accessibleItems.length === 0) return null;

          return (
            <div key={idx} className="space-y-1">
              <h3 className="px-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {section.title}
              </h3>
              <div className="space-y-0.5">
                {accessibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-slate-800 text-white font-semibold shadow-xs'
                          : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                        <span className="truncate">{item.label}</span>
                      </div>

                      {item.badge !== undefined && item.badge > 0 ? (
                        <span
                          className={`px-1.5 py-0.2 text-[10px] font-bold rounded-sm ${
                            isActive
                              ? 'bg-sky-500 text-white'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {item.badge}
                        </span>
                      ) : (
                        isActive && <ChevronRight className="h-3 w-3 opacity-60 text-sky-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Compact Active Role Badge */}
      <div className="p-2.5 border-t border-slate-800 text-[10px] text-slate-400">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-300">Access Scope:</span>
          <span className="font-bold text-sky-400 truncate max-w-[100px]">
            {currentUser?.role_name || 'Restricted'}
          </span>
        </div>
      </div>
    </aside>
  );
}
