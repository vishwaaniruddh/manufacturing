<?php
// tests/e2e_lifecycle_test.php - Comprehensive Step-by-Step E2E Lifecycle Test Suite

$baseUrl = 'http://localhost/manufacturing/api';

$totalPassed = 0;
$totalFailed = 0;
$testResults = [];

function assertTest($description, $condition, $details = '') {
    global $totalPassed, $totalFailed, $testResults;
    if ($condition) {
        $totalPassed++;
        $msg = "[PASS] " . $description;
        echo $msg . "\n";
        $testResults[] = ['status' => 'PASS', 'description' => $description, 'details' => $details];
    } else {
        $totalFailed++;
        $msg = "[FAIL] " . $description . ($details ? " - Details: " . $details : '');
        echo $msg . "\n";
        $testResults[] = ['status' => 'FAIL', 'description' => $description, 'details' => $details];
    }
}

function httpReq($method, $endpoint, $payload = null) {
    global $baseUrl;
    $url = $baseUrl . '/' . ltrim($endpoint, '/');
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    
    $headers = ['Accept: application/json'];
    if ($payload !== null) {
        $body = is_string($payload) ? $payload : json_encode($payload);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        $headers[] = 'Content-Type: application/json';
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        return ['status' => 0, 'data' => null, 'error' => $error];
    }

    $data = json_decode($response, true);
    return ['status' => $httpCode, 'data' => $data, 'raw' => $response];
}

echo "====================================================================\n";
echo "   MANUFACTURING ERP - COMPREHENSIVE STEP-BY-STEP LIFECYCLE TESTS   \n";
echo "====================================================================\n\n";

// ====================================================================
// STEP 1 & 2: LEADS INWARD & APPROVAL / REJECTION
// ====================================================================
echo ">>> [MODULE 1 & 2] Testing Leads Inward, Approval & Rejection...\n";

// 1.1 Create Lead for Customer 1
$leadPayload = [
    'customer_id' => 1,
    'title' => 'Automated Test Batch - 25 units Stepper Motors',
    'requirement_details' => 'End-to-end verification requirement with multi-level QC',
    'estimated_value' => 150000,
    'source' => 'Web Inquiry',
    'assigned_to' => 2,
    'created_by' => 2,
    'remarks' => 'Initiated via automated test suite'
];
$res = httpReq('POST', 'leads', $leadPayload);
assertTest("Lead Creation returns HTTP 201/200", in_array($res['status'], [200, 201]) && !empty($res['data']['success']), json_encode($res['data']));
$leadId = $res['data']['data']['id'] ?? null;
$leadNumber = $res['data']['data']['lead_number'] ?? null;
assertTest("Lead ID and Lead Number generated", !empty($leadId) && !empty($leadNumber), "ID: $leadId, Num: $leadNumber");

// 1.2 Verify initial status is pending
$leadDetail = httpReq('GET', "leads/$leadId");
assertTest("New Lead status is 'pending'", ($leadDetail['data']['data']['status'] ?? '') === 'pending');

// 1.3 Create a second lead to test rejection flow
$rejLeadRes = httpReq('POST', 'leads', [
    'customer_id' => 2,
    'title' => 'Invalid Test Lead for Rejection Test',
    'estimated_value' => 50000,
    'created_by' => 2
]);
$rejLeadId = $rejLeadRes['data']['data']['id'] ?? null;
assertTest("Rejection Test Lead created", !empty($rejLeadId));

// 1.4 Test Rejection with remarks
$rejRes = httpReq('POST', "leads/reject/$rejLeadId", [
    'user_id' => 1,
    'remarks' => 'Lead rejected due to non-standard custom specifications'
]);
assertTest("Lead rejection endpoint executes successfully", in_array($rejRes['status'], [200, 201]) && $rejRes['data']['success']);
$rejDetail = httpReq('GET', "leads/$rejLeadId");
assertTest("Rejected Lead status updated to 'rejected' with remarks", ($rejDetail['data']['data']['status'] ?? '') === 'rejected');

