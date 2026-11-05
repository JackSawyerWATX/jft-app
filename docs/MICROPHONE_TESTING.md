# Microphone permission handling and iPhone Safari verification

The OpenAI engine calls `getUserMedia` directly from the recording tap, before network requests or asynchronous permission queries. The returned stream is used for the WebRTC session. There is one capture request per recording, with no temporary preflight stream or competing capture sessions. The browser manages saved website permission; another tap cannot force a denied native prompt to reopen. No `navigator.permissions` dependency is required.

Cancel, page hiding, navigation, and unmount invalidate startup even while the native permission prompt is pending. Browsers do not provide an abort signal for `getUserMedia`: a pending prompt may remain visible. If it later grants access, the engine stops those tracks and never starts the canceled transport. Startup also has a bounded timeout. Permission errors distinguish Safari site permission, browser security/HTTPS, and missing/busy devices. Connection/provider failures do not claim microphone denial.

OpenAI processes the audio remotely after the WebRTC connection starts. No raw audio is stored or played by the app. Finalized words remain in the editable draft through errors; provisional text is not saved. See [processing, retention, and cost](../README.md#processing-retention-and-cost) and [Amplify configuration](TRANSCRIPTION.md).

## Test locally from an iPhone with a Mac

Use the revision being tested with Node 24:

```sh
npm ci
npm run dev
```

In another terminal:

```sh
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```

Open the printed `https://….trycloudflare.com` URL directly in Safari on the physical iPhone. Both devices need internet access but do not need the same Wi-Fi; cellular also works. Keep both processes running and stop them with Control-C afterward. Each new tunnel origin has separate website permissions.

`next.config.ts` preserves `allowedDevOrigins: ['*.trycloudflare.com']` so changing Quick Tunnel hostnames can load development assets and connect to `/_next/hmr`. It affects only the Next.js development server; restart it after changing configuration. To narrow the allowlist, use the current tunnel hostname without scheme, port, or path, and restart when it changes.

Quick Tunnel URLs are publicly reachable. Use fictional text and keep `STT_ENABLED` unset for layout/typing-only checks. Prefer a protected Amplify preview for paid live transcription, with the branch access and project controls in the deployment guide. Never expose API keys in the tunnel command, client variables, browser console, or logs.

### Disabled microphone or no permission prompt

The HMR cross-origin warning and a disabled microphone button are separate symptoms. Development-origin configuration permits assets; capture still needs a secure context and supported browser APIs. Open the HTTPS URL directly in current Safari or Chrome, rather than an in-app browser.

Enable Web Inspector under the iPhone's Settings → Apps → Safari → Advanced (older iOS versions use Settings → Safari → Advanced). Connect/trust the iPhone on the Mac and use Safari's Develop menu → iPhone → tunnel page. These checks disclose no audio or credentials:

```js
({
  secure: window.isSecureContext,
  microphoneAPI: typeof navigator.mediaDevices?.getUserMedia === 'function',
  webRTC: typeof window.RTCPeerConnection === 'function',
  webAudio: typeof window.AudioContext === 'function'
});
```

All should be true. Capability does not establish permission, provider access, or successful recognition. If capabilities pass but connection startup fails, verify the server-only OpenAI configuration and model access. Use `?speechDebug=1` for safe lifecycle events and `?speechDebug=0` to disable them. No raw provider frames, transcripts, audio, or credential responses should be logged.

## Physical phone and Amplify test plan

Use the actual HTTPS preview with secure key configuration. Test each origin separately with fictional text. Desktop emulation does not validate native prompts, mobile networking, or live model behavior.

1. **Fresh permissions:** Set the website's Microphone permission to Ask in Safari's Website Settings. Reload: no prompt should appear on load. Type a draft, tap Record once, allow access, and speak. Confirm provisional text, corrected punctuated finals, activity accents, and no required second tap. Record the OS/browser version and actual result.
2. **Previously granted/denied:** With Allow, repeat recording and stopping; each session uses one capture stream without overlap. With Deny, expect actionable Safari/site permission guidance and an unchanged draft. Change the site setting to Allow and retry; no promise is made that another tap reopens a denied prompt.
3. **Pending permission:** Rapidly cancel, hide the page, or navigate to Past shares while the prompt is open. Grant afterward. Tracks must stop and the canceled session must never connect. Return to the editor and verify the draft and another explicit start.
4. **Interruptions:** Switch apps, lock the screen, receive a call, lose network, and navigate while listening or finalizing. The OS microphone indicator must clear. Finalized words remain; unfinished provisional words are discarded on failure. Recording never automatically restarts.
5. **Stop/review/save:** Stop mid-sentence, check microphone release immediately, wait for finalization or a clear timeout, edit inline, resume to append a paragraph, and explicitly save. Verify history and sharing in a second browser session. Refresh an unsaved draft and confirm it starts empty.
6. **Provider unavailable:** Missing credentials, denied model access, and network/provider failures must retain typed/finalized text and allow typing/saving. These errors must not instruct the user to change microphone permission unless capture itself failed.
7. **Boundaries:** Test quiet speech, noise, long continuous speech, trailing words, silence, the ten-minute session limit, and the 10,000-code-point text limit. Check scrollback, resizing, large text, reduced motion, and VoiceOver/TalkBack as described in the README.

Run `npm run check`, then `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e -- --workers=2` after the build. Mocks verify permission and lifecycle behavior, including late grants after cancellation/backgrounding/navigation; they do not prove physical-phone recognition quality or provider availability. Playwright forces paid issuance off.
