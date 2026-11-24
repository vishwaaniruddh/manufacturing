// client/src/App.jsx
import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import PipelineTracker from './components/PipelineTracker';

// Views
import DashboardView from './views/DashboardView';
import LeadsView from './views/LeadsView';
import QuotationsView from './views/QuotationsView';
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

import { api } from './services/api';
import { canAccessTab, getFirstAllowedTab } from './utils/rbac';

const TAB_TO_ROUTE = {
  dashboard: 'dashboard',
  leads: 'leads',
  quotations: 'quotations',
  purchase_orders: 'purchase-orders',
  payments: 'payments',
  mrp: 'inventory-mrp',
  manufacturing: 'manufacturing',
  work_order_detail: 'manufacturing/wo',
  qc: 'quality-control',
  dispatch: 'dispatch',
  customer_portal: 'customer-portal',
  audit_reports: 'audit-reports',
  masters: 'masters',
  users_matrix: 'users-matrix'
};

const ROUTE_TO_TAB = {
  'dashboard': 'dashboard',
  'leads': 'leads',
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
  'audit-reports': 'audit_reports',
  'audit': 'audit_reports',
  'masters': 'masters',
  'users-matrix': 'users_matrix',
  'users': 'users_matrix'
};

const getHashForTab = (tab, woId = null) => {
  if (tab === 'work_order_detail' && woId) {
    return `#/manufacturing/wo/${woId}`;
  }
  const route = TAB_TO_ROUTE[tab] || 'dashboard';
  return `#/${route}`;
};

const parseHash = () => {
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  if (!hash) return { tab: 'dashboard', woId: null };

  if (hash.startsWith('manufacturing/wo/')) {
    const parts = hash.split('/');
    const woId = parseInt(parts[2], 10) || null;
    return { tab: 'work_order_detail', woId };
  }

  const clean = hash.split('?')[0].replace(/\/+$/, '');
  const tab = ROUTE_TO_TAB[clean] || 'dashboard';
  return { tab, woId: null };
};

export default function App() {
  const initialRoute = parseHash();
  const [activeTab, setActiveTabState] = useState(initialRoute.tab);
  const [inspectingWOId, setInspectingWOId] = useState(initialRoute.woId);
  const [currentUser, setCurrentUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Workflow handover context
  const [selectedLeadForQuote, setSelectedLeadForQuote] = useState(null);
  const [selectedQuoteForPO, setSelectedQuoteForPO] = useState(null);
  const [selectedPOForAction, setSelectedPOForAction] = useState(null);
  const [dispatchTargetWO, setDispatchTargetWO] = useState(null);
  const [inspectTargetDispatch, setInspectTargetDispatch] = useState(null);

  // Navigation with URL Hash synchronization
  const navigateTo = (tab, woId = null) => {
    setActiveTabState(tab);
    setInspectingWOId(woId);
    const targetHash = getHashForTab(tab, woId);
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  };

  // Sync state if user navigates using Browser Back/Forward buttons
  useEffect(() => {
    const handleHashChange = () => {
      const { tab, woId } = parseHash();
      if (currentUser && !canAccessTab(currentUser, tab)) {
        const allowed = getFirstAllowedTab(currentUser);
        navigateTo(allowed);
        return;
      }
      setActiveTabState(tab);
      setInspectingWOId(woId);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentUser]);

  // Continuously ensure browser URL hash is synchronized with active tab and route
  useEffect(() => {
    const targetHash = getHashForTab(activeTab, inspectingWOId);
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }, [activeTab, inspectingWOId]);

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
    navigateTo('quotations');
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
    <div className="min-h-screen bg-slate-50/70 flex flex-col font-sans text-slate-900 antialiased">
      
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        roles={roles}
        onRoleChange={handleRoleChange}
        onLogout={handleLogout}
        isRefreshing={isRefreshing}
        onRefresh={loadInitialData}
      />

      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar (Filtered strictly by Role Permissions!) */}
        <Sidebar
          currentUser={currentUser}
          activeTab={activeTab === 'work_order_detail' ? 'manufacturing' : activeTab}
          setActiveTab={(tab) => navigateTo(tab)}
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
        <main className="flex-1 overflow-y-auto p-3 sm:p-5 max-w-7xl mx-auto w-full">
          
          {/* Visual Workflow Stepper (Filtered strictly by Role Permissions!) */}
          <PipelineTracker
            currentUser={currentUser}
            activeTab={activeTab}
            onSelectStage={(tab) => navigateTo(tab)}
          />

          {/* View Components */}
          {activeTab === 'dashboard' && (
            <DashboardView
              currentUser={currentUser}
              summary={dashboardSummary}
              onNavigate={(tab) => navigateTo(tab)}
            />
          )}

          {activeTab === 'leads' && canAccessTab(currentUser, 'leads') && (
            <LeadsView
              currentUser={currentUser}
              onSelectForQuotation={handleSelectLeadForQuotation}
              onOpenAudit={handleOpenAudit}
            />
          )}

          {activeTab === 'quotations' && canAccessTab(currentUser, 'quotations') && (
            <QuotationsView
              currentUser={currentUser}
              preselectedLead={selectedLeadForQuote}
              onGeneratePO={handleSelectQuoteForPO}
              onOpenAudit={handleOpenAudit}
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
              onOpenAudit={handleOpenAudit}
            />
          )}

          {(activeTab === 'mrp' || activeTab === 'manufacturing') && canAccessTab(currentUser, 'manufacturing') && (
            <ManufacturingView
              currentUser={currentUser}
              initialPO={selectedPOForAction}
              onViewWorkOrder={handleViewWorkOrder}
              onOpenAudit={handleOpenAudit}
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

          {activeTab === 'audit_reports' && canAccessTab(currentUser, 'audit_reports') && (
            <AuditReportsView />
          )}

          {activeTab === 'masters' && canAccessTab(currentUser, 'masters') && (
            <MastersView />
          )}

          {activeTab === 'users_matrix' && canAccessTab(currentUser, 'users_matrix') && (
            <UsersMatrixView onOpenAudit={handleOpenAudit} />
          )}

        </main>
      </div>

    </div>
  );
}
