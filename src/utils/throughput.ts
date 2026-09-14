import { useRef, useState, useEffect } from 'react';

export interface ThroughputStats {
  bytesPerSecond: number;
  peakBytesPerSecond: number;
  formattedSpeed: string; // e.g. "84.5 MB/s"
  formattedBitrate: string; // e.g. "676 Mb/s" or "1.20 Gb/s"
  formattedPeakSpeed: string;
  formattedPeakBitrate: string;
}

export function formatByteRate(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '0 MB/s';
  if (bytesPerSec >= 1024 * 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
  }
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
}

export function formatBitRate(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '0 Mb/s';
  const bitsPerSec = bytesPerSec * 8;
  if (bitsPerSec >= 1_000_000_000) {
    return `${(bitsPerSec / 1_000_000_000).toFixed(2)} Gb/s`;
  }
  if (bitsPerSec >= 1_000_000) {
    return `${(bitsPerSec / 1_000_000).toFixed(0)} Mb/s`;
  }
  return `${(bitsPerSec / 1000).toFixed(0)} kb/s`;
}

interface Sample {
  timestamp: number;
  bytes: number;
}

/**
 * Custom React hook that calculates rolling-window throughput from a cumulative byte counter.
 * Returns human-readable storage speeds (MB/s, GB/s) and network bitrates (Mb/s, Gb/s).
 */
export function useThroughput(
  currentBytes: number,
  isActive: boolean,
  resetKey?: string | number
): ThroughputStats {
  const samplesRef = useRef<Sample[]>([]);
  const peakRef = useRef<number>(0);
  const lastResetKeyRef = useRef(resetKey);
  const [stats, setStats] = useState<ThroughputStats>({
    bytesPerSecond: 0,
    peakBytesPerSecond: 0,
    formattedSpeed: '0 MB/s',
    formattedBitrate: '0 Mb/s',
    formattedPeakSpeed: '0 MB/s',
    formattedPeakBitrate: '0 Mb/s',
  });

  // Reset when resetKey changes (e.g. new scan session or import)
  useEffect(() => {
    if (resetKey !== undefined && resetKey !== lastResetKeyRef.current) {
      lastResetKeyRef.current = resetKey;
      samplesRef.current = [];
      peakRef.current = 0;
      setStats({
        bytesPerSecond: 0,
        peakBytesPerSecond: 0,
        formattedSpeed: '0 MB/s',
        formattedBitrate: '0 Mb/s',
        formattedPeakSpeed: '0 MB/s',
        formattedPeakBitrate: '0 Mb/s',
      });
    }
  }, [resetKey]);

  useEffect(() => {
    if (!isActive) {
      setStats((prev) => ({
        ...prev,
        bytesPerSecond: 0,
        formattedSpeed: '0 MB/s',
        formattedBitrate: '0 Mb/s',
      }));
      return;
    }

    const now = performance.now();
    const samples = samplesRef.current;
    samples.push({ timestamp: now, bytes: currentBytes });

    // Keep samples within a 1.5s rolling window
    const cutoff = now - 1500;
    while (samples.length > 2 && samples[0].timestamp < cutoff) {
      samples.shift();
    }

    if (samples.length >= 2) {
      const oldest = samples[0];
      const deltaSec = (now - oldest.timestamp) / 1000;
      const deltaBytes = Math.max(0, currentBytes - oldest.bytes);

      if (deltaSec >= 0.35) {
        const speed = deltaBytes / deltaSec;
        if (speed > peakRef.current) {
          peakRef.current = speed;
        }

        setStats({
          bytesPerSecond: speed,
          peakBytesPerSecond: peakRef.current,
          formattedSpeed: formatByteRate(speed),
          formattedBitrate: formatBitRate(speed),
          formattedPeakSpeed: formatByteRate(peakRef.current),
          formattedPeakBitrate: formatBitRate(peakRef.current),
        });
      }
    }
  }, [currentBytes, isActive]);

  // Idle decay timer: if no new samples arrive for > 1.2s while active, decay live rate to 0
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      const now = performance.now();
      const samples = samplesRef.current;
      if (samples.length > 0) {
        const lastSample = samples[samples.length - 1];
        if (now - lastSample.timestamp > 1200) {
          setStats((prev) => {
            if (prev.bytesPerSecond === 0) return prev;
            return {
              ...prev,
              bytesPerSecond: 0,
              formattedSpeed: '0 MB/s',
              formattedBitrate: '0 Mb/s',
            };
          });
        }
      }
    }, 400);

    return () => clearInterval(interval);
  }, [isActive]);

  return stats;
}
