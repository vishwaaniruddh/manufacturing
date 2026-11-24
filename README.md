# manufacturing

POC & MVP for Full-Lifecycle Manufacturing ERP System with Multi-Level BOM and 5-Stage Floor Quality Control.

## Key Features
1. **Lead Management**: Lead capture, review, qualification, and approval/rejection workflows.
2. **Multi-Revision Quotations**: Generate, compare revisions, and approve commercial quotations.
3. **Customer Purchase Orders**: Convert approved quotes to formal POs with financial tracking.
4. **Advance & Balance Payment Tracking**: Track payment receipts, partial allocations, and settlement milestones.
5. **Multi-Level BOM & Material Requisition**: Multi-tier component breakdown (Finished Goods & Sub-Assemblies) with real-time warehouse inventory shortfall calculation and Accounts procurement fulfillment.
6. **5-Stage Sequential Manufacturing**: Work Order lifecycle tracking through 5 progressive production stages.
7. **Per-Product Row QC Verification**: Detailed quality inspection modal and stage cards for individual product & sub-assembly row validation with passed/rejected counters and defect logs.
8. **Dispatch & Delivery Challan**: Logistics shipping, tracking integration, and delivery challan issuance.
9. **Customer Inward QC & Faulty RMA Ticketing**: Client portal inward inspection with automated ticket creation for defective units.
10. **Role-Based Access Control (RBAC)**: Strict role-scoped permissions (Sales Executive, Operations Manager, QC Inspector, Administrator).
11. **Comprehensive Audit Logs & Session Activity**: Detailed event tracking and user login/session logs.

## Tech Stack
- **Frontend**: React + Vite + Tailwind CSS + Lucide Icons (ShadCN style)
- **Backend**: PHP REST API (MVC architecture, PDO)
- **Database**: MySQL / MariaDB (`manufacturing_erp`)
- **Testing**: End-to-End lifecycle test suite (`tests/e2e_lifecycle_test.php`)
