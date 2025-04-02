/**
 * UI Components module for NorthStar
 * Contains reusable UI components and notification functions
 */

/**
 * Show a hazard alert notification
 * @param {string} hazardType - Type of hazard (lowBridge, weightLimit, truckProhibited)
 * @param {string} message - Alert message
 */
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

/**
 * Show route update notification
 * @param {string} message - Notification message
 */
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

/**
 * Show a simulation progress message
 * @param {string} message - Status message
 */
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

/**
 * Create a modal dialog
 * @param {string} title - Modal title
 * @param {string} content - Modal HTML content
 * @param {Object} options - Configuration options
 * @returns {HTMLElement} The modal element
 */
function createModal(title, content, options = {}) {
    // Default options
    const defaultOptions = {
        width: 'max-w-lg',
        showClose: true,
        closable: true
    };
    
    const modalOptions = {...defaultOptions, ...options};
    
    // Create modal container
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    
    // Create modal content
    modalOverlay.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl ${modalOptions.width} mx-4 overflow-hidden">
            <div class="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 class="text-lg font-medium text-gray-900">${title}</h3>
                ${modalOptions.showClose ? `
                    <button class="modal-close text-gray-400 hover:text-gray-500">
                        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                ` : ''}
            </div>
            <div class="p-4">
                ${content}
            </div>
        </div>
    `;
    
    // Add to document
    document.body.appendChild(modalOverlay);
    
    // Set up event listeners for closing
    if (modalOptions.closable) {
        const closeButton = modalOverlay.querySelector('.modal-close');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                modalOverlay.remove();
            });
        }
        
        // Close on backdrop click if closable
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });
    }
    
    return modalOverlay;
}

/**
 * Create a toast notification
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, warning, info)
 * @param {Object} options - Configuration options
 */
function showToast(message, type = 'info', options = {}) {
    // Default options
    const defaultOptions = {
        duration: 3000,
        position: 'bottom-right'
    };
    
    const toastOptions = {...defaultOptions, ...options};
    
    // Determine styles based on type
    let bgColor, textColor, icon;
    switch(type) {
        case 'success':
            bgColor = 'bg-green-500';
            textColor = 'text-white';
            icon = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />`;
            break;
        case 'error':
            bgColor = 'bg-red-500';
            textColor = 'text-white';
            icon = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />`;
            break;
        case 'warning':
            bgColor = 'bg-yellow-500';
            textColor = 'text-white';
            icon = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />`;
            break;
        case 'info':
        default:
            bgColor = 'bg-blue-500';
            textColor = 'text-white';
            icon = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />`;
    }
    
    // Determine position styles
    let positionClass;
    switch(toastOptions.position) {
        case 'top-left':
            positionClass = 'top-4 left-4';
            break;
        case 'top-right':
            positionClass = 'top-4 right-4';
            break;
        case 'top-center':
            positionClass = 'top-4 left-1/2 transform -translate-x-1/2';
            break;
        case 'bottom-left':
            positionClass = 'bottom-4 left-4';
            break;
        case 'bottom-center':
            positionClass = 'bottom-4 left-1/2 transform -translate-x-1/2';
            break;
        case 'bottom-right':
        default:
            positionClass = 'bottom-4 right-4';
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `fixed ${positionClass} ${bgColor} ${textColor} px-4 py-2 rounded-lg shadow-lg z-50 flex items-center`;
    toast.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            ${icon}
        </svg>
        <span>${message}</span>
    `;
    
    // Add to document
    document.body.appendChild(toast);
    
    // Add entrance animation
    toast.animate([
        { opacity: 0, transform: 'translateY(20px)' },
        { opacity: 1, transform: 'translateY(0)' }
    ], {
        duration: 300,
        easing: 'ease-out',
        fill: 'forwards'
    });
    
    // Auto-remove after duration
    setTimeout(() => {
        toast.animate([
            { opacity: 1, transform: 'translateY(0)' },
            { opacity: 0, transform: 'translateY(20px)' }
        ], {
            duration: 300,
            easing: 'ease-in',
            fill: 'forwards'
        }).onfinish = () => toast.remove();
    }, toastOptions.duration);
    
    return toast;
}

/**
 * Create a loading spinner element
 * @param {string} size - Size of spinner (sm, md, lg)
 * @param {string} color - Color of spinner (blue, green, red, yellow)
 * @returns {HTMLElement} The spinner element
 */
function createSpinner(size = 'md', color = 'blue') {
    // Determine size class
    let sizeClass;
    switch(size) {
        case 'sm':
            sizeClass = 'h-4 w-4';
            break;
        case 'lg':
            sizeClass = 'h-8 w-8';
            break;
        case 'md':
        default:
            sizeClass = 'h-6 w-6';
    }
    
    // Determine color class
    let colorClass;
    switch(color) {
        case 'green':
            colorClass = 'text-green-500';
            break;
        case 'red':
            colorClass = 'text-red-500';
            break;
        case 'yellow':
            colorClass = 'text-yellow-500';
            break;
        case 'blue':
        default:
            colorClass = 'text-blue-500';
    }
    
    // Create spinner element
    const spinner = document.createElement('div');
    spinner.className = `${sizeClass} ${colorClass} animate-spin`;
    spinner.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    `;
    
    return spinner;
}

export {
    showHazardAlert,
    showRouteUpdateNotification,
    showSimulationMessage,
    createModal,
    showToast,
    createSpinner
};