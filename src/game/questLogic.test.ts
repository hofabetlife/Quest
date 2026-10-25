import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkNode1,
  evaluateNode1SliderCommit,
  getFacingDirection,
  getExpectedNode1Params,
  decodeCaesar,
  checkNode2,
  getExpectedNode2Slots,
  checkNucleoPhase,
  calculateControlSum,
  verifyFinalKey,
  checkNode5Stars,
  checkDoorWires,
  advanceDoorManifold,
  evaluateDoorCardSwipe,
  checkDoorBreakers,
  checkDoorShields,
  isNode1AllCorrect,
  evaluateNode1Task3Attempt,
  NODE1_TASK3_STEP,
  NODE1_TASK3_MAX_ATTEMPTS,
  getRoverSlotBudget,
  expandRoverStructuredProgram,
  simulateRover,
} from './questLogic.ts';
import {
  PLAYER_SPAWN,
  SHIP_ROOMS,
  SHIP_DOORS,
  OBSTACLES,
  PROP_COLLIDERS,
  FLASHLIGHT_APERTURE_RADIUS,
  isPassablePoint,
  resolveCollision,
  findPathOnShip,
  getTerminalStandPoint,
  getDoorBlockingRoomAt,
  castLightRay,
  getFlashlightReflectorOrigin,
  computeLightConePolygon,
  getCharacterLayoutMetrics,
  getPlayerSortY,
  getCirclePropSortY,
  getRectPropSortY,
  isPlayerBehindCircleProp,
  isPlayerBehindRectProp,
} from './shipMap.ts';

test('Player spawn is passable and can move freely in all 4 directions with 4-directional facing and proper arm/backpack/shoulder proportions', () => {
  assert.equal(isPassablePoint(PLAYER_SPAWN.x, PLAYER_SPAWN.y, 16), true);

  const right = resolveCollision(PLAYER_SPAWN.x, PLAYER_SPAWN.y, 1, 0, 5, 16);
  assert.equal(right.x > PLAYER_SPAWN.x, true);
  assert.equal(getFacingDirection(1, 0, 'down'), 'right');

  const left = resolveCollision(PLAYER_SPAWN.x, PLAYER_SPAWN.y, -1, 0, 5, 16);
  assert.equal(left.x < PLAYER_SPAWN.x, true);
  assert.equal(getFacingDirection(-1, 0, 'down'), 'left');

  const down = resolveCollision(PLAYER_SPAWN.x, PLAYER_SPAWN.y, 0, 1, 5, 16);
  assert.equal(down.y > PLAYER_SPAWN.y, true);
  assert.equal(getFacingDirection(0, 1, 'left'), 'down');

  const up = resolveCollision(PLAYER_SPAWN.x, PLAYER_SPAWN.y, 0, -1, 5, 16);
  assert.equal(up.y < PLAYER_SPAWN.y, true);
  assert.equal(getFacingDirection(0, -1, 'right'), 'up');

  // Verify character layout metrics for 'down' and 'up':
  // 1) In 'down' view, backpackWidth (18) must be strictly narrower than torsoWidth (25)
  const downMetrics = getCharacterLayoutMetrics('down');
  assert.equal(downMetrics.backpackWidth < downMetrics.torsoWidth, true);
  assert.equal(downMetrics.hasTwoSideArms, true);
  assert.equal(downMetrics.leftArmX < -12, true);
  assert.equal(downMetrics.rightArmX > 12, true);

  // 2) In 'up' view, character also has two symmetrical arms on the left and right sides of the torso
  const upMetrics = getCharacterLayoutMetrics('up');
  assert.equal(upMetrics.hasTwoSideArms, true);
  assert.equal(upMetrics.leftArmX < -12, true);
  assert.equal(upMetrics.rightArmX > 12, true);

  // 3) In 'right' and 'left' profile views, shoulderPivotX is shifted to the side/back of the torso away from the front visor
  const rightMetrics = getCharacterLayoutMetrics('right');
  assert.equal((rightMetrics.shoulderPivotX ?? 0) < -2, true);
  const leftMetrics = getCharacterLayoutMetrics('left');
  assert.equal((leftMetrics.shoulderPivotX ?? 0) > 2, true);
});

