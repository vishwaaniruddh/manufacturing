<?php
// api/config/database.php

class Database {
    private $host;
    private $db_name;
    private $username;
    private $password;
    private $env;
    private $conn = null;

    public function __construct() {
        $this->env = $this->detectEnvironment();

        if ($this->env === 'production') {
            $this->host     = $this->envValue('DB_HOST', 'localhost');
            $this->db_name  = $this->envValue('DB_NAME', 'u444388293_manufacturing');
            $this->username = $this->envValue('DB_USER', 'u444388293_manufacturing');
            $this->password = $this->envValue('DB_PASS', 'AVav@@2026');
        } else {
            $this->host     = $this->envValue('DB_HOST', '127.0.0.1');
            $this->db_name  = $this->envValue('DB_NAME', 'manufacturing_erp');
            $this->username = $this->envValue('DB_USER', 'root');
            $this->password = $this->envValue('DB_PASS', '');
        }

        // Optional local/server file override (gitignored if created)
        $overrideFile = __DIR__ . '/database.local.php';
        if (file_exists($overrideFile)) {
            $override = require $overrideFile;
            if (is_array($override)) {
                $this->host     = $override['host']     ?? $this->host;
                $this->db_name  = $override['db_name']  ?? $this->db_name;
                $this->username = $override['username'] ?? $this->username;
                $this->password = $override['password'] ?? $this->password;
            }
        }
    }

    private function envValue($key, $default) {
        if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
            return $_SERVER[$key];
        }
        $val = getenv($key);
        if ($val !== false && $val !== '') {
            return $val;
        }
        return $default;
    }

    private function normalizeHost($rawHost) {
        $rawHost = strtolower(trim((string)$rawHost));
        if ($rawHost === '') {
            return '';
        }
        // Handle comma-separated X-Forwarded-Host chains
        if (strpos($rawHost, ',') !== false) {
            $parts = explode(',', $rawHost);
            $rawHost = trim($parts[0]);
        }
        // Strip port while keeping IPv6 brackets valid
        if ($rawHost[0] === '[') {
            $end = strpos($rawHost, ']');
            return $end !== false ? substr($rawHost, 1, $end - 1) : $rawHost;
        }
        $colon = strpos($rawHost, ':');
        return $colon !== false ? substr($rawHost, 0, $colon) : $rawHost;
    }

    private function detectEnvironment() {
        $forced = strtolower(trim((string)$this->envValue('APP_ENV', '')));
        if (in_array($forced, ['production', 'prod'], true)) {
            return 'production';
        }
        if (in_array($forced, ['local', 'development', 'dev'], true)) {
            return 'local';
        }

        $host = '';
        foreach (['HTTP_X_FORWARDED_HOST', 'HTTP_HOST', 'SERVER_NAME'] as $headerKey) {
            if (!empty($_SERVER[$headerKey])) {
                $candidate = $this->normalizeHost($_SERVER[$headerKey]);
                if ($candidate !== '') {
                    $host = $candidate;
                    break;
                }
            }
        }

        // Explicit production domain check (mfg.sarsspl.com and *.sarsspl.com)
        if ($host === 'sarsspl.com' || substr($host, -12) === '.sarsspl.com') {
            return 'production';
        }

        if ($host !== '') {
            if (
                in_array($host, ['localhost', '127.0.0.1', '::1'], true)
                || preg_match('/\.(local|localhost|test)$/', $host)
            ) {
                return 'local';
            }
            if (filter_var($host, FILTER_VALIDATE_IP)) {
                $isPublicIp = filter_var(
                    $host,
                    FILTER_VALIDATE_IP,
                    FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
                ) !== false;
                return $isPublicIp ? 'production' : 'local';
            }
            return 'production';
        }

        // CLI / hostless execution fallback
        if (strpos(__DIR__, '/home/u444388293') === 0) {
            return 'production';
        }
        if (PHP_SAPI === 'cli' && (DIRECTORY_SEPARATOR === '\\' || stripos(PHP_OS, 'WIN') === 0)) {
            return 'local';
        }
        $serverAddr = $_SERVER['SERVER_ADDR'] ?? '';
        if (in_array($serverAddr, ['127.0.0.1', '::1'], true)) {
            return 'local';
        }

        return PHP_SAPI === 'cli' ? 'local' : 'production';
    }

    public function getEnvironment() {
        return $this->env;
    }

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
                    "message" => "Database connection error (" . $this->env . "): " . $exception->getMessage()
                ]);
                exit;
            }
        }
        return $this->conn;
    }
}
