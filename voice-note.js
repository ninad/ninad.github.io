(function () {
	if (document.getElementById('voice-note')) return;
	if (!navigator.mediaDevices || !window.MediaRecorder) return;

	var TG_BOT_TOKEN = '8631544122:AAFkT-2FeYMDt0Q4K4dmuDdm_mAKgK7k-FE';
	var TG_CHAT_ID = '8739799626';
	var MAX_SECONDS = 10;
	var STATES = ['recording', 'sending', 'done', 'error'];
	var DEFAULT_LABEL = 'Send me a voice note';

	var css = ''
		+ '#voice-note{position:fixed;bottom:24px;left:10%;height:44px;min-width:44px;'
		+ 'border-radius:22px;border:1px solid #e0e0e0;background:#fff;color:#8e8e8e;'
		+ 'display:inline-flex;align-items:center;justify-content:flex-start;padding:0 14px;'
		+ "font-family:'Lora','Lucida Sans Unicode','Lucida Grande','Lucida Sans',Arial,sans-serif;"
		+ 'font-size:14px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.06);'
		+ 'transition:background .2s,color .2s,border-color .2s,min-width .3s ease;z-index:100;}'
		+ '#voice-note:hover{color:#000;border-color:#b8b8b8;}'
		+ '#voice-note .vn-icon{flex:0 0 auto;display:block;}'
		+ '#voice-note .vn-label{max-width:0;margin-left:0;opacity:0;overflow:hidden;'
		+ 'white-space:nowrap;transition:max-width .3s ease,margin-left .3s ease,opacity .2s ease;}'
		+ '#voice-note:hover,#voice-note.recording,#voice-note.sending,#voice-note.done,'
		+ '#voice-note.error{min-width:240px;}'
		+ '#voice-note:hover .vn-label,#voice-note.recording .vn-label,#voice-note.sending .vn-label,'
		+ '#voice-note.done .vn-label,#voice-note.error .vn-label{max-width:200px;margin-left:10px;opacity:1;}'
		+ '#voice-note.recording{background:#f4d6d6;color:#c0392b;border-color:#e8b8b8;}'
		+ '#voice-note.recording:hover{background:#efc8c8;}'
		+ '#voice-note.recording .vn-icon{animation:vn-blink 1s ease-in-out infinite;}'
		+ '#voice-note.sending{background:#f0f0eb;color:#6a6a6a;border-color:#d8d8d2;'
		+ 'cursor:wait;pointer-events:none;}'
		+ '#voice-note.done{background:#d8e4d6;color:#2e7d32;border-color:#b8cdb6;}'
		+ '#voice-note.error{background:#f0f0eb;color:#6a6a6a;border-color:#d8d8d2;}'
		+ '@keyframes vn-blink{0%,100%{opacity:1;}50%{opacity:0;}}';

	var style = document.createElement('style');
	style.textContent = css;
	document.head.appendChild(style);

	var btn = document.createElement('button');
	btn.id = 'voice-note';
	btn.type = 'button';
	btn.setAttribute('aria-label', DEFAULT_LABEL);
	btn.title = DEFAULT_LABEL;
	btn.innerHTML = ''
		+ '<svg class="vn-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">'
		+ '<path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>'
		+ '<path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V20H8a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-2.08A7 7 0 0 0 19 11z"/>'
		+ '</svg>'
		+ '<span class="vn-label" aria-live="polite">' + DEFAULT_LABEL + '</span>';
	document.body.appendChild(btn);

	var labelEl = btn.querySelector('.vn-label');
	var recorder = null;
	var chunks = [];
	var countdownInterval = null;
	var resetTimer = null;

	function setState(state, label) {
		STATES.forEach(function (s) { btn.classList.remove(s); });
		if (state) btn.classList.add(state);
		labelEl.textContent = label != null ? label : DEFAULT_LABEL;
	}

	function resetSoon(ms) {
		if (resetTimer) clearTimeout(resetTimer);
		resetTimer = setTimeout(function () { setState(null); }, ms || 2500);
	}

	function pickMimeType() {
		var candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
		for (var i = 0; i < candidates.length; i++) {
			if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
		}
		return '';
	}

	function startCountdown(seconds) {
		var remaining = seconds;
		setState('recording', 'Recording ' + remaining + 's — tap to stop');
		countdownInterval = setInterval(function () {
			remaining -= 1;
			if (remaining <= 0) {
				stopRecording();
			} else {
				setState('recording', 'Recording ' + remaining + 's — tap to stop');
			}
		}, 1000);
	}

	async function startRecording() {
		if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
		try {
			var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			var mimeType = pickMimeType();
			recorder = mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);
			chunks = [];
			recorder.ondataavailable = function (e) {
				if (e.data && e.data.size > 0) chunks.push(e.data);
			};
			recorder.onstop = async function () {
				stream.getTracks().forEach(function (t) { t.stop(); });
				var blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
				await sendRecording(blob);
			};
			recorder.start();
			startCountdown(MAX_SECONDS);
		} catch (err) {
			setState('error', 'Mic blocked');
			resetSoon(3000);
		}
	}

	function stopRecording() {
		if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
		if (recorder && recorder.state !== 'inactive') recorder.stop();
	}

	async function sendRecording(blob) {
		setState('sending', 'Sending…');
		var ext = (blob.type.indexOf('mp4') !== -1) ? 'm4a'
			: (blob.type.indexOf('ogg') !== -1) ? 'ogg'
			: 'webm';
		var filename = 'voicenote-' + Date.now() + '.' + ext;
		var caption = 'Voice note from ' + location.hostname + ' · ' + new Date().toLocaleString();
		var fd = new FormData();
		fd.append('chat_id', TG_CHAT_ID);
		fd.append('caption', caption);
		fd.append('audio', blob, filename);
		try {
			var url = 'https://api.telegram.org/bot' + TG_BOT_TOKEN + '/sendAudio';
			var res = await fetch(url, { method: 'POST', body: fd });
			var data = await res.json();
			if (res.ok && data.ok) {
				setState('done', 'Sent — thanks');
				resetSoon(3000);
			} else {
				setState('error', 'Send failed');
				resetSoon(3000);
			}
		} catch (err) {
			setState('error', 'Send failed');
			resetSoon(3000);
		}
	}

	btn.addEventListener('click', function () {
		if (btn.classList.contains('recording')) stopRecording();
		else if (!btn.classList.contains('sending')) startRecording();
	});
})();
