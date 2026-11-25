<?php
// api/controllers/PaymentController.php

class PaymentController {
    private $db;
    private static $schemaChecked = false;

    private const ALLOWED_METHODS = ['bank_transfer', 'cheque', 'upi', 'credit_card', 'cash'];
    private const ALLOWED_STATUSES = ['received', 'verified', 'rejected'];
    private const ALLOWED_EXCESS_HANDLING = [
        'none',
        'customer_credit',
        'refund_pending',
        'adjust_next_po',
        'retained',
        'refund_out',
        'credit_transfer'
    ];

    public function __construct($pdo) {
        $this->db = $pdo;
        $this->ensureSchema();
    }

    private function ensureSchema() {
        if (self::$schemaChecked) return;
        self::$schemaChecked = true;

        $added = false;
        try {
            $cols = $this->db->query("SHOW COLUMNS FROM payments")->fetchAll(PDO::FETCH_COLUMN);
            $alterStatements = [
                'applied_amount'  => "ALTER TABLE payments ADD COLUMN applied_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER amount",
                'excess_amount'   => "ALTER TABLE payments ADD COLUMN excess_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER applied_amount",
                'excess_handling' => "ALTER TABLE payments ADD COLUMN excess_handling VARCHAR(50) NOT NULL DEFAULT 'none' AFTER excess_amount",
                'bank_name'       => "ALTER TABLE payments ADD COLUMN bank_name VARCHAR(120) NULL AFTER transaction_reference",
                'payer_name'      => "ALTER TABLE payments ADD COLUMN payer_name VARCHAR(150) NULL AFTER bank_name",
                'instrument_date' => "ALTER TABLE payments ADD COLUMN instrument_date DATE NULL AFTER payer_name",
                'verified_by'     => "ALTER TABLE payments ADD COLUMN verified_by VARCHAR(100) NULL AFTER status",
                'verified_at'     => "ALTER TABLE payments ADD COLUMN verified_at DATETIME NULL AFTER verified_by",
                'updated_at'      => "ALTER TABLE payments ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at"
            ];

            foreach ($alterStatements as $col => $ddl) {
                if (!in_array($col, $cols, true)) {
                    $this->db->exec($ddl);
                    $added = true;
                }
            }

            if ($added) {
                $poIds = $this->db->query("SELECT DISTINCT po_id FROM payments")->fetchAll(PDO::FETCH_COLUMN);
                foreach ($poIds as $pid) {
                    $this->recalculatePoAllocations(intval($pid));
                }
            }
        } catch (Exception $e) {
            // Non-fatal if DB permissions restrict DDL
        }
    }

    public static function computePoFinancialState($poTotal, $verifiedPaid, $pendingPaid = 0.0) {
        $poTotal = round(floatval($poTotal), 2);
        $verifiedPaid = round(floatval($verifiedPaid), 2);
        $pendingPaid = round(floatval($pendingPaid), 2);

        $appliedToPo = round(min($poTotal, max(0.0, $verifiedPaid)), 2);
        $balanceDue = round(max(0.0, $poTotal - $verifiedPaid), 2);
        $excessAmount = round(max(0.0, $verifiedPaid - $poTotal), 2);
        $netBalance = round($poTotal - $verifiedPaid, 2);
        $percentPaid = ($poTotal > 0)
            ? round(($verifiedPaid / $poTotal) * 100, 2)
            : ($verifiedPaid > 0 ? 100.0 : 0.0);

        if ($verifiedPaid > $poTotal + 0.009) {
            $paymentStatus = 'overpaid';
        } elseif ($poTotal > 0 && $verifiedPaid >= $poTotal - 0.009) {
            $paymentStatus = 'fully_paid';
        } elseif ($verifiedPaid > 0) {
            $paymentStatus = 'partially_paid';
        } elseif ($pendingPaid > 0) {
            $paymentStatus = 'pending_verification';
        } else {
            $paymentStatus = 'unpaid';
        }

        return [
            'po_total' => $poTotal,
            'total_paid' => $verifiedPaid,
            'pending_paid' => $pendingPaid,
            'applied_to_po' => $appliedToPo,
            'balance_due' => $balanceDue,
            'excess_amount' => $excessAmount,
            'net_balance' => $netBalance,
            'percent_paid' => $percentPaid,
            'payment_status' => $paymentStatus
        ];
    }

