// client/src/views/UsersMatrixView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  ShieldCheck, 
  Users, 
  Plus, 
  Save, 
  Trash2,
  Shield,
  History
} from 'lucide-react';

export default function UsersMatrixView({ onOpenAudit }) {
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [matrixMap, setMatrixMap] = useState({});
  const [selectedRoleId, setSelectedRoleId] = useState(1);
  const [savingMatrix, setSavingMatrix] = useState(false);
  const [loading, setLoading] = useState(true);

  // New user modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    phone: '',
    role_id: 2,
    password: 'password123',
    status: 'active'
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [uRes, mRes] = await Promise.all([
        api.getUsers(),
        api.getPermissionMatrix()
      ]);
      setUsers(uRes.data || []);
      setRoles(mRes.data?.roles || []);
      setPermissions(mRes.data?.permissions || []);
      setMatrixMap(mRes.data?.matrix || {});
    } catch (err) {
      alert('Error fetching users & matrix: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await api.createUser(newUser);
      setShowUserModal(false);
      setNewUser({
        name: '',
        email: '',
        phone: '',
        role_id: 2,
        password: 'password123',
        status: 'active'
      });
      loadData();
    } catch (err) {
      alert('Failed to create user: ' + err.message);
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Delete this user account?')) return;
    try {
      await api.deleteUser(id);
      loadData();
    } catch (err) {
      alert('Failed to delete user: ' + err.message);
    }
  };

  const togglePermission = (roleId, permId) => {
    const key = `${roleId}_${permId}`;
    setMatrixMap(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSaveMatrix = async (roleId) => {
    setSavingMatrix(true);
    try {
      const activeIds = permissions
        .filter(p => matrixMap[`${roleId}_${p.id}`])
        .map(p => p.id);

      await api.updatePermissionMatrix(roleId, activeIds);
      alert('Role permissions successfully updated in database!');
      loadData();
    } catch (err) {
      alert('Failed to save matrix: ' + err.message);
    } finally {
      setSavingMatrix(false);
    }
  };

  const groupedPermissions = permissions.reduce((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-3.5">
      
      {/* Header (ShadCN style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">
              Users Management & Role-Based Access Matrix (RBAC)
            </h1>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              Security Governance
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage staff accounts and configure granular module-level permissions for each role.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAudit && (
            <button
              onClick={() => onOpenAudit('users')}
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
            >
              <History className="h-3.5 w-3.5" /> Security Audit
            </button>
          )}

          <div className="flex bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                activeTab === 'users' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Staff Directory
            </button>
            <button
              onClick={() => setActiveTab('matrix')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                activeTab === 'matrix' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Permission Matrix
            </button>
          </div>

          {activeTab === 'users' && (
            <button
              onClick={() => setShowUserModal(true)}
              className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium text-xs shadow-xs flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Add Staff User
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: USERS DIRECTORY */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-2">Name & Email</th>
                <th className="px-3.5 py-2">Phone</th>
                <th className="px-3.5 py-2">Assigned Role</th>
                <th className="px-3.5 py-2">Status</th>
                <th className="px-3.5 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <td className="px-3.5 py-2.5">
                    <p className="font-semibold text-slate-900">{u.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{u.email}</p>
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-slate-600">{u.phone || '—'}</td>
                  <td className="px-3.5 py-2.5">
                    <span className="font-medium text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                      {u.role_name}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {u.status}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    {u.id !== 1 && (
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: RBAC MATRIX */}
      {activeTab === 'matrix' && (
        <div className="space-y-3">
          <div className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">Configure Role:</span>
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRoleId(r.id)}
                  className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedRoleId === r.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>

            <button
              onClick={() => handleSaveMatrix(selectedRoleId)}
              disabled={savingMatrix}
              className="h-8 px-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium text-xs shadow-xs flex items-center gap-1.5 self-end sm:self-auto"
            >
              <Save className="h-3.5 w-3.5" />
              {savingMatrix ? 'Saving...' : 'Save Permissions'}
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs divide-y divide-slate-100">
            {Object.keys(groupedPermissions).map((module) => (
              <div key={module} className="p-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="w-36 flex-shrink-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                      {module.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {groupedPermissions[module].map((perm) => {
                      const isChecked = !!matrixMap[`${selectedRoleId}_${perm.id}`];
                      return (
                        <label
                          key={perm.id}
                          className={`flex items-start gap-1.5 p-2 rounded border text-xs cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-slate-900 text-white font-medium'
                              : 'bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePermission(selectedRoleId, perm.id)}
                            className="mt-0.5 h-3 w-3 rounded text-slate-900"
                          />
                          <div>
                            <span className="font-semibold capitalize text-[11px] block leading-none">{perm.action}</span>
                            <span className="text-[9px] opacity-70 block mt-0.5 leading-tight">{perm.description}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {showUserModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-sm w-full p-4 shadow-lg border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-0.5">Create Staff Account</h3>
            <p className="text-xs text-slate-500 mb-3">Add credentials and assign role.</p>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Patil"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full p-1.5 border border-slate-200 rounded text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  placeholder="user@mfg-erp.local"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full p-1.5 border border-slate-200 rounded text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Role *</label>
                <select
                  value={newUser.role_id}
                  onChange={(e) => setNewUser({ ...newUser, role_id: Number(e.target.value) })}
                  className="w-full p-1.5 border border-slate-200 rounded text-xs"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="h-8 px-3 border rounded text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-8 px-4 bg-slate-900 text-white rounded text-xs font-medium"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
