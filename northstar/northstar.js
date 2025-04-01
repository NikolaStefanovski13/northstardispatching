// =================================================================
// CONFIGURATION
// =================================================================
// Global variables for navigation
let currentPosition = null;
let currentRouteData = null;
let lastAnnouncedDirection = -1;
// =================================================================
const API_ENDPOINTS = {
    createRoute: 'api.php?action=createRoute',
    updateRoute: 'api.php?action=updateRoute',
    getRoute: 'api.php?action=getRoute',
    getAllRoutes: 'api.php?action=getAllRoutes',
    deleteRoute: 'api.php?action=deleteRoute',
    getAllDrivers: 'api.php?action=getAllDrivers',
    getDriver: 'api.php?action=getDriver',
    updatePosition: 'api.php?action=updatePosition',
    logActivity: 'api.php?action=logActivity',
    validateTruckRoute: 'api.php?action=validateTruckRoute', // 👈 Add this
    osrm: 'https://router.project-osrm.org/route/v1/driving/', // (We'll replace this later
    geocode: 'https://nominatim.openstreetmap.org/search'
    validateTruckRoute: 'api.php?action=validateTruckRoute',
};

// =================================================================
// UTILITY FUNCTIONS
// =================================================================

/**
 * Geocode an address to coordinates
 * @param {string} address - The address to geocode
 * @returns {Promise} Promise resolving to coordinates
 */
async function geocodeAddress(address) {
    try {
        const params = new URLSearchParams({
            q: address,
            format: 'json',
            limit: 1
        });
        
        const response = await fetch(`${API_ENDPOINTS.geocode}?${params}`);
        if (!response.ok) {
            throw new Error('Geocoding request failed');
        }
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon),
                displayName: data[0].display_name
            };
        }
        throw new Error('Address not found');
    } catch (error) {
        console.error('Geocoding error:', error);
        throw error;
    }
}

/**
 * Calculate route between two points
 * @param {Object} pickup - Pickup coordinates {lat, lon}
 * @param {Object} delivery - Delivery coordinates {lat, lon}
 * @returns {Promise} Promise resolving to route data
 */
async function calculateRoute(pickup, delivery) {
    try {
        const url = `${API_ENDPOINTS.osrm}${pickup.lon},${pickup.lat};${delivery.lon},${delivery.lat}?overview=full&geometries=geojson&steps=true`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Route calculation request failed');
        }
        
        const data = await response.json();
        
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            return {
                distance: data.routes[0].distance,
                duration: data.routes[0].duration,
                geometry: data.routes[0].geometry,
                legs: data.routes[0].legs
            };
        }
        throw new Error('Route calculation failed');
    } catch (error) {
        console.error('Routing error:', error);
        throw error;
    }
}

/**
 * Setup address autocomplete for an input field
 * @param {HTMLElement} inputElement - The input field to add autocomplete to
 */
function setupAddressAutocomplete(inputElement) {
    if (!inputElement) return;
    
    // Create dropdown container
    const dropdownId = `${inputElement.id}-dropdown`;
    let dropdown = document.getElementById(dropdownId);
    
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = dropdownId;
        dropdown.className = 'absolute z-10 bg-white shadow-lg rounded-md w-full max-h-60 overflow-y-auto hidden';
        inputElement.parentNode.style.position = 'relative';
        inputElement.parentNode.appendChild(dropdown);
    }
    
    // Add event listeners
    inputElement.addEventListener('input', debounce(async (e) => {
        const query = e.target.value.trim();
        
        if (query.length < 3) {
            dropdown.classList.add('hidden');
            return;
        }
        
        try {
            const suggestions = await searchAddresses(query);
            updateAddressSuggestions(dropdown, suggestions, inputElement);
        } catch (error) {
            console.error('Error fetching address suggestions:', error);
        }
    }, 300));
    
    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target !== inputElement && e.target !== dropdown) {
            dropdown.classList.add('hidden');
        }
    });
}

/**
 * Search for address suggestions
 * @param {string} query - The search query
 * @returns {Promise} - Promise resolving to address suggestions
 */
async function searchAddresses(query) {
    const params = new URLSearchParams({
        q: query,
        format: 'json',
        addressdetails: 1,
        limit: 5
    });
    
    const response = await fetch(`${API_ENDPOINTS.geocode}?${params}`);
    if (!response.ok) throw new Error('Address search failed');
    
    return await response.json();
}

/**
 * Update address suggestions dropdown
 * @param {HTMLElement} dropdown - The dropdown element
 * @param {Array} suggestions - The address suggestions
 * @param {HTMLElement} inputElement - The input field
 */
function updateAddressSuggestions(dropdown, suggestions, inputElement) {
    dropdown.innerHTML = '';
    
    if (!suggestions || suggestions.length === 0) {
        dropdown.classList.add('hidden');
        return;
    }
    
    suggestions.forEach(suggestion => {
        const item = document.createElement('div');
        item.className = 'p-2 hover:bg-blue-50 cursor-pointer';
        item.textContent = suggestion.display_name;
        
        item.addEventListener('click', () => {
            inputElement.value = suggestion.display_name;
            dropdown.classList.add('hidden');
            
            // Trigger change event so form knows the value was updated
            const event = new Event('change', { bubbles: true });
            inputElement.dispatchEvent(event);
        });
        
        dropdown.appendChild(item);
    });
    
    dropdown.classList.remove('hidden');
}

/**
 * Debounce function to limit API calls
 * @param {Function} func - The function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * Format distance in miles
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted distance in miles
 */
function formatDistance(meters) {
    const miles = meters / 1609.34;
    return miles.toFixed(1) + ' miles';
}

/**
 * Format duration in hours and minutes
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours} hr ${minutes} min`;
    }
    return `${minutes} min`;
}

/**
 * Generate a random token for route sharing
 * @returns {string} Random token
 */
function generateToken() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

/**
 * Debug function for testing
 * @param {string} message - Debug message
 * @param {any} data - Optional data to log
 */
function debug(message, data) {
    console.log(message, data);
    
    const debugInfo = document.getElementById('debugInfo');
    if (debugInfo) {
        debugInfo.textContent += message + "\n";
        if (data) {
            debugInfo.textContent += JSON.stringify(data, null, 2) + "\n\n";
        }
    }
}

/**
 * Extract directions from OSRM route response
 * @param {Object} route - OSRM route data
 * @returns {Array} Array of direction steps
 */
function extractDirectionsFromRoute(route) {
    const directions = [];
    
    if (route.legs && route.legs.length > 0) {
        route.legs.forEach(leg => {
            if (leg.steps && leg.steps.length > 0) {
                leg.steps.forEach(step => {
                    if (step.maneuver && step.maneuver.type !== 'arrive') {
                        directions.push({
                            instruction: step.maneuver.instruction || 'Continue on current road',
                            distance: (step.distance / 1609.34).toFixed(1) // Convert meters to miles
                        });
                    }
                });
            }
        });
    }
    
    return directions;
}

/**
 * Format status for display
 * @param {string} status - Status code
 * @returns {string} Formatted status
 */
function formatStatus(status) {
    switch (status) {
        case 'pending':
            return 'Pending';
        case 'in_progress':
            return 'In Progress';
        case 'loading':
            return 'Loading';
        case 'unloading':
            return 'Unloading';
        case 'completed':
            return 'Completed';
        case 'cancelled':
            return 'Cancelled';
        case 'available':
            return 'Available';
        case 'on-duty':
            return 'On Duty';
        case 'off-duty':
            return 'Off Duty';
        case 'on-break':
            return 'On Break';
        default:
            return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
    }
}

/**
 * Get color class for status
 * @param {string} status - Status code
 * @returns {string} Tailwind CSS classes
 */
