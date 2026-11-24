// client/src/App.jsx
import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

// Views
import DashboardView from './views/DashboardView';
import LeadsView from './views/LeadsView';
import LeadEngineView from './views/LeadEngineView';
import QuotationsView from './views/QuotationsView';
import QuotationDetailView from './views/QuotationDetailView';
import PurchaseOrdersView from './views/PurchaseOrdersView';
import PaymentsView from './views/PaymentsView';
import ManufacturingView from './views/ManufacturingView';
import WorkOrderDetailView from './views/WorkOrderDetailView';
import QualityControlView from './views/QualityControlView';
import DispatchView from './views/DispatchView';
import CustomerPortalView from './views/CustomerPortalView';
import MastersView from './views/MastersView';
import UsersMatrixView from './views/UsersMatrixView';
import AuditReportsView from './views/AuditReportsView';
import SuperadminView from './views/SuperadminView';
import InventoryView from './views/InventoryView';
import TicketsView from './views/TicketsView';

import { api } from './services/api';
import { canAccessTab, getFirstAllowedTab } from './utils/rbac';

const TAB_TO_ROUTE = {
  dashboard: 'dashboard',
  leads: 'leads',
  lead_engine: 'leads/engine',
  quotations: 'quotations',
  quotation_detail: 'quotations',
  purchase_orders: 'purchase-orders',
  payments: 'payments',
  mrp: 'inventory-mrp',
  manufacturing: 'manufacturing',
  work_order_detail: 'manufacturing/wo',
  qc: 'quality-control',
  dispatch: 'dispatch',
  customer_portal: 'customer-portal',
  tickets: 'tickets',
  audit_reports: 'audit-reports',
  masters: 'masters',
  users_matrix: 'users-matrix',
  superadmin_users: 'superadmin/users',
  superadmin_roles: 'superadmin/roles',
  superadmin_permissions: 'superadmin/permissions',
  superadmin_access: 'superadmin/access',
  superadmin_city: 'superadmin/location/city',
  superadmin_state: 'superadmin/location/state',
  superadmin_country: 'superadmin/location/country',
  superadmin_zone: 'superadmin/location/zone',
  superadmin_couriers: 'superadmin/couriers',
  superadmin_payment_types: 'superadmin/payment-types',
  superadmin_customers: 'superadmin/customers',
  inventory_products: 'inventory/products',
  inventory_raw_materials: 'inventory/raw-materials'
};

const ROUTE_TO_TAB = {
  'dashboard': 'dashboard',
  'leads': 'leads',
  'leads/engine': 'lead_engine',
  'quotations': 'quotations',
  'purchase-orders': 'purchase_orders',
  'payments': 'payments',
  'inventory-mrp': 'mrp',
  'mrp': 'mrp',
  'manufacturing': 'manufacturing',
  'quality-control': 'qc',
  'qc': 'qc',
  'dispatch': 'dispatch',
  'customer-portal': 'customer_portal',
  'tickets': 'tickets',
  'audit-reports': 'audit_reports',
  'audit': 'audit_reports',
  'masters': 'masters',
  'users-matrix': 'users_matrix',
  'users': 'users_matrix',
  'superadmin/users': 'superadmin_users',
  'superadmin/roles': 'superadmin_roles',
  'superadmin/permissions': 'superadmin_permissions',
  'superadmin/access': 'superadmin_access',
  'superadmin/location/city': 'superadmin_city',
  'superadmin/location/state': 'superadmin_state',
  'superadmin/location/country': 'superadmin_country',
  'superadmin/location/zone': 'superadmin_zone',
  'superadmin/couriers': 'superadmin_couriers',
  'superadmin/payment-types': 'superadmin_payment_types',
  'superadmin/customers': 'superadmin_customers',
  'inventory/products': 'inventory_products',
  'inventory/raw-materials': 'inventory_raw_materials'
};

const getHashForTab = (tab, woId = null, quotationId = null, quotationMode = 'view') => {
  if (tab === 'work_order_detail' && woId) {
    return `#/manufacturing/wo/${woId}`;
  }
  if (tab === 'quotation_detail') {
    if (quotationMode === 'create') return '#/quotations/new';
    if (quotationId && quotationMode === 'edit') return `#/quotations/${quotationId}/edit`;
    if (quotationId) return `#/quotations/${quotationId}`;
    return '#/quotations';
  }
  const route = TAB_TO_ROUTE[tab] || 'dashboard';
  return `#/${route}`;
};

