import React, { useState } from 'react';
import { Difficulty, TaskState } from '../../types.ts';
import { verifyFinalKey } from '../../game/questLogic.ts';
import { sound } from '../../utils/audio.ts';
import { KeyRound, AlertTriangle, X, Cpu } from 'lucide-react';

interface CentralKeyModalProps {
  difficulty: Difficulty;
  tasks: TaskState;
  onEscape: () => void;
  onClose: () => void;
}

export const CentralKeyModal: React.FC<CentralKeyModalProps> = ({
  difficulty,
  tasks,
  onEscape,
  onClose,
}) => {
  const [keyInput, setKeyInput] = useState<string>('');
  const [error, setError] = useState<boolean>(false);

  const handleVerify = () => {
    sound.playTerminalClick();
    const ok = verifyFinalKey(keyInput, difficulty);
    if (ok) {
      sound.playAirlockEscape();
      setError(false);
      onEscape();
    } else {
      sound.playWarn();
      setError(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-slate-950 border border-cyan-500/50 rounded-lg shadow-2xl p-5 md:p-6 font-mono text-slate-200 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <Cpu className="w-6 h-6 text-cyan-400" />
            <div>
              <h2 className="text-base md:text-lg font-bold text-cyan-300 uppercase tracking-wider">
                ЦЕНТРАЛЬНОЕ ЯДРО КОРАБЛЯ // СИНТЕЗ МАСТЕР-КЛЮЧА
              </h2>
              <p className="text-xs text-slate-400">
                Главный терминал объединения телеметрии узлов I–V и запуска гипердвигателя
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

        {/* Formula instructions */}
        <div className="bg-slate-900/80 border-l-4 border-cyan-400 p-3.5 rounded text-xs md:text-sm text-slate-300 mb-4 leading-relaxed space-y-1.5">
          <p>
            Соберите финальный ключ разблокировки корабля из всех 5 узлов в формате{' '}
            <strong className="text-cyan-300">СЛОВО-ЧИСЛО</strong>:
          </p>
          <p>
            <strong>ЧАСТЬ 1 [СЛОВО]:</strong> Кодовое созвездие, полученное при калибровке спектра звёзд в{' '}
            <strong>Узле V (Астрокупол)</strong>.
          </p>
          <p>
            <strong>ЧАСТЬ 2 [ЧИСЛО]:</strong> Контрольная сумма всех числовых параметров, найденных в{' '}
            <strong>Узлах I, II, III и IV</strong>.
          </p>
        </div>

        {/* Telemetry Summary Box (No pre-summed spoiler!) */}
        <div className="bg-[#05070a] p-4 rounded border border-slate-800 mb-5">
          <div className="text-xs text-slate-200 font-bold mb-1.5 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-400" />
            <span>ФОРМУЛА КОНТРОЛЬНОЙ СУММЫ [ЧИСЛО]:</span>
          </div>
          <p className="text-xs text-emerald-400 leading-relaxed mb-3.5">
            ЧИСЛО = Параметр 1 + Параметр 2 + Параметр 3 (Узел I) + Сдвиг ротора + Слот I + Слот II + Слот III + Слот IV (Узел II) + Время ровера (Узел III) + Массовое число A изотопа Фазы 3 (Узел IV)
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-[11px] border-t border-slate-800/80 pt-3">
            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
              <div className="text-slate-400 text-[10px]">Узел I (Кабина B737):</div>
              <div className={tasks.node1Solved ? 'text-amber-300 font-bold mt-0.5' : 'text-slate-600 mt-0.5'}>
                {tasks.node1Solved
                  ? `${tasks.node1Params.u}, ${tasks.node1Params.f}, ${tasks.node1Params.i}`
                  : 'не решено'}
              </div>
            </div>

            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
              <div className="text-slate-400 text-[10px]">Узел II (Навигация):</div>
              <div className={tasks.node2Solved ? 'text-amber-300 font-bold mt-0.5' : 'text-slate-600 mt-0.5'}>
                {tasks.node2Solved
                  ? `${tasks.node2Shift} / [${tasks.node2Slots.join(', ')}]`
                  : 'не решено'}
              </div>
            </div>

            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
              <div className="text-slate-400 text-[10px]">Узел III (Ровер):</div>
              <div className={tasks.node3Solved ? 'text-amber-300 font-bold mt-0.5' : 'text-slate-600 mt-0.5'}>
                {tasks.node3Solved ? `${tasks.node3Time}` : 'не решено'}
              </div>
            </div>

            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
              <div className="text-slate-400 text-[10px]">Узел IV (Токамак A):</div>
              <div className={tasks.node4Solved ? 'text-amber-300 font-bold mt-0.5' : 'text-slate-600 mt-0.5'}>
                {tasks.node4Solved ? `${tasks.node4MassA}` : 'не решено'}
              </div>
            </div>

            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
              <div className="text-slate-400 text-[10px]">Узел V (Спектр слов):</div>
              <div className={tasks.node5Solved ? 'text-cyan-300 font-bold mt-0.5 tracking-wider' : 'text-slate-600 mt-0.5'}>
                {tasks.node5Solved ? tasks.node5Word : 'не решено'}
              </div>
            </div>
          </div>
        </div>

        {/* Input Key */}
        <div className="space-y-2 mb-4">
          <div className="flex gap-2.5">
            <input
              type="text"
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value.toUpperCase());
                setError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleVerify();
              }}
              placeholder="ВВЕДИТЕ КЛЮЧ (СЛОВО-ЧИСЛО)"
              className="flex-1 bg-[#05070a] border border-cyan-500/80 focus:border-emerald-400 text-emerald-400 px-4 py-2.5 rounded font-mono text-base tracking-widest uppercase outline-none"
            />
            <button
              onClick={handleVerify}
              className="px-6 py-2.5 bg-cyan-500/20 border border-cyan-400 hover:bg-cyan-400 text-cyan-300 hover:text-slate-950 font-bold text-xs uppercase tracking-wider rounded transition cursor-pointer"
            >
              ПОДТВЕРДИТЬ КЛЮЧ
            </button>
          </div>
          {error && (
            <div className="text-xs text-rose-400 font-bold flex items-center gap-1.5 mt-1">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                ОШИБКА ДОСТУПА: Сигнатура мастер-ключа не совпадает с параметрами выбранного режима сложности.
              </span>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-end border-t border-slate-800 pt-3">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer"
          >
            Закрыть терминал
          </button>
        </div>
      </div>
    </div>
  );
};