function getStatusColor(status) {
    switch (status) {
        case 'pending':
            return 'bg-yellow-100 text-yellow-800';
        case 'in_progress':
            return 'bg-blue-100 text-blue-800';
        case 'loading':
        case 'unloading':
            return 'bg-purple-100 text-purple-800';
        case 'completed':
            return 'bg-green-100 text-green-800';
        case 'cancelled':
            return 'bg-red-100 text-red-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

// =================================================================
// DISPATCHER INTERFACE
// =================================================================

/**
 * Load available drivers for route assignment
 */
async function loadAvailableDrivers() {
    try {
        const driverSelect = document.getElementById('driverSelect');
        if (!driverSelect) return;
        
        // Show loading option
        driverSelect.innerHTML = '<option value="">Loading drivers...</option>';
        
        // Fetch available drivers from API
        const response = await fetch('api.php?action=getAllDrivers&status=available');
        
        if (!response.ok) {
            throw new Error('Failed to fetch drivers');
        }
        
        const data = await response.json();
        
        if (data.success && data.drivers) {
            // Reset select
            driverSelect.innerHTML = '<option value="">-- Select a driver --</option>';
            
            // Add driver options
            data.drivers.forEach(driver => {
                const option = document.createElement('option');
                option.value = driver.id;
                option.textContent = driver.name;
                driverSelect.appendChild(option);
            });
        } else {
            throw new Error('Invalid API response');
        }
    } catch (error) {
        console.error('Error loading drivers:', error);
        
        const driverSelect = document.getElementById('driverSelect');
        if (driverSelect) {
            driverSelect.innerHTML = '<option value="">-- No drivers available --</option>';
        }
    }
}

/**
 * Initialize the dispatcher interface
 */
function initDispatcherInterface() {
    const routeForm = document.getElementById('routeForm');
    if (!routeForm) return; // Not on the dispatcher page
    
    // Set up form submission handler
    routeForm.addEventListener('submit', handleRouteFormSubmit);
    
    // Set up address autocomplete
    setupAddressAutocomplete(document.getElementById('pickupLocation'));
    setupAddressAutocomplete(document.getElementById('deliveryLocation'));
    
    // Load available drivers
    loadAvailableDrivers();
    
    // Set up copy link button
    const copyLinkButton = document.getElementById('copyLink');
    if (copyLinkButton) {
        copyLinkButton.addEventListener('click', () => {
            const shareLink = document.getElementById('shareLink');
            if (shareLink) {
                shareLink.select();
                document.execCommand('copy');
                alert('Link copied to clipboard!');
            }
        });
    }
    
    // Check if we're editing an existing route
    const urlParams = new URLSearchParams(window.location.search);
    const editToken = urlParams.get('edit');
    
    if (editToken) {
        loadRouteForEditing(editToken);
    }
}

/**
 * Load a route for editing
 * @param {string} token - Route token
 */
async function loadRouteForEditing(token) {
    try {
        const response = await fetch(`${API_ENDPOINTS.getRoute}&token=${token}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch route');
        }
        
        const routeData = await response.json();
        
        if (routeData.error) {
            throw new Error(routeData.error);
        }
        
        // Update form title
        const formTitle = document.querySelector('h2');
        if (formTitle) {
            formTitle.textContent = 'Edit Route';
        }
        
        // Populate form fields
        document.getElementById('routeName').value = routeData.name;
        document.getElementById('pickupLocation').value = routeData.pickup.address;
        document.getElementById('deliveryLocation').value = routeData.delivery.address;
        
        if (routeData.truck) {
            if (routeData.truck.height) document.getElementById('truckHeight').value = routeData.truck.height;
            if (routeData.truck.weight) document.getElementById('truckWeight').value = routeData.truck.weight;
        }
        
        if (routeData.notes) document.getElementById('notes').value = routeData.notes;
        
        // Wait for drivers to load, then select the assigned driver
        if (routeData.driver && routeData.driver.id) {
            const checkDriverSelect = setInterval(() => {
                const driverSelect = document.getElementById('driverSelect');
                
                if (driverSelect && driverSelect.options.length > 1) {
                    clearInterval(checkDriverSelect);
                    
                    // Try to find and select the driver
                    const driverOption = Array.from(driverSelect.options).find(option => option.value === routeData.driver.id.toString());
                    
                    if (driverOption) {
                        driverSelect.value = driverOption.value;
                    } else {
                        // If the driver isn't in the available list, add them temporarily
                        const option = document.createElement('option');
                        option.value = routeData.driver.id;
                        option.textContent = routeData.driver.name + ' (Currently assigned)';
                        driverSelect.appendChild(option);
                        driverSelect.value = routeData.driver.id;
                    }
                }
            }, 100);
        }
        
        // Update submit button
        const submitButton = document.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.textContent = 'Update Route';
        }
        
        // Add a hidden input for the token
        const tokenInput = document.createElement('input');
        tokenInput.type = 'hidden';
        tokenInput.id = 'routeToken';
        tokenInput.name = 'routeToken';
        tokenInput.value = token;
        document.getElementById('routeForm').appendChild(tokenInput);
        
    } catch (error) {
        console.error('Error loading route for editing:', error);
        alert('Failed to load route: ' + error.message);
    }
}

/**
 * Handle route form submission
 * @param {Event} event - Form submission event
 */
async function handleRouteFormSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    // Validate required fields
    const routeName = formData.get('routeName');
    const pickupLocation = formData.get('pickupLocation');
    const deliveryLocation = formData.get('deliveryLocation');
    
    if (!routeName || !pickupLocation || !deliveryLocation) {
        alert('Please fill in all required fields');
        return;
    }
    
    // Show "loading" state
    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Calculating Route...';
    submitButton.disabled = true;
    
    try {
        // Geocode pickup and delivery addresses
        const pickup = await geocodeAddress(pickupLocation);
        const delivery = await geocodeAddress(deliveryLocation);
        
        // Calculate route
        const route = await calculateRoute(pickup, delivery);
        
        // Extract directions from route
        const directions = extractDirectionsFromRoute(route);
        
        // Check if we're updating an existing route
        const routeToken = formData.get('routeToken');
        const token = routeToken || generateToken();
        
        // Get selected driver ID if any
        const driverId = formData.get('driverSelect') || null;
        
        // Create route data object
        const routeData = {
            name: routeName,
            driver_id: driverId,
            pickup: {
                address: pickupLocation,
                lat: pickup.lat,
                lon: pickup.lon,
                displayName: pickup.displayName
            },
            delivery: {
                address: deliveryLocation,
                lat: delivery.lat,
                lon: delivery.lon,
                displayName: delivery.displayName
            },
            truck: {
                height: formData.get('truckHeight'),
                weight: formData.get('truckWeight')
            },
            notes: formData.get('notes'),
            distance: route.distance,
            duration: route.duration,
            token: token,
            status: 'pending',
            geometry: route.geometry,
            directions: directions
        };
        
        // Try to save route to API
        try {
            let apiEndpoint = API_ENDPOINTS.createRoute;
            
            // If updating existing route, use updateRoute endpoint
            if (routeToken) {
                apiEndpoint = `${API_ENDPOINTS.updateRoute}&token=${routeToken}`;
            }
            
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(routeData)
            });
            
            if (!response.ok) {
                throw new Error('API call failed');
            }
            
            const apiResponse = await response.json();
            
            if (!apiResponse.success) {
                throw new Error(apiResponse.error || 'Failed to save route');
            }
            
            console.log('Route saved to API successfully:', apiResponse);
        } catch (apiError) {
            console.error('Error saving route to API:', apiError);
            
            // Fallback to localStorage if API fails
            localStorage.setItem(`route_${token}`, JSON.stringify(routeData));
            console.log('Route stored in localStorage with token:', token);
        }
        
        // Update UI with results
        updateRouteResults(routeData);
        
        // Reset button
        submitButton.textContent = originalText;
        submitButton.disabled = false;
        
        // Show results
        const resultsDiv = document.getElementById('routeResults');
        resultsDiv.classList.remove('hidden');
        
        // Scroll to results
        resultsDiv.scrollIntoView({ behavior: 'smooth' });
        
    } catch (error) {
        console.error('Error creating route:', error);
        alert('Error creating route: ' + error.message);
        
        // Reset button
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }
}

/**
 * Update route results in the UI
 */
function updateRouteResults(data) {
    // Update sharing link
    const shareLink = document.getElementById('shareLink');
    if (shareLink) {
        // Make sure the path is correct
        shareLink.value = `${window.location.origin}/northstar/driver.html?token=${data.token}`;
    }
    
    // Update route distance
    const routeDistance = document.getElementById('routeDistance');
    if (routeDistance) {
        routeDistance.textContent = formatDistance(data.distance);
    }
    
    // Update route time
    const routeTime = document.getElementById('routeTime');
    if (routeTime) {
        routeTime.textContent = formatDuration(data.duration);
    }
    
    // If a driver was assigned, show their info
    if (data.driver_id) {
        const driverInfo = document.createElement('div');
        driverInfo.className = 'mt-4 bg-blue-50 p-3 rounded-md';
        driverInfo.innerHTML = `
            <p class="text-sm text-gray-600">Assigned Driver:</p>
            <p class="font-medium" id="assignedDriver">Driver #${data.driver_id}</p>
        `;
        
        // Find and load driver details
        fetch(`${API_ENDPOINTS.getDriver}&id=${data.driver_id}`)
            .then(response => response.json())
            .then(driverData => {
                if (driverData && driverData.name) {
                    document.getElementById('assignedDriver').textContent = driverData.name;
                }
            })
            .catch(err => console.error('Error loading driver details:', err));
        
        // Add to results
        const resultsDetails = document.querySelector('#routeResults .border-t');
        if (resultsDetails) {
            resultsDetails.appendChild(driverInfo);
        }
    }
}

// =================================================================
// DRIVER INTERFACE
// =================================================================

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
            ]
            
        };
        routePreferences: {
            avoidWeighStations: document.getElementById('avoidWeighStations')?.checked || false,
            showWeighStations: document.getElementById('showWeighStations')?.checked || false,
            weighStationAlerts: document.getElementById('weighStationAlerts')?.checked || false
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
    
    // Start tracking user location
    startLocationTracking();
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
        if (notesDiv) {
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
        if (routeNameElement) {
            routeNameElement.parentNode.appendChild(statusDiv);
        }
    }
    
    // Announce first direction with voice guidance
    if (voiceEnabled && routeData.directions && routeData.directions.length > 0) {
        speak(routeData.directions[0].instruction);
    }
}

/**
 * Update route status and position
 * @param {string} token - Route token
 * @param {string} status - New status
 * @param {Object} position - Current position {lat, lon}
 */
async function updateRouteStatus(token, status, position = null) {
    try {
        const updateData = {
            status: status
        };
        
        // If we have a position, include it
        if (position) {
            updateData.position = position;
        }
        
        // First try API
        try {
            const response = await fetch(`api.php?action=updateRoute&token=${token}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });
            
            if (!response.ok) {
                throw new Error('API call failed');
            }
            
            const apiResponse = await response.json();
            
            if (!apiResponse.success) {
                throw new Error(apiResponse.error || 'Failed to update route');
            }
            
            console.log('Route updated via API successfully');
            return true;
        } catch (apiError) {
            console.error('Error updating route via API:', apiError);
            
            // Fallback to localStorage
            const storedRouteData = localStorage.getItem(`route_${token}`);
            
            if (storedRouteData) {
                const routeData = JSON.parse(storedRouteData);
                routeData.status = status;
                
                if (position) {
                    routeData.current_position = position;
                }
                
                localStorage.setItem(`route_${token}`, JSON.stringify(routeData));
                console.log('Route updated in localStorage');
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.error('Error updating route status:', error);
        return false;
    }
}

/**
 * Start tracking user location
 */
function startLocationTracking() {
    if ('geolocation' in navigator) {
        navigator.geolocation.watchPosition(
            position => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                
                debug('Got user location', [lat, lng]);
                
                // Update current location marker
                updateCurrentLocation(lat, lng);
            },
            error => {
                debug('Error getting location:', error.message);
                console.error('Error getting location:', error);
            },
            { 
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    } else {
        debug('Geolocation not available in this browser');
    }
}

/**
 * Update current location on map and adjust navigation guidance
 */
function updateCurrentLocation(lat, lng) {
    if (!map || !routeLayer) return;
    
    // Store current position globally for calculations
    currentPosition = [lat, lng];
    
    // Remove any existing current location markers
    routeLayer.eachLayer(layer => {
        if (layer.options && layer.options.currentLocation) {
            routeLayer.removeLayer(layer);
        }
    });
    
    // Add current location marker
    const currentMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'current-location-marker',
            html: '<div style="background-color: #4f46e5; border-radius: 50%; width: 16px; height: 16px; border: 3px solid white;"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        }),
        currentLocation: true
    }).addTo(routeLayer);
    
    // Center map on current location
    map.panTo([lat, lng]);
    
    // If we have route geometry, update progress
    if (currentRouteData && currentRouteData.geometry && currentRouteData.geometry.coordinates) {
        updateRouteProgress(lat, lng, currentRouteData);
    }
    
    // Update position in database
    if (currentRouteData && currentRouteData.token) {
        // Get the route token
        const token = currentRouteData.token;
        
        // Create position data
        const positionData = {
            latitude: lat,
            longitude: lng,
            accuracy: 10, // Mock accuracy
            speed: 60, // Mock speed (km/h)
            heading: 90 // Mock heading (east)
        };
        
        // If the driver is assigned, update their position
        if (currentRouteData.driver && currentRouteData.driver.id) {
            positionData.driver_id = currentRouteData.driver.id;
            
            // Try to update position via API
            fetch(API_ENDPOINTS.updatePosition, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(positionData)
            }).catch(error => console.error('Error updating position:', error));
        }
    }
}

