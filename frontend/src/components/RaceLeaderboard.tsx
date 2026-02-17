import { motion, AnimatePresence } from "framer-motion";
import { useRef, useEffect } from "react";

type Props = {
  drivers: any[];
  totalLaps: number;
};

export default function RaceLeaderboard({ drivers, totalLaps }: Props) {
  const prevOrderRef = useRef<string[]>([]);

  const currentLap = drivers[0]?.lap || 0;

  // Track position change
  useEffect(() => {
    prevOrderRef.current = drivers.map(d => d.driverCode);
  }, [drivers]);

  const getTyreColor = (compound?: string) => {
    if (!compound) return "#444";
    if (compound.includes("SOFT")) return "#ff2e2e";
    if (compound.includes("MEDIUM")) return "#ffd000";
    if (compound.includes("HARD")) return "#ffffff";
    return "#888";
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        right: 20,
        width: 420,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        color: "white",
        fontSize: 14,
        fontFamily: "sans-serif",
        zIndex: 50
      }}
    >
      {/* HEADER */}
      <div
        style={{
          background: "#e10600",
          padding: "12px 20px",
          borderRadius: 8,
          fontWeight: "bold",
          fontSize: 22,
          textAlign: "center",
          marginBottom: 10
        }}
      >
        LAP {currentLap}{" "}
        <span style={{ opacity: 0.6, fontSize: 14 }}>
          / {totalLaps}
        </span>
      </div>

      <AnimatePresence>
        {drivers.map((d, i) => {
          const isLeader = i === 0;
          const isBattle = d.interval > 0 && d.interval < 1;

          const prevIndex = prevOrderRef.current.indexOf(d.driverCode);
          const positionChange =
            prevIndex !== -1 ? prevIndex - i : 0;

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
                background: isBattle
                  ? "rgba(255,255,0,0.08)"
                  : isLeader
                  ? "#1a1a1a"
                  : "rgba(0,0,0,0.6)",
                padding: isLeader ? "14px 18px" : "8px 12px",
                borderRadius: 6,
                borderLeft: `6px solid ${d.teamColor}`
              }}
            >
              {/* LEFT SIDE */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    width: 24,
                    fontWeight: "bold",
                    fontSize: isLeader ? 22 : 14,
                    color: isLeader ? "#ffd700" : "#ccc"
                  }}
                >
                  {i + 1}
                </span>

                {/* Position change */}
                <span style={{ fontSize: 12 }}>
                  {positionChange > 0 && (
                    <span style={{ color: "#00ff00" }}>
                      ▲{positionChange}
                    </span>
                  )}
                  {positionChange < 0 && (
                    <span style={{ color: "#ff3c3c" }}>
                      ▼{Math.abs(positionChange)}
                    </span>
                  )}
                </span>

                <span
                  style={{
                    fontWeight: "bold",
                    fontSize: isLeader ? 24 : 16
                  }}
                >
                  {d.driverCode}
                </span>

                {/* Tyre */}
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: getTyreColor(d.compound),
                    border: "1px solid #222"
                  }}
                />

                {d.inPit && (
                  <span
                    style={{
                      background: "#c00",
                      fontSize: 10,
                      padding: "2px 4px",
                      borderRadius: 3,
                      fontWeight: "bold"
                    }}
                  >
                    PIT
                  </span>
                )}
              </div>

              {/* RIGHT SIDE */}
              <div style={{ textAlign: "right", minWidth: 60 }}>
                {i === 0 ? (
                  "Interval"
                ) : (
                  `+${d.interval.toFixed(3)}`
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
