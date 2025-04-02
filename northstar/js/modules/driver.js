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
        if (routeNameElement && !routeNameElement.nextElementSibling?.classList.contains('mb-6')) {
            routeNameElement.parentNode.appendChild(statusDiv);
        }
    }
    
    // Announce first direction with voice guidance
    if (voiceEnabled && routeData.directions && routeData.directions.length > 0) {
        speak(routeData.directions[0].instruction);
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
            const response = await fetch(`${API_ENDPOINTS.updateRoute}&token=${token}`, {
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
 * @param {boolean} isWarning - If true, use warning voice/sound
 */
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
        try {
            // Create a more professional alert sound approach
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
            
            gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 1);
        } catch (e) {
            console.log('Audio alert could not be played: ', e);
        }
    }
}

export {
    initDriverInterface,
    displayRoute,
    updateDriverUI,
    startLocationTracking,
    speak
};