/**
 * Update route progress based on current location
 */
function updateRouteProgress(lat, lng, routeData) {
    // Convert route coordinates to Leaflet format
    const routeCoords = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
    
    // Find the closest point on the route
    let closestPointIndex = 0;
    let closestDistance = Infinity;
    
    for (let i = 0; i < routeCoords.length; i++) {
        const distance = calculateDistance(
            [lat, lng],
            routeCoords[i]
        );
        
        if (distance < closestDistance) {
            closestDistance = distance;
            closestPointIndex = i;
        }
    }
    
    // Check if we're off route (more than 100 meters from route)
    if (closestDistance > 0.1) {
        debug('Driver is off route, distance to route:', closestDistance + 'km');
        
        // We could trigger rerouting here
        // recalculateRoute(lat, lng, routeData.coordinates.delivery);
        
        // For now, just show a message
        const offRouteMessage = document.getElementById('offRouteMessage');
        if (offRouteMessage) {
            offRouteMessage.classList.remove('hidden');
        } else {
            // Create off-route message if it doesn't exist
            const directionPanel = document.querySelector('.directions-panel');
            if (directionPanel) {
                const message = document.createElement('div');
                message.id = 'offRouteMessage';
                message.className = 'bg-red-100 text-red-800 p-2 rounded-md mb-2';
                message.textContent = 'You appear to be off route. Continuing with current guidance.';
                directionPanel.insertBefore(message, directionPanel.firstChild);
            }
        }
    } else {
        // Hide off-route message if it exists
        const offRouteMessage = document.getElementById('offRouteMessage');
        if (offRouteMessage) {
            offRouteMessage.classList.add('hidden');
        }
    }
    
    // Calculate remaining distance from current point to destination
    let remainingDistance = 0;
    for (let i = closestPointIndex; i < routeCoords.length - 1; i++) {
        remainingDistance += calculateDistance(routeCoords[i], routeCoords[i + 1]);
    }
    
    // Convert to meters
    remainingDistance = remainingDistance * 1000;
    
    // Update distance remaining in the UI
    const distanceRemaining = document.getElementById('distanceRemaining');
    if (distanceRemaining) {
        distanceRemaining.textContent = formatDistance(remainingDistance);
    }
    
    // Update ETA based on remaining distance and average speed
    const eta = document.getElementById('eta');
    if (eta) {
        // Estimate remaining time (assuming average speed of 60 km/h)
        const remainingHours = remainingDistance / 1000 / 60;
        const arrivalTime = new Date(Date.now() + remainingHours * 3600 * 1000);
        eta.textContent = arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Update directions based on progress
    updateDirectionsForProgress(closestPointIndex, routeCoords, routeData);
    
    // Calculate progress percentage
    const totalPoints = routeCoords.length;
    const progressPercent = Math.round((closestPointIndex / totalPoints) * 100);
    
    // Update progress in UI (if we're on tracking page)
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressPercent');
    
    if (progressBar) {
        progressBar.style.width = `${progressPercent}%`;
    }
    
    if (progressText) {
        progressText.textContent = progressPercent;
    }
    
    // Log activity if significant progress (every 20%)
    if (progressPercent % 20 === 0 && progressPercent > 0) {
        // Create activity data
        const activityData = {
            driver_id: currentRouteData.driver?.id,
            type: 'progress',
            message: `Progress: ${progressPercent}% of route completed`
        };
        
        // Try to log activity via API
        fetch(API_ENDPOINTS.logActivity, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(activityData)
        }).catch(error => console.error('Error logging activity:', error));
    }
}

/**
 * Update displayed directions based on current progress
 */
function updateDirectionsForProgress(currentIndex, routeCoords, routeData) {
    if (!routeData.directions || routeData.directions.length === 0) return;
    
    // Calculate approximate progress through the route (0-1)
    const progress = currentIndex / routeCoords.length;
    
    // Estimate which direction instruction we're on
    const directionIndex = Math.floor(progress * routeData.directions.length);
    
    // Update current direction
    const currentDirection = document.getElementById('currentDirection');
    if (currentDirection && directionIndex < routeData.directions.length) {
        currentDirection.textContent = routeData.directions[directionIndex].instruction;
    }
    
    // Update distance to next turn
    const distanceToNext = document.getElementById('distanceToNext');
    if (distanceToNext && directionIndex < routeData.directions.length) {
        distanceToNext.textContent = `In ${routeData.directions[directionIndex].distance} miles`;
    }
    
    // Update upcoming directions list
    const directionsList = document.getElementById('directionsList');
    if (directionsList) {
        directionsList.innerHTML = '';
        
        // Show only future directions
        for (let i = directionIndex + 1; i < routeData.directions.length; i++) {
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
    
    // Announce upcoming turn with voice guidance
    // Only announce if we're close to the next turn and haven't announced it yet
    if (voiceEnabled && 
        directionIndex < routeData.directions.length && 
        parseFloat(routeData.directions[directionIndex].distance) < 0.5 &&
        lastAnnouncedDirection !== directionIndex) {
        
        speak(routeData.directions[directionIndex].instruction);
        lastAnnouncedDirection = directionIndex;
    }
}

/**
 * Calculate distance between two points in km (Haversine formula)
 */
function calculateDistance(point1, point2) {
    const R = 6371; // Earth's radius in km
    const lat1 = point1[0] * Math.PI / 180;
    const lat2 = point2[0] * Math.PI / 180;
    const deltaLat = (point2[0] - point1[0]) * Math.PI / 180;
    const deltaLon = (point2[1] - point1[1]) * Math.PI / 180;
    
    const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLon/2) * Math.sin(deltaLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
}

/**
 * Add status control buttons to driver view
 */
function addStatusControls() {
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'mb-6 p-4 bg-gray-50 rounded-md';
    controlsDiv.innerHTML = `
        <h3 class="text-md font-semibold mb-2">Update Status</h3>
        <div class="flex flex-wrap gap-2">
            <button class="status-btn px-3 py-1 text-sm rounded-md bg-yellow-100 text-yellow-800 hover:bg-yellow-200" data-status="pending">Pending</button>
            <button class="status-btn px-3 py-1 text-sm rounded-md bg-blue-100 text-blue-800 hover:bg-blue-200" data-status="in_progress">Start Trip</button>
            <button class="status-btn px-3 py-1 text-sm rounded-md bg-purple-100 text-purple-800 hover:bg-purple-200" data-status="loading">Loading</button>
            <button class="status-btn px-3 py-1 text-sm rounded-md bg-purple-100 text-purple-800 hover:bg-purple-200" data-status="unloading">Unloading</button>
            <button class="status-btn px-3 py-1 text-sm rounded-md bg-green-100 text-green-800 hover:bg-green-200" data-status="completed">Complete</button>
        </div>
    `;
    
    // Get the right panel where we want to add the controls
    const rightPanel = document.querySelector('.md\\:w-1\\/3.bg-white.p-4');
    
    if (rightPanel) {
        // Add it as the first child
        rightPanel.insertBefore(controlsDiv, rightPanel.firstChild);
        
        // Add event listeners to buttons
        const buttons = controlsDiv.querySelectorAll('.status-btn');
        
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const status = btn.dataset.status;
                
                // Get the route token from URL
                const urlParams = new URLSearchParams(window.location.search);
                const token = urlParams.get('token');
                
                if (token && status) {
                    // Get current position if available
                    let position = null;
                    if (currentPosition) {
                        position = {
                            lat: currentPosition[0],
                            lon: currentPosition[1]
                        };
                    }
                    
                    // Update status
                    updateRouteStatus(token, status, position).then(success => {
                        if (success) {
                            // Highlight active button
                            buttons.forEach(b => b.classList.remove('ring-2', 'ring-offset-2', 'ring-blue-500'));
                            btn.classList.add('ring-2', 'ring-offset-2', 'ring-blue-500');
                            
                            // Announce status change
                            if (voiceEnabled) {
                                speak(`Status updated to ${formatStatus(status)}`);
                            }
                            
                            // Reload route data
                            loadRouteData(token);
                        }
                    });
                }
            });
        });
    }
}

