import React, { useState, useEffect, useRef } from 'react';
import { Difficulty } from '../../types.ts';
import { getRoverSlotBudget } from '../../game/questLogic.ts';
import { sound } from '../../utils/audio.ts';
import { Bot, CheckCircle2, AlertTriangle, X, Play, RotateCcw } from 'lucide-react';

interface Node3Props {
  difficulty: Difficulty;
  isSolved: boolean;
  onSolve: (data: { roverTime: number }) => void;
  onClose: () => void;
}

const CRATERS_3D = [[1, 1, 0], [0, 2, 0], [1, 1, 1], [2, 2, 2], [1, 1, 2]];
const BEACONS_3D = [[2, 0, 1], [0, 2, 2]];
const TARGET_3D = [2, 2, 3];

const CRATERS_4D = [[1, 1, 0, 0], [2, 1, 0, 0], [1, 1, 1, 1], [0, 1, 2, 1], [1, 2, 0, 1]];
const BEACONS_4D = [[2, 0, 1, 1], [1, 0, 2, 1], [2, 2, 1, 0]];
const TARGET_4D = [0, 2, 1, 1];

interface CmdMeta {
  label: string;
  isLoop?: boolean;
  count?: number;
  isHyper?: boolean;
}

const CMD_DICT: Record<string, CmdMeta> = {
  LOOP2: { label: '[×2] ЦИКЛ ×2 (0 с)', isLoop: true, count: 2 },
  LOOP3: { label: '[×3] ЦИКЛ ×3 (0 с)', isLoop: true, count: 3 },
  FWD1: { label: '↑ ВПЕРЕД 1 (1 с)' },
  FWD2: { label: '↑↑ ВПЕРЕД 2 (2 с)' },
  RIGHT: { label: '→ ВПРАВО XY 90° (1 с)' },
  LEFT: { label: '← ВЛЕВО XY 90° (1 с)' },
  Z_UP: { label: '▲ ПОДЪЕМ Z (+1) (1 с)' },
  HYPER: { label: '◆ 4D-ПЕРЕХОД W (1 с)', isHyper: true },
};

