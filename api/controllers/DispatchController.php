<?php
// api/controllers/DispatchController.php

class DispatchController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
    }

    public function getAll() {
        $sql = "
            SELECT d.*, po.po_number, po.customer_po_reference, c.company_name as customer_name,
                   c.contact_person, c.phone as customer_phone, c.address as delivery_address,
                   wo.work_order_number, p.name as product_name, p.sku as product_sku,
                   cr.name as courier_name, cr.tracking_url_template,
                   (SELECT COUNT(*) FROM customer_inspections ci WHERE ci.dispatch_id = d.id) as customer_inspected
            FROM dispatches d
            JOIN purchase_orders po ON d.po_id = po.id
            JOIN customers c ON po.customer_id = c.id
            JOIN work_orders wo ON d.work_order_id = wo.id
            JOIN products p ON wo.product_id = p.id
            JOIN couriers cr ON d.courier_id = cr.id
            ORDER BY d.id DESC
        ";
        $stmt = $this->db->query($sql);
        Response::success("Dispatches fetched", $stmt->fetchAll());
    }

    public function create() {
        $b = Response::getBody();
        if (empty($b['work_order_id']) || empty($b['courier_id']) || empty($b['tracking_number'])) {
            Response::error("Work Order ID, Courier ID, and Tracking Number are required");
        }

        // Verify Work order is completed (Level 5 done)
        $woStmt = $this->db->prepare("SELECT * FROM work_orders WHERE id = ?");
        $woStmt->execute([$b['work_order_id']]);
        $wo = $woStmt->fetch();

        if (!$wo) {
            Response::error("Work order not found");
        }
        if ($wo['status'] !== 'completed') {
            Response::error("Work order must be 'completed' (passed Level 5 QC) before dispatch. Current status: " . $wo['status']);
        }

        $dispatchNumber = 'DSP-' . date('Y') . '-' . strtoupper(substr(uniqid(), -5));
        $challanNo = $b['delivery_challan_no'] ?? ('DC/' . date('Y') . '/' . rand(1000, 9999));
        $dispatchDate = $b['dispatch_date'] ?? date('Y-m-d');
        $estDelivery = $b['estimated_delivery_date'] ?? date('Y-m-d', strtotime('+3 days'));

        $stmt = $this->db->prepare("
            INSERT INTO dispatches (dispatch_number, po_id, work_order_id, courier_id, tracking_number,
                                   dispatch_date, estimated_delivery_date, total_packages, delivery_challan_no,
                                   vehicle_no, status, remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dispatched', ?)
        ");
        $stmt->execute([
            $dispatchNumber,
            $wo['po_id'],
            $wo['id'],
            intval($b['courier_id']),
            $b['tracking_number'],
            $dispatchDate,
            $estDelivery,
            intval($b['total_packages'] ?? 1),
            $challanNo,
            $b['vehicle_no'] ?? null,
            $b['remarks'] ?? 'Finished goods packed and handed over to courier logistics'
        ]);

        $dispatchId = $this->db->lastInsertId();
        Audit::log($this->db, 'dispatch', 'create', 'Dispatch', $dispatchNumber, "Created dispatch order {$dispatchNumber} (Challan: {$challanNo}) via Courier ID {$b['courier_id']}. Tracking: {$b['tracking_number']}. Total packages: " . intval($b['total_packages'] ?? 1));

        Response::success("Dispatch order created and tracking initiated!", [
            "id" => $dispatchId,
            "dispatch_number" => $dispatchNumber,
            "challan_number" => $challanNo,
            "delivery_challan_no" => $challanNo
        ], 201);
    }

    public function updateStatus($id) {
        $b = Response::getBody();
        $status = $b['status'] ?? 'in_transit';
        $actualDeliveryDate = ($status === 'delivered')
            ? (!empty($b['actual_delivery_date']) ? $b['actual_delivery_date'] : date('Y-m-d'))
            : null;
        $lrNumber = !empty($b['lr_number']) ? trim($b['lr_number']) : null;
        $receivedBy = !empty($b['received_by']) ? trim($b['received_by']) : null;
        $deliveryRemarks = !empty($b['delivery_remarks']) ? trim($b['delivery_remarks']) : null;

        $stmt = $this->db->prepare("
            UPDATE dispatches
            SET status = ?,
                actual_delivery_date = COALESCE(?, actual_delivery_date),
                lr_number = COALESCE(?, lr_number),
                received_by = COALESCE(?, received_by),
                delivery_remarks = COALESCE(?, delivery_remarks)
            WHERE id = ?
        ");
        $stmt->execute([$status, $actualDeliveryDate, $lrNumber, $receivedBy, $deliveryRemarks, $id]);

        $dStmt = $this->db->prepare("SELECT dispatch_number FROM dispatches WHERE id = ?");
        $dStmt->execute([$id]);
        $disp = $dStmt->fetch();
        $dispNo = $disp['dispatch_number'] ?? "ID-{$id}";
        $extra = [];
        if ($lrNumber) $extra[] = "LR: {$lrNumber}";
        if ($receivedBy) $extra[] = "Received By: {$receivedBy}";
        if ($actualDeliveryDate) $extra[] = "Delivered: {$actualDeliveryDate}";
        $suffix = count($extra) ? ' (' . implode(', ', $extra) . ')' : '';
        Audit::log($this->db, 'dispatch', 'status_update', 'Dispatch', $dispNo, "Updated dispatch {$dispNo} status to {$status}{$suffix}");

        Response::success("Dispatch status updated to: " . $status);
    }
}