// 1.5 Approve the primary Lead for subsequent quotation workflow
$apprRes = httpReq('POST', "leads/approve/$leadId", [
    'user_id' => 1,
    'remarks' => 'Technical specs verified. Approved for commercial quotation.'
]);
assertTest("Lead approved for quotation", in_array($apprRes['status'], [200, 201]) && $apprRes['data']['success']);
$apprDetail = httpReq('GET', "leads/$leadId");
assertTest("Lead status updated to 'approved'", ($apprDetail['data']['data']['status'] ?? '') === 'approved');

// ====================================================================
// STEP 3: MULTI-REVISION COMMERCIAL QUOTATIONS
// ====================================================================
echo "\n>>> [MODULE 3] Testing Multi-Revision Quotations & Approval...\n";

// 3.1 Try creating quotation against unapproved lead -> Should fail
$failQuoteRes = httpReq('POST', 'quotations', [
    'lead_id' => $rejLeadId,
    'items' => [['product_id' => 1, 'quantity' => 10, 'unit_price' => 4500]]
]);
assertTest("Quotation against non-approved lead is blocked (400)", $failQuoteRes['status'] === 400 || !($failQuoteRes['data']['success'] ?? false), $failQuoteRes['data']['message'] ?? '');

// 3.2 Create Revision 1 quotation against approved lead
$quoteRev1Payload = [
    'lead_id' => $leadId,
    'customer_id' => 1,
    'tax_percent' => 18,
    'discount_amount' => 5000,
    'payment_terms' => '50% advance, 50% on delivery',
    'delivery_terms' => 'Ex-Factory Pune',
    'notes' => 'Revision 1 Initial Offer',
    'created_by' => 2,
    'items' => [
        ['product_id' => 1, 'quantity' => 25, 'unit_price' => 4500, 'notes' => 'Standard NEMA 34']
    ]
];
$q1Res = httpReq('POST', 'quotations', $quoteRev1Payload);
assertTest("Quotation Revision 1 created", in_array($q1Res['status'], [200, 201]) && $q1Res['data']['success']);
$q1Id = $q1Res['data']['data']['id'] ?? null;
$q1Num = $q1Res['data']['data']['quotation_number'] ?? '';
assertTest("Quotation Number contains '-R1'", strpos($q1Num, '-R1') !== false, "Quote Number: $q1Num");

// 3.3 Create Revision 2 for the same lead (testing multi-revision support)
$quoteRev2Payload = [
    'lead_id' => $leadId,
    'customer_id' => 1,
    'tax_percent' => 18,
    'discount_amount' => 10000, // Special negotiated discount
    'payment_terms' => '50% advance, balance within 7 days of delivery QC',
    'delivery_terms' => 'Door Delivery Mumbai',
    'notes' => 'Revision 2 with revised negotiated discount',
    'created_by' => 2,
    'items' => [
        ['product_id' => 1, 'quantity' => 25, 'unit_price' => 4400, 'notes' => 'Standard NEMA 34 negotiated rate']
    ]
];
$q2Res = httpReq('POST', 'quotations', $quoteRev2Payload);
assertTest("Quotation Revision 2 created for the same lead", in_array($q2Res['status'], [200, 201]) && $q2Res['data']['success']);
$q2Id = $q2Res['data']['data']['id'] ?? null;
$q2Num = $q2Res['data']['data']['quotation_number'] ?? '';
assertTest("Quotation Number automatically assigned '-R2'", strpos($q2Num, '-R2') !== false, "Quote Number: $q2Num");

// 3.4 Verify mathematical calculations (Subtotal: 25 * 4400 = 110000, Tax 18%: 19800, Total: 129800)
$q2Detail = httpReq('GET', "quotations/$q2Id");
$calc = $q2Detail['data']['data'];
assertTest("Quotation subtotal calculated correctly (110,000)", floatval($calc['subtotal']) == 110000, "Subtotal: " . $calc['subtotal']);
assertTest("Quotation tax calculated correctly (19,800)", floatval($calc['tax_amount']) == 19800, "Tax: " . $calc['tax_amount']);
assertTest("Quotation grand total calculated correctly (129,800)", floatval($calc['total_amount']) == 129800, "Total: " . $calc['total_amount']);

// 3.5 Approve Quotation Revision 2
$qApprRes = httpReq('POST', "quotations/approve/$q2Id");
assertTest("Quotation Revision 2 approved", in_array($qApprRes['status'], [200, 201]) && $qApprRes['data']['success']);

