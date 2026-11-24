<?php
// api/controllers/DashboardController.php

class DashboardController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
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
        $fromDate = $_GET['from_date'] ?? null;
        $toDate = $_GET['to_date'] ?? null;

        // 1. Leads
        $p = [];
        $w = $this->buildDateClause('created_at', $fromDate, $toDate, $p);
        $leadsCount = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved,
                    SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected,
                    COALESCE(SUM(estimated_value), 0) as est_value
             FROM leads" . ($w ? " WHERE $w" : ''),
            $p
        );

        // 2. Quotations
        $p = [];
        $w = $this->buildDateClause('quotation_date', $fromDate, $toDate, $p);
        $quotesCount = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) as draft,
                    SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved,
                    SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected,
                    COALESCE(SUM(total_amount), 0) as total_val
             FROM quotations" . ($w ? " WHERE $w" : ''),
            $p
        );

        // 3. Purchase Orders
        $p = [];
        $w = $this->buildDateClause('po_date', $fromDate, $toDate, $p);
        $poCount = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    COALESCE(SUM(total_amount), 0) as total_val,
                    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status='in_production' THEN 1 ELSE 0 END) as in_production
             FROM purchase_orders" . ($w ? " WHERE $w" : ''),
            $p
        );

        // 4. Payments
        $p = [];
        $w = $this->buildDateClause('payment_date', $fromDate, $toDate, $p);
        $payCount = $this->fetchRow(
            "SELECT COUNT(*) as count,
                    COALESCE(SUM(amount), 0) as total_received,
                    COALESCE(SUM(CASE WHEN payment_type='advance' THEN amount ELSE 0 END), 0) as advance_received,
                    COALESCE(SUM(CASE WHEN payment_type='final' THEN amount ELSE 0 END), 0) as final_received
             FROM payments
             WHERE status='verified'" . ($w ? " AND $w" : ''),
            $p
        );

        // 5. Work Orders & 5-Level Distribution
        $p = [];
        $w = $this->buildDateClause('created_at', $fromDate, $toDate, $p);
        $woCount = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
                    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
                    COALESCE(SUM(target_quantity), 0) as total_target,
                    COALESCE(SUM(rejected_quantity), 0) as total_rejected
             FROM work_orders" . ($w ? " WHERE $w" : ''),
            $p
        );

        $p = [];
        $w = $this->buildDateClause('created_at', $fromDate, $toDate, $p);
        $lvlRows = $this->fetchAll(
            "SELECT current_level, COUNT(*) as count
             FROM work_orders
             WHERE status='in_progress'" . ($w ? " AND $w" : '') . "
             GROUP BY current_level",
            $p
        );
        $levelDist = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
        foreach ($lvlRows as $row) {
            $levelDist[intval($row['current_level'])] = intval($row['count']);
        }

        // 6. Quality Control Inspections
        $p = [];
        $w = $this->buildDateClause('inspection_date', $fromDate, $toDate, $p);
        $qcStats = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    SUM(CASE WHEN qc_status='passed' THEN 1 ELSE 0 END) as passed_count,
                    COALESCE(SUM(passed_qty), 0) as passed_units,
                    COALESCE(SUM(rejected_qty), 0) as rejected_units
             FROM quality_inspections" . ($w ? " WHERE $w" : ''),
            $p
        );

        // 7. Inventory Alerts & Requisitions (current snapshot)
        $lowStock = $this->fetchRow("SELECT COUNT(*) as count FROM raw_materials WHERE current_stock <= reorder_level");
        $totalMaterials = $this->fetchRow("SELECT COUNT(*) as count, COALESCE(SUM(current_stock * unit_cost), 0) as stock_value FROM raw_materials");
        $totalProducts = $this->fetchRow("SELECT COUNT(*) as count FROM products");
        $pendingReqs = $this->fetchRow("SELECT COUNT(*) as count FROM material_requisitions WHERE status='pending'");
        $lowStockItems = $this->fetchAll(
            "SELECT id, sku, name, current_stock, reorder_level, uom, location
             FROM raw_materials
             WHERE current_stock <= reorder_level
             ORDER BY current_stock ASC
             LIMIT 10"
        );

        // 8. Dispatches
        $p = [];
        $w = $this->buildDateClause('dispatch_date', $fromDate, $toDate, $p);
        $dispCount = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) as delivered,
                    SUM(CASE WHEN status='dispatched' OR status='in_transit' THEN 1 ELSE 0 END) as in_transit
             FROM dispatches" . ($w ? " WHERE $w" : ''),
            $p
        );

        // 9. Complaints / RMA
        $p = [];
        $w = $this->buildDateClause('created_at', $fromDate, $toDate, $p);
        $complaints = $this->fetchRow(
            "SELECT COUNT(*) as total,
                    SUM(CASE WHEN status='open' OR status='under_investigation' THEN 1 ELSE 0 END) as open_count,
                    SUM(CASE WHEN status='resolved' OR status='closed' THEN 1 ELSE 0 END) as resolved_count
             FROM complaint_tickets" . ($w ? " WHERE $w" : ''),
            $p
        );

        // 10. Recent Interactive Lists
        $p = [];
        $w = $this->buildDateClause('po.po_date', $fromDate, $toDate, $p);
        $recentOrders = $this->fetchAll(
            "SELECT po.id, po.po_number, po.po_date, po.delivery_deadline, po.total_amount, po.status,
                    c.company_name as customer_name,
                    COALESCE((SELECT SUM(amount) FROM payments py WHERE py.po_id = po.id AND py.status='verified'), 0) as paid_amount
             FROM purchase_orders po
             JOIN customers c ON po.customer_id = c.id" . ($w ? " WHERE $w" : '') . "
             ORDER BY po.id DESC LIMIT 10",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('wo.created_at', $fromDate, $toDate, $p);
        $activeWorkOrders = $this->fetchAll(
            "SELECT wo.id, wo.work_order_number, wo.current_level, wo.target_quantity, wo.rejected_quantity, wo.status,
                    p.name as product_name, po.po_number
             FROM work_orders wo
             JOIN products p ON wo.product_id = p.id
             JOIN purchase_orders po ON wo.po_id = po.id" . ($w ? " WHERE $w" : '') . "
             ORDER BY wo.id DESC LIMIT 10",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('py.payment_date', $fromDate, $toDate, $p);
        $recentPayments = $this->fetchAll(
            "SELECT py.id, py.payment_number, py.payment_date, py.amount, py.payment_type, py.transaction_reference,
                    c.company_name as customer_name, po.po_number
             FROM payments py
             JOIN customers c ON py.customer_id = c.id
             JOIN purchase_orders po ON py.po_id = po.id
             WHERE py.status='verified'" . ($w ? " AND $w" : '') . "
             ORDER BY py.id DESC LIMIT 10",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('ct.created_at', $fromDate, $toDate, $p);
        $recentTickets = $this->fetchAll(
            "SELECT ct.id, ct.ticket_number, ct.title, ct.severity, ct.status, ct.created_at,
                    u.name as assigned_to_name
             FROM complaint_tickets ct
             LEFT JOIN users u ON ct.assigned_to = u.id" . ($w ? " WHERE $w" : '') . "
             ORDER BY ct.id DESC LIMIT 10",
            $p
        );

        // 11. Owner Analytics: Lead Sources, Top Customers, Recent Leads/Quotes/Dispatches
        $p = [];
        $w = $this->buildDateClause('created_at', $fromDate, $toDate, $p);
        $leadsBySource = $this->fetchAll(
            "SELECT COALESCE(NULLIF(TRIM(source), ''), 'Direct Inquiry') as source,
                    COUNT(*) as count,
                    COALESCE(SUM(estimated_value), 0) as est_value
             FROM leads" . ($w ? " WHERE $w" : '') . "
             GROUP BY COALESCE(NULLIF(TRIM(source), ''), 'Direct Inquiry')
             ORDER BY count DESC, est_value DESC
             LIMIT 6",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('po.po_date', $fromDate, $toDate, $p);
        $topCustomers = $this->fetchAll(
            "SELECT c.id, c.company_name,
                    COUNT(po.id) as order_count,
                    COALESCE(SUM(po.total_amount), 0) as total_value,
                    COALESCE(SUM((SELECT COALESCE(SUM(py.amount), 0) FROM payments py WHERE py.po_id = po.id AND py.status='verified')), 0) as paid_amount
             FROM purchase_orders po
             JOIN customers c ON po.customer_id = c.id" . ($w ? " WHERE $w" : '') . "
             GROUP BY c.id, c.company_name
             ORDER BY total_value DESC
             LIMIT 5",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('l.created_at', $fromDate, $toDate, $p);
        $recentLeads = $this->fetchAll(
            "SELECT l.id, l.lead_number, l.title, l.source, l.priority, l.estimated_value, l.status, l.created_at,
                    c.company_name as customer_name
             FROM leads l
             LEFT JOIN customers c ON l.customer_id = c.id" . ($w ? " WHERE $w" : '') . "
             ORDER BY l.id DESC LIMIT 10",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('q.quotation_date', $fromDate, $toDate, $p);
        $recentQuotations = $this->fetchAll(
            "SELECT q.id, q.quotation_number, q.quotation_date, q.total_amount, q.status,
                    c.company_name as customer_name
             FROM quotations q
             JOIN customers c ON q.customer_id = c.id" . ($w ? " WHERE $w" : '') . "
             ORDER BY q.id DESC LIMIT 10",
            $p
        );

        $p = [];
        $w = $this->buildDateClause('d.dispatch_date', $fromDate, $toDate, $p);
        $recentDispatches = $this->fetchAll(
            "SELECT d.id, d.dispatch_number, d.delivery_challan_no, d.lr_number, d.dispatch_date, d.tracking_number, d.status,
                    cr.name as courier_name, c.company_name as customer_name
             FROM dispatches d
             JOIN couriers cr ON d.courier_id = cr.id
             JOIN purchase_orders po ON d.po_id = po.id
             JOIN customers c ON po.customer_id = c.id" . ($w ? " WHERE $w" : '') . "
             ORDER BY d.id DESC LIMIT 10",
            $p
        );

        $totalOrderVal = floatval($poCount['total_val'] ?? 0);
        $totalReceived = floatval($payCount['total_received'] ?? 0);
        $balanceDue = max(0, $totalOrderVal - $totalReceived);
        $qcTotal = intval($qcStats['total'] ?? 0);
        $qcPassed = intval($qcStats['passed_count'] ?? 0);
        $qTotal = intval($quotesCount['total'] ?? 0);
        $qApproved = intval($quotesCount['approved'] ?? 0);

        Response::success("Dashboard metrics retrieved", [
            "date_range" => ["from_date" => $fromDate, "to_date" => $toDate],
            "leads" => [
                "total" => intval($leadsCount['total'] ?? 0),
                "pending" => intval($leadsCount['pending'] ?? 0),
                "approved" => intval($leadsCount['approved'] ?? 0),
                "rejected" => intval($leadsCount['rejected'] ?? 0),
                "estimated_value" => floatval($leadsCount['est_value'] ?? 0)
            ],
            "quotations" => [
                "total" => $qTotal,
                "draft" => intval($quotesCount['draft'] ?? 0),
                "approved" => $qApproved,
                "rejected" => intval($quotesCount['rejected'] ?? 0),
                "total_value" => floatval($quotesCount['total_val'] ?? 0),
                "conversion_rate" => $qTotal > 0 ? round(($qApproved / $qTotal) * 100, 1) : 0
            ],
            "purchase_orders" => [
                "total" => intval($poCount['total'] ?? 0),
                "total_value" => $totalOrderVal,
                "completed" => intval($poCount['completed'] ?? 0),
                "in_production" => intval($poCount['in_production'] ?? 0)
            ],
            "finance" => [
                "total_order_value" => $totalOrderVal,
                "total_received" => $totalReceived,
                "advance_received" => floatval($payCount['advance_received'] ?? 0),
                "final_received" => floatval($payCount['final_received'] ?? 0),
                "balance_due" => $balanceDue,
                "payment_count" => intval($payCount['count'] ?? 0),
                "collection_percentage" => ($totalOrderVal > 0) ? round(($totalReceived / $totalOrderVal) * 100, 1) : 0
            ],
            "manufacturing" => [
                "total_work_orders" => intval($woCount['total'] ?? 0),
                "in_progress" => intval($woCount['in_progress'] ?? 0),
                "completed" => intval($woCount['completed'] ?? 0),
                "total_target_units" => intval($woCount['total_target'] ?? 0),
                "total_units_rejected" => intval($woCount['total_rejected'] ?? 0),
                "level_distribution" => $levelDist
            ],
            "qc" => [
                "total_inspections" => $qcTotal,
                "passed_count" => $qcPassed,
                "pass_rate" => $qcTotal > 0 ? round(($qcPassed / $qcTotal) * 100, 1) : 100,
                "passed_units" => intval($qcStats['passed_units'] ?? 0),
                "rejected_units" => intval($qcStats['rejected_units'] ?? 0)
            ],
            "inventory" => [
                "low_stock_alerts" => intval($lowStock['count'] ?? 0),
                "total_materials" => intval($totalMaterials['count'] ?? 0),
                "total_stock_value" => floatval($totalMaterials['stock_value'] ?? 0),
                "total_products" => intval($totalProducts['count'] ?? 0),
                "pending_requisitions" => intval($pendingReqs['count'] ?? 0),
                "low_stock_items" => $lowStockItems
            ],
            "logistics" => [
                "total_dispatches" => intval($dispCount['total'] ?? 0),
                "in_transit" => intval($dispCount['in_transit'] ?? 0),
                "delivered" => intval($dispCount['delivered'] ?? 0)
            ],
            "customer_service" => [
                "total_complaints" => intval($complaints['total'] ?? 0),
                "open_complaints" => intval($complaints['open_count'] ?? 0),
                "resolved_complaints" => intval($complaints['resolved_count'] ?? 0)
            ],
            "analytics" => [
                "leads_by_source" => $leadsBySource,
                "top_customers" => $topCustomers
            ],
            "tables" => [
                "recent_orders" => $recentOrders,
                "active_work_orders" => $activeWorkOrders,
                "recent_payments" => $recentPayments,
                "recent_tickets" => $recentTickets,
                "recent_leads" => $recentLeads,
                "recent_quotations" => $recentQuotations,
                "recent_dispatches" => $recentDispatches
            ]
        ]);
    }
}
