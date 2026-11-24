<?php
// api/controllers/UserController.php

class UserController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
    }

    public function getAll() {
        $stmt = $this->db->query("
            SELECT u.id, u.name, u.email, u.phone, u.role_id, u.status, u.created_at, 
                   r.name as role_name, r.slug as role_slug 
            FROM users u 
            JOIN roles r ON u.role_id = r.id 
            ORDER BY u.id ASC
        ");
        Response::success("Users fetched", $stmt->fetchAll());
    }

    public function create() {
        $b = Response::getBody();
        if (empty($b['name']) || empty($b['email']) || empty($b['role_id'])) {
            Response::error("Name, email and role are required");
        }

        $password = password_hash($b['password'] ?? 'password123', PASSWORD_BCRYPT);
        $stmt = $this->db->prepare("
            INSERT INTO users (name, email, password, phone, role_id, status) 
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $b['name'],
            $b['email'],
            $password,
            $b['phone'] ?? null,
            intval($b['role_id']),
            $b['status'] ?? 'active'
        ]);

        Response::success("User created successfully", ["id" => $this->db->lastInsertId()], 201);
    }

    public function update($id) {
        $b = Response::getBody();
        $fields = [];
        $params = [];

        if (isset($b['name'])) { $fields[] = "name = ?"; $params[] = $b['name']; }
        if (isset($b['email'])) { $fields[] = "email = ?"; $params[] = $b['email']; }
        if (isset($b['phone'])) { $fields[] = "phone = ?"; $params[] = $b['phone']; }
        if (isset($b['role_id'])) { $fields[] = "role_id = ?"; $params[] = intval($b['role_id']); }
        if (isset($b['status'])) { $fields[] = "status = ?"; $params[] = $b['status']; }
        if (!empty($b['password'])) { 
            $fields[] = "password = ?"; 
            $params[] = password_hash($b['password'], PASSWORD_BCRYPT); 
        }

        if (empty($fields)) {
            Response::error("No fields to update");
        }

        $params[] = $id;
        $sql = "UPDATE users SET " . implode(", ", $fields) . " WHERE id = ?";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        Response::success("User updated successfully");
    }

    public function delete($id) {
        $stmt = $this->db->prepare("DELETE FROM users WHERE id = ?");
        $stmt->execute([$id]);
        Response::success("User deleted");
    }

    public function getPermissionMatrix() {
        // All roles
        $roles = $this->db->query("SELECT id, name, slug FROM roles ORDER BY id ASC")->fetchAll();
        
        // All permissions grouped by module
        $perms = $this->db->query("SELECT * FROM permissions ORDER BY module ASC, id ASC")->fetchAll();

        // Matrix
        $rpStmt = $this->db->query("SELECT role_id, permission_id FROM role_permissions");
        $activeMap = [];
        while ($row = $rpStmt->fetch()) {
            $activeMap[$row['role_id'] . '_' . $row['permission_id']] = true;
        }

        Response::success("Permission matrix fetched", [
            "roles" => $roles,
            "permissions" => $perms,
            "matrix" => $activeMap
        ]);
    }

    public function updatePermissionMatrix() {
        $b = Response::getBody();
        $roleId = intval($b['role_id'] ?? 0);
        $permissionIds = $b['permission_ids'] ?? [];

        if (!$roleId) {
            Response::error("Role ID is required");
        }

        $this->db->beginTransaction();
        try {
            $del = $this->db->prepare("DELETE FROM role_permissions WHERE role_id = ?");
            $del->execute([$roleId]);

            $ins = $this->db->prepare("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)");
            foreach ($permissionIds as $pId) {
                $ins->execute([$roleId, intval($pId)]);
            }

            $this->db->commit();
            Response::success("Role permissions updated successfully");
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to update matrix: " . $e->getMessage());
        }
    }
}
