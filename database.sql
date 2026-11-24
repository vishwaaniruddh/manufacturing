-- ==========================================================
-- Manufacturing Lifecycle ERP - Database Schema & Seed Data
-- ==========================================================

CREATE DATABASE IF NOT EXISTS `manufacturing_erp` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `manufacturing_erp`;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `complaint_tickets`;
DROP TABLE IF EXISTS `customer_inspection_items`;
DROP TABLE IF EXISTS `customer_inspections`;
DROP TABLE IF EXISTS `dispatches`;
DROP TABLE IF EXISTS `quality_inspections`;
DROP TABLE IF EXISTS `manufacturing_stages`;
DROP TABLE IF EXISTS `work_orders`;
DROP TABLE IF EXISTS `material_requisition_items`;
DROP TABLE IF EXISTS `material_requisitions`;
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `purchase_order_items`;
DROP TABLE IF EXISTS `purchase_orders`;
DROP TABLE IF EXISTS `quotation_items`;
DROP TABLE IF EXISTS `quotations`;
DROP TABLE IF EXISTS `leads`;
DROP TABLE IF EXISTS `product_boms`;
DROP TABLE IF EXISTS `raw_materials`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `vendors`;
DROP TABLE IF EXISTS `customers`;
DROP TABLE IF EXISTS `couriers`;
DROP TABLE IF EXISTS `cities`;
DROP TABLE IF EXISTS `states`;
DROP TABLE IF EXISTS `countries`;
DROP TABLE IF EXISTS `role_permissions`;
DROP TABLE IF EXISTS `permissions`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `roles`;

SET FOREIGN_KEY_CHECKS = 1;

-- 1. ROLES
CREATE TABLE `roles` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(50) NOT NULL UNIQUE,
    `slug` VARCHAR(50) NOT NULL UNIQUE,
    `description` VARCHAR(255) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. USERS
CREATE TABLE `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(100) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `role_id` INT NOT NULL,
    `status` ENUM('active', 'inactive') DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3. PERMISSIONS
CREATE TABLE `permissions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `module` VARCHAR(50) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `description` VARCHAR(255) NULL,
    UNIQUE KEY `uk_module_action` (`module`, `action`)
) ENGINE=InnoDB;

-- 4. ROLE_PERMISSIONS
CREATE TABLE `role_permissions` (
    `role_id` INT NOT NULL,
    `permission_id` INT NOT NULL,
    PRIMARY KEY (`role_id`, `permission_id`),
    FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5. COUNTRIES
CREATE TABLE `countries` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL UNIQUE,
    `code` VARCHAR(5) NOT NULL UNIQUE,
    `phone_code` VARCHAR(10) NULL,
    `status` ENUM('active', 'inactive') DEFAULT 'active'
) ENGINE=InnoDB;

-- 6. STATES
CREATE TABLE `states` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `country_id` INT NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(10) NULL,
    `status` ENUM('active', 'inactive') DEFAULT 'active',
    FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7. CITIES
CREATE TABLE `cities` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `state_id` INT NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `status` ENUM('active', 'inactive') DEFAULT 'active',
    FOREIGN KEY (`state_id`) REFERENCES `states`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 8. COURIERS
CREATE TABLE `couriers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(50) NOT NULL UNIQUE,
    `contact_person` VARCHAR(100) NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(100) NULL,
    `tracking_url_template` VARCHAR(255) NULL,
    `status` ENUM('active', 'inactive') DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 9. CUSTOMERS
CREATE TABLE `customers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `company_name` VARCHAR(150) NOT NULL,
    `contact_person` VARCHAR(100) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `gst_number` VARCHAR(50) NULL,
    `address` TEXT NULL,
    `country_id` INT NULL,
    `state_id` INT NULL,
    `city_id` INT NULL,
    `pincode` VARCHAR(20) NULL,
    `status` ENUM('active', 'inactive') DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`state_id`) REFERENCES `states`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 10. VENDORS
CREATE TABLE `vendors` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `company_name` VARCHAR(150) NOT NULL,
    `contact_person` VARCHAR(100) NOT NULL,
    `email` VARCHAR(100) NULL,
    `phone` VARCHAR(20) NOT NULL,
    `address` TEXT NULL,
    `status` ENUM('active', 'inactive') DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 11. PRODUCTS (Finished Goods)
CREATE TABLE `products` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `sku` VARCHAR(50) NOT NULL UNIQUE,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(50) DEFAULT 'Industrial',
    `uom` VARCHAR(20) DEFAULT 'Units',
    `unit_price` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    `status` ENUM('active', 'inactive') DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 12. RAW_MATERIALS (Inventory Items)
CREATE TABLE `raw_materials` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `sku` VARCHAR(50) NOT NULL UNIQUE,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(50) DEFAULT 'Metal & Hardware',
    `uom` VARCHAR(20) DEFAULT 'Kg',
    `current_stock` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    `reorder_level` DECIMAL(12,2) NOT NULL DEFAULT 10.00,
    `unit_cost` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    `location` VARCHAR(100) DEFAULT 'Main Warehouse - Rack A',
    `status` ENUM('active', 'inactive') DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 13. PRODUCT_BOMS (Recipe / Raw Material Requirement per 1 Finished Good unit)
CREATE TABLE `product_boms` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `product_id` INT NOT NULL,
    `raw_material_id` INT NOT NULL,
    `quantity_required` DECIMAL(12,4) NOT NULL,
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`raw_material_id`) REFERENCES `raw_materials`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 14. LEADS (Stage 1 & 2)
CREATE TABLE `leads` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `lead_number` VARCHAR(50) NOT NULL UNIQUE,
    `customer_id` INT NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `requirement_details` TEXT NULL,
    `estimated_value` DECIMAL(14,2) DEFAULT 0.00,
    `source` VARCHAR(50) DEFAULT 'Direct Inquiry',
    `status` ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    `remarks` TEXT NULL,
    `assigned_to` INT NULL,
    `created_by` INT NULL,
    `approved_by` INT NULL,
    `approved_at` DATETIME NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 15. QUOTATIONS (Stage 3 - Multiple allowed per lead)