    public function recalculatePoAllocations($poId) {
        $poId = intval($poId);
        if ($poId <= 0) return;

        $poStmt = $this->db->prepare("SELECT total_amount FROM purchase_orders WHERE id = ?");
        $poStmt->execute([$poId]);
        $poTotalRaw = $poStmt->fetchColumn();
        if ($poTotalRaw === false) return;
        $poTotal = round(floatval($poTotalRaw), 2);

        $rowsStmt = $this->db->prepare("
            SELECT id, amount, payment_type, status, excess_handling
            FROM payments
            WHERE po_id = ?
            ORDER BY payment_date ASC, id ASC
        ");
        $rowsStmt->execute([$poId]);
        $rows = $rowsStmt->fetchAll();

        $updStmt = $this->db->prepare("
            UPDATE payments
            SET applied_amount = ?, excess_amount = ?, excess_handling = ?
            WHERE id = ?
        ");

        $runningApplied = 0.0;
        foreach ($rows as $row) {
            $amt = round(floatval($row['amount']), 2);
            $handling = $row['excess_handling'] ?: 'none';

            if ($row['status'] !== 'verified') {
                $updStmt->execute([0.00, 0.00, ($handling === 'customer_credit' ? 'none' : $handling), $row['id']]);
                continue;
            }

            if ($amt < 0) {
                $defaultOutHandling = ($row['payment_type'] === 'credit_transfer') ? 'credit_transfer' : 'refund_out';
                $finalHandling = in_array($handling, ['refund_out', 'credit_transfer'], true) ? $handling : $defaultOutHandling;
                $updStmt->execute([0.00, $amt, $finalHandling, $row['id']]);
                continue;
            }

            $remainingNeeded = round(max(0.0, $poTotal - $runningApplied), 2);
            $applied = round(min($amt, $remainingNeeded), 2);
            $excess = round(max(0.0, $amt - $applied), 2);
            $runningApplied = round($runningApplied + $applied, 2);

            if ($excess > 0.009) {
                if ($handling === 'none' || !in_array($handling, self::ALLOWED_EXCESS_HANDLING, true)) {
                    $handling = 'customer_credit';
                }
            } else {
                if (in_array($handling, ['customer_credit', 'refund_pending', 'adjust_next_po', 'retained'], true)) {
                    $handling = 'none';
                }
            }

            $updStmt->execute([$applied, $excess, $handling, $row['id']]);
        }
    }

    private function getPoPaymentTotals($poId) {
        $stmt = $this->db->prepare("
            SELECT po.id, po.po_number, po.total_amount, po.customer_id, po.quotation_id,
                   COALESCE(SUM(CASE WHEN p.status = 'verified' THEN p.amount ELSE 0 END), 0) as verified_paid,
                   COALESCE(SUM(CASE WHEN p.status = 'received' THEN p.amount ELSE 0 END), 0) as pending_paid
            FROM purchase_orders po
            LEFT JOIN payments p ON p.po_id = po.id
            WHERE po.id = ?
            GROUP BY po.id
        ");
        $stmt->execute([intval($poId)]);
        return $stmt->fetch();
    }

    private function sanitizeMethod($method) {
        $m = strtolower(trim((string)($method ?? 'bank_transfer')));
        return in_array($m, self::ALLOWED_METHODS, true) ? $m : 'bank_transfer';
    }

    private function sanitizeStatus($status) {
        $s = strtolower(trim((string)($status ?? 'verified')));
        return in_array($s, self::ALLOWED_STATUSES, true) ? $s : 'verified';
    }

    private function sanitizeExcessHandling($handling, $fallback = 'none') {
        $h = strtolower(trim((string)($handling ?? $fallback)));
        return in_array($h, self::ALLOWED_EXCESS_HANDLING, true) ? $h : $fallback;
    }

    private function buildPaymentsQueryAndExecute($filters = []) {
        $sql = "
            SELECT p.*,
                   po.po_number, po.customer_po_reference, po.total_amount as po_total_amount,
                   po.status as po_status, po.payment_terms,
                   c.company_name as customer_name, c.gst_number as customer_gst,
                   c.email as customer_email, c.phone as customer_phone,
                   q.quotation_number
            FROM payments p
            JOIN purchase_orders po ON p.po_id = po.id
            JOIN customers c ON p.customer_id = c.id
            LEFT JOIN quotations q ON p.quotation_id = q.id
            WHERE 1=1
        ";
        $params = [];

        if (!empty($filters['po_id'])) {
            $sql .= " AND p.po_id = ?";
            $params[] = intval($filters['po_id']);
        }
        if (!empty($filters['customer_id'])) {
            $sql .= " AND p.customer_id = ?";
            $params[] = intval($filters['customer_id']);
        }
        if (!empty($filters['status'])) {
            $sql .= " AND p.status = ?";
            $params[] = $filters['status'];
        }
        if (!empty($filters['payment_type'])) {
            $sql .= " AND p.payment_type = ?";
            $params[] = $filters['payment_type'];
        }
        if (!empty($filters['payment_method'])) {
            $sql .= " AND p.payment_method = ?";
            $params[] = $filters['payment_method'];
        }

        $sql .= " ORDER BY p.payment_date DESC, p.id DESC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function getAll() {
        $payments = $this->buildPaymentsQueryAndExecute([
            'po_id' => $_GET['po_id'] ?? null,
            'customer_id' => $_GET['customer_id'] ?? null,
            'status' => $_GET['status'] ?? null,
            'payment_type' => $_GET['payment_type'] ?? null,
            'payment_method' => $_GET['payment_method'] ?? null
        ]);

        // Attach current PO financial state snapshot per row
        $poStateCache = [];
        foreach ($payments as &$pay) {
            $pid = intval($pay['po_id']);
            if (!isset($poStateCache[$pid])) {
                $row = $this->getPoPaymentTotals($pid);
                if ($row) {
                    // Self-heal historical unallocated verified rows created outside PaymentController (e.g., CustomerPortal)
                    if (
                        $pay['status'] === 'verified' &&
                        floatval($pay['amount']) > 0 &&
                        floatval($pay['applied_amount']) == 0 &&
                        floatval($pay['excess_amount']) == 0
                    ) {
                        $this->recalculatePoAllocations($pid);
                    }
                    $poStateCache[$pid] = self::computePoFinancialState(
                        $row['total_amount'],
                        $row['verified_paid'],
                        $row['pending_paid']
                    );
                } else {
                    $poStateCache[$pid] = self::computePoFinancialState(0, 0, 0);
                }
            }
            $st = $poStateCache[$pid];
            $pay['po_total_paid'] = $st['total_paid'];
            $pay['po_balance_due'] = $st['balance_due'];
            $pay['po_excess_amount'] = $st['excess_amount'];
            $pay['po_payment_status'] = $st['payment_status'];
        }

        Response::success("Payments fetched", $payments);
    }

    public function getLedger() {
        // Ensure any recent external payment inserts (e.g., CustomerPortalController) have allocations synced
        $unsyncedPoIds = $this->db->query("
            SELECT DISTINCT po_id
            FROM payments
            WHERE status = 'verified' AND amount > 0 AND applied_amount = 0 AND excess_amount = 0
        ")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($unsyncedPoIds as $uid) {
            $this->recalculatePoAllocations(intval($uid));
        }

        $payments = $this->buildPaymentsQueryAndExecute([
            'po_id' => $_GET['po_id'] ?? null,
            'customer_id' => $_GET['customer_id'] ?? null,
            'status' => $_GET['status'] ?? null,
            'payment_type' => $_GET['payment_type'] ?? null,
            'payment_method' => $_GET['payment_method'] ?? null
        ]);

        $poRows = $this->db->query("
            SELECT po.id as po_id, po.po_number, po.customer_po_reference, po.po_date, po.delivery_deadline,
                   po.subtotal, po.tax_amount, po.total_amount as po_total, po.payment_terms, po.status as po_status,
                   po.customer_id, c.company_name as customer_name, c.email as customer_email, c.phone as customer_phone,
                   q.quotation_number,
                   COUNT(p.id) as receipt_count,
                   COALESCE(SUM(CASE WHEN p.status = 'verified' THEN p.amount ELSE 0 END), 0) as verified_paid,
                   COALESCE(SUM(CASE WHEN p.status = 'received' THEN p.amount ELSE 0 END), 0) as pending_paid,
                   COALESCE(SUM(CASE WHEN p.status = 'rejected' THEN p.amount ELSE 0 END), 0) as rejected_paid,
                   COALESCE(SUM(CASE WHEN p.status = 'received' THEN 1 ELSE 0 END), 0) as pending_receipts,
                   COALESCE(SUM(CASE WHEN p.status = 'rejected' THEN 1 ELSE 0 END), 0) as rejected_receipts,
                   MAX(p.payment_date) as last_payment_date
            FROM purchase_orders po
            JOIN customers c ON po.customer_id = c.id
            LEFT JOIN quotations q ON po.quotation_id = q.id
            LEFT JOIN payments p ON p.po_id = po.id
            GROUP BY po.id
            HAVING po.status != 'cancelled' OR receipt_count > 0
            ORDER BY po.id DESC
        ")->fetchAll();

        $poLedgers = [];
        $poStateMap = [];
        $customerMap = [];

        $kpis = [
            'total_contract_value' => 0.0,
            'total_verified_collected' => 0.0,
            'total_pending_verification' => 0.0,
            'pending_count' => 0,
            'total_rejected' => 0.0,
            'rejected_count' => 0,
            'total_balance_due' => 0.0,
            'unpaid_or_partial_pos' => 0,
            'total_excess_received' => 0.0,
            'overpaid_pos' => 0,
            'fully_paid_pos' => 0,
            'total_pos' => 0,
            'receipt_count' => count($payments),
            'collection_rate' => 0.0
        ];

        foreach ($poRows as $row) {
            $state = self::computePoFinancialState(
                $row['po_total'],
                $row['verified_paid'],
                $row['pending_paid']
            );
            $pid = intval($row['po_id']);
            $poStateMap[$pid] = $state;

            $entry = array_merge($row, [
                'po_id' => $pid,
                'po_total' => $state['po_total'],
                'verified_paid' => $state['total_paid'],
                'pending_paid' => round(floatval($row['pending_paid']), 2),
                'rejected_paid' => round(floatval($row['rejected_paid']), 2),
                'receipt_count' => intval($row['receipt_count']),
                'applied_to_po' => $state['applied_to_po'],
                'balance_due' => $state['balance_due'],
                'excess_amount' => $state['excess_amount'],
                'net_balance' => $state['net_balance'],
                'percent_paid' => $state['percent_paid'],
                'payment_status' => $state['payment_status']
            ]);
            $poLedgers[] = $entry;

            if ($row['po_status'] !== 'cancelled') {
                $kpis['total_pos']++;
                $kpis['total_contract_value'] += $state['po_total'];
                $kpis['total_verified_collected'] += $state['total_paid'];
                $kpis['total_pending_verification'] += floatval($row['pending_paid']);
                $kpis['pending_count'] += intval($row['pending_receipts']);
                $kpis['total_rejected'] += floatval($row['rejected_paid']);
                $kpis['rejected_count'] += intval($row['rejected_receipts']);
                $kpis['total_balance_due'] += $state['balance_due'];
                $kpis['total_excess_received'] += $state['excess_amount'];
                if ($state['balance_due'] > 0.009) $kpis['unpaid_or_partial_pos']++;
                if ($state['excess_amount'] > 0.009) $kpis['overpaid_pos']++;
                elseif ($state['payment_status'] === 'fully_paid') $kpis['fully_paid_pos']++;

                $cid = intval($row['customer_id']);
                if (!isset($customerMap[$cid])) {
                    $customerMap[$cid] = [
                        'customer_id' => $cid,
                        'customer_name' => $row['customer_name'],
                        'customer_email' => $row['customer_email'],
                        'customer_phone' => $row['customer_phone'],
                        'po_count' => 0,
                        'receipt_count' => 0,
                        'total_po_value' => 0.0,
                        'total_verified_paid' => 0.0,
                        'total_pending_paid' => 0.0,
                        'total_balance_due' => 0.0,
                        'total_excess_credit' => 0.0,
                        'net_receivable' => 0.0
                    ];
                }
                $customerMap[$cid]['po_count']++;
                $customerMap[$cid]['receipt_count'] += intval($row['receipt_count']);
                $customerMap[$cid]['total_po_value'] = round($customerMap[$cid]['total_po_value'] + $state['po_total'], 2);
                $customerMap[$cid]['total_verified_paid'] = round($customerMap[$cid]['total_verified_paid'] + $state['total_paid'], 2);
                $customerMap[$cid]['total_pending_paid'] = round($customerMap[$cid]['total_pending_paid'] + floatval($row['pending_paid']), 2);
                $customerMap[$cid]['total_balance_due'] = round($customerMap[$cid]['total_balance_due'] + $state['balance_due'], 2);
                $customerMap[$cid]['total_excess_credit'] = round($customerMap[$cid]['total_excess_credit'] + $state['excess_amount'], 2);
                $customerMap[$cid]['net_receivable'] = round($customerMap[$cid]['total_balance_due'] - $customerMap[$cid]['total_excess_credit'], 2);
            }
        }

        foreach ($payments as &$pay) {
            $pid = intval($pay['po_id']);
            $st = $poStateMap[$pid] ?? self::computePoFinancialState($pay['po_total_amount'], 0, 0);
            $pay['po_total_paid'] = $st['total_paid'];
            $pay['po_balance_due'] = $st['balance_due'];
            $pay['po_excess_amount'] = $st['excess_amount'];
            $pay['po_payment_status'] = $st['payment_status'];
        }

        $kpis['total_contract_value'] = round($kpis['total_contract_value'], 2);
        $kpis['total_verified_collected'] = round($kpis['total_verified_collected'], 2);
        $kpis['total_pending_verification'] = round($kpis['total_pending_verification'], 2);
        $kpis['total_rejected'] = round($kpis['total_rejected'], 2);
        $kpis['total_balance_due'] = round($kpis['total_balance_due'], 2);
        $kpis['total_excess_received'] = round($kpis['total_excess_received'], 2);
        $kpis['collection_rate'] = ($kpis['total_contract_value'] > 0)
            ? round(($kpis['total_verified_collected'] / $kpis['total_contract_value']) * 100, 1)
            : 0.0;

        $customerLedgers = array_values($customerMap);
        usort($customerLedgers, function ($a, $b) {
            return $b['total_po_value'] <=> $a['total_po_value'];
        });

        // Accounting & Treasury Analytics
        $methodMap = [];
        $typeMap = [];
        $advanceStats = [
            'advance_total' => 0.0,
            'advance_count' => 0,
            'refund_total' => 0.0,
            'refund_count' => 0,
            'transfer_total' => 0.0,
            'transfer_count' => 0,
            'excess_held_total' => $kpis['total_excess_received'],
            'overpaid_po_count' => $kpis['overpaid_pos']
        ];

        foreach ($payments as $p) {
            $amt = round(floatval($p['amount'] ?? 0), 2);
            if ($p['status'] !== 'verified') continue;

            $mKey = $p['payment_method'] ?: 'bank_transfer';
            if ($amt > 0) {
                if (!isset($methodMap[$mKey])) {
                    $methodMap[$mKey] = ['method' => $mKey, 'count' => 0, 'amount' => 0.0];
                }
                $methodMap[$mKey]['count']++;
                $methodMap[$mKey]['amount'] = round($methodMap[$mKey]['amount'] + $amt, 2);
            }

            $tKey = $p['payment_type'] ?: 'milestone';
            if (!isset($typeMap[$tKey])) {
                $typeMap[$tKey] = ['payment_type' => $tKey, 'count' => 0, 'amount' => 0.0];
            }
            $typeMap[$tKey]['count']++;
            $typeMap[$tKey]['amount'] = round($typeMap[$tKey]['amount'] + $amt, 2);

            if ($tKey === 'advance' && $amt > 0) {
                $advanceStats['advance_total'] = round($advanceStats['advance_total'] + $amt, 2);
                $advanceStats['advance_count']++;
            } elseif ($tKey === 'excess_refund' || ($amt < 0 && $p['excess_handling'] === 'refund_out')) {
                $advanceStats['refund_total'] = round($advanceStats['refund_total'] + abs($amt), 2);
                $advanceStats['refund_count']++;
            } elseif ($tKey === 'credit_transfer' || $tKey === 'advance_adjustment') {
                if ($amt > 0) {
                    $advanceStats['transfer_total'] = round($advanceStats['transfer_total'] + $amt, 2);
                    $advanceStats['transfer_count']++;
                }
            }
        }

        $statusBreakdown = [
            'overpaid' => 0,
            'fully_paid' => 0,
            'partially_paid' => 0,
            'pending_verification' => 0,
            'unpaid' => 0
        ];
        foreach ($poLedgers as $pl) {
            if (($pl['po_status'] ?? '') === 'cancelled') continue;
            $stKey = $pl['payment_status'] ?? 'unpaid';
            if (isset($statusBreakdown[$stKey])) {
                $statusBreakdown[$stKey]++;
            }
        }

        Response::success("Payments ledger fetched", [
            'kpis' => $kpis,
            'analytics' => [
                'by_method' => array_values($methodMap),
                'by_type' => array_values($typeMap),
                'advance_stats' => $advanceStats,
                'po_status_breakdown' => $statusBreakdown
            ],
            'payments' => $payments,
            'po_ledgers' => $poLedgers,
            'customer_ledgers' => $customerLedgers
        ]);
    }

    public function create() {
        $b = Response::getBody();
        $txRef = trim((string)($b['transaction_reference'] ?? $b['reference_number'] ?? ''));
        $poId = intval($b['po_id'] ?? 0);
        $amount = round(floatval($b['amount'] ?? 0), 2);

        if ($poId <= 0 || $amount <= 0 || $txRef === '') {
            Response::error("PO ID, positive payment amount, and transaction reference are required");
        }

        $poStmt = $this->db->prepare("SELECT id, po_number, customer_id, quotation_id, total_amount FROM purchase_orders WHERE id = ?");
        $poStmt->execute([$poId]);
        $po = $poStmt->fetch();
        if (!$po) {
            Response::error("Purchase order not found", 404);
        }

        $paymentNumber = 'PAY-' . date('Y') . '-' . strtoupper(substr(uniqid(), -5));
        $paymentDate = !empty($b['payment_date']) ? $b['payment_date'] : date('Y-m-d');
        $paymentMethod = $this->sanitizeMethod($b['payment_method'] ?? $b['payment_mode'] ?? 'bank_transfer');
        $paymentType = trim((string)($b['payment_type'] ?? 'milestone')) ?: 'milestone';
        $status = $this->sanitizeStatus($b['status'] ?? 'verified');
        $bankName = isset($b['bank_name']) && trim((string)$b['bank_name']) !== '' ? trim((string)$b['bank_name']) : null;
        $payerName = isset($b['payer_name']) && trim((string)$b['payer_name']) !== '' ? trim((string)$b['payer_name']) : null;
        $instrumentDate = !empty($b['instrument_date']) ? $b['instrument_date'] : null;
        $notes = isset($b['notes']) ? trim((string)$b['notes']) : ($b['remarks'] ?? null);
        $verifiedBy = ($status === 'verified')
            ? trim((string)($b['verified_by'] ?? ($_SESSION['user_name'] ?? 'System Admin')))
            : null;
        $verifiedAt = ($status === 'verified') ? date('Y-m-d H:i:s') : null;
        $excessHandling = $this->sanitizeExcessHandling($b['excess_handling'] ?? 'none', 'none');

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("
                INSERT INTO payments (
                    payment_number, po_id, quotation_id, customer_id, payment_date, amount,
                    applied_amount, excess_amount, excess_handling,
                    payment_method, transaction_reference, bank_name, payer_name, instrument_date,
                    payment_type, status, verified_by, verified_at, notes
                )
                VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $paymentNumber,
                $poId,
                $po['quotation_id'],
                $po['customer_id'],
                $paymentDate,
                $amount,
                $excessHandling,
                $paymentMethod,
                $txRef,
                $bankName,
                $payerName,
                $instrumentDate,
                $paymentType,
                $status,
                $verifiedBy,
                $verifiedAt,
                $notes
            ]);
            $paymentId = intval($this->db->lastInsertId());

            $this->recalculatePoAllocations($poId);
            $totals = $this->getPoPaymentTotals($poId);
            $state = self::computePoFinancialState($totals['total_amount'], $totals['verified_paid'], $totals['pending_paid']);

            $savedStmt = $this->db->prepare("SELECT applied_amount, excess_amount, excess_handling FROM payments WHERE id = ?");
            $savedStmt->execute([$paymentId]);
            $savedAlloc = $savedStmt->fetch();

            $this->db->commit();

            $extraLog = floatval($savedAlloc['excess_amount'] ?? 0) > 0
                ? " Extra/Excess Credit: +₹{$savedAlloc['excess_amount']} ({$savedAlloc['excess_handling']})."
                : "";
            Audit::log(
                $this->db,
                'payments',
                'create',
                'Payment',
                $paymentNumber,
                "Recorded {$paymentType} ({$status}) payment of ₹{$amount} via {$paymentMethod} (Ref: {$txRef}) for {$po['po_number']}. Verified Paid: ₹{$state['total_paid']}, Balance Due: ₹{$state['balance_due']}.{$extraLog}"
            );

            Response::success("Payment recorded successfully", array_merge($state, [
                "id" => $paymentId,
                "payment_number" => $paymentNumber,
                "amount" => $amount,
                "applied_amount" => floatval($savedAlloc['applied_amount'] ?? 0),
                "excess_recorded" => floatval($savedAlloc['excess_amount'] ?? 0),
                "excess_handling" => $savedAlloc['excess_handling'] ?? 'none'
            ]), 201);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to record payment: " . $e->getMessage());
        }
    }

    public function update($id) {
        $id = intval($id);
        $existingStmt = $this->db->prepare("SELECT * FROM payments WHERE id = ?");
        $existingStmt->execute([$id]);
        $existing = $existingStmt->fetch();
        if (!$existing) {
            Response::error("Payment record not found", 404);
        }

        $b = Response::getBody();
        $oldPoId = intval($existing['po_id']);
        $newPoId = isset($b['po_id']) ? intval($b['po_id']) : $oldPoId;

        $poStmt = $this->db->prepare("SELECT id, po_number, customer_id, quotation_id, total_amount FROM purchase_orders WHERE id = ?");
        $poStmt->execute([$newPoId]);
        $po = $poStmt->fetch();
        if (!$po) {
            Response::error("Purchase order not found", 404);
        }

        $amount = array_key_exists('amount', $b) ? round(floatval($b['amount']), 2) : round(floatval($existing['amount']), 2);
        $isAdjustment = in_array($existing['payment_type'], ['excess_refund', 'credit_transfer'], true) || floatval($existing['amount']) < 0;
        if (!$isAdjustment && $amount <= 0) {
            Response::error("Payment amount must be greater than 0");
        }
        if ($isAdjustment && $amount == 0) {
            Response::error("Adjustment amount cannot be zero");
        }

        $txRef = array_key_exists('transaction_reference', $b)
            ? trim((string)$b['transaction_reference'])
            : trim((string)$existing['transaction_reference']);
        if ($txRef === '') {
            Response::error("Transaction reference / UTR is required");
        }

        $paymentDate = !empty($b['payment_date']) ? $b['payment_date'] : $existing['payment_date'];
        $paymentMethod = $this->sanitizeMethod($b['payment_method'] ?? $existing['payment_method']);
        $paymentType = trim((string)($b['payment_type'] ?? $existing['payment_type'])) ?: $existing['payment_type'];
        $status = $this->sanitizeStatus($b['status'] ?? $existing['status']);
        $bankName = array_key_exists('bank_name', $b)
            ? (trim((string)$b['bank_name']) !== '' ? trim((string)$b['bank_name']) : null)
            : $existing['bank_name'];
        $payerName = array_key_exists('payer_name', $b)
            ? (trim((string)$b['payer_name']) !== '' ? trim((string)$b['payer_name']) : null)
            : $existing['payer_name'];
        $instrumentDate = array_key_exists('instrument_date', $b)
            ? (!empty($b['instrument_date']) ? $b['instrument_date'] : null)
            : $existing['instrument_date'];
        $notes = array_key_exists('notes', $b) ? trim((string)$b['notes']) : $existing['notes'];
        $excessHandling = $this->sanitizeExcessHandling(
            $b['excess_handling'] ?? ($existing['excess_handling'] ?? 'none'),
            $existing['excess_handling'] ?? 'none'
        );

        $verifiedBy = $existing['verified_by'];
        $verifiedAt = $existing['verified_at'];
        if ($status === 'verified' && ($existing['status'] !== 'verified' || empty($verifiedAt))) {
            $verifiedBy = trim((string)($b['verified_by'] ?? ($_SESSION['user_name'] ?? 'System Admin')));
            $verifiedAt = date('Y-m-d H:i:s');
        } elseif ($status !== 'verified') {
            $verifiedBy = null;
            $verifiedAt = null;
        }

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("
                UPDATE payments
                SET po_id = ?, quotation_id = ?, customer_id = ?, payment_date = ?, amount = ?,
                    excess_handling = ?, payment_method = ?, transaction_reference = ?,
                    bank_name = ?, payer_name = ?, instrument_date = ?,
                    payment_type = ?, status = ?, verified_by = ?, verified_at = ?, notes = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $newPoId,
                $po['quotation_id'],
                $po['customer_id'],
                $paymentDate,
                $amount,
                $excessHandling,
                $paymentMethod,
                $txRef,
                $bankName,
                $payerName,
                $instrumentDate,
                $paymentType,
                $status,
                $verifiedBy,
                $verifiedAt,
                $notes,
                $id
            ]);

            if ($oldPoId !== $newPoId) {
                $this->recalculatePoAllocations($oldPoId);
            }
            $this->recalculatePoAllocations($newPoId);

            $totals = $this->getPoPaymentTotals($newPoId);
            $state = self::computePoFinancialState($totals['total_amount'], $totals['verified_paid'], $totals['pending_paid']);

            $this->db->commit();

            Audit::log(
                $this->db,
                'payments',
                'update',
                'Payment',
                $existing['payment_number'],
                "Updated receipt {$existing['payment_number']} ({$po['po_number']}): ₹{$amount}, status={$status}, method={$paymentMethod}. New Balance Due: ₹{$state['balance_due']}, Excess Credit: ₹{$state['excess_amount']}."
            );

            Response::success("Payment updated successfully", $state);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to update payment: " . $e->getMessage());
        }
    }

