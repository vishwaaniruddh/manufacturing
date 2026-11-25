<?php
// api/controllers/QuotationController.php

class QuotationController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
    }

    public function getAll() {
        $leadId = $_GET['lead_id'] ?? null;
        $sql = "
            SELECT q.*, l.lead_number, l.title as lead_title, c.company_name as customer_name,
                   (SELECT COUNT(*) FROM quotation_items qi WHERE qi.quotation_id = q.id) as item_count,
                   (SELECT COUNT(*) FROM purchase_orders po WHERE po.quotation_id = q.id) as po_count
            FROM quotations q
            JOIN leads l ON q.lead_id = l.id
            JOIN customers c ON q.customer_id = c.id
        ";
        $params = [];
        if ($leadId) {
            $sql .= " WHERE q.lead_id = ?";
            $params[] = $leadId;
        }
        $sql .= " ORDER BY q.id DESC";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        if (!empty($rows)) {
            $poStmt = $this->db->query("
                SELECT po.id, po.po_number, po.customer_po_reference, po.quotation_id, po.status, po.total_amount, q.lead_id
                FROM purchase_orders po
                JOIN quotations q ON po.quotation_id = q.id
                ORDER BY po.id DESC
            ");
            $posByQuote = [];
            $posByLead = [];
            foreach ($poStmt->fetchAll() as $po) {
                $entry = [
                    'id' => intval($po['id']),
                    'po_number' => $po['po_number'],
                    'customer_po_reference' => $po['customer_po_reference'],
                    'status' => $po['status'],
                    'total_amount' => floatval($po['total_amount'])
                ];
                $posByQuote[intval($po['quotation_id'])][] = $entry;
                $posByLead[intval($po['lead_id'])][] = $entry;
            }
            foreach ($rows as &$r) {
                $qId = intval($r['id']);
                $lId = intval($r['lead_id']);
                $r['linked_pos'] = $posByQuote[$qId] ?? [];
                $r['po_count'] = count($r['linked_pos']);
                $r['lead_linked_pos'] = $posByLead[$lId] ?? [];
                $r['lead_po_count'] = count($r['lead_linked_pos']);
            }
            unset($r);
        }

        Response::success("Quotations fetched", $rows);
    }

    private function fetchQuotationData($id) {
        $stmt = $this->db->prepare("
            SELECT q.*, l.lead_number, l.title as lead_title, c.company_name as customer_name, c.email as customer_email,
                   c.phone as customer_phone, c.gst_number as customer_gst, c.address as customer_address
            FROM quotations q
            JOIN leads l ON q.lead_id = l.id
            JOIN customers c ON q.customer_id = c.id
            WHERE q.id = ?
        ");
        $stmt->execute([$id]);
        $quotation = $stmt->fetch();

        if (!$quotation) {
            return null;
        }

        $iStmt = $this->db->prepare("
            SELECT qi.*, p.name as product_name, p.sku as product_sku, p.uom
            FROM quotation_items qi
            JOIN products p ON qi.product_id = p.id
            WHERE qi.quotation_id = ?
        ");
        $iStmt->execute([$id]);
        $quotation['items'] = $iStmt->fetchAll();

        $poStmt = $this->db->prepare("SELECT * FROM purchase_orders WHERE quotation_id = ?");
        $poStmt->execute([$id]);
        $quotation['purchase_orders'] = $poStmt->fetchAll();

        return $quotation;
    }

    public function getOne($id) {
        $quotation = $this->fetchQuotationData($id);
        if (!$quotation) {
            Response::error("Quotation not found", 404);
        }
        Response::success("Quotation details", $quotation);
    }

    public function create() {
        $b = Response::getBody();
        if (empty($b['lead_id']) || empty($b['items']) || !is_array($b['items'])) {
            Response::error("Lead ID and quotation items are required");
        }

        // Verify that the lead is approved
        $lStmt = $this->db->prepare("SELECT customer_id, status FROM leads WHERE id = ?");
        $lStmt->execute([$b['lead_id']]);
        $lead = $lStmt->fetch();

        if (!$lead) {
            Response::error("Invalid Lead ID");
        }
        if ($lead['status'] !== 'approved') {
            Response::error("Cannot create quotation: Lead status is '" . $lead['status'] . "'. Lead must be 'approved' first.");
        }

        // Determine revision number for this lead
        $rStmt = $this->db->prepare("SELECT MAX(revision_number) as max_rev FROM quotations WHERE lead_id = ?");
        $rStmt->execute([$b['lead_id']]);
        $revRow = $rStmt->fetch();
        $revisionNumber = ($revRow['max_rev'] ?? 0) + 1;

        $quotationNumber = 'QT-' . date('Y') . '-' . str_pad($b['lead_id'], 3, '0', STR_PAD_LEFT) . '-R' . $revisionNumber;
        $customerId = $b['customer_id'] ?? $lead['customer_id'];
        $quotationDate = $b['quotation_date'] ?? date('Y-m-d');
        $validUntil = $b['valid_until'] ?? date('Y-m-d', strtotime('+30 days'));

        $this->db->beginTransaction();
        try {
            // Calculate totals
            $subtotal = 0;
            $taxAmount = 0;
            foreach ($b['items'] as $item) {
                $qty = floatval($item['quantity'] ?? 1);
                $rate = floatval($item['unit_price'] ?? 0);
                $taxPct = floatval($item['tax_percent'] ?? 18);
                $lineTotal = $qty * $rate;
                $lineTax = $lineTotal * ($taxPct / 100);
                $subtotal += $lineTotal;
                $taxAmount += $lineTax;
            }
            $totalAmount = $subtotal + $taxAmount;

            $stmt = $this->db->prepare("
                INSERT INTO quotations (quotation_number, lead_id, customer_id, revision_number, quotation_date, valid_until,
                                       subtotal, tax_amount, total_amount, terms_conditions, status, remarks, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
            ");
            $stmt->execute([
                $quotationNumber,
                $b['lead_id'],
                $customerId,
                $revisionNumber,
                $quotationDate,
                $validUntil,
                $subtotal,
                $taxAmount,
                $totalAmount,
                $b['terms_conditions'] ?? "1. 50% advance on PO confirmation, balance prior to dispatch.\n2. Delivery time: 3 weeks.\n3. Standard 12 months warranty.",
                $b['remarks'] ?? null,
                Response::resolveUserId($this->db, $b['created_by'] ?? null)
            ]);
            $quotationId = $this->db->lastInsertId();

            // Insert quotation items
            $itemStmt = $this->db->prepare("
                INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, tax_percent, total_price)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            foreach ($b['items'] as $item) {
                $qty = floatval($item['quantity'] ?? 1);
                $rate = floatval($item['unit_price'] ?? 0);
                $taxPct = floatval($item['tax_percent'] ?? 18);
                $lineTotalWithTax = ($qty * $rate) * (1 + $taxPct / 100);

                $itemStmt->execute([
                    $quotationId,
                    intval($item['product_id']),
                    $qty,
                    $rate,
                    $taxPct,
                    $lineTotalWithTax
                ]);
            }

            $this->db->commit();
            Audit::log($this->db, 'quotations', 'create', 'Quotation', $quotationNumber, "Created Revision {$revisionNumber} quotation for Lead ID {$b['lead_id']}. Grand Total: ₹{$totalAmount}");

            Response::success("Quotation created successfully", [
                "id" => $quotationId,
                "quotation_number" => $quotationNumber,
                "revision_number" => $revisionNumber,
                "total_amount" => $totalAmount
            ], 201);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to create quotation: " . $e->getMessage());
        }
    }

    public function update($id) {
        $b = Response::getBody();
        $this->db->beginTransaction();
        try {
            $subtotal = 0;
            $taxAmount = 0;
            if (!empty($b['items']) && is_array($b['items'])) {
                // Delete existing items and recalculate
                $this->db->prepare("DELETE FROM quotation_items WHERE quotation_id = ?")->execute([$id]);

                $itemStmt = $this->db->prepare("
                    INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, tax_percent, total_price)
                    VALUES (?, ?, ?, ?, ?, ?)
                ");
                foreach ($b['items'] as $item) {
                    $qty = floatval($item['quantity'] ?? 1);
                    $rate = floatval($item['unit_price'] ?? 0);
                    $taxPct = floatval($item['tax_percent'] ?? 18);
                    $lineTotal = $qty * $rate;
                    $lineTax = $lineTotal * ($taxPct / 100);
                    $lineTotalWithTax = $lineTotal + $lineTax;

                    $subtotal += $lineTotal;
                    $taxAmount += $lineTax;

                    $itemStmt->execute([
                        $id,
                        intval($item['product_id']),
                        $qty,
                        $rate,
                        $taxPct,
                        $lineTotalWithTax
                    ]);
                }
            } else {
                // Keep existing subtotal & tax
                $q = $this->db->query("SELECT subtotal, tax_amount FROM quotations WHERE id = $id")->fetch();
                $subtotal = $q['subtotal'];
                $taxAmount = $q['tax_amount'];
            }
            $totalAmount = $subtotal + $taxAmount;

            $stmt = $this->db->prepare("
                UPDATE quotations
                SET valid_until = ?, subtotal = ?, tax_amount = ?, total_amount = ?, terms_conditions = ?, remarks = ?, status = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $b['valid_until'] ?? date('Y-m-d', strtotime('+30 days')),
                $subtotal,
                $taxAmount,
                $totalAmount,
                $b['terms_conditions'] ?? null,
                $b['remarks'] ?? null,
                $b['status'] ?? 'draft',
                $id
            ]);

            $this->db->commit();
            Response::success("Quotation updated successfully");
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to update quotation: " . $e->getMessage());
        }
    }

    public function approve($id) {
        $stmt = $this->db->prepare("UPDATE quotations SET status = 'approved' WHERE id = ?");
        $stmt->execute([$id]);
        Audit::log($this->db, 'quotations', 'approve', 'Quotation', (string)$id, "Quotation ID {$id} approved by client.");
        Response::success("Quotation approved. Ready for Customer Purchase Order creation.");
    }

    public function reject($id) {
        $b = Response::getBody();
        $remarks = $b['remarks'] ?? 'Quotation rejected by client';
        $stmt = $this->db->prepare("UPDATE quotations SET status = 'rejected', remarks = ? WHERE id = ?");
        $stmt->execute([$remarks, $id]);
        Audit::log($this->db, 'quotations', 'reject', 'Quotation', (string)$id, "Quotation ID {$id} rejected. Remarks: {$remarks}");
        Response::success("Quotation marked as rejected");
    }

    public function delete($id) {
        $stmt = $this->db->prepare("DELETE FROM quotations WHERE id = ?");
        $stmt->execute([$id]);
        Response::success("Quotation deleted");
    }

    public function downloadPdf($id) {
        $q = $this->fetchQuotationData($id);
        if (!$q) {
            Response::error("Quotation not found", 404);
        }

        $autoload = dirname(__DIR__) . '/vendor/autoload.php';
        if (!file_exists($autoload)) {
            Response::error("mPDF library not installed", 500);
        }
        require_once $autoload;

        $logoPath = dirname(__DIR__, 2) . '/client/public/sar-logo.png';
        $logoHtml = file_exists($logoPath)
            ? '<img src="' . $logoPath . '" style="height:42px; width:auto;" />'
            : '<div style="font-size:18px;font-weight:bold;color:#0f172a;">SAR Software Solutions Pvt. Ltd.</div>';

        $statusColors = [
            'approved' => ['#065f46', '#d1fae5'],
            'draft'    => ['#92400e', '#fef3c7'],
            'rejected' => ['#991b1b', '#fee2e2'],
        ];
        $stColor = $statusColors[$q['status']] ?? ['#334155', '#f1f5f9'];

        $itemsHtml = '';
        foreach ($q['items'] as $idx => $it) {
            $bg = ($idx % 2 === 1) ? '#f8fafc' : '#ffffff';
            $qty = number_format(floatval($it['quantity']), 2);
            $rate = number_format(floatval($it['unit_price']), 2);
            $taxPct = number_format(floatval($it['tax_percent'] ?? 18), 0);
            $lineSub = number_format(floatval($it['quantity']) * floatval($it['unit_price']), 2);
            $lineTotal = number_format(floatval($it['total_price']), 2);
            $itemsHtml .= '
                <tr style="background-color:' . $bg . ';">
                    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;">' . ($idx + 1) . '</td>
                    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">
                        <div style="font-weight:bold;color:#0f172a;">' . htmlspecialchars($it['product_name']) . '</div>
                        <div style="font-size:9px;color:#64748b;font-family:monospace;">SKU: ' . htmlspecialchars($it['product_sku']) . '</div>
                    </td>
                    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">' . $qty . ' ' . htmlspecialchars($it['uom']) . '</td>
                    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">&#8377;' . $rate . '</td>
                    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">' . $taxPct . '%</td>
                    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">&#8377;' . $lineSub . '</td>
                    <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;color:#0f172a;">&#8377;' . $lineTotal . '</td>
                </tr>';
        }

        $termsHtml = nl2br(htmlspecialchars($q['terms_conditions'] ?: 'Standard commercial terms apply.'));
        $remarksHtml = !empty($q['remarks'])
            ? '<div style="margin-top:10px;padding:8px 10px;background:#f8fafc;border-left:3px solid #0f172a;font-size:10px;color:#475569;"><strong>Remarks:</strong> ' . nl2br(htmlspecialchars($q['remarks'])) . '</div>'
            : '';

        $html = '
        <style>
            body { font-family: dejavusans, sans-serif; font-size: 10.5px; color: #1e293b; }
            .card { border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; background: #f8fafc; }
            .label { font-size: 8.5px; font-weight: bold; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 4px; }
        </style>

        <table width="100%" cellspacing="0" cellpadding="0" style="border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:14px;">
            <tr>
                <td width="55%" valign="top">
                    ' . $logoHtml . '
                    <div style="font-size:9px;color:#475569;margin-top:4px;">
                        SAR Manufacturing ERP &bull; Simple | Accurate | Reliable
                    </div>
                </td>
                <td width="45%" valign="top" align="right">
                    <div style="font-size:16px;font-weight:bold;color:#0f172a;letter-spacing:0.5px;">COMMERCIAL QUOTATION</div>
                    <div style="font-size:12px;font-weight:bold;color:#0369a1;margin-top:2px;">' . htmlspecialchars($q['quotation_number']) . ' (Rev #' . intval($q['revision_number']) . ')</div>
                    <div style="font-size:9.5px;color:#475569;margin-top:4px;">
                        Issue Date: <strong>' . htmlspecialchars($q['quotation_date']) . '</strong> &nbsp;|&nbsp;
                        Valid Until: <strong>' . htmlspecialchars($q['valid_until']) . '</strong>
                    </div>
                    <div style="margin-top:5px;">
                        <span style="background:' . $stColor[1] . ';color:' . $stColor[0] . ';padding:2px 8px;font-size:9px;font-weight:bold;text-transform:uppercase;border-radius:3px;">
                            Status: ' . htmlspecialchars($q['status']) . '
                        </span>
                    </div>
                </td>
            </tr>
        </table>

        <table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:14px;">
            <tr>
                <td width="49%" valign="top" class="card">
                    <div class="label">Quotation For (Customer)</div>
                    <div style="font-size:12px;font-weight:bold;color:#0f172a;">' . htmlspecialchars($q['customer_name']) . '</div>
                    <div style="font-size:9.5px;color:#475569;margin-top:3px;">' . htmlspecialchars($q['customer_address'] ?: '—') . '</div>
                    <div style="font-size:9.5px;color:#334155;margin-top:3px;">GSTIN: <strong>' . htmlspecialchars($q['customer_gst'] ?: 'N/A') . '</strong></div>
                    <div style="font-size:9.5px;color:#475569;margin-top:2px;">' . htmlspecialchars($q['customer_email']) . ' &bull; ' . htmlspecialchars($q['customer_phone']) . '</div>
                </td>
                <td width="2%"></td>
                <td width="49%" valign="top" class="card">
                    <div class="label">Reference &amp; Inquiry Details</div>
                    <div style="font-size:11px;font-weight:bold;color:#0f172a;">Lead: ' . htmlspecialchars($q['lead_number']) . '</div>
                    <div style="font-size:10px;color:#334155;margin-top:3px;">' . htmlspecialchars($q['lead_title']) . '</div>
                    <div style="font-size:9.5px;color:#475569;margin-top:4px;">Revision Number: <strong>R' . intval($q['revision_number']) . '</strong></div>
                    <div style="font-size:9.5px;color:#475569;margin-top:2px;">Currency: <strong>INR (&#8377;)</strong></div>
                </td>
            </tr>
        </table>

        <table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #cbd5e1;border-collapse:collapse;margin-bottom:14px;">
            <thead>
                <tr style="background:#0f172a;color:#ffffff;">
                    <th style="padding:8px 10px;text-align:center;font-size:9.5px;width:30px;">#</th>
                    <th style="padding:8px 10px;text-align:left;font-size:9.5px;">Product &amp; SKU</th>
                    <th style="padding:8px 10px;text-align:center;font-size:9.5px;">Qty</th>
                    <th style="padding:8px 10px;text-align:right;font-size:9.5px;">Unit Rate</th>
                    <th style="padding:8px 10px;text-align:center;font-size:9.5px;">GST</th>
                    <th style="padding:8px 10px;text-align:right;font-size:9.5px;">Taxable</th>
                    <th style="padding:8px 10px;text-align:right;font-size:9.5px;">Total (inc. Tax)</th>
                </tr>
            </thead>
            <tbody>
                ' . $itemsHtml . '
            </tbody>
        </table>

        <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
                <td width="58%" valign="top" style="padding-right:14px;">
                    <div class="card">
                        <div class="label">Commercial Terms &amp; Conditions</div>
                        <div style="font-size:9.5px;color:#334155;line-height:1.5;">' . $termsHtml . '</div>
                    </div>
                    ' . $remarksHtml . '
                </td>
                <td width="42%" valign="top">
                    <table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #cbd5e1;border-collapse:collapse;">
                        <tr>
                            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#475569;">Subtotal</td>
                            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;">&#8377;' . number_format(floatval($q['subtotal']), 2) . '</td>
                        </tr>
                        <tr>
                            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#475569;">Total GST / Tax</td>
                            <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;">&#8377;' . number_format(floatval($q['tax_amount']), 2) . '</td>
                        </tr>
                        <tr style="background:#0f172a;color:#ffffff;">
                            <td style="padding:9px 10px;font-weight:bold;font-size:11px;">GRAND TOTAL</td>
                            <td style="padding:9px 10px;text-align:right;font-weight:bold;font-size:12px;">&#8377;' . number_format(floatval($q['total_amount']), 2) . '</td>
                        </tr>
                    </table>

                    <div style="margin-top:26px;text-align:right;font-size:9.5px;color:#475569;">
                        <div style="border-top:1px solid #94a3b8;display:inline-block;padding-top:4px;min-width:170px;text-align:center;">
                            Authorized Signatory<br/>
                            <strong>SAR Software Solutions Pvt. Ltd.</strong>
                        </div>
                    </div>
                </td>
            </tr>
        </table>';

        $mpdf = new \Mpdf\Mpdf([
            'mode' => 'utf-8',
            'format' => 'A4',
            'margin_left' => 14,
            'margin_right' => 14,
            'margin_top' => 14,
            'margin_bottom' => 18,
        ]);
        $mpdf->SetTitle('Quotation ' . $q['quotation_number']);
        $mpdf->SetAuthor('SAR Software Solutions Pvt. Ltd.');
        $mpdf->SetHTMLFooter('
            <div style="border-top:1px solid #e2e8f0;padding-top:5px;font-size:8.5px;color:#64748b;display:flex;justify-content:space-between;">
                <span>SAR Manufacturing ERP &bull; Generated on ' . date('Y-m-d H:i') . '</span>
                <span style="float:right;">Page {PAGENO} of {nbpg}</span>
            </div>
        ');
        $mpdf->WriteHTML($html);
        $mpdf->Output($q['quotation_number'] . '.pdf', \Mpdf\Output\Destination::DOWNLOAD);
        exit;
    }

    public function downloadExcel($id) {
        $q = $this->fetchQuotationData($id);
        if (!$q) {
            Response::error("Quotation not found", 404);
        }

        $filename = $q['quotation_number'] . '.xls';
        header('Content-Type: application/vnd.ms-excel; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: max-age=0');

        echo "\xEF\xBB\xBF";
        echo '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>';
        echo '<table border="1" cellspacing="0" cellpadding="5">';
        echo '<tr><th colspan="7" style="background:#0f172a;color:#ffffff;font-size:14px;">SAR Manufacturing ERP - Commercial Quotation</th></tr>';
        echo '<tr><td><strong>Quotation #</strong></td><td>' . htmlspecialchars($q['quotation_number']) . '</td><td><strong>Revision</strong></td><td>R' . intval($q['revision_number']) . '</td><td><strong>Status</strong></td><td colspan="2">' . strtoupper(htmlspecialchars($q['status'])) . '</td></tr>';
        echo '<tr><td><strong>Issue Date</strong></td><td>' . htmlspecialchars($q['quotation_date']) . '</td><td><strong>Valid Until</strong></td><td>' . htmlspecialchars($q['valid_until']) . '</td><td><strong>Lead #</strong></td><td colspan="2">' . htmlspecialchars($q['lead_number']) . '</td></tr>';
        echo '<tr><td><strong>Customer</strong></td><td colspan="2">' . htmlspecialchars($q['customer_name']) . '</td><td><strong>GSTIN</strong></td><td>' . htmlspecialchars($q['customer_gst'] ?: 'N/A') . '</td><td><strong>Phone</strong></td><td>' . htmlspecialchars($q['customer_phone']) . '</td></tr>';
        echo '<tr><td colspan="7"></td></tr>';
        echo '<tr style="background:#e2e8f0;font-weight:bold;"><th>#</th><th>SKU</th><th>Product Name</th><th>Qty</th><th>UOM</th><th>Unit Rate (INR)</th><th>Tax % / Total (inc. Tax)</th></tr>';
        foreach ($q['items'] as $idx => $it) {
            echo '<tr>';
            echo '<td>' . ($idx + 1) . '</td>';
            echo '<td>' . htmlspecialchars($it['product_sku']) . '</td>';
            echo '<td>' . htmlspecialchars($it['product_name']) . '</td>';
            echo '<td>' . floatval($it['quantity']) . '</td>';
            echo '<td>' . htmlspecialchars($it['uom']) . '</td>';
            echo '<td>' . floatval($it['unit_price']) . '</td>';
            echo '<td>' . floatval($it['tax_percent'] ?? 18) . '% / ' . floatval($it['total_price']) . '</td>';
            echo '</tr>';
        }
        echo '<tr><td colspan="5"></td><td><strong>Subtotal</strong></td><td>' . floatval($q['subtotal']) . '</td></tr>';
        echo '<tr><td colspan="5"></td><td><strong>Tax (GST)</strong></td><td>' . floatval($q['tax_amount']) . '</td></tr>';
        echo '<tr><td colspan="5"></td><td><strong>Grand Total</strong></td><td><strong>' . floatval($q['total_amount']) . '</strong></td></tr>';
        echo '<tr><td colspan="7"><strong>Terms &amp; Conditions:</strong> ' . htmlspecialchars($q['terms_conditions'] ?: '') . '</td></tr>';
        echo '</table></body></html>';
        exit;
    }
}