const parseHash = () => {
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  if (!hash) return { tab: 'dashboard', woId: null, quotationId: null, quotationMode: 'view' };

  if (hash.startsWith('manufacturing/wo/')) {
    const parts = hash.split('/');
    const woId = parseInt(parts[2], 10) || null;
    return { tab: 'work_order_detail', woId, quotationId: null, quotationMode: 'view' };
  }

  if (hash === 'quotations/new') {
    return { tab: 'quotation_detail', woId: null, quotationId: null, quotationMode: 'create' };
  }

  if (hash.startsWith('quotations/')) {
    const parts = hash.split('/');
    const quotationId = parseInt(parts[1], 10) || null;
    if (quotationId && parts[2] === 'edit') {
      return { tab: 'quotation_detail', woId: null, quotationId, quotationMode: 'edit' };
    }
    if (quotationId) {
      return { tab: 'quotation_detail', woId: null, quotationId, quotationMode: 'view' };
    }
  }

  const clean = hash.split('?')[0].replace(/\/+$/, '');
  const tab = ROUTE_TO_TAB[clean] || 'dashboard';
  return { tab, woId: null, quotationId: null, quotationMode: 'view' };
};

export default function App() {
  const initialRoute = parseHash();
  const [activeTab, setActiveTabState] = useState(initialRoute.tab);
  const [inspectingWOId, setInspectingWOId] = useState(initialRoute.woId);
  const [inspectingQuotationId, setInspectingQuotationId] = useState(initialRoute.quotationId);
  const [quotationMode, setQuotationMode] = useState(initialRoute.quotationMode);
  const [currentUser, setCurrentUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Workflow handover context
  const [selectedLeadForQuote, setSelectedLeadForQuote] = useState(null);
  const [selectedQuoteForPO, setSelectedQuoteForPO] = useState(null);
  const [selectedPOForAction, setSelectedPOForAction] = useState(null);
  const [dispatchTargetWO, setDispatchTargetWO] = useState(null);
  const [inspectTargetDispatch, setInspectTargetDispatch] = useState(null);

  // Navigation with URL Hash synchronization
  const navigateTo = (tab, woIdOrOpts = null) => {
    const isOptsObj = woIdOrOpts && typeof woIdOrOpts === 'object';
    const nextWoId = isOptsObj ? (woIdOrOpts.woId ?? null) : woIdOrOpts;
    const nextQuoteId = isOptsObj ? (woIdOrOpts.quotationId ?? null) : null;
    const nextQuoteMode = isOptsObj ? (woIdOrOpts.quotationMode ?? 'view') : 'view';

    setActiveTabState(tab);
    setInspectingWOId(nextWoId);
    setInspectingQuotationId(nextQuoteId);
    setQuotationMode(nextQuoteMode);

    const targetHash = getHashForTab(tab, nextWoId, nextQuoteId, nextQuoteMode);
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  };

  // Sync state if user navigates using Browser Back/Forward buttons
  useEffect(() => {
    const handleHashChange = () => {
      const { tab, woId, quotationId, quotationMode: qMode } = parseHash();
      if (currentUser && !canAccessTab(currentUser, tab)) {
        const allowed = getFirstAllowedTab(currentUser);
        navigateTo(allowed);
        return;
      }
      setActiveTabState(tab);
      setInspectingWOId(woId);
      setInspectingQuotationId(quotationId);
      setQuotationMode(qMode);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentUser]);

  // Continuously ensure browser URL hash & SEO page title are synchronized with active tab and route
  useEffect(() => {
    const targetHash = getHashForTab(activeTab, inspectingWOId, inspectingQuotationId, quotationMode);
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }

    const TITLE_MAP = {
      dashboard: 'Dashboard Overview',
      leads: 'Leads Inward & Approval',
      lead_engine: 'Dedicated Lead Creation Engine',
      quotations: 'Commercial Quotations',
      quotation_detail:
        quotationMode === 'create'
          ? 'Create Commercial Quotation'
          : quotationMode === 'edit'
          ? 'Edit Commercial Quotation'
          : 'View Commercial Quotation',
      purchase_orders: 'Customer Sales POs',
      payments: 'Client Payments & Ledger',
      mrp: 'BOM Inventory & Requisitions',
      manufacturing: '5-Level Manufacturing',
      work_order_detail: 'Work Order Details',
      qc: 'Quality Control Gates',
      dispatch: 'Dispatch & Logistics',
      customer_portal: 'Customer Inward QC & RMA',
      tickets: 'Ticketing Engine & RMA Desk',
      audit_reports: 'Audit Reports & Session Logs',
      masters: 'Master Data Hub',
      users_matrix: 'Users & RBAC Matrix',
      inventory_products: 'Inventory — Products & BOM',
      inventory_raw_materials: 'Inventory — Raw Materials & Stock',
      superadmin_users: 'Superadmin — Users',
      superadmin_roles: 'Superadmin — Roles',
      superadmin_permissions: 'Superadmin — Permissions',
      superadmin_access: 'Superadmin — Access Matrix',
      superadmin_city: 'Superadmin — Cities',
      superadmin_state: 'Superadmin — States',
      superadmin_country: 'Superadmin — Countries',
      superadmin_zone: 'Superadmin — Zones',
      superadmin_couriers: 'Superadmin — Couriers',
      superadmin_payment_types: 'Superadmin — Payment Types',
      superadmin_customers: 'Superadmin — Customers'
    };
    const pageTitle = TITLE_MAP[activeTab] || 'Operations';
    document.title = `${pageTitle} | SAR Manufacturing ERP — SAR Software Solutions Pvt. Ltd.`;
  }, [activeTab, inspectingWOId, inspectingQuotationId, quotationMode]);

  const loadInitialData = async () => {
    setIsRefreshing(true);
    try {
      const [rRes, dRes] = await Promise.all([
        api.getRoles(),
        api.getDashboard()
      ]);
      setRoles(rRes.data || []);
      setDashboardSummary(dRes.data || null);

      if (!currentUser && rRes.data?.length > 0) {
        // Default to Admin with full permissions
        const adminPerms = [
          { module: 'leads', action: 'view' }, { module: 'leads', action: 'create' }, { module: 'leads', action: 'approve' },
          { module: 'quotations', action: 'view' }, { module: 'quotations', action: 'create' }, { module: 'quotations', action: 'approve' },
          { module: 'purchase_orders', action: 'view' }, { module: 'purchase_orders', action: 'create' },
          { module: 'payments', action: 'view' }, { module: 'payments', action: 'create' },
          { module: 'inventory', action: 'view' }, { module: 'inventory', action: 'requisition' },
          { module: 'manufacturing', action: 'view' }, { module: 'manufacturing', action: 'start' },
          { module: 'qc', action: 'inspect' },
          { module: 'dispatch', action: 'manage' },
          { module: 'customer_portal', action: 'inspect' }, { module: 'customer_portal', action: 'complain' },
          { module: 'masters', action: 'manage' },
          { module: 'users', action: 'manage' }
        ];

        setCurrentUser({
          id: 1,
          name: 'System Admin',
          email: 'admin@mfg-erp.local',
          role_id: 1,
          role_name: 'Administrator',
          role_slug: 'admin',
          permissions: adminPerms
        });
      }
    } catch (err) {
      console.error('Initialization error:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleRoleChange = async (roleId) => {
    try {
      const res = await api.switchRole(roleId);
      const updatedUser = res.data.user;
      setCurrentUser(updatedUser);

      // Strict Access Enforcement: If current tab is unauthorized, immediately redirect!
      if (!canAccessTab(updatedUser, activeTab)) {
        const allowed = getFirstAllowedTab(updatedUser);
        navigateTo(allowed);
      }
    } catch (err) {
      alert('Failed to switch persona: ' + err.message);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm('Log out current session? This records session logout in audit activity.')) return;
    try {
      if (currentUser?.id) {
        await api.logout(currentUser.id);
      }
      alert('Session logged out successfully.');
      loadInitialData();
    } catch (err) {
      console.error(err);
    }
  };

  // Workflow Handlers
  const handleSelectLeadForQuotation = (lead) => {
    setSelectedLeadForQuote(lead);
    navigateTo('quotation_detail', { quotationMode: 'create' });
  };

  const handleCreateQuotation = () => {
    setSelectedLeadForQuote(null);
    navigateTo('quotation_detail', { quotationMode: 'create' });
  };

  const handleViewQuotation = (quotationId) => {
    navigateTo('quotation_detail', { quotationId, quotationMode: 'view' });
  };

  const handleEditQuotation = (quotationId) => {
    navigateTo('quotation_detail', { quotationId, quotationMode: 'edit' });
  };

  const handleQuotationModeChange = (quotationId, mode) => {
    navigateTo('quotation_detail', { quotationId, quotationMode: mode });
  };

  const handleSelectQuoteForPO = (quote) => {
    setSelectedQuoteForPO(quote);
    navigateTo('purchase_orders');
  };

  const handleCheckMaterialsForPO = (po) => {
    setSelectedPOForAction(po);
    navigateTo('mrp');
  };

  const handleRecordPaymentForPO = (po) => {
    setSelectedPOForAction(po);
    navigateTo('payments');
  };

  const handleViewWorkOrder = (woId) => {
    navigateTo('work_order_detail', woId);
  };

  const handleDispatchReady = (wo) => {
    setDispatchTargetWO(wo);
    navigateTo('dispatch');
  };

  const handleCustomerInspect = (disp) => {
    setInspectTargetDispatch(disp);
    navigateTo('customer_portal');
  };

  const handlePaymentReleased = () => {
    loadInitialData();
    navigateTo('dashboard');
  };

  const handleOpenAudit = (moduleName) => {
    navigateTo('audit_reports');
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-50/70 flex flex-col font-sans text-slate-900 antialiased">
      
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        roles={roles}
        onRoleChange={handleRoleChange}
        onLogout={handleLogout}
        isRefreshing={isRefreshing}
        onRefresh={loadInitialData}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen((v) => !v)}
      />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        
        {/* Left Sidebar (Responsive Drawer on Mobile, Fixed on Desktop) */}
        <Sidebar
          currentUser={currentUser}
          activeTab={
            activeTab === 'work_order_detail'
              ? 'manufacturing'
              : activeTab === 'quotation_detail'
              ? 'quotations'
              : activeTab
          }
          setActiveTab={(tab) => navigateTo(tab)}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
          counts={{
            leads: dashboardSummary?.leads?.pending || 0,
            quotations: dashboardSummary?.quotations?.total || 0,
            pos: dashboardSummary?.purchase_orders?.total || 0,
            payments: dashboardSummary?.finance?.balance_due > 0 ? 1 : 0,
            requisitions: dashboardSummary?.inventory?.low_stock_alerts || 0,
            workOrders: dashboardSummary?.manufacturing?.in_progress || 0,
            qc: dashboardSummary?.manufacturing?.total_units_rejected || 0,
            dispatches: dashboardSummary?.logistics?.in_transit || 0,
            complaints: dashboardSummary?.customer_service?.open_complaints || 0
          }}
        />

        {/* Main Content Pane */}
        <main className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-5 max-w-7xl mx-auto w-full">

          {/* View Components */}
          {activeTab === 'dashboard' && (
            <DashboardView
              currentUser={currentUser}
              summary={dashboardSummary}
              onNavigate={(tab) => navigateTo(tab)}
              onViewWorkOrder={handleViewWorkOrder}
            />
          )}

          {activeTab === 'leads' && canAccessTab(currentUser, 'leads') && (
            <LeadsView
              currentUser={currentUser}
              onSelectForQuotation={handleSelectLeadForQuotation}
              onOpenAudit={handleOpenAudit}
              onOpenLeadEngine={() => navigateTo('lead_engine')}
            />
          )}

          {activeTab === 'lead_engine' && canAccessTab(currentUser, 'lead_engine') && (
            <LeadEngineView
              currentUser={currentUser}
              onBack={() => navigateTo('leads')}
              onSaved={loadInitialData}
            />
          )}

          {activeTab === 'quotations' && canAccessTab(currentUser, 'quotations') && (
            <QuotationsView
              currentUser={currentUser}
              onCreateQuotation={handleCreateQuotation}
              onViewQuotation={handleViewQuotation}
              onEditQuotation={handleEditQuotation}
              onGeneratePO={handleSelectQuoteForPO}
              onOpenAudit={handleOpenAudit}
            />
          )}

          {activeTab === 'quotation_detail' && canAccessTab(currentUser, 'quotations') && (
            <QuotationDetailView
              currentUser={currentUser}
              quotationId={inspectingQuotationId}
              mode={quotationMode}
              preselectedLead={selectedLeadForQuote}
              onBack={() => {
                setSelectedLeadForQuote(null);
                navigateTo('quotations');
              }}
              onNavigateMode={handleQuotationModeChange}
              onGeneratePO={handleSelectQuoteForPO}
              onOpenAudit={handleOpenAudit}
              onSaved={loadInitialData}
            />
          )}

          {activeTab === 'purchase_orders' && canAccessTab(currentUser, 'purchase_orders') && (
            <PurchaseOrdersView
              currentUser={currentUser}
              preselectedQuote={selectedQuoteForPO}
              onCheckMaterials={handleCheckMaterialsForPO}
              onRecordPayment={handleRecordPaymentForPO}
              onOpenAudit={handleOpenAudit}
            />
          )}

          {activeTab === 'payments' && canAccessTab(currentUser, 'payments') && (
            <PaymentsView
              currentUser={currentUser}
              preselectedPO={selectedPOForAction}
              onClearPreselectedPO={() => setSelectedPOForAction(null)}
              onOpenAudit={handleOpenAudit}
            />
          )}

          {(activeTab === 'mrp' || activeTab === 'manufacturing') && canAccessTab(currentUser, activeTab) && (
            <ManufacturingView
              currentUser={currentUser}
              mode={activeTab}
              initialPO={selectedPOForAction}
              onViewWorkOrder={handleViewWorkOrder}
              onOpenAudit={handleOpenAudit}
              onNavigateTab={navigateTo}
            />
          )}

          {activeTab === 'work_order_detail' && canAccessTab(currentUser, 'manufacturing') && (
            <WorkOrderDetailView
              currentUser={currentUser}
              workOrderId={inspectingWOId}
              onBack={() => navigateTo('manufacturing')}
              onDispatchReady={handleDispatchReady}
              onOpenAudit={handleOpenAudit}
            />
          )}

          {activeTab === 'qc' && canAccessTab(currentUser, 'qc') && (
            <QualityControlView
              currentUser={currentUser}
              onInspectWorkOrder={handleViewWorkOrder}
              onOpenAudit={handleOpenAudit}
            />
          )}

          {activeTab === 'dispatch' && canAccessTab(currentUser, 'dispatch') && (
            <DispatchView
              currentUser={currentUser}
              preselectedWorkOrder={dispatchTargetWO}
              onCustomerInspect={handleCustomerInspect}
              onOpenAudit={handleOpenAudit}
            />
          )}

          {activeTab === 'customer_portal' && canAccessTab(currentUser, 'customer_portal') && (
            <CustomerPortalView
              currentUser={currentUser}
              preselectedDispatch={inspectTargetDispatch}
              onPaymentReleased={handlePaymentReleased}
              onOpenAudit={handleOpenAudit}
            />
          )}

          {activeTab === 'tickets' && canAccessTab(currentUser, 'tickets') && (
            <TicketsView currentUser={currentUser} />
          )}

          {activeTab === 'audit_reports' && canAccessTab(currentUser, 'audit_reports') && (
            <AuditReportsView />
          )}

          {activeTab === 'masters' && canAccessTab(currentUser, 'masters') && (
            <MastersView />
          )}

          {activeTab === 'users_matrix' && canAccessTab(currentUser, 'users_matrix') && (
            <UsersMatrixView onOpenAudit={handleOpenAudit} />
          )}

          {activeTab.startsWith('superadmin_') && canAccessTab(currentUser, activeTab) && (
            <SuperadminView section={activeTab} />
          )}

          {(activeTab === 'inventory_products' || activeTab === 'inventory_raw_materials') &&
            canAccessTab(currentUser, activeTab) && <InventoryView section={activeTab} />}

        </main>
      </div>

    </div>
  );
}
