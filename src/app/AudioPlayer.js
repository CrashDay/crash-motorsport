"use client";

import { useEffect, useRef, useState } from "react";

export default function AudioPlayer() {
  const audioRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onCanPlay = () => setReady(true);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    a.addEventListener("canplay", onCanPlay);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);

    return () => {
      a.removeEventListener("canplay", onCanPlay);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, []);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;

    try {
      if (a.paused) {
        await a.play(); // requires user gesture
      } else {
        a.pause();
      }
    } catch (e) {
      // Autoplay restrictions or file not found
      console.log("Audio play blocked:", e);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <audio ref={audioRef} src="/audio/background.mp3" loop preload="auto" />
      <button
        type="button"
        onClick={toggle}
        style={{
          background: "#111",
          border: "1px solid #222",
          color: "#fff",
          padding: "8px 10px",
          borderRadius: 12,
          cursor: "pointer",
          fontSize: 12,
        }}
        aria-label={playing ? "Pause music" : "Play music"}
        title={playing ? "Pause" : "Play"}
      >
        {playing ? "Pause ▌▌" : "Play ▶"}
      </button>

      <span style={{ color: "#777", fontSize: 12 }}>
        {ready ? "Music" : "Loading…"}
      </span>
    </div>
  );
}