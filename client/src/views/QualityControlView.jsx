// client/src/views/QualityControlView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  ClipboardCheck, 
  CheckCircle2, 
  XCircle, 
  Search, 
  History,
  Download
} from 'lucide-react';
import Pagination, { usePagination } from '../components/Pagination';
import { exportToCsv } from '../utils/exportCsv';

export default function QualityControlView({ currentUser, onInspectWorkOrder, onOpenAudit }) {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getInspections();
      setInspections(res.data || []);
    } catch (err) {
      alert('Error fetching QC inspection records: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = inspections.filter(i => {
    const matchesSearch =
      i.work_order_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.stage_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.inspector_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !statusFilter || i.qc_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const qcPagination = usePagination(filtered, 10);

  return (
    <div className="space-y-3.5">
      
      {/* Header (ShadCN style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900 tracking-tight">
              Stage 9: Quality Control (QC) & Multi-Stage Inspection Log
            </h1>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
              Quality Assurance
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Log of physical inspections, tolerance verification gates, and defect failure modes across Level 1 to Level 5.
          </p>
        </div>

        {onOpenAudit && (
          <button
            onClick={() => onOpenAudit('qc')}
            className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
          >
            <History className="h-3.5 w-3.5" /> Full QC Audit Trail
          </button>
        )}
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search work order #, stage, or inspector..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-slate-900"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700"
          >
            <option value="">All Verdicts</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
          </select>
          <button
            type="button"
            onClick={() =>
              exportToCsv(
                'qc_inspections',
                [
                  { header: 'Level', accessor: (it) => `L${it.level_number}` },
                  { header: 'Date', accessor: 'inspection_date' },
                  { header: 'Work Order', accessor: 'work_order_number' },
                  { header: 'Stage Name', accessor: 'stage_name' },
                  { header: 'Passed', accessor: 'passed_qty' },
                  { header: 'Rejected', accessor: 'rejected_qty' },
                  { header: 'Status', accessor: 'qc_status' },
                  { header: 'Defect Reason', accessor: 'defect_reason' },
                  { header: 'Inspector', accessor: 'inspector_name' },
                  { header: 'Remarks', accessor: 'remarks' }
                ],
                filtered
              )
            }
            title="Export filtered QC inspections"
            className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1 shadow-xs"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Table (Compact ShadCN style) */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading QC records...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No QC inspections recorded.
          </div>
        ) : (
          <>
            <div className="px-3.5 py-2 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
              <span>Total Records: <strong className="text-slate-800">{filtered.length}</strong></span>
              <span>Page {qcPagination.currentPage} of {qcPagination.totalPages}</span>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="px-3 py-2 w-10 text-center">#</th>
                  <th className="px-3.5 py-2">Date & Level</th>
                  <th className="px-3.5 py-2">Work Order</th>
                  <th className="px-3.5 py-2">Stage Name</th>
                  <th className="px-3.5 py-2 text-center">Passed</th>
                  <th className="px-3.5 py-2 text-center">Rejected</th>
                  <th className="px-3.5 py-2">Status & Defect</th>
                  <th className="px-3.5 py-2">Inspector Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {qcPagination.paginatedItems.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">
                      {qcPagination.startIndex + idx + 1}
                    </td>
                    
                    <td className="px-3.5 py-2 whitespace-nowrap">
                      <span className="font-bold text-slate-900 mr-1.5">L{item.level_number}</span>
                      <span className="text-[11px] text-slate-500">{new Date(item.inspection_date).toLocaleDateString()}</span>
                    </td>

                    <td className="px-3.5 py-2 whitespace-nowrap font-semibold text-slate-900">
                      {item.work_order_number}
                    </td>

                    <td className="px-3.5 py-2 font-medium text-slate-700">
                      {item.stage_name}
                    </td>

                    <td className="px-3.5 py-2 text-center font-bold text-emerald-600">
                      {item.passed_qty}
                    </td>

                    <td className="px-3.5 py-2 text-center font-bold">
                      {item.rejected_qty > 0 ? (
                        <span className="text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 text-[10px]">
                          {item.rejected_qty}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>

                    <td className="px-3.5 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border ${
                        item.qc_status === 'passed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {item.qc_status}
                      </span>
                      {item.defect_reason && (
                        <span className="text-[10px] text-rose-600 block mt-0.5 truncate max-w-xs">
                          {item.defect_reason}
                        </span>
                      )}
                    </td>

                    <td className="px-3.5 py-2 max-w-xs text-[11px] text-slate-600">
                      "{item.remarks}"
                      <span className="block text-[10px] text-slate-400 mt-0.5 font-medium">By: {item.inspector_name}</span>
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
            currentPage={qcPagination.currentPage}
            totalPages={qcPagination.totalPages}
            totalItems={qcPagination.totalItems}
            pageSize={qcPagination.pageSize}
            onPageChange={qcPagination.setCurrentPage}
          />
        )}
      </div>

    </div>
  );
}
