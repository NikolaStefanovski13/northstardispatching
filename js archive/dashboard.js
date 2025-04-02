// =================================================================
// DASHBOARD CONFIGURATION
// =================================================================

const API_ENDPOINTS = {
    getAllRoutes: 'api.php?action=getAllRoutes',
    getRoute: 'api.php?action=getRoute',
    deleteRoute: 'api.php?action=deleteRoute'
};

let map, routeLayer;

// =================================================================
// INITIALIZATION
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard initialized');
    
    // Initialize map
    initMap();
    
    // Fetch all routes on load
    fetchAllRoutes();
    
    // Set up event listeners
    setupEventListeners();
});

/**
 * Initialize the Leaflet map
 */
function initMap() {
    // Create map instance if the map element exists
    const mapElement = document.getElementById('map');
    if (!mapElement) return;
    
    map = L.map('map').setView([39.8283, -98.5795], 4); // US center
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    routeLayer = L.layerGroup().addTo(map);
}

/**
 * Set up all event listeners for the dashboard
 */
function setupEventListeners() {
    // Refresh button
    const refreshButton = document.getElementById('refreshRoutes');
    if (refreshButton) {
        refreshButton.addEventListener('click', fetchAllRoutes);
    }
    
    // Close route detail panel
    const closeDetailButton = document.getElementById('closeRouteDetail');
    if (closeDetailButton) {
        closeDetailButton.addEventListener('click', () => {
            document.getElementById('routeDetailPanel').classList.add('hidden');
        });
    }
    
    // Copy link button
    const copyLinkButton = document.getElementById('detailCopyLink');
    if (copyLinkButton) {
        copyLinkButton.addEventListener('click', () => {
            const linkInput = document.getElementById('detailShareLink');
            if (linkInput) {
                linkInput.select();
                document.execCommand('copy');
                
                // Show feedback
                const originalText = copyLinkButton.textContent;
                copyLinkButton.textContent = 'Copied!';
                setTimeout(() => {
                    copyLinkButton.textContent = originalText;
                }, 2000);
            }
        });
    }
    
    // Delete route button
    const deleteButton = document.getElementById('deleteRoute');
    if (deleteButton) {
        deleteButton.addEventListener('click', () => {
            const token = deleteButton.dataset.token;
            if (token && confirm('Are you sure you want to delete this route?')) {
                deleteRoute(token);
            }
        });
    }
    
    // Edit route button
    const editButton = document.getElementById('editRoute');
    if (editButton) {
        editButton.addEventListener('click', () => {
            const token = editButton.dataset.token;
            if (token) {
                window.location.href = `index.html?edit=${token}`;
            }
        });
    }
}

// =================================================================
// DATA FETCHING
// =================================================================

/**
 * Fetch all routes from the server
 */
async function fetchAllRoutes() {
    try {
        const tableBody = document.getElementById('routesTableBody');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-sm text-gray-500">Loading routes...</td></tr>';
        }
        
        // First try API endpoint
        try {
            const response = await fetch(API_ENDPOINTS.getAllRoutes);
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.routes) {
                    displayAllRoutes(data.routes);
                    return;
                }
            }
        } catch (apiError) {
            console.error('API error:', apiError);
            // Fall back to localStorage if API fails
        }
        
        // Fallback: Get routes from localStorage
        const routes = getRoutesFromLocalStorage();
        displayAllRoutes(routes);
        
    } catch (error) {
        console.error('Error fetching routes:', error);
        const tableBody = document.getElementById('routesTableBody');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-sm text-gray-500">Error loading routes: ${error.message}</td></tr>`;
        }
    }
}

/**
 * Get all routes stored in localStorage
 * @returns {Array} Array of route objects
 */
function getRoutesFromLocalStorage() {
    const routes = [];
    
    // Loop through localStorage to find route entries
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('route_')) {
            try {
                const token = key.replace('route_', '');
                const routeData = JSON.parse(localStorage.getItem(key));
                
                // Add minimal information for the table
                routes.push({
                    token: token,
                    name: routeData.name,
                    pickup_address: routeData.pickup,
                    delivery_address: routeData.delivery,
                    created_at: routeData.created_at || new Date().toISOString()
                });
            } catch (error) {
                console.error('Error parsing route from localStorage:', error);
            }
        }
    }
    
    // Sort by created_at date (newest first)
    routes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    return routes;
}

/**
 * Fetch a single route by token
 * @param {string} token - Route token
 */