test('Flashlight emerges as a truncated cone across the full reflector exit aperture radius and is held on the side arm in up/down views', () => {
  // Facing right (aimAngle = 0): shoulder pivotX is shifted to the side/back of torso (1200 - 4.5 = 1195.5), reflectorDist = 21.5 -> reflEast.x = 1217.0
  const reflEast = getFlashlightReflectorOrigin(1200, 880, 0, 0, 'right');
  assert.equal(Math.abs(reflEast.pivotX - 1195.5) < 0.01, true);
  assert.equal(Math.abs(reflEast.x - 1217.0) < 0.01, true);
  assert.equal(Math.abs(reflEast.y - 876.5) < 0.01, true);
  assert.equal(reflEast.apertureRadius, FLASHLIGHT_APERTURE_RADIUS);

  // Facing down (aimAngle = PI/2): flashlight is held in the right-side arm (pivotX = 1200 + 13.5 = 1213.5), NOT in the center (1200)!
  const reflDown = getFlashlightReflectorOrigin(1200, 880, Math.PI / 2, 0, 'down');
  assert.equal(Math.abs(reflDown.pivotX - 1213.5) < 0.01, true);
  assert.equal(Math.abs(reflDown.x - 1213.5) < 0.01, true);

  // Flashlight cone polygon near base is cut off flat across the full exit aperture diameter (2 * 7.5 = 15px)
  const conePoly = computeLightConePolygon(
    reflEast.x,
    reflEast.y,
    0,
    0.52,
    400,
    32,
    reflEast.apertureRadius
  );
  const firstPt = conePoly[0];
  const lastPt = conePoly[conePoly.length - 1];
  const apertureSpan = Math.hypot(lastPt.x - firstPt.x, lastPt.y - firstPt.y);
  assert.equal(
    Math.abs(apertureSpan - FLASHLIGHT_APERTURE_RADIUS * 2) < 0.1,
    true,
    `Near base of flashlight beam must span full exit aperture diameter (${FLASHLIGHT_APERTURE_RADIUS * 2}px), got ${apertureSpan}`
  );

  // Standing near NW corner of Cafeteria (x=960, y=610), west wall is at x=920 (corridor is down at y=660..800)
  const hitWallWest = castLightRay(960, 610, Math.PI, 400);
  assert.equal(hitWallWest.hitWall, true);
  assert.equal(
    hitWallWest.dist < 50,
    true,
    `Ray toward solid west wall at (960,610) must stop at wall x=920, got dist=${hitWallWest.dist}`
  );

  // Diagonal ray aimed directly into the NW corner of Cafeteria (920, 580) from (960, 620)
  // Must NOT overshoot west past x=916 (prevents corner light spikes!)
  const cornerAngle = Math.atan2(580 - 620, 920 - 960);
  const hitCorner = castLightRay(960, 620, cornerAngle, 400);
  assert.equal(hitCorner.hitWall, true);
  assert.equal(
    hitCorner.x >= 915,
    true,
    `Diagonal ray at NW corner must not bleed sideways past west wall x=920, got x=${hitCorner.x}`
  );

  // Standing in front of open west corridor (x=960, y=730), ray goes straight down the corridor
  const openCorridorWest = castLightRay(960, 730, Math.PI, 350);
  assert.equal(
    openCorridorWest.dist >= 340,
    true,
    `Ray down open corridor at (960,730) should travel unhindered, got dist=${openCorridorWest.dist}`
  );

  // Room 5 (airlock / Observation Dome) is circular (center 1200, 210, r=175):
  // Center is passable (away from terminal at 1200,165), while corner of its bounding box (1035, 50) is outside the circle!
  assert.equal(isPassablePoint(1200, 240, 14), true);
  assert.equal(isPassablePoint(1035, 50, 4), false);
});

