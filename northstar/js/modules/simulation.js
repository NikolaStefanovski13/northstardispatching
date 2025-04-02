import { API_ENDPOINTS } from '../core/config.js';
import { debug, formatStatus } from '../core/utils.js';
import { speak } from '../modules/driver.js';
import { addHazardMarker } from '../ui/map.js';

// Simulation globals
let currentRouteData = null;
let simulationInterval = null;
let hazardTriggered25 = false;
let hazardTriggered50 = false;
let hazardTriggered75 = false;

/**
 * Add test scenario options to the route form
 */
function addTestScenarios() {
    // Define test routes with obstacles
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
        // Don't add if already exists
        if (document.getElementById('testScenarioContainer')) {
            return;
        }
        
        const testContainer = document.createElement('div');
        testContainer.id = 'testScenarioContainer';
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

/**
 * Add simulated hazards to a route for testing
 * @param {Object} route - Route data to add hazards to
 */
function addSimulatedHazards(route) {
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

/**
 * Start the truck hazard simulation demo
 */
function startTruckHazardSimulation() {
    // Show introduction overlay
    showSimulationIntro("This simulation demonstrates how NorthStar helps professional drivers avoid costly truck-specific hazards that standard GPS systems miss.");
}

/**
 * Start simulated truck movement along a route
 */
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
    
    // Make sure we have a map and routeLayer
    if (!window.map || !window.routeLayer) {
        console.error('Map not initialized for simulation');
        return;
    }
    
    // Add truck marker to the map
    const truckMarker = L.marker(routeCoordinates[0], {
        icon: truckIcon
    }).addTo(window.routeLayer);
    
    // Calculate the total simulation duration (60 seconds)
    const totalDuration = 60 * 1000; // 60 seconds in milliseconds
    const totalPoints = routeCoordinates.length;
    
    // Calculate how many points to show per interval to complete in 60 seconds
    const pointsPerInterval = Math.max(1, Math.ceil(totalPoints / (totalDuration / 1000)));
    
    let currentIndex = 0;
    const updateInterval = 1000; // Update every second
    
    // Reset hazard triggers
    hazardTriggered25 = false;
    hazardTriggered50 = false;
    hazardTriggered75 = false;
    
    // Clear any existing interval
    if (simulationInterval) {
        clearInterval(simulationInterval);
    }
    
    // Start moving the truck
    simulationInterval = setInterval(() => {
        currentIndex += pointsPerInterval;
        
        if (currentIndex >= totalPoints) {
            clearInterval(simulationInterval);
            simulationInterval = null;
            
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
        
        // Check for hazards at this position
        checkForHazards(position, currentIndex, totalPoints);
        
    }, updateInterval);
}

/**
 * Check for hazards at the current simulation position
 */
function checkForHazards(position, index, totalPoints) {
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
}

/**
 * Simulate a hazard encounter during the simulation
 */
function simulateHazardEncounter(hazardType, warningMessage) {
    // Import components module for UI notifications
    import('../ui/components.js').then(components => {
        // Calculate cost and time impact based on hazard type
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
        
        // Add hazard marker to the map
        const marker = addHazardMarker(position, hazardType, warningMessage);
        
        // Show visual alert
        components.showHazardAlert(hazardType, warningMessage);
        
        // Speak the warning
        speak(warningMessage, true);
        
        // Show rerouting notification
        setTimeout(() => {
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
            
            // Show notification about rerouting
            components.showRouteUpdateNotification(`REROUTED: Potential savings of $${avgSavings.toLocaleString()}`);
        }, 3000);
    });
}

/**
 * Show simulation introduction overlay
 */
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
        startTruckMovementSimulation();
    });
}

/**
 * Show simulation summary with ROI analysis
 */
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
        const simulationMode = document.getElementById('simulationMode');
        if (simulationMode) {
            simulationMode.checked = false;
        }
        // Reload the current route for real navigation
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        if (token) {
            // Import driver module to reload route
            import('./driver.js').then(driver => {
                driver.loadRouteData(token);
            });
        }
    });
}

export {
    addTestScenarios,
    addSimulatedHazards,
    startTruckHazardSimulation,
    startTruckMovementSimulation,
    showSimulationIntro,
    showSimulationSummary
};