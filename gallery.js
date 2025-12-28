// Gallery page JavaScript for Cosmos Person Photography
// Handles image loading, carousel, and lightbox functionality

let galleryImages = [];
let currentImageIndex = 0;

// Initialize gallery when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    loadGalleryImages();
    setupLightbox();
    setupNavigation();
    setupCarousel();
});

// Load images from GitHub or local directory
async function loadGalleryImages() {
    const gallery = document.getElementById('gallery-grid');
    const loadingEl = document.getElementById('gallery-loading');

    // Show loading state
    if (loadingEl) loadingEl.style.display = 'flex';

    // Check if we're using GitHub API
    if (CONFIG.DEV_MODE || CONFIG.GITHUB_USERNAME === 'YOUR_GITHUB_USERNAME') {
        loadLocalImages();
        return;
    }

    try {
        // Check cache first
        const cachedData = getCachedGalleryData();
        if (cachedData) {
            displayGalleryImages(cachedData);
            if (loadingEl) loadingEl.style.display = 'none';
            return;
        }

        // Fetch from GitHub API
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

        // Process each image
        const processedImages = imageFiles.map(file => {
            const celestialObject = findCelestialObject(file.name);
            return {
                id: normalizeObjectName(file.name),
                name: celestialObject ? celestialObject.name : formatFileName(file.name),
                type: celestialObject ? celestialObject.type : 'Deep Sky Object',
                imageUrl: file.download_url,
                filename: file.name,
                size: file.size
            };
        });

        // Sort by name
        processedImages.sort((a, b) => a.name.localeCompare(b.name));

        // Cache the data
        setCachedGalleryData(processedImages);

        // Display images
        displayGalleryImages(processedImages);

    } catch (error) {
        console.error('Error loading gallery from GitHub:', error);
        loadLocalImages();
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// Load images from local directory (fallback)
function loadLocalImages() {
    // Predefined list of local images
    const localImages = [
        { filename: 'IC1805.jpg', name: 'Heart Nebula', type: 'Emission Nebula' },
        { filename: 'IC405.jpg', name: 'Flaming Star Nebula', type: 'Emission Nebula' },
        { filename: 'IC410.JPG', name: 'Tadpole Nebula', type: 'Emission Nebula' },
        { filename: 'IC5070.JPG', name: 'Pelican Nebula', type: 'Emission Nebula' },
        { filename: 'M1.jpg', name: 'Crab Nebula', type: 'Supernova Remnant' },
        { filename: 'M101.jpg', name: 'Pinwheel Galaxy', type: 'Spiral Galaxy' },
        { filename: 'M13.jpg', name: 'Hercules Cluster', type: 'Globular Cluster' },
        { filename: 'M42.jpeg', name: 'Orion Nebula', type: 'Emission Nebula' },
        { filename: 'M42_2.jpg', name: 'Orion Nebula II', type: 'Emission Nebula' },
        { filename: 'M78.jpg', name: 'M78 Nebula', type: 'Reflection Nebula' },
        { filename: 'NGC1499.jpg', name: 'California Nebula', type: 'Emission Nebula' },
        { filename: 'NGC1975.jpg', name: 'Running Man Nebula', type: 'Reflection Nebula' },
        { filename: 'NGC2024.jpg', name: 'Flame Nebula', type: 'Emission Nebula' },
        { filename: 'NGC2175.jpeg', name: 'Monkey Head Nebula', type: 'Emission Nebula' },
        { filename: 'NGC2237.jpg', name: 'Rosette Nebula', type: 'Emission Nebula' },
        { filename: 'NGC281.JPG', name: 'Pacman Nebula', type: 'Emission Nebula' },
        { filename: 'NGC4565.JPG', name: 'Needle Galaxy', type: 'Spiral Galaxy' },
        { filename: 'NGC6888.jpg', name: 'Crescent Nebula', type: 'Emission Nebula' },
        { filename: 'NGC6888_2.jpg', name: 'Crescent Nebula II', type: 'Emission Nebula' },
        { filename: 'NGC6995.jpg', name: 'Veil Nebula', type: 'Supernova Remnant' }
    ];

    const processedImages = localImages.map(img => ({
        id: img.filename.split('.')[0],
        name: img.name,
        type: img.type,
        imageUrl: `images/${img.filename}`,
        filename: img.filename
    }));

    displayGalleryImages(processedImages);
    document.getElementById('gallery-loading').style.display = 'none';
}

// Display images in the gallery grid
function displayGalleryImages(images) {
    galleryImages = images;
    const gallery = document.getElementById('gallery-grid');

    // Update image count
    const countEl = document.getElementById('image-count');
    if (countEl) countEl.textContent = images.length;

    gallery.innerHTML = '';

    images.forEach((image, index) => {
        const card = document.createElement('div');
        card.className = 'gallery-card';
        card.setAttribute('data-index', index);

        card.innerHTML = `
            <div class="gallery-card-image">
                <img src="${image.imageUrl}" alt="${image.name}" loading="lazy">
                <div class="gallery-card-overlay">
                    <span class="view-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/>
                            <path d="M21 21l-4.35-4.35"/>
                            <path d="M11 8v6M8 11h6"/>
                        </svg>
                    </span>
                </div>
            </div>
            <div class="gallery-card-info">
                <h3>${image.name}</h3>
                <span class="gallery-card-type">${image.type}</span>
            </div>
        `;

        card.addEventListener('click', () => openLightbox(index));
        gallery.appendChild(card);

        // Staggered animation
        setTimeout(() => {
            card.classList.add('visible');
        }, index * 50);
    });
}

// Format filename to readable name
function formatFileName(filename) {
    return filename
        .replace(/\.[^/.]+$/, '')  // Remove extension
        .replace(/[_-]/g, ' ')     // Replace underscores/dashes with spaces
        .replace(/(\d+)/g, ' $1 ') // Add space around numbers
        .trim()
        .toUpperCase();
}

// Lightbox functionality
function setupLightbox() {
    const lightbox = document.getElementById('lightbox');
    const closeBtn = document.querySelector('.lightbox-close');
    const prevBtn = document.querySelector('.lightbox-prev');
    const nextBtn = document.querySelector('.lightbox-next');

    closeBtn.addEventListener('click', closeLightbox);
    prevBtn.addEventListener('click', () => navigateLightbox(-1));
    nextBtn.addEventListener('click', () => navigateLightbox(1));

    // Close on backdrop click
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox || e.target.classList.contains('lightbox-backdrop')) {
            closeLightbox();
        }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;

        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') navigateLightbox(-1);
        if (e.key === 'ArrowRight') navigateLightbox(1);
    });
}

