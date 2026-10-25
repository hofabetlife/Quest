import React, { useState, useEffect, useRef } from 'react';
import { Difficulty } from '../../types.ts';
import {
  evaluateNode1Task3Attempt,
  getExpectedNode1Params,
  isNode1AllCorrect,
  NODE1_TASK3_MAX,
  NODE1_TASK3_MAX_ATTEMPTS,
  NODE1_TASK3_MIN,
  NODE1_TASK3_STEP,
  Node1Params,
} from '../../game/questLogic.ts';
import { sound } from '../../utils/audio.ts';
import { CheckCircle2, Zap, AlertTriangle, X, Download, ShieldAlert } from 'lucide-react';

interface Node1Props {
  difficulty: Difficulty;
  isSolved: boolean;
  onSolve: (params: { u: number; f: number; i: number }) => void;
  onUnsolve?: (params: { u: number; f: number; i: number }) => void;
  onClose: () => void;
}

export const Node1Electrical: React.FC<Node1Props> = ({
  difficulty,
  isSolved,
  onSolve,
  onUnsolve,
  onClose,
}) => {
  const initialValues = isSolved
    ? getExpectedNode1Params(difficulty)
    : { u: 50, f: 100, i: 40 };

  const [sliderU, setSliderU] = useState<number>(initialValues.u);
  const [sliderF, setSliderF] = useState<number>(initialValues.f);
  const [sliderI, setSliderI] = useState<number>(initialValues.i);
  const [committedParams, setCommittedParams] = useState<Node1Params>(initialValues);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [diagramDataUrl, setDiagramDataUrl] = useState<string>('');
  const [task3AttemptsLeft, setTask3AttemptsLeft] = useState<number>(NODE1_TASK3_MAX_ATTEMPTS);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<number>(0);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  // Dynamic check: green ONLY when all 3 sliders are currently at the right values and committed!
  const allThreeCorrect = isNode1AllCorrect(
    { u: sliderU, f: sliderF, i: sliderI },
    committedParams,
    isDragging,
    difficulty
  );

  const fname =
    difficulty === 'hard'
      ? 'b737_idg_kva_plus_tru_count_x5.png'
      : 'b737_tr3_limit_65_amp.png';

  // Generate artifact diagram image with clue encoded in filename (exact original quest mechanic)
  useEffect(() => {
    const off = document.createElement('canvas');
    off.width = 480;
    off.height = 160;
    const c = off.getContext('2d');
    if (!c) return;

    c.fillStyle = '#040609';
    c.fillRect(0, 0, 480, 160);
    c.strokeStyle = '#111a24';
    for (let x = 0; x < 480; x += 20) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 160);
      c.stroke();
    }
    for (let y = 0; y < 160; y += 20) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(480, y);
      c.stroke();
    }

    ['rgba(240,185,11,0.5)', 'rgba(0,255,157,0.6)', 'rgba(56,189,248,0.5)'].forEach(
      (col, idx) => {
        c.strokeStyle = col;
        c.beginPath();
        for (let x = 0; x < 480; x++) {
          const y =
            80 +
            Math.sin(x * (difficulty === 'hard' ? 0.16 : 0.11) + idx * 2) *
              48 *
              Math.exp(-x / 190);
          if (x === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
    );

    c.fillStyle = '#5a6b7c';
    c.font = '11px Courier New';
    c.fillText('B737-800 NG // NO PARALLEL AC BUS TIE LOGIC', 16, 20);

    const dataUrl = off.toDataURL('image/png') + '#' + fname;
    setDiagramDataUrl(dataUrl);
  }, [difficulty, fname]);

  // Commit and validate parameters when the user RELEASES the slider or commits an input.
  // Includes anti-bruteforce relay protection on Task 3 (step=1, max 3 wrong attempts before reset + lockout).
  const handleCommitSliders = (uVal = sliderU, fVal = sliderF, iVal = sliderI) => {
    if (lockoutSeconds > 0) return;
    setIsDragging(false);
    const clampedI = Math.max(NODE1_TASK3_MIN, Math.min(NODE1_TASK3_MAX, Math.round(iVal || NODE1_TASK3_MIN)));
    const draft = { u: uVal, f: fVal, i: clampedI };
    const res = evaluateNode1Task3Attempt(committedParams, draft, difficulty, task3AttemptsLeft);

    setCommittedParams(res.nextCommitted);
    setTask3AttemptsLeft(res.attemptsLeft);

    if (res.trippedProtection) {
      sound.playWarn();
      setSliderU(res.nextCommitted.u);
      setSliderF(res.nextCommitted.f);
      setSliderI(res.nextCommitted.i);
      setLockoutSeconds(6);
      if (onUnsolve) {
        onUnsolve(res.nextCommitted);
      }
      return;
    }

    if (res.solved) {
      sound.playTaskSuccess();
      onSolve(res.nextCommitted);
    } else if (onUnsolve) {
      onUnsolve(res.nextCommitted);
    }
  };

  // Animated Oscilloscope Canvas
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Grid
      ctx.strokeStyle = '#121e2c';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Centerline
      ctx.strokeStyle = '#1e3046';
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      // Oscilloscope Trace
      ctx.beginPath();
      ctx.strokeStyle = allThreeCorrect ? '#00ff9d' : '#ff4757';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = allThreeCorrect ? '#00ff9d' : '#ff4757';
      ctx.shadowBlur = 8;

      for (let x = 0; x < canvas.width; x++) {
        const noise = allThreeCorrect ? 0 : Math.sin(x * 0.25 - phaseRef.current * 2) * 8;
        const y =
          canvas.height / 2 +
          Math.sin(x * (committedParams.f / 4000) + phaseRef.current) * (committedParams.u / 4.2) +
          Math.cos(x * (committedParams.i / 1000) - phaseRef.current) * 12 +
          noise;

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      phaseRef.current += 0.05;
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [allThreeCorrect, committedParams]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[94vh] flex flex-col bg-slate-950 border border-amber-500/40 rounded-lg shadow-2xl p-4 md:p-5 font-mono text-slate-200 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-amber-400" />
            <div>
              <h2 className="text-base md:text-lg font-bold text-amber-300 uppercase tracking-wider">
                I. РАСЧЁТ ЭЛЕКТРОСИСТЕМЫ САМОЛЁТА BOEING 737 NG
              </h2>
              <p className="text-xs text-slate-400">
                {allThreeCorrect
                  ? 'ШИНЫ СИНХРОНИЗИРОВАНЫ (ВСЕ 3 ПАРАМЕТРА ВЕРНЫ)'
                  : 'ТРЕБУЕТСЯ РАСЧЁТ НАГРУЗКИ (ОТПУСТИТЕ ПОЛЗУНОК ДЛЯ ФИКСАЦИИ ОТВЕТА)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть терминал Узла 1"
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Task description & Physics brief (Original text without spoilers) */}
        <div className="bg-slate-900/80 border-l-4 border-amber-500 p-3 rounded text-xs text-slate-300 mb-3 leading-relaxed space-y-1.5">
          {difficulty === 'normal' ? (
            <>
              <p>
                Выполните расчёт контура генератора IDG самолёта <strong>Boeing 737 NG</strong>:
              </p>
              <p>
                1. <strong>Фазный ток генератора (I<sub>фаз</sub>, А)</strong>: Трехфазный генератор IDG
                питает симметричную активную нагрузку суммарной мощностью <strong>34,5 кВт</strong> (34 500 Вт)
                при стандартном фазном напряжении бортовой сети <strong>115 В</strong> (cos φ = 1). Вычислите ток
                в <em>одной фазе</em>.
              </p>
              <p>
                2. <strong>Частота вращения ротора (ν, об/с)</strong>: Сколько оборотов <em>в секунду</em>{' '}
                совершает ротор синхронного генератора с <strong>2 парами полюсов (p = 2)</strong> для выработки
                стандартной бортовой частоты 400 Гц?
              </p>
              <p>
                3. <strong>Уставка тока TR3 (I<sub>TR3</sub>, А)</strong>: Порог срабатывания токовой защиты
                выпрямительного блока TR3 (Transformer-Rectifier Unit).
              </p>
            </>
          ) : (
            <>
              <p>
                Выполните расчёт аварийного и нагрузочного режимов электросистемы <strong>Boeing 737 NG</strong>:
              </p>
              <p>
                1. <strong>Ток разряда АКБ на инвертор (I<sub>АКБ</sub>, А)</strong>: При отказе генераторов в
                режиме <code>STANDBY POWER</code> на Boeing 737 шина <em>AC Standby Bus</em> питается от{' '}
                <strong>24-вольтовой батареи</strong> через статический инвертор (Static Inverter) с{' '}
                <strong>КПД η = 80% (0,8)</strong>. Потребляемая приборами выходная мощность составляет{' '}
                <strong>1 440 Вт</strong>. Какой ток (в А) инвертор потребляет от 24-вольтовой батареи с учётом КПД?
              </p>
              <p>
                2. <strong>Полный фазный ток IDG-1 (I<sub>полн</sub>, А)</strong>: Трехфазный генератор IDG-1
                питает нагрузку суммарной активной мощностью <strong>41,4 кВт</strong> (41 400 Вт) при
                коэффициенте мощности <strong>cos φ = 0,8</strong> и фазном напряжении <strong>115 В</strong>.
                Вычислите полный ток в одной фазе генератора.
              </p>
              <p>
                3. <strong>Код контроллера BTB (K<sub>BTB</sub>)</strong>: Контрольный параметр логики шины
                межгенераторной связи (Bus Tie Breaker).
              </p>
            </>
          )}
        </div>

        {/* Diagram & Live Oscilloscope side-by-side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {/* Original Artifact Diagram Box with Image Download */}
          <div className="bg-[#05070a] border border-slate-800 p-2.5 rounded text-center flex flex-col justify-between">
            {diagramDataUrl && (
              <img
                id="topologyImg"
                src={diagramDataUrl}
                alt={fname}
                data-filename={fname}
                width={480}
                height={160}
                className="max-w-full h-24 object-cover border border-slate-800 block mx-auto mb-1.5"
              />
            )}
            <div className="text-[11px] text-slate-400 flex items-center justify-between px-1">
              <span id="diagramCaption">Диаграмма шины B737 BTCU</span>
              <a
                id="downloadDiagram"
                href={diagramDataUrl}
                download={fname}
                className="text-amber-400 hover:text-amber-300 border-b border-dotted border-amber-400 inline-flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                <span>[ Скачать схему ]</span>
              </a>
            </div>
          </div>

          {/* Live Oscilloscope Display */}
          <div className="relative bg-black border border-slate-800 rounded p-2 flex flex-col justify-between">
            <div
              className={`text-[10px] font-mono tracking-widest flex items-center justify-between mb-1 px-1 ${
                allThreeCorrect ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    allThreeCorrect ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'
                  }`}
                ></span>
                <span>АСКУ // ОСЦИЛЛОГРАММА ШИНЫ B737</span>
              </span>
              <span className="text-[10px] text-slate-500">
                {isDragging
                  ? 'ОЖИДАНИЕ ФИКСАЦИИ...'
                  : `ЗАФИКСИРОВАНО: ${committedParams.u}/${committedParams.f}/${committedParams.i}`}
              </span>
            </div>
            <canvas ref={canvasRef} width={480} height={96} className="w-full h-24 rounded bg-slate-950" />
          </div>
        </div>

        {/* Sliders: Values & cards turn green ONLY when ALL THREE answers are currently correct! */}
        <div className="space-y-2.5 mb-3">
          <div
            className={`p-2.5 rounded border transition-colors ${
              allThreeCorrect
                ? 'bg-emerald-950/25 border-emerald-500/60'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex justify-between text-xs mb-1">
              <label htmlFor="node1-slider-u" className="text-slate-300">
                {difficulty === 'normal'
                  ? '1. Фазный ток генератора I_фаз (А)'
                  : '1. Ток батареи 24В на входе инвертора I_АКБ (А)'}
              </label>
              <span
                data-testid="node1-val-u"
                className={`font-bold text-sm transition-colors ${
                  allThreeCorrect ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {allThreeCorrect ? `✓ ${sliderU}` : sliderU}
                {sliderU !== committedParams.u && (
                  <span className="ml-1.5 text-[10px] text-amber-400 font-normal">
                    (отпустите для фиксации)
                  </span>
                )}
              </span>
            </div>
            <input
              id="node1-slider-u"
              type="range"
              min="5"
              max="250"
              step="5"
              value={sliderU}
              onPointerDown={() => setIsDragging(true)}
              onMouseDown={() => setIsDragging(true)}
              onTouchStart={() => setIsDragging(true)}
              onChange={(e) => setSliderU(parseInt(e.target.value, 10))}
              onPointerUp={(e) =>
                handleCommitSliders(parseInt((e.target as HTMLInputElement).value, 10), sliderF, sliderI)
              }
              onMouseUp={(e) =>
                handleCommitSliders(parseInt((e.target as HTMLInputElement).value, 10), sliderF, sliderI)
              }
              onTouchEnd={() => handleCommitSliders(sliderU, sliderF, sliderI)}
              onKeyUp={() => handleCommitSliders(sliderU, sliderF, sliderI)}
              onBlur={() => handleCommitSliders(sliderU, sliderF, sliderI)}
              className={`w-full cursor-pointer h-2 bg-slate-800 rounded-lg appearance-none ${
                allThreeCorrect ? 'accent-emerald-400' : 'accent-amber-500'
              }`}
            />
          </div>

          <div
            className={`p-2.5 rounded border transition-colors ${
              allThreeCorrect
                ? 'bg-emerald-950/25 border-emerald-500/60'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex justify-between text-xs mb-1">
              <label htmlFor="node1-slider-f" className="text-slate-300">
                {difficulty === 'normal'
                  ? '2. Скорость ротора при p=2 (об/с)'
                  : '2. Полный фазный ток IDG при 41.4 кВт и cos φ=0.8 (А)'}
              </label>
              <span
                data-testid="node1-val-f"
                className={`font-bold text-sm transition-colors ${
                  allThreeCorrect ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {allThreeCorrect ? `✓ ${sliderF}` : sliderF}
                {sliderF !== committedParams.f && (
                  <span className="ml-1.5 text-[10px] text-amber-400 font-normal">
                    (отпустите для фиксации)
                  </span>
                )}
              </span>
            </div>
            <input
              id="node1-slider-f"
              type="range"
              min="10"
              max="350"
              step="5"
              value={sliderF}
              onPointerDown={() => setIsDragging(true)}
              onMouseDown={() => setIsDragging(true)}
              onTouchStart={() => setIsDragging(true)}
              onChange={(e) => setSliderF(parseInt(e.target.value, 10))}
              onPointerUp={(e) =>
                handleCommitSliders(sliderU, parseInt((e.target as HTMLInputElement).value, 10), sliderI)
              }
              onMouseUp={(e) =>
                handleCommitSliders(sliderU, parseInt((e.target as HTMLInputElement).value, 10), sliderI)
              }
              onTouchEnd={() => handleCommitSliders(sliderU, sliderF, sliderI)}
              onKeyUp={() => handleCommitSliders(sliderU, sliderF, sliderI)}
              onBlur={() => handleCommitSliders(sliderU, sliderF, sliderI)}
              className={`w-full cursor-pointer h-2 bg-slate-800 rounded-lg appearance-none ${
                allThreeCorrect ? 'accent-emerald-400' : 'accent-amber-500'
              }`}
            />
          </div>

          <div
            className={`p-2.5 rounded border transition-colors ${
              lockoutSeconds > 0
                ? 'bg-rose-950/30 border-rose-500/60'
                : allThreeCorrect
                  ? 'bg-emerald-950/25 border-emerald-500/60'
                  : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
              <div className="flex items-center gap-2">
                <label htmlFor="node1-slider-i" className="text-slate-300">
                  {difficulty === 'normal'
                    ? '3. Уставка защиты выпрямителя TR3 (А)'
                    : '3. Код контроллера BTB (K_BTB)'}
                </label>
                <span
                  data-testid="node1-task3-attempts"
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    lockoutSeconds > 0
                      ? 'bg-rose-950/80 border-rose-500 text-rose-300 font-bold'
                      : task3AttemptsLeft === 1
                        ? 'bg-rose-950/50 border-rose-500/50 text-rose-300'
                        : 'bg-slate-950 border-slate-700 text-slate-400'
                  }`}
                >
                  {lockoutSeconds > 0
                    ? `БЛОКИРОВКА ПЕРЕБОРА: ${lockoutSeconds} с`
                    : `Защита от перебора: ${task3AttemptsLeft}/${NODE1_TASK3_MAX_ATTEMPTS} поп.`}
                </span>
              </div>

              <span
                data-testid="node1-val-i"
                className={`font-bold text-sm transition-colors ${
                  allThreeCorrect ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {allThreeCorrect ? `✓ ${sliderI}` : sliderI}
                {sliderI !== committedParams.i && (
                  <span className="ml-1.5 text-[10px] text-amber-400 font-normal">
                    (отпустите для фиксации)
                  </span>
                )}
              </span>
            </div>
            <input
              id="node1-slider-i"
              type="range"
              min={NODE1_TASK3_MIN}
              max={NODE1_TASK3_MAX}
              step={NODE1_TASK3_STEP}
              disabled={lockoutSeconds > 0}
              value={sliderI}
              onPointerDown={() => setIsDragging(true)}
              onMouseDown={() => setIsDragging(true)}
              onTouchStart={() => setIsDragging(true)}
              onChange={(e) => setSliderI(parseInt(e.target.value, 10))}
              onPointerUp={(e) =>
                handleCommitSliders(sliderU, sliderF, parseInt((e.target as HTMLInputElement).value, 10))
              }
              onMouseUp={(e) =>
                handleCommitSliders(sliderU, sliderF, parseInt((e.target as HTMLInputElement).value, 10))
              }
              onTouchEnd={() => handleCommitSliders(sliderU, sliderF, sliderI)}
              onKeyUp={() => handleCommitSliders(sliderU, sliderF, sliderI)}
              onBlur={() => handleCommitSliders(sliderU, sliderF, sliderI)}
              className={`w-full cursor-pointer h-2 bg-slate-800 rounded-lg appearance-none disabled:opacity-50 ${
                allThreeCorrect ? 'accent-emerald-400' : 'accent-amber-500'
              }`}
            />
            {lockoutSeconds > 0 && (
              <div
                data-testid="node1-lockout-banner"
                className="mt-1.5 flex items-center gap-1.5 text-[11px] text-rose-300 bg-rose-950/60 border border-rose-500/40 px-2 py-1 rounded"
              >
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  Сработала защита BTCU от подбора параметра №3! Значения сброшены ({lockoutSeconds} с). Изучите схему шины B737 BTCU.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Status / Output Result */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-3">
          <div className="flex items-center gap-2">
            {allThreeCorrect ? (
              <span className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ШИНЫ СИНХРОНИЗИРОВАНЫ // ЗАПИСАНО В ЖУРНАЛ
              </span>
            ) : (
              <span className="flex items-center gap-2 text-amber-400 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Отпустите ползунок на рассчитанном значении для проверки и фиксации ответа
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className={`px-5 py-2 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
              allThreeCorrect
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {allThreeCorrect ? 'Зафиксировать и выйти' : 'Закрыть терминал'}
          </button>
        </div>
      </div>
    </div>
  );
};
