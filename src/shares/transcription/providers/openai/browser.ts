import { OpenAIRealtimeWebRTC } from 'openai/realtime/webrtc';
import { requestMicrophone } from '../../microphone-permission';
import { watchMicrophone } from '../../microphone-activity';

/** Concrete browser boundaries, injected for deterministic resource-lifetime tests. */
export interface SpeechDependencies {
  available(): boolean;
  microphone(): Promise<MediaStream>;
  connection(): OpenAIRealtimeWebRTC;
  fetch: typeof fetch;
  watch: typeof watchMicrophone;
}
export const browser: SpeechDependencies = {
  available: () =>
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    Boolean(
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof window.RTCPeerConnection === 'function' &&
      typeof window.AudioContext === 'function'
    ),
  microphone: requestMicrophone,
  connection: () => new OpenAIRealtimeWebRTC(),
  fetch: (...args) => fetch(...args),
  watch: watchMicrophone
};
