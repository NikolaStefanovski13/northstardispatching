import { API_ENDPOINTS, APP_SETTINGS } from '../core/config.js';
import { debug } from '../core/utils.js';

// Map globals
let map = null;
let routeLayer = null;

/**
 * Initialize the map with default settings
 * @param {string} elementId - ID of the HTML element to render the map in
 * @param {Array} center - Initial center coordinates [lat, lon]
 * @param {number} zoom - Initial zoom level
 * @returns {Object} Map instance and route layer
 */
function initializeMap(elementId = 'map', center = APP_SETTINGS.defaultMapCenter, zoom = APP_SETTINGS.defaultZoom) {
    const mapElement = document.getElementById(elementId);
    if (!mapElement) {
        debug('Map element not found', elementId);
        return null;
    }
    
    // Create map instance
    map = L.map(elementId).setView(center, zoom);
    
    // Add base tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    // Create a layer for routes and markers
    routeLayer = L.layerGroup().addTo(map);
    
    debug('Map initialized', { elementId, center, zoom });
    
    return { map, routeLayer };
}

/**
 * Display a route on the map
 * @param {Object} routeData - Route data with coordinates and geometry
 * @param {Object} options - Display options (e.g., colors, weights)
 */
function displayRouteOnMap(routeData, options = {}) {
    if (!map || !routeLayer) {
        debug('Map not initialized');
        return;
    }
    
    // Default options
    const defaultOptions = {
        routeColor: 'blue',
        routeWeight: 5,
        routeOpacity: 0.7,
        fitPadding: [50, 50]
    };
    
    // Merge options
    const displayOptions = { ...defaultOptions, ...options };
    
    // Clear existing layers
    routeLayer.clearLayers();
    
    // Check if we have coordinates
    if (!routeData.pickup || !routeData.delivery) {
        debug('Missing pickup or delivery coordinates');
        return;
    }
    
    // Add pickup marker
    const pickupMarker = L.marker([routeData.pickup.lat, routeData.pickup.lon]).addTo(routeLayer);
    pickupMarker.bindPopup(`<b>Pickup:</b> ${routeData.pickup.address || 'Unknown location'}`);
    
    // Add delivery marker
    const deliveryMarker = L.marker([routeData.delivery.lat, routeData.delivery.lon]).addTo(routeLayer);
    deliveryMarker.bindPopup(`<b>Delivery:</b> ${routeData.delivery.address || 'Unknown location'}`);
    
    // Draw route line
    let routeLine;
    
    if (routeData.geometry && routeData.geometry.coordinates) {
        // Convert GeoJSON coordinates [lon, lat] to Leaflet coordinates [lat, lon]
        const routeCoordinates = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        
        routeLine = L.polyline(routeCoordinates, {
            color: displayOptions.routeColor,
            weight: displayOptions.routeWeight,
            opacity: displayOptions.routeOpacity
        }).addTo(routeLayer);
    } else {
        // Fallback to direct line if no geometry
        routeLine = L.polyline([
            [routeData.pickup.lat, routeData.pickup.lon],
            [routeData.delivery.lat, routeData.delivery.lon]
        ], {
            color: displayOptions.routeColor,
            weight: displayOptions.routeWeight,
            opacity: displayOptions.routeOpacity,
            dashArray: '5, 10' // Dashed line to indicate it's not a real route
        }).addTo(routeLayer);
    }
    
    // Fit map to show the entire route
    map.fitBounds(routeLine.getBounds(), { padding: displayOptions.fitPadding });
    
    return routeLine;
}

/**
 * Add a marker for the current user location
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Object} The marker object
 */
function addCurrentLocationMarker(lat, lng) {
    if (!map || !routeLayer) return null;
    
    // Remove any existing current location markers
    routeLayer.eachLayer(layer => {
        if (layer.options && layer.options.currentLocation) {
            routeLayer.removeLayer(layer);
        }
    });
    
    // Create custom marker for current location
    const currentMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'current-location-marker',
            html: '<div style="background-color: #4f46e5; border-radius: 50%; width: 16px; height: 16px; border: 3px solid white;"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        }),
        currentLocation: true
    }).addTo(routeLayer);
    
    return currentMarker;
}

/**
 * Add a hazard marker to the map
 * @param {Array} position - [lat, lng] position
 * @param {string} type - Type of hazard (lowBridge, weightLimit, truckProhibited)
 * @param {string} message - Hazard description
 * @returns {Object} The marker object
 */
function addHazardMarker(position, type, message) {
    if (!map || !routeLayer) return null;
    
    // Define icon based on hazard type
    let icon, color;
    
    switch(type) {
        case "lowBridge":
            icon = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M16 8v8m-4-8v8m-4 0h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />`;
            color = '#ef4444'; // red
            break;
        case "weightLimit": 
            icon = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />`;
            color = '#f59e0b'; // amber
            break;
        case "truckProhibited":
            icon = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />`;
            color = '#7c3aed'; // purple
            break;
        default:
            icon = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />`;
            color = '#ef4444'; // red
    }
    
    // Create custom icon
    const customIcon = L.divIcon({
        html: `<div style="background-color: ${color}; color: white; padding: 5px; border-radius: 50%; 
               width: 40px; height: 40px; display: flex; align-items: center; justify-center; 
               border: 3px solid white; box-shadow: 0 0 15px rgba(0,0,0,0.7);">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   ${icon}
                 </svg>
               </div>`,
        className: 'pulse-animation',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });
    
    // Add marker with popup
    const marker = L.marker(position, { icon: customIcon }).addTo(routeLayer);
    
    // Create a detailed popup with useful info
    marker.bindPopup(`
        <div class="p-3 max-w-md">
            <div class="flex items-center space-x-2 mb-2">
                <div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%;"></div>
                <h3 class="font-bold text-lg">${message}</h3>
            </div>
            
            <div class="mt-2">
                <p class="text-sm font-medium text-green-700">NorthStar has identified this truck-specific hazard</p>
            </div>
        </div>
    `, { maxWidth: 300 });
    
    return marker;
}

/**
 * Export map instance and functions
 */
export {
    initializeMap,
    displayRouteOnMap,
    addCurrentLocationMarker,
    addHazardMarker,
    map,
    routeLayer
};