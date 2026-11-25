<?php
// api/controllers/CustomerPortalController.php

class CustomerPortalController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
    }

    /**
     * Submit Customer Quality Inspection on received dispatch
     */
    public function inspectDelivery() {
        $b = Response::getBody();
        if (empty($b['dispatch_id']) || empty($b['items']) || !is_array($b['items'])) {
            Response::error("Dispatch ID and inspection items are required");
        }

        $dispStmt = $this->db->prepare("SELECT po_id, work_order_id FROM dispatches WHERE id = ?");
        $dispStmt->execute([$b['dispatch_id']]);
        $disp = $dispStmt->fetch();

        if (!$disp) {
            Response::error("Dispatch record not found");
        }

        $poStmt = $this->db->prepare("SELECT customer_id FROM purchase_orders WHERE id = ?");
        $poStmt->execute([$disp['po_id']]);
        $po = $poStmt->fetch();

        $overallStatus = $b['overall_status'] ?? 'accepted_perfect';
        $inspectedByName = $b['inspected_by_name'] ?? 'Client Inspection Team';
        $remarks = $b['remarks'] ?? 'Goods received and inspected at site';

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("
                INSERT INTO customer_inspections (dispatch_id, po_id, customer_id, inspection_date, inspected_by_name, overall_status, remarks)
                VALUES (?, ?, ?, CURDATE(), ?, ?, ?)
            ");
            $stmt->execute([
                $b['dispatch_id'],
                $disp['po_id'],
                $po['customer_id'],
                $inspectedByName,
                $overallStatus,
                $remarks
            ]);
            $inspectionId = $this->db->lastInsertId();

            $itemStmt = $this->db->prepare("
                INSERT INTO customer_inspection_items (customer_inspection_id, product_id, total_received, perfect_qty, faulty_qty, fault_description, condition_status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");

            $hasFaulty = false;
            $faultyDetails = [];
            foreach ($b['items'] as $item) {
                $faulty = intval($item['faulty_qty'] ?? $item['rejected_quantity'] ?? 0);
                $perfect = intval($item['perfect_qty'] ?? $item['accepted_quantity'] ?? 0);
                $total = intval($item['total_received'] ?? $item['received_quantity'] ?? ($faulty + $perfect));
                $cond = ($faulty > 0) ? 'faulty' : 'perfect';
                $desc = $item['fault_description'] ?? $item['defect_details'] ?? null;

                if ($faulty > 0) {
                    $hasFaulty = true;
                    $faultyDetails[] = "Product ID {$item['product_id']}: {$faulty} faulty units. " . ($desc ?? '');
                }

                $itemStmt->execute([
                    $inspectionId,
                    intval($item['product_id']),
                    $total,
                    $perfect,
                    $faulty,
                    $desc,
                    $cond
                ]);
            }

            // Auto-generate Complaint Ticket if customer marked faulty items
            $ticketNumber = null;
            $ticketId = null;
            if ($hasFaulty || $overallStatus !== 'accepted_perfect') {
                $ts5 = substr((string)time(), -5);
                $ticketNumber = 'TKT_' . date('Ymd') . $ts5;
                // Ensure uniqueness if multiple tickets are generated in the same second
                $chk = $this->db->prepare("SELECT id FROM complaint_tickets WHERE ticket_number = ?");
                $chk->execute([$ticketNumber]);
                if ($chk->fetch()) {
                    $ticketNumber = 'TKT_' . date('Ymd') . str_pad((string)mt_rand(0, 99999), 5, '0', STR_PAD_LEFT);
                }

                $tktStmt = $this->db->prepare("
                    INSERT INTO complaint_tickets (ticket_number, customer_inspection_id, po_id, customer_id, title, issue_details, severity, return_material_status, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'high', 'requested', 'open')
                ");
                $tktStmt->execute([
                    $ticketNumber,
                    $inspectionId,
                    $disp['po_id'],
                    $po['customer_id'],
                    'Defective Units Reported during Inward Customer QC',
                    implode("; ", $faultyDetails) . " " . $remarks
                ]);
                $ticketId = $this->db->lastInsertId();
            }

            $this->db->commit();
            Audit::log($this->db, 'customer_portal', 'inspect', 'CustomerInspection', (string)$inspectionId, "Customer performed inward QC on Dispatch ID {$b['dispatch_id']}. Result: {$overallStatus}." . ($ticketNumber ? " Defective units flagged. Generated Ticket {$ticketNumber}." : " 100% Perfect."));

            Response::success("Customer inspection recorded successfully", [
                "inspection_id" => $inspectionId,
                "overall_status" => $overallStatus,
                "has_faulty" => $hasFaulty,
                "ticket_id" => $ticketId,
                "ticket_number" => $ticketNumber,
                "complaint_ticket" => $ticketNumber
            ], 201);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to record customer inspection: " . $e->getMessage());
        }
    }

    /**
     * Get all Complaints / RMA tickets
     */
    public function getComplaints() {
        $sql = "
            SELECT ct.*, po.po_number, po.customer_po_reference, c.company_name as customer_name,
                   c.contact_person, c.email as customer_email, c.phone as customer_phone,
                   u.name as assigned_to_name, r.name as assigned_to_role
            FROM complaint_tickets ct
            JOIN purchase_orders po ON ct.po_id = po.id
            JOIN customers c ON ct.customer_id = c.id
            LEFT JOIN users u ON ct.assigned_to = u.id
            LEFT JOIN roles r ON u.role_id = r.id
            ORDER BY ct.id DESC
        ";
        $stmt = $this->db->query($sql);
        Response::success("Complaints fetched", $stmt->fetchAll());
    }

    public function createComplaint() {
        $b = Response::getBody();
        if (empty($b['po_id']) || empty($b['title']) || empty($b['issue_details'])) {
            Response::error("PO ID, title, and issue details are required");
        }

        $poStmt = $this->db->prepare("SELECT customer_id FROM purchase_orders WHERE id = ?");
        $poStmt->execute([intval($b['po_id'])]);
        $po = $poStmt->fetch();
        if (!$po) {
            Response::error("Purchase order not found");
        }

        $ts5 = substr((string)time(), -5);
        $ticketNumber = 'TKT_' . date('Ymd') . $ts5;
        $chk = $this->db->prepare("SELECT id FROM complaint_tickets WHERE ticket_number = ?");
        $chk->execute([$ticketNumber]);
        if ($chk->fetch()) {
            $ticketNumber = 'TKT_' . date('Ymd') . str_pad((string)mt_rand(0, 99999), 5, '0', STR_PAD_LEFT);
        }

        $stmt = $this->db->prepare("
            INSERT INTO complaint_tickets (ticket_number, po_id, customer_id, title, issue_details, severity, return_material_status, status, assigned_to)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
        ");
        $stmt->execute([
            $ticketNumber,
            intval($b['po_id']),
            $po['customer_id'],
            $b['title'],
            $b['issue_details'],
            $b['severity'] ?? 'medium',
            $b['return_material_status'] ?? 'requested',
            Response::resolveUserId($this->db, $b['assigned_to'] ?? null, true)
        ]);
        $id = $this->db->lastInsertId();
        Audit::log($this->db, 'customer_portal', 'create_ticket', 'ComplaintTicket', $ticketNumber, "Created ticket {$ticketNumber}: {$b['title']}");
        Response::success("Ticket created successfully", ["id" => $id, "ticket_number" => $ticketNumber], 201);
    }

    /**
     * Resolve / Update / Assign Complaint Ticket
     */
    public function updateComplaint($id) {
        $b = Response::getBody();
        $fields = [];
        $params = [];

        if (isset($b['status'])) {
            $fields[] = "status = ?";
            $params[] = $b['status'];
        }
        if (isset($b['return_material_status'])) {
            $fields[] = "return_material_status = ?";
            $params[] = $b['return_material_status'];
        }
        if (array_key_exists('resolution_notes', $b)) {
            $fields[] = "resolution_notes = ?";
            $params[] = $b['resolution_notes'];
        }
        if (array_key_exists('assigned_to', $b)) {
            $fields[] = "assigned_to = ?";
            $params[] = Response::resolveUserId($this->db, $b['assigned_to'] ?? null, true);
        }

        if (empty($fields)) {
            Response::error("No fields to update");
        }

        $params[] = $id;
        $stmt = $this->db->prepare("UPDATE complaint_tickets SET " . implode(", ", $fields) . " WHERE id = ?");
        $stmt->execute($params);

        if (array_key_exists('assigned_to', $b)) {
            Audit::log($this->db, 'customer_portal', 'assign_ticket', 'ComplaintTicket', (string)$id, "Assigned ticket ID {$id} to user ID " . ($b['assigned_to'] ?: 'Unassigned'));
        }

        Response::success("Complaint ticket updated");
    }

    /**
     * Release Final Payment
     */
    public function releaseFinalPayment() {
        $b = Response::getBody();
        $txRef = $b['transaction_reference'] ?? $b['reference_number'] ?? null;
        if (empty($b['po_id']) || empty($b['amount']) || empty($txRef)) {
            Response::error("PO ID, payment amount and transaction reference are required");
        }

        $poStmt = $this->db->prepare("SELECT quotation_id, customer_id, total_amount FROM purchase_orders WHERE id = ?");
        $poStmt->execute([$b['po_id']]);
        $po = $poStmt->fetch();

        if (!$po) {
            Response::error("Purchase order not found");
        }

        $paymentNumber = 'PAY-' . date('Y') . '-' . strtoupper(substr(uniqid(), -5));
        $amount = floatval($b['amount']);
        $method = $b['payment_method'] ?? $b['payment_mode'] ?? 'bank_transfer';
        $notes = $b['notes'] ?? $b['remarks'] ?? 'Final milestone payment released following satisfactory customer quality check';

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("
                INSERT INTO payments (payment_number, po_id, quotation_id, customer_id, payment_date, amount,
                                     payment_method, transaction_reference, payment_type, status, notes)
                VALUES (?, ?, ?, ?, CURDATE(), ?, ?, ?, 'final', 'verified', ?)
            ");
            $stmt->execute([
                $paymentNumber,
                $b['po_id'],
                $po['quotation_id'],
                $po['customer_id'],
                $amount,
                $method,
                $txRef,
                $notes
            ]);

            if (class_exists('PaymentController')) {
                (new PaymentController($this->db))->recalculatePoAllocations(intval($b['po_id']));
            }

            // Mark PO as completed
            $this->db->prepare("UPDATE purchase_orders SET status = 'completed' WHERE id = ?")->execute([$b['po_id']]);

            $this->db->commit();
            Audit::log($this->db, 'payments', 'create', 'Payment', $paymentNumber, "Client released final settlement payment of ₹{$amount} (UTR: {$txRef}) for PO ID {$b['po_id']}. Order Lifecycle Closed.");

            Response::success("Final payment released and verified! Order lifecycle is officially closed.", [
                "payment_number" => $paymentNumber
            ]);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to release final payment: " . $e->getMessage());
        }
    }
}
