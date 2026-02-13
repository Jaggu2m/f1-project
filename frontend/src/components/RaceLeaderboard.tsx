import { motion, AnimatePresence } from "framer-motion";

type Props = {
  drivers: any[];
  totalLaps: number;
};

export default function RaceLeaderboard({ drivers, totalLaps }: Props) {
  const currentLap = drivers[0]?.lap || 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        right: 20,
        bottom: 20,
        width: 450,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        color: "white",
        fontSize: 14,
        fontFamily: "sans-serif",
        zIndex: 50
      }}
    >
      {/* LAP COUNTER HEADER */}
      <div style={{
        background: "#e10600",
        color: "white",
        padding: "12px 20px",
        borderRadius: 8,
        fontWeight: "bold",
        fontSize: 24,
        textAlign: "center",
        marginBottom: 10,
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
      }}>
        LAP {currentLap} <span style={{ opacity: 0.6, fontSize: 16 }}>/ {totalLaps}</span>
      </div>
      <AnimatePresence>
        {drivers.map((d, i) => {
          const isLeader = i === 0;
          return (
            <motion.div
              layout
              key={d.driverCode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: d.inPit ? 0.5 : 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: isLeader ? "#1a1a1a" : "rgba(0,0,0,0.6)",
                padding: isLeader ? "16px 20px" : "8px 12px",
                borderRadius: isLeader ? 8 : 4,
                borderLeft: `6px solid ${d.teamColor}`,
                flex: isLeader ? "0 0 auto" : "1 1 auto",
                // Leader specific scaling
                transformOrigin: "right center",
                boxShadow: isLeader ? "0 4px 12px rgba(0,0,0,0.5)" : "none",
                marginBottom: isLeader ? 12 : 0,
                minHeight: 0 // Allow shrinking if squashed
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ 
                  width: 24, 
                  fontWeight: "bold", 
                  fontSize: isLeader ? 24 : 14,
                  color: isLeader ? "#ffd700" : "#ccc"
                }}>
                  {i + 1}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ 
                    fontWeight: "bold", 
                    fontSize: isLeader ? 28 : 16,
                    letterSpacing: isLeader ? 1 : 0
                  }}>
                    {d.driverCode}
                  </span>
                  {d.inPit && (
                    <span style={{
                      background: "#c00",
                      color: "#fff",
                      fontSize: 10,
                      padding: "2px 4px",
                      borderRadius: 3,
                      fontWeight: "bold"
                    }}>
                      PIT
                    </span>
                  )}
                </div>
              </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* SECTORS */}
              <div style={{ display: "flex", gap: 4 }}>
                {[d.sectors?.s1, d.sectors?.s2, d.sectors?.s3].map((s, idx) => (
                   <div key={idx} style={{ 
                     width: 42, 
                     textAlign: "center",
                     fontSize: 12,
                     fontWeight: "bold",
                     color: !s ? "#333" : s.color === "purple" ? "#d205df" : s.color === "green" ? "#00ff00" : "#ffcc00"
                   }}>
                     {s ? s.time.toFixed(1) : ""}
                   </div>
                ))}
              </div>

              {/* INTERVAL */}
              <div style={{ width: 50, textAlign: "right" }}>
                 <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>INT</div>
                 <div style={{ fontSize: isLeader ? 14 : 12, color: "#aaa" }}>
                    {i === 0 
                      ? "—" 
                      : d.interval < 0 
                        ? `+${Math.abs(d.interval)}L`
                        : `+${d.interval.toFixed(3)}`
                    }
                 </div>
              </div>

              {/* GAP */}
              <div style={{ width: 50, textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>GAP</div>
                <div style={{ 
                  fontSize: isLeader ? 14 : 12, 
                  color: isLeader ? "#aaa" : "#888" 
                }}>
                  {d.gap === 0 && isLeader
                    ? "—"
                    : d.gap < 0
                    ? `+${Math.abs(d.gap)}L`
                    : `+${d.gap.toFixed(3)}`}
                </div>
              </div>
            </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