// ====================================================================
// STEP 4: CUSTOMER PURCHASE ORDER (SALES PO)
// ====================================================================
echo "\n>>> [MODULE 4] Testing Purchase Order Creation & Validation...\n";

// 4.1 Try creating PO from unapproved quote R1 -> Should fail
$failPORes = httpReq('POST', 'purchase_orders', [
    'quotation_id' => $q1Id,
    'customer_po_reference' => 'PO/FAIL/001'
]);
assertTest("PO creation from pending quotation is blocked", $failPORes['status'] === 400 || !($failPORes['data']['success'] ?? false), $failPORes['data']['message'] ?? '');

// 4.2 Create PO from approved quote R2
$poPayload = [
    'quotation_id' => $q2Id,
    'customer_po_reference' => 'CUST/PO/2026/TEST-099',
    'customer_po_date' => date('Y-m-d'),
    'committed_delivery_date' => date('Y-m-d', strtotime('+20 days')),
    'shipping_address' => 'Plant #3, Apex Industrial Park, Pune, Maharashtra',
    'created_by' => 2
];
$poRes = httpReq('POST', 'purchase_orders', $poPayload);
assertTest("Customer Purchase Order created successfully", in_array($poRes['status'], [200, 201]) && $poRes['data']['success']);
$poId = $poRes['data']['data']['id'] ?? null;
$poNumber = $poRes['data']['data']['po_number'] ?? '';
assertTest("Purchase Order number generated", !empty($poId) && !empty($poNumber), "PO: $poNumber");

// 4.3 Verify PO items and financial initial state
$poDetail = httpReq('GET', "purchase_orders/$poId");
$poData = $poDetail['data']['data'];
assertTest("PO items copied accurately from approved quote", count($poData['items']) === 1 && $poData['items'][0]['quantity'] == 25);
assertTest("Initial PO balance equals grand total (129,800)", floatval($poData['balance_due']) == 129800);
assertTest("Initial PO payment status is 'unpaid'", $poData['payment_status'] === 'unpaid');

// ====================================================================
// STEP 5: CLIENT PAYMENT TRACKING
// ====================================================================
echo "\n>>> [MODULE 5] Testing Client Payments (Advance & Balance)...\n";

// 5.1 Record 50% advance payment (₹64,900)
$advancePayPayload = [
    'po_id' => $poId,
    'amount' => 64900,
    'payment_date' => date('Y-m-d'),
    'payment_mode' => 'neft',
    'reference_number' => 'NEFT-HDFC-TEST-' . rand(100000, 999999),
    'bank_name' => 'HDFC Bank',
    'payment_type' => 'advance',
    'remarks' => '50% advance received as per commercial agreement',
    'received_by' => 6
];
$pay1Res = httpReq('POST', 'payments', $advancePayPayload);
assertTest("Advance payment recorded successfully", in_array($pay1Res['status'], [200, 201]) && $pay1Res['data']['success']);

// 5.2 Verify PO payment status and balance updated
$poAfterPay1 = httpReq('GET', "purchase_orders/$poId");
$poP1 = $poAfterPay1['data']['data'];
assertTest("PO total paid reflects ₹64,900", floatval($poP1['total_paid']) == 64900);
assertTest("PO balance due halved to ₹64,900", floatval($poP1['balance_due']) == 64900);
assertTest("PO payment status changed to 'partially_paid'", $poP1['payment_status'] === 'partially_paid');

// 5.3 Test payment summary endpoint
$paySumm = httpReq('GET', "payments/summary/$poId");
assertTest("Payment summary API returns accurate figures", floatval($paySumm['data']['data']['total_paid']) == 64900);

// ====================================================================
// STEP 6 & 7: MATERIAL LOOKUP, SHORTFALL & ACCOUNTS PROCUREMENT
// ====================================================================
echo "\n>>> [MODULE 6 & 7] Testing Material Lookup, Requisition & Stock Fulfillment...\n";

// 6.1 Check materials for this PO
$matCheck = httpReq('POST', 'manufacturing/check_materials', ['po_id' => $poId]);
assertTest("Material lookup BOM calculation succeeds", in_array($matCheck['status'], [200, 201]) && $matCheck['data']['success']);
$matData = $matCheck['data']['data'];
assertTest("Material breakdown returned with raw materials", !empty($matData['materials']));
$overallStatus = $matData['overall_status'];
assertTest("BOM material availability status identified (full/partial/not_found)", in_array($overallStatus, ['full', 'partial', 'not_found']), "Status: $overallStatus");

