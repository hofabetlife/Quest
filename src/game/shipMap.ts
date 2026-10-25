import type { DoorId, RoomInfo } from '../types.ts';

export interface Rect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  name?: string;
  color?: string;
  isCorridor?: boolean;
  shape?: 'rect' | 'circle';
  cx?: number;
  cy?: number;
  r?: number;
}

export interface CircleObstacle {
  x: number;
  y: number;
  r: number;
  label?: string;
}

export interface RectObstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

export interface ShipDoor {
  doorId: DoorId;
  roomId: string;
  name: string;
  puzzleTitle: string;
  orientation: 'vertical' | 'horizontal';
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  standX: number;
  standY: number;
  color: string;
}

export const WORLD_WIDTH = 2400;
export const WORLD_HEIGHT = 1840;

// Player spawns in the open south-center of Cafeteria, well clear of the central table
export const PLAYER_SPAWN = { x: 1200, y: 880 };

export const SHIP_ROOMS: RoomInfo[] = [
  {
    id: 'cockpit',
    name: 'Выставка Авиации // Электросистема',
    taskIndex: 1,
    terminalX: 310,
    terminalY: 360,
    color: '#f0b90b',
    description: 'Выставка авиации, чертежи и электросистема B737',
  },
  {
    id: 'navigation',
    name: 'Топливный Отсек // Переработка Топлива',
    taskIndex: 2,
    terminalX: 2090,
    terminalY: 360,
    color: '#38bdf8',
    description: 'Отдел хранения и переработки топлива, дешифратор и АЗС',
  },
  {
    id: 'rover_bay',
    name: 'Ангар Ровера // Планетоход',
    taskIndex: 3,
    terminalX: 330,
    terminalY: 1290,
    color: '#00ff9d',
    description: 'Ангар планетохода, стенд плат робототехники и маршрут',
  },
  {
    id: 'reactor',
    name: 'Зал Токамака // Холодный Синтез',
    taskIndex: 4,
    terminalX: 2080,
    terminalY: 1360,
    color: '#ff4757',
    description: 'Панель управления Токамаком и холодный ядерный синтез',
  },
  {
    id: 'airlock',
    name: 'Астрокупол // Спектр Звёзд',
    taskIndex: 5,
    terminalX: 1200,
    terminalY: 165,
    color: '#facc15',
    description: 'Спектральная классификация звёзд и поиск кодового слова',
  },
  {
    id: 'central_core',
    name: 'Командный Центр // Синтез Ключа',
    taskIndex: 6,
    terminalX: 1200,
    terminalY: 740,
    color: '#22d3ee',
    description: 'Сборка финального мастер-ключа в главном командном центре',
  },
];

// Walkable deck areas (overlapping zones form the interconnected spaceship deck; Room 5 airlock is a circular observatory dome)
export const WALKABLE_ZONES: Rect[] = [
  // 1. Central Command Center & Server Core (Hub)
  { id: 'cafeteria', x: 920, y: 580, w: 560, h: 440, name: 'КОМАНДНЫЙ ЦЕНТР // СЕРВЕРНОЕ ЯДРО', color: '#38bdf8' },

  // 2. North Corridor -> Circular Observation Dome (Node 5)
  { id: 'corridor_north', x: 1110, y: 280, w: 180, h: 360, isCorridor: true },
  {
    id: 'airlock',
    x: 1025,
    y: 35,
    w: 350,
    h: 350,
    shape: 'circle',
    cx: 1200,
    cy: 210,
    r: 175,
    name: 'АСТРОКУПОЛ // СМОТРОВАЯ СФЕРА',
    color: '#facc15',
  },

  // 3. West Upper Corridor -> Cockpit / Aviation Exhibition (Node 1)
  { id: 'corridor_nw_horiz', x: 760, y: 660, w: 200, h: 140, isCorridor: true },
  { id: 'medbay_hub', x: 560, y: 340, w: 240, h: 940, name: 'ЗАПАДНЫЙ ТРАНЗИТ // КРИО-ШЛЮЗ', color: '#2dd4bf' },
  { id: 'corridor_cockpit', x: 440, y: 340, w: 180, h: 160, isCorridor: true },
  { id: 'cockpit', x: 140, y: 200, w: 360, h: 380, name: 'ВЫСТАВКА АВИАЦИИ И АВИОНИКИ B737', color: '#f0b90b' },

  // 4. West Lower Corridor -> Planetary Rover & Robotics Bay (Node 3)
  { id: 'corridor_rover', x: 440, y: 1100, w: 180, h: 160, isCorridor: true },
  { id: 'rover_bay', x: 140, y: 1020, w: 360, h: 420, name: 'АНГАР ПЛАНЕТОХОДА И РОБОТОТЕХНИКИ', color: '#00ff9d' },

  // 5. East Upper Corridor -> Fuel Storage & Processing Department (Node 2)
  { id: 'corridor_ne_horiz', x: 1440, y: 660, w: 200, h: 140, isCorridor: true },
  { id: 'shields_hub', x: 1600, y: 340, w: 240, h: 940, name: 'ВОСТОЧНЫЙ ТРАНЗИТ // ЭНЕРГОЩИТЫ', color: '#a855f7' },
  { id: 'corridor_nav', x: 1780, y: 340, w: 180, h: 160, isCorridor: true },
  { id: 'navigation', x: 1900, y: 200, w: 360, h: 380, name: 'ОТДЕЛ ХРАНЕНИЯ И ПЕРЕРАБОТКИ ТОПЛИВА', color: '#38bdf8' },

  // 6. East Lower Corridor -> Reactor (Node 4)
  { id: 'corridor_reactor', x: 1780, y: 1100, w: 180, h: 160, isCorridor: true },
  { id: 'reactor', x: 1900, y: 1020, w: 360, h: 420, name: 'УПРАВЛЕНИЕ ТОКАМАКОМ // ХОЛОДНЫЙ СИНТЕЗ', color: '#ff4757' },

  // 7. South Storage & Engine Walkway connecting West & East lower decks
  { id: 'corridor_south_vert', x: 1110, y: 960, w: 180, h: 320, isCorridor: true },
  { id: 'storage', x: 560, y: 1140, w: 1280, h: 140, name: 'ИНЖЕНЕРНЫЙ ТРАНЗИТ // ДВИГАТЕЛИ', color: '#94a3b8' },

  // 8. Southern Medical Department & Bio-Regeneration Bay (Bottom Center of the Ship)
  { id: 'corridor_medbay_south', x: 1110, y: 1240, w: 180, h: 120, isCorridor: true },
  {
    id: 'medbay_south',
    x: 880,
    y: 1340,
    w: 640,
    h: 340,
    name: 'МЕДИЦИНСКОЕ ОТДЕЛЕНИЕ // ЛАЗАРЕТ И БИОЛАБ',
    color: '#2dd4bf',
  },
];

