# ForgeFlow — Manufacturing Lifecycle ERP (POC & MVP)

An end-to-end manufacturing lifecycle management system designed for **POC and MVP validation**, built using **React + Vite + Tailwind CSS**, a **PHP REST API Backend**, and **MySQL (MariaDB)**.

---

## 1. Executive Summary & Architecture

ForgeFlow manages the complete journey from initial client inquiry to final payment reconciliation and order closure across **12 discrete, audited stages**:

```
[1. Lead Inward] ──► [2. Lead Review & Approval] ──► [3. Commercial Quotation (Revisions)]
                                                                    │
[6. Material Requisition] ◄── [7. BOM Material Lookup] ◄── [4. Customer PO (Sales PO)]
            │                              │                        │
            ▼                              ▼                        ▼
[Accounts Fulfillment] ──► [8. 5-Level Manufacturing] ──► [5. Advance Payment Tracking]
                                   │
                                   ▼
                         [9. Stage QC Check (L1..L5)]
                                   │
                                   ▼
                         [10. Dispatch & Logistics]
                                   │
                                   ▼
                         [11. Client QC & Complaint RMA]
                                   │
                                   ▼
                         [12. Final Payment & Order Closure]
```

### Technology Stack
- **Frontend**: React 18, Vite 8, Tailwind CSS 3, Lucide React icons.
- **Backend**: Native PHP 8.5 REST API, PDO with prepared statements, modular controllers, JSON responses, CORS support.
- **Database**: MySQL 10.4 (MariaDB), UTF-8 mb4, InnoDB with foreign keys and cascade rules.
- **Memory & Token Management**: **Graphify** knowledge graph (`graphify-out/`) indexing 593 nodes, 1818 edges, and 36 clustered communities.

---

## 2. The 12 Manufacturing Lifecycle Stages

### Stage 1: Lead Inward
- Register prospective inquiries with lead numbering (`LEAD-YYYY-XXXXX`), customer reference, product requirement specifications, estimated order value, and source channel (Direct Inquiry, Exhibition, Website, Referral).

### Stage 2: Lead Approval / Rejection
- Commercial review workflow. Leads can be marked **Approved** (eligible for quotation creation) or **Rejected** (with mandatory decision remarks for auditability).

### Stage 3: Quotation Management (Multi-Revision Support)
- Generate official commercial proposals against approved leads.
- **Multiple Quotations per Lead**: Each proposal tracks revision numbers (`QT-YYYY-001-R1`, `QT-YYYY-001-R2`, etc.).
- Line items calculator: Product selection, quantities, unit prices, GST/Tax percentage, automatic subtotal, and tax calculation.
- Terms & Conditions and validity dates.
- Status management: Draft, Sent, Approved, Rejected.

### Stage 4: Customer Purchase Order (Sales PO)
- When client accepts a quotation, import / record the customer's official Purchase Order (`PO-YYYY-XXXXX`, Customer PO Ref).
- Captures committed delivery deadlines, payment terms, and line item confirmations.

### Stage 5: Inward Client Payment Tracking (Advance)
- Complete payment ledger tracking received client funds against Quotations and POs.
- Supports Advance, Milestone, and Final release payments.
- Records payment date, payment method (Bank Transfer NEFT/RTGS, Cheque, UPI, Credit Card, Cash), bank UTR / transaction reference number, and real-time balance due calculations.

### Stage 7: Manufacturing Inventory Lookup & MRP
- Bill of Materials (BOM) explosion against finished goods:
  - **a) Fully Found in Inventory**: All raw materials have `Current Stock >= Required`. Work order marked **Eligible for Manufacturing immediately**!
  - **b) Partially Found**: Sourced items detected; missing items calculated with exact shortfall quantity and estimated procurement cost.
  - **c) Not Found**: Zero stock available; full procurement cycle initiated.
- **Material Purchase Requisition**: 1-click requisition generation routed to the Accounts & Procurement team.
- **Accounts Fulfillment**: Accounts marks materials purchased -> automatically increments inventory stock and unlocks production floor.

### Stage 8: 5-Level Sequential Manufacturing Floor
Manufacturing jobs execute across **5 sequential stages**:
- **Level 1**: Material Prep, Cutting, CNC Sizing & Surface Decontamination.
- **Level 2**: Primary Component Fabrication, CNC Turning & Coil Winding.
- **Level 3**: Sub-Assembly, Thermal Bonding, Magnet Alignment & Dynamic Balancing.
- **Level 4**: Final Mechanical Assembly, Bearing Press-Fit & Sensor/PCB Integration.
- **Level 5**: Electrical Load Testing, Burn-in Benchmarking, Laser Marking & Packaging.

