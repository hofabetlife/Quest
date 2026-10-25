import React, { useState, useEffect } from 'react';
import { Difficulty } from '../../types.ts';
import { decodeCaesar, checkNode2, ALPHABET_RU } from '../../game/questLogic.ts';
import { sound } from '../../utils/audio.ts';
import { Compass, CheckCircle2, AlertTriangle, X, ShieldAlert } from 'lucide-react';

interface Node2Props {
  difficulty: Difficulty;
  isSolved: boolean;
  onSolve: (data: { shift: number; slots: number[] }) => void;
  onClose: () => void;
}

const MSG_NORMAL =
  "ЬХЯНЪХТ НЮЯЭЫЧЫЩЬНЮН: ЮШЫЯ I — ЪНЬЭМУТЪХТ НПХНГХЫЪЪЫЦ НЧЧАЩАШМЯЫЭЪЫЦ ОНЯНЭТХ. ЮШЫЯ II — ЯЫЧ ЫОЫРЭТПН ЬПС ЩЫЖЪЫЮЯЙЛ ЯЭХЮЯН ЕТЮЯЙСТЮМЯ ПНЯЯ ЫЯ ЕХЪИ СПНСГНЯЙ ДТЯИЭТ ПЫШЙЯН. ЮШЫЯ III — ЬТЭХЫС ЫОЭНЖТЪХМ НЮЯТЭЫХСН П РЫСНВ ЬЭХ ОЫШЙЕЫЦ ЬЫШАЫЮХ ЫЭОХЯИ ДТЯИЭТ НТ. ЮШЫЯ IV — ЪЫЩТЭ ЬШНЪТЯИ ЛЬХЯТЭ ЫЯ ЮЫШЪГН.";

const MSG_HARD =
  "УХУГЫЬАОЬ ВГБЕБЭБЮ 3301 // ФБГЕ B737-ASTRO: ДЮБЕ I [ЛЫАУ DC-1] — ДЖЯЯУГАОЬ ЕБЭ (У) ВГЫ ВЫЕУАЫЫ БЕ ЛЫАО 28 Х ЧХЖИ ВУГУЮЮШЮПАОИ ЙШВШЬ: ЫЯВЖЮПДАБЦБ ЮБЭУЕБГУ WXR ЯБМАБДЕПС 560 ХЕ Ы БФБЦГШХУЕШЮТ ЧУЕКЫЭУ AOA Д ДБВГБЕЫХЮШАЫШЯ 2.8 БЯ. ДЮБЕ II [ФЖЗШГ ESS] — БЕЧУААУТ ШЯЭБДЕП (У·К) УХЫУЙЫБААБЬ ФУЕУГШЫ ЫЪ 20 РЮШЯШАЕБХ NI-CD (ВБ 1.2 Х ЭУЩЧОЬ), ВЫЕУХЛШЬ УХУГЫЬАЖС ЛЫАЖ ВБДЕБТААБЬ ЯБМАБДЕПС 384 ХЕ Х ЕШКШАЫШ 90 ЯЫАЖЕ. ДЮБЕ III [ФУЮЮЫДЕЫЭУ ORB] — ФБЮПЛУТ ВБЮЖБДП БГФЫЕО (УШ) ЫДДЮШЧБХУЕШЮПДЭБЦБ ЪБАЧУ, ШДЮЫ ШЦБ ВШГЫЦШЮЫЬ ДБДЕУХЮТШЕ 6 УШ ВГЫ РЭДЙШАЕГЫДЫЕШЕШ БЧАУ ЕГШЕП (ВШГЫБЧ БФГУМШАЫТ 27 ЮШЕ). ДЮБЕ IV [ЦГУХЫЯШЕГЫТ GRAV] — ВБХШГИАБДЕАУТ ЦГУХЫЕУЙЫТ РЭЪБВЮУАШЕО Х ШЧЫАЫЙУИ ЪШЯАБЦБ G, ШДЮЫ ШШ ДГШЧАТТ ВЮБЕАБДЕП ДБДЕУХЮТШЕ 0.8 БЕ ЪШЯАБЬ, У РЭХУЕБГЫУЮПАОЬ ГУЧЫЖД Х 2.5 ГУЪУ ФБЮПЛШ ЪШЯАБЦБ.";

