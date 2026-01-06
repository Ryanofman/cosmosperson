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

    let galleryManifestImages = [];
    let additionalImages = [];

    try {
        // First, load from gallery.json manifest (priority images)
        const manifestResponse = await fetch('gallery.json');
        if (manifestResponse.ok) {
            const manifest = await manifestResponse.json();
            if (manifest.gallery && manifest.gallery.length > 0) {
                galleryManifestImages = manifest.gallery.map(img => ({
                    id: img.filename.split('/').pop().split('.')[0],
                    name: img.name,
                    type: img.type,
                    imageUrl: `gallery/${img.filename}`,
                    filename: img.filename.split('/').pop()
                }));
            }
        }
    } catch (e) {
        console.log('No gallery.json manifest found');
    }

    // Track filenames from gallery manifest to avoid duplicates
    const galleryFilenames = new Set(galleryManifestImages.map(img => img.filename.toLowerCase()));

    try {
        // Then, load additional images from /images folder
        const imagesResponse = await fetch('images.json');
        if (imagesResponse.ok) {
            const imagesManifest = await imagesResponse.json();
            if (imagesManifest.images && imagesManifest.images.length > 0) {
                additionalImages = imagesManifest.images
                    .filter(img => !galleryFilenames.has(img.filename.toLowerCase()))
                    .map(img => ({
                        id: img.filename.split('.')[0],
                        name: img.name || formatFileName(img.filename),
                        type: img.type || 'Deep Sky Object',
                        imageUrl: `images/${img.filename}`,
                        filename: img.filename
                    }));
            }
        }
    } catch (e) {
        console.log('No images.json manifest found, trying directory listing...');
    }

    // Combine: gallery first, then additional images
    const allImages = [...galleryManifestImages, ...additionalImages];

    if (allImages.length > 0) {
        displayGalleryImages(allImages);
    } else {
        showEmptyGallery(gallery);
    }

    if (loadingEl) loadingEl.style.display = 'none';
}

// Load images from local gallery directory (fallback)
function loadLocalImages() {
    const gallery = document.getElementById('gallery-grid');
    const loadingEl = document.getElementById('gallery-loading');

    // Fallback: try to load gallery.json synchronously or show empty state
    fetch('gallery.json')
        .then(response => response.json())
        .then(manifest => {
            if (manifest.gallery && manifest.gallery.length > 0) {
                const processedImages = manifest.gallery.map(img => ({
                    id: img.filename.split('.')[0],
                    name: img.name,
                    type: img.type,
                    imageUrl: `gallery/${img.filename}`,
                    filename: img.filename
                }));
                displayGalleryImages(processedImages);
            } else {
                showEmptyGallery(gallery);
            }
            if (loadingEl) loadingEl.style.display = 'none';
        })
        .catch(() => {
            showEmptyGallery(gallery);
            if (loadingEl) loadingEl.style.display = 'none';
        });
}

function showEmptyGallery(gallery) {
    gallery.innerHTML = `
        <div style="text-align: center; padding: 60px; color: var(--star-dim); width: 100%;">
            <p style="font-size: 1.2em; margin-bottom: 10px;">Gallery is empty</p>
            <p style="opacity: 0.7;">Add images to gallery.json to display them here</p>
        </div>
    `;
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

// Carousel navigation setup - DISABLED for Grid Layout
function setupCarousel() {
    const prevBtn = document.querySelector('.carousel-nav.prev');
    const nextBtn = document.querySelector('.carousel-nav.next');

    // Hide buttons if they exist
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';

    // No scroll listeners or gravity needed for grid
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
