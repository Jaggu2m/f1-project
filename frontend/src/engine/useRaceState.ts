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

    /* ---- Build live position state ---- */
    Object.values(raceData.drivers).forEach((driver) => {
      if (!driver || !driver.positions) return;

      const interp = interpolate(driver.positions, raceTime);
      if (!interp) return;

      const inPit = driver.pitStops?.some(
        (pit) => raceTime >= pit.enter && raceTime <= pit.exit
      ) ?? false;

      // ---- REAL TIMING LOGIC ----
      const sectors: DriverState["sectors"] = { s1: null, s2: null, s3: null };
      
      // We look at previous laps (history) AND current lap (if sector finished)
      // Actually, standard HUD shows CURRENT lap's sectors as they complete.
      // So we find the LapData for the current lap (or previous if just finished).
      
      // Strategy: Iterate all laps up to current. Fill sectors. 
      // If we want "Flash latest", we focus on current lap.
      // If we want "Leaderboard table", we usually show the current LATEST completed sectors of the ongoing lap.
      
      // 1. Find Data for the lap coincident with raceTime
      // NOTE: interp.lap is 0-based in positions? Backend says lap "1" is first lap. 
      // Let's check backend. py: `lap_no = int(lap["LapNumber"])` -> 1-based.
      // py positions: `lap = lap_no - 1` -> 0-based.
      // So interp.lap + 1 = LapNumber.
      
      const currentLapNum = interp.lap + 1;
      
      // We need to look up this lap in driver.laps
      const lapData = driver.laps?.find(l => l.lap === currentLapNum);
      
      if (lapData) {
        const { startTime, s1, s2, s3 } = lapData;
        const driverBest = driver.bestSectors || { s1: null, s2: null, s3: null };
        const EPSILON = 0.005;

        // Helper for Colors
        const getColor = (val: number, type: "s1" | "s2" | "s3") => {
           // Purple: Global Best (ignoring floating point noise)
           if (globalBest[type] && val <= globalBest[type]! + EPSILON) return "purple";
           // Green: Personal Best
           if (driverBest[type] && val <= driverBest[type]! + EPSILON) return "green";
           // Yellow: Standard
           return "yellow";
        };

        // Reveal logic: If raceTime > startTime + sectorDuration, show it.
        // S1
        if (s1 && raceTime >= startTime + s1) {
          sectors.s1 = { time: s1, color: getColor(s1, "s1") };
        }
        
        // S2 (Revealed when S1+S2 done)
        if (s1 && s2 && raceTime >= startTime + s1 + s2) {
          sectors.s2 = { time: s2, color: getColor(s2, "s2") };
        }

        // S3 (Revealed when lap done)
        if (s1 && s2 && s3 && raceTime >= startTime + s1 + s2 + s3) {
           sectors.s3 = { time: s3, color: getColor(s3, "s3") };
        }
      }

      // Fallback: If we are in "Lap 2", we might want to keep showing Lap 1's times until new S1?
      // Ususally F1 leaderboard clears sectors on new lap start. 
      // Current logic clears them because `lapData` switches to new lap (where s1 not detected yet).
      // This mimics real TV behavior (empty until S1 line). perfect.

      states.push({
        driverCode: driver.driverCode,
        teamColor: driver.teamColor,
        lap: interp.lap, // 0-based used for sorting usually
        s: interp.s,
        gap: 0, 
        interval: 0,
        inPit,
        sectors,
      });
    });

    // Sort by Total Distance (s) descending
    // Note: Backend 's' is already cumulative (Race Distance), so a simple sort works.
    states.sort((a, b) => b.s - a.s);

    if (!states.length) return [];

    /* ---- Compute Gaps (Same as before) ---- */
    const leader = states[0];
    const leaderData = raceData.drivers[Object.keys(raceData.drivers).find(k => raceData.drivers[k].driverCode === leader.driverCode)!];

    if (!leaderData) return states;

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

      // 2. INTERVAL
      const ahead = states[index - 1];
      const lapDiffAhead = ahead.lap - driverState.lap;
      
      if (lapDiffAhead > 0) {
        driverState.interval = -lapDiffAhead;
      } else {
        const aheadCode = ahead.driverCode;
        const aheadDriverKey = Object.keys(raceData.drivers).find(k => raceData.drivers[k].driverCode === aheadCode);
        const aheadData = aheadDriverKey ? raceData.drivers[aheadDriverKey] : null;

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
