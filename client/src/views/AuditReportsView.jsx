// client/src/views/AuditReportsView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  History, 
  UserCheck, 
  Search, 
  Filter, 
  ShieldCheck, 
  Clock, 
  Calendar, 
  Activity, 
  ArrowUpRight,
  RefreshCw,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import Pagination, { usePagination } from '../components/Pagination';
import { exportToCsv } from '../utils/exportCsv';

export default function AuditReportsView() {
  const [activeSubTab, setActiveSubTab] = useState('audit'); // 'audit' | 'logins'
  const [auditLogs, setAuditLogs] = useState([]);
  const [logins, setLogins] = useState([]);
  const [loading, setLoading] = useState(true);
  const auditPagination = usePagination(auditLogs, 10);
  const loginsPagination = usePagination(logins, 10);

  // Filters
  const [selectedModule, setSelectedModule] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [aRes, lRes] = await Promise.all([
        api.getAuditLogs({ module: selectedModule, search: searchQuery }),
        api.getLoginActivities()
      ]);
      setAuditLogs(aRes.data || []);
      setLogins(lRes.data || []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedModule]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadData();
  };

  return (
    <div className="space-y-4">
      
      {/* Compact ShadCN Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">
              Audit Reports & User Session Logs
            </h1>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              SOC 2 / ISO Compliance
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable chronological audit trails of every lifecycle transaction, approval gate, and user session activity.
          </p>
        </div>

        {/* Subtabs */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs">
          <button
            onClick={() => setActiveSubTab('audit')}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              activeSubTab === 'audit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Lifecycle Audit Trails ({auditLogs.length})
          </button>
          <button
            onClick={() => setActiveSubTab('logins')}
            className={`px-3 py-1 rounded font-medium transition-colors ${
              activeSubTab === 'logins' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            User Login & Session Activity ({logins.length})
          </button>
        </div>
      </div>

      {/* SUBTAB 1: LIFECYCLE AUDIT TRAILS */}
      {activeSubTab === 'audit' && (
        <div className="space-y-3">
          
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-sm">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search audit details, entity ID, or actor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </form>

            <div className="flex items-center gap-2">
              <select
                value={selectedModule}
                onChange={(e) => setSelectedModule(e.target.value)}
                className="py-1.5 px-2.5 border border-slate-200 rounded-md text-xs bg-white text-slate-700 font-medium focus:ring-1 focus:ring-slate-900"
              >
                <option value="">All Lifecycle Modules</option>
                <option value="leads">1 & 2. Leads Inward & Approval</option>
                <option value="quotations">3. Commercial Quotations</option>
                <option value="purchase_orders">4. Customer POs</option>
                <option value="payments">5 & 12. Client Payments</option>
                <option value="inventory">7. BOM & Stock Requisitions</option>
                <option value="manufacturing">8. 5-Level Manufacturing</option>
                <option value="qc">9. Quality Control Gates</option>
                <option value="dispatch">10. Dispatch & Logistics</option>
                <option value="customer_portal">11. Customer QC & RMA</option>
                <option value="users">Security & RBAC Matrix</option>
              </select>

              <button
                type="button"
                onClick={loadData}
                className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>

              <button
                type="button"
                onClick={() =>
                  exportToCsv(
                    'audit_logs',
                    [
                      { header: 'Timestamp', accessor: 'created_at' },
                      { header: 'User', accessor: 'user_name' },
                      { header: 'Role', accessor: 'role_name' },
                      { header: 'Module', accessor: 'module' },
                      { header: 'Action', accessor: 'action' },
                      { header: 'Entity Ref', accessor: 'entity_id' },
                      { header: 'Details', accessor: 'details' },
                      { header: 'IP Address', accessor: 'ip_address' }
                    ],
                    auditLogs
                  )
                }
                title="Export filtered audit logs"
                className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
              >
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            </div>
          </div>

          {/* Audit Table (ShadCN style) */}
          <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading audit trail...</div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No audit entries match the current filters.
              </div>
            ) : (
              <>
                <div className="px-3.5 py-2 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Total Records: <strong className="text-slate-800">{auditLogs.length}</strong></span>
                  <span>Page {auditPagination.currentPage} of {auditPagination.totalPages}</span>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                    <tr>
                      <th className="px-3 py-2.5 w-10 text-center">#</th>
                      <th className="px-3.5 py-2.5">Timestamp</th>
                      <th className="px-3.5 py-2.5">User & Role</th>
                      <th className="px-3.5 py-2.5">Module</th>
                      <th className="px-3.5 py-2.5">Action</th>
                      <th className="px-3.5 py-2.5">Entity Reference</th>
                      <th className="px-3.5 py-2.5">Audit Event Details</th>
                      <th className="px-3.5 py-2.5 text-right">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditPagination.paginatedItems.map((log, idx) => (
                      <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">
                          {auditPagination.startIndex + idx + 1}
                        </td>
                        
                        {/* Timestamp */}
                        <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                          {log.created_at}
                        </td>

                        {/* User & Role */}
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <p className="font-medium text-slate-900">{log.user_name}</p>
                          <span className="text-[10px] text-slate-400 font-medium">{log.role_name}</span>
                        </td>

                        {/* Module */}
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200 capitalize">
                            {log.module?.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border ${
                            log.action === 'approve' || log.action === 'verify_qc'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : (log.action === 'reject'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-sky-50 text-sky-700 border-sky-200')
                          }`}>
                            {log.action}
                          </span>
                        </td>

                        {/* Entity */}
                        <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-[11px] text-slate-700 font-medium">
                          {log.entity_id}
                        </td>

                        {/* Details */}
                        <td className="px-3.5 py-2.5 text-slate-700 text-xs max-w-md">
                          {log.details}
                        </td>

                        {/* IP Address */}
                        <td className="px-3.5 py-2.5 text-right whitespace-nowrap font-mono text-[11px] text-slate-400">
                          {log.ip_address}
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
                currentPage={auditPagination.currentPage}
                totalPages={auditPagination.totalPages}
                totalItems={auditPagination.totalItems}
                pageSize={auditPagination.pageSize}
                onPageChange={auditPagination.setCurrentPage}
              />
            )}
          </div>

        </div>
      )}

      {/* SUBTAB 2: USER LOGIN & SESSION ACTIVITY */}
      {activeSubTab === 'logins' && (
        <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-3 bg-slate-50/80 border-b border-slate-200/80 flex justify-between items-center">
            <h3 className="text-xs font-semibold text-slate-700">
              User Login, Logout & Session Persona Switch History ({logins.length} Records)
            </h3>
            <button
              type="button"
              onClick={() =>
                exportToCsv(
                  'login_activity',
                  [
                    { header: 'User', accessor: 'user_name' },
                    { header: 'Email', accessor: 'email' },
                    { header: 'Role', accessor: 'role_name' },
                    { header: 'Action', accessor: 'action' },
                    { header: 'Login Time', accessor: 'login_time' },
                    { header: 'Logout Time', accessor: 'logout_time' },
                    { header: 'IP Address', accessor: 'ip_address' },
                    { header: 'Status', accessor: 'status' }
                  ],
                  logins
                )
              }
              title="Export login history"
              className="h-7 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
            >
              <Download className="h-3 w-3" /> Export
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 w-10 text-center">#</th>
                  <th className="px-3.5 py-2.5">User Account & Email</th>
                  <th className="px-3.5 py-2.5">Role</th>
                  <th className="px-3.5 py-2.5">Action Event</th>
                  <th className="px-3.5 py-2.5">Login Timestamp</th>
                  <th className="px-3.5 py-2.5">Session Terminated / Logout</th>
                  <th className="px-3.5 py-2.5">IP Address & Client Browser</th>
                  <th className="px-3.5 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loginsPagination.paginatedItems.map((entry, idx) => (
                  <tr key={entry.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400">
                      {loginsPagination.startIndex + idx + 1}
                    </td>
                    
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <p className="font-medium text-slate-900">{entry.user_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{entry.email}</p>
                    </td>

                    <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-700 font-medium">
                      {entry.role_name}
                    </td>

                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold capitalize border ${
                        entry.action === 'login'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : (entry.action === 'logout'
                              ? 'bg-slate-100 text-slate-700 border-slate-200'
                              : 'bg-sky-50 text-sky-700 border-sky-200')
                      }`}>
                        {entry.action?.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-[11px] text-slate-600">
                      {entry.login_time}
                    </td>

                    <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-[11px] text-slate-400">
                      {entry.logout_time || '— (Active Session)'}
                    </td>

                    <td className="px-3.5 py-2.5 max-w-xs truncate text-[11px] text-slate-500">
                      <span className="font-mono font-medium text-slate-700">{entry.ip_address}</span>
                      <span className="block truncate text-[10px] text-slate-400">{entry.user_agent}</span>
                    </td>

                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {entry.status}
                      </span>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={loginsPagination.currentPage}
            totalPages={loginsPagination.totalPages}
            totalItems={loginsPagination.totalItems}
            pageSize={loginsPagination.pageSize}
            onPageChange={loginsPagination.setCurrentPage}
          />
        </div>
      )}

    </div>
  );
}