async function fetchRouteDetails(token) {
    try {
        // First try API endpoint
        try {
            const response = await fetch(`${API_ENDPOINTS.getRoute}&token=${token}`);
            if (response.ok) {
                const data = await response.json();
                displayRouteDetails(data);
                return;
            }
        } catch (apiError) {
            console.error('API error:', apiError);
            // Fall back to localStorage if API fails
        }
        
        // Fallback: Get route from localStorage
        const routeData = localStorage.getItem(`route_${token}`);
        if (routeData) {
            displayRouteDetails(JSON.parse(routeData));
        } else {
            alert('Route not found');
        }
        
    } catch (error) {
        console.error('Error fetching route details:', error);
        alert('Error loading route details');
    }
}

/**
 * Delete a route by token
 * @param {string} token - Route token
 */
async function deleteRoute(token) {
    try {
        // First try API endpoint
        try {
            const response = await fetch(`${API_ENDPOINTS.deleteRoute}&token=${token}`);
            if (response.ok) {
                // Route deleted successfully from API
                // Remove from localStorage as well
                localStorage.removeItem(`route_${token}`);
                
                alert('Route deleted successfully');
                
                // Close detail panel and refresh routes list
                document.getElementById('routeDetailPanel').classList.add('hidden');
                fetchAllRoutes();
                return;
            }
        } catch (apiError) {
            console.error('API error:', apiError);
            // Fall back to localStorage if API fails
        }
        
        // Fallback: Delete from localStorage only
        localStorage.removeItem(`route_${token}`);
        alert('Route deleted successfully');
        
        // Close detail panel and refresh routes list
        document.getElementById('routeDetailPanel').classList.add('hidden');
        fetchAllRoutes();
        
    } catch (error) {
        console.error('Error deleting route:', error);
        alert('Error deleting route');
    }
}

// =================================================================
// UI RENDERING
// =================================================================

/**
 * Display all routes in the table
 * @param {Array} routes - Array of route objects
 */
