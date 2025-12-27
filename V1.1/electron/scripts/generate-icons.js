#!/usr/bin/env node
/**
 * Icon Generator for AgentCommander Desktop
 * Generates icons for macOS, Windows, and Linux from SVG source.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const SVG_PATH = path.join(ASSETS_DIR, 'icon.svg');
const ICONSET_DIR = path.join(ASSETS_DIR, 'icon.iconset');

// macOS icon sizes (for Retina support)
const MAC_SIZES = [
  { size: 16, name: 'icon_16x16.png' },
  { size: 32, name: 'icon_16x16@2x.png' },
  { size: 32, name: 'icon_32x32.png' },
  { size: 64, name: 'icon_32x32@2x.png' },
  { size: 128, name: 'icon_128x128.png' },
  { size: 256, name: 'icon_128x128@2x.png' },
  { size: 256, name: 'icon_256x256.png' },
  { size: 512, name: 'icon_256x256@2x.png' },
  { size: 512, name: 'icon_512x512.png' },
  { size: 1024, name: 'icon_512x512@2x.png' },
];

// Windows ICO sizes
const ICO_SIZES = [256, 128, 64, 48, 32, 16];

async function main() {
  console.log('🎨 AgentCommander Icon Generator\n');

  // Check if sharp is available
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.error('❌ Sharp not installed. Run: npm install --save-dev sharp');
    process.exit(1);
  }

  // Read SVG
  if (!fs.existsSync(SVG_PATH)) {
    console.error(`❌ SVG not found at: ${SVG_PATH}`);
    process.exit(1);
  }

  const svgBuffer = fs.readFileSync(SVG_PATH);
  console.log('✓ Loaded SVG source\n');

  // 1. Generate main PNG for Linux (512x512)
  console.log('📦 Generating Linux icon (icon.png)...');
  const linuxPath = path.join(ASSETS_DIR, 'icon.png');
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(linuxPath);
  console.log(`  ✓ Created ${linuxPath}\n`);

  // 2. Generate macOS iconset
  console.log('🍎 Generating macOS iconset...');
  if (!fs.existsSync(ICONSET_DIR)) {
    fs.mkdirSync(ICONSET_DIR, { recursive: true });
  }

  for (const { size, name } of MAC_SIZES) {
    const outPath = path.join(ICONSET_DIR, name);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`  ✓ ${name} (${size}x${size})`);
  }

  // Convert iconset to .icns using macOS iconutil
  console.log('  → Converting to .icns...');
  try {
    execSync(`iconutil -c icns "${ICONSET_DIR}" -o "${path.join(ASSETS_DIR, 'icon.icns')}"`, {
      stdio: 'inherit',
    });
    console.log(`  ✓ Created icon.icns\n`);

    // Clean up iconset directory
    fs.rmSync(ICONSET_DIR, { recursive: true, force: true });
    console.log('  ✓ Cleaned up iconset directory\n');
  } catch (e) {
    console.error('  ⚠ iconutil not available (not on macOS?) - iconset left for manual conversion\n');
  }

  // 3. Generate Windows ICO
  console.log('🪟 Generating Windows icon (icon.ico)...');

  // Generate individual PNGs for ICO
  const icoPngs = [];
  for (const size of ICO_SIZES) {
    const pngPath = path.join(ASSETS_DIR, `icon-${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(pngPath);
    icoPngs.push(pngPath);
    console.log(`  ✓ icon-${size}.png`);
  }

  // Try to use png-to-ico
  try {
    const pngToIco = require('png-to-ico');
    const icoBuffer = await pngToIco(icoPngs);
    fs.writeFileSync(path.join(ASSETS_DIR, 'icon.ico'), icoBuffer);
    console.log('  ✓ Created icon.ico\n');

    // Clean up temporary PNGs
    for (const pngPath of icoPngs) {
      fs.unlinkSync(pngPath);
    }
    console.log('  ✓ Cleaned up temporary PNGs\n');
  } catch (e) {
    console.error('  ⚠ png-to-ico not available - temporary PNGs left for manual conversion');
    console.error('    Install with: npm install --save-dev png-to-ico\n');
  }

  console.log('✅ Icon generation complete!\n');
  console.log('Generated files:');
  console.log('  - assets/icon.png   (Linux)');
  console.log('  - assets/icon.icns  (macOS)');
  console.log('  - assets/icon.ico   (Windows)');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
