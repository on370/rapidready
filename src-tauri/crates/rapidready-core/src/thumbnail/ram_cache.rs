//! In-memory LRU for thumbnail and preview JPEGs, bounded by bytes instead of entry count.
//!
//! The previous cache held up to 10,000 entries of any size. Grid thumbnails are tens of KB,
//! but full-size previews (`scale 100`: the original JPEG or the largest embedded JPEG of a RAW)
//! are several MB each, so browsing a few hundred images in the loupe grew the process by GBs.
//!
//! Entries are split by size into two pools with their own budgets, so a handful of full-size
//! previews can never push thousands of grid thumbnails out of memory (and vice versa).

use lru::LruCache;

/// Entries larger than this go to the large pool (full-size previews). Grid thumbnails and the
/// 720 px loupe previews stay well below it.
pub const LARGE_ENTRY_BYTES: usize = 1024 * 1024;
/// Budget for thumbnails and small previews (~10,000 grid tiles).
pub const DEFAULT_SMALL_POOL_BYTES: usize = 256 * 1024 * 1024;
/// Budget for full-size previews (the current image, the loupe look-ahead and recent history).
pub const DEFAULT_LARGE_POOL_BYTES: usize = 384 * 1024 * 1024;

struct Pool {
    lru: LruCache<String, Vec<u8>>,
    bytes: usize,
    budget: usize,
}

impl Pool {
    fn new(budget: usize) -> Self {
        Self { lru: LruCache::unbounded(), bytes: 0, budget }
    }

    fn get(&mut self, key: &str) -> Option<&Vec<u8>> {
        self.lru.get(key)
    }

    fn contains(&self, key: &str) -> bool {
        self.lru.contains(key)
    }

    fn remove(&mut self, key: &str) {
        if let Some(old) = self.lru.pop(key) {
            self.bytes -= old.len();
        }
    }

    fn put(&mut self, key: String, value: Vec<u8>) {
        if value.len() > self.budget {
            // Would evict everything and still not fit.
            self.remove(&key);
            return;
        }
        self.bytes += value.len();
        if let Some(old) = self.lru.put(key, value) {
            self.bytes -= old.len();
        }
        while self.bytes > self.budget {
            match self.lru.pop_lru() {
                Some((_, evicted)) => self.bytes -= evicted.len(),
                None => break,
            }
        }
    }

    fn clear(&mut self) {
        self.lru.clear();
        self.bytes = 0;
    }
}

pub struct RamCache {
    small: Pool,
    large: Pool,
}

impl RamCache {
    pub fn new() -> Self {
        Self::with_budgets(DEFAULT_SMALL_POOL_BYTES, DEFAULT_LARGE_POOL_BYTES)
    }

    pub fn with_budgets(small_bytes: usize, large_bytes: usize) -> Self {
        Self { small: Pool::new(small_bytes), large: Pool::new(large_bytes) }
    }

    /// Returns the entry and marks it as most recently used.
    pub fn get(&mut self, key: &str) -> Option<&Vec<u8>> {
        if self.small.contains(key) {
            self.small.get(key)
        } else {
            self.large.get(key)
        }
    }

    pub fn contains(&self, key: &str) -> bool {
        self.small.contains(key) || self.large.contains(key)
    }

    pub fn put(&mut self, key: String, value: Vec<u8>) {
        if value.len() > LARGE_ENTRY_BYTES {
            self.small.remove(&key);
            self.large.put(key, value);
        } else {
            self.large.remove(&key);
            self.small.put(key, value);
        }
    }

    pub fn clear(&mut self) {
        self.small.clear();
        self.large.clear();
    }

    /// Total bytes held (both pools).
    pub fn total_bytes(&self) -> usize {
        self.small.bytes + self.large.bytes
    }

    pub fn len(&self) -> usize {
        self.small.lru.len() + self.large.lru.len()
    }
}

impl Default for RamCache {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const KB: usize = 1024;
    const MB: usize = 1024 * 1024;

    fn entry(len: usize) -> Vec<u8> {
        vec![0u8; len]
    }

    #[test]
    fn stays_within_byte_budget() {
        let mut c = RamCache::with_budgets(100 * KB, 10 * MB);
        for i in 0..50 {
            c.put(format!("thumb{}", i), entry(10 * KB));
        }
        assert!(c.total_bytes() <= 100 * KB);
        assert_eq!(c.len(), 10);
        // Oldest entries were evicted, newest kept
        assert!(!c.contains("thumb0"));
        assert!(c.contains("thumb49"));
    }

    #[test]
    fn large_previews_do_not_evict_thumbnails() {
        let mut c = RamCache::with_budgets(1 * MB, 8 * MB);
        for i in 0..50 {
            c.put(format!("thumb{}", i), entry(20 * KB));
        }
        for i in 0..20 {
            c.put(format!("full{}", i), entry(3 * MB));
        }
        assert!((0..50).all(|i| c.contains(&format!("thumb{}", i))), "grid tiles must survive preview browsing");
        assert!(c.total_bytes() <= 9 * MB);
        assert!(c.contains("full19"));
        assert!(!c.contains("full0"));
    }

    #[test]
    fn get_refreshes_recency() {
        let mut c = RamCache::with_budgets(30 * KB, MB);
        c.put("a".into(), entry(10 * KB));
        c.put("b".into(), entry(10 * KB));
        c.put("c".into(), entry(10 * KB));
        assert!(c.get("a").is_some());
        c.put("d".into(), entry(10 * KB));
        assert!(c.contains("a"), "recently read entry must be kept");
        assert!(!c.contains("b"), "least recently used entry must go");
    }

    #[test]
    fn replacing_a_key_keeps_accounting_correct() {
        let mut c = RamCache::with_budgets(MB, 8 * MB);
        c.put("k".into(), entry(100 * KB));
        c.put("k".into(), entry(200 * KB));
        assert_eq!(c.total_bytes(), 200 * KB);
        // Same key growing past the size threshold moves to the large pool
        c.put("k".into(), entry(2 * MB));
        assert_eq!(c.total_bytes(), 2 * MB);
        assert_eq!(c.len(), 1);
        assert_eq!(c.get("k").unwrap().len(), 2 * MB);
    }

    #[test]
    fn entry_larger_than_its_pool_is_not_cached() {
        let mut c = RamCache::with_budgets(MB, 4 * MB);
        c.put("keep".into(), entry(2 * MB));
        c.put("huge".into(), entry(5 * MB));
        assert!(!c.contains("huge"));
        assert!(c.contains("keep"), "an oversized entry must not flush the pool");
    }

    #[test]
    fn clear_resets_everything() {
        let mut c = RamCache::new();
        c.put("a".into(), entry(KB));
        c.put("b".into(), entry(2 * MB));
        c.clear();
        assert_eq!(c.len(), 0);
        assert_eq!(c.total_bytes(), 0);
    }
}