export const Node3RoverNav: React.FC<Node3Props> = ({
  difficulty,
  isSolved,
  onSolve,
  onClose,
}) => {
  const { totalCells, loopBodyCells, outsideCells } = getRoverSlotBudget(difficulty);

  const [loopMode, setLoopMode] = useState<'NONE' | 'LOOP2' | 'LOOP3'>('NONE');
  const [insertTarget, setInsertTarget] = useState<'INSIDE' | 'OUTSIDE'>('INSIDE');
  const [cmdBuffer, setCmdBuffer] = useState<(string | null)[]>(
    new Array(totalCells).fill(null)
  );
  const [outsideBuffer, setOutsideBuffer] = useState<(string | null)[]>(
    new Array(outsideCells).fill(null)
  );

  useEffect(() => {
    setCmdBuffer(new Array(totalCells).fill(null));
    setOutsideBuffer(new Array(outsideCells).fill(null));
    setLoopMode('NONE');
    setInsertTarget('INSIDE');
  }, [difficulty, totalCells, outsideCells]);

  const [roverState, setRoverState] = useState({
    x: 0,
    y: 0,
    z: 0,
    w: 0,
    dir: 0, // 0: +x, 1: +y, 2: -x, 3: -y
    time: 0,
    collected: [] as number[],
    trail: [[0, 0, 0, 0]] as number[][],
  });

  const [wAngle, setWAngle] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simMessage, setSimMessage] = useState<string>('Готов к загрузке программы...');
  const [solved, setSolved] = useState<boolean>(isSolved);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotRef = useRef({ rotX: 0.48, rotY: -0.55, isDragging: false, lastX: 0, lastY: 0 });

  const maxAllowedTime = difficulty === 'hard' ? 19 : 20;
  const maxBeacons = difficulty === 'hard' ? 3 : 2;

  // Project 3D/4D coordinates onto 2D canvas
  const projectNode = (gx: number, gy: number, gz: number, gw: number, canvas: HTMLCanvasElement) => {
    let x = gx - 1;
    let y = gy - 1;
    let z = difficulty === 'normal' ? (1.5 - gz) * 0.9 : 1 - gz;

    if (difficulty === 'hard') {
      const wPhase = (wAngle * Math.PI) / 180;
      const w = gw === 0 ? -1 : 1;
      const rotW = w * Math.cos(wPhase) + x * 0.35 * Math.sin(wPhase);
      const shellScale = rotW < 0 ? 1.15 : 0.52;
      x *= shellScale * 115;
      y *= shellScale * 115;
      z *= shellScale * 115;
    } else {
      x *= 95;
      y *= 95;
      z *= 80;
    }

    const { rotX, rotY } = rotRef.current;
    const x1 = x * Math.cos(rotY) - y * Math.sin(rotY);
    const z1 = y * Math.cos(rotY) + x * Math.sin(rotY);
    const y2 = z * Math.cos(rotX) - z1 * Math.sin(rotX);
    const z2 = z1 * Math.cos(rotX) + z * Math.sin(rotX);

    const fov = 520;
    const s = fov / (fov + z2 + 340);
    return {
      x: canvas.width / 2 + x1 * s,
      y: canvas.height / 2 + y2 * s,
      z: z2,
      s,
    };
  };

  // Canvas drawing
  const drawMap = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const maxZ = difficulty === 'normal' ? 4 : 3;
    const maxW = difficulty === 'normal' ? 1 : 2;

    // 4D connections if hard mode
    if (difficulty === 'hard') {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.setLineDash([3, 3]);
      for (const gx of [0, 2]) {
        for (const gy of [0, 2]) {
          for (const gz of [0, 2]) {
            const p0 = projectNode(gx, gy, gz, 0, canvas);
            const p1 = projectNode(gx, gy, gz, 1, canvas);
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
          }
        }
      }
      ctx.setLineDash([]);
    }

    // Grid wireframes
    for (let gw = 0; gw < maxW; gw++) {
      const isInner = gw === 1;
      ctx.strokeStyle = isInner ? 'rgba(56, 189, 248, 0.45)' : 'rgba(240, 185, 11, 0.28)';
      ctx.lineWidth = isInner ? 1.2 : 1;

      for (let gz = 0; gz < maxZ; gz++) {
        for (let gy = 0; gy < 3; gy++) {
          for (let gx = 0; gx < 3; gx++) {
            const p = projectNode(gx, gy, gz, gw, canvas);
            if (gx < 2) {
              const px = projectNode(gx + 1, gy, gz, gw, canvas);
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(px.x, px.y);
              ctx.stroke();
            }
            if (gy < 2) {
              const py = projectNode(gx, gy + 1, gz, gw, canvas);
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(py.x, py.y);
              ctx.stroke();
            }
            if (gz < maxZ - 1) {
              const pz = projectNode(gx, gy, gz + 1, gw, canvas);
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(pz.x, pz.y);
              ctx.stroke();
            }
            ctx.fillStyle = isInner ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.2)';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2 * p.s, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // Rover Trail
    if (roverState.trail.length > 1) {
      ctx.strokeStyle = 'rgba(0, 255, 157, 0.75)';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      roverState.trail.forEach((pt, idx) => {
        const p = projectNode(pt[0], pt[1], pt[2], pt[3], canvas);
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // Start [S]
    const pS = projectNode(0, 0, 0, 0, canvas);
    ctx.fillStyle = '#00ff9d';
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillText('[S]', pS.x - 10, pS.y - 8);

    // Target [F]
    const tf = difficulty === 'normal' ? [...TARGET_3D, 0] : TARGET_4D;
    const pF = projectNode(tf[0], tf[1], tf[2], tf[3], canvas);
    ctx.fillStyle = '#f0b90b';
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillText('[F ЦЕЛЬ]', pF.x - 22, pF.y - 8);

    // Craters / Singularities
    const craters = difficulty === 'normal' ? CRATERS_3D.map((c) => [...c, 0]) : CRATERS_4D;
    craters.forEach(([cx, cy, cz, cw]) => {
      const p = projectNode(cx, cy, cz, cw, canvas);
      ctx.fillStyle = '#ff4757';
      ctx.font = 'bold 13px "Courier New", monospace';
      ctx.fillText('✖', p.x - 5, p.y + 4);
    });

    // Beacons
    const beacons = difficulty === 'normal' ? BEACONS_3D.map((b) => [...b, 0]) : BEACONS_4D;
    beacons.forEach(([bx, by, bz, bw], idx) => {
      const p = projectNode(bx, by, bz, bw, canvas);
      const isCol = roverState.collected.includes(idx);
      ctx.fillStyle = isCol ? '#00ff9d' : '#f0b90b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6.5 * p.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`⚡M${idx + 1}`, p.x + 8, p.y + 3);
    });

    // Rover Head & Orientation vector
    const pR = projectNode(roverState.x, roverState.y, roverState.z, roverState.w, canvas);
    const dx = [0.45, 0, -0.45, 0][roverState.dir];
    const dy = [0, 0.45, 0, -0.45][roverState.dir];
    const pDir = projectNode(roverState.x + dx, roverState.y + dy, roverState.z, roverState.w, canvas);

    ctx.fillStyle = '#00ff9d';
    ctx.shadowColor = '#00ff9d';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(pR.x, pR.y, 7 * pR.s, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pR.x, pR.y);
    ctx.lineTo(pDir.x, pDir.y);
    ctx.stroke();
    ctx.lineWidth = 1;
  };

  useEffect(() => {
    drawMap();
  }, [roverState, wAngle, difficulty]);

  // Mouse rotation for 3D view
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    rotRef.current.isDragging = true;
    rotRef.current.lastX = e.clientX;
    rotRef.current.lastY = e.clientY;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!rotRef.current.isDragging) return;
    const dx = e.clientX - rotRef.current.lastX;
    const dy = e.clientY - rotRef.current.lastY;
    rotRef.current.rotY += dx * 0.01;
    rotRef.current.rotX = Math.max(-0.8, Math.min(1.3, rotRef.current.rotX + dy * 0.01));
    rotRef.current.lastX = e.clientX;
    rotRef.current.lastY = e.clientY;
    drawMap();
  };

  const handleMouseUp = () => {
    rotRef.current.isDragging = false;
  };

  const handleSelectLoopMode = (mode: 'NONE' | 'LOOP2' | 'LOOP3') => {
    if (isSimulating) return;
    sound.playTerminalClick();
    setLoopMode((prev) => {
      const nextMode = prev === mode ? 'NONE' : mode;
      return nextMode;
    });
    setInsertTarget('INSIDE');
  };

  const addCmd = (cmd: string) => {
    if (isSimulating) return;
    sound.playTerminalClick();

    if (cmd === 'LOOP2' || cmd === 'LOOP3') {
      setLoopMode((prev) => (prev === cmd ? 'NONE' : cmd));
      setInsertTarget('INSIDE');
      return;
    }

    if (loopMode === 'NONE') {
      setCmdBuffer((prev) => {
        const idx = prev.slice(0, totalCells).indexOf(null);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = cmd;
        return next;
      });
      return;
    }

    // When a loop is active:
    // In Easy ('normal'): outsideCells === 0, all 5 slots are inside the loop.
    // In Hard ('hard'): outsideCells === 3, 4 slots are inside the loop and 3 slots are outside the loop.
    if (outsideCells === 0 || insertTarget === 'INSIDE') {
      const insideIdx = cmdBuffer.slice(0, loopBodyCells).indexOf(null);
      if (insideIdx !== -1) {
        setCmdBuffer((prev) => {
          const idx = prev.slice(0, loopBodyCells).indexOf(null);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = cmd;
          return next;
        });
        return;
      }
      // In Hard mode, if inside loop (4 slots) is full, overflow into outside loop (3 slots)
      if (outsideCells > 0) {
        const outIdx = outsideBuffer.indexOf(null);
        if (outIdx !== -1) {
          setOutsideBuffer((prev) => {
            const idx = prev.indexOf(null);
            if (idx === -1) return prev;
            const nextOut = [...prev];
            nextOut[idx] = cmd;
            return nextOut;
          });
          setInsertTarget('OUTSIDE');
        }
      }
    } else {
      setOutsideBuffer((prev) => {
        const idx = prev.indexOf(null);
        if (idx === -1) return prev;
        const nextOut = [...prev];
        nextOut[idx] = cmd;
        return nextOut;
      });
    }
  };

  const clearSlot = (idx: number) => {
    if (isSimulating) return;
    sound.playTerminalClick();
    setCmdBuffer((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  };

  const clearOutsideSlot = (idx: number) => {
    if (isSimulating) return;
    sound.playTerminalClick();
    setOutsideBuffer((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  };

  const moveInsideToOutside = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSimulating || outsideCells === 0) return;
    const cmd = cmdBuffer[idx];
    if (!cmd) return;
    const emptyOutIdx = outsideBuffer.indexOf(null);
    if (emptyOutIdx === -1) return;
    sound.playTerminalClick();
    setCmdBuffer((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
    setOutsideBuffer((prev) => {
      const nextOut = [...prev];
      nextOut[emptyOutIdx] = cmd;
      return nextOut;
    });
  };

  const moveOutsideToInside = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSimulating || outsideCells === 0) return;
    const cmd = outsideBuffer[idx];
    if (!cmd) return;
    const emptyInIdx = cmdBuffer.slice(0, loopBodyCells).indexOf(null);
    if (emptyInIdx === -1) return;
    sound.playTerminalClick();
    setOutsideBuffer((prev) => {
      const nextOut = [...prev];
      nextOut[idx] = null;
      return nextOut;
    });
    setCmdBuffer((prev) => {
      const nextIn = [...prev];
      nextIn[emptyInIdx] = cmd;
      return nextIn;
    });
  };

  const resetRover = () => {
    setRoverState({
      x: 0,
      y: 0,
      z: 0,
      w: 0,
      dir: 0,
      time: 0,
      collected: [],
      trail: [[0, 0, 0, 0]],
    });
    setSimMessage('Позиция ровера сброшена на старт [S].');
  };

  const getExpandedCommands = (): string[] => {
    if (loopMode === 'NONE') {
      return cmdBuffer.slice(0, totalCells).filter(Boolean) as string[];
    }
    const insideCmds = cmdBuffer.slice(0, loopBodyCells).filter(Boolean) as string[];
    const outsideCmds = outsideCells > 0 ? (outsideBuffer.filter(Boolean) as string[]) : [];
    const repeatCount = loopMode === 'LOOP3' ? 3 : 2;
    const expanded: string[] = [];
    for (let k = 0; k < repeatCount; k++) {
      expanded.push(...insideCmds);
    }
    expanded.push(...outsideCmds);
    return expanded;
  };

  // Run Simulation
  const runSimulation = () => {
    if (isSimulating) return;
    sound.playTaskOpen();

    const expandedQueue = getExpandedCommands();
    if (expandedQueue.length === 0) {
      setSimMessage('Буфер пуст! Добавьте команды из палитры.');
      return;
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

    setIsSimulating(true);
    setSimMessage('Выполнение пространственной программы...');

    let cur = {
      x: 0,
      y: 0,
      z: 0,
      w: 0,
      dir: 0,
      time: 0,
      collected: [] as number[],
      trail: [[0, 0, 0, 0]] as number[][],
    };
    setRoverState(cur);

    const craters = difficulty === 'normal' ? CRATERS_3D.map((c) => [...c, 0]) : CRATERS_4D;
    const beacons = difficulty === 'normal' ? BEACONS_3D.map((b) => [...b, 0]) : BEACONS_4D;
    const target = difficulty === 'normal' ? [...TARGET_3D, 0] : TARGET_4D;

    let stepIdx = 0;
    const interval = setInterval(() => {
      if (stepIdx >= atomicSteps.length) {
        clearInterval(interval);
        finish(cur);
        return;
      }

      const action = atomicSteps[stepIdx++];
      cur.time += 1;

      if (action === 'RIGHT') {
        cur.dir = (cur.dir + 1) % 4;
      } else if (action === 'LEFT') {
        cur.dir = (cur.dir + 3) % 4;
      } else if (action === 'Z_UP') {
        const maxZ = difficulty === 'normal' ? 4 : 3;
        cur.z = (cur.z + 1) % maxZ;
        cur.trail.push([cur.x, cur.y, cur.z, cur.w]);
      } else if (action === 'HYPER') {
        cur.w = 1 - cur.w;
        cur.dir = (cur.dir + 1) % 4;
        cur.trail.push([cur.x, cur.y, cur.z, cur.w]);
      } else if (action === 'STEP') {
        const dx = [1, 0, -1, 0][cur.dir];
        const dy = [0, 1, 0, -1][cur.dir];
        let nx = cur.x + dx;
        let ny = cur.y + dy;
        let nz = cur.z;
        let nw = cur.w;

        if (difficulty === 'normal') {
          if (nx < 0 || nx > 2 || ny < 0 || ny > 2) {
            clearInterval(interval);
            setIsSimulating(false);
            sound.playWarn();
            setSimMessage('АВАРИЯ: Выход за границы 3D-куба!');
            return;
          }
        } else {
          if (nx > 2) { nx = 0; nw = 1 - nw; nz = 2 - nz; }
          else if (nx < 0) { nx = 2; nw = 1 - nw; nz = 2 - nz; }
          if (ny > 2) { ny = 0; nw = 1 - nw; nz = 2 - nz; }
          else if (ny < 0) { ny = 2; nw = 1 - nw; nz = 2 - nz; }
        }

        cur.x = nx;
        cur.y = ny;
        cur.z = nz;
        cur.w = nw;
        cur.trail.push([nx, ny, nz, nw]);
      }

      // Check collision
      if (craters.some(([cx, cy, cz, cw]) => cx === cur.x && cy === cur.y && cz === cur.z && cw === cur.w)) {
        clearInterval(interval);
        setIsSimulating(false);
        sound.playWarn();
        setSimMessage('АВАРИЯ: Столкновение с кратером / сингулярностью!');
        return;
      }

      // Check beacons
      beacons.forEach(([bx, by, bz, bw], idx) => {
        if (bx === cur.x && by === cur.y && bz === cur.z && bw === cur.w && !cur.collected.includes(idx)) {
          cur.collected.push(idx);
        }
      });

      setRoverState({ ...cur });

      if (cur.x === target[0] && cur.y === target[1] && cur.z === target[2] && cur.w === target[3]) {
        clearInterval(interval);
        finish(cur);
      }
    }, 280);
  };

  const finish = (finalState: typeof roverState) => {
    setIsSimulating(false);
    const target = difficulty === 'normal' ? [...TARGET_3D, 0] : TARGET_4D;
    const reached =
      finalState.x === target[0] &&
      finalState.y === target[1] &&
      finalState.z === target[2] &&
      finalState.w === target[3];

    const isSuccess =
      reached &&
      finalState.time <= maxAllowedTime &&
      finalState.collected.length === maxBeacons;

    if (isSuccess) {
      setSolved(true);
      sound.playTaskSuccess();
      setSimMessage(`МАРШРУТ УСПЕШНО ЗАВЕРШЁН ЗА ${finalState.time} СЕКУНД!`);
      onSolve({ roverTime: finalState.time });
    } else {
      sound.playWarn();
      setSimMessage('ОШИБКА: Цель не достигнута вовремя или собраны не все маяки.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-950 border border-emerald-500/40 rounded-lg shadow-2xl p-5 md:p-6 font-mono text-slate-200 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <Bot className="w-6 h-6 text-emerald-400" />
            <div>
              <h2 className="text-lg font-bold text-emerald-300 uppercase tracking-wider">
                Узел III: Пространственная Навигация Ровера
              </h2>
              <p className="text-xs text-slate-400">
                {difficulty === 'normal'
                  ? '3D Орбитальный куб (3×3×4) — сбор маяков и подъем по оси Z'
                  : '4D Неевклидов тессеракт Римана — переход W и антиподальная склейка'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Workspace: 3D Hologram on left, Programming on right */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 mb-5">
          {/* Canvas Viewport */}
          <div className="md:col-span-7 bg-slate-900/80 p-3 rounded border border-slate-800 flex flex-col items-center">
            <canvas
              ref={canvasRef}
              width={460}
              height={360}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="w-full h-72 rounded bg-black border border-slate-800 cursor-grab active:cursor-grabbing"
            />

            {/* 4D slider if hard */}
            {difficulty === 'hard' && (
              <div className="w-full mt-2 bg-slate-950/60 p-2 rounded border border-slate-800">
                <div className="flex justify-between text-[11px] text-cyan-300 mb-1">
                  <span>🌀 Разворот 4-го измерения W:</span>
                  <span className="font-bold">{wAngle}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={wAngle}
                  onChange={(e) => setWAngle(parseInt(e.target.value, 10))}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded appearance-none cursor-pointer"
                />
              </div>
            )}

            {/* Telemetry bar */}
            <div className="w-full flex justify-between text-xs mt-2 bg-black/60 px-3 py-1.5 rounded border border-slate-800 text-slate-300">
              <span>
                ВРЕМЯ: <strong className="text-amber-400">{roverState.time}</strong> / {maxAllowedTime} с
              </span>
              <span>
                МАЯКИ: <strong className="text-emerald-400">{roverState.collected.length}</strong> / {maxBeacons}
              </span>
              <span>
                КООРД: <strong className="text-cyan-400">({roverState.x},{roverState.y},{roverState.z})</strong>
                {difficulty === 'hard' && <span className="text-cyan-300"> W={roverState.w}</span>}
              </span>
            </div>

            <div className="text-[10px] text-slate-500 mt-1 italic">
              * Зажмите левую кнопку мыши на кубе для вращения сцены в 3D
            </div>

            <div
              className={`w-full text-xs mt-2 p-2 rounded text-center font-bold ${
                solved
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-950/40 text-amber-300'
              }`}
            >
              {simMessage}
            </div>
          </div>

          {/* Programming Panel with Explicit Loop Container (6 total cells in Normal, 8 in Hard) */}
          <div className="md:col-span-5 flex flex-col justify-between">
            <div>
              <div className="text-xs text-amber-300 font-bold mb-1.5 uppercase tracking-wider">
                1. Палитра команд ровера:
              </div>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                <button
                  data-testid="loop-mode-2"
                  onClick={() => handleSelectLoopMode('LOOP2')}
                  className={`p-1.5 rounded text-xs font-bold border text-left transition cursor-pointer ${
                    loopMode === 'LOOP2'
                      ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300 shadow shadow-emerald-500/20'
                      : 'bg-emerald-950/25 border-emerald-500/40 text-emerald-400 hover:bg-emerald-900/40'
                  }`}
                >
                  [×2] ЦИКЛ ×2 (0с)
                </button>
                <button
                  data-testid="loop-mode-3"
                  onClick={() => handleSelectLoopMode('LOOP3')}
                  className={`p-1.5 rounded text-xs font-bold border text-left transition cursor-pointer ${
                    loopMode === 'LOOP3'
                      ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300 shadow shadow-emerald-500/20'
                      : 'bg-emerald-950/25 border-emerald-500/40 text-emerald-400 hover:bg-emerald-900/40'
                  }`}
                >
                  [×3] ЦИКЛ ×3 (0с)
                </button>
                <button
                  onClick={() => addCmd('FWD1')}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-300 text-xs rounded font-bold text-left transition cursor-pointer"
                >
                  ↑ ВПЕРЕД 1 (1с)
                </button>
                <button
                  onClick={() => addCmd('FWD2')}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-300 text-xs rounded font-bold text-left transition cursor-pointer"
                >
                  ↑↑ ВПЕРЕД 2 (2с)
                </button>
                <button
                  onClick={() => addCmd('RIGHT')}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-300 text-xs rounded font-bold text-left transition cursor-pointer"
                >
                  → ВПРАВО 90° (1с)
                </button>
                <button
                  onClick={() => addCmd('LEFT')}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-300 text-xs rounded font-bold text-left transition cursor-pointer"
                >
                  ← ВЛЕВО 90° (1с)
                </button>
                <button
                  onClick={() => addCmd('Z_UP')}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-cyan-500/50 text-cyan-300 text-xs rounded font-bold text-left transition cursor-pointer"
                >
                  ▲ ПОДЪЕМ Z (+1)
                </button>
                {difficulty === 'hard' && (
                  <button
                    onClick={() => addCmd('HYPER')}
                    className="p-1.5 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-400 text-cyan-200 text-xs rounded font-bold text-left transition cursor-pointer"
                  >
                    ◆ 4D-ПЕРЕХОД W
                  </button>
                )}
              </div>

              {/* Step 2: Program Buffer */}
              <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
                <span className="text-xs text-amber-300 font-bold uppercase tracking-wider">
                  2. Буфер программы ({totalCells} ячеек):
                </span>
                <div className="flex items-center gap-1.5">
                  {loopMode !== 'NONE' && outsideCells > 0 && (
                    <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800 text-[10px]">
                      <button
                        type="button"
                        data-testid="insert-target-inside"
                        onClick={() => setInsertTarget('INSIDE')}
                        className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                          insertTarget === 'INSIDE'
                            ? 'bg-emerald-500 text-black'
                            : 'text-emerald-300 hover:bg-slate-800'
                        }`}
                      >
                        + В цикл
                      </button>
                      <button
                        type="button"
                        data-testid="insert-target-outside"
                        onClick={() => setInsertTarget('OUTSIDE')}
                        className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                          insertTarget === 'OUTSIDE'
                            ? 'bg-amber-400 text-black'
                            : 'text-amber-300 hover:bg-slate-800'
                        }`}
                      >
                        + Вне цикла
                      </button>
                    </div>
                  )}
                  {loopMode !== 'NONE' && (
                    <button
                      type="button"
                      data-testid="loop-mode-none"
                      onClick={() => handleSelectLoopMode('NONE')}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer"
                    >
                      × Убрать цикл
                    </button>
                  )}
                </div>
              </div>

              {/* Code Editor:
                  - Easy ('normal'): 6 cells total (Шаг #1 Loop + Шаг #2..#6 Inside Loop, NO Outside-Loop section)
                  - Hard ('hard'): 8 cells total (Шаг #1 Loop + Шаг #2..#5 Inside Loop + Шаг #6..#8 Outside Loop)
              */}
              <div className="space-y-2 mb-3 max-h-72 overflow-y-auto pr-1">
                {loopMode !== 'NONE' ? (
                  <>
                    <div
                      onClick={() => outsideCells > 0 && setInsertTarget('INSIDE')}
                      data-testid="rover-loop-block"
                      className={`border-l-4 pl-2.5 pr-2 py-2 rounded-r transition ${
                        outsideCells === 0 || insertTarget === 'INSIDE'
                          ? 'border-emerald-400 bg-emerald-950/20 ring-1 ring-emerald-500/40'
                          : 'border-emerald-600/60 bg-emerald-950/10 opacity-90 cursor-pointer'
                      }`}
                    >
                      {/* Cell #1: Loop Header */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectLoopMode('NONE');
                        }}
                        className="flex items-center justify-between px-2 py-1.5 mb-1.5 rounded bg-emerald-950/80 border border-emerald-400/70 text-xs font-bold text-emerald-300 cursor-pointer"
                      >
                        <span>
                          Шаг #1: {CMD_DICT[loopMode]?.label} — ТЕЛО ЦИКЛА ({loopMode === 'LOOP3' ? '×3 раза' : '×2 раза'}) {'{'}
                        </span>
                        <span className="text-emerald-200 hover:text-white px-1">×</span>
                      </div>

                      {/* Cells #2..#(1 + loopBodyCells): Indented Loop Body */}
                      <div className="space-y-1 pl-3 border-l-2 border-emerald-500/40 ml-1">
                        {cmdBuffer.slice(0, loopBodyCells).map((cmd, idx) => (
                          <div
                            key={`loop-slot-${idx}`}
                            data-testid={`rover-slot-${idx + 2}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (cmd) clearSlot(idx);
                              else if (outsideCells > 0) setInsertTarget('INSIDE');
                            }}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs border transition cursor-pointer ${
                              cmd
                                ? CMD_DICT[cmd]?.isHyper
                                  ? 'bg-cyan-950/50 border-cyan-400 text-cyan-200 font-bold'
                                  : 'bg-slate-900/95 border-emerald-500/50 text-emerald-200 font-bold'
                                : 'bg-black/40 border-dashed border-emerald-800/60 text-slate-500'
                            }`}
                          >
                            <span className="truncate">
                              |→ Шаг #{idx + 2} (в цикле): {cmd ? CMD_DICT[cmd]?.label : '[ ПУСТО — ВНУТРИ ЦИКЛА ]'}
                            </span>
                            {cmd && (
                              <span className="flex items-center gap-1.5 shrink-0 ml-1">
                                {outsideCells > 0 && (
                                  <button
                                    type="button"
                                    title="Переместить команду за пределы цикла (вне цикла)"
                                    onClick={(e) => moveInsideToOutside(idx, e)}
                                    className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/40"
                                  >
                                    ↓ Вне
                                  </button>
                                )}
                                <span className="text-slate-400 hover:text-white px-1">×</span>
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="text-[11px] font-bold text-emerald-400/90 mt-1.5 pl-1">
                        {'}'} // конец цикла — шаги #2..#{loopBodyCells + 1} повторяются {loopMode === 'LOOP3' ? '3 раза' : '2 раза'}
                      </div>
                    </div>

                    {/* Hard Mode Exception: Outside-Loop Section (Steps #6..#8, 3 cells) */}
                    {outsideCells > 0 && (
                      <div
                        onClick={() => setInsertTarget('OUTSIDE')}
                        data-testid="rover-outside-block"
                        className={`border-l-4 pl-2.5 pr-2 py-2 rounded-r transition cursor-pointer ${
                          insertTarget === 'OUTSIDE'
                            ? 'border-amber-400 bg-amber-950/20 ring-1 ring-amber-500/40'
                            : 'border-slate-700 bg-slate-900/40 opacity-90'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold text-amber-300 mb-1.5">
                          <span>↓ ВНЕ ЦИКЛА (шаги #{loopBodyCells + 2}..#{totalCells} — после цикла 1 раз):</span>
                          {insertTarget === 'OUTSIDE' && (
                            <span className="text-[9px] bg-amber-500/20 text-amber-200 px-1.5 py-0.5 rounded border border-amber-500/40">
                              ввод сюда
                            </span>
                          )}
                        </div>

                        <div className="space-y-1">
                          {outsideBuffer.map((cmd, idx) => (
                            <div
                              key={`outside-slot-${idx}`}
                              data-testid={`rover-slot-${loopBodyCells + 2 + idx}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (cmd) clearOutsideSlot(idx);
                                else setInsertTarget('OUTSIDE');
                              }}
                              className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs border transition cursor-pointer ${
                                cmd
                                  ? CMD_DICT[cmd]?.isHyper
                                    ? 'bg-cyan-950/50 border-cyan-400 text-cyan-200 font-bold'
                                    : 'bg-slate-900 border-amber-500/50 text-amber-300 font-bold'
                                  : 'bg-black/40 border-dashed border-slate-700 text-slate-500'
                              }`}
                            >
                              <span className="truncate">
                                Шаг #{loopBodyCells + 2 + idx} (вне цикла): {cmd ? CMD_DICT[cmd]?.label : '[ ПУСТО — ВНЕ ЦИКЛА ]'}
                              </span>
                              {cmd && (
                                <span className="flex items-center gap-1.5 shrink-0 ml-1">
                                  <button
                                    type="button"
                                    title="Поместить команду внутрь цикла"
                                    onClick={(e) => moveOutsideToInside(idx, e)}
                                    className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 border border-emerald-500/40"
                                  >
                                    ↑ В цикл
                                  </button>
                                  <span className="text-slate-400 hover:text-white px-1">×</span>
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Linear mode (no loop selected): all totalCells (6 in normal, 8 in hard) */
                  <div className="space-y-1.5" data-testid="rover-linear-block">
                    {cmdBuffer.slice(0, totalCells).map((cmd, idx) => (
                      <div
                        key={`linear-slot-${idx}`}
                        data-testid={`rover-slot-${idx + 1}`}
                        onClick={() => clearSlot(idx)}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs border cursor-pointer transition ${
                          cmd
                            ? CMD_DICT[cmd]?.isHyper
                              ? 'bg-cyan-950/40 border-cyan-400 text-cyan-300 font-bold'
                              : 'bg-slate-900 border-amber-500/50 text-amber-300 font-bold'
                            : 'bg-black/40 border-dashed border-slate-700 text-slate-600'
                        }`}
                      >
                        <span>
                          Шаг #{idx + 1}: {cmd ? CMD_DICT[cmd]?.label : '[ ПУСТО ]'}
                        </span>
                        {cmd && <span className="text-slate-400 hover:text-white">×</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Run / Reset Buttons */}
            <div className="flex gap-2">
              <button
                disabled={isSimulating}
                onClick={runSimulation}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase rounded flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition cursor-pointer"
              >
                <Play className="w-4 h-4 fill-black" />
                <span>ЗАПУСК РОВЕРА</span>
              </button>
              <button
                disabled={isSimulating}
                onClick={resetRover}
                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded font-bold flex items-center gap-1 transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>СБРОС</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-4">
          <div className="flex items-center gap-2">
            {solved ? (
              <span className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                НАВИГАЦИЯ ЗАВЕРШЕНА // ВРЕМЯ РОВЕРА = {roverState.time} СЕК
              </span>
            ) : (
              <span className="flex items-center gap-2 text-amber-400 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Составьте программу, чтобы собрать все маяки и достичь [F] за ≤ {maxAllowedTime} с
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className={`px-5 py-2 rounded text-xs font-bold uppercase tracking-wider transition ${
              solved
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {solved ? 'Зафиксировать и выйти' : 'Закрыть терминал'}
          </button>
        </div>
      </div>
    </div>
  );
};
