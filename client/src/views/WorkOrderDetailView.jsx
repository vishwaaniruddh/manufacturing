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
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { hasPermission } from '../utils/rbac';
import { MediaUploader, MediaGallery } from '../components/MediaUploader';

export default function WorkOrderDetailView({ currentUser, workOrderId, onBack, onDispatchReady, onOpenAudit }) {
  const [wo, setWo] = useState(null);
  const [loading, setLoading] = useState(true);

  // Per-component QC Verification modal state (no single Overall Stage Decision!)
  const [activeStageForQC, setActiveStageForQC] = useState(null);
  const [productVerificationRows, setProductVerificationRows] = useState([]);
  const [qcRemarks, setQcRemarks] = useState('');
  const [inspectorName, setInspectorName] = useState(currentUser?.name || 'Sunil Deshmukh (Senior QC)');
  const [qcMediaFiles, setQcMediaFiles] = useState([]);
  const [stageMediaMap, setStageMediaMap] = useState({});
  const [componentMediaMap, setComponentMediaMap] = useState({});
  const [submittingQC, setSubmittingQC] = useState(false);

  const loadDetails = async () => {
    setLoading(true);
    try {
      const [res, mRes, cRes] = await Promise.all([
        api.getWorkOrder(workOrderId),
        api.getMedia('qc_stage'),
        api.getMedia('qc_component')
      ]);
      setWo(res.data);
      const grouped = {};
      (mRes.data || []).forEach((m) => {
        grouped[m.entity_id] = grouped[m.entity_id] || [];
        grouped[m.entity_id].push(m);
      });
      setStageMediaMap(grouped);

      const compGrouped = {};
      (cRes.data || []).forEach((m) => {
        const lvlTag = String(m.doc_label || '').trim();
        const key = `${m.entity_id}:${lvlTag}`;
        compGrouped[key] = compGrouped[key] || [];
        compGrouped[key].push(m);
      });
      setComponentMediaMap(compGrouped);
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
    const stageItems = stage.inspected_items || [];
    const actionableItems = stageItems.filter(
      (it) => it.component_stage_state === 'ready_for_qc' || it.component_stage_state === 'stuck_rework'
    );

    const fallbackComps = (wo.product_components || []).filter(
      (c) =>
        c.component_status !== 'completed' &&
        Number(c.current_level || wo.current_level) === Number(stage.level_number)
    );

    const sourceList = actionableItems.length > 0 ? actionableItems : fallbackComps;

    const initialRows = sourceList.map((c) => {
      const totalTarget = Number(c.target_quantity || wo.target_quantity);
      const inspectable = Number(c.inspectable_qty ?? totalTarget);
      return {
        component_id: c.component_id,
        product_id: c.product_id,
        product_name: c.product_name,
        product_sku: c.product_sku,
        item_type: c.item_type || 'finished_good',
        role_notes: c.role_notes || (c.item_type === 'finished_good' ? 'Primary Finished Good' : 'Modular Sub-Assembly'),
        uom: c.uom || wo.uom,
        target_quantity: inspectable,
        total_target_quantity: totalTarget,
        passed_qty: inspectable,
        rejected_qty: 0,
        qc_status: 'passed',
        previous_state: c.component_stage_state || 'ready_for_qc',
        defect_reason: c.component_stage_state === 'stuck_rework' ? (c.defect_reason || '') : '',
        remarks: `Level ${stage.level_number} specification verified`,
        mediaFiles: []
      };
    });

    setActiveStageForQC(stage);
    setProductVerificationRows(initialRows);
    setQcMediaFiles([]);
    setQcRemarks(`Level ${stage.level_number} component-wise QC verification completed`);
  };

  const handleRowChange = (index, field, value) => {
    setProductVerificationRows((prev) => {
      const updated = [...prev];
      const row = { ...updated[index] };
      const target = Number(row.target_quantity) || 0;

      if (field === 'qc_status') {
        row.qc_status = value;
        if (value === 'passed') {
          row.passed_qty = target;
          row.rejected_qty = 0;
          row.defect_reason = '';
        } else {
          if (Number(row.rejected_qty) === 0) {
            row.rejected_qty = target;
            row.passed_qty = 0;
          }
        }
      } else if (field === 'passed_qty') {
        const passed = Math.min(target, Math.max(0, Number(value) || 0));
        const rej = Math.max(0, target - passed);
        row.passed_qty = passed;
        row.rejected_qty = rej;
        if (passed === target) {
          row.qc_status = 'passed';
          row.defect_reason = '';
        } else {
          row.qc_status = passed > 0 ? 'rework' : 'failed';
        }
      } else if (field === 'rejected_qty') {
        const rej = Math.min(target, Math.max(0, Number(value) || 0));
        const passed = Math.max(0, target - rej);
        row.rejected_qty = rej;
        row.passed_qty = passed;
        if (rej === 0) {
          row.qc_status = 'passed';
          row.defect_reason = '';
        } else {
          row.qc_status = passed > 0 ? 'rework' : 'failed';
        }
      } else {
        row[field] = value;
      }

      updated[index] = row;
      return updated;
    });
  };

  const handleQCSubmit = async (e) => {
    e.preventDefault();
    if (!activeStageForQC) return;

    if (productVerificationRows.length === 0) {
      alert('No components ready for inspection at this stage.');
      return;
    }

    for (let i = 0; i < productVerificationRows.length; i++) {
      const r = productVerificationRows[i];
      if ((Number(r.rejected_qty) > 0 || r.qc_status !== 'passed') && !String(r.defect_reason || '').trim()) {
        alert(`Please specify a defect / rework reason for "${r.product_name}" (Row #${i + 1}).`);
        return;
      }
    }

    if (!qcRemarks.trim()) {
      alert('Stage verification remarks are mandatory.');
      return;
    }

    const totalPassed = productVerificationRows.reduce((acc, r) => acc + (Number(r.passed_qty) || 0), 0);
    const totalRejected = productVerificationRows.reduce((acc, r) => acc + (Number(r.rejected_qty) || 0), 0);
    const defectNotes = productVerificationRows
      .filter((r) => r.qc_status !== 'passed' && r.defect_reason)
      .map((r) => `${r.product_sku || r.product_name}: ${r.defect_reason}`)
      .join('; ');

    setSubmittingQC(true);
    try {
      const payload = {
        work_order_id: workOrderId,
        stage_id: activeStageForQC.id,
        per_component: true,
        passed_qty: totalPassed,
        rejected_qty: totalRejected,
        remarks: qcRemarks.trim(),
        defect_reason: defectNotes || null,
        inspector_id: currentUser?.id || 1,
        inspector_name: inspectorName,
        product_items: productVerificationRows.map(({ mediaFiles: _mediaFiles, ...rest }) => rest),
        inspection_date: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };

      const res = await api.verifyStageQC(payload);
      const levelTag = `L${activeStageForQC.level_number}`;
      const uploadTasks = [];

      if (qcMediaFiles.length > 0 && activeStageForQC?.id) {
        uploadTasks.push(
          api.uploadMedia('qc_stage', activeStageForQC.id, qcMediaFiles, currentUser?.id || 1, levelTag)
        );
      }

      productVerificationRows.forEach((row) => {
        if (row.mediaFiles?.length > 0 && row.component_id) {
          uploadTasks.push(
            api.uploadMedia('qc_component', row.component_id, row.mediaFiles, currentUser?.id || 1, levelTag)
          );
        }
      });

      if (uploadTasks.length > 0) {
        await Promise.all(uploadTasks);
      }

      alert(res.message);
      setQcMediaFiles([]);
      setActiveStageForQC(null);
      setQcRemarks('');
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

  const components = wo.product_components || [];
  const reworkComponents = components.filter((c) => c.component_status === 'rework');
  const completedComponents = components.filter((c) => c.component_status === 'completed');
  const isLevel5Completed =
    wo.status === 'completed' || (components.length > 0 && completedComponents.length === components.length);

  // Summary of active levels across components
  const activeLevelGroups = {};
  components.forEach((c) => {
    const label =
      c.component_status === 'completed'
        ? 'Completed'
        : c.component_status === 'rework'
        ? `L${c.current_level} Rework`
        : `L${c.current_level}`;
    activeLevelGroups[label] = (activeLevelGroups[label] || 0) + 1;
  });

  const advancingUnits = productVerificationRows.reduce((acc, r) => acc + (Number(r.passed_qty) || 0), 0);
  const heldUnits = productVerificationRows.reduce((acc, r) => acc + (Number(r.rejected_qty) || 0), 0);

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
            className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-semibold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                {wo.work_order_number}
              </span>
              <h1 className="text-sm font-semibold text-slate-900">{wo.product_name}</h1>
              {reworkComponents.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  <AlertTriangle className="h-3 w-3 text-amber-600" /> {reworkComponents.length} Component Rework Held
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Client: {wo.customer_name} • PO: {wo.po_number} • Target: {wo.target_quantity} {wo.uom}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenAudit && (
            <button
              type="button"
              onClick={() => onOpenAudit('qc')}
              className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-medium flex items-center gap-1 shadow-xs cursor-pointer"
            >
              <History className="h-3.5 w-3.5" /> Stage QC Audit
            </button>
          )}

          {isLevel5Completed && hasPermission(currentUser, 'dispatch', 'manage') && (
            <button
              type="button"
              onClick={() => onDispatchReady(wo)}
              className="h-8 px-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-medium text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Truck className="h-3.5 w-3.5" /> Dispatch (Stage 10)
            </button>
          )}
        </div>
      </div>

      {/* 5-STAGE SEQUENTIAL PIPELINE (Independent Per-Component Progression) */}
      <div className="bg-white rounded-lg p-3.5 border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
              <Hammer className="h-3.5 w-3.5 text-slate-700" />
              5 Sequential Stages &amp; Independent Component QC Gates
            </h2>
            <p className="text-[11px] text-slate-500">
              Passed components immediately advance to the next level while rejected/rework components remain at their current level for rework.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {Object.entries(activeLevelGroups).map(([lbl, cnt]) => (
              <span
                key={lbl}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                  lbl.includes('Rework')
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : lbl === 'Completed'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-sky-50 text-sky-700 border-sky-200'
                }`}
              >
                {cnt} &times; {lbl}
              </span>
            ))}
          </div>
        </div>

        {/* Stages list */}
        <div className="space-y-2.5">
          {wo.stages?.map((stage) => {
            const isCompleted = stage.status === 'completed';
            const readyCount = Number(stage.ready_count || 0);
            const heldBelowCount = Number(stage.held_below_count || 0);
            const totalComponents = Number(stage.total_components || components.length || 1);
            const readyUnits = Number(stage.ready_units || 0);
            const pendingUnits = Number(stage.pending_units || 0);
            const reworkUnits = Number(stage.rework_units || 0);
            const passedUnits = Number(stage.passed_units || 0);
            const waitingUpstreamUnits = Number(stage.waiting_upstream_units || 0);
            const canInspect = Boolean(stage.can_inspect ?? (readyCount > 0 && readyUnits > 0));
            const isInProgress = stage.status === 'in_progress' || readyCount > 0 || passedUnits > 0;
            const hasReworkOnly = !isCompleted && readyUnits > 0 && pendingUnits === 0 && reworkUnits > 0;

            return (
              <div
                key={stage.id}
                className={`p-3 rounded-md border transition-colors ${
                  isCompleted
                    ? 'bg-slate-50/40 border-slate-200'
                    : hasReworkOnly
                    ? 'bg-amber-50/30 border-amber-300 ring-1 ring-amber-200'
                    : isInProgress
                    ? 'bg-sky-50/40 border-sky-300 ring-1 ring-sky-300'
                    : 'bg-slate-50/30 border-slate-200/70 opacity-75'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`h-6 w-6 rounded text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                        isCompleted
                          ? 'bg-emerald-600 text-white'
                          : hasReworkOnly
                          ? 'bg-amber-500 text-white'
                          : isInProgress
                          ? 'bg-sky-500 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      L{stage.level_number}
                    </span>

                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-xs font-semibold text-slate-900">{stage.stage_name}</h3>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.2 rounded capitalize ${
                            isCompleted
                              ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                              : hasReworkOnly
                              ? 'text-amber-800 bg-amber-50 border border-amber-200'
                              : isInProgress
                              ? 'text-sky-700 bg-sky-50 border border-sky-200'
                              : 'text-slate-500 bg-slate-100'
                          }`}
                        >
                          {isCompleted
                            ? 'Completed'
                            : hasReworkOnly
                            ? `${reworkUnits} Units Rework`
                            : pendingUnits > 0
                            ? `${pendingUnits} Units Ready`
                            : isInProgress
                            ? 'Active'
                            : 'Pending'}
                        </span>
                        {passedUnits > 0 && !isCompleted && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {passedUnits} Units &rarr; {stage.level_number < 5 ? `L${stage.level_number + 1}` : 'Done'}
                          </span>
                        )}
                        {reworkUnits > 0 && pendingUnits > 0 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200">
                            {reworkUnits} Units Rework Held
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{stage.description}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto text-xs">
                    {isCompleted && (
                      <div className="text-right text-[11px]">
                        <span className="font-semibold text-emerald-700 flex items-center justify-end gap-1">
                          <CheckCircle2 className="h-3 w-3" /> All {passedUnits || totalComponents} Cleared
                        </span>
                        {stage.rejected_qty > 0 && (
                          <span className="text-[10px] text-rose-600 font-medium block">
                            Prior Rejections: {stage.rejected_qty}
                          </span>
                        )}
                      </div>
                    )}

                    {canInspect && hasPermission(currentUser, 'qc', 'inspect') && (
                      <button
                        type="button"
                        onClick={() => openQCModal(stage)}
                        className={`h-7 px-3 rounded-md text-[11px] font-medium flex items-center gap-1 shadow-xs cursor-pointer text-white ${
                          hasReworkOnly
                            ? 'bg-amber-600 hover:bg-amber-500'
                            : 'bg-slate-900 hover:bg-slate-800'
                        }`}
                      >
                        <ClipboardCheck className="h-3 w-3" />
                        {hasReworkOnly
                          ? `Re-Inspect Level ${stage.level_number} (${reworkUnits} Units)`
                          : `Conduct Level ${stage.level_number} QC (${readyUnits} Units)`}
                      </button>
                    )}

                    {!isCompleted && !canInspect && (
                      <span className="text-[11px] text-slate-400">
                        {waitingUpstreamUnits > 0
                          ? `${waitingUpstreamUnits} unit(s) at prior level`
                          : heldBelowCount > 0
                          ? `${heldBelowCount} component(s) at prior level`
                          : 'Awaiting prior level'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Per-Component Progression Table on Each Stage */}
                <div className="mt-2.5 pt-2 border-t border-slate-200/60 overflow-x-auto">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      Component Status at Level {stage.level_number} ({(stage.inspected_items || components).length} rows)
                    </span>
                    {stage.inspector_name && (
                      <span className="text-[10px] text-slate-600 font-medium bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                        Last Inspected by {stage.inspector_name}
                        {stage.inspection_runs > 1 ? ` (${stage.inspection_runs} runs)` : ''}
                      </span>
                    )}
                  </div>

                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="text-slate-500 font-medium border-b border-slate-200/70 text-[10px]">
                        <th className="py-1 px-2 w-8 text-center">#</th>
                        <th className="py-1 pr-2">Product / Component Row</th>
                        <th className="py-1 px-2">Type</th>
                        <th className="py-1 px-2 text-center">At Level / Target</th>
                        <th className="py-1 px-2 text-center">Passed Qty</th>
                        <th className="py-1 px-2 text-center">Rework / Rejected</th>
                        <th className="py-1 px-2 text-center">Level Status</th>
                        <th className="py-1 px-2">Media Proof</th>
                        <th className="py-1 pl-2">Inspector Observations / Defect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(stage.inspected_items && stage.inspected_items.length > 0
                        ? stage.inspected_items
                        : components
                      ).map((item, idx) => {
                        const cState = item.component_stage_state;
                        const clearedHere = cState === 'passed_next' || isCompleted;
                        const stuckHere = cState === 'stuck_rework';
                        const readyHere = cState === 'ready_for_qc';
                        const partialPassedWait = cState === 'partial_passed_waiting';
                        const inspectableQty = Number(item.inspectable_qty ?? 0);
                        const rowPassedQty = Number(item.passed_qty ?? 0);
                        const rowReworkQty = Number(item.rework_qty ?? item.rejected_qty ?? 0);
                        const uomLabel = item.uom || wo.uom;
                        const rowMedia = componentMediaMap[`${item.component_id}:L${stage.level_number}`] || [];

                        return (
                          <tr key={`${item.product_id}-${item.item_type}-${idx}`} className={stuckHere ? 'bg-rose-50/40' : 'hover:bg-slate-50/50'}>
                            <td className="py-1.5 px-2 text-center font-mono text-[10px] text-slate-400">{idx + 1}</td>
                            <td className="py-1.5 pr-2">
                              <span className="font-semibold text-slate-900">{item.product_name || item.name}</span>
                              <span className="font-mono text-[9px] text-slate-400 block">{item.product_sku || item.sku}</span>
                            </td>
                            <td className="py-1.5 px-2">
                              <span
                                className={`text-[9px] font-medium px-1.5 py-0.2 rounded border ${
                                  item.item_type === 'sub_product'
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {item.item_type === 'sub_product' ? 'Sub-Product' : 'Finished Good'}
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-center font-medium text-slate-700 whitespace-nowrap">
                              {inspectableQty > 0 ? (
                                <>
                                  <span className="font-semibold text-slate-900">{inspectableQty} {uomLabel}</span>
                                  {inspectableQty < item.target_quantity && (
                                    <span className="block text-[9px] text-slate-400">of {item.target_quantity} total</span>
                                  )}
                                </>
                              ) : (
                                <span>{item.target_quantity} {uomLabel}</span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-center font-semibold text-emerald-700 whitespace-nowrap">
                              {rowPassedQty > 0 ? (
                                `${rowPassedQty} ${uomLabel}`
                              ) : readyHere ? (
                                <span className="text-sky-700 font-medium">Ready ({inspectableQty})</span>
                              ) : stuckHere ? (
                                `0 ${uomLabel}`
                              ) : (
                                <span className="text-slate-400 font-normal">Waiting</span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              {rowReworkQty > 0 ? (
                                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1 py-0.2 rounded border border-rose-200">
                                  -{rowReworkQty} {uomLabel}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">0</span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-center whitespace-nowrap">
                              {clearedHere ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  {stage.level_number === 5 ? 'Completed L5' : `Passed -> L${stage.level_number + 1}`}
                                </span>
                              ) : stuckHere ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  {rowPassedQty > 0 && (
                                    <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      {rowPassedQty} &rarr; L{Math.min(5, stage.level_number + 1)}
                                    </span>
                                  )}
                                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                    Rework ({rowReworkQty})
                                  </span>
                                </div>
                              ) : readyHere ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                                  Ready at L{stage.level_number} ({inspectableQty})
                                </span>
                              ) : partialPassedWait ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  {rowPassedQty} &rarr; L{Math.min(5, stage.level_number + 1)} (Wait {item.upstream_waiting_qty || 0})
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                  At Level {item.upstream_level || item.current_component_level || '?'}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2">
                              <MediaGallery attachments={rowMedia} />
                            </td>
                            <td className="py-1.5 pl-2 text-slate-600 text-[10px]">
                              {stuckHere && item.defect_reason ? (
                                <span className="text-rose-700 font-medium">{item.defect_reason}</span>
                              ) : (
                                item.remarks || (clearedHere ? 'Cleared stage specifications' : 'Awaiting physical inspection')
                              )}
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

      {/* PER-COMPONENT QC VERIFICATION MODAL (NO OVERALL STAGE DECISION DROPDOWN) */}
      {activeStageForQC && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-6xl w-full p-4 sm:p-5 shadow-2xl border border-slate-200 text-slate-800 my-auto flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-5 px-2 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center">
                    LEVEL {activeStageForQC.level_number}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Component-Wise Quality Control Verification
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Stage: <span className="font-medium text-slate-800">{activeStageForQC.stage_name}</span> &bull; Work Order:{' '}
                  <span className="font-mono text-slate-700">{wo.work_order_number || wo.wo_number}</span> ({wo.product_name})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveStageForQC(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Independent Progression Notice */}
            <div className="mb-3 px-3 py-2 bg-sky-50/70 rounded-lg border border-sky-200/80 text-[11px] text-slate-700 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-sky-700 shrink-0" />
                <span>
                  Inspect each component independently: <strong>Passed</strong> rows proceed directly to{' '}
                  <strong>{activeStageForQC.level_number < 5 ? `Level ${activeStageForQC.level_number + 1}` : 'Final Completion'}</strong>,
                  while <strong>Rework / Rejected</strong> rows stay at <strong>Level {activeStageForQC.level_number}</strong>.
                </span>
              </div>
              {Number(activeStageForQC.held_below_count || 0) > 0 && (
                <span className="shrink-0 px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[10px]">
                  {activeStageForQC.held_below_count} Held Earlier
                </span>
              )}
            </div>

            <form onSubmit={handleQCSubmit} className="flex-1 flex flex-col min-h-0 space-y-3">
              {/* Product Rows Verification Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden flex-1 min-h-0 flex flex-col">
                <div className="overflow-y-auto max-h-60 sm:max-h-72">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                      <tr>
                        <th className="py-2 px-2 w-8 text-center">#</th>
                        <th className="py-2 px-3">Product / Component Row</th>
                        <th className="py-2 px-2 text-center">Type</th>
                        <th className="py-2 px-2 text-center">Target Qty</th>
                        <th className="py-2 px-2 text-center w-20">Passed Qty</th>
                        <th className="py-2 px-2 text-center w-20">Rejected Qty</th>
                        <th className="py-2 px-2 text-center w-36">Row QC Verdict &amp; Flow</th>
                        <th className="py-2 px-3">Defect / Rework Reason</th>
                        <th className="py-2 px-2.5">Media Proof (Opt.)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {productVerificationRows.map((row, idx) => {
                        const isFinishedGood = row.item_type === 'finished_good';
                        const isHeld = row.qc_status !== 'passed' || Number(row.rejected_qty) > 0;
                        const nextLvlLabel =
                          activeStageForQC.level_number < 5
                            ? `Proceeds -> L${activeStageForQC.level_number + 1}`
                            : 'Completes L5';

                        return (
                          <tr key={idx} className={isHeld ? 'bg-rose-50/35' : 'hover:bg-slate-50/50'}>
                            <td className="py-2 px-2 text-center font-mono text-[11px] text-slate-400">{idx + 1}</td>
                            <td className="py-2 px-3">
                              <span className="font-semibold text-slate-900 block leading-tight">{row.product_name}</span>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-[10px] text-slate-500">{row.product_sku}</span>
                                {row.previous_state === 'stuck_rework' && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                                    Re-Inspection
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${
                                  isFinishedGood
                                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                }`}
                              >
                                {isFinishedGood ? 'Finished Good' : 'Sub-Product'}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-center font-medium text-slate-700 whitespace-nowrap">
                              <span className="font-semibold text-slate-900">{row.target_quantity}</span>{' '}
                              <span className="text-[10px] text-slate-400">{row.uom || wo.uom}</span>
                              {row.total_target_quantity > row.target_quantity && (
                                <span className="block text-[9px] text-slate-400">of {row.total_target_quantity}</span>
                              )}
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
                                  Number(row.rejected_qty) > 0
                                    ? 'border-rose-300 text-rose-700 bg-rose-50/50'
                                    : 'border-slate-200 text-slate-700'
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
                                    : row.qc_status === 'rework'
                                    ? 'border-amber-300 text-amber-800 bg-amber-50/50'
                                    : 'border-rose-200 text-rose-700 bg-rose-50/40'
                                }`}
                              >
                                <option value="passed">Passed (OK)</option>
                                <option value="rework">Rework Required</option>
                                <option value="failed">Rejected (Defect)</option>
                              </select>
                              <div className="mt-1 flex flex-col items-center gap-0.5 text-[9px] font-semibold">
                                {Number(row.passed_qty) > 0 && (
                                  <span className="inline-flex items-center gap-0.5 text-emerald-700">
                                    <ArrowRight className="h-2.5 w-2.5" /> {row.passed_qty} {nextLvlLabel}
                                  </span>
                                )}
                                {Number(row.rejected_qty) > 0 && (
                                  <span className="text-rose-700">
                                    {row.rejected_qty} stay L{activeStageForQC.level_number}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                placeholder={isHeld ? 'Defect / rework reason *' : 'Optional notes...'}
                                value={row.defect_reason || ''}
                                required={isHeld}
                                onChange={(e) => handleRowChange(idx, 'defect_reason', e.target.value)}
                                className={`w-full p-1 border rounded text-xs focus:outline-none ${
                                  isHeld && !row.defect_reason ? 'border-rose-400 bg-rose-50/40' : 'border-slate-200'
                                }`}
                              />
                            </td>
                            <td className="py-2 px-2.5">
                              <MediaUploader
                                compact
                                mediaOnly
                                files={row.mediaFiles || []}
                                onChange={(nextFiles) => handleRowChange(idx, 'mediaFiles', nextFiles)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {(stageMediaMap[activeStageForQC.id] || []).length > 0 && (
                <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Existing Stage Evidence:</span>
                  <MediaGallery attachments={stageMediaMap[activeStageForQC.id]} />
                </div>
              )}

              {/* Inspector & Remarks (NO Overall Stage Decision Dropdown!) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200/80">
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
                    placeholder="e.g. Passed items moved to next stage; rework items retained"
                    value={qcRemarks}
                    onChange={(e) => setQcRemarks(e.target.value)}
                    className="w-full p-1.5 border border-slate-200 rounded-md text-xs bg-white text-slate-800"
                  />
                </div>
              </div>

              <MediaUploader
                files={qcMediaFiles}
                onChange={setQcMediaFiles}
                label="Stage-Wide Media Proof — Images, Videos &amp; Reports (Optional)"
              />

              {/* Live Per-Row Advancement Footer Summary */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500">
                    Inspecting <strong className="text-slate-800">{productVerificationRows.length}</strong> row(s):
                  </span>
                  {advancingUnits > 0 && (
                    <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {advancingUnits} Units Advancing &rarr;{' '}
                      {activeStageForQC.level_number < 5 ? `Level ${activeStageForQC.level_number + 1}` : 'Complete'}
                    </span>
                  )}
                  {heldUnits > 0 && (
                    <span className="text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      {heldUnits} Units Held at Level {activeStageForQC.level_number}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={submittingQC}
                    onClick={() => setActiveStageForQC(null)}
                    className="h-8 px-3 border border-slate-200 text-slate-600 rounded-md font-medium text-xs hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingQC}
                    className="h-8 px-4 bg-slate-900 text-white rounded-md font-medium text-xs hover:bg-slate-800 flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>{submittingQC ? 'Saving Verification...' : 'Confirm Component QC'}</span>
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
