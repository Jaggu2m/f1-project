import { useMemo, useRef } from "react";

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
  compound?: "SOFT" | "MEDIUM" | "HARD" | string;
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

export type DriverState = {
  driverCode: string;
  teamColor: string;
  lap: number;
  s: number;
  gap: number;
  interval: number;
  inPit: boolean;
  compound?: "SOFT" | "MEDIUM" | "HARD" | string;
  positionChange?: number;
};

/* =========================
   INTERPOLATE POSITION
   (Unchanged)
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
   FIND TIME FOR GIVEN S (BINARY SEARCH)
   (Unchanged)
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
  
  const prevOrderRef = useRef<string[]>([]);

  return useMemo(() => {
    if (!raceData) return [];

    const states: DriverState[] = [];
    const trackLen = raceData.track.length || 58000;

    // Silverstone 2023 Grid (Approximate/Verified)
    const GRID_ORDER = [
      "VER", "NOR", "PIA", "LEC", "SAI", "RUS", "HAM", "ALB", "ALO", "GAS",
      "HUL", "STR", "OCO", "TSU", "ZHO", "DEV", "MAG", "BOT", "SAR", "PER" // PER pit lane start or back
    ];

    /* ---- Build live position state ---- */
    Object.values(raceData.drivers).forEach((driver) => {
      if (!driver || !driver.positions) return;

      const interp = interpolate(driver.positions, raceTime);
      if (!interp) return;

      const inPit = driver.pitStops?.some(
        (pit) => raceTime >= pit.enter && raceTime <= pit.exit
      ) ?? false;

      // Derived lap
      const derivedLap = Math.max(1, Math.floor(interp.s / trackLen) + 1);
      
      // GRID SYNTHESIS:
      // If at start (raceTime ~ 0), force drivers into grid formation behind start line
      // to fix visual clumping and leaderboard randomness.
      let displayS = interp.s;
      
      // Check if we are effectively at the start (e.g. first 2 seconds or raw s is effectively 0/start-offset)
      // The data showed clumps at 918, 735 etc. which is weird, but let's trust raceTime 0.
      if (raceTime < 1.0) {
        const gridIndex = GRID_ORDER.indexOf(driver.driverCode);
        if (gridIndex !== -1) {
           // Place them behind start line (trackLen). 
           // P1 at Line, P2 -8m, etc.
           // s is cumulative, so s at start line is 0 (or trackLen if wrapping? usually 0 is start).
           // If 0 is start, then behind is trackLen - offset.
           displayS = trackLen - (gridIndex * 16); // 16m spacing (generous gap)
        }
      }

      // Mock compound data since it's missing from the JSON
      // Deterministic mock based on driverCode length or char code
      const mockCompounds = ["SOFT", "MEDIUM", "HARD"];
      const compoundIndex = (driver.driverCode.charCodeAt(0) + driver.driverCode.length) % 3;
      const compound = driver.compound || mockCompounds[compoundIndex];

      states.push({
        driverCode: driver.driverCode,
        teamColor: driver.teamColor,
        lap: derivedLap,
        s: displayS, // Use modified S
        gap: 0, 
        interval: 0,
        inPit,
        compound,
        positionChange: 0, 
      });
    });

    // Compute distance traveled for gap calculation
    const driverKeys = Object.keys(raceData.drivers);
    const firstSMap: Record<string, number> = {};
    
    driverKeys.forEach(key => {
      const d = raceData.drivers[key];
      if (d.positions && d.positions.length > 0) {
        firstSMap[d.driverCode] = d.positions[0].s;
      }
    });

    states.forEach(d => {
      const firstS = firstSMap[d.driverCode] ?? 0;
      (d as any)._distanceTraveled = d.s - firstS;
    });

    // Stable sort
    states.sort((a, b) => {
      const diff = ((b as any)._distanceTraveled || 0) - ((a as any)._distanceTraveled || 0);
      
      // Tiebreaker: Use starting grid position (firstS)
      // This ensures that at the start (when distanceTraveled is 0 for all), 
      // the cars are ordered by their grid position (higher s = further ahead on grid).
      if (Math.abs(diff) < 0.5) {
        const firstSA = firstSMap[a.driverCode] ?? 0;
        const firstSB = firstSMap[b.driverCode] ?? 0;
        return firstSB - firstSA;
      }
      return diff;
    });

    if (!states.length) return [];

    /* ---- Compute Gaps & Intervals ---- */
    const leader = states[0];
    const leaderKey = driverKeys.find(k => raceData.drivers[k].driverCode === leader.driverCode);
    const leaderData = leaderKey ? raceData.drivers[leaderKey] : null;

    states.forEach((driverState, index) => {
      // 1. GAP TO LEADER
      if (index === 0) {
        driverState.gap = 0;
        driverState.interval = 0;
      } else if (leaderData) {
         // Distance traveled by this driver
        const myDistTraveled = (driverState as any)._distanceTraveled || 0;
        const leaderFirstS = firstSMap[leader.driverCode] ?? 0;
        const leaderSAtSameDist = myDistTraveled + leaderFirstS;
        
        const leaderTimeAtSameS = findTimeForS(leaderData.positions, leaderSAtSameDist);
        const rawGap = raceTime - leaderTimeAtSameS;
        driverState.gap = rawGap > 0.001 ? Math.round(rawGap * 1000) / 1000 : 0;

        // 2. INTERVAL
        const ahead = states[index - 1];
        const aheadKey = driverKeys.find(k => raceData.drivers[k].driverCode === ahead.driverCode);
        const aheadData = aheadKey ? raceData.drivers[aheadKey] : null;

        if (aheadData) {
          const aheadFirstS = firstSMap[ahead.driverCode] ?? 0;
          const aheadSAtSameDist = myDistTraveled + aheadFirstS;
          const aheadTimeAtSameS = findTimeForS(aheadData.positions, aheadSAtSameDist);
          const rawInterval = raceTime - aheadTimeAtSameS;
          driverState.interval = rawInterval > 0.001 ? Math.round(rawInterval * 1000) / 1000 : 0;
        }
      }

      // 3. Position Change
      // Compare current index with previous index from ref
      // Note: This logic works frame-to-frame. 
      // If we want change since "start", we'd need fixed starting grid.
      // But typically "positionChange" implies change since start or prev lap.
      // The user prompted "calculate positionChange", and the component has logic "prevOrderRef".
      // Let's implement frame-to-frame change here for correctness of the hook spec.
      const prevIndex = prevOrderRef.current.indexOf(driverState.driverCode);
      if (prevIndex !== -1) {
        // e.g. was 0 (leader), now 1 (2nd). change = 0 - 1 = -1 (down)
        // e.g. was 5, now 2. change = 5 - 2 = +3 (up)
        driverState.positionChange = prevIndex - index;
      } else {
        driverState.positionChange = 0;
      }
    });

    // Update previous order ref for next frame
    prevOrderRef.current = states.map(s => s.driverCode);

    return states;
  }, [raceData, raceTime]);
}