test('Volumetric 2.5D props in all rooms block movement and resolveCollision prevents walking over them', () => {
  assert.equal(PROP_COLLIDERS.length >= 20, true);
  // Check centers of key volumetric props across rooms are impassable:
  // Room 1 south drafting/turbofan table (x: 270..382, y: 500..550)
  assert.equal(isPassablePoint(325, 525, 14), false);
  // Room 2 (Fuel Storage & Processing) cryo silo #1 (x: 1922..1990, y: 214..284) & distillation column (x: 2152..2236, y: 318..434)
  assert.equal(isPassablePoint(1956, 248, 14), false);
  assert.equal(isPassablePoint(2194, 375, 14), false);
  // Room 3 (Rover & Robotics Bay) 6-wheel rover chassis (x: 196..294, y: 1086..1154) & west PCB workbench (x: 148..206, y: 1218..1362)
  assert.equal(isPassablePoint(245, 1120, 14), false);
  assert.equal(isPassablePoint(175, 1290, 14), false);
  // Room 4 (Reactor) south master command desk (x: 1966..2194, y: 1346..1400)
  assert.equal(isPassablePoint(2080, 1373, 14), false);

  // Verify resolveCollision stops player when walking south into the Rover chassis in Room 3
  const stepIntoRover = resolveCollision(245, 1068, 0, 1, 10, 14);
  assert.equal(stepIntoRover.y <= 1072.1, true);
});

test('Pathfinding and continuous physics movement carry player from spawn to all 6 terminals including central core', () => {
  assert.equal(SHIP_ROOMS.length, 6);
  for (const room of SHIP_ROOMS) {
    const stand = getTerminalStandPoint(room);
    const path = findPathOnShip(PLAYER_SPAWN.x, PLAYER_SPAWN.y, stand.x, stand.y);
    assert.equal(
      path.length > 0,
      true,
      `Path to ${room.id} (${room.name}) should not be empty`
    );

    // Simulate step-by-step movement along path using resolveCollision
    let px = PLAYER_SPAWN.x;
    let py = PLAYER_SPAWN.y;
    const waypoints = [...path];
    let steps = 0;
    while (waypoints.length > 0 && steps < 900) {
      steps++;
      const wp = waypoints[0];
      const toX = wp.x - px;
      const toY = wp.y - py;
      const dist = Math.hypot(toX, toY);
      if (dist < 10) {
        waypoints.shift();
        continue;
      }
      const next = resolveCollision(px, py, toX / dist, toY / dist, 6.2, 14);
      px = next.x;
      py = next.y;
    }

    const finalDistToTerminal = Math.hypot(px - room.terminalX, py - room.terminalY);
    assert.equal(
      finalDistToTerminal <= 92,
      true,
      `Continuous walk to ${room.id} must arrive within interaction range (got ${finalDistToTerminal} after ${steps} steps)`
    );
  }

  // Also test pathfinding into the new Southern Medical Department (medbay_south) and around its Central MRI/Surgical Pod (1200, 1525)
  assert.equal(isPassablePoint(1200, 1300, 14), true, 'Southern corridor to Medical Department must be passable');
  assert.equal(isPassablePoint(1200, 1440, 14), true, 'Medical Department central lobby must be passable');
  assert.equal(isPassablePoint(1200, 1525, 14), false, 'Central Robotic Surgical & MRI Pod at (1200,1525) must block movement');
  assert.equal(isPassablePoint(956, 1463, 14), false, 'West Bio-Regeneration Med-Bed #1 must block movement');
  assert.equal(isPassablePoint(1444, 1548, 14), false, 'East Bio-Regeneration Med-Bed #4 must block movement');

  const obstaclePairs = [
    { name: 'Command Center SW Tactical Console', sx: 1008, sy: 860, tx: 1008, ty: 994 },
    { name: 'Command Center Central Core', sx: 1200, sy: 870, tx: 1200, ty: 660 },
    { name: 'Room 3 Rover Chassis', sx: 245, sy: 1055, tx: 245, ty: 1185 },
    { name: 'Click directly inside NW Server Rack (snaps to passable boundary)', sx: 1200, sy: 880, tx: 998, ty: 625 },
    { name: 'Spawn to Southern Medical Department behind Central MRI Pod', sx: 1200, sy: 880, tx: 1200, ty: 1615 },
  ];

  for (const pair of obstaclePairs) {
    const path = findPathOnShip(pair.sx, pair.sy, pair.tx, pair.ty);
    assert.equal(path.length > 0, true, `Path for ${pair.name} must exist`);
    let px = pair.sx;
    let py = pair.sy;
    const waypoints = [...path];
    let steps = 0;
    while (waypoints.length > 0 && steps < 600) {
      steps++;
      const wp = waypoints[0];
      const toX = wp.x - px;
      const toY = wp.y - py;
      const dist = Math.hypot(toX, toY);
      if (dist < 10) {
        waypoints.shift();
        continue;
      }
      const next = resolveCollision(px, py, toX / dist, toY / dist, 5.2, 14);
      px = next.x;
      py = next.y;
    }
    const finalWp = path[path.length - 1];
    const distToGoal = Math.hypot(px - finalWp.x, py - finalWp.y);
    assert.equal(
      distToGoal <= 14,
      true,
      `Obstacle-avoidance walk for ${pair.name} must reach final waypoint without getting stuck (dist=${distToGoal}, steps=${steps})`
    );
  }
});

