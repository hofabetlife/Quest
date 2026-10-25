export type Difficulty = 'normal' | 'hard';
export type FacingDirection = 'down' | 'up' | 'left' | 'right';

export interface Node1Params {
  u: number;
  f: number;
  i: number;
}

export function checkNode1(params: Node1Params, difficulty: Difficulty): boolean {
  const { u, f, i } = params;
  if (difficulty === 'normal') {
    return u + f + i === 365 && u * i === 6500 && f - u === 100;
  } else {
    return u + f + i === 330 && u * f === 11250 && f - i === 45;
  }
}

/**
 * Evaluates Node 1 sliders ONLY when the user releases the slider (`isReleased === true`).
 * Dragging a slider across the correct value without releasing (`isReleased === false`)
 * keeps the previous committed state and never prematurely unlocks the puzzle.
 */
export function evaluateNode1SliderCommit(
  draftParams: Node1Params,
  committedParams: Node1Params,
  isReleased: boolean,
  difficulty: Difficulty
): { nextCommitted: Node1Params; solved: boolean } {
  if (!isReleased) {
    return {
      nextCommitted: committedParams,
      solved: checkNode1(committedParams, difficulty),
    };
  }
  const nextCommitted = { ...draftParams };
  return {
    nextCommitted,
    solved: checkNode1(nextCommitted, difficulty),
  };
}

/**
 * Computes the 4-directional astronaut orientation ('up', 'down', 'left', 'right')
 * from a 2D movement vector (dx, dy).
 */
export function getFacingDirection(
  dx: number,
  dy: number,
  prev: FacingDirection = 'down'
): FacingDirection {
  const mag = Math.hypot(dx, dy);
  if (mag < 0.01) return prev;
  if (Math.abs(dy) > Math.abs(dx) * 1.05) {
    return dy < 0 ? 'up' : 'down';
  }
  return dx < 0 ? 'left' : 'right';
}

export function getExpectedNode1Params(difficulty: Difficulty): Node1Params {
  return difficulty === 'normal'
    ? { u: 100, f: 200, i: 65 }
    : { u: 75, f: 150, i: 105 };
}

export const ALPHABET_RU = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ";

export function decodeCaesar(text: string, shift: number): string {
  let out = "";
  for (const ch of text) {
    const idx = ALPHABET_RU.indexOf(ch);
    out += idx !== -1 ? ALPHABET_RU[(idx - shift + 32) % 32] : ch;
  }
  return out;
}

export function checkNode2(shift: number, slots: (number | null)[], difficulty: Difficulty): boolean {
  const targetShift = difficulty === 'normal' ? 13 : 19;
  if (shift !== targetShift) return false;
  if (slots.length !== 4 || slots.some(s => s === null)) return false;
  
  const [s0, s1, s2, s3] = slots as number[];
  const sig = s0 * 100000 + s1 * 1000 + s2 * 10 + s3;
  return difficulty === 'normal' ? sig === 2415085 : sig === 3024092;
}

export function getExpectedNode2Slots(difficulty: Difficulty): number[] {
  return difficulty === 'normal' ? [24, 15, 8, 5] : [30, 24, 9, 2];
}

export interface RoverSimulationResult {
  success: boolean;
  time: number;
  beaconsCollected: number;
  crashed: boolean;
  message: string;
  finalPos: { x: number; y: number; z: number; w: number };
}

