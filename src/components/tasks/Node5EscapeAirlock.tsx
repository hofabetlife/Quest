import React, { useState } from 'react';
import { Difficulty } from '../../types.ts';
import { checkNode5Stars } from '../../game/questLogic.ts';
import { sound } from '../../utils/audio.ts';
import { Sparkles, CheckCircle2, AlertTriangle, X } from 'lucide-react';

interface Node5Props {
  difficulty: Difficulty;
  solved: boolean;
  savedWord: string;
  onSolve: (word: string) => void;
  onClose: () => void;
}

interface StarCardItem {
  id: string;
  letter: string;
  desc: string;
  bg: string;
  sh: string;
}

const STARS_NORMAL: StarCardItem[] = [
  { id: '1', letter: 'I', desc: 'Спектральный класс A (Белая)', bg: 'radial-gradient(circle at 35% 35%, #ffffff, #d8ecff 60%, #8ab8e6)', sh: 'rgba(232,244,255,0.85)' },
  { id: '2', letter: 'N', desc: 'Спектральный класс M (Красный карлик)', bg: 'radial-gradient(circle at 35% 35%, #ffaa99, #ff5e4d 60%, #b32414)', sh: 'rgba(255,94,77,0.85)' },
  { id: '3', letter: 'O', desc: 'Спектральный класс O (Голубой сверхгигант)', bg: 'radial-gradient(circle at 35% 35%, #d6e8ff, #5b9bff 60%, #1d56b8)', sh: 'rgba(91,155,255,0.95)' },
  { id: '4', letter: 'O', desc: 'Спектральный класс G (Жёлтый карлик типа Солнца)', bg: 'radial-gradient(circle at 35% 35%, #fff9d6, #ffe46b 60%, #d49b15)', sh: 'rgba(255,228,107,0.85)' },
  { id: '5', letter: 'R', desc: 'Спектральный класс B (Бело-голубая звезда)', bg: 'radial-gradient(circle at 35% 35%, #f0f7ff, #9ec4ff 60%, #4b7fd6)', sh: 'rgba(158,196,255,0.9)' },
];

const STARS_HARD: StarCardItem[] = [
  { id: '1', letter: 'G', desc: 'Умеренные линии H, ионы Fe II, масса 1.4 M☉', bg: 'radial-gradient(circle at 35% 35%, #ffffff, #fff4d6 60%, #d4c085)', sh: 'rgba(255,244,214,0.85)' },
  { id: '2', letter: 'S', desc: 'Полосы молекул оксида титана (TiO), конвекция', bg: 'radial-gradient(circle at 35% 35%, #ffaa99, #ff5e4d 60%, #b32414)', sh: 'rgba(255,94,77,0.85)' },
  { id: '3', letter: 'C', desc: 'Линии ионизированного гелия He II, выгорает за <10 млн лет', bg: 'radial-gradient(circle at 35% 35%, #d6e8ff, #5b9bff 60%, #1d56b8)', sh: 'rgba(91,155,255,0.95)' },
  { id: '4', letter: 'U', desc: 'Сильные линии нейтральных металлов, масса 0.7 M☉', bg: 'radial-gradient(circle at 35% 35%, #ffd8a8, #ffa94d 60%, #c96612)', sh: 'rgba(255,169,77,0.85)' },
  { id: '5', letter: 'Y', desc: 'Максимум линий водорода серии Бальмера', bg: 'radial-gradient(circle at 35% 35%, #ffffff, #d8ecff 60%, #8ab8e6)', sh: 'rgba(232,244,255,0.85)' },
  { id: '6', letter: 'N', desc: 'Интенсивный дублет Ca II (H и K), G-карлик', bg: 'radial-gradient(circle at 35% 35%, #fff9d6, #ffe46b 60%, #d49b15)', sh: 'rgba(255,228,107,0.85)' },
];

