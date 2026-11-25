-- Database Migration: Line-item GST & PO Subtotal/Tax Breakdown
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER delivery_deadline,
  ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER subtotal;

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS tax_percent DECIMAL(5,2) NOT NULL DEFAULT 18.00 AFTER unit_price;
