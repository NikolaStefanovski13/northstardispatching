// Configuration settings for the NorthStar application
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
    validateTruckRoute: 'api.php?action=validateTruckRoute',
    osrm: 'https://router.project-osrm.org/route/v1/driving/',
    geocode: 'https://nominatim.openstreetmap.org/search'
};

// Global settings
const APP_SETTINGS = {
    defaultMapCenter: [39.8283, -98.5795], // US center
    defaultZoom: 4,
    voiceGuidanceEnabled: true,
    debugMode: false
};

export { API_ENDPOINTS, APP_SETTINGS };