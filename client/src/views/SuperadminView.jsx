// client/src/views/SuperadminView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  Plus,
  Edit3,
  Trash2,
  Search,
  Save,
  Shield,
  X,
  Download
} from 'lucide-react';
import Pagination, { usePagination } from '../components/Pagination';
import { exportToCsv } from '../utils/exportCsv';

const SECTION_META = {
  superadmin_users: { title: 'Users Directory', subtitle: 'Manage system user accounts and role assignments.' },
  superadmin_roles: { title: 'Roles Master', subtitle: 'Define organizational roles and security personas.' },
  superadmin_permissions: { title: 'Permissions Master', subtitle: 'Manage granular module and action permissions.' },
  superadmin_access: { title: 'Access Control Matrix', subtitle: 'Assign permissions to each role.' },
  superadmin_city: { title: 'Cities Master (World Data)', subtitle: 'State-wise world cities directory.' },
  superadmin_state: { title: 'States Master (World Data)', subtitle: 'Country-wise world states & provinces.' },
  superadmin_country: { title: 'Countries Master (World Data)', subtitle: 'All world countries with ISO & dial codes.' },
  superadmin_zone: { title: 'Zones Master', subtitle: 'Manage regional operational & logistics zones.' },
  superadmin_couriers: { title: 'Couriers Master', subtitle: 'Manage shipping carriers and tracking templates.' },
  superadmin_payment_types: { title: 'Payment Types Master', subtitle: 'Configured payment types used in Payment Capture dropdown.' },
  superadmin_customers: { title: 'Customers Master', subtitle: 'Manage client accounts, GST, and location details.' }
};

