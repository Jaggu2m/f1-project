import { motion, AnimatePresence } from "framer-motion";
import { useRef, useEffect, useState } from "react";

type Props = {
  drivers: any[];
  totalLaps: number;
  selectedDrivers?: string[];
  onDriverSelect?: (driverCode: string) => void;
  isOpen: boolean;
  onToggle: () => void;
};

export default function RaceLeaderboard({ drivers, totalLaps, selectedDrivers = [], onDriverSelect, isOpen, onToggle }: Props) {
  const [committedOrder, setCommittedOrder] = useState<string[]>([]);
  const [overtakeMap, setOvertakeMap] = useState<Record<string, number>>({});
  
  const pendingOrderRef = useRef<string[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentLap = drivers[0]?.lap || 0;

  // Initialization
  useEffect(() => {
    if (committedOrder.length === 0 && drivers.length > 0) {
      setCommittedOrder(drivers.map(d => d.driverCode));
    }
  }, [drivers]);

  // Sync / Debounce Order Changes
  useEffect(() => {
    if (drivers.length === 0) return;
    
    const trueOrder = drivers.map(d => d.driverCode);
    const trueOrderStr = trueOrder.join(",");
    const committedOrderStr = committedOrder.join(",");

    if (trueOrderStr === committedOrderStr) {
       // Perfect sync 
       if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
       if (Object.keys(overtakeMap).length > 0) setOvertakeMap({});
       pendingOrderRef.current = [];
    } else {
       // Order is out of sync dynamically
       const newMap: Record<string, number> = {};
       trueOrder.forEach((code, trueIdx) => {
           const commIdx = committedOrder.indexOf(code);
           if (commIdx !== -1 && commIdx !== trueIdx) {
               newMap[code] = commIdx > trueIdx ? 1 : -1;
           }
       });
       setOvertakeMap(newMap);

       // Schedule visual swap
       if (pendingOrderRef.current.join(",") !== trueOrderStr) {
           if (timeoutRef.current) clearTimeout(timeoutRef.current);
           pendingOrderRef.current = trueOrder;
           timeoutRef.current = setTimeout(() => {
               setCommittedOrder(pendingOrderRef.current);
               setOvertakeMap({});
               timeoutRef.current = null;
           }, 500); // 0.5 second broadcast delay!
       }
    }
  }, [drivers, committedOrder]);

  const getTyreColor = (compound?: string) => {
    if (!compound) return "#444";
    if (compound.includes("SOFT")) return "#ff2e2e";
    if (compound.includes("MEDIUM")) return "#ffd000";
    if (compound.includes("HARD")) return "#ffffff";
    return "#888";
  };

  // Sort drivers based on frozen committedOrder so the layout doesn't violently snap instantly
  const displayDrivers = [...drivers].sort((a, b) => {
     const idxA = committedOrder.indexOf(a.driverCode);
     const idxB = committedOrder.indexOf(b.driverCode);
     if (idxA === -1) return 1;
     if (idxB === -1) return -1;
     return idxA - idxB;
  });

  return (
    <div
      style={{
        width: isOpen ? 420 : 200,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        color: "white",
        fontSize: 14,
        fontFamily: "sans-serif",
        padding: "20px 20px 20px 0",
        overflowY: "auto",
        transition: "width 0.3s ease"
      }}
    >
      {/* HEADER */}
      <div
        onClick={onToggle}
        title={isOpen ? "Click to minimize Leaderboard" : "Click to expand Leaderboard"}
        style={{
          background: "#e10600",
          padding: "12px 20px",
          borderRadius: 8,
          fontWeight: "bold",
          fontSize: 22,
          textAlign: "center",
          marginBottom: 10,
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <span>
            LAP {currentLap}{" "}
            <span style={{ opacity: 0.6, fontSize: 14 }}>
              / {totalLaps}
            </span>
        </span>
        <span style={{ fontSize: 16 }}>{isOpen ? "▼" : "▲"}</span>
      </div>

      <AnimatePresence>
        {isOpen && displayDrivers.map((d, i) => {
          const isLeader = i === 0;
          const isBattle = d.interval > 0 && d.interval < 1;
          const isSelected = selectedDrivers.includes(d.driverCode);

          // Pull from the frozen 1000ms Overtake map
          const positionChange = overtakeMap[d.driverCode] || 0;

          return (
            <motion.div
              layout
              key={d.driverCode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: d.inPit ? 0.5 : 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={() => onDriverSelect && onDriverSelect(d.driverCode)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: isSelected 
                  ? "#005f56" 
                  : isBattle
                  ? "rgba(255,255,0,0.08)"
                  : isLeader
                  ? "#1a1a1a"
                  : "rgba(0,0,0,0.6)",
                padding: isLeader ? "14px 18px" : "8px 12px",
                borderRadius: 6,
                borderLeft: `6px solid ${isSelected ? "#00d2be" : d.teamColor}`,
                cursor: "pointer",
                border: isSelected ? "1px solid #00d2be" : "1px solid transparent"
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
                <span style={{ fontSize: 12, minWidth: 20, textAlign: "center" }}>
                  {positionChange > 0 && (
                    <span style={{ color: "#00ff00", fontWeight: "bold" }}>
                      ▲
                    </span>
                  )}
                  {positionChange < 0 && (
                    <span style={{ color: "#ff3c3c", fontWeight: "bold" }}>
                      ▼
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