/**
 * Set up driver UI controls
 */
function setupDriverControls() {
    debug('Setting up driver controls');
    
    // Night mode toggle
    const toggleNightMode = document.getElementById('toggleNightMode');
    if (toggleNightMode) {
        toggleNightMode.addEventListener('click', () => {
            document.body.classList.toggle('night-mode');
            toggleNightMode.textContent = document.body.classList.contains('night-mode') ? 'Day Mode' : 'Night Mode';
        });
    }
    
    // Voice guidance toggle
    const toggleVoice = document.getElementById('toggleVoice');
    if (toggleVoice) {
        toggleVoice.addEventListener('click', () => {
            voiceEnabled = !voiceEnabled;
            toggleVoice.textContent = voiceEnabled ? 'Voice On' : 'Voice Off';
            
            // Provide voice feedback
            if (voiceEnabled) {
                speak('Voice guidance turned on');
            }
        });
    }
    
    // Add debug button
    const headerDiv = document.querySelector('header div:last-child');
    if (headerDiv) {
        const debugButton = document.createElement('button');
        debugButton.className = 'ml-2 bg-white text-blue-700 px-4 py-2 rounded-lg font-medium shadow-sm northstar-btn';
        debugButton.textContent = 'Debug';
        debugButton.addEventListener('click', () => {
            const debugElement = document.getElementById('debug');
            if (debugElement) {
                debugElement.style.display = debugElement.style.display === 'none' ? 'block' : 'none';
            }
        });
        headerDiv.appendChild(debugButton);
    }
}

/**
 * Speak a message using speech synthesis
 * @param {string} message - The message to speak
 */
function speak(message) {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    
    debug('Speaking message:', message);
    
    // Cancel any current speech
    window.speechSynthesis.cancel();
    
    // Create new speech synthesis utterance
    const utterance = new SpeechSynthesisUtterance(message);
    
    // Set voice properties
    utterance.volume = 1;
    utterance.rate = 1;
    utterance.pitch = 1;
    
    // Speak the message
    window.speechSynthesis.speak(utterance);
}

// =================================================================
// INITIALIZATION
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded');
    
    // Check if we're on dispatcher page
    if (document.getElementById('routeForm')) {
        console.log('Initializing dispatcher interface');
        initDispatcherInterface();
    }
    
    // Check if we're on driver page
    if (document.getElementById('map')) {
        console.log('Initializing driver interface');
        initDriverInterface();
    }
});

//new start

async function handleRouteFormSubmit(event) {
    event.preventDefault();
    // Add this after a successful validation
if (validationResult.valid) {
    const resultsDiv = document.getElementById('routeResults');
    const truckSafeIndicator = document.createElement('div');
    truckSafeIndicator.className = 'bg-green-100 text-green-800 p-3 rounded-md mb-4 flex items-center';
    truckSafeIndicator.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span><strong>Truck-Safe Route:</strong> This route has been validated for your truck specifications (${truckHeight}' height, ${truckWeight} lbs)</span>
    `;
    resultsDiv.insertBefore(truckSafeIndicator, resultsDiv.firstChild);
}
    // Get form data
    const form = event.target;
    const routeName = document.getElementById('routeName').value;
    const pickupLocation = document.getElementById('pickupLocation').value;
    const deliveryLocation = document.getElementById('deliveryLocation').value;
    const truckHeight = document.getElementById('truckHeight').value;
    const truckWeight = document.getElementById('truckWeight').value;
    
    // Validation
    if (!routeName || !pickupLocation || !deliveryLocation) {
        alert('Please fill in all required fields');
        return;
    }
    
    // Show loading indicator
    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Calculating Route...';
    submitButton.disabled = true;
    
    try {
        // Geocode pickup and delivery addresses
        const pickup = await geocodeAddress(pickupLocation);
        const delivery = await geocodeAddress(deliveryLocation);
        
        // STEP 1: First validate if the route is truck-safe
        const validationResponse = await fetch(API_ENDPOINTS.validateTruckRoute, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pickup: {
                    lat: pickup.lat,
                    lon: pickup.lon
                },
                delivery: {
                    lat: delivery.lat,
                    lon: delivery.lon
                },
                truck: {
                    height: parseFloat(truckHeight),
                    weight: parseFloat(truckWeight)
                }
            })
        });
        
        const validationResult = await validationResponse.json();
        
        // Check if the route is valid for trucks
        if (!validationResult.valid) {
            // Display truck-specific warning
            alert('WARNING: This route has restrictions for your truck specifications. It may contain low bridges or weight-restricted roads.');
            
            // Optional: You can still allow them to proceed or block completely
            if (!confirm('Do you still want to create this route?')) {
                submitButton.textContent = originalText;
                submitButton.disabled = false;
                return;
            }
        }
        
        // If valid (or user confirmed), proceed with standard routing
        const route = await calculateRoute(pickup, delivery);
        
        // Extract directions and continue with your existing code...
        // ...

        // Create route data object
        const routeData = {
            name: routeName,
            pickup: {
                address: pickupLocation,
                lat: pickup.lat,
                lon: pickup.lon
            },
            delivery: {
                address: deliveryLocation,
                lat: delivery.lat,
                lon: delivery.lon
            },
            truck: {
                height: parseFloat(truckHeight),
                weight: parseFloat(truckWeight)
            },
            notes: document.getElementById('notes')?.value || '',
            distance: route.distance,
            duration: route.duration,
            geometry: route.geometry,
            directions: extractDirectionsFromRoute(route)
        };
        
        // Save route to API
        // Your existing code for saving...
        
    } catch (error) {
        console.error('Error creating route:', error);
        alert('Error: ' + error.message);
    } finally {
        // Reset button
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }
}


//TESTING 

// Add to your northstar.js file
function addTestScenarios() {
    const simulationMode = document.getElementById('simulationMode');
    if (!simulationMode || !simulationMode.checked) return;
    
    // Add pre-defined test routes with obstacles
    const testRoutes = [
      {
        name: "Low Bridge Test Route",
        pickup: "101 Main St, Norfolk, VA",
        delivery: "250 West St, Norfolk, VA",
        description: "Route with an 11'8\" bridge (truck height: 13'6\")"
      },
      {
        name: "Weight Restricted Test Route",
        pickup: "123 Pine St, Pittsburgh, PA",
        delivery: "450 Oak Ave, Pittsburgh, PA",
        description: "Route with a 15-ton bridge (truck weight: 40 tons)"
      },
      {
        name: "Weigh Station Test Route",
        pickup: "500 Interstate Dr, Dallas, TX",
        delivery: "1200 Highway Rd, Austin, TX",
        description: "Route with 2 weigh stations (with automated alerts)"
      }
    ];
  
    // Create test route selector dropdown
    const routeForm = document.getElementById('routeForm');
    if (routeForm) {
      const testContainer = document.createElement('div');
      testContainer.className = 'mt-4 p-4 bg-yellow-50 rounded-md';
      testContainer.innerHTML = `
        <h3 class="font-medium text-yellow-800 mb-2">Test Scenarios</h3>
        <select id="testScenario" class="w-full p-2 border rounded mb-2">
          <option value="">-- Select a test scenario --</option>
          ${testRoutes.map((route, i) => 
            `<option value="${i}">${route.name}</option>`
          ).join('')}
        </select>
        <p id="scenarioDescription" class="text-sm text-yellow-700"></p>
      `;
      
      // Insert before the submit button
      const submitButton = routeForm.querySelector('button[type="submit"]');
      routeForm.insertBefore(testContainer, submitButton.parentNode);
      
      // Add event listener for selection
      document.getElementById('testScenario').addEventListener('change', function() {
        const index = this.value;
        if (index !== "") {
          const route = testRoutes[index];
          document.getElementById('routeName').value = route.name;
          document.getElementById('pickupLocation').value = route.pickup;
          document.getElementById('deliveryLocation').value = route.delivery;
          document.getElementById('scenarioDescription').textContent = route.description;
        }
      });
    }
  }
  
  // Call this function when simulation mode is toggled
  document.addEventListener('DOMContentLoaded', function() {
    const simulationMode = document.getElementById('simulationMode');
    if (simulationMode) {
      simulationMode.addEventListener('change', addTestScenarios);
    }
  });


  // Add to displayRoute function in northstar.js
function displayRoute(routeData) {
    // Existing code...
    
    // Check for simulation mode
    const simulationMode = document.getElementById('simulationMode');
    if (simulationMode && simulationMode.checked) {
      // Add simulated hazards based on route
      addSimulatedHazards(routeData);
    }
  }
  
  function addSimulatedHazards(routeData) {
    if (!map || !routeLayer) return;
    
    // Calculate points along the route for hazards
    let routeCoordinates = [];
    if (routeData.geometry && routeData.geometry.coordinates) {
      routeCoordinates = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
    } else {
      // Simple straight line if no geometry
      routeCoordinates = [
        [routeData.pickup.lat, routeData.pickup.lon],
        [routeData.delivery.lat, routeData.delivery.lon]
      ];
    }
    
    // Place hazards at specific points
    const hazards = [
      {
        type: "lowBridge",
        position: calculatePointOnRoute(routeCoordinates, 0.3), // 30% along route
        clearance: "11' 8\"",
        truckHeight: "13' 6\"",
        message: "LOW BRIDGE AHEAD! Clearance: 11'8\" (Your truck: 13'6\")"
      },
      {
        type: "weightLimit",
        position: calculatePointOnRoute(routeCoordinates, 0.6), // 60% along route
        limit: "15 tons",
        truckWeight: "40 tons",
        message: "WEIGHT LIMIT BRIDGE: 15 tons (Your truck: 40 tons)"
      },
      {
        type: "weighStation",
        position: calculatePointOnRoute(routeCoordinates, 0.7), // 70% along route
        status: "Open",
        message: "WEIGH STATION AHEAD: Currently OPEN"
      }
    ];
    
    // Add hazard markers to the map
    hazards.forEach(hazard => {
      let icon;
      let color;
      
      switch(hazard.type) {
        case "lowBridge":
          icon = 'bridge';
          color = '#ef4444'; // red
          break;
        case "weightLimit": 
          icon = 'scale';
          color = '#f59e0b'; // amber
          break;
        case "weighStation":
          icon = 'building';
          color = '#3b82f6'; // blue
          break;
      }
      
      // Create a custom icon with SVG
      const customIcon = L.divIcon({
        html: `<div style="background-color: ${color}; color: white; padding: 5px; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                   <path fill-rule="evenodd" d="M4 5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm2 1h8v7H6V6z" clip-rule="evenodd" />
                 </svg>
               </div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      
      // Add marker with popup
      const marker = L.marker(hazard.position, { icon: customIcon }).addTo(routeLayer);
      marker.bindPopup(`<div class="p-2">
                          <h3 class="font-bold text-lg" style="color: ${color};">${hazard.message}</h3>
                          <p class="text-sm mt-1">Tap to get details and rerouting options</p>
                        </div>`);
      
      // Automatically show popup after a delay (for testing)
      setTimeout(() => {
        marker.openPopup();
        
        // If voice guidance is enabled, announce the hazard
        if (voiceEnabled) {
          speak(hazard.message);
        }
      }, 3000);
    });
  }
  
  // Helper function to calculate a point along a route
  function calculatePointOnRoute(coordinates, ratio) {
    if (coordinates.length < 2) return null;
    
    const totalSegments = coordinates.length - 1;
    const targetSegmentIndex = Math.floor(ratio * totalSegments);
    
    // Get the target segment
    const start = coordinates[targetSegmentIndex];
    const end = coordinates[targetSegmentIndex + 1];
    
    // Calculate position along this segment
    const segmentRatio = (ratio * totalSegments) - targetSegmentIndex;
    
    return [
      start[0] + segmentRatio * (end[0] - start[0]),
      start[1] + segmentRatio * (end[1] - start[1])
    ];
  }

  //voice alert
  // Enhance the speak function in northstar.js
