<?php
// api/controllers/DashboardController.php

class DashboardController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
    }

    public function getSummary() {
        // Leads
        $leadsCount = $this->db->query("SELECT COUNT(*) as total, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved FROM leads")->fetch();

        // Quotations
        $quotesCount = $this->db->query("SELECT COUNT(*) as total, SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved, SUM(total_amount) as total_val FROM quotations")->fetch();

        // Purchase Orders
        $poCount = $this->db->query("SELECT COUNT(*) as total, SUM(total_amount) as total_val, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed FROM purchase_orders")->fetch();

        // Payments
        $payCount = $this->db->query("SELECT COALESCE(SUM(amount), 0) as total_received FROM payments WHERE status='verified'")->fetch();

        // Work Orders
        $woCount = $this->db->query("SELECT COUNT(*) as total, SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed, SUM(rejected_quantity) as total_rejected FROM work_orders")->fetch();

        // Level Breakdown of active work orders
        $lvlStmt = $this->db->query("SELECT current_level, COUNT(*) as count FROM work_orders WHERE status='in_progress' GROUP BY current_level");
        $levelDist = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
        while ($row = $lvlStmt->fetch()) {
            $levelDist[intval($row['current_level'])] = intval($row['count']);
        }

        // Inventory alerts (items below reorder level)
        $lowStock = $this->db->query("SELECT COUNT(*) as count FROM raw_materials WHERE current_stock <= reorder_level")->fetch();

        // Dispatches
        $dispCount = $this->db->query("SELECT COUNT(*) as total, SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) as delivered, SUM(CASE WHEN status='dispatched' OR status='in_transit' THEN 1 ELSE 0 END) as in_transit FROM dispatches")->fetch();

        // Complaints
        $complaints = $this->db->query("SELECT COUNT(*) as total, SUM(CASE WHEN status='open' OR status='under_investigation' THEN 1 ELSE 0 END) as open_count FROM complaint_tickets")->fetch();

        $totalOrderVal = floatval($poCount['total_val'] ?? 0);
        $totalReceived = floatval($payCount['total_received'] ?? 0);
        $balanceDue = max(0, $totalOrderVal - $totalReceived);

        Response::success("Dashboard metrics retrieved", [
            "leads" => [
                "total" => intval($leadsCount['total'] ?? 0),
                "pending" => intval($leadsCount['pending'] ?? 0),
                "approved" => intval($leadsCount['approved'] ?? 0)
            ],
            "quotations" => [
                "total" => intval($quotesCount['total'] ?? 0),
                "approved" => intval($quotesCount['approved'] ?? 0),
                "total_value" => floatval($quotesCount['total_val'] ?? 0)
            ],
            "purchase_orders" => [
                "total" => intval($poCount['total'] ?? 0),
                "total_value" => $totalOrderVal,
                "completed" => intval($poCount['completed'] ?? 0)
            ],
            "finance" => [
                "total_order_value" => $totalOrderVal,
                "total_received" => $totalReceived,
                "balance_due" => $balanceDue,
                "collection_percentage" => ($totalOrderVal > 0) ? round(($totalReceived / $totalOrderVal) * 100, 1) : 0
            ],
            "manufacturing" => [
                "total_work_orders" => intval($woCount['total'] ?? 0),
                "in_progress" => intval($woCount['in_progress'] ?? 0),
                "completed" => intval($woCount['completed'] ?? 0),
                "total_units_rejected" => intval($woCount['total_rejected'] ?? 0),
                "level_distribution" => $levelDist
            ],
            "inventory" => [
                "low_stock_alerts" => intval($lowStock['count'] ?? 0)
            ],
            "logistics" => [
                "total_dispatches" => intval($dispCount['total'] ?? 0),
                "in_transit" => intval($dispCount['in_transit'] ?? 0),
                "delivered" => intval($dispCount['delivered'] ?? 0)
            ],
            "customer_service" => [
                "total_complaints" => intval($complaints['total'] ?? 0),
                "open_complaints" => intval($complaints['open_count'] ?? 0)
            ]
        ]);
    }
}
