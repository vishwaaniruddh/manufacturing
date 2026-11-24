<?php
// api/controllers/AuditController.php

class AuditController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
    }

    public function getAuditLogs() {
        $module = $_GET['module'] ?? null;
        $action = $_GET['action'] ?? null;
        $search = $_GET['search'] ?? null;
        $limit = intval($_GET['limit'] ?? 100);

        $sql = "SELECT * FROM audit_logs WHERE 1=1";
        $params = [];

        if ($module) {
            $sql .= " AND module = ?";
            $params[] = $module;
        }
        if ($action) {
            $sql .= " AND action = ?";
            $params[] = $action;
        }
        if ($search) {
            $sql .= " AND (details LIKE ? OR entity_id LIKE ? OR user_name LIKE ?)";
            $params[] = "%$search%";
            $params[] = "%$search%";
            $params[] = "%$search%";
        }

        $sql .= " ORDER BY id DESC LIMIT " . $limit;

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        Response::success("Audit logs fetched", $stmt->fetchAll());
    }

    public function getLoginActivities() {
        $limit = intval($_GET['limit'] ?? 100);
        $stmt = $this->db->prepare("SELECT * FROM user_logins ORDER BY id DESC LIMIT ?");
        $stmt->execute([$limit]);
        Response::success("Login activities fetched", $stmt->fetchAll());
    }
}
