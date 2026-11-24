<?php
// api/helpers/response.php

class Response {
    public static function initCors() {
        // Set CORS headers
        if (!headers_sent()) {
            header("Access-Control-Allow-Origin: *");
            header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
            header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
            header("Content-Type: application/json; charset=UTF-8");
        }

        // Handle preflight OPTIONS request
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
            http_response_code(200);
            exit;
        }
    }

    public static function json($data, $statusCode = 200) {
        http_response_code($statusCode);
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function success($message, $data = null, $statusCode = 200) {
        $response = [
            "success" => true,
            "message" => $message
        ];
        if ($data !== null) {
            $response["data"] = $data;
        }
        self::json($response, $statusCode);
    }

    public static function error($message, $statusCode = 400, $errors = null) {
        $response = [
            "success" => false,
            "message" => $message
        ];
        if ($errors !== null) {
            $response["errors"] = $errors;
        }
        self::json($response, $statusCode);
    }

    public static function getBody() {
        $raw = file_get_contents("php://input");
        if (empty($raw)) {
            return $_POST;
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}
