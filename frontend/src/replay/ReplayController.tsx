import { useEffect, useRef, useState } from "react";
import RaceRenderer from "../engine/RaceRenderer";

type RaceData = {
  drivers: Record<string, { positions: { t: number }[] }>;
};

export default function ReplayController() {
  const [raceTime, setRaceTime] = useState(0);
  const [maxTime, setMaxTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  /* =========================
     LOAD RACE DURATION (ONCE)
  ========================== */
  useEffect(() => {
    fetch("/race_positions_silverstone_2023_lapaware.json")
      .then(res => res.json())
      .then((data: RaceData) => {
        let maxT = 0;
        Object.values(data.drivers).forEach(d => {
          if (!d.positions.length) return;
          maxT = Math.max(maxT, d.positions[d.positions.length - 1].t);
        });

        setMaxTime(maxT);
        setRaceTime(0);
        setPlaying(false);
      });
  }, []);

  /* =========================
     TIME ENGINE (PURE)
  ========================== */
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
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

  /* =========================
     CONTROLS
  ========================== */
  const play = () => setPlaying(true);
  const pause = () => setPlaying(false);

  const reset = () => {
    setPlaying(false);
    setRaceTime(0);
    lastFrameRef.current = null;
  };

  return (
    <div>
      {/* 🎥 Renderer */}
      <RaceRenderer raceTime={raceTime} />

      {/* 🎛 Controls */}
      <div style={{ marginTop: 12 }}>
        <button onClick={play}>Play</button>
        <button onClick={pause}>Pause</button>
        <button onClick={reset}>Reset</button>
      </div>

      {/* 🧭 Timeline */}
      <div style={{ marginTop: 10 }}>
        <input
          type="range"
          min={0}
          max={maxTime}
          step={0.05}
          value={raceTime}
          onChange={e => {
            setRaceTime(Number(e.target.value));
            lastFrameRef.current = null; // 🔑 important
          }}
          style={{ width: 900 }}
        />
      </div>

      {/* ⚡ Speed */}
      <div style={{ marginTop: 10 }}>
        {[0.5, 1, 2, 4].map(s => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            style={{
              fontWeight: speed === s ? "bold" : "normal",
              marginRight: 6,
            }}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
