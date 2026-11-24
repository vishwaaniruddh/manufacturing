// client/src/views/WorkOrderDetailView.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  Hammer, 
  ClipboardCheck, 
  CheckCircle2, 
  ArrowLeft, 
  Truck, 
  Clock, 
  History,
  X,
  AlertCircle,
  Layers
} from 'lucide-react';
import { hasPermission } from '../utils/rbac';
import { MediaUploader, MediaGallery } from '../components/MediaUploader';

export default function WorkOrderDetailView({ currentUser, workOrderId, onBack, onDispatchReady, onOpenAudit }) {
  const [wo, setWo] = useState(null);
  const [loading, setLoading] = useState(true);

  // QC Verification form state
  const [activeStageForQC, setActiveStageForQC] = useState(null);
  const [productVerificationRows, setProductVerificationRows] = useState([]);
  const [passedQty, setPassedQty] = useState('');
  const [rejectedQty, setRejectedQty] = useState(0);
  const [qcStatus, setQcStatus] = useState('passed');
  const [qcRemarks, setQcRemarks] = useState('');
  const [defectReason, setDefectReason] = useState('');
  const [inspectorName, setInspectorName] = useState(currentUser?.name || 'Sunil Deshmukh (Senior QC)');
  const [qcMediaFiles, setQcMediaFiles] = useState([]);
  const [stageMediaMap, setStageMediaMap] = useState({});
  const [submittingQC, setSubmittingQC] = useState(false);

  const loadDetails = async () => {
    setLoading(true);
    try {
      const [res, mRes] = await Promise.all([
        api.getWorkOrder(workOrderId),
        api.getMedia('qc_stage')
      ]);
      setWo(res.data);
      const grouped = {};
      (mRes.data || []).forEach((m) => {
        grouped[m.entity_id] = grouped[m.entity_id] || [];
        grouped[m.entity_id].push(m);
      });
      setStageMediaMap(grouped);
    } catch (err) {
      alert('Failed to load work order: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workOrderId) loadDetails();
  }, [workOrderId]);

  const openQCModal = (stage) => {
    setActiveStageForQC(stage);
    const comps = wo.product_components || [];
    let initialRows = [];

    if (comps.length > 0) {
      initialRows = comps.map(c => ({
        product_id: c.product_id,
        product_name: c.product_name,
        product_sku: c.product_sku,
        item_type: c.item_type,
        role_notes: c.role_notes,
        uom: c.uom,
        target_quantity: Number(c.target_quantity),
        passed_qty: Number(c.target_quantity),
        rejected_qty: 0,
        qc_status: 'passed',
        defect_reason: '',
        remarks: `Level ${stage.level_number} specification verified`
      }));
    } else {
      initialRows = [{
        product_id: wo.product_id,
        product_name: wo.product_name,
        product_sku: wo.product_sku,
        item_type: 'finished_good',
        role_notes: 'Primary Finished Good Batch',
        uom: wo.uom,
        target_quantity: Number(wo.target_quantity),
        passed_qty: Number(wo.target_quantity - (wo.rejected_quantity || 0)),
        rejected_qty: 0,
        qc_status: 'passed',
        defect_reason: '',
        remarks: `Level ${stage.level_number} specification verified`
      }];
    }

    setProductVerificationRows(initialRows);
    setPassedQty(wo.target_quantity - (wo.rejected_quantity || 0));
    setRejectedQty(0);
    setQcStatus('passed');
    setQcRemarks(`All product components and assemblies inspected and verified at Level ${stage.level_number}`);
    setDefectReason('');
  };

  const handleRowChange = (index, field, value) => {
    setProductVerificationRows(prev => {
      const updated = [...prev];
      const row = { ...updated[index], [field]: value };
      
      const target = Number(row.target_quantity) || 0;
      if (field === 'passed_qty') {
        const passed = Number(value) || 0;
        if (passed < target && (!row.rejected_qty || Number(row.rejected_qty) === 0)) {
          row.rejected_qty = Math.max(0, target - passed);
        }
        if (Number(row.rejected_qty) > 0 && row.qc_status === 'passed') {
          row.qc_status = 'failed';
        } else if (Number(row.rejected_qty) === 0 && row.qc_status === 'failed') {
          row.qc_status = 'passed';
        }
      } else if (field === 'rejected_qty') {
        const rej = Number(value) || 0;
        if (rej > 0) {
          row.passed_qty = Math.max(0, target - rej);
          if (row.qc_status === 'passed') row.qc_status = 'failed';
        } else {
          row.passed_qty = target;
          if (row.qc_status === 'failed') row.qc_status = 'passed';
        }
      }

      updated[index] = row;

      // Sync summary values with primary finished good / overall batch
      const mainRow = updated.find(r => r.item_type === 'finished_good') || updated[0];
      const anyFailed = updated.some(r => Number(r.rejected_qty) > 0 || r.qc_status === 'failed' || r.qc_status === 'rework');

      if (mainRow) {
        setPassedQty(mainRow.passed_qty);
        setRejectedQty(mainRow.rejected_qty);
      }
      setQcStatus(anyFailed ? 'failed' : 'passed');

      const defectNotes = updated
        .filter(r => (Number(r.rejected_qty) > 0 || r.qc_status !== 'passed') && r.defect_reason)
        .map(r => `${r.product_sku || r.product_name}: ${r.defect_reason}`)
        .join('; ');
      if (defectNotes) {
        setDefectReason(defectNotes);
      }

      return updated;
    });
  };

  const handleQCSubmit = async (e) => {
    e.preventDefault();
    if (!activeStageForQC) return;

    if (!passedQty && Number(passedQty) !== 0) {
      alert('Please specify passed quantity.');
      return;
    }
    if (!qcRemarks) {
      alert('Inspection verification remarks are mandatory.');
      return;
    }

    setSubmittingQC(true);
    try {
      const payload = {
        work_order_id: workOrderId,
        stage_id: activeStageForQC.id,
        passed_qty: Number(passedQty),
        rejected_qty: Number(rejectedQty),
        qc_status: qcStatus,
        remarks: qcRemarks,
        defect_reason: defectReason || (Number(rejectedQty) > 0 ? 'Surface / tolerance defect' : null),
        inspector_name: inspectorName,
        product_items: productVerificationRows,
        inspection_date: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };

      const res = await api.verifyStageQC(payload);
      if (qcMediaFiles.length > 0 && activeStageForQC?.id) {
        await api.uploadMedia('qc_stage', activeStageForQC.id, qcMediaFiles, currentUser?.id || 1);
      }
      alert(res.message);
      setQcMediaFiles([]);
      setActiveStageForQC(null);
      setQcRemarks('');
      setDefectReason('');
      loadDetails();
    } catch (err) {
      alert('QC verification failed: ' + err.message);
    } finally {
      setSubmittingQC(false);
    }
  };

  if (loading || !wo) {
    return (
      <div className="p-8 text-center text-xs text-slate-500 bg-white rounded-lg border border-slate-200">
        <Clock className="h-4 w-4 animate-spin mx-auto text-slate-700 mb-1" />
        Loading 5-Stage Work Order Lifecycle...
      </div>
    );
  }

  const isLevel5Completed = wo.status === 'completed' || (wo.current_level === 5 && wo.stages?.find(s => s.level_number === 5)?.status === 'completed');

  return (
    <div className="space-y-3.5">
      
      {/* Top bar (ShadCN style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            title="Back to Manufacturing"
            aria-label="Back to Manufacturing"
            className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                {wo.work_order_number}
              </span>
              <h1 className="text-sm font-semibold text-slate-900">
                {wo.product_name}
              </h1>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Client: {wo.customer_name} • PO: {wo.po_number} • Target: {wo.target_quantity} {wo.uom}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAudit && (
            <button
              onClick={() => onOpenAudit('qc')}
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs"
            >
              <History className="h-3.5 w-3.5" /> Stage QC Audit
            </button>
          )}

          {isLevel5Completed && hasPermission(currentUser, 'dispatch', 'manage') && (
            <button
              onClick={() => onDispatchReady(wo)}
              className="h-8 px-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-medium text-xs shadow-xs flex items-center gap-1.5"
            >
              <Truck className="h-3.5 w-3.5" /> Dispatch (Stage 10)
            </button>
          )}
        </div>
      </div>

      {/* 5-STAGE SEQUENTIAL PIPELINE (ShadCN style) */}
      <div className="bg-white rounded-lg p-3.5 border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
              <Hammer className="h-3.5 w-3.5 text-slate-700" />
              5 Sequential Stages & QC Verification Quality Gates
            </h2>
            <p className="text-[11px] text-slate-500">
              Each level must undergo physical inspection before advancing.
            </p>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-700">
            {wo.status === 'completed' ? 'All 5 Levels Cleared' : `Current: Level ${wo.current_level}`}
          </span>
        </div>

        {/* Stages list */}
        <div className="space-y-2">
          {wo.stages?.map((stage) => {
            const isCompleted = stage.status === 'completed';
            const isInProgress = stage.status === 'in_progress';
            const isPending = stage.status === 'pending';

            return (
              <div
                key={stage.id}
                className={`p-3 rounded-md border transition-colors ${
                  isCompleted
                    ? 'bg-slate-50/40 border-slate-200'
                    : (isInProgress
                        ? 'bg-sky-50/40 border-sky-300 ring-1 ring-sky-300'
                        : 'bg-slate-50/20 border-slate-100 opacity-60')
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className={`h-6 w-6 rounded text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                      isCompleted ? 'bg-emerald-600 text-white' : (isInProgress ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-600')
                    }`}>
                      L{stage.level_number}
                    </span>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-semibold text-slate-900">{stage.stage_name}</h3>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded capitalize ${
                          isCompleted ? 'text-emerald-700 bg-emerald-50' : (isInProgress ? 'text-sky-700 bg-sky-50' : 'text-slate-500')
                        }`}>
                          {stage.status?.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{stage.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
                    {isCompleted && (
                      <div className="text-right text-[11px]">
                        <span className="font-semibold text-emerald-700 flex items-center justify-end gap-1">
                          <CheckCircle2 className="h-3 w-3" /> QC Passed ({stage.passed_qty} units)
                        </span>
                        {stage.rejected_qty > 0 && (
                          <span className="text-[10px] text-rose-600 font-medium block">
                            Rejected: {stage.rejected_qty}
                          </span>
                        )}
                      </div>
                    )}

                    {isInProgress && hasPermission(currentUser, 'qc', 'inspect') && (
                      <button
                        onClick={() => openQCModal(stage)}
                        className="h-7 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-[11px] font-medium flex items-center gap-1 shadow-xs"
                      >
                        <ClipboardCheck className="h-3 w-3" /> Conduct Level {stage.level_number} QC
                      </button>
                    )}

                    {isPending && (
                      <span className="text-[11px] text-slate-400">Awaiting prior level</span>
                    )}
                  </div>
                </div>

                {/* Per-Product Rows Verification Status on each Stage */}
                <div className="mt-2.5 pt-2 border-t border-slate-200/60 overflow-x-auto">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      Product Verification Status & Quantities ({stage.inspected_items?.length || wo.product_components?.length || 1} rows)
                    </span>
                    {isCompleted && (
                      <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        Inspected & Verified by {stage.inspector_name}
                      </span>
                    )}
                  </div>

                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="text-slate-500 font-medium border-b border-slate-200/70 text-[10px]">
                        <th className="py-1 px-2 w-8 text-center">#</th>
                        <th className="py-1 pr-2">Product / Component Row</th>
                        <th className="py-1 px-2">Type</th>
                        <th className="py-1 px-2 text-center">Batch Target</th>
                        <th className="py-1 px-2 text-center">Passed Qty</th>
                        <th className="py-1 px-2 text-center">Rejected Qty</th>
                        <th className="py-1 px-2 text-center">Stage Status</th>
                        <th className="py-1 pl-2">Inspector Observations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(stage.inspected_items && stage.inspected_items.length > 0
                        ? stage.inspected_items
                        : (wo.product_components || [{ product_id: wo.product_id, name: wo.product_name, sku: wo.product_sku, item_type: 'finished_good', target_quantity: wo.target_quantity }])
                      ).map((item, idx) => {
                        const passedCount = isCompleted ? (item.passed_qty ?? item.target_quantity) : (isInProgress ? 'In Inspection' : 'Queued');
                        const rejectedCount = isCompleted ? (item.rejected_qty ?? 0) : 0;
                        const statusText = isCompleted ? (item.qc_status || 'passed') : (isInProgress ? 'in_progress' : 'queued');

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-1 px-2 text-center font-mono text-[10px] text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="py-1 pr-2">
                              <span className="font-semibold text-slate-900">{item.product_name || item.name}</span>
                              <span className="font-mono text-[9px] text-slate-400 block">{item.product_sku || item.sku}</span>
                            </td>
                            <td className="py-1 px-2">
                              <span className={`text-[9px] font-medium px-1.5 py-0.2 rounded border ${
                                item.item_type === 'sub_product'
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {item.item_type === 'sub_product' ? 'Sub-Product' : 'Finished Good'}
                              </span>
                            </td>
                            <td className="py-1 px-2 text-center font-medium text-slate-700">
                              {item.target_quantity} {wo.uom}
                            </td>
                            <td className="py-1 px-2 text-center font-semibold text-emerald-700">
                              {passedCount} {isCompleted ? wo.uom : ''}
                            </td>
                            <td className="py-1 px-2 text-center">
                              {Number(rejectedCount) > 0 ? (
                                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1 py-0.2 rounded border border-rose-200">
                                  -{rejectedCount} {wo.uom}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">0</span>
                              )}
                            </td>
                            <td className="py-1 px-2 text-center">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded capitalize ${
                                statusText === 'passed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                (statusText === 'in_progress' ? 'bg-sky-50 text-sky-700 border border-sky-200' :
                                (statusText === 'failed' || statusText === 'rework' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-500'))
                              }`}>
                                {statusText?.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-1 pl-2 text-slate-500 text-[10px]">
                              {item.remarks || item.defect_reason || (isCompleted ? 'Cleared stage specifications' : 'Awaiting physical inspection')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(stageMediaMap[stage.id] || []).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200/70 flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">Stage Evidence:</span>
                      <MediaGallery attachments={stageMediaMap[stage.id]} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* QC VERIFICATION MODAL FORM (PER-PRODUCT ROW VERIFICATION) */}
      {activeStageForQC && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-4xl w-full p-4 sm:p-5 shadow-2xl border border-slate-200 text-slate-800 my-auto flex flex-col max-h-[92vh]">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-5 px-2 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center">
                    LEVEL {activeStageForQC.level_number}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Quality Control & Product Row Verification
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Stage: <span className="font-medium text-slate-800">{activeStageForQC.stage_name}</span> &bull; Work Order: <span className="font-mono text-slate-700">{wo.wo_number}</span> ({wo.product_name})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveStageForQC(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Instruction Notice */}
            <div className="mb-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200/80 text-[11px] text-slate-600 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-slate-700 shrink-0" />
              <span>
                Verify physical counts and tolerances for <strong>each product and component row</strong>. Any defect count or failed status requires a defect reason.
              </span>
            </div>

            <form onSubmit={handleQCSubmit} className="flex-1 flex flex-col min-h-0 space-y-3">
              {/* Product Rows Verification Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden flex-1 min-h-0 flex flex-col">
                <div className="overflow-y-auto max-h-56 sm:max-h-64">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                      <tr>
                        <th className="py-2 px-2 w-8 text-center">#</th>
                        <th className="py-2 px-3">Product / Component Row</th>
                        <th className="py-2 px-2 text-center">Type</th>
                        <th className="py-2 px-2 text-center">Target Qty</th>
                        <th className="py-2 px-2 text-center w-20">Passed Qty</th>
                        <th className="py-2 px-2 text-center w-20">Rejected Qty</th>
                        <th className="py-2 px-2 text-center w-28">QC Verdict</th>
                        <th className="py-2 px-3">Defect Reason / Observation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {productVerificationRows.map((row, idx) => {
                        const isFinishedGood = row.item_type === 'finished_good';
                        const isFailed = row.qc_status === 'failed' || Number(row.rejected_qty) > 0;

                        return (
                          <tr key={idx} className={isFailed ? 'bg-rose-50/30' : 'hover:bg-slate-50/50'}>
                            <td className="py-2 px-2 text-center font-mono text-[11px] text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3">
                              <span className="font-semibold text-slate-900 block leading-tight">{row.product_name}</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-[10px] text-slate-500">{row.product_sku}</span>
                                {row.role_notes && (
                                  <span className="text-[10px] text-slate-400 italic truncate max-w-xs">&bull; {row.role_notes}</span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                                isFinishedGood
                                  ? 'bg-slate-100 text-slate-700 border-slate-200'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              }`}>
                                {isFinishedGood ? 'Finished Good' : 'Sub-Product'}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-center font-medium text-slate-700">
                              {row.target_quantity} <span className="text-[10px] text-slate-400">{row.uom || wo.uom}</span>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                min="0"
                                max={row.target_quantity}
                                required
                                value={row.passed_qty}
                                onChange={(e) => handleRowChange(idx, 'passed_qty', e.target.value)}
                                className="w-16 p-1 text-center border border-slate-200 rounded font-semibold text-emerald-700 focus:ring-1 focus:ring-slate-900 focus:outline-none text-xs"
                              />
                            </td>
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                min="0"
                                max={row.target_quantity}
                                required
                                value={row.rejected_qty}
                                onChange={(e) => handleRowChange(idx, 'rejected_qty', e.target.value)}
                                className={`w-16 p-1 text-center border rounded font-semibold text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none ${
                                  Number(row.rejected_qty) > 0 ? 'border-rose-300 text-rose-700 bg-rose-50/50' : 'border-slate-200 text-slate-700'
                                }`}
                              />
                            </td>
                            <td className="py-2 px-2 text-center">
                              <select
                                value={row.qc_status}
                                onChange={(e) => handleRowChange(idx, 'qc_status', e.target.value)}
                                className={`w-full p-1 rounded border text-[11px] font-semibold focus:outline-none ${
                                  row.qc_status === 'passed' 
                                    ? 'border-emerald-200 text-emerald-700 bg-emerald-50/40' 
                                    : 'border-rose-200 text-rose-700 bg-rose-50/40'
                                }`}
                              >
                                <option value="passed">Passed (OK)</option>
                                <option value="rework">Rework Required</option>
                                <option value="failed">Rejected (Defect)</option>
                              </select>
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                placeholder={Number(row.rejected_qty) > 0 ? 'Specify defect (e.g. solder bridge, scratch)...' : 'Optional notes...'}
                                value={row.defect_reason || ''}
                                required={Number(row.rejected_qty) > 0}
                                onChange={(e) => handleRowChange(idx, 'defect_reason', e.target.value)}
                                className={`w-full p-1 border rounded text-xs focus:outline-none ${
                                  Number(row.rejected_qty) > 0 && !row.defect_reason
                                    ? 'border-rose-300 bg-rose-50/30'
                                    : 'border-slate-200'
                                }`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(stageMediaMap[stage.id] || []).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200/70 flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">Stage Evidence:</span>
                      <MediaGallery attachments={stageMediaMap[stage.id]} />
                    </div>
                  )}
                </div>
              </div>

              {/* Overall Decision and Inspector Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Overall Stage Decision *
                  </label>
                  <select
                    value={qcStatus}
                    onChange={(e) => setQcStatus(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded-md font-semibold text-xs bg-white text-slate-800"
                  >
                    <option value="passed">PASSED (Advance to Next Stage)</option>
                    <option value="failed">FAILED (Hold / Floor Rework)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Quality Inspector Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={inspectorName}
                    onChange={(e) => setInspectorName(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded-md text-xs bg-white text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Stage Verification Remarks *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Verified all dimensions and sub-assemblies against specs"
                    value={qcRemarks}
                    onChange={(e) => setQcRemarks(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded-md text-xs bg-white text-slate-800"
                  />
                </div>
              </div>

              <MediaUploader
                files={qcMediaFiles}
                onChange={setQcMediaFiles}
                label="QC Stage Inspection Evidence (Photos, Videos, Test Reports)"
              />

              {/* Action Buttons & Totals Summary */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500">
                    Inspecting: <strong className="text-slate-800">{productVerificationRows.length} Product & Component Rows</strong>
                  </span>
                  <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {productVerificationRows.reduce((acc, r) => acc + (Number(r.passed_qty) || 0), 0)} Passed Units
                  </span>
                  {productVerificationRows.some(r => Number(r.rejected_qty) > 0) && (
                    <span className="text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      {productVerificationRows.reduce((acc, r) => acc + (Number(r.rejected_qty) || 0), 0)} Rejected Units
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={submittingQC}
                    onClick={() => setActiveStageForQC(null)}
                    className="h-8 px-3 border border-slate-200 text-slate-600 rounded-md font-medium text-xs hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingQC}
                    className="h-8 px-4 bg-slate-900 text-white rounded-md font-medium text-xs hover:bg-slate-800 flex items-center gap-1.5 shadow-xs"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>{submittingQC ? 'Saving Verification...' : 'Confirm Stage QC Verification'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
