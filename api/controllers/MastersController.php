<?php
// api/controllers/MastersController.php

class MastersController {
    private $db;

    public function __construct($pdo) {
        $this->db = $pdo;
    }

    // 1. COUNTRIES
    public function getCountries() {
        $stmt = $this->db->query("SELECT * FROM countries ORDER BY name ASC");
        Response::success("Countries fetched", $stmt->fetchAll());
    }

    public function createCountry() {
        $b = Response::getBody();
        if (empty($b['name']) || empty($b['code'])) {
            Response::error("Name and code are required");
        }
        $stmt = $this->db->prepare("INSERT INTO countries (name, code, phone_code, status) VALUES (?, ?, ?, ?)");
        $stmt->execute([$b['name'], strtoupper($b['code']), $b['phone_code'] ?? null, $b['status'] ?? 'active']);
        Response::success("Country created", ["id" => $this->db->lastInsertId()], 201);
    }

    public function updateCountry($id) {
        $b = Response::getBody();
        $stmt = $this->db->prepare("UPDATE countries SET name = ?, code = ?, phone_code = ?, status = ? WHERE id = ?");
        $stmt->execute([$b['name'], strtoupper($b['code']), $b['phone_code'] ?? null, $b['status'] ?? 'active', $id]);
        Response::success("Country updated");
    }

    public function deleteCountry($id) {
        $stmt = $this->db->prepare("DELETE FROM countries WHERE id = ?");
        $stmt->execute([$id]);
        Response::success("Country deleted");
    }

