import { API_ENDPOINTS } from './config.js';
import { debug } from './utils.js';

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
 * Validate if a route is truck-safe
 * @param {Object} pickup - Pickup coordinates
 * @param {Object} delivery - Delivery coordinates
 * @param {Object} truckSpecs - Truck specifications (height, weight)
 * @returns {Promise} Promise resolving to validation result
 */
async function validateTruckRoute(pickup, delivery, truckSpecs) {
    try {
        const response = await fetch(API_ENDPOINTS.validateTruckRoute, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pickup: pickup,
                delivery: delivery,
                truck: truckSpecs
            })
        });
        
        if (!response.ok) {
            throw new Error('Truck route validation request failed');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Truck validation error:', error);
        throw error;
    }
}

export {
    geocodeAddress,
    calculateRoute,
    searchAddresses,
    validateTruckRoute
};