test('Bulkhead doors block rooms when closed, allow pathfinding to door stand points, and validate all 5 Among Us door mini-puzzles', () => {
  assert.equal(SHIP_DOORS.length, 5);
  const allClosed = new Set<number>([1, 2, 3, 4, 5]);

  for (const door of SHIP_DOORS) {
    // Center of closed door is impassable
    assert.equal(
      isPassablePoint(door.cx, door.cy, 14, allClosed),
      false,
      `Closed door ${door.doorId} center must block movement`
    );
    // Stand point in front of closed door is passable and reachable from spawn
    assert.equal(
      isPassablePoint(door.standX, door.standY, 14, allClosed),
      true,
      `Door ${door.doorId} stand point must be passable while closed`
    );
    const pathToDoor = findPathOnShip(
      PLAYER_SPAWN.x,
      PLAYER_SPAWN.y,
      door.standX,
      door.standY,
      allClosed
    );
    assert.equal(
      pathToDoor.length > 0,
      true,
      `Player must be able to pathfind from spawn to closed door ${door.doorId} stand point`
    );
  }

  // Clicking inside Cockpit (310, 360) while Door 1 is closed identifies Door 1 as blocking
  const blocking1 = getDoorBlockingRoomAt(310, 360, allClosed);
  assert.equal(blocking1?.doorId, 1);

  // Puzzle 1: Fix Wiring
  assert.equal(checkDoorWires({ red: 'red', blue: 'blue', yellow: 'yellow' }), false);
  assert.equal(
    checkDoorWires({ red: 'red', blue: 'blue', yellow: 'yellow', magenta: 'magenta' }),
    true
  );

  // Puzzle 2: Unlock Manifolds (1..8)
  let step = 0;
  for (let n = 1; n <= 8; n++) {
    const res = advanceDoorManifold(n, step, 8);
    assert.equal(res.valid, true);
    assert.equal(res.completed, n === 8);
    step = res.nextStep;
  }
  const wrongManifold = advanceDoorManifold(5, 2, 8);
  assert.equal(wrongManifold.valid, false);
  assert.equal(wrongManifold.nextStep, 0);

  // Puzzle 3: Swipe Card
  assert.equal(evaluateDoorCardSwipe(0.95, 500).accepted, true);
  assert.equal(evaluateDoorCardSwipe(0.5, 500).accepted, false);

  // Puzzle 4: Power Breakers
  assert.equal(checkDoorBreakers([true, true, false, true]), false);
  assert.equal(checkDoorBreakers([true, true, true, true]), true);

  // Puzzle 5: Prime Shields (7 hexagons)
  assert.equal(checkDoorShields([true, true, true, false, true, true, true]), false);
  assert.equal(checkDoorShields([true, true, true, true, true, true, true]), true);
});

