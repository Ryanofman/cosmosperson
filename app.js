// Main application script for Cosmos Person Photography
let aladin;
let photoCatalog;
let photoData = [];
let isLoading = true;

// Initialize when DOM is ready
$(document).ready(function() {
    initializeAladin();
    
    // Check for Aladin controls overlap after a delay
    setTimeout(() => {
        adjustBrandPosition();
    }, 3000);
});

// Initialize Aladin Sky Atlas
function initializeAladin() {
    aladin = A.aladin('#aladin-lite-div', {
        survey: 'P/DSS2/color',
        fov: CONFIG.DEFAULT_FOV,
        target: CONFIG.DEFAULT_TARGET,
        cooFrame: 'J2000',
        showReticle: false,
        showZoomControl: true,
        showFullscreenControl: true,
        showLayersControl: true,
        showGotoControl: false,
        showShareControl: false,
        showCatalog: true,
        showFrame: false,
        showCooGrid: false
    });
    
    // Wait for Aladin to fully initialize
    setTimeout(() => {
        loadPhotosFromGitHub();
        setupEventListeners();
        
        // Force remove grid elements after Aladin loads
        setTimeout(() => {
            // Remove coordinate grid
            const gridElements = document.querySelectorAll('.aladin-cooGrid');
            gridElements.forEach(el => {
                el.style.display = 'none';
            });
            
            // Remove any canvas with grid
            const canvases = aladin.view.catalogCanvas.parentElement.querySelectorAll('canvas');
            canvases.forEach((canvas, index) => {
                // The grid is usually the second or third canvas
                if (index > 0 && canvas.style.pointerEvents === 'none') {
                    canvas.style.display = 'none';
                }
            });
            
            // Try to disable grid through Aladin API if available
            if (aladin.view && aladin.view.cooGrid) {
                aladin.view.cooGrid.hide();
            }
        }, 1000);
    }, 2000);
    
    // Update visible count when view changes
    aladin.on('positionChanged', updateVisibleCount);
    aladin.on('zoomChanged', updateVisibleCount);
}

// Load photos from GitHub repository
async function loadPhotosFromGitHub() {
    // Show loading state
    updateLoadingState(true);
    
    // Check if we're in dev mode or using sample data
    if (CONFIG.DEV_MODE || CONFIG.GITHUB_USERNAME === 'YOUR_GITHUB_USERNAME') {
        loadSamplePhotos();
        return;
    }
    
    try {
        // Check if we have cached data
        const cachedData = getCachedData();
        if (cachedData) {
            processPhotoData(cachedData);
            updateLoadingState(false);
            return;
        }
        
        // Fetch repository contents from GitHub API
        const apiUrl = `${CONFIG.GITHUB_API_BASE}/repos/${CONFIG.GITHUB_USERNAME}/${CONFIG.GITHUB_REPO}/contents/${CONFIG.IMAGES_PATH}`;
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const files = await response.json();
        
        // Filter for image files
        const imageFiles = files.filter(file => 
            file.type === 'file' && 
            CONFIG.SUPPORTED_FORMATS.some(ext => 
                file.name.toLowerCase().endsWith(`.${ext}`)
            )
        );
        
        // Process each image file
        const processedPhotos = [];
        imageFiles.forEach(file => {
            const celestialObject = findCelestialObject(file.name);
            
            if (celestialObject) {
                processedPhotos.push({
                    id: normalizeObjectName(file.name),
                    name: celestialObject.name,
                    ra: celestialObject.ra,
                    dec: celestialObject.dec,
                    type: celestialObject.type || 'unknown',
                    imageUrl: file.download_url,
                    filename: file.name,
                    size: file.size
                });
            } else {
                console.warn(`No celestial object found for: ${file.name}`);
            }
        });
        
        // Cache the data
        setCachedData(processedPhotos);
        
        // Process and display
        processPhotoData(processedPhotos);
        
    } catch (error) {
        console.error('Error loading photos from GitHub:', error);
        showError('Unable to load photos from GitHub. Using sample data.');
        loadSamplePhotos();
    } finally {
        updateLoadingState(false);
    }
}

// Process photo data and add to map
function processPhotoData(photos) {
    photoData = photos;
    displayPhotosOnMap();
    updateUI();
}

