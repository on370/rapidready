use std::path::Path;

#[cfg(target_os = "macos")]
pub(crate) mod imageio {
    use std::ffi::c_void;
    use std::path::Path;

    #[link(name = "ImageIO", kind = "framework")]
    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        pub fn CFURLCreateFromFileSystemRepresentation(
            allocator: *const c_void,
            buffer: *const u8,
            buf_len: isize,
            is_directory: bool,
        ) -> *mut c_void;
        pub fn CGImageSourceCreateWithURL(url: *const c_void, options: *const c_void) -> *mut c_void;
        pub fn CGImageSourceCreateThumbnailAtIndex(isrc: *const c_void, index: usize, options: *const c_void) -> *mut c_void;
        pub fn CGImageDestinationCreateWithData(data: *mut c_void, uti: *const c_void, count: usize, options: *const c_void) -> *mut c_void;
        pub fn CGImageDestinationAddImage(dest: *mut c_void, image: *const c_void, properties: *const c_void);
        pub fn CGImageDestinationFinalize(dest: *mut c_void) -> bool;
        pub fn CGImageRelease(image: *const c_void);
        pub fn CFRelease(cf: *const c_void);
        #[allow(dead_code)]
        pub fn CGImageSourceCreateWithData(data: *const c_void, options: *const c_void) -> *mut c_void;
        #[allow(dead_code)]
        pub fn CFDataCreate(allocator: *const c_void, bytes: *const u8, length: isize) -> *mut c_void;
        pub fn CFDataCreateMutable(allocator: *const c_void, capacity: isize) -> *mut c_void;
        pub fn CFDataGetLength(data: *const c_void) -> isize;
        pub fn CFDataGetBytePtr(data: *const c_void) -> *const u8;
        pub fn CFDictionaryCreate(
            allocator: *const c_void,
            keys: *const *const c_void,
            values: *const *const c_void,
            num_values: isize,
            key_callbacks: *const c_void,
            val_callbacks: *const c_void,
        ) -> *mut c_void;
        pub fn CFNumberCreate(allocator: *const c_void, the_type: isize, value_ptr: *const c_void) -> *mut c_void;
        pub fn CFStringCreateWithCString(allocator: *const c_void, c_str: *const std::ffi::c_char, encoding: u32) -> *mut c_void;

        pub static kCFTypeDictionaryKeyCallBacks: c_void;
        pub static kCFTypeDictionaryValueCallBacks: c_void;
        pub static kCFBooleanTrue: *const c_void;
        pub static kCFBooleanFalse: *const c_void;