CREATE TABLE `quotations` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `quotation_number` VARCHAR(50) NOT NULL UNIQUE,
    `lead_id` INT NOT NULL,
    `customer_id` INT NOT NULL,
    `revision_number` INT DEFAULT 1,
    `quotation_date` DATE NOT NULL,
    `valid_until` DATE NOT NULL,
    `subtotal` DECIMAL(14,2) DEFAULT 0.00,
    `tax_amount` DECIMAL(14,2) DEFAULT 0.00,
    `total_amount` DECIMAL(14,2) DEFAULT 0.00,
    `terms_conditions` TEXT NULL,
    `status` ENUM('draft', 'sent', 'approved', 'rejected', 'expired') DEFAULT 'draft',
    `remarks` TEXT NULL,
    `created_by` INT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 16. QUOTATION_ITEMS
CREATE TABLE `quotation_items` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `quotation_id` INT NOT NULL,
    `product_id` INT NOT NULL,
    `quantity` DECIMAL(12,2) NOT NULL,
    `unit_price` DECIMAL(12,2) NOT NULL,
    `tax_percent` DECIMAL(5,2) DEFAULT 18.00,
    `total_price` DECIMAL(14,2) NOT NULL,
    FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 17. PURCHASE_ORDERS (Stage 4 - Sales PO from Customer)
CREATE TABLE `purchase_orders` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `po_number` VARCHAR(50) NOT NULL UNIQUE,
    `customer_po_reference` VARCHAR(100) NOT NULL,
    `quotation_id` INT NOT NULL,
    `customer_id` INT NOT NULL,
    `po_date` DATE NOT NULL,
    `delivery_deadline` DATE NOT NULL,
    `total_amount` DECIMAL(14,2) NOT NULL,
    `payment_terms` VARCHAR(255) DEFAULT '50% Advance, 50% on Level 5 QC / Dispatch',
    `status` ENUM('received', 'verified', 'in_production', 'completed', 'cancelled') DEFAULT 'received',
    `notes` TEXT NULL,
    `attachment_url` VARCHAR(255) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 18. PURCHASE_ORDER_ITEMS
CREATE TABLE `purchase_order_items` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `po_id` INT NOT NULL,
    `product_id` INT NOT NULL,
    `quantity` DECIMAL(12,2) NOT NULL,
    `unit_price` DECIMAL(12,2) NOT NULL,
    `total_price` DECIMAL(14,2) NOT NULL,
    FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 19. PAYMENTS (Stage 5 & Stage 12 - Comprehensive Client Payment Tracking)
CREATE TABLE `payments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `payment_number` VARCHAR(50) NOT NULL UNIQUE,
    `po_id` INT NOT NULL,
    `quotation_id` INT NULL,
    `customer_id` INT NOT NULL,
    `payment_date` DATE NOT NULL,
    `amount` DECIMAL(14,2) NOT NULL,
    `payment_method` ENUM('bank_transfer', 'cheque', 'upi', 'credit_card', 'cash') DEFAULT 'bank_transfer',
    `transaction_reference` VARCHAR(100) NOT NULL,
    `payment_type` ENUM('advance', 'milestone', 'final') DEFAULT 'advance',
    `status` ENUM('received', 'verified', 'rejected') DEFAULT 'verified',
    `notes` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 20. MATERIAL_REQUISITIONS (Stage 7 - Shortfall requests to Accounts/Procurement)
CREATE TABLE `material_requisitions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `requisition_number` VARCHAR(50) NOT NULL UNIQUE,
    `po_id` INT NOT NULL,
    `requested_by` INT NULL,
    `status` ENUM('pending_purchase', 'partially_fulfilled', 'fulfilled', 'cancelled') DEFAULT 'pending_purchase',
    `total_estimated_cost` DECIMAL(14,2) DEFAULT 0.00,
    `remarks` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 21. MATERIAL_REQUISITION_ITEMS
CREATE TABLE `material_requisition_items` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `requisition_id` INT NOT NULL,
    `raw_material_id` INT NOT NULL,
    `required_qty` DECIMAL(12,2) NOT NULL,
    `available_qty` DECIMAL(12,2) NOT NULL,
    `shortfall_qty` DECIMAL(12,2) NOT NULL,
    `unit_cost` DECIMAL(12,2) DEFAULT 0.00,
    `total_cost` DECIMAL(14,2) DEFAULT 0.00,
    `status` ENUM('pending', 'ordered', 'received') DEFAULT 'pending',
    FOREIGN KEY (`requisition_id`) REFERENCES `material_requisitions`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`raw_material_id`) REFERENCES `raw_materials`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 22. WORK_ORDERS (Stage 7 & 8 - Manufacturing Job with 5 sequential levels)
CREATE TABLE `work_orders` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `work_order_number` VARCHAR(50) NOT NULL UNIQUE,
    `po_id` INT NOT NULL,
    `product_id` INT NOT NULL,
    `target_quantity` INT NOT NULL,
    `completed_quantity` INT DEFAULT 0,
    `rejected_quantity` INT DEFAULT 0,
    `current_level` INT DEFAULT 1,
    `status` ENUM('pending_materials', 'ready_to_start', 'in_progress', 'completed', 'on_hold', 'failed') DEFAULT 'ready_to_start',
    `material_status` ENUM('full', 'partial', 'not_found') DEFAULT 'full',
    `start_date` DATE NULL,
    `completion_date` DATE NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 23. MANUFACTURING_STAGES (The 5 sequential levels of manufacturing)