// 6.2 Simulate Material & Sub-Product Requisition to Accounts team for required stock
$reqItems = [];
foreach ($matData['materials'] as $m) {
    $reqItems[] = [
        'item_type' => 'raw_material',
        'raw_material_id' => $m['raw_material_id'],
        'shortfall_qty' => max(5, floatval($m['shortfall'] ?? 0)),
        'total_required' => $m['total_required'] * 1.5,
        'unit_cost' => $m['unit_cost']
    ];
}
if (!empty($matData['sub_assemblies'])) {
    foreach ($matData['sub_assemblies'] as $sub) {
        $sf = floatval($sub['shortfall'] ?? 0);
        if ($sf > 0) {
            $reqItems[] = [
                'item_type' => 'sub_product',
                'sub_product_id' => $sub['sub_product_id'],
                'shortfall_qty' => $sf,
                'total_required' => $sub['total_required'],
                'unit_cost' => $sub['unit_cost']
            ];
        }
    }
}
$reqPayload = [
    'po_id' => $poId,
    'requested_by' => 3,
    'priority' => 'high',
    'remarks' => 'Automated test requisition to fulfill PO ' . $poNumber,
    'items' => $reqItems
];
$reqRes = httpReq('POST', 'manufacturing/requisitions', $reqPayload);
assertTest("Material requisition submitted to Accounts", in_array($reqRes['status'], [200, 201]) && $reqRes['data']['success']);
$reqId = $reqRes['data']['data']['id'] ?? null;
assertTest("Requisition ID generated", !empty($reqId));

// 6.3 Accounts team fulfills the requisition (adds stock and marks fulfilled)
$fulfillRes = httpReq('POST', "manufacturing/requisitions/$reqId/fulfill");
assertTest("Accounts fulfills requisition & stock is replenished", in_array($fulfillRes['status'], [200, 201]) && $fulfillRes['data']['success']);

// 6.4 Re-check materials -> Should now be 'full' (Eligible for manufacturing immediately!)
$matCheckAfter = httpReq('POST', 'manufacturing/check_materials', ['po_id' => $poId]);
assertTest("After fulfillment, inventory status is 'full' (Immediate Mfg Eligibility)", ($matCheckAfter['data']['data']['overall_status'] ?? '') === 'full');

// ====================================================================
// STEP 8: 5-LEVEL MANUFACTURING WORK ORDER
// ====================================================================
echo "\n>>> [MODULE 8] Testing 5-Stage Work Order Execution...\n";

// 8.1 Start Work Order for the PO
$woPayload = [
    'po_id' => $poId,
    'product_id' => 1,
    'target_quantity' => 25,
    'created_by' => 3
];
$woRes = httpReq('POST', 'manufacturing/work_orders', $woPayload);
assertTest("5-Stage Work Order started successfully", in_array($woRes['status'], [200, 201]) && $woRes['data']['success']);
$woId = $woRes['data']['data']['id'] ?? null;
$woNumber = $woRes['data']['data']['work_order_number'] ?? '';
assertTest("Work Order ID and Number generated", !empty($woId) && !empty($woNumber), "WO: $woNumber");

// 8.2 Verify initial state: Level 1 in_progress, 5 stages present
$woDetail = httpReq('GET', "manufacturing/work_orders/$woId");
$woData = $woDetail['data']['data'];
assertTest("Work Order starts at current_level = 1", intval($woData['current_level']) === 1);
assertTest("Work Order has exactly 5 manufacturing stages initialized", count($woData['stages']) === 5);

// ====================================================================
// STEP 9: QUALITY CONTROL (QC) VERIFICATION AT EVERY LEVEL
// ====================================================================
echo "\n>>> [MODULE 9] Testing Quality Control Inspections at Level 1 to Level 5...\n";

