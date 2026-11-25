// client/src/services/api.js

export const APP_BASE =
  typeof window !== 'undefined' && window.location.pathname.startsWith('/manufacturing')
    ? '/manufacturing/'
    : import.meta.env.DEV
      ? '/manufacturing/'
      : '/';

export const API_BASE = `${APP_BASE}api/`;

export function resolveMediaUrl(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  if (/^https?:\/\//i.test(filePath) || filePath.startsWith('data:') || filePath.startsWith('blob:')) {
    return filePath;
  }
  const cleanRelative = filePath.replace(/^\/?(?:manufacturing\/)?/, '');
  return `${APP_BASE}${cleanRelative}`;
}

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
  getRolesList: () => request('users/roles'),
  createRole: (data) => request('users/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRole: (id, data) => request(`users/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRole: (id) => request(`users/roles/${id}`, { method: 'DELETE' }),
  getPermissionsList: () => request('users/permissions'),
  createPermission: (data) => request('users/permissions', { method: 'POST', body: JSON.stringify(data) }),
  updatePermission: (id, data) => request(`users/permissions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePermission: (id) => request(`users/permissions/${id}`, { method: 'DELETE' }),

  // Masters
  getCountries: () => request('masters/countries'),
  createCountry: (data) => request('masters/countries', { method: 'POST', body: JSON.stringify(data) }),
  updateCountry: (id, data) => request(`masters/countries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCountry: (id) => request(`masters/countries/${id}`, { method: 'DELETE' }),
  getStates: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`masters/states${q ? `?${q}` : ''}`);
  },
  createState: (data) => request('masters/states', { method: 'POST', body: JSON.stringify(data) }),
  updateState: (id, data) => request(`masters/states/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteState: (id) => request(`masters/states/${id}`, { method: 'DELETE' }),
  getCities: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`masters/cities${q ? `?${q}` : ''}`);
  },
  createCity: (data) => request('masters/cities', { method: 'POST', body: JSON.stringify(data) }),
  updateCity: (id, data) => request(`masters/cities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCity: (id) => request(`masters/cities/${id}`, { method: 'DELETE' }),
  getZones: () => request('masters/zones'),
  createZone: (data) => request('masters/zones', { method: 'POST', body: JSON.stringify(data) }),
  updateZone: (id, data) => request(`masters/zones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteZone: (id) => request(`masters/zones/${id}`, { method: 'DELETE' }),
  getPaymentTypes: () => request('masters/payment_types'),
  createPaymentType: (data) => request('masters/payment_types', { method: 'POST', body: JSON.stringify(data) }),
  updatePaymentType: (id, data) => request(`masters/payment_types/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePaymentType: (id) => request(`masters/payment_types/${id}`, { method: 'DELETE' }),
  getCouriers: () => request('masters/couriers'),
  createCourier: (data) => request('masters/couriers', { method: 'POST', body: JSON.stringify(data) }),
  updateCourier: (id, data) => request(`masters/couriers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCourier: (id) => request(`masters/couriers/${id}`, { method: 'DELETE' }),
  getCustomers: () => request('masters/customers'),
  createCustomer: (data) => request('masters/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id, data) => request(`masters/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomer: (id) => request(`masters/customers/${id}`, { method: 'DELETE' }),
  getVendors: () => request('masters/vendors'),
  createVendor: (data) => request('masters/vendors', { method: 'POST', body: JSON.stringify(data) }),
  getProducts: () => request('masters/products'),
  createProduct: (data) => request('masters/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id, data) => request(`masters/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (id) => request(`masters/products/${id}`, { method: 'DELETE' }),
  getRawMaterials: () => request('masters/raw_materials'),
  createRawMaterial: (data) => request('masters/raw_materials', { method: 'POST', body: JSON.stringify(data) }),
  updateRawMaterial: (id, data) => request(`masters/raw_materials/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRawMaterial: (id) => request(`masters/raw_materials/${id}`, { method: 'DELETE' }),
  addMaterialStock: (id, quantity) => request('masters/raw_materials/add_stock', { method: 'POST', body: JSON.stringify({ id, quantity }) }),

  // Leads
  getLeads: (status) => request(`leads${status ? `?status=${status}` : ''}`),
  getLead: (id) => request(`leads/${id}`),
  createLead: (data) => request('leads', { method: 'POST', body: JSON.stringify(data) }),
  bulkImportLeads: (data) => request('leads/import', { method: 'POST', body: JSON.stringify(data) }),
  updateLead: (id, data) => request(`leads/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  approveLead: (id, remarks) => request(`leads/approve/${id}`, { method: 'POST', body: JSON.stringify({ remarks }) }),
  rejectLead: (id, remarks) => request(`leads/reject/${id}`, { method: 'POST', body: JSON.stringify({ remarks }) }),

  // Quotations
  getQuotations: (leadId) => request(`quotations${leadId ? `?lead_id=${leadId}` : ''}`),
  getQuotation: (id) => request(`quotations/${id}`),
  getQuotationPdfUrl: (id) => `${API_BASE}quotations/${id}/pdf`,
  getQuotationExcelUrl: (id) => `${API_BASE}quotations/${id}/excel`,
  createQuotation: (data) => request('quotations', { method: 'POST', body: JSON.stringify(data) }),
  updateQuotation: (id, data) => request(`quotations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  approveQuotation: (id) => request(`quotations/approve/${id}`, { method: 'POST' }),
  rejectQuotation: (id, remarks) => request(`quotations/reject/${id}`, { method: 'POST', body: JSON.stringify({ remarks }) }),
  deleteQuotation: (id) => request(`quotations/${id}`, { method: 'DELETE' }),

  // Purchase Orders
  getPurchaseOrders: () => request('purchase_orders'),
  getPurchaseOrder: (id) => request(`purchase_orders/${id}`),
  createPurchaseOrder: (data) => request('purchase_orders', { method: 'POST', body: JSON.stringify(data) }),
  updatePurchaseOrder: (id, data) => request(`purchase_orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePurchaseOrder: (id) => request(`purchase_orders/${id}`, { method: 'DELETE' }),

  // Payments
  getPayments: (poId) => request(`payments${poId ? `?po_id=${poId}` : ''}`),
  getPaymentsLedger: (params = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined))
    ).toString();
    return request(`payments/ledger${q ? `?${q}` : ''}`);
  },
  recordPayment: (data) => request('payments', { method: 'POST', body: JSON.stringify(data) }),
  updatePayment: (id, data) => request(`payments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updatePaymentStatus: (id, data) => request(`payments/${id}/status`, { method: 'POST', body: JSON.stringify(data) }),
  deletePayment: (id) => request(`payments/${id}`, { method: 'DELETE' }),
  settleExcessPayment: (data) => request('payments/settle_excess', { method: 'POST', body: JSON.stringify(data) }),
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
  updateDispatchStatus: (id, status, extra = {}) =>
    request(`dispatch/status/${id}`, { method: 'PUT', body: JSON.stringify({ status, ...extra }) }),

  // Customer Portal & Complaints
  inspectDelivery: (data) => request('customer/inspect', { method: 'POST', body: JSON.stringify(data) }),
  getComplaints: () => request('customer/complaints'),
  createComplaint: (data) => request('customer/complaints', { method: 'POST', body: JSON.stringify(data) }),
  updateComplaint: (id, data) => request(`customer/complaints/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  releaseFinalPayment: (data) => request('customer/release_final_payment', { method: 'POST', body: JSON.stringify(data) }),

  // Dashboard Summary
  getDashboard: (params = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => Boolean(v)))
    ).toString();
    return request(`dashboard${q ? `?${q}` : ''}`);
  },

  // Media Attachments
  getMedia: (entityType, entityId = null) => {
    const q = new URLSearchParams({ entity_type: entityType, ...(entityId ? { entity_id: entityId } : {}) }).toString();
    return request(`media?${q}`);
  },
  uploadMedia: async (entityType, entityId, files, uploadedBy = 1, docLabel = '') => {
    const fd = new FormData();
    fd.append('entity_type', entityType);
    fd.append('entity_id', String(entityId));
    fd.append('uploaded_by', String(uploadedBy));
    if (docLabel) {
      fd.append('doc_label', docLabel);
    }
    Array.from(files).forEach((f) => fd.append('files[]', f));
    const res = await fetch(`${API_BASE}media/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.message || 'Media upload failed');
    }
    return data;
  },
  deleteMedia: (id) => request(`media/${id}`, { method: 'DELETE' })
};
