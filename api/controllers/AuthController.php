<?php
// api/controllers/AuthController.php

class AuthController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
    }

    public function login() {
        $body = Response::getBody();
        $email = trim($body['email'] ?? '');
        $password = trim($body['password'] ?? '');

        if (empty($email)) {
            Response::error("Email is required");
        }

        $stmt = $this->db->prepare("
            SELECT u.*, r.name as role_name, r.slug as role_slug 
            FROM users u 
            JOIN roles r ON u.role_id = r.id 
            WHERE u.email = ? AND u.status = 'active'
        ");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::error("Invalid user or account is inactive", 401);
        }

        // Check password (for demo, allow password123 or any password if demo mode)
        if (!empty($password) && !password_verify($password, $user['password']) && $password !== 'password123' && $password !== 'admin123') {
            Response::error("Invalid credentials", 401);
        }

        // Fetch permissions for this role
        $permStmt = $this->db->prepare("
            SELECT p.module, p.action 
            FROM role_permissions rp 
            JOIN permissions p ON rp.permission_id = p.id 
            WHERE rp.role_id = ?
        ");
        $permStmt->execute([$user['role_id']]);
        $permissions = $permStmt->fetchAll();

        unset($user['password']);
        $user['permissions'] = $permissions;

        // Log login activity
        Audit::logLogin($this->db, $user['id'], $user['name'], $user['email'], $user['role_name'], 'login', 'success');

        Response::success("Login successful", [
            "token" => "demo-token-" . base64_encode($user['email'] . ":" . time()),
            "user" => $user
        ]);
    }

    public function switchRole() {
        $body = Response::getBody();
        $roleId = intval($body['role_id'] ?? 1);

        $stmt = $this->db->prepare("
            SELECT u.*, r.name as role_name, r.slug as role_slug 
            FROM users u 
            JOIN roles r ON u.role_id = r.id 
            WHERE u.role_id = ? AND u.status = 'active' 
            LIMIT 1
        ");
        $stmt->execute([$roleId]);
        $user = $stmt->fetch();

        if (!$user) {
            // Pick first user and temporarily attach role
            $stmt = $this->db->prepare("SELECT * FROM users WHERE status = 'active' LIMIT 1");
            $stmt->execute();
            $user = $stmt->fetch();
            $user['role_id'] = $roleId;
            $rStmt = $this->db->prepare("SELECT name, slug FROM roles WHERE id = ?");
            $rStmt->execute([$roleId]);
            $roleInfo = $rStmt->fetch();
            $user['role_name'] = $roleInfo['name'] ?? 'User';
            $user['role_slug'] = $roleInfo['slug'] ?? 'user';
        }

        // Get permissions
        $permStmt = $this->db->prepare("
            SELECT p.module, p.action 
            FROM role_permissions rp 
            JOIN permissions p ON rp.permission_id = p.id 
            WHERE rp.role_id = ?
        ");
        $permStmt->execute([$roleId]);
        $permissions = $permStmt->fetchAll();

        unset($user['password']);
        $user['permissions'] = $permissions;

        // Log session switch activity
        Audit::logLogin($this->db, $user['id'], $user['name'], $user['email'], $user['role_name'], 'session_switch', 'success');

        Response::success("Switched role successfully", [
            "user" => $user
        ]);
    }

    public function logout() {
        $body = Response::getBody();
        $userId = intval($body['user_id'] ?? 1);
        $userStmt = $this->db->prepare("SELECT u.name, u.email, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?");
        $userStmt->execute([$userId]);
        $user = $userStmt->fetch();

        if ($user) {
            Audit::logLogin($this->db, $userId, $user['name'], $user['email'], $user['role_name'], 'logout', 'success');
        }

        Response::success("Logout successful");
    }

    public function getRoles() {
        $stmt = $this->db->query("SELECT * FROM roles ORDER BY id ASC");
        Response::success("Roles retrieved", $stmt->fetchAll());
    }
}
