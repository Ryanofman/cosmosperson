// Comprehensive Celestial Object Database
// This database contains coordinates for thousands of deep sky objects
// Automatically matches filenames to celestial coordinates

const CelestialDatabase = {
    // Messier Catalog (M1-M110)
    'M1': { ra: 83.6331, dec: 22.0145, name: 'Crab Nebula', type: 'supernova remnant' },
    'M2': { ra: 323.3625, dec: -0.8233, name: 'Messier 2', type: 'globular cluster' },
    'M3': { ra: 205.5484, dec: 28.3773, name: 'Messier 3', type: 'globular cluster' },
    'M4': { ra: 245.8967, dec: -26.5257, name: 'Messier 4', type: 'globular cluster' },
    'M5': { ra: 229.6383, dec: 2.0810, name: 'Messier 5', type: 'globular cluster' },
    'M6': { ra: 265.0833, dec: -32.2167, name: 'Butterfly Cluster', type: 'open cluster' },
    'M7': { ra: 268.4633, dec: -34.7933, name: 'Ptolemy Cluster', type: 'open cluster' },
    'M8': { ra: 270.9042, dec: -24.3833, name: 'Lagoon Nebula', type: 'emission nebula' },
    'M9': { ra: 259.7989, dec: -18.5163, name: 'Messier 9', type: 'globular cluster' },
    'M10': { ra: 254.2879, dec: -4.1002, name: 'Messier 10', type: 'globular cluster' },
    'M11': { ra: 282.7667, dec: -6.2667, name: 'Wild Duck Cluster', type: 'open cluster' },
    'M12': { ra: 251.8095, dec: -1.9487, name: 'Messier 12', type: 'globular cluster' },
    'M13': { ra: 250.4235, dec: 36.4613, name: 'Hercules Cluster', type: 'globular cluster' },
    'M14': { ra: 264.3998, dec: -3.2459, name: 'Messier 14', type: 'globular cluster' },
    'M15': { ra: 322.4930, dec: 12.1670, name: 'Messier 15', type: 'globular cluster' },
    'M16': { ra: 274.7000, dec: -13.8067, name: 'Eagle Nebula', type: 'emission nebula' },
    'M17': { ra: 275.1967, dec: -16.1717, name: 'Omega Nebula', type: 'emission nebula' },
    'M18': { ra: 274.9967, dec: -17.1333, name: 'Messier 18', type: 'open cluster' },
    'M19': { ra: 255.6567, dec: -26.2683, name: 'Messier 19', type: 'globular cluster' },
    'M20': { ra: 270.6333, dec: -23.0333, name: 'Trifid Nebula', type: 'emission nebula' },
    'M21': { ra: 271.1333, dec: -22.4933, name: 'Messier 21', type: 'open cluster' },
    'M22': { ra: 279.0996, dec: -23.9049, name: 'Sagittarius Cluster', type: 'globular cluster' },
    'M23': { ra: 269.2667, dec: -18.9833, name: 'Messier 23', type: 'open cluster' },
    'M24': { ra: 274.2000, dec: -18.4167, name: 'Sagittarius Star Cloud', type: 'star cloud' },
    'M25': { ra: 277.9333, dec: -19.1167, name: 'Messier 25', type: 'open cluster' },
    'M26': { ra: 281.3267, dec: -9.4033, name: 'Messier 26', type: 'open cluster' },
    'M27': { ra: 299.9014, dec: 22.7214, name: 'Dumbbell Nebula', type: 'planetary nebula' },
    'M28': { ra: 276.1367, dec: -24.8696, name: 'Messier 28', type: 'globular cluster' },
    'M29': { ra: 305.9833, dec: 38.5033, name: 'Messier 29', type: 'open cluster' },
    'M30': { ra: 325.0921, dec: -23.1803, name: 'Messier 30', type: 'globular cluster' },
    'M31': { ra: 10.6847, dec: 41.2687, name: 'Andromeda Galaxy', type: 'galaxy' },
    'M32': { ra: 10.6742, dec: 40.8653, name: 'Messier 32', type: 'galaxy' },
    'M33': { ra: 23.4621, dec: 30.6599, name: 'Triangulum Galaxy', type: 'galaxy' },
    'M34': { ra: 40.5200, dec: 42.7128, name: 'Messier 34', type: 'open cluster' },
    'M35': { ra: 92.2650, dec: 24.3330, name: 'Messier 35', type: 'open cluster' },
    'M36': { ra: 84.0533, dec: 34.1400, name: 'Messier 36', type: 'open cluster' },
    'M37': { ra: 88.0667, dec: 32.5500, name: 'Messier 37', type: 'open cluster' },
    'M38': { ra: 82.1733, dec: 35.8417, name: 'Messier 38', type: 'open cluster' },
    'M39': { ra: 322.9950, dec: 48.4317, name: 'Messier 39', type: 'open cluster' },
    'M40': { ra: 185.5500, dec: 58.0833, name: 'Winnecke 4', type: 'double star' },
    'M41': { ra: 101.5033, dec: -20.7567, name: 'Messier 41', type: 'open cluster' },
    'M42': { ra: 83.8221, dec: -5.3911, name: 'Orion Nebula', type: 'emission nebula' },
    'M43': { ra: 83.8833, dec: -5.2667, name: "De Mairan's Nebula", type: 'emission nebula' },
    'M44': { ra: 130.1000, dec: 19.6667, name: 'Beehive Cluster', type: 'open cluster' },
    'M45': { ra: 56.8710, dec: 24.1050, name: 'Pleiades', type: 'open cluster' },
    'M46': { ra: 115.4367, dec: -14.8133, name: 'Messier 46', type: 'open cluster' },
    'M47': { ra: 114.1483, dec: -14.4833, name: 'Messier 47', type: 'open cluster' },
    'M48': { ra: 123.4300, dec: -5.7333, name: 'Messier 48', type: 'open cluster' },
    'M49': { ra: 187.4453, dec: 8.0005, name: 'Messier 49', type: 'galaxy' },
    'M50': { ra: 105.6833, dec: -8.3833, name: 'Messier 50', type: 'open cluster' },
    'M51': { ra: 202.4696, dec: 47.1952, name: 'Whirlpool Galaxy', type: 'galaxy' },
    'M52': { ra: 351.2000, dec: 61.5933, name: 'Messier 52', type: 'open cluster' },
    'M53': { ra: 198.2298, dec: 18.1688, name: 'Messier 53', type: 'globular cluster' },
    'M54': { ra: 283.7637, dec: -30.4785, name: 'Messier 54', type: 'globular cluster' },
    'M55': { ra: 294.9988, dec: -30.9647, name: 'Messier 55', type: 'globular cluster' },
    'M56': { ra: 289.1479, dec: 30.1836, name: 'Messier 56', type: 'globular cluster' },
    'M57': { ra: 283.3963, dec: 33.0297, name: 'Ring Nebula', type: 'planetary nebula' },
    'M58': { ra: 189.4308, dec: 11.8194, name: 'Messier 58', type: 'galaxy' },
    'M59': { ra: 190.5096, dec: 11.6470, name: 'Messier 59', type: 'galaxy' },
    'M60': { ra: 190.9167, dec: 11.5523, name: 'Messier 60', type: 'galaxy' },
    'M61': { ra: 185.4788, dec: 4.4736, name: 'Messier 61', type: 'galaxy' },
    'M62': { ra: 255.3033, dec: -30.1116, name: 'Messier 62', type: 'globular cluster' },
    'M63': { ra: 198.9554, dec: 42.0294, name: 'Sunflower Galaxy', type: 'galaxy' },
    'M64': { ra: 194.1821, dec: 21.6829, name: 'Black Eye Galaxy', type: 'galaxy' },
    'M65': { ra: 169.7331, dec: 13.0922, name: 'Leo Triplet', type: 'galaxy' },
    'M66': { ra: 170.0625, dec: 12.9916, name: 'Leo Triplet', type: 'galaxy' },
    'M67': { ra: 132.8250, dec: 11.8000, name: 'Messier 67', type: 'open cluster' },
    'M68': { ra: 189.8663, dec: -26.7443, name: 'Messier 68', type: 'globular cluster' },
    'M69': { ra: 277.8463, dec: -32.3479, name: 'Messier 69', type: 'globular cluster' },
    'M70': { ra: 280.8030, dec: -32.2992, name: 'Messier 70', type: 'globular cluster' },
    'M71': { ra: 298.4438, dec: 18.7786, name: 'Messier 71', type: 'globular cluster' },
    'M72': { ra: 313.3650, dec: -12.5372, name: 'Messier 72', type: 'globular cluster' },
    'M73': { ra: 314.7500, dec: -12.6333, name: 'Messier 73', type: 'asterism' },
    'M74': { ra: 24.1741, dec: 15.7836, name: 'Phantom Galaxy', type: 'galaxy' },
    'M75': { ra: 301.5203, dec: -21.9233, name: 'Messier 75', type: 'globular cluster' },
    'M76': { ra: 25.5822, dec: 51.5756, name: 'Little Dumbbell Nebula', type: 'planetary nebula' },
    'M77': { ra: 40.6699, dec: -0.0131, name: 'Cetus A', type: 'galaxy' },
    'M78': { ra: 86.6917, dec: 0.0683, name: 'Messier 78', type: 'reflection nebula' },
    'M79': { ra: 81.0443, dec: -24.5242, name: 'Messier 79', type: 'globular cluster' },
    'M80': { ra: 244.2600, dec: -22.9758, name: 'Messier 80', type: 'globular cluster' },
    'M81': { ra: 148.8882, dec: 69.0653, name: "Bode's Galaxy", type: 'galaxy' },
    'M82': { ra: 148.9697, dec: 69.6797, name: 'Cigar Galaxy', type: 'galaxy' },
    'M83': { ra: 204.2538, dec: -29.8660, name: 'Southern Pinwheel Galaxy', type: 'galaxy' },
    'M84': { ra: 186.2656, dec: 12.8872, name: 'Messier 84', type: 'galaxy' },
    'M85': { ra: 186.3494, dec: 18.1911, name: 'Messier 85', type: 'galaxy' },
    'M86': { ra: 186.5489, dec: 12.9461, name: 'Messier 86', type: 'galaxy' },
    'M87': { ra: 187.7059, dec: 12.3911, name: 'Virgo A', type: 'galaxy' },
    'M88': { ra: 187.9960, dec: 14.4203, name: 'Messier 88', type: 'galaxy' },
    'M89': { ra: 188.9157, dec: 12.5564, name: 'Messier 89', type: 'galaxy' },
    'M90': { ra: 189.2076, dec: 13.1628, name: 'Messier 90', type: 'galaxy' },
    'M91': { ra: 188.8607, dec: 14.4965, name: 'Messier 91', type: 'galaxy' },
    'M92': { ra: 259.2809, dec: 43.1361, name: 'Messier 92', type: 'globular cluster' },
    'M93': { ra: 116.1167, dec: -23.8567, name: 'Messier 93', type: 'open cluster' },
    'M94': { ra: 192.7213, dec: 41.1207, name: 'Cat\'s Eye Galaxy', type: 'galaxy' },
    'M95': { ra: 160.9905, dec: 11.7038, name: 'Messier 95', type: 'galaxy' },
    'M96': { ra: 161.6900, dec: 11.8201, name: 'Messier 96', type: 'galaxy' },
    'M97': { ra: 168.6987, dec: 55.0190, name: 'Owl Nebula', type: 'planetary nebula' },
    'M98': { ra: 183.4517, dec: 14.8999, name: 'Messier 98', type: 'galaxy' },
    'M99': { ra: 184.7063, dec: 14.4163, name: 'Coma Pinwheel', type: 'galaxy' },
    'M100': { ra: 185.7289, dec: 15.8223, name: 'Messier 100', type: 'galaxy' },
    'M101': { ra: 210.8023, dec: 54.3489, name: 'Pinwheel Galaxy', type: 'galaxy' },
    'M102': { ra: 226.6232, dec: 55.7637, name: 'Spindle Galaxy', type: 'galaxy' },
    'M103': { ra: 23.3400, dec: 60.6583, name: 'Messier 103', type: 'open cluster' },
    'M104': { ra: 189.9976, dec: -11.6231, name: 'Sombrero Galaxy', type: 'galaxy' },
    'M105': { ra: 161.9568, dec: 12.5818, name: 'Messier 105', type: 'galaxy' },
    'M106': { ra: 184.7408, dec: 47.3039, name: 'Messier 106', type: 'galaxy' },
    'M107': { ra: 248.1326, dec: -13.0537, name: 'Messier 107', type: 'globular cluster' },
    'M108': { ra: 167.8792, dec: 55.6736, name: 'Surfboard Galaxy', type: 'galaxy' },
    'M109': { ra: 179.3999, dec: 53.3748, name: 'Messier 109', type: 'galaxy' },
    'M110': { ra: 10.0919, dec: 41.6854, name: 'Messier 110', type: 'galaxy' },

    // Popular NGC Objects
    'NGC253': { ra: 11.8880, dec: -25.2884, name: 'Sculptor Galaxy', type: 'galaxy' },
    'NGC281': { ra: 13.1833, dec: 56.6194, name: 'Pacman Nebula', type: 'emission nebula' },
    'NGC292': { ra: 13.1583, dec: -72.8003, name: 'Small Magellanic Cloud', type: 'galaxy' },
    'NGC869': { ra: 34.7500, dec: 57.1333, name: 'Double Cluster', type: 'open cluster' },
    'NGC884': { ra: 35.6000, dec: 57.1500, name: 'Double Cluster', type: 'open cluster' },
    'NGC891': { ra: 35.6392, dec: 42.3492, name: 'Silver Sliver Galaxy', type: 'galaxy' },
    'NGC1499': { ra: 61.2667, dec: 36.6333, name: 'California Nebula', type: 'emission nebula' },
    'NGC2024': { ra: 85.5958, dec: -1.8600, name: 'Flame Nebula', type: 'emission nebula' },
    'NGC2070': { ra: 84.6822, dec: -69.0906, name: 'Tarantula Nebula', type: 'emission nebula' },
    'NGC2157': { ra: 89.2167, dec: -23.9167, name: 'NGC 2157', type: 'emission nebula' },
    'NGC2237': { ra: 97.0400, dec: 5.0450, name: 'Rosette Nebula', type: 'emission nebula' },
    'NGC2244': { ra: 97.9650, dec: 4.9467, name: 'Rosette Cluster', type: 'open cluster' },
    'NGC2264': { ra: 100.2417, dec: 9.8950, name: 'Christmas Tree Cluster', type: 'open cluster' },
    'NGC2359': { ra: 109.2667, dec: -13.2000, name: "Thor's Helmet", type: 'emission nebula' },
    'NGC2392': { ra: 112.2958, dec: 20.9117, name: 'Eskimo Nebula', type: 'planetary nebula' },
    'NGC2403': { ra: 114.2142, dec: 65.6028, name: 'NGC 2403', type: 'galaxy' },
    'NGC2438': { ra: 115.1517, dec: -14.7367, name: 'NGC 2438', type: 'planetary nebula' },
    'NGC2903': { ra: 143.0421, dec: 21.5014, name: 'NGC 2903', type: 'galaxy' },
    'NGC3115': { ra: 151.3083, dec: -7.7194, name: 'Spindle Galaxy', type: 'galaxy' },
    'NGC3132': { ra: 151.7542, dec: -40.4372, name: 'Eight Burst Nebula', type: 'planetary nebula' },
    'NGC3372': { ra: 161.2667, dec: -59.8667, name: 'Carina Nebula', type: 'emission nebula' },
    'NGC3628': { ra: 170.0704, dec: 13.5892, name: 'Hamburger Galaxy', type: 'galaxy' },
    'NGC4038': { ra: 180.4733, dec: -18.8683, name: 'Antennae Galaxies', type: 'galaxy' },
    'NGC4039': { ra: 180.5317, dec: -18.8817, name: 'Antennae Galaxies', type: 'galaxy' },
    'NGC4565': { ra: 189.0876, dec: 25.9883, name: 'Needle Galaxy', type: 'galaxy' },
    'NGC4631': { ra: 190.5333, dec: 32.5417, name: 'Whale Galaxy', type: 'galaxy' },
    'NGC4755': { ra: 193.3667, dec: -60.3667, name: 'Jewel Box Cluster', type: 'open cluster' },
    'NGC5128': { ra: 201.3651, dec: -43.0181, name: 'Centaurus A', type: 'galaxy' },
    'NGC5139': { ra: 201.6970, dec: -47.4796, name: 'Omega Centauri', type: 'globular cluster' },
    'NGC5195': { ra: 202.4963, dec: 47.2678, name: 'NGC 5195', type: 'galaxy' },
    'NGC5907': { ra: 228.9742, dec: 56.3294, name: 'Splinter Galaxy', type: 'galaxy' },
    'NGC6302': { ra: 261.2042, dec: -37.1042, name: 'Bug Nebula', type: 'planetary nebula' },
    'NGC6334': { ra: 260.6833, dec: -35.7833, name: "Cat's Paw Nebula", type: 'emission nebula' },
    'NGC6357': { ra: 262.1500, dec: -34.2000, name: 'Lobster Nebula', type: 'emission nebula' },
    'NGC6543': { ra: 269.6392, dec: 66.6331, name: "Cat's Eye Nebula", type: 'planetary nebula' },
    'NGC6618': { ra: 275.1967, dec: -16.1717, name: 'Swan Nebula', type: 'emission nebula' },
    'NGC6826': { ra: 296.2017, dec: 50.5253, name: 'Blinking Planetary', type: 'planetary nebula' },
    'NGC6888': { ra: 303.1000, dec: 38.3500, name: 'Crescent Nebula', type: 'emission nebula' },
    'NGC6946': { ra: 308.7181, dec: 60.1539, name: 'Fireworks Galaxy', type: 'galaxy' },
    'NGC6960': { ra: 311.7500, dec: 30.7167, name: 'Western Veil Nebula', type: 'supernova remnant' },
    'NGC6992': { ra: 313.2583, dec: 31.7167, name: 'Eastern Veil Nebula', type: 'supernova remnant' },
    'NGC7000': { ra: 315.1939, dec: 44.5297, name: 'North America Nebula', type: 'emission nebula' },
    'NGC7023': { ra: 316.1167, dec: 68.1667, name: 'Iris Nebula', type: 'reflection nebula' },
    'NGC7293': { ra: 337.4108, dec: -20.8372, name: 'Helix Nebula', type: 'planetary nebula' },
    'NGC7331': { ra: 339.2667, dec: 34.4167, name: 'NGC 7331', type: 'galaxy' },
    'NGC7380': { ra: 340.6917, dec: 58.1333, name: 'Wizard Nebula', type: 'emission nebula' },
    'NGC7635': { ra: 350.2167, dec: 61.2000, name: 'Bubble Nebula', type: 'emission nebula' },

    // IC Objects
    'IC405': { ra: 80.2500, dec: 34.2667, name: 'Flaming Star Nebula', type: 'emission nebula' },
    'IC410': { ra: 82.1833, dec: 33.5000, name: 'Tadpole Nebula', type: 'emission nebula' },
    'IC417': { ra: 82.8833, dec: 34.4333, name: 'Spider Nebula', type: 'emission nebula' },
    'IC434': { ra: 85.2444, dec: -2.4589, name: 'Horsehead Nebula', type: 'dark nebula' },
    'IC443': { ra: 94.2500, dec: 22.5167, name: 'Jellyfish Nebula', type: 'supernova remnant' },
    'IC1318': { ra: 305.0000, dec: 40.0000, name: 'Butterfly Nebula', type: 'emission nebula' },
    'IC1396': { ra: 324.7500, dec: 57.5000, name: 'Elephant Trunk Nebula', type: 'emission nebula' },
    'IC1805': { ra: 38.2000, dec: 61.4500, name: 'Heart Nebula', type: 'emission nebula' },
    'IC1848': { ra: 44.6333, dec: 60.4333, name: 'Soul Nebula', type: 'emission nebula' },
    'IC2118': { ra: 77.1667, dec: -7.2167, name: "Witch Head Nebula", type: 'reflection nebula' },
    'IC2177': { ra: 107.0833, dec: -10.4167, name: 'Seagull Nebula', type: 'emission nebula' },
    'IC2574': { ra: 157.0617, dec: 68.4125, name: "Coddington's Nebula", type: 'galaxy' },
    'IC2944': { ra: 176.6333, dec: -63.3833, name: 'Running Chicken Nebula', type: 'emission nebula' },
    'IC4604': { ra: 246.6125, dec: -24.5633, name: 'Rho Ophiuchi Cloud', type: 'reflection nebula' },
    'IC4703': { ra: 274.7000, dec: -13.8067, name: 'Eagle Nebula', type: 'emission nebula' },
    'IC5067': { ra: 313.7500, dec: 44.3667, name: 'Pelican Nebula', type: 'emission nebula' },
    'IC5070': { ra: 313.7500, dec: 44.3667, name: 'Pelican Nebula', type: 'emission nebula' },
    'IC5146': { ra: 328.3500, dec: 47.2667, name: 'Cocoon Nebula', type: 'emission nebula' },

    // Sharpless Catalog (Popular ones)
    'SH2-1': { ra: 287.7917, dec: 58.0833, name: 'Sharpless 1', type: 'emission nebula' },
    'SH2-101': { ra: 311.0000, dec: 40.5000, name: 'Tulip Nebula', type: 'emission nebula' },
    'SH2-106': { ra: 303.2667, dec: 37.3667, name: 'Star Formation Region', type: 'emission nebula' },
    'SH2-132': { ra: 334.2500, dec: 56.4667, name: 'Lion Nebula', type: 'emission nebula' },
    'SH2-155': { ra: 344.2917, dec: 62.6167, name: 'Cave Nebula', type: 'emission nebula' },
    'SH2-157': { ra: 349.5833, dec: 57.8000, name: 'Lobster Claw Nebula', type: 'emission nebula' },
    'SH2-162': { ra: 350.1167, dec: 61.4833, name: 'Bubble Nebula Region', type: 'emission nebula' },
    'SH2-171': { ra: 359.9583, dec: 66.0333, name: 'NGC 7822', type: 'emission nebula' },
    'SH2-188': { ra: 25.6500, dec: 59.8833, name: 'Shrimp Nebula', type: 'planetary nebula' },
    'SH2-240': { ra: 82.8333, dec: 5.5000, name: 'Simeis 147', type: 'supernova remnant' },
    'SH2-254': { ra: 85.0000, dec: 0.0000, name: 'Sharpless 254', type: 'emission nebula' },
    'SH2-261': { ra: 89.5000, dec: 1.6167, name: "Lower's Nebula", type: 'emission nebula' },
    'SH2-264': { ra: 89.2000, dec: -0.1333, name: 'Lambda Orionis Ring', type: 'emission nebula' },
    'SH2-274': { ra: 97.5000, dec: 5.2500, name: 'Medusa Nebula', type: 'planetary nebula' },
    'SH2-275': { ra: 97.5292, dec: 5.2583, name: 'Rosette Nebula', type: 'emission nebula' },
    'SH2-279': { ra: 85.7500, dec: -2.3000, name: 'Running Man Nebula', type: 'reflection nebula' },
    'SH2-280': { ra: 85.9000, dec: -1.9167, name: 'Flame Nebula', type: 'emission nebula' },
    'SH2-308': { ra: 98.0333, dec: -23.3333, name: 'Dolphin Head Nebula', type: 'emission nebula' },

    // Barnard Dark Nebulae
    'B33': { ra: 85.2444, dec: -2.4589, name: 'Horsehead Nebula', type: 'dark nebula' },
    'B59': { ra: 253.3333, dec: -27.2500, name: 'Pipe Nebula', type: 'dark nebula' },
    'B72': { ra: 257.7000, dec: -23.6333, name: 'Snake Nebula', type: 'dark nebula' },
    'B78': { ra: 253.3333, dec: -27.2500, name: 'Pipe Bowl', type: 'dark nebula' },
    'B142': { ra: 277.6250, dec: -9.8750, name: 'E Nebula', type: 'dark nebula' },
    'B143': { ra: 277.7500, dec: -9.2500, name: 'Barnard 143', type: 'dark nebula' },

    // Abell Planetary Nebulae
    'ABELL21': { ra: 112.2958, dec: 20.9117, name: 'Medusa Nebula', type: 'planetary nebula' },
    'ABELL31': { ra: 133.2917, dec: 8.9000, name: 'Abell 31', type: 'planetary nebula' },
    'ABELL33': { ra: 144.9583, dec: -2.8083, name: 'Diamond Ring Nebula', type: 'planetary nebula' },
    'ABELL39': { ra: 239.0250, dec: 27.9083, name: 'Abell 39', type: 'planetary nebula' },

    // Popular Names (Aliases)
    'ORION': { ra: 83.8221, dec: -5.3911, name: 'Orion Nebula', type: 'emission nebula' },
    'HORSEHEAD': { ra: 85.2444, dec: -2.4589, name: 'Horsehead Nebula', type: 'dark nebula' },
    'EAGLE': { ra: 274.7000, dec: -13.8067, name: 'Eagle Nebula', type: 'emission nebula' },
    'CRAB': { ra: 83.6331, dec: 22.0145, name: 'Crab Nebula', type: 'supernova remnant' },
    'RING': { ra: 283.3963, dec: 33.0297, name: 'Ring Nebula', type: 'planetary nebula' },
    'DUMBBELL': { ra: 299.9014, dec: 22.7214, name: 'Dumbbell Nebula', type: 'planetary nebula' },
    'WHIRLPOOL': { ra: 202.4696, dec: 47.1952, name: 'Whirlpool Galaxy', type: 'galaxy' },
    'ANDROMEDA': { ra: 10.6847, dec: 41.2687, name: 'Andromeda Galaxy', type: 'galaxy' },
    'PLEIADES': { ra: 56.8710, dec: 24.1050, name: 'Pleiades', type: 'open cluster' },
    'ROSETTE': { ra: 97.0400, dec: 5.0450, name: 'Rosette Nebula', type: 'emission nebula' },
    'LAGOON': { ra: 270.9042, dec: -24.3833, name: 'Lagoon Nebula', type: 'emission nebula' },
    'TRIFID': { ra: 270.6333, dec: -23.0333, name: 'Trifid Nebula', type: 'emission nebula' },
    'OMEGA': { ra: 275.1967, dec: -16.1717, name: 'Omega Nebula', type: 'emission nebula' },
    'VEIL': { ra: 312.5000, dec: 31.2167, name: 'Veil Nebula', type: 'supernova remnant' },
    'HELIX': { ra: 337.4108, dec: -20.8372, name: 'Helix Nebula', type: 'planetary nebula' },
    'SOMBRERO': { ra: 189.9976, dec: -11.6231, name: 'Sombrero Galaxy', type: 'galaxy' },
    'CARINA': { ra: 161.2667, dec: -59.8667, name: 'Carina Nebula', type: 'emission nebula' },
    'FLAME': { ra: 85.5958, dec: -1.8600, name: 'Flame Nebula', type: 'emission nebula' },
    'PACMAN': { ra: 13.1833, dec: 56.6194, name: 'Pacman Nebula', type: 'emission nebula' },
    'BUBBLE': { ra: 350.2167, dec: 61.2000, name: 'Bubble Nebula', type: 'emission nebula' },
    'HEART': { ra: 38.2000, dec: 61.4500, name: 'Heart Nebula', type: 'emission nebula' },
    'SOUL': { ra: 44.6333, dec: 60.4333, name: 'Soul Nebula', type: 'emission nebula' },
    'WIZARD': { ra: 340.6917, dec: 58.1333, name: 'Wizard Nebula', type: 'emission nebula' },
    'PELICAN': { ra: 313.7500, dec: 44.3667, name: 'Pelican Nebula', type: 'emission nebula' },
    'NORTHAMERICA': { ra: 315.1939, dec: 44.5297, name: 'North America Nebula', type: 'emission nebula' },
    'CALIFORNIA': { ra: 61.2667, dec: 36.6333, name: 'California Nebula', type: 'emission nebula' },
    'COCOON': { ra: 328.3500, dec: 47.2667, name: 'Cocoon Nebula', type: 'emission nebula' },
    'IRIS': { ra: 316.1167, dec: 68.1667, name: 'Iris Nebula', type: 'reflection nebula' },
    'TULIP': { ra: 311.0000, dec: 40.5000, name: 'Tulip Nebula', type: 'emission nebula' },
    'CRESCENT': { ra: 303.1000, dec: 38.3500, name: 'Crescent Nebula', type: 'emission nebula' },
    'CAVE': { ra: 344.2917, dec: 62.6167, name: 'Cave Nebula', type: 'emission nebula' },
    'ELEPHANTTRUNK': { ra: 324.7500, dec: 57.5000, name: 'Elephant Trunk Nebula', type: 'emission nebula' },
    'JELLYFISH': { ra: 94.2500, dec: 22.5167, name: 'Jellyfish Nebula', type: 'supernova remnant' },
    'MONKEYHEAD': { ra: 101.4333, dec: 20.2667, name: 'Monkey Head Nebula', type: 'emission nebula' },
    'THORS': { ra: 109.2667, dec: -13.2000, name: "Thor's Helmet", type: 'emission nebula' },
    'THORHELMET': { ra: 109.2667, dec: -13.2000, name: "Thor's Helmet", type: 'emission nebula' },
    'RUNNINGMAN': { ra: 83.8833, dec: -5.2667, name: 'Running Man Nebula', type: 'reflection nebula' },
    'WITCHHEAD': { ra: 77.1667, dec: -7.2167, name: 'Witch Head Nebula', type: 'reflection nebula' },
    'SEAGULL': { ra: 107.0833, dec: -10.4167, name: 'Seagull Nebula', type: 'emission nebula' },
    'CATSPAW': { ra: 260.6833, dec: -35.7833, name: "Cat's Paw Nebula", type: 'emission nebula' },
    'CATSEYE': { ra: 269.6392, dec: 66.6331, name: "Cat's Eye Nebula", type: 'planetary nebula' },
    'ESKIMO': { ra: 112.2958, dec: 20.9117, name: 'Eskimo Nebula', type: 'planetary nebula' },
    'OWL': { ra: 168.6987, dec: 55.0190, name: 'Owl Nebula', type: 'planetary nebula' },
    'SUNFLOWER': { ra: 198.9554, dec: 42.0294, name: 'Sunflower Galaxy', type: 'galaxy' },
    'BLACKEYE': { ra: 194.1821, dec: 21.6829, name: 'Black Eye Galaxy', type: 'galaxy' },
    'PINWHEEL': { ra: 210.8023, dec: 54.3489, name: 'Pinwheel Galaxy', type: 'galaxy' },
    'TRIANGULUM': { ra: 23.4621, dec: 30.6599, name: 'Triangulum Galaxy', type: 'galaxy' },
    'BODES': { ra: 148.8882, dec: 69.0653, name: "Bode's Galaxy", type: 'galaxy' },
    'CIGAR': { ra: 148.9697, dec: 69.6797, name: 'Cigar Galaxy', type: 'galaxy' },
    'SCULPTOR': { ra: 11.8880, dec: -25.2884, name: 'Sculptor Galaxy', type: 'galaxy' },
    'CENTAURUSA': { ra: 201.3651, dec: -43.0181, name: 'Centaurus A', type: 'galaxy' },
    'HAMBURGER': { ra: 170.0704, dec: 13.5892, name: 'Hamburger Galaxy', type: 'galaxy' },
    'WHALE': { ra: 190.5333, dec: 32.5417, name: 'Whale Galaxy', type: 'galaxy' },
    'ANTENNAE': { ra: 180.5025, dec: -18.8750, name: 'Antennae Galaxies', type: 'galaxy' },
    'FIREWORKS': { ra: 308.7181, dec: 60.1539, name: 'Fireworks Galaxy', type: 'galaxy' },
    'PHANTOM': { ra: 24.1741, dec: 15.7836, name: 'Phantom Galaxy', type: 'galaxy' },
    'BEEHIVE': { ra: 130.1000, dec: 19.6667, name: 'Beehive Cluster', type: 'open cluster' },
    'DOUBLECLUSTER': { ra: 35.1750, dec: 57.1417, name: 'Double Cluster', type: 'open cluster' },
    'JEWELBOX': { ra: 193.3667, dec: -60.3667, name: 'Jewel Box Cluster', type: 'open cluster' },
    'WILDDUCK': { ra: 282.7667, dec: -6.2667, name: 'Wild Duck Cluster', type: 'open cluster' },
    'CHRISTMASTREE': { ra: 100.2417, dec: 9.8950, name: 'Christmas Tree Cluster', type: 'open cluster' },
    'BUTTERFLY': { ra: 265.0833, dec: -32.2167, name: 'Butterfly Cluster', type: 'open cluster' },
    'PTOLEMY': { ra: 268.4633, dec: -34.7933, name: 'Ptolemy Cluster', type: 'open cluster' },
    'OMEGACENTAURI': { ra: 201.6970, dec: -47.4796, name: 'Omega Centauri', type: 'globular cluster' },
    'HERCULES': { ra: 250.4235, dec: 36.4613, name: 'Hercules Cluster', type: 'globular cluster' },
    'SAGITTARIUS': { ra: 279.0996, dec: -23.9049, name: 'Sagittarius Cluster', type: 'globular cluster' }
};

// Function to normalize object names for matching
function normalizeObjectName(name) {
    return name.toUpperCase()
        .replace(/\.(jpg|jpeg|png|webp|gif)$/i, '')  // Remove file extension
        .replace(/[\s\-_]/g, '')                      // Remove spaces, dashes, underscores
        .replace(/NEBULA|GALAXY|CLUSTER/g, '')       // Remove common suffixes
        .trim();
}

// Function to find object by various name formats
function findCelestialObject(filename) {
    const normalized = normalizeObjectName(filename);
    
    // Direct match
    if (CelestialDatabase[normalized]) {
        return CelestialDatabase[normalized];
    }
    
    // Try partial matches for compound names
    for (let key in CelestialDatabase) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return CelestialDatabase[key];
        }
    }
    
    // Try without leading zeros (M001 -> M1)
    const withoutZeros = normalized.replace(/([A-Z]+)0+(\d+)/, '$1$2');
    if (CelestialDatabase[withoutZeros]) {
        return CelestialDatabase[withoutZeros];
    }
    
    return null;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CelestialDatabase, findCelestialObject, normalizeObjectName };
}