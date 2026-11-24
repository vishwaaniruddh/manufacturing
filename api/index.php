<?php
// api/index.php - Central REST Routing Dispatcher

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/helpers/response.php';
require_once __DIR__ . '/helpers/audit.php';
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/UserController.php';
require_once __DIR__ . '/controllers/AuditController.php';
require_once __DIR__ . '/controllers/MastersController.php';
require_once __DIR__ . '/controllers/LeadController.php';
require_once __DIR__ . '/controllers/QuotationController.php';
require_once __DIR__ . '/controllers/PurchaseOrderController.php';
require_once __DIR__ . '/controllers/PaymentController.php';
require_once __DIR__ . '/controllers/ManufacturingController.php';
require_once __DIR__ . '/controllers/QualityController.php';
require_once __DIR__ . '/controllers/DispatchController.php';
require_once __DIR__ . '/controllers/CustomerPortalController.php';
require_once __DIR__ . '/controllers/DashboardController.php';
require_once __DIR__ . '/controllers/MediaController.php';

// Initialize CORS & options headers
Response::initCors();

// Connect to Database
$database = new Database();
$pdo = $database->getConnection();

// Instantiate Controllers
$authCtrl = new AuthController($pdo);
$userCtrl = new UserController($pdo);
$mastersCtrl = new MastersController($pdo);
$leadCtrl = new LeadController($pdo);
$quotationCtrl = new QuotationController($pdo);
$poCtrl = new PurchaseOrderController($pdo);
$paymentCtrl = new PaymentController($pdo);
$mfgCtrl = new ManufacturingController($pdo);
$qcCtrl = new QualityController($pdo);
$dispatchCtrl = new DispatchController($pdo);
$customerCtrl = new CustomerPortalController($pdo);
$dashboardCtrl = new DashboardController($pdo);
$auditCtrl = new AuditController($pdo);
$mediaCtrl = new MediaController($pdo);

// Determine route and method
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Parse route from query param 'route' or PATH_INFO
$route = $_GET['route'] ?? '';
if (empty($route) && isset($_SERVER['PATH_INFO'])) {
    $route = trim($_SERVER['PATH_INFO'], '/');
}
if (empty($route) && isset($_SERVER['REQUEST_URI'])) {
    $parsedUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    // Find 'api' in path
    $apiPos = strpos($parsedUri, '/api/');
    if ($apiPos !== false) {
        $sub = substr($parsedUri, $apiPos + 5);
        $route = trim($sub, '/');
    }
}

// Split route segments
$parts = explode('/', trim($route, '/'));
$resource = $parts[0] ?? '';
$actionOrId = $parts[1] ?? '';
$subAction = $parts[2] ?? '';