    public function updateStatus($id) {
        $id = intval($id);
        $b = Response::getBody();
        $status = $this->sanitizeStatus($b['status'] ?? '');

        $existingStmt = $this->db->prepare("SELECT * FROM payments WHERE id = ?");
        $existingStmt->execute([$id]);
        $existing = $existingStmt->fetch();
        if (!$existing) {
            Response::error("Payment record not found", 404);
        }

        $verifiedBy = ($status === 'verified')
            ? trim((string)($b['verified_by'] ?? ($_SESSION['user_name'] ?? 'System Admin')))
            : null;
        $verifiedAt = ($status === 'verified') ? date('Y-m-d H:i:s') : null;
        $notes = array_key_exists('notes', $b) && trim((string)$b['notes']) !== ''
            ? trim((string)$b['notes'])
            : $existing['notes'];

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("
                UPDATE payments
                SET status = ?, verified_by = ?, verified_at = ?, notes = ?
                WHERE id = ?
            ");
            $stmt->execute([$status, $verifiedBy, $verifiedAt, $notes, $id]);

            $this->recalculatePoAllocations(intval($existing['po_id']));
            $totals = $this->getPoPaymentTotals(intval($existing['po_id']));
            $state = self::computePoFinancialState($totals['total_amount'], $totals['verified_paid'], $totals['pending_paid']);

            $this->db->commit();

            Audit::log(
                $this->db,
                'payments',
                'status_change',
                'Payment',
                $existing['payment_number'],
                "Marked receipt {$existing['payment_number']} as '{$status}'. Verified Paid: ₹{$state['total_paid']}, Balance Due: ₹{$state['balance_due']}, Excess: ₹{$state['excess_amount']}."
            );

            Response::success("Payment status updated to {$status}", $state);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to update payment status: " . $e->getMessage());
        }
    }