export const Node2AstroCipher: React.FC<Node2Props> = ({
  difficulty,
  isSolved,
  onSolve,
  onClose,
}) => {
  const [shift, setShift] = useState<number>(0);
  const [slots, setSlots] = useState<(number | null)[]>([null, null, null, null]);
  const [selectedBreaker, setSelectedBreaker] = useState<number | null>(null);
  const [solved, setSolved] = useState<boolean>(isSolved);

  const poolVals =
    difficulty === 'hard'
      ? [2, 4, 6, 9, 15, 16, 18, 20, 24, 28, 30, 36]
      : [10, 24, 5, 30, 15, 42, 8, 20];

  const slotLabels =
    difficulty === 'hard'
      ? ['СЛОТ I // ШИНА DC-1', 'СЛОТ II // БУФЕР ESS', 'СЛОТ III // БАЛЛИСТИКА ORB', 'СЛОТ IV // ГРАВИМЕТРИЯ']
      : ['СЛОТ I (АКБ, В)', 'СЛОТ II (ТОК ПВД, А)', 'СЛОТ III (ОРБИТА, ЛЕТ)', 'СЛОТ IV (ПЛАНЕТА №)'];

  // Check solving
  useEffect(() => {
    const ok = checkNode2(shift, slots, difficulty);
    if (ok && !solved) {
      setSolved(true);
      sound.playTaskSuccess();
      onSolve({ shift, slots: slots as number[] });
    }
  }, [shift, slots, difficulty, solved, onSolve]);

  const rawText = difficulty === 'normal' ? MSG_NORMAL : MSG_HARD;
  const decodedText = decodeCaesar(rawText, shift);
  const targetShift = difficulty === 'normal' ? 13 : 19;
  const isShiftCalibrated = shift === targetShift;

  const handleSlotClick = (index: number) => {
    sound.playTerminalClick();
    if (selectedBreaker !== null) {
      // Put into slot
      const nextSlots = [...slots];
      nextSlots[index] = selectedBreaker;
      setSlots(nextSlots);
      setSelectedBreaker(null);
    } else if (slots[index] !== null) {
      // Remove from slot
      const nextSlots = [...slots];
      nextSlots[index] = null;
      setSlots(nextSlots);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-slate-950 border border-cyan-500/40 rounded-lg shadow-2xl p-5 md:p-6 font-mono text-slate-200 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <Compass className="w-6 h-6 text-cyan-400" />
            <div>
              <h2 className="text-lg font-bold text-cyan-300 uppercase tracking-wider">
                Узел II: Дешифратор Цезаря и Панель АЗС
              </h2>
              <p className="text-xs text-slate-400">
                Калибровка ротора астрокомпаса и коммутация бортовых автоматов защиты сети
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

        {/* Task Explanation */}
        <div className="bg-slate-900/80 border-l-4 border-cyan-500 p-4 rounded text-xs md:text-sm text-slate-300 mb-5 leading-relaxed space-y-2">
          {difficulty === 'normal' ? (
            <>
              <p>
                1. <strong>Калибровка астродешифратора</strong>: Выставите стандартный сдвиг{' '}
                <code>ROT-13</code> (13) на роторе дешифратора, чтобы прочитать бортовую сводку.
              </p>
              <p>
                2. <strong>Распределение АЗС</strong>: Выберите нужные модули из пула внизу и
                установите в слоты I–IV (нажмите на модуль, затем на слот).
              </p>
            </>
          ) : (
            <>
              <p>
                1. <strong>Криптографическая калибровка</strong>: Сдвиг равен{' '}
                <strong>Метонову циклу</strong> — числу солнечных лет (235 синодических месяцев), через
                которое фазы Луны повторяются на те же даты (19 лет).
              </p>
              <p>
                2. <strong>Инженерный расчёт АЗС</strong>: Решите 4 задачи из дешифрованного отчёта:
                Шина DC-1 (30 А), Буфер АКБ ESS (24 А·ч), Баллистика зонда (9 а.е.), Гравиметрия (2 g).
              </p>
            </>
          )}
        </div>

        {/* Caesar Rotor Controls */}
        <div className="bg-slate-900/60 p-4 rounded border border-slate-800 mb-4">
          <div className="flex justify-between items-center text-xs mb-2">
            <span className="text-slate-300 font-bold">
              Смещение крипторотора (0 — 31):
            </span>
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 font-black text-base">{shift}</span>
              {isShiftCalibrated && (
                <span className="text-emerald-400 text-xs font-bold">[ СИНХРОНИЗИРОВАНО ]</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                sound.playTerminalClick();
                setShift(Math.max(0, shift - 1));
              }}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded font-bold transition text-xs"
            >
              -1
            </button>
            <input
              type="range"
              min="0"
              max="31"
              value={shift}
              onChange={(e) => setShift(parseInt(e.target.value, 10))}
              className="flex-1 accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg appearance-none"
            />
            <button
              onClick={() => {
                sound.playTerminalClick();
                setShift(Math.min(31, shift + 1));
              }}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded font-bold transition text-xs"
            >
              +1
            </button>
          </div>
        </div>

        {/* Decrypted Screen */}
        <div
          className={`p-3 rounded border font-mono text-xs leading-relaxed mb-5 min-h-[85px] transition-all ${
            isShiftCalibrated
              ? 'bg-slate-950 border-emerald-500/70 text-emerald-300 shadow-md shadow-emerald-500/10'
              : 'bg-black border-slate-800 text-cyan-400/80'
          }`}
        >
          <div className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider flex justify-between">
            <span>Терминал криптоанализа:</span>
            <span>{isShiftCalibrated ? 'ТЕКСТ ЧИТАЕМ' : 'ТРЕБУЕТСЯ КАЛИБРОВКА'}</span>
          </div>
          <p>{decodedText}</p>
        </div>

        {/* Altar / Breaker Slots */}
        <div className="mb-4">
          <div className="text-xs text-amber-300 font-bold mb-2 uppercase tracking-wider">
            Слоты коммутации АЗС:
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {slots.map((val, idx) => (
              <div
                key={idx}
                onClick={() => handleSlotClick(idx)}
                className={`relative h-20 rounded border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition p-2 ${
                  val !== null
                    ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                    : 'border-slate-700 bg-slate-900/40 text-slate-500 hover:border-cyan-500/60'
                }`}
              >
                <span className="text-[10px] text-slate-400 absolute top-1.5 px-1 truncate max-w-[95%]">
                  {slotLabels[idx]}
                </span>
                <span className="text-lg font-black mt-2">
                  {val !== null ? `[ ${val} ]` : '+ ВСТАВИТЬ'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Pool of available breakers */}
        <div className="bg-slate-900/70 p-3 rounded border border-slate-800 mb-6">
          <div className="text-xs text-slate-400 mb-2">
            Пул модулей АЗС (нажмите для выбора, затем кликните в слот):
          </div>
          <div className="flex flex-wrap gap-2">
            {poolVals.map((num, i) => {
              const isSelected = selectedBreaker === num;
              return (
                <button
                  key={i}
                  onClick={() => {
                    sound.playTerminalClick();
                    setSelectedBreaker(isSelected ? null : num);
                  }}
                  className={`px-3 py-1.5 rounded font-bold text-xs tracking-wider transition ${
                    isSelected
                      ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/50 scale-105'
                      : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
                  }`}
                >
                  [ {num} ]
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-4">
          <div className="flex items-center gap-2">
            {solved ? (
              <span className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                АЗС ЗАКОММУТИРОВАНЫ // СДВИГ = {shift}, СУММА СЛОТОВ ={' '}
                {slots.reduce((a, b) => (a || 0) + (b || 0), 0)}
              </span>
            ) : (
              <span className="flex items-center gap-2 text-amber-400 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Откалибруйте ротор и заполните все 4 слота верными номиналами
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