        #[allow(dead_code)]
        pub static kCGImageSourceCreateThumbnailFromImageAlways: *const c_void;
        #[allow(dead_code)]
        pub static kCGImageSourceCreateThumbnailFromImageIfAbsent: *const c_void;
        pub static kCGImageSourceCreateThumbnailWithTransform: *const c_void;
        pub static kCGImageSourceThumbnailMaxPixelSize: *const c_void;
        pub static kCGImageSourceShouldCache: *const c_void;
    }

    #[allow(dead_code)]
    pub fn extract_thumbnail_from_data(data: &[u8], max_pixel_size: u32) -> Option<Vec<u8>> {
        unsafe {
            let cf_data = CFDataCreate(std::ptr::null(), data.as_ptr(), data.len() as isize);
            if cf_data.is_null() {
                return None;
            }

            let keys = [kCGImageSourceShouldCache];
            let values = [kCFBooleanFalse];
            let src_options = CFDictionaryCreate(
                std::ptr::null(),
                keys.as_ptr(),
                values.as_ptr(),
                1,
                &kCFTypeDictionaryKeyCallBacks,
                &kCFTypeDictionaryValueCallBacks,
            );

            let isrc = CGImageSourceCreateWithData(cf_data, src_options);
            if !src_options.is_null() {
                CFRelease(src_options);
            }
            CFRelease(cf_data);

            if isrc.is_null() {
                return None;
            }

            let size_val: i32 = max_pixel_size as i32;
            let cf_size = CFNumberCreate(std::ptr::null(), 3 /* kCFNumberSInt32Type */, &size_val as *const i32 as *const c_void);

            let thumb_keys = [
                kCGImageSourceCreateThumbnailFromImageAlways,
                kCGImageSourceCreateThumbnailWithTransform,
                kCGImageSourceThumbnailMaxPixelSize,
                kCGImageSourceShouldCache,
            ];
            let thumb_values = [
                kCFBooleanTrue,
                kCFBooleanFalse,
                cf_size as *const c_void,
                kCFBooleanFalse,
            ];

            let thumb_options = CFDictionaryCreate(
                std::ptr::null(),
                thumb_keys.as_ptr(),
                thumb_values.as_ptr(),
                4,
                &kCFTypeDictionaryKeyCallBacks,
                &kCFTypeDictionaryValueCallBacks,
            );

            let cg_image = CGImageSourceCreateThumbnailAtIndex(isrc, 0, thumb_options);

            if !cf_size.is_null() {
                CFRelease(cf_size);
            }
            if !thumb_options.is_null() {
                CFRelease(thumb_options);
            }
            CFRelease(isrc);

            if cg_image.is_null() {
                return None;
            }

            let mutable_data = CFDataCreateMutable(std::ptr::null(), 0);
            let uti = CFStringCreateWithCString(std::ptr::null(), c"public.jpeg".as_ptr(), 0x08000100 /* kCFStringEncodingUTF8 */);
            let dest = CGImageDestinationCreateWithData(mutable_data, uti, 1, std::ptr::null());

            CGImageDestinationAddImage(dest, cg_image, std::ptr::null());
            let success = CGImageDestinationFinalize(dest);

            CGImageRelease(cg_image);
            if !dest.is_null() {
                CFRelease(dest);
            }
            if !uti.is_null() {
                CFRelease(uti);
            }

            if !success || mutable_data.is_null() {
                if !mutable_data.is_null() {
                    CFRelease(mutable_data);
                }
                return None;
            }

            let len = CFDataGetLength(mutable_data) as usize;
            let ptr = CFDataGetBytePtr(mutable_data);
            let result = if !ptr.is_null() && len > 0 {
                let slice = std::slice::from_raw_parts(ptr, len);
                Some(slice.to_vec())
            } else {
                None
            };

            CFRelease(mutable_data);
            result
        }
    }

    pub fn extract_thumbnail(path: &Path, max_pixel_size: u32) -> Option<Vec<u8>> {
        let path_str = path.to_str()?;
        let path_bytes = path_str.as_bytes();

        unsafe {
            let url = CFURLCreateFromFileSystemRepresentation(
                std::ptr::null(),
                path_bytes.as_ptr(),
                path_bytes.len() as isize,
                false,
            );
            if url.is_null() {
                return None;
            }

            // ImageSource options: don't cache full image in memory
            let keys = [kCGImageSourceShouldCache];
            let values = [kCFBooleanFalse];
            let src_options = CFDictionaryCreate(
                std::ptr::null(),
                keys.as_ptr(),
                values.as_ptr(),
                1,
                &kCFTypeDictionaryKeyCallBacks,
                &kCFTypeDictionaryValueCallBacks,
            );

            let isrc = CGImageSourceCreateWithURL(url, src_options);
            if !src_options.is_null() {
                CFRelease(src_options);
            }
            CFRelease(url);

            if isrc.is_null() {
                return None;
            }

            // Thumbnail options: always create thumbnail, with EXIF transform, max pixel size
            let size_val: i32 = max_pixel_size as i32;
            let cf_size = CFNumberCreate(std::ptr::null(), 3 /* kCFNumberSInt32Type */, &size_val as *const i32 as *const c_void);

            let thumb_keys = [
                kCGImageSourceCreateThumbnailFromImageAlways,
                kCGImageSourceCreateThumbnailWithTransform,
                kCGImageSourceThumbnailMaxPixelSize,
                kCGImageSourceShouldCache,
            ];
            let thumb_values = [
                kCFBooleanTrue,
                kCFBooleanTrue,
                cf_size as *const c_void,
                kCFBooleanFalse,
            ];

            let thumb_options = CFDictionaryCreate(
                std::ptr::null(),
                thumb_keys.as_ptr(),
                thumb_values.as_ptr(),
                4,
                &kCFTypeDictionaryKeyCallBacks,
                &kCFTypeDictionaryValueCallBacks,
            );

            let cg_image = CGImageSourceCreateThumbnailAtIndex(isrc, 0, thumb_options);

            if !cf_size.is_null() {
                CFRelease(cf_size);
            }
            if !thumb_options.is_null() {
                CFRelease(thumb_options);
            }
            CFRelease(isrc);

            if cg_image.is_null() {
                return None;
            }

            // Encode to JPEG using CGImageDestination
            let mutable_data = CFDataCreateMutable(std::ptr::null(), 0);
            let uti = CFStringCreateWithCString(std::ptr::null(), c"public.jpeg".as_ptr(), 0x08000100 /* kCFStringEncodingUTF8 */);
            let dest = CGImageDestinationCreateWithData(mutable_data, uti, 1, std::ptr::null());

            CGImageDestinationAddImage(dest, cg_image, std::ptr::null());
            let success = CGImageDestinationFinalize(dest);

            CGImageRelease(cg_image);
            if !dest.is_null() {
                CFRelease(dest);
            }
            if !uti.is_null() {
                CFRelease(uti);
            }

            if !success || mutable_data.is_null() {
                if !mutable_data.is_null() {
                    CFRelease(mutable_data);
                }
                return None;
            }

            let len = CFDataGetLength(mutable_data) as usize;
            let ptr = CFDataGetBytePtr(mutable_data);
            let result = if !ptr.is_null() && len > 0 {
                let slice = std::slice::from_raw_parts(ptr, len);
                Some(slice.to_vec())
            } else {
                None
            };

            CFRelease(mutable_data);
            result
        }
    }
}

pub fn extract_macos_imageio_thumbnail(path: &Path, max_pixel_size: u32) -> Option<Vec<u8>> {
    #[cfg(target_os = "macos")]
    {
        imageio::extract_thumbnail(path, max_pixel_size)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, max_pixel_size);
        None
    }
}