export default function SuperadminView({ section = 'superadmin_users' }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Reference datasets
  const [roles, setRoles] = useState([]);
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [citiesForForm, setCitiesForForm] = useState([]);

  // Location filters for City / State tabs
  const [filterCountryId, setFilterCountryId] = useState('');
  const [filterStateId, setFilterStateId] = useState('');

  // Access Matrix state
  const [matrixPerms, setMatrixPerms] = useState([]);
  const [matrixMap, setMatrixMap] = useState({});
  const [selectedRoleId, setSelectedRoleId] = useState(1);
  const [savingMatrix, setSavingMatrix] = useState(false);

  // Modal CRUD state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formState, setFormState] = useState({});

  const loadSectionData = async () => {
    setLoading(true);
    try {
      if (section === 'superadmin_users') {
        const [uRes, rRes] = await Promise.all([api.getUsers(), api.getRolesList()]);
        setRows(uRes.data || []);
        setRoles(rRes.data || []);
      } else if (section === 'superadmin_roles') {
        const res = await api.getRolesList();
        setRows(res.data || []);
      } else if (section === 'superadmin_permissions') {
        const res = await api.getPermissionsList();
        setRows(res.data || []);
      } else if (section === 'superadmin_access') {
        const res = await api.getPermissionMatrix();
        setRoles(res.data?.roles || []);
        setMatrixPerms(res.data?.permissions || []);
        setMatrixMap(res.data?.matrix || {});
      } else if (section === 'superadmin_country') {
        const res = await api.getCountries();
        setRows(res.data || []);
      } else if (section === 'superadmin_state') {
        const [cRes, sRes] = await Promise.all([
          api.getCountries(),
          api.getStates({
            ...(filterCountryId ? { country_id: filterCountryId } : {}),
            ...(searchQuery ? { search: searchQuery } : {})
          })
        ]);
        setCountries(cRes.data || []);
        setRows(sRes.data || []);
      } else if (section === 'superadmin_city') {
        const [cRes, sRes, ctRes] = await Promise.all([
          api.getCountries(),
          filterCountryId ? api.getStates({ country_id: filterCountryId }) : Promise.resolve({ data: [] }),
          api.getCities({
            ...(filterCountryId ? { country_id: filterCountryId } : {}),
            ...(filterStateId ? { state_id: filterStateId } : {}),
            ...(searchQuery ? { search: searchQuery } : {})
          })
        ]);
        setCountries(cRes.data || []);
        setStates(sRes.data || []);
        setRows(ctRes.data || []);
      } else if (section === 'superadmin_zone') {
        const res = await api.getZones();
        setRows(res.data || []);
      } else if (section === 'superadmin_couriers') {
        const res = await api.getCouriers();
        setRows(res.data || []);
      } else if (section === 'superadmin_payment_types') {
        const res = await api.getPaymentTypes();
        setRows(res.data || []);
      } else if (section === 'superadmin_customers') {
        const [custRes, cRes] = await Promise.all([api.getCustomers(), api.getCountries()]);
        setRows(custRes.data || []);
        setCountries(cRes.data || []);
      }
    } catch (err) {
      alert('Failed to load Superadmin data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSearchQuery('');
    setFilterCountryId('');
    setFilterStateId('');
    setShowModal(false);
  }, [section]);

  useEffect(() => {
    loadSectionData();
  }, [section, filterCountryId, filterStateId]);

  const filteredRows = rows.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return Object.values(r).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q));
  });

  const pagination = usePagination(filteredRows, 10);

  const openCreateModal = async () => {
    setEditingId(null);
    if (section === 'superadmin_users') {
      setFormState({ name: '', email: '', phone: '', password: 'password123', role_id: roles[0]?.id || 2, status: 'active' });
    } else if (section === 'superadmin_roles') {
      setFormState({ name: '', slug: '', description: '' });
    } else if (section === 'superadmin_permissions') {
      setFormState({ module: '', action: '', description: '' });
    } else if (section === 'superadmin_country') {
      setFormState({ name: '', code: '', phone_code: '', status: 'active' });
    } else if (section === 'superadmin_state') {
      setFormState({ country_id: filterCountryId || countries[0]?.id || '', name: '', code: '', status: 'active' });
    } else if (section === 'superadmin_city') {
      setFormState({ country_id: filterCountryId || '', state_id: filterStateId || '', name: '', status: 'active' });
      if (filterCountryId) {
        const sRes = await api.getStates({ country_id: filterCountryId });
        setStates(sRes.data || []);
      }
    } else if (section === 'superadmin_zone') {
      setFormState({ name: '', code: '', description: '', status: 'active' });
    } else if (section === 'superadmin_couriers') {
      setFormState({ name: '', code: '', contact_person: '', phone: '', email: '', tracking_url_template: '', status: 'active' });
    } else if (section === 'superadmin_payment_types') {
      setFormState({ name: '', code: '', description: '', status: 'active' });
    } else if (section === 'superadmin_customers') {
      setFormState({
        company_name: '',
        contact_person: '',
        email: '',
        phone: '',
        gst_number: '',
        address: '',
        country_id: '',
        state_id: '',
        city_id: '',
        pincode: '',
        status: 'active'
      });
      setStates([]);
      setCitiesForForm([]);
    }
    setShowModal(true);
  };

  const openEditModal = async (row) => {
    setEditingId(row.id);
    if (section === 'superadmin_users') {
      setFormState({ name: row.name, email: row.email, phone: row.phone || '', password: '', role_id: row.role_id, status: row.status });
    } else if (section === 'superadmin_customers') {
      setFormState({ ...row, country_id: row.country_id || '', state_id: row.state_id || '', city_id: row.city_id || '' });
      if (row.country_id) {
        const sRes = await api.getStates({ country_id: row.country_id });
        setStates(sRes.data || []);
      }
      if (row.state_id) {
        const ctRes = await api.getCities({ state_id: row.state_id });
        setCitiesForForm(ctRes.data || []);
      }
    } else if (section === 'superadmin_city') {
      setFormState({ ...row, country_id: row.country_id || '' });
      if (row.country_id) {
        const sRes = await api.getStates({ country_id: row.country_id });
        setStates(sRes.data || []);
      }
    } else {
      setFormState({ ...row });
    }
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (section === 'superadmin_users') {
        editingId ? await api.updateUser(editingId, formState) : await api.createUser(formState);
      } else if (section === 'superadmin_roles') {
        editingId ? await api.updateRole(editingId, formState) : await api.createRole(formState);
      } else if (section === 'superadmin_permissions') {
        editingId ? await api.updatePermission(editingId, formState) : await api.createPermission(formState);
      } else if (section === 'superadmin_country') {
        editingId ? await api.updateCountry(editingId, formState) : await api.createCountry(formState);
      } else if (section === 'superadmin_state') {
        editingId ? await api.updateState(editingId, formState) : await api.createState(formState);
      } else if (section === 'superadmin_city') {
        editingId ? await api.updateCity(editingId, formState) : await api.createCity(formState);
      } else if (section === 'superadmin_zone') {
        editingId ? await api.updateZone(editingId, formState) : await api.createZone(formState);
      } else if (section === 'superadmin_couriers') {
        editingId ? await api.updateCourier(editingId, formState) : await api.createCourier(formState);
      } else if (section === 'superadmin_payment_types') {
        editingId ? await api.updatePaymentType(editingId, formState) : await api.createPaymentType(formState);
      } else if (section === 'superadmin_customers') {
        editingId ? await api.updateCustomer(editingId, formState) : await api.createCustomer(formState);
      }
      setShowModal(false);
      loadSectionData();
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this record?')) return;
    try {
      if (section === 'superadmin_users') await api.deleteUser(id);
      else if (section === 'superadmin_roles') await api.deleteRole(id);
      else if (section === 'superadmin_permissions') await api.deletePermission(id);
      else if (section === 'superadmin_country') await api.deleteCountry(id);
      else if (section === 'superadmin_state') await api.deleteState(id);
      else if (section === 'superadmin_city') await api.deleteCity(id);
      else if (section === 'superadmin_zone') await api.deleteZone(id);
      else if (section === 'superadmin_couriers') await api.deleteCourier(id);
      else if (section === 'superadmin_payment_types') await api.deletePaymentType(id);
      else if (section === 'superadmin_customers') await api.deleteCustomer(id);
      loadSectionData();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const togglePerm = (roleId, permId) => {
    const key = `${roleId}_${permId}`;
    setMatrixMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveMatrix = async () => {
    setSavingMatrix(true);
    try {
      const activeIds = matrixPerms
        .filter((p) => matrixMap[`${selectedRoleId}_${p.id}`])
        .map((p) => p.id);
      await api.updatePermissionMatrix(selectedRoleId, activeIds);
      alert('Access permissions updated.');
    } catch (err) {
      alert('Failed to update access matrix: ' + err.message);
    } finally {
      setSavingMatrix(false);
    }
  };

  const meta = SECTION_META[section] || { title: 'Superadmin', subtitle: '' };

  const groupedPermissions = matrixPerms.reduce((acc, p) => {
    acc[p.module] = acc[p.module] || [];
    acc[p.module].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-3.5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">{meta.title}</h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
              Superadmin
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{meta.subtitle}</p>
        </div>

        {section !== 'superadmin_access' && (
          <button
            type="button"
            onClick={openCreateModal}
            className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium text-xs shadow-xs flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Add New
          </button>
        )}
      </div>

      {/* Filters Bar */}
      {section !== 'superadmin_access' && (
        <div className="flex flex-wrap items-center gap-2 bg-white p-2.5 rounded-lg border border-slate-200/90 shadow-xs">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (section === 'superadmin_city' || section === 'superadmin_state')) {
                  loadSectionData();
                }
              }}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:ring-1 focus:ring-slate-900"
            />
          </div>

          {(section === 'superadmin_state' || section === 'superadmin_city') && (
            <select
              value={filterCountryId}
              onChange={(e) => {
                setFilterCountryId(e.target.value);
                setFilterStateId('');
              }}
              className="p-1.5 text-xs border border-slate-200 rounded-md bg-white max-w-xs"
            >
              <option value="">All Countries</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          )}

          {section === 'superadmin_city' && (
            <select
              value={filterStateId}
              onChange={(e) => setFilterStateId(e.target.value)}
              disabled={!filterCountryId}
              className="p-1.5 text-xs border border-slate-200 rounded-md bg-white max-w-xs disabled:opacity-50"
            >
              <option value="">{filterCountryId ? 'All States in Country' : 'Select Country first'}</option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          {(section === 'superadmin_state' || section === 'superadmin_city') && (
            <button
              type="button"
              onClick={loadSectionData}
              className="h-8 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md text-xs font-medium"
            >
              Search DB
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const keys = filteredRows.length > 0 ? Object.keys(filteredRows[0]) : [];
              exportToCsv(
                section,
                keys.map((k) => ({ header: k, accessor: k })),
                filteredRows
              );
            }}
            title="Export filtered records"
            className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs ml-auto"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        </div>
      )}

      {/* ACCESS MATRIX VIEW */}
      {section === 'superadmin_access' ? (
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRoleId(r.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    selectedRoleId === r.id
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleSaveMatrix}
              disabled={savingMatrix}
              className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-medium flex items-center gap-1.5"
            >
              <Save className="h-3.5 w-3.5" /> {savingMatrix ? 'Saving...' : 'Save Access'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(groupedPermissions).map(([mod, perms]) => (
              <div key={mod} className="border border-slate-200 rounded-md p-3 space-y-2 bg-slate-50/40">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 uppercase tracking-wider">
                  <Shield className="h-3.5 w-3.5 text-slate-500" />
                  {mod.replace('_', ' ')}
                </div>
                <div className="space-y-1">
                  {perms.map((p) => {
                    const checked = !!matrixMap[`${selectedRoleId}_${p.id}`];
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePerm(selectedRoleId, p.id)}
                          className="rounded border-slate-300"
                        />
                        <span className="font-medium capitalize">{p.action}</span>
                        {p.description && <span className="text-[10px] text-slate-400 truncate">({p.description})</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* DATA TABLE */
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading records...</div>
          ) : pagination.totalItems === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">No records found.</div>
          ) : (
            <>
              <div className="px-3.5 py-2 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                <span>Total Records: <strong className="text-slate-800">{pagination.totalItems}</strong></span>
                <span>Page {pagination.currentPage} of {pagination.totalPages}</span>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                  <tr>
                    <th className="px-3 py-2.5 w-10 text-center">#</th>
                    {section === 'superadmin_users' && (
                      <>
                        <th className="px-3.5 py-2.5">Name & Email</th>
                        <th className="px-3.5 py-2.5">Phone</th>
                        <th className="px-3.5 py-2.5">Role</th>
                        <th className="px-3.5 py-2.5">Status</th>
                      </>
                    )}
                    {section === 'superadmin_roles' && (
                      <>
                        <th className="px-3.5 py-2.5">Role Name</th>
                        <th className="px-3.5 py-2.5">Slug</th>
                        <th className="px-3.5 py-2.5">Description</th>
                        <th className="px-3.5 py-2.5 text-center">Users</th>
                      </>
                    )}
                    {section === 'superadmin_permissions' && (
                      <>
                        <th className="px-3.5 py-2.5">Module</th>
                        <th className="px-3.5 py-2.5">Action</th>
                        <th className="px-3.5 py-2.5">Description</th>
                      </>
                    )}
                    {section === 'superadmin_country' && (
                      <>
                        <th className="px-3.5 py-2.5">Country Name</th>
                        <th className="px-3.5 py-2.5">ISO Code</th>
                        <th className="px-3.5 py-2.5">Phone Code</th>
                        <th className="px-3.5 py-2.5">Status</th>
                      </>
                    )}
                    {section === 'superadmin_state' && (
                      <>
                        <th className="px-3.5 py-2.5">State Name</th>
                        <th className="px-3.5 py-2.5">Code</th>
                        <th className="px-3.5 py-2.5">Country</th>
                        <th className="px-3.5 py-2.5">Status</th>
                      </>
                    )}
                    {section === 'superadmin_city' && (
                      <>
                        <th className="px-3.5 py-2.5">City Name</th>
                        <th className="px-3.5 py-2.5">State</th>
                        <th className="px-3.5 py-2.5">Country</th>
                        <th className="px-3.5 py-2.5">Status</th>
                      </>
                    )}
                    {section === 'superadmin_zone' && (
                      <>
                        <th className="px-3.5 py-2.5">Zone Name</th>
                        <th className="px-3.5 py-2.5">Code</th>
                        <th className="px-3.5 py-2.5">Description</th>
                        <th className="px-3.5 py-2.5">Status</th>
                      </>
                    )}
                    {section === 'superadmin_couriers' && (
                      <>
                        <th className="px-3.5 py-2.5">Courier & Code</th>
                        <th className="px-3.5 py-2.5">Contact & Phone</th>
                        <th className="px-3.5 py-2.5">Tracking URL</th>
                        <th className="px-3.5 py-2.5">Status</th>
                      </>
                    )}
                    {section === 'superadmin_payment_types' && (
                      <>
                        <th className="px-3.5 py-2.5">Payment Type</th>
                        <th className="px-3.5 py-2.5">Code</th>
                        <th className="px-3.5 py-2.5">Description</th>
                        <th className="px-3.5 py-2.5">Status</th>
                      </>
                    )}
                    {section === 'superadmin_customers' && (
                      <>
                        <th className="px-3.5 py-2.5">Company & Contact</th>
                        <th className="px-3.5 py-2.5">Email & Phone</th>
                        <th className="px-3.5 py-2.5">GST #</th>
                        <th className="px-3.5 py-2.5">Location</th>
                        <th className="px-3.5 py-2.5">Status</th>
                      </>
                    )}
                    <th className="px-3.5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagination.paginatedItems.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">
                        {pagination.startIndex + idx + 1}
                      </td>

                      {section === 'superadmin_users' && (
                        <>
                          <td className="px-3.5 py-2">
                            <p className="font-semibold text-slate-900">{row.name}</p>
                            <p className="text-[10px] font-mono text-slate-400">{row.email}</p>
                          </td>
                          <td className="px-3.5 py-2 font-mono text-slate-600">{row.phone || '—'}</td>
                          <td className="px-3.5 py-2">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">{row.role_name}</span>
                          </td>
                          <td className="px-3.5 py-2 uppercase text-[10px] font-semibold text-emerald-700">{row.status}</td>
                        </>
                      )}

                      {section === 'superadmin_roles' && (
                        <>
                          <td className="px-3.5 py-2 font-semibold text-slate-900">{row.name}</td>
                          <td className="px-3.5 py-2 font-mono text-slate-600">{row.slug}</td>
                          <td className="px-3.5 py-2 text-slate-600">{row.description || '—'}</td>
                          <td className="px-3.5 py-2 text-center font-semibold">{row.user_count ?? 0}</td>
                        </>
                      )}

                      {section === 'superadmin_permissions' && (
                        <>
                          <td className="px-3.5 py-2 font-semibold text-slate-900 capitalize">{row.module}</td>
                          <td className="px-3.5 py-2 font-mono text-slate-700">{row.action}</td>
                          <td className="px-3.5 py-2 text-slate-600">{row.description || '—'}</td>
                        </>
                      )}

                      {section === 'superadmin_country' && (
                        <>
                          <td className="px-3.5 py-2 font-semibold text-slate-900">{row.name}</td>
                          <td className="px-3.5 py-2 font-mono text-slate-700">{row.code}</td>
                          <td className="px-3.5 py-2 font-mono text-slate-600">{row.phone_code || '—'}</td>
                          <td className="px-3.5 py-2 uppercase text-[10px] font-semibold text-emerald-700">{row.status}</td>
                        </>
                      )}

                      {section === 'superadmin_state' && (
                        <>
                          <td className="px-3.5 py-2 font-semibold text-slate-900">{row.name}</td>
                          <td className="px-3.5 py-2 font-mono text-slate-600">{row.code || '—'}</td>
                          <td className="px-3.5 py-2 text-slate-700">{row.country_name}</td>
                          <td className="px-3.5 py-2 uppercase text-[10px] font-semibold text-emerald-700">{row.status}</td>
                        </>
                      )}

                      {section === 'superadmin_city' && (
                        <>
                          <td className="px-3.5 py-2 font-semibold text-slate-900">{row.name}</td>
                          <td className="px-3.5 py-2 text-slate-700">{row.state_name}</td>
                          <td className="px-3.5 py-2 text-slate-600">{row.country_name}</td>
                          <td className="px-3.5 py-2 uppercase text-[10px] font-semibold text-emerald-700">{row.status}</td>
                        </>
                      )}

                      {section === 'superadmin_zone' && (
                        <>
                          <td className="px-3.5 py-2 font-semibold text-slate-900">{row.name}</td>
                          <td className="px-3.5 py-2 font-mono text-slate-700">{row.code}</td>
                          <td className="px-3.5 py-2 text-slate-600">{row.description || '—'}</td>
                          <td className="px-3.5 py-2 uppercase text-[10px] font-semibold text-emerald-700">{row.status}</td>
                        </>
                      )}

                      {section === 'superadmin_couriers' && (
                        <>
                          <td className="px-3.5 py-2 font-semibold text-slate-900">{row.name} ({row.code})</td>
                          <td className="px-3.5 py-2 text-slate-600">{row.contact_person || '—'} • {row.phone || '—'}</td>
                          <td className="px-3.5 py-2 font-mono text-[10px] text-slate-400 max-w-xs truncate">{row.tracking_url_template || '—'}</td>
                          <td className="px-3.5 py-2 uppercase text-[10px] font-semibold text-emerald-700">{row.status}</td>
                        </>
                      )}

                      {section === 'superadmin_payment_types' && (
                        <>
                          <td className="px-3.5 py-2 font-semibold text-slate-900">{row.name}</td>
                          <td className="px-3.5 py-2 font-mono text-slate-700">{row.code}</td>
                          <td className="px-3.5 py-2 text-slate-600">{row.description || '—'}</td>
                          <td className="px-3.5 py-2 uppercase text-[10px] font-semibold text-emerald-700">{row.status}</td>
                        </>
                      )}

                      {section === 'superadmin_customers' && (
                        <>
                          <td className="px-3.5 py-2">
                            <p className="font-semibold text-slate-900">{row.company_name}</p>
                            <p className="text-[10px] text-slate-400">{row.contact_person}</p>
                          </td>
                          <td className="px-3.5 py-2 whitespace-nowrap">
                            <p className="text-slate-800">{row.email}</p>
                            <p className="text-[10px] text-slate-400">{row.phone}</p>
                          </td>
                          <td className="px-3.5 py-2 font-mono text-[11px]">{row.gst_number || '—'}</td>
                          <td className="px-3.5 py-2 text-[11px] text-slate-600">
                            {[row.city_name, row.state_name, row.country_name].filter(Boolean).join(', ') || row.address || '—'}
                          </td>
                          <td className="px-3.5 py-2 uppercase text-[10px] font-semibold text-emerald-700">{row.status}</td>
                        </>
                      )}

                      <td className="px-3.5 py-2 text-right whitespace-nowrap space-x-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
                          title="Edit"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}

          {!loading && (
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setCurrentPage}
            />
          )}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-md w-full p-4 shadow-lg border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h2 className="text-sm font-semibold text-slate-900">
                {editingId ? 'Edit Record' : 'Add New Record'} — {meta.title}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              {section === 'superadmin_users' && (
                <>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Full Name *</label>
                    <input required value={formState.name || ''} onChange={(e) => setFormState({ ...formState, name: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Email *</label>
                    <input type="email" required value={formState.email || ''} onChange={(e) => setFormState({ ...formState, email: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Phone</label>
                      <input value={formState.phone || ''} onChange={(e) => setFormState({ ...formState, phone: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Role *</label>
                      <select required value={formState.role_id || ''} onChange={(e) => setFormState({ ...formState, role_id: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md">
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">{editingId ? 'New Password (optional)' : 'Password *'}</label>
                    <input type="password" required={!editingId} value={formState.password || ''} onChange={(e) => setFormState({ ...formState, password: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                  </div>
                </>
              )}

              {section === 'superadmin_roles' && (
                <>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Role Name *</label>
                    <input required value={formState.name || ''} onChange={(e) => setFormState({ ...formState, name: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Slug *</label>
                    <input required value={formState.slug || ''} onChange={(e) => setFormState({ ...formState, slug: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md font-mono" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Description</label>
                    <input value={formState.description || ''} onChange={(e) => setFormState({ ...formState, description: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                  </div>
                </>
              )}

              {section === 'superadmin_permissions' && (
                <>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Module *</label>
                    <input required value={formState.module || ''} onChange={(e) => setFormState({ ...formState, module: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md font-mono" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Action *</label>
                    <input required value={formState.action || ''} onChange={(e) => setFormState({ ...formState, action: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md font-mono" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Description</label>
                    <input value={formState.description || ''} onChange={(e) => setFormState({ ...formState, description: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                  </div>
                </>
              )}

              {section === 'superadmin_country' && (
                <>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Country Name *</label>
                    <input required value={formState.name || ''} onChange={(e) => setFormState({ ...formState, name: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">ISO Code *</label>
                      <input required maxLength={5} value={formState.code || ''} onChange={(e) => setFormState({ ...formState, code: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md uppercase font-mono" />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Phone Code</label>
                      <input value={formState.phone_code || ''} onChange={(e) => setFormState({ ...formState, phone_code: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md font-mono" />
                    </div>
                  </div>
                </>
              )}

              {section === 'superadmin_state' && (
                <>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Country *</label>
                    <select required value={formState.country_id || ''} onChange={(e) => setFormState({ ...formState, country_id: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md">
                      <option value="">-- Select Country --</option>
                      {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">State Name *</label>
                      <input required value={formState.name || ''} onChange={(e) => setFormState({ ...formState, name: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Code</label>
                      <input value={formState.code || ''} onChange={(e) => setFormState({ ...formState, code: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md uppercase font-mono" />
                    </div>
                  </div>
                </>
              )}

              {section === 'superadmin_city' && (
                <>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Country *</label>
                    <select
                      required
                      value={formState.country_id || ''}
                      onChange={async (e) => {
                        const cId = e.target.value;
                        setFormState({ ...formState, country_id: cId, state_id: '' });
                        if (cId) {
                          const sRes = await api.getStates({ country_id: cId });
                          setStates(sRes.data || []);
                        } else {
                          setStates([]);
                        }
                      }}
                      className="w-full p-2 border border-slate-200 rounded-md"
                    >
                      <option value="">-- Select Country --</option>
                      {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">State *</label>
                    <select required value={formState.state_id || ''} onChange={(e) => setFormState({ ...formState, state_id: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md">
                      <option value="">-- Select State --</option>
                      {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">City Name *</label>
                    <input required value={formState.name || ''} onChange={(e) => setFormState({ ...formState, name: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                  </div>
                </>
              )}

              {(section === 'superadmin_zone' || section === 'superadmin_payment_types') && (
                <>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Name *</label>
                    <input required value={formState.name || ''} onChange={(e) => setFormState({ ...formState, name: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Code *</label>
                    <input required value={formState.code || ''} onChange={(e) => setFormState({ ...formState, code: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md font-mono" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Description</label>
                    <input value={formState.description || ''} onChange={(e) => setFormState({ ...formState, description: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                  </div>
                </>
              )}

              {section === 'superadmin_couriers' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Courier Name *</label>
                      <input required value={formState.name || ''} onChange={(e) => setFormState({ ...formState, name: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Code *</label>
                      <input required value={formState.code || ''} onChange={(e) => setFormState({ ...formState, code: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md uppercase font-mono" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Contact Person</label>
                      <input value={formState.contact_person || ''} onChange={(e) => setFormState({ ...formState, contact_person: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Phone</label>
                      <input value={formState.phone || ''} onChange={(e) => setFormState({ ...formState, phone: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tracking URL Template</label>
                    <input value={formState.tracking_url_template || ''} onChange={(e) => setFormState({ ...formState, tracking_url_template: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md font-mono" />
                  </div>
                </>
              )}

              {section === 'superadmin_customers' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Company Name *</label>
                      <input required value={formState.company_name || ''} onChange={(e) => setFormState({ ...formState, company_name: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Contact Person *</label>
                      <input required value={formState.contact_person || ''} onChange={(e) => setFormState({ ...formState, contact_person: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Email *</label>
                      <input type="email" required value={formState.email || ''} onChange={(e) => setFormState({ ...formState, email: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Phone *</label>
                      <input required value={formState.phone || ''} onChange={(e) => setFormState({ ...formState, phone: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">GST Number</label>
                      <input value={formState.gst_number || ''} onChange={(e) => setFormState({ ...formState, gst_number: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md font-mono" />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Pincode</label>
                      <input value={formState.pincode || ''} onChange={(e) => setFormState({ ...formState, pincode: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Country</label>
                      <select
                        value={formState.country_id || ''}
                        onChange={async (e) => {
                          const cId = e.target.value;
                          setFormState({ ...formState, country_id: cId, state_id: '', city_id: '' });
                          setCitiesForForm([]);
                          if (cId) {
                            const sRes = await api.getStates({ country_id: cId });
                            setStates(sRes.data || []);
                          } else setStates([]);
                        }}
                        className="w-full p-1.5 border border-slate-200 rounded-md"
                      >
                        <option value="">Country</option>
                        {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">State</label>
                      <select
                        value={formState.state_id || ''}
                        onChange={async (e) => {
                          const sId = e.target.value;
                          setFormState({ ...formState, state_id: sId, city_id: '' });
                          if (sId) {
                            const ctRes = await api.getCities({ state_id: sId });
                            setCitiesForForm(ctRes.data || []);
                          } else setCitiesForForm([]);
                        }}
                        className="w-full p-1.5 border border-slate-200 rounded-md"
                      >
                        <option value="">State</option>
                        {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">City</label>
                      <select
                        value={formState.city_id || ''}
                        onChange={(e) => setFormState({ ...formState, city_id: e.target.value })}
                        className="w-full p-1.5 border border-slate-200 rounded-md"
                      >
                        <option value="">City</option>
                        {citiesForForm.map((ct) => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Address</label>
                    <input value={formState.address || ''} onChange={(e) => setFormState({ ...formState, address: e.target.value })} className="w-full p-2 border border-slate-200 rounded-md" />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="h-8 px-3 border border-slate-200 text-slate-600 rounded-md font-medium hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" className="h-8 px-4 bg-slate-900 text-white rounded-md font-medium hover:bg-slate-800">
                  {editingId ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
