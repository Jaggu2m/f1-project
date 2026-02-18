import React, { useMemo } from "react";
import { DriverState } from "../engine/useRaceState";

type Props = {
  driver: DriverState;
  raceTime: number;
};

// Start/End angles for gauges (in degrees)
const SPEED_START = 150;
const SPEED_END = 390;
const RPM_START = 150;
const RPM_END = 390;

/* ---- SVG HELPER ---- */
const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
};

const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    "M", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(" ");
};

export default function TelemetryPanel({ driver, raceTime }: Props) {
  const tel = driver.telemetry;

  // Safe defaults
  const speed = Math.round(tel?.speed || 0);
  const rpm = Math.round(tel?.rpm || 0);
  const gear = tel?.gear ?? 0; // 0 = N/R?
  const throttle = (tel?.throttle || 0); // 0-100
  const brake = (tel?.brake || 0);       // 0-100

  const drs = tel?.drs && tel.drs > 9 ? "OPEN" : "CLOSED"; // DRS usually 10-14 for open. 0-9 closed.
  const isDrsActive = drs === "OPEN";

  /* ---- MEMOIZED ARCS ---- */
  // Speed Arc (0 to 360 km/h)
  const speedPct = Math.min(speed / 360, 1);
  const speedAngle = SPEED_START + (SPEED_END - SPEED_START) * speedPct;
  const speedPath = useMemo(() => describeArc(60, 60, 50, SPEED_START, SPEED_END), []);
  const speedFillPath = describeArc(60, 60, 50, SPEED_START, speedAngle);

  // RPM Arc (0 to 13000)
  const rpmPct = Math.min(rpm / 13000, 1);
  const rpmAngle = RPM_START + (RPM_END - RPM_START) * rpmPct;
  const rpmPath = useMemo(() => describeArc(100, 80, 70, RPM_START, RPM_END), []);
  const rpmFillPath = describeArc(100, 80, 70, RPM_START, rpmAngle);

  return (
    <div style={{
      position: "fixed",
      bottom: 20,
      left: "50%",
      transform: "translateX(-50%)",
      width: "90%",
      maxWidth: 1000,
      height: 220,
      background: "rgba(10, 20, 40, 0.95)",
      border: "2px solid #1f3a5a",
      borderRadius: 12,
      boxShadow: "0 0 30px rgba(0,0,0,0.8)",
      display: "flex",
      fontFamily: "'Orbitron', sans-serif", // Ideally load this font
      color: "#fff",
      overflow: "hidden",
      gap: 4
    }}>
      
      {/* --- COLUMN 1: PRIMARY TELEMETRY (Speed, Throttle, Brake) --- */}
      <div style={{ flex: 1, borderRight: "1px solid #1f3a5a", padding: 15, display: "flex", flexDirection: "column" }}>
        <h3 style={{ margin: "0 0 10px 0", fontSize: 12, color: "#8ab4f8", letterSpacing: 1 }}>PRIMARY TELEMETRY</h3>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", flex: 1 }}>
          
          {/* SPEED GAUGE */}
          <div style={{ position: "relative", width: 120, height: 120 }}>
            <svg width="120" height="120">
              {/* Back Track */}
              <path d={speedPath} fill="none" stroke="#1f3a5a" strokeWidth="8" strokeLinecap="round" />
              {/* Active Track */}
              <path d={speedFillPath} fill="none" stroke="#00d2be" strokeWidth="8" strokeLinecap="round" 
                    style={{ filter: "drop-shadow(0 0 5px #00d2be)" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 32, fontWeight: "bold" }}>{speed}</span>
              <span style={{ fontSize: 10, color: "#888", marginTop: -5 }}>MPH</span>
            </div>
          </div>

          {/* THROTTLE BAR */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
             <div style={{ width: 40, height: 80, background: "#111", border: "1px solid #333", borderRadius: 4, position: "relative", overflow: "hidden" }}>
                <div style={{ 
                  position: "absolute", bottom: 0, left: 0, right: 0, 
                  height: `${throttle}%`, 
                  background: "linear-gradient(to top, #00ff00, #88ff00)" 
                }} />
             </div>
             <div style={{ fontSize: 16, fontWeight: "bold" }}>{Math.round(throttle)}</div>
             <span style={{ fontSize: 9, color: "#888" }}>THROTTLE</span>
          </div>

           {/* BRAKE BAR */}
           <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
             <div style={{ width: 40, height: 80, background: "#111", border: "1px solid #333", borderRadius: 4, position: "relative", overflow: "hidden" }}>
                <div style={{ 
                  position: "absolute", bottom: 0, left: 0, right: 0, 
                  height: `${brake > 1 ? brake : brake * 100}%`, // Handle 0-1 or 0-100
                  background: "#ff0000" 
                }} />
             </div>
             <span style={{ fontSize: 16, fontWeight: "bold" }}>{Math.round(brake > 1 ? brake : brake * 100)}</span>
             <span style={{ fontSize: 9, color: "#888" }}>BRAKE</span>
          </div>
        </div>
      </div>

      {/* --- COLUMN 2: ENGINE DATA (RPM, Gear, Fuel?) --- */}
      <div style={{ flex: 1.2, borderRight: "1px solid #1f3a5a", padding: 15, display: "flex", flexDirection: "column" }}>
        <h3 style={{ margin: "0 0 10px 0", fontSize: 12, color: "#8ab4f8", letterSpacing: 1 }}>ENGINE DATA PANEL</h3>
        <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            
            {/* RPM GAUGE */}
            <svg width="200" height="150" viewBox="0 0 200 150">
               {/* Gradients */}
               <defs>
                 <linearGradient id="rpmGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#00d2be" />
                    <stop offset="70%" stopColor="#00d2be" />
                    <stop offset="85%" stopColor="#ffff00" />
                    <stop offset="100%" stopColor="#ff0000" />
                 </linearGradient>
               </defs>
               
               {/* Ticks */}
               {[0, 2, 4, 6, 8, 10, 12].map(k => {
                  return null;
               })}

               <path d={rpmPath} fill="none" stroke="#1f3a5a" strokeWidth="15" strokeLinecap="butt" />
               <path d={rpmFillPath} fill="none" stroke="url(#rpmGrad)" strokeWidth="15" strokeLinecap="butt" />
            </svg>

            <div style={{ position: "absolute", top: 80, display: "flex", flexDirection: "column", alignItems: "center" }}>
               <span style={{ fontSize: 12, color: "#888" }}>RPM</span>
               <span style={{ fontSize: 24, fontWeight: "bold" }}>{rpm}</span>
            </div>

            {/* GEAR INDICATOR (Right Side of RPM) */}
            <div style={{ position: "absolute", right: 20, top: 40, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#888" }}>GEAR</div>
                <div style={{ fontSize: 60, fontWeight: "bold", lineHeight: 1, color: "#fff" }}>
                   {gear === 0 ? "N" : gear}
                </div>
            </div>
        </div>
      </div>

      {/* --- COLUMN 3: STATUS (DRS, ERS, Strategy) --- */}
      <div style={{ width: 200, padding: 15, display: "flex", flexDirection: "column", gap: 20, justifyContent: "center" }}>
          <div>
            <div style={{ fontSize: 10, color: "#888" }}>DRS</div>
            <div style={{ 
              fontSize: 18, fontWeight: "bold", 
              color: isDrsActive ? "#00ff00" : "#888",
              textShadow: isDrsActive ? "0 0 10px #00ff00" : "none"
            }}>
              {drs}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: "#888" }}>TYRE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
               <div style={{ 
                 width: 14, height: 14, borderRadius: "50%", 
                 background: driver.compound?.includes("SOFT") ? "red" : 
                             driver.compound?.includes("MEDIUM") ? "yellow" : "white" 
               }} />
               <span style={{ fontSize: 14, fontWeight: "bold" }}>
                 {driver.compound || "SOFT"}
               </span>
            </div>
          </div>
          
           <div>
            <div style={{ fontSize: 10, color: "#888" }}>LAP</div>
            <div style={{ fontSize: 18, fontWeight: "bold" }}>{driver.lap}</div>
          </div>
      </div>

    </div>
  );
}
