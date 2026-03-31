import React, { useState, useEffect } from "react";
import ReplayController from "./replay/ReplayController";

type RaceEvent = { round: number; name: string };

function App() {
  // Restore last race from localStorage on load
  const [selectedRace, setSelectedRace] = useState<{season: number, round: number} | null>(() => {
    const saved = localStorage.getItem("f1_selected_race");
    if (saved) {
      try { return JSON.parse(saved); } catch { return null; }
    }
    return null;
  });

  const [season, setSeason] = useState(() => {
    const saved = localStorage.getItem("f1_selected_race");
    if (saved) { try { return JSON.parse(saved).season; } catch {} }
    return 2024;
  });

  const [round, setRound] = useState(() => {
    const saved = localStorage.getItem("f1_selected_race");
    if (saved) { try { return JSON.parse(saved).round; } catch {} }
    return 1;
  });

  const [schedule, setSchedule] = useState<RaceEvent[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  // Fetch schedule whenever season changes
  useEffect(() => {
    setLoadingSchedule(true);
    fetch(`http://127.0.0.1:8000/race/schedule/${season}`)
      .then(res => res.json())
      .then(data => {
        setSchedule(data.races || []);
        // Auto-select first round if current round doesn't exist in new schedule
        if (data.races && data.races.length > 0) {
          const exists = data.races.some((r: RaceEvent) => r.round === round);
          if (!exists) setRound(data.races[0].round);
        }
      })
      .catch(() => setSchedule([]))
      .finally(() => setLoadingSchedule(false));
  }, [season]);

  // Persist selection to localStorage
  useEffect(() => {
    if (selectedRace) {
      localStorage.setItem("f1_selected_race", JSON.stringify(selectedRace));
    } else {
      localStorage.removeItem("f1_selected_race");
    }
  }, [selectedRace]);

  return (
    <div
      style={{
        background: "#000",
        minHeight: "100vh",
        padding: selectedRace ? 0 : 40,
        fontFamily: "sans-serif"
      }}
    >
      {!selectedRace ? (
        <div style={{ maxWidth: 500, margin: "auto", background: "#111", padding: 30, borderRadius: 12, border: "1px solid #333", color: "white", boxShadow: "0 10px 30px rgba(0,0,0,0.5)"}}>
          <h1 style={{ marginTop: 0, color: "#ff1801" }}>F1 Telemetry Engine</h1>
          <p style={{ color: "#aaa", marginBottom: 30 }}>Select a season and Grand Prix to visualize the race telemetry.</p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
             <label>
               <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "#fff", textTransform: "uppercase", letterSpacing: 1 }}>Season (Year)</span>
               <input 
                  type="number" 
                  value={season} 
                  onChange={e => setSeason(parseInt(e.target.value) || 2024)} 
                  style={{ width: "100%", padding: "12px", background: "#222", border: "1px solid #444", color: "white", borderRadius: 6, boxSizing: "border-box" }} 
               />
             </label>
             <label>
               <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "#fff", textTransform: "uppercase", letterSpacing: 1 }}>Grand Prix</span>
               {loadingSchedule ? (
                 <div style={{ padding: "12px", color: "#888" }}>Loading schedule...</div>
               ) : (
                 <select
                   value={round}
                   onChange={e => setRound(parseInt(e.target.value))}
                   style={{
                     width: "100%",
                     padding: "12px",
                     background: "#222",
                     border: "1px solid #444",
                     color: "white",
                     borderRadius: 6,
                     fontSize: 14,
                     cursor: "pointer",
                     boxSizing: "border-box"
                   }}
                 >
                   {schedule.map(race => (
                     <option key={race.round} value={race.round}>
                       R{race.round} — {race.name}
                     </option>
                   ))}
                 </select>
               )}
             </label>
             
             <button 
                onClick={() => setSelectedRace({ season, round })}
                disabled={schedule.length === 0}
                style={{ 
                  background: schedule.length === 0 ? "#555" : "#ff1801", 
                  color: "white", padding: "16px", border: "none", borderRadius: 6, 
                  fontWeight: "bold", fontSize: 16, cursor: schedule.length === 0 ? "not-allowed" : "pointer", marginTop: 10 
                }}
             >
                Load Event Visualization
             </button>
          </div>
        </div>
      ) : (
        <ReplayController 
            season={selectedRace.season} 
            round={selectedRace.round} 
            onBack={() => setSelectedRace(null)}
        />
      )}
    </div>
  );
}

export default App;
