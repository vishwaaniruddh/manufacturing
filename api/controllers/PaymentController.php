<?php
// api/controllers/PaymentController.php

class PaymentController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
    }

    public function getAll() {
        $poId = $_GET['po_id'] ?? null;
        $sql = "
            SELECT p.*, po.po_number, po.customer_po_reference, po.total_amount as po_total_amount,
                   c.company_name as customer_name, q.quotation_number
            FROM payments p
            JOIN purchase_orders po ON p.po_id = po.id
            JOIN customers c ON p.customer_id = c.id
            LEFT JOIN quotations q ON p.quotation_id = q.id
        ";
        $params = [];
        if ($poId) {
            $sql .= " WHERE p.po_id = ?";
            $params[] = $poId;
        }
        $sql .= " ORDER BY p.payment_date DESC, p.id DESC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        Response::success("Payments fetched", $stmt->fetchAll());
    }

    public function create() {
        $b = Response::getBody();
        $txRef = $b['transaction_reference'] ?? $b['reference_number'] ?? null;
        if (empty($b['po_id']) || empty($b['amount']) || empty($txRef)) {
            Response::error("PO ID, payment amount and transaction reference are required");
        }

        $poStmt = $this->db->prepare("SELECT customer_id, quotation_id, total_amount FROM purchase_orders WHERE id = ?");
        $poStmt->execute([$b['po_id']]);
        $po = $poStmt->fetch();

        if (!$po) {
            Response::error("Purchase order not found");
        }

        $paymentNumber = 'PAY-' . date('Y') . '-' . strtoupper(substr(uniqid(), -5));
        $paymentDate = $b['payment_date'] ?? date('Y-m-d');
        $amount = floatval($b['amount']);
        $paymentMethod = $b['payment_method'] ?? $b['payment_mode'] ?? 'bank_transfer';
        $paymentType = $b['payment_type'] ?? 'milestone';
        $notes = $b['notes'] ?? $b['remarks'] ?? null;

        $stmt = $this->db->prepare("
            INSERT INTO payments (payment_number, po_id, quotation_id, customer_id, payment_date, amount,
                                 payment_method, transaction_reference, payment_type, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?)
        ");
        $stmt->execute([
            $paymentNumber,
            $b['po_id'],
            $po['quotation_id'],
            $po['customer_id'],
            $paymentDate,
            $amount,
            $paymentMethod,
            $txRef,
            $paymentType,
            $notes
        ]);
        $paymentId = $this->db->lastInsertId();

        // Check if fully paid and update PO status if appropriate
        $sumStmt = $this->db->prepare("SELECT SUM(amount) as paid FROM payments WHERE po_id = ? AND status = 'verified'");
        $sumStmt->execute([$b['po_id']]);
        $sum = $sumStmt->fetch();
        $totalPaid = floatval($sum['paid'] ?? 0);
        Audit::log($this->db, 'payments', 'create', 'Payment', $paymentNumber, "Recorded {$paymentType} payment of ₹{$amount} (UTR: {$txRef}) for PO ID {$b['po_id']}. Cumulative Paid: ₹{$totalPaid}.");

        Response::success("Payment recorded successfully", [
            "id" => $paymentId,
            "payment_number" => $paymentNumber,
            "amount" => $amount,
            "total_paid" => $totalPaid,
            "po_total" => floatval($po['total_amount']),
            "balance_due" => max(0, floatval($po['total_amount']) - $totalPaid)
        ], 201);
    }

    public function getSummary($poId) {
        $poStmt = $this->db->prepare("SELECT total_amount FROM purchase_orders WHERE id = ?");
        $poStmt->execute([$poId]);
        $po = $poStmt->fetch();

        if (!$po) {
            Response::error("Purchase order not found", 404);
        }

        $pStmt = $this->db->prepare("SELECT * FROM payments WHERE po_id = ? ORDER BY payment_date DESC");
        $pStmt->execute([$poId]);
        $payments = $pStmt->fetchAll();

        $totalPaid = 0;
        foreach ($payments as $p) {
            if ($p['status'] === 'verified') {
                $totalPaid += floatval($p['amount']);
            }
        }
        $poTotal = floatval($po['total_amount']);
        $balance = max(0, $poTotal - $totalPaid);
        $percentPaid = ($poTotal > 0) ? round(($totalPaid / $poTotal) * 100, 2) : 0;

        Response::success("Payment summary", [
            "po_total" => $poTotal,
            "total_paid" => $totalPaid,
            "balance_due" => $balance,
            "percent_paid" => $percentPaid,
            "status" => ($totalPaid >= $poTotal) ? 'fully_paid' : (($totalPaid > 0) ? 'partially_paid' : 'unpaid'),
            "payments" => $payments
        ]);
    }
}