export function simulateRover(
  program: string[],
  difficulty: Difficulty
): RoverSimulationResult {
  const activeCmds = program.filter(Boolean);
  if (activeCmds.length === 0) {
    return {
      success: false,
      time: 0,
      beaconsCollected: 0,
      crashed: false,
      message: 'Буфер программы пуст',
      finalPos: { x: 0, y: 0, z: 0, w: 0 },
    };
  }

  let expandedQueue: string[] = [];
  const firstCmd = activeCmds[0];
  const isLoop2 = firstCmd === 'LOOP2';
  const isLoop3 = firstCmd === 'LOOP3';

  if (isLoop2 || isLoop3) {
    const count = isLoop2 ? 2 : 3;
    if (difficulty === 'hard') {
      const loopBody = program.slice(1, 5).filter(Boolean);
      const tailCmds = program.slice(5, 8).filter(Boolean);
      for (let k = 0; k < count; k++) expandedQueue.push(...loopBody);
      expandedQueue.push(...tailCmds);
    } else {
      const body = activeCmds.slice(1);
      for (let k = 0; k < count; k++) expandedQueue.push(...body);
    }
  } else {
    expandedQueue = [...activeCmds];
  }

  let atomicSteps: string[] = [];
  for (const cmd of expandedQueue) {
    if (cmd === 'FWD1') atomicSteps.push('STEP');
    else if (cmd === 'FWD2') atomicSteps.push('STEP', 'STEP');
    else if (cmd === 'RIGHT') atomicSteps.push('RIGHT');
    else if (cmd === 'LEFT') atomicSteps.push('LEFT');
    else if (cmd === 'Z_UP') atomicSteps.push('Z_UP');
    else if (cmd === 'HYPER') atomicSteps.push('HYPER');
  }

  const cratersNormal = [[1, 1, 0, 0], [0, 2, 0, 0], [1, 1, 1, 0], [2, 2, 2, 0], [1, 1, 2, 0]];
  const beaconsNormal = [[2, 0, 1, 0], [0, 2, 2, 0]];
  const targetNormal = [2, 2, 3, 0];

  const cratersHard = [[1, 1, 0, 0], [2, 1, 0, 0], [1, 1, 1, 1], [0, 1, 2, 1], [1, 2, 0, 1]];
  const beaconsHard = [[2, 0, 1, 1], [1, 0, 2, 1], [2, 2, 1, 0]];
  const targetHard = [0, 2, 1, 1];

  const craters = difficulty === 'normal' ? cratersNormal : cratersHard;
  const beacons = difficulty === 'normal' ? beaconsNormal : beaconsHard;
  const target = difficulty === 'normal' ? targetNormal : targetHard;

  let x = 0, y = 0, z = 0, w = 0, dir = 0; // dir: 0: +x, 1: +y, 2: -x, 3: -y
  let time = 0;
  const collected = new Set<number>();

  for (const act of atomicSteps) {
    time += 1;
    if (act === 'RIGHT') {
      dir = (dir + 1) % 4;
    } else if (act === 'LEFT') {
      dir = (dir + 3) % 4;
    } else if (act === 'Z_UP') {
      const maxZ = difficulty === 'normal' ? 4 : 3;
      z = (z + 1) % maxZ;
    } else if (act === 'HYPER') {
      w = 1 - w;
      dir = (dir + 1) % 4;
    } else if (act === 'STEP') {
      const dx = [1, 0, -1, 0][dir];
      const dy = [0, 1, 0, -1][dir];
      let nx = x + dx;
      let ny = y + dy;
      let nz = z;
      let nw = w;

      if (difficulty === 'normal') {
        if (nx < 0 || nx > 2 || ny < 0 || ny > 2) {
          return {
            success: false,
            time,
            beaconsCollected: collected.size,
            crashed: true,
            message: 'АВАРИЯ: Выход за границы 3D-куба',
            finalPos: { x: nx, y: ny, z: nz, w: nw },
          };
        }
      } else {
        if (nx > 2) { nx = 0; nw = 1 - nw; nz = 2 - nz; }
        else if (nx < 0) { nx = 2; nw = 1 - nw; nz = 2 - nz; }
        if (ny > 2) { ny = 0; nw = 1 - nw; nz = 2 - nz; }
        else if (ny < 0) { ny = 2; nw = 1 - nw; nz = 2 - nz; }
      }
      x = nx; y = ny; z = nz; w = nw;
    }

    if (craters.some(([cx, cy, cz, cw]) => cx === x && cy === y && cz === z && cw === w)) {
      return {
        success: false,
        time,
        beaconsCollected: collected.size,
        crashed: true,
        message: 'АВАРИЯ: Столкновение с кратером / сингулярностью',
        finalPos: { x, y, z, w },
      };
    }

    beacons.forEach(([bx, by, bz, bw], idx) => {
      if (bx === x && by === y && bz === z && bw === w) {
        collected.add(idx);
      }
    });

    if (x === target[0] && y === target[1] && z === target[2] && w === target[3]) {
      break;
    }
  }

  const reached = (x === target[0] && y === target[1] && z === target[2] && w === target[3]);
  const maxAllowedTime = difficulty === 'normal' ? 20 : 19;
  const reqBeacons = difficulty === 'normal' ? 2 : 3;
  const success = reached && time <= maxAllowedTime && collected.size === reqBeacons;

  return {
    success,
    time,
    beaconsCollected: collected.size,
    crashed: false,
    message: success ? 'Маршрут успешно завершён!' : 'Цель не достигнута или собраны не все маяки',
    finalPos: { x, y, z, w },
  };
}