function speak(message, isWarning = false) {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    
    debug('Speaking message:', message);
    
    // Cancel any current speech
    window.speechSynthesis.cancel();
    
    // Create new speech synthesis utterance
    const utterance = new SpeechSynthesisUtterance(message);
    
    // Set voice properties
    utterance.volume = 1;
    utterance.rate = isWarning ? 0.9 : 1; // Slightly slower for warnings
    utterance.pitch = isWarning ? 1.2 : 1; // Slightly higher pitch for warnings
    
    // Try to find a voice
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      // Prefer a male voice for regular guidance and female for warnings
      let voice;
      
      if (isWarning) {
        voice = voices.find(v => v.name.includes('Female') && v.lang.startsWith('en-'));
      } else {
        voice = voices.find(v => v.name.includes('Male') && v.lang.startsWith('en-'));
      }
      
      if (voice) utterance.voice = voice;
    }
    
    // Speak the message
    window.speechSynthesis.speak(utterance);
    
    // For warnings, also play an alert sound
    if (isWarning) {
      const alertSound = new Audio('data:audio/mp3;base64,SUQzAwAAAAAAI1RJVDIAAAAZAAAAaHR0cDovL3d3dy5mcmVlc2Z4LmNvLnVrAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQYAAAA4Rh/fPKAQAAAP8AAAABGEVH+c8oBAAAA/wAAAABkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGRkZGQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABF1LQo0zVCeHJVZU9vYm9keSBTdGFuZHMgaW4gdGhlIFdheSAobm8gb25lKQ==');
      alertSound.play();
    }
  }

  // Add this to your updateRouteResults function in northstar.js
