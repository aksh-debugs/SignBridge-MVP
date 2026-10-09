import { useState } from "react";
import "./App.css";

const modes = [
  { id: "direct", icon: "💬", name: "One-to-one" },
  { id: "send-group", icon: "👥", name: "Speak to a group" },
  { id: "listen-group", icon: "🎧", name: "Listen to a group" },
  { id: "remote", icon: "🌐", name: "Remote conversation" },
  { id: "history", icon: "🕘", name: "Conversation history" },
  { id: "interpreter", icon: "🤝", name: "Interpreter support" },
];

const quickPhrases = [
  "Please speak slowly.",
  "Please type your message.",
  "I need some help.",
  "Could you repeat that?",
  "I need an interpreter.",
  "Thank you.",
];

const titles = {
  direct: ["One-to-one conversation", "Communicate in the way that works for you."],
  "send-group": ["Speak to a group", "Prepare a message everyone can see or hear."],
  "listen-group": ["Listen to a group", "Follow the conversation with accessible messages."],
  remote: ["Remote conversation", "Communicate with someone in another location."],
  history: ["Conversation history", "Review the conversations you choose to save."],
  interpreter: ["Interpreter support", "Explore interpreter assistance and the demo booking flow."],
};

function App() {
  const [mode, setMode] = useState("direct");
  const [language, setLanguage] = useState("English");
  const [receiveAs, setReceiveAs] = useState("Text");
  const [replyAs, setReplyAs] = useState("Visual");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [notice, setNotice] = useState(
    "Your communication choices can change at any time."
  );

  function sendMessage(event) {
    event.preventDefault();

    if (!draft.trim()) {
      setNotice("Enter a message or choose a quick phrase first.");
      return;
    }

    const message = {
      id: `${Date.now()}-${Math.random()}`,
      text: draft.trim(),
      method: replyAs,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((previous) => [...previous, message]);
    setDraft("");
    setNotice("Message added to this local preview.");
  }

  function speakMessage(text) {
    if (!("speechSynthesis" in window)) {
      setNotice("Speech output is not supported by this browser.");
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang =
      language === "Hindi"
        ? "hi-IN"
        : language === "Telugu"
          ? "te-IN"
          : "en-IN";

    window.speechSynthesis.speak(utterance);
    setNotice("Playing speech output. Voice availability depends on your browser.");
  }

  function saveConversation() {
    if (messages.length === 0) {
      setNotice("Add a message before saving this conversation.");
      return;
    }

    const savedConversation = {
      id: Date.now(),
      title: messages[0].text.slice(0, 55),
      date: new Date().toLocaleString(),
      messages,
    };

    setHistory((previous) => [savedConversation, ...previous]);
    setNotice("Conversation saved for this session.");
  }

  const currentTitle = titles[mode];

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
              onClick={() => {
                setMode(item.id);
                setNotice("Choose the communication method that suits you.");
              }}
              aria-current={mode === item.id ? "page" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
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
          <p className="sidebar-footnote">
            Built for different communication needs.
          </p>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Workspace / {currentTitle[0]}</div>
          <span className="prototype-tag">
            <span className="status-dot" />
            Development preview
          </span>
        </header>

        <section className="page-content">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">ONE ADAPTIVE PLATFORM</p>
              <h2>{currentTitle[0]}</h2>
              <p className="subtitle">{currentTitle[1]}</p>
            </div>
            <div className="welcome-symbol" aria-hidden="true">
              ↔
            </div>
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
                <span>Preferred language</span>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                >
                  <option>English</option>
                  <option>Hindi</option>
                  <option>Telugu</option>
                </select>
              </label>

              <label className="field">
                <span>I want to receive messages as</span>
                <select
                  value={receiveAs}
                  onChange={(event) => setReceiveAs(event.target.value)}
                >
                  <option>Text</option>
                  <option>Visual</option>
                  <option>Audio</option>
                  <option>Text + Audio</option>
                </select>
              </label>

              <label className="field">
                <span>I want to reply using</span>
                <select
                  value={replyAs}
                  onChange={(event) => setReplyAs(event.target.value)}
                >
                  <option>Visual</option>
                  <option>Type</option>
                  <option>Speak</option>
                  <option>Supported signs</option>
                </select>
              </label>
            </div>
          </section>

          {mode === "history" ? (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h3>Saved conversations</h3>
                  <p>Only conversations saved in this current session appear here.</p>
                </div>
              </div>

              {history.length === 0 ? (
                <div className="empty-state">
                  <span>🕘</span>
                  <h3>No saved conversations yet</h3>
                  <p>Start a conversation, then choose Save conversation.</p>
                </div>
              ) : (
                <div className="history-list">
                  {history.map((conversation) => (
                    <article className="history-item" key={conversation.id}>
                      <div>
                        <strong>{conversation.title}</strong>
                        <p>{conversation.date}</p>
                        <span>{conversation.messages.length} message(s)</span>
                      </div>
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
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : mode === "interpreter" ? (
            <section className="panel feature-panel">
              <div className="feature-icon">🤝</div>
              <p className="eyebrow">HUMAN SUPPORT</p>
              <h3>Interpreter assistance</h3>
              <p>
                The planned booking flow will show language preferences,
                session duration, published reference pricing and a simulated
                checkout.
              </p>
              <div className="demo-notice">
                Demo only: interpreter availability and real bookings are not
                connected in this development preview.
              </div>
            </section>
          ) : mode === "remote" ? (
            <section className="panel feature-panel">
              <div className="feature-icon">🌐</div>
              <p className="eyebrow">COMMUNICATE FROM ANYWHERE</p>
              <h3>Remote conversation</h3>
              <p>
                The planned remote mode will allow another person to join
                through a browser link without installing SignBridge.
              </p>
              <div className="demo-notice">
                Remote messaging is not connected yet. We will add and test
                the real session service before presenting this feature as
                working.
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
                        ? "Live microphone transcription will be connected in a later step."
                        : mode === "send-group"
                          ? "Prepare one message for everyone to read or hear."
                          : "Compose a message using your preferred method."}
                    </p>
                  </div>

                  <span className="small-tag">Local preview</span>
                </div>

                {mode === "listen-group" && (
                  <div className="demo-notice">
                    Microphone transcription is not connected yet. This screen
                    is the interface prototype; we will integrate and test the
                    speech service separately.
                  </div>
                )}

                {messages.length === 0 ? (
                  <div className="empty-state">
                    <span>💬</span>
                    <h3>Your conversation starts here</h3>
                    <p>
                      Choose a phrase below or prepare your own message.
                    </p>
                  </div>
                ) : (
                  <div className="message-list" aria-live="polite">
                    {messages.map((message) => (
                      <article className="message-bubble" key={message.id}>
                        <div className="message-meta">
                          <span>You · {message.method}</span>
                          <span>{message.time}</span>
                        </div>
                        <p>{message.text}</p>
                        <button
                          className="text-button"
                          onClick={() => speakMessage(message.text)}
                        >
                          🔊 Play aloud
                        </button>
                      </article>
                    ))}
                  </div>
                )}

                <form className="composer" onSubmit={sendMessage}>
                  <label className="composer-label" htmlFor="message">
                    Write or edit your message
                  </label>
                  <textarea
                    id="message"
                    rows={3}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Type a message or select a phrase below..."
                  />

                  <div className="composer-actions">
                    <span className="composer-hint">
                      Review your words before sharing.
                    </span>
                    <button className="primary-button" type="submit">
                      Add message →
                    </button>
                  </div>
                </form>

                <div className="quick-phrases">
                  <div className="section-heading">
                    <h3>Quick phrases</h3>
                    <span className="small-tag">Quick Mode</span>
                  </div>
                  <div className="phrase-grid">
                    {quickPhrases.map((phrase) => (
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

                <div className="conversation-footer">
                  <p role="status">{notice}</p>
                  <button
                    className="secondary-button"
                    onClick={saveConversation}
                  >
                    Save conversation
                  </button>
                </div>
              </section>

              <section className="bottom-grid">
                <article className="mini-card">
                  <span>🛡️</span>
                  <div>
                    <h3>You stay in control</h3>
                    <p>Review your message before sending it.</p>
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