// Load sample photos for demonstration
function loadSamplePhotos() {
    const samplePhotos = [
        {
            id: 'NGC2157',
            name: 'NGC 2157',
            ra: 89.2167,
            dec: -23.9167,
            type: 'emission nebula',
            imageUrl: createPlaceholderImage('NGC 2157'),
            filename: 'NGC2157.jpg'
        },
        {
            id: 'M42',
            name: 'Orion Nebula',
            ra: 83.8221,
            dec: -5.3911,
            type: 'emission nebula',
            imageUrl: createPlaceholderImage('M42 - Orion Nebula'),
            filename: 'M42.jpg'
        },
        {
            id: 'M31',
            name: 'Andromeda Galaxy',
            ra: 10.6847,
            dec: 41.2687,
            type: 'galaxy',
            imageUrl: createPlaceholderImage('M31 - Andromeda'),
            filename: 'M31.jpg'
        },
        {
            id: 'IC5070',
            name: 'Pelican Nebula',
            ra: 313.7500,
            dec: 44.3667,
            type: 'emission nebula',
            imageUrl: createPlaceholderImage('IC5070 - Pelican'),
            filename: 'IC5070.jpg'
        }
    ];
    
    processPhotoData(samplePhotos);
}

// Create placeholder image
function createPlaceholderImage(text) {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
            <rect width="800" height="600" fill="#000"/>
            <rect width="800" height="600" fill="url(#stars)"/>
            <text x="400" y="300" text-anchor="middle" fill="#ffa500" 
                  font-size="32" font-family="Orbitron, monospace">${text}</text>
            <text x="400" y="340" text-anchor="middle" fill="#fff" 
                  font-size="16" opacity="0.7">Your Photo Here</text>
            <defs>
                <pattern id="stars" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
                    <circle cx="10" cy="10" r="1" fill="#fff" opacity="0.5"/>
                    <circle cx="40" cy="25" r="0.5" fill="#fff" opacity="0.3"/>
                    <circle cx="60" cy="50" r="1.5" fill="#fff" opacity="0.7"/>
                    <circle cx="90" cy="70" r="0.8" fill="#fff" opacity="0.4"/>
                    <circle cx="30" cy="80" r="1" fill="#fff" opacity="0.6"/>
                </pattern>
            </defs>
        </svg>
    `;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// Display photos on the map
function displayPhotosOnMap() {
    // Remove existing catalog if any
    if (photoCatalog) {
        aladin.removeCatalog(photoCatalog);
    }
    
    // Create new catalog for photos
    photoCatalog = A.catalog({
        name: 'My Astrophotos',
        sourceSize: CONFIG.MARKER_SIZE,
        shape: 'circle',
        color: '#ffa500',
        labelColumn: 'name',
        displayLabel: true,
        labelColor: '#ffa500',
        labelFont: '14px Orbitron, monospace',
        labelOffset: [0, -20]
    });
    
    // Add custom styles for photo markers
    addCustomMarkerStyles();
    
    // Add sources to catalog
    photoData.forEach(photo => {
        const source = A.source(photo.ra, photo.dec, {
            name: photo.name,
            photoId: photo.id,
            photoData: photo
        });
        photoCatalog.addSources([source]);
    });
    
    // Add catalog to Aladin
    aladin.addCatalog(photoCatalog);
    
    // Set up click handler for catalog sources
    photoCatalog.onClick = function(source) {
        if (source && source.data && source.data.photoData) {
            // Add smooth transition before showing photo
            const photo = source.data.photoData;
            
            // First, smoothly animate to the object
            aladin.animateToRaDec(photo.ra, photo.dec, 5, 1000);
            
            // Then show the photo with a delay for smooth transition
            setTimeout(() => {
                openPhotoViewer(photo);
            }, 1200);
        }
    };
}

// Add custom marker styles
function addCustomMarkerStyles() {
    // Check if styles already exist
    if (document.getElementById('custom-marker-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'custom-marker-styles';
    style.textContent = `
        /* Custom styles for photo markers */
        .aladin-location-my-astrophotos {
            cursor: pointer !important;
        }
        
        .aladin-source-my-astrophotos {
            width: 40px !important;
            height: 40px !important;
            margin: -20px 0 0 -20px !important;
            background: radial-gradient(circle at center, 
                rgba(255, 165, 0, 0.9) 0%, 
                rgba(255, 165, 0, 0.6) 40%, 
                rgba(255, 100, 0, 0.3) 100%) !important;
            border-radius: 50% !important;
            border: 3px solid #ffa500 !important;
            box-shadow: 0 0 20px rgba(255, 165, 0, 0.8),
                        0 0 40px rgba(255, 165, 0, 0.4),
                        inset 0 0 10px rgba(255, 255, 255, 0.3) !important;
            animation: photoBeacon 3s ease-in-out infinite !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            position: relative !important;
        }
        
        .aladin-source-my-astrophotos::before {
            content: '📸' !important;
            font-size: 18px !important;
            position: absolute !important;
            filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.8)) !important;
        }
        
        .aladin-source-my-astrophotos::after {
            content: '' !important;
            position: absolute !important;
            width: 100% !important;
            height: 100% !important;
            border-radius: 50% !important;
            border: 2px solid rgba(255, 165, 0, 0.5) !important;
            animation: pulseRing 3s ease-out infinite !important;
        }
        
        .aladin-source-my-astrophotos:hover {
            transform: scale(1.2) !important;
        }
    `;
    document.head.appendChild(style);
}

// Update UI elements
function updateUI() {
    // Update capture count
    document.getElementById('capture-count').textContent = photoData.length;
    
    // Update photo list
    const listContainer = document.getElementById('photo-list');
    listContainer.innerHTML = '';
    
    photoData.forEach(photo => {
        const item = document.createElement('div');
        item.className = 'photo-list-item';
        item.innerHTML = `
            <span>${photo.name}</span>
            <span class="photo-status">📸</span>
        `;
        item.onclick = () => {
            // Smooth animation to photo
            aladin.animateToRaDec(photo.ra, photo.dec, 5, 1000);
            // Optional: show photo after arriving
            setTimeout(() => openPhotoViewer(photo), 1200);
        };
        listContainer.appendChild(item);
    });
    
    updateVisibleCount();
}

// Go to specific photo
function goToPhoto(photo) {
    aladin.animateToRaDec(photo.ra, photo.dec, 3, CONFIG.ANIMATION_DURATION);
}

// Update visible photo count
function updateVisibleCount() {
    let visibleCount = 0;
    const view = aladin.getRaDec();
    const fov = aladin.getFov()[0];
    
    photoData.forEach(photo => {
        const distance = calculateAngularDistance(
            view[0], view[1], 
            photo.ra, photo.dec
        );
        if (distance < fov / 2) {
            visibleCount++;
        }
    });
    
    document.getElementById('visible-count').textContent = visibleCount;
}

// Calculate angular distance between two celestial coordinates
function calculateAngularDistance(ra1, dec1, ra2, dec2) {
    const toRad = Math.PI / 180;
    const dRA = (ra2 - ra1) * toRad;
    const dDec = (dec2 - dec1) * toRad;
    const a = Math.sin(dDec/2) * Math.sin(dDec/2) +
              Math.cos(dec1 * toRad) * Math.cos(dec2 * toRad) *
              Math.sin(dRA/2) * Math.sin(dRA/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return c * 180 / Math.PI;
}

// Search for object
function searchObject() {
    const query = document.getElementById('object-search').value.trim();
    if (!query) return;
    
    // First check if it's one of our photos
    const normalizedQuery = normalizeObjectName(query);
    const ourPhoto = photoData.find(photo => 
        photo.id === normalizedQuery || 
        photo.name.toLowerCase().includes(query.toLowerCase())
    );
    
    if (ourPhoto) {
        // Smooth animation to our photo
        aladin.animateToRaDec(ourPhoto.ra, ourPhoto.dec, 5, 1000);
        setTimeout(() => openPhotoViewer(ourPhoto), 1200);
    } else {
        // Search in celestial database
        const celestialObject = findCelestialObject(query);
        if (celestialObject) {
            aladin.animateToRaDec(celestialObject.ra, celestialObject.dec, 3);
        } else {
            // Let Aladin handle it (for coordinates or unknown objects)
            aladin.gotoObject(query);
        }
    }
}

// Go to random photo
function goToRandomPhoto() {
    if (photoData.length === 0) {
        showMessage('No photos loaded yet!');
        return;
    }
    
    const randomPhoto = photoData[Math.floor(Math.random() * photoData.length)];
    
    // Smooth animation to photo location
    aladin.animateToRaDec(randomPhoto.ra, randomPhoto.dec, 5, 1000);
    
    // Show photo after animation with smooth transition
    setTimeout(() => {
        openPhotoViewer(randomPhoto);
    }, 1200);
}

// Show all photos
function showAllPhotos() {
    if (photoData.length === 0) return;
    
    // Calculate bounds
    let minRa = Infinity, maxRa = -Infinity;
    let minDec = Infinity, maxDec = -Infinity;
    
    photoData.forEach(photo => {
        minRa = Math.min(minRa, photo.ra);
        maxRa = Math.max(maxRa, photo.ra);
        minDec = Math.min(minDec, photo.dec);
        maxDec = Math.max(maxDec, photo.dec);
    });
    
    // Handle RA wrap-around (0-360 degrees)
    if (maxRa - minRa > 180) {
        // Photos span across RA 0
        let newMinRa = Infinity, newMaxRa = -Infinity;
        photoData.forEach(photo => {
            const ra = photo.ra > 180 ? photo.ra - 360 : photo.ra;
            newMinRa = Math.min(newMinRa, ra);
            newMaxRa = Math.max(newMaxRa, ra);
        });
        minRa = newMinRa;
        maxRa = newMaxRa;
    }
    
    const centerRa = (minRa + maxRa) / 2;
    const centerDec = (minDec + maxDec) / 2;
    const fov = Math.max(maxRa - minRa, maxDec - minDec) * 1.5;
    
    aladin.animateToRaDec(
        centerRa < 0 ? centerRa + 360 : centerRa, 
        centerDec, 
        Math.min(fov, 180)
    );
}

// Open photo viewer
function openPhotoViewer(photo) {
    if (!photo) return;
    
    const viewer = document.getElementById('photo-viewer');
    
    // Add class to body for background effect
    document.body.classList.add('photo-viewer-active');
    
    // Set display to flex first
    viewer.style.display = 'flex';
    
    // Update content
    document.getElementById('viewer-image').src = photo.imageUrl;
    document.getElementById('viewer-title').textContent = photo.name;
    document.getElementById('viewer-description').textContent = 
        `One of my captures of ${photo.name}${photo.type ? ` - ${photo.type}` : ''}`;
    
    let details = '';
    if (CONFIG.SHOW_COORDINATES) {
        details += `<strong>Coordinates:</strong> RA ${photo.ra.toFixed(4)}°, Dec ${photo.dec.toFixed(4)}°<br>`;
    }
    details += `<strong>Object ID:</strong> ${photo.id}<br>`;
    details += `<strong>Filename:</strong> ${photo.filename}`;
    
    document.getElementById('viewer-details').innerHTML = details;
    
    // Trigger animation after a brief delay
    setTimeout(() => {
        viewer.classList.add('active');
    }, 50);
}

// Close photo viewer
function closePhotoViewer() {
    const viewer = document.getElementById('photo-viewer');
    viewer.classList.remove('active');
    document.body.classList.remove('photo-viewer-active');
    
    // Wait for animation to complete before fully hiding
    setTimeout(() => {
        viewer.style.display = 'none';
    }, 600);
}

// Change survey
function changeSurvey() {
    const survey = document.getElementById('survey-select').value;
    aladin.setImageSurvey(survey);
}

// Setup event listeners
function setupEventListeners() {
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closePhotoViewer();
        } else if (e.key === 'r' || e.key === 'R') {
            if (!e.ctrlKey && !e.metaKey) { // Avoid browser refresh
                goToRandomPhoto();
            }
        }
    });
    
    // Enter key for search
    document.getElementById('object-search').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchObject();
        }
    });
}

// Update loading state
function updateLoadingState(loading) {
    isLoading = loading;
    const loadingElement = document.getElementById('loading-message');
    if (loadingElement) {
        loadingElement.style.display = loading ? 'block' : 'none';
    }
}

// Show error message
function showError(message) {
    console.error(message);
    // You could implement a toast notification here
}

// Show message
function showMessage(message) {
    alert(message); // Simple implementation, could be improved
}

// Cache management
function getCachedData() {
    if (!CONFIG.USE_GITHUB_API) return null;
    
    const cached = localStorage.getItem('cosmosPhotos');
    if (!cached) return null;
    
    try {
        const data = JSON.parse(cached);
        if (Date.now() - data.timestamp < CONFIG.CACHE_DURATION) {
            return data.photos;
        }
    } catch (e) {
        console.error('Cache error:', e);
    }
    
    return null;
}

function setCachedData(photos) {
    if (!CONFIG.USE_GITHUB_API) return;
    
    try {
        localStorage.setItem('cosmosPhotos', JSON.stringify({
            photos: photos,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.error('Cache error:', e);
    }
}

// Adjust brand position to avoid Aladin controls
function adjustBrandPosition() {
    const brand = document.getElementById('brand-overlay');
    const aladinControls = document.querySelector('.aladin-layersControl');
    
    if (aladinControls && brand) {
        const controlsRect = aladinControls.getBoundingClientRect();
        const brandRect = brand.getBoundingClientRect();
        
        // If there's overlap, move brand down
        if (brandRect.right > controlsRect.left && brandRect.top < controlsRect.bottom) {
            brand.style.top = (controlsRect.bottom + 20) + 'px';
        }
    }
}

// Make functions globally available
window.searchObject = searchObject;
window.goToRandomPhoto = goToRandomPhoto;
window.showAllPhotos = showAllPhotos;
window.closePhotoViewer = closePhotoViewer;
window.changeSurvey = changeSurvey;