try {
    switch ($resource) {
        // === AUTH ===
        case 'auth':
            if ($actionOrId === 'login' && $method === 'POST') $authCtrl->login();
            elseif ($actionOrId === 'switch_role' && $method === 'POST') $authCtrl->switchRole();
            elseif ($actionOrId === 'logout' && $method === 'POST') $authCtrl->logout();
            elseif ($actionOrId === 'roles' && $method === 'GET') $authCtrl->getRoles();
            else Response::error("Unknown auth endpoint", 404);
            break;

        // === AUDIT & USER ACTIVITY LOGS ===
        case 'audit':
            if ($actionOrId === 'logins' && $method === 'GET') $auditCtrl->getLoginActivities();
            elseif ($method === 'GET') $auditCtrl->getAuditLogs();
            else Response::error("Method not supported for audit", 405);
            break;

        // === USERS & ROLES ===
        case 'users':
            if ($actionOrId === 'matrix') {
                if ($method === 'GET') $userCtrl->getPermissionMatrix();
                elseif ($method === 'POST') $userCtrl->updatePermissionMatrix();
            } elseif ($actionOrId === 'roles') {
                $id = $subAction;
                if ($method === 'GET') $userCtrl->getRoles();
                elseif ($method === 'POST') $userCtrl->createRole();
                elseif ($method === 'PUT' && !empty($id)) $userCtrl->updateRole($id);
                elseif ($method === 'DELETE' && !empty($id)) $userCtrl->deleteRole($id);
            } elseif ($actionOrId === 'permissions') {
                $id = $subAction;
                if ($method === 'GET') $userCtrl->getPermissions();
                elseif ($method === 'POST') $userCtrl->createPermission();
                elseif ($method === 'PUT' && !empty($id)) $userCtrl->updatePermission($id);
                elseif ($method === 'DELETE' && !empty($id)) $userCtrl->deletePermission($id);
            } elseif ($method === 'GET') {
                $userCtrl->getAll();
            } elseif ($method === 'POST') {
                $userCtrl->create();
            } elseif ($method === 'PUT' && !empty($actionOrId)) {
                $userCtrl->update($actionOrId);
            } elseif ($method === 'DELETE' && !empty($actionOrId)) {
                $userCtrl->delete($actionOrId);
            } else {
                Response::error("Method not supported for users", 405);
            }
            break;

        // === MASTERS ===
        case 'masters':
            $master = $actionOrId;
            $id = $subAction;
            if ($master === 'countries') {
                if ($method === 'GET') $mastersCtrl->getCountries();
                elseif ($method === 'POST') $mastersCtrl->createCountry();
                elseif ($method === 'PUT') $mastersCtrl->updateCountry($id);
                elseif ($method === 'DELETE') $mastersCtrl->deleteCountry($id);
            } elseif ($master === 'states') {
                if ($method === 'GET') $mastersCtrl->getStates();
                elseif ($method === 'POST') $mastersCtrl->createState();
                elseif ($method === 'PUT') $mastersCtrl->updateState($id);
                elseif ($method === 'DELETE') $mastersCtrl->deleteState($id);
            } elseif ($master === 'cities') {
                if ($method === 'GET') $mastersCtrl->getCities();
                elseif ($method === 'POST') $mastersCtrl->createCity();
                elseif ($method === 'PUT') $mastersCtrl->updateCity($id);
                elseif ($method === 'DELETE') $mastersCtrl->deleteCity($id);
            } elseif ($master === 'couriers') {
                if ($method === 'GET') $mastersCtrl->getCouriers();
                elseif ($method === 'POST') $mastersCtrl->createCourier();
                elseif ($method === 'PUT') $mastersCtrl->updateCourier($id);
                elseif ($method === 'DELETE') $mastersCtrl->deleteCourier($id);
            } elseif ($master === 'customers') {
                if ($method === 'GET') $mastersCtrl->getCustomers();
                elseif ($method === 'POST') $mastersCtrl->createCustomer();
                elseif ($method === 'PUT') $mastersCtrl->updateCustomer($id);
                elseif ($method === 'DELETE') $mastersCtrl->deleteCustomer($id);
            } elseif ($master === 'vendors') {
                if ($method === 'GET') $mastersCtrl->getVendors();
                elseif ($method === 'POST') $mastersCtrl->createVendor();
                elseif ($method === 'PUT') $mastersCtrl->updateVendor($id);
                elseif ($method === 'DELETE') $mastersCtrl->deleteVendor($id);
            } elseif ($master === 'products') {
                if ($method === 'GET') $mastersCtrl->getProducts();
                elseif ($method === 'POST') $mastersCtrl->createProduct();
                elseif ($method === 'PUT') $mastersCtrl->updateProduct($id);
                elseif ($method === 'DELETE') $mastersCtrl->deleteProduct($id);
            } elseif ($master === 'raw_materials') {
                if ($id === 'add_stock' && $method === 'POST') {
                    $b = Response::getBody();
                    $mastersCtrl->addStock($b['id'] ?? 0);
                } elseif ($method === 'GET') {
                    $mastersCtrl->getRawMaterials();
                } elseif ($method === 'POST') {
                    $mastersCtrl->createRawMaterial();
                } elseif ($method === 'PUT') {
                    $mastersCtrl->updateRawMaterial($id);
                } elseif ($method === 'DELETE') {
                    $mastersCtrl->deleteRawMaterial($id);
                }
            } elseif ($master === 'zones') {
                if ($method === 'GET') $mastersCtrl->getZones();
                elseif ($method === 'POST') $mastersCtrl->createZone();
                elseif ($method === 'PUT') $mastersCtrl->updateZone($id);
                elseif ($method === 'DELETE') $mastersCtrl->deleteZone($id);
            } elseif ($master === 'payment_types') {
                if ($method === 'GET') $mastersCtrl->getPaymentTypes();
                elseif ($method === 'POST') $mastersCtrl->createPaymentType();
                elseif ($method === 'PUT') $mastersCtrl->updatePaymentType($id);
                elseif ($method === 'DELETE') $mastersCtrl->deletePaymentType($id);
            } else {
                Response::error("Unknown master resource", 404);
            }
            break;

        // === LEADS ===
        case 'leads':
            if ($actionOrId === 'approve' && $method === 'POST') {
                $leadCtrl->approve($subAction);
            } elseif ($actionOrId === 'reject' && $method === 'POST') {
                $leadCtrl->reject($subAction);
            } elseif ($actionOrId === 'import' && $method === 'POST') {
                $leadCtrl->bulkImport();
            } elseif ($method === 'GET') {
                if (!empty($actionOrId) && is_numeric($actionOrId)) {
                    $leadCtrl->getOne($actionOrId);
                } else {
                    $leadCtrl->getAll();
                }
            } elseif ($method === 'POST') {
                $leadCtrl->create();
            } elseif ($method === 'PUT' && !empty($actionOrId)) {
                $leadCtrl->update($actionOrId);
            } elseif ($method === 'DELETE' && !empty($actionOrId)) {
                $leadCtrl->delete($actionOrId);
            } else {
                Response::error("Method not supported for leads", 405);
            }
            break;

        // === QUOTATIONS ===
        case 'quotations':
            if ($actionOrId === 'approve' && $method === 'POST') {
                $quotationCtrl->approve($subAction);
            } elseif ($actionOrId === 'reject' && $method === 'POST') {
                $quotationCtrl->reject($subAction);
            } elseif ($method === 'GET') {
                if (!empty($actionOrId) && is_numeric($actionOrId)) {
                    if ($subAction === 'pdf') {
                        $quotationCtrl->downloadPdf($actionOrId);
                    } elseif ($subAction === 'excel') {
                        $quotationCtrl->downloadExcel($actionOrId);
                    } else {
                        $quotationCtrl->getOne($actionOrId);
                    }
                } else {
                    $quotationCtrl->getAll();
                }
            } elseif ($method === 'POST') {
                $quotationCtrl->create();
            } elseif ($method === 'PUT' && !empty($actionOrId)) {
                $quotationCtrl->update($actionOrId);
            } elseif ($method === 'DELETE' && !empty($actionOrId)) {
                $quotationCtrl->delete($actionOrId);
            } else {
                Response::error("Method not supported for quotations", 405);
            }
            break;

        // === PURCHASE ORDERS ===
        case 'purchase_orders':
            if ($method === 'GET') {
                if (!empty($actionOrId) && is_numeric($actionOrId)) {
                    $poCtrl->getOne($actionOrId);
                } else {
                    $poCtrl->getAll();
                }
            } elseif ($method === 'POST') {
                $poCtrl->create();
            } elseif ($method === 'PUT' && !empty($actionOrId)) {
                $poCtrl->update($actionOrId);
            } else {
                Response::error("Method not supported for purchase orders", 405);
            }
            break;

        // === PAYMENTS ===
        case 'payments':
            if ($actionOrId === 'summary' && !empty($subAction) && $method === 'GET') {
                $paymentCtrl->getSummary($subAction);
            } elseif ($method === 'GET') {
                $paymentCtrl->getAll();
            } elseif ($method === 'POST') {
                $paymentCtrl->create();
            } else {
                Response::error("Method not supported for payments", 405);
            }
            break;

        // === MANUFACTURING & MRP ===
        case 'manufacturing':
            if ($actionOrId === 'check_materials' && $method === 'POST') {
                $mfgCtrl->checkMaterials();
            } elseif ($actionOrId === 'requisitions') {
                if ($subAction && ($parts[3] ?? '') === 'fulfill' && $method === 'POST') {
                    $mfgCtrl->fulfillRequisition($subAction);
                } elseif ($method === 'GET') {
                    $mfgCtrl->getRequisitions();
                } elseif ($method === 'POST') {
                    $mfgCtrl->createRequisition();
                }
            } elseif ($actionOrId === 'work_orders') {
                if ($method === 'GET') {
                    if (!empty($subAction)) {
                        $mfgCtrl->getWorkOrder($subAction);
                    } else {
                        $mfgCtrl->getWorkOrders();
                    }
                } elseif ($method === 'POST') {
                    $mfgCtrl->startWorkOrder();
                }
            } else {
                Response::error("Unknown manufacturing endpoint", 404);
            }
            break;

        // === QUALITY CONTROL (QC) ===
        case 'qc':
            if ($actionOrId === 'inspections' && $method === 'GET') {
                $qcCtrl->getInspections();
            } elseif ($actionOrId === 'verify' && $method === 'POST') {
                $qcCtrl->verifyStage();
            } else {
                Response::error("Unknown QC endpoint", 404);
            }
            break;

        // === DISPATCH ===
        case 'dispatch':
            if ($actionOrId === 'status' && !empty($subAction) && $method === 'PUT') {
                $dispatchCtrl->updateStatus($subAction);
            } elseif ($method === 'GET') {
                $dispatchCtrl->getAll();
            } elseif ($method === 'POST') {
                $dispatchCtrl->create();
            } else {
                Response::error("Method not supported for dispatch", 405);
            }
            break;

        // === CUSTOMER PORTAL ===
        case 'customer':
            if ($actionOrId === 'inspect' && $method === 'POST') {
                $customerCtrl->inspectDelivery();
            } elseif ($actionOrId === 'complaints') {
                if ($method === 'GET') {
                    $customerCtrl->getComplaints();
                } elseif ($method === 'POST') {
                    $customerCtrl->createComplaint();
                } elseif ($method === 'PUT' && !empty($subAction)) {
                    $customerCtrl->updateComplaint($subAction);
                }
            } elseif ($actionOrId === 'release_final_payment' && $method === 'POST') {
                $customerCtrl->releaseFinalPayment();
            } else {
                Response::error("Unknown customer portal endpoint", 404);
            }
            break;

        // === MEDIA ATTACHMENTS ===
        case 'media':
            if ($actionOrId === 'upload' && $method === 'POST') {
                $mediaCtrl->upload();
            } elseif ($method === 'GET') {
                $mediaCtrl->listByEntity();
            } elseif ($method === 'DELETE' && !empty($actionOrId)) {
                $mediaCtrl->delete($actionOrId);
            } else {
                Response::error("Method not supported for media", 405);
            }
            break;

        // === DASHBOARD ===
        case 'dashboard':
            if ($method === 'GET') {
                $dashboardCtrl->getSummary();
            } else {
                Response::error("Method not supported", 405);
            }
            break;

        default:
            Response::json([
                "status" => "online",
                "service" => "Manufacturing ERP REST API",
                "version" => "1.0.0",
                "message" => "Welcome to the Manufacturing ERP Backend API. Provide a valid route endpoint."
            ]);
            break;
    }
} catch (Exception $e) {
    Response::error("Server Error: " . $e->getMessage(), 500);
}
