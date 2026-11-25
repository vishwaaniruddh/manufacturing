<?php
// api/helpers/wo_stages.php - Shared per-component, per-unit 5-level progression tracker

class WorkOrderStageTracker {
    private static $schemaChecked = false;

    public static function ensureSchema($pdo) {
        if (self::$schemaChecked) return;
        self::$schemaChecked = true;
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS work_order_component_stages (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    work_order_id INT NOT NULL,
                    component_id INT NOT NULL,
                    level_number TINYINT NOT NULL,
                    pending_qty INT NOT NULL DEFAULT 0,
                    rework_qty INT NOT NULL DEFAULT 0,
                    passed_qty INT NOT NULL DEFAULT 0,
                    rejected_qty INT NOT NULL DEFAULT 0,
                    defect_reason TEXT NULL,
                    remarks TEXT NULL,
                    inspector_name VARCHAR(150) NULL,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_comp_stage (component_id, level_number),
                    KEY idx_wo_lvl (work_order_id, level_number),
                    CONSTRAINT fk_wocs_wo FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
                    CONSTRAINT fk_wocs_comp FOREIGN KEY (component_id) REFERENCES work_order_components(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
        } catch (Exception $e) {
            // Non-fatal if table already exists
        }
    }

    public static function seedStagesForComponent($pdo, $woId, $compId, $targetQty) {
        $ins = $pdo->prepare("
            INSERT IGNORE INTO work_order_component_stages
            (work_order_id, component_id, level_number, pending_qty, rework_qty, passed_qty, rejected_qty)
            VALUES (?, ?, ?, ?, 0, 0, 0)
        ");
        for ($lvl = 1; $lvl <= 5; $lvl++) {
            $ins->execute([$woId, $compId, $lvl, ($lvl === 1 ? intval($targetQty) : 0)]);
        }
    }

    public static function ensureSeeded($pdo, $woId, $woRow) {
        self::ensureSchema($pdo);

        // 1. Guarantee parent work_order_components rows exist
        $compChk = $pdo->prepare("SELECT COUNT(*) FROM work_order_components WHERE work_order_id = ?");
        $compChk->execute([$woId]);
        if (intval($compChk->fetchColumn()) === 0) {
            $woStatus = $woRow['status'] ?? 'in_progress';
            $compStatus = ($woStatus === 'completed') ? 'completed' : (in_array($woStatus, ['on_hold', 'failed'], true) ? 'rework' : 'in_progress');
            $compLevel = ($woStatus === 'completed') ? 5 : max(1, intval($woRow['current_level'] ?? 1));
            $targetQty = intval($woRow['target_quantity'] ?? 0);
            $fgPassed = ($woStatus === 'completed') ? intval($woRow['completed_quantity'] ?: $targetQty) : 0;

            $ins = $pdo->prepare("
                INSERT IGNORE INTO work_order_components
                (work_order_id, product_id, item_type, role_notes, target_quantity, passed_quantity, rejected_quantity, current_level, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $ins->execute([
                $woId,
                intval($woRow['product_id']),
                'finished_good',
                'Primary Finished Good',
                $targetQty,
                $fgPassed,
                intval($woRow['rejected_quantity'] ?? 0),
                $compLevel,
                $compStatus
            ]);

            $subStmt = $pdo->prepare("
                SELECT sub_product_id, quantity_required, notes
                FROM product_sub_assemblies
                WHERE parent_product_id = ?
            ");
            $subStmt->execute([intval($woRow['product_id'])]);
            foreach ($subStmt->fetchAll() as $sub) {
                $subQty = intval(round(floatval($sub['quantity_required']) * $targetQty));
                $ins->execute([
                    $woId,
                    intval($sub['sub_product_id']),
                    'sub_product',
                    $sub['notes'],
                    $subQty,
                    ($woStatus === 'completed') ? $subQty : 0,
                    0,
                    $compLevel,
                    $compStatus
                ]);
            }
        }

        // 2. Seed missing per-level rows for each component
        $cStmt = $pdo->prepare("SELECT * FROM work_order_components WHERE work_order_id = ? ORDER BY id ASC");
        $cStmt->execute([$woId]);
        $components = $cStmt->fetchAll();

        $stChk = $pdo->prepare("SELECT COUNT(*) FROM work_order_component_stages WHERE work_order_id = ?");
        $stChk->execute([$woId]);
        $existingStageRows = intval($stChk->fetchColumn());
        if ($existingStageRows >= count($components) * 5 && count($components) > 0) {
            return;
        }

        $compByKey = [];
        foreach ($components as $c) {
            $compId = intval($c['id']);
            $compByKey[intval($c['product_id']) . ':' . $c['item_type']] = $c;
            self::seedStagesForComponent($pdo, $woId, $compId, intval($c['target_quantity']));
        }

        // 3. Replay historical QC inspection items chronologically so pre-existing split/partial work orders stay intact
        $histStmt = $pdo->prepare("
            SELECT qi.level_number, qi.inspector_name, qi.remarks as stage_remarks,
                   qii.product_id, qii.item_type, qii.passed_qty, qii.rejected_qty,
                   qii.qc_status, qii.defect_reason, qii.remarks as item_remarks
            FROM quality_inspection_items qii
            JOIN quality_inspections qi ON qii.inspection_id = qi.id
            WHERE qi.work_order_id = ?
            ORDER BY qi.id ASC, qii.id ASC
        ");
        $histStmt->execute([$woId]);
        $histItems = $histStmt->fetchAll();

        if (!empty($histItems)) {
            foreach ($histItems as $h) {
                $k = intval($h['product_id']) . ':' . ($h['item_type'] ?? 'finished_good');
                if (!isset($compByKey[$k])) continue;
                $compId = intval($compByKey[$k]['id']);
                self::applyStageTransition(
                    $pdo,
                    $woId,
                    $compId,
                    intval($h['level_number']),
                    intval($h['passed_qty']),
                    intval($h['rejected_qty']),
                    $h['defect_reason'],
                    $h['item_remarks'] ?: $h['stage_remarks'],
                    $h['inspector_name'],
                    true
                );
            }
            self::reconcile($pdo, $woId);
            return;
        }

        // 4. Fallback for pre-seeded WOs with no quality_inspection_items rows
        foreach ($components as $c) {
            $compId = intval($c['id']);
            $target = intval($c['target_quantity']);
            $lvl = ($c['status'] === 'completed') ? 5 : max(1, intval($c['current_level'] ?? 1));
            $isRework = ($c['status'] === 'rework');

            if ($c['status'] === 'completed') {
                $pdo->prepare("
                    UPDATE work_order_component_stages
                    SET pending_qty = 0, rework_qty = 0, passed_qty = ?, rejected_qty = 0
                    WHERE component_id = ?
                ")->execute([$target, $compId]);
            } elseif ($lvl > 1) {
                $pdo->prepare("
                    UPDATE work_order_component_stages
                    SET pending_qty = 0, rework_qty = 0, passed_qty = ?, rejected_qty = 0
                    WHERE component_id = ? AND level_number < ?
                ")->execute([$target, $compId, $lvl]);
                $pdo->prepare("
                    UPDATE work_order_component_stages
                    SET pending_qty = ?, rework_qty = ?, rejected_qty = ?
                    WHERE component_id = ? AND level_number = ?
                ")->execute([
                    $isRework ? 0 : $target,
                    $isRework ? $target : 0,
                    $isRework ? intval($c['rejected_quantity'] ?: $target) : 0,
                    $compId,
                    $lvl
                ]);
            } elseif ($isRework) {
                $pdo->prepare("
                    UPDATE work_order_component_stages
                    SET pending_qty = 0, rework_qty = ?, rejected_qty = ?
                    WHERE component_id = ? AND level_number = 1
                ")->execute([$target, intval($c['rejected_quantity'] ?: $target), $compId]);
            }
        }
        self::reconcile($pdo, $woId);
    }

    /**
     * Advance $passedQty units from $levelNumber to $levelNumber + 1 (or Completed at L5),
     * and keep $rejectedQty units at $levelNumber for rework & re-inspection.
     */
    public static function applyStageTransition(
        $pdo,
        $woId,
        $compId,
        $levelNumber,
        $passedQty,
        $rejectedQty,
        $defectReason = null,
        $remarks = null,
        $inspectorName = null,
        $clampForBackfill = false
    ) {
        $rowStmt = $pdo->prepare("
            SELECT * FROM work_order_component_stages
            WHERE component_id = ? AND level_number = ?
            LIMIT 1
        ");
        $rowStmt->execute([$compId, $levelNumber]);
        $cur = $rowStmt->fetch();
        if (!$cur) {
            throw new Exception("Missing stage tracker row for component {$compId} at Level {$levelNumber}");
        }

        $available = intval($cur['pending_qty']) + intval($cur['rework_qty']);
        $pQty = max(0, intval($passedQty));
        $rQty = max(0, intval($rejectedQty));

        if ($clampForBackfill) {
            if ($pQty + $rQty > $available) {
                $pQty = min($pQty, $available);
                $rQty = max(0, min($rQty, $available - $pQty));
            }
        } elseif ($pQty + $rQty > $available) {
            throw new Exception("Level {$levelNumber}: Passed ({$pQty}) + Rejected ({$rQty}) exceeds available units at this stage ({$available}).");
        }

        $unprocessedPending = max(0, $available - $pQty - $rQty);
        $newPassedCumulative = intval($cur['passed_qty']) + $pQty;
        $newRework = $rQty;
        $storedDefect = ($newRework > 0) ? ($defectReason ?: ($cur['defect_reason'] ?: 'Held for rework')) : null;

        $updCur = $pdo->prepare("
            UPDATE work_order_component_stages
            SET pending_qty = ?,
                rework_qty = ?,
                passed_qty = ?,
                rejected_qty = ?,
                defect_reason = ?,
                remarks = ?,
                inspector_name = COALESCE(?, inspector_name)
            WHERE component_id = ? AND level_number = ?
        ");
        $updCur->execute([
            $unprocessedPending,
            $newRework,
            $newPassedCumulative,
            $newRework,
            $storedDefect,
            $remarks,
            $inspectorName,
            $compId,
            $levelNumber
        ]);

        // Forward passed units directly into the next stage queue (L + 1)
        if ($levelNumber < 5 && $pQty > 0) {
            $pdo->prepare("
                UPDATE work_order_component_stages
                SET pending_qty = pending_qty + ?
                WHERE component_id = ? AND level_number = ?
            ")->execute([$pQty, $compId, $levelNumber + 1]);
        }

        return [
            'available_before' => $available,
            'passed_now' => $pQty,
            'rework_now' => $rQty,
            'passed_cumulative' => $newPassedCumulative
        ];
    }

    /**
     * Reconcile component summaries, 5 manufacturing stages, and parent Work Order state
     * strictly from per-unit stage quantities.
     */
    public static function reconcile($pdo, $woId, $fallbackPassed = 0) {
        $cStmt = $pdo->prepare("SELECT * FROM work_order_components WHERE work_order_id = ? ORDER BY id ASC");
        $cStmt->execute([$woId]);
        $components = $cStmt->fetchAll();
        $totalComps = count($components);

        if ($totalComps === 0) {
            return ['all_completed' => false, 'highest_level' => 1];
        }

        $sStmt = $pdo->prepare("
            SELECT * FROM work_order_component_stages
            WHERE work_order_id = ?
            ORDER BY component_id ASC, level_number ASC
        ");
        $sStmt->execute([$woId]);
        $byCompLvl = [];
        foreach ($sStmt->fetchAll() as $sr) {
            $byCompLvl[intval($sr['component_id'])][intval($sr['level_number'])] = $sr;
        }

        $updComp = $pdo->prepare("
            UPDATE work_order_components
            SET current_level = ?,
                status = ?,
                passed_quantity = ?,
                rejected_quantity = ?,
                last_defect_reason = ?,
                last_remarks = COALESCE(?, last_remarks)
            WHERE id = ?
        ");

        $completedComps = 0;
        $woMaxActiveLvl = 1;
        $fgCompletedQty = null;

        foreach ($components as $c) {
            $cid = intval($c['id']);
            $target = intval($c['target_quantity']);
            $levels = $byCompLvl[$cid] ?? [];

            $l5 = $levels[5] ?? ['pending_qty' => 0, 'rework_qty' => 0, 'passed_qty' => 0];
            $l5Passed = intval($l5['passed_qty']);
            $l5Remain = intval($l5['pending_qty']) + intval($l5['rework_qty']);
            $isCompDone = ($l5Passed >= $target && $l5Remain === 0);

            $activeReworkSum = 0;
            $highestReach = 1;
            $lowestActiveReworkLvl = null;
            $lastDefect = null;
            $lastRemark = null;

            for ($lvl = 1; $lvl <= 5; $lvl++) {
                $sr = $levels[$lvl] ?? ['pending_qty' => 0, 'rework_qty' => 0, 'passed_qty' => 0, 'defect_reason' => null, 'remarks' => null];
                $pool = intval($sr['pending_qty']) + intval($sr['rework_qty']);
                $rw = intval($sr['rework_qty']);
                $ps = intval($sr['passed_qty']);

                $activeReworkSum += $rw;
                if ($rw > 0 && $lowestActiveReworkLvl === null) {
                    $lowestActiveReworkLvl = $lvl;
                    if (!empty($sr['defect_reason'])) {
                        $lastDefect = $sr['defect_reason'];
                    }
                }
                if ($pool > 0 || $ps > 0) {
                    $highestReach = max($highestReach, $lvl);
                }
                if (!empty($sr['remarks'])) {
                    $lastRemark = $sr['remarks'];
                }
            }

            if ($isCompDone) {
                $completedComps++;
                $compStatus = 'completed';
                $compCurLvl = 5;
            } elseif ($activeReworkSum > 0) {
                $compStatus = 'rework';
                $compCurLvl = $highestReach;
            } else {
                $compStatus = 'in_progress';
                $compCurLvl = $highestReach;
            }

            if ($compCurLvl > $woMaxActiveLvl) {
                $woMaxActiveLvl = $compCurLvl;
            }
            if ($c['item_type'] === 'finished_good') {
                $fgCompletedQty = $l5Passed;
            }

            $updComp->execute([
                $compCurLvl,
                $compStatus,
                $l5Passed,
                $activeReworkSum,
                $lastDefect,
                $lastRemark,
                $cid
            ]);
        }

        // Update all 5 manufacturing_stages
        $updStage = $pdo->prepare("
            UPDATE manufacturing_stages
            SET status = ?,
                started_at = CASE WHEN ? IN ('in_progress', 'completed') THEN COALESCE(started_at, NOW()) ELSE started_at END,
                completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, NOW()) ELSE NULL END,
                operator_name = CASE WHEN ? = 'in_progress' THEN COALESCE(operator_name, 'Assembly Team Line') ELSE operator_name END
            WHERE work_order_id = ? AND level_number = ?
        ");

        for ($lvl = 1; $lvl <= 5; $lvl++) {
            $clearedCnt = 0;
            $hasActivity = false;

            foreach ($components as $c) {
                $cid = intval($c['id']);
                $target = intval($c['target_quantity']);
                $sr = $byCompLvl[$cid][$lvl] ?? ['pending_qty' => 0, 'rework_qty' => 0, 'passed_qty' => 0];
                $pool = intval($sr['pending_qty']) + intval($sr['rework_qty']);
                $ps = intval($sr['passed_qty']);

                if ($pool === 0 && $ps >= $target) {
                    $clearedCnt++;
                }
                if ($pool > 0 || $ps > 0) {
                    $hasActivity = true;
                }
            }

            if ($clearedCnt === $totalComps) {
                $stStatus = 'completed';
            } elseif ($hasActivity) {
                $stStatus = 'in_progress';
            } else {
                $stStatus = 'pending';
            }

            $updStage->execute([$stStatus, $stStatus, $stStatus, $stStatus, $woId, $lvl]);
        }

        $allCompleted = ($completedComps === $totalComps);
        $finalCompletedUnits = ($fgCompletedQty !== null) ? $fgCompletedQty : intval($fallbackPassed);

        if ($allCompleted) {
            $pdo->prepare("
                UPDATE work_orders
                SET current_level = 5, status = 'completed', completed_quantity = ?, completion_date = COALESCE(completion_date, CURDATE())
                WHERE id = ?
            ")->execute([$finalCompletedUnits, $woId]);
        } else {
            $pdo->prepare("
                UPDATE work_orders
                SET current_level = ?, status = 'in_progress', completed_quantity = ?
                WHERE id = ?
            ")->execute([min(5, max(1, $woMaxActiveLvl)), max(0, intval($fgCompletedQty ?? 0)), $woId]);
        }

        return ['all_completed' => $allCompleted, 'highest_level' => $woMaxActiveLvl];
    }
}
