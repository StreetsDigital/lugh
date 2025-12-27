# App Icons

This directory contains application icons for AgentCommander Desktop.

## Required Icon Files

For production builds, you need to generate these icons from `icon.svg`:

- **macOS**: `icon.icns` (512x512, 256x256, 128x128, 64x64, 32x32, 16x16)
- **Windows**: `icon.ico` (256x256, 128x128, 64x64, 48x48, 32x32, 16x16)
- **Linux**: `icon.png` (512x512)

## Generating Icons

### Using ImageMagick (Recommended)

```bash
# Install ImageMagick
brew install imagemagick

# Generate PNG from SVG
convert -background none -size 512x512 icon.svg icon.png

# Generate ICO for Windows
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

### For macOS .icns

```bash
# Create iconset directory
mkdir icon.iconset

# Generate required sizes
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png

# Generate .icns
iconutil -c icns icon.iconset

# Cleanup
rm -rf icon.iconset
```

## Quick Development Setup

For development, you can use a simple PNG file. The icon formats are only needed for production builds:

```bash
# Generate a quick PNG for development
convert -background none -size 512x512 icon.svg icon.png
```

## Online Tools

If you don't have command-line tools installed:

1. **CloudConvert**: https://cloudconvert.com/svg-to-png
2. **Favicon.io**: https://favicon.io/favicon-converter/
3. **IconGenerator**: https://www.icongenerator.net/
