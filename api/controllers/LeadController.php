<?php
// api/controllers/LeadController.php

class LeadController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
    }

    public function getAll() {
        $status = $_GET['status'] ?? null;
        $sql = "
            SELECT l.*, c.company_name as customer_name, c.email as customer_email, c.phone as customer_phone,
                   u.name as assigned_to_name, ab.name as approved_by_name,
                   (SELECT COUNT(*) FROM quotations q WHERE q.lead_id = l.id) as quotation_count
            FROM leads l
            JOIN customers c ON l.customer_id = c.id
            LEFT JOIN users u ON l.assigned_to = u.id
            LEFT JOIN users ab ON l.approved_by = ab.id
        ";
        $params = [];
        if ($status && in_array($status, ['pending', 'approved', 'rejected'])) {
            $sql .= " WHERE l.status = ?";
            $params[] = $status;
        }
        $sql .= " ORDER BY l.id DESC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        Response::success("Leads fetched", $stmt->fetchAll());
    }

    public function getOne($id) {
        $stmt = $this->db->prepare("
            SELECT l.*, c.company_name as customer_name, c.contact_person, c.email as customer_email, c.phone as customer_phone,
                   u.name as assigned_to_name, ab.name as approved_by_name
            FROM leads l
            JOIN customers c ON l.customer_id = c.id
            LEFT JOIN users u ON l.assigned_to = u.id
            LEFT JOIN users ab ON l.approved_by = ab.id
            WHERE l.id = ?
        ");
        $stmt->execute([$id]);
        $lead = $stmt->fetch();

        if (!$lead) {
            Response::error("Lead not found", 404);
        }

        // Fetch quotations against this lead
        $qStmt = $this->db->prepare("SELECT * FROM quotations WHERE lead_id = ? ORDER BY id DESC");
        $qStmt->execute([$id]);
        $lead['quotations'] = $qStmt->fetchAll();

        Response::success("Lead details", $lead);
    }

    public function create() {
        $b = Response::getBody();
        if (empty($b['customer_id']) || empty($b['title'])) {
            Response::error("Customer and Lead Title are required");
        }

        $leadNumber = 'LEAD-' . date('Y') . '-' . strtoupper(substr(uniqid(), -5));

        $stmt = $this->db->prepare("
            INSERT INTO leads (lead_number, customer_id, title, requirement_details, estimated_value, source, status, remarks, assigned_to, created_by)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        ");
        $stmt->execute([
            $leadNumber,
            intval($b['customer_id']),
            $b['title'],
            $b['requirement_details'] ?? null,
            floatval($b['estimated_value'] ?? 0),
            $b['source'] ?? 'Direct Inquiry',
            $b['remarks'] ?? null,
            !empty($b['assigned_to']) ? intval($b['assigned_to']) : null,
            !empty($b['created_by']) ? intval($b['created_by']) : 1
        ]);

        $leadId = $this->db->lastInsertId();
        Audit::log($this->db, 'leads', 'create', 'Lead', $leadNumber, "Created lead '{$b['title']}' for customer ID {$b['customer_id']}. Estimated value: ₹" . floatval($b['estimated_value'] ?? 0));

        Response::success("Lead created successfully", [
            "id" => $leadId,
            "lead_number" => $leadNumber
        ], 201);
    }

    public function update($id) {
        $b = Response::getBody();
        $stmt = $this->db->prepare("
            UPDATE leads
            SET customer_id = ?, title = ?, requirement_details = ?, estimated_value = ?, source = ?, assigned_to = ?, remarks = ?
            WHERE id = ?
        ");
        $stmt->execute([
            intval($b['customer_id']),
            $b['title'],
            $b['requirement_details'] ?? null,
            floatval($b['estimated_value'] ?? 0),
            $b['source'] ?? 'Direct Inquiry',
            !empty($b['assigned_to']) ? intval($b['assigned_to']) : null,
            $b['remarks'] ?? null,
            $id
        ]);

        Response::success("Lead updated successfully");
    }

    public function approve($id) {
        $b = Response::getBody();
        $approvedBy = !empty($b['user_id']) ? intval($b['user_id']) : 1;
        $remarks = $b['remarks'] ?? 'Lead approved for quotation';

        $stmt = $this->db->prepare("
            UPDATE leads
            SET status = 'approved', remarks = ?, approved_by = ?, approved_at = NOW()
            WHERE id = ?
        ");
        $stmt->execute([$remarks, $approvedBy, $id]);
        Audit::log($this->db, 'leads', 'approve', 'Lead', (string)$id, "Approved lead ID {$id}. Remarks: {$remarks}");

        Response::success("Lead approved successfully. Ready for quotation creation.");
    }

    public function reject($id) {
        $b = Response::getBody();
        $rejectedBy = !empty($b['user_id']) ? intval($b['user_id']) : 1;
        $remarks = $b['remarks'] ?? 'Lead rejected';

        if (empty($remarks)) {
            Response::error("Remarks are required when rejecting a lead");
        }

        $stmt = $this->db->prepare("
            UPDATE leads
            SET status = 'rejected', remarks = ?, approved_by = ?, approved_at = NOW()
            WHERE id = ?
        ");
        $stmt->execute([$remarks, $rejectedBy, $id]);
        Audit::log($this->db, 'leads', 'reject', 'Lead', (string)$id, "Rejected lead ID {$id}. Remarks: {$remarks}");

        Response::success("Lead marked as rejected");
    }

    public function delete($id) {
        $stmt = $this->db->prepare("DELETE FROM leads WHERE id = ?");
        $stmt->execute([$id]);
        Response::success("Lead deleted");
    }
}
