import AppKit

let width = 660
let height = 400

let image = NSImage(size: NSSize(width: width, height: height))
image.lockFocus()

// Background fill (sleek dark aesthetic matching RapidReady)
let bgColor = NSColor(red: 0.11, green: 0.12, blue: 0.14, alpha: 1.0)
bgColor.setFill()
NSRect(x: 0, y: 0, width: width, height: height).fill()

// Subtle border / inner stroke
let innerBorder = NSBezierPath(roundedRect: NSRect(x: 1, y: 1, width: width - 2, height: height - 2), xRadius: 8, yRadius: 8)
NSColor(white: 1.0, alpha: 0.08).setStroke()
innerBorder.lineWidth = 1.5
innerBorder.stroke()

// Draw sleek arrow between icons
// Icon 1 center is approx x=180, Icon 2 center is approx x=480
// In macOS Quartz coordinates: (0,0) is bottom-left!
// Tauri appPosition y=190 (from top), so in bottom-left coordinates: y = 400 - 190 = 210.
let arrowY: CGFloat = 210.0
let startX: CGFloat = 280.0
let endX: CGFloat = 380.0

let arrowPath = NSBezierPath()
// Arrow line
arrowPath.move(to: NSPoint(x: startX, y: arrowY))
arrowPath.line(to: NSPoint(x: endX, y: arrowY))

// Arrow head
arrowPath.line(to: NSPoint(x: endX - 16, y: arrowY + 12))
arrowPath.move(to: NSPoint(x: endX, y: arrowY))
arrowPath.line(to: NSPoint(x: endX - 16, y: arrowY - 12))

arrowPath.lineWidth = 4.0
arrowPath.lineCapStyle = .round
arrowPath.lineJoinStyle = .round

let arrowColor = NSColor(red: 0.40, green: 0.60, blue: 0.95, alpha: 0.75) // subtle accent tint
arrowColor.setStroke()
arrowPath.stroke()

image.unlockFocus()

guard let tiffData = image.tiffRepresentation,
      let bitmapRep = NSBitmapImageRep(data: tiffData),
      let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
    fatalError("Failed to generate PNG")
}

let outputPath = URL(fileURLWithPath: "src-tauri/dmg-background.png")
try pngData.write(to: outputPath)
print("DMG background successfully generated at: \(outputPath.path)")
