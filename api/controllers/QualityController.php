<?php
// api/controllers/QualityController.php

class QualityController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
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
        Response::success("QC inspections fetched", $stmt->fetchAll());
    }

    /**
     * Submit QC Verification for a stage
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

        $passedQty = isset($b['passed_qty']) ? intval($b['passed_qty']) : (isset($b['units_passed']) ? intval($b['units_passed']) : null);
        $rejectedQty = isset($b['rejected_qty']) ? intval($b['rejected_qty']) : (isset($b['units_rejected']) ? intval($b['units_rejected']) : 0);
        $qcStatus = $b['qc_status'] ?? 'passed';
        $remarks = $b['remarks'] ?? $b['inspector_remarks'] ?? 'Stage quality verification completed';

        if (empty($woId) || empty($stageId) || $passedQty === null) {
            Response::error("Work Order ID, Stage ID / Level, Passed Quantity, and Remarks are required");
        }

        $totalInspected = intval($b['total_inspected'] ?? ($passedQty + $rejectedQty));
        $defectReason = $b['defect_reason'] ?? null;
        $inspectorName = $b['inspector_name'] ?? 'Senior Quality Inspector';
        $inspectorId = !empty($b['inspector_id']) ? intval($b['inspector_id']) : 4;
        $inspectionDate = $b['inspection_date'] ?? date('Y-m-d H:i:s');

        $this->db->beginTransaction();
        try {
            // Get stage info
            $sStmt = $this->db->prepare("SELECT * FROM manufacturing_stages WHERE id = ? AND work_order_id = ?");
            $sStmt->execute([$stageId, $woId]);
            $stage = $sStmt->fetch();

            if (!$stage) {
                throw new Exception("Stage not found for this work order");
            }
            $levelNumber = intval($stage['level_number']);

            // Insert quality inspection record
            $qiStmt = $this->db->prepare("
                INSERT INTO quality_inspections (work_order_id, stage_id, level_number, inspector_id, inspector_name,
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

            // Insert per-product row verification items if provided
            if (!empty($b['product_items']) && is_array($b['product_items'])) {
                $qiiStmt = $this->db->prepare("
                    INSERT INTO quality_inspection_items 
                    (inspection_id, product_id, item_type, target_quantity, passed_qty, rejected_qty, qc_status, defect_reason, remarks)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                foreach ($b['product_items'] as $pItem) {
                    $qiiStmt->execute([
                        $inspectionId,
                        intval($pItem['product_id']),
                        $pItem['item_type'] ?? 'finished_good',
                        intval($pItem['target_quantity'] ?? $totalInspected),
                        intval($pItem['passed_qty'] ?? $passedQty),
                        intval($pItem['rejected_qty'] ?? 0),
                        $pItem['qc_status'] ?? $qcStatus,
                        $pItem['defect_reason'] ?? null,
                        $pItem['remarks'] ?? null
                    ]);
                }
            } else {
                // Default product verification record for the primary product
                $woProdStmt = $this->db->prepare("SELECT product_id, target_quantity FROM work_orders WHERE id = ?");
                $woProdStmt->execute([$woId]);
                $woProd = $woProdStmt->fetch();
                if ($woProd) {
                    $this->db->prepare("
                        INSERT INTO quality_inspection_items 
                        (inspection_id, product_id, item_type, target_quantity, passed_qty, rejected_qty, qc_status, defect_reason, remarks)
                        VALUES (?, ?, 'finished_good', ?, ?, ?, ?, ?, ?)
                    ")->execute([
                        $inspectionId,
                        $woProd['product_id'],
                        $woProd['target_quantity'],
                        $passedQty,
                        $rejectedQty,
                        $qcStatus,
                        $defectReason,
                        $remarks
                    ]);
                }
            }

            // Update current stage status
            if ($qcStatus === 'passed') {
                $this->db->prepare("UPDATE manufacturing_stages SET status = 'completed', completed_at = NOW() WHERE id = ?")->execute([$stageId]);

                // Update work order rejected counts
                $this->db->prepare("UPDATE work_orders SET rejected_quantity = rejected_quantity + ? WHERE id = ?")->execute([$rejectedQty, $woId]);

                if ($levelNumber < 5) {
                    // Advance to next level
                    $nextLevel = $levelNumber + 1;
                    $this->db->prepare("
                        UPDATE manufacturing_stages 
                        SET status = 'in_progress', started_at = NOW(), operator_name = 'Assembly Team Line' 
                        WHERE work_order_id = ? AND level_number = ?
                    ")->execute([$woId, $nextLevel]);

                    $this->db->prepare("UPDATE work_orders SET current_level = ? WHERE id = ?")->execute([$nextLevel, $woId]);

                    $message = "Level {$levelNumber} QC verification PASSED! Work order advanced to Level {$nextLevel}.";
                } else {
                    // Level 5 passed -> Manufacturing Complete!
                    $this->db->prepare("
                        UPDATE work_orders 
                        SET current_level = 5, status = 'completed', completed_quantity = ?, completion_date = CURDATE() 
                        WHERE id = ?
                    ")->execute([$passedQty, $woId]);

                    $message = "Level 5 Final QC PASSED! Manufacturing is 100% COMPLETE. Products are now ready for dispatch.";
                }
            } else {
                // Failed or rework
                $this->db->prepare("UPDATE manufacturing_stages SET status = 'rejected' WHERE id = ?")->execute([$stageId]);
                $this->db->prepare("UPDATE work_orders SET status = 'on_hold', rejected_quantity = rejected_quantity + ? WHERE id = ?")->execute([$rejectedQty, $woId]);
                $message = "Level {$levelNumber} QC flagged {$qcStatus}. Work order placed on hold for rework or review.";
            }

            $this->db->commit();
            Audit::log($this->db, 'qc', 'verify_qc', 'ManufacturingStage', (string)$stageId, "Level {$levelNumber} QC verification: {$qcStatus}. Inspected: {$totalInspected}, Passed: {$passedQty}, Rejected: {$rejectedQty}. Inspector: {$inspectorName}. Reason: " . ($defectReason ?: 'None') . ". Remarks: {$remarks}");

            Response::success($message);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to record QC verification: " . $e->getMessage());
        }
    }
}