### Stage 9: Mandatory Quality Control (QC) at Each Level
- Every level requires formal physical inspection before advancing to the subsequent level.
- Quality inspector logs:
  - Total batch inspected
  - Passed units
  - Rejected units & failure mode / defect categorization (e.g. concentricity runout, insulation breakdown)
  - Inspector identity and timestamp
  - Decision: Passed, Failed, or Rework Required.
- Level cannot advance until current stage QC verification is passed. Passing Level 5 marks manufacturing 100% complete and unlocks dispatch.

### Stage 10: Dispatch & Courier Logistics
- Prepare official Delivery Challan (`DC/YYYY/XXXX`).
- Assign logistics carrier (BlueDart, DHL, Delhivery, FedEx, etc.), vehicle number, package count, and live Air Waybill tracking number.
- Update tracking status: Ready for Dispatch -> Dispatched -> In Transit -> Delivered.

### Stage 11: Customer Quality Inspection & RMA Complaint Tickets
- Client receives delivery and performs inward quality inspection:
  - Unit-by-unit classification: **Perfect** vs. **Faulty / Defective**.
  - If faulty units are detected, the system auto-generates a **Complaint Ticket & Return Material Authorization (RMA)** with issue details and severity.
  - Factory manages RMA replacement dispatch and logs resolution.

### Stage 12: Final Payment Release & Order Closure
- Upon client satisfaction, customer releases remaining milestone / final settlement payment.
- Balance due reconciles to ₹0.00 and order lifecycle is marked Completed / Closed.

---

## 3. Database Schema Overview (30 Tables)

| Domain | Tables | Description |
|---|---|---|
| **Security, RBAC & Activity Logs** | `roles`, `users`, `permissions`, `role_permissions`, `audit_logs`, `user_logins` | 8 operational roles, user credentials, granular module permission matrix, immutable chronological audit trails for every lifecycle step, and login/logout session activity log. |
| **Masters** | `countries`, `states`, `cities`, `couriers`, `customers`, `vendors` | Global geography, logistics carriers, client directories, supplier masters. |
| **Products & Inventory** | `products`, `raw_materials`, `product_boms` | Finished goods, raw material inventory with reorder thresholds, and recipe BOM mappings. |
| **Sales & Commercial** | `leads`, `quotations`, `quotation_items`, `purchase_orders`, `purchase_order_items`, `payments` | Inquiries, multi-revision pricing proposals, customer POs, and payment transaction ledger. |
| **Manufacturing & MRP** | `material_requisitions`, `material_requisition_items`, `work_orders`, `manufacturing_stages` | Shortfall requests, Accounts fulfillment, 5-level stages and operators. |
| **Quality & Assurance** | `quality_inspections` | Inspection gates per level, pass/fail counts, inspector remarks, defect causes. |
| **Logistics & Dispatch** | `dispatches` | Delivery challans, courier tracking numbers, shipping status. |
| **Customer Portal & RMA** | `customer_inspections`, `customer_inspection_items`, `complaint_tickets` | Inward client inspection, unit condition tagging, RMA complaint ticketing. |

---

## 4. REST API Endpoint Reference

All endpoints return uniform JSON envelopes:
```json
{
  "success": true,
  "message": "Action completed successfully",
  "data": { ... }
}
```

Base URL: `http://localhost/manufacturing/api/index.php?route=<endpoint>` (or `http://localhost/manufacturing/api/<endpoint>`)

### Core API Routes
- **Dashboard**: `GET dashboard`
- **Authentication & Roles**:
  - `POST auth/login`
  - `POST auth/switch_role`
  - `GET auth/roles`
- **Users & RBAC**:
  - `GET users`
  - `POST users`
  - `PUT users/{id}`
  - `DELETE users/{id}`
  - `GET users/matrix`
  - `POST users/matrix` (Bulk update role-permission matrix)
- **Leads**:
  - `GET leads` (Optional: `?status=pending|approved|rejected`)
  - `GET leads/{id}`
  - `POST leads`
  - `PUT leads/{id}`
  - `POST leads/approve/{id}`
  - `POST leads/reject/{id}`
- **Quotations**:
  - `GET quotations` (Optional: `?lead_id={id}`)
  - `GET quotations/{id}`
  - `POST quotations` (Accepts items array, calculates taxes)
  - `POST quotations/approve/{id}`
  - `POST quotations/reject/{id}`
  - `DELETE quotations/{id}`
