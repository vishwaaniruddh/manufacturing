<?php
// api/controllers/QualityController.php
require_once dirname(__DIR__) . '/helpers/wo_stages.php';

class QualityController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
        WorkOrderStageTracker::ensureSchema($this->db);
    }

    public function getInspections() {
        $woId = $_GET['work_order_id'] ?? null;
        $sql = "
            SELECT qi.*, wo.work_order_number, wo.target_quantity,
                   ms.stage_name, p.name as product_name, c.company_name as customer_name
            FROM quality_inspections qi
            JOIN work_orders wo ON qi.work_order_id = wo.id
            JOIN manufacturing_stages ms ON qi.stage_id = ms.id
            JOIN products p ON wo.product_id = p.id
            JOIN purchase_orders po ON wo.po_id = po.id
            JOIN customers c ON po.customer_id = c.id
        ";
        $params = [];
        if ($woId) {
            $sql .= " WHERE qi.work_order_id = ?";
            $params[] = $woId;
        }
        $sql .= " ORDER BY qi.inspection_date DESC, qi.id DESC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        // Attach matching media proofs (stage, inspection, and per-component level photos/videos)
        $mediaRows = $this->db->query("
            SELECT ma.*, woc.work_order_id as comp_wo_id
            FROM media_attachments ma
            LEFT JOIN work_order_components woc
              ON ma.entity_type = 'qc_component' AND ma.entity_id = woc.id
            WHERE ma.entity_type IN ('qc_stage', 'qc_inspection', 'qc_component')
            ORDER BY ma.id DESC
        ")->fetchAll();

        $stageMedia = [];
        $inspMedia = [];
        $compMediaByWoLvl = [];
        foreach ($mediaRows as $m) {
            if ($m['entity_type'] === 'qc_stage') {
                $stageMedia[intval($m['entity_id'])][] = $m;
            } elseif ($m['entity_type'] === 'qc_inspection') {
                $inspMedia[intval($m['entity_id'])][] = $m;
            } elseif ($m['entity_type'] === 'qc_component' && !empty($m['comp_wo_id'])) {
                $lbl = trim((string)($m['doc_label'] ?? ''));
                $key = intval($m['comp_wo_id']) . ':' . $lbl;
                $compMediaByWoLvl[$key][] = $m;
            }
        }

        foreach ($rows as &$r) {
            $inspId = intval($r['id']);
            $stId = intval($r['stage_id']);
            $woKey = intval($r['work_order_id']) . ':L' . intval($r['level_number']);
            $merged = array_merge(
                $inspMedia[$inspId] ?? [],
                $compMediaByWoLvl[$woKey] ?? [],
                $stageMedia[$stId] ?? []
            );
            $r['attachments'] = $merged;
        }
        unset($r);

        Response::success("QC inspections fetched", $rows);
    }

    /**
     * Submit Per-Component, Per-Unit QC Verification for a stage.
     * Passed units immediately advance to Level+1 (or Completed at Level 5),
     * while rejected/rework units stay queued at the current level for rework.
     */
    public function verifyStage() {
        $b = Response::getBody();
        $woId = intval($b['work_order_id'] ?? 0);
        $stageId = !empty($b['stage_id']) ? intval($b['stage_id']) : 0;
        $levelParam = !empty($b['level']) ? intval($b['level']) : (!empty($b['level_number']) ? intval($b['level_number']) : 0);

        if ($stageId === 0 && $levelParam > 0 && $woId > 0) {
            $findStmt = $this->db->prepare("SELECT id FROM manufacturing_stages WHERE work_order_id = ? AND level_number = ?");
            $findStmt->execute([$woId, $levelParam]);
            $found = $findStmt->fetch();
            if ($found) {
                $stageId = intval($found['id']);
            }
        }

        $productItems = (!empty($b['product_items']) && is_array($b['product_items'])) ? $b['product_items'] : [];
        $perComponentMode = !empty($b['per_component']);

        $passedQtyInput = isset($b['passed_qty']) ? intval($b['passed_qty']) : (isset($b['units_passed']) ? intval($b['units_passed']) : null);
        $rejectedQtyInput = isset($b['rejected_qty']) ? intval($b['rejected_qty']) : (isset($b['units_rejected']) ? intval($b['units_rejected']) : 0);
        $remarks = trim($b['remarks'] ?? $b['inspector_remarks'] ?? 'Stage quality verification completed');

        if (empty($woId) || empty($stageId) || ($passedQtyInput === null && count($productItems) === 0)) {
            Response::error("Work Order ID, Stage ID / Level, and Inspection Data are required");
        }

        $defectReason = $b['defect_reason'] ?? null;
        $inspectorName = trim($b['inspector_name'] ?? 'System Admin');
        $inspectorId = Response::resolveUserId($this->db, $b['inspector_id'] ?? null);
        $inspectionDate = $b['inspection_date'] ?? date('Y-m-d H:i:s');

        $this->db->beginTransaction();
        try {
            $sStmt = $this->db->prepare("SELECT * FROM manufacturing_stages WHERE id = ? AND work_order_id = ?");
            $sStmt->execute([$stageId, $woId]);
            $stage = $sStmt->fetch();
            if (!$stage) {
                throw new Exception("Stage not found for this work order");
            }
            $levelNumber = intval($stage['level_number']);

            $woStmt = $this->db->prepare("SELECT * FROM work_orders WHERE id = ?");
            $woStmt->execute([$woId]);
            $wo = $woStmt->fetch();
            if (!$wo) {
                throw new Exception("Work order not found");
            }

            WorkOrderStageTracker::ensureSeeded($this->db, $woId, $wo);

            // Load current per-component unit pools queued at this level
            $lvlStmt = $this->db->prepare("
                SELECT wocs.*, woc.product_id, woc.item_type, woc.target_quantity as wo_target_qty
                FROM work_order_component_stages wocs
                JOIN work_order_components woc ON wocs.component_id = woc.id
                WHERE wocs.work_order_id = ? AND wocs.level_number = ?
                ORDER BY woc.id ASC
            ");
            $lvlStmt->execute([$woId, $levelNumber]);
            $lvlRows = $lvlStmt->fetchAll();

            $byCompId = [];
            $byKey = [];
            $activeAtLvl = [];
            foreach ($lvlRows as $lr) {
                $cid = intval($lr['component_id']);
                $byCompId[$cid] = $lr;
                $byKey[intval($lr['product_id']) . ':' . ($lr['item_type'] ?? 'finished_good')] = $lr;
                if (intval($lr['pending_qty']) + intval($lr['rework_qty']) > 0) {
                    $activeAtLvl[] = $lr;
                }
            }

            // Normalize and validate payload items
            $hasFailed = false;
            $hasRework = false;
            $hasPassedUnits = false;
            $sumPassed = 0;
            $sumRejected = 0;
            $defectList = [];

            if (count($productItems) > 0) {
                foreach ($productItems as $idx => &$pItemRef) {
                    $pQty = max(0, intval($pItemRef['passed_qty'] ?? 0));
                    $rQty = max(0, intval($pItemRef['rejected_qty'] ?? 0));
                    $dReason = trim($pItemRef['defect_reason'] ?? '');
                    $rawStatus = strtolower(trim($pItemRef['qc_status'] ?? 'passed'));

                    if ($pQty > 0 && $rQty === 0) {
                        $v = 'passed';
                    } elseif ($pQty > 0 && $rQty > 0) {
                        $v = 'rework';
                    } else {
                        $v = ($rawStatus === 'failed') ? 'failed' : 'rework';
                    }

                    if ($rQty > 0 && $dReason === '') {
                        throw new Exception("Defect / rework reason is required for held row #" . ($idx + 1));
                    }

                    $pItemRef['qc_status'] = $v;
                    $pItemRef['passed_qty'] = $pQty;
                    $pItemRef['rejected_qty'] = $rQty;
                    $pItemRef['defect_reason'] = $dReason ?: null;

                    if ($pQty > 0) $hasPassedUnits = true;
                    if ($rQty > 0) {
                        if ($v === 'failed') $hasFailed = true;
                        else $hasRework = true;
                        if ($dReason) $defectList[] = $dReason;
                    }

                    $sumPassed += $pQty;
                    $sumRejected += $rQty;
                }
                unset($pItemRef);

                $qcStatus = ($sumRejected === 0) ? 'passed' : (($hasPassedUnits || $hasRework) ? 'rework' : 'failed');
                $passedQty = $sumPassed;
                $rejectedQty = $sumRejected;
                if (!$defectReason && count($defectList) > 0) {
                    $defectReason = implode('; ', array_unique($defectList));
                }
            } else {
                $qcStatus = strtolower(trim($b['qc_status'] ?? 'passed'));
                $passedQty = max(0, intval($passedQtyInput ?? 0));
                $rejectedQty = max(0, intval($rejectedQtyInput));
            }

            $totalInspected = intval($b['total_inspected'] ?? ($passedQty + $rejectedQty));

            $qiStmt = $this->db->prepare("
                INSERT INTO quality_inspections
                (work_order_id, stage_id, level_number, inspector_id, inspector_name,
                 total_inspected, passed_qty, rejected_qty, inspection_date, qc_status,
                 remarks, defect_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $qiStmt->execute([
                $woId,
                $stageId,
                $levelNumber,
                $inspectorId,
                $inspectorName,
                $totalInspected,
                $passedQty,
                $rejectedQty,
                $inspectionDate,
                $qcStatus,
                $remarks,
                $defectReason
            ]);
            $inspectionId = $this->db->lastInsertId();

            $isLegacyBatchSummary = !$perComponentMode && (
                count($productItems) === 0 ||
                (count($productItems) === 1 && count($activeAtLvl) > 1 && ($productItems[0]['qc_status'] ?? 'passed') === 'passed')
            );

            $qiiStmt = $this->db->prepare("
                INSERT INTO quality_inspection_items
                (inspection_id, product_id, item_type, target_quantity, passed_qty, rejected_qty, qc_status, defect_reason, remarks)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");

            $handledCompIds = [];
            foreach ($productItems as $pItem) {
                $cid = !empty($pItem['component_id']) ? intval($pItem['component_id']) : 0;
                $k = intval($pItem['product_id']) . ':' . ($pItem['item_type'] ?? 'finished_good');
                $compRow = $cid && isset($byCompId[$cid]) ? $byCompId[$cid] : ($byKey[$k] ?? null);
                if (!$compRow) {
                    throw new Exception("Component row not found for work order #{$woId}");
                }

                $targetCompId = intval($compRow['component_id']);
                $availNow = intval($compRow['pending_qty']) + intval($compRow['rework_qty']);
                $handledCompIds[$targetCompId] = true;

                $qiiStmt->execute([
                    $inspectionId,
                    intval($compRow['product_id']),
                    $compRow['item_type'],
                    intval($pItem['target_quantity'] ?? $availNow),
                    intval($pItem['passed_qty']),
                    intval($pItem['rejected_qty']),
                    $pItem['qc_status'],
                    $pItem['defect_reason'],
                    $pItem['remarks'] ?? $remarks
                ]);

                WorkOrderStageTracker::applyStageTransition(
                    $this->db,
                    $woId,
                    $targetCompId,
                    $levelNumber,
                    intval($pItem['passed_qty']),
                    intval($pItem['rejected_qty']),
                    $pItem['defect_reason'],
                    $pItem['remarks'] ?? $remarks,
                    $inspectorName
                );
            }

            if ($isLegacyBatchSummary) {
                foreach ($activeAtLvl as $compRow) {
                    $targetCompId = intval($compRow['component_id']);
                    if (isset($handledCompIds[$targetCompId])) {
                        continue;
                    }
                    $availNow = intval($compRow['pending_qty']) + intval($compRow['rework_qty']);
                    $cType = $compRow['item_type'];
                    $cPassed = ($cType === 'finished_good' && count($productItems) === 0) ? min($availNow, $passedQty) : ($qcStatus === 'passed' ? $availNow : 0);
                    $cRejected = ($cType === 'finished_good' && count($productItems) === 0) ? min(max(0, $availNow - $cPassed), $rejectedQty) : ($qcStatus === 'passed' ? 0 : $availNow);

                    if (count($productItems) === 0 && $cType === 'finished_good') {
                        $qiiStmt->execute([
                            $inspectionId,
                            intval($compRow['product_id']),
                            $cType,
                            $availNow,
                            $cPassed,
                            $cRejected,
                            ($cRejected === 0) ? 'passed' : 'rework',
                            $defectReason,
                            $remarks
                        ]);
                    }

                    WorkOrderStageTracker::applyStageTransition(
                        $this->db,
                        $woId,
                        $targetCompId,
                        $levelNumber,
                        $cPassed,
                        $cRejected,
                        $defectReason,
                        $remarks,
                        $inspectorName
                    );
                }
            }

            if ($rejectedQty > 0) {
                $rejToAdd = $isLegacyBatchSummary ? $rejectedQty : array_reduce($productItems, function ($acc, $row) {
                    return $acc + (($row['item_type'] ?? '') === 'finished_good' ? intval($row['rejected_qty']) : 0);
                }, 0);
                if ($rejToAdd === 0 && $rejectedQty > 0 && count($productItems) > 0) {
                    $rejToAdd = $rejectedQty;
                }
                if ($rejToAdd > 0) {
                    $this->db->prepare("UPDATE work_orders SET rejected_quantity = rejected_quantity + ? WHERE id = ?")
                        ->execute([$rejToAdd, $woId]);
                }
            }

            $reconcile = WorkOrderStageTracker::reconcile($this->db, $woId, $passedQty);

            $nextLabel = ($levelNumber < 5) ? ('Level ' . ($levelNumber + 1)) : 'Completed';
            if ($reconcile['all_completed']) {
                $message = "Level 5 Final QC PASSED for all units and components! Manufacturing is 100% COMPLETE and ready for dispatch.";
            } elseif ($passedQty > 0 && $rejectedQty > 0) {
                $message = "Level {$levelNumber} QC saved: {$passedQty} passed unit(s) moved to {$nextLabel}; {$rejectedQty} rejected unit(s) stayed at Level {$levelNumber} for rework.";
            } elseif ($passedQty > 0) {
                $message = "Level {$levelNumber} QC PASSED: {$passedQty} unit(s) moved to {$nextLabel}!";
            } else {
                $message = "Level {$levelNumber} QC saved: {$rejectedQty} unit(s) retained at Level {$levelNumber} for rework/repair.";
            }

            $this->db->commit();
            Audit::log(
                $this->db,
                'qc',
                'verify_qc',
                'ManufacturingStage',
                (string)$stageId,
                "Level {$levelNumber} QC ({$qcStatus}): Passed {$passedQty} -> {$nextLabel}, Rework Held {$rejectedQty} at L{$levelNumber}. Inspector: {$inspectorName}. Reason: " . ($defectReason ?: 'None') . ". Remarks: {$remarks}"
            );

            Response::success($message, [
                'inspection_id' => intval($inspectionId),
                'stage_id' => intval($stageId),
                'level_number' => $levelNumber
            ]);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to record QC verification: " . $e->getMessage());
        }
    }
}
