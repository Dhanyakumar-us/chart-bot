const fs = require('fs');
const path = require('path');

// We'll create a simple SVG-based icon as PNG using Canvas
// Run: node generate-icons.js

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const outputDir = path.join(__dirname, 'public');

// Create a simple SVG icon for each size
const createSvgIcon = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a0533;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0f0f0f;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#a855f7;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="cyan" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#a855f7;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:1" />
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#bg)"/>
  <!-- Glow effect -->
  <circle cx="${size/2}" cy="${size/2}" r="${size*0.35}" fill="#6366f1" opacity="0.15"/>
  <!-- Bar chart bars -->
  <rect x="${size*0.15}" y="${size*0.55}" width="${size*0.12}" height="${size*0.28}" rx="${size*0.02}" fill="url(#accent)" opacity="0.9"/>
  <rect x="${size*0.31}" y="${size*0.38}" width="${size*0.12}" height="${size*0.45}" rx="${size*0.02}" fill="url(#accent)" opacity="0.95"/>
  <rect x="${size*0.47}" y="${size*0.28}" width="${size*0.12}" height="${size*0.55}" rx="${size*0.02}" fill="url(#cyan)" opacity="1"/>
  <rect x="${size*0.63}" y="${size*0.45}" width="${size*0.12}" height="${size*0.38}" rx="${size*0.02}" fill="url(#accent)" opacity="0.9"/>
  <rect x="${size*0.79}" y="${size*0.22}" width="${size*0.06}" height="${size*0.61}" rx="${size*0.02}" fill="url(#cyan)" opacity="0.8"/>
  <!-- AI dot top -->
  <circle cx="${size*0.5}" cy="${size*0.18}" r="${size*0.07}" fill="url(#cyan)" opacity="0.9"/>
  <!-- Sparkle lines -->
  <line x1="${size*0.15}" y1="${size*0.83}" x2="${size*0.85}" y2="${size*0.83}" stroke="#6366f1" stroke-width="${size*0.015}" opacity="0.5"/>
</svg>`;

// Write SVG icons for each size
sizes.forEach(size => {
  const svgContent = createSvgIcon(size);
  const svgPath = path.join(outputDir, `icon-${size}x${size}.svg`);
  fs.writeFileSync(svgPath, svgContent);
  console.log(`Created: icon-${size}x${size}.svg`);
});

console.log('\nSVG icons created in public/ folder!');
console.log('Note: These are SVG files. For best PWA support, convert them to PNG.');
console.log('You can use: https://cloudconvert.com/svg-to-png or install sharp and run the PNG conversion.');
