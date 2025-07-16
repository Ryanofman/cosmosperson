// Configuration file for Cosmos Person Photography
// Edit these values to match your GitHub setup

const CONFIG = {
    // GitHub Settings
    GITHUB_USERNAME: 'YOUR_GITHUB_USERNAME',  // Replace with your GitHub username
    GITHUB_REPO: 'YOUR_REPO_NAME',           // Replace with your repository name
    IMAGES_PATH: 'images',                   // Path to your images folder in the repo
    
    // Site Settings
    SITE_TITLE: 'Cosmos Person Photography',
    SITE_TAGLINE: 'Photography',
    
    // Map Settings
    DEFAULT_FOV: 60,                         // Default field of view in degrees
    DEFAULT_TARGET: 'M42',                   // Default object to show on load
    MARKER_SIZE: 25,                         // Size of photo markers
    
    // Image Settings
    SUPPORTED_FORMATS: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    
    // API Settings
    USE_GITHUB_API: true,                    // Set to false to use local images
    GITHUB_API_BASE: 'https://api.github.com',
    
    // Development Mode
    DEV_MODE: false,                         // Set to true for local development
    
    // Cache Settings
    CACHE_DURATION: 3600000,                 // 1 hour in milliseconds
    
    // Animation Settings
    ANIMATION_DURATION: 1500,                // Duration for pan animations in ms
    
    // Photo Viewer Settings
    SHOW_EXIF_DATA: true,                    // Show camera settings if available
    SHOW_CAPTURE_DATE: true,                 // Show when photo was taken
    SHOW_COORDINATES: true,                  // Show celestial coordinates
    
    // Social Media (optional)
    INSTAGRAM: '@cosmosperson',              // Your Instagram handle
    WEBSITE: 'https://cosmosperson.com',     // Your website
    EMAIL: 'hello@cosmosperson.com'          // Contact email
};

// Don't edit below this line
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}