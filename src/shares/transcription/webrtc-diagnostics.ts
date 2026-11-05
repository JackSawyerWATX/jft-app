import { speechDiagnostic, speechDiagnosticsEnabled } from './diagnostics';

/** Opt-in outbound packet counters establish whether audio leaves the browser without logging audio, network addresses or track IDs. */
export function watchWebRTCStats(peer: RTCPeerConnection): () => void {
  if (!speechDiagnosticsEnabled() || typeof peer.getStats !== 'function')
    return () => {};
  let live = true;
  let pending = false;
  const timer = setInterval(() => {
    if (pending) return;
    pending = true;
    void (async () => {
      try {
        const stats = await peer.getStats();
        if (!live) return;
        let packets = 0,
          bytes = 0;
        stats.forEach((entry) => {
          if (
            entry.type === 'outbound-rtp' &&
            (entry.kind === 'audio' || entry.mediaType === 'audio')
          ) {
            if (typeof entry.packetsSent === 'number')
              packets += entry.packetsSent;
            if (typeof entry.bytesSent === 'number') bytes += entry.bytesSent;
          }
        });
        speechDiagnostic('webrtc-audio-sent', { packets, bytes });
      } catch {
        if (live) speechDiagnostic('webrtc-stats-unavailable');
      } finally {
        pending = false;
      }
    })();
  }, 2_000);
  return () => {
    live = false;
    clearInterval(timer);
  };
}