test('Node 1 electrical check logic and commit-on-release slider behavior', () => {
  const norm = getExpectedNode1Params('normal');
  assert.equal(checkNode1(norm, 'normal'), true);
  assert.equal(checkNode1({ u: 50, f: 100, i: 40 }, 'normal'), false);

  // Dragging the 3rd slider across the right value (65) WITHOUT releasing (isReleased = false) must NOT solve!
  const initialCommitted = { u: 100, f: 200, i: 40 };
  const midDrag = evaluateNode1SliderCommit(norm, initialCommitted, false, 'normal');
  assert.equal(midDrag.solved, false);
  assert.deepEqual(midDrag.nextCommitted, initialCommitted);

  // Releasing the slider at the right value (isReleased = true) commits and solves!
  const onRelease = evaluateNode1SliderCommit(norm, initialCommitted, true, 'normal');
  assert.equal(onRelease.solved, true);
  assert.deepEqual(onRelease.nextCommitted, norm);

  // isNode1AllCorrect is true ONLY when all 3 values are currently correct and not dragging
  assert.equal(isNode1AllCorrect(norm, norm, false, 'normal'), true);
  // If user subsequently drags a slider away from the correct value, green highlight immediately turns off:
  assert.equal(isNode1AllCorrect({ u: 105, f: 200, i: 65 }, norm, true, 'normal'), false);
  // If user releases a slider on a wrong value, green highlight stays off:
  const wrongAfter = { u: 105, f: 200, i: 65 };
  assert.equal(isNode1AllCorrect(wrongAfter, wrongAfter, false, 'normal'), false);

  const hard = getExpectedNode1Params('hard');
  assert.equal(checkNode1(hard, 'hard'), true);
  assert.equal(checkNode1(norm, 'hard'), false);
  assert.equal(isNode1AllCorrect(hard, hard, false, 'hard'), true);
  assert.equal(isNode1AllCorrect({ u: 80, f: 150, i: 105 }, hard, false, 'hard'), false);

  // Task 3 anti-bruteforce: step=1 and 3 wrong changes on Task 3 trip protection & reset
  assert.equal(NODE1_TASK3_STEP, 1);
  assert.equal(NODE1_TASK3_MAX_ATTEMPTS, 3);

  const attempt1 = evaluateNode1Task3Attempt(
    { u: 100, f: 200, i: 40 },
    { u: 100, f: 200, i: 51 },
    'normal',
    3
  );
  assert.equal(attempt1.solved, false);
  assert.equal(attempt1.attemptsLeft, 2);
  assert.equal(attempt1.trippedProtection, false);

  const attempt2 = evaluateNode1Task3Attempt(
    attempt1.nextCommitted,
    { u: 100, f: 200, i: 52 },
    'normal',
    attempt1.attemptsLeft
  );
  assert.equal(attempt2.solved, false);
  assert.equal(attempt2.attemptsLeft, 1);
  assert.equal(attempt2.trippedProtection, false);

  const attempt3 = evaluateNode1Task3Attempt(
    attempt2.nextCommitted,
    { u: 100, f: 200, i: 53 },
    'normal',
    attempt2.attemptsLeft
  );
  assert.equal(attempt3.solved, false);
  assert.equal(attempt3.trippedProtection, true);
  assert.deepEqual(attempt3.nextCommitted, { u: 50, f: 100, i: 40 });
});