// Circular volumetric obstacles that the player collides with
export const OBSTACLES: CircleObstacle[] = [
  // Central Master Key Synthesis Core in Cafeteria (Player spawns at 1200, 880 — 140px away!)
  { x: 1200, y: 740, r: 42, label: 'Центральный терминал синтеза ключа' },
  // High-detail 2.5D Rover vehicle parked in Rover Bay (Room 3)
  { x: 245, y: 1120, r: 44, label: 'Тяжёлый планетоход' },
  // Central Tokamak Cold Fusion Reactor in the center of Room 4 (2080, 1215)
  { x: 2080, y: 1215, r: 46, label: 'Токамак холодного ядерного синтеза' },
  // Central Robotic Surgical & MRI Scanner Pod in the Southern Medical Department (1200, 1525)
  { x: 1200, y: 1525, r: 44, label: 'Хирургический МРТ-томограф и автодок' },
  // Room 1 Scale Aircraft Model Pedestals (Boeing 737-800, Concorde/Tu-144, Biplane)
  { x: 196, y: 312, r: 26, label: 'Пьедестал модели Boeing 737-800' },
  { x: 204, y: 512, r: 25, label: 'Пьедестал сверхзвукового лайнера' },
  { x: 446, y: 512, r: 24, label: 'Пьедестал модели биплана' },
  // Room 5 Optical Refracting Telescope Mounts on West and East sides of the circular Astro-Dome
  { x: 1076, y: 238, r: 18, label: 'Западный телескоп астрокупола' },
  { x: 1324, y: 238, r: 18, label: 'Восточный телескоп астрокупола' },
  // Interactive Task Consoles
  ...SHIP_ROOMS.filter((rm) => rm.id !== 'central_core').map((rm) => ({
    x: rm.terminalX,
    y: rm.terminalY,
    r: 18,
    label: rm.name,
  })),
];

// Rectangular 2.5D volumetric furniture, server racks, tanks, consoles, beds, and workbenches that block player movement
export const PROP_COLLIDERS: RectObstacle[] = [
  // 1. CENTRAL COMMAND CENTER: NW & NE Quantum Server Clusters, West/East Telemetry Mainframes, SW & SE Tactical Command Desks
  { x: 920, y: 580, w: 138, h: 74, label: 'Северо-западный серверный кластер' },
  { x: 1342, y: 580, w: 138, h: 74, label: 'Северо-восточный серверный кластер' },
  { x: 920, y: 810, w: 46, h: 66, label: 'Западная стойка телеметрии' },
  { x: 1434, y: 810, w: 46, h: 66, label: 'Восточная стойка телеметрии' },
  { x: 944, y: 896, w: 124, h: 76, label: 'Левый тактический пульт управления' },
  { x: 1332, y: 896, w: 124, h: 76, label: 'Правый тактический пульт управления' },

  // 2. ROOM 1 (AVIATION & AVIONICS EXHIBITION): Blueprint Stands, Drafting/Turbofan Table, West Avionics Rack
  { x: 148, y: 200, w: 164, h: 48, label: 'Стенд чертежей B737' },
  { x: 326, y: 200, w: 162, h: 48, label: 'Стенд электросхемы B737' },
  { x: 256, y: 492, w: 150, h: 56, label: 'Чертёжный стол и макет турбореактивного двигателя' },
  { x: 148, y: 366, w: 38, h: 92, label: 'Стойка авионики и бортовой самописец' },

  // 3. ROOM 2 (FUEL STORAGE & PROCESSING DEPARTMENT): Cryo Fuel Silos, Header Manifold, Distillation Reactor, Pump Station, Fuel Drum Rack
  { x: 1930, y: 200, w: 164, h: 68, label: 'Криогенные силосы хранения топлива D2 и N2H4' },
  { x: 2110, y: 200, w: 134, h: 62, label: 'Коллектор высокого давления' },
  { x: 2154, y: 280, w: 94, h: 148, label: 'Реактор ректификации и очистки топлива' },
  { x: 2154, y: 444, w: 94, h: 118, label: 'Насосная станция перекачки топлива' },
  { x: 1940, y: 516, w: 184, h: 50, label: 'Стеллаж бочек с ракетным топливом' },

  // 4. ROOM 3 (PLANETARY ROVER & ROBOTICS BAY): Rover Chassis Box, North Charging/Lidar Rack, West PCB Workbench, SE Spare Parts Rack
  { x: 196, y: 1086, w: 98, h: 68, label: 'Корпус планетохода' },
  { x: 344, y: 1020, w: 142, h: 60, label: 'Станция зарядки и калибровки лидара ровера' },
  { x: 148, y: 1222, w: 94, h: 192, label: 'Верстак робототехники с платами и манипулятором' },
  { x: 404, y: 1280, w: 84, h: 138, label: 'Стеллаж запчастей и приводов планетохода' },

  // 5. ROOM 4 (TOKAMAK CONTROL ROOM): North Telemetry Mainframe, East Cryo Rack, West Dosimetry Console, South Master Command Desk
  { x: 1924, y: 1020, w: 312, h: 62, label: 'Северный пульт телеметрии Токамака' },
  { x: 2198, y: 1092, w: 50, h: 250, label: 'Восточная криогенная стойка катушек' },
  { x: 1910, y: 1266, w: 44, h: 126, label: 'Западная консоль инжектора и дозиметрии' },
  { x: 1966, y: 1346, w: 228, h: 86, label: 'Южный главный пульт управления Токамаком' },

  // 6. ROOM 5 (CIRCULAR ASTRO-DOME): NW Spectral Analyzer & NE Radio Interferometer Consoles
  { x: 1068, y: 150, w: 64, h: 36, label: 'Спектрометр астрокупола СЗ' },
  { x: 1268, y: 150, w: 64, h: 36, label: 'Радиоинтерферометр астрокупола СВ' },

  // 7. WEST HUB (Cryo-Transit): 4 Volumetric Cryo-Beds along West Wall (clear of doorways)
  { x: 560, y: 522, w: 94, h: 46, label: 'Криокапсула шлюза 1' },
  { x: 560, y: 602, w: 94, h: 46, label: 'Криокапсула шлюза 2' },
  { x: 560, y: 842, w: 94, h: 46, label: 'Криокапсула шлюза 3' },
  { x: 560, y: 942, w: 94, h: 46, label: 'Криокапсула шлюза 4' },

  // 8. EAST HUB (Shields Transit): 4 Volumetric Shield Capacitor Racks along East Wall (clear of doorways)
  { x: 1755, y: 520, w: 85, h: 52, label: 'Конденсатор энергощита 1' },
  { x: 1755, y: 600, w: 85, h: 52, label: 'Конденсатор энергощита 2' },
  { x: 1755, y: 840, w: 85, h: 52, label: 'Конденсатор энергощита 3' },
  { x: 1755, y: 940, w: 85, h: 52, label: 'Конденсатор энергощита 4' },

  // 9. SOUTHERN MEDICAL DEPARTMENT (medbay_south: x=880..1520, y=1340..1680)
  { x: 880, y: 1340, w: 200, h: 68, label: 'Лаборатория фармакологии и биоцентрифуга' },
  { x: 1320, y: 1340, w: 200, h: 68, label: 'Пульт медицинской диагностики и карантина' },
  { x: 880, y: 1435, w: 135, h: 56, label: 'Медкапсула регенерации З-1' },
  { x: 880, y: 1520, w: 135, h: 58, label: 'Медкапсула регенерации З-2' },
  { x: 1385, y: 1435, w: 135, h: 56, label: 'Медкапсула регенерации В-1' },
  { x: 1385, y: 1520, w: 135, h: 58, label: 'Медкапсула регенерации В-2' },
  { x: 920, y: 1608, w: 200, h: 58, label: 'Криохранилище плазмы и бак-регенератор' },
  { x: 1280, y: 1608, w: 200, h: 58, label: 'Автоклав и стойка медицинского кислорода' },
];

