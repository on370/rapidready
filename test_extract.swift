import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
if args.count < 3 { exit(1) }
let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])

let options: [String: Any] = [
    kCGImageSourceCreateThumbnailFromImageIfAbsent as String: true,
    kCGImageSourceCreateThumbnailWithTransform as String: true,
    kCGImageSourceThumbnailMaxPixelSize as String: 4096
]

guard let source = CGImageSourceCreateWithURL(input as CFURL, nil),
      let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
    print("Failed to read image")
    exit(1)
}

guard let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
    print("Failed to create destination")
    exit(1)
}

let destOptions: [String: Any] = [
    kCGImageDestinationLossyCompressionQuality as String: 0.85
]

CGImageDestinationAddImage(destination, cgImage, destOptions as CFDictionary)
if !CGImageDestinationFinalize(destination) {
    print("Failed to finalize")
    exit(1)
}
print("Success")
