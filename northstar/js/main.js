/**
 * NorthStar - Truck Navigation and Route Planning System
 * Main entry point for the application
 */

import { debug } from './core/utils.js';
import { initializeMap } from './ui/map.js';
import { initDispatcherInterface } from './modules/dispatcher.js';
import { initDriverInterface } from './modules/driver.js';

/**
 * Initialize the appropriate interface based on the current page
 */
function initApplication() {
    console.log('NorthStar application initializing...');
    
    // Check if we're on dispatcher page (has routeForm)
    if (document.getElementById('routeForm')) {
        console.log('Initializing dispatcher interface');
        initDispatcherInterface();
    }
    
    // Check if we're on driver page (has map)
    else if (document.getElementById('map')) {
        console.log('Initializing driver interface');
        // Initialize map first
        initializeMap('map');
        // Then initialize driver interface
        initDriverInterface();
    }
    
    // Check if we're on dashboard page
    else if (document.getElementById('routesTableBody')) {
        console.log('Initializing dashboard');
        import('../../js archive/dashboard.js').then(dashboard => {
            dashboard.initDashboard();
        });
    }
    
    // Check if we're on drivers management page
    else if (document.getElementById('driversTableBody')) {
        console.log('Initializing drivers management');
        import('./drivers.js').then(drivers => {
            drivers.initDriversManagement();
        });
    }
    
    // Check if we're on tracking page
    else if (document.querySelector('.driver-card')) {
        console.log('Initializing tracking view');
        initializeMap('map');
        import('./tracking.js').then(tracking => {
            tracking.initTrackingView();
        });
    }
}

// Wait for DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', initApplication);

// Export for potential use in other modules
export { initApplication };