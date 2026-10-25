import React, { useState, useRef } from 'react';
import { DoorId } from '../../types.ts';
import { SHIP_DOORS } from '../../game/shipMap.ts';
import {
  DoorWireColor,
  checkDoorWires,
  advanceDoorManifold,
  evaluateDoorCardSwipe,
  checkDoorBreakers,
  checkDoorShields,
} from '../../game/questLogic.ts';
import { sound } from '../../utils/audio.ts';
import { X, Zap, LockOpen, ShieldCheck, CreditCard, Hash } from 'lucide-react';

interface DoorUnlockModalProps {
  doorId: DoorId;
  onUnlock: (doorId: DoorId) => void;
  onClose: () => void;
}

const WIRE_PALETTE: Record<
  DoorWireColor,
  { hex: string; glow: string; label: string; badge: string }
> = {
  red: { hex: '#ef4444', glow: 'rgba(239,68,68,0.6)', label: 'КРАСНЫЙ', badge: 'R' },
  blue: { hex: '#3b82f6', glow: 'rgba(59,130,246,0.6)', label: 'СИНИЙ', badge: 'B' },
  yellow: { hex: '#eab308', glow: 'rgba(234,179,8,0.6)', label: 'ЖЁЛТЫЙ', badge: 'Y' },
  magenta: { hex: '#d946ef', glow: 'rgba(217,70,239,0.6)', label: 'ПУРПУРНЫЙ', badge: 'M' },
};

const LEFT_WIRE_ORDER: DoorWireColor[] = ['yellow', 'blue', 'red', 'magenta'];
const RIGHT_WIRE_ORDER: DoorWireColor[] = ['red', 'magenta', 'yellow', 'blue'];

const MANIFOLD_NUMBERS = [3, 7, 1, 5, 8, 2, 6, 4];

