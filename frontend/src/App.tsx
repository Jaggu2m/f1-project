import React, { useState } from "react";
import ReplayController from "./replay/ReplayController";

function App() {
  const [selectedRace, setSelectedRace] = useState<{season: number, round: number} | null>(null);
  const [seasonStr, setSeasonStr] = useState("2023");
  const [roundStr, setRoundStr] = useState("10");

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
          <p style={{ color: "#aaa", marginBottom: 30 }}>Enter a season and round to visualize the race telemetry natively powered by FastF1.</p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
             <label>
               <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "#fff", textTransform: "uppercase", letterSpacing: 1 }}>Season (Year)</span>
               <input 
                  type="number" 
                  value={seasonStr} 
                  onChange={e => setSeasonStr(e.target.value)} 
                  style={{ width: "100%", padding: "12px", background: "#222", border: "1px solid #444", color: "white", borderRadius: 6 }} 
               />
             </label>
             <label>
               <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "#fff", textTransform: "uppercase", letterSpacing: 1 }}>Round</span>
               <input 
                  type="number" 
                  value={roundStr} 
                  onChange={e => setRoundStr(e.target.value)} 
                  style={{ width: "100%", padding: "12px", background: "#222", border: "1px solid #444", color: "white", borderRadius: 6 }} 
               />
             </label>
             
             <button 
                onClick={() => setSelectedRace({season: parseInt(seasonStr), round: parseInt(roundStr)})}
                style={{ background: "#ff1801", color: "white", padding: "16px", border: "none", borderRadius: 6, fontWeight: "bold", fontSize: 16, cursor: "pointer", marginTop: 10 }}
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
