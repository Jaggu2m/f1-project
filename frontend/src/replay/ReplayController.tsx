import { useEffect, useRef, useState } from "react";
import RaceRenderer from "../engine/RaceRenderer";
import { useRaceState, RaceData } from "../engine/useRaceState";
import RaceLeaderboard from "../components/RaceLeaderboard";



export default function ReplayController() {
  const [raceData, setRaceData] = useState<RaceData | null>(null);
  const [raceTime, setRaceTime] = useState(0);
  const [maxTime, setMaxTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  /* =========================
     LOAD RACE DATA
  ========================== */
  useEffect(() => {
    fetch("/race_positions_silverstone_2023_leaderboard2.json")
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch race data: " + res.statusText);
        return res.json();
      })
      .then((data: RaceData) => {
        console.log("✅ Race Info Loaded:", data);
        if (!data.drivers || !data.track) {
          console.error("❌ Invalid Race Data Structure", data);
          return;
        }
        setRaceData(data);

        let maxT = 0;
        Object.values(data.drivers).forEach(d => {
          if (!d.positions.length) return;
          maxT = Math.max(maxT, d.positions[d.positions.length - 1].t);
        });

        setMaxTime(maxT);
      })
      .catch(err => console.error("🚨 Fetch Error:", err));
  }, []);

  /* =========================
     TIME ENGINE
  ========================== */
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastFrameRef.current = null;
      return;
    }

    const loop = (now: number) => {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = now;
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;

      setRaceTime(prev => {
        const next = prev + dt * speed;
        return next > maxTime ? maxTime : next;
      });

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastFrameRef.current = null;
    };
  }, [playing, speed, maxTime]);

  const raceState = useRaceState(raceData, raceTime);

  /* =========================
     RENDER
  ========================== */
  /* =========================
     RENDER
  ========================== */
  return (
    <div style={{ 
      position: "fixed", 
      top: 0, 
      left: 0, 
      width: "100vw", 
      height: "100vh", 
      background: "#111", 
      display: "flex", 
      flexDirection: "column",
      color: "#fff",
      fontFamily: "sans-serif"
    }}>
      {/* 🏎️ Main Viewport */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Loading / Error Feedback */}
        {!raceData && (
          <div style={{ 
            position: "absolute", inset: 0, 
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#888" 
          }}>
            <h2>Loading Race Data...</h2>
          </div>
        )}

        {raceData && (
          <>
            <RaceRenderer raceTime={raceTime} raceData={raceData} />
            <RaceLeaderboard drivers={raceState} />
          </>
        )}
      </div>

      {/* 🎛 Controls Bar */}
      <div style={{ 
        height: 80, 
        background: "#222", 
        borderTop: "1px solid #333", 
        display: "flex", 
        alignItems: "center", 
        padding: "0 20px",
        gap: 20
      }}>
        
        {/* Playback Buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setPlaying(!playing)} style={{ padding: "8px 16px", cursor: "pointer" }}>
            {playing ? "Pause" : "Play"}
          </button>
          <button onClick={() => { setPlaying(false); setRaceTime(0); }} style={{ padding: "8px 16px", cursor: "pointer" }}>
            Reset
          </button>
        </div>

        {/* Timeline Slider */}
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
          <span style={{ marginRight: 10, fontSize: 12, minWidth: 50 }}>
            {raceTime.toFixed(1)}s
          </span>
          <input
            type="range"
            min={0}
            max={maxTime}
            step={0.1}
            value={raceTime}
            onChange={e => {
              setRaceTime(Number(e.target.value));
              lastFrameRef.current = null;
            }}
            style={{ width: "100%", cursor: "pointer" }}
          />
          <span style={{ marginLeft: 10, fontSize: 12, minWidth: 50 }}>
            {maxTime.toFixed(1)}s
          </span>
        </div>

        {/* Speed Controls */}
        <div style={{ display: "flex", gap: 4 }}>
          {[0.5, 1, 2, 4, 10].map(s => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              style={{
                padding: "4px 8px",
                cursor: "pointer",
                background: speed === s ? "#4caf50" : "#444",
                color: "white",
                border: "none",
                borderRadius: 4
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
