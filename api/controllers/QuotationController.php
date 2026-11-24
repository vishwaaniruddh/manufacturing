<?php
// api/controllers/QuotationController.php

class QuotationController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
    }

    public function getAll() {
        $leadId = $_GET['lead_id'] ?? null;
        $sql = "
            SELECT q.*, l.lead_number, l.title as lead_title, c.company_name as customer_name,
                   (SELECT COUNT(*) FROM quotation_items qi WHERE qi.quotation_id = q.id) as item_count,
                   (SELECT COUNT(*) FROM purchase_orders po WHERE po.quotation_id = q.id) as po_count
            FROM quotations q
            JOIN leads l ON q.lead_id = l.id
            JOIN customers c ON q.customer_id = c.id
        ";
        $params = [];
        if ($leadId) {
            $sql .= " WHERE q.lead_id = ?";
            $params[] = $leadId;
        }
        $sql .= " ORDER BY q.id DESC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        Response::success("Quotations fetched", $stmt->fetchAll());
    }

    public function getOne($id) {
        $stmt = $this->db->prepare("
            SELECT q.*, l.lead_number, l.title as lead_title, c.company_name as customer_name, c.email as customer_email,
                   c.phone as customer_phone, c.gst_number as customer_gst, c.address as customer_address
            FROM quotations q
            JOIN leads l ON q.lead_id = l.id
            JOIN customers c ON q.customer_id = c.id
            WHERE q.id = ?
        ");
        $stmt->execute([$id]);
        $quotation = $stmt->fetch();

        if (!$quotation) {
            Response::error("Quotation not found", 404);
        }

        // Fetch Items
        $iStmt = $this->db->prepare("
            SELECT qi.*, p.name as product_name, p.sku as product_sku, p.uom
            FROM quotation_items qi
            JOIN products p ON qi.product_id = p.id
            WHERE qi.quotation_id = ?
        ");
        $iStmt->execute([$id]);
        $quotation['items'] = $iStmt->fetchAll();

        // Fetch PO if generated
        $poStmt = $this->db->prepare("SELECT * FROM purchase_orders WHERE quotation_id = ?");
        $poStmt->execute([$id]);
        $quotation['purchase_orders'] = $poStmt->fetchAll();

        Response::success("Quotation details", $quotation);
    }

    public function create() {
        $b = Response::getBody();
        if (empty($b['lead_id']) || empty($b['items']) || !is_array($b['items'])) {
            Response::error("Lead ID and quotation items are required");
        }

        // Verify that the lead is approved
        $lStmt = $this->db->prepare("SELECT customer_id, status FROM leads WHERE id = ?");
        $lStmt->execute([$b['lead_id']]);
        $lead = $lStmt->fetch();

        if (!$lead) {
            Response::error("Invalid Lead ID");
        }
        if ($lead['status'] !== 'approved') {
            Response::error("Cannot create quotation: Lead status is '" . $lead['status'] . "'. Lead must be 'approved' first.");
        }

        // Determine revision number for this lead
        $rStmt = $this->db->prepare("SELECT MAX(revision_number) as max_rev FROM quotations WHERE lead_id = ?");
        $rStmt->execute([$b['lead_id']]);
        $revRow = $rStmt->fetch();
        $revisionNumber = ($revRow['max_rev'] ?? 0) + 1;

        $quotationNumber = 'QT-' . date('Y') . '-' . str_pad($b['lead_id'], 3, '0', STR_PAD_LEFT) . '-R' . $revisionNumber;
        $customerId = $b['customer_id'] ?? $lead['customer_id'];
        $quotationDate = $b['quotation_date'] ?? date('Y-m-d');
        $validUntil = $b['valid_until'] ?? date('Y-m-d', strtotime('+30 days'));

        $this->db->beginTransaction();
        try {
            // Calculate totals
            $subtotal = 0;
            $taxAmount = 0;
            foreach ($b['items'] as $item) {
                $qty = floatval($item['quantity'] ?? 1);
                $rate = floatval($item['unit_price'] ?? 0);
                $taxPct = floatval($item['tax_percent'] ?? 18);
                $lineTotal = $qty * $rate;
                $lineTax = $lineTotal * ($taxPct / 100);
                $subtotal += $lineTotal;
                $taxAmount += $lineTax;
            }
            $totalAmount = $subtotal + $taxAmount;

            $stmt = $this->db->prepare("
                INSERT INTO quotations (quotation_number, lead_id, customer_id, revision_number, quotation_date, valid_until,
                                       subtotal, tax_amount, total_amount, terms_conditions, status, remarks, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
            ");
            $stmt->execute([
                $quotationNumber,
                $b['lead_id'],
                $customerId,
                $revisionNumber,
                $quotationDate,
                $validUntil,
                $subtotal,
                $taxAmount,
                $totalAmount,
                $b['terms_conditions'] ?? "1. 50% advance on PO confirmation, balance prior to dispatch.\n2. Delivery time: 3 weeks.\n3. Standard 12 months warranty.",
                $b['remarks'] ?? null,
                !empty($b['created_by']) ? intval($b['created_by']) : 1
            ]);
            $quotationId = $this->db->lastInsertId();

            // Insert quotation items
            $itemStmt = $this->db->prepare("
                INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, tax_percent, total_price)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            foreach ($b['items'] as $item) {
                $qty = floatval($item['quantity'] ?? 1);
                $rate = floatval($item['unit_price'] ?? 0);
                $taxPct = floatval($item['tax_percent'] ?? 18);
                $lineTotalWithTax = ($qty * $rate) * (1 + $taxPct / 100);

                $itemStmt->execute([
                    $quotationId,
                    intval($item['product_id']),
                    $qty,
                    $rate,
                    $taxPct,
                    $lineTotalWithTax
                ]);
            }

            $this->db->commit();
            Audit::log($this->db, 'quotations', 'create', 'Quotation', $quotationNumber, "Created Revision {$revisionNumber} quotation for Lead ID {$b['lead_id']}. Grand Total: ₹{$totalAmount}");

            Response::success("Quotation created successfully", [
                "id" => $quotationId,
                "quotation_number" => $quotationNumber,
                "revision_number" => $revisionNumber,
                "total_amount" => $totalAmount
            ], 201);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to create quotation: " . $e->getMessage());
        }
    }

    public function update($id) {
        $b = Response::getBody();
        $this->db->beginTransaction();
        try {
            $subtotal = 0;
            $taxAmount = 0;
            if (!empty($b['items']) && is_array($b['items'])) {
                // Delete existing items and recalculate
                $this->db->prepare("DELETE FROM quotation_items WHERE quotation_id = ?")->execute([$id]);

                $itemStmt = $this->db->prepare("
                    INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, tax_percent, total_price)
                    VALUES (?, ?, ?, ?, ?, ?)
                ");
                foreach ($b['items'] as $item) {
                    $qty = floatval($item['quantity'] ?? 1);
                    $rate = floatval($item['unit_price'] ?? 0);
                    $taxPct = floatval($item['tax_percent'] ?? 18);
                    $lineTotal = $qty * $rate;
                    $lineTax = $lineTotal * ($taxPct / 100);
                    $lineTotalWithTax = $lineTotal + $lineTax;

                    $subtotal += $lineTotal;
                    $taxAmount += $lineTax;

                    $itemStmt->execute([
                        $id,
                        intval($item['product_id']),
                        $qty,
                        $rate,
                        $taxPct,
                        $lineTotalWithTax
                    ]);
                }
            } else {
                // Keep existing subtotal & tax
                $q = $this->db->query("SELECT subtotal, tax_amount FROM quotations WHERE id = $id")->fetch();
                $subtotal = $q['subtotal'];
                $taxAmount = $q['tax_amount'];
            }
            $totalAmount = $subtotal + $taxAmount;

            $stmt = $this->db->prepare("
                UPDATE quotations
                SET valid_until = ?, subtotal = ?, tax_amount = ?, total_amount = ?, terms_conditions = ?, remarks = ?, status = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $b['valid_until'] ?? date('Y-m-d', strtotime('+30 days')),
                $subtotal,
                $taxAmount,
                $totalAmount,
                $b['terms_conditions'] ?? null,
                $b['remarks'] ?? null,
                $b['status'] ?? 'draft',
                $id
            ]);

            $this->db->commit();
            Response::success("Quotation updated successfully");
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to update quotation: " . $e->getMessage());
        }
    }

    public function approve($id) {
        $stmt = $this->db->prepare("UPDATE quotations SET status = 'approved' WHERE id = ?");
        $stmt->execute([$id]);
        Audit::log($this->db, 'quotations', 'approve', 'Quotation', (string)$id, "Quotation ID {$id} approved by client.");
        Response::success("Quotation approved. Ready for Customer Purchase Order creation.");
    }

    public function reject($id) {
        $b = Response::getBody();
        $remarks = $b['remarks'] ?? 'Quotation rejected by client';
        $stmt = $this->db->prepare("UPDATE quotations SET status = 'rejected', remarks = ? WHERE id = ?");
        $stmt->execute([$remarks, $id]);
        Audit::log($this->db, 'quotations', 'reject', 'Quotation', (string)$id, "Quotation ID {$id} rejected. Remarks: {$remarks}");
        Response::success("Quotation marked as rejected");
    }

    public function delete($id) {
        $stmt = $this->db->prepare("DELETE FROM quotations WHERE id = ?");
        $stmt->execute([$id]);
        Response::success("Quotation deleted");
    }
}
