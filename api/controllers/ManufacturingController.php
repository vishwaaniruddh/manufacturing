<?php
// api/controllers/ManufacturingController.php
require_once dirname(__DIR__) . '/helpers/wo_stages.php';

class ManufacturingController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
        WorkOrderStageTracker::ensureSchema($this->db);
    }

    private function evaluateBomForItems(array $itemsToCheck) {
        $subProductMap = [];
        foreach ($itemsToCheck as $item) {
            $subStmt = $this->db->prepare("
                SELECT psa.sub_product_id, psa.quantity_required, psa.notes,
                       p.name, p.sku, p.uom, p.current_stock, p.unit_price as unit_cost, p.category
                FROM product_sub_assemblies psa
                JOIN products p ON psa.sub_product_id = p.id
                WHERE psa.parent_product_id = ?
            ");
            $subStmt->execute([$item['product_id']]);
            foreach ($subStmt->fetchAll() as $sub) {
                $sId = $sub['sub_product_id'];
                $requiredForThis = $sub['quantity_required'] * $item['quantity'];

                if (!isset($subProductMap[$sId])) {
                    $subProductMap[$sId] = [
                        'sub_product_id' => $sId,
                        'name' => $sub['name'],
                        'sku' => $sub['sku'],
                        'uom' => $sub['uom'],
                        'category' => $sub['category'],
                        'current_stock' => floatval($sub['current_stock']),
                        'unit_cost' => floatval($sub['unit_cost']),
                        'notes' => $sub['notes'],
                        'total_required' => 0
                    ];
                }
                $subProductMap[$sId]['total_required'] += $requiredForThis;
            }
        }

        $subAssembliesList = [];
        $subAvailableCount = 0;
        $totalSubItems = count($subProductMap);
        $totalSubShortfallCost = 0;

        foreach ($subProductMap as $sub) {
            $stock = $sub['current_stock'];
            $req = $sub['total_required'];
            $shortfall = max(0, $req - $stock);
            $isAvailable = ($stock >= $req);
            if ($isAvailable) {
                $subAvailableCount++;
            }
            $shortfallCost = $shortfall * $sub['unit_cost'];
            $totalSubShortfallCost += $shortfallCost;

            $subAssembliesList[] = [
                'sub_product_id' => $sub['sub_product_id'],
                'name' => $sub['name'],
                'sku' => $sub['sku'],
                'uom' => $sub['uom'],
                'category' => $sub['category'],
                'current_stock' => $stock,
                'total_required' => $req,
                'shortfall' => $shortfall,
                'is_available' => $isAvailable,
                'unit_cost' => $sub['unit_cost'],
                'shortfall_cost' => $shortfallCost,
                'notes' => $sub['notes']
            ];
        }

        $materialMap = [];
        foreach ($itemsToCheck as $item) {
            $bomStmt = $this->db->prepare("
                SELECT pb.raw_material_id, pb.quantity_required, rm.name, rm.sku, rm.uom, rm.current_stock, rm.unit_cost
                FROM product_boms pb
                JOIN raw_materials rm ON pb.raw_material_id = rm.id
                WHERE pb.product_id = ?
            ");
            $bomStmt->execute([$item['product_id']]);
            foreach ($bomStmt->fetchAll() as $bom) {
                $rmId = $bom['raw_material_id'];
                $requiredForThis = $bom['quantity_required'] * $item['quantity'];

                if (!isset($materialMap[$rmId])) {
                    $materialMap[$rmId] = [
                        'raw_material_id' => $rmId,
                        'name' => $bom['name'],
                        'sku' => $bom['sku'],
                        'uom' => $bom['uom'],
                        'current_stock' => floatval($bom['current_stock']),
                        'unit_cost' => floatval($bom['unit_cost']),
                        'total_required' => 0
                    ];
                }
                $materialMap[$rmId]['total_required'] += $requiredForThis;
            }
        }

        $materialsList = [];
        $availableCount = 0;
        $totalItems = count($materialMap);
        $totalShortfallCost = 0;

        foreach ($materialMap as $rm) {
            $stock = $rm['current_stock'];
            $req = $rm['total_required'];
            $shortfall = max(0, $req - $stock);
            $isAvailable = ($stock >= $req);
            if ($isAvailable) {
                $availableCount++;
            }
            $shortfallCost = $shortfall * $rm['unit_cost'];
            $totalShortfallCost += $shortfallCost;

            $materialsList[] = [
                'raw_material_id' => $rm['raw_material_id'],
                'name' => $rm['name'],
                'sku' => $rm['sku'],
                'uom' => $rm['uom'],
                'current_stock' => $stock,
                'total_required' => $req,
                'shortfall' => $shortfall,
                'is_available' => $isAvailable,
                'unit_cost' => $rm['unit_cost'],
                'shortfall_cost' => $shortfallCost
            ];
        }

        $totalRequiredComponents = $totalItems + $totalSubItems;
        $totalAvailableComponents = $availableCount + $subAvailableCount;
        $noBomRequired = ($totalRequiredComponents === 0);

        if ($noBomRequired) {
            $overallStatus = 'full';
        } elseif ($totalAvailableComponents === $totalRequiredComponents) {
            $overallStatus = 'full';
        } elseif ($totalAvailableComponents > 0) {
            $overallStatus = 'partial';
        } else {
            $overallStatus = 'not_found';
        }

        return [
            "material_status" => $overallStatus,
            "overall_status" => $overallStatus,
            "is_eligible_for_manufacturing" => ($overallStatus === 'full'),
            "no_bom_required" => $noBomRequired,
            "shortfall_count" => max(0, $totalRequiredComponents - $totalAvailableComponents),
            "available_materials_count" => $availableCount,
            "total_materials_count" => $totalItems,
            "available_sub_assemblies_count" => $subAvailableCount,
            "total_sub_assemblies_count" => $totalSubItems,
            "total_shortfall_cost" => $totalShortfallCost + $totalSubShortfallCost,
            "sub_assemblies" => $subAssembliesList,
            "materials" => $materialsList
        ];
    }

    /**
     * Check inventory for required products based on BOM explosion
     */
    public function checkMaterials() {
        $b = Response::getBody();
        $poId = !empty($b['po_id']) ? intval($b['po_id']) : null;
        $productId = !empty($b['product_id']) ? intval($b['product_id']) : null;
        $targetQty = floatval($b['target_quantity'] ?? 0);

        if (!$poId && (!$productId || $targetQty <= 0)) {
            Response::error("Either PO ID or Product ID with Target Quantity is required");
        }

        $poItemsAnnotated = [];
        $allItemsLaunched = false;

        if ($poId) {
            $stmt = $this->db->prepare("
                SELECT poi.id, poi.product_id, poi.quantity, p.name, p.sku, p.uom
                FROM purchase_order_items poi
                JOIN products p ON poi.product_id = p.id
                WHERE poi.po_id = ?
                ORDER BY poi.id ASC
            ");
            $stmt->execute([$poId]);
            $poRawItems = $stmt->fetchAll();

            if (empty($poRawItems)) {
                Response::error("No items found in this Purchase Order");
            }

            $woStmt = $this->db->prepare("
                SELECT id, work_order_number, product_id, target_quantity, status
                FROM work_orders
                WHERE po_id = ?
                ORDER BY id ASC
            ");
            $woStmt->execute([$poId]);
            $woByProduct = [];
            foreach ($woStmt->fetchAll() as $woRow) {
                $woByProduct[intval($woRow['product_id'])][] = [
                    'id' => intval($woRow['id']),
                    'work_order_number' => $woRow['work_order_number'],
                    'target_quantity' => intval($woRow['target_quantity']),
                    'status' => $woRow['status']
                ];
            }

            $unlaunchedCheckItems = [];
            $allCheckItems = [];

            foreach ($poRawItems as $item) {
                $pId = intval($item['product_id']);
                $orderedQty = floatval($item['quantity']);
                $launchedList = $woByProduct[$pId] ?? [];
                $launchedQty = array_reduce($launchedList, function ($sum, $w) {
                    return $sum + floatval($w['target_quantity']);
                }, 0.0);
                $remainingQty = max(0.0, $orderedQty - $launchedQty);

                $evalQty = $remainingQty > 0 ? $remainingQty : $orderedQty;
                $itemEval = $this->evaluateBomForItems([['product_id' => $pId, 'quantity' => $evalQty]]);

                $poItemsAnnotated[] = [
                    'id' => intval($item['id']),
                    'product_id' => $pId,
                    'sku' => $item['sku'],
                    'name' => $item['name'],
                    'uom' => $item['uom'],
                    'ordered_qty' => $orderedQty,
                    'launched_qty' => $launchedQty,
                    'remaining_qty' => $remainingQty,
                    'is_launched' => ($remainingQty <= 0),
                    'launched_work_orders' => $launchedList,
                    'is_bom_eligible' => $itemEval['is_eligible_for_manufacturing'],
                    'no_bom_required' => $itemEval['no_bom_required'],
                    'shortfall_count' => $itemEval['shortfall_count'],
                    'shortfall_cost' => $itemEval['total_shortfall_cost']
                ];

                $allCheckItems[] = ['product_id' => $pId, 'quantity' => $orderedQty];
                if ($remainingQty > 0) {
                    $unlaunchedCheckItems[] = ['product_id' => $pId, 'quantity' => $remainingQty];
                }
            }

            if ($productId) {
                $matched = null;
                foreach ($poItemsAnnotated as $pi) {
                    if ($pi['product_id'] === $productId) {
                        $matched = $pi;
                        break;
                    }
                }
                $qtyUse = $targetQty > 0 ? $targetQty : ($matched ? ($matched['remaining_qty'] > 0 ? $matched['remaining_qty'] : $matched['ordered_qty']) : 1);
                $itemsToCheck = [['product_id' => $productId, 'quantity' => $qtyUse]];
            } elseif (!empty($unlaunchedCheckItems)) {
                $itemsToCheck = $unlaunchedCheckItems;
            } else {
                $allItemsLaunched = true;
                $itemsToCheck = $allCheckItems;
            }
        } else {
            $itemsToCheck = [['product_id' => $productId, 'quantity' => $targetQty]];
        }

        $result = $this->evaluateBomForItems($itemsToCheck);
        $result['po_items'] = $poItemsAnnotated;
        $result['all_items_launched'] = $allItemsLaunched;
        $result['focused_product_id'] = $productId;

        Response::success("Material inventory check completed", $result);
    }

    /**
     * Create Material Purchase Requisition to Accounts team
     */
    public function createRequisition() {
        $b = Response::getBody();
        if (empty($b['po_id']) || empty($b['items']) || !is_array($b['items'])) {
            Response::error("PO ID and requisition items are required");
        }

        $reqNumber = 'REQ-' . date('Y') . '-' . strtoupper(substr(uniqid(), -5));
        $this->db->beginTransaction();
        try {
            $totalEstCost = 0;
            foreach ($b['items'] as $item) {
                $sf = floatval($item['shortfall'] ?? $item['shortfall_qty'] ?? $item['required_quantity'] ?? $item['quantity'] ?? 0);
                $uc = floatval($item['unit_cost'] ?? 0);
                $totalEstCost += floatval($item['shortfall_cost'] ?? ($sf * $uc));
            }

            $stmt = $this->db->prepare("
                INSERT INTO material_requisitions (requisition_number, po_id, requested_by, status, total_estimated_cost, remarks)
                VALUES (?, ?, ?, 'pending_purchase', ?, ?)
            ");
            $stmt->execute([
                $reqNumber,
                $b['po_id'],
                Response::resolveUserId($this->db, $b['requested_by'] ?? null),
                $totalEstCost,
                $b['remarks'] ?? 'Shortfall materials requested for production fulfillment'
            ]);
            $reqId = $this->db->lastInsertId();

            $itemStmt = $this->db->prepare("
                INSERT INTO material_requisition_items (requisition_id, raw_material_id, item_type, sub_product_id, required_qty, available_qty, shortfall_qty, unit_cost, total_cost, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            ");

            foreach ($b['items'] as $item) {
                $shortfall = floatval($item['shortfall'] ?? $item['shortfall_qty'] ?? $item['required_quantity'] ?? $item['quantity'] ?? 0);
                if ($shortfall > 0) {
                    $itemType = $item['item_type'] ?? (!empty($item['sub_product_id']) ? 'sub_product' : 'raw_material');
                    $subId = ($itemType === 'sub_product') ? intval($item['sub_product_id'] ?? $item['product_id'] ?? 0) : null;
                    $rmId = ($itemType === 'raw_material') ? intval($item['raw_material_id'] ?? 0) : null;
                    $unitCost = floatval($item['unit_cost'] ?? 0);
                    $reqQty = floatval($item['total_required'] ?? $item['required_qty'] ?? $item['required_quantity'] ?? $shortfall);
                    $availQty = floatval($item['current_stock'] ?? $item['available_qty'] ?? 0);

                    $itemStmt->execute([
                        $reqId,
                        $rmId,
                        $itemType,
                        $subId,
                        $reqQty,
                        $availQty,
                        $shortfall,
                        $unitCost,
                        $shortfall * $unitCost
                    ]);
                }
            }

            $this->db->commit();
            Audit::log($this->db, 'inventory', 'requisition', 'MaterialRequisition', $reqNumber, "Submitted purchase requisition {$reqNumber} for PO ID {$b['po_id']}. Estimated Shortfall Cost: ₹{$totalEstCost}.");

            Response::success("Material purchase requisition submitted to Accounts successfully", [
                "id" => $reqId,
                "requisition_number" => $reqNumber,
                "total_estimated_cost" => $totalEstCost
            ], 201);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to create requisition: " . $e->getMessage());
        }
    }

    /**
     * Get all Material Requisitions
     */
    public function getRequisitions() {
        $stmt = $this->db->query("
            SELECT mr.*, po.po_number, po.customer_po_reference, c.company_name as customer_name,
                   u.name as requested_by_name,
                   (SELECT COUNT(*) FROM material_requisition_items mri WHERE mri.requisition_id = mr.id) as item_count
            FROM material_requisitions mr
            JOIN purchase_orders po ON mr.po_id = po.id
            JOIN customers c ON po.customer_id = c.id
            LEFT JOIN users u ON mr.requested_by = u.id
            ORDER BY mr.id DESC
        ");
        $requisitions = $stmt->fetchAll();

        foreach ($requisitions as &$req) {
            $iStmt = $this->db->prepare("
                SELECT mri.*, 
                       COALESCE(rm.name, p.name) as item_name,
                       COALESCE(rm.sku, p.sku) as item_sku,
                       COALESCE(rm.uom, p.uom) as item_uom,
                       COALESCE(rm.current_stock, p.current_stock) as current_stock,
                       rm.name as raw_material_name, rm.sku as raw_material_sku, rm.uom as rm_uom,
                       p.name as sub_product_name, p.sku as sub_product_sku
                FROM material_requisition_items mri
                LEFT JOIN raw_materials rm ON mri.raw_material_id = rm.id
                LEFT JOIN products p ON mri.sub_product_id = p.id
                WHERE mri.requisition_id = ?
            ");
            $iStmt->execute([$req['id']]);
            $req['items'] = $iStmt->fetchAll();
        }

        Response::success("Material requisitions fetched", $requisitions);
    }

    /**
     * Accounts fulfills the purchase requisition: updates raw_materials and sub_products inventory
     */
    public function fulfillRequisition($id) {
        $b = Response::getBody();
        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("SELECT * FROM material_requisition_items WHERE requisition_id = ?");
            $stmt->execute([$id]);
            $items = $stmt->fetchAll();

            $updateRawStock = $this->db->prepare("UPDATE raw_materials SET current_stock = current_stock + ? WHERE id = ?");
            $updateSubStock = $this->db->prepare("UPDATE products SET current_stock = current_stock + ? WHERE id = ?");
            $updateItem = $this->db->prepare("UPDATE material_requisition_items SET status = 'received' WHERE id = ?");

            foreach ($items as $item) {
                if (($item['item_type'] ?? 'raw_material') === 'sub_product' && !empty($item['sub_product_id'])) {
                    $updateSubStock->execute([$item['shortfall_qty'], $item['sub_product_id']]);
                } elseif (!empty($item['raw_material_id'])) {
                    $updateRawStock->execute([$item['shortfall_qty'], $item['raw_material_id']]);
                }
                $updateItem->execute([$item['id']]);
            }

            $uStmt = $this->db->prepare("UPDATE material_requisitions SET status = 'fulfilled' WHERE id = ?");
            $uStmt->execute([$id]);

            $this->db->commit();
            Audit::log($this->db, 'inventory', 'fulfill', 'MaterialRequisition', (string)$id, "Accounts fulfilled requisition ID {$id}. Purchased & received materials/sub-products into inventory stock.");

            Response::success("Purchase requisition fulfilled! Materials purchased and added to inventory stock. Manufacturing is now unlocked.");
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to fulfill requisition: " . $e->getMessage());
        }
    }

    /**
     * Work Orders: List all work orders
     */
    public function getWorkOrders() {
        $sql = "
            SELECT wo.*, po.po_number, po.customer_po_reference, c.company_name as customer_name,
                   p.name as product_name, p.sku as product_sku, p.uom,
                   (SELECT COUNT(*) FROM manufacturing_stages ms WHERE ms.work_order_id = wo.id) as total_stages,
                   (SELECT COUNT(*) FROM quality_inspections qi WHERE qi.work_order_id = wo.id) as inspection_count,
                   (SELECT COUNT(*) FROM dispatches d WHERE d.work_order_id = wo.id) as dispatch_count,
                   (SELECT COUNT(*) FROM work_order_components woc WHERE woc.work_order_id = wo.id AND woc.status = 'rework') as rework_components_count,
                   (SELECT COUNT(DISTINCT wocs.level_number) FROM work_order_component_stages wocs WHERE wocs.work_order_id = wo.id AND (wocs.pending_qty + wocs.rework_qty) > 0) as active_levels_count
            FROM work_orders wo
            JOIN purchase_orders po ON wo.po_id = po.id
            JOIN customers c ON po.customer_id = c.id
            JOIN products p ON wo.product_id = p.id
            ORDER BY wo.id DESC
        ";
        $stmt = $this->db->query($sql);
        Response::success("Work orders fetched", $stmt->fetchAll());
    }

    /**
     * Work Order Details with Independent Per-Component & Per-Unit 5-Level QC Progression
     */
    public function getWorkOrder($id) {
        $stmt = $this->db->prepare("
            SELECT wo.*, po.po_number, po.customer_po_reference, po.total_amount, po.po_date, po.delivery_deadline,
                   c.company_name as customer_name, c.contact_person, c.email as customer_email,
                   p.name as product_name, p.sku as product_sku, p.uom, p.unit_price
            FROM work_orders wo
            JOIN purchase_orders po ON wo.po_id = po.id
            JOIN customers c ON po.customer_id = c.id
            JOIN products p ON wo.product_id = p.id
            WHERE wo.id = ?
        ");
        $stmt->execute([$id]);
        $wo = $stmt->fetch();

        if (!$wo) {
            Response::error("Work order not found", 404);
        }

        // Guarantee per-component & per-unit stage tracker rows exist (and backfill historical runs if needed)
        WorkOrderStageTracker::ensureSeeded($this->db, $id, $wo);

        // Refresh WO header after potential backfill/reconciliation
        $stmt->execute([$id]);
        $wo = $stmt->fetch();

        // Fetch authoritative per-component summary
        $compStmt = $this->db->prepare("
            SELECT woc.id as component_id, woc.work_order_id, woc.product_id, woc.item_type,
                   woc.role_notes, woc.target_quantity, woc.passed_quantity, woc.rejected_quantity,
                   woc.current_level, woc.status as component_status,
                   woc.last_defect_reason, woc.last_remarks, woc.updated_at,
                   p.name as product_name, p.sku as product_sku, p.uom
            FROM work_order_components woc
            JOIN products p ON woc.product_id = p.id
            WHERE woc.work_order_id = ?
            ORDER BY (woc.item_type = 'finished_good') DESC, woc.id ASC
        ");
        $compStmt->execute([$id]);
        $components = $compStmt->fetchAll();

        // Fetch authoritative per-component, per-level unit distribution
        $wocsStmt = $this->db->prepare("
            SELECT * FROM work_order_component_stages
            WHERE work_order_id = ?
            ORDER BY component_id ASC, level_number ASC
        ");
        $wocsStmt->execute([$id]);
        $wocsByCompLvl = [];
        foreach ($wocsStmt->fetchAll() as $sr) {
            $wocsByCompLvl[intval($sr['component_id'])][intval($sr['level_number'])] = $sr;
        }

        foreach ($components as &$cRef) {
            $cid = intval($cRef['component_id']);
            $dist = [];
            for ($l = 1; $l <= 5; $l++) {
                $sr = $wocsByCompLvl[$cid][$l] ?? null;
                $dist[$l] = [
                    'pending_qty' => $sr ? intval($sr['pending_qty']) : 0,
                    'rework_qty' => $sr ? intval($sr['rework_qty']) : 0,
                    'passed_qty' => $sr ? intval($sr['passed_qty']) : 0
                ];
            }
            $cRef['stage_distribution'] = $dist;
        }
        unset($cRef);
        $wo['product_components'] = $components;

        // Fetch the 5 sequential stages (without duplicating rows when multiple inspections occurred)
        $sStmt = $this->db->prepare("
            SELECT ms.*
            FROM manufacturing_stages ms
            WHERE ms.work_order_id = ?
            ORDER BY ms.level_number ASC
        ");
        $sStmt->execute([$id]);
        $stages = $sStmt->fetchAll();

        $latestInspStmt = $this->db->prepare("
            SELECT id, inspector_name, passed_qty, rejected_qty, qc_status, remarks, defect_reason, inspection_date
            FROM quality_inspections
            WHERE stage_id = ?
            ORDER BY id DESC
        ");

        $stageItemHistStmt = $this->db->prepare("
            SELECT qii.*, qi.inspector_name, qi.inspection_date
            FROM quality_inspection_items qii
            JOIN quality_inspections qi ON qii.inspection_id = qi.id
            WHERE qi.stage_id = ?
            ORDER BY qi.id DESC, qii.id DESC
        ");

        foreach ($stages as &$st) {
            $lvl = intval($st['level_number']);

            $latestInspStmt->execute([$st['id']]);
            $inspRuns = $latestInspStmt->fetchAll();
            $latestInsp = $inspRuns[0] ?? null;

            $st['inspection_runs'] = count($inspRuns);
            $st['inspection_id'] = $latestInsp['id'] ?? null;
            $st['inspector_name'] = $latestInsp['inspector_name'] ?? null;
            $st['passed_qty'] = $latestInsp['passed_qty'] ?? null;
            $st['rejected_qty'] = $latestInsp['rejected_qty'] ?? 0;
            $st['qc_status'] = $latestInsp['qc_status'] ?? null;
            $st['qc_remarks'] = $latestInsp['remarks'] ?? null;
            $st['defect_reason'] = $latestInsp['defect_reason'] ?? null;
            $st['inspection_date'] = $latestInsp['inspection_date'] ?? null;

            // Latest QC row per product/type at this specific stage
            $stageItemHistStmt->execute([$st['id']]);
            $latestItemByKey = [];
            foreach ($stageItemHistStmt->fetchAll() as $histRow) {
                $k = intval($histRow['product_id']) . ':' . ($histRow['item_type'] ?? 'finished_good');
                if (!isset($latestItemByKey[$k])) {
                    $latestItemByKey[$k] = $histRow;
                }
            }

            $stageItems = [];
            $readyCount = 0;
            $reworkCount = 0;
            $clearedCount = 0;
            $heldBelowCount = 0;
            $readyUnits = 0;
            $pendingUnits = 0;
            $reworkUnits = 0;
            $passedUnits = 0;
            $waitingUpstreamUnits = 0;

            foreach ($components as $comp) {
                $cid = intval($comp['component_id']);
                $totalTarget = intval($comp['target_quantity']);
                $sr = $wocsByCompLvl[$cid][$lvl] ?? [
                    'pending_qty' => 0,
                    'rework_qty' => 0,
                    'passed_qty' => 0,
                    'rejected_qty' => 0,
                    'defect_reason' => null,
                    'remarks' => null,
                    'inspector_name' => null
                ];
                $k = intval($comp['product_id']) . ':' . $comp['item_type'];
                $hist = $latestItemByKey[$k] ?? null;

                $pend = intval($sr['pending_qty']);
                $rew = intval($sr['rework_qty']);
                $pas = intval($sr['passed_qty']);
                $inspectableQty = $pend + $rew;

                $upstreamPool = 0;
                $firstActiveUpstreamLvl = null;
                for ($uLvl = 1; $uLvl < $lvl; $uLvl++) {
                    $usr = $wocsByCompLvl[$cid][$uLvl] ?? ['pending_qty' => 0, 'rework_qty' => 0];
                    $uPool = intval($usr['pending_qty']) + intval($usr['rework_qty']);
                    if ($uPool > 0) {
                        $upstreamPool += $uPool;
                        if ($firstActiveUpstreamLvl === null) {
                            $firstActiveUpstreamLvl = $uLvl;
                        }
                    }
                }

                if ($inspectableQty === 0 && $pas >= $totalTarget) {
                    $clearedCount++;
                    $compStageState = 'passed_next';
                } elseif ($rew > 0) {
                    $readyCount++;
                    $reworkCount++;
                    $compStageState = 'stuck_rework';
                } elseif ($pend > 0) {
                    $readyCount++;
                    $compStageState = 'ready_for_qc';
                } elseif ($pas > 0) {
                    $compStageState = 'partial_passed_waiting';
                } else {
                    $compStageState = 'waiting_previous';
                }

                if ($upstreamPool > 0) {
                    $heldBelowCount++;
                    $waitingUpstreamUnits += $upstreamPool;
                }

                $readyUnits += $inspectableQty;
                $pendingUnits += $pend;
                $reworkUnits += $rew;
                $passedUnits += $pas;

                $defaultRemark = $clearedCount > 0 && $compStageState === 'passed_next'
                    ? 'Cleared stage specifications'
                    : ($compStageState === 'stuck_rework'
                        ? ($sr['defect_reason'] ?: ($hist['defect_reason'] ?? 'Held for rework at Level ' . $lvl))
                        : ($compStageState === 'ready_for_qc'
                            ? "{$inspectableQty} unit(s) queued for Level {$lvl} QC"
                            : ($compStageState === 'partial_passed_waiting'
                                ? "{$pas} unit(s) advanced; awaiting {$upstreamPool} unit(s) from Level {$firstActiveUpstreamLvl}"
                                : ($firstActiveUpstreamLvl ? "Waiting — {$upstreamPool} unit(s) at Level {$firstActiveUpstreamLvl}" : 'Awaiting prior level'))));

                $stageItems[] = [
                    'component_id' => $cid,
                    'product_id' => intval($comp['product_id']),
                    'product_name' => $comp['product_name'],
                    'product_sku' => $comp['product_sku'],
                    'uom' => $comp['uom'],
                    'item_type' => $comp['item_type'],
                    'role_notes' => $comp['role_notes'],
                    'target_quantity' => $totalTarget,
                    'inspectable_qty' => $inspectableQty,
                    'pending_qty' => $pend,
                    'rework_qty' => $rew,
                    'passed_qty' => $pas,
                    'rejected_qty' => $rew > 0 ? $rew : 0,
                    'upstream_waiting_qty' => $upstreamPool,
                    'upstream_level' => $firstActiveUpstreamLvl,
                    'current_component_level' => intval($comp['current_level']),
                    'component_status' => $comp['component_status'],
                    'component_stage_state' => $compStageState,
                    'qc_status' => ($compStageState === 'passed_next')
                        ? 'passed'
                        : (($compStageState === 'stuck_rework')
                            ? 'rework'
                            : (($compStageState === 'ready_for_qc') ? 'in_progress' : 'queued')),
                    'defect_reason' => ($rew > 0) ? ($sr['defect_reason'] ?: ($hist['defect_reason'] ?? null)) : ($sr['defect_reason'] ?? null),
                    'remarks' => ($rew > 0 && !empty($sr['defect_reason'])) ? $sr['defect_reason'] : ($sr['remarks'] ?: $defaultRemark),
                    'inspector_name' => $sr['inspector_name'] ?: ($hist['inspector_name'] ?? null)
                ];
            }

            $st['ready_count'] = $readyCount;
            $st['rework_count'] = $reworkCount;
            $st['cleared_count'] = $clearedCount;
            $st['held_below_count'] = $heldBelowCount;
            $st['ready_units'] = $readyUnits;
            $st['pending_units'] = $pendingUnits;
            $st['rework_units'] = $reworkUnits;
            $st['passed_units'] = $passedUnits;
            $st['waiting_upstream_units'] = $waitingUpstreamUnits;
            $st['total_components'] = count($components);
            $st['can_inspect'] = ($readyCount > 0 && $readyUnits > 0);
            $st['inspected_items'] = $stageItems;
        }
        unset($st);
        $wo['stages'] = $stages;

        // Dispatches
        $dStmt = $this->db->prepare("
            SELECT d.*, cr.name as courier_name, cr.tracking_url_template
            FROM dispatches d
            LEFT JOIN couriers cr ON d.courier_id = cr.id
            WHERE d.work_order_id = ?
        ");
        $dStmt->execute([$id]);
        $wo['dispatches'] = $dStmt->fetchAll();

        Response::success("Work order details", $wo);
    }

    /**
     * Start Manufacturing Work Order: initializes 5 sequential stages
     */
    public function startWorkOrder() {
        $b = Response::getBody();
        if (empty($b['po_id']) || empty($b['product_id']) || empty($b['target_quantity'])) {
            Response::error("PO ID, Product ID, and Target Quantity are required");
        }

        $woNumber = 'WO-' . date('Y') . '-' . strtoupper(substr(uniqid(), -5));
        $targetQty = intval($b['target_quantity']);
        $productId = intval($b['product_id']);
        $poId = intval($b['po_id']);

        $this->db->beginTransaction();
        try {
            // 1. Deduct sub-assemblies/sub-products if defined
            $subStmt = $this->db->prepare("
                SELECT psa.sub_product_id, psa.quantity_required, p.name, p.current_stock
                FROM product_sub_assemblies psa
                JOIN products p ON psa.sub_product_id = p.id
                WHERE psa.parent_product_id = ?
            ");
            $subStmt->execute([$productId]);
            $subs = $subStmt->fetchAll();

            $updateSubStock = $this->db->prepare("UPDATE products SET current_stock = current_stock - ? WHERE id = ?");
            foreach ($subs as $sub) {
                $needed = $sub['quantity_required'] * $targetQty;
                if ($sub['current_stock'] < $needed) {
                    throw new Exception("Insufficient stock for sub-product: {$sub['name']} (Required: {$needed}, Current Stock: {$sub['current_stock']})");
                }
                $updateSubStock->execute([$needed, $sub['sub_product_id']]);
            }

            // 2. Deduct required raw materials from inventory
            $bomStmt = $this->db->prepare("
                SELECT pb.raw_material_id, pb.quantity_required, rm.current_stock, rm.name
                FROM product_boms pb
                JOIN raw_materials rm ON pb.raw_material_id = rm.id
                WHERE pb.product_id = ?
            ");
            $bomStmt->execute([$productId]);
            $boms = $bomStmt->fetchAll();

            $updateStock = $this->db->prepare("UPDATE raw_materials SET current_stock = current_stock - ? WHERE id = ?");
            foreach ($boms as $bom) {
                $needed = $bom['quantity_required'] * $targetQty;
                if ($bom['current_stock'] < $needed) {
                    throw new Exception("Insufficient stock for raw material: {$bom['name']} (Required: {$needed}, Current Stock: {$bom['current_stock']})");
                }
                $updateStock->execute([$needed, $bom['raw_material_id']]);
            }

            // Create work order
            $stmt = $this->db->prepare("
                INSERT INTO work_orders (work_order_number, po_id, product_id, target_quantity, current_level, status, material_status, start_date)
                VALUES (?, ?, ?, ?, 1, 'in_progress', 'full', CURDATE())
            ");
            $stmt->execute([$woNumber, $poId, $productId, $targetQty]);
            $woId = $this->db->lastInsertId();

            // 5 Sequential Manufacturing Stages definition
            $stageNames = [
                1 => ['name' => 'Level 1: Raw Material Sizing & Pre-Treatment', 'desc' => 'High-precision cutting, CNC sizing, and surface decontamination'],
                2 => ['name' => 'Level 2: Primary Component Machining & Coil/Core Prep', 'desc' => 'Forming, turning, coil winding, and core insulation'],
                3 => ['name' => 'Level 3: Sub-Assembly & Thermal/Surface Processing', 'desc' => 'Precision alignment, bonding, dynamic balancing, and protective coating'],
                4 => ['name' => 'Level 4: Final Mechanical & Electronic Assembly', 'desc' => 'Bearing press-fit, sensor/PCB installation, and structural torque fastening'],
                5 => ['name' => 'Level 5: Full Load Testing, Burn-in & Packaging', 'desc' => 'Electrical load test, vibration benchmark, laser marking & sealed packaging']
            ];

            $stageStmt = $this->db->prepare("
                INSERT INTO manufacturing_stages (work_order_id, level_number, stage_name, description, status, started_at, operator_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");

            for ($lvl = 1; $lvl <= 5; $lvl++) {
                $status = ($lvl === 1) ? 'in_progress' : 'pending';
                $startedAt = ($lvl === 1) ? date('Y-m-d H:i:s') : null;
                $operator = ($lvl === 1) ? ($b['operator_name'] ?? 'Production Line Tech A') : null;

                $stageStmt->execute([
                    $woId,
                    $lvl,
                    $stageNames[$lvl]['name'],
                    $stageNames[$lvl]['desc'],
                    $status,
                    $startedAt,
                    $operator
                ]);
            }

            // Initialize per-component & per-unit 5-level tracking rows (Finished Good + Sub-Assemblies)
            $compIns = $this->db->prepare("
                INSERT INTO work_order_components
                (work_order_id, product_id, item_type, role_notes, target_quantity, passed_quantity, rejected_quantity, current_level, status)
                VALUES (?, ?, ?, ?, ?, 0, 0, 1, 'in_progress')
            ");
            $compIns->execute([$woId, $productId, 'finished_good', 'Primary Finished Good', $targetQty]);
            WorkOrderStageTracker::seedStagesForComponent($this->db, $woId, $this->db->lastInsertId(), $targetQty);
            foreach ($subs as $sub) {
                $subQty = intval(round(floatval($sub['quantity_required']) * $targetQty));
                $compIns->execute([
                    $woId,
                    intval($sub['sub_product_id']),
                    'sub_product',
                    $sub['notes'] ?? null,
                    $subQty
                ]);
                WorkOrderStageTracker::seedStagesForComponent($this->db, $woId, $this->db->lastInsertId(), $subQty);
            }

            // Update PO status to in_production
            $this->db->prepare("UPDATE purchase_orders SET status = 'in_production' WHERE id = ?")->execute([$poId]);

            $this->db->commit();
            Audit::log($this->db, 'manufacturing', 'start', 'WorkOrder', $woNumber, "Started 5-stage manufacturing work order {$woNumber} for PO ID {$poId}. Target: {$targetQty} units. Reserved raw materials from warehouse.");

            Response::success("Work Order started successfully with 5-stage manufacturing lifecycle and raw materials reserved from inventory!", [
                "id" => $woId,
                "work_order_number" => $woNumber,
                "current_level" => 1
            ], 201);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error($e->getMessage());
        }
    }
}
