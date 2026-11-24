<?php
// api/controllers/MediaController.php

class MediaController {
    private $db;
    private $uploadBaseDir;

    public function __construct($pdo) {
        $this->db = $pdo;
        $this->uploadBaseDir = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'uploads';
        if (!is_dir($this->uploadBaseDir)) {
            mkdir($this->uploadBaseDir, 0775, true);
        }
    }

    public function listByEntity() {
        $entityType = $_GET['entity_type'] ?? '';
        $entityId = isset($_GET['entity_id']) ? intval($_GET['entity_id']) : 0;

        if (empty($entityType)) {
            Response::error("entity_type is required");
        }

        if ($entityId > 0) {
            $stmt = $this->db->prepare("SELECT * FROM media_attachments WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC");
            $stmt->execute([$entityType, $entityId]);
        } else {
            $stmt = $this->db->prepare("SELECT * FROM media_attachments WHERE entity_type = ? ORDER BY id DESC");
            $stmt->execute([$entityType]);
        }

        Response::success("Media attachments fetched", $stmt->fetchAll());
    }

    public function upload() {
        $entityType = preg_replace('/[^a-zA-Z0-9_-]/', '', $_POST['entity_type'] ?? '');
        $entityId = intval($_POST['entity_id'] ?? 0);
        $uploadedBy = !empty($_POST['uploaded_by']) ? intval($_POST['uploaded_by']) : 1;
        $defaultDocLabel = !empty($_POST['doc_label']) ? substr(trim($_POST['doc_label']), 0, 50) : null;
        $docLabels = isset($_POST['doc_labels']) && is_array($_POST['doc_labels']) ? $_POST['doc_labels'] : [];

        if (empty($entityType) || $entityId <= 0) {
            Response::error("Valid entity_type and entity_id are required");
        }

        if (empty($_FILES['files'])) {
            Response::error("No files uploaded");
        }

        $targetDir = $this->uploadBaseDir . DIRECTORY_SEPARATOR . $entityType;
        if (!is_dir($targetDir)) {
            mkdir($targetDir, 0775, true);
        }

        $files = $_FILES['files'];
        $names = is_array($files['name']) ? $files['name'] : [$files['name']];
        $tmpNames = is_array($files['tmp_name']) ? $files['tmp_name'] : [$files['tmp_name']];
        $types = is_array($files['type']) ? $files['type'] : [$files['type']];
        $sizes = is_array($files['size']) ? $files['size'] : [$files['size']];
        $errors = is_array($files['error']) ? $files['error'] : [$files['error']];

        $saved = [];
        $ins = $this->db->prepare("
            INSERT INTO media_attachments (entity_type, entity_id, doc_label, file_name, file_path, mime_type, file_size, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");

        for ($i = 0; $i < count($names); $i++) {
            if ($errors[$i] !== UPLOAD_ERR_OK || !is_uploaded_file($tmpNames[$i])) {
                continue;
            }
            $origName = basename($names[$i]);
            $ext = pathinfo($origName, PATHINFO_EXTENSION);
            $safeBase = preg_replace('/[^a-zA-Z0-9._-]/', '_', pathinfo($origName, PATHINFO_FILENAME));
            $uniqueName = $safeBase . '_' . uniqid() . ($ext ? '.' . strtolower($ext) : '');
            $destPath = $targetDir . DIRECTORY_SEPARATOR . $uniqueName;

            if (move_uploaded_file($tmpNames[$i], $destPath)) {
                $webPath = '/manufacturing/uploads/' . $entityType . '/' . $uniqueName;
                $mime = $types[$i] ?? 'application/octet-stream';
                $size = intval($sizes[$i] ?? 0);
                $docLabel = !empty($docLabels[$i]) ? substr(trim($docLabels[$i]), 0, 50) : $defaultDocLabel;
                $ins->execute([$entityType, $entityId, $docLabel, $origName, $webPath, $mime, $size, $uploadedBy]);
                $saved[] = [
                    'id' => $this->db->lastInsertId(),
                    'entity_type' => $entityType,
                    'entity_id' => $entityId,
                    'doc_label' => $docLabel,
                    'file_name' => $origName,
                    'file_path' => $webPath,
                    'mime_type' => $mime,
                    'file_size' => $size
                ];
            }
        }

        Response::success(count($saved) . " file(s) uploaded", $saved, 201);
    }

    public function delete($id) {
        $stmt = $this->db->prepare("SELECT * FROM media_attachments WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if ($row) {
            $rel = str_replace('/manufacturing/', '', $row['file_path']);
            $fullPath = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
            if (file_exists($fullPath)) {
                @unlink($fullPath);
            }
            $this->db->prepare("DELETE FROM media_attachments WHERE id = ?")->execute([$id]);
        }
        Response::success("Attachment deleted");
    }
}
