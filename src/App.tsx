import React, { useState, useEffect } from 'react';
import { Difficulty, DoorId, SuitColor, TaskState, ActiveTask, UnlockedDoorsState } from './types.ts';
import { sound, MusicThemeId } from './utils/audio.ts';
import { ShipCanvas } from './components/ShipCanvas.tsx';
import { HudBar } from './components/HudBar.tsx';
import { DifficultyModal } from './components/DifficultyModal.tsx';
import { VictoryModal } from './components/VictoryModal.tsx';
import { Node1Electrical } from './components/tasks/Node1Electrical.tsx';
import { Node2AstroCipher } from './components/tasks/Node2AstroCipher.tsx';
import { Node3RoverNav } from './components/tasks/Node3RoverNav.tsx';
import { Node4Nucleosynthesis } from './components/tasks/Node4Nucleosynthesis.tsx';
import { Node5EscapeAirlock } from './components/tasks/Node5EscapeAirlock.tsx';
import { CentralKeyModal } from './components/tasks/CentralKeyModal.tsx';
import { DoorUnlockModal } from './components/tasks/DoorUnlockModal.tsx';
import { CheckCircle2, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';

interface CompletedBannerInfo {
  title: string;
  subtitle: string;
}

const INITIAL_DOORS_STATE: UnlockedDoorsState = {
  1: false,
  2: false,
  3: false,
  4: false,
  5: false,
};

export default function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [suitColor, setSuitColor] = useState<SuitColor>('red');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [musicTheme, setMusicTheme] = useState<MusicThemeId>('interstellar');
  const [currentRoomName, setCurrentRoomName] = useState<string>('КОМАНДНЫЙ ЦЕНТР // СЕРВЕРНОЕ ЯДРО');

  const [activeTask, setActiveTask] = useState<ActiveTask>(null);
  const [activeDoor, setActiveDoor] = useState<DoorId | null>(null);
  const [unlockedDoors, setUnlockedDoors] = useState<UnlockedDoorsState>(INITIAL_DOORS_STATE);
  const [showDifficultyModal, setShowDifficultyModal] = useState<boolean>(false);
  const [completedBanner, setCompletedBanner] = useState<CompletedBannerInfo | null>(null);
  const [tasksCollapsed, setTasksCollapsed] = useState<boolean>(false);

  const [tasks, setTasks] = useState<TaskState>({
    node1Solved: false,
    node1Params: { u: 50, f: 100, i: 40 },

    node2Solved: false,
    node2Shift: 0,
    node2Slots: [0, 0, 0, 0],

    node3Solved: false,
    node3Time: 20,

    node4Solved: false,
    node4MassA: 56,

    node5Solved: false,
    node5Word: '',
    escaped: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('autostart')) {
      setShowDifficultyModal(true);
    }
    const roomParam = params.get('room');
    if (roomParam) {
      const idx = parseInt(roomParam, 10);
      if (idx >= 1 && idx <= 5) {
        setUnlockedDoors((prev) => ({ ...prev, [idx as DoorId]: true }));
      }
    }
  }, []);

  const triggerTaskCompletedBanner = (title: string, subtitle: string) => {
    setCompletedBanner({ title, subtitle });
    setTimeout(() => {
      setCompletedBanner((prev) => (prev?.title === title ? null : prev));
    }, 5000);
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sound.setSoundEnabled(next);
  };

  const handleChangeMusicTheme = (theme: MusicThemeId) => {
    setMusicTheme(theme);
    if (!soundEnabled) {
      setSoundEnabled(true);
      sound.setSoundEnabled(true);
    }
    sound.setMusicTheme(theme);
  };

  const handleSelectDifficulty = (mode: Difficulty) => {
    sound.ensureStarted();
    setDifficulty(mode);
    setShowDifficultyModal(false);
    setActiveDoor(null);
    setUnlockedDoors(INITIAL_DOORS_STATE);
    setTasks({
      node1Solved: false,
      node1Params: mode === 'normal' ? { u: 100, f: 200, i: 65 } : { u: 75, f: 150, i: 105 },
      node2Solved: false,
      node2Shift: mode === 'normal' ? 13 : 19,
      node2Slots: mode === 'normal' ? [24, 15, 8, 5] : [30, 24, 9, 2],
      node3Solved: false,
      node3Time: mode === 'normal' ? 20 : 19,
      node4Solved: false,
      node4MassA: mode === 'normal' ? 56 : 59,
      node5Solved: false,
      node5Word: '',
      escaped: false,
    });
  };

  const handleResetQuest = () => {
    sound.playTerminalClick();
    handleSelectDifficulty(difficulty);
    setActiveTask(null);
    setActiveDoor(null);
  };

  const handleUnlockDoor = (doorId: DoorId) => {
    setUnlockedDoors((prev) => ({ ...prev, [doorId]: true }));
    setActiveDoor(null);
  };

  const solvedNodesCount = [
    tasks.node1Solved,
    tasks.node2Solved,
    tasks.node3Solved,
    tasks.node4Solved,
    tasks.node5Solved,
  ].filter(Boolean).length;

  const taskChecklist = [
    {
      idx: 1,
      room: 'Выставка авиации (Узел I)',
      task: 'Электросистема B737 (1/1)',
      done: tasks.node1Solved,
    },
    {
      idx: 2,
      room: 'Топливный отсек (Узел II)',
      task: 'Переработка топлива и АЗС (1/1)',
      done: tasks.node2Solved,
    },
    {
      idx: 3,
      room: 'Ангар ровера (Узел III)',
      task: 'Маршрут планетохода (1/1)',
      done: tasks.node3Solved,
    },
    {
      idx: 4,
      room: 'Зал Токамака (Узел IV)',
      task: 'Холодный ядерный синтез (1/1)',
      done: tasks.node4Solved,
    },
    {
      idx: 5,
      room: 'Астрокупол (Узел V)',
      task: 'Спектр звёзд (1/1)',
      done: tasks.node5Solved,
    },
    {
      idx: 6,
      room: 'Командный центр (Ядро)',
      task: `Сборка мастер-ключа (${solvedNodesCount}/5)`,
      done: tasks.escaped,
    },
  ];

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-mono select-none">
      {/* Top Avionics HUD Bar */}
      <HudBar
        difficulty={difficulty}
        suitColor={suitColor}
        soundEnabled={soundEnabled}
        musicTheme={musicTheme}
        onChangeMusicTheme={handleChangeMusicTheme}
        onToggleSound={handleToggleSound}
        onOpenDifficulty={() => setShowDifficultyModal(true)}
        onChangeSuitColor={(c) => setSuitColor(c)}
      />

      {/* Iconic Among Us "ВЫ ЗАВЕРШИЛИ ЗАДАНИЕ!" Banner Overlay */}
      {completedBanner && (
        <div
          onClick={() => setCompletedBanner(null)}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] cursor-pointer"
        >
          <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 border-4 border-lime-400 rounded-2xl px-8 py-4 shadow-[0_0_50px_rgba(132,204,22,0.85)] flex items-center gap-4 text-center">
            <CheckCircle2 className="w-10 h-10 text-lime-400 shrink-0" />
            <div className="text-left">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-lime-400">
                <Sparkles className="w-4 h-4" />
                <span>ВЫ ЗАВЕРШИЛИ ЗАДАНИЕ! // TASK COMPLETE</span>
              </div>
              <div className="text-lg font-black text-white tracking-wide mt-0.5">
                {completedBanner.title}
              </div>
              <div className="text-xs text-amber-300 font-bold mt-0.5">
                {completedBanner.subtitle}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Spaceship Deck */}
      <main className="flex-1 relative w-full h-full overflow-hidden">
        {/* Subtle Top-Left Crew Tasks Overlay (Among Us style, unobtrusive & semi-transparent) */}
        {activeTask === null && activeDoor === null && !showDifficultyModal && (
          <div
            id="hudTasksOverlay"
            className="absolute top-3 left-3 z-20 w-64 bg-slate-950/45 hover:bg-slate-950/75 border border-slate-700/35 rounded-md backdrop-blur-[2px] transition-all opacity-75 hover:opacity-100 shadow-sm"
          >
            {/* Thin progress bar + header */}
            <div
              onClick={() => setTasksCollapsed((prev) => !prev)}
              className="flex items-center justify-between px-2.5 py-1.5 cursor-pointer border-b border-slate-800/50"
            >
              <div className="flex items-center gap-1.5">
                {tasksCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span className="text-[10px] font-bold tracking-widest uppercase text-slate-300">
                  TASKS // ЗАДАНИЯ ({solvedNodesCount}/5)
                </span>
              </div>
              <div className="w-16 h-1.5 bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/50">
                <div
                  className="h-full bg-emerald-400/80 transition-all duration-300"
                  style={{ width: `${(solvedNodesCount / 5) * 100}%` }}
                />
              </div>
            </div>

            {!tasksCollapsed && (
              <div className="px-2.5 py-1.5 space-y-1 text-[11px] leading-tight">
                {taskChecklist.map((item) => (
                  <div
                    key={item.idx}
                    onClick={() => {
                      const dbg = (window as unknown as Record<string, { walkToRoom?: (i: number) => void }>).__gameDebug;
                      if (dbg?.walkToRoom) dbg.walkToRoom(item.idx);
                    }}
                    title="Нажмите, чтобы направить Даниила к узлу"
                    className={`flex items-start justify-between gap-1.5 py-0.5 rounded px-1 cursor-pointer transition-colors hover:bg-slate-800/40 ${
                      item.done
                        ? 'text-emerald-400/85'
                        : item.idx === 6 && solvedNodesCount === 5
                        ? 'text-cyan-300 font-semibold'
                        : 'text-slate-300/80'
                    }`}
                  >
                    <div className="truncate">
                      <span className="font-semibold">{item.room}:</span>{' '}
                      <span className="text-[10px] opacity-85">{item.task}</span>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold">
                      {item.done ? '✓' : '•'}
                    </span>
                  </div>
                ))}
                <div className="pt-1 border-t border-slate-800/40 text-[9px] text-slate-400/75 truncate">
                  Отсек: {currentRoomName}
                </div>
              </div>
            )}
          </div>
        )}

        <ShipCanvas
          tasks={tasks}
          unlockedDoors={unlockedDoors}
          suitColor={suitColor}
          activeTask={activeTask}
          activeDoor={activeDoor}
          onOpenTask={(taskIndex) => setActiveTask(taskIndex)}
          onOpenDoor={(doorId) => setActiveDoor(doorId)}
          onUnlockDoor={handleUnlockDoor}
          onRoomChange={(rm) => {
            if (rm !== currentRoomName) setCurrentRoomName(rm);
          }}
        />
      </main>

      {/* Bulkhead Door Mini-Puzzle Modal (Among Us style simple tasks) */}
      {activeDoor !== null && (
        <DoorUnlockModal
          doorId={activeDoor}
          onUnlock={handleUnlockDoor}
          onClose={() => setActiveDoor(null)}
        />
      )}

      {/* Task 1 Modal (Cockpit B737) */}
      {activeTask === 1 && (
        <Node1Electrical
          difficulty={difficulty}
          isSolved={tasks.node1Solved}
          onSolve={(params) => {
            setTasks((prev) => ({
              ...prev,
              node1Solved: true,
              node1Params: params,
            }));
            triggerTaskCompletedBanner(
              'Узел I: Электросистема Boeing 737 синхронизирована',
              `Даниил, параметры записаны в бортовой журнал`
            );
          }}
          onClose={() => setActiveTask(null)}
        />
      )}

      {/* Task 2 Modal (Navigation Caesar Cipher) */}
      {activeTask === 2 && (
        <Node2AstroCipher
          difficulty={difficulty}
          isSolved={tasks.node2Solved}
          onSolve={(data) => {
            setTasks((prev) => ({
              ...prev,
              node2Solved: true,
              node2Shift: data.shift,
              node2Slots: data.slots,
            }));
            triggerTaskCompletedBanner(
              'Узел II: Дешифратор Цезаря и панель АЗС запитаны',
              `Даниил, сдвиг ротора и слоты АЗС записаны в журнал`
            );
          }}
          onClose={() => setActiveTask(null)}
        />
      )}

      {/* Task 3 Modal (Rover Bay) */}
      {activeTask === 3 && (
        <Node3RoverNav
          difficulty={difficulty}
          isSolved={tasks.node3Solved}
          onSolve={(data) => {
            setTasks((prev) => ({
              ...prev,
              node3Solved: true,
              node3Time: data.roverTime,
            }));
            triggerTaskCompletedBanner(
              'Узел III: Навигация планетохода успешно завершена',
              `Даниил, время маршрута ровера (${data.roverTime} с) записано в журнал`
            );
          }}
          onClose={() => setActiveTask(null)}
        />
      )}

      {/* Task 4 Modal (Tokamak Cold Nuclear Fusion Control Panel) */}
      {activeTask === 4 && (
        <Node4Nucleosynthesis
          difficulty={difficulty}
          isSolved={tasks.node4Solved}
          onSolve={(data) => {
            setTasks((prev) => ({
              ...prev,
              node4Solved: true,
              node4MassA: data.massNumberA,
            }));
            triggerTaskCompletedBanner(
              'Узел IV: Холодный ядерный синтез в Токамаке завершён',
              `Даниил, массовое число изотопа A = ${data.massNumberA} записано в журнал`
            );
          }}
          onClose={() => setActiveTask(null)}
        />
      )}

      {/* Task 5 Modal (Astro-Dome Star Spectrum Classification) */}
      {activeTask === 5 && (
        <Node5EscapeAirlock
          difficulty={difficulty}
          solved={tasks.node5Solved}
          savedWord={tasks.node5Word}
          onSolve={(word) => {
            setTasks((prev) => ({
              ...prev,
              node5Solved: true,
              node5Word: word,
            }));
            triggerTaskCompletedBanner(
              'Узел V: Спектральный ряд звёзд откалиброван!',
              `Даниил, кодовое созвездие [${word}] записано! Идите в центр корабля для сборки ключа.`
            );
          }}
          onClose={() => setActiveTask(null)}
        />
      )}

      {/* Task 6 Modal (Central Map Object: Master Key Synthesis from all tasks) */}
      {activeTask === 6 && (
        <CentralKeyModal
          difficulty={difficulty}
          tasks={tasks}
          onEscape={() => {
            setTasks((prev) => ({
              ...prev,
              escaped: true,
            }));
            setActiveTask(null);
            triggerTaskCompletedBanner(
              'Центральное Ядро: Мастер-ключ принят!',
              'Даниил, энергосеть восстановлена — выполнен гиперпрыжок!'
            );
          }}
          onClose={() => setActiveTask(null)}
        />
      )}

      {/* Intro Black Hole Cutscene & Simplified Difficulty Selection Modal */}
      {showDifficultyModal && (
        <DifficultyModal onSelect={handleSelectDifficulty} />
      )}

      {/* Grand Escape Victory Modal */}
      {tasks.escaped && (
        <VictoryModal
          difficulty={difficulty}
          tasks={tasks}
          onResetQuest={handleResetQuest}
        />
      )}
    </div>
  );
}

