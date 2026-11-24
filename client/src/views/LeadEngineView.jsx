// client/src/views/LeadEngineView.jsx
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../services/api';
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  ArrowLeftRight,
  CheckCircle2,
  UserPlus,
  Download,
  Sparkles
} from 'lucide-react';
import { MediaUploader } from '../components/MediaUploader';

const SYSTEM_FIELDS = [
  { key: 'lead_number', label: 'lead_number (Auto if blank)', aliases: ['lead_number', 'lead #', 'lead_no', 'id'] },
  { key: 'title', label: 'lead_name / title *', required: true, aliases: ['lead_name', 'title', 'name', 'subject', 'requirement', 'inquiry'] },
  { key: 'customer_name', label: 'customer_name', aliases: ['customer_name', 'customer', 'company', 'company_name', 'client', 'organization'] },
  { key: 'customer_email', label: 'customer_email', aliases: ['customer_email', 'email', 'mail'] },
  { key: 'customer_phone', label: 'customer_phone', aliases: ['customer_phone', 'phone', 'mobile', 'contact', 'tel'] },
  { key: 'requirement_details', label: 'requirement_details', aliases: ['requirement_details', 'details', 'description', 'notes', 'specs'] },
  { key: 'estimated_value', label: 'estimated_value (₹)', aliases: ['estimated_value', 'value', 'amount', 'budget', 'est_value'] },
  { key: 'source', label: 'source', aliases: ['source', 'lead_source', 'channel', 'origin'] },
  { key: 'priority', label: 'priority (low/medium/high/urgent)', aliases: ['priority', 'urgency'] },
  { key: 'expected_close_date', label: 'expected_close_date', aliases: ['expected_close_date', 'close_date', 'target_date', 'deadline'] },
  { key: 'assigned_to', label: 'assigned_to (Name or Email)', aliases: ['assigned_to', 'assignee', 'owner', 'sales_exec', 'manager'] },
  { key: 'remarks', label: 'remarks', aliases: ['remarks', 'comment', 'comments'] }
];

const LEAD_SOURCES = [
  'Direct Inquiry',
  'IndiaMART',
  'TradeIndia',
  'Website',
  'LinkedIn',
  'Email Campaign',
  'Exhibition / Expo',
  'Referral',
  'Cold Call',
  'Excel Import'
];

