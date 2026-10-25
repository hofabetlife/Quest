import React, { useEffect, useRef, useState } from 'react';
import { ActiveTask, DoorId, SuitColor, TaskState, UnlockedDoorsState } from '../types.ts';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  PLAYER_SPAWN,
  SHIP_ROOMS,
  SHIP_DOORS,
  WALKABLE_ZONES,
  resolveCollision,
  getRoomNameAt,
  findPathOnShip,
  computeLightConePolygon,
  getFlashlightReflectorOrigin,
  getTerminalStandPoint,
  getDoorBlockingRoomAt,
  getPlayerSortY,
  getCirclePropSortY,
  getRectPropSortY,
} from '../game/shipMap.ts';
import { FacingDirection, getFacingDirection } from '../game/questLogic.ts';
import { sound } from '../utils/audio.ts';

interface Sortable25DItem {
  sortY: number;
  label: string;
  draw: () => void;
}

interface ShipCanvasProps {
  resetKey?: number;
  suitColor: SuitColor;
  tasks: TaskState;
  unlockedDoors: UnlockedDoorsState;
  activeTask: ActiveTask;
  activeDoor: DoorId | null;
  onOpenTask: (task: ActiveTask) => void;
  onOpenDoor: (doorId: DoorId | null) => void;
  onUnlockDoor: (doorId: DoorId) => void;
  onRoomChange: (roomName: string) => void;
}

const SUIT_PALETTE: Record<SuitColor, { main: string; dark: string; visor: string; glow: string }> = {
  cyan: { main: '#06b6d4', dark: '#0e7490', visor: '#bae6fd', glow: 'rgba(6,182,212,0.5)' },
  red: { main: '#ef4444', dark: '#b91c1c', visor: '#bae6fd', glow: 'rgba(239,68,68,0.5)' },
  gold: { main: '#eab308', dark: '#a16207', visor: '#bae6fd', glow: 'rgba(234,179,8,0.5)' },
  lime: { main: '#22c55e', dark: '#15803d', visor: '#bae6fd', glow: 'rgba(34,197,94,0.5)' },
  purple: { main: '#a855f7', dark: '#6b21a8', visor: '#bae6fd', glow: 'rgba(168,85,247,0.5)' },
  orange: { main: '#f97316', dark: '#c2410c', visor: '#bae6fd', glow: 'rgba(249,115,22,0.5)' },
  white: { main: '#f8fafc', dark: '#94a3b8', visor: '#38bdf8', glow: 'rgba(248,250,252,0.5)' },
  dark: { main: '#334155', dark: '#0f172a', visor: '#38bdf8', glow: 'rgba(56,189,248,0.5)' },
};

// Non-repeating pseudo-random hash so stars never form diagonal modulo grid stripes
const fractHash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
};

const STAR_CLUSTER_CENTERS = [
  { cx: -320, cy: 180, spread: 240 },
  { cx: 760, cy: -140, spread: 220 },
  { cx: 1680, cy: 90, spread: 260 },
  { cx: 2620, cy: 740, spread: 280 },
  { cx: -240, cy: 1320, spread: 250 },
  { cx: 680, cy: 1620, spread: 210 },
  { cx: 1740, cy: 1640, spread: 230 },
  { cx: 2540, cy: 1580, spread: 260 },
];

const STARS = Array.from({ length: 2200 }, (_, i) => {
  const h1 = fractHash(i * 1.13 + 0.17);
  const h2 = fractHash(i * 2.71 + 19.31);
  const h3 = fractHash(i * 4.09 + 73.19);
  const h4 = fractHash(i * 6.37 + 149.7);

  // 22% of stars belong to organic open star clusters / Milky Way band, 78% scatter freely across deep space
  let x: number;
  let y: number;
  if (i % 5 === 0) {
    const cl = STAR_CLUSTER_CENTERS[i % STAR_CLUSTER_CENTERS.length];
    const angle = h1 * Math.PI * 2;
    const dist = Math.pow(h2, 0.7) * cl.spread;
    x = cl.cx + Math.cos(angle) * dist;
    y = cl.cy + Math.sin(angle) * dist * 0.75;
  } else {
    x = -1100 + h1 * 4600;
    y = -850 + h2 * 3550;
  }

  const r =
    h3 > 0.94
      ? 2.8 + (h4 - 0.5) * 0.7
      : h3 > 0.76
      ? 2.0 + h4 * 0.45
      : h3 > 0.42
      ? 1.35 + h4 * 0.35
      : 0.85 + h4 * 0.35;

  const palette = ['#ffffff', '#bae6fd', '#fef08a', '#fecdd3', '#ddd6fe', '#fed7aa', '#a7f3d0'];
  const color = h4 > 0.45 ? '#ffffff' : palette[Math.floor(h4 * 100) % palette.length];

  return {
    x,
    y,
    r,
    alpha: 0.65 + h3 * 0.35,
    twinklePhase: h4 * Math.PI * 2,
    twinkleSpeed: 0.015 + (h3 * 0.025),
    isBright: h3 > 0.89,
    color,
  };
});

