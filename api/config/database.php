<?php
// api/config/database.php

class Database {
    private $host = "127.0.0.1";
    private $db_name = "manufacturing_erp";
    private $username = "root";
    private $password = "";
    private $conn = null;

    public function getConnection() {
        if ($this->conn === null) {
            try {
                $dsn = "mysql:host=" . $this->host . ";dbname=" . $this->db_name . ";charset=utf8mb4";
                $options = [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ];
                $this->conn = new PDO($dsn, $this->username, $this->password, $options);
            } catch (PDOException $exception) {
                http_response_code(500);
                echo json_encode([
                    "success" => false,
                    "message" => "Database connection error: " . $exception->getMessage()
                ]);
                exit;
            }
        }
        return $this->conn;
    }
}
