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

        // Fetch from GitHub API - use GALLERY_PATH for gallery page
        const galleryPath = CONFIG.GALLERY_PATH || 'gallery';
        const apiUrl = `${CONFIG.GITHUB_API_BASE}/repos/${CONFIG.GITHUB_USERNAME}/${CONFIG.GITHUB_REPO}/contents/${galleryPath}`;
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

// Load images from local gallery directory (fallback)
function loadLocalImages() {
    // This will scan the gallery folder - add your gallery images here
    // For now, show a message if gallery is empty
    const gallery = document.getElementById('gallery-grid');
    const loadingEl = document.getElementById('gallery-loading');

    // Try to fetch gallery folder contents via a simple check
    // Since we can't scan directories in browser, we need a manifest or predefined list
    // You can add images to this list as you add them to the gallery folder
    const galleryImages = [
        // Add your gallery images here as they're added to the gallery folder
        // Example: { filename: 'image1.jpg', name: 'My Photo', type: 'Deep Sky Object' }
    ];

    if (galleryImages.length === 0) {
        // Show empty state
        if (loadingEl) loadingEl.style.display = 'none';
        gallery.innerHTML = `
            <div style="text-align: center; padding: 60px; color: var(--star-dim); width: 100%;">
                <p style="font-size: 1.2em; margin-bottom: 10px;">Gallery is empty</p>
                <p style="opacity: 0.7;">Add images to the /gallery folder to display them here</p>
            </div>
        `;
        return;
    }

    const processedImages = galleryImages.map(img => ({
        id: img.filename.split('.')[0],
        name: img.name,
        type: img.type,
        imageUrl: `gallery/${img.filename}`,
        filename: img.filename
    }));

    displayGalleryImages(processedImages);
    if (loadingEl) loadingEl.style.display = 'none';
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

// Carousel navigation setup with gravitational effects
function setupCarousel() {
    const gallery = document.getElementById('gallery-grid');
    const prevBtn = document.querySelector('.carousel-nav.prev');
    const nextBtn = document.querySelector('.carousel-nav.next');

    if (!gallery || !prevBtn || !nextBtn) return;

    // Calculate scroll amount (width of one card + gap)
    function getScrollAmount() {
        const card = gallery.querySelector('.gallery-card');
        if (!card) return 620;
        const cardWidth = card.offsetWidth;
        const gap = 60; // matches CSS gap
        return cardWidth + gap;
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

    // Update button visibility and apply gravity effects
    function updateGravityEffects() {
        const cards = gallery.querySelectorAll('.gallery-card');
        const containerCenter = gallery.scrollLeft + (gallery.clientWidth / 2);

        cards.forEach((card, index) => {
            const cardCenter = card.offsetLeft + (card.offsetWidth / 2);
            const distance = cardCenter - containerCenter;
            const threshold = card.offsetWidth * 0.6;

            // Remove all gravity classes first
            card.classList.remove('gravity-left', 'gravity-right', 'gravity-center');

            if (Math.abs(distance) < threshold) {
                // Card is centered - in the gravitational pull
                card.classList.add('gravity-center');
            } else if (distance < -threshold) {
                // Card is to the left - being pulled right
                card.classList.add('gravity-left');
            } else if (distance > threshold) {
                // Card is to the right - being pulled left
                card.classList.add('gravity-right');
            }
        });

        // Update nav button visibility
        const isAtStart = gallery.scrollLeft <= 10;
        const isAtEnd = gallery.scrollLeft >= gallery.scrollWidth - gallery.clientWidth - 10;

        prevBtn.style.opacity = isAtStart ? '0.3' : '1';
        prevBtn.style.pointerEvents = isAtStart ? 'none' : 'auto';

        nextBtn.style.opacity = isAtEnd ? '0.3' : '1';
        nextBtn.style.pointerEvents = isAtEnd ? 'none' : 'auto';
    }

    // Throttled scroll handler for smooth performance
    let scrollTimeout;
    gallery.addEventListener('scroll', () => {
        if (scrollTimeout) return;
        scrollTimeout = setTimeout(() => {
            updateGravityEffects();
            scrollTimeout = null;
        }, 16); // ~60fps
    });

    // Initial gravity effect after images load
    setTimeout(updateGravityEffects, 600);

    // Re-apply on window resize
    window.addEventListener('resize', updateGravityEffects);
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
