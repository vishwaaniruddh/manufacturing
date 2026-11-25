<?php
// api/controllers/PurchaseOrderController.php

class PurchaseOrderController {
    private $db;
    private static $schemaChecked = false;

    public function __construct($pdo) {
        $this->db = $pdo;
        $this->ensureSchema();
    }

    private function ensureSchema() {
        if (self::$schemaChecked) return;
        self::$schemaChecked = true;
        try {
            $poCols = $this->db->query("SHOW COLUMNS FROM purchase_orders")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('subtotal', $poCols, true)) {
                $this->db->exec("ALTER TABLE purchase_orders ADD COLUMN subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER delivery_deadline");
            }
            if (!in_array('tax_amount', $poCols, true)) {
                $this->db->exec("ALTER TABLE purchase_orders ADD COLUMN tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER subtotal");
            }
            $itemCols = $this->db->query("SHOW COLUMNS FROM purchase_order_items")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('tax_percent', $itemCols, true)) {
                $this->db->exec("ALTER TABLE purchase_order_items ADD COLUMN tax_percent DECIMAL(5,2) NOT NULL DEFAULT 18.00 AFTER unit_price");
            }
        } catch (Exception $e) {
            // Non-fatal if DB permissions restrict DDL
        }
    }

    private function computeAndNormalizeItems(array $rawItems) {
        if (empty($rawItems)) {
            throw new InvalidArgumentException("At least one purchase order line item is required.");
        }

        $normalized = [];
        $subtotal = 0.0;
        $taxAmount = 0.0;

        foreach ($rawItems as $idx => $item) {
            $productId = intval($item['product_id'] ?? 0);
            $qty = floatval($item['quantity'] ?? 0);
            $rate = floatval($item['unit_price'] ?? 0);
            $taxPct = isset($item['tax_percent']) ? floatval($item['tax_percent']) : 18.0;

            if ($productId <= 0 || $qty <= 0 || $rate < 0 || $taxPct < 0) {
                $rowNum = $idx + 1;
                throw new InvalidArgumentException("Row {$rowNum}: valid product, positive quantity, and non-negative rate/tax are required.");
            }

            $lineSub = $qty * $rate;
            $lineTax = $lineSub * ($taxPct / 100.0);
            $lineTotal = $lineSub + $lineTax;

            $subtotal += $lineSub;
            $taxAmount += $lineTax;

            $normalized[] = [
                'product_id' => $productId,
                'quantity' => round($qty, 2),
                'unit_price' => round($rate, 2),
                'tax_percent' => round($taxPct, 2),
                'total_price' => round($lineTotal, 2)
            ];
        }

        $subtotal = round($subtotal, 2);
        $taxAmount = round($taxAmount, 2);

        return [
            'items' => $normalized,
            'subtotal' => $subtotal,
            'tax_amount' => $taxAmount,
            'total_amount' => round($subtotal + $taxAmount, 2)
        ];
    }

    private function insertOrderItems($poId, array $normalizedItems) {
        $poiStmt = $this->db->prepare("
            INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_price, tax_percent, total_price)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        foreach ($normalizedItems as $item) {
            $poiStmt->execute([
                $poId,
                $item['product_id'],
                $item['quantity'],
                $item['unit_price'],
                $item['tax_percent'],
                $item['total_price']
            ]);
        }
    }

    private function applyPaymentSummaryFields(array &$ord) {
        $totalAmt = round(floatval($ord['total_amount'] ?? 0), 2);
        $totalPaid = round(floatval($ord['total_paid'] ?? 0), 2);
        $pendingPaid = round(floatval($ord['pending_paid'] ?? 0), 2);

        $ord['total_paid'] = $totalPaid;
        $ord['pending_paid'] = $pendingPaid;
        $ord['balance_due'] = round(max(0.0, $totalAmt - $totalPaid), 2);
        $ord['excess_amount'] = round(max(0.0, $totalPaid - $totalAmt), 2);
        $ord['net_balance'] = round($totalAmt - $totalPaid, 2);

        if ($totalPaid > $totalAmt + 0.009) {
            $ord['payment_status'] = 'overpaid';
        } elseif ($totalAmt > 0 && $totalPaid >= $totalAmt - 0.009) {
            $ord['payment_status'] = 'fully_paid';
        } elseif ($totalPaid > 0) {
            $ord['payment_status'] = 'partially_paid';
        } elseif ($pendingPaid > 0) {
            $ord['payment_status'] = 'pending_verification';
        } else {
            $ord['payment_status'] = 'unpaid';
        }
    }

    public function getAll() {
        $sql = "
            SELECT po.*, c.company_name as customer_name, c.email as customer_email,
                   q.quotation_number, l.lead_number, l.title as lead_title,
                   (SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.po_id = po.id) as item_count,
                   (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.po_id = po.id AND p.status = 'verified') as total_paid,
                   (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.po_id = po.id AND p.status = 'received') as pending_paid,
                   (SELECT COUNT(*) FROM work_orders wo WHERE wo.po_id = po.id) as work_order_count
            FROM purchase_orders po
            JOIN customers c ON po.customer_id = c.id
            JOIN quotations q ON po.quotation_id = q.id
            JOIN leads l ON q.lead_id = l.id
            ORDER BY po.id DESC
        ";
        $stmt = $this->db->query($sql);
        $orders = $stmt->fetchAll();

        foreach ($orders as &$ord) {
            $this->applyPaymentSummaryFields($ord);
        }

        Response::success("Purchase orders fetched", $orders);
    }

    public function getOne($id) {
        $stmt = $this->db->prepare("
            SELECT po.*, c.company_name as customer_name, c.contact_person, c.email as customer_email, c.phone as customer_phone,
                   c.gst_number, c.address as customer_address,
                   q.quotation_number, q.quotation_date, l.lead_number, l.title as lead_title,
                   (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.po_id = po.id AND p.status = 'verified') as total_paid,
                   (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.po_id = po.id AND p.status = 'received') as pending_paid,
                   (SELECT COUNT(*) FROM work_orders wo WHERE wo.po_id = po.id) as work_order_count
            FROM purchase_orders po
            JOIN customers c ON po.customer_id = c.id
            JOIN quotations q ON po.quotation_id = q.id
            JOIN leads l ON q.lead_id = l.id
            WHERE po.id = ?
        ");
        $stmt->execute([$id]);
        $order = $stmt->fetch();

        if (!$order) {
            Response::error("Purchase order not found", 404);
        }

        $this->applyPaymentSummaryFields($order);

        // Items
        $iStmt = $this->db->prepare("
            SELECT poi.*, p.name as product_name, p.sku as product_sku, p.uom
            FROM purchase_order_items poi
            JOIN products p ON poi.product_id = p.id
            WHERE poi.po_id = ?
            ORDER BY poi.id ASC
        ");
        $iStmt->execute([$id]);
        $order['items'] = $iStmt->fetchAll();

        // Fallback calculation if subtotal/tax_amount are empty on legacy rows
        if (floatval($order['subtotal'] ?? 0) <= 0 && !empty($order['items'])) {
            $calcSub = 0.0;
            $calcTax = 0.0;
            foreach ($order['items'] as $it) {
                $lineSub = floatval($it['quantity']) * floatval($it['unit_price']);
                $lineTax = $lineSub * (floatval($it['tax_percent'] ?? 18) / 100.0);
                $calcSub += $lineSub;
                $calcTax += $lineTax;
            }
            $order['subtotal'] = round($calcSub, 2);
            $order['tax_amount'] = round($calcTax, 2);
        }

        // Payments
        $pStmt = $this->db->prepare("SELECT * FROM payments WHERE po_id = ? ORDER BY id DESC");
        $pStmt->execute([$id]);
        $order['payments'] = $pStmt->fetchAll();

        // Work orders
        $woStmt = $this->db->prepare("
            SELECT wo.*, p.name as product_name, p.sku as product_sku 
            FROM work_orders wo 
            JOIN products p ON wo.product_id = p.id 
            WHERE wo.po_id = ?
            ORDER BY wo.id DESC
        ");
        $woStmt->execute([$id]);
        $order['work_orders'] = $woStmt->fetchAll();

        // Media attachments
        $mStmt = $this->db->prepare("SELECT * FROM media_attachments WHERE entity_type = 'purchase_order' AND entity_id = ? ORDER BY id DESC");
        $mStmt->execute([$id]);
        $order['attachments'] = $mStmt->fetchAll();

        Response::success("Purchase order details", $order);
    }

    public function create() {
        $b = Response::getBody();
        $quotationId = intval($b['quotation_id'] ?? 0);
        $customerPoRef = trim($b['customer_po_reference'] ?? '');
        if ($quotationId <= 0 || $customerPoRef === '') {
            Response::error("Approved quotation ID and Customer PO reference are required");
        }

        $qStmt = $this->db->prepare("SELECT * FROM quotations WHERE id = ?");
        $qStmt->execute([$quotationId]);
        $quotation = $qStmt->fetch();

        if (!$quotation) {
            Response::error("Quotation not found");
        }
        if ($quotation['status'] !== 'approved') {
            Response::error("Cannot create PO: Quotation must be 'approved' first (Current: " . $quotation['status'] . ")");
        }

        $poNumber = 'PO-' . date('Y') . '-' . strtoupper(substr(uniqid(), -5));
        $poDate = !empty($b['po_date']) ? $b['po_date'] : date('Y-m-d');
        $deliveryDeadline = !empty($b['delivery_deadline']) ? $b['delivery_deadline'] : date('Y-m-d', strtotime('+3 weeks'));

        $rawItems = (!empty($b['items']) && is_array($b['items'])) ? $b['items'] : null;
        if ($rawItems === null) {
            $qiStmt = $this->db->prepare("SELECT product_id, quantity, unit_price, tax_percent FROM quotation_items WHERE quotation_id = ? ORDER BY id ASC");
            $qiStmt->execute([$quotation['id']]);
            $rawItems = $qiStmt->fetchAll();
        }

        try {
            $calc = $this->computeAndNormalizeItems($rawItems);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage());
        }

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("
                INSERT INTO purchase_orders (
                    po_number, customer_po_reference, quotation_id, customer_id, po_date,
                    delivery_deadline, subtotal, tax_amount, total_amount, payment_terms, status, notes, attachment_url
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?)
            ");
            $stmt->execute([
                $poNumber,
                $customerPoRef,
                $quotation['id'],
                $quotation['customer_id'],
                $poDate,
                $deliveryDeadline,
                $calc['subtotal'],
                $calc['tax_amount'],
                $calc['total_amount'],
                $b['payment_terms'] ?? '50% Advance on PO confirmation, 50% upon Level 5 QC & Dispatch',
                $b['notes'] ?? null,
                $b['attachment_url'] ?? null
            ]);
            $poId = $this->db->lastInsertId();

            $this->insertOrderItems($poId, $calc['items']);

            $this->db->commit();
            Audit::log(
                $this->db,
                'purchase_orders',
                'create',
                'PurchaseOrder',
                $poNumber,
                "Created customer purchase order {$poNumber} (Ref: {$customerPoRef}) with " . count($calc['items']) . " line item(s). Grand Total: ₹{$calc['total_amount']}"
            );

            Response::success("Purchase order created successfully", [
                "id" => $poId,
                "po_number" => $poNumber,
                "total_amount" => $calc['total_amount']
            ], 201);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to create PO: " . $e->getMessage());
        }
    }

    public function update($id) {
        $b = Response::getBody();

        $exStmt = $this->db->prepare("SELECT * FROM purchase_orders WHERE id = ?");
        $exStmt->execute([$id]);
        $existing = $exStmt->fetch();
        if (!$existing) {
            Response::error("Purchase order not found", 404);
        }

        if (in_array($existing['status'], ['completed', 'cancelled'], true)) {
            Response::error("Completed or cancelled purchase orders cannot be edited");
        }

        $customerPoRef = trim($b['customer_po_reference'] ?? $existing['customer_po_reference']);
        $poDate = !empty($b['po_date']) ? $b['po_date'] : $existing['po_date'];
        $deliveryDeadline = !empty($b['delivery_deadline']) ? $b['delivery_deadline'] : $existing['delivery_deadline'];
        $allowedStatuses = ['received', 'verified', 'in_production', 'completed', 'cancelled'];
        $status = in_array($b['status'] ?? $existing['status'], $allowedStatuses, true)
            ? ($b['status'] ?? $existing['status'])
            : $existing['status'];

        if ($customerPoRef === '') {
            Response::error("Customer PO reference is required");
        }

        $hasItemsUpdate = isset($b['items']) && is_array($b['items']);
        $calc = null;
        if ($hasItemsUpdate) {
            try {
                $calc = $this->computeAndNormalizeItems($b['items']);
            } catch (InvalidArgumentException $e) {
                Response::error($e->getMessage());
            }
        }

        $this->db->beginTransaction();
        try {
            $subtotal = $calc ? $calc['subtotal'] : floatval($existing['subtotal'] ?? 0);
            $taxAmount = $calc ? $calc['tax_amount'] : floatval($existing['tax_amount'] ?? 0);
            $totalAmount = $calc ? $calc['total_amount'] : floatval($existing['total_amount']);

            if ($calc) {
                $this->db->prepare("DELETE FROM purchase_order_items WHERE po_id = ?")->execute([$id]);
                $this->insertOrderItems($id, $calc['items']);
            }

            $stmt = $this->db->prepare("
                UPDATE purchase_orders
                SET customer_po_reference = ?, po_date = ?, delivery_deadline = ?,
                    subtotal = ?, tax_amount = ?, total_amount = ?,
                    payment_terms = ?, status = ?, notes = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $customerPoRef,
                $poDate,
                $deliveryDeadline,
                $subtotal,
                $taxAmount,
                $totalAmount,
                $b['payment_terms'] ?? $existing['payment_terms'],
                $status,
                array_key_exists('notes', $b) ? $b['notes'] : $existing['notes'],
                $id
            ]);

            $this->db->commit();
            Audit::log(
                $this->db,
                'purchase_orders',
                'update',
                'PurchaseOrder',
                $existing['po_number'],
                "Updated PO {$existing['po_number']} (Ref: {$customerPoRef}, Status: {$status}, Grand Total: ₹{$totalAmount})."
            );

            Response::success("Purchase order updated successfully", [
                "id" => $id,
                "po_number" => $existing['po_number'],
                "total_amount" => $totalAmount
            ]);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to update purchase order: " . $e->getMessage());
        }
    }

    public function delete($id) {
        $exStmt = $this->db->prepare("SELECT * FROM purchase_orders WHERE id = ?");
        $exStmt->execute([$id]);
        $existing = $exStmt->fetch();
        if (!$existing) {
            Response::error("Purchase order not found", 404);
        }

        $depQueries = [
            "work orders" => "SELECT COUNT(*) FROM work_orders WHERE po_id = ?",
            "payments" => "SELECT COUNT(*) FROM payments WHERE po_id = ?",
            "material requisitions" => "SELECT COUNT(*) FROM material_requisitions WHERE po_id = ?",
            "dispatches" => "SELECT COUNT(*) FROM dispatches WHERE po_id = ?",
            "customer inspections" => "SELECT COUNT(*) FROM customer_inspections WHERE po_id = ?",
            "complaint tickets" => "SELECT COUNT(*) FROM complaint_tickets WHERE po_id = ?"
        ];
        foreach ($depQueries as $label => $sql) {
            $cStmt = $this->db->prepare($sql);
            $cStmt->execute([$id]);
            if (intval($cStmt->fetchColumn()) > 0) {
                Response::error("Cannot delete PO: linked {$label} already exist.");
            }
        }

        $this->db->beginTransaction();
        try {
            $this->db->prepare("DELETE FROM purchase_order_items WHERE po_id = ?")->execute([$id]);
            $this->db->prepare("DELETE FROM media_attachments WHERE entity_type = 'purchase_order' AND entity_id = ?")->execute([$id]);
            $this->db->prepare("DELETE FROM purchase_orders WHERE id = ?")->execute([$id]);
            $this->db->commit();

            Audit::log($this->db, 'purchase_orders', 'delete', 'PurchaseOrder', $existing['po_number'], "Deleted purchase order {$existing['po_number']}.");
            Response::success("Purchase order deleted");
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to delete PO: " . $e->getMessage());
        }
    }
}
