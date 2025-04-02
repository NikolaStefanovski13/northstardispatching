// Utility functions for the NorthStar application

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

export { 
    formatDistance, 
    formatDuration, 
    generateToken, 
    debug, 
    extractDirectionsFromRoute, 
    formatStatus, 
    getStatusColor,
    calculateDistance,
    debounce
};