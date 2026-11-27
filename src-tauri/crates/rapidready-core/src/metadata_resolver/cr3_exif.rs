use std::fs::File;
use std::io::{Read, Seek, SeekFrom};

/// Canon CR3 metadata UUID inside the `moov` -> `uuid` box:
/// `85c0b687-820f-11e0-8111-f4ce462b6a48`
const CANON_META_UUID: [u8; 16] = [
    0x85, 0xc0, 0xb6, 0x87, 0x82, 0x0f, 0x11, 0xe0, 0x81, 0x11, 0xf4, 0xce, 0x46, 0x2b, 0x6a, 0x48,
];

/// Hard cap on `moov` box read size to protect NAS / slow SMB mounts from excessive I/O.
const MAX_MOOV_BYTES: u64 = 4 * 1024 * 1024;

/// Returns `true` if the 16-byte file header matches Canon CR3 ISOBMFF (`ftypcrx `).
pub fn is_cr3_magic(magic16: &[u8; 16]) -> bool {
    &magic16[4..8] == b"ftyp" && &magic16[8..12] == b"crx "
}

/// Reads Canon CR3 EXIF metadata blocks (`CMT1`, `CMT2`, `CMT4`) from the `moov` -> `uuid` box
/// without reading the full file (seeks over non-`moov` top-level boxes, caps `moov` at 4 MB).
pub fn read_cr3_exif_blocks(file: &mut File) -> Vec<exif::Exif> {
    let mut blocks = Vec::new();
    let Some(moov_buf) = read_moov_payload(file) else {
        return blocks;
    };

    let mut off = 0usize;
    while let Some((box_type, payload, next_off)) = next_slice_box(&moov_buf, off) {
        if &box_type == b"uuid" && payload.len() >= 16 && payload[..16] == CANON_META_UUID {
            let mut sub_off = 0usize;
            let uuid_sub = &payload[16..];
            while let Some((sub_type, sub_payload, next_sub_off)) = next_slice_box(uuid_sub, sub_off) {
                let parsed = match &sub_type {
                    b"CMT1" => parse_tiff_raw(sub_payload.to_vec()),
                    b"CMT2" => wrap_tiff_ifd_as_sub_ifd(sub_payload, 0x8769).and_then(parse_tiff_raw),
                    b"CMT4" => wrap_tiff_ifd_as_sub_ifd(sub_payload, 0x8825).and_then(parse_tiff_raw),
                    _ => None,
                };
                if let Some(exif) = parsed {
                    blocks.push(exif);
                }
                sub_off = next_sub_off;
            }
        }
        off = next_off;
    }

    blocks
}

fn read_moov_payload(file: &mut File) -> Option<Vec<u8>> {
    file.seek(SeekFrom::Start(0)).ok()?;
    let mut pos: u64 = 0;

    loop {
        let mut hdr = [0u8; 8];
        if file.read_exact(&mut hdr).is_err() {
            return None;
        }

        let size32 = u32::from_be_bytes([hdr[0], hdr[1], hdr[2], hdr[3]]) as u64;
        let box_type = [hdr[4], hdr[5], hdr[6], hdr[7]];

        let (header_len, box_size_opt) = if size32 == 1 {
            let mut ext = [0u8; 8];
            if file.read_exact(&mut ext).is_err() {
                return None;
            }
            let size64 = u64::from_be_bytes(ext);
            if size64 < 16 {
                return None;
            }
            (16u64, Some(size64))
        } else if size32 == 0 {
            // Box extends to EOF
            (8u64, None)
        } else if size32 < 8 {
            return None;
        } else {
            (8u64, Some(size32))
        };

        if &box_type == b"moov" {
            let limit = match box_size_opt {
                Some(total) => total.saturating_sub(header_len).min(MAX_MOOV_BYTES),
                None => MAX_MOOV_BYTES,
            };
            let mut buf = Vec::new();
            file.take(limit).read_to_end(&mut buf).ok()?;
            return Some(buf);
        }

        match box_size_opt {
            Some(total) => {
                let next_pos = pos.checked_add(total)?;
                if next_pos <= pos {
                    return None;
                }
                file.seek(SeekFrom::Start(next_pos)).ok()?;
                pos = next_pos;
            }
            None => return None,
        }
    }
}