export const DoorUnlockModal: React.FC<DoorUnlockModalProps> = ({
  doorId,
  onUnlock,
  onClose,
}) => {
  const doorInfo = SHIP_DOORS.find((d) => d.doorId === doorId) ?? SHIP_DOORS[0];
  const [unlockedDone, setUnlockedDone] = useState(false);

  // Puzzle 1: Fix Wiring state
  const [wireConns, setWireConns] = useState<Partial<Record<DoorWireColor, DoorWireColor>>>({});
  const [selectedLeftWire, setSelectedLeftWire] = useState<DoorWireColor | null>(null);
  const [dragMousePos, setDragMousePos] = useState<{ x: number; y: number } | null>(null);
  const svgBoxRef = useRef<SVGSVGElement | null>(null);

  // Puzzle 2: Unlock Manifolds (1..8)
  const [manifoldStep, setManifoldStep] = useState<number>(0);
  const [manifoldError, setManifoldError] = useState<boolean>(false);

  // Puzzle 3: Swipe Card
  const [cardInserted, setCardInserted] = useState<boolean>(true);
  const [swipeProgress, setSwipeProgress] = useState<number>(0);
  const [swipeStatus, setSwipeStatus] = useState<'ready' | 'ok' | 'too_fast' | 'too_slow' | 'incomplete'>('ready');
  const swipeStartRef = useRef<number | null>(null);

  // Puzzle 4: Flip 4 Power Breakers
  const [breakers, setBreakers] = useState<boolean[]>([false, false, false, false]);

  // Puzzle 5: Prime Shields (7 Hexagons)
  const [shields, setShields] = useState<boolean[]>([false, true, false, false, true, false, true]);

  const finishDoorUnlock = () => {
    if (unlockedDone) return;
    setUnlockedDone(true);
    sound.playDoorOpen();
    window.setTimeout(() => {
      onUnlock(doorId);
    }, 360);
  };

  // --- Wire handlers (Door 1) ---
  const connectWirePair = (leftColor: DoorWireColor, rightColor: DoorWireColor) => {
    if (unlockedDone) return;
    if (leftColor !== rightColor) {
      sound.playWarn();
      setSelectedLeftWire(null);
      setDragMousePos(null);
      return;
    }
    sound.playWireSnap();
    const next = { ...wireConns, [leftColor]: rightColor };
    setWireConns(next);
    setSelectedLeftWire(null);
    setDragMousePos(null);
    if (checkDoorWires(next)) {
      finishDoorUnlock();
    }
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!selectedLeftWire || !svgBoxRef.current) return;
    const rect = svgBoxRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 420;
    const y = ((e.clientY - rect.top) / rect.height) * 240;
    setDragMousePos({ x, y });
  };

  // --- Manifold handlers (Door 2) ---
  const handleManifoldClick = (num: number) => {
    if (unlockedDone) return;
    const res = advanceDoorManifold(num, manifoldStep, 8);
    if (res.valid) {
      sound.playWireSnap();
      setManifoldError(false);
      setManifoldStep(res.nextStep);
      if (res.completed) {
        finishDoorUnlock();
      }
    } else {
      sound.playWarn();
      setManifoldError(true);
      setManifoldStep(0);
      window.setTimeout(() => setManifoldError(false), 380);
    }
  };

  // --- Card Swipe handlers (Door 3) ---
  const handleSwipeChange = (val: number) => {
    if (unlockedDone) return;
    if (!cardInserted) setCardInserted(true);
    if (swipeStartRef.current === null || val <= 4) {
      swipeStartRef.current = performance.now();
    }
    setSwipeProgress(val);
    if (val >= 94) {
      const elapsed = performance.now() - (swipeStartRef.current ?? performance.now() - 400);
      const check = evaluateDoorCardSwipe(val / 100, Math.max(150, elapsed));
      if (check.accepted) {
        setSwipeStatus('ok');
        finishDoorUnlock();
      }
    }
  };

  const handleSwipeRelease = () => {
    if (unlockedDone || swipeStatus === 'ok') return;
    const elapsed = performance.now() - (swipeStartRef.current ?? performance.now() - 400);
    const check = evaluateDoorCardSwipe(swipeProgress / 100, Math.max(150, elapsed));
    if (check.accepted) {
      setSwipeStatus('ok');
      finishDoorUnlock();
    } else {
      sound.playWarn();
      setSwipeStatus(check.status);
      setSwipeProgress(0);
      swipeStartRef.current = null;
    }
  };

  // --- Breaker handlers (Door 4) ---
  const handleToggleBreaker = (idx: number) => {
    if (unlockedDone) return;
    sound.playWireSnap();
    const next = breakers.map((v, i) => (i === idx ? !v : v));
    setBreakers(next);
    if (checkDoorBreakers(next)) {
      finishDoorUnlock();
    }
  };

  // --- Shield Hexagon handlers (Door 5) ---
  const handleToggleHex = (idx: number) => {
    if (unlockedDone) return;
    sound.playWireSnap();
    const next = shields.map((v, i) => (i === idx ? true : v));
    setShields(next);
    if (checkDoorShields(next)) {
      finishDoorUnlock();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 font-mono select-none">
      <div
        role="dialog"
        aria-label={doorInfo.name}
        className="w-full max-w-lg bg-slate-900 border-2 border-slate-600 rounded-xl shadow-[0_24px_60px_rgba(0,0,0,0.9)] overflow-hidden"
      >
        {/* Top Industrial Bulkhead Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <LockOpen
              className="w-5 h-5 shrink-0"
              style={{ color: unlockedDone ? '#34d399' : doorInfo.color }}
            />
            <div>
              <div className="text-xs font-bold tracking-wider uppercase text-slate-400">
                {doorInfo.name}
              </div>
              <div className="text-sm font-black text-white tracking-wide">
                {doorInfo.puzzleTitle}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть панель двери"
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content for the Specific Door Mini-Game */}
        <div className="p-5 space-y-4">
          {/* ===============================================================
              DOOR 1: FIX WIRING (СОЕДИНИТЕ ПРОВОДА ПО ЦВЕТУ)
             =============================================================== */}
          {doorId === 1 && (
            <div className="space-y-3">
              <div className="text-xs text-slate-300 text-center">
                Соедините каждый провод слева с клеммой такого же цвета справа:
              </div>

              <div className="relative bg-slate-950 border-2 border-slate-700 rounded-lg p-3">
                <svg
                  ref={svgBoxRef}
                  viewBox="0 0 420 240"
                  onPointerMove={handleSvgPointerMove}
                  onPointerUp={() => setDragMousePos(null)}
                  className="w-full h-56 touch-none"
                >
                  {/* Vertical metal cable trays on left & right */}
                  <rect x="6" y="8" width="52" height="224" rx="6" fill="#0f172a" stroke="#334155" strokeWidth="2" />
                  <rect x="362" y="8" width="52" height="224" rx="6" fill="#0f172a" stroke="#334155" strokeWidth="2" />

                  {/* Completed Wire Lines */}
                  {LEFT_WIRE_ORDER.map((lColor, lIdx) => {
                    const rColor = wireConns[lColor];
                    if (!rColor) return null;
                    const rIdx = RIGHT_WIRE_ORDER.indexOf(rColor);
                    const y1 = 36 + lIdx * 56;
                    const y2 = 36 + rIdx * 56;
                    const pal = WIRE_PALETTE[lColor];
                    return (
                      <g key={`wire-${lColor}`}>
                        <line
                          x1="64"
                          y1={y1}
                          x2="356"
                          y2={y2}
                          stroke="#020617"
                          strokeWidth="14"
                          strokeLinecap="round"
                        />
                        <line
                          x1="64"
                          y1={y1}
                          x2="356"
                          y2={y2}
                          stroke={pal.hex}
                          strokeWidth="9"
                          strokeLinecap="round"
                        />
                        <line
                          x1="64"
                          y1={y1 - 2}
                          x2="356"
                          y2={y2 - 2}
                          stroke="rgba(255,255,255,0.35)"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </g>
                    );
                  })}

                  {/* Active Dragging Wire Line */}
                  {selectedLeftWire && dragMousePos && (
                    <line
                      x1="64"
                      y1={36 + LEFT_WIRE_ORDER.indexOf(selectedLeftWire) * 56}
                      x2={dragMousePos.x}
                      y2={dragMousePos.y}
                      stroke={WIRE_PALETTE[selectedLeftWire].hex}
                      strokeWidth="8"
                      strokeDasharray="6 4"
                      strokeLinecap="round"
                    />
                  )}

                  {/* Left Wire Terminals */}
                  {LEFT_WIRE_ORDER.map((lColor, idx) => {
                    const cy = 36 + idx * 56;
                    const pal = WIRE_PALETTE[lColor];
                    const isConnected = wireConns[lColor] === lColor;
                    const isSelected = selectedLeftWire === lColor;
                    return (
                      <g
                        key={`left-${lColor}`}
                        onClick={() => {
                          if (!isConnected) {
                            sound.playTerminalClick();
                            setSelectedLeftWire(lColor);
                          }
                        }}
                        onPointerDown={(e) => {
                          if (!isConnected && svgBoxRef.current) {
                            sound.playTerminalClick();
                            setSelectedLeftWire(lColor);
                            const rect = svgBoxRef.current.getBoundingClientRect();
                            setDragMousePos({
                              x: ((e.clientX - rect.left) / rect.width) * 420,
                              y: ((e.clientY - rect.top) / rect.height) * 240,
                            });
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <rect
                          x="14"
                          y={cy - 16}
                          width="56"
                          height="32"
                          rx="6"
                          fill={pal.hex}
                          stroke={isSelected ? '#ffffff' : '#090d16'}
                          strokeWidth={isSelected ? '3' : '2'}
                        />
                        <text
                          x="42"
                          y={cy + 5}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="13"
                          fontWeight="bold"
                        >
                          {pal.badge}
                        </text>
                      </g>
                    );
                  })}

                  {/* Right Wire Terminals */}
                  {RIGHT_WIRE_ORDER.map((rColor, idx) => {
                    const cy = 36 + idx * 56;
                    const pal = WIRE_PALETTE[rColor];
                    const isConnected = wireConns[rColor] === rColor;
                    return (
                      <g
                        key={`right-${rColor}`}
                        onClick={() => {
                          if (selectedLeftWire) {
                            connectWirePair(selectedLeftWire, rColor);
                          } else if (!isConnected) {
                            // Allow single-click auto-connect if user clicks matching right terminal directly
                            connectWirePair(rColor, rColor);
                          }
                        }}
                        onPointerUp={() => {
                          if (selectedLeftWire) {
                            connectWirePair(selectedLeftWire, rColor);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <rect
                          x="350"
                          y={cy - 16}
                          width="56"
                          height="32"
                          rx="6"
                          fill={pal.hex}
                          stroke={isConnected ? '#4ade80' : '#090d16'}
                          strokeWidth={isConnected ? '3' : '2'}
                        />
                        <circle
                          cx="396"
                          cy={cy - 10}
                          r="4"
                          fill={isConnected ? '#facc15' : '#1e293b'}
                        />
                        <text
                          x="376"
                          y={cy + 5}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="13"
                          fontWeight="bold"
                        >
                          {pal.badge}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/*Accessible Button Strip for Quick Wire Connection*/}
                <div className="grid grid-cols-4 gap-2 mt-2 pt-2 border-t border-slate-800">
                  {LEFT_WIRE_ORDER.map((color) => {
                    const pal = WIRE_PALETTE[color];
                    const done = wireConns[color] === color;
                    return (
                      <button
                        key={`btn-wire-${color}`}
                        disabled={done}
                        onClick={() => connectWirePair(color, color)}
                        className={`py-1.5 px-2 rounded text-[11px] font-bold transition-all cursor-pointer ${
                          done
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/50'
                            : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-600'
                        }`}
                      >
                        {done ? `✓ ${pal.label}` : `⚡ ${pal.label}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ===============================================================
              DOOR 2: UNLOCK MANIFOLDS (НАЖМИТЕ ПО ПОРЯДКУ ОТ 1 ДО 8)
             =============================================================== */}
          {doorId === 2 && (
            <div className="space-y-3">
              <div className="text-xs text-slate-300 text-center">
                Нажмите кнопки коллектора по порядку от <span className="text-sky-400 font-bold">1</span> до{' '}
                <span className="text-sky-400 font-bold">8</span>:
              </div>

              <div
                className={`p-4 rounded-xl border-2 transition-colors ${
                  manifoldError
                    ? 'bg-rose-950/60 border-rose-500'
                    : 'bg-sky-950/40 border-sky-500/60'
                }`}
              >
                <div className="grid grid-cols-4 gap-3">
                  {MANIFOLD_NUMBERS.map((num) => {
                    const isPressed = num <= manifoldStep;
                    return (
                      <button
                        key={num}
                        onClick={() => handleManifoldClick(num)}
                        aria-label={`Кнопка коллектора ${num}`}
                        className={`h-16 rounded-lg border-2 text-2xl font-black transition-all cursor-pointer flex items-center justify-center shadow-inner ${
                          isPressed
                            ? 'bg-emerald-500 border-emerald-300 text-slate-950 scale-95'
                            : 'bg-sky-900/80 hover:bg-sky-800 border-sky-400/70 text-sky-100 active:scale-95'
                        }`}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-sky-400" />
                  Следующий номер: <strong className="text-white">{Math.min(8, manifoldStep + 1)}</strong>
                </span>
                <span>Прогресс: {manifoldStep}/8</span>
              </div>
            </div>
          )}

          {/* ===============================================================
              DOOR 3: SWIPE CARD (ПРОВЕДИТЕ КЛЮЧ-КАРТОЙ)
             =============================================================== */}
          {doorId === 3 && (
            <div className="space-y-4">
              <div className="text-xs text-slate-300 text-center">
                Проведите пропускной ключ-картой слева направо по считывателю:
              </div>

              <div className="bg-slate-950 border-2 border-slate-700 rounded-xl p-4 space-y-4">
                {/* Reader Status Screen */}
                <div className="flex items-center justify-between bg-slate-900 border border-slate-700 px-4 py-2.5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold tracking-wider uppercase text-emerald-300">
                      {swipeStatus === 'ok'
                        ? 'КАРТА ПРИНЯТА // ОТКРЫТИЕ ДВЕРИ'
                        : swipeStatus === 'too_fast'
                        ? 'СЛИШКОМ БЫСТРО — ПОВТОРИТЕ'
                        : swipeStatus === 'too_slow'
                        ? 'СЛИШКОМ МЕДЛЕННО — ПОВТОРИТЕ'
                        : swipeStatus === 'incomplete'
                        ? 'ДОВЕДИТЕ КАРТУ ДО КОНЦА'
                        : 'ГОТОВ К СЧИТЫВАНИЮ: ID-3301'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-3 h-3 rounded-full ${
                        swipeStatus === 'ok' ? 'bg-emerald-400' : 'bg-rose-500'
                      }`}
                    />
                  </div>
                </div>

                {/* Visual Card Reader Slot + Draggable Slider */}
                <div className="space-y-2">
                  <div className="relative h-20 bg-slate-900 border-2 border-slate-700 rounded-lg px-4 flex items-center overflow-hidden">
                    <div
                      className="h-14 w-28 rounded-md bg-gradient-to-br from-emerald-500 to-teal-700 border-2 border-white/80 shadow-lg flex flex-col justify-between p-2 text-[10px] font-bold text-slate-950 pointer-events-none transition-transform duration-75"
                      style={{
                        transform: `translateX(${(swipeProgress / 100) * 260}px)`,
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <span>HYPERION</span>
                        <span>3301</span>
                      </div>
                      <div className="bg-slate-950/80 text-emerald-300 px-1 py-0.5 rounded text-[9px] truncate">
                        ДАНИИЛ // ACCESS
                      </div>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={swipeProgress}
                    aria-label="Считыватель ключ-карты"
                    onChange={(e) => handleSwipeChange(Number(e.target.value))}
                    onMouseUp={handleSwipeRelease}
                    onTouchEnd={handleSwipeRelease}
                    className="w-full h-3 bg-slate-800 rounded-lg accent-emerald-400 cursor-pointer"
                  />
                </div>

                <button
                  onClick={() => {
                    setSwipeProgress(100);
                    setSwipeStatus('ok');
                    finishDoorUnlock();
                  }}
                  className="w-full py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/60 text-emerald-300 text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer"
                >
                  ПРОВЕСТИ КАРТУ ДОСТУПА
                </button>
              </div>
            </div>
          )}

          {/* ===============================================================
              DOOR 4: POWER BREAKERS (ВКЛЮЧИТЕ 4 РУБИЛЬНИКА ПИТАНИЯ ДВЕРИ)
             =============================================================== */}
          {doorId === 4 && (
            <div className="space-y-3">
              <div className="text-xs text-slate-300 text-center">
                Переключите все 4 силовых тумблера привода гермодвери в положение{' '}
                <span className="text-emerald-400 font-bold">ВКЛ</span>:
              </div>

              <div className="grid grid-cols-4 gap-3 bg-slate-950 border-2 border-slate-700 rounded-xl p-4">
                {breakers.map((isOn, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleToggleBreaker(idx)}
                    aria-label={`Рубильник ${idx + 1}`}
                    className={`flex flex-col items-center justify-between p-3 rounded-lg border-2 transition-all cursor-pointer ${
                      isOn
                        ? 'bg-emerald-950/60 border-emerald-400 text-emerald-300'
                        : 'bg-slate-900 hover:bg-slate-800 border-rose-500/60 text-rose-300'
                    }`}
                  >
                    <span className="text-[10px] font-bold tracking-wider">
                      ФАЗА {idx + 1}
                    </span>
                    <div className="my-2 w-8 h-14 rounded bg-slate-950 border border-slate-700 p-1 flex flex-col justify-between">
                      <div
                        className={`w-full h-5 rounded transition-all ${
                          isOn ? 'bg-emerald-400' : 'bg-transparent'
                        }`}
                      />
                      <div
                        className={`w-full h-5 rounded transition-all ${
                          !isOn ? 'bg-rose-500' : 'bg-transparent'
                        }`}
                      />
                    </div>
                    <span className="text-xs font-black">
                      {isOn ? 'ВКЛ' : 'ВЫКЛ'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ===============================================================
              DOOR 5: PRIME SHIELDS (АКТИВИРУЙТЕ ВСЕ КРАСНЫЕ СОТЫ ШЛЮЗА)
             =============================================================== */}
          {doorId === 5 && (
            <div className="space-y-3">
              <div className="text-xs text-slate-300 text-center">
                Нажмите на все <span className="text-rose-400 font-bold">красные сегменты</span>, чтобы стабилизировать контур двери:
              </div>

              <div className="bg-slate-950 border-2 border-slate-700 rounded-xl p-5 flex flex-col items-center gap-2.5">
                {/* Row 1 (2 hexes) */}
                <div className="flex gap-3">
                  {[0, 1].map((idx) => (
                    <button
                      key={idx}
                      onClick={() => handleToggleHex(idx)}
                      aria-label={`Сегмент щита ${idx + 1}`}
                      className={`w-20 h-16 rounded-xl border-2 font-black text-xs flex flex-col items-center justify-center transition-all cursor-pointer ${
                        shields[idx]
                          ? 'bg-cyan-500/25 border-cyan-300 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.35)]'
                          : 'bg-rose-600/80 hover:bg-rose-500 border-rose-300 text-white animate-pulse'
                      }`}
                    >
                      <ShieldCheck className="w-5 h-5 mb-0.5" />
                      <span>{shields[idx] ? 'ОК' : 'СБОЙ'}</span>
                    </button>
                  ))}
                </div>
                {/* Row 2 (3 hexes) */}
                <div className="flex gap-3">
                  {[2, 3, 4].map((idx) => (
                    <button
                      key={idx}
                      onClick={() => handleToggleHex(idx)}
                      aria-label={`Сегмент щита ${idx + 1}`}
                      className={`w-20 h-16 rounded-xl border-2 font-black text-xs flex flex-col items-center justify-center transition-all cursor-pointer ${
                        shields[idx]
                          ? 'bg-cyan-500/25 border-cyan-300 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.35)]'
                          : 'bg-rose-600/80 hover:bg-rose-500 border-rose-300 text-white animate-pulse'
                      }`}
                    >
                      <ShieldCheck className="w-5 h-5 mb-0.5" />
                      <span>{shields[idx] ? 'ОК' : 'СБОЙ'}</span>
                    </button>
                  ))}
                </div>
                {/* Row 3 (2 hexes) */}
                <div className="flex gap-3">
                  {[5, 6].map((idx) => (
                    <button
                      key={idx}
                      onClick={() => handleToggleHex(idx)}
                      aria-label={`Сегмент щита ${idx + 1}`}
                      className={`w-20 h-16 rounded-xl border-2 font-black text-xs flex flex-col items-center justify-center transition-all cursor-pointer ${
                        shields[idx]
                          ? 'bg-cyan-500/25 border-cyan-300 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.35)]'
                          : 'bg-rose-600/80 hover:bg-rose-500 border-rose-300 text-white animate-pulse'
                      }`}
                    >
                      <ShieldCheck className="w-5 h-5 mb-0.5" />
                      <span>{shields[idx] ? 'ОК' : 'СБОЙ'}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Status Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              После решения гермодверь поднимется вверх
            </span>
            {unlockedDone && (
              <span className="text-emerald-400 font-black tracking-wider uppercase">
                ✓ ДВЕРЬ ПОДНИМАЕТСЯ...
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
