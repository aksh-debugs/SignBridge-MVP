import { useEffect, useRef, useState } from "react";
import "./App.css";

const STORAGE_KEY = "signbridge-history-v1";

const modes = [
  { id: "direct", icon: "💬", name: "One-to-one" },
  { id: "send-group", icon: "👥", name: "Speak to a group" },
  { id: "listen-group", icon: "🎧", name: "Listen to a group" },
  { id: "remote", icon: "🌐", name: "Remote conversation" },
  { id: "history", icon: "🕘", name: "Conversation history" },
  { id: "interpreter", icon: "🤝", name: "Interpreter support" },
];

const phrases = [
  "Please speak slowly.",
  "Please type your message.",
  "I need some help.",
  "Could you repeat that?",
  "I need an interpreter.",
  "Please wait a moment.",
  "I do not understand.",
  "Thank you.",
];

const visualPhrases = [
  ["🆘", "I need help."],
  ["💧", "I need water."],
  ["💊", "I need medicine."],
  ["🏥", "I need medical assistance."],
  ["⏳", "Please wait a moment."],
  ["✍️", "Please write it down."],
];

const titles = {
  direct: ["One-to-one conversation", "Communicate in the way that works for you."],
  "send-group": ["Speak to a group", "Prepare a message everyone can see or hear."],
  "listen-group": ["Listen to a group", "Follow speech through captions where supported."],
  remote: ["Remote conversation", "Communicate with someone in another location."],
  history: ["Conversation history", "Review conversations you choose to save."],
  interpreter: ["Interpreter support", "Explore interpreter assistance and demo booking."],
};