    public function settleExcess() {
        $b = Response::getBody();
        $poId = intval($b['po_id'] ?? 0);
        $action = $b['action'] ?? 'refund';
        $amount = round(floatval($b['amount'] ?? 0), 2);
        $txRef = trim((string)($b['transaction_reference'] ?? ''));

        if ($poId <= 0 || $amount <= 0) {
            Response::error("Valid PO ID and positive settlement amount are required");
        }
        if (!in_array($action, ['refund', 'transfer_to_po'], true)) {
            Response::error("Invalid settlement action");
        }

        $totals = $this->getPoPaymentTotals($poId);
        if (!$totals) {
            Response::error("Source purchase order not found", 404);
        }

        $sourceState = self::computePoFinancialState($totals['total_amount'], $totals['verified_paid'], $totals['pending_paid']);
        $availableExcess = $sourceState['excess_amount'];
        if ($availableExcess <= 0.009) {
            Response::error("No excess credit is available on {$totals['po_number']} to refund or transfer.");
        }
        if ($amount > $availableExcess + 0.01) {
            Response::error("Settlement amount (₹{$amount}) exceeds available excess credit (₹{$availableExcess}).");
        }

        $paymentDate = !empty($b['payment_date']) ? $b['payment_date'] : date('Y-m-d');
        $method = $this->sanitizeMethod($b['payment_method'] ?? 'bank_transfer');
        $bankName = isset($b['bank_name']) && trim((string)$b['bank_name']) !== '' ? trim((string)$b['bank_name']) : null;
        $notes = trim((string)($b['notes'] ?? ''));

        if ($txRef === '') {
            $txRef = ($action === 'transfer_to_po' ? 'ADJ-' : 'REF-') . date('YmdHis');
        }

        $targetPo = null;
        if ($action === 'transfer_to_po') {
            $targetPoId = intval($b['target_po_id'] ?? 0);
            if ($targetPoId <= 0 || $targetPoId === $poId) {
                Response::error("Please select a different target Purchase Order to transfer excess credit to.");
            }
            $tStmt = $this->db->prepare("SELECT id, po_number, customer_id, quotation_id, total_amount, status FROM purchase_orders WHERE id = ?");
            $tStmt->execute([$targetPoId]);
            $targetPo = $tStmt->fetch();
            if (!$targetPo) {
                Response::error("Target purchase order not found", 404);
            }
            if (intval($targetPo['customer_id']) !== intval($totals['customer_id'])) {
                Response::error("Excess credit can only be transferred between Purchase Orders of the same customer.");
            }
            if ($targetPo['status'] === 'cancelled') {
                Response::error("Cannot transfer excess credit to a cancelled Purchase Order.");
            }
        }

        $this->db->beginTransaction();
        try {
            $verifiedBy = $_SESSION['user_name'] ?? 'System Admin';
            $now = date('Y-m-d H:i:s');
            $debitNumber = ($action === 'transfer_to_po' ? 'ADJ-' : 'REF-') . date('Y') . '-' . strtoupper(substr(uniqid(), -5));

            $debitNote = $notes !== ''
                ? $notes
                : ($action === 'transfer_to_po'
                    ? "Excess credit of ₹{$amount} transferred from {$totals['po_number']} to {$targetPo['po_number']}"
                    : "Excess payment refund of ₹{$amount} returned to customer against {$totals['po_number']}");

            $ins = $this->db->prepare("
                INSERT INTO payments (
                    payment_number, po_id, quotation_id, customer_id, payment_date, amount,
                    applied_amount, excess_amount, excess_handling,
                    payment_method, transaction_reference, bank_name,
                    payment_type, status, verified_by, verified_at, notes
                )
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?)
            ");

            $outAmount = -abs($amount);
            $ins->execute([
                $debitNumber,
                $poId,
                $totals['quotation_id'],
                $totals['customer_id'],
                $paymentDate,
                $outAmount,
                $outAmount,
                $action === 'transfer_to_po' ? 'credit_transfer' : 'refund_out',
                $method,
                $txRef,
                $bankName,
                $action === 'transfer_to_po' ? 'credit_transfer' : 'excess_refund',
                $verifiedBy,
                $now,
                $debitNote
            ]);

            $targetReceiptNumber = null;
            if ($action === 'transfer_to_po' && $targetPo) {
                $targetReceiptNumber = 'PAY-' . date('Y') . '-' . strtoupper(substr(uniqid(), -5));
                $creditNote = $notes !== ''
                    ? $notes
                    : "Excess credit transferred from {$totals['po_number']} (Ref: {$debitNumber})";
                $ins->execute([
                    $targetReceiptNumber,
                    intval($targetPo['id']),
                    $targetPo['quotation_id'],
                    $targetPo['customer_id'],
                    $paymentDate,
                    abs($amount),
                    0.00,
                    'none',
                    'bank_transfer',
                    $debitNumber,
                    $bankName,
                    'advance_adjustment',
                    $verifiedBy,
                    $now,
                    $creditNote
                ]);
                $this->recalculatePoAllocations(intval($targetPo['id']));
            }

            $this->recalculatePoAllocations($poId);
            $updatedSourceTotals = $this->getPoPaymentTotals($poId);
            $updatedSourceState = self::computePoFinancialState(
                $updatedSourceTotals['total_amount'],
                $updatedSourceTotals['verified_paid'],
                $updatedSourceTotals['pending_paid']
            );

            $this->db->commit();

            Audit::log(
                $this->db,
                'payments',
                $action === 'transfer_to_po' ? 'credit_transfer' : 'refund',
                'Payment',
                $debitNumber,
                $action === 'transfer_to_po'
                    ? "Transferred ₹{$amount} excess credit from {$totals['po_number']} to {$targetPo['po_number']} ({$targetReceiptNumber})."
                    : "Refunded ₹{$amount} excess balance against {$totals['po_number']} (Ref: {$txRef}). Remaining excess: ₹{$updatedSourceState['excess_amount']}."
            );

            Response::success(
                $action === 'transfer_to_po'
                    ? "Excess credit of ₹{$amount} transferred to {$targetPo['po_number']}"
                    : "Excess refund of ₹{$amount} recorded successfully",
                [
                    'debit_number' => $debitNumber,
                    'target_receipt_number' => $targetReceiptNumber,
                    'source_po_state' => $updatedSourceState
                ],
                201
            );
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to process excess settlement: " . $e->getMessage());
        }
    }

