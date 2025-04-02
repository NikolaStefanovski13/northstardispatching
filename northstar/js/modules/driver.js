import { API_ENDPOINTS } from '../core/config.js';
import { debug, formatDistance, formatDuration, formatStatus, getStatusColor, calculateDistance } from '../core/utils.js';

// Global variables for navigation
let currentPosition = null;
let currentRouteData = null;
let lastAnnouncedDirection = -1;
let map, routeLayer;
let voiceEnabled = true;

/**
 * Initialize the driver interface
 */
function initDriverInterface() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return; // Not on the driver page
    
    // Get token from URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (!token) {
        alert('Invalid route link. Please ask for a new link.');
        return;
    }
    
    debug('Initializing driver interface with token:', token);
    
    // Initialize map
    initMap();
    
    // Get route data
    loadRouteData(token);
    
    // Set up UI controls
    setupDriverControls();
    
    // Add status controls
    addStatusControls();
    
    // Check if simulation mode
    const simulationMode = urlParams.get('simulation');
    if (simulationMode === 'true') {
        import('./simulation.js').then(module => {
            module.startTruckHazardSimulation();
        });
    }
}

/**
 * Initialize map on the driver page
 */
function initMap() {
    map = L.map('map').setView([39.8283, -98.5795], 4);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    routeLayer = L.layerGroup().addTo(map);
    
    debug('Map initialized');
}

/**
 * Load route data by token
 */