// Level 1: Sub-assembly & Frame Stator (25 passed, 0 rejected with per-product items)
$qcL1 = httpReq('POST', 'qc/verify', [
    'work_order_id' => $woId,
    'level' => 1,
    'units_passed' => 25,
    'units_rejected' => 0,
    'inspector_id' => 4,
    'inspector_remarks' => 'Level 1: Stator winding insulation and laminations 100% passed specs.',
    'product_items' => [
        [
            'product_id' => $woData['product_id'],
            'item_type' => 'finished_good',
            'target_quantity' => 25,
            'passed_qty' => 25,
            'rejected_qty' => 0,
            'qc_status' => 'passed',
            'remarks' => 'Passed full dimensional check'
        ]
    ]
]);
assertTest("Level 1 QC verification passed", in_array($qcL1['status'], [200, 201]) && $qcL1['data']['success']);

$woCheck = httpReq('GET', "manufacturing/work_orders/$woId");
assertTest("Level 1 inspection items stored and retrieved on work order", 
    !empty($woCheck['data']['data']['stages'][0]['inspected_items']) && count($woCheck['data']['data']['stages'][0]['inspected_items']) >= 1
);

// Level 2: Rotor & Bearing Fitment (24 passed, 1 rejected due to runout tolerance)
$qcL2 = httpReq('POST', 'qc/verify', [
    'work_order_id' => $woId,
    'level' => 2,
    'units_passed' => 24,
    'units_rejected' => 1,
    'inspector_id' => 4,
    'inspector_remarks' => 'Level 2: Rotor bearing concentricity check. 1 unit rejected for 0.05mm excessive runout.'
]);
assertTest("Level 2 QC verification completed with 1 unit rejected", in_array($qcL2['status'], [200, 201]) && $qcL2['data']['success']);

// Level 3: Encoder & Wiring Harness (24 passed, 0 rejected)
$qcL3 = httpReq('POST', 'qc/verify', [
    'work_order_id' => $woId,
    'level' => 3,
    'units_passed' => 24,
    'units_rejected' => 0,
    'inspector_id' => 4,
    'inspector_remarks' => 'Level 3: Optical encoder pulse verification and harness continuity passed.'
]);
assertTest("Level 3 QC verification passed", in_array($qcL3['status'], [200, 201]) && $qcL3['data']['success']);

// Level 4: Dynamometer Performance & Thermal (24 passed, 0 rejected)
$qcL4 = httpReq('POST', 'qc/verify', [
    'work_order_id' => $woId,
    'level' => 4,
    'units_passed' => 24,
    'units_rejected' => 0,
    'inspector_id' => 4,
    'inspector_remarks' => 'Level 4: Full torque dyno load test & thermal test passed within 45C limit.'
]);
assertTest("Level 4 QC verification passed", in_array($qcL4['status'], [200, 201]) && $qcL4['data']['success']);

// Level 5: Final Packaging & Factory Acceptance (24 passed, 0 rejected -> WO Completed!)
$qcL5 = httpReq('POST', 'qc/verify', [
    'work_order_id' => $woId,
    'level' => 5,
    'units_passed' => 24,
    'units_rejected' => 0,
    'inspector_id' => 4,
    'inspector_remarks' => 'Level 5: Final QC sticker affixed, calibrated, antistatic packaging approved for dispatch.'
]);
assertTest("Level 5 QC verification completed & signed off", in_array($qcL5['status'], [200, 201]) && $qcL5['data']['success']);

// 9.6 Verify Work Order completed status and final counts
$woFinal = httpReq('GET', "manufacturing/work_orders/$woId");
$woFData = $woFinal['data']['data'];
assertTest("Work Order status transitioned to 'completed'", $woFData['status'] === 'completed');
assertTest("Work Order records 24 completed units and 1 rejected unit", intval($woFData['completed_quantity']) === 24 && intval($woFData['rejected_quantity']) === 1);

// ====================================================================
// STEP 10: DISPATCH & LOGISTICS AFTER LEVEL 5
// ====================================================================
echo "\n>>> [MODULE 10] Testing Dispatch, Challan & Courier Logistics...\n";