    public function delete($id) {
        $id = intval($id);
        $existingStmt = $this->db->prepare("SELECT * FROM payments WHERE id = ?");
        $existingStmt->execute([$id]);
        $existing = $existingStmt->fetch();
        if (!$existing) {
            Response::error("Payment record not found", 404);
        }

        $poId = intval($existing['po_id']);
        $this->db->beginTransaction();
        try {
            $this->db->prepare("DELETE FROM payments WHERE id = ?")->execute([$id]);
            $this->recalculatePoAllocations($poId);

            $totals = $this->getPoPaymentTotals($poId);
            $state = $totals
                ? self::computePoFinancialState($totals['total_amount'], $totals['verified_paid'], $totals['pending_paid'])
                : null;

            $this->db->commit();

            Audit::log(
                $this->db,
                'payments',
                'delete',
                'Payment',
                $existing['payment_number'],
                "Deleted payment receipt {$existing['payment_number']} (₹{$existing['amount']}) from PO ID {$poId}."
            );

            Response::success("Payment record deleted", ['po_state' => $state]);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to delete payment: " . $e->getMessage());
        }
    }

    public function getSummary($poId) {
        $poStmt = $this->db->prepare("SELECT total_amount FROM purchase_orders WHERE id = ?");
        $poStmt->execute([intval($poId)]);
        $po = $poStmt->fetch();

        if (!$po) {
            Response::error("Purchase order not found", 404);
        }

        $pStmt = $this->db->prepare("SELECT * FROM payments WHERE po_id = ? ORDER BY payment_date DESC, id DESC");
        $pStmt->execute([intval($poId)]);
        $payments = $pStmt->fetchAll();

        $totalPaid = 0.0;
        $pendingPaid = 0.0;
        foreach ($payments as $p) {
            if ($p['status'] === 'verified') {
                $totalPaid += floatval($p['amount']);
            } elseif ($p['status'] === 'received') {
                $pendingPaid += floatval($p['amount']);
            }
        }

        $state = self::computePoFinancialState($po['total_amount'], $totalPaid, $pendingPaid);
        Response::success("Payment summary", array_merge($state, [
            "status" => $state['payment_status'],
            "payments" => $payments
        ]));
    }
}