CREATE TABLE `manufacturing_stages` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `work_order_id` INT NOT NULL,
    `level_number` INT NOT NULL,
    `stage_name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('pending', 'in_progress', 'completed', 'rejected') DEFAULT 'pending',
    `started_at` DATETIME NULL,
    `completed_at` DATETIME NULL,
    `operator_name` VARCHAR(100) NULL,
    FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 24. QUALITY_INSPECTIONS (Stage 9 - QC Verification at EACH of the 5 Levels)
CREATE TABLE `quality_inspections` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `work_order_id` INT NOT NULL,
    `stage_id` INT NOT NULL,
    `level_number` INT NOT NULL,
    `inspector_id` INT NULL,
    `inspector_name` VARCHAR(100) NOT NULL,
    `total_inspected` INT NOT NULL,
    `passed_qty` INT NOT NULL,
    `rejected_qty` INT NOT NULL DEFAULT 0,
    `inspection_date` DATETIME NOT NULL,
    `qc_status` ENUM('pending', 'passed', 'failed', 'rework') NOT NULL,
    `remarks` TEXT NOT NULL,
    `defect_reason` VARCHAR(255) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`stage_id`) REFERENCES `manufacturing_stages`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`inspector_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 25. DISPATCHES (Stage 10 - Dispatch after Level 5 QC)