- **Purchase Orders**:
  - `GET purchase_orders`
  - `GET purchase_orders/{id}`
  - `POST purchase_orders` (Created from approved quotation)
- **Payments**:
  - `GET payments` (Optional: `?po_id={id}`)
  - `POST payments` (Advance, milestone, final)
  - `GET payments/summary/{po_id}`
- **Manufacturing & MRP**:
  - `POST manufacturing/check_materials` (Real-time BOM stock explosion)
  - `POST manufacturing/requisitions` (Send shortfall request to Accounts)
  - `GET manufacturing/requisitions`
  - `POST manufacturing/requisitions/{id}/fulfill` (Accounts buys & adds stock)
  - `GET manufacturing/work_orders`
  - `GET manufacturing/work_orders/{id}`
  - `POST manufacturing/work_orders` (Reserves stock & initializes 5 stages)
- **Quality Control**:
  - `GET qc/inspections`
  - `POST qc/verify` (Records inspection, advances level if passed)
- **Dispatch**:
  - `GET dispatch`
  - `POST dispatch` (Creates shipment after Level 5 QC)
  - `PUT dispatch/status/{id}`
- **Customer Portal**:
  - `POST customer/inspect` (Records inward check & auto-generates tickets)
  - `GET customer/complaints`
  - `PUT customer/complaints/{id}`
  - `POST customer/release_final_payment`
- **Masters**:
  - `GET|POST|PUT|DELETE masters/customers`
  - `GET|POST|PUT|DELETE masters/products`
  - `GET|POST|PUT|DELETE masters/raw_materials`
  - `POST masters/raw_materials/add_stock`
  - `GET|POST|PUT|DELETE masters/couriers`
  - `GET|POST masters/countries`, `states`, `cities`

---

## 5. Role-Based Access Control (RBAC) Matrix

The system includes 8 operational roles with an interactive, editable permissions matrix:

1. **Administrator (`admin`)**: Complete unrestricted system access, master configuration, user setup, and matrix management.
2. **Sales Executive (`sales`)**: Leads creation, lead review, quotation generation, and customer PO import.
3. **Production Manager (`manufacturing`)**: Inventory lookup, BOM checks, material requisitions, and work order floor dispatch.
4. **Quality Control Inspector (`qc`)**: Level 1 to Level 5 inspection execution, tolerance verification, defect logging, and stage approval/rejection.
5. **Store / Inventory Head (`inventory`)**: Raw materials catalog, stock receipt, warehouse bin assignment, and inventory audits.
6. **Accounts & Procurement (`accounts`)**: Payment verification, customer payment recording, and purchase requisition fulfillment.
7. **Logistics & Dispatch (`dispatch`)**: Finished goods packaging, delivery challans, and courier tracking updates.
8. **Client / Customer Representative (`customer`)**: Customer portal access, inward goods quality inspection, RMA ticket logging, and final settlement release.

---

## 6. Token & Memory Management with Graphify

To maintain zero memory loss and instant context retrieval across complex development iterations, **Graphify** has been run over the entire codebase:

- **Outputs Directory**: `graphify-out/`
- **Knowledge Graph**: `graphify-out/graph.json` (593 AST/semantic nodes, 1,818 relationship edges, 36 detected architectural communities).
- **Interactive Visual Navigator**: `graphify-out/graph.html`
- **Graph Audit Report**: `graphify-out/GRAPH_REPORT.md`

### Helpful Graphify Queries
```powershell
# Explain any node or architectural module
python -m graphify explain "ManufacturingController"

# Query the codebase with token-capped traversal
python -m graphify query "How does Level 1 to Level 5 QC verification advance the work order?" --budget 1500

# Re-extract and update graph after code modifications
python -m graphify update .
```

---

## 7. How to Run & Test the Application

### 1. Database Setup
The database `manufacturing_erp` is already imported into MySQL (XAMPP).
If re-importing is needed:
```powershell
mysql -u root -e "source c:/xampp/htdocs/manufacturing/database.sql"
```

### 2. Access via Apache (Production/Host Mode)
Open your web browser and navigate directly to:
**`http://localhost/manufacturing/`**

### 3. Access via Vite Dev Server (Hot-Reload Mode)
```powershell
cd c:\xampp\htdocs\manufacturing\client
npm run dev
```
Open **`http://localhost:5173/`**
