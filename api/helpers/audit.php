<?php
// api/helpers/audit.php

class Audit {
    public static function log($pdo, $module, $action, $entityType, $entityId, $details, $user = null) {
        try {
            $userId = $user['id'] ?? ($_SESSION['user_id'] ?? 1);
            $userName = $user['name'] ?? ($_SESSION['user_name'] ?? 'System Admin');
            $roleName = $user['role_name'] ?? ($_SESSION['role_name'] ?? 'Administrator');
            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

            $stmt = $pdo->prepare("
                INSERT INTO audit_logs (user_id, user_name, role_name, module, action, entity_type, entity_id, details, ip_address, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ");
            $stmt->execute([
                $userId,
                $userName,
                $roleName,
                $module,
                $action,
                $entityType,
                $entityId,
                $details,
                $ip
            ]);
        } catch (Exception $e) {
            // Non-blocking for primary transaction
            error_log("Audit log failed: " . $e->getMessage());
        }
    }

    public static function logLogin($pdo, $userId, $userName, $email, $roleName, $action = 'login', $status = 'success') {
        try {
            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
            $ua = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown Client';
            $stmt = $pdo->prepare("
                INSERT INTO user_logins (user_id, user_name, email, role_name, action, ip_address, user_agent, login_time, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)
            ");
            $stmt->execute([$userId, $userName, $email, $roleName, $action, $ip, $ua, $status]);
        } catch (Exception $e) {
            error_log("Login log failed: " . $e->getMessage());
        }
    }
}