export const ShipCanvas: React.FC<ShipCanvasProps> = ({
  resetKey = 0,
  suitColor,
  tasks,
  unlockedDoors,
  activeTask,
  activeDoor,
  onOpenTask,
  onOpenDoor,
  onUnlockDoor,
  onRoomChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lightCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const playerRef = useRef({
    x: PLAYER_SPAWN.x,
    y: PLAYER_SPAWN.y,
    vx: 0,
    vy: 0,
    facing: 1,
    facingDir: 'right' as FacingDirection,
    aimAngle: 0,
    walkCycle: 0,
    path: [] as { x: number; y: number }[],
    targetTerminal: null as ActiveTask,
    targetDoor: null as DoorId | null,
  });

  const unlockedDoorsRef = useRef<UnlockedDoorsState>(unlockedDoors);
  unlockedDoorsRef.current = unlockedDoors;

  // Smooth 0..1 vertical lift animation progress for each of the 5 bulkhead doors
  const doorLiftProgressRef = useRef<Record<DoorId, number>>({
    1: unlockedDoors[1] ? 1 : 0,
    2: unlockedDoors[2] ? 1 : 0,
    3: unlockedDoors[3] ? 1 : 0,
    4: unlockedDoors[4] ? 1 : 0,
    5: unlockedDoors[5] ? 1 : 0,
  });

  const getClosedDoorSet = (): Set<number> => {
    const set = new Set<number>();
    for (const d of SHIP_DOORS) {
      if (!unlockedDoorsRef.current[d.doorId] && doorLiftProgressRef.current[d.doorId] < 0.75) {
        set.add(d.doorId);
      }
    }
    return set;
  };

  // Persistent fading footprints left behind by Daniil
  const footprintsRef = useRef<
    {
      x: number;
      y: number;
      angle: number;
      isLeft: boolean;
      createdAt: number;
    }[]
  >([]);
  const lastFootprintPosRef = useRef<{ x: number; y: number }>({
    x: PLAYER_SPAWN.x,
    y: PLAYER_SPAWN.y,
  });
  const nextFootLeftRef = useRef<boolean>(true);

  // Dota 2 style click-to-move ground animations
  const clickEffectsRef = useRef<
    {
      x: number;
      y: number;
      createdAt: number;
      isTerminalTarget: boolean;
    }[]
  >([]);

  // Default camera zoom is closer to Daniil (1.38), adjustable via mouse wheel
  const cameraRef = useRef({
    x: PLAYER_SPAWN.x,
    y: PLAYER_SPAWN.y,
    zoom: 1.38,
  });

  const keysRef = useRef<Record<string, boolean>>({});
  const [nearbyTerminal, setNearbyTerminal] = useState<ActiveTask>(null);
  const nearbyTerminalRef = useRef<ActiveTask>(null);
  const [nearbyDoor, setNearbyDoor] = useState<DoorId | null>(null);
  const nearbyDoorRef = useRef<DoorId | null>(null);
  const lastStepSoundRef = useRef<number>(0);
  const stuckFramesRef = useRef<number>(0);
  const lastRenderOrderRef = useRef<{
    playerSortY: number;
    backgroundLabels: string[];
    foregroundLabels: string[];
  }>({
    playerSortY: 0,
    backgroundLabels: [],
    foregroundLabels: [],
  });

  useEffect(() => {
    playerRef.current = {
      x: PLAYER_SPAWN.x,
      y: PLAYER_SPAWN.y,
      vx: 0,
      vy: 0,
      facing: 1,
      facingDir: 'right',
      aimAngle: 0,
      walkCycle: 0,
      path: [],
      targetTerminal: null,
      targetDoor: null,
    };
    cameraRef.current = {
      x: PLAYER_SPAWN.x,
      y: PLAYER_SPAWN.y,
      zoom: 1.38,
    };
    doorLiftProgressRef.current = {
      1: unlockedDoorsRef.current[1] ? 1 : 0,
      2: unlockedDoorsRef.current[2] ? 1 : 0,
      3: unlockedDoorsRef.current[3] ? 1 : 0,
      4: unlockedDoorsRef.current[4] ? 1 : 0,
      5: unlockedDoorsRef.current[5] ? 1 : 0,
    };
    footprintsRef.current = [];
    lastFootprintPosRef.current = { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y };
    clickEffectsRef.current = [];
    nearbyTerminalRef.current = null;
    setNearbyTerminal(null);
    nearbyDoorRef.current = null;
    setNearbyDoor(null);
  }, [resetKey]);

  const isTaskSolved = (idx: number): boolean => {
    if (idx === 1) return tasks.node1Solved;
    if (idx === 2) return tasks.node2Solved;
    if (idx === 3) return tasks.node3Solved;
    if (idx === 4) return tasks.node4Solved;
    if (idx === 5) return tasks.node5Solved;
    if (idx === 6) return tasks.escaped;
    return false;
  };

  const spawnDotaClickEffect = (wx: number, wy: number, isTerminalTarget: boolean = false) => {
    clickEffectsRef.current.push({
      x: wx,
      y: wy,
      createdAt: performance.now(),
      isTerminalTarget,
    });
    if (clickEffectsRef.current.length > 16) {
      clickEffectsRef.current.shift();
    }
  };

  useEffect(() => {
    const win = window as unknown as Record<string, unknown>;
    win.__gameDebug = {
      getPlayerPos: () => ({ x: playerRef.current.x, y: playerRef.current.y }),
      teleport: (x: number, y: number) => {
        playerRef.current.x = x;
        playerRef.current.y = y;
        playerRef.current.path = [];
        cameraRef.current.x = x;
        cameraRef.current.y = y;
        lastFootprintPosRef.current = { x, y };
      },
      getFacingDir: () => playerRef.current.facingDir,
      setFacingDir: (dir: FacingDirection) => {
        playerRef.current.facingDir = dir;
        if (dir === 'left') {
          playerRef.current.facing = -1;
          playerRef.current.aimAngle = Math.PI;
        } else if (dir === 'right') {
          playerRef.current.facing = 1;
          playerRef.current.aimAngle = 0;
        } else if (dir === 'up') {
          playerRef.current.aimAngle = -Math.PI / 2;
        } else if (dir === 'down') {
          playerRef.current.aimAngle = Math.PI / 2;
        }
      },
      getFlashlightReflector: () => {
        const p = playerRef.current;
        const bob = p.walkCycle > 0 ? Math.abs(Math.sin(p.walkCycle)) * 2.5 : 0;
        return getFlashlightReflectorOrigin(p.x, p.y, p.aimAngle, bob, p.facingDir);
      },
      getZoom: () => cameraRef.current.zoom,
      setZoom: (z: number) => {
        cameraRef.current.zoom = Math.max(0.7, Math.min(2.2, z));
      },
      getFootprintsCount: () => footprintsRef.current.length,
      getClickEffectsCount: () => clickEffectsRef.current.length,
      triggerClickEffectAt: (wx: number, wy: number) => {
        spawnDotaClickEffect(wx, wy, false);
      },
      walkToRoom: (taskIndex: number) => {
        const rm = SHIP_ROOMS.find((r) => r.taskIndex === taskIndex);
        if (!rm) return false;
        const closedSet = getClosedDoorSet();
        if (taskIndex >= 1 && taskIndex <= 5 && closedSet.has(taskIndex)) {
          const door = SHIP_DOORS.find((d) => d.doorId === taskIndex);
          if (door) {
            const pts = findPathOnShip(
              playerRef.current.x,
              playerRef.current.y,
              door.standX,
              door.standY,
              closedSet
            );
            playerRef.current.path = pts;
            playerRef.current.targetTerminal = null;
            playerRef.current.targetDoor = door.doorId;
            spawnDotaClickEffect(door.standX, door.standY, true);
            return pts.length > 0;
          }
        }
        const stand = getTerminalStandPoint(rm);
        const pts = findPathOnShip(
          playerRef.current.x,
          playerRef.current.y,
          stand.x,
          stand.y,
          closedSet
        );
        playerRef.current.path = pts;
        playerRef.current.targetTerminal = null;
        playerRef.current.targetDoor = null;
        spawnDotaClickEffect(stand.x, stand.y, true);
        return pts.length > 0;
      },
      teleportNearTerminal: (taskIndex: number) => {
        const rm = SHIP_ROOMS.find((r) => r.taskIndex === taskIndex);
        if (!rm) return false;
        if (taskIndex >= 1 && taskIndex <= 5) {
          onUnlockDoor(taskIndex as DoorId);
          doorLiftProgressRef.current[taskIndex as DoorId] = 1;
        }
        const stand = getTerminalStandPoint(rm);
        playerRef.current.x = stand.x;
        playerRef.current.y = stand.y;
        playerRef.current.path = [];
        cameraRef.current.x = stand.x;
        cameraRef.current.y = stand.y;
        lastFootprintPosRef.current = { x: playerRef.current.x, y: playerRef.current.y };
        return true;
      },
      unlockDoor: (doorId: DoorId) => {
        onUnlockDoor(doorId);
      },
      getDoorsState: () => ({
        unlocked: { ...unlockedDoorsRef.current },
        liftProgress: { ...doorLiftProgressRef.current },
      }),
      getRenderOrderAtPlayer: () => ({
        playerSortY: lastRenderOrderRef.current.playerSortY,
        backgroundCount: lastRenderOrderRef.current.backgroundLabels.length,
        foregroundCount: lastRenderOrderRef.current.foregroundLabels.length,
        backgroundLabels: [...lastRenderOrderRef.current.backgroundLabels],
        foregroundLabels: [...lastRenderOrderRef.current.foregroundLabels],
      }),
    };

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      const idx =
        roomParam === 'central' || roomParam === '6'
          ? 6
          : parseInt(roomParam, 10);
      const rm = SHIP_ROOMS.find((r) => r.taskIndex === idx);
      if (rm) {
        const stand =
          idx === 6
            ? { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y }
            : getTerminalStandPoint(rm);
        playerRef.current.x = stand.x;
        playerRef.current.y = stand.y;
        cameraRef.current.x = stand.x;
        cameraRef.current.y = stand.y;
      }
    }
    const xParam = params.get('x');
    const yParam = params.get('y');
    if (xParam !== null && yParam !== null) {
      const tx = parseFloat(xParam);
      const ty = parseFloat(yParam);
      if (!Number.isNaN(tx) && !Number.isNaN(ty)) {
        playerRef.current.x = tx;
        playerRef.current.y = ty;
        cameraRef.current.x = tx;
        cameraRef.current.y = ty;
      }
    }
    const zoomParam = params.get('zoom');
    if (zoomParam !== null) {
      const z = parseFloat(zoomParam);
      if (!Number.isNaN(z)) {
        cameraRef.current.zoom = Math.max(0.55, Math.min(2.2, z));
      }
    }
    const facingParam = params.get('facing') as FacingDirection | null;
    if (
      facingParam === 'up' ||
      facingParam === 'down' ||
      facingParam === 'left' ||
      facingParam === 'right'
    ) {
      (win.__gameDebug as { setFacingDir: (d: FacingDirection) => void }).setFacingDir(
        facingParam
      );
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeTask !== null || activeDoor !== null) {
        if (e.key === 'Escape') {
          onOpenTask(null);
          onOpenDoor(null);
        }
        return;
      }

      keysRef.current[e.code] = true;

      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
        if (nearbyDoorRef.current !== null) {
          e.preventDefault();
          sound.playTerminalClick();
          onOpenDoor(nearbyDoorRef.current);
          return;
        }
        if (nearbyTerminalRef.current !== null) {
          e.preventDefault();
          sound.playTerminalClick();
          onOpenTask(nearbyTerminalRef.current);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [activeTask, activeDoor, onOpenTask, onOpenDoor]);

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const nextZoom = cameraRef.current.zoom - e.deltaY * 0.0012;
    cameraRef.current.zoom = Math.max(0.7, Math.min(2.2, nextZoom));
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTask !== null || activeDoor !== null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const cam = cameraRef.current;
    const worldX = (clickX - canvas.width / 2) / cam.zoom + cam.x;
    const worldY = (clickY - canvas.height / 2) / cam.zoom + cam.y;

    const closedSet = getClosedDoorSet();

    // 1. Check if user clicked directly on a closed bulkhead door or its panel
    for (const door of SHIP_DOORS) {
      if (!closedSet.has(door.doorId)) continue;
      const inDoorBox =
        worldX >= door.x - 28 &&
        worldX <= door.x + door.w + 28 &&
        worldY >= door.y - 44 &&
        worldY <= door.y + door.h + 24;
      if (inDoorBox) {
        const distPlayerToDoor = Math.hypot(
          playerRef.current.x - door.cx,
          playerRef.current.y - door.cy
        );
        if (distPlayerToDoor <= 105) {
          sound.playTerminalClick();
          onOpenDoor(door.doorId);
          return;
        }
        const pts = findPathOnShip(
          playerRef.current.x,
          playerRef.current.y,
          door.standX,
          door.standY,
          closedSet
        );
        if (pts.length > 0) {
          playerRef.current.path = pts;
          playerRef.current.targetTerminal = null;
          playerRef.current.targetDoor = door.doorId;
          spawnDotaClickEffect(door.standX, door.standY, true);
        }
        return;
      }
    }

    // 2. Check if user clicked inside a room (or on its terminal) whose door is still closed
    const blockingDoor = getDoorBlockingRoomAt(worldX, worldY, closedSet);
    if (blockingDoor) {
      const distPlayerToDoor = Math.hypot(
        playerRef.current.x - blockingDoor.cx,
        playerRef.current.y - blockingDoor.cy
      );
      if (distPlayerToDoor <= 95) {
        sound.playTerminalClick();
        onOpenDoor(blockingDoor.doorId);
        return;
      }
      const pts = findPathOnShip(
        playerRef.current.x,
        playerRef.current.y,
        blockingDoor.standX,
        blockingDoor.standY,
        closedSet
      );
      if (pts.length > 0) {
        playerRef.current.path = pts;
        playerRef.current.targetTerminal = null;
        playerRef.current.targetDoor = blockingDoor.doorId;
        spawnDotaClickEffect(blockingDoor.standX, blockingDoor.standY, true);
      }
      return;
    }

    // 3. Check if user clicked on an unlocked terminal
    for (const rm of SHIP_ROOMS) {
      const distToClick = Math.hypot(worldX - rm.terminalX, worldY - rm.terminalY);
      if (distToClick <= 54) {
        const distPlayerToTerm = Math.hypot(
          playerRef.current.x - rm.terminalX,
          playerRef.current.y - rm.terminalY
        );
        if (distPlayerToTerm <= 95) {
          sound.playTerminalClick();
          onOpenTask(rm.taskIndex as ActiveTask);
          return;
        }
        const stand = getTerminalStandPoint(rm);
        const pts = findPathOnShip(
          playerRef.current.x,
          playerRef.current.y,
          stand.x,
          stand.y,
          closedSet
        );
        if (pts.length > 0) {
          playerRef.current.path = pts;
          playerRef.current.targetTerminal = null;
          playerRef.current.targetDoor = null;
          spawnDotaClickEffect(stand.x, stand.y, true);
        }
        return;
      }
    }

    const pts = findPathOnShip(playerRef.current.x, playerRef.current.y, worldX, worldY, closedSet);
    if (pts.length > 0) {
      playerRef.current.path = pts;
      playerRef.current.targetTerminal = null;
      playerRef.current.targetDoor = null;
      const dest = pts[pts.length - 1];
      // Place Dota 2 click indicator at clicked spot (or snapped walkable destination if clicked slightly into a wall)
      const distToSnap = Math.hypot(dest.x - worldX, dest.y - worldY);
      const fxX = distToSnap < 42 ? worldX : dest.x;
      const fxY = distToSnap < 42 ? worldY : dest.y;
      spawnDotaClickEffect(fxX, fxY, false);
    }
  };

  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let tick = 0;

    const recordFootprintIfMoved = (now: number, moveAngle: number) => {
      const player = playerRef.current;
      const lastFp = lastFootprintPosRef.current;
      const distWalked = Math.hypot(player.x - lastFp.x, player.y - lastFp.y);
      if (distWalked >= 22) {
        const isLeft = nextFootLeftRef.current;
        nextFootLeftRef.current = !isLeft;
        const perpAngle = moveAngle + (isLeft ? -Math.PI / 2 : Math.PI / 2);
        const offsetLat = 4.5;
        footprintsRef.current.push({
          x: player.x + Math.cos(perpAngle) * offsetLat,
          y: player.y + 11 + Math.sin(perpAngle) * offsetLat,
          angle: moveAngle,
          isLeft,
          createdAt: now,
        });
        if (footprintsRef.current.length > 90) {
          footprintsRef.current.shift();
        }
        lastFootprintPosRef.current = { x: player.x, y: player.y };
      }
    };

    const update = (now: number) => {
      const dt = Math.min((now - lastTime) / 16.667, 2.5);
      lastTime = now;
      // Slower, calmer animation tick
      tick += dt * 0.45;

      // Animate vertical door lift (0 = closed on floor, 1 = raised straight up into ceiling header)
      for (const d of SHIP_DOORS) {
        const id = d.doorId;
        const targetLift = unlockedDoorsRef.current[id] ? 1 : 0;
        const curLift = doorLiftProgressRef.current[id];
        if (curLift < targetLift) {
          doorLiftProgressRef.current[id] = Math.min(1, curLift + 0.032 * dt);
        } else if (curLift > targetLift) {
          doorLiftProgressRef.current[id] = Math.max(0, curLift - 0.05 * dt);
        }
      }

      // Prune expired footprints (> 1.8s — fade out quickly!) and finished click animations (> 0.6s)
      if (footprintsRef.current.length > 0) {
        footprintsRef.current = footprintsRef.current.filter((fp) => now - fp.createdAt < 1800);
      }
      if (clickEffectsRef.current.length > 0) {
        clickEffectsRef.current = clickEffectsRef.current.filter((fx) => now - fx.createdAt < 600);
      }

      const player = playerRef.current;
      const keys = keysRef.current;
      const closedSet = getClosedDoorSet();

      if (activeTask === null && activeDoor === null) {
        let dx = 0;
        let dy = 0;
        if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) dx += 1;

        const baseSpeed = 4.6 * dt;

        if (dx !== 0 || dy !== 0) {
          player.path = [];
          player.targetTerminal = null;
          player.targetDoor = null;
          const len = Math.hypot(dx, dy);
          dx /= len;
          dy /= len;

          if (dx < -0.05) player.facing = -1;
          if (dx > 0.05) player.facing = 1;
          player.facingDir = getFacingDirection(dx, dy, player.facingDir);

          const targetAngle = Math.atan2(dy, dx);
          const diff = Math.atan2(
            Math.sin(targetAngle - player.aimAngle),
            Math.cos(targetAngle - player.aimAngle)
          );
          player.aimAngle += diff * 0.22;

          const next = resolveCollision(player.x, player.y, dx, dy, baseSpeed, 14, closedSet);
          player.x = next.x;
          player.y = next.y;
          player.walkCycle += 0.15 * dt;

          recordFootprintIfMoved(now, targetAngle);

          if (now - lastStepSoundRef.current > 320) {
            sound.playStep();
            lastStepSoundRef.current = now;
          }
        } else if (player.path.length > 0) {
          const target = player.path[0];
          const toX = target.x - player.x;
          const toY = target.y - player.y;
          const dist = Math.hypot(toX, toY);

          if (dist < 9) {
            player.path.shift();
            stuckFramesRef.current = 0;
            if (player.path.length === 0 && player.targetDoor !== null) {
              const targetDoorId = player.targetDoor;
              player.targetDoor = null;
              if (closedSet.has(targetDoorId)) {
                sound.playTerminalClick();
                onOpenDoor(targetDoorId);
              }
            }
          } else {
            const ndx = toX / dist;
            const ndy = toY / dist;
            if (ndx < -0.05) player.facing = -1;
            if (ndx > 0.05) player.facing = 1;
            player.facingDir = getFacingDirection(ndx, ndy, player.facingDir);

            const targetAngle = Math.atan2(ndy, ndx);
            const diff = Math.atan2(
              Math.sin(targetAngle - player.aimAngle),
              Math.cos(targetAngle - player.aimAngle)
            );
            player.aimAngle += diff * 0.22;

            const prevX = player.x;
            const prevY = player.y;
            const stepLen = Math.min(baseSpeed * 1.05, dist);
            const next = resolveCollision(player.x, player.y, ndx, ndy, stepLen, 14, closedSet);
            player.x = next.x;
            player.y = next.y;
            player.walkCycle += 0.15 * dt;

            recordFootprintIfMoved(now, targetAngle);

            if (Math.hypot(player.x - prevX, player.y - prevY) < 0.25) {
              stuckFramesRef.current += 1;
              if (stuckFramesRef.current >= 10) {
                const finalGoal = player.path[player.path.length - 1];
                const repath = findPathOnShip(
                  player.x,
                  player.y,
                  finalGoal.x,
                  finalGoal.y,
                  closedSet
                );
                player.path = repath.length > 0 ? repath : [];
                stuckFramesRef.current = 0;
              }
            } else {
              stuckFramesRef.current = 0;
            }

            if (now - lastStepSoundRef.current > 320) {
              sound.playStep();
              lastStepSoundRef.current = now;
            }
          }
        } else {
          player.walkCycle = 0;
          stuckFramesRef.current = 0;
        }
      }

      const cam = cameraRef.current;
      cam.x += (player.x - cam.x) * 0.14;
      cam.y += (player.y - cam.y) * 0.14;

      const currentRoom = getRoomNameAt(player.x, player.y);
      onRoomChange(currentRoom);

      // Check nearby closed door first
      let foundNearDoor: DoorId | null = null;
      let bestDoorDist = 92;
      for (const door of SHIP_DOORS) {
        if (!closedSet.has(door.doorId)) continue;
        const d = Math.hypot(player.x - door.cx, player.y - door.cy);
        if (d < bestDoorDist) {
          bestDoorDist = d;
          foundNearDoor = door.doorId;
        }
      }
      if (nearbyDoorRef.current !== foundNearDoor) {
        nearbyDoorRef.current = foundNearDoor;
        setNearbyDoor(foundNearDoor);
      }

      let foundNear: ActiveTask = null;
      let bestDist = 92;
      for (const rm of SHIP_ROOMS) {
        if (rm.taskIndex >= 1 && rm.taskIndex <= 5 && closedSet.has(rm.taskIndex)) {
          continue;
        }
        const d = Math.hypot(player.x - rm.terminalX, player.y - rm.terminalY);
        if (d < bestDist) {
          bestDist = d;
          foundNear = rm.taskIndex as ActiveTask;
        }
      }
      if (nearbyTerminalRef.current !== foundNear) {
        nearbyTerminalRef.current = foundNear;
        setNearbyTerminal(foundNear);
      }

      drawScene(tick, now, closedSet);
      animId = requestAnimationFrame(update);
    };

    const drawScene = (t: number, now: number, closedSet: ReadonlySet<number>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }

      const w = canvas.width;
      const h = canvas.height;
      const cam = cameraRef.current;

      // 1. Deep Space Void Background
      ctx.fillStyle = '#030509';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      // 2. Cosmic Bodies Strictly in Outer Space (around the exterior of the ship)
      drawDeepSpacePhenomena(ctx, t);

      // 3. Solid Opaque Exterior Spaceship Hull & Internal Structural Superstructure
      // Everything inside the hull outline is solid ship structure — no stars/planets can ever appear inside hull gaps!
      drawSpaceshipExteriorHull(ctx, t);

      // 4. Multi-Material Textured Room Floors & Corridors
      drawShipDeckAndBulkheads(ctx);

      // 5. Sub-Deck Conduits, Floor Trenches, Door Threshold Plates & Soft Floor Auras
      drawFloorConduitsAndAuras25D(ctx, t);

      // 5B. Fading Astronaut Boot Footprints & Dota 2 Ground Click Ripples on the Ship Deck
      drawPlayerFootprints(ctx, now);
      drawDotaClickEffects(ctx, now);

      const p = playerRef.current;
      const playerSortY = getPlayerSortY(p.y);

      // 6. Collect all 2.5D Volumetric Objects, Consoles, Pedestals, Rover, Tokamak, Medbay Props, Terminals & Doors
      const items25D: Sortable25DItem[] = [];
      collectRoomDetails25D(ctx, t, items25D);
      collectTerminals25D(ctx, t, items25D);
      collectShipDoors25D(ctx, t, items25D);
      items25D.sort((a, b) => a.sortY - b.sortY);

      const backgroundItems = items25D.filter((it) => it.sortY <= playerSortY);
      const foregroundItems = items25D.filter((it) => it.sortY > playerSortY);

      lastRenderOrderRef.current = {
        playerSortY,
        backgroundLabels: backgroundItems.map((it) => it.label),
        foregroundLabels: foregroundItems.map((it) => it.label),
      };

      // 7A. Background 2.5D Objects (north of / behind Daniil: sortY <= playerSortY)
      for (const item of backgroundItems) {
        item.draw();
      }

      // 7B. Volumetric Flashlight Beam Cone & Suit Rim Glow on Floor/Walls
      // Drawn before Daniil so the beam never washes over Daniil's body or helmet
      drawFlashlightWorldGlow(
        ctx,
        p.x,
        p.y,
        p.facingDir,
        p.aimAngle,
        p.walkCycle,
        suitColor,
        closedSet
      );

      // 7C. Astronaut Daniil at his floor depth layer (`playerSortY`)
      drawAstronautDaniil(
        ctx,
        p.x,
        p.y,
        p.facing,
        p.facingDir,
        p.aimAngle,
        p.walkCycle,
        suitColor
      );

      // 7D. Foreground 2.5D Objects (south of / in front of Daniil: sortY > playerSortY)
      // Rendered ON TOP OF Daniil so when Daniil walks above (north of) a tall object, he is behind it (на слой ниже)!
      for (const item of foregroundItems) {
        item.draw();
      }

      // 8. Smooth Offscreen Emergency Blackout Darkness Layer (100% carved out across Daniil's body & flashlight cone)
      drawBlackoutDarknessOverlay(
        ctx,
        w,
        h,
        cam,
        p.x,
        p.y,
        p.facingDir,
        p.aimAngle,
        p.walkCycle,
        closedSet
      );

      // 9. Floating World-Space UI Labels (Daniil's Name Tag, Terminal Prompts & Door Prompts)
      drawFloatingWorldLabels(ctx, t, p.x, p.y, p.walkCycle);

      ctx.restore();
    };

    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, [suitColor, tasks, unlockedDoors, activeTask, activeDoor, onRoomChange, onOpenDoor]);

  /**
   * Helper to draw a true 2.5D perspective box (top face + front vertical face + drop shadow).
   * In 2.5D top-down oblique view, the vertical front face of height `zH` is visible at the south edge,
   * and the top surface is shifted up by `zH`.
   */
  const drawBox25D = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    d: number,
    zH: number,
    topColor: string,
    frontColor: string,
    borderColor: string = '#334155'
  ) => {
    // Floor drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(x - 3, y + 4, w + 6, d + 5);

    // Front vertical face (south side)
    ctx.fillStyle = frontColor;
    ctx.fillRect(x, y + d - zH, w, zH);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y + d - zH, w, zH);

    // Top horizontal surface (shifted up by zH)
    ctx.fillStyle = topColor;
    ctx.fillRect(x, y - zH, w, d);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y - zH, w, d);

    // Top highlight bevel along front edge
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(x + 1, y + d - zH);
    ctx.lineTo(x + w - 1, y + d - zH);
    ctx.stroke();
  };

  const drawCylinder25D = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    zH: number,
    topColor: string,
    sideColor: string,
    borderColor: string = '#475569'
  ) => {
    // Floor shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, rx + 4, ry + 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Vertical cylinder body connecting base ellipse (cx, cy) and top ellipse (cx, cy - zH)
    ctx.fillStyle = sideColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(cx - rx, cy - zH);
    ctx.ellipse(cx, cy - zH, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Top ellipse face
    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy - zH, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.stroke();
  };

  /**
   * Renders a true 3-tier 2.5D angled control console (never a flat box with 2D rectangles painted on top):
   * - Tier 1: Heavy 2.5D base cabinet & front vertical server/vent face
   * - Tier 2: Lower sloped/stepped operator keyboard & lever deck (zDeck) with physical 3D raised levers & push-buttons
   * - Tier 3: Tall upright rear 2.5D monitor glare-shield hood (zHood) with overhanging top canopy,
   *           angled 3D trapezoidal side cheeks, and recessed vertical/sloped CRT/OLED screen facing the viewer!
   */
  const drawAngledConsole25D = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    d: number,
    zDeck: number,
    zHood: number,
    accentColor: string,
    t: number,
    screenMode: 'wave' | 'radar' | 'bars' | 'ecg' | 'spectrum' | 'dual' = 'wave',
    hasLevers: boolean = true
  ) => {
    const hoodD = Math.max(12, Math.min(18, Math.round(d * 0.34)));

    // 1. Lower 2.5D Base Cabinet & Operator Deck
    drawBox25D(ctx, x, y, w, d, zDeck, '#1e293b', '#090d16', accentColor);

    // Front vertical cabinet face details (recessed cooling louvers & status LEDs)
    const frontFaceY = y + d - zDeck;
    if (zDeck >= 16 && w >= 36) {
      const ventW = Math.min(28, Math.max(14, Math.floor(w * 0.32)));
      ctx.fillStyle = '#040811';
      ctx.fillRect(x + 6, frontFaceY + 4, ventW, Math.max(6, zDeck - 9));
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 6, frontFaceY + 4, ventW, Math.max(6, zDeck - 9));

      ctx.fillStyle = accentColor;
      ctx.fillRect(x + w - 12, frontFaceY + 5, 5, 3);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x + w - 12, frontFaceY + 10, 5, 3);
    }

    // 2. Tall Upright Rear 2.5D Monitor Glare-Shield Hood (protruding upward at rear of console)
    const hoodX = x + 2;
    const hoodW = w - 4;
    drawBox25D(ctx, hoodX, y, hoodW, hoodD, zHood, '#334155', '#0b1322', accentColor);

    // Top Glare-Shield Roof Bevel & Cooling Louvers on the top of the monitor hood
    const roofY = y - zHood;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(hoodX + 4, roofY + 3, hoodW - 8, Math.max(4, hoodD - 6));
    ctx.fillStyle = accentColor;
    ctx.fillRect(hoodX + 6, roofY + 2, Math.min(18, hoodW - 12), 2);

    // 3. Left & Right 2.5D Angled Side-Cheeks (Боковины пульта) connecting upper hood to lower operator deck
    const hoodFrontBottomY = y + hoodD - zDeck;
    const hoodFrontTopY = y + hoodD - zHood;
    const deckFrontY = y + d - zDeck - 2;

    for (const sideX of [hoodX, hoodX + hoodW - 4]) {
      ctx.fillStyle = '#162032';
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(sideX, hoodFrontTopY);
      ctx.lineTo(sideX + 4, hoodFrontTopY);
      ctx.lineTo(sideX + 4, deckFrontY);
      ctx.lineTo(sideX, hoodFrontBottomY + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 4. Recessed Upright/Angled 2.5D Screen on the South-Facing Wall of the Monitor Hood
    const scrX = hoodX + 5;
    const scrY = hoodFrontTopY + 2;
    const scrW = Math.max(16, hoodW - 10);
    const scrH = Math.max(12, zHood - zDeck - 2);

    // Deep recessed bezel shadow
    ctx.fillStyle = '#020617';
    ctx.fillRect(scrX - 1, scrY - 1, scrW + 2, scrH + 2);
    ctx.fillStyle = '#040b16';
    ctx.fillRect(scrX, scrY, scrW, scrH);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(scrX, scrY, scrW, scrH);

    // Subtle specular glass glare across upper-left corner of the vertical 2.5D monitor
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.beginPath();
    ctx.moveTo(scrX + 1, scrY + 1);
    ctx.lineTo(scrX + scrW * 0.45, scrY + 1);
    ctx.lineTo(scrX + scrW * 0.22, scrY + scrH - 1);
    ctx.lineTo(scrX + 1, scrY + scrH - 1);
    ctx.closePath();
    ctx.fill();

    // Animated telemetry content inside the vertical 2.5D screen
    ctx.save();
    ctx.beginPath();
    ctx.rect(scrX + 1, scrY + 1, scrW - 2, scrH - 2);
    ctx.clip();

    if (screenMode === 'radar') {
      const rCx = scrX + Math.min(scrW * 0.35, scrH * 0.8);
      const rCy = scrY + scrH * 0.5;
      const rad = Math.max(4, Math.min(scrH * 0.38, scrW * 0.25));
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(rCx, rCy, rad, 0, Math.PI * 2);
      ctx.stroke();
      const sw = t * 0.06;
      ctx.strokeStyle = '#34d399';
      ctx.beginPath();
      ctx.moveTo(rCx, rCy);
      ctx.lineTo(rCx + Math.cos(sw) * rad, rCy + Math.sin(sw) * rad);
      ctx.stroke();

      // Right-side telemetry bars inside radar screen
      for (let b = 0; b < 3; b++) {
        const bw = Math.max(4, (scrW * 0.38) * (0.5 + 0.4 * Math.sin(t * 0.05 + b)));
        ctx.fillStyle = b === 0 ? accentColor : b === 1 ? '#34d399' : '#fbbf24';
        ctx.fillRect(scrX + scrW * 0.56, scrY + 3 + b * 4.5, bw, 2.5);
      }
    } else if (screenMode === 'bars') {
      const barCount = Math.max(3, Math.min(10, Math.floor((scrW - 6) / 7)));
      for (let b = 0; b < barCount; b++) {
        const frac = 0.3 + 0.6 * Math.abs(Math.sin(t * 0.04 + b * 0.8));
        const bh = Math.max(3, Math.round((scrH - 5) * frac));
        ctx.fillStyle = b % 3 === 0 ? accentColor : b % 3 === 1 ? '#34d399' : '#fbbf24';
        ctx.fillRect(scrX + 4 + b * 7, scrY + scrH - 2 - bh, 4.5, bh);
      }
    } else if (screenMode === 'spectrum') {
      const specColors = ['#60a5fa', '#93c5fd', '#f8fafc', '#fef08a', '#facc15', '#fb923c', '#f87171'];
      const bandW = (scrW - 6) / specColors.length;
      for (let i = 0; i < specColors.length; i++) {
        ctx.fillStyle = specColors[i];
        ctx.fillRect(scrX + 3 + i * bandW, scrY + 3, Math.max(2, bandW - 1.2), scrH - 6);
      }
    } else if (screenMode === 'ecg') {
      ctx.strokeStyle = '#2dd4bf';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let sx = 2; sx < scrW - 2; sx += 2.5) {
        const phase = (sx + t * 1.4) % 26;
        const pulse =
          phase > 10 && phase < 13
            ? -scrH * 0.36
            : phase >= 13 && phase < 16
            ? scrH * 0.28
            : Math.sin(sx * 0.25 + t * 0.05) * 1.5;
        const sy = scrY + scrH * 0.55 + pulse;
        if (sx === 2) ctx.moveTo(scrX + sx, sy);
        else ctx.lineTo(scrX + sx, sy);
      }
      ctx.stroke();
    } else {
      // 'wave' or 'dual'
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let sx = 2; sx < scrW - 2; sx += 3) {
        const sy = scrY + scrH * 0.5 + Math.sin(sx * 0.22 + t * 0.08 + x * 0.05) * (scrH * 0.3);
        if (sx === 2) ctx.moveTo(scrX + sx, sy);
        else ctx.lineTo(scrX + sx, sy);
      }
      ctx.stroke();

      if (screenMode === 'dual') {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        for (let sx = 2; sx < scrW - 2; sx += 3) {
          const sy = scrY + scrH * 0.5 + Math.cos(sx * 0.18 - t * 0.06) * (scrH * 0.22);
          if (sx === 2) ctx.moveTo(scrX + sx, sy);
          else ctx.lineTo(scrX + sx, sy);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    // 5. 3D Tactile Operator Controls on the Lower Stepped Deck (Physical Raised Levers, 3D Buttons & Trackball)
    const deckStartY = y + hoodD - zDeck + 3;
    const deckAvailD = d - hoodD - 5;
    if (deckAvailD >= 6) {
      // Recessed keyboard / button well
      ctx.fillStyle = '#090d16';
      ctx.fillRect(x + 6, deckStartY, w - 12, Math.min(18, deckAvailD));
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 0.9;
      ctx.strokeRect(x + 6, deckStartY, w - 12, Math.min(18, deckAvailD));

      // Raised 3D illuminated push-buttons (each with dark base and bright raised top cap)
      const btnCount = Math.max(2, Math.min(8, Math.floor((w - 28) / 10)));
      for (let b = 0; b < btnCount; b++) {
        const bx = x + 9 + b * 9.5;
        const by = deckStartY + 3;
        // 3D button base
        ctx.fillStyle = '#020617';
        ctx.fillRect(bx, by + 1.5, 6.5, 4);
        // 3D raised glowing button cap
        ctx.fillStyle =
          b % 3 === 0 ? accentColor : b % 3 === 1 ? '#34d399' : '#fbbf24';
        ctx.fillRect(bx, by, 6.5, 3.5);
      }

      // Physical 3D Protruding Throttle Lever(s) rising vertically off the right side of the deck
      if (hasLevers && w >= 42) {
        const leverX = x + w - 15;
        const leverBaseY = deckStartY + Math.min(11, deckAvailD - 2);
        // Slot track
        ctx.fillStyle = '#020617';
        ctx.fillRect(leverX - 1.5, leverBaseY - 4, 3, 7);
        // Vertical 3D metallic stalk rising upward (-6px in Y)
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(leverX, leverBaseY);
        ctx.lineTo(leverX, leverBaseY - 6);
        ctx.stroke();
        // 3D T-handle grip at top of lever
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(leverX - 4, leverBaseY - 8, 8, 3.2);
        ctx.strokeStyle = '#090d16';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(leverX - 4, leverBaseY - 8, 8, 3.2);
      }
    }
  };

  const drawDeepSpacePhenomena = (ctx: CanvasRenderingContext2D, t: number) => {
    // 1. Diagonal Milky Way Galactic Dust & Starlight Band sweeping across the cosmos behind the ship
    ctx.save();
    ctx.translate(1200, 800);
    ctx.rotate(-0.38);
    const mwGrad = ctx.createLinearGradient(0, -520, 0, 520);
    mwGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    mwGrad.addColorStop(0.25, 'rgba(30, 58, 138, 0.08)');
    mwGrad.addColorStop(0.45, 'rgba(56, 189, 248, 0.14)');
    mwGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.22)'); // Dark galactic rift lane
    mwGrad.addColorStop(0.58, 'rgba(139, 92, 246, 0.15)');
    mwGrad.addColorStop(0.78, 'rgba(236, 72, 153, 0.07)');
    mwGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = mwGrad;
    ctx.fillRect(-2600, -520, 5200, 1040);
    ctx.restore();

    // 2. Multi-Hued Deep Space Nebulae outside the hull
    const nebulae = [
      { x: 320, y: 70, r: 520, c1: 'rgba(56, 189, 248, 0.24)', c2: 'rgba(99, 102, 241, 0.11)' },
      { x: 2150, y: 1560, r: 580, c1: 'rgba(168, 85, 247, 0.24)', c2: 'rgba(236, 72, 153, 0.10)' },
      { x: 160, y: 1520, r: 490, c1: 'rgba(14, 165, 233, 0.22)', c2: 'rgba(45, 212, 191, 0.09)' },
      { x: 760, y: 120, r: 340, c1: 'rgba(244, 63, 94, 0.16)', c2: 'rgba(251, 146, 60, 0.07)' },
      { x: 1660, y: 120, r: 360, c1: 'rgba(52, 211, 153, 0.15)', c2: 'rgba(14, 165, 233, 0.07)' },
      { x: 2480, y: 780, r: 440, c1: 'rgba(217, 119, 6, 0.17)', c2: 'rgba(147, 51, 234, 0.08)' },
    ];
    for (const nb of nebulae) {
      const nGrad = ctx.createRadialGradient(nb.x, nb.y, 18, nb.x, nb.y, nb.r);
      nGrad.addColorStop(0, nb.c1);
      nGrad.addColorStop(0.55, nb.c2);
      nGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = nGrad;
      ctx.beginPath();
      ctx.arc(nb.x, nb.y, nb.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Non-Repeating Natural Starfield with Organic Clusters & Diffraction Cross-Flares
    for (const st of STARS) {
      const twinkle = Math.sin(t * st.twinkleSpeed + st.twinklePhase) * 0.18 + st.alpha;
      const alpha = Math.max(0.42, Math.min(1.0, twinkle));

      if (st.isBright) {
        ctx.fillStyle = st.color;
        ctx.globalAlpha = alpha * 0.26;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r * 2.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = st.color;
        ctx.globalAlpha = alpha * 0.75;
        ctx.lineWidth = 1.0;
        const spike = st.r * 3.4;
        ctx.beginPath();
        ctx.moveTo(st.x - spike, st.y);
        ctx.lineTo(st.x + spike, st.y);
        ctx.moveTo(st.x, st.y - spike);
        ctx.lineTo(st.x, st.y + spike);
        ctx.stroke();
      }

      ctx.fillStyle = st.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // =========================================================================
    // 4. DIVERSE COSMIC BODIES IN OUTER SPACE AROUND THE SHIP EXTERIOR
    // =========================================================================

    // BODY 1 (NW Deep Space above Room 1: x=260, y=42): Ringed Ice Giant Planet + 2 Orbiting Icy Moons
    ctx.save();
    ctx.translate(260, 42);
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.34)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(0, 0, 118, 27, -0.22, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.22)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 134, 31, -0.22, Math.PI, Math.PI * 2);
    ctx.stroke();

    const pGrad = ctx.createRadialGradient(-16, -16, 6, 0, 0, 52);
    pGrad.addColorStop(0, '#e0f2fe');
    pGrad.addColorStop(0.55, '#0284c7');
    pGrad.addColorStop(1, '#082f49');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 52, 0, Math.PI * 2);
    ctx.fill();

    // Atmospheric cloud bands on the Ice Giant
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.22)';
    ctx.lineWidth = 3;
    for (const latY of [-20, -6, 10, 24]) {
      const halfW = Math.sqrt(Math.max(0, 50 * 50 - latY * latY));
      ctx.beginPath();
      ctx.moveTo(-halfW + 4, latY);
      ctx.lineTo(halfW - 4, latY);
      ctx.stroke();
    }

    // Front half of planetary rings
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.52)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(0, 0, 118, 27, -0.22, 0, Math.PI);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.32)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 134, 31, -0.22, 0, Math.PI);
    ctx.stroke();

    // Two orbiting moons around the Ice Giant
    const m1Angle = t * 0.008;
    const m1x = Math.cos(m1Angle) * 148;
    const m1y = Math.sin(m1Angle) * 36;
    ctx.fillStyle = '#bae6fd';
    ctx.beginPath();
    ctx.arc(m1x, m1y, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(-95, 42, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // BODY 2 (North-West Open Space: x=760, y=55): Relativistic Millisecond Pulsar with Bipolar Plasma Jets
    ctx.save();
    ctx.translate(760, 55);
    ctx.rotate(0.42 + Math.sin(t * 0.015) * 0.05);
    // Bipolar relativistic X-ray jets shooting out of magnetic poles
    const jetGrad = ctx.createLinearGradient(-135, 0, 135, 0);
    jetGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
    jetGrad.addColorStop(0.35, 'rgba(56, 189, 248, 0.55)');
    jetGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.98)');
    jetGrad.addColorStop(0.65, 'rgba(56, 189, 248, 0.55)');
    jetGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = jetGrad;
    ctx.beginPath();
    ctx.moveTo(-135, -14);
    ctx.lineTo(0, -2.5);
    ctx.lineTo(135, -14);
    ctx.lineTo(135, 14);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-135, 14);
    ctx.closePath();
    ctx.fill();
    // Concentric magnetic shock rings around neutron star core
    for (let r = 14; r <= 38; r += 12) {
      ctx.strokeStyle = `rgba(125, 211, 252, ${0.55 - r * 0.01})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.55, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // BODY 3 (North-East Open Space: x=1620, y=58): Glowing Twin-Tail Comet ("Comet Hyperion-7")
    ctx.save();
    ctx.translate(1620, 58);
    ctx.rotate(-0.28);
    // Curved golden dust tail
    const dustTail = ctx.createLinearGradient(0, 0, 190, 42);
    dustTail.addColorStop(0, 'rgba(254, 240, 138, 0.75)');
    dustTail.addColorStop(0.45, 'rgba(251, 191, 36, 0.28)');
    dustTail.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = dustTail;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.quadraticCurveTo(95, -4, 190, 22);
    ctx.lineTo(185, 58);
    ctx.quadraticCurveTo(85, 18, 0, 6);
    ctx.closePath();
    ctx.fill();
    // Straight ionized blue plasma tail
    const ionTail = ctx.createLinearGradient(0, 0, 210, -12);
    ionTail.addColorStop(0, 'rgba(56, 189, 248, 0.88)');
    ionTail.addColorStop(0.5, 'rgba(14, 165, 233, 0.35)');
    ionTail.addColorStop(1, 'rgba(14, 165, 233, 0)');
    ctx.fillStyle = ionTail;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(210, -18);
    ctx.lineTo(210, -2);
    ctx.lineTo(0, 4);
    ctx.closePath();
    ctx.fill();
    // Glowing cyan coma & icy nucleus
    const comaG = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
    comaG.addColorStop(0, '#ffffff');
    comaG.addColorStop(0.4, 'rgba(103, 232, 249, 0.85)');
    comaG.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = comaG;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // BODY 4 (NE Deep Space above Room 2: x=2140, y=48): Relativistic "Gargantua" Kerr Black Hole
    drawRelativisticBlackHole2D(ctx, 2140, 48, t);

    // BODY 5 (West Deep Space outside Port Wing: x=-25, y=790): "Cat's Eye" Bipolar Planetary Nebula
    ctx.save();
    ctx.translate(-25, 790);
    for (let shell = 0; shell < 3; shell++) {
      ctx.save();
      ctx.rotate(shell * 0.55 + t * 0.002);
      ctx.strokeStyle =
        shell === 0
          ? 'rgba(45, 212, 191, 0.45)'
          : shell === 1
          ? 'rgba(244, 114, 182, 0.38)'
          : 'rgba(56, 189, 248, 0.32)';
      ctx.lineWidth = 3 - shell * 0.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 74 - shell * 12, 36 + shell * 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const pNebG = ctx.createRadialGradient(0, 0, 2, 0, 0, 58);
    pNebG.addColorStop(0, '#ffffff');
    pNebG.addColorStop(0.25, 'rgba(45, 212, 191, 0.55)');
    pNebG.addColorStop(0.65, 'rgba(192, 132, 252, 0.25)');
    pNebG.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = pNebG;
    ctx.beginPath();
    ctx.arc(0, 0, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // BODY 6 (East Deep Space outside Starboard Wing: x=2445, y=680): Grand Spiral Galaxy (Andromeda M31 Style)
    ctx.save();
    ctx.translate(2445, 680);
    ctx.rotate(-0.32);
    // Outer galactic disk halo
    ctx.save();
    ctx.scale(1, 0.44);
    const galG = ctx.createRadialGradient(0, 0, 6, 0, 0, 125);
    galG.addColorStop(0, 'rgba(255, 251, 235, 0.98)');
    galG.addColorStop(0.22, 'rgba(253, 224, 71, 0.72)');
    galG.addColorStop(0.52, 'rgba(147, 197, 253, 0.38)');
    galG.addColorStop(0.82, 'rgba(168, 85, 247, 0.16)');
    galG.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = galG;
    ctx.beginPath();
    ctx.arc(0, 0, 125, 0, Math.PI * 2);
    ctx.fill();

    // Logarithmic spiral arms
    for (let arm = 0; arm < 2; arm++) {
      ctx.strokeStyle = arm === 0 ? 'rgba(186, 230, 253, 0.55)' : 'rgba(233, 213, 255, 0.45)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let a = 0; a < 4.4; a += 0.15) {
        const rad = 12 + a * 23;
        const ang = a + arm * Math.PI + t * 0.002;
        const gx = Math.cos(ang) * rad;
        const gy = Math.sin(ang) * rad;
        if (a === 0) ctx.moveTo(gx, gy);
        else ctx.lineTo(gx, gy);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();

    // BODY 7 (SW Deep Space below Room 3 & West of Medical Department: x=220..710, y=1560..1650): Asteroid Cluster
    const asteroids = [
      { x: 220, y: 1565, rx: 28, ry: 19, rot: 0.3 },
      { x: 295, y: 1610, rx: 36, ry: 24, rot: -0.4 },
      { x: 365, y: 1575, rx: 20, ry: 14, rot: 0.8 },
      { x: 255, y: 1650, rx: 16, ry: 12, rot: 0.1 },
      { x: 650, y: 1555, rx: 32, ry: 22, rot: -0.25 },
      { x: 725, y: 1610, rx: 22, ry: 15, rot: 0.5 },
    ];
    for (const ast of asteroids) {
      ctx.save();
      ctx.translate(ast.x, ast.y);
      ctx.rotate(ast.rot);
      const aGrad = ctx.createRadialGradient(-ast.rx * 0.3, -ast.ry * 0.3, 2, 0, 0, ast.rx);
      aGrad.addColorStop(0, '#94a3b8');
      aGrad.addColorStop(0.6, '#475569');
      aGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = aGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, ast.rx, ast.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Impact craters
      ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
      ctx.beginPath();
      ctx.arc(-ast.rx * 0.25, ast.ry * 0.15, ast.rx * 0.22, 0, Math.PI * 2);
      ctx.arc(ast.rx * 0.3, -ast.ry * 0.2, ast.rx * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // BODY 8 (SE Space East of Medical Department & South of Room 4: x=1735, y=1565): Molten Volcanic Lava Exoplanet
    ctx.save();
    ctx.translate(1735, 1565);
    const lavaHalo = ctx.createRadialGradient(0, 0, 32, 0, 0, 68);
    lavaHalo.addColorStop(0, 'rgba(249, 115, 22, 0.45)');
    lavaHalo.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = lavaHalo;
    ctx.beginPath();
    ctx.arc(0, 0, 68, 0, Math.PI * 2);
    ctx.fill();

    const lavaPlanet = ctx.createRadialGradient(-14, -14, 4, 0, 0, 42);
    lavaPlanet.addColorStop(0, '#7c2d12');
    lavaPlanet.addColorStop(0.6, '#450a0a');
    lavaPlanet.addColorStop(1, '#090d16');
    ctx.fillStyle = lavaPlanet;
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.fill();

    // Glowing tectonic magma fissures across the crust
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-26, -12);
    ctx.quadraticCurveTo(-4, -2, 18, -16);
    ctx.moveTo(-4, -2);
    ctx.quadraticCurveTo(6, 14, 24, 18);
    ctx.moveTo(-22, 16);
    ctx.quadraticCurveTo(-6, 8, 8, 26);
    ctx.stroke();
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.restore();

    // BODY 9 (SE Deep Space below Room 4: x=2120, y=1610): Emerald/Cyan Terran Bio-World with Orbital Ring
    ctx.save();
    ctx.translate(2120, 1610);
    const terranGrad = ctx.createRadialGradient(-12, -12, 5, 0, 0, 46);
    terranGrad.addColorStop(0, '#6ee7b7');
    terranGrad.addColorStop(0.45, '#0d9488');
    terranGrad.addColorStop(0.8, '#0f172a');
    terranGrad.addColorStop(1, '#020617');
    ctx.fillStyle = terranGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, Math.PI * 2);
    ctx.fill();
    // Planetary artificial orbital ring with docking lights
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 78, 18, 0.25, -0.2, Math.PI + 0.2);
    ctx.stroke();
    ctx.restore();
  };

  /**
   * Renders a geometrically symmetric, cinema-grade "Gargantua" Relativistic Black Hole in 2D canvas:
   * - 100% centered & symmetrical (no crooked pinwheel spokes or off-center egg shapes!)
   * - Continuous 360° Gravitational Lensing Ring (smoothly wrapping over and under the Event Horizon)
   * - Back half of the wide Equatorial Accretion Disk behind the Event Horizon
   * - Pitch-Black Event Horizon Sphere (r = 25) + uniform razor-sharp White-Gold Einstein Photon Ring
   * - Front Equatorial Accretion Disk Bridge sweeping horizontally IN FRONT OF the black sphere!
   */
  const drawRelativisticBlackHole2D = (
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    t: number
  ) => {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(-0.14); // Subtle 8-degree cinematic roll

    const horizonR = 25.0;
    const diskRx = 148.0;
    const diskRy = 38.0;
    const pulse = 1.0 + Math.sin(t * 0.025) * 0.025;

    // 1. Wide Symmetrical Ambient Relativistic Glow
    ctx.save();
    ctx.scale(1.35, 0.78);
    const ambGlow = ctx.createRadialGradient(0, 0, horizonR * 0.7, 0, 0, 110);
    ambGlow.addColorStop(0, 'rgba(255, 247, 237, 0.45)');
    ambGlow.addColorStop(0.35, 'rgba(251, 146, 60, 0.26)');
    ambGlow.addColorStop(0.7, 'rgba(194, 65, 12, 0.10)');
    ambGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = ambGlow;
    ctx.beginPath();
    ctx.arc(0, 0, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Continuous Symmetrical 360° Gravitational Lensing Halo (Upper & Lower Relativistic Lensed Arches)
    //    Forms a seamless, perfectly centered ring around the Event Horizon that merges into the equatorial disk
    ctx.save();
    ctx.scale(1.14, 1.0);
    const lensGrad = ctx.createRadialGradient(0, 0, horizonR * 0.88, 0, 0, horizonR * 2.05 * pulse);
    lensGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
    lensGrad.addColorStop(0.18, 'rgba(254, 243, 199, 0.94)');
    lensGrad.addColorStop(0.42, 'rgba(251, 146, 60, 0.72)');
    lensGrad.addColorStop(0.72, 'rgba(194, 65, 12, 0.26)');
    lensGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = lensGrad;
    ctx.beginPath();
    ctx.arc(0, 0, horizonR * 2.05 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Helper to render the smooth concentric equatorial accretion disk (used for both back half and front bridge)
    const renderEquatorialDisk = () => {
      ctx.save();
      ctx.scale(1.0, diskRy / diskRx);

      const diskGrad = ctx.createRadialGradient(0, 0, horizonR * 0.9, 0, 0, diskRx);
      diskGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
      diskGrad.addColorStop(0.14, 'rgba(254, 240, 138, 0.95)');
      diskGrad.addColorStop(0.34, 'rgba(251, 146, 60, 0.86)');
      diskGrad.addColorStop(0.62, 'rgba(234, 88, 12, 0.52)');
      diskGrad.addColorStop(0.85, 'rgba(153, 27, 27, 0.20)');
      diskGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = diskGrad;
      ctx.beginPath();
      ctx.arc(0, 0, diskRx, 0, Math.PI * 2);
      ctx.fill();

      // Smooth concentric Keplerian plasma shear rings (100% centered and symmetric)
      for (let i = 0; i < 6; i++) {
        const ringR = horizonR * 1.18 + i * 17.5 + ((t * 0.45) % 17.5);
        if (ringR < diskRx - 12) {
          const ringAlpha = (1 - (ringR - horizonR) / (diskRx - horizonR)) * 0.34;
          ctx.strokeStyle =
            i % 2 === 0
              ? `rgba(255, 251, 235, ${ringAlpha.toFixed(3)})`
              : `rgba(253, 186, 116, ${ringAlpha.toFixed(3)})`;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(0, 0, ringR, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();
    };

    // 3. BACK HALF of the Wide Equatorial Accretion Disk (y <= 0, behind the Event Horizon)
    ctx.save();
    ctx.beginPath();
    ctx.rect(-diskRx - 10, -diskRy - 20, (diskRx + 10) * 2, diskRy + 20);
    ctx.clip();
    renderEquatorialDisk();
    ctx.restore();

    // 4. Central Pitch-Black Event Horizon Sphere (r = 25, centered at 0, 0)
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(0, 0, horizonR, 0, Math.PI * 2);
    ctx.fill();

    // 5. Uniform 360° Razor-Sharp Einstein Photon Ring hugging the Event Horizon
    ctx.strokeStyle = 'rgba(254, 243, 199, 0.95)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, horizonR + 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // 6. FRONT EQUATORIAL ACCRETION DISK BRIDGE (sweeping cleanly across the front of the black sphere!)
    //    Covers y >= 0 of the tilted disk AND smoothly blends across the front equator (y = -3 .. +diskRy)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, diskRx, diskRy, 0, 0, Math.PI, false);
    ctx.ellipse(0, 0, horizonR * 0.88, 5.2, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.clip();
    renderEquatorialDisk();
    ctx.restore();

    // 7. Continuous Horizontal Blazing Plasma Bridge Core across the front of the Event Horizon
    //    Ensures the equatorial band looks like a unified, glowing stream passing right in front of the sphere
    ctx.save();
    const frontBridgeGrad = ctx.createLinearGradient(0, -1, 0, 14);
    frontBridgeGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    frontBridgeGrad.addColorStop(0.28, 'rgba(255, 255, 255, 0.96)');
    frontBridgeGrad.addColorStop(0.58, 'rgba(254, 240, 138, 0.92)');
    frontBridgeGrad.addColorStop(0.85, 'rgba(251, 146, 60, 0.75)');
    frontBridgeGrad.addColorStop(1, 'rgba(234, 88, 12, 0)');
    ctx.fillStyle = frontBridgeGrad;
    ctx.beginPath();
    ctx.ellipse(0, 6.5, diskRx * 0.78, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  };

  /**
   * Traces the single, unbroken, streamlined outer armored hull contour of USSC HYPERION.
   * Everything INSIDE this contour is 100% solid opaque ship structure (rooms, corridors, and sealed internal
   * engineering bays) without deep concave notches between rooms so ZERO stars or background ever bleed through!
   * Everything OUTSIDE this contour is open deep space so all stars and cosmic bodies shine at full brightness.
   */
  const traceSpaceshipHullPolygon = (targetCtx: CanvasRenderingContext2D) => {
    targetCtx.beginPath();
    // 1. NW Wing & Bow Shoulder to Circular Observation Astro-Dome (Node 5)
    targetCtx.moveTo(124, 160);
    targetCtx.lineTo(620, 160);
    targetCtx.lineTo(996, 224);
    targetCtx.arc(1200, 198, 196, Math.PI * 0.95, Math.PI * 0.05, false);
    // 2. NE Bow Shoulder & NE Wing (Room 2: Fuel Storage & Processing)
    targetCtx.lineTo(1780, 160);
    targetCtx.lineTo(2276, 160);
    targetCtx.lineTo(2276, 596);
    // 3. Streamlined Starboard Mid-Hull Waist & SE Wing (Room 4: Tokamak Reactor)
    targetCtx.lineTo(2192, 660);
    targetCtx.lineTo(2192, 920);
    targetCtx.lineTo(2276, 984);
    targetCtx.lineTo(2276, 1456);
    // 4. South Stern Wing & Chamfered Aft Medical Department (medbay_south: x=880..1520, y=1340..1680)
    targetCtx.lineTo(1640, 1456);
    targetCtx.lineTo(1538, 1698);
    targetCtx.lineTo(862, 1698);
    targetCtx.lineTo(760, 1456);
    // 5. SW Wing (Room 3: Planetary Rover & Robotics Bay) & Streamlined Port Mid-Hull Waist
    targetCtx.lineTo(124, 1456);
    targetCtx.lineTo(124, 984);
    targetCtx.lineTo(208, 920);
    targetCtx.lineTo(208, 660);
    targetCtx.lineTo(124, 596);
    targetCtx.closePath();
  };

  /**
   * Draws the solid opaque armored spacecraft superstructure of USSC HYPERION so that nothing inside the ship
   * ever bleeds through to the starry background, plus internal engineering sub-bays in the structural voids
   * between corridors and external ion thruster plumes on the stern wings.
   */
  const drawSpaceshipExteriorHull = (ctx: CanvasRenderingContext2D, t: number) => {
    ctx.save();

    // 1. Engine Thruster Plumes on West Stern Wings (Room 1 & Room 3 outer stern)
    const plumeLen = 95 + Math.sin(t * 0.04) * 10;
    const engineYPositions = [290, 470, 1120, 1320];
    for (const ey of engineYPositions) {
      const grad = ctx.createLinearGradient(125 - plumeLen, ey, 130, ey);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      grad.addColorStop(0.55, 'rgba(56, 189, 248, 0.28)');
      grad.addColorStop(1, 'rgba(186, 230, 253, 0.68)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(130, ey - 28);
      ctx.lineTo(125 - plumeLen, ey);
      ctx.lineTo(130, ey + 28);
      ctx.closePath();
      ctx.fill();

      // 2.5D Engine Nozzle Housing mounted directly to the west hull of Room 1 & Room 3
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.fillRect(104, ey - 32, 26, 64);
      ctx.strokeRect(104, ey - 32, 26, 64);
    }

    // 2. 2.5D Lower Hull Thickness Skirt under the entire ship (extruded downward by 18px)
    ctx.save();
    ctx.translate(0, 18);
    traceSpaceshipHullPolygon(ctx);
    ctx.fillStyle = '#070a10';
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    // 3. 100% OPAQUE ARMORED HULL SUPERSTRUCTURE FILL (eliminates all background bleed-through inside the ship!)
    traceSpaceshipHullPolygon(ctx);
    ctx.fillStyle = '#0f1623';
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.stroke();

    // 4. Clip to the ship hull interior and render heavy armor plating seams & sealed internal engineering sub-bays
    //    across all non-walkable structural compartments of the ship
    ctx.save();
    traceSpaceshipHullPolygon(ctx);
    ctx.clip();

    // Structural hull armor plating grid across the non-walkable ship superstructure
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.38)';
    ctx.lineWidth = 1.5;
    for (let hx = 120; hx <= 2280; hx += 80) {
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.lineTo(hx, 1720);
      ctx.stroke();
    }
    for (let hy = 40; hy <= 1720; hy += 80) {
      ctx.beginPath();
      ctx.moveTo(120, hy);
      ctx.lineTo(2280, hy);
      ctx.stroke();
    }

    // Sealed internal engineering sub-bays in the structural compartments between rooms and corridors
    const internalSubBays = [
      { x: 814, y: 400, w: 92, h: 240, color: '#38bdf8' },
      { x: 1494, y: 400, w: 92, h: 240, color: '#22d3ee' },
      { x: 814, y: 820, w: 92, h: 290, color: '#2dd4bf' },
      { x: 1494, y: 820, w: 92, h: 290, color: '#a855f7' },
      { x: 248, y: 636, w: 280, h: 320, color: '#0ea5e9' },
      { x: 1872, y: 636, w: 280, h: 320, color: '#8b5cf6' },
      { x: 540, y: 1304, w: 290, h: 124, color: '#14b8a6' },
      { x: 1570, y: 1304, w: 290, h: 124, color: '#f43f5e' },
    ];
    for (const bay of internalSubBays) {
      ctx.fillStyle = '#0a0f18';
      ctx.fillRect(bay.x, bay.y, bay.w, bay.h);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.strokeRect(bay.x, bay.y, bay.w, bay.h);

      // Sub-hull structural cross-bracing & conduit pipes inside the sealed engineering bay
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bay.x + 8, bay.y + 8);
      ctx.lineTo(bay.x + bay.w - 8, bay.y + bay.h - 8);
      ctx.moveTo(bay.x + bay.w - 8, bay.y + 8);
      ctx.lineTo(bay.x + 8, bay.y + bay.h - 8);
      ctx.stroke();

      ctx.fillStyle = '#162032';
      ctx.fillRect(bay.x + 18, bay.y + 28, bay.w - 36, bay.h - 56);
      ctx.strokeStyle = bay.color;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bay.x + 18, bay.y + 28, bay.w - 36, bay.h - 56);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
    ctx.restore();
  };

  const drawShipDeckAndBulkheads = (ctx: CanvasRenderingContext2D) => {
    // PASS 1: Extruded 2.5D Outer Bulkhead Walls around all walkable zones (both rectangular and circular)
    ctx.fillStyle = '#090d14';
    for (const z of WALKABLE_ZONES) {
      if (z.shape === 'circle' && z.cx !== undefined && z.cy !== undefined && z.r !== undefined) {
        ctx.beginPath();
        ctx.arc(z.cx, z.cy - 12, z.r + 16, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(z.x - 14, z.y - 38, z.w + 28, z.h + 52);
      }
    }

    ctx.fillStyle = '#1e293b';
    for (const z of WALKABLE_ZONES) {
      if (z.shape === 'circle' && z.cx !== undefined && z.cy !== undefined && z.r !== undefined) {
        ctx.beginPath();
        ctx.arc(z.cx, z.cy - 12, z.r + 7, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(z.x - 6, z.y - 30, z.w + 12, z.h + 36);
      }
    }

    // PASS 2: 2.5D North Bulkhead Wall Panels (30px vertical interior walls)
    // Drawn BEFORE floor pass so any overlapping corridor/doorway cleanly paints its floor over the opening!
    for (const z of WALKABLE_ZONES) {
      if (z.shape === 'circle' && z.cx !== undefined && z.cy !== undefined && z.r !== undefined) {
        // Curved 2.5D Northern Observation Dome Wall (crescent between cy - 28 and cy)
        ctx.save();
        const wallGrad = ctx.createLinearGradient(0, z.cy - z.r - 28, 0, z.cy);
        wallGrad.addColorStop(0, '#334155');
        wallGrad.addColorStop(0.5, '#1e293b');
        wallGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = wallGrad;
        ctx.beginPath();
        ctx.arc(z.cx, z.cy - 26, z.r, Math.PI, Math.PI * 2);
        ctx.arc(z.cx, z.cy, z.r, 0, Math.PI, true);
        ctx.closePath();
        ctx.fill();

        // Panoramic curved star-observation armored glass panels along the north dome arc
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(z.cx, z.cy - 13, z.r - 2, Math.PI * 1.18, Math.PI * 1.82);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(z.cx, z.cy - 15, z.r - 2, Math.PI * 1.18, Math.PI * 1.82);
        ctx.stroke();

        // Radial structural ribs dividing the curved observation dome
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 4;
        for (let i = 1; i <= 7; i++) {
          const a = Math.PI + (i * Math.PI) / 8;
          ctx.beginPath();
          ctx.moveTo(z.cx + Math.cos(a) * z.r, z.cy + Math.sin(a) * z.r);
          ctx.lineTo(z.cx + Math.cos(a) * z.r, z.cy - 26 + Math.sin(a) * z.r);
          ctx.stroke();
        }

        if (z.color) {
          ctx.strokeStyle = z.color;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(z.cx, z.cy - 2, z.r, Math.PI * 1.05, Math.PI * 1.95);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      } else {
        const wallGrad = ctx.createLinearGradient(0, z.y - 28, 0, z.y);
        wallGrad.addColorStop(0, '#334155');
        wallGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = wallGrad;
        ctx.fillRect(z.x, z.y - 28, z.w, 28);

        ctx.fillStyle = '#1e293b';
        for (let rx = z.x + 24; rx < z.x + z.w - 16; rx += 48) {
          ctx.fillRect(rx, z.y - 26, 6, 24);
        }

        if (z.color) {
          ctx.fillStyle = z.color;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(z.x, z.y - 3, z.w, 3);
          ctx.globalAlpha = 1;
        }
      }
    }

    // PASS 3: Room-Specific Multi-Material Decking (Walkable Floors)
    // Render corridors first and main rooms second so room thresholds are crisp and corridor hazard lines never bleed into rooms
    const orderedFloorZones = [
      ...WALKABLE_ZONES.filter((z) => z.isCorridor || z.id === 'storage'),
      ...WALKABLE_ZONES.filter((z) => !z.isCorridor && z.id !== 'storage'),
    ];
    for (const z of orderedFloorZones) {
      ctx.save();
      ctx.beginPath();
      if (z.shape === 'circle' && z.cx !== undefined && z.cy !== undefined && z.r !== undefined) {
        ctx.arc(z.cx, z.cy, z.r, 0, Math.PI * 2);
      } else {
        ctx.rect(z.x, z.y, z.w, z.h);
      }
      ctx.clip();

      if (z.shape === 'circle' && z.cx !== undefined && z.cy !== undefined && z.r !== undefined) {
        // Circular Astrodome Observatory Deck (Node 5)
        const radGrad = ctx.createRadialGradient(z.cx, z.cy, 12, z.cx, z.cy, z.r);
        radGrad.addColorStop(0, '#0f172a');
        radGrad.addColorStop(0.65, '#172133');
        radGrad.addColorStop(1, '#111827');
        ctx.fillStyle = radGrad;
        ctx.fillRect(z.x, z.y, z.w, z.h);

        // Radial star-sector division lines (12 celestial hours)
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6;
          ctx.beginPath();
          ctx.moveTo(z.cx + Math.cos(a) * 44, z.cy + Math.sin(a) * 44);
          ctx.lineTo(z.cx + Math.cos(a) * z.r, z.cy + Math.sin(a) * z.r);
          ctx.stroke();
        }

        // Concentric brass/gold & cyan celestial astrolabe rings on the circular floor
        for (const ringR of [158, 122, 84]) {
          ctx.strokeStyle = ringR === 158 ? 'rgba(250, 204, 21, 0.28)' : 'rgba(56, 189, 248, 0.18)';
          ctx.lineWidth = ringR === 158 ? 2.5 : 1.5;
          ctx.beginPath();
          ctx.arc(z.cx, z.cy, ringR, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Central Recessed Glass Starlight Oculus in the middle of the circular room (1200, 242)
        const ocY = z.cy + 32;
        ctx.fillStyle = '#050811';
        ctx.beginPath();
        ctx.arc(z.cx, ocY, 44, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Constellation lines & stars inside the central floor oculus
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(z.cx - 22, ocY - 12);
        ctx.lineTo(z.cx - 4, ocY - 2);
        ctx.lineTo(z.cx + 18, ocY - 16);
        ctx.lineTo(z.cx + 12, ocY + 14);
        ctx.lineTo(z.cx - 14, ocY + 18);
        ctx.closePath();
        ctx.stroke();

        for (const [sx, sy, sc] of [
          [-22, -12, '#38bdf8'],
          [-4, -2, '#f8fafc'],
          [18, -16, '#fde047'],
          [12, 14, '#fb923c'],
          [-14, 18, '#f87171'],
        ] as [number, number, string][]) {
          ctx.fillStyle = sc;
          ctx.beginPath();
          ctx.arc(z.cx + sx, ocY + sy, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (z.isCorridor || z.id === 'storage') {
        ctx.fillStyle = '#171f2c';
        ctx.fillRect(z.x, z.y, z.w, z.h);

        ctx.fillStyle = '#121822';
        ctx.fillRect(z.x + 14, z.y + 14, z.w - 28, z.h - 28);

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
        ctx.lineWidth = 1;
        for (let gx = z.x; gx < z.x + z.w; gx += 16) {
          ctx.beginPath();
          ctx.moveTo(gx, z.y);
          ctx.lineTo(gx, z.y + z.h);
          ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.lineWidth = 2;
        ctx.strokeRect(z.x + 10, z.y + 10, z.w - 20, z.h - 20);
      } else if (z.id === 'cafeteria') {
        ctx.fillStyle = '#1b2434';
        ctx.fillRect(z.x, z.y, z.w, z.h);

        ctx.strokeStyle = '#232f44';
        ctx.lineWidth = 2;
        const tile = 56;
        for (let tx = z.x; tx <= z.x + z.w; tx += tile) {
          ctx.beginPath();
          ctx.moveTo(tx, z.y);
          ctx.lineTo(tx, z.y + z.h);
          ctx.stroke();
        }
        for (let ty = z.y; ty <= z.y + z.h; ty += tile) {
          ctx.beginPath();
          ctx.moveTo(z.x, ty);
          ctx.lineTo(z.x + z.w, ty);
          ctx.stroke();
        }

        // Concentric circular deck inlay around the Central Key Synthesis Core (1200, 740)
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.22)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(1200, 740, 125, 0, Math.PI * 2);
        ctx.stroke();
      } else if (z.id === 'medbay_south') {
        // Southern Medical Department (Лазарет и Биолаборатория): Sterile teal-slate clinical tile floor
        ctx.fillStyle = '#122229';
        ctx.fillRect(z.x, z.y, z.w, z.h);

        ctx.strokeStyle = 'rgba(45, 212, 191, 0.12)';
        ctx.lineWidth = 1.4;
        for (let tx = z.x; tx <= z.x + z.w; tx += 40) {
          ctx.beginPath();
          ctx.moveTo(tx, z.y);
          ctx.lineTo(tx, z.y + z.h);
          ctx.stroke();
        }
        for (let ty = z.y; ty <= z.y + z.h; ty += 40) {
          ctx.beginPath();
          ctx.moveTo(z.x, ty);
          ctx.lineTo(z.x + z.w, ty);
          ctx.stroke();
        }

        // Sterile quarantine zone perimeter line
        ctx.strokeStyle = 'rgba(45, 212, 191, 0.28)';
        ctx.lineWidth = 2;
        ctx.strokeRect(z.x + 16, z.y + 16, z.w - 32, z.h - 32);

        // Central Surgical Bay Ring & Medical Cross Inlay at (1200, 1525)
        ctx.strokeStyle = 'rgba(45, 212, 191, 0.32)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(1200, 1525, 92, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(45, 212, 191, 0.16)';
        ctx.fillRect(1200 - 58, 1525 - 16, 116, 32);
        ctx.fillRect(1200 - 16, 1525 - 58, 32, 116);
      } else if (z.id === 'medbay_hub') {
        ctx.fillStyle = '#18272e';
        ctx.fillRect(z.x, z.y, z.w, z.h);

        ctx.strokeStyle = 'rgba(45, 212, 191, 0.1)';
        ctx.lineWidth = 1.5;
        for (let tx = z.x; tx <= z.x + z.w; tx += 40) {
          ctx.beginPath();
          ctx.moveTo(tx, z.y);
          ctx.lineTo(tx, z.y + z.h);
          ctx.stroke();
        }
        for (let ty = z.y; ty <= z.y + z.h; ty += 40) {
          ctx.beginPath();
          ctx.moveTo(z.x, ty);
          ctx.lineTo(z.x + z.w, ty);
          ctx.stroke();
        }
      } else if (z.id === 'cockpit') {
        ctx.fillStyle = '#1b202b';
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.strokeStyle = '#283040';
        ctx.lineWidth = 2;
        for (let ty = z.y; ty <= z.y + z.h; ty += 36) {
          ctx.beginPath();
          ctx.moveTo(z.x, ty);
          ctx.lineTo(z.x + z.w, ty);
          ctx.stroke();
        }
      } else if (z.id === 'navigation') {
        // Room 2 (Node 2): Fuel Storage & Processing Department Deck (NE Sector: x=1900..2260, y=200..580)
        ctx.fillStyle = '#131c22';
        ctx.fillRect(z.x, z.y, z.w, z.h);

        // Industrial steel grating grid across the Fuel Storage & Processing compartment
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.lineWidth = 1;
        for (let gx = z.x; gx <= z.x + z.w; gx += 32) {
          ctx.beginPath();
          ctx.moveTo(gx, z.y);
          ctx.lineTo(gx, z.y + z.h);
          ctx.stroke();
        }
        for (let gy = z.y; gy <= z.y + z.h; gy += 32) {
          ctx.beginPath();
          ctx.moveTo(z.x, gy);
          ctx.lineTo(z.x + z.w, gy);
          ctx.stroke();
        }

        // Recessed spill-containment floor grates under North Cryo-Silos & East Fuel Refinery Skid
        ctx.fillStyle = '#0b1116';
        ctx.fillRect(1926, 208, 172, 68);
        ctx.fillRect(2150, 278, 102, 288);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1926, 208, 172, 68);
        ctx.strokeRect(2150, 278, 102, 288);
      } else if (z.id === 'rover_bay') {
        // Room 3 (Node 3): Planetary Rover & Robotics Bay Deck (SW Sector: x=140..500, y=1020..1440)
        ctx.fillStyle = '#141d26';
        ctx.fillRect(z.x, z.y, z.w, z.h);

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.lineWidth = 1.2;
        for (let gx = z.x; gx <= z.x + z.w; gx += 40) {
          ctx.beginPath();
          ctx.moveTo(gx, z.y);
          ctx.lineTo(gx, z.y + z.h);
          ctx.stroke();
        }
        for (let gy = z.y; gy <= z.y + z.h; gy += 40) {
          ctx.beginPath();
          ctx.moveTo(z.x, gy);
          ctx.lineTo(z.x + z.w, gy);
          ctx.stroke();
        }

        // Rover calibration & docking pad border
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.28)';
        ctx.lineWidth = 3;
        ctx.strokeRect(z.x + 24, z.y + 26, 178, 178);
      } else if (z.id === 'reactor') {
        // Tokamak Cold Nuclear Fusion Control Room floor
        ctx.fillStyle = '#1a1826';
        ctx.fillRect(z.x, z.y, z.w, z.h);

        // Magnetic containment ring inlay around central Tokamak (2080, 1215)
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(2080, 1215, 105, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#182132';
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.strokeStyle = '#222e42';
        ctx.lineWidth = 1.5;
        for (let tx = z.x; tx <= z.x + z.w; tx += 48) {
          ctx.beginPath();
          ctx.moveTo(tx, z.y);
          ctx.lineTo(tx, z.y + z.h);
          ctx.stroke();
        }
        for (let ty = z.y; ty <= z.y + z.h; ty += 48) {
          ctx.beginPath();
          ctx.moveTo(z.x, ty);
          ctx.lineTo(z.x + z.w, ty);
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  };

  /**
   * Draws all flat sub-deck floor conduits, recessed trenches, door threshold plates, and soft radial floor glows
   * on the Floor Layer BEFORE any 2.5D objects or Astronaut Daniil so floor lines never overlap boots or 3D volumes.
   */
  const drawFloorConduitsAndAuras25D = (ctx: CanvasRenderingContext2D, t: number) => {
    const nodeSolvedFlags = [
      tasks.node1Solved,
      tasks.node2Solved,
      tasks.node3Solved,
      tasks.node4Solved,
      tasks.node5Solved,
    ];

    // 1. Central Command Center floor fiber-optic conduits & server plinth bases
    const serverConduitTargets = [
      [998, 632],
      [1402, 632],
      [948, 842],
      [1452, 842],
      [1006, 930],
      [1394, 930],
    ];
    for (let i = 0; i < serverConduitTargets.length; i++) {
      const [sx, sy] = serverConduitTargets[i];
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(1200, 740);
      ctx.stroke();
    }

    for (const bankX of [942, 1346]) {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(bankX - 4, 594, 120, 62);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bankX - 4, 594, 120, 62);
    }

    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      ctx.strokeStyle = nodeSolvedFlags[i] ? 'rgba(52, 211, 153, 0.75)' : 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(1200 + Math.cos(a) * 42, 740 + Math.sin(a) * 42);
      ctx.lineTo(1200 + Math.cos(a) * 95, 740 + Math.sin(a) * 95);
      ctx.stroke();
    }

    // 2. Room 2 Sub-Floor Recessed Fuel Pipeline Trenches
    const primaryFuelColor = tasks.node2Solved ? '#34d399' : '#06b6d4';
    const fuelPipelines = [
      { x1: 2012, y1: 268, x2: 2090, y2: 350, color: '#38bdf8' },
      { x1: 2175, y1: 262, x2: 2185, y2: 290, color: '#f59e0b' },
      { x1: 2156, y1: 360, x2: 2090, y2: 360, color: primaryFuelColor },
      { x1: 2032, y1: 516, x2: 2090, y2: 370, color: '#f59e0b' },
    ];
    for (const pipe of fuelPipelines) {
      ctx.strokeStyle = '#070b10';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(pipe.x1, pipe.y1);
      ctx.lineTo(pipe.x2, pipe.y2);
      ctx.stroke();

      ctx.strokeStyle = pipe.color;
      ctx.globalAlpha = 0.48;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pipe.x1, pipe.y1);
      ctx.lineTo(pipe.x2, pipe.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 3. Room 3 Armored Power & Telemetry Umbilical Cable on Floor
    const roverAccent = tasks.node3Solved ? '#34d399' : '#00ff9d';
    ctx.save();
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(365, 1076);
    ctx.bezierCurveTo(335, 1095, 310, 1105, 285, 1110);
    ctx.stroke();
    ctx.strokeStyle = roverAccent;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -t * 0.3;
    ctx.beginPath();
    ctx.moveTo(365, 1076);
    ctx.bezierCurveTo(335, 1095, 310, 1105, 285, 1110);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 4. Room 4 Sub-Deck Armored Power Busbars & Tokamak Ambient Floor Glow
    const conduitTargets = [
      { x1: 2080, y1: 1085, x2: 2080, y2: 1170 },
      { x1: 2010, y1: 1085, x2: 2050, y2: 1180 },
      { x1: 2150, y1: 1085, x2: 2110, y2: 1180 },
      { x1: 2205, y1: 1215, x2: 2130, y2: 1215 },
      { x1: 1955, y1: 1310, x2: 2040, y2: 1240 },
      { x1: 2080, y1: 1348, x2: 2080, y2: 1255 },
    ];
    for (const c of conduitTargets) {
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y1);
      ctx.lineTo(c.x2, c.y2);
      ctx.stroke();

      ctx.strokeStyle = tasks.node4Solved ? 'rgba(52, 211, 153, 0.55)' : 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y1);
      ctx.lineTo(c.x2, c.y2);
      ctx.stroke();
    }

    const tokFloorGlow = ctx.createRadialGradient(2080, 1215, 15, 2080, 1215, 95);
    tokFloorGlow.addColorStop(
      0,
      tasks.node4Solved ? 'rgba(52, 211, 153, 0.32)' : 'rgba(56, 189, 248, 0.28)'
    );
    tokFloorGlow.addColorStop(0.6, 'rgba(139, 92, 246, 0.12)');
    tokFloorGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = tokFloorGlow;
    ctx.beginPath();
    ctx.arc(2080, 1215, 95, 0, Math.PI * 2);
    ctx.fill();

    // 5. Southern Medical Department Central Surgical MRI Floor Glow
    const surgGlow = ctx.createRadialGradient(1200, 1525, 8, 1200, 1525, 74);
    surgGlow.addColorStop(0, 'rgba(45, 212, 191, 0.35)');
    surgGlow.addColorStop(0.6, 'rgba(6, 182, 212, 0.14)');
    surgGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = surgGlow;
    ctx.beginPath();
    ctx.arc(1200, 1525, 74, 0, Math.PI * 2);
    ctx.fill();

    // 6. Interactive Terminal Floor Auras
    for (const rm of SHIP_ROOMS) {
      const solved = isTaskSolved(rm.taskIndex);
      const isNear = nearbyTerminalRef.current === rm.taskIndex;
      const auraR = isNear ? 56 : 40;
      const grad = ctx.createRadialGradient(
        rm.terminalX,
        rm.terminalY,
        4,
        rm.terminalX,
        rm.terminalY,
        auraR
      );
      grad.addColorStop(0, solved ? 'rgba(16, 185, 129, 0.38)' : `${rm.color}44`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(rm.terminalX, rm.terminalY, auraR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7. Bulkhead Door Floor Threshold Hazard Plates & Auras
    for (const door of SHIP_DOORS) {
      const progress = doorLiftProgressRef.current[door.doorId] ?? 0;
      const isNear = nearbyDoorRef.current === door.doorId;
      const isUnlocked = unlockedDoorsRef.current[door.doorId] || progress >= 0.98;

      ctx.fillStyle = '#0b111d';
      ctx.fillRect(door.x - 2, door.y - 2, door.w + 4, door.h + 4);
      ctx.strokeStyle = isUnlocked ? 'rgba(16, 185, 129, 0.45)' : 'rgba(245, 158, 11, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(door.x, door.y, door.w, door.h);

      if (!isUnlocked) {
        const auraGrad = ctx.createRadialGradient(
          door.cx,
          door.cy,
          6,
          door.cx,
          door.cy,
          isNear ? 68 : 48
        );
        auraGrad.addColorStop(0, isNear ? 'rgba(251, 191, 36, 0.36)' : 'rgba(239, 68, 68, 0.22)');
        auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(door.cx, door.cy, isNear ? 68 : 48, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  /**
   * Collects all 2.5D room props, machines, consoles, Tokamak, Robot-Rover, and Central Key Core
   * as individual Y-sortable items (`Sortable25DItem[]`) so Daniil renders behind any object when walking above (north of) it.
   */
  const collectRoomDetails25D = (
    ctx: CanvasRenderingContext2D,
    t: number,
    items: Sortable25DItem[]
  ) => {
    // =========================================================================
    // 1. CENTRAL COMMAND CENTER & SERVER CORE (x: 920..1480, y: 580..1020)
    // =========================================================================
    // 1A. NW & NE HIGH-DENSITY QUANTUM SERVER CLUSTERS (y: 600..648)
    for (const [bankX, bankIdx, label] of [
      [942, 0, 'Северо-западный серверный кластер'],
      [1346, 1, 'Северо-восточный серверный кластер'],
    ] as [number, number, string][]) {
      items.push({
        sortY: getRectPropSortY(580, 74),
        label,
        draw: () => {
          for (let cab = 0; cab < 2; cab++) {
            const cx = bankX + cab * 58;
            const cy = 600;
            drawBox25D(ctx, cx, cy, 52, 48, 34, '#1e293b', '#0b111e', '#38bdf8');

            ctx.fillStyle = '#090d16';
            ctx.beginPath();
            ctx.arc(cx + 26, cy + 24 - 34, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            const frontTopY = cy + 48 - 34;
            for (let b = 0; b < 5; b++) {
              const by = frontTopY + 3 + b * 6;
              ctx.fillStyle = '#060a12';
              ctx.fillRect(cx + 4, by, 44, 4.5);

              for (let led = 0; led < 4; led++) {
                const isLit =
                  (Math.floor(t * 0.25) + bankIdx * 3 + cab * 5 + b + led) % 4 !== 0;
                ctx.fillStyle =
                  led === 0
                    ? '#38bdf8'
                    : isLit
                    ? b % 2 === 0
                      ? '#34d399'
                      : '#22d3ee'
                    : '#1e293b';
                ctx.fillRect(cx + 6 + led * 5, by + 1, 3, 2.4);
              }

              ctx.fillStyle = (b + cab) % 2 === 0 ? '#0284c7' : '#0d9488';
              ctx.fillRect(cx + 30, by + 1, 15, 2.4);
            }
          }
        },
      });
    }

    // 1B. WEST & EAST WALL 3-TIER 2.5D TELEMETRY MAINFRAME TOWERS (y: 810..876)
    for (const [mx, isEast, label] of [
      [928, false, 'Западная стойка телеметрии'],
      [1434, true, 'Восточная стойка телеметрии'],
    ] as [number, boolean, string][]) {
      items.push({
        sortY: getRectPropSortY(810, 66),
        label,
        draw: () => {
          drawAngledConsole25D(
            ctx,
            mx,
            810,
            38,
            66,
            24,
            44,
            isEast ? '#34d399' : '#22d3ee',
            t,
            isEast ? 'bars' : 'dual',
            true
          );
        },
      });
    }

    // 1C. SW & SE 3-TIER 2.5D TACTICAL FLIGHT & TELEMETRY COMMAND CONSOLES (y: 896..972)
    for (const [deskX, isRightDesk, label] of [
      [944, false, 'Левый тактический пульт управления'],
      [1332, true, 'Правый тактический пульт управления'],
    ] as [number, boolean, string][]) {
      items.push({
        sortY: getRectPropSortY(896, 76),
        label,
        draw: () => {
          const zDeck = 22;
          const zHood = 42;
          const hoodD = 16;

          drawBox25D(ctx, deskX, 896, 124, 48, zDeck, '#1e293b', '#0b111e', '#38bdf8');

          const frontY = 896 + 48 - zDeck;
          for (let vx = deskX + 10; vx < deskX + 104; vx += 38) {
            ctx.fillStyle = '#040811';
            ctx.fillRect(vx, frontY + 5, 26, 11);
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.strokeRect(vx, frontY + 5, 26, 11);
          }

          drawBox25D(ctx, deskX + 2, 896, 120, hoodD, zHood, '#334155', '#0b1322', '#38bdf8');
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(deskX + 8, 896 - zHood + 3, 108, 9);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(deskX + 12, 896 - zHood + 2, 28, 2);
          ctx.fillStyle = '#34d399';
          ctx.fillRect(deskX + 92, 896 - zHood + 2, 20, 2);

          const hoodFrontTopY = 896 + hoodD - zHood;
          const hoodFrontBotY = 896 + hoodD - zDeck;
          const deckFrontY = 896 + 48 - zDeck - 2;
          for (const sideX of [deskX + 2, deskX + 118]) {
            ctx.fillStyle = '#162032';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(sideX, hoodFrontTopY);
            ctx.lineTo(sideX + 4, hoodFrontTopY);
            ctx.lineTo(sideX + 4, deckFrontY);
            ctx.lineTo(sideX, hoodFrontBotY + 4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }

          const scrY = hoodFrontTopY + 2;
          const scrH = zHood - zDeck - 2;

          ctx.fillStyle = '#030712';
          ctx.fillRect(deskX + 7, scrY, 34, scrH);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.1;
          ctx.strokeRect(deskX + 7, scrY, 34, scrH);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
          ctx.beginPath();
          ctx.arc(deskX + 24, scrY + scrH / 2, 6.8, 0, Math.PI * 2);
          ctx.stroke();
          const sweepA = t * 0.06 + (isRightDesk ? 1.8 : 0);
          ctx.strokeStyle = '#34d399';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(deskX + 24, scrY + scrH / 2);
          ctx.lineTo(deskX + 24 + Math.cos(sweepA) * 6.8, scrY + scrH / 2 + Math.sin(sweepA) * 6.8);
          ctx.stroke();

          ctx.fillStyle = '#030712';
          ctx.fillRect(deskX + 44, scrY, 38, scrH);
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 1.1;
          ctx.strokeRect(deskX + 44, scrY, 38, scrH);
          for (let bar = 0; bar < 5; bar++) {
            const bh = 5 + ((bar * 4 + (isRightDesk ? 3 : 1) + Math.floor(t * 0.15)) % 11);
            ctx.fillStyle = bar % 2 === 0 ? '#38bdf8' : '#34d399';
            ctx.fillRect(deskX + 48 + bar * 6.2, scrY + scrH - 2 - bh, 4.2, bh);
          }

          ctx.fillStyle = '#030712';
          ctx.fillRect(deskX + 85, scrY, 32, scrH);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.1;
          ctx.strokeRect(deskX + 85, scrY, 32, scrH);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(deskX + 89, scrY + 4, 22, 3);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(deskX + 89, scrY + 10, 16, 3);

          const opDeckY = hoodFrontBotY + 4;
          ctx.fillStyle = '#090d16';
          ctx.fillRect(deskX + 8, opDeckY, 82, 22);
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1;
          ctx.strokeRect(deskX + 8, opDeckY, 82, 22);

          for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 8; c++) {
              const bx = deskX + 11 + c * 9.5;
              const by = opDeckY + 3 + r * 8;
              ctx.fillStyle = '#020617';
              ctx.fillRect(bx, by + 1.5, 6.5, 4.5);
              ctx.fillStyle =
                (r + c) % 3 === 0 ? '#38bdf8' : (r + c) % 3 === 1 ? '#34d399' : '#f59e0b';
              ctx.fillRect(bx, by, 6.5, 3.8);
            }
          }

          for (let lv = 0; lv < 2; lv++) {
            const lx = deskX + 98 + lv * 11;
            const ly = opDeckY + 14;
            ctx.fillStyle = '#020617';
            ctx.fillRect(lx - 1.5, ly - 5, 3, 9);
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(lx, ly - 7);
            ctx.stroke();
            ctx.fillStyle = lv === 0 ? '#f43f5e' : '#38bdf8';
            ctx.fillRect(lx - 4, ly - 9, 8, 3.5);
          }

          const chairX = deskX + 46;
          drawBox25D(ctx, chairX, 950, 32, 20, 16, '#334155', '#1e293b', '#64748b');
          drawBox25D(ctx, chairX + 2, 964, 28, 8, 24, '#475569', '#1e293b', '#94a3b8');
        },
      });
    }

    // 1D. Central Master Key Synthesis Core Pedestal & Crystal at (1200, 740)
    items.push({
      sortY: getCirclePropSortY(740),
      label: 'Центральный терминал синтеза ключа',
      draw: () => {
        drawCylinder25D(ctx, 1200, 740, 42, 32, 18, '#1e293b', '#0f172a', '#38bdf8');
        drawCylinder25D(ctx, 1200, 740 - 14, 28, 21, 14, '#0f172a', '#1e293b', '#22d3ee');

        const holoY = 740 - 44 + Math.sin(t * 0.03) * 3;
        ctx.strokeStyle = tasks.escaped ? '#34d399' : '#22d3ee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(1200, holoY - 16);
        ctx.lineTo(1214, holoY);
        ctx.lineTo(1200, holoY + 16);
        ctx.lineTo(1186, holoY);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = tasks.escaped ? 'rgba(52, 211, 153, 0.35)' : 'rgba(34, 211, 238, 0.28)';
        ctx.fill();
      },
    });

    // 2. ROOM 1: AVIATION & AVIONICS EXHIBITION (NW Sector)
    collectAviationExhibitionRoom1_25D(ctx, t, tasks.node1Solved, items);

    // 3. ROOM 2: FUEL STORAGE & PROCESSING DEPARTMENT (NE Sector)
    collectFuelStorageAndProcessingRoom2_25D(ctx, t, tasks.node2Solved, items);

    // 4. ROOM 3: PLANETARY ROVER & ROBOTICS HANGAR (SW Sector)
    collectRoverAndRoboticsBayRoom3_25D(ctx, t, tasks.node3Solved, items);
    items.push({
      sortY: getCirclePropSortY(1120),
      label: 'Тяжёлый планетоход',
      draw: () => drawPlanetaryRobotRover25D(ctx, 245, 1120, t, tasks.node3Solved),
    });

    // 5. ROOM 4: TOKAMAK COLD NUCLEAR FUSION CONTROL ROOM (SE Sector)
    collectTokamakControlRoomPanels25D(ctx, t, tasks.node4Solved, items);
    items.push({
      sortY: getCirclePropSortY(1215),
      label: 'Токамак холодного ядерного синтеза',
      draw: () => drawCentralTokamak25D(ctx, 2080, 1215, t, tasks.node4Solved),
    });

    // 6. CIRCULAR ASTRO-DOME // STAR SPECTRUM OBSERVATORY (North Circle)
    collectCircularAstroDomeDetails25D(ctx, t, tasks.node5Solved, items);

    // 7. WEST CRYO-TRANSIT HUB & EAST SHIELD HUB
    for (const [idx, by] of [522, 602, 842, 942].entries()) {
      items.push({
        sortY: getRectPropSortY(by, 46),
        label: `Криокапсула шлюза ${idx + 1}`,
        draw: () => {
          drawBox25D(ctx, 575, by, 78, 46, 18, '#0f172a', '#1e293b', '#2dd4bf');
          drawBox25D(ctx, 575, by + 2, 22, 42, 30, '#1e293b', '#090d16', '#2dd4bf');
          ctx.fillStyle = '#040b16';
          ctx.fillRect(578, by + 8 - 30, 16, 26);
          ctx.strokeStyle = '#2dd4bf';
          ctx.lineWidth = 1;
          ctx.strokeRect(578, by + 8 - 30, 16, 26);
          ctx.fillStyle = 'rgba(45, 212, 191, 0.28)';
          ctx.fillRect(600, by + 6 - 18, 48, 34);
          ctx.strokeStyle = '#5eead4';
          ctx.strokeRect(600, by + 6 - 18, 48, 34);
        },
      });
    }

    for (const [idx, sy] of [520, 600, 840, 940].entries()) {
      items.push({
        sortY: getRectPropSortY(sy, 52),
        label: `Конденсатор энергощита ${idx + 1}`,
        draw: () => {
          drawAngledConsole25D(ctx, 1755, sy, 68, 52, 22, 38, '#a855f7', t, 'bars', true);
        },
      });
    }

    // 8. SOUTHERN MEDICAL DEPARTMENT // INFIRMARY & BIO-LAB
    collectSouthernMedicalDepartment25D(ctx, t, items);
  };

  const collectSouthernMedicalDepartment25D = (
    ctx: CanvasRenderingContext2D,
    t: number,
    items: Sortable25DItem[]
  ) => {
    // 1. NW PHARMACOLOGY, DNA SEQUENCER & BIO-CENTRIFUGE LAB (y: 1356..1408)
    items.push({
      sortY: getRectPropSortY(1340, 68),
      label: 'Лаборатория фармакологии и биоцентрифуга',
      draw: () => {
        drawAngledConsole25D(ctx, 900, 1356, 92, 52, 22, 42, '#2dd4bf', t, 'ecg', true);
        drawBox25D(ctx, 996, 1356, 84, 52, 22, '#1e293b', '#0f172a', '#2dd4bf');
        drawCylinder25D(ctx, 1020, 1380, 14, 10, 14, '#334155', '#0f172a', '#38bdf8');
        const spinA = t * 0.14;
        ctx.strokeStyle = '#2dd4bf';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(1020 + Math.cos(spinA) * 8, 1380 - 14 + Math.sin(spinA) * 5);
        ctx.lineTo(1020 - Math.cos(spinA) * 8, 1380 - 14 - Math.sin(spinA) * 5);
        ctx.stroke();
        for (let s = 0; s < 3; s++) {
          drawCylinder25D(
            ctx,
            1046 + s * 11,
            1384,
            4.2,
            3.2,
            18,
            s === 1 ? '#34d399' : '#2dd4bf',
            '#064e3b',
            '#99f6e4'
          );
        }
      },
    });

    // 2. NE CHIEF MEDICAL OFFICER & QUARANTINE DIAGNOSTIC CONSOLE (y: 1356..1408)
    items.push({
      sortY: getRectPropSortY(1340, 68),
      label: 'Пульт медицинской диагностики и карантина',
      draw: () => {
        drawAngledConsole25D(ctx, 1320, 1356, 116, 52, 22, 42, '#38bdf8', t, 'ecg', true);
        drawBox25D(ctx, 1440, 1356, 60, 52, 34, '#f8fafc', '#cbd5e1', '#ef4444');
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(1470 - 10, 1382 - 34 - 3, 20, 6);
        ctx.fillRect(1470 - 3, 1382 - 34 - 10, 6, 20);
        ctx.fillStyle = '#040b16';
        ctx.fillRect(1448, 1356 + 52 - 30, 44, 14);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(1451, 1356 + 52 - 26, 28, 6);
      },
    });

    // 3. FOUR 2.5D BIO-REGENERATION MED-BEDS
    const medBeds = [
      { x: 900, y: 1435, isWest: true, label: 'Медкапсула регенерации З-1' },
      { x: 900, y: 1520, isWest: true, label: 'Медкапсула регенерации З-2' },
      { x: 1385, y: 1435, isWest: false, label: 'Медкапсула регенерации В-1' },
      { x: 1385, y: 1520, isWest: false, label: 'Медкапсула регенерации В-2' },
    ];
    for (const bed of medBeds) {
      items.push({
        sortY: getRectPropSortY(bed.y, 56),
        label: bed.label,
        draw: () => {
          drawBox25D(ctx, bed.x, bed.y, 115, 54, 18, '#1e293b', '#0f172a', '#2dd4bf');

          const mattX = bed.isWest ? bed.x + 28 : bed.x + 8;
          const mattY = bed.y + 6 - 18;
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(mattX, mattY, 78, 42);
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          ctx.strokeRect(mattX, mattY, 78, 42);

          ctx.fillStyle = 'rgba(45, 212, 191, 0.24)';
          ctx.fillRect(mattX + 18, mattY - 4, 42, 46);
          ctx.strokeStyle = '#2dd4bf';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(mattX + 18, mattY - 4, 42, 46);

          const towerX = bed.isWest ? bed.x + 2 : bed.x + 89;
          drawBox25D(ctx, towerX, bed.y + 4, 24, 46, 36, '#334155', '#090d16', '#2dd4bf');
          const tScrY = bed.y + 50 - 34;
          ctx.fillStyle = '#020617';
          ctx.fillRect(towerX + 3, tScrY, 18, 14);
          ctx.strokeStyle = '#2dd4bf';
          ctx.lineWidth = 1;
          ctx.strokeRect(towerX + 3, tScrY, 18, 14);
          ctx.beginPath();
          ctx.moveTo(towerX + 5, tScrY + 7);
          ctx.lineTo(towerX + 9, tScrY + 7);
          ctx.lineTo(towerX + 11, tScrY + 3);
          ctx.lineTo(towerX + 14, tScrY + 11);
          ctx.lineTo(towerX + 16, tScrY + 7);
          ctx.lineTo(towerX + 19, tScrY + 7);
          ctx.stroke();
        },
      });
    }

    // 4. CENTRAL ROBOTIC SURGICAL & MRI SCANNER POD (cx = 1200, cy = 1525, r = 44)
    items.push({
      sortY: getCirclePropSortY(1525),
      label: 'Хирургический МРТ-томограф и автодок',
      draw: () => {
        ctx.save();
        ctx.translate(1200, 1525);
        drawCylinder25D(ctx, 0, 0, 44, 32, 16, '#1e293b', '#090d16', '#2dd4bf');
        drawBox25D(ctx, -28, -12, 56, 24, 24, '#0f172a', '#1e293b', '#38bdf8');
        const scanX = Math.sin(t * 0.04) * 20;
        ctx.fillStyle = 'rgba(45, 212, 191, 0.32)';
        ctx.fillRect(-24, -10 - 24, 48, 20);
        ctx.strokeStyle = '#5eead4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(scanX, -10 - 24);
        ctx.lineTo(scanX, 10 - 24);
        ctx.stroke();

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.ellipse(0, -24, 18, 28, 0, Math.PI * 0.85, Math.PI * 2.15);
        ctx.stroke();
        ctx.strokeStyle = '#2dd4bf';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, -24, 18, 28, 0, Math.PI * 0.88, Math.PI * 2.12);
        ctx.stroke();

        for (const side of [-1, 1]) {
          const armSwing = Math.sin(t * 0.05 + side) * 3;
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(side * 16, -42);
          ctx.lineTo(side * 24 + armSwing, -32);
          ctx.lineTo(side * 10 + armSwing * 0.5, -24);
          ctx.stroke();
          ctx.fillStyle = '#34d399';
          ctx.beginPath();
          ctx.arc(side * 10 + armSwing * 0.5, -24, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      },
    });

    // 5. SW & SE CRYO-PLASMA, BACTA REGENERATION VATS & OXYGEN RACKS (y: 1608..1662)
    items.push({
      sortY: getRectPropSortY(1608, 58),
      label: 'Криохранилище плазмы и бак-регенератор',
      draw: () => {
        drawBox25D(ctx, 920, 1608, 200, 54, 14, '#0f172a', '#090d16', '#2dd4bf');
        for (let v = 0; v < 2; v++) {
          const vx = 955 + v * 52;
          drawCylinder25D(ctx, vx, 1634, 18, 13, 38, '#334155', '#0d9488', '#5eead4');
          ctx.fillStyle = '#ccfbf1';
          for (let b = 0; b < 3; b++) {
            const by = 1630 - ((t * 0.5 + b * 11 + v * 7) % 28);
            ctx.beginPath();
            ctx.arc(vx - 4 + b * 4, by, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        for (let o = 0; o < 3; o++) {
          drawCylinder25D(ctx, 1052 + o * 24, 1636, 9, 7, 30, '#38bdf8', '#0284c7', '#bae6fd');
        }
      },
    });

    items.push({
      sortY: getRectPropSortY(1608, 58),
      label: 'Автоклав и стойка медицинского кислорода',
      draw: () => {
        drawAngledConsole25D(ctx, 1280, 1608, 114, 54, 22, 40, '#2dd4bf', t, 'bars', true);
        drawBox25D(ctx, 1398, 1608, 82, 54, 30, '#1e293b', '#0f172a', '#38bdf8');
        for (let c = 0; c < 2; c++) {
          drawCylinder25D(ctx, 1422 + c * 34, 1635, 11, 8, 36, '#475569', '#0284c7', '#38bdf8');
        }
      },
    });
  };

  /**
   * Renders rich, multi-layered 2.5D control panels, telemetry monitors, oscilloscope waveforms,
   * cryo columns, and illuminated tactile switch/button banks in Room 4 (Tokamak Control Room).
   */
  const collectTokamakControlRoomPanels25D = (
    ctx: CanvasRenderingContext2D,
    t: number,
    solved: boolean,
    items: Sortable25DItem[]
  ) => {
    const primaryAccent = solved ? '#34d399' : '#38bdf8';
    const secondaryAccent = solved ? '#10b981' : '#f43f5e';

    // B. NORTH WALL WIDE 3-TIER 2.5D TELEMETRY & DIAGNOSTIC MAINFRAME (x: 1924..2236, y: 1032..1084)
    items.push({
      sortY: getRectPropSortY(1020, 62),
      label: 'Северный пульт телеметрии Токамака',
      draw: () => {
        drawBox25D(ctx, 1924, 1034, 312, 48, 20, '#1e293b', '#090d16', '#64748b');
    // 2. Tall Upright Rear 2.5D Widescreen Monitor Glare-Shield Hood (zHood = 44, hoodD = 16)
    drawBox25D(ctx, 1926, 1034, 308, 16, 44, '#334155', '#0b1322', primaryAccent);
    // Overhanging 3D Glare-Shield Roof Canopy details
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(1934, 1034 - 44 + 3, 292, 9);
    for (let lx = 1944; lx <= 2204; lx += 64) {
      ctx.fillStyle = primaryAccent;
      ctx.fillRect(lx, 1034 - 44 + 2, 24, 2);
    }
    // Left & Right 2.5D Angled Side-Cheeks (Боковины пульта) connecting upper hood to lower operator deck
    for (const sideX of [1926, 2229]) {
      ctx.fillStyle = '#162032';
      ctx.strokeStyle = primaryAccent;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sideX, 1034 + 16 - 44);
      ctx.lineTo(sideX + 5, 1034 + 16 - 44);
      ctx.lineTo(sideX + 5, 1034 + 48 - 20 - 2);
      ctx.lineTo(sideX, 1034 + 16 - 20 + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Monitor 1 (Left: x=1934..2018): Toroidal Magnetic Flux & Plasma Containment Cross-Section (on vertical hood face!)
    const m1X = 1934;
    const m1Y = 1034 + 16 - 44 + 2;
    const m1W = 84;
    const m1H = 21;
    ctx.fillStyle = '#040b16';
    ctx.fillRect(m1X, m1Y, m1W, m1H);
    ctx.strokeStyle = primaryAccent;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(m1X, m1Y, m1W, m1H);

    // Subtle CRT grid inside Monitor 1
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 0.7;
    for (let gx = m1X + 14; gx < m1X + m1W; gx += 14) {
      ctx.beginPath();
      ctx.moveTo(gx, m1Y);
      ctx.lineTo(gx, m1Y + m1H);
      ctx.stroke();
    }
    // Live toroidal flux rings on Left Monitor
    ctx.strokeStyle = primaryAccent;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(m1X + 28, m1Y + 11, 16, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = secondaryAccent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(m1X + 28, m1Y + 11, 9, 4, t * 0.03, 0, Math.PI * 1.6);
    ctx.stroke();
    // Telemetry readouts on right half of Monitor 1
    for (let row = 0; row < 4; row++) {
      const barW = 14 + Math.sin(t * 0.04 + row * 1.4) * 6;
      ctx.fillStyle = row === 0 ? secondaryAccent : primaryAccent;
      ctx.fillRect(m1X + 52, m1Y + 4 + row * 4, barW, 2.2);
    }

    // Monitor 2 (Center: x=2026..2134): Dual-Channel Cold Fusion Oscilloscope & Harmonics
    const m2X = 2026;
    const m2Y = m1Y;
    const m2W = 108;
    const m2H = 21;
    ctx.fillStyle = '#040b16';
    ctx.fillRect(m2X, m2Y, m2W, m2H);
    ctx.strokeStyle = primaryAccent;
    ctx.lineWidth = 1.3;
    ctx.strokeRect(m2X, m2Y, m2W, m2H);

    // Center crosshair grid in Monitor 2
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(m2X, m2Y + m2H / 2);
    ctx.lineTo(m2X + m2W, m2Y + m2H / 2);
    ctx.stroke();

    // Animated Sine Wave 1 (Cyan / Emerald)
    ctx.strokeStyle = primaryAccent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let sx = 2; sx < m2W - 2; sx += 3) {
      const wy = m2Y + m2H / 2 + Math.sin(sx * 0.16 + t * 0.08) * 6.5;
      if (sx === 2) ctx.moveTo(m2X + sx, wy);
      else ctx.lineTo(m2X + sx, wy);
    }
    ctx.stroke();

    // Animated Sine Wave 2 (Rose / Amber Harmonic)
    ctx.strokeStyle = solved ? '#a7f3d0' : '#fb7185';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let sx = 2; sx < m2W - 2; sx += 3) {
      const wy = m2Y + m2H / 2 + Math.cos(sx * 0.24 - t * 0.06) * 4.5;
      if (sx === 2) ctx.moveTo(m2X + sx, wy);
      else ctx.lineTo(m2X + sx, wy);
    }
    ctx.stroke();

    // Monitor 3 (Right: x=2142..2226): 8-Channel Neutron & Cryo Spectrum Analyzer
    const m3X = 2142;
    const m3Y = m1Y;
    const m3W = 84;
    const m3H = 21;
    ctx.fillStyle = '#040b16';
    ctx.fillRect(m3X, m3Y, m3W, m3H);
    ctx.strokeStyle = primaryAccent;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(m3X, m3Y, m3W, m3H);

    for (let b = 0; b < 9; b++) {
      const bx = m3X + 5 + b * 8.5;
      const frac = 0.35 + 0.55 * Math.abs(Math.sin(t * 0.035 + b * 0.7));
      const bh = Math.round(frac * (m3H - 6));
      ctx.fillStyle = bh > 12 && !solved ? '#f43f5e' : bh > 9 ? '#fbbf24' : primaryAccent;
      ctx.fillRect(bx, m3Y + m3H - 3 - bh, 5.5, bh);
      // Peak hold indicator cap
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(bx, m3Y + m3H - 5 - bh, 5.5, 1.2);
    }

    // Sloped Tactile Button Matrix, Rotary Dials & Keyboard on the North Operator Deck (y = 1058 - 20 = 1038)
    const deckY = 1061 - 20;
    const btnColors = ['#ef4444', '#fbbf24', '#38bdf8', '#22c55e', '#a855f7', '#38bdf8'];
    // Left button cluster (2 rows x 6 illuminated tactile switches)
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 6; c++) {
        const bx = 1938 + c * 11;
        const by = deckY + 2 + r * 7;
        ctx.fillStyle = '#090d16';
        ctx.fillRect(bx - 1, by - 1, 8, 5.5);
        ctx.fillStyle = solved ? '#34d399' : btnColors[(r * 6 + c) % btnColors.length];
        ctx.fillRect(bx, by, 6, 3.5);
      }
    }
    // Center recessed mechanical keyboard + status strip + trackball
    ctx.fillStyle = '#090d16';
    ctx.fillRect(2028, deckY + 2, 76, 14);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(2028, deckY + 2, 76, 14);
    // Keycap micro-grid
    ctx.fillStyle = '#64748b';
    for (let ky = deckY + 4; ky <= deckY + 12; ky += 3) {
      for (let kx = 2031; kx <= 2086; kx += 4.5) {
        ctx.fillRect(kx, ky, 3, 1.8);
      }
    }
    // Glowing blue trackball beside keyboard
    ctx.fillStyle = primaryAccent;
    ctx.beginPath();
    ctx.arc(2096, deckY + 9, 4, 0, Math.PI * 2);
    ctx.fill();

    // Right rotary rheostat dials & illuminated push-buttons
    for (let d = 0; d < 3; d++) {
      const dx = 2124 + d * 22;
      const dy = deckY + 9;
      ctx.fillStyle = '#090d16';
      ctx.beginPath();
      ctx.arc(dx, dy, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      const dialAng = -0.8 + d * 0.9 + Math.sin(t * 0.02 + d) * 0.3;
      ctx.strokeStyle = primaryAccent;
      ctx.beginPath();
      ctx.moveTo(dx, dy);
      ctx.lineTo(dx + Math.cos(dialAng) * 5.5, dy + Math.sin(dialAng) * 5.5);
      ctx.stroke();
    }
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        const bx = 2186 + c * 9.5;
        const by = deckY + 2 + r * 7;
        ctx.fillStyle = solved ? '#10b981' : (r + c) % 2 === 0 ? '#38bdf8' : '#f59e0b';
        ctx.fillRect(bx, by, 6, 4);
      }
    }

    // Front vertical face details on North Console (cooling vents + LED status lamps)
    const frontY = 1058 + 24 - 20;
    for (let vx = 1945; vx <= 2205; vx += 52) {
      ctx.fillStyle = '#050811';
      ctx.fillRect(vx, frontY + 4, 34, 12);
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(vx, frontY + 4, 34, 12);
      // Glowing status LEDs next to each vent
      ctx.fillStyle = solved ? '#34d399' : '#38bdf8';
      ctx.fillRect(vx + 38, frontY + 5, 4, 4);
      ctx.fillStyle = solved ? '#34d399' : '#f43f5e';
      ctx.fillRect(vx + 38, frontY + 11, 4, 4);
    }

      },
    });

    // -------------------------------------------------------------------------
    // C. EAST WALL SUPERCONDUCTING COIL & CRYO CONTROL RACK (x: 2196..2248, y: 1094..1346)
    // -------------------------------------------------------------------------
    items.push({
      sortY: getRectPropSortY(1096, 246),
      label: 'Восточная криогенная стойка Токамака',
      draw: () => {
        drawBox25D(ctx, 2198, 1096, 48, 246, 30, '#1e293b', '#0f172a', '#475569');

        const rackTopX = 2202;
        const rackTopY = 1096 - 30;

        // 1. Dual Transparent Liquid-Helium Cryo Columns (top section of East Rack)
        for (let col = 0; col < 2; col++) {
          const cx = rackTopX + 6 + col * 20;
          const cy = rackTopY + 10;
          ctx.fillStyle = '#040b16';
          ctx.fillRect(cx, cy, 14, 58);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(cx, cy, 14, 58);

          const fluidGrad = ctx.createLinearGradient(cx, cy, cx + 14, cy);
          fluidGrad.addColorStop(0, 'rgba(6, 182, 212, 0.25)');
          fluidGrad.addColorStop(
            0.5,
            solved ? 'rgba(52, 211, 153, 0.75)' : 'rgba(56, 189, 248, 0.75)'
          );
          fluidGrad.addColorStop(1, 'rgba(6, 182, 212, 0.25)');
          ctx.fillStyle = fluidGrad;
          ctx.fillRect(cx + 2, cy + 6, 10, 48);

          ctx.fillStyle = '#e0f2fe';
          for (let b = 0; b < 3; b++) {
            const by = cy + 50 - ((t * 0.6 + b * 18 + col * 9) % 44);
            ctx.beginPath();
            ctx.arc(cx + 5 + (b % 2) * 4, by, 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // 2. Raised 2.5D Diagnostic Monitor Hood & Keypad (middle section of East Rack, zH = 44)
        drawBox25D(ctx, 2200, 1172, 44, 24, 44, '#334155', '#0b1322', primaryAccent);
        const emY = 1172 + 24 - 44 + 2;
        ctx.fillStyle = '#040b16';
        ctx.fillRect(rackTopX + 2, emY, 36, 18);
        ctx.strokeStyle = primaryAccent;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(rackTopX + 2, emY, 36, 18);

        ctx.strokeStyle = secondaryAccent;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let sx = 2; sx < 34; sx += 3) {
          const wy = emY + 9 + Math.sin(sx * 0.3 + t * 0.08) * 5;
          if (sx === 2) ctx.moveTo(rackTopX + 2 + sx, wy);
          else ctx.lineTo(rackTopX + 2 + sx, wy);
        }
        ctx.stroke();

        // 3. Magnetic Coil Breaker Switches & LED Load Ladders (lower section of East Rack)
        const brkY = rackTopY + 134;
        ctx.fillStyle = '#090d16';
        ctx.fillRect(rackTopX + 5, brkY, 38, 96);
        ctx.strokeStyle = '#334155';
        ctx.strokeRect(rackTopX + 5, brkY, 38, 96);

        for (let row = 0; row < 6; row++) {
          const ry = brkY + 8 + row * 14;
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(rackTopX + 9, ry, 12, 8);
          ctx.fillStyle = solved ? '#34d399' : row === 2 || row === 4 ? '#f43f5e' : '#38bdf8';
          ctx.fillRect(rackTopX + (solved || row % 2 === 0 ? 15 : 10), ry + 1.5, 5, 5);

          for (let seg = 0; seg < 4; seg++) {
            ctx.fillStyle =
              seg < 3
                ? solved
                  ? '#34d399'
                  : '#38bdf8'
                : solved
                ? '#34d399'
                : '#f59e0b';
            ctx.fillRect(rackTopX + 25 + seg * 3.5, ry + 1.5, 2.5, 5);
          }
        }
      },
    });

    // -------------------------------------------------------------------------
    // D. WEST WALL 3-TIER 2.5D AUXILIARY INJECTOR & DOSIMETRY CONSOLE (x: 1908..1954, y: 1265..1395)
    // -------------------------------------------------------------------------
    items.push({
      sortY: getRectPropSortY(1268, 122),
      label: 'Западный пульт инжектора и дозиметрии',
      draw: () => {
        drawAngledConsole25D(ctx, 1910, 1268, 44, 62, 24, 42, primaryAccent, t, 'radar', true);
        drawAngledConsole25D(ctx, 1910, 1332, 44, 58, 24, 40, '#f59e0b', t, 'bars', true);
      },
    });

    // -------------------------------------------------------------------------
    // E. SOUTH MASTER 3-TIER 2.5D TOKAMAK COMMAND DESK & WING CONSOLES (x: 1966..2194, y: 1344..1396)
    // -------------------------------------------------------------------------
    items.push({
      sortY: getRectPropSortY(1346, 54),
      label: 'Южный главный пульт управления Токамаком',
      draw: () => {
        drawBox25D(
          ctx,
          1966,
          1346,
          228,
          46,
          22,
          '#1e293b',
          '#090d16',
          solved ? '#10b981' : '#f43f5e'
        );

        drawBox25D(ctx, 1968, 1346, 76, 15, 38, '#334155', '#0b1322', primaryAccent);
        drawBox25D(ctx, 2116, 1346, 76, 15, 38, '#334155', '#0b1322', primaryAccent);

        const sDeskTopY = 1346 - 22;
        const sWingScrY = 1346 + 15 - 38 + 2;
        ctx.fillStyle = '#040b16';
        ctx.fillRect(1972, sWingScrY, 68, 13);
        ctx.strokeStyle = primaryAccent;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(1972, sWingScrY, 68, 13);
        ctx.beginPath();
        for (let lx = 2; lx < 64; lx += 3) {
          const ly = sWingScrY + 6.5 + Math.sin(lx * 0.25 + t * 0.06) * 4;
          if (lx === 2) ctx.moveTo(1972 + lx, ly);
          else ctx.lineTo(1972 + lx, ly);
        }
        ctx.stroke();

        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 5; c++) {
            const bx = 1972 + c * 8.5;
            const by = sDeskTopY + 24 + r * 6.5;
            ctx.fillStyle = '#020617';
            ctx.fillRect(bx, by + 1.2, 6, 4);
            ctx.fillStyle =
              solved
                ? '#34d399'
                : (r + c) % 3 === 0
                ? '#f43f5e'
                : (r + c) % 2 === 0
                ? '#38bdf8'
                : '#fbbf24';
            ctx.fillRect(bx, by, 6, 3.5);
          }
        }

        for (let s = 0; s < 2; s++) {
          const sx = 2022 + s * 12;
          ctx.fillStyle = '#050811';
          ctx.fillRect(sx, sDeskTopY + 20, 5, 20);
          ctx.strokeStyle = '#475569';
          ctx.strokeRect(sx, sDeskTopY + 20, 5, 20);
          const handleY =
            sDeskTopY + 24 + (solved ? 3 : Math.sin(t * 0.025 + s * 1.5) * 4 + 5);
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(sx + 2.5, handleY + 2);
          ctx.lineTo(sx + 2.5, handleY - 4);
          ctx.stroke();
          ctx.fillStyle = solved ? '#34d399' : '#f43f5e';
          ctx.fillRect(sx - 2, handleY - 6, 9, 4);
        }

        ctx.fillStyle = '#040b16';
        ctx.fillRect(2120, sWingScrY, 68, 13);
        ctx.strokeStyle = primaryAccent;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(2120, sWingScrY, 68, 13);
        ctx.beginPath();
        ctx.arc(2132, sWingScrY + 6.5, 4.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = secondaryAccent;
        ctx.fillRect(2144, sWingScrY + 3, 28, 3);
        ctx.fillStyle = primaryAccent;
        ctx.fillRect(2144, sWingScrY + 8, 20, 3);

        ctx.fillStyle = '#090d16';
        ctx.beginPath();
        ctx.arc(2126, sDeskTopY + 30, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = primaryAccent;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(2126, sDeskTopY + 30, 3.5, 0, Math.PI * 2);
        ctx.stroke();

        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 5; c++) {
            const bx = 2142 + c * 8.5;
            const by = sDeskTopY + 24 + r * 6.5;
            ctx.fillStyle = '#020617';
            ctx.fillRect(bx, by + 1.2, 6, 4);
            ctx.fillStyle =
              solved
                ? '#34d399'
                : (r * 5 + c) % 4 === 0
                ? '#a855f7'
                : (r + c) % 2 === 0
                ? '#38bdf8'
                : '#22c55e';
            ctx.fillRect(bx, by, 6, 3.5);
          }
        }

        drawBox25D(ctx, 2064, 1404, 32, 22, 18, '#334155', '#1e293b', '#64748b');
        drawBox25D(ctx, 2066, 1418, 28, 8, 26, '#475569', '#1e293b', '#94a3b8');
      },
    });
  };

  /**
   * Renders Room 1 (NW Sector: x=140..500, y=200..580) as a comprehensive 2.5D Aviation & Avionics Exhibition:
   * - Detailed cyan/white orthographic aircraft blueprints & B737 electrical schematics on wall display stands
   * - 3 scale aircraft models on 2.5D museum pedestals (Boeing 737-800 NG, Supersonic Delta Concorde/Tu-144, Heritage Biplane)
   * - Angled engineering drafting table with unrolled NACA airfoil schematics & a cutaway high-bypass turbofan jet engine
   * - West wall avionics rack & orange Flight Data Recorder ("Black Box") vitrine
   */
  const collectAviationExhibitionRoom1_25D = (
    ctx: CanvasRenderingContext2D,
    t: number,
    solved: boolean,
    items: Sortable25DItem[]
  ) => {
    const accent = solved ? '#34d399' : '#38bdf8';

    // -------------------------------------------------------------------------
    // 1. NORTH WALL LARGE 3-TIER 2.5D ILLUMINATED AVIATION BLUEPRINT & SCHEMATIC STANDS
    // -------------------------------------------------------------------------
    items.push({
      sortY: getRectPropSortY(200, 56),
      label: 'Стенды авиационных чертежей B737-800',
      draw: () => {
        drawBox25D(ctx, 148, 212, 164, 36, 18, '#1e293b', '#090d16', '#38bdf8');
        drawBox25D(ctx, 150, 212, 160, 12, 42, '#334155', '#0c4a6e', '#38bdf8');
        const bp1X = 153;
        const bp1Y = 212 + 12 - 42 + 2;
        const bp1W = 154;
        const bp1H = 28;
        ctx.fillStyle = '#082f49';
        ctx.fillRect(bp1X, bp1Y, bp1W, bp1H);
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.2)';
        ctx.lineWidth = 0.6;
        for (let gx = bp1X + 8; gx < bp1X + bp1W; gx += 8) {
          ctx.beginPath();
          ctx.moveTo(gx, bp1Y);
          ctx.lineTo(gx, bp1Y + bp1H);
          ctx.stroke();
        }
        for (let gy = bp1Y + 6; gy < bp1Y + bp1H; gy += 6) {
          ctx.beginPath();
          ctx.moveTo(bp1X, gy);
          ctx.lineTo(bp1X + bp1W, gy);
          ctx.stroke();
        }
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 1.1;
        ctx.strokeRect(bp1X, bp1Y, bp1W, bp1H);

        ctx.save();
        ctx.translate(bp1X + 34, bp1Y + 14);
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.lineTo(3, -7);
        ctx.lineTo(3, 9);
        ctx.lineTo(0, 12);
        ctx.lineTo(-3, 9);
        ctx.lineTo(-3, -7);
        ctx.closePath();
        ctx.moveTo(-3, -3);
        ctx.lineTo(-22, 4);
        ctx.lineTo(-22, 6.5);
        ctx.lineTo(-3, 2);
        ctx.moveTo(3, -3);
        ctx.lineTo(22, 4);
        ctx.lineTo(22, 6.5);
        ctx.lineTo(3, 2);
        ctx.moveTo(-2, 8);
        ctx.lineTo(-9, 11.5);
        ctx.moveTo(2, 8);
        ctx.lineTo(9, 11.5);
        ctx.stroke();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(-22, -9);
        ctx.lineTo(22, -9);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.translate(bp1X + 106, bp1Y + 14);
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(-26, 2);
        ctx.quadraticCurveTo(-6, -8, 24, 2);
        ctx.quadraticCurveTo(-4, 4, -26, 2);
        ctx.stroke();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(-30, -5);
        ctx.quadraticCurveTo(-5, -11, 28, -3);
        ctx.moveTo(-30, 7);
        ctx.quadraticCurveTo(-5, 8, 28, 6);
        ctx.stroke();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(-4, -10);
        ctx.stroke();
        ctx.restore();

        drawBox25D(ctx, 326, 212, 162, 36, 18, '#1e293b', '#090d16', accent);
        drawBox25D(ctx, 328, 212, 158, 12, 42, '#334155', '#0c4a6e', accent);
        const bp2X = 331;
        const bp2Y = 212 + 12 - 42 + 2;
        const bp2W = 152;
        const bp2H = 28;
        ctx.fillStyle = '#071e34';
        ctx.fillRect(bp2X, bp2Y, bp2W, bp2H);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.1;
        ctx.strokeRect(bp2X, bp2Y, bp2W, bp2H);

        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bp2X + 12, bp2Y + 9);
        ctx.lineTo(bp2X + 66, bp2Y + 9);
        ctx.moveTo(bp2X + 88, bp2Y + 9);
        ctx.lineTo(bp2X + 142, bp2Y + 9);
        ctx.moveTo(bp2X + 36, bp2Y + 9);
        ctx.lineTo(bp2X + 36, bp2Y + 23);
        ctx.lineTo(bp2X + 118, bp2Y + 23);
        ctx.lineTo(bp2X + 118, bp2Y + 9);
        ctx.stroke();
        for (const gx of [bp2X + 22, bp2X + 77, bp2X + 130]) {
          ctx.fillStyle = '#090d16';
          ctx.beginPath();
          ctx.arc(gx, bp2Y + 16, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = gx === bp2X + 77 ? '#fbbf24' : accent;
          ctx.stroke();
        }
      },
    });

    // -------------------------------------------------------------------------
    // 2. THREE SCALE AIRCRAFT MODELS ON 2.5D EXHIBITION PEDESTALS
    // -------------------------------------------------------------------------
    // MODEL A (West Gallery, x=196, y=312): 1:24 Scale Boeing 737-800 NG Airliner on Pedestal
    items.push({
      sortY: getCirclePropSortY(312),
      label: 'Пьедестал модели Boeing 737-800 NG',
      draw: () => {
        drawCylinder25D(ctx, 196, 312, 28, 20, 18, '#1e293b', '#0f172a', '#fbbf24');
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(196 - 10, 312 + 6, 20, 5);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(196, 312 - 18);
        ctx.lineTo(196, 312 - 31);
        ctx.stroke();

        ctx.save();
        ctx.translate(196, 312 - 32);
        ctx.rotate(-0.22);
        ctx.fillStyle = '#cbd5e1';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-4, -3);
        ctx.lineTo(-14, -24);
        ctx.lineTo(-10, -25);
        ctx.lineTo(4, -3);
        ctx.moveTo(-4, 3);
        ctx.lineTo(-14, 24);
        ctx.lineTo(-10, 25);
        ctx.lineTo(4, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(-3, -14, 8, 3.5);
        ctx.fillRect(-3, 10.5, 8, 3.5);
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(-18, -2);
        ctx.lineTo(-24, -10);
        ctx.lineTo(-21, -10);
        ctx.lineTo(-15, -2);
        ctx.moveTo(-18, 2);
        ctx.lineTo(-24, 10);
        ctx.lineTo(-21, 10);
        ctx.lineTo(-15, 2);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.ellipse(0, 0, 23, 4.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-18, 0);
        ctx.lineTo(17, 0);
        ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(18, 0, 2.2, -0.9, 0.9);
        ctx.fill();
        ctx.restore();
      },
    });

    // MODEL B (SW Gallery, x=204, y=512): Supersonic Delta-Wing Concorde / Tu-144 Interceptor Model
    items.push({
      sortY: getCirclePropSortY(512),
      label: 'Пьедестал сверхзвукового лайнера',
      draw: () => {
        drawCylinder25D(ctx, 204, 512, 27, 19, 18, '#1e293b', '#0f172a', '#38bdf8');
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(204 - 10, 512 + 6, 20, 5);
        ctx.save();
        ctx.translate(204, 512 - 30);
        ctx.rotate(-0.35);
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.quadraticCurveTo(2, -5, -18, -19);
        ctx.lineTo(-20, 0);
        ctx.lineTo(-18, 19);
        ctx.quadraticCurveTo(2, 5, 18, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f97316';
        ctx.fillRect(-22, -6, 4, 3);
        ctx.fillRect(-22, 3, 4, 3);
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(26, 0);
        ctx.lineTo(-21, -2.6);
        ctx.lineTo(-21, 2.6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#0284c7';
        ctx.stroke();
        ctx.restore();
      },
    });

    // MODEL C (SE Gallery, x=446, y=512): Vintage Red & Gold Biplane Model with Spinning Propeller
    items.push({
      sortY: getCirclePropSortY(512),
      label: 'Пьедестал исторического биплана',
      draw: () => {
        drawCylinder25D(ctx, 446, 512, 26, 18, 18, '#1e293b', '#0f172a', '#ef4444');
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(446 - 10, 512 + 6, 20, 5);
        ctx.save();
        ctx.translate(446, 512 - 30);
        ctx.rotate(-2.45);
        ctx.fillStyle = '#b91c1c';
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.roundRect(-4, -18, 7, 36, 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.ellipse(0, 0, 17, 3.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.roundRect(0, -19, 8, 38, 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(4, -13, 2.2, 0, Math.PI * 2);
        ctx.arc(4, 13, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(15, -3, 3.5, 6);
        const propBlur = Math.sin(t * 0.25) * 7;
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(19.5, -propBlur);
        ctx.lineTo(19.5, propBlur);
        ctx.stroke();
        ctx.restore();
      },
    });

    // -------------------------------------------------------------------------
    // 3. SOUTH-CENTER AVIATION DRAFTING TABLE & TURBOFAN ENGINE CUTAWAY (x=256..406, y=492..556)
    // -------------------------------------------------------------------------
    items.push({
      sortY: getRectPropSortY(492, 60),
      label: 'Конструкторский стол и макет турбовентиляторного двигателя',
      draw: () => {
        drawBox25D(ctx, 256, 494, 150, 54, 20, '#1e293b', '#0f172a', '#475569');
        const dtY = 494 - 20;

        ctx.fillStyle = '#0c4a6e';
        ctx.fillRect(262, dtY + 5, 76, 42);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.strokeRect(262, dtY + 5, 76, 42);
        ctx.fillStyle = '#bae6fd';
        ctx.fillRect(262, dtY + 4, 4, 44);
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(270, dtY + 18);
        ctx.quadraticCurveTo(298, dtY + 8, 332, dtY + 18);
        ctx.quadraticCurveTo(298, dtY + 22, 270, dtY + 18);
        for (let rx = 278; rx <= 322; rx += 9) {
          ctx.moveTo(rx, dtY + 14);
          ctx.lineTo(rx + 4, dtY + 20);
        }
        ctx.moveTo(270, dtY + 32);
        ctx.lineTo(330, dtY + 32);
        ctx.moveTo(282, dtY + 28);
        ctx.lineTo(282, dtY + 40);
        ctx.moveTo(312, dtY + 28);
        ctx.lineTo(312, dtY + 40);
        ctx.stroke();

        const engX = 372;
        const engY = dtY + 26;
        ctx.fillStyle = '#090d16';
        ctx.fillRect(344, dtY + 8, 56, 36);
        ctx.strokeStyle = '#475569';
        ctx.strokeRect(344, dtY + 8, 56, 36);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(engX - 22, engY - 12, 8, 24);
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(engX - 14, engY - 9, 12, 18);
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(engX - 2, engY - 8, 9, 16);
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.moveTo(engX + 7, engY - 9);
        ctx.lineTo(engX + 22, engY - 5);
        ctx.lineTo(engX + 22, engY + 5);
        ctx.lineTo(engX + 7, engY + 9);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(engX - 24, engY);
        ctx.lineTo(engX + 23, engY);
        ctx.stroke();
      },
    });

    // -------------------------------------------------------------------------
    // 4. WEST WALL 3-TIER 2.5D AVIONICS RACK & ORANGE "BLACK BOX" FLIGHT RECORDER (x=148..184, y=368..458)
    // -------------------------------------------------------------------------
    items.push({
      sortY: getRectPropSortY(366, 92),
      label: 'Стойка авионики и бортовой самописец',
      draw: () => {
        drawBox25D(ctx, 148, 368, 36, 88, 22, '#1e293b', '#0f172a', '#475569');
        drawBox25D(ctx, 150, 368, 32, 18, 42, '#334155', '#0b1322', '#38bdf8');
        const avY = 368 + 18 - 42 + 11;
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(166, avY, 9, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#92400e';
        ctx.beginPath();
        ctx.arc(166, avY, 9, 0, Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(166, avY, 9, 0, Math.PI * 2);
        ctx.moveTo(158, avY);
        ctx.lineTo(174, avY);
        ctx.stroke();

        drawBox25D(ctx, 153, 412, 26, 34, 32, '#f97316', '#c2410c', '#fbbf24');
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(155, 418 - 32, 22, 3);
        ctx.fillRect(155, 434 - 32, 22, 3);
      },
    });
  };

  /**
   * Renders a detailed, high-craft 2.5D Planetary Robot/Rover in Room 3 (SW Sector).
   * Wheels are rendered in true 2.5D perspective as upright horizontal cylinders rolling along the X-axis:
   * - Top arched tire tread with metallic Mars-rover grouser cleats
   * - Vertical side wheel rim facing South (on the vertical side plane, NEVER flat on the floor!)
   */
  const drawPlanetaryRobotRover25D = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    t: number,
    solved: boolean
  ) => {
    ctx.save();
    ctx.translate(cx, cy);

    // Helper to draw a realistic 2.5D upright cylindrical rover wheel rolling along the X-axis
    const drawRoverWheel25D = (wx: number, wy: number, isForeground: boolean) => {
      ctx.save();
      ctx.translate(wx, wy);

      const tireW = isForeground ? 22 : 20;
      const tireThick = isForeground ? 9 : 7;
      const wheelH = isForeground ? 14 : 11;

      // 1. Floor contact shadow directly beneath the upright tire
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      ctx.ellipse(0, 3, tireW * 0.58, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // 2. Arched Top/Upper Tire Tread (horizontal cylinder barrel along Y, curved arch along X)
      const treadGrad = ctx.createLinearGradient(-tireW / 2, -wheelH, tireW / 2, -wheelH);
      treadGrad.addColorStop(0, '#090d16');
      treadGrad.addColorStop(0.25, '#334155');
      treadGrad.addColorStop(0.55, '#475569');
      treadGrad.addColorStop(0.85, '#1e293b');
      treadGrad.addColorStop(1, '#090d16');

      ctx.fillStyle = treadGrad;
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(-tireW / 2, -wheelH - tireThick * 0.5, tireW, tireThick, [5, 5, 2, 2]);
      ctx.fill();
      ctx.stroke();

      // Transverse titanium grouser cleats across the arched tire tread
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.3;
      for (let gx = -tireW / 2 + 3.5; gx <= tireW / 2 - 3.5; gx += 4) {
        ctx.beginPath();
        ctx.moveTo(gx, -wheelH - tireThick * 0.45);
        ctx.lineTo(gx, -wheelH + tireThick * 0.45);
        ctx.stroke();
      }

      // 3. Vertical South-Facing Side Rim of the Upright Wheel
      if (isForeground) {
        // Tire sidewall body extending from the ground (y=0) up to the top tread (-wheelH)
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.roundRect(-tireW / 2, -wheelH + 2, tireW, wheelH, [4, 4, 5, 5]);
        ctx.fill();
        ctx.stroke();

        // Recessed metallic wheel rim & spokes on the vertical side face (centered at y = -wheelH/2 + 2)
        const hubY = -wheelH * 0.45 + 1.5;
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.ellipse(0, hubY, 7.5, 5.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.1;
        ctx.stroke();

        // 6 radial titanium wheel spokes on the vertical side face
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        for (let s = 0; s < 6; s++) {
          const a = (s * Math.PI) / 3;
          ctx.beginPath();
          ctx.moveTo(0, hubY);
          ctx.lineTo(Math.cos(a) * 6.8, hubY + Math.sin(a) * 4.6);
          ctx.stroke();
        }

        // Planetary drive axle hubcap on the vertical side face
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.ellipse(0, hubY, 2.8, 2.0, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    // 1. Ground Shadow & Docking Pad Glow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 64, 44, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Far-Side (North) Rocker-Bogie Upright Wheels & Axles (partially behind the chassis in 2.5D)
    const wheelOffsets = [-36, 0, 36];
    for (const wx of wheelOffsets) {
      // Vertical axle strut connecting north wheel to chassis
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(wx, -16);
      ctx.lineTo(wx, -25);
      ctx.stroke();
      drawRoverWheel25D(wx, -24, false);
    }

    // 3. Main 2.5D Armored Rover Chassis (Gold/Titanium thermal blanket + carbon deck)
    // Lower chassis frame
    drawBox25D(ctx, -46, -18, 92, 44, 18, '#d97706', '#92400e', '#fbbf24');
    // Upper instrument deck & solar array panels
    drawBox25D(ctx, -36, -14, 64, 34, 24, '#0f172a', '#1e293b', '#38bdf8');

    // Solar cell grid on upper deck
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1;
    for (let sx = -28; sx <= 20; sx += 12) {
      ctx.beginPath();
      ctx.moveTo(sx, -12 - 24);
      ctx.lineTo(sx, 18 - 24);
      ctx.stroke();
    }

    // 4. Rear RTG Nuclear Battery Pack with glowing cooling fins (West end of rover)
    drawCylinder25D(ctx, -44, 0, 12, 14, 26, '#334155', '#1e293b', '#64748b');
    ctx.fillStyle = solved ? '#34d399' : '#38bdf8';
    ctx.fillRect(-48, -4 - 22, 8, 8);

    // 5. Articulated Robotic Manipulator Arm on Front-Right
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(32, 6 - 18);
    ctx.lineTo(54, 14 - 22);
    ctx.lineTo(62, 2 - 16);
    ctx.stroke();
    // Turret drill/spectrometer head at end of arm
    ctx.fillStyle = '#00ff9d';
    ctx.beginPath();
    ctx.arc(62, 2 - 16, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // 6. 2.5D Pan-Tilt Remote Sensing Mast & Dual Optical Stereo Cameras
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(18, -8 - 44, 6, 24);
    const camPan = Math.sin(t * 0.02) * 2;
    drawBox25D(ctx, 10 + camPan, -12, 22, 14, 46, '#e2e8f0', '#64748b', '#94a3b8');
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(16 + camPan, -2 - 46, 3, 0, Math.PI * 2);
    ctx.arc(26 + camPan, -2 - 46, 3, 0, Math.PI * 2);
    ctx.fill();

    // 7. Near-Side (South Foreground) Upright Rover Wheels & Rocker-Bogie Suspension Linkage
    for (const wx of wheelOffsets) {
      drawRoverWheel25D(wx, 29, true);
    }
    // Titanium Rocker-Bogie Exterior Suspension Struts connecting into the side wheel hubs
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-36, 24);
    ctx.lineTo(-18, 12);
    ctx.lineTo(0, 24);
    ctx.moveTo(-18, 12);
    ctx.lineTo(8, 8);
    ctx.lineTo(36, 24);
    ctx.stroke();
    // Pivot joint bolts on the rocker-bogie linkage
    for (const [jx, jy] of [
      [-18, 12],
      [8, 8],
    ]) {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(jx, jy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  /**
   * Renders Room 2 (NE Sector: x=1900..2260, y=200..580) as the ship's Fuel Storage & Processing Department
   * (Отдел хранения и переработки топлива):
   * 1. Sub-floor recessed fuel transfer trenches with glowing cyan/amber liquid flow pulses.
   * 2. North Wall (x=1930..2094, y=214..268): Twin 2.5D Cryogenic Fuel Storage Silos (SILO-01 DEUTERIUM & SILO-02 HYDRAZINE)
   *    with domed tops, illuminated vertical liquid level sight-glasses, pressure manometers, shutoff handwheels & overhead manifold pipe.
   * 3. North-East Wall (x=2110..2244, y=214..262): High-Pressure Fuel Header Manifold & Pressure Regulation Cabinet.
   * 4. East Wall (x=2154..2248, y=284..428): Multi-Stage Fuel Processing, Centrifugal Filtration & Fractional Distillation Reactor
   *    with raw-amber vs purified-cyan separator columns, cracking tower & octane/purity monitor.
   * 5. South-East Wall (x=2154..2248, y=444..562): High-Pressure Fuel Metering Pump & Cryo-Canister Station.
   * 6. South Wall (x=1940..2124, y=516..566): Spill-containment grate with 5 color-coded pressurized propellant barrels (LOX, RP-1, N2H4, He-3, LH2).
   */
  const collectFuelStorageAndProcessingRoom2_25D = (
    ctx: CanvasRenderingContext2D,
    t: number,
    solved: boolean,
    items: Sortable25DItem[]
  ) => {
    const primaryFuelColor = solved ? '#34d399' : '#06b6d4';

    // =========================================================================
    // 2. NORTH WALL: TWIN 2.5D CRYOGENIC FUEL STORAGE SILOS (x: 1930..2094, y: 214..268)
    // =========================================================================
    items.push({
      sortY: getRectPropSortY(200, 74),
      label: 'Криогенные силосы дейтерия и гидразина',
      draw: () => {
        drawBox25D(ctx, 1930, 214, 164, 54, 10, '#1e293b', '#090d16', '#475569');

        const siloPositions = [
          { cx: 1972, cy: 242, label: 'D2-CRYO', fluidColor: '#38bdf8', valveColor: '#ef4444' },
          { cx: 2052, cy: 242, label: 'N2H4-FUEL', fluidColor: '#f59e0b', valveColor: '#fbbf24' },
        ];

        for (let idx = 0; idx < siloPositions.length; idx++) {
          const s = siloPositions[idx];
          drawCylinder25D(ctx, s.cx, s.cy, 30, 20, 42, '#334155', '#1e293b', '#64748b');
          drawCylinder25D(ctx, s.cx, s.cy - 42, 20, 13, 8, '#475569', '#334155', '#94a3b8');

          ctx.strokeStyle = s.valveColor;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.ellipse(s.cx, s.cy - 18, 30, 19.5, 0, 0.12 * Math.PI, 0.88 * Math.PI);
          ctx.stroke();

          const gaugeX = s.cx - 5;
          const gaugeY = s.cy - 34;
          const gaugeW = 10;
          const gaugeH = 30;
          ctx.fillStyle = '#040b16';
          ctx.fillRect(gaugeX, gaugeY, gaugeW, gaugeH);
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1.1;
          ctx.strokeRect(gaugeX, gaugeY, gaugeW, gaugeH);

          const fillFrac = 0.74 + Math.sin(t * 0.03 + idx * 1.6) * 0.08;
          const fillH = Math.round(gaugeH * fillFrac);
          ctx.fillStyle = solved ? '#34d399' : s.fluidColor;
          ctx.fillRect(gaugeX + 1.5, gaugeY + gaugeH - fillH, gaugeW - 3, fillH - 1);

          ctx.fillStyle = '#ffffff';
          for (let b = 0; b < 2; b++) {
            const by =
              gaugeY +
              gaugeH -
              3 -
              ((t * 0.45 + b * 11 + idx * 7) % Math.max(6, fillH - 4));
            ctx.beginPath();
            ctx.arc(gaugeX + 3.5 + b * 3, by, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }

          const manoX = s.cx + 14;
          const manoY = s.cy - 24;
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.arc(manoX, manoY, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.1;
          ctx.stroke();
          const needleAng = -0.6 + Math.sin(t * 0.04 + idx) * 0.4;
          ctx.strokeStyle = '#ef4444';
          ctx.beginPath();
          ctx.moveTo(manoX, manoY);
          ctx.lineTo(manoX + Math.cos(needleAng) * 4, manoY + Math.sin(needleAng) * 4);
          ctx.stroke();

          const vwX = s.cx - 15;
          const vwY = s.cy - 14;
          ctx.strokeStyle = s.valveColor;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(vwX, vwY, 4.5, 0, Math.PI * 2);
          ctx.moveTo(vwX - 4, vwY);
          ctx.lineTo(vwX + 4, vwY);
          ctx.moveTo(vwX, vwY - 4);
          ctx.lineTo(vwX, vwY + 4);
          ctx.stroke();
        }

        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(1972, 242 - 50);
        ctx.lineTo(2052, 242 - 50);
        ctx.stroke();
        ctx.strokeStyle = primaryFuelColor;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(1972, 242 - 50);
        ctx.lineTo(2052, 242 - 50);
        ctx.stroke();
      },
    });

    // =========================================================================
    // 3. NORTH-EAST WALL: 3-TIER 2.5D HIGH-PRESSURE FUEL MANIFOLD & HEADER CABINET (x: 2110..2244, y: 214..262)
    // =========================================================================
    items.push({
      sortY: getRectPropSortY(200, 68),
      label: 'Манифольд высокого давления топлива',
      draw: () => {
        drawBox25D(ctx, 2110, 214, 134, 48, 22, '#1e293b', '#0f172a', primaryFuelColor);
        drawBox25D(ctx, 2112, 214, 130, 16, 44, '#334155', '#0b1322', primaryFuelColor);
        const hdrGaugeY = 214 + 16 - 44 + 11;
        for (let g = 0; g < 3; g++) {
          const gx = 2138 + g * 38;
          const gy = hdrGaugeY;
          ctx.fillStyle = '#040b16';
          ctx.beginPath();
          ctx.arc(gx, gy, 8.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = g === 1 ? '#fbbf24' : primaryFuelColor;
          ctx.lineWidth = 1.3;
          ctx.stroke();
          const ang = -0.8 + g * 0.7 + Math.sin(t * 0.03 + g) * 0.35;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx + Math.cos(ang) * 6.5, gy + Math.sin(ang) * 6.5);
          ctx.stroke();
        }
        const hdrDeckY = 214 + 20 - 22;
        for (let k = 0; k < 5; k++) {
          const kx = 2120 + k * 18;
          ctx.fillStyle = '#020617';
          ctx.fillRect(kx, hdrDeckY + 6, 10, 5);
          ctx.fillStyle = k % 2 === 0 ? primaryFuelColor : '#fbbf24';
          ctx.fillRect(kx, hdrDeckY + 4.5, 10, 4);
        }
      },
    });

    // =========================================================================
    // 4. EAST WALL: FUEL PROCESSING, DISTILLATION & FILTRATION REACTOR (x: 2154..2248, y: 284..428)
    // =========================================================================
    items.push({
      sortY: getRectPropSortY(282, 148),
      label: 'Реактор ректификации и очистки топлива',
      draw: () => {
        drawBox25D(ctx, 2154, 284, 94, 144, 24, '#1e293b', '#0f172a', '#475569');
        const procTopX = 2154;
        const procTopY = 284 - 24;

        drawCylinder25D(ctx, procTopX + 66, 316, 19, 13, 46, '#475569', '#1e293b', '#38bdf8');
        for (const ringOffset of [12, 24, 36]) {
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.ellipse(procTopX + 66, 316 - ringOffset, 20, 13, 0, 0, Math.PI);
          ctx.stroke();
        }
        ctx.fillStyle = solved ? '#34d399' : '#38bdf8';
        ctx.beginPath();
        ctx.ellipse(procTopX + 66, 316 - 46, 8, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        const sepCols = [
          { x: procTopX + 7, color: 'rgba(245, 158, 11, 0.78)', border: '#f59e0b' },
          {
            x: procTopX + 26,
            color: solved ? 'rgba(52, 211, 153, 0.82)' : 'rgba(6, 182, 212, 0.82)',
            border: '#38bdf8',
          },
        ];
        for (let c = 0; c < sepCols.length; c++) {
          const sc = sepCols[c];
          const cy = procTopY + 10;
          ctx.fillStyle = '#040b16';
          ctx.fillRect(sc.x, cy, 15, 54);
          ctx.strokeStyle = sc.border;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(sc.x, cy, 15, 54);

          ctx.fillStyle = sc.color;
          ctx.fillRect(sc.x + 2, cy + 6, 11, 44);

          ctx.fillStyle = '#e0f2fe';
          for (let b = 0; b < 3; b++) {
            const by = cy + 46 - ((t * 0.55 + b * 14 + c * 9) % 38);
            ctx.beginPath();
            ctx.arc(sc.x + 5 + (b % 2) * 5, by, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        drawBox25D(ctx, procTopX + 4, 358, 86, 18, 42, '#334155', '#0b1322', primaryFuelColor);
        const monX = procTopX + 8;
        const monY = 358 + 18 - 42 + 2;
        ctx.fillStyle = '#040b16';
        ctx.fillRect(monX, monY, 78, 16);
        ctx.strokeStyle = primaryFuelColor;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(monX, monY, 78, 16);

        ctx.strokeStyle = primaryFuelColor;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let sx = 3; sx < 48; sx += 3) {
          const sy = monY + 8 + Math.sin(sx * 0.22 + t * 0.07) * 5;
          if (sx === 3) ctx.moveTo(monX + sx, sy);
          else ctx.lineTo(monX + sx, sy);
        }
        ctx.stroke();
        for (let b = 0; b < 3; b++) {
          const bh = 4 + ((b * 4 + Math.floor(t * 0.15)) % 10);
          ctx.fillStyle = b === 0 ? '#f59e0b' : primaryFuelColor;
          ctx.fillRect(monX + 54 + b * 7, monY + 14 - bh, 4.5, bh);
        }

        for (let k = 0; k < 5; k++) {
          ctx.fillStyle = '#020617';
          ctx.fillRect(monX + k * 10.5, procTopY + 115.5, 7, 5);
          ctx.fillStyle = solved ? '#34d399' : k % 2 === 0 ? '#38bdf8' : '#fbbf24';
          ctx.fillRect(monX + k * 10.5, procTopY + 114, 7, 4.5);
          ctx.fillStyle = '#64748b';
          ctx.fillRect(monX + k * 10.5, procTopY + 122, 7, 4);
        }
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(procTopX + 74, procTopY + 120, 7, 0, Math.PI * 2);
        ctx.moveTo(procTopX + 67, procTopY + 120);
        ctx.lineTo(procTopX + 81, procTopY + 120);
        ctx.moveTo(procTopX + 74, procTopY + 113);
        ctx.lineTo(procTopX + 74, procTopY + 127);
        ctx.stroke();
      },
    });

    // =========================================================================
    // 5. SOUTH-EAST WALL: 3-TIER 2.5D HIGH-PRESSURE FUEL METERING PUMP & CRYO CANISTERS (x: 2154..2248, y: 444..562)
    // =========================================================================
    items.push({
      sortY: getRectPropSortY(444, 122),
      label: 'Насосная станция дозирования топлива',
      draw: () => {
        drawBox25D(ctx, 2154, 446, 94, 116, 26, '#0f172a', '#1e293b', primaryFuelColor);
        drawBox25D(ctx, 2158, 448, 58, 16, 44, '#334155', '#0b1322', primaryFuelColor);
        const pumpScrY = 448 + 16 - 44 + 2;
        ctx.fillStyle = '#020617';
        ctx.fillRect(2162, pumpScrY, 50, 15);
        ctx.strokeStyle = primaryFuelColor;
        ctx.lineWidth = 1.1;
        ctx.strokeRect(2162, pumpScrY, 50, 15);
        ctx.fillStyle = primaryFuelColor;
        ctx.fillRect(2166, pumpScrY + 4, 34, 3);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(2166, pumpScrY + 9, 26, 3);

        drawCylinder25D(ctx, 2228, 480, 12, 9, 28, '#334155', '#090d16', primaryFuelColor);
        drawCylinder25D(ctx, 2174, 532, 11, 8, 30, '#0284c7', '#0369a1', '#38bdf8');
        drawCylinder25D(ctx, 2201, 532, 11, 8, 30, '#d97706', '#92400e', '#fbbf24');
        drawCylinder25D(ctx, 2228, 532, 11, 8, 30, '#059669', '#064e3b', '#34d399');
      },
    });

    // =========================================================================
    // 6. SOUTH WALL: PRESSURIZED PROPELLANT BARREL & CANISTER RACK (x: 1940..2124, y: 516..566)
    // =========================================================================
    items.push({
      sortY: getRectPropSortY(518, 54),
      label: 'Стеллаж топливных бочек и изотопов',
      draw: () => {
        drawBox25D(ctx, 1940, 520, 184, 44, 8, '#0f172a', '#090d16', '#f59e0b');
        const barrels = [
          { cx: 1962, cy: 542, top: '#0284c7', side: '#0c4a6e', rim: '#38bdf8' },
          { cx: 1997, cy: 542, top: '#d97706', side: '#78350f', rim: '#fbbf24' },
          { cx: 2032, cy: 542, top: '#dc2626', side: '#7f1d1d', rim: '#f87171' },
          { cx: 2067, cy: 542, top: '#059669', side: '#064e3b', rim: '#34d399' },
          { cx: 2102, cy: 542, top: '#7c3aed', side: '#4c1d95', rim: '#c084fc' },
        ];
        for (const br of barrels) {
          drawCylinder25D(ctx, br.cx, br.cy, 12, 9, 24, br.top, br.side, br.rim);
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.arc(br.cx, br.cy - 24, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    });
  };

  /**
   * Collects Room 3 (SW Sector: x=140..500, y=1020..1440) 2.5D props for Y-sorting:
   * - North-East Wall (x=344..486, y=1032..1080): 3-Tier 2.5D Rover Telemetry, Lidar Calibration & Battery Charging Station
   * - West Wall (x=148..242, y=1226..1414): Robotics & Electronics Workbenches
   * - South-East Wall (x=404..488, y=1282..1418): Rover Spare Parts, Suspension Strut & Servo Actuator Storage Rack
   */
  const collectRoverAndRoboticsBayRoom3_25D = (
    ctx: CanvasRenderingContext2D,
    t: number,
    solved: boolean,
    items: Sortable25DItem[]
  ) => {
    const accent = solved ? '#34d399' : '#00ff9d';

    const drawPCBOnTable = (
      px: number,
      py: number,
      pw: number,
      ph: number,
      boardColor: string,
      borderColor: string,
      chipCount: number = 2
    ) => {
      ctx.fillStyle = boardColor;
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, pw, ph);

      ctx.fillStyle = '#fbbf24';
      for (let gx = px + 3; gx < px + pw - 3; gx += 3.5) {
        ctx.fillRect(gx, py + ph - 2.2, 2, 2.2);
      }

      ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(px + 4, py + 4);
      ctx.lineTo(px + pw - 5, py + 4);
      ctx.lineTo(px + pw - 8, py + ph - 5);
      ctx.moveTo(px + 4, py + ph * 0.55);
      ctx.lineTo(px + pw - 4, py + ph * 0.55);
      ctx.stroke();

      for (let c = 0; c < chipCount; c++) {
        const cw = Math.min(11, pw * 0.34);
        const ch = Math.min(9, ph * 0.45);
        const cx = px + 5 + c * (cw + 6);
        const cy = py + 4;
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(cx - 1.2, cy + 1.5, cw + 2.4, ch - 3);
        ctx.fillRect(cx + 1.5, cy - 1.2, cw - 3, ch + 2.4);
        ctx.fillStyle = '#090d16';
        ctx.fillRect(cx, cy, cw, ch);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(cx + 1.5, cy + 1.5, 1.5, 1.5);
      }

      ctx.fillStyle = solved ? '#34d399' : Math.sin(t * 0.08 + px) > 0 ? '#22c55e' : '#f59e0b';
      ctx.beginPath();
      ctx.arc(px + pw - 4.5, py + 4.5, 1.6, 0, Math.PI * 2);
      ctx.fill();
    };

    // 2. NORTH-EAST WALL: 3-TIER 2.5D ROVER TELEMETRY, LIDAR CALIBRATION & CHARGING STATION (x: 344..486, y: 1032..1080)
    items.push({
      sortY: getRectPropSortY(1020, 64),
      label: 'Станция зарядки и телеметрии планетохода',
      draw: () => {
        drawAngledConsole25D(ctx, 344, 1032, 142, 46, 22, 42, accent, t, 'radar', true);
      },
    });

    // 3a. Upper Bench (y: 1226..1290): 3-Tier 2.5D Oscilloscope Hood & Rover Stereo-Camera Calibration Rig
    items.push({
      sortY: getRectPropSortY(1224, 66),
      label: 'Стенд калибровки оптики и осциллограф',
      draw: () => {
        drawBox25D(ctx, 148, 1226, 94, 62, 22, '#0f172a', '#1e293b', '#38bdf8');
        drawBox25D(ctx, 152, 1228, 52, 16, 38, '#334155', '#0b1322', '#38bdf8');
        const oscScrY = 1228 + 16 - 38 + 2;
        ctx.fillStyle = '#020617';
        ctx.fillRect(156, oscScrY, 44, 13);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.1;
        ctx.strokeRect(156, oscScrY, 44, 13);
        ctx.beginPath();
        for (let sx = 3; sx < 41; sx += 3) {
          const sy = oscScrY + 6.5 + Math.sin(sx * 0.3 + t * 0.08) * 4;
          if (sx === 3) ctx.moveTo(156 + sx, sy);
          else ctx.lineTo(156 + sx, sy);
        }
        ctx.stroke();
        drawBox25D(ctx, 212, 1252, 22, 16, 26, '#e2e8f0', '#64748b', '#38bdf8');
        const upBenchY = 1226 - 22;
        drawPCBOnTable(156, upBenchY + 34, 46, 20, '#064e3b', '#34d399', 2);
      },
    });

    // 3b. Lower Workbench (y: 1300..1414): Disassembled Robotic Arm & 3 Printed Circuit Boards (PCBs)
    items.push({
      sortY: getRectPropSortY(1298, 118),
      label: 'Верстак робототехники и печатных плат',
      draw: () => {
        drawBox25D(ctx, 148, 1300, 94, 114, 20, '#1e293b', '#0f172a', '#475569');
        const wbX = 148;
        const wbY = 1300 - 20;

        ctx.fillStyle = '#090d16';
        ctx.fillRect(wbX + 6, wbY + 6, 82, 38);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.strokeRect(wbX + 6, wbY + 6, 82, 38);

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(wbX + 16, wbY + 32);
        ctx.lineTo(wbX + 42, wbY + 16);
        ctx.lineTo(wbX + 66, wbY + 24);
        ctx.stroke();
        for (const [jx, jy] of [
          [wbX + 16, wbY + 32],
          [wbX + 42, wbY + 16],
          [wbX + 66, wbY + 24],
        ]) {
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(jx, jy, 3.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(wbX + 66, wbY + 24);
        ctx.lineTo(wbX + 78, wbY + 18);
        ctx.moveTo(wbX + 66, wbY + 24);
        ctx.lineTo(wbX + 78, wbY + 30);
        ctx.stroke();

        drawPCBOnTable(wbX + 8, wbY + 50, 46, 30, '#064e3b', '#34d399', 2);
        drawPCBOnTable(wbX + 58, wbY + 52, 28, 28, '#1e3a8a', '#60a5fa', 1);
        drawPCBOnTable(wbX + 10, wbY + 84, 42, 22, '#7f1d1d', '#f87171', 2);
      },
    });

    // 4. SOUTH-EAST WALL: ROVER SPARE PARTS, SERVO ACTUATOR & SUSPENSION RACK (x: 404..488, y: 1282..1418)
    items.push({
      sortY: getRectPropSortY(1280, 142),
      label: 'Стеллаж запчастей и подвески планетохода',
      draw: () => {
        drawBox25D(ctx, 404, 1282, 84, 136, 24, '#1e293b', '#0f172a', '#475569');
        const seTopX = 404;
        const seTopY = 1282 - 24;
        drawCylinder25D(ctx, seTopX + 42, 1312, 20, 13, 18, '#334155', '#0f172a', '#f59e0b');
        drawPCBOnTable(seTopX + 12, seTopY + 58, 60, 28, '#064e3b', '#34d399', 2);
        drawPCBOnTable(seTopX + 12, seTopY + 94, 60, 28, '#1e3a8a', '#38bdf8', 2);
      },
    });
  };

  /**
   * Collects curved 3-tier 2.5D astrometry consoles, spectral prism analyzers, and star-chart stations
   * arranged radially inside the circular Observation Dome (Room 5: cx=1200, cy=210, r=175).
   */
  const collectCircularAstroDomeDetails25D = (
    ctx: CanvasRenderingContext2D,
    t: number,
    solved: boolean,
    items: Sortable25DItem[]
  ) => {
    const cx = 1200;
    const cy = 210;

    items.push({
      sortY: getRectPropSortY(148, 38),
      label: 'Спектрометр звёздных классов',
      draw: () => {
        drawAngledConsole25D(
          ctx,
          cx - 132,
          cy - 58,
          64,
          34,
          20,
          38,
          '#38bdf8',
          t,
          'spectrum',
          true
        );
      },
    });

    items.push({
      sortY: getRectPropSortY(148, 38),
      label: 'Радиоинтерферометр дальнего космоса',
      draw: () => {
        drawAngledConsole25D(
          ctx,
          cx + 68,
          cy - 58,
          64,
          34,
          20,
          38,
          solved ? '#34d399' : '#facc15',
          t,
          'dual',
          true
        );
      },
    });

    for (const side of [-1, 1]) {
      const tx = cx + side * 124;
      const ty = cy + 28;
      items.push({
        sortY: getCirclePropSortY(ty),
        label: side < 0 ? 'Западный оптический телескоп' : 'Восточный оптический телескоп',
        draw: () => {
          drawCylinder25D(ctx, tx, ty, 18, 13, 18, '#334155', '#0f172a', '#64748b');
          ctx.save();
          ctx.translate(tx, ty - 20);
          ctx.rotate(side * -0.35);
          ctx.fillStyle = '#e2e8f0';
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 1.5;
          ctx.fillRect(-5, -24, 10, 28);
          ctx.strokeRect(-5, -24, 10, 28);
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.ellipse(0, -24, 5, 2.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        },
      });
    }
  };

  /**
   * Renders the Central 2.5D Tokamak Cold Nuclear Fusion Reactor in the center of Room 4 (2080, 1215).
   */
  const drawCentralTokamak25D = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    t: number,
    solved: boolean
  ) => {
    ctx.save();
    ctx.translate(cx, cy);

    const plasmaPulse = Math.sin(t * 0.025) * 0.08 + 0.92;

    // Heavy 2.5D Cylindrical Cryostat Base Pedestal
    drawCylinder25D(ctx, 0, 0, 52, 38, 16, '#1e293b', '#090d14', '#475569');

    // 2.5D Toroidal Vacuum Vessel & Cold Fusion Plasma Ring (shifted up by 22px)
    const torusY = -22;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.ellipse(0, torusY, 42, 28, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = solved
      ? `rgba(52, 211, 153, ${0.85 * plasmaPulse})`
      : `rgba(56, 189, 248, ${0.85 * plasmaPulse})`;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.ellipse(0, torusY, 42, 28, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, torusY, 42, 28, 0, t * 0.02, t * 0.02 + Math.PI * 1.35);
    ctx.stroke();

    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      const ix = Math.cos(a) * 18;
      const iy = torusY + Math.sin(a) * 12;
      const ox = Math.cos(a) * 52;
      const oy = torusY + Math.sin(a) * 35;

      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(ix, iy - 6);
      ctx.lineTo(ox, oy - 4);
      ctx.lineTo(ox, oy + 6);
      ctx.stroke();

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ix, iy - 6);
      ctx.lineTo(ox, oy - 4);
      ctx.stroke();
    }

    drawCylinder25D(ctx, 0, torusY + 4, 15, 11, 24, '#334155', '#0f172a', '#38bdf8');
    ctx.fillStyle = solved ? '#34d399' : '#38bdf8';
    ctx.beginPath();
    ctx.ellipse(0, torusY - 20, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  const collectTerminals25D = (
    ctx: CanvasRenderingContext2D,
    t: number,
    items: Sortable25DItem[]
  ) => {
    for (const rm of SHIP_ROOMS) {
      if (rm.id === 'central_core') {
        // The Central Key Synthesis Core Pedestal is already collected in collectRoomDetails25D at y=740
        continue;
      }
      const solved = isTaskSolved(rm.taskIndex);
      const isNear = nearbyTerminalRef.current === rm.taskIndex;
      const baseColor = solved ? '#10b981' : rm.color;
      const isTokamakMaster = rm.id === 'reactor';

      items.push({
        sortY: isTokamakMaster
          ? getRectPropSortY(1346, 54) + 0.5
          : getCirclePropSortY(rm.terminalY),
        label: `Терминал узла ${rm.taskIndex}`,
        draw: () => {
          ctx.save();
          ctx.translate(rm.terminalX, rm.terminalY);

          const cW = isTokamakMaster ? 60 : 48;
          const cD = isTokamakMaster ? 32 : 28;
          const zDeck = isTokamakMaster ? 22 : 20;
          const zHood = isTokamakMaster ? 40 : 36;
          const borderCol = isNear ? '#ffffff' : baseColor;

          drawAngledConsole25D(
            ctx,
            -cW / 2,
            -cD / 2,
            cW,
            cD,
            zDeck,
            zHood,
            borderCol,
            t + rm.taskIndex * 17,
            rm.taskIndex === 1
              ? 'radar'
              : rm.taskIndex === 2
              ? 'bars'
              : rm.taskIndex === 4
              ? 'dual'
              : 'wave',
            true
          );

          ctx.restore();
        },
      });
    }
  };

  /**
   * Collects the 5 Armored 2.5D Bulkhead Doors & Doorframe Jambs for Y-sorting.
   */
  const collectShipDoors25D = (
    ctx: CanvasRenderingContext2D,
    t: number,
    items: Sortable25DItem[]
  ) => {
    for (const door of SHIP_DOORS) {
      const progress = doorLiftProgressRef.current[door.doorId] ?? 0;
      const isNear = nearbyDoorRef.current === door.doorId;
      const isUnlocked = unlockedDoorsRef.current[door.doorId] || progress >= 0.98;

      const easeLift = 1 - Math.pow(1 - progress, 3);
      const baseZ = 34;
      const remainingSlabZ = Math.max(4, Math.round(baseZ * (1 - easeLift * 0.88)));
      const liftUpOffset = easeLift * 30;

      if (door.orientation === 'vertical') {
        // North Doorframe Jamb Pillar (Daniil walks in front of this when passing through the doorway)
        items.push({
          sortY: getRectPropSortY(door.y - 6, 10),
          label: `Северный пилон двери ${door.doorId}`,
          draw: () => {
            drawBox25D(
              ctx,
              door.x - 2,
              door.y - 6,
              door.w + 4,
              10,
              38,
              '#334155',
              '#090d16',
              '#475569'
            );
          },
        });

        // Blast Door Slab (when not yet fully retracted)
        if (progress < 0.99) {
          items.push({
            sortY: door.cy,
            label: `Гермозатвор узла ${door.doorId}`,
            draw: () => {
              const slabY = door.y - liftUpOffset;
              const borderCol = isNear ? '#ffffff' : isUnlocked ? '#10b981' : door.color;

              ctx.fillStyle = `rgba(0, 0, 0, ${(0.5 * (1 - easeLift)).toFixed(2)})`;
              ctx.fillRect(door.x - 3, door.y + 3, door.w + 6, door.h + 4);

              ctx.fillStyle = '#0f172a';
              ctx.fillRect(door.x, slabY + door.h - remainingSlabZ, door.w, remainingSlabZ);
              ctx.strokeStyle = borderCol;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(door.x, slabY + door.h - remainingSlabZ, door.w, remainingSlabZ);

              ctx.fillStyle = '#1e293b';
              ctx.fillRect(door.x, slabY - remainingSlabZ, door.w, door.h);
              ctx.strokeStyle = borderCol;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(door.x, slabY - remainingSlabZ, door.w, door.h);

              ctx.strokeStyle = '#334155';
              ctx.lineWidth = 2;
              for (
                let ry = slabY - remainingSlabZ + 18;
                ry < slabY - remainingSlabZ + door.h - 12;
                ry += 26
              ) {
                ctx.beginPath();
                ctx.moveTo(door.x + 3, ry);
                ctx.lineTo(door.x + door.w - 3, ry);
                ctx.stroke();
              }

              ctx.fillStyle = isUnlocked ? '#10b981' : '#ef4444';
              ctx.beginPath();
              ctx.arc(door.cx, door.cy - liftUpOffset - remainingSlabZ, 5.5, 0, Math.PI * 2);
              ctx.fill();
            },
          });
        }

        // South Doorframe Jamb Pillar (Daniil walks behind this when passing through the doorway)
        items.push({
          sortY: getRectPropSortY(door.y + door.h - 4, 10),
          label: `Южный пилон двери ${door.doorId}`,
          draw: () => {
            drawBox25D(
              ctx,
              door.x - 2,
              door.y + door.h - 4,
              door.w + 4,
              10,
              38,
              '#334155',
              '#090d16',
              '#475569'
            );
          },
        });
      } else {
        // Horizontal Door (Door 5 into Northern Astro-Dome)
        items.push({
          sortY: getRectPropSortY(door.y, door.h),
          label: `Гермозатвор узла ${door.doorId}`,
          draw: () => {
            if (progress < 0.99) {
              const slabY = door.y - liftUpOffset;
              const borderCol = isNear ? '#ffffff' : isUnlocked ? '#10b981' : door.color;

              ctx.fillStyle = `rgba(0, 0, 0, ${(0.5 * (1 - easeLift)).toFixed(2)})`;
              ctx.fillRect(door.x - 3, door.y + 3, door.w + 6, door.h + 4);

              ctx.fillStyle = '#0f172a';
              ctx.fillRect(door.x, slabY + door.h - remainingSlabZ, door.w, remainingSlabZ);
              ctx.strokeStyle = borderCol;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(door.x, slabY + door.h - remainingSlabZ, door.w, remainingSlabZ);

              ctx.fillStyle = '#1e293b';
              ctx.fillRect(door.x, slabY - remainingSlabZ, door.w, door.h);
              ctx.strokeStyle = borderCol;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(door.x, slabY - remainingSlabZ, door.w, door.h);

              ctx.strokeStyle = '#334155';
              ctx.lineWidth = 2;
              for (let rx = door.x + 22; rx < door.x + door.w - 16; rx += 28) {
                ctx.beginPath();
                ctx.moveTo(rx, slabY - remainingSlabZ + 3);
                ctx.lineTo(rx, slabY - remainingSlabZ + door.h - 3);
                ctx.stroke();
              }

              ctx.fillStyle = isUnlocked ? '#10b981' : '#ef4444';
              ctx.beginPath();
              ctx.arc(door.cx, door.cy - liftUpOffset - remainingSlabZ, 5.5, 0, Math.PI * 2);
              ctx.fill();
            }

            drawBox25D(
              ctx,
              door.x - 6,
              door.y - 2,
              10,
              door.h + 4,
              38,
              '#334155',
              '#090d16',
              '#475569'
            );
            drawBox25D(
              ctx,
              door.x + door.w - 4,
              door.y - 2,
              10,
              door.h + 4,
              38,
              '#334155',
              '#090d16',
              '#475569'
            );
          },
        });
      }
    }
  };

  /**
   * Renders fading astronaut magnetic-boot footprints left behind Daniil as he walks across the deck.
   * Footprints fade out quickly (within 1.8s) so only a short trail of 3-5 recent steps follows him.
   */
  const drawPlayerFootprints = (ctx: CanvasRenderingContext2D, now: number) => {
    const fps = footprintsRef.current;
    if (fps.length === 0) return;

    ctx.save();
    for (const fp of fps) {
      const age = now - fp.createdAt;
      const maxLife = 1800;
      if (age >= maxLife) continue;
      const life = Math.max(0, 1 - age / maxLife);
      const alpha = Math.pow(life, 1.65) * 0.52;

      ctx.save();
      ctx.translate(fp.x, fp.y);
      ctx.rotate(fp.angle);
      ctx.globalAlpha = alpha;

      // Subtle cyan magnetic-boot condensation aura on metal deck
      ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dark boot sole imprint (rear heel + front sole)
      ctx.fillStyle = '#090d16';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(-4.6, -2.2, 3.8, 4.4, 1.4);
      ctx.roundRect(0, -2.5, 4.8, 5, 1.6);
      ctx.fill();
      ctx.stroke();

      // Boot tread ridges
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.42)';
      ctx.lineWidth = 0.7;
      for (const tx of [-2.8, 1.3, 3.1]) {
        ctx.beginPath();
        ctx.moveTo(tx, -1.7);
        ctx.lineTo(tx, 1.7);
        ctx.stroke();
      }

      ctx.restore();
    }
    ctx.restore();
  };

  /**
   * Renders a subtle, minimalist Dota-style click indicator at clicked world coordinates:
   * High transparency (max alpha ~0.34), fewer visual elements (only 4 compact converging chevrons
   * and a soft tiny center dot — no large rings or heavy outlines).
   */
  const drawDotaClickEffects = (ctx: CanvasRenderingContext2D, now: number) => {
    const effects = clickEffectsRef.current;
    if (effects.length === 0) return;

    ctx.save();
    for (const fx of effects) {
      const elapsed = now - fx.createdAt;
      const duration = 560;
      if (elapsed < 0 || elapsed >= duration) continue;

      const p = elapsed / duration; // 0..1
      const slideT = Math.min(1, p / 0.6);
      const easeOut = 1 - Math.pow(1 - slideT, 3);
      const fade = (1 - p) * 0.34; // Subtle, highly transparent max opacity

      const mainColor = fx.isTerminalTarget ? '#fbbf24' : '#4ade80';

      ctx.save();
      ctx.translate(fx.x, fx.y);

      // 1. Minimal soft center point (single subtle element on the ground)
      ctx.save();
      ctx.scale(1, 0.68);
      ctx.fillStyle = mainColor;
      ctx.globalAlpha = fade * 0.75;
      ctx.beginPath();
      ctx.arc(0, 0, 3.2 * (1 - p * 0.4), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Four compact, translucent inward-converging chevrons
      const arrowAngles = [
        Math.PI * 0.25,
        Math.PI * 0.75,
        Math.PI * 1.25,
        Math.PI * 1.75,
      ];
      const radialDist = 18 * (1 - easeOut) + 4;

      for (const ang of arrowAngles) {
        const ax = Math.cos(ang) * radialDist;
        const ay = Math.sin(ang) * radialDist * 0.68;
        const toCenterAngle = Math.atan2(-Math.sin(ang) * 0.68, -Math.cos(ang));

        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(toCenterAngle);
        ctx.globalAlpha = fade;

        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.moveTo(3.5, 0);
        ctx.lineTo(-5.5, -4);
        ctx.lineTo(-3.2, 0);
        ctx.lineTo(-5.5, 4);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }

      ctx.restore();
    }
    ctx.restore();
  };

  /**
   * Renders Daniil's wall-raycasted volumetric flashlight beam & suit rim glow in world space
   * BEFORE Daniil is drawn, so the beam cone never washes over Daniil's body or helmet.
   */
  const drawFlashlightWorldGlow = (
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    facingDir: FacingDirection,
    aimAngle: number,
    walkCycle: number,
    colorKey: SuitColor,
    closedSet: ReadonlySet<number>
  ) => {
    const isMoving = walkCycle > 0;
    const bob = isMoving ? Math.abs(Math.sin(walkCycle)) * 2.5 : 0;
    const reflector = getFlashlightReflectorOrigin(px, py, aimAngle, bob, facingDir);

    const bodyOriginX = px;
    const bodyOriginY = py - 6;
    const reflectorX = reflector.x;
    const reflectorY = reflector.y;
    const apertureRadius = reflector.apertureRadius;

    const coneRadius = 500;
    const coneHalfAngle = 0.52;
    const auraRadius = 116;

    const apexBackDist = apertureRadius / Math.tan(coneHalfAngle);
    const virtualApexX = reflectorX - Math.cos(aimAngle) * apexBackDist;
    const virtualApexY = reflectorY - Math.sin(aimAngle) * apexBackDist;
    const startGradRadius = apertureRadius;

    const flashlightPoly = computeLightConePolygon(
      reflectorX,
      reflectorY,
      aimAngle,
      coneHalfAngle,
      coneRadius,
      160,
      apertureRadius,
      closedSet
    );

    const personalAuraPoly = computeLightConePolygon(
      bodyOriginX,
      bodyOriginY,
      0,
      Math.PI,
      auraRadius,
      180,
      apertureRadius,
      closedSet
    );

    const traceConePolygon = (
      targetCtx: CanvasRenderingContext2D,
      poly: { x: number; y: number }[]
    ) => {
      targetCtx.beginPath();
      if (poly.length > 0) {
        targetCtx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
          targetCtx.lineTo(poly[i].x, poly[i].y);
        }
      }
      targetCtx.closePath();
    };

    const palette = SUIT_PALETTE[colorKey] || SUIT_PALETTE.cyan;

    ctx.save();
    traceConePolygon(ctx, personalAuraPoly);
    ctx.clip();
    const suitAura = ctx.createRadialGradient(
      bodyOriginX,
      bodyOriginY,
      4,
      bodyOriginX,
      bodyOriginY,
      64
    );
    suitAura.addColorStop(0, palette.glow.replace('0.5', '0.16'));
    suitAura.addColorStop(0.6, 'rgba(56, 189, 248, 0.05)');
    suitAura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = suitAura;
    ctx.beginPath();
    ctx.arc(bodyOriginX, bodyOriginY, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    traceConePolygon(ctx, flashlightPoly);
    ctx.clip();

    const beamGrad = ctx.createRadialGradient(
      virtualApexX,
      virtualApexY,
      startGradRadius,
      virtualApexX,
      virtualApexY,
      coneRadius + apexBackDist
    );
    beamGrad.addColorStop(0, 'rgba(255, 251, 235, 0.44)');
    beamGrad.addColorStop(0.26, 'rgba(224, 242, 254, 0.20)');
    beamGrad.addColorStop(0.68, 'rgba(56, 189, 248, 0.06)');
    beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = beamGrad;
    traceConePolygon(ctx, flashlightPoly);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(reflectorX, reflectorY);
    ctx.rotate(aimAngle);
    const emitterGlow = ctx.createRadialGradient(0, 0, 1.0, 0, 0, apertureRadius + 2.5);
    emitterGlow.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
    emitterGlow.addColorStop(0.65, 'rgba(254, 240, 138, 0.72)');
    emitterGlow.addColorStop(1, 'rgba(254, 240, 138, 0)');
    ctx.fillStyle = emitterGlow;
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.0, apertureRadius + 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /**
   * Renders the offscreen emergency blackout darkness layer inside the ship hull, carving out
   * 100% illumination across Daniil's body (`r <= 32px`) and across the raycasted flashlight frustum.
   */
  const drawBlackoutDarknessOverlay = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cam: { x: number; y: number; zoom: number },
    px: number,
    py: number,
    facingDir: FacingDirection,
    aimAngle: number,
    walkCycle: number,
    closedSet: ReadonlySet<number>
  ) => {
    const isMoving = walkCycle > 0;
    const bob = isMoving ? Math.abs(Math.sin(walkCycle)) * 2.5 : 0;
    const reflector = getFlashlightReflectorOrigin(px, py, aimAngle, bob, facingDir);

    const bodyOriginX = px;
    const bodyOriginY = py - 6;
    const reflectorX = reflector.x;
    const reflectorY = reflector.y;
    const apertureRadius = reflector.apertureRadius;

    const coneRadius = 500;
    const coneHalfAngle = 0.52;
    const auraRadius = 116;

    const apexBackDist = apertureRadius / Math.tan(coneHalfAngle);
    const virtualApexX = reflectorX - Math.cos(aimAngle) * apexBackDist;
    const virtualApexY = reflectorY - Math.sin(aimAngle) * apexBackDist;
    const startGradRadius = apertureRadius;

    const flashlightPoly = computeLightConePolygon(
      reflectorX,
      reflectorY,
      aimAngle,
      coneHalfAngle,
      coneRadius,
      160,
      apertureRadius,
      closedSet
    );

    const personalAuraPoly = computeLightConePolygon(
      bodyOriginX,
      bodyOriginY,
      0,
      Math.PI,
      auraRadius,
      180,
      apertureRadius,
      closedSet
    );

    const traceConePolygon = (
      targetCtx: CanvasRenderingContext2D,
      poly: { x: number; y: number }[]
    ) => {
      targetCtx.beginPath();
      if (poly.length > 0) {
        targetCtx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
          targetCtx.lineTo(poly[i].x, poly[i].y);
        }
      }
      targetCtx.closePath();
    };

    if (!lightCanvasRef.current) {
      lightCanvasRef.current = document.createElement('canvas');
    }
    const lCanvas = lightCanvasRef.current;
    if (lCanvas.width !== w || lCanvas.height !== h) {
      lCanvas.width = w;
      lCanvas.height = h;
    }
    const lCtx = lCanvas.getContext('2d');
    if (lCtx) {
      lCtx.save();
      lCtx.setTransform(1, 0, 0, 1, 0, 0);
      lCtx.clearRect(0, 0, w, h);

      lCtx.translate(w / 2, h / 2);
      lCtx.scale(cam.zoom, cam.zoom);
      lCtx.translate(-cam.x, -cam.y);

      lCtx.globalCompositeOperation = 'source-over';
      lCtx.fillStyle = 'rgba(4, 7, 14, 0.85)';
      traceSpaceshipHullPolygon(lCtx);
      lCtx.fill();

      lCtx.globalCompositeOperation = 'destination-out';

      lCtx.save();
      traceConePolygon(lCtx, personalAuraPoly);
      lCtx.clip();

      const personalGrad = lCtx.createRadialGradient(
        bodyOriginX,
        bodyOriginY,
        12,
        bodyOriginX,
        bodyOriginY,
        auraRadius
      );
      personalGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
      personalGrad.addColorStop(0.28, 'rgba(0, 0, 0, 1)');
      personalGrad.addColorStop(0.45, 'rgba(0, 0, 0, 0.82)');
      personalGrad.addColorStop(0.75, 'rgba(0, 0, 0, 0.30)');
      personalGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      lCtx.fillStyle = personalGrad;
      lCtx.beginPath();
      lCtx.arc(bodyOriginX, bodyOriginY, auraRadius, 0, Math.PI * 2);
      lCtx.fill();
      lCtx.restore();

      lCtx.save();
      traceConePolygon(lCtx, flashlightPoly);
      lCtx.clip();

      const coneCutGrad = lCtx.createRadialGradient(
        virtualApexX,
        virtualApexY,
        startGradRadius,
        virtualApexX,
        virtualApexY,
        coneRadius + apexBackDist
      );
      coneCutGrad.addColorStop(0, 'rgba(0, 0, 0, 0.99)');
      coneCutGrad.addColorStop(0.45, 'rgba(0, 0, 0, 0.86)');
      coneCutGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.38)');
      coneCutGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      lCtx.fillStyle = coneCutGrad;
      traceConePolygon(lCtx, flashlightPoly);
      lCtx.fill();
      lCtx.restore();

      lCtx.restore();

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(lCanvas, 0, 0);
      ctx.restore();
    }
  };

  /**
   * Renders crisp world-space floating UI labels (Daniil's name badge, Node Terminal badges,
   * and locked Door badges) on the top layer above 2.5D props and blackout darkness.
   */
  const drawFloatingWorldLabels = (
    ctx: CanvasRenderingContext2D,
    t: number,
    px: number,
    py: number,
    walkCycle: number
  ) => {
    const isMoving = walkCycle > 0;
    const playerBob = isMoving ? Math.abs(Math.sin(walkCycle)) * 2.5 : 0;

    // 1. Daniil's Name Tag
    ctx.save();
    ctx.translate(px, py);
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
    ctx.fillRect(-28, -46 - playerBob, 56, 15);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('ДАНИИЛ', 0, -35 - playerBob);
    ctx.restore();

    // 2. Floating Node Terminal Label Pills
    for (const rm of SHIP_ROOMS) {
      const solved = isTaskSolved(rm.taskIndex);
      const isNear = nearbyTerminalRef.current === rm.taskIndex;
      const baseColor = solved ? '#10b981' : rm.color;

      ctx.save();
      ctx.translate(rm.terminalX, rm.terminalY);

      const bob = Math.sin(t * 0.03) * 2.5;
      ctx.font = 'bold 11px monospace';
      const labelText =
        rm.taskIndex === 6
          ? solved
            ? '✓ КЛЮЧ ПРИНЯТ'
            : isNear
            ? '[E] СИНТЕЗ КЛЮЧА'
            : 'ЯДРО КЛЮЧА'
          : solved
          ? `✓ УЗЕЛ ${rm.taskIndex}`
          : isNear
          ? `[E] ОТКРЫТЬ УЗЕЛ ${rm.taskIndex}`
          : `УЗЕЛ ${rm.taskIndex}`;

      const textW = ctx.measureText(labelText).width + 16;
      const pillY = (rm.id === 'central_core' ? -68 : -56) + bob;

      ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
      ctx.strokeStyle = isNear ? '#ffffff' : baseColor;
      ctx.lineWidth = isNear ? 2 : 1.4;
      ctx.beginPath();
      ctx.roundRect(-textW / 2, pillY - 11, textW, 20, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = solved ? '#34d399' : isNear ? '#ffffff' : baseColor;
      ctx.textAlign = 'center';
      ctx.fillText(labelText, 0, pillY + 3);
      ctx.restore();
    }

    // 3. Floating Locked Door Interaction Prompts
    for (const door of SHIP_DOORS) {
      const progress = doorLiftProgressRef.current[door.doorId] ?? 0;
      const isNear = nearbyDoorRef.current === door.doorId;
      const isUnlocked = unlockedDoorsRef.current[door.doorId] || progress >= 0.98;
      if (isUnlocked) continue;

      const bob = Math.sin(t * 0.04 + door.doorId) * 2.2;
      ctx.font = 'bold 10px monospace';
      const label = isNear ? `[E] ОТКРЫТЬ ДВЕРЬ ${door.doorId}` : `ДВЕРЬ УЗЛА ${door.doorId}`;
      const tw = ctx.measureText(label).width + 14;
      const pyDoor = door.cy - 48 + bob;

      ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
      ctx.strokeStyle = isNear ? '#ffffff' : door.color;
      ctx.lineWidth = isNear ? 2 : 1.3;
      ctx.beginPath();
      ctx.roundRect(door.cx - tw / 2, pyDoor - 10, tw, 18, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isNear ? '#ffffff' : door.color;
      ctx.textAlign = 'center';
      ctx.fillText(label, door.cx, pyDoor + 2.5);
    }
  };

  /**
   * Renders Astronaut Daniil in 4 distinct directional views ('left', 'right', 'up', 'down'):
   * - 'left' / 'right': Side profile with backpack on rear, visor on front, striding legs, near-side flashlight arm
   * - 'down' (walking toward camera): Symmetric front view with narrower backpack tucked behind upper shoulders
   *   (width = 18px < torso 25px so it NEVER sticks out on the sides!), plus TWO symmetrical arms on the left (-14.5)
   *   and right (+13.5) sides of the torso!
   * - 'up' (walking away from camera): Back view with centered dual-tank oxygen backpack, rear helmet collar seam,
   *   and TWO symmetrical arms on the left (-14.5) and right (+13.5) sides of the torso!
   * In all views, the tactical flashlight has a wide parabolic reflector bell (`apertureRadius = 7.5px`)
   * matching the truncated-cone light beam.
   */
  const drawAstronautDaniil = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    facing: number,
    facingDir: FacingDirection,
    aimAngle: number,
    walkCycle: number,
    colorKey: SuitColor
  ) => {
    const palette = SUIT_PALETTE[colorKey] || SUIT_PALETTE.cyan;
    const isMoving = walkCycle > 0;
    const bob = isMoving ? Math.abs(Math.sin(walkCycle)) * 2.5 : 0;
    const legSwing = isMoving ? Math.sin(walkCycle) * 5.5 : 0;
    const reflector = getFlashlightReflectorOrigin(x, y, aimAngle, bob, facingDir);
    const rDist = reflector.reflectorDist;
    const apertureR = reflector.apertureRadius; // 7.5px exit radius
    const localPivotX = reflector.pivotX - x;
    const localPivotY = reflector.pivotY - y;

    // Helper to draw the free (non-flashlight) side arm on the left side of the torso in 'up' and 'down' views
    const drawLeftSideSwingingArm = (armX: number, swingOffset: number) => {
      ctx.save();
      // Shoulder joint pad
      ctx.fillStyle = palette.main;
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.roundRect(armX - 3.2, -13.5 - bob + swingOffset * 0.35, 6.4, 12.5, 3);
      ctx.fill();
      ctx.stroke();

      // Insulated spacesuit glove at bottom of left arm
      ctx.fillStyle = palette.dark;
      ctx.beginPath();
      ctx.roundRect(armX - 3.0, -3.5 - bob + swingOffset * 0.55, 6.0, 5.5, 2.5);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    // Helper to draw the right-side (or profile-side) articulated flashlight arm & wide-aperture reflector torch
    const drawFlashlightArmAndTorch = (isUpView: boolean = false) => {
      // 1. Torch barrel, flared reflector bell, and exit aperture lens
      //    (In 'up' view, drawn first so the character's body and shoulder naturally occlude the torch held in front!)
      const drawTorchAndForearm = () => {
        ctx.save();
        ctx.translate(localPivotX, localPivotY);
        ctx.rotate(aimAngle);

        // Astronaut glove & forearm holding the torch handle
        ctx.fillStyle = palette.dark;
        ctx.strokeStyle = '#090d16';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.roundRect(0.5, -3.2, Math.max(4, rDist - 9.0), 6.4, 2.5);
        ctx.fill();
        ctx.stroke();

        // Metallic tactical flashlight cylindrical body
        const bodyStart = Math.max(4.0, rDist - 9.5);
        const bodyLen = Math.max(3.8, rDist - 4.2 - bodyStart);
        ctx.fillStyle = '#cbd5e1';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.roundRect(bodyStart, -2.8, bodyLen, 5.6, 1.2);
        ctx.fill();
        ctx.stroke();

        // Wide Flared Parabolic Reflector Bell opening to +/- apertureR (7.5px radius = 15px diameter) at r = rDist
        const bezelStart = rDist - 4.5;
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(bezelStart, -2.8);
        ctx.lineTo(rDist, -apertureR);
        ctx.lineTo(rDist, apertureR);
        ctx.lineTo(bezelStart, 2.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Glowing Wide Front Reflector Exit Aperture Lens right at (rDist, 0) with radius = apertureR
        ctx.fillStyle = '#fef08a';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.ellipse(rDist, 0, 2.2, apertureR - 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      };

      const drawShoulderPad = () => {
        ctx.save();
        ctx.fillStyle = palette.main;
        ctx.strokeStyle = '#090d16';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        const padTopOffset = facingDir === 'left' || facingDir === 'right' ? -4.2 : -6.5;
        const padHeight = facingDir === 'left' || facingDir === 'right' ? 9.5 : 10.5;
        ctx.roundRect(localPivotX - 3.2, localPivotY + padTopOffset, 6.4, padHeight, 3);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };

      if (isUpView) {
        drawTorchAndForearm();
        drawShoulderPad();
      } else {
        drawShoulderPad();
        drawTorchAndForearm();
      }
    };

    ctx.save();
    ctx.translate(x, y);

    // Subtle illuminated floor pool directly under Daniil's boots
    const underGlow = ctx.createRadialGradient(0, 6, 2, 0, 6, 36);
    underGlow.addColorStop(0, 'rgba(224, 242, 254, 0.22)');
    underGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = underGlow;
    ctx.beginPath();
    ctx.arc(0, 6, 36, 0, Math.PI * 2);
    ctx.fill();

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (facingDir === 'up') {
      // =======================================================================
      // UP VIEW (Walking North / Back View — TWO Symmetrical Side Arms: Left at -14.5, Right at +13.5 holding Torch)
      // Torch is drawn first (underneath torso & helmet), and Daniil himself is on the layer above the flashlight glow!
      // =======================================================================
      // 1. Right-side arm holding the flashlight forward (northward, occluded by Daniil's body)
      drawFlashlightArmAndTorch(true);
      // 2. Left-side arm swinging naturally on the left side of the torso
      drawLeftSideSwingingArm(-14.5, legSwing);

      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 2.4;

      // Left & Right Boots stepping alternately up/down from behind
      ctx.fillStyle = palette.dark;
      ctx.beginPath();
      ctx.roundRect(-9.5, 4 - bob - legSwing * 0.55, 7.5, 11, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = palette.dark;
      ctx.beginPath();
      ctx.roundRect(2, 4 - bob + legSwing * 0.55, 7.5, 11, 3);
      ctx.fill();
      ctx.stroke();

      // Suit Torso & Helmet (Back silhouette: width = 25, x = -12.5..+12.5)
      ctx.fillStyle = palette.main;
      ctx.beginPath();
      ctx.roundRect(-12.5, -22 - bob, 25, 29, [12, 12, 5, 5]);
      ctx.fill();
      ctx.stroke();

      // Rear Helmet Neck Collar Seam
      ctx.strokeStyle = palette.dark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -13 - bob, 9.5, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();

      // Centered 2.5D Oxygen & Life-Support Backpack mounted squarely on the back (width = 19 < torso 25)
      ctx.fillStyle = palette.dark;
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.roundRect(-9.5, -14 - bob, 19, 19, 4);
      ctx.fill();
      ctx.stroke();

      // Twin Vertical Oxygen Cylinders & Telemetry LED on the Back Pack
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.fillRect(-6.5, -11 - bob, 5, 13);
      ctx.fillRect(1.5, -11 - bob, 5, 13);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-3, -12.5 - bob, 6, 2.2);
    } else if (facingDir === 'down') {
      // =======================================================================
      // DOWN VIEW (Walking South / Front View):
      // - Narrow backpack tucked behind upper shoulders (width = 18px < torso 25px, NEVER sticking out on the sides!)
      // - TWO symmetrical arms on the left (-14.5) and right (+13.5) sides of the torso!
      // - Clean suit front torso (no belly gadgets/straps)
      // =======================================================================
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 2.4;

      // Narrow top cap of oxygen backpack behind upper shoulders (width = 18px, x = -9..+9, strictly inside 25px torso)
      ctx.fillStyle = palette.dark;
      ctx.beginPath();
      ctx.roundRect(-9, -24.5 - bob, 18, 7, 3);
      ctx.fill();
      ctx.stroke();

      // Left-side swinging arm on the left edge of the torso (-14.5)
      drawLeftSideSwingingArm(-14.5, -legSwing);

      // Left & Right Front Boots stepping toward the camera
      ctx.fillStyle = palette.dark;
      ctx.beginPath();
      ctx.roundRect(-9.5, 4 - bob + legSwing * 0.55, 7.5, 11, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = palette.main;
      ctx.beginPath();
      ctx.roundRect(2, 4 - bob - legSwing * 0.55, 7.5, 11, 3);
      ctx.fill();
      ctx.stroke();

      // Clean Symmetric Front Suit Body (width = 25px, x = -12.5..+12.5, no belly packs)
      ctx.fillStyle = palette.main;
      ctx.beginPath();
      ctx.roundRect(-12.5, -22 - bob, 25, 29, [12, 12, 5, 5]);
      ctx.fill();
      ctx.stroke();

      // Centered Panoramic Glass Visor
      ctx.fillStyle = palette.visor;
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.roundRect(-9.5, -17.5 - bob, 19, 10.5, 5);
      ctx.fill();
      ctx.stroke();

      // Curved specular visor reflection highlight
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(-2.5, -14.5 - bob, 5, 1.8, -0.1, 0, Math.PI * 2);
      ctx.fill();

      // Right-side arm (+13.5) holding the wide-aperture tactical flashlight
      drawFlashlightArmAndTorch(false);
    } else {
      // =======================================================================
      // LEFT / RIGHT SIDE PROFILE VIEW
      // Visor is on the front-upper head (x: 0..+13.5, y: -17.5..-8.0 in scaled profile space),
      // while the shoulder is shifted to the side/back of the torso (localPivotX = -4.5 * facing, y: -7.7..+1.8)
      // so the shoulder NEVER comes out of the visor!
      // =======================================================================
      ctx.save();
      ctx.scale(facing, 1);

      // Backpack on rear edge
      ctx.fillStyle = palette.dark;
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-18, -16 - bob, 8, 20, 4);
      ctx.fill();
      ctx.stroke();

      // Left & Right Legs striding horizontally
      ctx.fillStyle = palette.dark;
      ctx.beginPath();
      ctx.roundRect(-9 + legSwing, 4 - bob, 7, 11, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = palette.main;
      ctx.beginPath();
      ctx.roundRect(2 - legSwing, 4 - bob, 7, 11, 3);
      ctx.fill();
      ctx.stroke();

      // Suit Body
      ctx.fillStyle = palette.main;
      ctx.beginPath();
      ctx.roundRect(-12, -22 - bob, 24, 29, [12, 12, 5, 5]);
      ctx.fill();
      ctx.stroke();

      // Side-facing Visor on front-upper helmet (x = 0..+13.5, y = -17.5..-8.0)
      ctx.fillStyle = palette.visor;
      ctx.beginPath();
      ctx.roundRect(0, -17.5 - bob, 13.5, 9.5, 4.5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(6.5, -14.5 - bob, 3.8, 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Articulated Tactical Flashlight Arm & Torch (shoulder shifted to localPivotX = -4.5 * facing, behind the visor)
      drawFlashlightArmAndTorch(false);
    }

    ctx.restore();
  };

  const nearbyRoomInfo =
    nearbyTerminal !== null ? SHIP_ROOMS.find((r) => r.taskIndex === nearbyTerminal) : null;
  const nearbyDoorInfo =
    nearbyDoor !== null ? SHIP_DOORS.find((d) => d.doorId === nearbyDoor) : null;
  const canUse = nearbyDoor !== null || nearbyTerminal !== null;

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-[#030509]">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onWheel={handleWheel}
        className="block w-full h-full cursor-crosshair"
      />

      {/* Among Us style USE [E] button in bottom-right corner */}
      <div className="fixed bottom-5 right-5 z-30 flex items-center gap-3">
        <button
          disabled={!canUse}
          onClick={() => {
            if (nearbyDoor !== null) {
              sound.playTerminalClick();
              onOpenDoor(nearbyDoor);
            } else if (nearbyTerminal !== null) {
              sound.playTerminalClick();
              onOpenTask(nearbyTerminal);
            }
          }}
          className={`group relative flex flex-col items-center justify-center w-24 h-24 rounded-full border-4 font-mono transition-all ${
            canUse
              ? 'border-amber-400 bg-amber-500/20 text-amber-300 shadow-lg shadow-amber-500/30 scale-105 cursor-pointer hover:bg-amber-500/30'
              : 'border-slate-800 bg-slate-950/60 text-slate-600 opacity-60 cursor-not-allowed'
          }`}
        >
          <span className="text-base font-black tracking-wider uppercase">USE</span>
          <span className="text-[10px] font-bold tracking-widest mt-0.5">
            {nearbyDoor !== null
              ? `[E] ДВЕРЬ ${nearbyDoor}`
              : nearbyTerminal !== null
              ? nearbyTerminal === 6
                ? '[E] КЛЮЧ'
                : `[E] УЗЕЛ ${nearbyTerminal}`
              : 'ПОДОЙДИТЕ'}
          </span>
          {(nearbyDoorInfo || nearbyRoomInfo) && (
            <div className="absolute -top-9 right-0 whitespace-nowrap bg-slate-950/95 border border-amber-500/50 px-2.5 py-1 rounded text-[10px] text-amber-300 font-mono shadow-lg">
              {nearbyDoorInfo ? nearbyDoorInfo.name : nearbyRoomInfo?.name}
            </div>
          )}
        </button>
      </div>
    </div>
  );
};