test('Node 3 cell budget (6 in normal pure loop, 8 in hard with 4 inside + 3 outside) and simulation', () => {
  const normalBudget = getRoverSlotBudget('normal');
  assert.equal(normalBudget.totalCells, 6);
  assert.equal(normalBudget.loopBodyCells, 5); // 1 loop cell + 5 loop body cells = 6 cells total
  assert.equal(normalBudget.outsideCells, 0); // no outside-loop section in normal mode

  const hardBudget = getRoverSlotBudget('hard');
  assert.equal(hardBudget.totalCells, 8);
  assert.equal(hardBudget.loopBodyCells, 4); // 4 cells inside loop
  assert.equal(hardBudget.outsideCells, 3); // 3 cells outside loop (1 + 4 + 3 = 8 cells total)

  // Normal mode solved by LOOP3 + 5 commands inside loop (6 cells total including loop):
  const normalExpanded = expandRoverStructuredProgram('LOOP3', [
    'FWD2',
    'Z_UP',
    'RIGHT',
    'FWD2',
    'RIGHT',
  ]);
  const normalSim = simulateRover(normalExpanded, 'normal');
  assert.equal(normalSim.success, true);
  assert.equal(normalSim.time, 20);

  // Hard mode solved by LOOP3 + 4 commands inside loop + 3 commands outside loop:
  const hardExpanded = expandRoverStructuredProgram(
    'LOOP3',
    ['FWD2', 'Z_UP', 'HYPER', 'FWD1'],
    ['LEFT', 'FWD2', 'HYPER']
  );
  const hardSim = simulateRover(hardExpanded, 'hard');
  assert.equal(hardSim.success, true);
  assert.equal(hardSim.time, 19);
});

test('Node 2 Caesar decipher and slot breakers check', () => {
  const testCipher = 'БВГ';
  assert.equal(decodeCaesar(testCipher, 1), 'АБВ');

  const normSlots = getExpectedNode2Slots('normal');
  assert.equal(checkNode2(13, normSlots, 'normal'), true);
  assert.equal(checkNode2(12, normSlots, 'normal'), false);

  const hardSlots = getExpectedNode2Slots('hard');
  assert.equal(checkNode2(19, hardSlots, 'hard'), true);
  assert.equal(checkNode2(19, normSlots, 'hard'), false);
});

test('Node 4 Nucleosynthesis phases', () => {
  assert.equal(checkNucleoPhase(1, 2, 1, 2, 'normal'), true);
  assert.equal(checkNucleoPhase(2, 6, 7, 5, 'normal'), true);
  assert.equal(checkNucleoPhase(3, 26, 30, 26, 'normal'), true);
  assert.equal(checkNucleoPhase(3, 26, 30, 25, 'normal'), false);

  assert.equal(checkNucleoPhase(1, 3, 4, 2, 'hard'), true);
  assert.equal(checkNucleoPhase(2, 11, 12, 9, 'hard'), true);
  assert.equal(checkNucleoPhase(3, 27, 32, 24, 'hard'), true);
});

test('Node 5 Star classification and Central Core Key verification', () => {
  assert.equal(checkNode5Stars(['O', 'R', 'I', 'O', 'N'], 'normal'), true);
  assert.equal(checkNode5Stars(['I', 'N', 'O', 'O', 'R'], 'normal'), false);
  assert.equal(checkNode5Stars(['C', 'Y', 'G', 'N', 'U', 'S'], 'hard'), true);

  const normalSum = calculateControlSum({
    node1U: 100,
    node1F: 200,
    node1I: 65,
    rotorShift: 13,
    slots: [24, 15, 8, 5],
    roverTime: 20,
    massNumberA: 56,
  });
  assert.equal(normalSum, 506);
  assert.equal(verifyFinalKey('ORION-506', 'normal'), true);
  assert.equal(verifyFinalKey('orion-506', 'normal'), true);
  assert.equal(verifyFinalKey('ORION-505', 'normal'), false);

  const hardSum = calculateControlSum({
    node1U: 75,
    node1F: 150,
    node1I: 105,
    rotorShift: 19,
    slots: [30, 24, 9, 2],
    roverTime: 19,
    massNumberA: 59,
  });
  assert.equal(hardSum, 492);
  assert.equal(verifyFinalKey('CYGNUS-492', 'hard'), true);
  assert.equal(verifyFinalKey('cygnus-492', 'hard'), true);
  assert.equal(verifyFinalKey('CYGNUS-500', 'hard'), false);
});