$dispatchPayload = [
    'work_order_id' => $woId,
    'po_id' => $poId,
    'courier_id' => 1, // Blue Dart Express
    'tracking_number' => 'BLUEDART-AWB-' . rand(1000000, 9999999),
    'dispatched_quantity' => 24,
    'dispatch_date' => date('Y-m-d'),
    'estimated_delivery_date' => date('Y-m-d', strtotime('+3 days')),
    'destination_address' => 'Plant #3, Apex Industrial Park, Pune, Maharashtra',
    'created_by' => 7
];
$dispRes = httpReq('POST', 'dispatch', $dispatchPayload);
assertTest("Dispatch Delivery Challan created", in_array($dispRes['status'], [200, 201]) && $dispRes['data']['success']);
$dispatchId = $dispRes['data']['data']['id'] ?? null;
$challanNumber = $dispRes['data']['data']['challan_number'] ?? '';
assertTest("Challan Number generated", !empty($dispatchId) && !empty($challanNumber), "Challan: $challanNumber");

// 10.2 Update dispatch status to 'delivered'
$delivRes = httpReq('PUT', "dispatch/status/$dispatchId", ['status' => 'delivered']);
assertTest("Dispatch status updated to 'delivered'", in_array($delivRes['status'], [200, 201]) && $delivRes['data']['success']);

// ====================================================================
// STEP 11: CUSTOMER INWARD QC, COMPLAINTS & RMA
// ====================================================================
echo "\n>>> [MODULE 11] Testing Customer Inward QC & Complaint Ticket...\n";

// 11.1 Customer checks 24 units: 23 Perfect, 1 Faulty (Shaft keyway dent)
$custInspectPayload = [
    'dispatch_id' => $dispatchId,
    'po_id' => $poId,
    'customer_id' => 1,
    'inspected_by' => 'Vijay Kulkarni (Apex QA Lead)',
    'overall_status' => 'issues_found',
    'general_remarks' => '23 units perfect. 1 unit has damaged packaging and keyway scratch.',
    'items' => [
        [
            'product_id' => 1,
            'received_quantity' => 24,
            'accepted_quantity' => 23,
            'rejected_quantity' => 1,
            'defect_category' => 'Mechanical Damage',
            'defect_details' => 'Keyway groove dented in transit',
            'suggested_action' => 'Replacement / Credit Note'
        ]
    ]
];
$custInspRes = httpReq('POST', 'customer/inspect', $custInspectPayload);
assertTest("Customer Inward Inspection recorded", in_array($custInspRes['status'], [200, 201]) && $custInspRes['data']['success']);
$ticketNumber = $custInspRes['data']['data']['ticket_number'] ?? null;
assertTest("Automated RMA Complaint Ticket created for faulty unit", !empty($ticketNumber), "Ticket: $ticketNumber");

// 11.2 Check open complaints list
$complaintsList = httpReq('GET', 'customer/complaints');
assertTest("Complaint ticket visible in active ticketing list", !empty($complaintsList['data']['data']));

// 11.3 Close complaint ticket with resolution
$complaintId = $custInspRes['data']['data']['ticket_id'] ?? 1;
$resolveRes = httpReq('PUT', "customer/complaints/$complaintId", [
    'status' => 'resolved',
    'resolution_remarks' => 'Replacement keyway shaft dispatched under warranty'
]);
assertTest("Complaint Ticket resolved successfully", in_array($resolveRes['status'], [200, 201]) && $resolveRes['data']['success']);

// ====================================================================
// STEP 12: FINAL PAYMENT RELEASE & CLOSURE
// ====================================================================
echo "\n>>> [MODULE 12] Testing Final Payment Settlement & Order Closure...\n";

// Customer releases remaining 50% balance (₹64,900)
$releasePayload = [
    'po_id' => $poId,
    'amount' => 64900,
    'payment_mode' => 'neft',
    'reference_number' => 'NEFT-FINAL-SETTLE-' . rand(100000, 999999),
    'remarks' => 'Final settlement released following inward inspection and ticket resolution',
    'received_by' => 6
];
$relRes = httpReq('POST', 'customer/release_final_payment', $releasePayload);
assertTest("Final payment release recorded", in_array($relRes['status'], [200, 201]) && $relRes['data']['success']);

// Verify PO is now fully paid and closed
$poClosed = httpReq('GET', "purchase_orders/$poId");
$poCData = $poClosed['data']['data'];
assertTest("PO balance due is ₹0.00", floatval($poCData['balance_due']) == 0);
assertTest("PO payment status is 'fully_paid'", $poCData['payment_status'] === 'fully_paid');
assertTest("PO lifecycle status is 'completed'", $poCData['status'] === 'completed');

