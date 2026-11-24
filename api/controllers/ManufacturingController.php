<?php
// api/controllers/ManufacturingController.php

class ManufacturingController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
    }

    /**
     * Check inventory for required products based on BOM explosion
     */
    public function checkMaterials() {
        $b = Response::getBody();
        $poId = $b['po_id'] ?? null;
        $productId = $b['product_id'] ?? null;
        $targetQty = floatval($b['target_quantity'] ?? 0);

        if (!$poId && (!$productId || $targetQty <= 0)) {
            Response::error("Either PO ID or Product ID with Target Quantity is required");
        }

        $itemsToCheck = [];
        if ($poId) {
            $stmt = $this->db->prepare("SELECT product_id, quantity FROM purchase_order_items WHERE po_id = ?");
            $stmt->execute([$poId]);
            $itemsToCheck = $stmt->fetchAll();
        } else {
            $itemsToCheck[] = ['product_id' => $productId, 'quantity' => $targetQty];
        }

        if (empty($itemsToCheck)) {
            Response::error("No items found to check materials");
        }

        // 1. Check Sub-Products / Sub-Assemblies (Multi-Level BOM)
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
            $subs = $subStmt->fetchAll();

            foreach ($subs as $sub) {
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

        // 2. Check Raw Materials & Consumables
        $materialMap = []; // raw_material_id => total_required
        foreach ($itemsToCheck as $item) {
            $bomStmt = $this->db->prepare("
                SELECT pb.raw_material_id, pb.quantity_required, rm.name, rm.sku, rm.uom, rm.current_stock, rm.unit_cost
                FROM product_boms pb
                JOIN raw_materials rm ON pb.raw_material_id = rm.id
                WHERE pb.product_id = ?
            ");
            $bomStmt->execute([$item['product_id']]);
            $boms = $bomStmt->fetchAll();

            foreach ($boms as $bom) {
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

        // Analyze availability: fully, partial, or not_found
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

        // Combined Overall Multi-Level Status (Sub-Products + Raw Materials)
        $totalRequiredComponents = $totalItems + $totalSubItems;
        $totalAvailableComponents = $availableCount + $subAvailableCount;

        $overallStatus = 'not_found';
        if ($totalRequiredComponents > 0) {
            if ($totalAvailableComponents === $totalRequiredComponents) {
                $overallStatus = 'full'; // Eligible for manufacturing immediately
            } elseif ($totalAvailableComponents > 0) {
                $overallStatus = 'partial';
            } else {
                $overallStatus = 'not_found';
            }
        }

        Response::success("Material inventory check completed", [
            "material_status" => $overallStatus,
            "overall_status" => $overallStatus,
            "is_eligible_for_manufacturing" => ($overallStatus === 'full'),
            "available_materials_count" => $availableCount,
            "total_materials_count" => $totalItems,
            "available_sub_assemblies_count" => $subAvailableCount,
            "total_sub_assemblies_count" => $totalSubItems,
            "total_shortfall_cost" => $totalShortfallCost + $totalSubShortfallCost,
            "sub_assemblies" => $subAssembliesList,
            "materials" => $materialsList
        ]);
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
                !empty($b['requested_by']) ? intval($b['requested_by']) : 3, // default to Production Manager
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
                   (SELECT COUNT(*) FROM dispatches d WHERE d.work_order_id = wo.id) as dispatch_count
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
     * Work Order Details with 5 Levels & QC Inspections
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

        // 5 Stages
        $sStmt = $this->db->prepare("
            SELECT ms.*,
                   qi.id as inspection_id, qi.inspector_name, qi.passed_qty, qi.rejected_qty,
                   qi.qc_status, qi.remarks as qc_remarks, qi.defect_reason, qi.inspection_date
            FROM manufacturing_stages ms
            LEFT JOIN quality_inspections qi ON ms.id = qi.stage_id
            WHERE ms.work_order_id = ?
            ORDER BY ms.level_number ASC
        ");
        $sStmt->execute([$id]);
        $stages = $sStmt->fetchAll();

        // Attach inspected items to each stage
        foreach ($stages as &$st) {
            if (!empty($st['inspection_id'])) {
                $qiiStmt = $this->db->prepare("
                    SELECT qii.*, p.name as product_name, p.sku as product_sku, p.uom, p.product_type
                    FROM quality_inspection_items qii
                    JOIN products p ON qii.product_id = p.id
                    WHERE qii.inspection_id = ?
                ");
                $qiiStmt->execute([$st['inspection_id']]);
                $st['inspected_items'] = $qiiStmt->fetchAll();
            } else {
                $st['inspected_items'] = [];
            }
        }
        $wo['stages'] = $stages;

        // Fetch product components (Finished Good + Sub-Assemblies)
        $compStmt = $this->db->prepare("
            SELECT p.id as product_id, p.name as product_name, p.sku as product_sku, p.uom, 'finished_good' as item_type, ? as target_quantity, 'Primary Finished Good' as role_notes
            FROM products p WHERE p.id = ?
            UNION ALL
            SELECT sp.id as product_id, sp.name as product_name, sp.sku as product_sku, sp.uom, 'sub_product' as item_type, (psa.quantity_required * ?) as target_quantity, psa.notes as role_notes
            FROM product_sub_assemblies psa
            JOIN products sp ON psa.sub_product_id = sp.id
            WHERE psa.parent_product_id = ?
        ");
        $compStmt->execute([$wo['target_quantity'], $wo['product_id'], $wo['target_quantity'], $wo['product_id']]);
        $wo['product_components'] = $compStmt->fetchAll();

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
