// client/src/components/Sidebar.jsx
import React, { useState, useEffect, useRef } from 'react';
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
  ChevronRight,
  ChevronDown,
  Users,
  KeyRound,
  Lock,
  MapPin,
  Globe,
  Compass,
  Building2,
  Wallet,
  Package,
  Ticket,
  BarChart3,
  ArrowRightLeft
} from 'lucide-react';
import { canAccessTab } from '../utils/rbac';

const SA_USER_IDS = new Set([
  'superadmin_users',
  'superadmin_roles',
  'superadmin_permissions',
  'superadmin_access'
]);

const SA_LOCATION_IDS = new Set([
  'superadmin_city',
  'superadmin_state',
  'superadmin_country',
  'superadmin_zone'
]);

function getSectionKeyForTab(tabId, navSections) {
  if (tabId && tabId.startsWith('superadmin_')) {
    return 'superadmin';
  }
  const found = navSections.find((sec) => sec.items.some((it) => it.id === tabId));
  return found ? found.key : 'sales';
}

function getSubgroupForTab(tabId) {
  if (SA_USER_IDS.has(tabId)) return 'sa_users';
  if (SA_LOCATION_IDS.has(tabId)) return 'sa_location';
  return null;
}

export default function Sidebar({
  currentUser,
  activeTab,
  setActiveTab,
  counts = {},
  mobileOpen = false,
  onCloseMobile
}) {
  const navSections = [
    {
      key: 'sales',
      title: 'Sales & Commercial',
      items: [
        { id: 'dashboard', label: 'Dashboard Overview', icon: LayoutDashboard },
        { id: 'leads', label: 'Leads Inward & Approval', icon: UserCheck, badge: counts.leads },
        { id: 'quotations', label: 'Commercial Quotations', icon: FileSpreadsheet, badge: counts.quotations },
        { id: 'purchase_orders', label: 'Customer Sales POs', icon: FileCheck2, badge: counts.pos }
      ]
    },
    {
      key: 'accounting',
      title: 'Accounting & Finance',
      items: [
        { id: 'accounting_dashboard', label: 'Accounting Dashboard', icon: BarChart3 },
        { id: 'payments', label: 'Payments & Receipts', icon: CreditCard, badge: counts.payments },
        { id: 'accounting_po_balances', label: 'PO Balances & Dues', icon: Wallet },
        { id: 'accounting_advances', label: 'Advances & Excess', icon: ArrowRightLeft },
        { id: 'accounting_customers', label: 'Customer Accounts', icon: Users }
      ]
    },
    {
      key: 'production',
      title: 'Production & Logistics',
      items: [
        { id: 'mrp', label: 'BOM Inventory & Requisitions', icon: Boxes, badge: counts.requisitions },
        { id: 'manufacturing', label: '5-Level Manufacturing', icon: Hammer, badge: counts.workOrders },
        { id: 'qc', label: 'Quality Control Gates', icon: ClipboardCheck, badge: counts.qc },
        { id: 'dispatch', label: 'Dispatch & Logistics', icon: Truck, badge: counts.dispatches }
      ]
    },
    {
      key: 'inventory',
      title: 'Inventory',
      items: [
        { id: 'inventory_products', label: 'Products & BOM', icon: Package },
        { id: 'inventory_raw_materials', label: 'Raw Materials & Stock', icon: Boxes }
      ]
    },
    {
      key: 'quality_claims',
      title: 'Client Quality & Claims',
      items: [
        { id: 'customer_portal', label: 'Customer Inward QC & RMA', icon: AlertTriangle, badge: counts.complaints },
        { id: 'tickets', label: 'Ticketing Engine', icon: Ticket, badge: counts.complaints }
      ]
    },
    {
      key: 'governance',
      title: 'Governance & Auditing',
      items: [
        { id: 'audit_reports', label: 'Audit Reports & Session Logs', icon: History },
        { id: 'masters', label: 'Master Data Hub', icon: Database },
        { id: 'users_matrix', label: 'Users & RBAC Matrix', icon: ShieldCheck }
      ]
    }
  ];

  const [openSection, setOpenSection] = useState(() => getSectionKeyForTab(activeTab, navSections));
  const [openSubgroup, setOpenSubgroup] = useState(() => getSubgroupForTab(activeTab));
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef(null);
  const activeItemRef = useRef(null);

  const handleSidebarScroll = () => {
    setIsScrolling(true);
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 800);
  };

  // Keep only the active section & active submenu open when activeTab changes, and scroll it into view
  useEffect(() => {
    const nextSec = getSectionKeyForTab(activeTab, navSections);
    setOpenSection(nextSec);
    setOpenSubgroup(getSubgroupForTab(activeTab));

    requestAnimationFrame(() => {
      activeItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [activeTab]);

  const toggleSection = (key) => {
    setOpenSection((prev) => (prev === key ? null : key));
  };

  const toggleSubgroup = (key) => {
    setOpenSubgroup((prev) => (prev === key ? null : key));
  };

  const showSuperadmin = canAccessTab(currentUser, 'superadmin');

  const saUserItems = [
    { id: 'superadmin_users', label: 'Users', icon: Users },
    { id: 'superadmin_roles', label: 'Roles', icon: ShieldCheck },
    { id: 'superadmin_permissions', label: 'Permissions', icon: KeyRound },
    { id: 'superadmin_access', label: 'Access', icon: Lock }
  ];

  const saLocationItems = [
    { id: 'superadmin_city', label: 'City', icon: MapPin },
    { id: 'superadmin_state', label: 'State', icon: MapPin },
    { id: 'superadmin_country', label: 'Country', icon: Globe },
    { id: 'superadmin_zone', label: 'Zone', icon: Compass }
  ];

  const saDirectItems = [
    { id: 'superadmin_couriers', label: 'Couriers', icon: Truck },
    { id: 'superadmin_payment_types', label: 'Payment Type', icon: Wallet },
    { id: 'superadmin_customers', label: 'Customer', icon: Building2 }
  ];

  const handleNav = (tabId) => {
    setActiveTab(tabId);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-30 md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-60 md:w-56 bg-slate-900 border-r border-slate-800 flex flex-col flex-shrink-0 h-[calc(100%-3.25rem)] md:h-full text-slate-300 transform transition-transform duration-200 ease-in-out ${
          mobileOpen ? 'translate-x-0 top-[3.25rem]' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div
          onScroll={handleSidebarScroll}
          className={`p-2.5 space-y-4 flex-1 overflow-y-auto overscroll-contain sidebar-scroll ${isScrolling ? 'is-scrolling' : ''}`}
        >
          {/* SUPERADMIN MENU (Top Accordion) */}
          {showSuperadmin && (
            <div className="space-y-1 pb-2 border-b border-slate-800">
              <button
                type="button"
                onClick={() => toggleSection('superadmin')}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[10px] font-bold text-sky-400 uppercase tracking-wider hover:bg-slate-800/60 cursor-pointer"
              >
                <span>Superadmin</span>
                {openSection === 'superadmin' ? (
                  <ChevronDown className="h-3.5 w-3.5 text-sky-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                )}
              </button>

              {openSection === 'superadmin' && (
                <div className="space-y-1">
                  {/* Users Submenu */}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleSubgroup('sa_users')}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:bg-slate-800/60 cursor-pointer"
                    >
                      <span className="flex items-center space-x-2">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        <span>Users</span>
                      </span>
                      {openSubgroup === 'sa_users' ? (
                        <ChevronDown className="h-3 w-3 text-slate-500" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-slate-500" />
                      )}
                    </button>
                    {openSubgroup === 'sa_users' && (
                      <div className="ml-3 pl-2 border-l border-slate-800 space-y-0.5 mt-0.5">
                        {saUserItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = activeTab === item.id;
                          return (
                            <button
                              key={item.id}
                              ref={isActive ? activeItemRef : null}
                              type="button"
                              onClick={() => handleNav(item.id)}
                              className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                                isActive
                                  ? 'bg-slate-800 text-white font-semibold'
                                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                              }`}
                            >
                              <Icon className={`h-3 w-3 flex-shrink-0 ${isActive ? 'text-sky-400' : 'text-slate-500'}`} />
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Location Submenu */}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleSubgroup('sa_location')}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:bg-slate-800/60 cursor-pointer"
                    >
                      <span className="flex items-center space-x-2">
                        <Globe className="h-3.5 w-3.5 text-slate-400" />
                        <span>Location</span>
                      </span>
                      {openSubgroup === 'sa_location' ? (
                        <ChevronDown className="h-3 w-3 text-slate-500" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-slate-500" />
                      )}
                    </button>
                    {openSubgroup === 'sa_location' && (
                      <div className="ml-3 pl-2 border-l border-slate-800 space-y-0.5 mt-0.5">
                        {saLocationItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = activeTab === item.id;
                          return (
                            <button
                              key={item.id}
                              ref={isActive ? activeItemRef : null}
                              type="button"
                              onClick={() => handleNav(item.id)}
                              className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                                isActive
                                  ? 'bg-slate-800 text-white font-semibold'
                                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                              }`}
                            >
                              <Icon className={`h-3 w-3 flex-shrink-0 ${isActive ? 'text-sky-400' : 'text-slate-500'}`} />
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Direct Superadmin Items: Couriers, Payment Type, Customer */}
                  <div className="space-y-0.5">
                    {saDirectItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          ref={isActive ? activeItemRef : null}
                          type="button"
                          onClick={() => handleNav(item.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-slate-800 text-white font-semibold shadow-xs'
                              : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                            <span className="truncate">{item.label}</span>
                          </div>
                          {isActive && <ChevronRight className="h-3 w-3 text-slate-500 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STANDARD NAVIGATION SECTIONS (Flat Always-Visible Style) */}
          {navSections.map((section) => {
            const accessibleItems = section.items.filter((item) => canAccessTab(currentUser, item.id));
            if (accessibleItems.length === 0) return null;

            return (
              <div key={section.key}>
                <p className="px-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 truncate">
                  {section.title}
                </p>

                <div className="space-y-0.5">
                  {accessibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        ref={isActive ? activeItemRef : null}
                        type="button"
                        onClick={() => handleNav(item.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-slate-800 text-white font-semibold shadow-xs'
                            : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                          <span className="truncate">{item.label}</span>
                        </div>

                        {isActive && <ChevronRight className="h-3 w-3 text-slate-500 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Info */}
        <div className="p-2.5 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between">
          <span>SAR ERP • v2.4</span>
          <span className="flex items-center space-x-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            <span>Live DB</span>
          </span>
        </div>
      </aside>
    </>
  );
}
