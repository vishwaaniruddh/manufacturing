-- database_migration_wo_component_tracking.sql
-- Per-component 5-level progression tracking so passing components advance independently
-- while failed/rework components remain at their previous level until re-inspected.

CREATE TABLE IF NOT EXISTS work_order_components (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_order_id INT NOT NULL,
  product_id INT NOT NULL,
  item_type ENUM('finished_good', 'sub_product') NOT NULL DEFAULT 'finished_good',
  role_notes VARCHAR(255) DEFAULT NULL,
  target_quantity INT NOT NULL,
  passed_quantity INT NOT NULL DEFAULT 0,
  rejected_quantity INT NOT NULL DEFAULT 0,
  current_level INT NOT NULL DEFAULT 1,
  status ENUM('in_progress', 'rework', 'completed') NOT NULL DEFAULT 'in_progress',
  last_defect_reason VARCHAR(255) DEFAULT NULL,
  last_remarks VARCHAR(255) DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_wo_comp (work_order_id, product_id, item_type),
  FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill Finished Good row for all existing work orders
INSERT IGNORE INTO work_order_components
  (work_order_id, product_id, item_type, role_notes, target_quantity, passed_quantity, rejected_quantity, current_level, status)
SELECT
  wo.id,
  wo.product_id,
  'finished_good',
  'Primary Finished Good',
  wo.target_quantity,
  CASE WHEN wo.status = 'completed' THEN COALESCE(NULLIF(wo.completed_quantity, 0), wo.target_quantity) ELSE 0 END,
  wo.rejected_quantity,
  CASE WHEN wo.status = 'completed' THEN 5 ELSE COALESCE(wo.current_level, 1) END,
  CASE
    WHEN wo.status = 'completed' THEN 'completed'
    WHEN wo.status IN ('on_hold', 'failed') THEN 'rework'
    ELSE 'in_progress'
  END
FROM work_orders wo;

-- Backfill Sub-Assembly rows for all existing work orders
INSERT IGNORE INTO work_order_components
  (work_order_id, product_id, item_type, role_notes, target_quantity, passed_quantity, rejected_quantity, current_level, status)
SELECT
  wo.id,
  psa.sub_product_id,
  'sub_product',
  psa.notes,
  ROUND(psa.quantity_required * wo.target_quantity),
  CASE WHEN wo.status = 'completed' THEN ROUND(psa.quantity_required * wo.target_quantity) ELSE 0 END,
  0,
  CASE WHEN wo.status = 'completed' THEN 5 ELSE COALESCE(wo.current_level, 1) END,
  CASE
    WHEN wo.status = 'completed' THEN 'completed'
    WHEN wo.status IN ('on_hold', 'failed') THEN 'rework'
    ELSE 'in_progress'
  END
FROM work_orders wo
JOIN product_sub_assemblies psa ON psa.parent_product_id = wo.product_id;
