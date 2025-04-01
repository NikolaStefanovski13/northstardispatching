<?php
# Enable JSON API responses
header('Content-Type: application/json');

# Prevent browser caching
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

# Allow CORS for development (can be removed in production)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, PUT');
header('Access-Control-Allow-Headers: Content-Type');

# Database setup
$dbFile = 'northstar.db';
$createDb = !file_exists($dbFile);
$db = new SQLite3($dbFile);

# Create database tables if they don't exist
if ($createDb) {
    # Routes table (enhanced with driver_id and status fields)
    $db->exec('
        CREATE TABLE routes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            driver_id INTEGER,
            pickup_address TEXT NOT NULL,
            pickup_lat REAL NOT NULL,
            pickup_lon REAL NOT NULL,
            delivery_address TEXT NOT NULL,
            delivery_lat REAL NOT NULL, 
            delivery_lon REAL NOT NULL,
            truck_height REAL,
            truck_weight REAL,
            distance REAL,
            duration REAL,
            route_data TEXT,
            notes TEXT,
            status TEXT DEFAULT "pending",
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (driver_id) REFERENCES drivers(id)
        )
    ');

    # Drivers table
    $db->exec('
        CREATE TABLE drivers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            initials TEXT,
            status TEXT DEFAULT "available",
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ');

    # Positions table for tracking driver locations
    $db->exec('
        CREATE TABLE positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL,
            route_id INTEGER,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            accuracy REAL,
            speed REAL,
            heading REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (driver_id) REFERENCES drivers(id),
            FOREIGN KEY (route_id) REFERENCES routes(id)
        )
    ');

    # Activities table for logging driver actions
    $db->exec('
        CREATE TABLE activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL,
            route_id INTEGER,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (driver_id) REFERENCES drivers(id),
            FOREIGN KEY (route_id) REFERENCES routes(id)
        )
    ');
}

# Get the action from the query string
$action = isset($_GET['action']) ? $_GET['action'] : '';

# Handle different API actions
switch ($action) {
    case 'validateTruckRoute':
        $postData = json_decode(file_get_contents('php://input'), true);

        // Required fields
        if (empty($postData['pickup']) || empty($postData['delivery']) || empty($postData['truck'])) {
            http_response_code(400);
            die(json_encode(['error' => 'Missing pickup, delivery, or truck specs']));
        }

        // Call OpenRouteService (free tier)
        $apiKey = "5b3ce3597851110001cf6248d537c887ab8b40409e05940495d5c8ca"; // 👈 KINGMAKER KEY";
        $url = "https://api.openrouteservice.org/v2/directions/driving-hgv?" .
            "api_key=$apiKey" .
            "&start={$postData['pickup']['lon']},{$postData['pickup']['lat']}" .
            "&end={$postData['delivery']['lon']},{$postData['delivery']['lat']}" .
            "&height=" . ($postData['truck']['height'] * 0.3048) . // Convert feet → meters
            "&weight=" . ($postData['truck']['weight'] * 0.453592); // Convert lbs → kg

        $response = file_get_contents($url);
        $data = json_decode($response, true);

        // Check if route has truck restrictions
        $isValid = !isset($data['routes'][0]['warnings']['truck_restrictions']);

        echo json_encode(['valid' => $isValid]);
        break;
    // =============================================
    // ROUTE OPERATIONS
    // =============================================

    case 'createRoute':
        # This handles saving a new route to the database

        # Get POST data (handle both form-data and JSON)
        $postData = $_POST;
        if (empty($postData)) {
            $jsonData = file_get_contents('php://input');
            $postData = json_decode($jsonData, true) ?: [];
        }

        # Validate required fields
        if (empty($postData['name']) || empty($postData['pickup']) || empty($postData['delivery'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required fields']);
            break;
        }

        # Generate unique token
        $token = generateToken();

        # Prepare and execute database insert
        $stmt = $db->prepare('
            INSERT INTO routes (
                token, name, driver_id, pickup_address, pickup_lat, pickup_lon,
                delivery_address, delivery_lat, delivery_lon,
                truck_height, truck_weight, distance, duration,
                route_data, notes, status
            ) VALUES (
                :token, :name, :driver_id, :pickup_address, :pickup_lat, :pickup_lon,
                :delivery_address, :delivery_lat, :delivery_lon,
                :truck_height, :truck_weight, :distance, :duration,
                :route_data, :notes, :status
            )
        ');

        # Bind parameters
        $stmt->bindValue(':token', $token);
        $stmt->bindValue(':name', $postData['name']);
        $stmt->bindValue(':driver_id', $postData['driver_id'] ?? null);
        $stmt->bindValue(':pickup_address', $postData['pickup']['address']);
        $stmt->bindValue(':pickup_lat', $postData['pickup']['lat']);
        $stmt->bindValue(':pickup_lon', $postData['pickup']['lon']);
        $stmt->bindValue(':delivery_address', $postData['delivery']['address']);
        $stmt->bindValue(':delivery_lat', $postData['delivery']['lat']);
        $stmt->bindValue(':delivery_lon', $postData['delivery']['lon']);
        $stmt->bindValue(':truck_height', $postData['truck']['height'] ?? null);
        $stmt->bindValue(':truck_weight', $postData['truck']['weight'] ?? null);
        $stmt->bindValue(':distance', $postData['distance'] ?? null);
        $stmt->bindValue(':duration', $postData['duration'] ?? null);
        $stmt->bindValue(':route_data', json_encode($postData));
        $stmt->bindValue(':notes', $postData['notes'] ?? null);
        $stmt->bindValue(':status', $postData['status'] ?? 'pending');

        # Execute statement
        $result = $stmt->execute();

        if ($result) {
            # If a driver is assigned, create an activity entry
            if (!empty($postData['driver_id'])) {
                $activityStmt = $db->prepare('
                    INSERT INTO activities (driver_id, route_id, type, message)
                    VALUES (:driver_id, :route_id, :type, :message)
                ');

                $routeId = $db->lastInsertRowID();
                $activityStmt->bindValue(':driver_id', $postData['driver_id']);
                $activityStmt->bindValue(':route_id', $routeId);
                $activityStmt->bindValue(':type', 'assignment');
                $activityStmt->bindValue(':message', 'Assigned to route: ' . $postData['name']);
                $activityStmt->execute();
            }

            # Return success response with token
            echo json_encode([
                'success' => true,
                'token' => $token,
                'message' => 'Route created successfully'
            ]);
        } else {
            # Return error if insert failed
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save route']);
        }
        break;

    case 'updateRoute':
        # This handles updating an existing route

        # Get token from query string
        $token = isset($_GET['token']) ? $_GET['token'] : '';

        if (empty($token)) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing token']);
            break;
        }

        # Get POST data (handle both form-data and JSON)
        $postData = $_POST;
        if (empty($postData)) {
            $jsonData = file_get_contents('php://input');
            $postData = json_decode($jsonData, true) ?: [];
        }

        # Get the current route data
        $stmt = $db->prepare('SELECT * FROM routes WHERE token = :token');
        $stmt->bindValue(':token', $token);
        $result = $stmt->execute();
        $currentRoute = $result->fetchArray(SQLITE3_ASSOC);

        if (!$currentRoute) {
            http_response_code(404);
            echo json_encode(['error' => 'Route not found']);
            break;
        }

        # Prepare update statement with only the fields that are provided
        $updateFields = [];
        $params = [];

        if (isset($postData['name'])) {
            $updateFields[] = 'name = :name';
            $params[':name'] = $postData['name'];
        }

        if (isset($postData['driver_id'])) {
            $updateFields[] = 'driver_id = :driver_id';
            $params[':driver_id'] = $postData['driver_id'];

            # If driver changed, log an activity
            if ($currentRoute['driver_id'] != $postData['driver_id']) {
                $activityStmt = $db->prepare('
                    INSERT INTO activities (driver_id, route_id, type, message)
                    VALUES (:driver_id, :route_id, :type, :message)
                ');

                $activityStmt->bindValue(':driver_id', $postData['driver_id']);
                $activityStmt->bindValue(':route_id', $currentRoute['id']);
                $activityStmt->bindValue(':type', 'assignment');
                $activityStmt->bindValue(':message', 'Reassigned to route: ' . ($postData['name'] ?? $currentRoute['name']));
                $activityStmt->execute();
            }
        }

        if (isset($postData['pickup'])) {
            if (isset($postData['pickup']['address'])) {
                $updateFields[] = 'pickup_address = :pickup_address';
                $params[':pickup_address'] = $postData['pickup']['address'];
            }
            if (isset($postData['pickup']['lat'])) {
                $updateFields[] = 'pickup_lat = :pickup_lat';
                $params[':pickup_lat'] = $postData['pickup']['lat'];
            }
            if (isset($postData['pickup']['lon'])) {
                $updateFields[] = 'pickup_lon = :pickup_lon';
                $params[':pickup_lon'] = $postData['pickup']['lon'];
            }
        }

        if (isset($postData['delivery'])) {
            if (isset($postData['delivery']['address'])) {
                $updateFields[] = 'delivery_address = :delivery_address';
                $params[':delivery_address'] = $postData['delivery']['address'];
            }
            if (isset($postData['delivery']['lat'])) {
                $updateFields[] = 'delivery_lat = :delivery_lat';
                $params[':delivery_lat'] = $postData['delivery']['lat'];
            }
            if (isset($postData['delivery']['lon'])) {
                $updateFields[] = 'delivery_lon = :delivery_lon';
                $params[':delivery_lon'] = $postData['delivery']['lon'];
            }
        }

        if (isset($postData['truck'])) {
            if (isset($postData['truck']['height'])) {
                $updateFields[] = 'truck_height = :truck_height';
                $params[':truck_height'] = $postData['truck']['height'];
            }
            if (isset($postData['truck']['weight'])) {
                $updateFields[] = 'truck_weight = :truck_weight';
                $params[':truck_weight'] = $postData['truck']['weight'];
            }
        }

        if (isset($postData['distance'])) {
            $updateFields[] = 'distance = :distance';
            $params[':distance'] = $postData['distance'];
        }

        if (isset($postData['duration'])) {
            $updateFields[] = 'duration = :duration';
            $params[':duration'] = $postData['duration'];
        }

        if (isset($postData['notes'])) {
            $updateFields[] = 'notes = :notes';
            $params[':notes'] = $postData['notes'];
        }

        if (isset($postData['status'])) {
            $updateFields[] = 'status = :status';
            $params[':status'] = $postData['status'];

            # Log status change as activity
            if ($currentRoute['status'] != $postData['status'] && $currentRoute['driver_id']) {
                $activityStmt = $db->prepare('
                    INSERT INTO activities (driver_id, route_id, type, message)
                    VALUES (:driver_id, :route_id, :type, :message)
                ');

                $activityStmt->bindValue(':driver_id', $currentRoute['driver_id']);
                $activityStmt->bindValue(':route_id', $currentRoute['id']);
                $activityStmt->bindValue(':type', 'status');
                $activityStmt->bindValue(':message', 'Route status changed to: ' . $postData['status']);
                $activityStmt->execute();
            }
        }

        # Update route_data if any fields changed
        if (!empty($updateFields)) {
            $updateFields[] = 'route_data = :route_data';

            # Merge current data with updated data
            $currentData = json_decode($currentRoute['route_data'], true) ?: [];
            $mergedData = array_merge($currentData, $postData);
            $params[':route_data'] = json_encode($mergedData);
        }

        # If no fields to update, return success without doing anything
        if (empty($updateFields)) {
            echo json_encode([
                'success' => true,
                'message' => 'No changes to update'
            ]);
            break;
        }

        # Build the SQL update statement
        $sql = 'UPDATE routes SET ' . implode(', ', $updateFields) . ' WHERE token = :token';
        $params[':token'] = $token;

        # Prepare and execute the update
        $stmt = $db->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }

        $result = $stmt->execute();

        if ($result) {
            echo json_encode([
                'success' => true,
                'message' => 'Route updated successfully'
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to update route']);
        }
        break;

    case 'getRoute':
        # This retrieves a route by token

        # Get token from query string
        $token = isset($_GET['token']) ? $_GET['token'] : '';

        if (empty($token)) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing token']);
            break;
        }

        # Prepare and execute query
        $stmt = $db->prepare('
            SELECT r.*, d.name as driver_name, d.phone as driver_phone, d.email as driver_email, d.initials as driver_initials
            FROM routes r
            LEFT JOIN drivers d ON r.driver_id = d.id
            WHERE r.token = :token
        ');
        $stmt->bindValue(':token', $token);
        $result = $stmt->execute();
        $route = $result->fetchArray(SQLITE3_ASSOC);

        if ($route) {
            # Get latest position if a driver is assigned
            $driverPosition = null;
            if ($route['driver_id']) {
                $posStmt = $db->prepare('
                    SELECT latitude, longitude, timestamp 
                    FROM positions 
                    WHERE driver_id = :driver_id 
                    ORDER BY timestamp DESC 
                    LIMIT 1
                ');
                $posStmt->bindValue(':driver_id', $route['driver_id']);
                $posResult = $posStmt->execute();
                $driverPosition = $posResult->fetchArray(SQLITE3_ASSOC);
            }

            # Get activities for this route
            $activities = [];
            if ($route['id']) {
                $actStmt = $db->prepare('
                    SELECT type, message, timestamp 
                    FROM activities 
                    WHERE route_id = :route_id 
                    ORDER BY timestamp DESC 
                    LIMIT 10
                ');
                $actStmt->bindValue(':route_id', $route['id']);
                $actResult = $actStmt->execute();

                while ($activity = $actResult->fetchArray(SQLITE3_ASSOC)) {
                    $activities[] = $activity;
                }
            }

            # Return route data with driver and tracking info
            if (!empty($route['route_data'])) {
                # Use stored JSON data but add driver and tracking info
                $routeData = json_decode($route['route_data'], true);
                $routeData['driver'] = [
                    'id' => $route['driver_id'],
                    'name' => $route['driver_name'],
                    'phone' => $route['driver_phone'],
                    'email' => $route['driver_email'],
                    'initials' => $route['driver_initials']
                ];
                $routeData['status'] = $route['status'];
                $routeData['activities'] = $activities;

                if ($driverPosition) {
                    $routeData['current_position'] = [
                        'lat' => $driverPosition['latitude'],
                        'lon' => $driverPosition['longitude'],
                        'timestamp' => $driverPosition['timestamp']
                    ];
                }

                echo json_encode($routeData);
            } else {
                # Reconstruct from database fields
                $responseData = [
                    'name' => $route['name'],
                    'status' => $route['status'],
                    'pickup' => [
                        'address' => $route['pickup_address'],
                        'lat' => $route['pickup_lat'],
                        'lon' => $route['pickup_lon']
                    ],
                    'delivery' => [
                        'address' => $route['delivery_address'],
                        'lat' => $route['delivery_lat'],
                        'lon' => $route['delivery_lon']
                    ],
                    'truck' => [
                        'height' => $route['truck_height'],
                        'weight' => $route['truck_weight']
                    ],
                    'distance' => $route['distance'],
                    'duration' => $route['duration'],
                    'notes' => $route['notes'],
                    'token' => $route['token'],
                    'created_at' => $route['created_at'],
                    'driver' => [
                        'id' => $route['driver_id'],
                        'name' => $route['driver_name'],
                        'phone' => $route['driver_phone'],
                        'email' => $route['driver_email'],
                        'initials' => $route['driver_initials']
                    ],
                    'activities' => $activities
                ];

                if ($driverPosition) {
                    $responseData['current_position'] = [
                        'lat' => $driverPosition['latitude'],
                        'lon' => $driverPosition['longitude'],
                        'timestamp' => $driverPosition['timestamp']
                    ];
                }

                echo json_encode($responseData);
            }
        } else {
            # Route not found
            http_response_code(404);
            echo json_encode(['error' => 'Route not found']);
        }
        break;

    case 'getAllRoutes':
        $page = max(1, intval($_GET['page'] ?? 1));
        $limit = max(10, min(100, intval($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;

        $result = $db->query("
            SELECT r.id, r.token, r.name, r.pickup_address, r.delivery_address, 
                   r.status, r.created_at, r.driver_id, d.name as driver_name,
                   d.initials as driver_initials
            FROM routes r
            LEFT JOIN drivers d ON r.driver_id = d.id
            ORDER BY r.created_at DESC
            LIMIT $limit OFFSET $offset
        ");
        # This returns a list of all routes (for dispatcher dashboard)






        # Query database for all routes, ordered by creation date
        $result = $db->query('
            SELECT r.id, r.token, r.name, r.pickup_address, r.delivery_address, 
                   r.status, r.created_at, r.driver_id, d.name as driver_name,
                   d.initials as driver_initials
            FROM routes r
            LEFT JOIN drivers d ON r.driver_id = d.id
            ORDER BY r.created_at DESC
        ');

        $routes = [];
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            # Get latest position for route's driver if available
            if ($row['driver_id']) {
                $posStmt = $db->prepare('
                    SELECT latitude, longitude, timestamp 
                    FROM positions 
                    WHERE driver_id = :driver_id 
                    ORDER BY timestamp DESC 
                    LIMIT 1
                ');
                $posStmt->bindValue(':driver_id', $row['driver_id']);
                $posResult = $posStmt->execute();
                $position = $posResult->fetchArray(SQLITE3_ASSOC);

                if ($position) {
                    $row['driver_position'] = [
                        'lat' => $position['latitude'],
                        'lon' => $position['longitude'],
                        'timestamp' => $position['timestamp']
                    ];
                }
            }

            $routes[] = $row;
        }

        echo json_encode([
            'success' => true,
            'routes' => $routes
        ]);
        break;

    case 'deleteRoute':
        # This handles deleting a route

        # Get token from query string
        $token = isset($_GET['token']) ? $_GET['token'] : '';

        if (empty($token)) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing token']);
            break;
        }

        # Get route ID for cleanup of related records
        $stmt = $db->prepare('SELECT id, driver_id FROM routes WHERE token = :token');
        $stmt->bindValue(':token', $token);
        $result = $stmt->execute();
        $route = $result->fetchArray(SQLITE3_ASSOC);

        if ($route) {
            # Delete related activities
            $db->prepare('DELETE FROM activities WHERE route_id = :route_id')->bindValue(':route_id', $route['id'])->execute();

            # Delete related positions
            $db->prepare('DELETE FROM positions WHERE route_id = :route_id')->bindValue(':route_id', $route['id'])->execute();

            # Log activity for the driver if assigned
            if ($route['driver_id']) {
                $activityStmt = $db->prepare('
                    INSERT INTO activities (driver_id, type, message)
                    VALUES (:driver_id, :type, :message)
                ');

                $activityStmt->bindValue(':driver_id', $route['driver_id']);
                $activityStmt->bindValue(':type', 'route_deleted');
                $activityStmt->bindValue(':message', 'Route was deleted');
                $activityStmt->execute();
            }
        }

        # Delete the route
        $stmt = $db->prepare('DELETE FROM routes WHERE token = :token');
        $stmt->bindValue(':token', $token);
        $result = $stmt->execute();

        echo json_encode([
            'success' => true,
            'message' => 'Route deleted successfully'
        ]);
        break;

    // =============================================
    // DRIVER OPERATIONS
    // =============================================

    case 'createDriver':
        # This handles creating a new driver

        # Get POST data
        $postData = $_POST;
        if (empty($postData)) {
            $jsonData = file_get_contents('php://input');
            $postData = json_decode($jsonData, true) ?: [];
        }

        # Validate required fields
        if (empty($postData['name'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Driver name is required']);
            break;
        }

        # Generate initials if not provided
        if (empty($postData['initials'])) {
            $nameParts = explode(' ', $postData['name']);
            $initials = '';
            foreach ($nameParts as $part) {
                if (!empty($part)) {
                    $initials .= strtoupper(substr($part, 0, 1));
                }
            }
            $postData['initials'] = $initials;
        }

        # Generate unique token
        $token = generateToken();

        # Prepare and execute database insert
        $stmt = $db->prepare('
            INSERT INTO drivers (
                token, name, phone, email, initials, status
            ) VALUES (
                :token, :name, :phone, :email, :initials, :status
            )
        ');

        # Bind parameters
        $stmt->bindValue(':token', $token);
        $stmt->bindValue(':name', $postData['name']);
        $stmt->bindValue(':phone', $postData['phone'] ?? null);
        $stmt->bindValue(':email', $postData['email'] ?? null);
        $stmt->bindValue(':initials', $postData['initials']);
        $stmt->bindValue(':status', $postData['status'] ?? 'available');

        # Execute statement
        $result = $stmt->execute();

        if ($result) {
            # Return success response with token
            echo json_encode([
                'success' => true,
                'token' => $token,
                'driver_id' => $db->lastInsertRowID(),
                'message' => 'Driver created successfully'
            ]);
        } else {
            # Return error if insert failed
            http_response_code(500);
            echo json_encode(['error' => 'Failed to create driver']);
        }
        break;

    case 'updateDriver':
        # This handles updating an existing driver

        # Get token from query string
        $token = isset($_GET['token']) ? $_GET['token'] : '';

        if (empty($token)) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing token']);
            break;
        }

        # Get POST data
        $postData = $_POST;
        if (empty($postData)) {
            $jsonData = file_get_contents('php://input');
            $postData = json_decode($jsonData, true) ?: [];
        }

        # Prepare update statement with only the fields that are provided
        $updateFields = [];
        $params = [];

        if (isset($postData['name'])) {
            $updateFields[] = 'name = :name';
            $params[':name'] = $postData['name'];

            # Update initials if name changed and initials not specified
            if (!isset($postData['initials'])) {
                $nameParts = explode(' ', $postData['name']);
                $initials = '';
                foreach ($nameParts as $part) {
                    if (!empty($part)) {
                        $initials .= strtoupper(substr($part, 0, 1));
                    }
                }
                $updateFields[] = 'initials = :initials';
                $params[':initials'] = $initials;
            }
        }

        if (isset($postData['phone'])) {
            $updateFields[] = 'phone = :phone';
            $params[':phone'] = $postData['phone'];
        }

        if (isset($postData['email'])) {
            $updateFields[] = 'email = :email';
            $params[':email'] = $postData['email'];
        }

        if (isset($postData['initials'])) {
            $updateFields[] = 'initials = :initials';
            $params[':initials'] = $postData['initials'];
        }

        if (isset($postData['status'])) {
            $updateFields[] = 'status = :status';
            $params[':status'] = $postData['status'];
        }

        # If no fields to update, return success without doing anything
        if (empty($updateFields)) {
            echo json_encode([
                'success' => true,
                'message' => 'No changes to update'
            ]);
            break;
        }

        # Build the SQL update statement
        $sql = 'UPDATE drivers SET ' . implode(', ', $updateFields) . ' WHERE token = :token';
        $params[':token'] = $token;

        # Prepare and execute the update
        $stmt = $db->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }

        $result = $stmt->execute();

        if ($result) {
            echo json_encode([
                'success' => true,
                'message' => 'Driver updated successfully'
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to update driver']);
        }
        break;

    case 'getDriver':
        # This retrieves a driver by token

        # Get token from query string
        $token = isset($_GET['token']) ? $_GET['token'] : '';

        if (empty($token)) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing token']);
            break;
        }

        # Prepare and execute query
        $stmt = $db->prepare('SELECT * FROM drivers WHERE token = :token');
        $stmt->bindValue(':token', $token);
        $result = $stmt->execute();
        $driver = $result->fetchArray(SQLITE3_ASSOC);

        if ($driver) {
            # Get driver's current position
            $posStmt = $db->prepare('
                SELECT latitude, longitude, accuracy, speed, heading, timestamp 
                FROM positions 
                WHERE driver_id = :driver_id 
                ORDER BY timestamp DESC 
                LIMIT 1
            ');
            $posStmt->bindValue(':driver_id', $driver['id']);
            $posResult = $posStmt->execute();
            $position = $posResult->fetchArray(SQLITE3_ASSOC);

            # Get driver's current/active route
            $routeStmt = $db->prepare('
                SELECT token, name, pickup_address, delivery_address, status 
                FROM routes 
                WHERE driver_id = :driver_id AND status IN ("pending", "in_progress", "loading", "unloading")
                ORDER BY created_at DESC 
                LIMIT 1
            ');
            $routeStmt->bindValue(':driver_id', $driver['id']);
            $routeResult = $routeStmt->execute();
            $route = $routeResult->fetchArray(SQLITE3_ASSOC);

            # Get recent activities
            $actStmt = $db->prepare('
                SELECT type, message, timestamp 
                FROM activities 
                WHERE driver_id = :driver_id 
                ORDER BY timestamp DESC 
                LIMIT 10
            ');
            $actStmt->bindValue(':driver_id', $driver['id']);
            $actResult = $actStmt->execute();

            $activities = [];
            while ($activity = $actResult->fetchArray(SQLITE3_ASSOC)) {
                $activities[] = $activity;
            }

            # Construct response
            $response = [
                'id' => $driver['id'],
                'token' => $driver['token'],
                'name' => $driver['name'],
                'phone' => $driver['phone'],
                'email' => $driver['email'],
                'initials' => $driver['initials'],
                'status' => $driver['status'],
                'created_at' => $driver['created_at'],
                'activities' => $activities
            ];

            if ($position) {
                $response['position'] = [
                    'lat' => $position['latitude'],
                    'lon' => $position['longitude'],
                    'accuracy' => $position['accuracy'],
                    'speed' => $position['speed'],
                    'heading' => $position['heading'],
                    'timestamp' => $position['timestamp']
                ];
            }

            if ($route) {
                $response['current_route'] = $route;
            }

            echo json_encode($response);
        } else {
            # Driver not found
            http_response_code(404);
            echo json_encode(['error' => 'Driver not found']);
        }
        break;

    case 'getAllDrivers':
        $page = max(1, intval($_GET['page'] ?? 1));
        $limit = max(10, min(100, intval($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;
        $statusFilter = $_GET['status'] ?? '';

        $sql = "SELECT * FROM drivers";
        $params = [];

        if (!empty($statusFilter)) {
            $sql .= " WHERE status = :status";
            $params[':status'] = $statusFilter;
        }

        $sql .= " ORDER BY name ASC LIMIT $limit OFFSET $offset";

        // ... rest of existing code ...

        echo json_encode([
            'success' => true,
            'drivers' => $drivers,
            'pagination' => [
                'page' => $page,
                'limit' => $limit,
                'total' => $db->querySingle("SELECT COUNT(*) FROM drivers" . ($statusFilter ? " WHERE status = '$statusFilter'" : ""))
            ]
        ]);
        break;
        # This returns a list of all drivers

        # Optional filter by status
        $statusFilter = isset($_GET['status']) ? $_GET['status'] : '';

        # Build query based on filters
        $sql = 'SELECT * FROM drivers';
        $params = [];

        if (!empty($statusFilter)) {
            $sql .= ' WHERE status = :status';
            $params[':status'] = $statusFilter;
        }

        $sql .= ' ORDER BY name ASC';

        # Prepare and execute query
        $stmt = $db->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }

        $result = $stmt->execute();

        $drivers = [];
        while ($driver = $result->fetchArray(SQLITE3_ASSOC)) {
            # Get latest position
            $posStmt = $db->prepare('
                SELECT latitude, longitude, timestamp 
                FROM positions 
                WHERE driver_id = :driver_id 
                ORDER BY timestamp DESC 
                LIMIT 1
            ');
            $posStmt->bindValue(':driver_id', $driver['id']);
            $posResult = $posStmt->execute();
            $position = $posResult->fetchArray(SQLITE3_ASSOC);

            # Get current route
            $routeStmt = $db->prepare('
                SELECT token, name, status 
                FROM routes 
                WHERE driver_id = :driver_id AND status IN ("pending", "in_progress", "loading", "unloading")
                ORDER BY created_at DESC 
                LIMIT 1
            ');
            $routeStmt->bindValue(':driver_id', $driver['id']);
            $routeResult = $routeStmt->execute();
            $route = $routeResult->fetchArray(SQLITE3_ASSOC);

            # Add position and route info if available
            if ($position) {
                $driver['position'] = [
                    'lat' => $position['latitude'],
                    'lon' => $position['longitude'],
                    'timestamp' => $position['timestamp']
                ];
            }

            if ($route) {
                $driver['current_route'] = $route;
            }

            $drivers[] = $driver;
        }

        echo json_encode([
            'success' => true,
            'drivers' => $drivers
        ]);
        break;

    case 'deleteDriver':
        # This handles deleting a driver

        # Get token from query string
        $token = isset($_GET['token']) ? $_GET['token'] : '';

        if (empty($token)) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing token']);
            break;
        }

        # Get driver ID for cleanup and validation
        $stmt = $db->prepare('SELECT id FROM drivers WHERE token = :token');
        $stmt->bindValue(':token', $token);
        $result = $stmt->execute();
        $driver = $result->fetchArray(SQLITE3_ASSOC);

        if (!$driver) {
            http_response_code(404);
            echo json_encode(['error' => 'Driver not found']);
            break;
        }

        # Check if driver has any active routes
        $routeStmt = $db->prepare('
            SELECT COUNT(*) as route_count 
            FROM routes 
            WHERE driver_id = :driver_id AND status IN ("pending", "in_progress", "loading", "unloading")
        ');
        $routeStmt->bindValue(':driver_id', $driver['id']);
        $routeResult = $routeStmt->execute();
        $routeCount = $routeResult->fetchArray(SQLITE3_ASSOC)['route_count'];

        if ($routeCount > 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Cannot delete driver with active routes']);
            break;
        }

        # Delete related records
        $db->prepare('DELETE FROM activities WHERE driver_id = :driver_id')->bindValue(':driver_id', $driver['id'])->execute();
        $db->prepare('DELETE FROM positions WHERE driver_id = :driver_id')->bindValue(':driver_id', $driver['id'])->execute();

        # Update any routes to remove this driver
        $db->prepare('UPDATE routes SET driver_id = NULL WHERE driver_id = :driver_id')
            ->bindValue(':driver_id', $driver['id'])
            ->execute();

        # Delete the driver
        $stmt = $db->prepare('DELETE FROM drivers WHERE token = :token');
        $stmt->bindValue(':token', $token);
        $result = $stmt->execute();

        echo json_encode([
            'success' => true,
            'message' => 'Driver deleted successfully'
        ]);
        break;

    // =============================================
    // POSITION TRACKING
    // =============================================

    case 'updatePosition':
        # This handles updating a driver's position

        # Get POST data
        $postData = $_POST;
        if (empty($postData)) {
            $jsonData = file_get_contents('php://input');
            $postData = json_decode($jsonData, true) ?: [];
        }

        # Validate required fields
        if (empty($postData['driver_id']) || !isset($postData['latitude']) || !isset($postData['longitude'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required fields']);
            break;
        }

        # Check if driver exists
        $driverStmt = $db->prepare('SELECT id FROM drivers WHERE id = :driver_id');
        $driverStmt->bindValue(':driver_id', $postData['driver_id']);
        $driverResult = $driverStmt->execute();
        $driver = $driverResult->fetchArray(SQLITE3_ASSOC);

        if (!$driver) {
            http_response_code(404);
            echo json_encode(['error' => 'Driver not found']);
            break;
        }

        # Get active route ID if any
        $routeId = null;
        $routeStmt = $db->prepare('
            SELECT id FROM routes 
            WHERE driver_id = :driver_id AND status IN ("pending", "in_progress", "loading", "unloading")
            ORDER BY created_at DESC 
            LIMIT 1
        ');
        $routeStmt->bindValue(':driver_id', $postData['driver_id']);
        $routeResult = $routeStmt->execute();
        $route = $routeResult->fetchArray(SQLITE3_ASSOC);

        if ($route) {
            $routeId = $route['id'];
        }

        # Prepare and execute database insert
        $stmt = $db->prepare('
            INSERT INTO positions (
                driver_id, route_id, latitude, longitude, accuracy, speed, heading
            ) VALUES (
                :driver_id, :route_id, :latitude, :longitude, :accuracy, :speed, :heading
            )
        ');

        # Bind parameters
        $stmt->bindValue(':driver_id', $postData['driver_id']);
        $stmt->bindValue(':route_id', $routeId);
        $stmt->bindValue(':latitude', $postData['latitude']);
        $stmt->bindValue(':longitude', $postData['longitude']);
        $stmt->bindValue(':accuracy', $postData['accuracy'] ?? null);
        $stmt->bindValue(':speed', $postData['speed'] ?? null);
        $stmt->bindValue(':heading', $postData['heading'] ?? null);

        # Execute statement
        $result = $stmt->execute();

        if ($result) {
            echo json_encode([
                'success' => true,
                'message' => 'Position updated successfully'
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to update position']);
        }
        break;

    case 'getPositions':
        # This retrieves position history for a driver

        # Get driver ID from query string
        $driverId = isset($_GET['driver_id']) ? $_GET['driver_id'] : '';
        $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 100;

        if (empty($driverId)) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing driver_id']);
            break;
        }

        # Prepare and execute query
        $stmt = $db->prepare('
            SELECT latitude, longitude, accuracy, speed, heading, timestamp 
            FROM positions 
            WHERE driver_id = :driver_id 
            ORDER BY timestamp DESC 
            LIMIT :limit
        ');
        $stmt->bindValue(':driver_id', $driverId);
        $stmt->bindValue(':limit', $limit, SQLITE3_INTEGER);
        $result = $stmt->execute();

        $positions = [];
        while ($position = $result->fetchArray(SQLITE3_ASSOC)) {
            $positions[] = $position;
        }

        echo json_encode([
            'success' => true,
            'positions' => $positions
        ]);
        break;

    // =============================================
    // ACTIVITY LOGGING
    // =============================================

    case 'logActivity':
        # This handles logging a driver activity

        # Get POST data
        $postData = $_POST;
        if (empty($postData)) {
            $jsonData = file_get_contents('php://input');
            $postData = json_decode($jsonData, true) ?: [];
        }

        # Validate required fields
        if (empty($postData['driver_id']) || empty($postData['type']) || empty($postData['message'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required fields']);
            break;
        }

        # Check if driver exists
        $driverStmt = $db->prepare('SELECT id FROM drivers WHERE id = :driver_id');
        $driverStmt->bindValue(':driver_id', $postData['driver_id']);
        $driverResult = $driverStmt->execute();
        $driver = $driverResult->fetchArray(SQLITE3_ASSOC);

        if (!$driver) {
            http_response_code(404);
            echo json_encode(['error' => 'Driver not found']);
            break;
        }

        # Get active route ID if any and not provided
        $routeId = $postData['route_id'] ?? null;
        if (!$routeId) {
            $routeStmt = $db->prepare('
                SELECT id FROM routes 
                WHERE driver_id = :driver_id AND status IN ("pending", "in_progress", "loading", "unloading")
                ORDER BY created_at DESC 
                LIMIT 1
            ');
            $routeStmt->bindValue(':driver_id', $postData['driver_id']);
            $routeResult = $routeStmt->execute();
            $route = $routeResult->fetchArray(SQLITE3_ASSOC);

            if ($route) {
                $routeId = $route['id'];
            }
        }

        # Prepare and execute database insert
        $stmt = $db->prepare('
            INSERT INTO activities (
                driver_id, route_id, type, message
            ) VALUES (
                :driver_id, :route_id, :type, :message
            )
        ');

        # Bind parameters
        $stmt->bindValue(':driver_id', $postData['driver_id']);
        $stmt->bindValue(':route_id', $routeId);
        $stmt->bindValue(':type', $postData['type']);
        $stmt->bindValue(':message', $postData['message']);

        # Execute statement
        $result = $stmt->execute();

        if ($result) {
            echo json_encode([
                'success' => true,
                'message' => 'Activity logged successfully'
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to log activity']);
        }
        break;

    case 'getActivities':
        # This retrieves activity history

        # Get filter parameters
        $driverId = isset($_GET['driver_id']) ? $_GET['driver_id'] : null;
        $routeId = isset($_GET['route_id']) ? $_GET['route_id'] : null;
        $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 50;

        # Build query based on filters
        $sql = 'SELECT a.*, d.name as driver_name FROM activities a LEFT JOIN drivers d ON a.driver_id = d.id';
        $where = [];
        $params = [];

        if ($driverId) {
            $where[] = 'a.driver_id = :driver_id';
            $params[':driver_id'] = $driverId;
        }

        if ($routeId) {
            $where[] = 'a.route_id = :route_id';
            $params[':route_id'] = $routeId;
        }

        if (!empty($where)) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }

        $sql .= ' ORDER BY a.timestamp DESC LIMIT :limit';
        $params[':limit'] = $limit;

        # Prepare and execute query
        $stmt = $db->prepare($sql);
        foreach ($params as $key => $value) {
            if ($key === ':limit') {
                $stmt->bindValue($key, $value, SQLITE3_INTEGER);
            } else {
                $stmt->bindValue($key, $value);
            }
        }
        $result = $stmt->execute();

        $activities = [];
        while ($activity = $result->fetchArray(SQLITE3_ASSOC)) {
            $activities[] = $activity;
        }

        echo json_encode([
            'success' => true,
            'activities' => $activities
        ]);
        break;
    case 'cleanup':
        // Auth check (only allow from CLI or with admin key)
        if (php_sapi_name() !== 'cli' && ($_GET['key'] ?? '') !== 'YOUR_SECRET_CLEANUP_KEY') {
            http_response_code(403);
            die(json_encode(['error' => 'Unauthorized']));
        }

        $daysToKeep = 30;
        $timestamp = date('Y-m-d H:i:s', strtotime("-$daysToKeep days"));

        // Delete old routes and cascade to positions/activities
        $db->exec("DELETE FROM routes WHERE created_at < '$timestamp'");

        // Orphaned positions (no route/driver)
        $db->exec("DELETE FROM positions WHERE route_id NOT IN (SELECT id FROM routes) AND driver_id NOT IN (SELECT id FROM drivers)");

        // Orphaned activities
        $db->exec("DELETE FROM activities WHERE route_id NOT IN (SELECT id FROM routes) AND driver_id NOT IN (SELECT id FROM drivers)");

        echo json_encode(['success' => true, 'deleted' => $db->changes()]);
        break;
    default:
        # Handle invalid API action
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action']);
}

# Close database connection
$db->close();

/**
 * Generate a random secure token
 * @return string Random token
 */
function generateToken()
{
    return bin2hex(random_bytes(16));
}


# Rate limiting (100 requests/minute per IP)
$redis = new Redis();
try {
    $redis->connect('127.0.0.1', 6379);
    $ip = $_SERVER['REMOTE_ADDR'];
    $key = "rate_limit:$ip";

    $current = $redis->get($key);
    if ($current && $current >= 100) {
        http_response_code(429);
        die(json_encode(['error' => 'Too many requests - limit 100/minute']));
    }

    $redis->multi()
        ->incr($key)
        ->expire($key, 60)
        ->exec();
} catch (Exception $e) {
    // Fallthrough if Redis fails
}

# SQLite fallback rate limiting
$db->exec('CREATE TABLE IF NOT EXISTS rate_limits (
    ip TEXT PRIMARY KEY,
    count INTEGER,
    last_update INTEGER
)');

$ip = SQLite3::escapeString($_SERVER['REMOTE_ADDR']);
$now = time();
$window = 60; // 1 minute

$result = $db->querySingle("SELECT count, last_update FROM rate_limits WHERE ip = '$ip'", true);
if ($result && $now - $result['last_update'] < $window) {
    if ($result['count'] >= 100) {
        http_response_code(429);
        die(json_encode(['error' => 'Too many requests']));
    }
    $db->exec("UPDATE rate_limits SET count = count + 1 WHERE ip = '$ip'");
} else {
    $db->exec("INSERT OR REPLACE INTO rate_limits VALUES ('$ip', 1, $now)");
}