function displayAllRoutes(routes) {
    const tableBody = document.getElementById('routesTableBody');
    if (!tableBody) return;
    
    if (!routes || routes.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-sm text-gray-500">No routes found</td></tr>';
        return;
    }
    
    tableBody.innerHTML = '';
    
    routes.forEach(route => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        
        // Format date from ISO to readable format
        let dateDisplay = 'Unknown date';
        if (route.created_at) {
            try {
                const date = new Date(route.created_at);
                dateDisplay = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } catch (e) {
                console.error('Error formatting date:', e);
            }
        }
        
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">${route.name}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-500">${route.pickup_address}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-500">${route.delivery_address}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-500">${dateDisplay}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button class="text-blue-600 hover:text-blue-900 view-route" data-token="${route.token}">View</button>
                <button class="ml-3 text-red-600 hover:text-red-900 delete-route" data-token="${route.token}">Delete</button>
            </td>
        `;
        
        tableBody.appendChild(row);
        
        // Add event listeners to buttons
        const viewButton = row.querySelector('.view-route');
        if (viewButton) {
            viewButton.addEventListener('click', () => {
                fetchRouteDetails(route.token);
            });
        }
        
        const deleteButton = row.querySelector('.delete-route');
        if (deleteButton) {
            deleteButton.addEventListener('click', () => {
                if (confirm('Are you sure you want to delete this route?')) {
                    deleteRoute(route.token);
                }
            });
        }
    });
}

/**
 * Display route details in the detail panel
 * @param {Object} routeData - Route data object
 */
function displayRouteDetails(routeData) {
    if (!routeData) return;
    
    // Set route token on buttons
    const deleteButton = document.getElementById('deleteRoute');
    const editButton = document.getElementById('editRoute');
    if (deleteButton) deleteButton.dataset.token = routeData.token;
    if (editButton) editButton.dataset.token = routeData.token;
    
    // Update title
    const titleElement = document.getElementById('detailRouteTitle');
    if (titleElement) titleElement.textContent = routeData.name;
    
    // Update route details
    document.getElementById('detailDistance').textContent = formatDistance(routeData.distance);
    document.getElementById('detailDuration').textContent = formatDuration(routeData.duration);
    document.getElementById('detailPickup').textContent = routeData.pickup || routeData.pickup_address;
    document.getElementById('detailDelivery').textContent = routeData.delivery || routeData.delivery_address;
    document.getElementById('detailTruckHeight').textContent = routeData.truck?.height ? `${routeData.truck.height} ft` : 'Not specified';
    document.getElementById('detailTruckWeight').textContent = routeData.truck?.weight ? `${routeData.truck.weight} tons` : 'Not specified';
    document.getElementById('detailNotes').textContent = routeData.notes || 'No notes provided';
    
    // Set share link
    document.getElementById('detailShareLink').value = `${window.location.origin}/northstar/driver.html?token=${routeData.token}`;
    
    // Display directions
    displayDirections(routeData.directions);
    
    // Show route on map
    displayRouteOnMap(routeData);
    
    // Show detail panel
    document.getElementById('routeDetailPanel').classList.remove('hidden');
    
    // Scroll to detail panel
    document.getElementById('routeDetailPanel').scrollIntoView({ behavior: 'smooth' });
}

/**
 * Display directions in the detail panel
 * @param {Array} directions - Array of direction objects
 */
function displayDirections(directions) {
    const directionsList = document.getElementById('detailDirections');
    if (!directionsList) return;
    
    directionsList.innerHTML = '';
    
    if (!directions || directions.length === 0) {
        directionsList.innerHTML = '<li class="p-2 bg-gray-50 rounded-md">No directions available</li>';
        return;
    }
    
    directions.forEach((direction, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'p-2 bg-gray-50 rounded-md';
        listItem.innerHTML = `
            <div class="flex items-start">
                <span class="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs mr-2 flex-shrink-0">${index + 1}</span>
                <div>
                    <p class="text-sm font-medium">${direction.instruction}</p>
                    <p class="text-xs text-gray-500">${direction.distance} miles</p>
                </div>
            </div>
        `;
        directionsList.appendChild(listItem);
    });
}

/**
 * Display route on the map
 * @param {Object} routeData - Route data object
 */
function displayRouteOnMap(routeData) {
    if (!map || !routeLayer) return;
    
    // Clear existing layers
    routeLayer.clearLayers();
    
    // Check if we have coordinates
    const hasPickupCoords = routeData.coordinates?.pickup || 
                           (routeData.pickup_lat && routeData.pickup_lon);
    
    const hasDeliveryCoords = routeData.coordinates?.delivery || 
                             (routeData.delivery_lat && routeData.delivery_lon);
    
    if (!hasPickupCoords || !hasDeliveryCoords) {
        console.error('Missing coordinates for route');
        return;
    }
    
    // Get pickup coordinates
    const pickupCoords = routeData.coordinates?.pickup || 
                       [parseFloat(routeData.pickup_lat), parseFloat(routeData.pickup_lon)];
    
    // Get delivery coordinates
    const deliveryCoords = routeData.coordinates?.delivery || 
                         [parseFloat(routeData.delivery_lat), parseFloat(routeData.delivery_lon)];
    
    // Add pickup marker
    const pickupMarker = L.marker(pickupCoords).addTo(routeLayer);
    pickupMarker.bindPopup(`<b>Pickup:</b> ${routeData.pickup || routeData.pickup_address}`);
    
    // Add delivery marker
    const deliveryMarker = L.marker(deliveryCoords).addTo(routeLayer);
    deliveryMarker.bindPopup(`<b>Delivery:</b> ${routeData.delivery || routeData.delivery_address}`);
    
    // Draw route on map
    if (routeData.geometry && routeData.geometry.coordinates) {
        // Use actual route geometry
        const routeCoordinates = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        
        const routeLine = L.polyline(routeCoordinates, {
            color: 'blue',
            weight: 4,
            opacity: 0.7
        }).addTo(routeLayer);
        
        // Fit map to route bounds
        map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
    } else {
        // Fallback to simple direct line
        const routeLine = L.polyline([pickupCoords, deliveryCoords], {
            color: 'blue',
            weight: 4,
            opacity: 0.7,
            dashArray: '5, 10' // Dashed line to indicate it's not a real route
        }).addTo(routeLayer);
        
        // Fit map to route bounds
        map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
    }
}

// =================================================================
// UTILITY FUNCTIONS
// =================================================================

/**
 * Format distance in miles
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted distance
 */
function formatDistance(meters) {
    if (!meters) return 'Unknown';
    
    const miles = meters / 1609.34;
    return miles.toFixed(1) + ' miles';
}

/**
 * Format duration in hours and minutes
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
function formatDuration(seconds) {
    if (!seconds) return 'Unknown';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours} hr ${minutes} min`;
    }
    return `${minutes} min`;
}
