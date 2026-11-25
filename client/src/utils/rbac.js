// client/src/utils/rbac.js

/**
 * Check if the user has a specific permission (module + action)
 */
export function hasPermission(user, module, action = null) {
  if (!user) return false;
  // Administrator has unrestricted access
  if (user.role_id === 1 || user.role_slug === 'admin') {
    return true;
  }

  const perms = user.permissions || [];
  if (!action) {
    // Check if user has ANY permission for this module
    return perms.some(p => p.module === module);
  }

  return perms.some(p => p.module === module && p.action === action);
}

/**
 * Check if user can access a top-level tab/view
 */
export function canAccessTab(user, tabId) {
  if (!user) return false;
  if (user.role_id === 1 || user.role_slug === 'admin') {
    return true;
  }

  switch (tabId) {
    case 'dashboard':
      return true; // Dashboard KPI view is accessible with filtered context

    case 'leads':
    case 'lead_engine':
      return hasPermission(user, 'leads');

    case 'quotations':
    case 'quotation_detail':
      return hasPermission(user, 'quotations');

    case 'purchase_orders':
    case 'purchase_order_detail':
      return hasPermission(user, 'purchase_orders');

    case 'payments':
    case 'accounting_dashboard':
    case 'accounting_po_balances':
    case 'accounting_advances':
    case 'accounting_customers':
      return hasPermission(user, 'payments') || user.role_slug === 'accounts';

    case 'mrp':
    case 'inventory_products':
    case 'inventory_raw_materials':
      return hasPermission(user, 'inventory') || hasPermission(user, 'manufacturing') || hasPermission(user, 'masters');

    case 'manufacturing':
    case 'work_order_detail':
      return hasPermission(user, 'manufacturing');

    case 'qc':
      return hasPermission(user, 'qc');

    case 'dispatch':
      return hasPermission(user, 'dispatch');

    case 'customer_portal':
    case 'tickets':
      return hasPermission(user, 'customer_portal');

    case 'masters':
      return hasPermission(user, 'masters');

    case 'users_matrix':
      return hasPermission(user, 'users');

    case 'superadmin':
    case 'superadmin_users':
    case 'superadmin_roles':
    case 'superadmin_permissions':
    case 'superadmin_access':
    case 'superadmin_city':
    case 'superadmin_state':
    case 'superadmin_country':
    case 'superadmin_zone':
    case 'superadmin_couriers':
    case 'superadmin_payment_types':
    case 'superadmin_customers':
      return hasPermission(user, 'users') || hasPermission(user, 'masters');

    case 'audit_reports':
      // Admin, QC, Accounts, or any role with audit access
      return user.role_id === 1 || user.role_slug === 'admin' || user.role_slug === 'qc' || user.role_slug === 'accounts';

    default:
      return false;
  }
}

/**
 * Returns the first tab this user is authorized to view
 */
export function getFirstAllowedTab(user) {
  const tabsInPriority = [
    'dashboard',
    'leads',
    'quotations',
    'purchase_orders',
    'accounting_dashboard',
    'payments',
    'accounting_po_balances',
    'accounting_advances',
    'accounting_customers',
    'mrp',
    'manufacturing',
    'qc',
    'dispatch',
    'customer_portal',
    'masters',
    'users_matrix',
    'audit_reports'
  ];

  for (const tab of tabsInPriority) {
    if (canAccessTab(user, tab)) {
      return tab;
    }
  }
  return 'dashboard';
}
