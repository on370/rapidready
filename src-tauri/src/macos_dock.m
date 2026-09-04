#import <Cocoa/Cocoa.h>

void set_macos_dock_icon(const unsigned char *bytes, unsigned long length) {
    if (!bytes || length == 0) return;
    @autoreleasepool {
        NSData *data = [NSData dataWithBytes:bytes length:length];
        NSImage *image = [[NSImage alloc] initWithData:data];
        if (image) {
            [NSApp setApplicationIconImage:image];
        }
    }
}