    // 2. STATES
    public function getStates() {
        $countryId = $_GET['country_id'] ?? null;
        $search = trim($_GET['search'] ?? '');
        $sql = "
            SELECT s.*, c.name as country_name 
            FROM states s 
            JOIN countries c ON s.country_id = c.id 
            WHERE 1=1
        ";
        $params = [];
        if (!empty($countryId)) {
            $sql .= " AND s.country_id = ?";
            $params[] = intval($countryId);
        }
        if ($search !== '') {
            $sql .= " AND (s.name LIKE ? OR c.name LIKE ?)";
            $params[] = "%{$search}%";
            $params[] = "%{$search}%";
        }
        $sql .= " ORDER BY s.name ASC";
        if (empty($countryId) && $search === '') {
            $sql .= " LIMIT 1000";
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        Response::success("States fetched", $stmt->fetchAll());
    }

    public function createState() {
        $b = Response::getBody();
        if (empty($b['name']) || empty($b['country_id'])) {
            Response::error("State name and Country ID are required");
        }
        $stmt = $this->db->prepare("INSERT INTO states (country_id, name, code, status) VALUES (?, ?, ?, ?)");
        $stmt->execute([$b['country_id'], $b['name'], $b['code'] ?? null, $b['status'] ?? 'active']);
        Response::success("State created", ["id" => $this->db->lastInsertId()], 201);
    }

    public function updateState($id) {
        $b = Response::getBody();
        $stmt = $this->db->prepare("UPDATE states SET country_id = ?, name = ?, code = ?, status = ? WHERE id = ?");
        $stmt->execute([$b['country_id'], $b['name'], $b['code'] ?? null, $b['status'] ?? 'active', $id]);
        Response::success("State updated");
    }

    public function deleteState($id) {
        $stmt = $this->db->prepare("DELETE FROM states WHERE id = ?");
        $stmt->execute([$id]);
        Response::success("State deleted");
    }

    // 3. CITIES
    public function getCities() {
        $stateId = $_GET['state_id'] ?? null;
        $countryId = $_GET['country_id'] ?? null;
        $search = trim($_GET['search'] ?? '');
        $sql = "
            SELECT ct.*, st.name as state_name, st.country_id, co.name as country_name 
            FROM cities ct 
            JOIN states st ON ct.state_id = st.id 
            JOIN countries co ON st.country_id = co.id 
            WHERE 1=1
        ";
        $params = [];
        if (!empty($stateId)) {
            $sql .= " AND ct.state_id = ?";
            $params[] = intval($stateId);
        }
        if (!empty($countryId)) {
            $sql .= " AND st.country_id = ?";
            $params[] = intval($countryId);
        }
        if ($search !== '') {
            $sql .= " AND (ct.name LIKE ? OR st.name LIKE ? OR co.name LIKE ?)";
            $params[] = "%{$search}%";
            $params[] = "%{$search}%";
            $params[] = "%{$search}%";
        }
        $sql .= " ORDER BY ct.name ASC";
        if (empty($stateId) && $search === '') {
            $sql .= " LIMIT 500";
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        Response::success("Cities fetched", $stmt->fetchAll());
    }

    public function createCity() {
        $b = Response::getBody();
        if (empty($b['name']) || empty($b['state_id'])) {
            Response::error("City name and State ID are required");
        }
        $stmt = $this->db->prepare("INSERT INTO cities (state_id, name, status) VALUES (?, ?, ?)");
        $stmt->execute([$b['state_id'], $b['name'], $b['status'] ?? 'active']);
        Response::success("City created", ["id" => $this->db->lastInsertId()], 201);
    }

    public function updateCity($id) {
        $b = Response::getBody();
        $stmt = $this->db->prepare("UPDATE cities SET state_id = ?, name = ?, status = ? WHERE id = ?");
        $stmt->execute([$b['state_id'], $b['name'], $b['status'] ?? 'active', $id]);
        Response::success("City updated");
    }

    public function deleteCity($id) {
        $stmt = $this->db->prepare("DELETE FROM cities WHERE id = ?");
        $stmt->execute([$id]);
        Response::success("City deleted");
    }

    // 4. COURIERS
    public function getCouriers() {
        $stmt = $this->db->query("SELECT * FROM couriers ORDER BY name ASC");
        Response::success("Couriers fetched", $stmt->fetchAll());
    }

    public function createCourier() {
        $b = Response::getBody();
        if (empty($b['name']) || empty($b['code'])) {
            Response::error("Courier name and code are required");
        }
        $stmt = $this->db->prepare("
            INSERT INTO couriers (name, code, contact_person, phone, email, tracking_url_template, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $b['name'],
            strtoupper($b['code']),
            $b['contact_person'] ?? null,
            $b['phone'] ?? null,
            $b['email'] ?? null,
            $b['tracking_url_template'] ?? null,
            $b['status'] ?? 'active'
        ]);
        Response::success("Courier created", ["id" => $this->db->lastInsertId()], 201);
    }

    public function updateCourier($id) {
        $b = Response::getBody();
        $stmt = $this->db->prepare("
            UPDATE couriers 
            SET name = ?, code = ?, contact_person = ?, phone = ?, email = ?, tracking_url_template = ?, status = ? 
            WHERE id = ?
        ");
        $stmt->execute([
            $b['name'],
            strtoupper($b['code']),
            $b['contact_person'] ?? null,
            $b['phone'] ?? null,
            $b['email'] ?? null,
            $b['tracking_url_template'] ?? null,
            $b['status'] ?? 'active',
            $id
        ]);
        Response::success("Courier updated");
    }

    public function deleteCourier($id) {
        $stmt = $this->db->prepare("DELETE FROM couriers WHERE id = ?");
        $stmt->execute([$id]);
        Response::success("Courier deleted");
    }

    // 5. CUSTOMERS
    public function getCustomers() {
        $stmt = $this->db->query("
            SELECT c.*, ci.name as city_name, st.name as state_name, co.name as country_name 
            FROM customers c 
            LEFT JOIN cities ci ON c.city_id = ci.id 
            LEFT JOIN states st ON c.state_id = st.id 
            LEFT JOIN countries co ON c.country_id = co.id 
            ORDER BY c.company_name ASC
        ");
        Response::success("Customers fetched", $stmt->fetchAll());
    }

    public function createCustomer() {
        $b = Response::getBody();
        if (empty($b['company_name']) || empty($b['contact_person']) || empty($b['email']) || empty($b['phone'])) {
            Response::error("Company name, contact person, email and phone are required");
        }
        $stmt = $this->db->prepare("
            INSERT INTO customers (company_name, contact_person, email, phone, gst_number, address, country_id, state_id, city_id, pincode, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $b['company_name'],
            $b['contact_person'],
            $b['email'],
            $b['phone'],
            $b['gst_number'] ?? null,
            $b['address'] ?? null,
            !empty($b['country_id']) ? intval($b['country_id']) : null,
            !empty($b['state_id']) ? intval($b['state_id']) : null,
            !empty($b['city_id']) ? intval($b['city_id']) : null,
            $b['pincode'] ?? null,
            $b['status'] ?? 'active'
        ]);
        Response::success("Customer created", ["id" => $this->db->lastInsertId()], 201);
    }

    public function updateCustomer($id) {
        $b = Response::getBody();
        $stmt = $this->db->prepare("
            UPDATE customers 
            SET company_name = ?, contact_person = ?, email = ?, phone = ?, gst_number = ?, address = ?, 
                country_id = ?, state_id = ?, city_id = ?, pincode = ?, status = ? 
            WHERE id = ?
        ");
        $stmt->execute([
            $b['company_name'],
            $b['contact_person'],
            $b['email'],
            $b['phone'],
            $b['gst_number'] ?? null,
            $b['address'] ?? null,
            !empty($b['country_id']) ? intval($b['country_id']) : null,
            !empty($b['state_id']) ? intval($b['state_id']) : null,
            !empty($b['city_id']) ? intval($b['city_id']) : null,
            $b['pincode'] ?? null,
            $b['status'] ?? 'active',
            $id
        ]);
        Response::success("Customer updated");
    }

    public function deleteCustomer($id) {
        $stmt = $this->db->prepare("DELETE FROM customers WHERE id = ?");
        $stmt->execute([$id]);
        Response::success("Customer deleted");
    }

    // 6. VENDORS
    public function getVendors() {
        $stmt = $this->db->query("SELECT * FROM vendors ORDER BY company_name ASC");
        Response::success("Vendors fetched", $stmt->fetchAll());
    }

    public function createVendor() {
        $b = Response::getBody();
        if (empty($b['company_name']) || empty($b['contact_person']) || empty($b['phone'])) {
            Response::error("Company name, contact person and phone are required");
        }
        $stmt = $this->db->prepare("INSERT INTO vendors (company_name, contact_person, email, phone, address, status) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$b['company_name'], $b['contact_person'], $b['email'] ?? null, $b['phone'], $b['address'] ?? null, $b['status'] ?? 'active']);
        Response::success("Vendor created", ["id" => $this->db->lastInsertId()], 201);
    }

    public function updateVendor($id) {
        $b = Response::getBody();
        $stmt = $this->db->prepare("UPDATE vendors SET company_name = ?, contact_person = ?, email = ?, phone = ?, address = ?, status = ? WHERE id = ?");
        $stmt->execute([$b['company_name'], $b['contact_person'], $b['email'] ?? null, $b['phone'], $b['address'] ?? null, $b['status'] ?? 'active', $id]);
        Response::success("Vendor updated");
    }

    public function deleteVendor($id) {
        $stmt = $this->db->prepare("DELETE FROM vendors WHERE id = ?");
        $stmt->execute([$id]);
        Response::success("Vendor deleted");
    }

    // 7. PRODUCTS (Finished Goods & Sub-Assemblies)
    public function getProducts() {
        $stmt = $this->db->query("
            SELECT p.*, 
                   (SELECT COUNT(*) FROM product_boms pb WHERE pb.product_id = p.id) as bom_item_count,
                   (SELECT COUNT(*) FROM product_sub_assemblies psa WHERE psa.parent_product_id = p.id) as sub_assembly_count
            FROM products p 
            ORDER BY p.name ASC
        ");
        $products = $stmt->fetchAll();

        // Attach Sub-Assemblies & Raw Material BOM breakdown
        foreach ($products as &$p) {
            $subStmt = $this->db->prepare("
                SELECT psa.*, sp.name as sub_product_name, sp.sku as sub_product_sku, sp.uom, sp.current_stock, sp.unit_price as unit_cost, sp.category, sp.product_type as sub_product_type
                FROM product_sub_assemblies psa
                JOIN products sp ON psa.sub_product_id = sp.id
                WHERE psa.parent_product_id = ?
                ORDER BY psa.id ASC
            ");
            $subStmt->execute([$p['id']]);
            $p['sub_assemblies'] = $subStmt->fetchAll();

            $bomStmt = $this->db->prepare("
                SELECT pb.*, rm.name as raw_material_name, rm.sku as raw_material_sku, rm.uom, rm.current_stock, rm.unit_cost 
                FROM product_boms pb 
                JOIN raw_materials rm ON pb.raw_material_id = rm.id 
                WHERE pb.product_id = ?
                ORDER BY pb.id ASC
            ");
            $bomStmt->execute([$p['id']]);
            $p['bom'] = $bomStmt->fetchAll();
        }

        Response::success("Products fetched", $products);
    }

    private function assertNoSubAssemblyCycle($parentId, $subProductId) {
        if ($parentId === $subProductId) {
            throw new Exception("A product cannot be assigned as its own sub-assembly");
        }
        $visited = [$parentId => true];
        $queue = [$subProductId];
        $stmt = $this->db->prepare("SELECT sub_product_id FROM product_sub_assemblies WHERE parent_product_id = ?");
        while (!empty($queue)) {
            $curr = array_shift($queue);
            if ($curr === $parentId) {
                throw new Exception("Circular sub-assembly reference detected");
            }
            if (isset($visited[$curr])) {
                continue;
            }
            $visited[$curr] = true;
            $stmt->execute([$curr]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $childId) {
                $childId = intval($childId);
                if ($childId === $parentId) {
                    throw new Exception("Circular sub-assembly reference detected");
                }
                if (!isset($visited[$childId])) {
                    $queue[] = $childId;
                }
            }
        }
    }

    private function syncProductRecipe($productId, $b) {
        $productId = intval($productId);

        if (isset($b['bom']) && is_array($b['bom'])) {
            $this->db->prepare("DELETE FROM product_boms WHERE product_id = ?")->execute([$productId]);
            $mergedBom = [];
            foreach ($b['bom'] as $item) {
                $rmId = intval($item['raw_material_id'] ?? 0);
                $qty = floatval($item['quantity_required'] ?? 0);
                if ($rmId > 0 && $qty > 0) {
                    $mergedBom[$rmId] = ($mergedBom[$rmId] ?? 0) + $qty;
                }
            }
            if (!empty($mergedBom)) {
                $bStmt = $this->db->prepare("INSERT INTO product_boms (product_id, raw_material_id, quantity_required) VALUES (?, ?, ?)");
                foreach ($mergedBom as $rmId => $qty) {
                    $bStmt->execute([$productId, $rmId, $qty]);
                }
            }
        }

        if (isset($b['sub_assemblies']) && is_array($b['sub_assemblies'])) {
            $this->db->prepare("DELETE FROM product_sub_assemblies WHERE parent_product_id = ?")->execute([$productId]);
            $mergedSubs = [];
            foreach ($b['sub_assemblies'] as $sub) {
                $subId = intval($sub['sub_product_id'] ?? 0);
                $qty = floatval($sub['quantity_required'] ?? 0);
                if ($subId > 0 && $qty > 0) {
                    $this->assertNoSubAssemblyCycle($productId, $subId);
                    if (!isset($mergedSubs[$subId])) {
                        $mergedSubs[$subId] = ['qty' => 0.0, 'notes' => null];
                    }
                    $mergedSubs[$subId]['qty'] += $qty;
                    $note = trim((string)($sub['notes'] ?? ''));
                    if ($note !== '') {
                        $mergedSubs[$subId]['notes'] = $note;
                    }
                }
            }
            if (!empty($mergedSubs)) {
                $sStmt = $this->db->prepare("INSERT INTO product_sub_assemblies (parent_product_id, sub_product_id, quantity_required, notes) VALUES (?, ?, ?, ?)");
                foreach ($mergedSubs as $subId => $meta) {
                    $sStmt->execute([$productId, $subId, $meta['qty'], $meta['notes']]);
                }
            }
        }
    }

    public function createProduct() {
        $b = Response::getBody();
        if (empty($b['sku']) || empty($b['name'])) {
            Response::error("Product SKU and Name are required");
        }

        $sku = trim($b['sku']);
        $productType = in_array($b['product_type'] ?? '', ['finished_good', 'sub_assembly'], true)
            ? $b['product_type']
            : (stripos($sku, 'SUB-') === 0 ? 'sub_assembly' : 'finished_good');

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("
                INSERT INTO products (sku, name, description, category, product_type, uom, unit_price, current_stock, reorder_level, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $sku,
                trim($b['name']),
                $b['description'] ?? null,
                $b['category'] ?? 'Industrial',
                $productType,
                $b['uom'] ?? 'Units',
                floatval($b['unit_price'] ?? 0),
                floatval($b['current_stock'] ?? 0),
                floatval($b['reorder_level'] ?? 5),
                $b['status'] ?? 'active'
            ]);
            $productId = intval($this->db->lastInsertId());

            $this->syncProductRecipe($productId, $b);

            $this->db->commit();
            Response::success("Product created with BOM & sub-assemblies", ["id" => $productId], 201);
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to create product: " . $e->getMessage());
        }
    }

    public function updateProduct($id) {
        $b = Response::getBody();
        $id = intval($id);
        $existingStmt = $this->db->prepare("SELECT * FROM products WHERE id = ?");
        $existingStmt->execute([$id]);
        $existing = $existingStmt->fetch();
        if (!$existing) {
            Response::error("Product not found", 404);
        }

        $sku = trim($b['sku'] ?? $existing['sku']);
        $name = trim($b['name'] ?? $existing['name']);
        if ($sku === '' || $name === '') {
            Response::error("Product SKU and Name are required");
        }
        $productType = in_array($b['product_type'] ?? '', ['finished_good', 'sub_assembly'], true)
            ? $b['product_type']
            : ($existing['product_type'] ?? 'finished_good');

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("
                UPDATE products 
                SET sku = ?, name = ?, description = ?, category = ?, product_type = ?, uom = ?, unit_price = ?, current_stock = ?, reorder_level = ?, status = ? 
                WHERE id = ?
            ");
            $stmt->execute([
                $sku,
                $name,
                array_key_exists('description', $b) ? $b['description'] : $existing['description'],
                $b['category'] ?? $existing['category'] ?? 'Industrial',
                $productType,
                $b['uom'] ?? $existing['uom'] ?? 'Units',
                array_key_exists('unit_price', $b) ? floatval($b['unit_price']) : floatval($existing['unit_price']),
                array_key_exists('current_stock', $b) ? floatval($b['current_stock']) : floatval($existing['current_stock']),
                array_key_exists('reorder_level', $b) ? floatval($b['reorder_level']) : floatval($existing['reorder_level']),
                $b['status'] ?? $existing['status'] ?? 'active',
                $id
            ]);

            $this->syncProductRecipe($id, $b);

            $this->db->commit();
            Response::success("Product & BOM updated successfully");
        } catch (Exception $e) {
            $this->db->rollBack();
            Response::error("Failed to update product: " . $e->getMessage());
        }
    }

    public function deleteProduct($id) {
        $stmt = $this->db->prepare("DELETE FROM products WHERE id = ?");
        $stmt->execute([$id]);
        Response::success("Product deleted");
    }

    // 8. RAW MATERIALS (Inventory Items)
    public function getRawMaterials() {
        $stmt = $this->db->query("SELECT * FROM raw_materials ORDER BY name ASC");
        Response::success("Raw materials fetched", $stmt->fetchAll());
    }

    public function createRawMaterial() {
        $b = Response::getBody();
        if (empty($b['sku']) || empty($b['name'])) {
            Response::error("Material SKU and Name are required");
        }
        $stmt = $this->db->prepare("
            INSERT INTO raw_materials (sku, name, description, category, uom, current_stock, reorder_level, unit_cost, location, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $b['sku'],
            $b['name'],
            $b['description'] ?? null,
            $b['category'] ?? 'General',
            $b['uom'] ?? 'Units',
            floatval($b['current_stock'] ?? 0),
            floatval($b['reorder_level'] ?? 10),
            floatval($b['unit_cost'] ?? 0),
            $b['location'] ?? 'Main Store',
            $b['status'] ?? 'active'
        ]);
        Response::success("Raw material created", ["id" => $this->db->lastInsertId()], 201);
    }

    public function updateRawMaterial($id) {
        $b = Response::getBody();
        $stmt = $this->db->prepare("
            UPDATE raw_materials 
            SET sku = ?, name = ?, description = ?, category = ?, uom = ?, current_stock = ?, reorder_level = ?, unit_cost = ?, location = ?, status = ? 
            WHERE id = ?
        ");
        $stmt->execute([
            $b['sku'],
            $b['name'],
            $b['description'] ?? null,
            $b['category'] ?? 'General',
            $b['uom'] ?? 'Units',
            floatval($b['current_stock'] ?? 0),
            floatval($b['reorder_level'] ?? 10),
            floatval($b['unit_cost'] ?? 0),
            $b['location'] ?? 'Main Store',
            $b['status'] ?? 'active',
            $id
        ]);
        Response::success("Raw material updated");
    }

    public function addStock($id) {
        $b = Response::getBody();
        $qty = floatval($b['quantity'] ?? 0);
        if ($qty <= 0) {
            Response::error("Valid quantity required to add stock");
        }
        $stmt = $this->db->prepare("UPDATE raw_materials SET current_stock = current_stock + ? WHERE id = ?");
        $stmt->execute([$qty, $id]);
        Response::success("Stock updated successfully");
    }

    public function deleteRawMaterial($id) {
        $stmt = $this->db->prepare("DELETE FROM raw_materials WHERE id = ?");
        $stmt->execute([$id]);
        Response::success("Raw material deleted");
    }

    // 9. ZONES
    public function getZones() {
        $stmt = $this->db->query("SELECT * FROM zones ORDER BY name ASC");
        Response::success("Zones fetched", $stmt->fetchAll());
    }

    public function createZone() {
        $b = Response::getBody();
        if (empty($b['name']) || empty($b['code'])) {
            Response::error("Zone name and code are required");
        }
        $stmt = $this->db->prepare("INSERT INTO zones (name, code, description, status) VALUES (?, ?, ?, ?)");
        $stmt->execute([$b['name'], strtoupper(trim($b['code'])), $b['description'] ?? null, $b['status'] ?? 'active']);
        Response::success("Zone created", ["id" => $this->db->lastInsertId()], 201);
    }

    public function updateZone($id) {
        $b = Response::getBody();
        $stmt = $this->db->prepare("UPDATE zones SET name = ?, code = ?, description = ?, status = ? WHERE id = ?");
        $stmt->execute([$b['name'], strtoupper(trim($b['code'])), $b['description'] ?? null, $b['status'] ?? 'active', $id]);
        Response::success("Zone updated");
    }

    public function deleteZone($id) {
        $stmt = $this->db->prepare("DELETE FROM zones WHERE id = ?");
        $stmt->execute([$id]);
        Response::success("Zone deleted");
    }

    // 10. PAYMENT TYPES
    public function getPaymentTypes() {
        $stmt = $this->db->query("SELECT * FROM payment_types ORDER BY id ASC");
        Response::success("Payment types fetched", $stmt->fetchAll());
    }

    public function createPaymentType() {
        $b = Response::getBody();
        if (empty($b['name']) || empty($b['code'])) {
            Response::error("Payment type name and code are required");
        }
        $stmt = $this->db->prepare("INSERT INTO payment_types (name, code, description, status) VALUES (?, ?, ?, ?)");
        $stmt->execute([$b['name'], strtolower(trim($b['code'])), $b['description'] ?? null, $b['status'] ?? 'active']);
        Response::success("Payment type created", ["id" => $this->db->lastInsertId()], 201);
    }

    public function updatePaymentType($id) {
        $b = Response::getBody();
        $stmt = $this->db->prepare("UPDATE payment_types SET name = ?, code = ?, description = ?, status = ? WHERE id = ?");
        $stmt->execute([$b['name'], strtolower(trim($b['code'])), $b['description'] ?? null, $b['status'] ?? 'active', $id]);
        Response::success("Payment type updated");
    }

    public function deletePaymentType($id) {
        $stmt = $this->db->prepare("DELETE FROM payment_types WHERE id = ?");
        $stmt->execute([$id]);
        Response::success("Payment type deleted");
    }
}