export const Node5EscapeAirlock: React.FC<Node5Props> = ({
  difficulty,
  solved,
  savedWord,
  onSolve,
  onClose,
}) => {
  const [stars, setStars] = useState<StarCardItem[]>(() => {
    const base = difficulty === 'normal' ? STARS_NORMAL : STARS_HARD;
    if (solved) {
      const targetOrder = difficulty === 'normal' ? ['3', '5', '1', '4', '2'] : ['3', '5', '1', '6', '4', '2'];
      return targetOrder.map((id) => base.find((s) => s.id === id)!);
    }
    return base;
  });
  const [selectedStarIndex, setSelectedStarIndex] = useState<number | null>(null);
  const [error, setError] = useState<boolean>(false);

  const handleStarClick = (idx: number) => {
    if (solved) return;
    sound.playTerminalClick();
    setError(false);
    if (selectedStarIndex === null) {
      setSelectedStarIndex(idx);
    } else if (selectedStarIndex === idx) {
      setSelectedStarIndex(null);
    } else {
      const next = [...stars];
      const temp = next[selectedStarIndex];
      next[selectedStarIndex] = next[idx];
      next[idx] = temp;
      setStars(next);
      setSelectedStarIndex(null);
    }
  };

  const handleConfirmSpectrum = () => {
    sound.playTerminalClick();
    const letters = stars.map((s) => s.letter);
    if (checkNode5Stars(letters, difficulty)) {
      sound.playSuccess();
      setError(false);
      onSolve(letters.join(''));
    } else {
      sound.playWarn();
      setError(true);
    }
  };

  const currentSequence = stars.map((s) => s.letter).join('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-slate-950 border border-amber-500/50 rounded-lg shadow-2xl p-5 md:p-6 font-mono text-slate-200 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-amber-400" />
            <div>
              <h2 className="text-base md:text-lg font-bold text-amber-300 uppercase tracking-wider">
                УЗЕЛ V: АСТРОКУПОЛ // СПЕКТРАЛЬНЫЙ АНАЛИЗ ЗВЁЗД
              </h2>
              <p className="text-xs text-slate-400">
                Гарвардская спектральная классификация и определение кодового созвездия [СЛОВО]
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Task description */}
        <div className="bg-slate-900/80 border-l-4 border-amber-500 p-3.5 rounded text-xs md:text-sm text-slate-300 mb-4 leading-relaxed space-y-1.5">
          {difficulty === 'normal' ? (
            <>
              <p>
                Для получения первой части мастер-ключа <strong>[СЛОВО]</strong> откалибруйте спектрограф купола:
              </p>
              <p>
                Выстройте звёзды кликом мыши от самого <strong>ГОРЯЧЕГО</strong> класса к самому{' '}
                <strong>ХОЛОДНОМУ</strong> согласно шкале температур <strong>O — B — A — F — G — K — M</strong>.
              </p>
            </>
          ) : (
            <>
              <p>
                Для получения первой части мастер-ключа <strong>[СЛОВО]</strong> откалибруйте спектрограф купола:
              </p>
              <p>
                На карточках скрыты буквенные индексы классов. Определите спектральные классы по астрофизическим
                признакам поглощения и упорядочьте звёзды <strong>по возрастанию времени их жизни на главной последовательности</strong>{' '}
                (от самых короткоживущих массивных сверхгигантов к долгоживущим красным карликам).
              </p>
            </>
          )}
        </div>

        {/* Interactive Star Strip */}
        <div className="mb-5">
          <div className="flex items-center justify-between text-[11px] text-amber-300 font-bold mb-2 uppercase tracking-wider">
            <span>Спектральные карточки звёзд (кликните по двум карточкам для перестановки):</span>
            <span className="text-slate-400">
              ТЕКУЩИЙ КОД: <strong className="text-amber-300 tracking-widest">{currentSequence}</strong>
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2.5">
            {stars.map((st, idx) => {
              const isSelected = selectedStarIndex === idx;
              return (
                <div
                  key={st.id}
                  onClick={() => handleStarClick(idx)}
                  className={`p-3 rounded border text-center cursor-pointer transition select-none flex flex-col items-center justify-between min-h-[125px] ${
                    solved
                      ? 'border-emerald-500/60 bg-emerald-950/20'
                      : isSelected
                      ? 'border-emerald-400 bg-emerald-950/60 shadow-lg shadow-emerald-400/30 scale-105'
                      : 'border-slate-800 bg-[#090d14] hover:border-amber-400/60'
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full mb-1.5"
                    style={{ background: st.bg, boxShadow: `0 0 14px ${st.sh}` }}
                  />
                  <div className="text-xl font-black text-amber-300 my-0.5">{st.letter}</div>
                  <div className="text-[10px] text-slate-300 leading-tight border-t border-dashed border-slate-800 pt-1.5 w-full">
                    {st.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="text-xs text-rose-400 font-bold flex items-center gap-2 bg-rose-950/40 border border-rose-500/40 p-3 rounded mb-4">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              ОШИБКА СПЕКТРАЛЬНОГО РЯДА: Порядок звёзд нарушает температурную / эволюционную последовательность.
            </span>
          </div>
        )}

        {solved && (
          <div className="bg-emerald-950/40 border border-emerald-500/60 rounded p-3.5 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-xs text-emerald-200">
                <div>
                  СПЕКТРОГРАФ СИНХРОНИЗИРОВАН. КОДОВОЕ СЛОВО ЗАПИСАНО В БОРТОВОЙ ЖУРНАЛ:{' '}
                  <strong className="text-amber-300 tracking-widest text-sm">{savedWord || currentSequence}</strong>
                </div>
                <div className="text-[11px] text-emerald-400/90 mt-0.5">
                  Направляйтесь в ЦЕНТР КАРТЫ (Центральный Зал) к главному ядру для сборки финального ключа.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom bar */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-3">
          <div className="text-[11px] text-slate-400">
            Финальный ввод мастер-ключа находится на Центральном Ядре в центре корабля.
          </div>
          <div className="flex items-center gap-2.5">
            {!solved && (
              <button
                onClick={handleConfirmSpectrum}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer"
              >
                [ ЗАФИКСИРОВАТЬ СПЕКТР ]
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer"
            >
              Закрыть терминал
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
