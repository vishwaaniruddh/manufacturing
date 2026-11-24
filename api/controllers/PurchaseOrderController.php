<?php
// api/controllers/PurchaseOrderController.php

class PurchaseOrderController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
    }

    public function getAll() {
        $sql = "
            SELECT po.*, c.company_name as customer_name, c.email as customer_email,
                   q.quotation_number, l.lead_number,
                   (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.po_id = po.id AND p.status = 'verified') as total_paid,
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
            $ord['balance_due'] = max(0, floatval($ord['total_amount']) - floatval($ord['total_paid']));
            $ord['payment_status'] = ($ord['total_paid'] >= $ord['total_amount']) ? 'fully_paid' : (($ord['total_paid'] > 0) ? 'partially_paid' : 'unpaid');
        }

        Response::success("Purchase orders fetched", $orders);
    }

    public function getOne($id) {
        $stmt = $this->db->prepare("
            SELECT po.*, c.company_name as customer_name, c.contact_person, c.email as customer_email, c.phone as customer_phone,
                   c.gst_number, c.address as customer_address,
                   q.quotation_number, q.quotation_date, l.lead_number,
                   (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.po_id = po.id AND p.status = 'verified') as total_paid
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

        $order['balance_due'] = max(0, floatval($order['total_amount']) - floatval($order['total_paid']));
        $order['payment_status'] = ($order['total_paid'] >= $order['total_amount']) ? 'fully_paid' : (($order['total_paid'] > 0) ? 'partially_paid' : 'unpaid');

        // Items
        $iStmt = $this->db->prepare("
            SELECT poi.*, p.name as product_name, p.sku as product_sku, p.uom
            FROM purchase_order_items poi
            JOIN products p ON poi.product_id = p.id
            WHERE poi.po_id = ?
        ");
        $iStmt->execute([$id]);
        $order['items'] = $iStmt->fetchAll();

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
        ");
        $woStmt->execute([$id]);
        $order['work_orders'] = $woStmt->fetchAll();

        Response::success("Purchase order details", $order);
    }

    public function create() {
        $b = Response::getBody();
        if (empty($b['quotation_id']) || empty($b['customer_po_reference'])) {
            Response::error("Quotation ID and Customer PO reference are required");
        }

        // Verify quotation
        $qStmt = $this->db->prepare("SELECT * FROM quotations WHERE id = ?");
        $qStmt->execute([$b['quotation_id']]);
        $quotation = $qStmt->fetch();

        if (!$quotation) {
            Response::error("Quotation not found");
        }
        if ($quotation['status'] !== 'approved') {
            Response::error("Cannot create PO: Quotation must be 'approved' first (Current: " . $quotation['status'] . ")");
        }

        $poNumber = 'PO-' . date('Y') . '-' . strtoupper(substr(uniqid(), -5));
        $poDate = $b['po_date'] ?? date('Y-m-d');
        $deliveryDeadline = $b['delivery_deadline'] ?? date('Y-m-d', strtotime('+3 weeks'));

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("
                INSERT INTO purchase_orders (po_number, customer_po_reference, quotation_id, customer_id, po_date,
                                            delivery_deadline, total_amount, payment_terms, status, notes, attachment_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?)
            ");
            $stmt->execute([
                $poNumber,
                $b['customer_po_reference'],
                $quotation['id'],
                $quotation['customer_id'],
                $poDate,
                $deliveryDeadline,
                $b['total_amount'] ?? $quotation['total_amount'],
                $b['payment_terms'] ?? '50% Advance, 50% upon Level 5 QC & Dispatch',
                $b['notes'] ?? null,
                $b['attachment_url'] ?? null
            ]);
            $poId = $this->db->lastInsertId();

            // Populate items from quotation if not supplied
            $items = $b['items'] ?? null;
            if (empty($items)) {
                $qiStmt = $this->db->prepare("SELECT product_id, quantity, unit_price, total_price FROM quotation_items WHERE quotation_id = ?");
                $qiStmt->execute([$quotation['id']]);
                $items = $qiStmt->fetchAll();
            }

            $poiStmt = $this->db->prepare("
                INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_price, total_price)
                VALUES (?, ?, ?, ?, ?)
            ");
            foreach ($items as $item) {
                $poiStmt->execute([
                    $poId,
                    intval($item['product_id']),
                    floatval($item['quantity']),
                    floatval($item['unit_price']),
                    floatval($item['total_price'] ?? ($item['quantity'] * $item['unit_price']))
                ]);
            }

            $this->db->commit();
            Audit::log($this->db, 'purchase_orders', 'create', 'PurchaseOrder', $poNumber, "Imported customer purchase order {$poNumber} (Ref: {$b['customer_po_reference']}) for Quotation ID {$quotation['id']}. Value: ₹" . ($b['total_amount'] ?? $quotation['total_amount']));

            Response::success("Purchase order created/imported successfully", [
                "id" => $poId,
                "po_number" => $poNumber
            ], 201);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to create PO: " . $e->getMessage());
        }
    }

    public function update($id) {
        $b = Response::getBody();
        $stmt = $this->db->prepare("
            UPDATE purchase_orders
            SET customer_po_reference = ?, delivery_deadline = ?, payment_terms = ?, status = ?, notes = ?
            WHERE id = ?
        ");
        $stmt->execute([
            $b['customer_po_reference'],
            $b['delivery_deadline'],
            $b['payment_terms'] ?? null,
            $b['status'] ?? 'received',
            $b['notes'] ?? null,
            $id
        ]);
        Response::success("Purchase order updated successfully");
    }
}