function loadRouteData(token) {
    debug('Attempting to load route with token:', token);
    
    // First try to get from API
    fetch(`${API_ENDPOINTS.getRoute}&token=${token}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('API request failed');
            }
            return response.json();
        })
        .then(routeData => {
            if (routeData.error) {
                throw new Error(routeData.error);
            }
            
            debug('Found route data from API');
            displayRoute(routeData);
            updateDriverUI(routeData);
        })
        .catch(apiError => {
            debug('Error loading from API:', apiError.message);
            
            // Fall back to localStorage
            const storedRoute = localStorage.getItem(`route_${token}`);
            
            if (storedRoute) {
                try {
                    debug('Found stored route data');
                    const routeData = JSON.parse(storedRoute);
                    displayRoute(routeData);
                    updateDriverUI(routeData);
                    return;
                } catch (error) {
                    debug('Error parsing stored route:', error.message);
                }
            } else {
                debug('No route found in localStorage for token:', token);
            }
            
            // Fall back to a simulated route
            debug('Using simulated route data instead');
            simulateRouteData(token);
        });
}

/**
 * Simulate route data for demo purposes
 */
function simulateRouteData(token) {
    debug('Simulating route data for token:', token);
    
    // Simulate API call to get route data
    setTimeout(() => {
        const routeData = {
            name: 'Chicago to Detroit',
            pickup: {
                address: '123 Main St, Chicago, IL',
                lat: 41.8781,
                lon: -87.6298
            },
            delivery: {
                address: '456 Elm St, Detroit, MI', 
                lat: 42.3314,
                lon: -83.0458
            },
            notes: 'Call customer 30 minutes before arrival. Security gate code: 1234.',
            distance: 453580, // meters
            duration: 16200, // seconds
            status: 'pending',
            directions: [
                { instruction: 'Head east on Washington St', distance: 0.5 },
                { instruction: 'Turn right onto Michigan Ave', distance: 1.2 },
                { instruction: 'Continue onto I-94 E', distance: 50 },
                { instruction: 'Take exit 194 for I-69 N', distance: 0.3 },
                { instruction: 'Merge onto I-69 N', distance: 25.7 },
                { instruction: 'Take exit 33 toward Detroit', distance: 0.5 },
                { instruction: 'Turn left onto Elm St', distance: 0.2 }
            ],
            routePreferences: {
                avoidWeighStations: false,
                showWeighStations: true,
                weighStationAlerts: true
            }
        };
        
        // Store in localStorage for testing
        localStorage.setItem(`route_${token}`, JSON.stringify(routeData));
        debug('Simulated route stored in localStorage');
        
        // Update UI with route information
        displayRoute(routeData);
        updateDriverUI(routeData);
    }, 1000);
}

/**
 * Display a route on the map
 */
function displayRoute(routeData) {
    if (!map || !routeLayer) return;
    
    debug('Displaying route on map', routeData);
    currentRouteData = routeData;

    
    // Clear existing route
    routeLayer.clearLayers();
    
    // Check if we have valid coordinates
    const hasPickupCoords = routeData.pickup && (routeData.pickup.lat !== undefined && routeData.pickup.lon !== undefined);
    const hasDeliveryCoords = routeData.delivery && (routeData.delivery.lat !== undefined && routeData.delivery.lon !== undefined);
    
    if (!hasPickupCoords || !hasDeliveryCoords) {
        debug('Invalid coordinates in route data');
        return;
    }
    
    // Add pickup marker
    const pickupMarker = L.marker([routeData.pickup.lat, routeData.pickup.lon]).addTo(routeLayer);
    pickupMarker.bindPopup(`<b>Pickup:</b> ${routeData.pickup.address}`);
    
    // Add delivery marker
    const deliveryMarker = L.marker([routeData.delivery.lat, routeData.delivery.lon]).addTo(routeLayer);
    deliveryMarker.bindPopup(`<b>Delivery:</b> ${routeData.delivery.address}`);
    
    // If we have geometry from OSRM, use it to draw the route
    if (routeData.geometry && routeData.geometry.coordinates) {
        // Convert GeoJSON coordinates [lon, lat] to Leaflet coordinates [lat, lon]
        const routeCoordinates = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        
        const routeLine = L.polyline(routeCoordinates, { 
            color: 'blue', 
            weight: 5,
            opacity: 0.7
        }).addTo(routeLayer);
        
        // Fit map to show the entire route
        map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    } else {
        // Fallback to simple direct line
        const routeLine = L.polyline([
            [routeData.pickup.lat, routeData.pickup.lon],
            [routeData.delivery.lat, routeData.delivery.lon]
        ], { color: 'blue', weight: 5 }).addTo(routeLayer);
        
        // Fit map to show the entire route
        map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    }
    
    // Check for simulation mode
    const simulationMode = document.getElementById('simulationMode');
    if (simulationMode && simulationMode.checked) {
        // Import simulation module if needed
        import('./simulation.js').then(module => {
            module.addSimulatedHazards(routeData);
        });
    } else {
        // Start tracking user location for normal mode
        startLocationTracking();
    }
}

/**
 * Update driver UI with route information
 */
function updateDriverUI(routeData) {
    debug('Updating driver UI with route data');
    
    // Update route name
    const routeName = document.getElementById('routeName');
    if (routeName) {
        routeName.textContent = routeData.name;
    }
    
    // Update distance remaining
    const distanceRemaining = document.getElementById('distanceRemaining');
    if (distanceRemaining) {
        distanceRemaining.textContent = formatDistance(routeData.distance);
    }
    
    // Update ETA
    const eta = document.getElementById('eta');
    if (eta) {
        const now = new Date();
        const arrivalTime = new Date(now.getTime() + routeData.duration * 1000);
        eta.textContent = arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Update driver notes
    const driverNotes = document.getElementById('driverNotes');
    if (driverNotes) {
        driverNotes.textContent = routeData.notes || 'No notes provided';
    }
    
    // Update current direction
    const currentDirection = document.getElementById('currentDirection');
    if (currentDirection && routeData.directions && routeData.directions.length > 0) {
        currentDirection.textContent = routeData.directions[0].instruction;
    }
    
    // Update distance to next
    const distanceToNext = document.getElementById('distanceToNext');
    if (distanceToNext && routeData.directions && routeData.directions.length > 0) {
        distanceToNext.textContent = `In ${routeData.directions[0].distance} miles`;
    }
    
    // Update upcoming directions
    const directionsList = document.getElementById('directionsList');
    if (directionsList && routeData.directions) {
        directionsList.innerHTML = '';
        
        // Skip the first direction as it's shown as current
        for (let i = 1; i < routeData.directions.length; i++) {
            const direction = routeData.directions[i];
            const listItem = document.createElement('li');
            listItem.className = 'p-3 bg-gray-50 rounded-md';
            listItem.innerHTML = `
                <p class="font-medium">${direction.instruction}</p>
                <p class="text-sm text-gray-600">${direction.distance} miles</p>
            `;
            directionsList.appendChild(listItem);
        }
    }
    
    // Show driver information if available
    if (routeData.driver && routeData.driver.name) {
        const driverInfoDiv = document.createElement('div');
        driverInfoDiv.className = 'mt-6 p-4 bg-blue-50 rounded-md';
        driverInfoDiv.innerHTML = `
            <h3 class="text-md font-semibold mb-2">Driver Information</h3>
            <p class="text-sm"><strong>Name:</strong> ${routeData.driver.name}</p>
            ${routeData.driver.phone ? `<p class="text-sm"><strong>Phone:</strong> ${routeData.driver.phone}</p>` : ''}
        `;
        
        // Add driver info to the page
        const notesDiv = document.querySelector('.mt-6.p-4.bg-yellow-50');
        if (notesDiv && !document.querySelector('.mt-6.p-4.bg-blue-50')) {
            notesDiv.parentNode.insertBefore(driverInfoDiv, notesDiv);
        }
    }
    
    // Update route status if available
    if (routeData.status) {
        const statusDiv = document.createElement('div');
        statusDiv.className = 'mb-6';
        statusDiv.innerHTML = `
            <div class="flex justify-between items-center">
                <p class="text-sm text-gray-600">Route Status</p>
                <span class="px-2 py-1 text-xs rounded-full ${getStatusColor(routeData.status)}">${formatStatus(routeData.status)}</span>
            </div>
        `;
        
        // Add status to the page
        const routeNameElement = document.getElementById('routeName');
        if (routeNameElement && !routeNameElement.nextElementSibling?.classList.contains('mb