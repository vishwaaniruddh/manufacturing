-- Database Migration: Per-Unit Stage Flow Across Manufacturing Levels 1..5
CREATE TABLE IF NOT EXISTS work_order_component_stages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_order_id INT NOT NULL,
  component_id INT NOT NULL,
  level_number TINYINT NOT NULL,
  pending_qty INT NOT NULL DEFAULT 0,
  rework_qty INT NOT NULL DEFAULT 0,
  passed_qty INT NOT NULL DEFAULT 0,
  rejected_qty INT NOT NULL DEFAULT 0,
  defect_reason TEXT NULL,
  remarks TEXT NULL,
  inspector_name VARCHAR(150) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_comp_stage (component_id, level_number),
  KEY idx_wo_lvl (work_order_id, level_number),
  CONSTRAINT fk_wocs_wo FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_wocs_comp FOREIGN KEY (component_id) REFERENCES work_order_components(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
