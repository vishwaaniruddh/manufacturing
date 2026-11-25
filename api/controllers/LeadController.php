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
        $rows = $stmt->fetchAll();

        if (!empty($rows)) {
            $qStmt = $this->db->query("
                SELECT id, lead_id, quotation_number, revision_number, status, total_amount
                FROM quotations
                ORDER BY id DESC
            ");
            $quotesByLead = [];
            foreach ($qStmt->fetchAll() as $q) {
                $quotesByLead[intval($q['lead_id'])][] = [
                    'id' => intval($q['id']),
                    'quotation_number' => $q['quotation_number'],
                    'revision_number' => intval($q['revision_number']),
                    'status' => $q['status'],
                    'total_amount' => floatval($q['total_amount'])
                ];
            }

            $poStmt = $this->db->query("
                SELECT po.id, po.po_number, po.customer_po_reference, po.quotation_id, po.status, po.total_amount, q.lead_id
                FROM purchase_orders po
                JOIN quotations q ON po.quotation_id = q.id
                ORDER BY po.id DESC
            ");
            $posByLead = [];
            foreach ($poStmt->fetchAll() as $po) {
                $posByLead[intval($po['lead_id'])][] = [
                    'id' => intval($po['id']),
                    'po_number' => $po['po_number'],
                    'customer_po_reference' => $po['customer_po_reference'],
                    'quotation_id' => intval($po['quotation_id']),
                    'status' => $po['status'],
                    'total_amount' => floatval($po['total_amount'])
                ];
            }

            foreach ($rows as &$r) {
                $lId = intval($r['id']);
                $r['linked_quotations'] = $quotesByLead[$lId] ?? [];
                $r['quotation_count'] = count($r['linked_quotations']);
                $r['linked_pos'] = $posByLead[$lId] ?? [];
                $r['po_count'] = count($r['linked_pos']);
            }
            unset($r);
        }

        Response::success("Leads fetched", $rows);
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

        $leadNumber = !empty($b['lead_number'])
            ? trim($b['lead_number'])
            : 'LEAD-' . date('Y') . '-' . strtoupper(substr(uniqid(), -5));

        $stmt = $this->db->prepare("
            INSERT INTO leads (lead_number, customer_id, title, requirement_details, estimated_value, source, priority, expected_close_date, status, remarks, assigned_to, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        ");
        $stmt->execute([
            $leadNumber,
            intval($b['customer_id']),
            $b['title'],
            $b['requirement_details'] ?? null,
            floatval($b['estimated_value'] ?? 0),
            $b['source'] ?? 'Direct Inquiry',
            $b['priority'] ?? 'medium',
            !empty($b['expected_close_date']) ? $b['expected_close_date'] : null,
            $b['remarks'] ?? null,
            Response::resolveUserId($this->db, $b['assigned_to'] ?? null, true),
            Response::resolveUserId($this->db, $b['created_by'] ?? null)
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
            SET customer_id = ?, title = ?, requirement_details = ?, estimated_value = ?, source = ?, priority = ?, expected_close_date = ?, assigned_to = ?, remarks = ?
            WHERE id = ?
        ");
        $stmt->execute([
            intval($b['customer_id']),
            $b['title'],
            $b['requirement_details'] ?? null,
            floatval($b['estimated_value'] ?? 0),
            $b['source'] ?? 'Direct Inquiry',
            $b['priority'] ?? 'medium',
            !empty($b['expected_close_date']) ? $b['expected_close_date'] : null,
            Response::resolveUserId($this->db, $b['assigned_to'] ?? null, true),
            $b['remarks'] ?? null,
            $id
        ]);

        Response::success("Lead updated successfully");
    }

    public function bulkImport() {
        $b = Response::getBody();
        $rows = $b['rows'] ?? [];
        if (!is_array($rows) || empty($rows)) {
            Response::error("No lead rows provided for import");
        }

        $defaultSource = $b['default_source'] ?? 'Excel Import';
        $defaultPriority = $b['default_priority'] ?? 'medium';
        $defaultAssignedTo = Response::resolveUserId($this->db, $b['default_assigned_to'] ?? null, true);
        $createdBy = Response::resolveUserId($this->db, $b['created_by'] ?? null);

        // Preload customers & users for fast matching
        $custMap = [];
        foreach ($this->db->query("SELECT id, company_name FROM customers")->fetchAll() as $c) {
            $custMap[strtolower(trim($c['company_name']))] = intval($c['id']);
        }
        $userMap = [];
        foreach ($this->db->query("SELECT id, name, email FROM users")->fetchAll() as $u) {
            $userMap[strtolower(trim($u['name']))] = intval($u['id']);
            $userMap[strtolower(trim($u['email']))] = intval($u['id']);
        }

        $insCust = $this->db->prepare("
            INSERT INTO customers (company_name, contact_person, email, phone, status)
            VALUES (?, ?, ?, ?, 'active')
        ");
        $insLead = $this->db->prepare("
            INSERT INTO leads (lead_number, customer_id, title, requirement_details, estimated_value, source, priority, expected_close_date, status, remarks, assigned_to, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        ");
        $chkLeadNum = $this->db->prepare("SELECT id FROM leads WHERE lead_number = ?");

        $imported = 0;
        $skipped = 0;

        $this->db->beginTransaction();
        try {
            foreach ($rows as $row) {
                $title = trim((string)($row['title'] ?? $row['lead_name'] ?? ''));
                if ($title === '') {
                    $skipped++;
                    continue;
                }

                // Resolve or create customer
                $custId = !empty($row['customer_id']) ? intval($row['customer_id']) : 0;
                $custName = trim((string)($row['customer_name'] ?? ''));
                if (!$custId && $custName !== '') {
                    $key = strtolower($custName);
                    if (isset($custMap[$key])) {
                        $custId = $custMap[$key];
                    } else {
                        $email = trim((string)($row['customer_email'] ?? '')) ?: ('contact+' . substr(uniqid(), -5) . '@lead-import.local');
                        $phone = trim((string)($row['customer_phone'] ?? '')) ?: '0000000000';
                        $insCust->execute([$custName, $custName, $email, $phone]);
                        $custId = intval($this->db->lastInsertId());
                        $custMap[$key] = $custId;
                    }
                }
                if (!$custId) {
                    // Fallback to first customer if none supplied
                    $custId = intval($this->db->query("SELECT id FROM customers ORDER BY id ASC LIMIT 1")->fetchColumn());
                }

                $leadNumber = trim((string)($row['lead_number'] ?? ''));
                if ($leadNumber !== '') {
                    $chkLeadNum->execute([$leadNumber]);
                    if ($chkLeadNum->fetch()) {
                        $leadNumber = $leadNumber . '-' . strtoupper(substr(uniqid(), -3));
                    }
                } else {
                    $leadNumber = 'LEAD-' . date('Y') . '-' . strtoupper(substr(uniqid(), -5));
                }

                $assigneeId = $defaultAssignedTo;
                $rawAssignee = strtolower(trim((string)($row['assigned_to'] ?? '')));
                if ($rawAssignee !== '' && isset($userMap[$rawAssignee])) {
                    $assigneeId = $userMap[$rawAssignee];
                }

                $prio = strtolower(trim((string)($row['priority'] ?? $defaultPriority)));
                if (!in_array($prio, ['low', 'medium', 'high', 'urgent'])) {
                    $prio = $defaultPriority;
                }

                $closeDate = !empty($row['expected_close_date']) ? date('Y-m-d', strtotime((string)$row['expected_close_date'])) : null;

                $insLead->execute([
                    $leadNumber,
                    $custId,
                    $title,
                    $row['requirement_details'] ?? null,
                    floatval(preg_replace('/[^0-9.\-]/', '', (string)($row['estimated_value'] ?? 0))),
                    !empty($row['source']) ? trim((string)$row['source']) : $defaultSource,
                    $prio,
                    $closeDate,
                    $row['remarks'] ?? null,
                    $assigneeId,
                    $createdBy
                ]);
                $imported++;
            }

            $this->db->commit();
            Audit::log($this->db, 'leads', 'bulk_import', 'Lead', (string)$imported, "Bulk imported {$imported} leads via Lead Creation Engine (skipped: {$skipped}).");
            Response::success("Imported {$imported} lead(s) successfully.", [
                "imported_count" => $imported,
                "skipped_count" => $skipped
            ], 201);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Bulk lead import failed: " . $e->getMessage());
        }
    }

    public function approve($id) {
        $b = Response::getBody();
        $approvedBy = Response::resolveUserId($this->db, $b['user_id'] ?? null);
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
        $rejectedBy = Response::resolveUserId($this->db, $b['user_id'] ?? null);
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