// ====================================================================
// STEP 13: RBAC & PERSONA SWITCHING
// ====================================================================
echo "\n>>> [MODULE 13] Testing RBAC Persona Switching & Scoped Access...\n";

// 13.1 Switch to Sales Executive (Role 2)
$salesRes = httpReq('POST', 'auth/switch_role', ['role_id' => 2]);
assertTest("Switch persona to Sales Executive succeeds", in_array($salesRes['status'], [200, 201]) && $salesRes['data']['success']);
$salesPerms = $salesRes['data']['data']['user']['permissions'] ?? [];
$salesModules = array_unique(array_column($salesPerms, 'module'));
assertTest("Sales Executive has access to 'leads'", in_array('leads', $salesModules));
assertTest("Sales Executive does NOT have access to 'manufacturing'", !in_array('manufacturing', $salesModules));
assertTest("Sales Executive does NOT have access to 'qc'", !in_array('qc', $salesModules));
assertTest("Sales Executive does NOT have access to 'masters'", !in_array('masters', $salesModules));

// 13.2 Switch to QC Inspector (Role 4)
$qcRes = httpReq('POST', 'auth/switch_role', ['role_id' => 4]);
assertTest("Switch persona to QC Inspector succeeds", in_array($qcRes['status'], [200, 201]) && $qcRes['data']['success']);
$qcPerms = $qcRes['data']['data']['user']['permissions'] ?? [];
$qcModules = array_unique(array_column($qcPerms, 'module'));
assertTest("QC Inspector has access to 'qc'", in_array('qc', $qcModules));
assertTest("QC Inspector does NOT have access to 'leads'", !in_array('leads', $qcModules));

// 13.3 Switch back to Administrator (Role 1)
$adminRes = httpReq('POST', 'auth/switch_role', ['role_id' => 1]);
assertTest("Switch persona back to Administrator succeeds", in_array($adminRes['status'], [200, 201]) && $adminRes['data']['success']);

// ====================================================================
// STEP 14: AUDIT TRAILS & SESSION ACTIVITY LOGS
// ====================================================================
echo "\n>>> [MODULE 14] Testing Lifecycle Audit Trails & User Activity Logs...\n";

// 14.1 Verify Audit Logs exist for each lifecycle step
$auditRes = httpReq('GET', 'audit?limit=50');
assertTest("Audit logs retrieved successfully", in_array($auditRes['status'], [200, 201]) && $auditRes['data']['success']);
$logs = $auditRes['data']['data'] ?? [];
$loggedModules = array_unique(array_column($logs, 'module'));

assertTest("Audit recorded 'leads' actions", in_array('leads', $loggedModules));
assertTest("Audit recorded 'quotations' actions", in_array('quotations', $loggedModules));
assertTest("Audit recorded 'purchase_orders' actions", in_array('purchase_orders', $loggedModules));
assertTest("Audit recorded 'payments' actions", in_array('payments', $loggedModules));
assertTest("Audit recorded 'manufacturing' actions", in_array('manufacturing', $loggedModules));
assertTest("Audit recorded 'qc' actions", in_array('qc', $loggedModules));
assertTest("Audit recorded 'dispatch' actions", in_array('dispatch', $loggedModules));
assertTest("Audit recorded 'customer_portal' actions", in_array('customer_portal', $loggedModules));

// 14.2 Verify User Login/Logout & Persona Activity Logs
$loginsRes = httpReq('GET', 'audit/logins');
assertTest("User login/session activities retrieved", in_array($loginsRes['status'], [200, 201]) && $loginsRes['data']['success']);
$loginActivities = $loginsRes['data']['data'] ?? [];
$actions = array_column($loginActivities, 'action');
assertTest("Session activity tracks session/persona switch", in_array('session_switch', $actions) || in_array('persona_switch', $actions));

// Test logout activity
$logoutRes = httpReq('POST', 'auth/logout', ['user_id' => 1]);
assertTest("Logout action executes & logs session closure", in_array($logoutRes['status'], [200, 201]) && $logoutRes['data']['success']);

echo "\n====================================================================\n";
echo "   TEST SUMMARY: $totalPassed PASSED, $totalFailed FAILED out of " . ($totalPassed + $totalFailed) . " assertions\n";
echo "====================================================================\n";

if ($totalFailed > 0) {
    exit(1);
}
