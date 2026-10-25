import React, { useState, useEffect, useRef } from 'react';
import { Difficulty } from '../../types.ts';
import { checkNucleoPhase } from '../../game/questLogic.ts';
import { sound } from '../../utils/audio.ts';
import { Atom, CheckCircle2, AlertTriangle, X } from 'lucide-react';

interface Node4Props {
  difficulty: Difficulty;
  isSolved: boolean;
  onSolve: (data: { massNumberA: number }) => void;
  onClose: () => void;
}

export const Node4Nucleosynthesis: React.FC<Node4Props> = ({
  difficulty,
  isSolved,
  onSolve,
  onClose,
}) => {
  const [phase, setPhase] = useState<number>(1);
  const [pCount, setPCount] = useState<number>(1);
  const [nCount, setNCount] = useState<number>(1);
  const [eCount, setECount] = useState<number>(1);
  const [message, setMessage] = useState<string>('Соберите конфигурацию первой фазы и нажмите «Зафиксировать»');
  const [solved, setSolved] = useState<boolean>(isSolved);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotRef = useRef({ rotX: 0.35, rotY: 0.6, isDragging: false, lastX: 0, lastY: 0, orbitTick: 0 });

  const phaseLabels =
    difficulty === 'normal'
      ? ['ФАЗА 1: ГЕЛИЙ-3 (³He)', 'ФАЗА 2: КАТИОН УГЛЕРОДА-13 (¹³C⁺)', 'ФАЗА 3: ЖЕЛЕЗО-56 (⁵⁶Fe)']
      : ['ФАЗА 1: РЕЛИКТОВЫЙ ИОН (q = +1)', 'ФАЗА 2: ИОН ГОРЕНИЯ УГЛЕРОДА (q = +2)', 'ФАЗА 3: ЯДРО СВЕРХНОВОЙ (q = +3)'];

  const phaseHints =
    difficulty === 'normal'
      ? [
          'ФАЗА 1 (Солнечный p-p цикл): Синтезируйте нейтральный атом лёгкого изотопа Гелий-3 (³He, q = 0). Подберите верное число протонов, нейтронов и электронов.',
          'ФАЗА 2 (CNO-цикл звёзд): Синтезируйте однократно ионизированный катион изотопа Углерод-13 (¹³C⁺, заряд иона q = +1).',
          'ФАЗА 3 (Предел экзотермического синтеза): Синтезируйте нейтральный атом стабильного изотопа Железо-56 (⁵⁶Fe, q = 0). Запомните итоговое массовое число A!',
        ]
      : [
          'ФАЗА 1 (Первичный нуклеосинтез): Однократно ионизированный катион (q = +1) самого распространённого стабильного изотопа первого щелочного металла таблицы Менделеева (в ядре нейтронов на 1 больше, чем протонов).',
          'ФАЗА 2 (Горение углерода): Двукратно ионизированный катион (q = +2) единственного стабильного природного изотопа щелочного металла 3-го периода (число нейтронов в ядре на 1 превышает число протонов).',
          'ФАЗА 3 (Железный пик Сверхновой): Трёхкратно ионизированный катион (q = +3) единственного стабильного изотопа ферромагнитного металла, стоящего в таблице Менделеева сразу после железа (нейтронов в ядре на 5 больше, чем протонов). Запомните массовое число A!',
        ];

  const modP = (delta: number) => {
    sound.playTerminalClick();
    setPCount((prev) => Math.max(1, Math.min(40, prev + delta)));
  };
  const modN = (delta: number) => {
    sound.playTerminalClick();
    setNCount((prev) => Math.max(0, Math.min(45, prev + delta)));
  };
  const modE = (delta: number) => {
    sound.playTerminalClick();
    setECount((prev) => Math.max(1, Math.min(40, prev + delta)));
  };

  const handleFixIsotope = () => {
    const isOk = checkNucleoPhase(phase, pCount, nCount, eCount, difficulty);

    if (isOk) {
      sound.playTaskSuccess();
      if (phase === 1) {
        setPhase(2);
        setMessage('ФАЗА 1 ПОДТВЕРЖДЕНА! Синтезируйте изотоп Фазы 2.');
      } else if (phase === 2) {
        setPhase(3);
        setMessage('ФАЗА 2 ПОДТВЕРЖДЕНА! Синтезируйте финальный изотоп Фазы 3.');
      } else if (phase === 3) {
        setSolved(true);
        const massA = pCount + nCount;
        setMessage(`СИНТЕЗ ЗАВЕРШЕН! Массовое число изотопа A = ${massA}.`);
        onSolve({ massNumberA: massA });
      }
    } else {
      sound.playWarn();
      setMessage('ОШИБКА: Проверьте число протонов (p+), нейтронов (n0) и заряд иона q = p+ - e-!');
    }
  };

  // 3D Canvas Rendering
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const project3D = (x: number, y: number, z: number, rY: number, rX: number) => {
      const x1 = x * Math.cos(rY) - z * Math.sin(rY);
      const z1 = z * Math.cos(rY) + x * Math.sin(rY);
      const y2 = y * Math.cos(rX) - z1 * Math.sin(rX);
      const z2 = z1 * Math.cos(rX) + y * Math.sin(rX);
      const scale = 320 / (480 + z2);
      return {
        x: canvas.width / 2 + x1 * scale,
        y: canvas.height / 2 + y2 * scale,
        z: z2,
        scale,
      };
    };

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!rotRef.current.isDragging) {
        rotRef.current.rotY += 0.008;
      }
      rotRef.current.orbitTick += 0.035;

      const rX = rotRef.current.rotX;
      const rY = rotRef.current.rotY;
      const oTick = rotRef.current.orbitTick;

      interface ParticleItem {
        type: 'proton' | 'neutron' | 'electron';
        x: number;
        y: number;
        z: number;
        r: number;
      }

      const queue: ParticleItem[] = [];
      const totalNucleons = pCount + nCount;
      const nucR = Math.min(32, 6 + Math.pow(totalNucleons, 0.38) * 5.5);
      const gAngle = Math.PI * (3 - Math.sqrt(5));

      // Nucleus particles
      for (let i = 0; i < totalNucleons; i++) {
        const yN = totalNucleons === 1 ? 0 : 1 - (i / (totalNucleons - 1)) * 2;
        const rS = Math.sqrt(Math.max(0, 1 - yN * yN));
        const th = gAngle * i;
        const dist = nucR * Math.cbrt(((i % 3) + 1) / 3);
        const p = project3D(Math.cos(th) * rS * dist, yN * dist, Math.sin(th) * rS * dist, rY, rX);
        const isProton = (i % 2 === 0 && i / 2 < pCount) || i >= nCount * 2;
        queue.push({
          type: isProton ? 'proton' : 'neutron',
          x: p.x,
          y: p.y,
          z: p.z,
          r: Math.max(4, 7 * p.scale),
        });
      }

      // Orbiting electron shells
      const shellCap = [2, 8, 14, 16];
      let remE = eCount;
      const tilts = [
        [0.4, 0.2],
        [-0.5, 0.6],
        [0.8, -0.4],
        [-0.2, -0.8],
      ];

      for (let s = 0; s < 4 && remE > 0; s++) {
        const count = Math.min(remE, shellCap[s]);
        remE -= count;
        const oR = 54 + s * 24;
        const [tX, tZ] = tilts[s];

        // Orbit ring
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 255, 157, 0.18)';
        ctx.lineWidth = 1;
        for (let step = 0; step <= 36; step++) {
          const a = (Math.PI * 2 * step) / 36;
          const ox = Math.cos(a) * oR;
          const oy = Math.sin(a) * oR * Math.sin(tX);
          const oz = Math.sin(a) * oR * Math.cos(tX);
          const p = project3D(ox * Math.cos(tZ) - oy * Math.sin(tZ), ox * Math.sin(tZ) + oy * Math.cos(tZ), oz, rY, rX);
          if (step === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();

        // Electrons on orbit
        for (let k = 0; k < count; k++) {
          const a = (Math.PI * 2 * k) / count + oTick * (1.3 - s * 0.2);
          const ox = Math.cos(a) * oR;
          const oy = Math.sin(a) * oR * Math.sin(tX);
          const oz = Math.sin(a) * oR * Math.cos(tX);
          const p = project3D(ox * Math.cos(tZ) - oy * Math.sin(tZ), ox * Math.sin(tZ) + oy * Math.cos(tZ), oz, rY, rX);
          queue.push({
            type: 'electron',
            x: p.x,
            y: p.y,
            z: p.z,
            r: Math.max(3, 4.2 * p.scale),
          });
        }
      }

      // Depth sort and draw
      queue.sort((a, b) => b.z - a.z);
      queue.forEach((item) => {
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
        ctx.fillStyle =
          item.type === 'proton' ? '#ff4757' : item.type === 'neutron' ? '#3b82f6' : '#00ff9d';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = item.type === 'electron' ? 8 : 4;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [pCount, nCount, eCount]);

  const charge = pCount - eCount;
  const massA = pCount + nCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-slate-950 border border-rose-500/40 rounded-lg shadow-2xl p-5 md:p-6 font-mono text-slate-200 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <Atom className="w-6 h-6 text-rose-400" />
            <div>
              <h2 className="text-lg font-bold text-rose-300 uppercase tracking-wider">
                Узел IV: Панель Управления Токамаком (Холодный Ядерный Синтез)
              </h2>
              <p className="text-xs text-slate-400">
                Магнитное удержание плазмы в реакторе и синтез изотопов (p+ / n0 / e-)
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

        {/* Phase Pills */}
        <div className="flex gap-2 mb-4">
          {phaseLabels.map((lbl, idx) => {
            const currentPhaseNum = idx + 1;
            const isDone = phase > currentPhaseNum || solved;
            const isActive = phase === currentPhaseNum && !solved;
            return (
              <div
                key={idx}
                className={`flex-1 py-1.5 px-2 text-center text-xs font-bold rounded border transition ${
                  isDone
                    ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                    : isActive
                    ? 'border-amber-400 bg-amber-950/40 text-amber-300'
                    : 'border-slate-800 bg-slate-900/40 text-slate-600'
                }`}
              >
                {lbl}
              </div>
            );
          })}
        </div>

        {/* Phase Task Hint */}
        <div className="bg-slate-900/80 border-l-4 border-rose-500 p-3.5 rounded text-xs text-slate-300 mb-4 leading-relaxed">
          {phaseHints[phase - 1] || 'Синтез всех фаз завершён!'}
        </div>

        {/* 3D Viewport & Controls */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
          {/* Canvas */}
          <div className="md:col-span-6 bg-slate-900/70 p-3 rounded border border-slate-800 flex flex-col items-center">
            <canvas
              ref={canvasRef}
              width={340}
              height={260}
              onMouseDown={(e) => {
                rotRef.current.isDragging = true;
                rotRef.current.lastX = e.clientX;
                rotRef.current.lastY = e.clientY;
              }}
              onMouseMove={(e) => {
                if (!rotRef.current.isDragging) return;
                rotRef.current.rotY += (e.clientX - rotRef.current.lastX) * 0.01;
                rotRef.current.rotX += (e.clientY - rotRef.current.lastY) * 0.01;
                rotRef.current.lastX = e.clientX;
                rotRef.current.lastY = e.clientY;
              }}
              onMouseUp={() => {
                rotRef.current.isDragging = false;
              }}
              className="w-full h-56 rounded bg-black border border-slate-800 cursor-grab active:cursor-grabbing"
            />
            <div className="w-full flex justify-between text-xs mt-2 bg-black/60 px-3 py-1.5 rounded border border-slate-800">
              <span>
                МАССОВОЕ ЧИСЛО (A): <strong className="text-amber-400">{massA}</strong>
              </span>
              <span>
                ЗАРЯД ИОНА (q):{' '}
                <strong className={charge >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {charge > 0 ? `+${charge}` : charge}
                </strong>
              </span>
            </div>
          </div>

          {/* Particle controls */}
          <div className="md:col-span-6 space-y-2.5 flex flex-col justify-between">
            {/* Protons */}
            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
              <div className="flex justify-between items-center text-xs mb-1 font-bold">
                <span className="text-rose-400">● Протоны в ядре (p+):</span>
                <span className="text-rose-300 text-sm">{pCount}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[-5, -1, 1, 5].map((d) => (
                  <button
                    key={d}
                    onClick={() => modP(d)}
                    className="py-1 bg-slate-800 hover:bg-slate-700 text-rose-300 rounded font-bold text-xs"
                  >
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>
            </div>

            {/* Neutrons */}
            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
              <div className="flex justify-between items-center text-xs mb-1 font-bold">
                <span className="text-blue-400">● Нейтроны в ядре (n0):</span>
                <span className="text-blue-300 text-sm">{nCount}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[-5, -1, 1, 5].map((d) => (
                  <button
                    key={d}
                    onClick={() => modN(d)}
                    className="py-1 bg-slate-800 hover:bg-slate-700 text-blue-300 rounded font-bold text-xs"
                  >
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>
            </div>

            {/* Electrons */}
            <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
              <div className="flex justify-between items-center text-xs mb-1 font-bold">
                <span className="text-emerald-400">● Электроны на орбитах (e-):</span>
                <span className="text-emerald-300 text-sm">{eCount}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[-5, -1, 1, 5].map((d) => (
                  <button
                    key={d}
                    onClick={() => modE(d)}
                    className="py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded font-bold text-xs"
                  >
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleFixIsotope}
              className="w-full py-2 bg-rose-500 hover:bg-rose-400 text-black font-black text-xs uppercase rounded transition tracking-wider shadow-lg shadow-rose-500/20"
            >
              ⚛ ЗАФИКСИРОВАТЬ ИЗОТОП
            </button>
          </div>
        </div>

        {/* Message Banner */}
        <div className="text-xs text-center py-2 px-3 rounded bg-black/60 border border-slate-800 text-amber-300 mb-4 font-bold">
          {message}
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-4">
          <div className="flex items-center gap-2">
            {solved ? (
              <span className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                СИНТЕЗ ЗАВЕРШЁН // МАССОВОЕ ЧИСЛО A = {massA}
              </span>
            ) : (
              <span className="flex items-center gap-2 text-amber-400 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Пройдите все 3 фазы нуклеосинтеза
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