export default function LeadEngineView({ currentUser, onBack, onSaved }) {
  const [mode, setMode] = useState('excel'); // 'excel' | 'manual'
  const [customers, setCustomers] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);

  // Excel Mapper State
  const [fileName, setFileName] = useState('');
  const [excelHeaders, setExcelHeaders] = useState([]); // [{ index: 0, name: '...' }]
  const [excelRows, setExcelRows] = useState([]); // array of arrays
  const [columnMap, setColumnMap] = useState({}); // { systemKey: excelColIndex }
  const [defaultSource, setDefaultSource] = useState('IndiaMART');
  const [defaultPriority, setDefaultPriority] = useState('medium');
  const [defaultAssignedTo, setDefaultAssignedTo] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Manual Advanced Lead State
  const [manualForm, setManualForm] = useState({
    customer_id: '',
    lead_number: '',
    title: '',
    source: 'Direct Inquiry',
    priority: 'medium',
    estimated_value: '',
    expected_close_date: '',
    assigned_to: '',
    requirement_details: '',
    remarks: ''
  });
  const [mediaFiles, setMediaFiles] = useState([]);
  const [savingManual, setSavingManual] = useState(false);

  useEffect(() => {
    Promise.all([api.getCustomers(), api.getUsers()])
      .then(([cRes, uRes]) => {
        setCustomers(cRes.data || []);
        setAssignableUsers(
          (uRes.data || []).filter((u) => {
            const slug = (u.role_slug || '').toLowerCase();
            const roleName = (u.role_name || '').toLowerCase();
            return (
              slug === 'sales' ||
              slug === 'production' ||
              slug === 'admin' ||
              roleName.includes('manager') ||
              roleName.includes('sales')
            );
          })
        );
      })
      .catch((err) => console.error('Failed to load lead engine refs:', err));
  }, []);

  const handleDownloadTemplate = () => {
    const sample = [
      {
        lead_number: '',
        lead_name: '50 Units High Torque Stepper Motors',
        customer_name: 'Apex Industrial Solutions Pvt Ltd',
        customer_email: 'client@apexindustrial.com',
        customer_phone: '+91 9876501234',
        requirement_details: 'NEMA 34 8.5Nm closed loop stepper motors with encoder',
        estimated_value: 250000,
        source: 'IndiaMART',
        priority: 'high',
        expected_close_date: '2026-12-15',
        assigned_to: '',
        remarks: 'Urgent Q4 requirement'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads_Format');
    XLSX.writeFile(wb, 'SAR_Lead_Import_Template.xlsx');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setFileName(file.name);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const firstSheet = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheet];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (!raw || raw.length < 2) {
        alert('The uploaded sheet must have a header row and at least 1 data row.');
        return;
      }

      const headers = raw[0].map((h, idx) => ({
        index: idx,
        name: String(h || `Column ${idx + 1}`).trim()
      }));
      const dataRows = raw.slice(1).filter((r) => r.some((cell) => String(cell).trim() !== ''));

      // Smart auto-mapping by header name
      const autoMap = {};
      SYSTEM_FIELDS.forEach((sf) => {
        const match = headers.find((h) => {
          const norm = h.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          return sf.aliases.some((al) => norm === al || norm.includes(al));
        });
        autoMap[sf.key] = match ? String(match.index) : '';
      });

      setExcelHeaders(headers);
      setExcelRows(dataRows);
      setColumnMap(autoMap);
    } catch (err) {
      alert('Failed to parse Excel/CSV file: ' + err.message);
    }
    e.target.value = '';
  };

  const buildMappedRows = () => {
    return excelRows.map((row) => {
      const obj = {};
      SYSTEM_FIELDS.forEach((sf) => {
        const colIdx = columnMap[sf.key];
        if (colIdx !== '' && colIdx !== undefined) {
          obj[sf.key] = row[Number(colIdx)] ?? '';
        }
      });
      return obj;
    });
  };

  const mappedPreview = excelRows.length > 0 ? buildMappedRows().slice(0, 5) : [];

  const handleBulkImport = async () => {
    if (columnMap.title === '' || columnMap.title === undefined) {
      alert('Please map "lead_name / title *" to one of your uploaded Excel columns first.');
      return;
    }

    const mapped = buildMappedRows();
    setImporting(true);
    setImportResult(null);
    try {
      const res = await api.bulkImportLeads({
        rows: mapped,
        default_source: defaultSource,
        default_priority: defaultPriority,
        default_assigned_to: defaultAssignedTo || null,
        created_by: currentUser?.id || 1
      });
      setImportResult(res.data);
      if (onSaved) onSaved();
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setSavingManual(true);
    try {
      const res = await api.createLead({
        ...manualForm,
        created_by: currentUser?.id || 1
      });
      const leadId = res.data?.id;
      if (mediaFiles.length > 0 && leadId) {
        await api.uploadMedia('lead', leadId, mediaFiles, currentUser?.id || 1);
      }
      if (onSaved) onSaved();
      onBack();
    } catch (err) {
      alert('Failed to create lead: ' + err.message);
    } finally {
      setSavingManual(false);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            title="Back to Leads"
            aria-label="Back to Leads"
            className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-600" />
              <h1 className="text-base font-semibold text-slate-900 tracking-tight">
                Dedicated Lead Creation Engine
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Import multi-source leads via Excel/CSV with dynamic column mapping, or capture advanced leads manually.
            </p>
          </div>
        </div>

        <div className="flex bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setMode('excel')}
            className={`px-3 py-1.5 rounded font-medium flex items-center gap-1.5 cursor-pointer ${
              mode === 'excel' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel / CSV Mapper
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`px-3 py-1.5 rounded font-medium flex items-center gap-1.5 cursor-pointer ${
              mode === 'manual' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" /> Advanced Single Lead
          </button>
        </div>
      </div>

      {/* MODE 1: EXCEL / CSV UPLOAD & COLUMN MAPPER */}
      {mode === 'excel' && (
        <div className="space-y-3.5">
          {/* Step 1: Upload & Template */}
          <div className="bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                  Step 1: Upload Client Excel / CSV File
                </h2>
                <p className="text-[11px] text-slate-500">
                  Upload any .xlsx, .xls, or .csv file from IndiaMART, TradeIndia, CRM exports, or client spreadsheets.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="h-8 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" /> Download Standard Format
              </button>
            </div>

            <label className="flex flex-col items-center justify-center gap-1.5 p-6 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50/70 hover:bg-slate-100/60 cursor-pointer transition-colors text-xs">
              <Upload className="h-5 w-5 text-slate-500" />
              <span className="font-semibold text-slate-800">
                {fileName ? `Loaded: ${fileName} (${excelRows.length} rows, ${excelHeaders.length} columns)` : 'Click to choose Excel (.xlsx / .xls) or CSV file'}
              </span>
              <span className="text-[11px] text-slate-400">Columns can be in any order — map them in Step 2 below</span>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="sr-only" />
            </label>

            {importResult && (
              <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
                <span className="font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Imported <strong>{importResult.imported_count}</strong> leads successfully (Skipped: {importResult.skipped_count}).
                </span>
                <button type="button" onClick={onBack} className="underline font-semibold cursor-pointer">
                  View Leads →
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Column Mapping */}
          {excelHeaders.length > 0 && (
            <div className="bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div>
                  <h2 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ArrowLeftRight className="h-3.5 w-3.5 text-sky-600" />
                    Step 2: Map Standard System Columns ⇔ Uploaded Excel Columns
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    For example, if your Excel has Lead Name in Column 5, map #2 (lead_name) ⇔ Col 5.
                  </p>
                </div>
              </div>

              {/* Default Fallbacks */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-md bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Default Source (if unmapped)</label>
                  <select
                    value={defaultSource}
                    onChange={(e) => setDefaultSource(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded bg-white"
                  >
                    {LEAD_SOURCES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Default Priority (if unmapped)</label>
                  <select
                    value={defaultPriority}
                    onChange={(e) => setDefaultPriority(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded bg-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Default Assignee (if unmapped)</label>
                  <select
                    value={defaultAssignedTo}
                    onChange={(e) => setDefaultAssignedTo(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded bg-white"
                  >
                    <option value="">-- Unassigned --</option>
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role_name})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mapping Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-md">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 w-10 text-center">#</th>
                      <th className="px-3.5 py-2">System Lead Column</th>
                      <th className="px-3 py-2 text-center w-12">Map</th>
                      <th className="px-3.5 py-2">Uploaded Excel Column</th>
                      <th className="px-3.5 py-2">Sample Value (Row 1)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {SYSTEM_FIELDS.map((sf, idx) => {
                      const mappedIdx = columnMap[sf.key];
                      const sampleVal =
                        mappedIdx !== '' && mappedIdx !== undefined
                          ? excelRows[0]?.[Number(mappedIdx)]
                          : '';
                      return (
                        <tr key={sf.key} className="hover:bg-slate-50/50">
                          <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
                          <td className="px-3.5 py-2 font-semibold text-slate-800">
                            {sf.label}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-sky-600 font-bold">
                            {mappedIdx !== '' && mappedIdx !== undefined ? `${idx + 1}⇔${Number(mappedIdx) + 1}` : '—'}
                          </td>
                          <td className="px-3.5 py-2">
                            <select
                              value={mappedIdx ?? ''}
                              onChange={(e) => setColumnMap((prev) => ({ ...prev, [sf.key]: e.target.value }))}
                              className="w-full max-w-xs p-1.5 border border-slate-200 rounded bg-white text-xs"
                            >
                              <option value="">-- Not Mapped --</option>
                              {excelHeaders.map((h) => (
                                <option key={h.index} value={h.index}>
                                  Col {h.index + 1}: {h.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3.5 py-2 text-slate-500 truncate max-w-xs">
                            {sampleVal !== '' && sampleVal !== undefined ? String(sampleVal) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Preview & Import */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    Step 3: Preview Mapped Data (First {mappedPreview.length} of {excelRows.length} rows)
                  </span>
                  <button
                    type="button"
                    disabled={importing}
                    onClick={handleBulkImport}
                    className="h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-md font-medium text-xs shadow-xs cursor-pointer disabled:opacity-60"
                  >
                    {importing ? 'Importing...' : `Import ${excelRows.length} Leads`}
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-md">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 w-10 text-center">#</th>
                        <th className="px-3 py-2">Lead #</th>
                        <th className="px-3 py-2">Lead Name / Title</th>
                        <th className="px-3 py-2">Customer</th>
                        <th className="px-3 py-2">Source</th>
                        <th className="px-3 py-2">Priority</th>
                        <th className="px-3 py-2 text-right">Est. Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {mappedPreview.map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 text-center font-mono text-[11px] text-slate-400">{i + 1}</td>
                          <td className="px-3 py-1.5 font-mono text-[11px] text-slate-600">{r.lead_number || 'Auto'}</td>
                          <td className="px-3 py-1.5 font-semibold text-slate-900">{r.title || '—'}</td>
                          <td className="px-3 py-1.5 text-slate-700">{r.customer_name || 'Default Customer'}</td>
                          <td className="px-3 py-1.5 text-slate-600">{r.source || defaultSource}</td>
                          <td className="px-3 py-1.5 uppercase text-[10px] font-semibold">{r.priority || defaultPriority}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{r.estimated_value || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODE 2: ADVANCED SINGLE LEAD */}
      {mode === 'manual' && (
        <form onSubmit={handleManualSubmit} className="bg-white p-4 rounded-lg border border-slate-200/90 shadow-xs space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Customer *</label>
              <select
                required
                value={manualForm.customer_id}
                onChange={(e) => setManualForm({ ...manualForm, customer_id: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-md"
              >
                <option value="">-- Select Customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.company_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Lead Number (optional)</label>
              <input
                placeholder="Auto-generated if blank"
                value={manualForm.lead_number}
                onChange={(e) => setManualForm({ ...manualForm, lead_number: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-md font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Lead Source</label>
              <select
                value={manualForm.source}
                onChange={(e) => setManualForm({ ...manualForm, source: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-md"
              >
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Lead Name / Requirement Title *</label>
            <input
              required
              placeholder="e.g. 100 Units High Torque Stepper Motors"
              value={manualForm.title}
              onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-md"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Priority</label>
              <select
                value={manualForm.priority}
                onChange={(e) => setManualForm({ ...manualForm, priority: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-md"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Estimated Value (₹)</label>
              <input
                type="number"
                value={manualForm.estimated_value}
                onChange={(e) => setManualForm({ ...manualForm, estimated_value: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Expected Close Date</label>
              <input
                type="date"
                value={manualForm.expected_close_date}
                onChange={(e) => setManualForm({ ...manualForm, expected_close_date: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Assign To</label>
              <select
                value={manualForm.assigned_to}
                onChange={(e) => setManualForm({ ...manualForm, assigned_to: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-md"
              >
                <option value="">-- Unassigned --</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role_name})</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Technical Requirement Details</label>
            <textarea
              rows="3"
              value={manualForm.requirement_details}
              onChange={(e) => setManualForm({ ...manualForm, requirement_details: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-md resize-y"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Internal Remarks</label>
            <input
              value={manualForm.remarks}
              onChange={(e) => setManualForm({ ...manualForm, remarks: e.target.value })}
              className="w-full p-2 border border-slate-200 rounded-md"
            />
          </div>

          <MediaUploader files={mediaFiles} onChange={setMediaFiles} label="Attach Inquiry Drawings / RFQs / Media (Optional)" />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onBack} className="h-8 px-3 border border-slate-200 rounded-md text-slate-600 font-medium cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={savingManual} className="h-8 px-4 bg-slate-900 text-white rounded-md font-medium cursor-pointer disabled:opacity-60">
              {savingManual ? 'Saving...' : 'Create Lead'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
