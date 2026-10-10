import { useEffect, useRef, useState } from "react";
import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

// These are general hand-gesture shortcuts, NOT Indian Sign Language translations.
const GESTURE_PHRASES = {
  Open_Palm: "Please wait a moment.",
  Thumb_Up: "Yes, I agree.",
  Thumb_Down: "No, I disagree.",
  Pointing_Up: "I have a question.",
  Victory: "I need two items.",
  Closed_Fist: "Please stop.",
  ILoveYou: "I love you.",
};

function cameraErrorMessage(error) {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission was denied. In Chrome, click the icon left of localhost:5173 → Site settings → Camera → Allow, then reload.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found. Connect or enable a camera and try again.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera may be in use by another app. Close other camera apps and retry.";
  }
  if (name === "SecurityError") {
    return "Browser security blocked camera access. Use localhost or HTTPS.";
  }
  if (name === "AbortError") {
    return "Camera startup was interrupted. Please try again.";
  }
  return error?.message || "Could not start the camera. Check browser permission and try again.";
}

export default function GestureInput({ onUsePhrase }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognizerRef = useRef(null);
  const frameRef = useRef(0);
  const lastRunRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const activeRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("idle");
  const [error, setError] = useState("");
  const [gesture, setGesture] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);

  function stopCamera() {
    activeRef.current = false;
    setRunning(false);
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
    setStage("idle");
  }

  async function startCamera() {
    if (loading || running) return;
    setError("");
    setGesture(null);
    setLoading(true);

    let stream = null;
    try {
      // Request camera first so the browser permission prompt appears before model downloads.
      setStage("requesting-camera");
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API is unavailable. Open SignBridge on localhost or HTTPS in a supported browser.");
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error("Camera preview element was not available. Reload and retry.");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraReady(true);

      setStage("loading-model");
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      if (!recognizerRef.current) {
        try {
          recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
            runningMode: "VIDEO",
            numHands: 1,
          });
        } catch {
          recognizerRef.current = await GestureRecognizer.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
            runningMode: "VIDEO",
            numHands: 1,
          });
        }
      }

      activeRef.current = true;
      setRunning(true);
      setStage("running");
      setNoticeReady();
      frameRef.current = requestAnimationFrame(processFrame);
    } catch (cause) {
      activeRef.current = false;
      stream?.getTracks().forEach((track) => track.stop());
      if (streamRef.current === stream) streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraReady(false);
      setRunning(false);
      setStage("idle");
      setError(stageSpecificMessage(cause, stage));
    } finally {
      setLoading(false);
    }
  }

  function setNoticeReady() {
    setError("");
  }

  function stageSpecificMessage(cause, currentStage) {
    if (currentStage === "requesting-camera" || ["NotAllowedError", "NotFoundError", "NotReadableError", "SecurityError"].includes(cause?.name)) {
      return cameraErrorMessage(cause);
    }
    return `Camera access started, but the gesture model failed to load. Check your internet connection and retry. Details: ${cause?.message || "unknown model error"}`;
  }

  function processFrame(now) {
    if (!activeRef.current) return;
    frameRef.current = requestAnimationFrame(processFrame);
    if (now - lastRunRef.current < 150) return;
    const video = videoRef.current;
    const recognizer = recognizerRef.current;
    if (!video || !recognizer || video.readyState < 2 || video.currentTime === lastVideoTimeRef.current) return;

    lastRunRef.current = now;
    lastVideoTimeRef.current = video.currentTime;
    try {
      const result = recognizer.recognizeForVideo(video, now);
      const top = result?.gestures?.[0]?.[0];
      if (!top || top.categoryName === "None" || top.score < 0.68) {
        setGesture(null);
        return;
      }
      setGesture({
        name: top.categoryName,
        score: top.score,
        phrase: GESTURE_PHRASES[top.categoryName] || "Gesture detected; no phrase is mapped.",
      });
    } catch (cause) {
      activeRef.current = false;
      setRunning(false);
      setError(`The model could not process a camera frame: ${cause?.message || "unknown error"}. Stop and restart the camera.`);
    }
  }

  useEffect(() => () => {
    activeRef.current = false;
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    recognizerRef.current?.close();
  }, []);

  return (
    <section className="gesture-module">
      <div className="notice notice-warning">
        This recognises a small set of general hand gestures, not Indian Sign Language. Every suggested phrase must be reviewed before use.
      </div>
      <div className="notice notice-info gesture-howto">
        <strong>Quick demo:</strong> Start camera first, allow access, wait for the model, then hold one hand clearly in view with good lighting.
        <div className="gesture-map-list">
          <span>🖐 Open palm → Please wait</span><span>👍 Thumb up → Yes, I agree</span><span>👎 Thumb down → No, I disagree</span><span>☝️ Point up → I have a question</span><span>✌️ V sign → I need two items</span><span>✊ Closed fist → Please stop</span>
        </div>
      </div>
      <div className="gesture-layout">
        <div className="gesture-video-wrap">
          <video ref={videoRef} className="gesture-video" playsInline muted aria-label="Gesture camera preview" />
          {!cameraReady && <div className="video-placeholder">Camera preview appears here</div>}
        </div>
        <div className="gesture-result">
          <p className="eyebrow">CAMERA / MODEL STATUS</p>
          <h3>{loading ? (stage === "requesting-camera" ? "Requesting camera…" : "Loading gesture model…") : running ? (gesture ? gesture.name.replaceAll("_", " ") : "Camera active — no confident gesture") : "Camera inactive"}</h3>
          <p>{gesture ? `${Math.round(gesture.score * 100)}% model score` : "Keep one hand in view with good lighting."}</p>
          {gesture && <div className="suggested-phrase">“{gesture.phrase}”</div>}
          {gesture && <button type="button" className="button button-primary" onClick={() => onUsePhrase(gesture.phrase)}>Use phrase for review</button>}
          <div className="button-row">
            {!running ? (
              <button type="button" className="button button-primary" onClick={startCamera} disabled={loading}>
                {loading ? "Starting…" : "Start camera"}
              </button>
            ) : (
              <button type="button" className="button button-secondary" onClick={stopCamera}>Stop camera</button>
            )}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <p className="muted small">Camera frames are processed in the browser by MediaPipe. Initial setup requires internet access to download the runtime and model. Camera permission is required. This is a gesture shortcut demo, not ISL translation.</p>
        </div>
      </div>
    </section>
  );
}