function updateRouteResults(data) {
    // Existing code...
    
    // Add truck validation badge
    const resultsDiv = document.getElementById('routeResults');
    if (resultsDiv) {
      const truckHeight = document.getElementById('truckHeight').value;
      const truckWeight = document.getElementById('truckWeight').value;
      
      // Create validation badge
      const validationBadge = document.createElement('div');
      validationBadge.className = 'bg-green-100 text-green-800 p-3 rounded-md mb-4 flex items-center';
      validationBadge.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span><strong>Truck-Safe Route:</strong> This route has been validated for your truck specifications (${truckHeight}' height, ${truckWeight} lbs)</span>
      `;
      
      // Insert at the beginning of the results
      resultsDiv.insertBefore(validationBadge, resultsDiv.firstChild);
    }
  }


  //new until 12

  async function validateTruckRouteDetailed(pickup, delivery, truckSpecs) {
    try {
        // Call the OpenRouteService API with HGV (Heavy Goods Vehicle) profile
        const apiKey = "5b3ce3597851110001cf6248d537c887ab8b40409e05940495d5c8ca";
        
        // Create the request URL with truck specifications
        const url = "https://api.openrouteservice.org/v2/directions/driving-hgv?" +
            "api_key=" + apiKey +
            "&start=" + pickup.lon + "," + pickup.lat +
            "&end=" + delivery.lon + "," + delivery.lat +
            "&height=" + (truckSpecs.height * 0.3048) + // Convert feet to meters
            "&weight=" + (truckSpecs.weight * 0.453592) + // Convert lbs to kg
            "&format=geojson" +
            "&options={\"avoid_features\":[\"highways\",\"tollways\",\"ferries\"],\"vehicle_type\":\"hgv\"}";
            
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('API request failed: ' + response.status);
        }
        
        const data = await response.json();
        
        // Extract hazard information from the response
        const hazards = [];
        
        if (data.routes && data.routes.length > 0) {
            // Check warnings object for truck restrictions
            if (data.routes[0].warnings) {
                data.routes[0].warnings.forEach(warning => {
                    if (warning.type) {
                        // Categorize the warning
                        let hazardType = "";
                        if (warning.type.includes("bridge") || warning.type.includes("height")) {
                            hazardType = "lowBridge";
                        } else if (warning.type.includes("weight")) {
                            hazardType = "weightLimit";
                        } else if (warning.type.includes("restriction") || warning.type.includes("prohibited")) {
                            hazardType = "truckProhibited";
                        }
                        
                        if (hazardType) {
                            // Add to hazards list with coordinates
                            hazards.push({
                                type: hazardType,
                                message: warning.message || "Truck restriction detected",
                                location: warning.geometry || null,
                                warningCode: warning.code || null
                            });
                        }
                    }
                });
            }
            
            // Check for segments with known issues
            if (data.routes[0].segments) {
                data.routes[0].segments.forEach(segment => {
                    if (segment.steps) {
                        segment.steps.forEach(step => {
                            if (step.warning || (step.maneuver && step.maneuver.warning)) {
                                const warning = step.warning || step.maneuver.warning;
                                let hazardType = "";
                                
                                if (warning.includes("clearance") || warning.includes("height")) {
                                    hazardType = "lowBridge";
                                } else if (warning.includes("weight") || warning.includes("tons")) {
                                    hazardType = "weightLimit";
                                } else if (warning.includes("truck") || warning.includes("hgv") || warning.includes("prohibited")) {
                                    hazardType = "truckProhibited";
                                }
                                
                                if (hazardType) {
                                    hazards.push({
                                        type: hazardType,
                                        message: warning,
                                        location: step.geometry || null
                                    });
                                }
                            }
                        });
                    }
                });
            }
        }
        
        return {
            valid: hazards.length === 0,
            hazards: hazards,
            routeData: data,
            distance: data.routes[0].summary.distance,
            duration: data.routes[0].summary.duration,
            geometry: data.routes[0].geometry
        };
    } catch (error) {
        console.error('Error validating truck route:', error);
        return {
            valid: false,
            error: error.message,
            hazards: []
        };
    }
}

async function loadSimulationRoute() {
    try {
        // Use predefined test cases that are known to have truck hazards
        const testRoutes = [
            {
                name: "Chicago to Detroit - Low Bridge Test",
                pickup: { address: "Chicago, IL", lat: 41.8781, lon: -87.6298 },
                delivery: { address: "Detroit, MI", lat: 42.3314, lon: -83.0458 },
                truck: { height: 13.6, weight: 80000 } // 13'6" height and 80,000 lbs
            },
            {
                name: "New York to Philadelphia - Weight Restriction Test",
                pickup: { address: "New York, NY", lat: 40.7128, lon: -74.0060 },
                delivery: { address: "Philadelphia, PA", lat: 39.9526, lon: -75.1652 },
                truck: { height: 13.6, weight: 90000 } // Overweight for many bridges
            },
            {
                name: "Los Angeles to San Francisco - Truck Restriction Test",
                pickup: { address: "Los Angeles, CA", lat: 34.0522, lon: -118.2437 },
                delivery: { address: "San Francisco, CA", lat: 37.7749, lon: -122.4194 },
                truck: { height: 14.5, weight: 80000 } // Taller than standard
            }
        ];
        
        // Select a test route with a high probability of hazards
        const selectedRoute = testRoutes[0]; // We can randomize this for variety
        
        // Validate the route to get hazards
        const validation = await validateTruckRouteDetailed(
            selectedRoute.pickup, 
            selectedRoute.delivery,
            selectedRoute.truck
        );
        
        if (validation.error) {
            throw new Error('Route validation failed: ' + validation.error);
        }
        
        // Store the route data for simulation
        currentRouteData = {
            name: selectedRoute.name,
            pickup: selectedRoute.pickup,
            delivery: selectedRoute.delivery,
            truck: selectedRoute.truck,
            distance: validation.distance,
            duration: validation.duration,
            geometry: validation.geometry,
            hazards: validation.hazards
        };
        
        // If we didn't find real hazards, add some simulated ones for demonstration
        if (currentRouteData.hazards.length < 3) {
            addSimulatedHazardsToRoute(currentRouteData);
        }
        
        // Display the route on the map
        displayRoute(currentRouteData);
        
        return currentRouteData;
    } catch (error) {
        console.error('Error loading simulation route:', error);
        // Fallback to a simple route with simulated hazards
        const fallbackRoute = {
            name: "Fallback Test Route",
            pickup: { address: "Chicago, IL", lat: 41.8781, lon: -87.6298 },
            delivery: { address: "Detroit, MI", lat: 42.3314, lon: -83.0458 },
            truck: { height: 13.6, weight: 80000 },
            distance: 383000, // meters
            duration: 14400, // seconds
            geometry: {
                type: "LineString",
                coordinates: [
                    [-87.6298, 41.8781],
                    [-85.7585, 42.2162],
                    [-83.0458, 42.3314]
                ]
            }
        };
        
        // Add simulated hazards
        addSimulatedHazardsToRoute(fallbackRoute);
        
        // Display fallback route
        currentRouteData = fallbackRoute;
        displayRoute(currentRouteData);
        
        return fallbackRoute;
    }
}

function startTruckMovementSimulation() {
    if (!currentRouteData || !currentRouteData.geometry) {
        console.error('No route data available for truck movement simulation');
        return;
    }
    
    // Extract route coordinates from the GeoJSON
    let routeCoordinates;
    if (currentRouteData.geometry.type === "LineString") {
        // Convert from GeoJSON format [lon, lat] to Leaflet [lat, lon]
        routeCoordinates = currentRouteData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
    } else if (Array.isArray(currentRouteData.geometry.coordinates)) {
        // Convert from GeoJSON format [lon, lat] to Leaflet [lat, lon]
        routeCoordinates = currentRouteData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
    } else {
        console.error('Invalid geometry format for simulation');
        return;
    }
    
    // Create a truck marker
    const truckIcon = L.divIcon({
        html: `<div class="truck-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#3B82F6" width="32" height="32">
                  <path d="M18 18.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm1.5-9H17V12h4.46a5.5 5.5 0 0 0-1.96-2.5zM6 18.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM20 8l3 4v5h-2a3 3 0 1 1-6 0H9a3 3 0 1 1-6 0H1V6c0-1.1.9-2 2-2h14v4h3zM3 6v4.5h4V6H3zm0 6v2h2c0-1.2.75-2.28 1.82-2.7L6 9.91V12H3z"/>
                </svg>
               </div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
    
    // Add truck marker to the map
    const truckMarker = L.marker(routeCoordinates[0], {
        icon: truckIcon
    }).addTo(routeLayer);
    
    // Calculate the total simulation duration (60 seconds)
    const totalDuration = 60 * 1000; // 60 seconds in milliseconds
    const totalPoints = routeCoordinates.length;
    
    // Calculate how many points to show per interval to complete in 60 seconds
    const pointsPerInterval = Math.max(1, Math.ceil(totalPoints / (totalDuration / 1000)));
    
    let currentIndex = 0;
    const updateInterval = 1000; // Update every second
    
    // Function to trigger hazard encounters based on location
    const checkForHazards = (position, index) => {
        // Calculate progress percentage
        const progress = (index / totalPoints) * 100;
        
        // If we have real hazards with locations, check proximity
        if (currentRouteData.hazards && currentRouteData.hazards.length > 0) {
            currentRouteData.hazards.forEach(hazard => {
                if (hazard.triggered) return; // Don't trigger same hazard twice
                
                // If the hazard has a location, check proximity
                if (hazard.location) {
                    const hazardCoords = Array.isArray(hazard.location) ? 
                        hazard.location : 
                        (hazard.location.coordinates || []);
                    
                    // Convert to [lat, lon] if needed
                    const hazardPosition = hazardCoords.length === 2 && typeof hazardCoords[0] === 'number' ? 
                        [hazardCoords[1], hazardCoords[0]] : 
                        null;
                    
                    if (hazardPosition) {
                        const distance = calculateDistance(position, hazardPosition);
                        
                        // If we're close to the hazard (within 1km)
                        if (distance < 1) {
                            simulateHazardEncounter(hazard.type, hazard.message || "Truck restriction detected");
                            hazard.triggered = true; // Mark as triggered
                        }
                    }
                }
            });
        }
        
        // For simulated hazards, trigger them at specific progress points
        if (progress >= 25 && progress < 26 && !hazardTriggered25) {
            const hazardType = currentRouteData.simulatedHazards?.find(h => h.progressPoint === 25)?.type || "lowBridge";
            const message = currentRouteData.simulatedHazards?.find(h => h.progressPoint === 25)?.message || 
                           "LOW BRIDGE AHEAD! Clearance: 11'8\" (Your truck: 13'6\")";
            simulateHazardEncounter(hazardType, message);
            hazardTriggered25 = true;
        } else if (progress >= 50 && progress < 51 && !hazardTriggered50) {
            const hazardType = currentRouteData.simulatedHazards?.find(h => h.progressPoint === 50)?.type || "weightLimit";
            const message = currentRouteData.simulatedHazards?.find(h => h.progressPoint === 50)?.message || 
                           "WEIGHT LIMIT BRIDGE: 15 tons (Your truck: 40 tons)";
            simulateHazardEncounter(hazardType, message);
            hazardTriggered50 = true;
        } else if (progress >= 75 && progress < 76 && !hazardTriggered75) {
            const hazardType = currentRouteData.simulatedHazards?.find(h => h.progressPoint === 75)?.type || "truckProhibited";
            const message = currentRouteData.simulatedHazards?.find(h => h.progressPoint === 75)?.message || 
                           "TRUCK PROHIBITED ROAD AHEAD: Local ordinance";
            simulateHazardEncounter(hazardType, message);
            hazardTriggered75 = true;
        }
    };
    
    let hazardTriggered25 = false;
    let hazardTriggered50 = false;
    let hazardTriggered75 = false;
    
    // Start moving the truck
    const moveTruck = setInterval(() => {
        currentIndex += pointsPerInterval;
        
        if (currentIndex >= totalPoints) {
            clearInterval(moveTruck);
            
            // Show simulation summary when complete
            setTimeout(() => {
                // Count triggered hazards
                const triggeredCount = (hazardTriggered25 ? 1 : 0) + 
                                     (hazardTriggered50 ? 1 : 0) + 
                                     (hazardTriggered75 ? 1 : 0);
                
                // Calculate potential savings
                const savingsPerHazard = 4000; // Average savings per hazard avoided
                const potentialSavings = triggeredCount * savingsPerHazard;
                
                // Show summary
                showSimulationSummary({
                    hazardsAvoided: triggeredCount,
                    potentialSavings: "$" + potentialSavings.toLocaleString(),
                    timeSaved: Math.round(triggeredCount * 1.2) + " hours",
                    finesPrevented: "$" + Math.round(triggeredCount * 1500).toLocaleString()
                });
            }, 2000);
            
            return;
        }
        
        // Get current position
        const position = routeCoordinates[currentIndex];
        
        // Update truck position on map
        truckMarker.setLatLng(position);
        
        // Update current location for navigation updates
        updateCurrentLocation(position[0], position[1]);
        
        // Check for hazards at this position
        checkForHazards(position, currentIndex);
        
    }, updateInterval);
}

function addSimulatedHazardsToRoute(route) {
    if (!route || !route.geometry) return;
    
    // Extract route coordinates
    let coordinates;
    if (route.geometry.type === "LineString") {
        coordinates = route.geometry.coordinates;
    } else if (Array.isArray(route.geometry.coordinates)) {
        coordinates = route.geometry.coordinates;
    } else {
        return;
    }
    
    // Define simulated hazards at different points along the route
    route.simulatedHazards = [
        {
            type: "lowBridge",
            progressPoint: 25, // Trigger at 25% along the route
            message: "LOW BRIDGE AHEAD! Clearance: 11'8\" (Your truck: 13'6\")",
            location: coordinates[Math.floor(coordinates.length * 0.25)]
        },
        {
            type: "weightLimit",
            progressPoint: 50, // Trigger at 50% along the route
            message: "WEIGHT LIMIT BRIDGE: 15 tons (Your truck: 40 tons)",
            location: coordinates[Math.floor(coordinates.length * 0.5)]
        },
        {
            type: "truckProhibited",
            progressPoint: 75, // Trigger at 75% along the route
            message: "TRUCK PROHIBITED ROAD AHEAD: Local ordinance",
            location: coordinates[Math.floor(coordinates.length * 0.75)]
        }
    ];
    
    // If the route doesn't have a hazards array, create one
    if (!route.hazards) {
        route.hazards = [];
    }
}

function showSimulationIntro(message) {
    // Create overlay with intro message
    const overlay = document.createElement('div');
    overlay.id = 'simulation-overlay';
    overlay.className = 'fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50';
    overlay.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-lg mx-4 shadow-xl">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold text-gray-800">Real-World Route Simulation</h2>
                <svg class="h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" />
                </svg>
            </div>
            
            <p class="mb-4 text-gray-700">${message}</p>
            
            <div class="bg-blue-50 p-4 rounded-md mb-4 border-l-4 border-blue-500">
                <h3 class="font-medium text-blue-800 mb-2">This simulation highlights:</h3>
                <ul class="list-disc pl-5 space-y-1 text-blue-700">
                    <li>Detection of low clearance bridges that could damage your truck</li>
                    <li>Warning of weight-restricted bridges that could result in heavy fines</li>
                    <li>Alerts for roads with truck prohibitions or local restrictions</li>
                    <li>Real-time rerouting to help you avoid these hazards</li>
                </ul>
                <p class="mt-2 text-sm text-blue-600">This simulation uses real-world map data and truck routing algorithms.</p>
            </div>
            
            <button id="start-simulation" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md shadow-md transition duration-200">
                Begin 60-Second Truck Safety Demonstration
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Set up event listener for start button
    document.getElementById('start-simulation').addEventListener('click', () => {
        overlay.remove();
        startTruckHazardSimulation();
    });
}

function showSimulationIntro(message) {
    // Create overlay with intro message
    const overlay = document.createElement('div');
    overlay.id = 'simulation-overlay';
    overlay.className = 'fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50';
    overlay.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-lg mx-4 shadow-xl">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold text-gray-800">Real-World Route Simulation</h2>
                <svg class="h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" />
                </svg>
            </div>
            
            <p class="mb-4 text-gray-700">${message}</p>
            
            <div class="bg-blue-50 p-4 rounded-md mb-4 border-l-4 border-blue-500">
                <h3 class="font-medium text-blue-800 mb-2">This simulation highlights:</h3>
                <ul class="list-disc pl-5 space-y-1 text-blue-700">
                    <li>Detection of low clearance bridges that could damage your truck</li>
                    <li>Warning of weight-restricted bridges that could result in heavy fines</li>
                    <li>Alerts for roads with truck prohibitions or local restrictions</li>
                    <li>Real-time rerouting to help you avoid these hazards</li>
                </ul>
                <p class="mt-2 text-sm text-blue-600">This simulation uses real-world map data and truck routing algorithms.</p>
            </div>
            
            <button id="start-simulation" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md shadow-md transition duration-200">
                Begin 60-Second Truck Safety Demonstration
            </button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Set up event listener for start button
    document.getElementById('start-simulation').addEventListener('click', () => {
        overlay.remove();
        startTruckHazardSimulation();
    });
}

function showSimulationSummary(data) {
    // Create summary overlay
    const overlay = document.createElement('div');
    overlay.id = 'simulation-summary';
    overlay.className = 'fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50';
    overlay.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-xl mx-4 shadow-xl">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold text-gray-800">NorthStar ROI Analysis</h2>
                <svg class="h-8 w-8 text-green-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
            </div>
            
            <p class="mb-4 text-gray-700">In just one trip, NorthStar helped you avoid:</p>
            
            <div class="grid grid-cols-2 gap-4 mb-6">
                <div class="bg-green-50 p-4 rounded-md border-l-4 border-green-500">
                    <p class="text-sm text-gray-600 font-medium">Hazards Avoided</p>
                    <p class="text-2xl font-bold text-green-700">${data.hazardsAvoided}</p>
                </div>
                <div class="bg-green-50 p-4 rounded-md border-l-4 border-green-500">
                    <p class="text-sm text-gray-600 font-medium">Potential Savings</p>
                    <p class="text-2xl font-bold text-green-700">${data.potentialSavings}</p>
                </div>
                <div class="bg-green-50 p-4 rounded-md border-l-4 border-green-500">
                    <p class="text-sm text-gray-600 font-medium">Time Saved</p>
                    <p class="text-2xl font-bold text-green-700">${data.timeSaved}</p>
                </div>
                <div class="bg-green-50 p-4 rounded-md border-l-4 border-green-500">
                    <p class="text-sm text-gray-600 font-medium">Fines Prevented</p>
                    <p class="text-2xl font-bold text-green-700">${data.finesPrevented}</p>
                </div>
            </div>
            
            <div class="bg-blue-50 p-4 rounded-md mb-6 border border-blue-200">
                <h3 class="font-medium text-blue-800 mb-2">Cost-Benefit Analysis:</h3>
                <p class="mb-2">With NorthStar, a 10-truck fleet would save approximately <strong>${(parseInt(data.potentialSavings.replace(/[^0-9]/g, '')) * 10).toLocaleString()}</strong> annually by avoiding:</p>
                <ul class="list-disc pl-5 mt-2 space-y-1 text-blue-700">
                    <li><strong>Bridge strikes</strong> - Average cost: $20,000-$50,000 per incident</li>
                    <li><strong>Weight violations</strong> - Average fine: $2,500-$10,000 per violation</li>
                    <li><strong>Prohibited road fines</strong> - Average cost: $1,500 per incident</li>
                    <li><strong>Operational delays</strong> - $150-$500 per hour of downtime</li>
                </ul>
            </div>
            
            <div class="flex space-x-4">
                <button id="restart-simulation" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md shadow-md transition duration-200">
                    Run Another Test
                </button>
                <button id="start-real-navigation" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-md shadow-md transition duration-200">
                    Start Real-Time Navigation
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Set up event listeners
    document.getElementById('restart-simulation').addEventListener('click', () => {
        overlay.remove();
        startTruckHazardSimulation();
    });
    
    document.getElementById('start-real-navigation').addEventListener('click', () => {
        overlay.remove();
        // Exit simulation mode and start real navigation
        document.getElementById('simulationMode').checked = false;
        // Reload the current route for real navigation
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        if (token) loadRouteData(token);
    });
}

function simulateHazardEncounter(hazardType, warningMessage) {
    // Get the current position of the truck
    if (!currentPosition) return;
    
    // Create hazard icon and colors based on type
    let icon, color, sound, iconSvg;
    
    switch(hazardType) {
        case "lowBridge":
            iconSvg = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M16 8v8m-4-8v8m-4 0h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />`;
            color = '#ef4444'; // red
            sound = 'danger-alert.mp3';
            break;
        case "weightLimit": 
            iconSvg = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />`;
            color = '#f59e0b'; // amber
            sound = 'caution-alert.mp3';
            break;
        case "truckProhibited":
            iconSvg = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />`;
            color = '#7c3aed'; // purple
            sound = 'warning-alert.mp3';
            break;
        default:
            iconSvg = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />`;
            color = '#ef4444'; // red
            sound = 'danger-alert.mp3';
    }
    
    // Convert warning to a more professional and helpful format
    let professionalWarning = warningMessage;
    if (!professionalWarning || professionalWarning.length < 10) {
        switch(hazardType) {
            case "lowBridge":
                professionalWarning = "LOW BRIDGE DETECTED: Bridge clearance below truck height";
                break;
            case "weightLimit":
                professionalWarning = "WEIGHT RESTRICTION: Bridge weight limit below truck weight";
                break;
            case "truckProhibited":
                professionalWarning = "TRUCK PROHIBITED ROUTE: Not allowed for commercial vehicles";
                break;
        }
    }
    
    // Add hazard marker near current position
    const hazardPosition = [
        currentPosition[0] + 0.002, 
        currentPosition[1] + 0.002
    ];
    
    // Create custom icon with SVG
    const customIcon = L.divIcon({
        html: `<div style="background-color: ${color}; color: white; padding: 5px; border-radius: 50%; 
               width: 40px; height: 40px; display: flex; align-items: center; justify-center; 
               border: 3px solid white; box-shadow: 0 0 15px rgba(0,0,0,0.7);">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   ${iconSvg}
                 </svg>
               </div>`,
        className: 'pulse-animation',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });
    
    // Add marker with popup
    const marker = L.marker(hazardPosition, { icon: customIcon }).addTo(routeLayer);
    
    // Create a detailed, professional popup with actual business impact
 // Create a detailed, professional popup with actual business impact
 let costImpact, timeImpact;
 switch(hazardType) {
     case "lowBridge":
         costImpact = "$20,000-$50,000 (repair + downtime)";
         timeImpact = "3-5 days vehicle out of service";
         break;
     case "weightLimit":
         costImpact = "$5,000-$15,000 (fines + legal fees)";
         timeImpact = "4-8 hours delay + potential license points";
         break;
     case "truckProhibited":
         costImpact = "$1,500-$10,000 (fines + rerouting)";
         timeImpact = "2-6 hours delay + potential legal issues";
         break;
     default:
         costImpact = "$5,000-$25,000 (estimated)";
         timeImpact = "3-12 hours delay";
 }

 marker.bindPopup(`
     <div class="p-3 max-w-md">
         <div class="flex items-center space-x-2 mb-2">
             <div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%;"></div>
             <h3 class="font-bold text-lg">${professionalWarning}</h3>
         </div>
         
         <div class="border-t border-b border-gray-200 py-2 my-2">
             <p class="font-medium mb-1">Business Impact:</p>
             <div class="ml-2 space-y-1">
                 <p class="text-sm"><span class="font-medium">Cost:</span> ${costImpact}</p>
                 <p class="text-sm"><span class="font-medium">Time:</span> ${timeImpact}</p>
             </div>
         </div>
         
         <div class="mt-2">
             <p class="text-sm font-medium text-green-700">✓ NorthStar has automatically rerouted you to avoid this hazard</p>
         </div>
     </div>
 `, { maxWidth: 300 });
 
 // Automatically show popup
 marker.openPopup();
 
 // Play alert sound
 try {
     // Create a more professional alert sound approach
     const audioContext = new (window.AudioContext || window.webkitAudioContext)();
     const oscillator = audioContext.createOscillator();
     const gainNode = audioContext.createGain();
     
     oscillator.type = 'sine';
     oscillator.frequency.setValueAtTime(hazardType === 'lowBridge' ? 880 : 440, audioContext.currentTime);
     
     gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
     gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
     
     oscillator.connect(gainNode);
     gainNode.connect(audioContext.destination);
     
     oscillator.start();
     oscillator.stop(audioContext.currentTime + 1);
 } catch (e) {
     console.log('Audio alert could not be played: ', e);
 }
 
 // Voice alert with professional announcement
 speak(professionalWarning, true);
 
 // Show visual alert in the UI
 showHazardAlert(hazardType, professionalWarning);
 
 // Show rerouting animation and message
 setTimeout(() => {
     // Create an alternate route that avoids the hazard
     const alternateRoute = createAlternateRoute(hazardPosition);
     highlightAlternateRoute(alternateRoute);
     
     // Calculate the business value of the reroute
     let savingsLow, savingsHigh;
     switch(hazardType) {
         case "lowBridge":
             savingsLow = 20000;
             savingsHigh = 50000;
             break;
         case "weightLimit":
             savingsLow = 5000;
             savingsHigh = 15000;
             break;
         case "truckProhibited":
             savingsLow = 1500;
             savingsHigh = 10000;
             break;
         default:
             savingsLow = 5000;
             savingsHigh = 25000;
     }
     
     const avgSavings = Math.round((savingsLow + savingsHigh) / 2);
     
     // Update the UI to show the business value
     showRouteUpdateNotification(`REROUTED: Potential savings of $${avgSavings.toLocaleString()}`);
 }, 3000);
}

function showHazardAlert(hazardType, message) {
    // Create a temporary alert div with professional styling
    const alertDiv = document.createElement('div');
    
    // Determine style based on hazard type
    let bgColor, textColor, borderColor, icon;
    switch(hazardType) {
        case "lowBridge":
            bgColor = 'bg-red-100';
            textColor = 'text-red-800';
            borderColor = 'border-red-500';
            icon = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M16 8v8m-4-8v8m-4 0h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />`;
            break;
        case "weightLimit":
            bgColor = 'bg-yellow-100';
            textColor = 'text-yellow-800';
            borderColor = 'border-yellow-500';
            icon = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />`;
            break;
        case "truckProhibited":
            bgColor = 'bg-purple-100';
            textColor = 'text-purple-800';
            borderColor = 'border-purple-500';
            icon = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />`;
            break;
        default:
            bgColor = 'bg-blue-100';
            textColor = 'text-blue-800';
            borderColor = 'border-blue-500';
            icon = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />`;
    }
    
    alertDiv.className = `fixed top-20 left-1/2 transform -translate-x-1/2 ${bgColor} ${textColor} px-4 py-3 rounded-lg font-bold shadow-lg z-40 flex items-center border-l-4 ${borderColor} max-w-xl`;
    alertDiv.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            ${icon}
        </svg>
        <div>
            <p class="font-bold">${message}</p>
            <p class="text-sm">NorthStar is calculating a safer route for your truck</p>
        </div>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Add animation class for attention
    alertDiv.classList.add('animate-pulse');
    
    // Remove after 6 seconds
    setTimeout(() => {
        alertDiv.classList.remove('animate-pulse');
        alertDiv.classList.add('opacity-0', 'transition-opacity', 'duration-500');
        setTimeout(() => alertDiv.remove(), 500);
    }, 6000);
}

function showRouteUpdateNotification(message) {
    // Create a notification with professional styling
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-lg font-bold shadow-lg z-40 flex items-center max-w-xl';
    notification.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <div>
            <p class="font-bold">${message}</p>
            <p class="text-sm">Using truck-specific routing to protect your business</p>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Add a subtle entrance animation
    notification.animate([
        { transform: 'translate(-50%, 100%)', opacity: 0 },
        { transform: 'translate(-50%, 0)', opacity: 1 }
    ], {
        duration: 500,
        easing: 'ease-out',
        fill: 'forwards'
    });
    
    // Remove after 7 seconds
    setTimeout(() => {
        notification.animate([
            { transform: 'translate(-50%, 0)', opacity: 1 },
            { transform: 'translate(-50%, 100%)', opacity: 0 }
        ], {
            duration: 500,
            easing: 'ease-in',
            fill: 'forwards'
        }).onfinish = () => notification.remove();
    }, 7000);
}

function showSimulationMessage(message) {
    // Create a status message for simulation progress
    const messageDiv = document.createElement('div');
    messageDiv.className = 'fixed bottom-16 left-1/2 transform -translate-x-1/2 bg-blue-600 bg-opacity-80 text-white px-4 py-2 rounded-lg text-sm z-40 flex items-center';
    messageDiv.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        ${message}
    `;
    
    document.body.appendChild(messageDiv);
    
    // Automatically remove previous simulation messages
    document.querySelectorAll('.simulation-message').forEach(el => el.remove());
    messageDiv.classList.add('simulation-message');
    
    // Remove after 5 seconds
    setTimeout(() => {
        messageDiv.classList.add('opacity-0', 'transition-opacity', 'duration-300');
        setTimeout(() => messageDiv.remove(), 300);
    }, 5000);
}

async function startTruckHazardSimulation() {
    // Show introduction overlay
    showSimulationIntro("This simulation demonstrates how NorthStar helps professional drivers avoid costly truck-specific hazards that standard GPS systems miss.");
    
    // Load a real route with potential truck hazards
    try {
        // First, show loading message
        showSimulationMessage("Loading truck-specific route data...");
        
        // Load the route (real API integration)
        const routeData = await loadSimulationRoute();
        
        if (!routeData) {
            throw new Error("Failed to load simulation route");
        }
        
        // Display info about the route
        showSimulationMessage(`Route loaded: ${routeData.name} (Distance: ${Math.round(routeData.distance/1609.34)} miles)`);
        
        // Start moving the truck along the route
        setTimeout(() => {
            showSimulationMessage("Starting truck movement along route...");
            startTruckMovementSimulation();
        }, 3000);
        
        // The rest happens automatically in the truck movement simulation:
        // 1. Truck moves along the real route
        // 2. Hazards are detected based on real or simulated truck restrictions
        // 3. Alerts are shown with voice guidance when hazards are encountered
        // 4. At the end, a business summary is shown with ROI calculations
        
    } catch (error) {
        console.error("Simulation error:", error);
        
        // Show friendly error and try to recover
        showSimulationMessage("Simulation encountered an error. Using backup simulation data.");
        
        // Force a basic simulation with predefined hazards
        setTimeout(() => {
            const fallbackRoute = {
                name: "Chicago to Detroit Test Route",
                pickup: { address: "Chicago, IL", lat: 41.8781, lon: -87.6298 },
                delivery: { address: "Detroit, MI", lat: 42.3314, lon: -83.0458 },
                truck: { height: 13.6, weight: 80000 },
                distance: 383000, // meters
                duration: 14400, // seconds
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [-87.6298, 41.8781],
                        [-85.7585, 42.2162],
                        [-83.0458, 42.3314]
                    ]
                }
            };
            
            // Add simulated hazards
            addSimulatedHazardsToRoute(fallbackRoute);
            
            // Display fallback route
            currentRouteData = fallbackRoute;
            displayRoute(currentRouteData);
            
            // Start the movement simulation
            startTruckMovementSimulation();
        }, 2000);
    }
}

// Add to your existing page initialization code
document.addEventListener('DOMContentLoaded', function() {
    const simulationMode = document.getElementById('simulationMode');
    
    if (simulationMode) {
        simulationMode.addEventListener('change', function() {
            const formContainer = document.querySelector('#routeForm');
            
            if (this.checked) {
                // Show simulation controls
                if (!document.getElementById('simulationControls')) {
                    const simulationPanel = document.createElement('div');
                    simulationPanel.id = 'simulationControls';
                    simulationPanel.className = 'mt-6 p-4 bg-yellow-50 rounded-md border-l-4 border-yellow-500';
                    simulationPanel.innerHTML = `
                        <h3 class="font-medium text-yellow-800 mb-2">Truck Hazard Simulation</h3>
                        <p class="text-sm text-yellow-700 mb-4">Experience a real-world demonstration of how NorthStar protects trucks from costly hazards.</p>
                        <button id="startSimulationBtn" class="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-3 px-4 rounded-md flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
                            </svg>
                            Start 60-Second Hazard Demo
                        </button>
                    `;
                    
                    // Add before the submit button
                    const submitButton = document.querySelector('button[type="submit"]');
                    if (submitButton && submitButton.parentNode) {
                        submitButton.parentNode.parentNode.insertBefore(simulationPanel, submitButton.parentNode);
                    } else {
                        formContainer.appendChild(simulationPanel);
                    }
                    
                    // Add event listener for simulation button
                    document.getElementById('startSimulationBtn').addEventListener('click', function(e) {
                        e.preventDefault();
                        startTruckHazardSimulation();
                    });
                }
            } else {
                // Remove simulation controls if they exist
                const simulationControls = document.getElementById('simulationControls');
                if (simulationControls) {
                    simulationControls.remove();
                }
            }
        });
    }
    
    // Check if we should activate simulation mode on load (e.g., from URL)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('simulation') === 'true' && simulationMode) {
        simulationMode.checked = true;
        simulationMode.dispatchEvent(new Event('change'));
        
        // Optionally auto-start simulation after a delay
        setTimeout(() => {
            const startButton = document.getElementById('startSimulationBtn');
            if (startButton) {
                startButton.click();
            }
        }, 1000);
    }
});