function openLightbox(index) {
    currentImageIndex = index;
    const image = galleryImages[index];
    const lightbox = document.getElementById('lightbox');

    document.getElementById('lightbox-image').src = image.imageUrl;
    document.getElementById('lightbox-title').textContent = image.name;
    document.getElementById('lightbox-type').textContent = image.type;
    document.getElementById('lightbox-counter').textContent = `${index + 1} / ${galleryImages.length}`;

    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
}

function navigateLightbox(direction) {
    currentImageIndex = (currentImageIndex + direction + galleryImages.length) % galleryImages.length;
    const image = galleryImages[currentImageIndex];

    const imgEl = document.getElementById('lightbox-image');
    imgEl.style.opacity = '0';

    setTimeout(() => {
        imgEl.src = image.imageUrl;
        document.getElementById('lightbox-title').textContent = image.name;
        document.getElementById('lightbox-type').textContent = image.type;
        document.getElementById('lightbox-counter').textContent = `${currentImageIndex + 1} / ${galleryImages.length}`;
        imgEl.style.opacity = '1';
    }, 200);
}

// Navigation setup
function setupNavigation() {
    const header = document.querySelector('.gallery-header');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
}

// Carousel navigation setup
function setupCarousel() {
    const gallery = document.getElementById('gallery-grid');
    const prevBtn = document.querySelector('.carousel-nav.prev');
    const nextBtn = document.querySelector('.carousel-nav.next');

    if (!gallery || !prevBtn || !nextBtn) return;

    // Calculate scroll amount (width of one card + gap)
    function getScrollAmount() {
        const card = gallery.querySelector('.gallery-card');
        if (!card) return 300;
        const cardWidth = card.offsetWidth;
        const gap = 20; // matches CSS gap
        // Scroll by 3 cards at a time for professional feel
        return (cardWidth + gap) * 3;
    }

    prevBtn.addEventListener('click', () => {
        gallery.scrollBy({
            left: -getScrollAmount(),
            behavior: 'smooth'
        });
    });

    nextBtn.addEventListener('click', () => {
        gallery.scrollBy({
            left: getScrollAmount(),
            behavior: 'smooth'
        });
    });

    // Update button visibility based on scroll position
    function updateNavButtons() {
        const isAtStart = gallery.scrollLeft <= 0;
        const isAtEnd = gallery.scrollLeft >= gallery.scrollWidth - gallery.clientWidth - 10;

        prevBtn.style.opacity = isAtStart ? '0.3' : '1';
        prevBtn.style.pointerEvents = isAtStart ? 'none' : 'auto';

        nextBtn.style.opacity = isAtEnd ? '0.3' : '1';
        nextBtn.style.pointerEvents = isAtEnd ? 'none' : 'auto';
    }

    gallery.addEventListener('scroll', updateNavButtons);

    // Initial check after images load
    setTimeout(updateNavButtons, 500);
}

// Cache management
function getCachedGalleryData() {
    const cached = localStorage.getItem('cosmosGallery');
    if (!cached) return null;

    try {
        const data = JSON.parse(cached);
        if (Date.now() - data.timestamp < CONFIG.CACHE_DURATION) {
            return data.images;
        }
    } catch (e) {
        console.error('Cache error:', e);
    }

    return null;
}

function setCachedGalleryData(images) {
    try {
        localStorage.setItem('cosmosGallery', JSON.stringify({
            images: images,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.error('Cache error:', e);
    }
}

// Helper function to find celestial object (from celestial-database.js)
function findCelestialObject(filename) {
    if (typeof window.findCelestialObject === 'function') {
        return window.findCelestialObject(filename);
    }
    return null;
}

function normalizeObjectName(filename) {
    if (typeof window.normalizeObjectName === 'function') {
        return window.normalizeObjectName(filename);
    }
    return filename.replace(/\.[^/.]+$/, '').toUpperCase();
}