fn next_slice_box(data: &[u8], offset: usize) -> Option<([u8; 4], &[u8], usize)> {
    if offset.checked_add(8)? > data.len() {
        return None;
    }
    let size32 = u32::from_be_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]) as u64;
    let box_type = [
        data[offset + 4],
        data[offset + 5],
        data[offset + 6],
        data[offset + 7],
    ];

    let (header_len, total_size) = if size32 == 1 {
        if offset.checked_add(16)? > data.len() {
            return None;
        }
        let size64 = u64::from_be_bytes([
            data[offset + 8],
            data[offset + 9],
            data[offset + 10],
            data[offset + 11],
            data[offset + 12],
            data[offset + 13],
            data[offset + 14],
            data[offset + 15],
        ]);
        if size64 < 16 {
            return None;
        }
        (16usize, size64)
    } else if size32 == 0 {
        (8usize, (data.len() - offset) as u64)
    } else if size32 < 8 {
        return None;
    } else {
        (8usize, size32)
    };

    let end = offset
        .saturating_add(usize::try_from(total_size).unwrap_or(usize::MAX))
        .min(data.len());
    let payload_start = offset + header_len;
    if payload_start > end || end <= offset {
        return None;
    }

    Some((box_type, &data[payload_start..end], end))
}

fn parse_tiff_raw(buf: Vec<u8>) -> Option<exif::Exif> {
    if buf.len() < 8 {
        return None;
    }
    let mut reader = exif::Reader::new();
    reader.continue_on_error(true);
    match reader.read_raw(buf) {
        Ok(exif) if exif.fields().next().is_some() => Some(exif),
        Err(exif::Error::PartialResult(pr)) => {
            let (exif, _) = pr.into_inner();
            if exif.fields().next().is_some() {
                Some(exif)
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Wraps a standalone TIFF-like IFD (`CMT2` = Exif IFD, `CMT4` = GPS IFD) by appending an
/// 18-byte synthetic IFD0 containing a single pointer tag (`0x8769` or `0x8825`) pointing to
/// the original IFD0 offset, and updating the header's IFD0 offset to point to the synthetic IFD0.
/// All internal offsets remain untouched.
fn wrap_tiff_ifd_as_sub_ifd(raw: &[u8], pointer_tag: u16) -> Option<Vec<u8>> {
    if raw.len() < 8 {
        return None;
    }

    let is_le = match &raw[0..2] {
        b"II" => true,
        b"MM" => false,
        _ => return None,
    };

    let magic = if is_le {
        u16::from_le_bytes([raw[2], raw[3]])
    } else {
        u16::from_be_bytes([raw[2], raw[3]])
    };
    if magic != 42 {
        return None;
    }

    let orig_ifd0_off = if is_le {
        u32::from_le_bytes([raw[4], raw[5], raw[6], raw[7]])
    } else {
        u32::from_be_bytes([raw[4], raw[5], raw[6], raw[7]])
    };

    let mut buf = raw.to_vec();
    if buf.len() % 2 != 0 {
        buf.push(0x00);
    }

    let synth_off = u32::try_from(buf.len()).ok()?;

    let push_u16 = |b: &mut Vec<u8>, v: u16| {
        if is_le {
            b.extend_from_slice(&v.to_le_bytes());
        } else {
            b.extend_from_slice(&v.to_be_bytes());
        }
    };
    let push_u32 = |b: &mut Vec<u8>, v: u32| {
        if is_le {
            b.extend_from_slice(&v.to_le_bytes());
        } else {
            b.extend_from_slice(&v.to_be_bytes());
        }
    };

    // 18-byte synthetic IFD0: entry count (2) + 1 IFD entry (12) + next IFD offset (4)
    push_u16(&mut buf, 1);
    push_u16(&mut buf, pointer_tag);
    push_u16(&mut buf, 4); // LONG
    push_u32(&mut buf, 1); // count = 1
    push_u32(&mut buf, orig_ifd0_off);
    push_u32(&mut buf, 0); // next IFD = 0

    let synth_bytes = if is_le {
        synth_off.to_le_bytes()
    } else {
        synth_off.to_be_bytes()
    };
    buf[4..8].copy_from_slice(&synth_bytes);

    Some(buf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDateTime;
    use std::io::Write;

    enum TiffVal {
        Ascii(&'static [u8]),
        Short(u16),
        Rational(Vec<(u32, u32)>),
    }

    fn build_tiff_le(entries: &[(u16, TiffVal)]) -> Vec<u8> {
        let mut buf = Vec::new();
        // TIFF header: II, 42, IFD0 at offset 8
        buf.extend_from_slice(b"II");
        buf.extend_from_slice(&42u16.to_le_bytes());
        buf.extend_from_slice(&8u32.to_le_bytes());

        let count = entries.len() as u16;
        buf.extend_from_slice(&count.to_le_bytes());

        let mut data_off = 8 + 2 + entries.len() * 12 + 4;
        let mut extra_data = Vec::new();

        for (tag, val) in entries {
            buf.extend_from_slice(&tag.to_le_bytes());
            match val {
                TiffVal::Ascii(bytes) => {
                    buf.extend_from_slice(&2u16.to_le_bytes()); // ASCII
                    let len = bytes.len() as u32;
                    buf.extend_from_slice(&len.to_le_bytes());
                    if bytes.len() <= 4 {
                        let mut inline = [0u8; 4];
                        inline[..bytes.len()].copy_from_slice(bytes);
                        buf.extend_from_slice(&inline);
                    } else {
                        buf.extend_from_slice(&(data_off as u32).to_le_bytes());
                        extra_data.extend_from_slice(bytes);
                        if bytes.len() % 2 != 0 {
                            extra_data.push(0);
                        }
                        data_off = 8 + 2 + entries.len() * 12 + 4 + extra_data.len();
                    }
                }
                TiffVal::Short(v) => {
                    buf.extend_from_slice(&3u16.to_le_bytes()); // SHORT
                    buf.extend_from_slice(&1u32.to_le_bytes());
                    buf.extend_from_slice(&v.to_le_bytes());
                    buf.extend_from_slice(&0u16.to_le_bytes());
                }
                TiffVal::Rational(rats) => {
                    buf.extend_from_slice(&5u16.to_le_bytes()); // RATIONAL
                    buf.extend_from_slice(&(rats.len() as u32).to_le_bytes());
                    buf.extend_from_slice(&(data_off as u32).to_le_bytes());
                    for (num, den) in rats {
                        extra_data.extend_from_slice(&num.to_le_bytes());
                        extra_data.extend_from_slice(&den.to_le_bytes());
                    }
                    data_off = 8 + 2 + entries.len() * 12 + 4 + extra_data.len();
                }
            }
        }

        buf.extend_from_slice(&0u32.to_le_bytes()); // next IFD
        buf.extend_from_slice(&extra_data);
        buf
    }

    fn make_box(box_type: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        let total = (8 + payload.len()) as u32;
        let mut out = Vec::with_capacity(8 + payload.len());
        out.extend_from_slice(&total.to_be_bytes());
        out.extend_from_slice(box_type);
        out.extend_from_slice(payload);
        out
    }

    fn build_synthetic_cr3() -> Vec<u8> {
        let cmt1 = build_tiff_le(&[
            (0x010F, TiffVal::Ascii(b"Canon\0")),
            (0x0110, TiffVal::Ascii(b"Canon EOS R8\0")),
        ]);
        let cmt2 = build_tiff_le(&[
            (0x829A, TiffVal::Rational(vec![(1, 500)])), // ExposureTime 1/500s
            (0x829D, TiffVal::Rational(vec![(28, 10)])), // FNumber f/2.8
            (0x8827, TiffVal::Short(400)),               // ISOSpeedRatings 400
            (0x9003, TiffVal::Ascii(b"2025:06:15 10:20:30\0")), // DateTimeOriginal
            (0x920A, TiffVal::Rational(vec![(50, 1)])),  // FocalLength 50 mm
            (0xA434, TiffVal::Ascii(b"RF50mm F1.8 STM\0")), // LensModel
        ]);
        let cmt4 = build_tiff_le(&[
            (0x0001, TiffVal::Ascii(b"N\0")),
            (0x0002, TiffVal::Rational(vec![(48, 1), (8, 1), (14, 1)])), // 48 deg 8' 14" N
            (0x0003, TiffVal::Ascii(b"E\0")),
            (0x0004, TiffVal::Rational(vec![(11, 1), (34, 1), (32, 1)])), // 11 deg 34' 32" E
        ]);

        let mut uuid_payload = Vec::new();
        uuid_payload.extend_from_slice(&CANON_META_UUID);
        uuid_payload.extend_from_slice(&make_box(b"CMT1", &cmt1));
        uuid_payload.extend_from_slice(&make_box(b"CMT2", &cmt2));
        uuid_payload.extend_from_slice(&make_box(b"CMT4", &cmt4));

        let uuid_box = make_box(b"uuid", &uuid_payload);
        let moov_box = make_box(b"moov", &uuid_box);
        let ftyp_box = make_box(b"ftyp", b"crx \0\0\0\x01crx isom");

        let mut cr3 = Vec::new();
        cr3.extend_from_slice(&ftyp_box);
        cr3.extend_from_slice(&moov_box);
        cr3
    }

    #[test]
    fn test_is_cr3_magic() {
        let mut magic = [0u8; 16];
        magic[4..8].copy_from_slice(b"ftyp");
        magic[8..12].copy_from_slice(b"crx ");
        assert!(is_cr3_magic(&magic));

        magic[8..12].copy_from_slice(b"heic");
        assert!(!is_cr3_magic(&magic));
    }

    #[test]
    fn test_synthetic_cr3_exif_metadata_and_date() {
        let cr3_bytes = build_synthetic_cr3();
        let temp_dir = std::env::temp_dir().join(format!("rr_cr3_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let cr3_path = temp_dir.join("IMG_0001.CR3");
        {
            let mut f = File::create(&cr3_path).unwrap();
            f.write_all(&cr3_bytes).unwrap();
        }

        let mut f = File::open(&cr3_path).unwrap();
        let blocks = read_cr3_exif_blocks(&mut f);
        assert_eq!(blocks.len(), 3, "Expected CMT1, CMT2, CMT4 blocks");

        let meta = crate::metadata_resolver::get_image_metadata(&cr3_path);
        assert!(meta.is_raw);
        assert_eq!(meta.camera.as_deref(), Some("Canon EOS R8"));
        assert_eq!(meta.lens.as_deref(), Some("RF50mm F1.8 STM"));
        assert_eq!(meta.iso.as_deref(), Some("400"));
        assert_eq!(meta.aperture.as_deref(), Some("f/2.8"));
        assert_eq!(meta.shutter.as_deref(), Some("1/500s"));
        assert_eq!(meta.focal_length.as_deref(), Some("50 mm"));

        let expected_dt = NaiveDateTime::parse_from_str("2025:06:15 10:20:30", "%Y:%m:%d %H:%M:%S").unwrap();
        assert_eq!(meta.original_date, Some(expected_dt));
        assert_eq!(meta.date, Some(expected_dt));

        let lat = meta.latitude.expect("GPS latitude should be extracted");
        let lon = meta.longitude.expect("GPS longitude should be extracted");
        assert!((lat - (48.0 + 8.0 / 60.0 + 14.0 / 3600.0)).abs() < 1e-6);
        assert!((lon - (11.0 + 34.0 / 60.0 + 32.0 / 3600.0)).abs() < 1e-6);

        let resolved_dt = crate::date_resolver::get_creation_date(&cr3_path).unwrap();
        assert_eq!(resolved_dt, expected_dt);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_cr3_corrupt_and_truncated_boxes_no_panic() {
        let temp_dir = std::env::temp_dir().join(format!("rr_cr3_edge_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);

        // 1. Box size < 8 (size = 3) -> must terminate immediately without infinite loop
        let bad_size_path = temp_dir.join("bad_size.cr3");
        {
            let mut f = File::create(&bad_size_path).unwrap();
            f.write_all(&[0, 0, 0, 3, b'f', b't', b'y', b'p']).unwrap();
        }
        let mut f1 = File::open(&bad_size_path).unwrap();
        assert!(read_cr3_exif_blocks(&mut f1).is_empty());

        // 2. Box size == 0 on non-moov -> must terminate cleanly
        let zero_size_path = temp_dir.join("zero_size.cr3");
        {
            let mut f = File::create(&zero_size_path).unwrap();
            f.write_all(&[0, 0, 0, 0, b'f', b'r', b'e', b'e', 1, 2, 3, 4]).unwrap();
        }
        let mut f2 = File::open(&zero_size_path).unwrap();
        assert!(read_cr3_exif_blocks(&mut f2).is_empty());

        // 3. Corrupt CMT2 inside moov -> must not panic and must skip invalid CMT2
        let mut uuid_payload = Vec::new();
        uuid_payload.extend_from_slice(&CANON_META_UUID);
        uuid_payload.extend_from_slice(&make_box(b"CMT2", b"NOT_A_TIFF_HEADER_1234"));
        let moov = make_box(b"moov", &make_box(b"uuid", &uuid_payload));
        let ftyp = make_box(b"ftyp", b"crx \0\0\0\x01");
        let corrupt_cmt2_path = temp_dir.join("corrupt_cmt2.cr3");
        {
            let mut f = File::create(&corrupt_cmt2_path).unwrap();
            f.write_all(&ftyp).unwrap();
            f.write_all(&moov).unwrap();
        }
        let mut f3 = File::open(&corrupt_cmt2_path).unwrap();
        assert!(read_cr3_exif_blocks(&mut f3).is_empty());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
