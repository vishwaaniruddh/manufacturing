<?php
// api/controllers/DashboardController.php

class DashboardController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
    }

    private function sanitizeDate($val) {
        if (!is_string($val)) return null;
        $val = trim($val);
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $val) ? $val : null;
    }

    private function buildDateClause($column, $fromDate, $toDate, &$params) {
        $clauses = [];
        if (!empty($fromDate)) {
            $clauses[] = "DATE({$column}) >= ?";
            $params[] = $fromDate;
        }
        if (!empty($toDate)) {
            $clauses[] = "DATE({$column}) <= ?";
            $params[] = $toDate;
        }
        return empty($clauses) ? '' : implode(' AND ', $clauses);
    }

    private function fetchRow($sql, $params = []) {
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetch();
    }

    private function fetchAll($sql, $params = []) {
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function getSummary() {
        $fromDate = $this->sanitizeDate($_GET['from_date'] ?? null);
        $toDate = $this->sanitizeDate($_GET['to_date'] ?? null);

        // 1. Leads (Period)
        $p = [];
        $w = $this->buildDateClause('created_at', $fromDate, $toDate, $p);
        $leadsCount = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved,
                    SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected,
                    COALESCE(SUM(estimated_value), 0) as est_value,
                    COALESCE(SUM(CASE WHEN status IN ('pending','approved') THEN estimated_value ELSE 0 END), 0) as active_est_value,
                    SUM(CASE WHEN priority='urgent' THEN 1 ELSE 0 END) as urgent_count,
                    SUM(CASE WHEN priority='high' THEN 1 ELSE 0 END) as high_count
             FROM leads" . ($w ? " WHERE $w" : ''),
            $p
        );

        // 2. Quotations (Period)
        $p = [];
        $w = $this->buildDateClause('quotation_date', $fromDate, $toDate, $p);
        $quotesCount = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) as draft,
                    SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) as sent,
                    SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved,
                    SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected,
                    SUM(CASE WHEN status='expired' THEN 1 ELSE 0 END) as expired,
                    COALESCE(SUM(total_amount), 0) as total_val,
                    COALESCE(SUM(CASE WHEN status='approved' THEN total_amount ELSE 0 END), 0) as approved_val,
                    COALESCE(SUM(CASE WHEN status IN ('draft','sent') THEN total_amount ELSE 0 END), 0) as open_val
             FROM quotations" . ($w ? " WHERE $w" : ''),
            $p
        );

        // 3. Purchase Orders (Period) + Deadlines Risk
        $p = [];
        $w = $this->buildDateClause('po_date', $fromDate, $toDate, $p);
        $poCount = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    COALESCE(SUM(total_amount), 0) as total_val,
                    SUM(CASE WHEN status='received' THEN 1 ELSE 0 END) as received,
                    SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) as verified,
                    SUM(CASE WHEN status='in_production' THEN 1 ELSE 0 END) as in_production,
                    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled
             FROM purchase_orders" . ($w ? " WHERE $w" : ''),
            $p
        );

        // Period PO unpaid balance (true balance for POs booked in this range)
        $p = [];
        $w = $this->buildDateClause('po.po_date', $fromDate, $toDate, $p);
        $poPeriodBalance = $this->fetchRow(
            "SELECT COALESCE(SUM(GREATEST(0, po.total_amount - COALESCE(py.paid, 0))), 0) as period_unpaid,
                    COALESCE(SUM(GREATEST(0, COALESCE(py.paid, 0) - po.total_amount)), 0) as period_excess,
                    SUM(CASE WHEN COALESCE(py.paid, 0) >= po.total_amount AND po.total_amount > 0 THEN 1 ELSE 0 END) as fully_paid_pos,
                    SUM(CASE WHEN COALESCE(py.paid, 0) > po.total_amount + 0.009 THEN 1 ELSE 0 END) as overpaid_pos,
                    SUM(CASE WHEN COALESCE(py.paid, 0) > 0 AND COALESCE(py.paid, 0) < po.total_amount THEN 1 ELSE 0 END) as partially_paid_pos,
                    SUM(CASE WHEN COALESCE(py.paid, 0) = 0 AND po.status != 'cancelled' THEN 1 ELSE 0 END) as unpaid_pos
             FROM purchase_orders po
             LEFT JOIN (
                 SELECT po_id, SUM(amount) as paid FROM payments WHERE status='verified' GROUP BY po_id
             ) py ON py.po_id = po.id" . ($w ? " WHERE $w" : ''),
            $p
        );

        // Live Global Receivables & Overdue POs (always live company obligations + filtered if needed)
        $globalReceivables = $this->fetchRow(
            "SELECT COALESCE(SUM(GREATEST(0, po.total_amount - COALESCE(py.paid, 0))), 0) as total_receivable,
                    COALESCE(SUM(GREATEST(0, COALESCE(py.paid, 0) - po.total_amount)), 0) as total_excess,
                    SUM(CASE WHEN po.delivery_deadline < CURDATE() AND po.status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END) as overdue_count,
                    COALESCE(SUM(CASE WHEN po.delivery_deadline < CURDATE() AND po.status NOT IN ('completed','cancelled') THEN po.total_amount ELSE 0 END), 0) as overdue_value,
                    SUM(CASE WHEN po.delivery_deadline >= CURDATE() AND po.delivery_deadline <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) AND po.status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END) as due_7d_count
             FROM purchase_orders po
             LEFT JOIN (
                 SELECT po_id, SUM(amount) as paid FROM payments WHERE status='verified' GROUP BY po_id
             ) py ON py.po_id = po.id
             WHERE po.status != 'cancelled'"
        );

        // 4. Payments (Period) + Mix by Method & Type
        $p = [];
        $w = $this->buildDateClause('payment_date', $fromDate, $toDate, $p);
        $payCount = $this->fetchRow(
            "SELECT COUNT(*) as count,
                    COALESCE(SUM(amount), 0) as total_received,
                    COALESCE(SUM(CASE WHEN payment_type='advance' THEN amount ELSE 0 END), 0) as advance_received,
                    COALESCE(SUM(CASE WHEN payment_type='milestone' THEN amount ELSE 0 END), 0) as milestone_received,
                    COALESCE(SUM(CASE WHEN payment_type='final' THEN amount ELSE 0 END), 0) as final_received,
                    COALESCE(SUM(CASE WHEN payment_type='retention' THEN amount ELSE 0 END), 0) as retention_received
             FROM payments
             WHERE status='verified'" . ($w ? " AND $w" : ''),
            $p
        );

        $p = [];
        $w = $this->buildDateClause('payment_date', $fromDate, $toDate, $p);
        $paymentByMethod = $this->fetchAll(
            "SELECT COALESCE(NULLIF(TRIM(payment_method), ''), 'bank_transfer') as method,
                    COUNT(*) as count,
                    COALESCE(SUM(amount), 0) as amount
             FROM payments
             WHERE status='verified'" . ($w ? " AND $w" : '') . "
             GROUP BY COALESCE(NULLIF(TRIM(payment_method), ''), 'bank_transfer')
             ORDER BY amount DESC",
            $p
        );

        // 5. Work Orders & 5-Level Distribution (Period + Active Floor)
        $p = [];
        $w = $this->buildDateClause('created_at', $fromDate, $toDate, $p);
        $woCount = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    SUM(CASE WHEN status='pending_materials' THEN 1 ELSE 0 END) as pending_materials,
                    SUM(CASE WHEN status='ready_to_start' THEN 1 ELSE 0 END) as ready_to_start,
                    SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
                    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status='on_hold' THEN 1 ELSE 0 END) as on_hold,
                    SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
                    COALESCE(SUM(target_quantity), 0) as total_target,
                    COALESCE(SUM(completed_quantity), 0) as total_completed_units,
                    COALESCE(SUM(rejected_quantity), 0) as total_rejected
             FROM work_orders" . ($w ? " WHERE $w" : ''),
            $p
        );

        $p = [];
        $w = $this->buildDateClause('created_at', $fromDate, $toDate, $p);
        $lvlRows = $this->fetchAll(
            "SELECT current_level,
                    COUNT(*) as count,
                    COALESCE(SUM(target_quantity), 0) as units
             FROM work_orders
             WHERE status='in_progress'" . ($w ? " AND $w" : '') . "
             GROUP BY current_level",
            $p
        );
        $levelDist = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
        $levelUnits = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
        foreach ($lvlRows as $row) {
            $lvl = intval($row['current_level']);
            if ($lvl >= 1 && $lvl <= 5) {
                $levelDist[$lvl] = intval($row['count']);
                $levelUnits[$lvl] = intval($row['units']);
            }
        }

        // 6. Quality Control Inspections (Period + Level-wise breakdown)
        $p = [];
        $w = $this->buildDateClause('inspection_date', $fromDate, $toDate, $p);
        $qcStats = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    SUM(CASE WHEN qc_status='passed' THEN 1 ELSE 0 END) as passed_count,
                    SUM(CASE WHEN qc_status='failed' THEN 1 ELSE 0 END) as failed_count,
                    SUM(CASE WHEN qc_status='rework' THEN 1 ELSE 0 END) as rework_count,
                    COALESCE(SUM(total_inspected), 0) as total_inspected_units,
                    COALESCE(SUM(passed_qty), 0) as passed_units,
                    COALESCE(SUM(rejected_qty), 0) as rejected_units
             FROM quality_inspections" . ($w ? " WHERE $w" : ''),
            $p
        );

        $p = [];
        $w = $this->buildDateClause('inspection_date', $fromDate, $toDate, $p);
        $qcByLevelRows = $this->fetchAll(
            "SELECT level_number,
                    COUNT(*) as inspections,
                    COALESCE(SUM(passed_qty), 0) as passed_units,
                    COALESCE(SUM(rejected_qty), 0) as rejected_units
             FROM quality_inspections" . ($w ? " WHERE $w" : '') . "
             GROUP BY level_number
             ORDER BY level_number ASC",
            $p
        );
        $qcByLevel = [];
        for ($l = 1; $l <= 5; $l++) {
            $qcByLevel[$l] = ['level' => $l, 'inspections' => 0, 'passed_units' => 0, 'rejected_units' => 0];
        }
        foreach ($qcByLevelRows as $row) {
            $l = intval($row['level_number']);
            if ($l >= 1 && $l <= 5) {
                $qcByLevel[$l] = [
                    'level' => $l,
                    'inspections' => intval($row['inspections']),
                    'passed_units' => intval($row['passed_units']),
                    'rejected_units' => intval($row['rejected_units'])
                ];
            }
        }

        // 7. Inventory Snapshot + Material Requisitions (Fixed status values!)
        $lowStock = $this->fetchRow("SELECT COUNT(*) as count FROM raw_materials WHERE current_stock <= reorder_level");
        $outOfStock = $this->fetchRow("SELECT COUNT(*) as count FROM raw_materials WHERE current_stock <= 0");
        $totalMaterials = $this->fetchRow("SELECT COUNT(*) as count, COALESCE(SUM(current_stock * unit_cost), 0) as stock_value FROM raw_materials");
        $totalProducts = $this->fetchRow(
            "SELECT COUNT(*) as count,
                    SUM(CASE WHEN product_type='finished_good' THEN 1 ELSE 0 END) as finished_goods,
                    SUM(CASE WHEN product_type='sub_assembly' THEN 1 ELSE 0 END) as sub_assemblies,
                    COALESCE(SUM(current_stock * unit_price), 0) as stock_value
             FROM products"
        );

        $p = [];
        $w = $this->buildDateClause('created_at', $fromDate, $toDate, $p);
        $reqStats = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    SUM(CASE WHEN status='pending_purchase' THEN 1 ELSE 0 END) as pending_purchase,
                    SUM(CASE WHEN status='partially_fulfilled' THEN 1 ELSE 0 END) as partially_fulfilled,
                    SUM(CASE WHEN status='fulfilled' THEN 1 ELSE 0 END) as fulfilled,
                    SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled,
                    COALESCE(SUM(CASE WHEN status IN ('pending_purchase','partially_fulfilled') THEN total_estimated_cost ELSE 0 END), 0) as pending_cost,
                    COALESCE(SUM(total_estimated_cost), 0) as total_cost
             FROM material_requisitions" . ($w ? " WHERE $w" : ''),
            $p
        );

        $stockByCategory = $this->fetchAll(
            "SELECT COALESCE(NULLIF(TRIM(category), ''), 'Uncategorized') as category,
                    COUNT(*) as item_count,
                    COALESCE(SUM(current_stock * unit_cost), 0) as stock_value,
                    SUM(CASE WHEN current_stock <= reorder_level THEN 1 ELSE 0 END) as low_stock_count
             FROM raw_materials
             GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'Uncategorized')
             ORDER BY stock_value DESC"
        );

        $lowStockItems = $this->fetchAll(
            "SELECT id, sku, name, category, current_stock, reorder_level, unit_cost, uom, location,
                    GREATEST(0, reorder_level - current_stock) as shortage
             FROM raw_materials
             WHERE current_stock <= reorder_level
             ORDER BY (current_stock <= 0) DESC, shortage DESC, current_stock ASC
             LIMIT 20"
        );

        // 8. Dispatches & Couriers (Period)
        $p = [];
        $w = $this->buildDateClause('dispatch_date', $fromDate, $toDate, $p);
        $dispCount = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    SUM(CASE WHEN status='ready_for_dispatch' THEN 1 ELSE 0 END) as ready_for_dispatch,
                    SUM(CASE WHEN status='dispatched' THEN 1 ELSE 0 END) as dispatched,
                    SUM(CASE WHEN status='in_transit' THEN 1 ELSE 0 END) as in_transit,
                    SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) as delivered,
                    SUM(CASE WHEN status='returned' THEN 1 ELSE 0 END) as returned
             FROM dispatches" . ($w ? " WHERE $w" : ''),
            $p
        );

        $p = [];
        $w = $this->buildDateClause('d.dispatch_date', $fromDate, $toDate, $p);
        $dispatchesByCourier = $this->fetchAll(
            "SELECT cr.name as courier_name,
                    COUNT(*) as total,
                    SUM(CASE WHEN d.status='delivered' THEN 1 ELSE 0 END) as delivered,
                    SUM(CASE WHEN d.status IN ('dispatched','in_transit') THEN 1 ELSE 0 END) as active
             FROM dispatches d
             JOIN couriers cr ON d.courier_id = cr.id" . ($w ? " WHERE $w" : '') . "
             GROUP BY cr.id, cr.name
             ORDER BY total DESC",
            $p
        );

        // 9. Customer Acceptance (Stage 11) & Complaints / RMA (Stage 12)
        $p = [];
        $w = $this->buildDateClause('inspection_date', $fromDate, $toDate, $p);
        $custInspStats = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    SUM(CASE WHEN overall_status='accepted_perfect' THEN 1 ELSE 0 END) as accepted_perfect,
                    SUM(CASE WHEN overall_status='accepted_with_faults' THEN 1 ELSE 0 END) as accepted_with_faults,
                    SUM(CASE WHEN overall_status='rejected_faulty' THEN 1 ELSE 0 END) as rejected_faulty
             FROM customer_inspections" . ($w ? " WHERE $w" : ''),
            $p
        );

        $p = [];
        $w = $this->buildDateClause('created_at', $fromDate, $toDate, $p);
        $complaints = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    SUM(CASE WHEN status IN ('open','under_investigation','approved_for_return') THEN 1 ELSE 0 END) as open_count,
                    SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved_count,
                    SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as critical_count,
                    SUM(CASE WHEN severity='high' THEN 1 ELSE 0 END) as high_count,
                    SUM(CASE WHEN severity='medium' THEN 1 ELSE 0 END) as medium_count,
                    SUM(CASE WHEN severity='low' THEN 1 ELSE 0 END) as low_count
             FROM complaint_tickets" . ($w ? " WHERE $w" : ''),
            $p
        );

        // 10. Time-Series Trend (Daily Revenue Bookings vs Cash Collections vs Pipeline)
        $p = [];
        $wPo = $this->buildDateClause('po_date', $fromDate, $toDate, $p);
        $poSeries = $this->fetchAll(
            "SELECT DATE(po_date) as dt, COUNT(*) as po_count, COALESCE(SUM(total_amount), 0) as po_value
             FROM purchase_orders" . ($wPo ? " WHERE $wPo" : '') . "
             GROUP BY DATE(po_date)
             ORDER BY dt ASC",
            $p
        );

        $p = [];
        $wPay = $this->buildDateClause('payment_date', $fromDate, $toDate, $p);
        $paySeries = $this->fetchAll(
            "SELECT DATE(payment_date) as dt,
                    COUNT(*) as pay_count,
                    COALESCE(SUM(amount), 0) as cash_collected,
                    COALESCE(SUM(CASE WHEN payment_type='advance' THEN amount ELSE 0 END), 0) as advance_cash,
                    COALESCE(SUM(CASE WHEN payment_type='final' THEN amount ELSE 0 END), 0) as final_cash
             FROM payments
             WHERE status='verified'" . ($wPay ? " AND $wPay" : '') . "
             GROUP BY DATE(payment_date)
             ORDER BY dt ASC",
            $p
        );

        $p = [];
        $wLead = $this->buildDateClause('created_at', $fromDate, $toDate, $p);
        $leadSeries = $this->fetchAll(
            "SELECT DATE(created_at) as dt, COUNT(*) as lead_count, COALESCE(SUM(estimated_value), 0) as lead_value
             FROM leads" . ($wLead ? " WHERE $wLead" : '') . "
             GROUP BY DATE(created_at)
             ORDER BY dt ASC",
            $p
        );

        $p = [];
        $wQuote = $this->buildDateClause('quotation_date', $fromDate, $toDate, $p);
        $quoteSeries = $this->fetchAll(
            "SELECT DATE(quotation_date) as dt, COUNT(*) as quote_count, COALESCE(SUM(total_amount), 0) as quote_value
             FROM quotations" . ($wQuote ? " WHERE $wQuote" : '') . "
             GROUP BY DATE(quotation_date)
             ORDER BY dt ASC",
            $p
        );

        // Merge dates into unified timeline
        $timelineMap = [];
        $initDay = function ($dt) use (&$timelineMap) {
            if (!isset($timelineMap[$dt])) {
                $timelineMap[$dt] = [
                    'date' => $dt,
                    'po_count' => 0,
                    'po_value' => 0,
                    'cash_collected' => 0,
                    'advance_cash' => 0,
                    'final_cash' => 0,
                    'lead_count' => 0,
                    'lead_value' => 0,
                    'quote_count' => 0,
                    'quote_value' => 0
                ];
            }
        };
        foreach ($poSeries as $r) {
            $initDay($r['dt']);
            $timelineMap[$r['dt']]['po_count'] = intval($r['po_count']);
            $timelineMap[$r['dt']]['po_value'] = floatval($r['po_value']);
        }
        foreach ($paySeries as $r) {
            $initDay($r['dt']);
            $timelineMap[$r['dt']]['cash_collected'] = floatval($r['cash_collected']);
            $timelineMap[$r['dt']]['advance_cash'] = floatval($r['advance_cash']);
            $timelineMap[$r['dt']]['final_cash'] = floatval($r['final_cash']);
        }
        foreach ($leadSeries as $r) {
            $initDay($r['dt']);
            $timelineMap[$r['dt']]['lead_count'] = intval($r['lead_count']);
            $timelineMap[$r['dt']]['lead_value'] = floatval($r['lead_value']);
        }
        foreach ($quoteSeries as $r) {
            $initDay($r['dt']);
            $timelineMap[$r['dt']]['quote_count'] = intval($r['quote_count']);
            $timelineMap[$r['dt']]['quote_value'] = floatval($r['quote_value']);
        }
        ksort($timelineMap);
        $cumPo = 0;
        $cumCash = 0;
        $revenueTrend = [];
        foreach ($timelineMap as $day) {
            $cumPo += $day['po_value'];
            $cumCash += $day['cash_collected'];
            $day['cum_po_value'] = $cumPo;
            $day['cum_cash_collected'] = $cumCash;
            $revenueTrend[] = $day;
        }

        // 11. Owner Analytics: Lead Sources, Top Customers, Top Products
        $p = [];
        $w = $this->buildDateClause('created_at', $fromDate, $toDate, $p);
        $leadsBySource = $this->fetchAll(
            "SELECT COALESCE(NULLIF(TRIM(source), ''), 'Direct Inquiry') as source,
                    COUNT(*) as count,
                    SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved_count,
                    COALESCE(SUM(estimated_value), 0) as est_value
             FROM leads" . ($w ? " WHERE $w" : '') . "
             GROUP BY COALESCE(NULLIF(TRIM(source), ''), 'Direct Inquiry')
             ORDER BY count DESC, est_value DESC
             LIMIT 10",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('po.po_date', $fromDate, $toDate, $p);
        $topCustomers = $this->fetchAll(
            "SELECT c.id, c.company_name, c.contact_person,
                    COUNT(po.id) as order_count,
                    MAX(po.po_date) as last_order_date,
                    COALESCE(SUM(po.total_amount), 0) as total_value,
                    COALESCE(SUM((SELECT COALESCE(SUM(py.amount), 0) FROM payments py WHERE py.po_id = po.id AND py.status='verified')), 0) as paid_amount
             FROM purchase_orders po
             JOIN customers c ON po.customer_id = c.id" . ($w ? " WHERE $w" : '') . "
             GROUP BY c.id, c.company_name, c.contact_person
             ORDER BY total_value DESC
             LIMIT 10",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('po.po_date', $fromDate, $toDate, $p);
        $topProducts = $this->fetchAll(
            "SELECT pr.id, pr.sku, pr.name, pr.category,
                    COUNT(DISTINCT po.id) as order_count,
                    COALESCE(SUM(poi.quantity), 0) as total_qty,
                    COALESCE(SUM(poi.total_price), 0) as total_revenue
             FROM purchase_order_items poi
             JOIN purchase_orders po ON poi.po_id = po.id
             JOIN products pr ON poi.product_id = pr.id" . ($w ? " WHERE $w" : '') . "
             GROUP BY pr.id, pr.sku, pr.name, pr.category
             ORDER BY total_revenue DESC
             LIMIT 10",
            $p
        );

        // 12. Interactive Owner Data Tables (Expanded to 25 rows each)
        $p = [];
        $w = $this->buildDateClause('po.po_date', $fromDate, $toDate, $p);
        $recentOrders = $this->fetchAll(
            "SELECT po.id, po.po_number, po.customer_po_reference, po.po_date, po.delivery_deadline, po.total_amount, po.status,
                    c.company_name as customer_name,
                    DATEDIFF(po.delivery_deadline, CURDATE()) as days_to_deadline,
                    COALESCE((SELECT SUM(amount) FROM payments py WHERE py.po_id = po.id AND py.status='verified'), 0) as paid_amount
             FROM purchase_orders po
             JOIN customers c ON po.customer_id = c.id" . ($w ? " WHERE $w" : '') . "
             ORDER BY po.id DESC LIMIT 25",
            $p
        );

        // Overdue or Urgent Deadlines Watchlist (Live open POs sorted by nearest/past deadline)
        $deadlineWatchlist = $this->fetchAll(
            "SELECT po.id, po.po_number, po.delivery_deadline, po.total_amount, po.status,
                    c.company_name as customer_name,
                    DATEDIFF(po.delivery_deadline, CURDATE()) as days_left,
                    COALESCE((SELECT SUM(amount) FROM payments py WHERE py.po_id = po.id AND py.status='verified'), 0) as paid_amount
             FROM purchase_orders po
             JOIN customers c ON po.customer_id = c.id
             WHERE po.status NOT IN ('completed', 'cancelled')
             ORDER BY po.delivery_deadline ASC
             LIMIT 15"
        );

        $p = [];
        $w = $this->buildDateClause('wo.created_at', $fromDate, $toDate, $p);
        $activeWorkOrders = $this->fetchAll(
            "SELECT wo.id, wo.work_order_number, wo.current_level, wo.target_quantity, wo.completed_quantity, wo.rejected_quantity, wo.status, wo.material_status, wo.start_date,
                    p.name as product_name, po.po_number
             FROM work_orders wo
             JOIN products p ON wo.product_id = p.id
             JOIN purchase_orders po ON wo.po_id = po.id" . ($w ? " WHERE $w" : '') . "
             ORDER BY wo.id DESC LIMIT 25",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('py.payment_date', $fromDate, $toDate, $p);
        $recentPayments = $this->fetchAll(
            "SELECT py.id, py.payment_number, py.payment_date, py.amount, py.payment_type, py.payment_method, py.transaction_reference,
                    c.company_name as customer_name, po.po_number
             FROM payments py
             JOIN customers c ON py.customer_id = c.id
             JOIN purchase_orders po ON py.po_id = po.id
             WHERE py.status='verified'" . ($w ? " AND $w" : '') . "
             ORDER BY py.id DESC LIMIT 25",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('ct.created_at', $fromDate, $toDate, $p);
        $recentTickets = $this->fetchAll(
            "SELECT ct.id, ct.ticket_number, ct.title, ct.severity, ct.return_material_status, ct.status, ct.created_at,
                    c.company_name as customer_name, u.name as assigned_to_name
             FROM complaint_tickets ct
             LEFT JOIN customers c ON ct.customer_id = c.id
             LEFT JOIN users u ON ct.assigned_to = u.id" . ($w ? " WHERE $w" : '') . "
             ORDER BY ct.id DESC LIMIT 25",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('l.created_at', $fromDate, $toDate, $p);
        $recentLeads = $this->fetchAll(
            "SELECT l.id, l.lead_number, l.title, l.source, l.priority, l.estimated_value, l.status, l.created_at,
                    c.company_name as customer_name
             FROM leads l
             LEFT JOIN customers c ON l.customer_id = c.id" . ($w ? " WHERE $w" : '') . "
             ORDER BY l.id DESC LIMIT 25",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('q.quotation_date', $fromDate, $toDate, $p);
        $recentQuotations = $this->fetchAll(
            "SELECT q.id, q.quotation_number, q.quotation_date, q.valid_until, q.total_amount, q.status,
                    c.company_name as customer_name
             FROM quotations q
             JOIN customers c ON q.customer_id = c.id" . ($w ? " WHERE $w" : '') . "
             ORDER BY q.id DESC LIMIT 25",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('d.dispatch_date', $fromDate, $toDate, $p);
        $recentDispatches = $this->fetchAll(
            "SELECT d.id, d.dispatch_number, d.delivery_challan_no, d.lr_number, d.dispatch_date, d.tracking_number, d.total_packages, d.status,
                    cr.name as courier_name, c.company_name as customer_name, po.po_number
             FROM dispatches d
             JOIN couriers cr ON d.courier_id = cr.id
             JOIN purchase_orders po ON d.po_id = po.id
             JOIN customers c ON po.customer_id = c.id" . ($w ? " WHERE $w" : '') . "
             ORDER BY d.id DESC LIMIT 25",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('mr.created_at', $fromDate, $toDate, $p);
        $recentRequisitions = $this->fetchAll(
            "SELECT mr.id, mr.requisition_number, mr.status, mr.total_estimated_cost, mr.created_at,
                    po.po_number, c.company_name as customer_name, u.name as requested_by_name
             FROM material_requisitions mr
             JOIN purchase_orders po ON mr.po_id = po.id
             JOIN customers c ON po.customer_id = c.id
             LEFT JOIN users u ON mr.requested_by = u.id" . ($w ? " WHERE $w" : '') . "
             ORDER BY mr.id DESC LIMIT 25",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('created_at', $fromDate, $toDate, $p);
        $recentAuditLogs = $this->fetchAll(
            "SELECT id, user_name, role_name, module, action, entity_type, entity_id, details, created_at
             FROM audit_logs" . ($w ? " WHERE $w" : '') . "
             ORDER BY id DESC LIMIT 25",
            $p
        );

        // Derived KPIs
        $totalOrderVal = floatval($poCount['total_val'] ?? 0);
        $totalReceived = floatval($payCount['total_received'] ?? 0);
        $balanceDue = floatval($poPeriodBalance['period_unpaid'] ?? max(0, $totalOrderVal - $totalReceived));
        $poTotalCount = intval($poCount['total'] ?? 0);
        $avgOrderVal = $poTotalCount > 0 ? round($totalOrderVal / $poTotalCount, 2) : 0;

        $qcTotal = intval($qcStats['total'] ?? 0);
        $qcPassed = intval($qcStats['passed_count'] ?? 0);
        $qcPassedUnits = intval($qcStats['passed_units'] ?? 0);
        $qcRejectedUnits = intval($qcStats['rejected_units'] ?? 0);
        $qcTotalUnits = $qcPassedUnits + $qcRejectedUnits;
        $unitYieldRate = $qcTotalUnits > 0 ? round(($qcPassedUnits / $qcTotalUnits) * 100, 1) : 100;

        $qTotal = intval($quotesCount['total'] ?? 0);
        $qApproved = intval($quotesCount['approved'] ?? 0);
        $lTotal = intval($leadsCount['total'] ?? 0);
        $lApproved = intval($leadsCount['approved'] ?? 0);

        $pendingReqsOpen = intval($reqStats['pending_purchase'] ?? 0) + intval($reqStats['partially_fulfilled'] ?? 0);

        Response::success("Dashboard metrics retrieved", [
            "date_range" => ["from_date" => $fromDate, "to_date" => $toDate],
            "leads" => [
                "total" => $lTotal,
                "pending" => intval($leadsCount['pending'] ?? 0),
                "approved" => $lApproved,
                "rejected" => intval($leadsCount['rejected'] ?? 0),
                "urgent" => intval($leadsCount['urgent_count'] ?? 0),
                "high" => intval($leadsCount['high_count'] ?? 0),
                "approval_rate" => $lTotal > 0 ? round(($lApproved / $lTotal) * 100, 1) : 0,
                "estimated_value" => floatval($leadsCount['est_value'] ?? 0),
                "active_estimated_value" => floatval($leadsCount['active_est_value'] ?? 0)
            ],
            "quotations" => [
                "total" => $qTotal,
                "draft" => intval($quotesCount['draft'] ?? 0),
                "sent" => intval($quotesCount['sent'] ?? 0),
                "approved" => $qApproved,
                "rejected" => intval($quotesCount['rejected'] ?? 0),
                "expired" => intval($quotesCount['expired'] ?? 0),
                "total_value" => floatval($quotesCount['total_val'] ?? 0),
                "approved_value" => floatval($quotesCount['approved_val'] ?? 0),
                "open_value" => floatval($quotesCount['open_val'] ?? 0),
                "conversion_rate" => $qTotal > 0 ? round(($qApproved / $qTotal) * 100, 1) : 0
            ],
            "purchase_orders" => [
                "total" => $poTotalCount,
                "total_value" => $totalOrderVal,
                "avg_order_value" => $avgOrderVal,
                "received" => intval($poCount['received'] ?? 0),
                "verified" => intval($poCount['verified'] ?? 0),
                "in_production" => intval($poCount['in_production'] ?? 0),
                "completed" => intval($poCount['completed'] ?? 0),
                "cancelled" => intval($poCount['cancelled'] ?? 0),
                "fully_paid" => intval($poPeriodBalance['fully_paid_pos'] ?? 0),
                "partially_paid" => intval($poPeriodBalance['partially_paid_pos'] ?? 0),
                "unpaid" => intval($poPeriodBalance['unpaid_pos'] ?? 0),
                "overdue_count" => intval($globalReceivables['overdue_count'] ?? 0),
                "overdue_value" => floatval($globalReceivables['overdue_value'] ?? 0),
                "due_7d_count" => intval($globalReceivables['due_7d_count'] ?? 0)
            ],
            "finance" => [
                "total_order_value" => $totalOrderVal,
                "total_received" => $totalReceived,
                "advance_received" => floatval($payCount['advance_received'] ?? 0),
                "milestone_received" => floatval($payCount['milestone_received'] ?? 0),
                "final_received" => floatval($payCount['final_received'] ?? 0),
                "retention_received" => floatval($payCount['retention_received'] ?? 0),
                "balance_due" => $balanceDue,
                "total_excess_received" => floatval($globalReceivables['total_excess'] ?? 0),
                "period_excess_received" => floatval($poPeriodBalance['period_excess'] ?? 0),
                "all_time_receivable" => floatval($globalReceivables['total_receivable'] ?? 0),
                "payment_count" => intval($payCount['count'] ?? 0),
                "collection_percentage" => ($totalOrderVal > 0) ? round(($totalReceived / $totalOrderVal) * 100, 1) : 0
            ],
            "manufacturing" => [
                "total_work_orders" => intval($woCount['total'] ?? 0),
                "pending_materials" => intval($woCount['pending_materials'] ?? 0),
                "ready_to_start" => intval($woCount['ready_to_start'] ?? 0),
                "in_progress" => intval($woCount['in_progress'] ?? 0),
                "completed" => intval($woCount['completed'] ?? 0),
                "on_hold" => intval($woCount['on_hold'] ?? 0),
                "failed" => intval($woCount['failed'] ?? 0),
                "total_target_units" => intval($woCount['total_target'] ?? 0),
                "total_completed_units" => intval($woCount['total_completed_units'] ?? 0),
                "total_units_rejected" => intval($woCount['total_rejected'] ?? 0),
                "level_distribution" => $levelDist,
                "level_units" => $levelUnits
            ],
            "qc" => [
                "total_inspections" => $qcTotal,
                "passed_count" => $qcPassed,
                "failed_count" => intval($qcStats['failed_count'] ?? 0),
                "rework_count" => intval($qcStats['rework_count'] ?? 0),
                "pass_rate" => $qcTotal > 0 ? round(($qcPassed / $qcTotal) * 100, 1) : 100,
                "unit_yield_rate" => $unitYieldRate,
                "total_inspected_units" => intval($qcStats['total_inspected_units'] ?? 0),
                "passed_units" => $qcPassedUnits,
                "rejected_units" => $qcRejectedUnits,
                "by_level" => array_values($qcByLevel)
            ],
            "inventory" => [
                "low_stock_alerts" => intval($lowStock['count'] ?? 0),
                "out_of_stock_alerts" => intval($outOfStock['count'] ?? 0),
                "total_materials" => intval($totalMaterials['count'] ?? 0),
                "total_stock_value" => floatval($totalMaterials['stock_value'] ?? 0),
                "total_products" => intval($totalProducts['count'] ?? 0),
                "finished_goods" => intval($totalProducts['finished_goods'] ?? 0),
                "sub_assemblies" => intval($totalProducts['sub_assemblies'] ?? 0),
                "finished_goods_stock_value" => floatval($totalProducts['stock_value'] ?? 0),
                "pending_requisitions" => $pendingReqsOpen,
                "requisitions" => [
                    "total" => intval($reqStats['total'] ?? 0),
                    "pending_purchase" => intval($reqStats['pending_purchase'] ?? 0),
                    "partially_fulfilled" => intval($reqStats['partially_fulfilled'] ?? 0),
                    "fulfilled" => intval($reqStats['fulfilled'] ?? 0),
                    "pending_cost" => floatval($reqStats['pending_cost'] ?? 0),
                    "total_cost" => floatval($reqStats['total_cost'] ?? 0)
                ],
                "stock_by_category" => $stockByCategory,
                "low_stock_items" => $lowStockItems
            ],
            "logistics" => [
                "total_dispatches" => intval($dispCount['total'] ?? 0),
                "ready_for_dispatch" => intval($dispCount['ready_for_dispatch'] ?? 0),
                "dispatched" => intval($dispCount['dispatched'] ?? 0),
                "in_transit" => intval($dispCount['in_transit'] ?? 0) + intval($dispCount['dispatched'] ?? 0),
                "delivered" => intval($dispCount['delivered'] ?? 0),
                "returned" => intval($dispCount['returned'] ?? 0),
                "by_courier" => $dispatchesByCourier
            ],
            "customer_service" => [
                "total_complaints" => intval($complaints['total'] ?? 0),
                "open_complaints" => intval($complaints['open_count'] ?? 0),
                "resolved_complaints" => intval($complaints['resolved_count'] ?? 0),
                "by_severity" => [
                    "critical" => intval($complaints['critical_count'] ?? 0),
                    "high" => intval($complaints['high_count'] ?? 0),
                    "medium" => intval($complaints['medium_count'] ?? 0),
                    "low" => intval($complaints['low_count'] ?? 0)
                ],
                "inspections" => [
                    "total" => intval($custInspStats['total'] ?? 0),
                    "accepted_perfect" => intval($custInspStats['accepted_perfect'] ?? 0),
                    "accepted_with_faults" => intval($custInspStats['accepted_with_faults'] ?? 0),
                    "rejected_faulty" => intval($custInspStats['rejected_faulty'] ?? 0)
                ]
            ],
            "analytics" => [
                "leads_by_source" => $leadsBySource,
                "top_customers" => $topCustomers,
                "top_products" => $topProducts,
                "payment_by_method" => $paymentByMethod,
                "revenue_trend" => $revenueTrend
            ],
            "tables" => [
                "recent_orders" => $recentOrders,
                "deadline_watchlist" => $deadlineWatchlist,
                "active_work_orders" => $activeWorkOrders,
                "recent_payments" => $recentPayments,
                "recent_tickets" => $recentTickets,
                "recent_leads" => $recentLeads,
                "recent_quotations" => $recentQuotations,
                "recent_dispatches" => $recentDispatches,
                "recent_requisitions" => $recentRequisitions,
                "recent_audit_logs" => $recentAuditLogs
            ]
        ]);
    }
}
