# Cosmos Person Photography - Interactive Universe Gallery

An innovative astrophotography portfolio that displays your deep sky images on an interactive star map. Visitors can explore the entire universe and discover your photos as glowing beacons at their actual celestial locations.

![Cosmos Person Photography](preview.jpg)

## 🌟 Features

- **Interactive Star Map**: Built on Aladin Sky Atlas with millions of stars and deep sky objects
- **Automatic Photo Placement**: Simply upload images named after celestial objects
- **Smart Object Recognition**: Supports various naming formats (M42, NGC2157, IC5070, etc.)
- **Multiple Sky Surveys**: Switch between optical, infrared, and other wavelengths
- **Random Discovery**: Let visitors randomly explore your captures
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **GitHub Integration**: Automatically loads photos from your repository

## 🚀 Quick Start

### 1. Fork or Clone This Repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
```

### 2. Configure Your Settings

Edit `config.js` with your information:

```javascript
const CONFIG = {
    GITHUB_USERNAME: 'your-username',
    GITHUB_REPO: 'your-repo-name',
    SITE_TITLE: 'Your Photography Brand',
    // ... other settings
};
```

### 3. Add Your Photos

1. Create an `images` folder in your repository
2. Upload your astrophotos with celestial object names:
   - `M42.jpg` - Orion Nebula
   - `NGC2157.png` - Your nebula capture
   - `IC5070.jpg` - Pelican Nebula
   - `Andromeda.jpg` - M31 Galaxy

### 4. Enable GitHub Pages

1. Go to Settings → Pages in your repository
2. Set Source to "Deploy from a branch"
3. Choose "main" branch and "/ (root)" folder
4. Save and wait a few minutes

Your site will be live at: `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME`

## 📸 Supported Object Names

The system recognizes thousands of celestial objects automatically:

### Messier Catalog (M1-M110)
- `M1.jpg`, `M42.jpg`, `M31.jpg`, etc.

### NGC Catalog (New General Catalogue)
- `NGC253.jpg`, `NGC2157.jpg`, `NGC7293.jpg`, etc.

### IC Catalog (Index Catalogue)
- `IC434.jpg`, `IC5070.jpg`, `IC1318.jpg`, etc.

### Common Names
- `Orion.jpg`, `Andromeda.jpg`, `Horsehead.jpg`
- `Eagle.jpg`, `Crab.jpg`, `Ring.jpg`
- `Whirlpool.jpg`, `Pleiades.jpg`, `Rosette.jpg`

### Flexible Naming
The system handles various formats:
- With/without spaces: `NGC 2157.jpg` or `NGC2157.jpg`
- With underscores: `NGC_2157.jpg`
- With dashes: `NGC-2157.jpg`
- Case insensitive: `ngc2157.jpg` or `NGC2157.JPG`

## 🎨 Customization

### Changing Colors

Edit `styles.css` to customize the color scheme:

```css
/* Change the accent color */
.brand-logo {
    background: linear-gradient(45deg, #your-color1, #your-color2);
}
```

### Adding New Objects

To add celestial objects not in the database, edit `celestial-database.js`:

```javascript
const CelestialDatabase = {
    // ... existing objects ...
    'NGC9999': { 
        ra: 123.456,  // Right Ascension in degrees
        dec: 45.678,  // Declination in degrees
        name: 'My Custom Nebula',
        type: 'emission nebula'
    }
};
```

### Modifying the Layout

The site uses a modular structure:
- `index.html` - Main HTML structure
- `styles.css` - All styling
- `config.js` - Configuration settings
- `app.js` - Main application logic
- `celestial-database.js` - Object coordinate database

## 📁 Project Structure

```
cosmos-person-photography/
├── index.html              # Main page
├── styles.css              # Styling
├── config.js               # Configuration
├── app.js                  # Application logic
├── celestial-database.js   # Object coordinates
├── package.json            # Project metadata
├── manifest.json           # PWA manifest
├── README.md              # Documentation
├── LICENSE                # License file
├── .gitignore             # Git ignore file
└── images/                # Your astrophotos
    ├── M42.jpg
    ├── NGC2157.jpg
    └── IC5070.jpg
```

## 🔧 Technical Details

### Technologies Used
- **Aladin Sky Atlas**: Professional astronomy visualization
- **JavaScript/jQuery**: Application logic
- **GitHub Pages**: Free hosting
- **GitHub API**: Automatic photo loading

### Browser Support
- Chrome (recommended)
- Firefox
- Safari
- Edge
- Mobile browsers (iOS/Android)

### Performance
- Lazy loading of images
- Cached GitHub API responses
- Optimized star rendering
- Smooth animations

## 🐛 Troubleshooting

### Photos not showing up?
1. Check filename matches a known object
2. Ensure images are in the `images` folder
3. Wait a few minutes for GitHub to update
4. Check browser console for errors

### Object not recognized?
- Check `celestial-database.js` for the object
- Try alternative names (M31 vs Andromeda)
- Add custom coordinates if needed

### Site not loading?
1. Verify GitHub Pages is enabled
2. Check `config.js` settings
3. Clear browser cache
4. Check console for errors

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Aladin Sky Atlas](https://aladin.u-strasbg.fr/) by CDS, Strasbourg Observatory
- Celestial coordinate data from various astronomical catalogs
- Inspiration from the astrophotography community

## 📧 Contact

- Website: [cosmosperson.com](https://cosmosperson.com)
- Instagram: [@cosmosperson](https://instagram.com/cosmosperson)
- Email: hello@cosmosperson.com

---

Made with ❤️ and 🌟 by Cosmos Person Photography