test('Audio manager exposes 5 musical themes switcher and sound methods without throwing', async () => {
  const { sound, MUSIC_THEMES } = await import('../utils/audio.ts');
  assert.equal(MUSIC_THEMES.length, 5);
  assert.equal(sound.getMusicTheme(), 'interstellar');

  const next1 = sound.nextMusicTheme();
  assert.equal(next1, 'synthwave');
  assert.equal(sound.getMusicTheme(), 'synthwave');

  const prev1 = sound.prevMusicTheme();
  assert.equal(prev1, 'interstellar');

  sound.setMusicTheme('cyberpunk');
  assert.equal(sound.getMusicTheme(), 'cyberpunk');
  sound.setMusicTheme('interstellar');

  assert.equal(typeof sound.playStep, 'function');
  assert.equal(typeof sound.playFootstep, 'function');
  assert.equal(typeof sound.playSuccess, 'function');
  assert.equal(typeof sound.playTaskSuccess, 'function');
  assert.equal(typeof sound.playTerminalClick, 'function');
  assert.equal(typeof sound.playClick, 'function');
  assert.equal(typeof sound.playWarpJump, 'function');
  assert.equal(typeof sound.playAsteroidImpact, 'function');
  assert.equal(typeof sound.playBlackHoleIntro, 'function');
  assert.equal(typeof sound.playWarn, 'function');
  assert.equal(typeof sound.playAirlockEscape, 'function');
  assert.equal(typeof sound.playDoorOpen, 'function');
  assert.equal(typeof sound.playWireSnap, 'function');
  assert.doesNotThrow(() => {
    sound.playStep();
    sound.playSuccess();
    sound.playTerminalClick();
    sound.playClick();
    sound.playWarpJump();
    sound.playAsteroidImpact();
    sound.playBlackHoleIntro();
    sound.playDoorOpen();
    sound.playWireSnap();
  });
});

test('2.5D depth sorting places Daniil behind (on a lower layer than) every elevated obstacle and prop when standing north of it', () => {
  const playerRadius = 14;

  // 1. All circular 2.5D obstacles (Central Core, Aircraft Model Pedestals, Rover, Tokamak, Medbay MRI Pod, Node Terminals)
  for (const obs of OBSTACLES) {
    // Closest valid Y position when Daniil stands directly north (above) the circular obstacle
    const northPlayerY = obs.y - obs.r - playerRadius - 1;
    // Closest valid Y position when Daniil stands directly south (below) the circular obstacle
    const southPlayerY = obs.y + obs.r + playerRadius + 1;

    assert.equal(
      isPlayerBehindCircleProp(northPlayerY, obs.y),
      true,
      `Daniil standing north of circular obstacle "${obs.label}" (py=${northPlayerY}, cy=${obs.y}) must be rendered on a lower layer (behind it)`
    );
    assert.equal(
      isPlayerBehindCircleProp(southPlayerY, obs.y),
      false,
      `Daniil standing south of circular obstacle "${obs.label}" (py=${southPlayerY}, cy=${obs.y}) must be rendered on a higher layer (in front of it)`
    );
    assert.equal(getPlayerSortY(northPlayerY) < getCirclePropSortY(obs.y), true);
  }

  // 2. All rectangular 2.5D prop colliders (Command desks, drafting table, fuel silos, processing skid, workbenches, Medbay beds & racks)
  for (const prop of PROP_COLLIDERS) {
    // Closest valid Y position when Daniil stands directly north (above) the rectangular prop
    const northPlayerY = prop.y - playerRadius - 1;
    // Closest valid Y position when Daniil stands directly south (below) the rectangular prop
    const southPlayerY = prop.y + prop.h + playerRadius + 1;

    assert.equal(
      isPlayerBehindRectProp(northPlayerY, prop.y, prop.h),
      true,
      `Daniil standing north of rectangular prop "${prop.label}" (py=${northPlayerY}, y=${prop.y}, h=${prop.h}) must be rendered on a lower layer (behind it)`
    );
    assert.equal(
      isPlayerBehindRectProp(southPlayerY, prop.y, prop.h),
      false,
      `Daniil standing south of rectangular prop "${prop.label}" (py=${southPlayerY}, y=${prop.y}, h=${prop.h}) must be rendered on a higher layer (in front of it)`
    );
    assert.equal(getPlayerSortY(northPlayerY) < getRectPropSortY(prop.y, prop.h), true);
  }
});