export function checkNucleoPhase(
  phase: number,
  p: number,
  n: number,
  e: number,
  difficulty: Difficulty
): boolean {
  if (difficulty === 'normal') {
    if (phase === 1) return p === 2 && n === 1 && e === 2; // He-3
    if (phase === 2) return p === 6 && n === 7 && e === 5; // 13C+
    if (phase === 3) return p === 26 && n === 30 && e === 26; // 56Fe
  } else {
    if (phase === 1) return p === 3 && n === 4 && e === 2; // 7Li+
    if (phase === 2) return p === 11 && n === 12 && e === 9; // 23Na2+
    if (phase === 3) return p === 27 && n === 32 && e === 24; // 59Co3+
  }
  return false;
}

export function calculateControlSum(params: {
  node1U: number;
  node1F: number;
  node1I: number;
  rotorShift: number;
  slots: number[];
  roverTime: number;
  massNumberA: number;
}): number {
  const sumNode1 = params.node1U + params.node1F + params.node1I;
  const slotsSum = params.slots.reduce((acc, v) => acc + (v || 0), 0);
  return sumNode1 + params.rotorShift + slotsSum + params.roverTime + params.massNumberA;
}

export function verifyFinalKey(rawKey: string, difficulty: Difficulty): boolean {
  const cleanKey = rawKey.trim().toUpperCase();
  let wSum = 0;
  let sSum = 0;
  for (let i = 0; i < cleanKey.length; i++) {
    const c = cleanKey.charCodeAt(i);
    wSum += c * (i + 1);
    sSum += c;
  }

  if (difficulty === 'normal') {
    return cleanKey.length === 9 && wSum === 2679 && sSum === 591 && cleanKey.charCodeAt(0) === 79; // ORION-506
  } else {
    return cleanKey.length === 10 && wSum === 3437 && sSum === 677 && cleanKey.charCodeAt(0) === 67; // CYGNUS-492
  }
}

export function checkNode5Stars(letters: string[], difficulty: Difficulty): boolean {
  const word = letters.join('').trim().toUpperCase();
  return difficulty === 'normal' ? word === 'ORION' : word === 'CYGNUS';
}

export const DOOR_WIRE_COLORS = ['red', 'blue', 'yellow', 'magenta'] as const;
export type DoorWireColor = (typeof DOOR_WIRE_COLORS)[number];

export function checkDoorWires(connections: Partial<Record<DoorWireColor, DoorWireColor>>): boolean {
  return DOOR_WIRE_COLORS.every((color) => connections[color] === color);
}

export function advanceDoorManifold(
  clickedNumber: number,
  currentStep: number,
  totalButtons: number = 8
): { valid: boolean; nextStep: number; completed: boolean } {
  if (clickedNumber === currentStep + 1) {
    const nextStep = currentStep + 1;
    return {
      valid: true,
      nextStep,
      completed: nextStep >= totalButtons,
    };
  }
  return {
    valid: false,
    nextStep: 0,
    completed: false,
  };
}

export function evaluateDoorCardSwipe(
  progress: number,
  durationMs: number
): { accepted: boolean; status: 'ok' | 'incomplete' | 'too_fast' | 'too_slow' } {
  if (progress < 0.85) {
    return { accepted: false, status: 'incomplete' };
  }
  if (durationMs < 80) {
    return { accepted: false, status: 'too_fast' };
  }
  if (durationMs > 4500) {
    return { accepted: false, status: 'too_slow' };
  }
  return { accepted: true, status: 'ok' };
}

export function checkDoorBreakers(breakers: boolean[]): boolean {
  return breakers.length === 4 && breakers.every(Boolean);
}

export function checkDoorShields(hexagons: boolean[]): boolean {
  return hexagons.length === 7 && hexagons.every(Boolean);
}


