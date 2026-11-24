-- database_migration_subproducts.sql
USE `manufacturing_erp`;

-- 1. Alter products table to add product_type, current_stock, reorder_level if not present
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = 'manufacturing_erp' 
  AND TABLE_NAME = 'products' 
  AND COLUMN_NAME = 'product_type';

SET @stmt = IF(@col_exists = 0, 
  'ALTER TABLE `products` ADD COLUMN `product_type` ENUM("finished_good", "sub_assembly") DEFAULT "finished_good" AFTER `category`, ADD COLUMN `current_stock` DECIMAL(12,2) DEFAULT 0.00 AFTER `unit_price`, ADD COLUMN `reorder_level` DECIMAL(12,2) DEFAULT 5.00 AFTER `current_stock`', 
  'SELECT "product_type already exists"'
);
PREPARE alter_prod FROM @stmt;
EXECUTE alter_prod;
DEALLOCATE PREPARE alter_prod;

-- 2. Create product_sub_assemblies table
CREATE TABLE IF NOT EXISTS `product_sub_assemblies` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `parent_product_id` INT NOT NULL,
    `sub_product_id` INT NOT NULL,
    `quantity_required` DECIMAL(12,4) NOT NULL DEFAULT 1.0000,
    `notes` VARCHAR(255) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`parent_product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`sub_product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3. Alter material_requisition_items to support sub_products
SET @col_item_type = 0;
SELECT COUNT(*) INTO @col_item_type 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = 'manufacturing_erp' 
  AND TABLE_NAME = 'material_requisition_items' 
  AND COLUMN_NAME = 'item_type';

SET @stmt_req = IF(@col_item_type = 0, 
  'ALTER TABLE `material_requisition_items` ADD COLUMN `item_type` ENUM("raw_material", "sub_product") DEFAULT "raw_material" AFTER `raw_material_id`, ADD COLUMN `sub_product_id` INT NULL AFTER `item_type`, MODIFY `raw_material_id` INT NULL', 
  'SELECT "item_type already exists"'
);
PREPARE alter_req FROM @stmt_req;
EXECUTE alter_req;
DEALLOCATE PREPARE alter_req;

-- 4. Insert Sub-Products / Sub-Assemblies for Smartphones & Industrial Motors
INSERT INTO `products` (`id`, `sku`, `name`, `description`, `category`, `product_type`, `uom`, `unit_price`, `current_stock`, `reorder_level`, `status`)
VALUES
(10, 'SUB-CAM-48M', '48MP Triple Ultra-HD Camera Module with OIS', 'High resolution primary + wide-angle + telephoto sensor assembly with optical image stabilization', 'Electronics / Optics', 'sub_assembly', 'Units', 3500.00, 15.00, 10.00, 'active'),
(11, 'SUB-SCR-67A', '6.7-inch Super AMOLED 120Hz Touch Display Screen', 'FHD+ curved AMOLED display panel with integrated capacitive touch and ambient light sensor', 'Electronics / Displays', 'sub_assembly', 'Units', 4800.00, 20.00, 10.00, 'active'),
(12, 'SUB-PCB-OCTA', 'Octa-Core 5G Motherboard Mainboard PCBA', 'Fully populated PCB with application processor, 12GB LPDDR5 RAM, 256GB UFS storage & 5G modem', 'Electronics / Circuitry', 'sub_assembly', 'Units', 9200.00, 8.00, 10.00, 'active'),
(13, 'SUB-BAT-5000', '5000mAh High-Density Polymer Battery Pack', 'Lithium-ion polymer battery with fast-charge BMS protection board & thermal sensor', 'Electronics / Power', 'sub_assembly', 'Units', 1800.00, 5.00, 10.00, 'active'),
(14, 'SUB-CHS-TITAN', 'CNC Titanium Alloy Frame & Ceramic Back Shell', 'Precision CNC aerospace-grade titanium frame with scratch-resistant nano-ceramic rear cover', 'Hardware / Chassis', 'sub_assembly', 'Units', 2600.00, 25.00, 10.00, 'active'),
(15, 'SUB-STA-34W', 'Stator Lamination & Copper Winding Assembly', 'Class H copper magnetic wire wound on silicon steel stator stack for NEMA 34 motor', 'Industrial / Electromechanical', 'sub_assembly', 'Units', 1200.00, 35.00, 15.00, 'active'),
(16, 'SUB-ROT-34S', 'Precision Balanced Rotor Shaft Assembly', 'Rare-earth NdFeB permanent magnets bonded to precision ground stainless steel rotor shaft', 'Industrial / Mechanical', 'sub_assembly', 'Units', 950.00, 18.00, 15.00, 'active'),
(17, 'SUB-ENC-OPT', 'High-Resolution Optical Encoder Assembly', '1000 CPR dual-channel optical rotary encoder with differential line driver output', 'Industrial / Sensors', 'sub_assembly', 'Units', 850.00, 40.00, 10.00, 'active')
ON DUPLICATE KEY UPDATE 
    `name` = VALUES(`name`),
    `product_type` = VALUES(`product_type`),
    `current_stock` = VALUES(`current_stock`),
    `unit_price` = VALUES(`unit_price`);

