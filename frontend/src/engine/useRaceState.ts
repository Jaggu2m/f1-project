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

/* ---- NEW TYPES FOR BACKEND DATA ---- */
type LapData = {
  lap: number;
  startTime: number; 
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
  track: { 
    points: { x: number; y: number }[];
    length?: number; 
  };
  drivers: Record<string, DriverData>;
  bestSectors?: {
    s1: number | null;
    s2: number | null;
    s3: number | null;
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

type SectorState = {
  // We no longer need to latch purely on frontend, but we might track "rendered" state
  // Actually, we can derive everything from RaceTime vs LapData
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
   (Used for gap calculation interpolation)
========================= */
/* =========================
   FIND TIME FOR GIVEN S (BINARY SEARCH)
   (Used for gap calculation interpolation)
========================= */
function findTimeForS(points: PositionPoint[], targetS: number) {
  if (!points.length) return 0;
  
  // Hande out of bounds
  if (targetS <= points[0].s) return points[0].t;
  if (targetS >= points[points.length - 1].s) return points[points.length - 1].t;

  // Binary Search for first point where points[i].s >= targetS
  let low = 0;
  let high = points.length - 1;
  
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].s < targetS) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  
  // Now 'low' is the index where points[low].s >= targetS
  // We want to interpolate between low-1 and low
  const i = low;
  const p0 = points[i - 1];
  const p1 = points[i];

  if (!p0) return p1.t; // Should not happen given bounds checks

  if (p1.s === p0.s) return p0.t;
  
  const ratio = (targetS - p0.s) / (p1.s - p0.s);
  return p0.t + ratio * (p1.t - p0.t);
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
    const globalBest = raceData.bestSectors || { s1: null, s2: null, s3: null };
    const trackLen = raceData.track.length || 58000;

    /* ---- Build live position state ---- */
    Object.values(raceData.drivers).forEach((driver) => {
      if (!driver || !driver.positions) return;

      const interp = interpolate(driver.positions, raceTime);
      if (!interp) return;

      const inPit = driver.pitStops?.some(
        (pit) => raceTime >= pit.enter && raceTime <= pit.exit
      ) ?? false;

      // Derive lap from cumulative distance (s / trackLength)
      // Backend s is cumulative distance; trackLen is the full circuit length
      const derivedLap = Math.max(1, Math.floor(interp.s / trackLen) + 1);

      // ---- REAL TIMING LOGIC ----
      const sectors: DriverState["sectors"] = { s1: null, s2: null, s3: null };
      
      const currentLapNum = derivedLap;
      
      // We need to look up this lap in driver.laps
      const lapData = driver.laps?.find(l => l.lap === currentLapNum);
      // Also check previous lap for sector latch fallback
      const prevLapData = driver.laps?.find(l => l.lap === currentLapNum - 1);
      
      if (lapData) {
        const { startTime, s1, s2, s3 } = lapData;
        const driverBest = driver.bestSectors || { s1: null, s2: null, s3: null };
        const EPSILON = 0.005;

        const getColor = (val: number, type: "s1" | "s2" | "s3") => {
           if (globalBest[type] && val <= globalBest[type]! + EPSILON) return "purple";
           if (driverBest[type] && val <= driverBest[type]! + EPSILON) return "green";
           return "yellow";
        };

        if (s1 && raceTime >= startTime + s1) {
          sectors.s1 = { time: s1, color: getColor(s1, "s1") };
        }
        
        if (s1 && s2 && raceTime >= startTime + s1 + s2) {
          sectors.s2 = { time: s2, color: getColor(s2, "s2") };
        }

        if (s1 && s2 && s3 && raceTime >= startTime + s1 + s2 + s3) {
           sectors.s3 = { time: s3, color: getColor(s3, "s3") };
        }
      } else if (prevLapData) {
        // Fallback: show previous lap's sectors if current lap data not yet available
        const driverBest = driver.bestSectors || { s1: null, s2: null, s3: null };
        const EPSILON = 0.005;
        const getColor = (val: number, type: "s1" | "s2" | "s3") => {
           if (globalBest[type] && val <= globalBest[type]! + EPSILON) return "purple";
           if (driverBest[type] && val <= driverBest[type]! + EPSILON) return "green";
           return "yellow";
        };
        const { s1, s2, s3 } = prevLapData;
        if (s1) sectors.s1 = { time: s1, color: getColor(s1, "s1") };
        if (s2) sectors.s2 = { time: s2, color: getColor(s2, "s2") };
        if (s3) sectors.s3 = { time: s3, color: getColor(s3, "s3") };
      }

      states.push({
        driverCode: driver.driverCode,
        teamColor: driver.teamColor,
        lap: derivedLap,
        s: interp.s,
        gap: 0, 
        interval: 0,
        inPit,
        sectors,
      });
    });

    // Sort by DISTANCE TRAVELED, not raw s.
    // Raw s is wrong because drivers behind the start line have initial s ≈ TRACK_LENGTH,
    // making them appear ahead. Distance traveled = current_s - first_s for each driver.
    const driverKeys = Object.keys(raceData.drivers);
    
    // Build a map of each driver's first s value (their starting position on the track)
    const firstSMap: Record<string, number> = {};
    driverKeys.forEach(key => {
      const d = raceData.drivers[key];
      if (d.positions && d.positions.length > 0) {
        firstSMap[d.driverCode] = d.positions[0].s;
      }
    });

    // Compute distance traveled for sorting
    states.forEach(d => {
      const firstS = firstSMap[d.driverCode] ?? 0;
      (d as any)._distanceTraveled = d.s - firstS;
    });

    // Stable sort: tiebreaker on driverCode prevents same-distance drivers from flickering
    states.sort((a, b) => {
      const diff = ((b as any)._distanceTraveled || 0) - ((a as any)._distanceTraveled || 0);
      if (Math.abs(diff) < 0.5) return a.driverCode.localeCompare(b.driverCode); // Stable tiebreaker
      return diff;
    });

    if (!states.length) return [];

    /* ---- Compute Gaps (Smoothed) ---- */
    const leader = states[0];
    const leaderKey = driverKeys.find(k => raceData.drivers[k].driverCode === leader.driverCode);
    const leaderData = leaderKey ? raceData.drivers[leaderKey] : null;

    if (!leaderData) return states;

    states.forEach((driverState, index) => {
      // 1. GAP TO LEADER
      if (index === 0) {
        driverState.gap = 0;
        driverState.interval = 0;
        return;
      }

      // Gap to leader (time-based)
      const leaderTimeAtSameS = findTimeForS(leaderData.positions, driverState.s);
      const rawGap = raceTime - leaderTimeAtSameS;
      // Round to 0.01s to prevent thousandths jitter, clamp noise to 0
      driverState.gap = rawGap > 0.05 ? Math.round(rawGap * 100) / 100 : 0;

      // 2. INTERVAL TO CAR AHEAD
      const ahead = states[index - 1];
      const aheadKey = driverKeys.find(k => raceData.drivers[k].driverCode === ahead.driverCode);
      const aheadData = aheadKey ? raceData.drivers[aheadKey] : null;

      if (aheadData) {
        const aheadTimeAtSameS = findTimeForS(aheadData.positions, driverState.s);
        const rawInterval = raceTime - aheadTimeAtSameS;
        // Round to 0.01s to prevent thousandths jitter, clamp noise to 0
        driverState.interval = rawInterval > 0.05 ? Math.round(rawInterval * 100) / 100 : 0;
      } else {
        driverState.interval = 0;
      }
    });

    return states;
  }, [raceData, raceTime]);
}