// 5 Armored Bulkhead Doors guarding the 5 Node Rooms (rise vertically upward when unlocked via Among Us mini-puzzles)
export const SHIP_DOORS: ShipDoor[] = [
  {
    doorId: 1,
    roomId: 'cockpit',
    name: 'Гермодверь Узла I (Авиация)',
    puzzleTitle: 'Коммутация проводки шлюза',
    orientation: 'vertical',
    x: 516,
    y: 340,
    w: 24,
    h: 160,
    cx: 528,
    cy: 420,
    standX: 568,
    standY: 420,
    color: '#f0b90b',
  },
  {
    doorId: 2,
    roomId: 'navigation',
    name: 'Гермодверь Узла II (Топливный отсек)',
    puzzleTitle: 'Разблокировка коллектора',
    orientation: 'vertical',
    x: 1860,
    y: 340,
    w: 24,
    h: 160,
    cx: 1872,
    cy: 420,
    standX: 1832,
    standY: 420,
    color: '#38bdf8',
  },
  {
    doorId: 3,
    roomId: 'rover_bay',
    name: 'Гермодверь Узла III (Ангар ровера)',
    puzzleTitle: 'Считыватель ключ-карты доступа',
    orientation: 'vertical',
    x: 516,
    y: 1100,
    w: 24,
    h: 160,
    cx: 528,
    cy: 1180,
    standX: 568,
    standY: 1180,
    color: '#00ff9d',
  },
  {
    doorId: 4,
    roomId: 'reactor',
    name: 'Гермодверь Узла IV (Зал Токамака)',
    puzzleTitle: 'Питание привода гермодвери',
    orientation: 'vertical',
    x: 1860,
    y: 1100,
    w: 24,
    h: 160,
    cx: 1872,
    cy: 1180,
    standX: 1832,
    standY: 1180,
    color: '#ff4757',
  },
  {
    doorId: 5,
    roomId: 'airlock',
    name: 'Гермодверь Узла V (Астрокупол)',
    puzzleTitle: 'Стабилизация контура шлюза',
    orientation: 'horizontal',
    x: 1110,
    y: 440,
    w: 180,
    h: 24,
    cx: 1200,
    cy: 452,
    standX: 1200,
    standY: 492,
    color: '#facc15',
  },
];

export function isPointInClosedDoor(
  px: number,
  py: number,
  closedDoorIds?: ReadonlySet<number>
): boolean {
  if (!closedDoorIds || closedDoorIds.size === 0) return false;
  for (const door of SHIP_DOORS) {
    if (closedDoorIds.has(door.doorId)) {
      if (px >= door.x && px <= door.x + door.w && py >= door.y && py <= door.y + door.h) {
        return true;
      }
    }
  }
  return false;
}

/**
 * If (wx, wy) lies inside one of the 5 Node rooms (or on its closed door) while that room's door is closed,
 * returns the corresponding ShipDoor so click-to-move can walk Daniil right up to the door panel.
 */
