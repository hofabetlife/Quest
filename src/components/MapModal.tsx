import React from 'react';
import { TaskState } from '../types.ts';
import { X, Map } from 'lucide-react';

interface MapModalProps {
  tasks: TaskState;
  playerPos?: { x: number; y: number };
  onClose: () => void;
}

export const MapModal: React.FC<MapModalProps> = ({
  tasks,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-sky-950/95 border-4 border-slate-300 rounded-2xl shadow-[0_0_60px_rgba(56,189,248,0.4)] p-6 font-mono text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sky-700/60 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <Map className="w-6 h-6 text-sky-300" />
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-wider">
                Схема Корабля // Навигационный Планшет
              </h2>
              <p className="text-xs text-sky-200/80">
                Изучите маршрут и дойдите пешком до нужного отсека (игрок: Даниил)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть карту"
            className="text-sky-200 hover:text-white p-1.5 rounded-lg hover:bg-sky-900 transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Among Us Style Blue Blueprint Layout */}
        <div className="relative w-full bg-sky-900/50 border-2 border-sky-400/50 rounded-xl p-5 mb-4">
          <div className="grid grid-cols-3 gap-4">
            {/* Row 1: Cockpit, North Airlock, Navigation */}
            <div
              className={`p-3.5 rounded-lg border-2 ${
                tasks.node1Solved
                  ? 'border-emerald-400 bg-emerald-950/50'
                  : 'border-amber-400 bg-sky-950/80'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-black text-white">КАБИНА B737</span>
                <span className="text-xs font-black px-1.5 py-0.5 rounded bg-amber-400 text-black">
                  {tasks.node1Solved ? '✓' : '!'}
                </span>
              </div>
              <p className="text-[11px] text-sky-200">Узел I: Электросистема</p>
              <div className="mt-2 text-[10px] font-bold text-amber-300">
                ← Северо-Западный коридор
              </div>
            </div>

            <div
              className={`p-3.5 rounded-full border-2 text-center flex flex-col items-center justify-center ${
                tasks.node5Solved
                  ? 'border-emerald-400 bg-emerald-950/50'
                  : 'border-yellow-300 bg-yellow-950/40'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-xs font-black text-yellow-200">СМОТРОВОЙ КУПОЛ</span>
                <span className="text-xs font-black px-1.5 py-0.5 rounded-full bg-yellow-400 text-black">
                  {tasks.node5Solved ? '✓' : '★'}
                </span>
              </div>
              <p className="text-[11px] text-sky-200">Узел V: Астросфера (Круговой зал)</p>
              <div className="mt-1 text-[10px] font-bold text-yellow-300">
                ↑ Северный гермокоридор
              </div>
            </div>

            <div
              className={`p-3.5 rounded-lg border-2 ${
                tasks.node2Solved
                  ? 'border-emerald-400 bg-emerald-950/50'
                  : 'border-amber-400 bg-sky-950/80'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-black text-white">НАВИГАЦИЯ</span>
                <span className="text-xs font-black px-1.5 py-0.5 rounded bg-amber-400 text-black">
                  {tasks.node2Solved ? '✓' : '!'}
                </span>
              </div>
              <p className="text-[11px] text-sky-200">Узел II: Дешифратор & АЗС</p>
              <div className="mt-2 text-[10px] font-bold text-amber-300">
                Северо-Восточный коридор →
              </div>
            </div>

            {/* Row 2: MedBay, Central Cafeteria, Shields */}
            <div className="p-3 rounded-lg border border-sky-400/40 bg-sky-950/60 text-center flex flex-col justify-center">
              <span className="text-xs font-bold text-teal-300">МЕДОТСЕК И O2</span>
              <span className="text-[10px] text-sky-300 mt-0.5">Био-сканер и переход</span>
            </div>

            <div className="py-5 px-3 rounded-lg border-2 border-sky-300 bg-sky-800/40 text-center flex flex-col items-center justify-center">
              <span className="text-xs font-black text-white tracking-widest uppercase">
                КАЮТ-КОМПАНИЯ (ЦЕНТР)
              </span>
              <span className="text-[10px] text-sky-200 mt-1">
                Стол собраний • Старт: Даниил
              </span>
            </div>

            <div className="p-3 rounded-lg border border-sky-400/40 bg-sky-950/60 text-center flex flex-col justify-center">
              <span className="text-xs font-bold text-purple-300">ЩИТЫ И ЭНЕРГОБЛОК</span>
              <span className="text-[10px] text-sky-300 mt-0.5">Восточный переход</span>
            </div>

            {/* Row 3: Rover Hangar, Storage, Reactor */}
            <div
              className={`p-3.5 rounded-lg border-2 ${
                tasks.node3Solved
                  ? 'border-emerald-400 bg-emerald-950/50'
                  : 'border-amber-400 bg-sky-950/80'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-black text-white">АНГАР РОВЕРА</span>
                <span className="text-xs font-black px-1.5 py-0.5 rounded bg-amber-400 text-black">
                  {tasks.node3Solved ? '✓' : '!'}
                </span>
              </div>
              <p className="text-[11px] text-sky-200">Узел III: 3D/4D Навигация</p>
              <div className="mt-2 text-[10px] font-bold text-amber-300">
                ↙ Юго-Западный отсек
              </div>
            </div>

            <div className="p-3 rounded-lg border border-sky-400/40 bg-sky-950/60 text-center flex flex-col justify-center text-sky-200 text-xs">
              <span className="font-bold">ГРУЗОВОЙ ШЛЮЗ</span>
              <span className="text-[10px] text-sky-300 mt-0.5">Южный коридор</span>
            </div>

            <div
              className={`p-3.5 rounded-lg border-2 ${
                tasks.node4Solved
                  ? 'border-emerald-400 bg-emerald-950/50'
                  : 'border-amber-400 bg-sky-950/80'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-black text-white">РЕАКТОР</span>
                <span className="text-xs font-black px-1.5 py-0.5 rounded bg-amber-400 text-black">
                  {tasks.node4Solved ? '✓' : '!'}
                </span>
              </div>
              <p className="text-[11px] text-sky-200">Узел IV: 3D Нуклеосинтез</p>
              <div className="mt-2 text-[10px] font-bold text-amber-300">
                Юго-Восточный отсек ↘
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-between text-xs text-sky-200 border-t border-sky-800 pt-3">
          <span>
            🚶 Дойдите персонажем <strong>Даниил</strong> до нужного отсека и нажмите{' '}
            <strong>USE [E]</strong> у консоли.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg font-black transition cursor-pointer"
          >
            ЗАКРЫТЬ
          </button>
        </div>
      </div>
    </div>
  );
};