-- 5. Insert Smartphone End Product
INSERT INTO `products` (`id`, `sku`, `name`, `description`, `category`, `product_type`, `uom`, `unit_price`, `current_stock`, `reorder_level`, `status`)
VALUES
(3, 'FG-PHN-2026', 'Apex Edge 5G Smartphone (256GB Titanium)', 'Flagship enterprise smartphone featuring 6.7-inch AMOLED screen, 48MP camera, 5000mAh battery & titanium frame', 'Electronics / Consumer', 'finished_good', 'Units', 42000.00, 10.00, 5.00, 'active')
ON DUPLICATE KEY UPDATE 
    `name` = VALUES(`name`),
    `product_type` = VALUES(`product_type`),
    `unit_price` = VALUES(`unit_price`);

-- 6. Map Sub-Products to Smartphone (FG-PHN-2026 -> Parent ID 3)
DELETE FROM `product_sub_assemblies` WHERE `parent_product_id` IN (1, 3);

INSERT INTO `product_sub_assemblies` (`parent_product_id`, `sub_product_id`, `quantity_required`, `notes`)
VALUES
-- Smartphone Sub-Products:
(3, 10, 1.0000, '48MP Triple Ultra-HD Camera Module'),
(3, 11, 1.0000, '6.7-inch Super AMOLED 120Hz Touch Display Screen'),
(3, 12, 1.0000, 'Octa-Core 5G Motherboard Mainboard PCBA'),
(3, 13, 1.0000, '5000mAh High-Density Polymer Battery Pack'),
(3, 14, 1.0000, 'CNC Titanium Alloy Frame & Ceramic Back Shell'),
-- Stepper Motor Sub-Products (Parent ID 1):
(1, 15, 1.0000, 'Stator Lamination & Copper Winding Assembly'),
(1, 16, 1.0000, 'Precision Balanced Rotor Shaft Assembly'),
(1, 17, 1.0000, 'High-Resolution Optical Encoder Assembly');

