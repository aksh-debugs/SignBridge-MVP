import { useEffect, useMemo, useRef, useState } from "react";
import GestureInput from "./GestureInput.jsx";
import {
  createRemoteRoom,
  firebaseConfigured,
  joinRemoteRoom,
  listenToRemoteMessages,
  sendRemoteMessage,
} from "./firebaseService.js";
import "./App.css";

const KEYS = {
  preferences: "signbridge.preferences.v2",
  history: "signbridge.history.v2",
  cards: "signbridge.cards.v1",
  bookings: "signbridge.demoBookings.v1",
  emergencyContacts: "signbridge.emergencyContacts.v1",
};

const LANGUAGES = [
  { label: "English", code: "en", speech: "en-IN" },
  { label: "Hindi", code: "hi", speech: "hi-IN" },
  { label: "Telugu", code: "te", speech: "te-IN" },
];

const METHODS = [
  { id: "Type", label: "Type", icon: "⌨️" },
  { id: "Visual", label: "Visual choices", icon: "▦" },
  { id: "Speak", label: "Speak", icon: "🎙" },
  { id: "Gesture shortcuts", label: "Gesture shortcuts", icon: "✋" },
];

const RECEIVE_FORMATS = ["Text", "Visual", "Audio", "Text + Audio"];
const DELIVERY_FORMATS = ["Show text", "Speak aloud", "Text + speech"];

const NAVIGATION = [
  { id: "direct", label: "Conversation", icon: "💬" },
  { id: "send-group", label: "Group conversation", icon: "👥", activeModes: ["send-group", "listen-group"] },
  { id: "remote", label: "Remote conversation", icon: "🌐" },
  { id: "history", label: "My records", icon: "🗂", activeModes: ["history", "cards"] },
  { id: "quick", label: "Quick & emergency", icon: "⚡" },
  { id: "gesture", label: "More support", icon: "🤝", activeModes: ["gesture", "interpreter"] },
  { id: "future", label: "Future scope", icon: "🚀" },
];

const PHRASE_GROUPS = {
  Daily: [
    "Please speak slowly.",
    "Please type your message.",
    "Could you repeat that?",
    "I do not understand.",
    "Please wait a moment.",
    "Thank you.",
  ],
  Medical: [
    "I need medical assistance.",
    "I need water.",
    "I need help explaining my symptoms.",
    "Please write the instructions down.",
    "I need an interpreter.",
  ],
  Emergency: [
    "I need help.",
    "Call emergency services.",
    "I feel unsafe.",
    "I cannot hear you.",
    "I cannot speak.",
    "Please wait.",
  ],
  Travel: [
    "Where is the bus stop?",
    "Please show me the direction.",
    "I need help finding this address.",
    "Please write the destination.",
  ],
  Shopping: [
    "How much does this cost?",
    "I would like to pay by UPI.",
    "Please show me the total amount.",
    "I need a receipt.",
  ],
};

const QUICK_VISUALS = [
  ["🆘", "I need help."],
  ["💧", "I need water."],
  ["💊", "I need medicine."],
  ["🏥", "I need medical assistance."],
  ["⏳", "Please wait a moment."],
  ["✍️", "Please write it down."],
  ["❓", "Could you repeat that?"],
  ["🙏", "Thank you."],
];

const MODE_CONTENT = {
  direct: ["Conversation", "One adaptable conversation, with your preferences remembered."],
  "send-group": ["Speak to a group", "Prepare one clear message for the people around you."],
  "listen-group": ["Listen to a group", "Follow speech through captions where your browser supports it."],
  remote: ["Remote conversation", "Exchange messages with someone in another location."],
  history: ["Conversation history", "Find, reopen, export or delete conversations you chose to save."],
  cards: ["Conversation Cards", "Save the details and next steps that you personally confirm."],
  quick: ["Quick & emergency", "Prepare common phrases in fewer steps, even when translation is offline."],
  gesture: ["Gesture input", "Use a small set of camera-recognised hand gestures as phrase shortcuts."],
  interpreter: ["Interpreter support", "Review a reference-price scenario and try a simulated booking checkout."],
  future: ["Future scope", "What SignBridge could add after this MVP."],
};

const DEFAULT_PREFERENCES = {
  setupComplete: false,
  preferredLanguage: "English",
  partnerLanguage: "English",
  receiveAs: "Text",
  replyMethod: "Visual",
  deliverAs: "Show text",
  translationConsent: false,
  displayName: "You",
};

function readJSON(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function languageInfo(label) {
  return LANGUAGES.find((language) => language.label === label) || LANGUAGES[0];
}

function localDateString(date = new Date()) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
}

function visualCue(text = "") {
  const value = String(text).toLowerCase();
  const cues = [
    [/\b(help|emergency|unsafe)\b/, "🆘"],
    [/\b(water|drink|thirsty)\b/, "💧"],
    [/\b(medicine|tablet|pill|medication)\b/, "💊"],
    [/\b(hospital|doctor|medical|clinic|pain)\b/, "🏥"],
    [/\b(wait|moment|minute)\b/, "⏳"],
    [/\b(write|type|text|repeat|clarify)\b/, "✍️"],
    [/\b(yes|agree|correct)\b/, "✅"],
    [/\b(no|not|disagree)\b/, "❌"],
    [/\b(thank|thanks)\b/, "🙏"],
    [/\b(bus|train|travel|address|direction)\b/, "🧭"],
    [/\b(money|cost|price|pay|upi|receipt)\b/, "💳"],
  ];
  return cues.find(([pattern]) => pattern.test(value))?.[1] || "💬";
}

function priceForTime(time, durationMinutes) {
  const isAfterSix = String(time).slice(0, 5) >= "18:00";
  const hourlyRatePerInterpreter = isAfterSix ? 1500 : 1000;
  // This demo only offers the tariff's listed 1-hour and 2-hour online durations.
  // Both exceed 30 minutes, so the published tariff calls for two interpreters.
  const interpreterCount = 2;
  const billableHours = Math.max(1, Math.ceil(durationMinutes / 60));
  const interpreterFee = hourlyRatePerInterpreter * interpreterCount * billableHours;
  const bookingChargePerInterpreter = 500;
  const bookingCharge = bookingChargePerInterpreter * interpreterCount;
  return {
    hourlyRatePerInterpreter, interpreterCount, billableHours,
    interpreterFee, bookingChargePerInterpreter, bookingCharge,
    total: interpreterFee + bookingCharge, isAfterSix,
  };
}

