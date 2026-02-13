import { useMemo } from "react";

type PositionPoint = {
  t: number;
  s: number;
  lap: number;
};

type PitStop = {
  lap: number;
  enter: number;
  exit: number;
};

type LapData = {
  lap: number;
  startTime: number; // seconds relative to race start
  s1: number | null;
  s2: number | null;
  s3: number | null;
};

type DriverData = {
  driverCode: string;
  team: string;
  teamColor: string;
  positions: PositionPoint[];
  pitStops?: PitStop[];
  laps?: LapData[];
  bestSectors?: {
    s1: number | null;
    s2: number | null;
    s3: number | null;
  };
};

export type RaceData = {
  track: { points: { x: number; y: number }[] };
  drivers: Record<string, DriverData>;
  bestSectors?: {
    s1: number;
    s2: number;
    s3: number;
  };
};

type DriverState = {
  driverCode: string;
  teamColor: string;
  lap: number;
  s: number;
  gap: number;
  interval: number;
  inPit: boolean;
  sectors: {
    s1: { time: number; color: "purple" | "green" | "yellow" } | null;
    s2: { time: number; color: "purple" | "green" | "yellow" } | null;
    s3: { time: number; color: "purple" | "green" | "yellow" } | null;
  };
};

/* =========================
   INTERPOLATE POSITION
========================= */
function interpolate(points: PositionPoint[], raceTime: number) {
  if (!points.length) return null;

  if (raceTime <= points[0].t) return points[0];
  if (raceTime >= points[points.length - 1].t)
    return points[points.length - 1];

  let i = 1;
  while (i < points.length && points[i].t < raceTime) i++;

  const p0 = points[i - 1];
  const p1 = points[i];

  const ratio = (raceTime - p0.t) / (p1.t - p0.t);

  return {
    t: raceTime,
    lap: p0.lap,
    s: p0.s + ratio * (p1.s - p0.s),
  };
}

/* =========================
   FIND TIME FOR GIVEN S
   (Used for gap calculation)
========================= */
function findTimeForS(points: PositionPoint[], targetS: number) {
  for (let i = 1; i < points.length; i++) {
    if (points[i].s >= targetS) {
      const p0 = points[i - 1];
      const p1 = points[i];

      const ratio = (targetS - p0.s) / (p1.s - p0.s);
      return p0.t + ratio * (p1.t - p0.t);
    }
  }

  return points[points.length - 1].t;
}

/* =========================
   MAIN HOOK
========================= */
export function useRaceState(
  raceData: RaceData | null,
  raceTime: number
): DriverState[] {
  return useMemo(() => {
    if (!raceData) return [];

    const states: DriverState[] = [];

    /* ---- Build live position state ---- */
    Object.values(raceData.drivers).forEach((driver) => {
      if (!driver || !driver.positions) {
        console.warn("⚠️ Invalid driver data encountered:", driver);
        return;
      }

      const interp = interpolate(driver.positions, raceTime);
      if (!interp) return;

      const inPit = driver.pitStops?.some(
        (pit) => raceTime >= pit.enter && raceTime <= pit.exit
      ) ?? false;

      // ---- SECTOR LOGIC ----
      const sectors: DriverState["sectors"] = { s1: null, s2: null, s3: null };
      
      if (driver.laps && raceData.bestSectors && driver.bestSectors) {
        // Find current lap data (backend uses 1-based lap, interp.lap is 0-based index)
        const currentLapNum = interp.lap + 1;
        const lapData = driver.laps.find(l => l.lap === currentLapNum);

        if (lapData) {
          const { startTime, s1, s2, s3 } = lapData;
          const { bestSectors: globalBest } = raceData;
          const { bestSectors: personalBest } = driver;
          const EPSILON = 0.005;

          // Helper to determine color
          const getColor = (time: number, sKey: "s1" | "s2" | "s3") => {
            if (globalBest[sKey] && Math.abs(time - globalBest[sKey]!) < EPSILON) return "purple";
            if (personalBest[sKey] && Math.abs(time - personalBest[sKey]!) < EPSILON) return "green";
            return "yellow";
          };

          // Check S1
          if (s1 && raceTime >= startTime + s1) {
             sectors.s1 = { time: s1, color: getColor(s1, "s1") };
          }
           // Check S2
          if (s1 && s2 && raceTime >= startTime + s1 + s2) {
             sectors.s2 = { time: s2, color: getColor(s2, "s2") };
          }
           // Check S3 (Lap finish)
          if (s1 && s2 && s3 && raceTime >= startTime + s1 + s2 + s3) {
             sectors.s3 = { time: s3, color: getColor(s3, "s3") };
          }
        }
      }

      states.push({
        driverCode: driver.driverCode,
        teamColor: driver.teamColor,
        lap: interp.lap,
        s: interp.s,
        gap: 0,
        interval: 0,
        inPit,
        sectors,
      });
    });

    /* ---- Create Lookup Map for Gap Calculation ---- */
    const driverMap: Record<string, DriverData> = {};
    Object.values(raceData.drivers).forEach(d => {
      driverMap[d.driverCode] = d;
    });

    /* ---- Sort by race position (distance) ---- */
    states.sort((a, b) => b.s - a.s);

    if (!states.length) return [];

    const leader = states[0];
    const leaderData = driverMap[leader.driverCode];

    if (!leaderData) return states;

      /* ---- Compute REAL time gaps & Intervals ---- */
    states.forEach((driverState, index) => {
      // 1. GAP TO LEADER
      if (index === 0) {
        driverState.gap = 0;
        driverState.interval = 0;
        return;
      }

      const lapDiffLeader = leader.lap - driverState.lap;
      if (lapDiffLeader > 0) {
        driverState.gap = -lapDiffLeader;
      } else {
        const leaderTimeAtSameS = findTimeForS(
          leaderData.positions,
          driverState.s
        );
        const g = raceTime - leaderTimeAtSameS;
        driverState.gap = g > 0 ? g : 0;
      }

      // 2. INTERVAL (Gap to car ahead)
      const ahead = states[index - 1];
      const lapDiffAhead = ahead.lap - driverState.lap;
      
      if (lapDiffAhead > 0) {
        driverState.interval = -lapDiffAhead;
      } else {
        const aheadData = driverMap[ahead.driverCode];
        if (aheadData) {
          const aheadTimeAtSameS = findTimeForS(
            aheadData.positions,
            driverState.s
          );
          const intv = raceTime - aheadTimeAtSameS;
          driverState.interval = intv > 0 ? intv : 0;
        }
      }
    });

    return states;
  }, [raceData, raceTime]);
}
