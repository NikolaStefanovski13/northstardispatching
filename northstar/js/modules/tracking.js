import { API_ENDPOINTS } from '../core/config.js';
import { debug, calculateDistance } from '../core/utils.js';

/**
 * Start tracking the user's location
 * @param {Function} locationCallback - Callback for when location updates
 * @returns {number} Watcher ID for the geolocation service
 */
function startLocationTracking(locationCallback) {
    if (!('geolocation' in navigator)) {
        debug('Geolocation not available in this browser');
        return null;
    }
    
    const watchId = navigator.geolocation.watchPosition(
        position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            const speed = position.coords.speed;
            const heading = position.coords.heading;
            
            debug('Got user location', [lat, lng]);
            
            if (typeof locationCallback === 'function') {
                locationCallback({
                    lat, 
                    lng,
                    accuracy,
                    speed,
                    heading,
                    timestamp: new Date().toISOString()
                });
            }
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
    
    return watchId;
}

/**
 * Stop tracking location
 * @param {number} watchId - The ID returned by startLocationTracking
 */
function stopLocationTracking(watchId) {
    if (watchId && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
        debug('Location tracking stopped');
    }
}

/**
 * Update position in the database
 * @param {Object} positionData - Position data to update
 * @returns {Promise} Promise resolving to success status
 */
async function updatePosition(positionData) {
    try {
        const response = await fetch(API_ENDPOINTS.updatePosition, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(positionData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to update position');
        }
        
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Error updating position:', error);
        return false;
    }
}

/**
 * Log driver activity
 * @param {Object} activityData - Activity data to log
 * @returns {Promise} Promise resolving to success status
 */
async function logActivity(activityData) {
    try {
        const response = await fetch(API_ENDPOINTS.logActivity, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(activityData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to log activity');
        }
        
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Error logging activity:', error);
        return false;
    }
}

/**
 * Calculate the closest point on a route to the current position
 * @param {Array} currentPosition - Current position [lat, lng]
 * @param {Array} routeCoordinates - Array of route coordinates [lat, lng]
 * @returns {Object} Object with closest point index and distance
 */
function findClosestPointOnRoute(currentPosition, routeCoordinates) {
    let closestPointIndex = 0;
    let closestDistance = Infinity;
    
    for (let i = 0; i < routeCoordinates.length; i++) {
        const distance = calculateDistance(
            currentPosition,
            routeCoordinates[i]
        );
        
        if (distance < closestDistance) {
            closestDistance = distance;
            closestPointIndex = i;
        }
    }
    
    return {
        index: closestPointIndex,
        distance: closestDistance,
        isOffRoute: closestDistance > 0.1 // More than 100 meters from route
    };
}

export {
    startLocationTracking,
    stopLocationTracking,
    updatePosition,
    logActivity,
    findClosestPointOnRoute
};