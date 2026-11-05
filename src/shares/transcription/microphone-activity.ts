const SILENCE_MS = 800;
const SPEECH_RMS = 0.015;

/** Local amplitude cues and silence boundaries only; audio is neither recorded nor played back. */
export function watchMicrophone(
  stream: MediaStream,
  activity: (speaking: boolean) => void,
  boundary: () => void,
  failed: () => void
): () => void {
  const context = new AudioContext();
  let source: MediaStreamAudioSourceNode | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let live = true;
  const release = () => {
    if (!live) return;
    live = false;
    context.onstatechange = null;
    clearInterval(timer);
    source?.disconnect();
    void context.close().catch(() => {});
  };
  try {
    source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser); // Never connect microphone audio to the speakers.
    const samples = new Float32Array(analyser.fftSize);
    let speaking = false;
    let dirty = false;
    let lastSpeech = 0;
    let running = context.state === 'running';
    context.onstatechange = () => {
      if (context.state === 'running') running = true;
      else if (live && running) failed();
    };
    void context
      .resume()
      .then(() => {
        if (live && context.state !== 'running') failed();
      })
      .catch(() => {
        if (live) failed();
      });
    timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(
        samples.reduce((sum, sample) => sum + sample * sample, 0) /
          samples.length
      );
      const active = rms > SPEECH_RMS;
      if (active) {
        lastSpeech = Date.now();
        dirty = true;
      }
      if (active !== speaking) {
        speaking = active;
        activity(active);
      }
      if (dirty && !active && Date.now() - lastSpeech >= SILENCE_MS) {
        dirty = false;
        boundary();
      }
    }, 50);
    return release;
  } catch (cause) {
    release();
    throw cause;
  }
}