function Onboarding({ initial, onSave, isSettings = false, onCancel }) {
  const [draft, setDraft] = useState({ ...DEFAULT_PREFERENCES, ...initial });

  function update(field, value) {
    setDraft((previous) => ({ ...previous, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSave({ ...draft, setupComplete: true });
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="brand setup-brand">
          <div className="brand-mark">S</div>
          <div>
            <h1>SignBridge</h1>
            <p>Communication without barriers</p>
          </div>
        </div>
        <p className="eyebrow">SET UP ONCE · CHANGE ANYTIME</p>
        <h2>{isSettings ? "Your communication settings" : "Let's make SignBridge work for you."}</h2>
        <p className="setup-copy">
          Choose your defaults once. SignBridge remembers them in this browser and adapts the interface. You can change them later without repeating this setup.
        </p>
        <form className="setup-form" onSubmit={submit}>
          <div className="setup-grid">
            <label className="field">
              <span>Language you prefer to understand</span>
              <select value={draft.preferredLanguage} onChange={(event) => update("preferredLanguage", event.target.value)}>
                {LANGUAGES.map((language) => <option key={language.code}>{language.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Default language used by the other person</span>
              <select value={draft.partnerLanguage} onChange={(event) => update("partnerLanguage", event.target.value)}>
                {LANGUAGES.map((language) => <option key={language.code}>{language.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>How you prefer to receive messages</span>
              <select value={draft.receiveAs} onChange={(event) => update("receiveAs", event.target.value)}>
                {RECEIVE_FORMATS.map((format) => <option key={format}>{format}</option>)}
              </select>
            </label>
            <label className="field">
              <span>How you prefer to reply</span>
              <select value={draft.replyMethod} onChange={(event) => update("replyMethod", event.target.value)}>
                {METHODS.map((method) => <option key={method.id} value={method.id}>{method.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>How should your reply reach the other person?</span>
              <select value={draft.deliverAs || "Show text"} onChange={(event) => update("deliverAs", event.target.value)}>
                {DELIVERY_FORMATS.map((format) => <option key={format}>{format}</option>)}
              </select>
            </label>
            <label className="field field-full">
              <span>Name shown in shared remote sessions (optional)</span>
              <input maxLength={40} value={draft.displayName} onChange={(event) => update("displayName", event.target.value)} placeholder="You" />
            </label>
          </div>
          <label className="consent-option">
            <input type="checkbox" checked={draft.translationConsent} onChange={(event) => update("translationConsent", event.target.checked)} />
            <span>
              Allow optional online translation when I explicitly press Translate. The selected text is sent to MyMemory, a third-party translation service. I will not use it for sensitive medical, legal or private details.
            </span>
          </label>
          <div className="setup-actions">
            {isSettings && <button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button>}
            <button type="submit" className="button button-primary">{isSettings ? "Save preferences" : "Save and continue"}</button>
          </div>
        </form>
        <p className="small muted">Preferences are saved on this device only for now. They are not synced across devices.</p>
      </div>
    </div>
  );
}

function App() {
  const [preferences, setPreferences] = useState(() => ({ ...DEFAULT_PREFERENCES, ...readJSON(KEYS.preferences, {}) }));
  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).has("room") ? "remote" : "direct");
  const [activeReplyMethod, setActiveReplyMethod] = useState(() => readJSON(KEYS.preferences, DEFAULT_PREFERENCES).replyMethod || "Visual");
  const [activeDeliveryFormat, setActiveDeliveryFormat] = useState(() => readJSON(KEYS.preferences, DEFAULT_PREFERENCES).deliverAs || "Show text");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [draftTranslation, setDraftTranslation] = useState(null);
  const [history, setHistory] = useState(() => readJSON(KEYS.history, []));
  const [cards, setCards] = useState(() => readJSON(KEYS.cards, []));
  const [bookings, setBookings] = useState(() => readJSON(KEYS.bookings, []));
  const [emergencyContacts, setEmergencyContacts] = useState(() => readJSON(KEYS.emergencyContacts, []));
  const [contactDraft, setContactDraft] = useState({ name: "", phone: "" });
  const [emergencyLocation, setEmergencyLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("Location has not been requested.");
  const [locationBusy, setLocationBusy] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [notice, setNotice] = useState("Your saved communication preferences are used by default.");
  const [listening, setListening] = useState(false);
  const [interimCaption, setInterimCaption] = useState("");
  const [speakerLabel, setSpeakerLabel] = useState("Speaker A");
  const processedRemoteMessagesRef = useRef(new Map());
  const [largeDisplay, setLargeDisplay] = useState(false);
  const [phraseCategory, setPhraseCategory] = useState("Daily");
  const [islDraftText, setIslDraftText] = useState("");
  const [cardDraft, setCardDraft] = useState({ title: "", request: "", information: "", clarification: "", nextAction: "" });
  const [remoteRoom, setRemoteRoom] = useState(() => ({
    roomId: new URLSearchParams(window.location.search).get("room") || "",
    uid: "",
    expiresAt: 0,
    error: "",
    working: false,
    messages: [],
    messagesLoaded: false,
  }));
  const [remoteDraft, setRemoteDraft] = useState("");
  const [interpreterForm, setInterpreterForm] = useState({ date: localDateString(new Date(Date.now() + 86400000)), time: "17:00", durationMinutes: 60, acknowledge: false });
  const [checkoutBookingId, setCheckoutBookingId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("UPI (demo)");
  const [checkoutStatus, setCheckoutStatus] = useState("");

  const recognitionRef = useRef(null);
  const remoteUnsubscribeRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(KEYS.preferences, JSON.stringify(preferences)); } catch { setNotice("Could not save preferences in this browser."); }
  }, [preferences]);
  useEffect(() => {
    try { localStorage.setItem(KEYS.history, JSON.stringify(history)); } catch { setNotice("History storage is full or unavailable."); }
  }, [history]);
  useEffect(() => {
    try { localStorage.setItem(KEYS.cards, JSON.stringify(cards)); } catch { setNotice("Conversation cards could not be saved."); }
  }, [cards]);
  useEffect(() => {
    try { localStorage.setItem(KEYS.bookings, JSON.stringify(bookings)); } catch { setNotice("Demo booking history could not be saved."); }
  }, [bookings]);
  useEffect(() => {
    try { localStorage.setItem(KEYS.emergencyContacts, JSON.stringify(emergencyContacts)); }
    catch { setNotice("Emergency contacts could not be saved in this browser."); }
  }, [emergencyContacts]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) {
      setMode("remote");
      setRemoteRoom((previous) => ({ ...previous, roomId: room }));
    }
  }, []);

  useEffect(() => {
    return () => {
      try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
      remoteUnsubscribeRef.current?.();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (mode !== "remote" || !remoteRoom.roomId || remoteRoom.uid || !firebaseConfigured) return undefined;
    let cancelled = false;
    setRemoteRoom((previous) => ({ ...previous, working: true, error: "" }));
    joinRemoteRoom(remoteRoom.roomId)
      .then((result) => {
        if (cancelled) return;
        setRemoteRoom((previous) => ({ ...previous, ...result, working: false, error: "", messagesLoaded: false }));
      })
      .catch((error) => {
        if (cancelled) return;
        setRemoteRoom((previous) => ({ ...previous, working: false, error: error.message || "Could not join this session." }));
      });
    return () => { cancelled = true; };
  }, [mode, remoteRoom.roomId, remoteRoom.uid]);

  useEffect(() => {
    if (mode !== "remote" || !remoteRoom.roomId || !remoteRoom.uid) return undefined;
    remoteUnsubscribeRef.current?.();
    remoteUnsubscribeRef.current = listenToRemoteMessages(
      remoteRoom.roomId,
      (remoteMessages) => setRemoteRoom((previous) => ({ ...previous, messages: remoteMessages, messagesLoaded: true, error: "" })),
      (error) => setRemoteRoom((previous) => ({ ...previous, error: error.message || "Lost access to the remote session." })),
    );
    return () => {
      remoteUnsubscribeRef.current?.();
      remoteUnsubscribeRef.current = null;
    };
  }, [mode, remoteRoom.roomId, remoteRoom.uid]);

  // For remote conversations only, read newly received messages when Audio is a saved preference.
  // Existing messages are marked as seen on first load so opening a room does not speak its entire history.
  useEffect(() => {
    if (mode !== "remote" || !remoteRoom.roomId || !remoteRoom.uid || !remoteRoom.messagesLoaded) return;
    const seenByRoom = processedRemoteMessagesRef.current;
    const existing = seenByRoom.get(remoteRoom.roomId);
    if (!existing) {
      seenByRoom.set(remoteRoom.roomId, new Set(remoteRoom.messages.map((item) => item.id)));
      return;
    }
    const unseen = remoteRoom.messages.filter((item) => !existing.has(item.id));
    unseen.forEach((item) => existing.add(item.id));
    if (!preferences.receiveAs.includes("Audio")) return;
    const incoming = unseen.filter((item) => item.senderUid !== remoteRoom.uid);
    incoming.forEach((item, index) => {
      window.setTimeout(() => speak(item.text, preferences.partnerLanguage), index * 700);
    });
  }, [mode, remoteRoom.roomId, remoteRoom.uid, remoteRoom.messagesLoaded, remoteRoom.messages, preferences.receiveAs, preferences.partnerLanguage]);

  const modeTitle = MODE_CONTENT[mode] || MODE_CONTENT.direct;
  const localLang = languageInfo(preferences.preferredLanguage);
  const partnerLang = languageInfo(preferences.partnerLanguage);

  function changeMode(nextMode) {
    if (listening) stopListening();
    window.speechSynthesis?.cancel();
    setMode(nextMode);
    setLargeDisplay(false);
    setNotice("Your saved preferences remain active. Switch methods whenever needed.");
  }

  function savePreferences(nextPreferences) {
    setPreferences({ ...DEFAULT_PREFERENCES, ...nextPreferences, setupComplete: true });
    setActiveReplyMethod(nextPreferences.replyMethod || "Visual");
    setActiveDeliveryFormat(nextPreferences.deliverAs || "Show text");
    setShowSettings(false);
    setNotice("Preferences saved on this device.");
  }

  function speak(text, label) {
    if (!("speechSynthesis" in window)) {
      setNotice("Text-to-speech is not supported by this browser.");
      return;
    }
    if (listening) stopListening();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const chosen = label || preferences.preferredLanguage;
    utterance.lang = languageInfo(chosen).speech;
    utterance.onerror = () => setNotice("Speech playback failed. Please try again or read the text.");
    window.speechSynthesis.speak(utterance);
    setNotice("Playing audio. Voice quality and language availability depend on this device/browser.");
  }

  function startRecognition(purpose) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice("Speech recognition is not supported in this browser. Use typing or visual choices instead.");
      return;
    }
    try { recognitionRef.current?.abort(); } catch { /* previous session may be closed */ }
    const recognition = new SpeechRecognition();
    recognition.lang = (purpose === "incoming" ? partnerLang : localLang).speech;
    recognition.continuous = purpose === "incoming";
    recognition.interimResults = true;
    recognition.onstart = () => {
      setListening(true);
      setNotice(purpose === "incoming" ? "Microphone active. Ask people to speak one at a time." : "Listening for your dictated reply.");
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let partial = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index]?.[0]?.transcript || "";
        if (event.results[index].isFinal) finalText += `${text} `;
        else partial += text;
      }
      setInterimCaption(partial);
      if (finalText.trim()) {
        if (purpose === "incoming") {
          setMessages((previous) => [...previous, {
            id: makeId(), text: finalText.trim(), translation: "", translationLanguage: "",
            sender: speakerLabel, senderType: "incoming", method: "Browser speech recognition",
            language: preferences.partnerLanguage, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          }]);
          setNotice("Caption captured. Review it; speech recognition can be wrong.");
        } else {
          setDraft((previous) => `${previous}${previous ? " " : ""}${finalText.trim()}`);
          setNotice("Dictation added to the draft. Review it before sharing.");
        }
      }
    };
    recognition.onerror = (event) => {
      setListening(false);
      setInterimCaption("");
      const errors = {
        "not-allowed": "Microphone access was denied. Allow it in browser site settings.",
        "no-speech": "No speech detected. Move closer to the speaker and retry.",
        "audio-capture": "No working microphone was detected.",
        network: "The browser speech service reported a network error.",
      };
      setNotice(errors[event.error] || `Speech recognition stopped: ${event.error}. Try again or use another method.`);
    };
    recognition.onend = () => {
      setListening(false);
      setInterimCaption("");
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch {
      recognitionRef.current = null;
      setListening(false);
      setNotice("Could not start the microphone. Stop the old session and retry.");
    }
  }

  function stopListening() {
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    setListening(false);
    setInterimCaption("");
    setNotice("Listening stopped. Review the captured captions.");
  }

  async function translateText(text, sourceLabel, targetLabel) {
    const source = languageInfo(sourceLabel).code;
    const target = languageInfo(targetLabel).code;
    if (source === target) return text;
    if (!preferences.translationConsent) {
      setNotice("Online translation sends the selected text to a third party. Enable translation consent in Settings first.");
      setShowSettings(true);
      return null;
    }
    if (new TextEncoder().encode(text).length > 500) {
      setNotice("This free translation endpoint accepts up to 500 bytes per request. Shorten the message and retry.");
      return null;
    }
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", text);
    url.searchParams.set("langpair", `${source}|${target}`);
    try {
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`Translation service returned HTTP ${response.status}.`);
      const data = await response.json();
      const translated = data?.responseData?.translatedText;
      if (data?.responseStatus !== 200 || !translated) {
        throw new Error(data?.responseDetails || "No translation was returned for this language pair.");
      }
      return translated;
    } catch (error) {
      setNotice(`Translation unavailable: ${error.message || "network error"}. Keep the original text or retry.`);
      return null;
    }
  }

  async function translateDraft() {
    const text = draft.trim();
    if (!text) { setNotice("Write or choose a phrase before translating."); return; }
    setNotice("Requesting translation…");
    const translated = await translateText(text, preferences.preferredLanguage, preferences.partnerLanguage);
    if (translated) {
      setDraftTranslation({ original: text, translated, target: preferences.partnerLanguage });
      setNotice("Translation ready. Review it before displaying or speaking it.");
    }
  }

  async function translateMessage(message) {
    if (!message?.text) return;
    const source = message.senderType === "incoming" ? preferences.partnerLanguage : preferences.preferredLanguage;
    const target = message.senderType === "incoming" ? preferences.preferredLanguage : preferences.partnerLanguage;
    setNotice("Requesting translation…");
    const translated = await translateText(message.text, source, target);
    if (translated) {
      setMessages((previous) => previous.map((item) => item.id === message.id
        ? { ...item, translation: translated, translationLanguage: target }
        : item));
      setNotice("Translation added below the original. Check it before relying on it.");
    }
  }

  function addMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) { setNotice("Enter a message or choose a phrase first."); return; }
    const translation = draftTranslation?.original === text ? draftTranslation.translated : "";
    const translationLanguage = translation ? draftTranslation.target : "";
    const deliveryFormat = activeDeliveryFormat || preferences.deliverAs || "Show text";
    const message = {
      id: makeId(), text, translation, translationLanguage,
      sender: preferences.displayName || "You", senderType: "outgoing", method: activeReplyMethod,
      deliveryFormat, language: preferences.preferredLanguage,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((previous) => [...previous, message]);
    setDraft("");
    setDraftTranslation(null);
    setActiveDeliveryFormat(preferences.deliverAs || "Show text");
    setLargeDisplay(mode === "send-group" && deliveryFormat !== "Speak aloud");
    if (deliveryFormat === "Speak aloud" || deliveryFormat === "Text + speech") {
      // If a reviewed translation exists, speak it in the target language. Otherwise speak the original draft.
      const speechText = translation || text;
      const speechLanguage = translation ? translationLanguage : preferences.preferredLanguage;
      window.setTimeout(() => speak(speechText, speechLanguage), 0);
      if (!translation && preferences.partnerLanguage !== preferences.preferredLanguage) {
        setNotice("Message was added and spoken in your preferred language. Translate and review it first if the other person uses a different language.");
      } else {
        setNotice(deliveryFormat === "Speak aloud" ? "Message added and spoken aloud. The text remains available for review." : "Message added as text and spoken aloud.");
      }
    } else {
      setNotice(mode === "send-group" ? "Message displayed for the group. It remains visible until you change it." : "Message added to the conversation as text.");
    }
  }

  function choosePhrase(text) {
    setDraft(text);
    setDraftTranslation(null);
    if (mode === "quick") changeMode("direct");
    setNotice("Phrase prepared. Review or edit it before displaying it.");
  }

  function saveConversation() {
    if (!messages.length) { setNotice("Add at least one message before saving."); return; }
    const entry = {
      id: makeId(), title: messages[0].text.slice(0, 70) || "Conversation",
      savedAt: new Date().toISOString(), language: preferences.preferredLanguage,
      partnerLanguage: preferences.partnerLanguage, messages,
    };
    setHistory((previous) => [entry, ...previous]);
    setNotice("Conversation saved on this device.");
  }

  function reopenConversation(conversation) {
    setMessages(conversation.messages || []);
    changeMode("direct");
    setNotice("Saved conversation reopened. It remains in local browser storage until deleted.");
  }

  function exportFile(filename, data) {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Export started.");
    } catch { setNotice("Export failed. Try again."); }
  }

  function saveConversationCard(event) {
    event.preventDefault();
    if (!cardDraft.title.trim() || !cardDraft.request.trim()) {
      setNotice("A card needs a title and the user's request.");
      return;
    }
    const card = { ...cardDraft, id: makeId(), createdAt: new Date().toISOString(), userReviewed: true };
    setCards((previous) => [card, ...previous]);
    setCardDraft({ title: "", request: "", information: "", clarification: "", nextAction: "" });
    setNotice("Conversation Card saved. Its details were entered by the user, not inferred by AI.");
  }

  async function createRoom() {
    if (!firebaseConfigured) { setRemoteRoom((previous) => ({ ...previous, error: "Firebase is not configured. Follow README_SIGNBRIDGE_MVP.md to set up the free Spark plan; no billing account is required." })); return; }
    setRemoteRoom((previous) => ({ ...previous, working: true, error: "" }));
    try {
      const result = await createRemoteRoom();
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("room", result.roomId);
      window.history.replaceState({}, "", url);
      setRemoteRoom((previous) => ({ ...previous, ...result, working: false, error: "", messages: [], messagesLoaded: false }));
      setNotice("Remote session created. Share the invite link with the other person.");
    } catch (error) {
      setRemoteRoom((previous) => ({ ...previous, working: false, error: error.message || "Could not create a remote session." }));
    }
  }

  async function joinByCode() {
    const roomId = remoteRoom.roomId.trim();
    if (!roomId) { setRemoteRoom((previous) => ({ ...previous, error: "Enter a room code or open the full invitation link." })); return; }
    setRemoteRoom((previous) => ({ ...previous, working: true, error: "" }));
    try {
      const result = await joinRemoteRoom(roomId);
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("room", roomId);
      window.history.replaceState({}, "", url);
      setRemoteRoom((previous) => ({ ...previous, ...result, working: false, error: "", messagesLoaded: false }));
    } catch (error) {
      setRemoteRoom((previous) => ({ ...previous, working: false, error: error.message || "Could not join session." }));
    }
  }

  async function sendRemote(event) {
    event.preventDefault();
    if (!remoteRoom.roomId || !remoteRoom.uid) { setRemoteRoom((previous) => ({ ...previous, error: "Create or join a session before sending messages." })); return; }
    try {
      await sendRemoteMessage(remoteRoom.roomId, remoteDraft, preferences.displayName || "Guest");
      setRemoteDraft("");
      setRemoteRoom((previous) => ({ ...previous, error: "" }));
    } catch (error) {
      setRemoteRoom((previous) => ({ ...previous, error: error.message || "Message could not be sent." }));
    }
  }

  async function copyRemoteLink() {
    const link = new URL(window.location.href);
    link.search = "";
    link.searchParams.set("room", remoteRoom.roomId);
    try {
      await navigator.clipboard.writeText(link.toString());
      setNotice("Remote invitation link copied.");
    } catch {
      setRemoteRoom((previous) => ({ ...previous, error: "Clipboard access failed. Copy the invitation URL from the address bar manually." }));
    }
  }

  function beginInterpreterCheckout(event) {
    event.preventDefault();
    const selectedDateTime = new Date(`${interpreterForm.date}T${interpreterForm.time}`);
    if (Number.isNaN(selectedDateTime.getTime()) || selectedDateTime <= new Date()) {
      setCheckoutStatus("Choose a future date and time.");
      return;
    }
    const [startHour, startMinute] = String(interpreterForm.time).split(":").map(Number);
    if (startMinute !== 0) {
      setCheckoutStatus("For this reference estimate, choose a start time on the hour (e.g. 17:00). Provider billing may differ.");
      return;
    }
    const startMinuteOfDay = startHour * 60 + startMinute;
    const endMinuteOfDay = startMinuteOfDay + Number(interpreterForm.durationMinutes);
    if (endMinuteOfDay >= 24 * 60) {
      setCheckoutStatus("Choose an earlier start time so the requested demo session finishes before midnight.");
      return;
    }
    if (startMinuteOfDay < 18 * 60 && endMinuteOfDay > 18 * 60) {
      setCheckoutStatus("This sample tariff cannot accurately estimate a session that crosses the 6 PM rate change. Choose a start time where the session stays within one tariff period.");
      return;
    }
    if (!interpreterForm.acknowledge) {
      setCheckoutStatus("Confirm that you understand this is a simulated booking with reference pricing.");
      return;
    }
    const pricing = priceForTime(interpreterForm.time, Number(interpreterForm.durationMinutes));
    const booking = {
      id: makeId(), reference: `SB-DEMO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      date: interpreterForm.date, time: interpreterForm.time, durationMinutes: Number(interpreterForm.durationMinutes),
      pricing, paymentMethod, status: "CHECKOUT_PENDING", createdAt: new Date().toISOString(),
      disclaimer: "Demo only; no interpreter contacted and no payment collected.",
    };
    setBookings((previous) => [booking, ...previous]);
    setCheckoutBookingId(booking.id);
    setCheckoutStatus("Review the sample breakdown, then simulate success or failure. No payment details are requested.");
  }

  function simulatePayment(success) {
    if (!checkoutBookingId) return;
    const target = bookings.find((booking) => booking.id === checkoutBookingId);
    if (!target || target.status === "DEMO_CANCELLED" || target.status === "DEMO_PAYMENT_SUCCESS") {
      setCheckoutStatus("This demo checkout is already completed or cancelled. Start a new demo checkout instead.");
      return;
    }
    setBookings((previous) => previous.map((booking) => booking.id === checkoutBookingId
      ? { ...booking, status: success ? "DEMO_PAYMENT_SUCCESS" : "DEMO_PAYMENT_FAILED", paymentSimulatedAt: new Date().toISOString() }
      : booking));
    setCheckoutStatus(success
      ? "Simulated payment succeeded. This is a demo record only—not a real interpreter booking."
      : "Simulated payment failed. No booking is confirmed and no money was collected.");
  }

  function cancelDemoBooking(id) {
    setBookings((previous) => previous.map((booking) => booking.id === id
      ? { ...booking, status: "DEMO_CANCELLED", cancelledAt: new Date().toISOString() }
      : booking));
    setNotice("Demo booking marked cancelled. No real provider was contacted.");
  }

  function addEmergencyContact(event) {
    event.preventDefault();
    const name = contactDraft.name.trim();
    const phone = contactDraft.phone.trim().replace(/[^+\d]/g, "");
    const digits = phone.replace(/\D/g, "");
    if (!name) { setLocationStatus("Enter a contact name."); return; }
    if (digits.length < 7 || digits.length > 15) { setLocationStatus("Enter a valid phone number (7–15 digits). Include the country code for WhatsApp."); return; }
    if (emergencyContacts.some((contact) => contact.phone.replace(/\D/g, "") === digits)) {
      setLocationStatus("This phone number is already saved.");
      return;
    }
    setEmergencyContacts((previous) => [...previous, { id: makeId(), name, phone, digits, createdAt: new Date().toISOString() }]);
    setContactDraft({ name: "", phone: "" });
    setLocationStatus(`${name} was saved on this device. No notification was sent.`);
  }

  function removeEmergencyContact(id) {
    setEmergencyContacts((previous) => previous.filter((contact) => contact.id !== id));
    setLocationStatus("Emergency contact removed from this device.");
  }

  function requestCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("Location is not supported in this browser. You can still share a message without GPS.");
      return;
    }
    setLocationBusy(true);
    setLocationStatus("Requesting device location permission…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
        };
        setEmergencyLocation(next);
        setLocationBusy(false);
        setLocationStatus(`Location captured with reported accuracy of about ${Math.round(next.accuracy)} metres. It has not been sent to anyone.`);
      },
      (error) => {
        const explanations = {
          1: "Location permission was denied. Allow location access in browser settings, or continue without GPS.",
          2: "The device could not determine its location. Try again outdoors or use a manual message.",
          3: "The location request timed out. Try again.",
        };
        setLocationBusy(false);
        setLocationStatus(explanations[error.code] || "Could not obtain location. You can still call a contact or emergency services.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  function emergencyMessage(contact) {
    const mapUrl = emergencyLocation
      ? `https://maps.google.com/?q=${emergencyLocation.latitude},${emergencyLocation.longitude}`
      : "";
    const time = emergencyLocation ? new Date(emergencyLocation.capturedAt).toLocaleString() : "";
    return [
      `EMERGENCY MESSAGE from SignBridge user ${preferences.displayName || "the user"}.`,
      "I may need help. Please contact me as soon as possible.",
      emergencyLocation
        ? `My device location was captured at ${time} (reported accuracy approximately ${Math.round(emergencyLocation.accuracy)} m): ${mapUrl}`
        : "I could not share a current GPS location in this message.",
      `This message is prepared for ${contact.name}. Please confirm that you received it.`,
    ].join("\n");
  }

  async function copyEmergencyMessage(contact) {
    const message = emergencyMessage(contact);
    try {
      await navigator.clipboard.writeText(message);
      setLocationStatus(`Emergency message copied for ${contact.name}. It has not been sent.`);
    } catch {
      setLocationStatus("Copy failed. Use SMS or WhatsApp draft buttons below; you must press Send in that app.");
    }
  }

  function openSmsDraft(contact) {
    const message = emergencyMessage(contact);
    window.location.href = `sms:${contact.phone}?body=${encodeURIComponent(message)}`;
    setLocationStatus(`An SMS draft was requested for ${contact.name}. Check the messaging app and press Send yourself.`);
  }

  function openWhatsAppDraft(contact) {
    const digits = contact.phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setLocationStatus("WhatsApp needs a valid number including country code. Edit this contact and include the country code.");
      return;
    }
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(emergencyMessage(contact))}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setLocationStatus(`A WhatsApp draft was opened for ${contact.name}. Check the recipient and press Send yourself.`);
  }

  const matchingHistory = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    if (!term) return history;
    return history.filter((item) => item.title?.toLowerCase().includes(term) || item.messages?.some((message) => message.text?.toLowerCase().includes(term) || message.translation?.toLowerCase().includes(term)));
  }, [history, historySearch]);

  const pricing = priceForTime(interpreterForm.time, Number(interpreterForm.durationMinutes));

  if (!preferences.setupComplete) {
    return <Onboarding initial={preferences} onSave={savePreferences} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div><h1>SignBridge</h1><p>Communication without barriers</p></div>
        </div>
        <div className="sidebar-label">YOUR WORKSPACE</div>
        <nav className="navigation" aria-label="Main sections">
          {NAVIGATION.map((item) => {
            const active = item.id === mode || item.activeModes?.includes(mode);
            return <button key={item.id} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => changeMode(item.id)}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
            </button>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-indicator"><span className="status-dot" /><div><strong>Privacy matters</strong><p>Review before sharing</p></div></div>
          <p className="sidebar-footnote">One platform. Different communication needs.</p>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Workspace / {modeTitle[0]}</div>
          <div className="topbar-actions">
            <span className="prototype-tag"><span className="status-dot" />Development preview</span>
            <button className="button button-secondary button-small" onClick={() => setShowSettings(true)}>⚙ Settings</button>
          </div>
        </header>

        <section className="page-content">
          <div className="welcome-row">
            <div><p className="eyebrow">ONE ADAPTIVE PLATFORM</p><h2>{modeTitle[0]}</h2><p className="subtitle">{modeTitle[1]}</p></div>
            <div className="welcome-symbol" aria-hidden="true">↔</div>
          </div>

          {(mode === "send-group" || mode === "listen-group") && <div className="mode-switcher" aria-label="Group communication direction"><button className={`mode-switch ${mode === "send-group" ? "selected" : ""}`} onClick={() => changeMode("send-group")}>🗣️ I want to send to a group</button><button className={`mode-switch ${mode === "listen-group" ? "selected" : ""}`} onClick={() => changeMode("listen-group")}>👂 I want to receive from a group</button></div>}
          {(mode === "history" || mode === "cards") && <div className="mode-switcher" aria-label="My records"><button className={`mode-switch ${mode === "history" ? "selected" : ""}`} onClick={() => changeMode("history")}>🕘 Conversation history</button><button className={`mode-switch ${mode === "cards" ? "selected" : ""}`} onClick={() => changeMode("cards")}>🗂 Conversation Cards</button></div>}
          {(mode === "gesture" || mode === "interpreter" || mode === "future") && <div className="mode-switcher" aria-label="More support"><button className={`mode-switch ${mode === "gesture" ? "selected" : ""}`} onClick={() => changeMode("gesture")}>✋ Gesture shortcuts</button><button className={`mode-switch ${mode === "interpreter" ? "selected" : ""}`} onClick={() => changeMode("interpreter")}>🤝 Interpreter demo</button><button className={`mode-switch ${mode === "future" ? "selected" : ""}`} onClick={() => changeMode("future")}>🚀 Future scope</button></div>}

          {mode === "direct" || mode === "send-group" || mode === "listen-group" ? (
            <>
              <section className="preferences-summary">
                <div><span className="summary-label">UNDERSTAND IN</span><strong>{preferences.preferredLanguage}</strong></div>
                <div><span className="summary-label">RECEIVE AS</span><strong>{preferences.receiveAs}</strong></div>
                <div><span className="summary-label">DEFAULT REPLY</span><strong>{preferences.replyMethod}</strong></div>
                <div><span className="summary-label">SEND AS</span><strong>{preferences.deliverAs || "Show text"}</strong></div>
                <button className="link-button" onClick={() => setShowSettings(true)}>⚙ Settings</button>
              </section>

              <section className="conversation-panel">
                <div className="section-heading conversation-heading">
                  <div>
                    <h3>{mode === "send-group" ? "Message for the group" : mode === "listen-group" ? "Group captions" : "Conversation"}</h3>
                    <p>{mode === "send-group" ? "Prepare and review one message for everyone nearby." : mode === "listen-group" ? "The phone captures nearby speech. Labels are manual; automatic speaker identification is not integrated." : "Use your saved default input method, and switch only when needed."}</p>
                  </div>
                  <span className="small-tag">{messages.length} message{messages.length === 1 ? "" : "s"}</span>
                </div>

                {mode === "listen-group" && (
                  <div className="listen-panel">
                    <div className="notice notice-warning">Browser speech recognition has limited support and may send audio to a browser service. Get consent before capturing group speech. To avoid microphone/speaker feedback, captions are not auto-read aloud while the mic is active; use the message's Listen button after stopping capture.</div>
                    <div className="listen-row">
                      <label className="field speaker-field"><span>Speaker label for this listening turn (manual)</span><select disabled={listening} value={speakerLabel} onChange={(event) => setSpeakerLabel(event.target.value)}><option>Speaker A</option><option>Speaker B</option><option>Speaker C</option><option>Unknown speaker</option></select></label>
                      <button className={`button ${listening ? "button-danger" : "button-primary"}`} onClick={listening ? stopListening : () => startRecognition("incoming")}>{listening ? "Stop listening" : "🎙 Start listening"}</button>
                    </div>
                    {interimCaption && <div className="interim-caption"><strong>Live caption — not final</strong><p>{interimCaption}</p></div>}
                  </div>
                )}

                {messages.length === 0 ? (
                  <div className="empty-state"><span>💬</span><h3>Your conversation starts here</h3><p>Prepare a message or start listening for captions.</p></div>
                ) : (
                  <div className={`message-list ${largeDisplay ? "large-message-list" : ""}`} aria-live="polite">
                    {messages.map((message) => (
                      <article className={`message-bubble ${message.senderType === "incoming" ? "incoming-message" : ""}`} key={message.id}>
                        <div className="message-meta"><span>{message.sender || "Participant"} · {message.method || "Message"}</span><span>{message.time || ""}</span></div>
                        {preferences.receiveAs === "Visual" && message.senderType === "incoming" && <div className="visual-marker" aria-hidden="true">{visualCue(message.text)}</div>}
                        <p className="message-text">{message.text}</p>
                        {message.translation && <div className="translation-box"><span>Translation to {message.translationLanguage} — review before relying on it</span><p>{message.translation}</p><button className="text-button" onClick={() => speak(message.translation, message.translationLanguage)}>🔊 Play translation</button></div>}
                        <div className="message-actions">
                          <button className="text-button" onClick={() => translateMessage(message)}>Translate</button>
                          <button className="text-button" onClick={() => speak(message.translation || message.text, message.translation ? message.translationLanguage : (message.senderType === "incoming" ? preferences.partnerLanguage : preferences.preferredLanguage))}>{preferences.receiveAs.includes("Audio") ? "🔊 Listen" : "🔊 Play aloud"}</button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                <form className="composer" onSubmit={addMessage}>
                  <div className="composer-head"><label className="composer-label" htmlFor="messageDraft">Prepare your reply</label><span className="small-tag">Input: {activeReplyMethod} · Output: {activeDeliveryFormat}</span></div>
                  <div className="method-chips" aria-label="Choose a reply method">
                    {METHODS.map((method) => <button type="button" key={method.id} className={`method-chip ${activeReplyMethod === method.id ? "selected" : ""}`} onClick={() => { setActiveReplyMethod(method.id); setNotice(`${method.label} selected for this reply. Your saved default is unchanged.`); }}>{method.icon} {method.label}</button>)}
                  </div>

                  {activeReplyMethod === "Visual" ? (
                    <div className="visual-builder">
                      <p className="muted small">Choose a visual phrase. You can edit the resulting sentence below.</p>
                      <div className="visual-grid">{QUICK_VISUALS.map(([icon, text]) => <button type="button" className="visual-choice" key={text} onClick={() => setDraft(text)}><span>{icon}</span><strong>{text}</strong></button>)}</div>
                    </div>
                  ) : activeReplyMethod === "Gesture shortcuts" ? (
                    <div className="notice notice-info">Camera gesture input suggests an English phrase for review. It is not full ISL translation. After reviewing the phrase, you can show it as text or use text-to-speech for audio output.
                      <div className="button-row"><button type="button" className="button button-secondary" onClick={() => changeMode("gesture")}>✋ Open gesture input</button></div>
                    </div>
                  ) : activeReplyMethod === "Speak" ? (
                    <div className="dictation-controls"><button type="button" className="button button-secondary" onClick={() => startRecognition("dictation")}>🎙 Dictate reply</button><span className="muted small">Your speech becomes an editable draft, not an automatically sent message.</span></div>
                  ) : null}

                  <details className="delivery-override"><summary>Change output for this reply</summary><label className="field"><span>How should this reply reach the other person?</span><select value={activeDeliveryFormat} onChange={(event) => setActiveDeliveryFormat(event.target.value)}>{DELIVERY_FORMATS.map((format) => <option key={format}>{format}</option>)}</select></label><p className="small muted">This choice applies to the next reply only, then resets to your saved default.</p></details>
                  <label className="composer-label" htmlFor="messageDraft">{activeReplyMethod === "Type" ? "Type your message" : "Review or edit your prepared message"}</label>
                  <textarea id="messageDraft" rows={3} maxLength={2000} value={draft} onChange={(event) => { setDraft(event.target.value); setDraftTranslation(null); }} placeholder={activeReplyMethod === "Type" ? "Type a message…" : "Selected phrases and dictated speech appear here…"} />
                  <div className="composer-actions"><span className="composer-hint">Review the message before displaying or speaking it. {draft.length}/2000</span><button type="submit" className="button button-primary">{mode === "send-group" ? "Confirm & show to group →" : "Confirm & share →"}</button></div>

                  <div className="translation-actions"><button type="button" className="button button-secondary" onClick={translateDraft}>Translate for {preferences.partnerLanguage}</button>{draftTranslation && <div className="translation-preview"><strong>Review translation · {draftTranslation.target}</strong><p>{draftTranslation.translated}</p><div className="button-row"><button type="button" className="button button-secondary" onClick={() => { setDraft(draftTranslation.translated); setDraftTranslation(null); setNotice("Translated text placed in the draft; review before displaying."); }}>Use translated text</button><button type="button" className="button button-secondary" onClick={() => speak(draftTranslation.translated, draftTranslation.target)}>Play translation</button></div></div>}</div>
                </form>

                <div className="quick-section"><div className="section-heading"><h3>Quick phrases</h3><button className="link-button" onClick={() => changeMode("quick")}>Open all phrases</button></div><div className="phrase-grid">{PHRASE_GROUPS.Daily.slice(0, 4).map((phrase) => <button key={phrase} className="phrase-button" onClick={() => choosePhrase(phrase)}>{phrase}</button>)}</div></div>
                {mode === "send-group" && <button className="button button-secondary audience-button" onClick={() => setLargeDisplay((previous) => !previous)}>{largeDisplay ? "Use normal message size" : "Enlarge group display"}</button>}
                <div className="conversation-footer"><p role="status">{notice}</p><div className="button-row"><button className="button button-secondary" onClick={saveConversation}>Save conversation</button><button className="button button-secondary" onClick={() => changeMode("cards")}>Create Conversation Card</button></div></div>
              </section>
            </>
          ) : null}

          {mode === "remote" && (
            <section className="panel">
              <div className="section-heading"><div><h3>Remote text session</h3><p>The remote service works only after Firebase is configured. No paid API is used.</p></div><span className={`small-tag ${firebaseConfigured ? "tag-ready" : "tag-warning"}`}>{firebaseConfigured ? "Firebase configured" : "Setup required"}</span></div>
              {!firebaseConfigured && <div className="notice notice-warning">To enable real remote messaging, create a Firebase project on the no-cost Spark plan, enable Anonymous Authentication and Realtime Database, apply the included database rules, then add the web config values to a local .env.local file. No room is simulated before that connection exists.</div>}
              {firebaseConfigured && !remoteRoom.uid && <div className="button-row"><button className="button button-primary" disabled={remoteRoom.working} onClick={createRoom}>{remoteRoom.working ? "Creating…" : "Create a new session"}</button><span className="muted small">Or join by opening a shared ?room= link.</span></div>}
              {remoteRoom.error && <p className="form-error" role="alert">{remoteRoom.error}</p>}
              {remoteRoom.roomId && <div className="remote-session-bar"><div><strong>Session code</strong><code>{remoteRoom.roomId}</code><span className="muted small">Expires about 3 hours after creation.</span></div><button className="button button-secondary" onClick={copyRemoteLink}>Copy invite link</button></div>}
              {firebaseConfigured && remoteRoom.roomId && !remoteRoom.uid && <div className="remote-join-form"><p>Join session</p><button className="button button-primary" disabled={remoteRoom.working} onClick={joinByCode}>{remoteRoom.working ? "Joining…" : "Join this session"}</button></div>}
              {remoteRoom.uid && <><div className="notice notice-info">Connected for text messaging. Share the invitation link with only the intended participant. This demo does not implement voice/video calls.</div><div className="remote-messages" aria-live="polite">{remoteRoom.messages.length === 0 ? <p className="muted">No messages yet. Send the first message.</p> : remoteRoom.messages.map((message) => <article className="remote-message" key={message.id}><div className="message-meta"><strong>{message.sender || "Guest"}</strong><span>{new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div><p>{message.text}</p><button className="text-button" onClick={() => speak(message.text)}>🔊 Play aloud</button></article>)}</div><form className="composer" onSubmit={sendRemote}><label className="composer-label" htmlFor="remoteDraft">Message to the remote participant</label><textarea id="remoteDraft" maxLength={2000} rows={3} value={remoteDraft} onChange={(event) => setRemoteDraft(event.target.value)} placeholder="Type an accessible message…"/><div className="composer-actions"><span className="muted small">Text-only session · max 2,000 characters per message.</span><button type="submit" className="button button-primary">Send message →</button></div></form></>}
            </section>
          )}

          {mode === "history" && (
            <section className="panel"><div className="section-heading"><div><h3>Saved conversations</h3><p>Saved locally in this browser. Sensitive records are not synced to a server.</p></div></div><label className="field history-search"><span>Search conversations</span><input type="search" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search words or a title…"/></label>
              {matchingHistory.length === 0 ? <div className="empty-state"><span>🕘</span><h3>No matching conversations</h3><p>Save a conversation first, or change the search.</p></div> : <div className="history-list">{matchingHistory.map((item) => <article className="history-item" key={item.id}><div><strong>{item.title}</strong><p>{new Date(item.savedAt).toLocaleString()}</p><span>{item.messages?.length || 0} messages · {item.language} default</span></div><div className="history-actions"><button className="button button-secondary" onClick={() => reopenConversation(item)}>Reopen</button><button className="button button-secondary" onClick={() => exportFile("signbridge-conversation.json", item)}>Export</button><button className="button button-danger" onClick={() => setHistory((previous) => previous.filter((conversation) => conversation.id !== item.id))}>Delete</button></div></article>)}</div>}
            </section>
          )}

          {mode === "cards" && (
            <section className="panel"><div className="section-heading"><div><h3>Create a user-reviewed Conversation Card</h3><p>Capture the user's confirmed next steps. This does not create a medical diagnosis.</p></div></div><form className="card-form" onSubmit={saveConversationCard}><label className="field"><span>Card title *</span><input maxLength={90} value={cardDraft.title} onChange={(event) => setCardDraft((previous) => ({ ...previous, title: event.target.value }))} placeholder="e.g. College office visit"/></label><label className="field"><span>What did the user ask for? *</span><textarea rows={2} maxLength={1000} value={cardDraft.request} onChange={(event) => setCardDraft((previous) => ({ ...previous, request: event.target.value }))} placeholder="Write the request in the user's own words…"/></label><label className="field"><span>Information received (user verified)</span><textarea rows={3} maxLength={2000} value={cardDraft.information} onChange={(event) => setCardDraft((previous) => ({ ...previous, information: event.target.value }))} placeholder="Only enter information that was actually communicated…"/></label><label className="field"><span>What still needs clarification?</span><textarea rows={2} maxLength={1000} value={cardDraft.clarification} onChange={(event) => setCardDraft((previous) => ({ ...previous, clarification: event.target.value }))} placeholder="Leave blank if nothing needs clarification."/></label><label className="field"><span>Next action chosen by the user</span><textarea rows={2} maxLength={1000} value={cardDraft.nextAction} onChange={(event) => setCardDraft((previous) => ({ ...previous, nextAction: event.target.value }))} placeholder="Optional follow-up or reminder…"/></label><button type="submit" className="button button-primary">Save reviewed card</button></form>
              <div className="subsection-heading"><h3>Saved cards</h3><span className="small-tag">{cards.length}</span></div>{cards.length === 0 ? <p className="muted">No cards saved yet.</p> : <div className="cards-list">{cards.map((card) => <article className="conversation-card" key={card.id}><div className="message-meta"><span>Reviewed by user</span><span>{new Date(card.createdAt).toLocaleString()}</span></div><h4>{card.title}</h4><dl><dt>Request</dt><dd>{card.request}</dd>{card.information && <><dt>Information received</dt><dd>{card.information}</dd></>}{card.clarification && <><dt>Needs clarification</dt><dd>{card.clarification}</dd></>}{card.nextAction && <><dt>Next action</dt><dd>{card.nextAction}</dd></>}</dl><div className="button-row"><button className="button button-secondary" onClick={() => exportFile("signbridge-conversation-card.json", card)}>Export card</button><button className="button button-danger" onClick={() => setCards((previous) => previous.filter((item) => item.id !== card.id))}>Delete</button></div></article>)}</div>}
            </section>
          )}

          {mode === "quick" && (
            <section className="panel quick-emergency-panel">
              <div className="section-heading">
                <div><h3>⚡ Quick phrases</h3><p>Tap a phrase to prepare it, then review before sharing. Saved phrases work without a translation service.</p></div>
                <span className="small-tag">Quick Mode</span>
              </div>
              <div className="category-tabs">{Object.keys(PHRASE_GROUPS).map((category) => <button type="button" key={category} className={`method-chip ${phraseCategory === category ? "selected" : ""}`} onClick={() => setPhraseCategory(category)}>{category === "Emergency" ? "🆘 " : ""}{category}</button>)}</div>
              {phraseCategory === "Emergency" && <div className="notice notice-danger">SignBridge is not an emergency dispatch service. In India, call 112 for emergency assistance. Do not delay an emergency call while trying to use this app.</div>}
              <div className="quick-grid">{PHRASE_GROUPS[phraseCategory].map((phrase) => <button type="button" className="quick-card" key={phrase} onClick={() => choosePhrase(phrase)}><span>{visualCue(phrase)}</span><strong>{phrase}</strong><small>Prepare message</small></button>)}</div>

              <div className="emergency-panel">
                <div className="section-heading">
                  <div><p className="eyebrow">SAFETY TOOLS</p><h3>🆘 Emergency contacts & location</h3><p>Add trusted contacts in advance. Contacts and coordinates stay in this browser until you choose to share them.</p></div>
                  <a className="button button-danger emergency-call-button" href="tel:112" aria-label="Open phone dialer to call India's emergency number 112">📞 Call 112 (India)</a>
                </div>

                <div className="notice notice-warning">GPS sharing requires your permission and may be unavailable or approximate. SignBridge does not automatically alert contacts or guarantee message delivery. After opening SMS/WhatsApp, verify the recipient and press Send yourself.</div>

                <div className="location-tools">
                  <button type="button" className="button button-primary" onClick={requestCurrentLocation} disabled={locationBusy}>{locationBusy ? "Getting location…" : "📍 Get my current location"}</button>
                  {emergencyLocation && <a className="button button-secondary" href={`https://maps.google.com/?q=${emergencyLocation.latitude},${emergencyLocation.longitude}`} target="_blank" rel="noreferrer">Open map ↗</a>}
                </div>
                {emergencyLocation && <div className="location-readout"><strong>Location available</strong><p>{emergencyLocation.latitude.toFixed(6)}, {emergencyLocation.longitude.toFixed(6)}</p><p>Reported accuracy: about {Math.round(emergencyLocation.accuracy)} metres · captured {new Date(emergencyLocation.capturedAt).toLocaleString()}</p><small>These coordinates are temporary and are not automatically saved to conversation history.</small><div className="button-row location-readout-actions"><a className="button button-secondary" href={`https://maps.google.com/?q=${emergencyLocation.latitude},${emergencyLocation.longitude}`} target="_blank" rel="noreferrer">View map</a><button type="button" className="button button-secondary" onClick={() => { setEmergencyLocation(null); setLocationStatus("Captured location cleared from this session."); }}>Clear location</button></div></div>}
                <p className="location-status" role="status">{locationStatus}</p>

                <div className="subsection-heading"><h3>Trusted contacts</h3><span className="small-tag">Saved on this device</span></div>
                <form className="emergency-contact-form" onSubmit={addEmergencyContact}>
                  <label className="field"><span>Contact name</span><input required maxLength={60} value={contactDraft.name} onChange={(event) => setContactDraft((previous) => ({ ...previous, name: event.target.value }))} placeholder="e.g. Family member" /></label>
                  <label className="field"><span>Phone number</span><input required type="tel" autoComplete="tel" maxLength={25} value={contactDraft.phone} onChange={(event) => setContactDraft((previous) => ({ ...previous, phone: event.target.value }))} placeholder="Include country code for WhatsApp" /></label>
                  <button type="submit" className="button button-secondary">＋ Save contact</button>
                </form>

                {emergencyContacts.length === 0 ? <div className="empty-state"><span>👤</span><h3>No trusted contacts saved</h3><p>Add a family member or trusted person. SignBridge will not contact them until you choose a sharing action.</p></div> : <div className="emergency-contact-list">
                  {emergencyContacts.map((contact) => <article className="emergency-contact-card" key={contact.id}>
                    <div className="emergency-contact-top"><div><strong>👤 {contact.name}</strong><p>{contact.phone}</p></div><button type="button" className="button button-danger button-small" onClick={() => removeEmergencyContact(contact.id)}>Remove</button></div>
                    <div className="button-row emergency-contact-actions">
                      <a className="button button-secondary" href={`tel:${contact.phone}`}>📞 Call</a>
                      <button type="button" className="button button-secondary" onClick={() => openSmsDraft(contact)}>✉️ SMS draft</button>
                      <button type="button" className="button button-secondary" onClick={() => openWhatsAppDraft(contact)}>🟢 WhatsApp draft</button>
                      <button type="button" className="button button-secondary" onClick={() => copyEmergencyMessage(contact)}>Copy message</button>
                    </div>
                  </article>)}
                </div>}
                <p className="small muted">Privacy: contact names and numbers are stored in browser local storage on this device; anyone using the same browser profile may be able to access them. Do not save someone else's number without appropriate permission.</p>
              </div>
            </section>
          )}

          {mode === "future" && (
            <section className="panel future-scope-panel">
              <div className="section-heading">
                <div><p className="eyebrow">ROADMAP · NOT ALL IMPLEMENTED</p><h3>What SignBridge can grow into</h3><p>These are future improvements, not claims about the current prototype.</p></div>
                <span className="small-tag">Future scope</span>
              </div>
              <div className="future-scope-grid">
                <article className="future-card"><span>🤟</span><h4>Validated Indian Sign Language</h4><p>Integrate and evaluate a suitable ISL model on a defined vocabulary, then expand carefully with signers and accessibility experts. Preserve review and fallback for uncertain results.</p><small>Requires a compatible trained model, dataset permissions and testing.</small></article>
                <article className="future-card"><span>🗣️</span><h4>Better live group conversations</h4><p>Improve speaker diarization, overlap detection and multilingual captions, with clear uncertainty labels and an easy repeat/clarify flow.</p><small>Requires a tested speech service or local model for each target language.</small></article>
                <article className="future-card"><span>🔐</span><h4>Secure cross-device history</h4><p>Optional accounts, encrypted synchronisation, consent-based sharing and user-controlled retention for conversation records and follow-up cards.</p><small>Requires authentication, backend rules and a privacy review.</small></article>
                <article className="future-card"><span>🧑‍🤝‍🧑</span><h4>Verified interpreter network</h4><p>Connect real interpreters with transparent rates, language/qualification checks, availability and genuine booking/payment status.</p><small>Requires provider partnerships; the current checkout is simulation only.</small></article>
                <article className="future-card"><span>📍</span><h4>Safer emergency support</h4><p>More accessible emergency workflows, consent-based location sharing and region-aware resources, with clear delivery status and privacy controls.</p><small>Requires reliable messaging integration and local safety validation; never replace emergency services.</small></article>
                <article className="future-card"><span>🧩</span><h4>More access needs</h4><p>Screen-reader refinements, switch/keyboard navigation, Braille-device compatibility where possible, cognitive-friendly modes and co-design with disabled users.</p><small>Validate with people with different and multiple disabilities.</small></article>
              </div>
              <div className="notice notice-info">Our next priority after the hackathon: test the current features with users, measure errors and completion time, and build only the improvements that address observed barriers.</div>
              <button className="button button-primary" onClick={() => changeMode("direct")}>← Back to conversation</button>
            </section>
          )}

          {mode === "gesture" && (
            <section className="panel">
              <div className="section-heading"><div><h3>Sign and gesture input</h3><p>Choose a general gesture shortcut or test a separate ISL research model.</p></div><span className="small-tag">Review required</span></div>
              <GestureInput onUsePhrase={(phrase) => { setDraft(phrase); setActiveReplyMethod("Gesture shortcuts"); setNotice("Gesture phrase added to the draft. Review and edit before using it."); changeMode("direct"); }}/>
              <div className="notice notice-warning">The built-in MediaPipe model recognises a small set of general hand gestures, not Indian Sign Language. A detected gesture proposes an editable text phrase; accept it, review it, then choose Show text, Speak aloud, or Text + speech. Gesture shortcuts currently use English phrase templates; translate and review before using another language.</div>
              <div className="isl-handoff-card">
                <p className="eyebrow">EXTERNAL ISL RESEARCH DEMO</p>
                <h3>Try an external Indian Sign Language model</h3>
                <p className="small muted">Open the separate demo, test its supported input, then paste its returned phrase here. This handoff is manual; the model is not operated or validated by SignBridge, availability may change, and the external site may process uploaded video under its own terms. Do not upload sensitive footage.</p>
                <a className="external-tool-link" href="https://huggingface.co/spaces/veerendrabotla/isl-signbridge-translator" target="_blank" rel="noreferrer">Open external ISL research demo ↗</a>
                <label className="field isl-result-field"><span>Paste the result to review before using it</span><textarea rows={3} maxLength={500} value={islDraftText} onChange={(event) => setIslDraftText(event.target.value)} placeholder="Paste the output from the external demo here…"/></label>
                <button type="button" className="button button-primary" disabled={!islDraftText.trim()} onClick={() => { setDraft(islDraftText.trim()); setActiveReplyMethod("Gesture shortcuts"); changeMode("direct"); setNotice("External ISL demo output copied into your draft. Verify and edit it before communicating."); }}>Use result in SignBridge draft →</button>
              </div>
              <p className="small muted">Research context: <a href="https://github.com/AI4Bharat/INCLUDE" target="_blank" rel="noreferrer">AI4Bharat INCLUDE</a> provides code and pretrained-model resources for isolated ISL recognition; the dataset alone is not a universal live translator.</p>
            </section>
          )}

          {mode === "interpreter" && (
            <section className="panel"><div className="section-heading"><div><h3>Interpreter request and demo checkout</h3><p>Reference-price scenario only; no provider is connected and no real payment is collected.</p></div><span className="small-tag">Simulation</span></div><div className="notice notice-warning">Illustrative reference scenario based on ASLI India's published 2025 tariff: online rates ₹1,000/interpreter/hour before 6 PM or ₹1,500/interpreter/hour after 6 PM, plus ₹500 booking charges per interpreter. This demo offers only listed 1- and 2-hour durations, applies the tariff's two-interpreter rule for sessions over 30 minutes, and blocks sessions crossing the 6 PM rate boundary. It is not a live quote or availability check; confirm current terms with a provider.</div><form className="interpreter-form" onSubmit={beginInterpreterCheckout}><div className="setup-grid"><label className="field"><span>Requested date</span><input type="date" required min={localDateString()} value={interpreterForm.date} onChange={(event) => { setInterpreterForm((previous) => ({ ...previous, date: event.target.value })); setCheckoutStatus(""); setCheckoutBookingId(""); }}/></label><label className="field"><span>Requested start time</span><input type="time" required step="3600" value={interpreterForm.time} onChange={(event) => { setInterpreterForm((previous) => ({ ...previous, time: event.target.value })); setCheckoutStatus(""); setCheckoutBookingId(""); }}/></label><label className="field"><span>Session duration</span><select value={interpreterForm.durationMinutes} onChange={(event) => { setInterpreterForm((previous) => ({ ...previous, durationMinutes: Number(event.target.value) })); setCheckoutStatus(""); setCheckoutBookingId(""); }}><option value={60}>60 minutes (1 hour)</option><option value={120}>120 minutes (2 hours)</option></select></label><label className="field"><span>Payment method (simulated)</span><select value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); setCheckoutStatus(""); setCheckoutBookingId(""); }}><option>UPI (demo)</option><option>Card (demo)</option><option>Net banking (demo)</option></select></label></div><div className="pricing-card"><div><span>Reference rate per interpreter / hour</span><strong>₹{pricing.hourlyRatePerInterpreter.toLocaleString("en-IN")}</strong></div><div><span>Interpreters × billable hours</span><strong>{pricing.interpreterCount} × {pricing.billableHours}</strong></div><div><span>Interpreter-fee subtotal</span><strong>₹{pricing.interpreterFee.toLocaleString("en-IN")}</strong></div><div><span>Booking charges ({pricing.interpreterCount} × ₹{pricing.bookingChargePerInterpreter})</span><strong>₹{pricing.bookingCharge.toLocaleString("en-IN")}</strong></div><div className="pricing-total"><span>Reference subtotal</span><strong>₹{pricing.total.toLocaleString("en-IN")}</strong></div><p className="small muted">{pricing.isAfterSix ? "After 6 PM reference rate" : "Before 6 PM reference rate"} · {pricing.interpreterCount} interpreter(s) · {interpreterForm.durationMinutes} minutes, with {pricing.billableHours}-hour reference basis. Sessions are not allowed to cross the 6 PM pricing boundary in this calculator. Excludes taxes and provider-specific terms.</p></div><label className="consent-option"><input type="checkbox" checked={interpreterForm.acknowledge} onChange={(event) => { setInterpreterForm((previous) => ({ ...previous, acknowledge: event.target.checked })); setCheckoutStatus(""); }}/><span>I understand this is a simulated booking using reference pricing. No real interpreter is contacted and no money is collected.</span></label><button className="button button-primary" type="submit">Continue to demo checkout</button></form>{checkoutStatus && <div className="notice notice-info" role="status">{checkoutStatus}</div>}{checkoutBookingId && <div className="checkout-card"><p className="eyebrow">DEMO CHECKOUT</p><h3>Reference subtotal: ₹{(bookings.find((booking) => booking.id === checkoutBookingId)?.pricing.total || pricing.total).toLocaleString("en-IN")}</h3><p>Payment method: {paymentMethod}</p><div className="notice notice-warning">No payment fields are collected. Press a test outcome below; this only changes the local demo status.</div><div className="button-row"><button className="button button-primary" onClick={() => simulatePayment(true)}>Simulate successful payment</button><button className="button button-danger" onClick={() => simulatePayment(false)}>Simulate failed payment</button></div></div>}<div className="subsection-heading"><h3>Demo booking history</h3><span className="small-tag">{bookings.length}</span></div>{bookings.length === 0 ? <p className="muted">No demo bookings yet.</p> : <div className="history-list">{bookings.map((booking) => <article className="history-item" key={booking.id}><div><strong>{booking.reference}</strong><p>{booking.date} at {booking.time} · {booking.durationMinutes} minutes</p><span>₹{booking.pricing.total.toLocaleString("en-IN")} · {booking.status}</span><small className="history-disclaimer">Demo record only — no provider contacted.</small></div><div className="history-actions"><button className="button button-secondary" onClick={() => exportFile("signbridge-demo-booking.json", booking)}>Export</button>{!booking.status.includes("CANCELLED") && <button className="button button-danger" onClick={() => cancelDemoBooking(booking.id)}>Mark cancelled</button>}</div></article>)}</div>}</section>
          )}

          <footer className="page-footer"><span>SignBridge · Team Phoenix · TS-022</span><span>Communication should work both ways.</span></footer>
        </section>
      </main>

      {showSettings && <Onboarding initial={preferences} isSettings onCancel={() => setShowSettings(false)} onSave={savePreferences} />}
    </div>
  );
}

export default App;
