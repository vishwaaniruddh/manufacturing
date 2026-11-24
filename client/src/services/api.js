// client/src/services/api.js

const API_BASE = '/manufacturing/api/';

export async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.message || 'API request failed');
    }
    return data;
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err);
    throw err;
  }
}

export const api = {
  // Auth & Roles
  login: (creds) => request('auth/login', { method: 'POST', body: JSON.stringify(creds) }),
  switchRole: (roleId) => request('auth/switch_role', { method: 'POST', body: JSON.stringify({ role_id: roleId }) }),
  logout: (userId) => request('auth/logout', { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  getRoles: () => request('auth/roles'),

  // Audit Logs & Login Activity
  getAuditLogs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`audit${query ? `&${query}` : ''}`);
  },
  getLoginActivities: () => request('audit/logins'),

  // Users & Matrix
  getUsers: () => request('users'),
  createUser: (data) => request('users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id) => request(`users/${id}`, { method: 'DELETE' }),
  getPermissionMatrix: () => request('users/matrix'),
  updatePermissionMatrix: (roleId, permissionIds) => request('users/matrix', { method: 'POST', body: JSON.stringify({ role_id: roleId, permission_ids: permissionIds }) }),

  // Masters
  getCountries: () => request('masters/countries'),
  createCountry: (data) => request('masters/countries', { method: 'POST', body: JSON.stringify(data) }),
  getStates: () => request('masters/states'),
  createState: (data) => request('masters/states', { method: 'POST', body: JSON.stringify(data) }),
  getCities: () => request('masters/cities'),
  createCity: (data) => request('masters/cities', { method: 'POST', body: JSON.stringify(data) }),
  getCouriers: () => request('masters/couriers'),
  createCourier: (data) => request('masters/couriers', { method: 'POST', body: JSON.stringify(data) }),
  getCustomers: () => request('masters/customers'),
  createCustomer: (data) => request('masters/customers', { method: 'POST', body: JSON.stringify(data) }),
  getVendors: () => request('masters/vendors'),
  createVendor: (data) => request('masters/vendors', { method: 'POST', body: JSON.stringify(data) }),
  getProducts: () => request('masters/products'),
  createProduct: (data) => request('masters/products', { method: 'POST', body: JSON.stringify(data) }),
  getRawMaterials: () => request('masters/raw_materials'),
  createRawMaterial: (data) => request('masters/raw_materials', { method: 'POST', body: JSON.stringify(data) }),
  addMaterialStock: (id, quantity) => request('masters/raw_materials/add_stock', { method: 'POST', body: JSON.stringify({ id, quantity }) }),

  // Leads
  getLeads: (status) => request(`leads${status ? `?status=${status}` : ''}`),
  getLead: (id) => request(`leads/${id}`),
  createLead: (data) => request('leads', { method: 'POST', body: JSON.stringify(data) }),
  updateLead: (id, data) => request(`leads/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  approveLead: (id, remarks) => request(`leads/approve/${id}`, { method: 'POST', body: JSON.stringify({ remarks }) }),
  rejectLead: (id, remarks) => request(`leads/reject/${id}`, { method: 'POST', body: JSON.stringify({ remarks }) }),

  // Quotations
  getQuotations: (leadId) => request(`quotations${leadId ? `?lead_id=${leadId}` : ''}`),
  getQuotation: (id) => request(`quotations/${id}`),
  createQuotation: (data) => request('quotations', { method: 'POST', body: JSON.stringify(data) }),
  updateQuotation: (id, data) => request(`quotations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  approveQuotation: (id) => request(`quotations/approve/${id}`, { method: 'POST' }),
  rejectQuotation: (id, remarks) => request(`quotations/reject/${id}`, { method: 'POST', body: JSON.stringify({ remarks }) }),
  deleteQuotation: (id) => request(`quotations/${id}`, { method: 'DELETE' }),

  // Purchase Orders
  getPurchaseOrders: () => request('purchase_orders'),
  getPurchaseOrder: (id) => request(`purchase_orders/${id}`),
  createPurchaseOrder: (data) => request('purchase_orders', { method: 'POST', body: JSON.stringify(data) }),

  // Payments
  getPayments: (poId) => request(`payments${poId ? `?po_id=${poId}` : ''}`),
  recordPayment: (data) => request('payments', { method: 'POST', body: JSON.stringify(data) }),
  getPaymentSummary: (poId) => request(`payments/summary/${poId}`),

  // Manufacturing & MRP
  checkMaterials: (data) => request('manufacturing/check_materials', { method: 'POST', body: JSON.stringify(data) }),
  createRequisition: (data) => request('manufacturing/requisitions', { method: 'POST', body: JSON.stringify(data) }),
  getRequisitions: () => request('manufacturing/requisitions'),
  fulfillRequisition: (id) => request(`manufacturing/requisitions/${id}/fulfill`, { method: 'POST' }),
  getWorkOrders: () => request('manufacturing/work_orders'),
  getWorkOrder: (id) => request(`manufacturing/work_orders/${id}`),
  startWorkOrder: (data) => request('manufacturing/work_orders', { method: 'POST', body: JSON.stringify(data) }),

  // Quality Control
  getInspections: (woId) => request(`qc/inspections${woId ? `?work_order_id=${woId}` : ''}`),
  verifyStageQC: (data) => request('qc/verify', { method: 'POST', body: JSON.stringify(data) }),

  // Dispatch & Logistics
  getDispatches: () => request('dispatch'),
  createDispatch: (data) => request('dispatch', { method: 'POST', body: JSON.stringify(data) }),
  updateDispatchStatus: (id, status) => request(`dispatch/status/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),

  // Customer Portal & Complaints
  inspectDelivery: (data) => request('customer/inspect', { method: 'POST', body: JSON.stringify(data) }),
  getComplaints: () => request('customer/complaints'),
  updateComplaint: (id, data) => request(`customer/complaints/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  releaseFinalPayment: (data) => request('customer/release_final_payment', { method: 'POST', body: JSON.stringify(data) }),

  // Dashboard Summary
  getDashboard: () => request('dashboard')
};