const languageCodes = {
  English: "en-IN",
  Hindi: "hi-IN",
  Telugu: "te-IN",
};

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function App() {
  const [mode, setMode] = useState("direct");
  const [language, setLanguage] = useState("English");
  const [receiveAs, setReceiveAs] = useState("Text");
  const [replyAs, setReplyAs] = useState("Visual");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState(readHistory);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("Choose how you want to communicate.");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [largeDisplay, setLargeDisplay] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      setNotice("Browser storage is unavailable. This change may not persist.");
    }
  }, [history]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // Recognition may already have stopped.
      }
      window.speechSynthesis?.cancel();
    };
  }, []);

  function speak(text) {
    if (!("speechSynthesis" in window)) {
      setNotice("Speech output is not supported by this browser.");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = languageCodes[language] || "en-IN";

    utterance.onerror = () => {
      setNotice("Speech playback failed. Please try again.");
    };

    window.speechSynthesis.speak(utterance);
    setNotice("Playing speech. Voice availability depends on your browser.");
  }

  function startListening() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setNotice(
        "Live speech recognition is unsupported here. Use typing or another compatible browser."
      );
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Previous recognition may already be closed.
      }
    }

    const recognition = new SpeechRecognition();
    recognition.lang = languageCodes[language] || "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setListening(true);
      setNotice("Microphone active. Please ask people to speak one at a time.");
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript || "";

        if (result.isFinal) {
          finalText += `${text} `;
        } else {
          interimText += text;
        }
      }

      setInterim(interimText);

      if (finalText.trim()) {
        setMessages((previous) => [
          ...previous,
          {
            id: newId(),
            text: finalText.trim(),
            sender: "Speaker not identified",
            method: "Browser speech recognition",
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            direction: "incoming",
          },
        ]);
        setNotice("Caption received. Check the wording before relying on it.");
      }
    };

    recognition.onerror = (event) => {
      setListening(false);
      setInterim("");

      const messagesByError = {
        "not-allowed": "Microphone permission denied. Check browser permissions.",
        "no-speech": "No speech detected. Try again closer to the speaker.",
        "audio-capture": "No working microphone was detected.",
        network: "The browser speech service reported a network problem.",
      };

      setNotice(
        messagesByError[event.error] ||
          `Speech recognition error: ${event.error}. You can retry or type instead.`
      );
    };

    recognition.onend = () => {
      setListening(false);
      setInterim("");
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setNotice("Could not start listening. Stop any previous session and retry.");
    }
  }

  function stopListening() {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Recognition may already be stopped.
    }

    setListening(false);
    setInterim("");
    setNotice("Listening stopped. Review the captions.");
  }

  function addMessage(event) {
    event.preventDefault();

    const text = draft.trim();

    if (!text) {
      setNotice("Enter a message or choose a phrase first.");
      return;
    }

    setMessages((previous) => [
      ...previous,
      {
        id: newId(),
        text,
        sender: "You",
        method: replyAs,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        direction: "outgoing",
      },
    ]);

    setDraft("");
    setLargeDisplay(mode === "send-group");
    setNotice(
      mode === "send-group"
        ? "Message prepared for the group display. Play aloud if needed."
        : "Message added to this local conversation."
    );
  }

  function saveConversation() {
    if (!messages.length) {
      setNotice("Add a message before saving the conversation.");
      return;
    }

    const conversation = {
      id: newId(),
      title: messages[0].text.slice(0, 55),
      savedAt: new Date().toISOString(),
      language,
      messages,
    };

    setHistory((previous) => [conversation, ...previous]);
    setNotice("Conversation saved in this browser.");
  }

  function exportConversation(conversation) {
    try {
      const blob = new Blob([JSON.stringify(conversation, null, 2)], {
        type: "application/json",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "signbridge-conversation.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setNotice("Conversation export started.");
    } catch {
      setNotice("Export failed. Please try again.");
    }
  }

  function deleteConversation(id) {
    setHistory((previous) => previous.filter((item) => item.id !== id));
    setNotice("Conversation deleted from this browser.");
  }

  const filteredHistory = history.filter((conversation) => {
    const term = search.trim().toLowerCase();

    return (
      !term ||
      conversation.title?.toLowerCase().includes(term) ||
      conversation.messages?.some((message) =>
        message.text.toLowerCase().includes(term)
      )
    );
  });

  const title = titles[mode];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <h1>SignBridge</h1>
            <p>Communication without barriers</p>
          </div>
        </div>

        <div className="sidebar-label">YOUR WORKSPACE</div>

        <nav className="navigation" aria-label="Conversation modes">
          {modes.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${mode === item.id ? "active" : ""}`}
              aria-current={mode === item.id ? "page" : undefined}
              onClick={() => {
                if (item.id !== "listen-group" && listening) stopListening();
                setMode(item.id);
                setLargeDisplay(false);
                setNotice("Choose the communication method that suits you.");
              }}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.name}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="privacy-indicator">
            <span className="status-dot" />
            <div>
              <strong>Privacy matters</strong>
              <p>Review before sharing</p>
            </div>
          </div>
          <p className="sidebar-footnote">Built for different communication needs.</p>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Workspace / {title[0]}</div>
          <span className="prototype-tag">
            <span className="status-dot" />
            Development preview
          </span>
        </header>

        <section className="page-content">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">ONE ADAPTIVE PLATFORM</p>
              <h2>{title[0]}</h2>
              <p className="subtitle">{title[1]}</p>
            </div>
            <div className="welcome-symbol" aria-hidden="true">↔</div>
          </div>

          <section className="preferences-card">
            <div className="section-heading">
              <div>
                <h3>Your communication preferences</h3>
                <p>Choose how you receive and express messages.</p>
              </div>
              <span className="small-tag">Change anytime</span>
            </div>

            <div className="preference-grid">
              <label className="field">
                <span>Preferred speech language</span>
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option>English</option>
                  <option>Hindi</option>
                  <option>Telugu</option>
                </select>
              </label>

              <label className="field">
                <span>I want to receive messages as</span>
                <select value={receiveAs} onChange={(e) => setReceiveAs(e.target.value)}>
                  <option>Text</option>
                  <option>Visual</option>
                  <option>Audio</option>
                  <option>Text + Audio</option>
                </select>
              </label>

              <label className="field">
                <span>I want to reply using</span>
                <select value={replyAs} onChange={(e) => setReplyAs(e.target.value)}>
                  <option>Visual</option>
                  <option>Type</option>
                  <option>Speak</option>
                  <option>Supported signs</option>
                </select>
              </label>
            </div>

            <p className="demo-notice">
              Language selection configures browser speech. Automatic
              translation is not connected yet.
            </p>
          </section>

          {mode === "history" ? (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h3>Saved conversations</h3>
                  <p>Stored in this browser, not synced to other devices.</p>
                </div>
              </div>

              <label className="field history-search">
                <span>Search saved conversations</span>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search a phrase or topic..."
                />
              </label>

              {filteredHistory.length === 0 ? (
                <div className="empty-state">
                  <span>🕘</span>
                  <h3>No matching saved conversations</h3>
                  <p>Save a conversation first, or try another search.</p>
                </div>
              ) : (
                <div className="history-list">
                  {filteredHistory.map((conversation) => (
                    <article className="history-item" key={conversation.id}>
                      <div>
                        <strong>{conversation.title}</strong>
                        <p>{new Date(conversation.savedAt).toLocaleString()}</p>
                        <span>{conversation.messages.length} message(s)</span>
                      </div>
                      <div className="history-actions">
                        <button
                          className="secondary-button"
                          onClick={() => {
                            setMessages(conversation.messages);
                            setMode("direct");
                            setNotice("Saved conversation reopened.");
                          }}
                        >
                          Reopen
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => exportConversation(conversation)}
                        >
                          Export
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => deleteConversation(conversation.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : mode === "remote" || mode === "interpreter" ? (
            <section className="panel feature-panel">
              <div className="feature-icon">{mode === "remote" ? "🌐" : "🤝"}</div>
              <p className="eyebrow">
                {mode === "remote" ? "REMOTE COMMUNICATION" : "HUMAN SUPPORT"}
              </p>
              <h3>{title[0]}</h3>
              <p>{title[1]}</p>
              <div className="demo-notice">
                {mode === "remote"
                  ? "Remote sessions are not connected yet. Messages in this preview remain local."
                  : "Interpreter booking and simulated payment will be implemented separately. No real service is connected."}
              </div>
            </section>
          ) : (
            <>
              <section className="conversation-panel">
                <div className="section-heading conversation-heading">
                  <div>
                    <h3>
                      {mode === "send-group"
                        ? "Your message to the group"
                        : mode === "listen-group"
                          ? "Group conversation"
                          : "Conversation"}
                    </h3>
                    <p>
                      {mode === "listen-group"
                        ? "Capture speech as captions where your browser supports it."
                        : mode === "send-group"
                          ? "Compose one message for everyone to read or hear."
                          : "Prepare and review messages using your preferred method."}
                    </p>
                  </div>
                  <span className="small-tag">
                    {mode === "send-group" ? "Large-message mode" : "Local conversation"}
                  </span>
                </div>

                {mode === "listen-group" && (
                  <div className="listening-controls">
                    <div className="demo-notice">
                      Browser support varies. Audio may be processed by an
                      external speech service. Get appropriate consent before
                      capturing group speech.
                    </div>

                    <button
                      className={listening ? "secondary-button" : "primary-button"}
                      onClick={listening ? stopListening : startListening}
                    >
                      {listening ? "Stop listening" : "🎙 Start listening"}
                    </button>

                    <span className="listening-status" role="status">
                      {listening ? "Microphone active" : "Microphone inactive"}
                    </span>

                    {interim && (
                      <div className="interim-caption" aria-live="polite">
                        <strong>Live caption (not final)</strong>
                        <p>{interim}</p>
                      </div>
                    )}
                  </div>
                )}

                {messages.length === 0 ? (
                  <div className="empty-state">
                    <span>💬</span>
                    <h3>Your conversation starts here</h3>
                    <p>Choose a phrase below or prepare your own message.</p>
                  </div>
                ) : (
                  <div
                    className={`message-list ${largeDisplay ? "large-message-list" : ""}`}
                    aria-live="polite"
                  >
                    {messages.map((message) => (
                      <article
                        className={`message-bubble ${message.direction === "incoming" ? "incoming-message" : ""}`}
                        key={message.id}
                      >
                        <div className="message-meta">
                          <span>{message.sender} · {message.method}</span>
                          <span>{message.time}</span>
                        </div>
                        <p>{message.text}</p>
                        <button className="text-button" onClick={() => speak(message.text)}>
                          🔊 Play aloud
                        </button>
                      </article>
                    ))}
                  </div>
                )}

                <form className="composer" onSubmit={addMessage}>
                  <label className="composer-label" htmlFor="message">
                    Write or edit your message
                  </label>
                  <textarea
                    id="message"
                    rows={3}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type a message or choose a phrase below..."
                  />
                  <div className="composer-actions">
                    <span className="composer-hint">
                      Review your words before displaying or speaking them.
                    </span>
                    <button className="primary-button" type="submit">
                      {mode === "send-group" ? "Display message →" : "Add message →"}
                    </button>
                  </div>
                </form>

                <div className="quick-phrases">
                  <div className="section-heading">
                    <h3>Quick phrases</h3>
                    <span className="small-tag">Quick Mode</span>
                  </div>
                  <div className="phrase-grid">
                    {phrases.map((phrase) => (
                      <button
                        key={phrase}
                        className="phrase-button"
                        onClick={() => setDraft(phrase)}
                      >
                        {phrase}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="quick-phrases">
                  <div className="section-heading">
                    <h3>Visual message builder</h3>
                    <span className="small-tag">Tap to prepare</span>
                  </div>
                  <div className="phrase-grid">
                    {visualPhrases.map(([icon, text]) => (
                      <button
                        key={text}
                        className="phrase-button"
                        onClick={() => setDraft(text)}
                      >
                        {icon} {text}
                      </button>
                    ))}
                  </div>
                </div>

                {mode === "send-group" && (
                  <button
                    className="secondary-button audience-button"
                    onClick={() => setLargeDisplay((previous) => !previous)}
                  >
                    {largeDisplay ? "Return to normal view" : "Enlarge group message display"}
                  </button>
                )}

                <div className="conversation-footer">
                  <p role="status">{notice}</p>
                  <button className="secondary-button" onClick={saveConversation}>
                    Save conversation
                  </button>
                </div>
              </section>

              <section className="bottom-grid">
                <article className="mini-card">
                  <span>🛡️</span>
                  <div>
                    <h3>You stay in control</h3>
                    <p>Review messages and correct mistakes.</p>
                  </div>
                </article>
                <article className="mini-card">
                  <span>🔄</span>
                  <div>
                    <h3>Change your method</h3>
                    <p>Switch preferences whenever you need to.</p>
                  </div>
                </article>
              </section>
            </>
          )}

          <footer className="page-footer">
            <span>SignBridge · Team Phoenix · TS-022</span>
            <span>Communication should work both ways.</span>
          </footer>
        </section>
      </main>
    </div>
  );
}

export default App;