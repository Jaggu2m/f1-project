import { useEffect, useRef, useState } from "react";
import RaceRenderer from "../engine/RaceRenderer";
import { useRaceState, RaceData } from "../engine/useRaceState";
import RaceLeaderboard from "../components/RaceLeaderboard";
import TelemetryPanel from "../components/TelemetryPanel";

export default function ReplayController({ season = 2023, round = 10, onBack }: { season?: number, round?: number, onBack?: () => void }) {
  const [raceData, setRaceData] = useState<RaceData | null>(null);
  const [raceTime, setRaceTime] = useState(0);
  const [maxTime, setMaxTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  /* =========================
     LOAD RACE DATA
  ========================== */
  useEffect(() => {
    const loadData = () => {
      fetch(`http://127.0.0.1:8000/race/${season}/${round}/all`)
        .then(res => {
          if (!res.ok) throw new Error("Failed to fetch race data: " + res.statusText);
          return res.json();
        })
        .then((data: any) => {
          if (data.status === "processing") {
             console.log("Backend processing data... polling in 5 seconds.");
             setTimeout(loadData, 5000);
             return;
          }
          console.log("✅ Race Info Loaded:", data);
          if (!data.drivers || !data.track) {
            console.error("❌ Invalid Race Data Structure", data);
            return;
          }
          setRaceData(data);

          let maxT = 0;
          Object.values(data.drivers).forEach((d: any) => {
            if (!d.positions || !d.positions.length) return;
            maxT = Math.max(maxT, d.positions[d.positions.length - 1].t);
          });

          setMaxTime(maxT);
        })
        .catch(err => console.error("🚨 Fetch Error:", err));
    };
    
    loadData();
  }, [season, round]);

  /* =========================
     LAZY LOAD TELEMETRY
  ========================== */
  useEffect(() => {
    if (!selectedDriver || !raceData) return;
    if (raceData.drivers[selectedDriver]?.telemetry) return; // already loaded

    fetch(`http://127.0.0.1:8000/race/${season}/${round}/telemetry/${selectedDriver}`)
      .then(res => res.json())
      .then(telData => {
         // Some drivers might fail to load data, protect against it
         if (telData.error) return;

         setRaceData(prev => {
            if (!prev) return prev;
            return {
               ...prev,
               drivers: {
                 ...prev.drivers,
                 [selectedDriver]: {
                    ...prev.drivers[selectedDriver],
                    telemetry: telData
                 }
               }
            };
         });
      })
      .catch(err => console.error("Telemetry fetch error", err));
  }, [selectedDriver, raceData, season, round]);

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

  // Find selected driver state
  const activeDriverState = selectedDriver 
    ? raceState.find(d => d.driverCode === selectedDriver) 
    : null;

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
            <h2>Connecting to Backend / Loading Race Data...</h2>
          </div>
        )}

        {raceData && (
          <>
            <RaceRenderer 
              raceTime={raceTime} 
              raceData={raceData} 
              selectedDriver={selectedDriver}
              onDriverSelect={(code) => setSelectedDriver(code === selectedDriver ? null : code)}
            />
            
            {/* Leaderboard */}
            <RaceLeaderboard 
              drivers={raceState} 
              totalLaps={Math.max(...Object.values(raceData.drivers).flatMap(d => d.laps?.map(l => l.lap) || [0]))} 
              selectedDriver={selectedDriver}
              onDriverSelect={(code) => setSelectedDriver(code === selectedDriver ? null : code)}
            />

            {/* 📊 TELEMETRY PANEL */}
            {activeDriverState && (
              <TelemetryPanel 
                driver={activeDriverState} 
                raceTime={raceTime} 
              />
            )}
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
        
        {/* Navigation */}
        {onBack && (
          <button onClick={onBack} style={{ padding: "8px 16px", cursor: "pointer", background: "#f44336", color: "white", border: "none", borderRadius: 4 }}>
            Back to Menu
          </button>
        )}

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