export function getDoorBlockingRoomAt(
  wx: number,
  wy: number,
  closedDoorIds?: ReadonlySet<number>
): ShipDoor | null {
  if (!closedDoorIds || closedDoorIds.size === 0) return null;
  for (const door of SHIP_DOORS) {
    if (!closedDoorIds.has(door.doorId)) continue;
    if (door.doorId === 1 && wx <= 540 && wy >= 200 && wy <= 580) return door;
    if (door.doorId === 2 && wx >= 1860 && wy >= 200 && wy <= 580) return door;
    if (door.doorId === 3 && wx <= 540 && wy >= 1020 && wy <= 1440) return door;
    if (door.doorId === 4 && wx >= 1860 && wy >= 1020 && wy <= 1440) return door;
    if (door.doorId === 5 && wy <= 464 && wx >= 1025 && wx <= 1375) return door;
  }
  return null;
}

export function isPointInZone(px: number, py: number, z: Rect): boolean {
  if (z.shape === 'circle' && z.cx !== undefined && z.cy !== undefined && z.r !== undefined) {
    const dx = px - z.cx;
    const dy = py - z.cy;
    return dx * dx + dy * dy <= z.r * z.r;
  }
  return px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h;
}

export function isSinglePointInZones(px: number, py: number): boolean {
  for (const z of WALKABLE_ZONES) {
    if (isPointInZone(px, py, z)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a non-floor point (wx, wy) lies on the 24px vertical 2.5D north wall face directly above walkable floor.
 */
function isPointOnNorthWallFace(wx: number, wy: number): boolean {
  for (let dh = 3; dh <= 24; dh += 3.5) {
    const fy = wy + dh;
    if (
      isSinglePointInZones(wx, fy) &&
      isSinglePointInZones(wx - 2.5, fy) &&
      isSinglePointInZones(wx + 2.5, fy)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Raycasts from (originX, originY) along `angle` up to `maxDist`.
 * Uses fine 2px stepping + binary search so rays never skip across wall corners,
 * and smoothly illuminates 2.5D north wall faces (including across doorway corners) without spikes or steps.
 */
export function castLightRay(
  originX: number,
  originY: number,
  angle: number,
  maxDist: number,
  closedDoorIds?: ReadonlySet<number>
): { x: number; y: number; dist: number; hitWall: boolean } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const step = 2;

  const isRayFloorOpen = (px: number, py: number) =>
    isSinglePointInZones(px, py) && !isPointInClosedDoor(px, py, closedDoorIds);

  let lastInsideD = 0;
  for (let d = step; d <= maxDist; d += step) {
    const px = originX + cos * d;
    const py = originY + sin * d;

    if (!isRayFloorOpen(px, py)) {
      // High-precision binary search between lastInsideD and d for exact floor/door boundary
      let lo = lastInsideD;
      let hi = d;
      for (let iter = 0; iter < 7; iter++) {
        const mid = (lo + hi) * 0.5;
        if (isRayFloorOpen(originX + cos * mid, originY + sin * mid)) {
          lo = mid;
        } else {
          hi = mid;
        }
      }

      // Advance into the 2.5D wall bezel (3.5px on all walls), and smoothly up any 2.5D north wall face
      // as long as (wx, wy) remains on the vertical wall panel above walkable floor.
      let extra = 3.5;
      if (sin < -0.02) {
        let e = 4;
        while (lo + e <= maxDist && e <= 42) {
          const wx = originX + cos * (lo + e);
          const wy = originY + sin * (lo + e);
          if (!isRayFloorOpen(wx, wy) && isPointOnNorthWallFace(wx, wy)) {
            extra = e;
            e += 1.5;
          } else {
            break;
          }
        }
      }

      const finalDist = Math.min(maxDist, lo + extra);
      return {
        x: originX + cos * finalDist,
        y: originY + sin * finalDist,
        dist: finalDist,
        hitWall: true,
      };
    }
    lastInsideD = d;
  }

  return {
    x: originX + cos * maxDist,
    y: originY + sin * maxDist,
    dist: maxDist,
    hitWall: false,
  };
}

export interface CharacterLayoutMetrics {
  torsoWidth: number;
  backpackWidth: number;
  leftArmX: number;
  rightArmX: number;
  hasTwoSideArms: boolean;
  visorRangeX?: [number, number];
  shoulderPivotX?: number;
}

/**
 * Returns the astronaut geometry proportions for a given facing direction:
 * - In 'down' view, the backpack behind the shoulders is strictly narrower (18px) than the torso (25px)
 *   so it never protrudes wider than the character on the sides.
 * - In 'up' and 'down' views, the character has TWO distinct arms on the left (-14.5px) and right (+13.5px)
 *   sides of the torso (never a single arm in the middle of the body).
 * - In 'left' and 'right' profile views, the shoulder is shifted toward the rear-side of the torso
 *   (-4.5px when facing right, +4.5px when facing left) so it NEVER comes out of the front visor!
 */
export function getCharacterLayoutMetrics(
  facingDir: 'up' | 'down' | 'left' | 'right'
): CharacterLayoutMetrics {
  if (facingDir === 'down') {
    return {
      torsoWidth: 25,
      backpackWidth: 18,
      leftArmX: -14.5,
      rightArmX: 13.5,
      hasTwoSideArms: true,
    };
  }
  if (facingDir === 'up') {
    return {
      torsoWidth: 25,
      backpackWidth: 19,
      leftArmX: -14.5,
      rightArmX: 13.5,
      hasTwoSideArms: true,
    };
  }
  if (facingDir === 'right') {
    return {
      torsoWidth: 24,
      backpackWidth: 8,
      leftArmX: -4.5,
      rightArmX: -4.5,
      hasTwoSideArms: false,
      visorRangeX: [0, 13.5],
      shoulderPivotX: -4.5,
    };
  }
  return {
    torsoWidth: 24,
    backpackWidth: 8,
    leftArmX: 4.5,
    rightArmX: 4.5,
    hasTwoSideArms: false,
    visorRangeX: [-13.5, 0],
    shoulderPivotX: 4.5,
  };
}

export const FLASHLIGHT_APERTURE_RADIUS = 7.5;

/**
 * Computes the exact world coordinates of the front reflector exit aperture of Daniil's held flashlight,
 * plus the side-arm shoulder/hand pivot where the flashlight is held.
 * - When walking up or down, Daniil holds the flashlight in his right-side hand (px + 13.5), not in the center!
 * - When looking left or right, the shoulder pivot is shifted to the side of the torso behind the visor
 *   (-4.5 when facing right, +4.5 when facing left) so the shoulder never emerges from the visor!
 * - Also performs a wall safety check so the reflector never pokes inside a solid wall.
 */
export function getFlashlightReflectorOrigin(
  px: number,
  py: number,
  aimAngle: number,
  bob: number = 0,
  facingDir?: 'up' | 'down' | 'left' | 'right'
): {
  x: number;
  y: number;
  pivotX: number;
  pivotY: number;
  reflectorDist: number;
  apertureRadius: number;
} {
  const cos = Math.cos(aimAngle);
  const sin = Math.sin(aimAngle);

  const resolvedFacing: 'up' | 'down' | 'left' | 'right' =
    facingDir ??
    (Math.abs(sin) > Math.abs(cos) * 1.05
      ? sin < 0
        ? 'up'
        : 'down'
      : cos < 0
      ? 'left'
      : 'right');

  let desiredOffsetX = 0;
  let desiredOffsetY = -5.5;
  let desiredDist = 15.0;

  if (resolvedFacing === 'up' || resolvedFacing === 'down') {
    desiredOffsetX = 13.5; // Right-side arm holds the flashlight
    desiredOffsetY = -5.5;
    desiredDist = 15.0;
  } else if (resolvedFacing === 'right') {
    // Shifted to the side/back of the torso (-4.5), completely behind the front visor [0..+13.5]
    desiredOffsetX = -4.5;
    desiredOffsetY = -3.5;
    desiredDist = 21.5;
  } else {
    // Shifted to the side/back of the torso (+4.5), completely behind the front visor [-13.5..0]
    desiredOffsetX = 4.5;
    desiredOffsetY = -3.5;
    desiredDist = 21.5;
  }

  let pivotX = px + desiredOffsetX;
  const pivotY = py + desiredOffsetY - bob * 0.5;
  if (!isSinglePointInZones(pivotX, pivotY)) {
    pivotX = px;
  }

  // Ensure the line from hand pivot to the flashlight reflector doesn't cross a solid wall boundary
  let safeDist = desiredDist;
  for (let d = 2; d <= desiredDist; d += 1.5) {
    if (!isSinglePointInZones(pivotX + cos * d, pivotY + sin * d)) {
      safeDist = Math.max(2, d - 2);
      break;
    }
  }

  return {
    x: pivotX + cos * safeDist,
    y: pivotY + sin * safeDist,
    pivotX,
    pivotY,
    reflectorDist: safeDist,
    apertureRadius: FLASHLIGHT_APERTURE_RADIUS,
  };
}

/**
 * Computes a high-resolution polygon of points for a directional or 360° light cone clipped by ship walls.
 * For a directional flashlight cone, the near base of the beam is CUT OFF FLAT across the full diameter
 * of the flashlight's exit aperture (`2 * apertureRadius = 15px`), so light emerges from the entire circular
 * opening of the reflector (a truncated cone / frustum) rather than from a sharp single point!
 */
export function computeLightConePolygon(
  originX: number,
  originY: number,
  centerAngle: number,
  halfSpread: number,
  maxDist: number,
  numRays: number = 160,
  apertureRadius: number = FLASHLIGHT_APERTURE_RADIUS,
  closedDoorIds?: ReadonlySet<number>
): { x: number; y: number }[] {
  const isFullCircle = halfSpread >= Math.PI - 0.001;
  const pts: { x: number; y: number }[] = [];

  const perpUnitX = -Math.sin(centerAngle);
  const perpUnitY = Math.cos(centerAngle);

  // Helper to get a safe point along the reflector exit aperture segment [-apertureRadius .. +apertureRadius]
  const getAperturePoint = (s: number) => {
    const targetOffset = s * apertureRadius;
    const ax = originX + perpUnitX * targetOffset;
    const ay = originY + perpUnitY * targetOffset;
    if (isSinglePointInZones(ax, ay) && !isPointInClosedDoor(ax, ay, closedDoorIds)) {
      return { x: ax, y: ay };
    }
    return { x: originX, y: originY };
  };

  if (!isFullCircle) {
    // Near base starts at the s = -1 rim of the flashlight exit aperture
    pts.push(getAperturePoint(-1));
  }

  const startAngle = centerAngle - halfSpread;
  const stepAngle = (halfSpread * 2) / numRays;

  for (let i = 0; i <= numRays; i++) {
    const u = i / numRays;
    const a = startAngle + i * stepAngle;
    if (!isFullCircle) {
      const s = (u - 0.5) * 2; // -1 at startAngle to +1 at endAngle
      const rayStart = getAperturePoint(s);
      const hit = castLightRay(rayStart.x, rayStart.y, a, maxDist, closedDoorIds);
      pts.push({ x: hit.x, y: hit.y });
    } else {
      const hit = castLightRay(originX, originY, a, maxDist, closedDoorIds);
      pts.push({ x: hit.x, y: hit.y });
    }
  }

  if (!isFullCircle) {
    // Near base closes at the s = +1 rim of the flashlight exit aperture
    pts.push(getAperturePoint(1));
  }

  return pts;
}

// True union-of-rectangles check: a circle is inside the ship deck if its center and 8 perimeter points are each inside at least one walkable zone
export function isPointInWalkableZone(x: number, y: number, radius: number = 14): boolean {
  if (!isSinglePointInZones(x, y)) return false;
  if (radius <= 0) return true;

  const d = radius * 0.7071;
  const offsets = [
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
    [d, d],
    [d, -d],
    [-d, d],
    [-d, -d],
  ];

  for (const [ox, oy] of offsets) {
    if (!isSinglePointInZones(x + ox, y + oy)) {
      return false;
    }
  }
  return true;
}

export function isPassablePoint(
  x: number,
  y: number,
  radius: number = 14,
  closedDoorIds?: ReadonlySet<number>
): boolean {
  if (!isPointInWalkableZone(x, y, radius)) {
    return false;
  }
  for (const obs of OBSTACLES) {
    const dist = Math.hypot(x - obs.x, y - obs.y);
    if (dist < obs.r + radius) {
      return false;
    }
  }
  for (const rect of PROP_COLLIDERS) {
    const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
    const dist = Math.hypot(x - closestX, y - closestY);
    if (dist < radius) {
      return false;
    }
  }
  if (closedDoorIds && closedDoorIds.size > 0) {
    for (const door of SHIP_DOORS) {
      if (closedDoorIds.has(door.doorId)) {
        const closestX = Math.max(door.x, Math.min(x, door.x + door.w));
        const closestY = Math.max(door.y, Math.min(y, door.y + door.h));
        const dist = Math.hypot(x - closestX, y - closestY);
        if (dist < radius) {
          return false;
        }
      }
    }
  }
  return true;
}

// Smooth collision resolution with wall-sliding and corner-nudging against walls, circular obstacles, 2.5D rectangular props, and closed bulkhead doors
export function resolveCollision(
  x: number,
  y: number,
  dx: number,
  dy: number,
  speed: number,
  radius: number = 14,
  closedDoorIds?: ReadonlySet<number>
): { x: number; y: number } {
  const nextX = x + dx * speed;
  const nextY = y + dy * speed;

  if (isPassablePoint(nextX, nextY, radius, closedDoorIds)) {
    return { x: nextX, y: nextY };
  }
  // Slide horizontally
  if (dx !== 0 && isPassablePoint(nextX, y, radius, closedDoorIds)) {
    return { x: nextX, y };
  }
  // Slide vertically
  if (dy !== 0 && isPassablePoint(x, nextY, radius, closedDoorIds)) {
    return { x, y: nextY };
  }

  // Try diagonal and perpendicular nudge angles around obstacle corners
  const angles = [0.32, -0.32, 0.65, -0.65, 1.0, -1.0, 1.35, -1.35, 1.57, -1.57];
  const baseAngle = Math.atan2(dy, dx);
  for (const aOffset of angles) {
    const a = baseAngle + aOffset;
    const scale = Math.abs(aOffset) <= 0.7 ? 0.85 : 0.65;
    const tx = x + Math.cos(a) * (speed * scale);
    const ty = y + Math.sin(a) * (speed * scale);
    if (isPassablePoint(tx, ty, radius, closedDoorIds)) {
      return { x: tx, y: ty };
    }
  }

  // If ever inside a circular obstacle, push outward
  for (const obs of OBSTACLES) {
    const dist = Math.hypot(x - obs.x, y - obs.y);
    if (dist < obs.r + radius) {
      const nx = dist > 0.01 ? (x - obs.x) / dist : 0;
      const ny = dist > 0.01 ? (y - obs.y) / dist : 1;
      return {
        x: obs.x + nx * (obs.r + radius + 2),
        y: obs.y + ny * (obs.r + radius + 2),
      };
    }
  }

  // Check rectangular colliders and closed doors for outward push
  const activeRects: { x: number; y: number; w: number; h: number }[] = [...PROP_COLLIDERS];
  if (closedDoorIds && closedDoorIds.size > 0) {
    for (const door of SHIP_DOORS) {
      if (closedDoorIds.has(door.doorId)) {
        activeRects.push(door);
      }
    }
  }

  for (const rect of activeRects) {
    const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
    const dist = Math.hypot(x - closestX, y - closestY);
    if (dist < radius) {
      if (dist > 0.01) {
        const nx = (x - closestX) / dist;
        const ny = (y - closestY) / dist;
        return {
          x: closestX + nx * (radius + 2),
          y: closestY + ny * (radius + 2),
        };
      }
      // Deep inside rectangle: push toward nearest edge
      const dLeft = Math.abs(x - rect.x);
      const dRight = Math.abs(rect.x + rect.w - x);
      const dTop = Math.abs(y - rect.y);
      const dBottom = Math.abs(rect.y + rect.h - y);
      const minD = Math.min(dLeft, dRight, dTop, dBottom);
      if (minD === dTop) return { x, y: rect.y - radius - 2 };
      if (minD === dBottom) return { x, y: rect.y + rect.h + radius + 2 };
      if (minD === dLeft) return { x: rect.x - radius - 2, y };
      return { x: rect.x + rect.w + radius + 2, y };
    }
  }

  return { x, y };
}

export function getTerminalStandPoint(room: RoomInfo): { x: number; y: number } {
  if (room.id === 'reactor') {
    return { x: room.terminalX, y: room.terminalY - 46 };
  }
  return { x: room.terminalX, y: room.terminalY + 54 };
}

export function getRoomNameAt(x: number, y: number): string {
  for (const z of WALKABLE_ZONES) {
    if (z.name && isPointInZone(x, y, z)) {
      return z.name;
    }
  }
  return 'ГЕРМОКОРИДОР // МЕЖОТСЕЧНЫЙ ШЛЮЗ';
}

/**
 * Checks if the straight line segment from (x1, y1) to (x2, y2) is completely passable
 * for a circle of `radius` at every sampled point along the segment.
 */
export function isSegmentPassable(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number = 15,
  closedDoorIds?: ReadonlySet<number>
): boolean {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  if (dist < 0.01) return isPassablePoint(x1, y1, radius, closedDoorIds);
  const steps = Math.max(2, Math.ceil(dist / 5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    if (!isPassablePoint(px, py, radius, closedDoorIds)) {
      return false;
    }
  }
  return true;
}

/**
 * If (px, py) is inside an obstacle or wall, finds the nearest passable world point around it.
 */
export function snapToNearestPassablePoint(
  px: number,
  py: number,
  radius: number = 15.5,
  closedDoorIds?: ReadonlySet<number>
): { x: number; y: number } {
  if (isPassablePoint(px, py, radius, closedDoorIds)) {
    return { x: px, y: py };
  }
  for (let r = 6; r <= 180; r += 6) {
    const samples = Math.max(12, Math.floor((2 * Math.PI * r) / 10));
    for (let i = 0; i < samples; i++) {
      const a = (i * Math.PI * 2) / samples;
      const tx = px + Math.cos(a) * r;
      const ty = py + Math.sin(a) * r;
      if (isPassablePoint(tx, ty, radius, closedDoorIds)) {
        return { x: tx, y: ty };
      }
    }
  }
  return { x: px, y: py };
}

const GRID_SIZE = 16;

export function findPathOnShip(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  closedDoorIds?: ReadonlySet<number>
): { x: number; y: number }[] {
  const safeStartPt = snapToNearestPassablePoint(startX, startY, 14.5, closedDoorIds);
  const safeGoalPt = snapToNearestPassablePoint(goalX, goalY, 15.5, closedDoorIds);

  // Fast-path: if straight line from current position to goal is completely unobstructed with safety margin, walk directly
  if (
    Math.hypot(safeGoalPt.x - safeStartPt.x, safeGoalPt.y - safeStartPt.y) <= 140 &&
    isSegmentPassable(safeStartPt.x, safeStartPt.y, safeGoalPt.x, safeGoalPt.y, 16.0, closedDoorIds)
  ) {
    return [{ x: safeGoalPt.x, y: safeGoalPt.y }];
  }

  const cols = Math.ceil(WORLD_WIDTH / GRID_SIZE);
  const rows = Math.ceil(WORLD_HEIGHT / GRID_SIZE);

  const toCell = (px: number, py: number) => ({
    cx: Math.max(0, Math.min(cols - 1, Math.floor(px / GRID_SIZE))),
    cy: Math.max(0, Math.min(rows - 1, Math.floor(py / GRID_SIZE))),
  });

  const toWorld = (cx: number, cy: number) => ({
    x: cx * GRID_SIZE + GRID_SIZE / 2,
    y: cy * GRID_SIZE + GRID_SIZE / 2,
  });

  // Use 15.2px radius for grid cells (1.2px buffer over player's 14px collision radius)
  const isCellValid = (cx: number, cy: number) => {
    const pt = toWorld(cx, cy);
    return isPassablePoint(pt.x, pt.y, 15.2, closedDoorIds);
  };

  let start = toCell(safeStartPt.x, safeStartPt.y);
  let goal = toCell(safeGoalPt.x, safeGoalPt.y);

  const snapToValidCell = (cell: { cx: number; cy: number }, refX: number, refY: number) => {
    if (isCellValid(cell.cx, cell.cy)) return cell;
    let bestDist = Infinity;
    let best = cell;
    for (let dy = -10; dy <= 10; dy++) {
      for (let dx = -10; dx <= 10; dx++) {
        const nx = cell.cx + dx;
        const ny = cell.cy + dy;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && isCellValid(nx, ny)) {
          const wPt = toWorld(nx, ny);
          const d = Math.hypot(wPt.x - refX, wPt.y - refY);
          if (d < bestDist) {
            bestDist = d;
            best = { cx: nx, cy: ny };
          }
        }
      }
    }
    return best;
  };

  start = snapToValidCell(start, safeStartPt.x, safeStartPt.y);
  goal = snapToValidCell(goal, safeGoalPt.x, safeGoalPt.y);

  const key = (cx: number, cy: number) => cy * cols + cx;
  const startKey = key(start.cx, start.cy);
  const goalKey = key(goal.cx, goal.cy);

  if (startKey === goalKey) {
    return [{ x: safeGoalPt.x, y: safeGoalPt.y }];
  }

  // Clearance-aware A* search on the 16px grid
  const gScore = new Float64Array(cols * rows);
  gScore.fill(Infinity);
  const cameFrom = new Int32Array(cols * rows);
  cameFrom.fill(-1);
  const closed = new Uint8Array(cols * rows);

  // Cache cell validity & soft proximity penalty (cells close to obstacles cost slightly more so paths curve cleanly around props)
  const cellState = new Uint8Array(cols * rows); // 0 = uncomputed, 1 = blocked, 2 = valid near wall/prop, 3 = valid with wide clearance
  const getCellState = (cx: number, cy: number): number => {
    const k = cy * cols + cx;
    let st = cellState[k];
    if (st !== 0) return st;
    const pt = toWorld(cx, cy);
    if (!isPassablePoint(pt.x, pt.y, 15.2, closedDoorIds)) {
      st = 1;
    } else if (!isPassablePoint(pt.x, pt.y, 23.0, closedDoorIds)) {
      st = 2; // Valid, but close to an obstacle/wall
    } else {
      st = 3; // Wide clearance
    }
    cellState[k] = st;
    return st;
  };

  const heuristic = (cx: number, cy: number) => {
    const dx = Math.abs(cx - goal.cx);
    const dy = Math.abs(cy - goal.cy);
    return dx + dy + (1.4142 - 2) * Math.min(dx, dy);
  };

  // Binary min-heap for fast A* open set
  const heapKeys: number[] = [];
  const heapF: number[] = [];
  const pushHeap = (k: number, f: number) => {
    heapKeys.push(k);
    heapF.push(f);
    let i = heapKeys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= heapF[i]) break;
      const tk = heapKeys[p];
      const tf = heapF[p];
      heapKeys[p] = heapKeys[i];
      heapF[p] = heapF[i];
      heapKeys[i] = tk;
      heapF[i] = tf;
      i = p;
    }
  };
  const popHeap = (): number => {
    const topK = heapKeys[0];
    const lastK = heapKeys.pop()!;
    const lastF = heapF.pop()!;
    if (heapKeys.length > 0) {
      heapKeys[0] = lastK;
      heapF[0] = lastF;
      let i = 0;
      const n = heapKeys.length;
      while (true) {
        let smallest = i;
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        if (l < n && heapF[l] < heapF[smallest]) smallest = l;
        if (r < n && heapF[r] < heapF[smallest]) smallest = r;
        if (smallest === i) break;
        const tk = heapKeys[i];
        const tf = heapF[i];
        heapKeys[i] = heapKeys[smallest];
        heapF[i] = heapF[smallest];
        heapKeys[smallest] = tk;
        heapF[smallest] = tf;
        i = smallest;
      }
    }
    return topK;
  };

  gScore[startKey] = 0;
  pushHeap(startKey, heuristic(start.cx, start.cy));

  const dirs = [
    [1, 0, 1.0],
    [-1, 0, 1.0],
    [0, 1, 1.0],
    [0, -1, 1.0],
    [1, 1, 1.4142],
    [1, -1, 1.4142],
    [-1, 1, 1.4142],
    [-1, -1, 1.4142],
  ] as const;

  let found = false;

  while (heapKeys.length > 0) {
    const curKey = popHeap();
    if (closed[curKey]) continue;
    closed[curKey] = 1;

    if (curKey === goalKey) {
      found = true;
      break;
    }

    const curCx = curKey % cols;
    const curCy = Math.floor(curKey / cols);
    const curG = gScore[curKey];

    for (const [dx, dy, baseCost] of dirs) {
      const nx = curCx + dx;
      const ny = curCy + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const nKey = ny * cols + nx;
      if (closed[nKey]) continue;

      const st = getCellState(nx, ny);
      if (st === 1) continue;

      // For diagonal steps, both adjacent cardinal cells must also be passable so we never clip a prop corner!
      if (dx !== 0 && dy !== 0) {
        if (getCellState(curCx + dx, curCy) === 1 || getCellState(curCx, curCy + dy) === 1) {
          continue;
        }
      }

      const proximityPenalty = st === 2 ? 0.65 : 0.0;
      const tentativeG = curG + baseCost + proximityPenalty;
      if (tentativeG < gScore[nKey]) {
        cameFrom[nKey] = curKey;
        gScore[nKey] = tentativeG;
        pushHeap(nKey, tentativeG + heuristic(nx, ny));
      }
    }
  }

  if (!found) {
    if (closedDoorIds && closedDoorIds.size > 0) {
      return [];
    }
    return isPassablePoint(safeGoalPt.x, safeGoalPt.y, 14)
      ? [{ x: safeGoalPt.x, y: safeGoalPt.y }]
      : [];
  }

  const rawPath: { x: number; y: number }[] = [];
  let curr = goalKey;
  while (curr !== -1) {
    const cx = curr % cols;
    const cy = Math.floor(curr / cols);
    rawPath.push(toWorld(cx, cy));
    if (curr === startKey) break;
    curr = cameFrom[curr];
  }
  rawPath.reverse();

  // Append exact snapped goal if it is unobstructed from the last grid cell
  if (rawPath.length > 0) {
    const last = rawPath[rawPath.length - 1];
    if (
      Math.hypot(safeGoalPt.x - last.x, safeGoalPt.y - last.y) > 2 &&
      isSegmentPassable(last.x, last.y, safeGoalPt.x, safeGoalPt.y, 14.5, closedDoorIds)
    ) {
      rawPath.push({ x: safeGoalPt.x, y: safeGoalPt.y });
    }
  } else {
    rawPath.push({ x: safeGoalPt.x, y: safeGoalPt.y });
  }

  // Line-of-sight string-pulling smoothing (with a strict 16.2px clearance radius and max 72px span)
  // so the player walks in smooth lines while keeping every bend waypoint around obstacles!
  const smoothed: { x: number; y: number }[] = [];
  let anchor = { x: safeStartPt.x, y: safeStartPt.y };
  let idx = 0;

  while (idx < rawPath.length) {
    let nextIdx = idx;
    for (let probe = idx + 1; probe < rawPath.length; probe++) {
      const candidate = rawPath[probe];
      if (Math.hypot(candidate.x - anchor.x, candidate.y - anchor.y) > 72) {
        break;
      }
      if (isSegmentPassable(anchor.x, anchor.y, candidate.x, candidate.y, 16.2, closedDoorIds)) {
        nextIdx = probe;
      } else {
        break;
      }
    }
    smoothed.push(rawPath[nextIdx]);
    anchor = rawPath[nextIdx];
    idx = nextIdx + 1;
  }

  return smoothed;
}

/**
 * Returns the floor Y depth-sorting key for the astronaut at `(px, py)` (where Daniil's boots touch the deck).
 * In 2.5D top-down oblique perspective, any 2.5D object with `sortY > getPlayerSortY(py)` is in front of (south of)
 * Daniil and must be rendered on the layer ABOVE Daniil so Daniil walks behind it (на слой ниже).
 */
export function getPlayerSortY(py: number): number {
  return py + 8;
}

/**
 * Returns the floor Y depth-sorting key for a circular 2.5D obstacle/pedestal/reactor centered at `cy`.
 */
export function getCirclePropSortY(cy: number): number {
  return cy;
}

/**
 * Returns the floor Y depth-sorting key for a rectangular 2.5D object with floor footprint `[y, y + h]`.
 */
export function getRectPropSortY(y: number, h: number): number {
  return y + Math.min(28, h * 0.55);
}

/**
 * Returns true if the astronaut at `py` is behind (north of) a circular 2.5D object at `cy`
 * and therefore must be rendered on a layer below it.
 */
export function isPlayerBehindCircleProp(py: number, cy: number): boolean {
  return getPlayerSortY(py) < getCirclePropSortY(cy);
}

/**
 * Returns true if the astronaut at `py` is behind (north of) a rectangular 2.5D object `[y, y + h]`
 * and therefore must be rendered on a layer below it.
 */
export function isPlayerBehindRectProp(py: number, y: number, h: number): boolean {
  return getPlayerSortY(py) < getRectPropSortY(y, h);
}

