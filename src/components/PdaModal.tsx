import React from 'react';
import { TaskState, Difficulty } from '../types.ts';
import { X, FileText } from 'lucide-react';

interface PdaModalProps {
  tasks: TaskState;
  difficulty: Difficulty;
  onClose: () => void;
}

export const PdaModal: React.FC<PdaModalProps> = ({
  tasks,
  onClose,
}) => {
  const n1Sum = tasks.node1Solved
    ? tasks.node1Params.u + tasks.node1Params.f + tasks.node1Params.i
    : null;
  const n2SlotsSum = tasks.node2Solved
    ? tasks.node2Slots.reduce((a, b) => a + (b || 0), 0)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-950 border-2 border-slate-700 rounded-xl shadow-2xl p-6 font-mono text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-amber-400" />
            <div>
              <h2 className="text-lg font-bold text-amber-300 uppercase tracking-wider">
                Бортовой Журнал Экипажа // Астронавт: Даниил
              </h2>
              <p className="text-xs text-slate-400">
                Записанные показания приборов и статус систем корабля
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть журнал"
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Quest Directive */}
        <div className="bg-slate-900/90 border-l-4 border-amber-500 p-3.5 rounded text-xs text-slate-300 mb-4 leading-relaxed">
          <p className="font-bold text-amber-300 mb-1">ПРАВИЛА ВЫПОЛНЕНИЯ ЗАДАНИЙ:</p>
          <p>
            Чтобы открыть терминал любого задания, <strong>Даниил</strong> должен{' '}
            <strong>физически подойти к консоли в соответствующем отсеке</strong> и нажать{' '}
            <code className="text-amber-300 font-bold">USE / ИСПОЛЬЗОВАТЬ [E]</code>. Порядок
            прохождения первых 4 отсеков — любой.
          </p>
        </div>

        {/* Nodes List (Read-only status & collected values) */}
        <div className="space-y-2.5 mb-5">
          {/* Node 1 */}
          <div className="p-3 bg-slate-900/70 rounded-lg border border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-300">
                  УЗЕЛ I: КАБИНА B737 // ЭЛЕКТРОСИСТЕМА
                </span>
                {tasks.node1Solved ? (
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-bold">
                    ✓ ВЫПОЛНЕНО
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                    НЕ ВЫПОЛНЕНО
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {tasks.node1Solved
                  ? `Записано: I_фаз=${tasks.node1Params.u}, об/с=${tasks.node1Params.f}, уставка=${tasks.node1Params.i} (Сумма = ${n1Sum})`
                  : 'Локация: Северо-Западный отсек (Кабина пилотов). Подойдите к пульту B737.'}
              </p>
            </div>
          </div>

          {/* Node 2 */}
          <div className="p-3 bg-slate-900/70 rounded-lg border border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-cyan-300">
                  УЗЕЛ II: НАВИГАЦИЯ // ДЕШИФРАТОР И АЗС
                </span>
                {tasks.node2Solved ? (
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-bold">
                    ✓ ВЫПОЛНЕНО
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                    НЕ ВЫПОЛНЕНО
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {tasks.node2Solved
                  ? `Записано: Сдвиг ротора = ${tasks.node2Shift}, Слоты I-IV = [${tasks.node2Slots.join(', ')}] (Сумма слотов = ${n2SlotsSum})`
                  : 'Локация: Северо-Восточный отсек (Навигация). Подойдите к терминалу связи.'}
              </p>
            </div>
          </div>

          {/* Node 3 */}
          <div className="p-3 bg-slate-900/70 rounded-lg border border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-300">
                  УЗЕЛ III: АНГАР РОВЕРА // ПРОСТРАНСТВО
                </span>
                {tasks.node3Solved ? (
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-bold">
                    ✓ ВЫПОЛНЕНО
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                    НЕ ВЫПОЛНЕНО
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {tasks.node3Solved
                  ? `Записано: Время прохождения маршрута ровера = ${tasks.node3Time} с`
                  : 'Локация: Юго-Западный отсек (Ангар планетохода). Подойдите к консоли управления.'}
              </p>
            </div>
          </div>

          {/* Node 4 */}
          <div className="p-3 bg-slate-900/70 rounded-lg border border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-rose-300">
                  УЗЕЛ IV: ЗАЛ ТОКАМАКА // ХОЛОДНЫЙ СИНТЕЗ
                </span>
                {tasks.node4Solved ? (
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-bold">
                    ✓ ВЫПОЛНЕНО
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                    НЕ ВЫПОЛНЕНО
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {tasks.node4Solved
                  ? `Записано: Массовое число финального изотопа Фазы 3 (A) = ${tasks.node4MassA}`
                  : 'Локация: Юго-Восточный отсек (Управление Токамаком). Подойдите к панели управления у реактора.'}
              </p>
            </div>
          </div>

          {/* Node 5 */}
          <div className="p-3 bg-slate-900/70 rounded-lg border border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-yellow-300">
                  УЗЕЛ V: АСТРОКУПОЛ // СПЕКТР ЗВЁЗД
                </span>
                {tasks.node5Solved ? (
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-bold">
                    ✓ ВЫПОЛНЕНО
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                    НЕ ВЫПОЛНЕНО
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {tasks.node5Solved
                  ? `Записано кодовое созвездие [СЛОВО]: ${tasks.node5Word}`
                  : 'Локация: Северный отсек (Астрокупол). Выстройте спектральный ряд звёзд.'}
              </p>
            </div>
          </div>

          {/* Central Key Core */}
          <div className="p-3 bg-cyan-950/30 rounded-lg border border-cyan-500/40 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-cyan-300">
                  ЦЕНТР КАРТЫ: ЯДРО СИНТЕЗА МАСТЕР-КЛЮЧА
                </span>
                <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded font-bold">
                  ФИНАЛЬНЫЙ ТЕРМИНАЛ
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                Локация: Центр корабля (Центральный Зал). Подойдите к центральному ядру и введите собранный ключ{' '}
                <strong>СЛОВО-ЧИСЛО</strong> из всех заданий.
              </p>
            </div>
          </div>
        </div>

        {/* Close Button */}
        <div className="flex justify-end border-t border-slate-800 pt-3">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer"
          >
            Закрыть журнал
          </button>
        </div>
      </div>
    </div>
  );
};
