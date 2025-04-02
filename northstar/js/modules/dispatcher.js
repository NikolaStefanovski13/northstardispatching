import { API_ENDPOINTS } from '../core/config.js';
import { debug, formatDistance, formatDuration, generateToken, extractDirectionsFromRoute } from '../core/utils.js';
import { geocodeAddress, calculateRoute } from '../core/geo.js';

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
    
    // Initialize simulation mode if present
    const simulationMode = document.getElementById('simulationMode');
    if (simulationMode) {
        simulationMode.addEventListener('change', toggleSimulationMode);
    }
}

/**
 * Toggle simulation mode functionality
 */
function toggleSimulationMode() {
    const isEnabled = this.checked;
    
    // Import simulation module dynamically when needed
    if (isEnabled) {
        import('./simulation.js').then(module => {
            module.addTestScenarios();
        });
    } else {
        // Remove simulation elements if they exist
        const testContainer = document.getElementById('testScenarioContainer');
        if (testContainer) {
            testContainer.remove();
        }
    }
}

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
        const response = await fetch(`${API_ENDPOINTS.getAllDrivers}&status=available`);
        
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
        
        // Get truck specs
        const truckHeight = parseFloat(formData.get('truckHeight') || 13.6);
        const truckWeight = parseFloat(formData.get('truckWeight') || 80000);
        
        // Validate if route is truck-safe
        const validationResponse = await validateTruckRoute({
            pickup: {
                lat: pickup.lat,
                lon: pickup.lon
            },
            delivery: {
                lat: delivery.lat,
                lon: delivery.lon
            },
            truck: {
                height: truckHeight,
                weight: truckWeight
            }
        });
        
        // Check if the route is valid for trucks
        if (!validationResponse.valid) {
            // Display truck-specific warning
            alert('WARNING: This route has restrictions for your truck specifications. It may contain low bridges or weight-restricted roads.');
            
            // Optional: You can still allow them to proceed or block completely
            if (!confirm('Do you still want to create this route?')) {
                submitButton.textContent = originalText;
                submitButton.disabled = false;
                return;
            }
        }
        
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
                height: truckHeight,
                weight: truckWeight
            },
            notes: formData.get('notes'),
            distance: route.distance,
            duration: route.duration,
            token: token,
            status: 'pending',
            geometry: route.geometry,
            directions: directions,
            routePreferences: {
                avoidWeighStations: formData.get('avoidWeighStations') === 'on',
                showWeighStations: formData.get('showWeighStations') === 'on',
                weighStationAlerts: formData.get('weighStationAlerts') === 'on'
            }
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
        
        // Set route preferences if available
        if (routeData.routePreferences) {
            if (routeData.routePreferences.avoidWeighStations) {
                document.getElementById('avoidWeighStations').checked = true;
            }
            if (routeData.routePreferences.showWeighStations) {
                document.getElementById('showWeighStations').checked = true;
            }
            if (routeData.routePreferences.weighStationAlerts) {
                document.getElementById('weighStationAlerts').checked = true;
            }
        }
        
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
    
    // Add truck validation badge
    const resultsDiv = document.getElementById('routeResults');
    if (resultsDiv) {
        const truckHeight = document.getElementById('truckHeight').value;
        const truckWeight = document.getElementById('truckWeight').value;
        
        // Create validation badge if it doesn't exist
        if (!document.getElementById('validationBadge')) {
            const validationBadge = document.createElement('div');
            validationBadge.id = 'validationBadge';
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

export {
    initDispatcherInterface,
    loadAvailableDrivers,
    handleRouteFormSubmit
};