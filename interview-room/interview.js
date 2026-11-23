(() => {
  const $ = (selector) => document.querySelector(selector);
  const config = window.INTERVIEW_ROOM_CONFIG || {};
  const AUTH_KEY = "meridian-interview-room-auth-v1";
  const speechApi = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let peer = null;
  let eventChannel = null;
  let microphone = null;
  let realtimeTranscriptItems = new Set();
  let session = null;
  let mode = "guided";
  let timer = null;
  let startedAt = 0;
  let lastQuestion = "";
  let fallbackFollowups = 0;

  const maxAnswers = (duration) => ({ 10: 6, 15: 9, 20: 12 }[Number(duration)] || 9);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  const guidedOpening = {
    full: "Hello, trainee11. I’m glad you could join me. We’ll talk about the Meridian practice application and broader AI data annotation work. I’ll ask one question at a time and may ask you to explain your reasoning. To begin, could you briefly introduce yourself and tell me what you understand about the PT-100 assignment?",
    application: "Hello, trainee11. Let’s begin with the application. Imagine you have opened a cosmetic product in the PT-100 label-review queue. What would you inspect before choosing a category?",
    annotation: "Hello, trainee11. I’d like to start with the fundamentals. In your own words, what is AI data annotation, and why does the quality of labeled examples matter to a machine-learning system?",
    scenario: "Hello, trainee11. Here’s a practical situation. A cosmetic product image and its catalog directions appear to describe different uses, and the model has suggested a category. What would you do first, and why?",
  };
  const guidedQuestions = {
    full: [
      "How do you decide whether a model-proposed product category is supported by evidence?",
      "What would make you change a label or escalate the item instead of guessing?",
      "How would you explain the difference between an annotation decision and a model prediction?",
      "What makes a ticket useful to the next person who investigates it?",
      "Why should a ticket's resolution and its closure be separate steps?",
      "How do consistency and clear labeling guidelines improve an annotated dataset?",
      "Walk me through how you would inspect a failing checkout test in the training lab.",
      "How do you keep a steady pace without skipping evidence review?",
      "How would you communicate an unresolved blocker to your team?",
      "What would you include in a handoff at the end of your shift?",
      "What is one limitation of this training application you would explain to a reviewer?",
      "What would you like to improve in your next annotation assignment?",
    ],
    application: [
      "Which product details help you establish the primary use of a cosmetic item?",
      "How do you choose between confirming, changing, or escalating a taxonomy proposal?",
      "What should a useful evidence rationale contain?",
      "What do the PT-100 progress counts mean, and why do skips remain incomplete?",
      "What fields make a newly created workflow ticket actionable?",
      "How do business impact and ticket priority differ?",
      "Why does a reviewer approve a resolution separately from the assignee submitting it?",
      "What does the checkout QA fixture demonstrate, and what does it not prove?",
      "What does the synthetic accuracy score mean in this browser training app?",
      "How would you identify a product image or source-record problem?",
      "What information would you include in a clean final handoff?",
      "Which part of the application workflow would you improve, and how would you measure the change?",
    ],
    annotation: [
      "What is the difference between a label, an annotation guideline, and a model prediction?",
      "How would you handle a case where a guideline does not clearly cover the example?",
      "What is inter-annotator agreement, and what can disagreement reveal?",
      "How can unclear guidelines create systematic label noise?",
      "Why should an annotator record the evidence behind an exception?",
      "What checks help prevent accidental or inconsistent labels in a large batch?",
      "How would you think about bias when an annotation task involves people or sensitive attributes?",
      "What should an annotator do if a data item contains personal or sensitive information?",
      "Why might a quality team use gold examples or reviewer sampling?",
      "How do you balance annotation throughput with accuracy and careful review?",
      "What would you do if you noticed the same ambiguous pattern across many examples?",
      "How do you use reviewer feedback without blindly copying earlier decisions?",
    ],
    scenario: [
      "Which sources would you compare first when an image and product description conflict?",
      "You still cannot identify the intended use after review. What action would you take?",
      "Several products show the same mismatch. How would you decide whether to create one ticket or several?",
      "A high-impact issue has no owner and a near due date. What would you do?",
      "A ticket is marked resolved, but the reviewer cannot verify the outcome. What next?",
      "Two annotators chose different labels for a borderline example. How would you resolve it?",
      "You are near a deadline and have two uncertain items. How do you proceed?",
      "A reviewer finds a pattern of errors in your submitted work. How do you respond?",
      "The checkout discount test fails again after a training patch. How would you investigate?",
      "A dataset contains a possible personal identifier. How do you handle it?",
      "What evidence would let a reviewer close an annotation-related ticket?",
      "How would you explain the remaining risk in your handoff?",
    ],
  };

  function setService(kind, text) {
    const el = $("#serviceStatus");
    el.className = `status-pill ${kind || ""}`;
    el.innerHTML = `<i></i>${escapeHtml(text)}`;
  }

  async function getAccessToken() {
    if (!config.supabaseUrl || !config.publishableKey) throw new Error("Interview service settings are missing.");
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { saved = null; }
    const now = Math.floor(Date.now() / 1000);
    if (saved?.access_token && saved.expires_at > now + 45) return saved.access_token;
    if (saved?.refresh_token) {
      const refreshedResponse = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST", headers: { apikey: config.publishableKey, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: saved.refresh_token }),
      });
      if (refreshedResponse.ok) {
        const refreshed = await refreshedResponse.json();
        refreshed.expires_at ||= now + (refreshed.expires_in || 3600);
        localStorage.setItem(AUTH_KEY, JSON.stringify(refreshed));
        return refreshed.access_token;
      }
    }
    const response = await fetch(`${config.supabaseUrl}/auth/v1/signup`, {
      method: "POST", headers: { apikey: config.publishableKey, "Content-Type": "application/json" }, body: "{}",
    });
    const created = await response.json().catch(() => ({}));
    if (!response.ok || !created.access_token) throw new Error(created.msg || created.message || created.error_description || "Enable anonymous sign-ins in Supabase Auth.");
    created.expires_at ||= now + (created.expires_in || 3600);
    localStorage.setItem(AUTH_KEY, JSON.stringify(created));
    return created.access_token;
  }

  async function askServer(action, extra = {}) {
    const token = await getAccessToken();
    const response = await fetch(`${config.supabaseUrl}/functions/v1/${config.functionName || "mock-interview"}`, {
      method: "POST", headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Interviewer service error (${response.status}).`);
    return data;
  }

  async function serviceStatus() {
    setService("", "Checking");
    try {
      const data = await askServer("status");
      if (data.realtimeReady) setService("ready", "Live AI voice ready");
      else setService("guided", "Guided practice available");
    } catch (error) {
      setService("guided", "Guided practice available");
      $("#serviceStatus").title = error.message;
    }
  }

  function setVoiceState(state, label) {
    $("#voiceMark").className = `voice-mark ${state || ""}`;
    $("#speakerStatus").textContent = label;
  }

  function speak(text) {
    lastQuestion = text;
    if (!window.speechSynthesis) { setVoiceState("", "Read the interviewer’s question on screen."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.96;
    const voice = window.speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith("en-us")) || window.speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith("en"));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setVoiceState("active", "Interviewer speaking");
    utterance.onend = () => setVoiceState("", "Your turn. Speak or type your answer.");
    utterance.onerror = () => setVoiceState("", "The question is ready on screen.");
    window.speechSynthesis.speak(utterance);
  }

  function appendMessage(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `message ${role === "assistant" ? "interviewer" : "candidate"}`;
    const tag = document.createElement("small");
    tag.textContent = role === "assistant" ? "Meridian interviewer" : "trainee11";
    bubble.append(tag, document.createTextNode(String(text)));
    $("#conversation").append(bubble);
    $("#conversation").scrollTop = $("#conversation").scrollHeight;
    session.transcript.push({ role, text: String(text) });
    if (role === "assistant") { lastQuestion = text; $("#repeatButton").disabled = false; if (mode !== "realtime") speak(text); }
  }

  function setControls(active) {
    $("#focusSelect").disabled = active;
    $("#durationSelect").disabled = active;
    $("#levelSelect").disabled = active;
    $("#startButton").disabled = active;
    $("#answerInput").disabled = !active;
    $("#sendButton").disabled = !active;
    $("#speakButton").disabled = !active || !(mode === "realtime" ? Boolean(microphone) : Boolean(speechApi));
    $("#endButton").disabled = !active;
  }

  function updateProgress() {
    const total = session.maxAnswers;
    const current = session.answerCount;
    $("#questionCount").textContent = `${Math.min(current + 1, total)} of up to ${total}`;
    $("#progressLabel").textContent = current ? "Interview in progress" : "First question";
    $("#progressBar").style.width = `${Math.min(100, current / total * 100)}%`;
  }

  function startClock() {
    clearInterval(timer);
    timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      $("#timer").textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
      if (elapsed === session.duration * 60) setVoiceState("", "Planned interview time reached. Wrap up when ready.");
    }, 1000);
  }

  function localFollowup(answer) {
    const lower = answer.toLowerCase();
    let acknowledgement = "Thank you. I follow what you’re saying.";
    if (/guideline|consistent|agreement|review/.test(lower)) acknowledgement = "You’ve brought in the quality-review perspective.";
    else if (/label|direction|evidence|product|category/.test(lower)) acknowledgement = "That connects your decision to the product evidence.";
    else if (/ticket|owner|impact|priority|handoff/.test(lower)) acknowledgement = "You’ve considered how the work moves to the next owner.";
    else if (/bias|private|personal|sensitive/.test(lower)) acknowledgement = "You’ve raised an important data-handling consideration.";
    else if (/test|qa|checkout|assertion/.test(lower)) acknowledgement = "You’ve connected your answer to verification.";
    if (answer.trim().split(/\s+/).length < 18 && fallbackFollowups < 2) {
      fallbackFollowups += 1;
      return `${acknowledgement} Could you give me a specific example and explain how you reached that decision?`;
    }
    fallbackFollowups = 0;
    const questions = guidedQuestions[session.focus] || guidedQuestions.full;
    return `${acknowledgement} ${questions[(session.answerCount - 1) % questions.length]}`;
  }

  function showAssessment(data, guided = false) {
    const host = $("#assessment");
    if (guided) {
      host.innerHTML = `<h2>Practice debrief</h2><p>This was guided practice because the AI service is not connected. No interview score was generated. Review your answers for specific evidence, clear reasoning, consistent use of guidelines, and a useful next step.</p><div class="rubric-grid"><div class="rubric"><b>Reflect on</b><p>Annotation fundamentals, evidence-based decisions, quality review, bias and privacy awareness, ticket ownership, QA, and communication.</p></div><div class="rubric"><b>Next practice</b><p>Repeat after live AI is configured to receive a conversational follow-up and a detailed rubric assessment.</p></div></div>`;
    } else {
      const categories = Array.isArray(data?.rubric) ? data.rubric : [];
      host.innerHTML = `<h2>Interview debrief</h2><div class="assessment-score">${escapeHtml(data?.overallScore ?? "—")}%</div><p>${escapeHtml(data?.summary || "Use the transcript to review your responses with a supervisor.")}</p><div class="rubric-grid">${categories.map((item) => `<div class="rubric"><b><span>${escapeHtml(item.category)}</span><span>${escapeHtml(item.score)}%</span></b><p>${escapeHtml(item.evidence)}</p></div>`).join("")}</div><div class="rubric-grid"><div><b>Strengths</b><ul>${(data?.strengths || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div><div><b>Practice next</b><ul>${(data?.development || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div></div>`;
    }
    const download = document.createElement("button");
    download.className = "secondary-button";
    download.textContent = "Save interview transcript";
    download.addEventListener("click", downloadTranscript);
    const again = document.createElement("button");
    again.className = "secondary-button";
    again.textContent = "Start another interview";
    again.addEventListener("click", resetInterview);
    const actions = document.createElement("div");
    actions.className = "report-actions";
    actions.append(download, again);
    host.append(actions);
    host.hidden = false;
    session.assessment = guided ? null : data;
  }

  function saveSession(score = null) {
    const header = ["MERIDIAN INTERVIEW ROOM", `Trainee: trainee11`, `Date: ${new Date().toLocaleString()}`, `Mode: ${mode === "realtime" ? "Live OpenAI voice interviewer" : mode === "ai" ? "Text AI interviewer" : "Guided practice"}`, `Focus: ${$("#focusSelect").selectedOptions[0].textContent}`, score === null ? "Assessment: guided practice; no score" : `Assessment: ${score}%`, ""];
    const rows = session.transcript.map((turn) => `${turn.role === "assistant" ? "INTERVIEWER" : "TRAINEE11"}: ${turn.text}`);
    const file = new Blob([[...header, ...rows].join("\n")], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = "trainee11-interview-transcript.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  function downloadTranscript() { saveSession(session?.assessment?.overallScore ?? null); }

  function complete(assessment = null) {
    if (!session?.active) return;
    session.active = false;
    clearInterval(timer);
    if (recognition) { try { recognition.stop(); } catch { /* Listener may already be stopped. */ } }
    closeRealtime();
    setControls(false);
    $("#modeLabel").textContent = mode === "ai" ? "· AI SESSION COMPLETE" : "· GUIDED PRACTICE COMPLETE";
    $("#sessionTitle").textContent = "Thank you for your time.";
    $("#progressLabel").textContent = "Session complete";
    $("#progressBar").style.width = "100%";
    showAssessment(assessment, !assessment);
    setVoiceState("", "Interview finished. Review your debrief below.");
  }

  async function begin() {
    session = { active: true, duration: Number($("#durationSelect").value), maxAnswers: maxAnswers($("#durationSelect").value), answerCount: 0, focus: $("#focusSelect").value, level: $("#levelSelect").value, transcript: [], assessment: null };
    fallbackFollowups = 0;
    mode = "ai";
    $("#setupScreen").hidden = true;
    $("#interviewScreen").hidden = false;
    $("#assessment").hidden = true;
    $("#assessment").innerHTML = "";
    $("#conversation").innerHTML = "";
    $("#timer").textContent = "00:00";
    $("#sessionTitle").textContent = "Let’s begin.";
    $("#modeLabel").textContent = "· CONNECTING";
    startedAt = Date.now();
    startClock();
    setControls(true);
    updateProgress();
    try {
      mode = "realtime";
      await connectRealtime();
      $("#modeLabel").textContent = "· LIVE AI VOICE INTERVIEW";
      $("#speechNote").textContent = "Live English conversation · transcript appears as you speak";
      $("#speakButton").textContent = "Mute microphone";
      setVoiceState("active", "Live AI interviewer connected. It is your turn to speak.");
    } catch (error) {
      closeRealtime();
      mode = "ai";
      $("#modeLabel").textContent = "· TEXT AI + VOICE FALLBACK";
      setService("guided", "Live voice unavailable · typed AI available");
      $("#speechNote").textContent = error.message || "Live voice unavailable. Use the typed answer option.";
      try {
        const result = await askServer("start", { track: session.focus, level: session.level, duration: session.duration, answerCount: 0, transcript: [] });
        appendMessage("assistant", result.speech);
      } catch {
        mode = "guided";
        $("#modeLabel").textContent = "· GUIDED PRACTICE";
        setService("guided", "Guided practice");
        appendMessage("assistant", guidedOpening[session.focus] || guidedOpening.full);
      }
    }
    setControls(true);
    $("#answerInput").focus();
  }

  async function connectRealtime() {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error("Live voice needs a supported browser and microphone permission. You can continue by typing.");
    microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const token = await askServer("realtime", { track: session.focus, level: session.level, duration: session.duration });
    peer = new RTCPeerConnection();
    peer.ontrack = (event) => {
      let audio = $("#remoteAudio");
      if (!audio) { audio = document.createElement("audio"); audio.id = "remoteAudio"; audio.autoplay = true; audio.playsInline = true; document.body.append(audio); }
      audio.srcObject = event.streams[0];
      audio.play().catch(() => setVoiceState("", "Allow audio playback in your browser to hear the interviewer."));
    };
    peer.onconnectionstatechange = () => {
      if (peer?.connectionState === "failed" || peer?.connectionState === "disconnected") setVoiceState("", "Live voice connection interrupted. You can continue by typing.");
    };
    microphone.getTracks().forEach((track) => peer.addTrack(track, microphone));
    eventChannel = peer.createDataChannel("oai-events");
    eventChannel.onmessage = (message) => handleRealtimeEvent(JSON.parse(message.data));
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const response = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(token.model || "gpt-realtime-2.1")}`, {
      method: "POST", headers: { Authorization: `Bearer ${token.clientSecret || token.client_secret?.value}`, "Content-Type": "application/sdp" }, body: offer.sdp,
    });
    if (!response.ok) throw new Error("OpenAI could not establish the live session. Check Realtime model access or use typed answers.");
    await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
    await new Promise((resolve, reject) => {
      if (eventChannel.readyState === "open") { resolve(); return; }
      const timeout = setTimeout(() => reject(new Error("The live interviewer took too long to connect. You can continue by typing.")), 12000);
      eventChannel.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
    eventChannel.send(JSON.stringify({ type: "response.create" }));
  }

  function handleRealtimeEvent(event) {
    if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript?.trim()) {
      if (realtimeTranscriptItems.has(event.item_id)) return;
      realtimeTranscriptItems.add(event.item_id);
      appendMessage("user", event.transcript.trim());
      session.answerCount += 1;
      updateProgress();
      setVoiceState("", "Answer received. The interviewer is responding…");
    } else if (event.type === "response.output_audio_transcript.done" && event.transcript?.trim()) {
      appendMessage("assistant", event.transcript.trim());
      setVoiceState("active", "Interviewer speaking. You can answer when it finishes.");
    } else if (event.type === "response.done") {
      if (session?.active) setVoiceState("", "Your turn. Speak naturally or type an answer.");
    } else if (event.type === "error") {
      setVoiceState("", "Live voice had a problem. Continue by typing or finish the interview.");
    }
  }

  function closeRealtime() {
    if (eventChannel) { try { eventChannel.close(); } catch { /* Already closed. */ } }
    eventChannel = null;
    if (peer) { try { peer.close(); } catch { /* Already closed. */ } }
    peer = null;
    if (microphone) microphone.getTracks().forEach((track) => track.stop());
    microphone = null;
  }

  async function sendAnswer() {
    if (!session?.active) return;
    const answer = $("#answerInput").value.trim();
    if (!answer) { setVoiceState("", "Speak or type an answer before sending."); return; }
    $("#answerInput").value = "";
    appendMessage("user", answer);
    session.answerCount += 1;
    updateProgress();
    if (mode === "realtime") {
      if (!eventChannel || eventChannel.readyState !== "open") { setVoiceState("", "Live connection is not ready. Try again or finish the interview."); return; }
      eventChannel.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: answer }] } }));
      eventChannel.send(JSON.stringify({ type: "response.create" }));
      $("#answerInput").value = "";
      setVoiceState("", "Interviewer is considering your answer…");
      return;
    }
    $("#sendButton").disabled = true;
    $("#speakButton").disabled = true;
    $("#endButton").disabled = true;
    setVoiceState("", "Interviewer is considering your answer…");
    try {
      const result = mode === "ai"
        ? await askServer("turn", { track: session.focus, level: session.level, duration: session.duration, answerCount: session.answerCount, lastAnswer: answer, transcript: session.transcript })
        : { speech: localFollowup(answer), ended: session.answerCount >= session.maxAnswers, assessment: null };
      if (result.ended) {
        appendMessage("assistant", result.speech || "Thank you. That concludes the interview.");
        complete(result.assessment || null);
      } else appendMessage("assistant", result.speech);
    } catch {
      mode = "guided";
      $("#modeLabel").textContent = "· GUIDED VOICE PRACTICE";
      setService("guided", "Guided practice");
      const text = localFollowup(answer);
      if (session.answerCount >= session.maxAnswers) { appendMessage("assistant", text); complete(null); }
      else appendMessage("assistant", text);
    } finally {
      if (session?.active) { $("#sendButton").disabled = false; $("#speakButton").disabled = !speechApi; $("#endButton").disabled = false; }
    }
  }

  async function finishEarly() {
    if (!session?.active) return;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    $("#endButton").disabled = true;
    setVoiceState("", "Preparing your assessment…");
    closeRealtime();
    if ((mode === "ai" || mode === "realtime") && session.answerCount) {
      try {
        const result = await askServer("finish", { track: session.focus, level: session.level, duration: session.duration, answerCount: session.answerCount, transcript: session.transcript });
        if (result.speech) appendMessage("assistant", result.speech);
        complete(result.assessment || null);
        return;
      } catch { mode = "guided"; }
    }
    complete(null);
  }

  function setUpVoice() {
    if (!speechApi) {
      $("#speakButton").hidden = true;
      $("#speechNote").textContent = "Voice recognition is not supported here. Type your answer instead.";
      return;
    }
    recognition = new speechApi();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => { $("#speakButton").textContent = "Listening… stop"; setVoiceState("active", "Listening to your answer…"); };
    recognition.onresult = (event) => {
      const finalParts = [];
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const part = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalParts.push(part); else interim += part;
      }
      const field = $("#answerInput");
      const previous = field.dataset.finalSpeech || "";
      if (finalParts.length) field.dataset.finalSpeech = `${previous}${previous ? " " : ""}${finalParts.join(" ")}`.trim();
      const base = field.dataset.finalSpeech || previous;
      field.value = `${base}${interim ? `${base ? " " : ""}${interim}` : ""}`;
    };
    recognition.onerror = (event) => setVoiceState("", event.error === "not-allowed" ? "Microphone access was not granted. Type your answer instead." : "Voice input stopped. Continue by typing.");
    recognition.onend = () => { $("#speakButton").textContent = "◉  Speak"; setVoiceState("", "Your turn. Speak or type your answer."); };
    $("#speechNote").textContent = "English voice input is browser-dependent. Review the transcript before sending.";
  }

  function toggleMic() {
    if (mode === "realtime" && microphone) {
      const nextEnabled = !microphone.getAudioTracks()[0]?.enabled;
      microphone.getAudioTracks().forEach((track) => { track.enabled = nextEnabled; });
      $("#speakButton").textContent = nextEnabled ? "Mute microphone" : "Unmute microphone";
      setVoiceState("", nextEnabled ? "Microphone on. Speak when ready." : "Microphone muted. You can type an answer.");
      return;
    }
    if (!recognition || !session?.active) return;
    $("#answerInput").dataset.finalSpeech = $("#answerInput").value.trim();
    try { recognition.start(); } catch { try { recognition.stop(); } catch { /* Nothing is listening. */ } }
  }

  function repeatQuestion() {
    if (mode === "realtime" && eventChannel?.readyState === "open") {
      eventChannel.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: "Could you please repeat your last interview question?" }] } }));
      eventChannel.send(JSON.stringify({ type: "response.create" }));
      return;
    }
    speak(lastQuestion);
  }

  function resetInterview() {
    if (session?.active) return;
    clearInterval(timer);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    $("#interviewScreen").hidden = true;
    $("#setupScreen").hidden = false;
    $("#answerInput").value = "";
    $("#answerInput").dataset.finalSpeech = "";
    serviceStatus();
  }

  $("#startButton").addEventListener("click", begin);
  $("#sendButton").addEventListener("click", sendAnswer);
  $("#endButton").addEventListener("click", finishEarly);
  $("#speakButton").addEventListener("click", toggleMic);
  $("#repeatButton").addEventListener("click", repeatQuestion);
  $("#downloadButton").addEventListener("click", downloadTranscript);
  $("#answerInput").addEventListener("keydown", (event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) sendAnswer(); });
  setUpVoice();
  setControls(false);
  serviceStatus();
})();