CREATE TABLE `dispatches` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `dispatch_number` VARCHAR(50) NOT NULL UNIQUE,
    `po_id` INT NOT NULL,
    `work_order_id` INT NOT NULL,
    `courier_id` INT NOT NULL,
    `tracking_number` VARCHAR(100) NOT NULL,
    `dispatch_date` DATE NOT NULL,
    `estimated_delivery_date` DATE NULL,
    `actual_delivery_date` DATE NULL,
    `total_packages` INT DEFAULT 1,
    `delivery_challan_no` VARCHAR(50) NOT NULL,
    `vehicle_no` VARCHAR(50) NULL,
    `status` ENUM('ready_for_dispatch', 'dispatched', 'in_transit', 'delivered', 'returned') DEFAULT 'dispatched',
    `remarks` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`courier_id`) REFERENCES `couriers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 26. CUSTOMER_INSPECTIONS (Stage 11 - Customer Quality Check)
CREATE TABLE `customer_inspections` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `dispatch_id` INT NOT NULL,
    `po_id` INT NOT NULL,
    `customer_id` INT NOT NULL,
    `inspection_date` DATE NOT NULL,
    `inspected_by_name` VARCHAR(100) NOT NULL,
    `overall_status` ENUM('accepted_perfect', 'accepted_with_faults', 'rejected_faulty') DEFAULT 'accepted_perfect',
    `remarks` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`dispatch_id`) REFERENCES `dispatches`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 27. CUSTOMER_INSPECTION_ITEMS
CREATE TABLE `customer_inspection_items` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `customer_inspection_id` INT NOT NULL,
    `product_id` INT NOT NULL,
    `total_received` INT NOT NULL,
    `perfect_qty` INT NOT NULL,
    `faulty_qty` INT NOT NULL DEFAULT 0,
    `fault_description` TEXT NULL,
    `condition_status` ENUM('perfect', 'faulty') DEFAULT 'perfect',
    FOREIGN KEY (`customer_inspection_id`) REFERENCES `customer_inspections`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 28. COMPLAINT_TICKETS (Stage 11 - RMA / Complaints for Faulty Items)
CREATE TABLE `complaint_tickets` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `ticket_number` VARCHAR(50) NOT NULL UNIQUE,
    `customer_inspection_id` INT NULL,
    `po_id` INT NOT NULL,
    `customer_id` INT NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `issue_details` TEXT NOT NULL,
    `severity` ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    `return_material_status` ENUM('not_required', 'requested', 'returned_in_transit', 'received_at_factory', 'replacement_issued', 'refund_issued') DEFAULT 'requested',
    `status` ENUM('open', 'under_investigation', 'approved_for_return', 'resolved', 'closed') DEFAULT 'open',
    `resolution_notes` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`customer_inspection_id`) REFERENCES `customer_inspections`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ==========================================================
-- SEED DATA
-- ==========================================================

-- Roles
INSERT INTO `roles` (`id`, `name`, `slug`, `description`) VALUES
(1, 'Administrator', 'admin', 'Full system access and master configuration'),
(2, 'Sales Executive', 'sales', 'Manage leads, quotations, and customer communication'),
(3, 'Production Manager', 'manufacturing', 'Manage inventory lookup, requisitions, and 5-stage manufacturing'),
(4, 'Quality Control Inspector', 'qc', 'Verify quality at Level 1 through Level 5 stages'),
(5, 'Store / Inventory Head', 'inventory', 'Material stock control and inventory updates'),
(6, 'Accounts & Procurement', 'accounts', 'Payment tracking and material purchase orders'),
(7, 'Logistics & Dispatch', 'dispatch', 'Dispatch management and courier tracking'),
(8, 'Client / Customer Representative', 'customer', 'Customer inspections, complaint tickets, and final payment release');

-- Users (Default password: password123)
-- bcrypt hash for 'password123': $2y$10$4n9j0uL6k2Qp3j28jA2r9OaK30gQvCq9/i6jLqg37V1K.s8Xz2f5S or similar standard hash
INSERT INTO `users` (`id`, `name`, `email`, `password`, `phone`, `role_id`, `status`) VALUES
(1, 'System Admin', 'admin@mfg-erp.local', '$2y$10$wOqZpL4e78V9lXf26b5PRe7cT4l3t7z6mH8g4Yp.gJv2X1P7L4V9u', '+91 9876543210', 1, 'active'),
(2, 'Rahul Sharma (Sales)', 'sales@mfg-erp.local', '$2y$10$wOqZpL4e78V9lXf26b5PRe7cT4l3t7z6mH8g4Yp.gJv2X1P7L4V9u', '+91 9876543211', 2, 'active'),
(3, 'Vikram Patil (Production Lead)', 'production@mfg-erp.local', '$2y$10$wOqZpL4e78V9lXf26b5PRe7cT4l3t7z6mH8g4Yp.gJv2X1P7L4V9u', '+91 9876543212', 3, 'active'),
(4, 'Sunil Deshmukh (Senior QC)', 'qc@mfg-erp.local', '$2y$10$wOqZpL4e78V9lXf26b5PRe7cT4l3t7z6mH8g4Yp.gJv2X1P7L4V9u', '+91 9876543213', 4, 'active'),
(5, 'Anita Nair (Store Keeper)', 'inventory@mfg-erp.local', '$2y$10$wOqZpL4e78V9lXf26b5PRe7cT4l3t7z6mH8g4Yp.gJv2X1P7L4V9u', '+91 9876543214', 5, 'active'),
(6, 'Pooja Agarwal (Accounts)', 'accounts@mfg-erp.local', '$2y$10$wOqZpL4e78V9lXf26b5PRe7cT4l3t7z6mH8g4Yp.gJv2X1P7L4V9u', '+91 9876543215', 6, 'active'),
(7, 'Manoj Kumar (Dispatch Head)', 'dispatch@mfg-erp.local', '$2y$10$wOqZpL4e78V9lXf26b5PRe7cT4l3t7z6mH8g4Yp.gJv2X1P7L4V9u', '+91 9876543216', 7, 'active'),
(8, 'David Miller (Apex Client)', 'client@apexindustrial.com', '$2y$10$wOqZpL4e78V9lXf26b5PRe7cT4l3t7z6mH8g4Yp.gJv2X1P7L4V9u', '+1 555-0199', 8, 'active');

-- Permissions List
INSERT INTO `permissions` (`id`, `module`, `action`, `description`) VALUES
(1, 'leads', 'view', 'View lead records'),
(2, 'leads', 'create', 'Create new leads'),
(3, 'leads', 'edit', 'Edit lead information'),
(4, 'leads', 'approve', 'Approve or reject leads'),
(5, 'quotations', 'view', 'View quotations'),
(6, 'quotations', 'create', 'Create quotation'),
(7, 'quotations', 'edit', 'Update quotation'),
(8, 'quotations', 'delete', 'Delete quotation'),
(9, 'quotations', 'approve', 'Approve quotation for client PO'),
(10, 'purchase_orders', 'view', 'View purchase orders'),
(11, 'purchase_orders', 'create', 'Import or create customer PO'),
(12, 'payments', 'view', 'View payment receipts'),
(13, 'payments', 'create', 'Record customer payments'),
(14, 'inventory', 'view', 'View raw materials and lookup BOM'),
(15, 'inventory', 'requisition', 'Raise purchase requisition for missing items'),
(16, 'manufacturing', 'view', 'View manufacturing work orders'),
(17, 'manufacturing', 'start', 'Start work order and level stages'),
(18, 'qc', 'inspect', 'Perform Level 1 to 5 QC verification and reject/approve'),
(19, 'dispatch', 'manage', 'Create dispatch order and courier tracking'),
(20, 'customer_portal', 'inspect', 'Customer item verification and faulty flagging'),
(21, 'customer_portal', 'complain', 'Raise complaint ticket / return request'),
(22, 'masters', 'manage', 'Manage City, State, Country, Courier, Customer masters'),
(23, 'users', 'manage', 'Manage users, roles and permission matrix');

-- Assign Permissions to Admin (All)
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, id FROM `permissions`;

-- Assign Permissions to Sales
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
(2, 1), (2, 2), (2, 3), (2, 4), (2, 5), (2, 6), (2, 7), (2, 8), (2, 9), (2, 10), (2, 11), (2, 12);

-- Assign Permissions to Manufacturing
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
(3, 10), (3, 14), (3, 15), (3, 16), (3, 17);

-- Assign Permissions to QC
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
(4, 16), (4, 18);

-- Assign Permissions to Accounts
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
(6, 10), (6, 12), (6, 13), (6, 14), (6, 15);

-- Assign Permissions to Dispatch
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
(7, 10), (7, 16), (7, 19);

-- Assign Permissions to Customer
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
(8, 10), (8, 12), (8, 20), (8, 21);

-- Masters: Countries
INSERT INTO `countries` (`id`, `name`, `code`, `phone_code`, `status`) VALUES
(1, 'India', 'IN', '+91', 'active'),
(2, 'United States', 'US', '+1', 'active'),
(3, 'Germany', 'DE', '+49', 'active'),
(4, 'United Arab Emirates', 'AE', '+971', 'active');

-- Masters: States
INSERT INTO `states` (`id`, `country_id`, `name`, `code`, `status`) VALUES
(1, 1, 'Maharashtra', 'MH', 'active'),
(2, 1, 'Gujarat', 'GJ', 'active'),
(3, 1, 'Karnataka', 'KA', 'active'),
(4, 1, 'Tamil Nadu', 'TN', 'active'),
(5, 2, 'California', 'CA', 'active'),
(6, 2, 'Texas', 'TX', 'active');

-- Masters: Cities
INSERT INTO `cities` (`id`, `state_id`, `name`, `status`) VALUES
(1, 1, 'Mumbai', 'active'),
(2, 1, 'Pune', 'active'),
(3, 2, 'Ahmedabad', 'active'),
(4, 3, 'Bengaluru', 'active'),
(5, 4, 'Chennai', 'active'),
(6, 5, 'San Francisco', 'active'),
(7, 6, 'Austin', 'active');

-- Masters: Couriers
INSERT INTO `couriers` (`id`, `name`, `code`, `contact_person`, `phone`, `email`, `tracking_url_template`, `status`) VALUES
(1, 'BlueDart Express', 'BLUEDART', 'Ramesh Varma', '+91 9820011223', 'support@bluedart.com', 'https://www.bluedart.com/track?trackNo={TRACKING_NO}', 'active'),
(2, 'DHL Global Forwarding', 'DHL', 'Sarah Jenkins', '+1 800 225 5345', 'express@dhl.com', 'https://www.dhl.com/en/express/tracking.html?AWB={TRACKING_NO}', 'active'),
(3, 'Delhivery Logistics', 'DELHIVERY', 'Amit Saxena', '+91 9811223344', 'corporate@delhivery.com', 'https://www.delhivery.com/track/package/{TRACKING_NO}', 'active'),
(4, 'FedEx Industrial', 'FEDEX', 'Mark Hansen', '+1 800 463 3339', 'tracking@fedex.com', 'https://www.fedex.com/fedextrack/?trknbr={TRACKING_NO}', 'active');

-- Masters: Customers
INSERT INTO `customers` (`id`, `company_name`, `contact_person`, `email`, `phone`, `gst_number`, `address`, `country_id`, `state_id`, `city_id`, `pincode`, `status`) VALUES
(1, 'Apex Industrial Solutions Pvt Ltd', 'David Miller', 'client@apexindustrial.com', '+91 9876501234', '27AAACA1234A1Z5', 'Plot 45, MIDC Industrial Area, Andheri East', 1, 1, 1, '400093', 'active'),
(2, 'Nova Dynamics Robotics', 'Priya Kulkarni', 'priya@novadynamics.io', '+91 9822334455', '27AABCN5678B1Z2', 'Survey 12, Hinjewadi Phase 1, Infotech Park', 1, 1, 2, '411057', 'active'),
(3, 'Precision Hydraulics GmbH', 'Hans Weber', 'hans.w@precision-hydraulics.de', '+49 89 12345678', 'DE123456789', 'Industriestrasse 104, Munich', 3, NULL, NULL, '80331', 'active');

-- Masters: Vendors
INSERT INTO `vendors` (`id`, `company_name`, `contact_person`, `email`, `phone`, `address`, `status`) VALUES
(1, 'National Alloy Steels Ltd', 'Rajesh Gupta', 'sales@nationalalloys.com', '+91 9820098200', 'Wagle Estate, Thane, Maharashtra', 'active'),
(2, 'Semicon Components Pvt Ltd', 'Kevin Chen', 'supply@semiconcomp.com', '+91 9833445566', 'Electronics City, Bengaluru', 'active'),
(3, 'PolyPack & Seals Inc', 'Dinesh Sethi', 'dinesh@polypack.in', '+91 9819988776', 'GIDC Industrial Estate, Vatva, Ahmedabad', 'active');

-- Products (Finished Goods)
INSERT INTO `products` (`id`, `sku`, `name`, `description`, `category`, `uom`, `unit_price`, `status`) VALUES
(1, 'FG-STP-1001', 'High Torque NEMA 34 Stepper Motor', 'Industrial grade 8.2 Nm stepper motor for CNC and robotics automation', 'Motors & Drives', 'Units', 4500.00, 'active'),
(2, 'FG-HYD-2002', 'Heavy Duty Hydraulic Cylinder 150mm', 'Double acting industrial hydraulic actuator, 250 Bar rating', 'Hydraulics', 'Units', 12500.00, 'active'),
(3, 'FG-IOT-3003', 'Smart Industrial IoT Edge Sensor', 'Multi-sensor gateway with RS485 Modbus, vibration and temperature monitoring', 'Electronics', 'Units', 3800.00, 'active'),
(4, 'FG-GBX-4004', 'Planetary Precision Reduction Gearbox', 'High precision planetary gearbox ratio 10:1 with low backlash', 'Transmission', 'Units', 8900.00, 'active');

-- Raw Materials (Inventory Items)
INSERT INTO `raw_materials` (`id`, `sku`, `name`, `description`, `category`, `uom`, `current_stock`, `reorder_level`, `unit_cost`, `location`, `status`) VALUES
(1, 'RM-STL-01', 'High Tensile Alloy Steel Rod 40mm', 'EN24 grade alloy steel rod for shaft manufacturing', 'Metals', 'Meters', 150.00, 30.00, 850.00, 'Warehouse Bay 1 - Rack A1', 'active'),
(2, 'RM-CPR-02', 'Enameled Copper Winding Wire 0.8mm', 'Grade 2 dual coated copper winding coil for motor stators', 'Electrical', 'Kg', 45.00, 20.00, 720.00, 'Warehouse Bay 2 - Bin C4', 'active'),
(3, 'RM-MAG-03', 'Neodymium Rare Earth Magnets N52', 'High grade permanent magnets for rotor assembly', 'Magnets', 'Pcs', 800.00, 100.00, 120.00, 'Secure Storage Room B', 'active'),
(4, 'RM-SEAL-04', 'High Pressure Polyurethane Seal Kit', 'Piston and rod seal kit rated for 300 Bar hydraulic fluid', 'Seals & Gaskets', 'Sets', 12.00, 25.00, 480.00, 'Warehouse Bay 3 - Shelf D2', 'active'),
(5, 'RM-ALU-05', 'CNC Machined Aluminum 6061 Enclosure', 'Anodized IP67 weatherproof enclosure box', 'Mechanical', 'Pcs', 35.00, 20.00, 350.00, 'Warehouse Bay 1 - Rack B2', 'active'),
(6, 'RM-MCU-06', 'Industrial IoT Gateway Motherboard PCB', 'ARM Cortex-M4 based populated PCB with Modbus & LoRa', 'Electronics', 'Pcs', 8.00, 20.00, 1450.00, 'ESD Protected Chamber 1', 'active');

-- Product BOM (Bill of Materials per 1 Unit of Finished Product)
-- 1 unit of High Torque Stepper Motor (FG-STP-1001) requires:
-- 0.5 meter RM-STL-01 (Alloy Steel Rod)
-- 1.2 kg RM-CPR-02 (Copper Wire)
-- 8 pcs RM-MAG-03 (Neodymium Magnets)
INSERT INTO `product_boms` (`product_id`, `raw_material_id`, `quantity_required`) VALUES
(1, 1, 0.5000),
(1, 2, 1.2000),
(1, 3, 8.0000);

-- 1 unit of Hydraulic Cylinder 150mm (FG-HYD-2002) requires:
-- 2.0 meter RM-STL-01 (Alloy Steel Rod)
-- 2 sets RM-SEAL-04 (Seal Kit)
INSERT INTO `product_boms` (`product_id`, `raw_material_id`, `quantity_required`) VALUES
(2, 1, 2.0000),
(2, 4, 2.0000);

-- 1 unit of Smart IoT Sensor (FG-IOT-3003) requires:
-- 1 pcs RM-ALU-05 (Aluminum Enclosure)
-- 1 pcs RM-MCU-06 (PCB Motherboard)
INSERT INTO `product_boms` (`product_id`, `raw_material_id`, `quantity_required`) VALUES
(3, 5, 1.0000),
(3, 6, 1.0000);

-- ==========================================================
-- DEMO PIPELINE SEED DATA: Leads -> Quotations -> POs -> Payments -> Manufacturing
-- ==========================================================

-- Lead 1: Approved Lead
INSERT INTO `leads` (`id`, `lead_number`, `customer_id`, `title`, `requirement_details`, `estimated_value`, `source`, `status`, `remarks`, `assigned_to`, `created_by`, `approved_by`, `approved_at`, `created_at`) VALUES
(1, 'LEAD-2026-001', 1, 'Supply of 50 units High Torque Stepper Motors', 'Client requires 50 units NEMA 34 motors for automated packaging machinery project.', 225000.00, 'Direct Inquiry', 'approved', 'Technical specifications verified and credit check passed. Approved for quotation.', 2, 2, 1, '2026-11-20 10:30:00', '2026-11-19 09:15:00'),
(2, 'LEAD-2026-002', 2, '20 units Heavy Duty Hydraulic Cylinders for Press Line', 'Requirement for 250 Bar hydraulic cylinders with 150mm bore and 400mm stroke.', 250000.00, 'Exhibition Contact', 'approved', 'Client requirement fits standard product line. Approved for quotation.', 2, 2, 1, '2026-11-21 11:00:00', '2026-11-20 14:00:00'),
(3, 'LEAD-2026-003', 1, 'IoT Monitoring Gateways for Plant Energy Audit', 'Inquiry for 10 units IoT Gateways. Budget estimation under review.', 38000.00, 'Website', 'pending', 'Awaiting final sensor accuracy tolerance requirement from engineering team.', 2, 2, NULL, NULL, '2026-11-23 16:20:00');

-- Quotation 1 (Approved against Lead 1)
INSERT INTO `quotations` (`id`, `quotation_number`, `lead_id`, `customer_id`, `revision_number`, `quotation_date`, `valid_until`, `subtotal`, `tax_amount`, `total_amount`, `terms_conditions`, `status`, `remarks`, `created_by`) VALUES
(1, 'QT-2026-0101', 1, 1, 1, '2026-11-20', '2026-12-20', 225000.00, 40500.00, 265500.00, '1. 50% advance on PO confirmation, balance 50% prior to dispatch.\n2. Delivery lead time: 3 weeks.\n3. Warranty: 18 months standard factory warranty.', 'approved', 'Client approved quotation without objections. PO expected.', 2),
(2, 'QT-2026-0102', 2, 2, 1, '2026-11-21', '2026-12-21', 250000.00, 45000.00, 295000.00, '1. 40% advance, 60% on delivery.\n2. Delivery time: 4 weeks.', 'approved', 'Client accepted terms. PO received.', 2);

-- Quotation 1 Items
INSERT INTO `quotation_items` (`quotation_id`, `product_id`, `quantity`, `unit_price`, `tax_percent`, `total_price`) VALUES
(1, 1, 50.00, 4500.00, 18.00, 265500.00),
(2, 2, 20.00, 12500.00, 18.00, 295000.00);

-- Purchase Order 1 (Against Quotation 1)
INSERT INTO `purchase_orders` (`id`, `po_number`, `customer_po_reference`, `quotation_id`, `customer_id`, `po_date`, `delivery_deadline`, `total_amount`, `payment_terms`, `status`, `notes`) VALUES
(1, 'PO-2026-5001', 'APEX/PO/2026/089', 1, 1, '2026-11-21', '2026-12-15', 265500.00, '50% Advance received, 50% against final inspection & delivery', 'in_production', 'High priority delivery for packaging line installation.'),
(2, 'PO-2026-5002', 'NOVA/PUR/2026/44', 2, 2, '2026-11-22', '2026-12-22', 295000.00, '40% advance received, balance upon delivery', 'received', 'Requires material purchase before manufacturing can start.');

-- PO Items
INSERT INTO `purchase_order_items` (`po_id`, `product_id`, `quantity`, `unit_price`, `total_price`) VALUES
(1, 1, 50.00, 4500.00, 225000.00),
(2, 2, 20.00, 12500.00, 250000.00);

-- Payments (Tracking payment for PO 1)
-- 50% Advance received
INSERT INTO `payments` (`id`, `payment_number`, `po_id`, `quotation_id`, `customer_id`, `payment_date`, `amount`, `payment_method`, `transaction_reference`, `payment_type`, `status`, `notes`) VALUES
(1, 'PAY-2026-101', 1, 1, 1, '2026-11-21', 132750.00, 'bank_transfer', 'HDFC-NEFT-984420119', 'advance', 'verified', 'Advance 50% credited into corporate account.'),
(2, 'PAY-2026-102', 2, 2, 2, '2026-11-22', 118000.00, 'bank_transfer', 'ICICI-RTGS-002918821', 'advance', 'verified', '40% advance payment received.');

-- Work Order 1 (Active Manufacturing Work Order for PO 1)
-- 50 units of High Torque Stepper Motor
-- Raw material requirements:
-- 50 * 0.5m = 25m Alloy Steel (Stock: 150m -> FULL)
-- 50 * 1.2kg = 60kg Copper Wire (Stock: 45kg -> SHORTFALL by 15kg initially, let us assume accounts fulfilled it or partially fulfilled!)
INSERT INTO `work_orders` (`id`, `work_order_number`, `po_id`, `product_id`, `target_quantity`, `completed_quantity`, `rejected_quantity`, `current_level`, `status`, `material_status`, `start_date`, `completion_date`) VALUES
(1, 'WO-2026-7001', 1, 1, 50, 0, 2, 3, 'in_progress', 'full', '2026-11-22', NULL);

-- 5 Sequential Manufacturing Stages for Work Order 1
INSERT INTO `manufacturing_stages` (`id`, `work_order_id`, `level_number`, `stage_name`, `description`, `status`, `started_at`, `completed_at`, `operator_name`) VALUES
(1, 1, 1, 'Level 1: Stator & Rotor Raw Material Sizing', 'Precision shaft turning, lamination punching, and coil bobbin prep', 'completed', '2026-11-22 08:30:00', '2026-11-22 17:00:00', 'Ramesh Jadhav'),
(2, 1, 2, 'Level 2: Automated Coil Winding & Insulation', 'Precision CNC 8-pole winding, slot cell insulation, and thermal class H varnish', 'completed', '2026-11-23 09:00:00', '2026-11-23 16:30:00', 'Mahesh Shinde'),
(3, 1, 3, 'Level 3: Magnet Mounting & Rotor Balancing', 'Neodymium N52 magnet bonding, dynamic balancing, and air-gap alignment', 'in_progress', '2026-11-24 09:30:00', NULL, 'Kiran More'),
(4, 1, 4, 'Level 4: Bearing Press-fit & Motor Housing Assembly', 'End-bell installation, precision bearing press, and shaft alignment', 'pending', NULL, NULL, NULL),
(5, 1, 5, 'Level 5: Full Load Testing, Burn-in & Packaging', 'Holding torque verification, insulation resistance test, laser engraving & packaging', 'pending', NULL, NULL, NULL);

-- QC Verification for Level 1 (Passed)
INSERT INTO `quality_inspections` (`id`, `work_order_id`, `stage_id`, `level_number`, `inspector_id`, `inspector_name`, `total_inspected`, `passed_qty`, `rejected_qty`, `inspection_date`, `qc_status`, `remarks`, `defect_reason`) VALUES
(1, 1, 1, 1, 4, 'Sunil Deshmukh (Senior QC)', 50, 50, 0, '2026-11-22 17:15:00', 'passed', 'Shaft dimensions and concentricity verified with digital micrometer. All within ±0.005mm tolerance.', NULL),
(2, 1, 2, 2, 4, 'Sunil Deshmukh (Senior QC)', 50, 48, 2, '2026-11-23 17:00:00', 'passed', '48 units passed high potential dielectric test (1500V). 2 units showed insulation breakdown and were segregated for scrapping/rewinding.', 'Insulation breakdown during 1500V Hi-Pot spark test');

-- Material Requisition for PO 2 (Demonstrating Shortfall Material Request to Accounts!)
-- PO 2 needs 20 Hydraulic Cylinders:
-- Needs 20 * 2 = 40 sets RM-SEAL-04 (Available in stock: 12 sets -> Shortfall: 28 sets!)
INSERT INTO `material_requisitions` (`id`, `requisition_number`, `po_id`, `requested_by`, `status`, `total_estimated_cost`, `remarks`) VALUES
(1, 'REQ-2026-301', 2, 3, 'pending_purchase', 13440.00, 'Material shortage detected during BOM stock lookup for Hydraulic Cylinder production. Immediate procurement required.');

INSERT INTO `material_requisition_items` (`requisition_id`, `raw_material_id`, `required_qty`, `available_qty`, `shortfall_qty`, `unit_cost`, `total_cost`, `status`) VALUES
(1, 4, 40.00, 12.00, 28.00, 480.00, 13440.00, 'pending');

-- Seed a completed past order with Dispatch, Customer Inspection, and Complaint Ticket to demonstrate Stages 10, 11, 12!
INSERT INTO `leads` (`id`, `lead_number`, `customer_id`, `title`, `requirement_details`, `estimated_value`, `source`, `status`, `remarks`, `assigned_to`, `created_by`, `approved_by`, `approved_at`, `created_at`) VALUES
(4, 'LEAD-2026-000-HIST', 1, 'Initial Pilot Batch of 10 Stepper Motors', 'Pilot batch order for evaluation.', 45000.00, 'Direct Inquiry', 'approved', 'Pilot batch approved.', 2, 2, 1, '2026-10-10 10:00:00', '2026-10-09 10:00:00');

INSERT INTO `quotations` (`id`, `quotation_number`, `lead_id`, `customer_id`, `revision_number`, `quotation_date`, `valid_until`, `subtotal`, `tax_amount`, `total_amount`, `terms_conditions`, `status`, `remarks`, `created_by`) VALUES
(3, 'QT-2026-0099', 4, 1, 1, '2026-10-10', '2026-11-10', 45000.00, 8100.00, 53100.00, 'Standard terms', 'approved', 'Approved', 2);

INSERT INTO `quotation_items` (`quotation_id`, `product_id`, `quantity`, `unit_price`, `tax_percent`, `total_price`) VALUES
(3, 1, 10.00, 4500.00, 18.00, 53100.00);

INSERT INTO `purchase_orders` (`id`, `po_number`, `customer_po_reference`, `quotation_id`, `customer_id`, `po_date`, `delivery_deadline`, `total_amount`, `payment_terms`, `status`, `notes`) VALUES
(3, 'PO-2026-4999', 'APEX/PILOT/101', 3, 1, '2026-10-12', '2026-11-05', 53100.00, '100% after client inspection', 'completed', 'Pilot batch delivered and inspected.');

INSERT INTO `purchase_order_items` (`po_id`, `product_id`, `quantity`, `unit_price`, `total_price`) VALUES
(3, 1, 10.00, 4500.00, 45000.00);

INSERT INTO `work_orders` (`id`, `work_order_number`, `po_id`, `product_id`, `target_quantity`, `completed_quantity`, `rejected_quantity`, `current_level`, `status`, `material_status`, `start_date`, `completion_date`) VALUES
(2, 'WO-2026-6999', 3, 1, 10, 10, 0, 5, 'completed', 'full', '2026-10-15', '2026-10-25');

INSERT INTO `manufacturing_stages` (`id`, `work_order_id`, `level_number`, `stage_name`, `description`, `status`, `started_at`, `completed_at`, `operator_name`) VALUES
(6, 2, 1, 'Level 1: Stator Sizing', 'Shaft & stator prep', 'completed', '2026-10-15 09:00:00', '2026-10-16 17:00:00', 'Ramesh Jadhav'),
(7, 2, 2, 'Level 2: Winding & Insulation', 'Coil winding', 'completed', '2026-10-17 09:00:00', '2026-10-18 17:00:00', 'Mahesh Shinde'),
(8, 2, 3, 'Level 3: Rotor Balancing', 'Magnet bonding and balancing', 'completed', '2026-10-19 09:00:00', '2026-10-20 17:00:00', 'Kiran More'),
(9, 2, 4, 'Level 4: Housing & Bearing', 'Final mechanical assembly', 'completed', '2026-10-21 09:00:00', '2026-10-22 17:00:00', 'Kiran More'),
(10, 2, 5, 'Level 5: Testing & Packaging', 'Full load burn-in and packaging', 'completed', '2026-10-23 09:00:00', '2026-10-24 17:00:00', 'Sunil Deshmukh');

INSERT INTO `quality_inspections` (`id`, `work_order_id`, `stage_id`, `level_number`, `inspector_id`, `inspector_name`, `total_inspected`, `passed_qty`, `rejected_qty`, `inspection_date`, `qc_status`, `remarks`, `defect_reason`) VALUES
(3, 2, 10, 5, 4, 'Sunil Deshmukh (Senior QC)', 10, 10, 0, '2026-10-24 18:00:00', 'passed', 'Final Level 5 testing cleared. Ready for dispatch.', NULL);

-- Dispatch for Completed Order 3
INSERT INTO `dispatches` (`id`, `dispatch_number`, `po_id`, `work_order_id`, `courier_id`, `tracking_number`, `dispatch_date`, `estimated_delivery_date`, `actual_delivery_date`, `total_packages`, `delivery_challan_no`, `vehicle_no`, `status`, `remarks`) VALUES
(1, 'DSP-2026-901', 3, 2, 1, 'BD-9988776655', '2026-10-26', '2026-10-28', '2026-10-28', 2, 'DC/2026/0441', 'MH-04-AZ-9981', 'delivered', 'Safely delivered to customer site on Oct 28.');

-- Customer Quality Inspection
INSERT INTO `customer_inspections` (`id`, `dispatch_id`, `po_id`, `customer_id`, `inspection_date`, `inspected_by_name`, `overall_status`, `remarks`) VALUES
(1, 1, 3, 1, '2026-10-29', 'David Miller', 'accepted_with_faults', '8 units in perfect condition and performing well. 2 units had abnormal vibration at high RPM.');

INSERT INTO `customer_inspection_items` (`customer_inspection_id`, `product_id`, `total_received`, `perfect_qty`, `faulty_qty`, `fault_description`, `condition_status`) VALUES
(1, 1, 10, 8, 2, '2 units produced excessive resonance and vibration above 1200 RPM.', 'faulty');

-- Complaint Ticket generated by customer for the 2 faulty items
INSERT INTO `complaint_tickets` (`id`, `ticket_number`, `customer_inspection_id`, `po_id`, `customer_id`, `title`, `issue_details`, `severity`, `return_material_status`, `status`, `resolution_notes`) VALUES
(1, 'TKT-2026-001', 1, 3, 1, 'Excessive vibration on 2 Stepper Motors', 'Customer reported high frequency vibration on 2 out of 10 motors during commissioning on packaging machine.', 'high', 'received_at_factory', 'resolved', 'Replacement dispatched under DC/2026/0488. Return batch inspected; rotor re-balanced.');

-- Customer released final payment after resolution!
INSERT INTO `payments` (`id`, `payment_number`, `po_id`, `quotation_id`, `customer_id`, `payment_date`, `amount`, `payment_method`, `transaction_reference`, `payment_type`, `status`, `notes`) VALUES
(3, 'PAY-2026-099', 3, 3, 1, '2026-11-02', 53100.00, 'bank_transfer', 'HDFC-NEFT-90021334', 'final', 'verified', 'Full settlement received following ticket resolution.');