-- 7. Add Smartphone Raw Materials & Consumables
INSERT INTO `raw_materials` (`id`, `sku`, `name`, `description`, `category`, `uom`, `current_stock`, `reorder_level`, `unit_cost`, `location`, `status`)
VALUES
(10, 'RM-GLS-01', 'Optical Grade Gorilla Glass Sheet 0.5mm', 'Drop and scratch resistant chemically strengthened display cover glass', 'Optics & Glass', 'Sheets', 45.00, 20.00, 450.00, 'Cleanroom Rack 01', 'active'),
(11, 'RM-THM-02', 'Conductive Thermal Graphite Sheet & Paste', 'Pyrolytic graphite heat dissipation sheet with copper vapor chamber paste', 'Chemical & Thermal', 'Sets', 120.00, 30.00, 120.00, 'Main Warehouse - Rack E', 'active'),
(12, 'RM-SCR-03', 'SMD Micro-Screws & Rubber Waterproof Gasket Kit', 'Torx T2 miniature screws with IP68 silicone sealing O-rings', 'Fasteners', 'Sets', 300.00, 50.00, 85.00, 'Main Warehouse - Bin 14', 'active'),
(13, 'RM-BOX-04', 'Retail Rigid Gift Box & Laser Seal Anti-Static Pouch', 'FSC certified embossed packaging with molded pulp tray & USB-C cable', 'Packaging', 'Sets', 80.00, 25.00, 180.00, 'Packaging Bay 3', 'active')
ON DUPLICATE KEY UPDATE 
    `name` = VALUES(`name`),
    `current_stock` = VALUES(`current_stock`),
    `unit_cost` = VALUES(`unit_cost`);

-- 8. Map Raw Materials for Smartphone BOM
DELETE FROM `product_boms` WHERE `product_id` = 3;
INSERT INTO `product_boms` (`product_id`, `raw_material_id`, `quantity_required`)
VALUES
(3, 10, 1.0000), -- 1 Gorilla glass sheet
(3, 11, 1.0000), -- 1 Thermal graphite kit
(3, 12, 1.0000), -- 1 Micro screws kit
(3, 13, 1.0000); -- 1 Retail packaging box

-- 9. Add Lead, Approved Quote & PO for 20 units Apex Edge 5G Smartphones
INSERT INTO `leads` (`id`, `lead_number`, `customer_id`, `title`, `requirement_details`, `estimated_value`, `source`, `status`, `remarks`, `assigned_to`, `created_by`, `approved_by`, `approved_at`)
VALUES
(5, 'LEAD-2026-PHN-01', 1, 'Enterprise Supply: 20 units Apex Edge 5G Smartphones (Titanium)', 'Procurement of 20 flagship smartphones for field engineers and executive team.', 840000.00, 'Direct Inquiry', 'approved', 'Commercial terms and specifications vetted. Approved for quotation.', 2, 2, 1, NOW())
ON DUPLICATE KEY UPDATE `status` = 'approved';

INSERT INTO `quotations` (`id`, `quotation_number`, `lead_id`, `customer_id`, `revision_number`, `quotation_date`, `valid_until`, `subtotal`, `tax_amount`, `total_amount`, `terms_conditions`, `status`, `remarks`, `created_by`)
VALUES
(4, 'QT-2026-005-R1', 5, 1, 1, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 840000.00, 151200.00, 991200.00, '1. 50% advance on PO confirmation.\n2. Delivery within 14 business days.\n3. 1 Year Enterprise Warranty with advance replacement.', 'approved', 'Approved commercial quote for 20 Smartphones.', 2)
ON DUPLICATE KEY UPDATE `status` = 'approved';

INSERT INTO `quotation_items` (`quotation_id`, `product_id`, `quantity`, `unit_price`, `tax_percent`, `total_price`)
VALUES
(4, 3, 20.00, 42000.00, 18.00, 991200.00)
ON DUPLICATE KEY UPDATE `quantity` = 20.00;

INSERT INTO `purchase_orders` (`id`, `po_number`, `customer_po_reference`, `quotation_id`, `customer_id`, `po_date`, `delivery_deadline`, `total_amount`, `status`, `notes`)
VALUES
(4, 'PO-2026-5004', 'APEX/SMARTPHONE/PO/991', 4, 1, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 15 DAY), 991200.00, 'verified', 'Apex Corporate Tower, Baner Tech Park, Pune 411045')
ON DUPLICATE KEY UPDATE `status` = 'verified';

INSERT INTO `purchase_order_items` (`po_id`, `product_id`, `quantity`, `unit_price`, `total_price`)
VALUES
(4, 3, 20.00, 42000.00, 840000.00)
ON DUPLICATE KEY UPDATE `quantity` = 20.00;
