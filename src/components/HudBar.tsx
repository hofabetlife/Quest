import React from 'react';
import { Difficulty, SuitColor } from '../types.ts';
import { sound, MUSIC_THEMES, MusicThemeId } from '../utils/audio.ts';
import { Volume2, VolumeX, AlertTriangle, Music } from 'lucide-react';

interface HudBarProps {
  difficulty: Difficulty;
  suitColor: SuitColor;
  soundEnabled: boolean;
  musicTheme: MusicThemeId;
  onChangeMusicTheme: (theme: MusicThemeId) => void;
  onToggleSound: () => void;
  onOpenDifficulty: () => void;
  onChangeSuitColor: (c: SuitColor) => void;
}

const SUITS: { id: SuitColor; color: string; label: string }[] = [
  { id: 'red', color: '#c51111', label: 'Красный' },
  { id: 'cyan', color: '#38fedc', label: 'Голубой' },
  { id: 'gold', color: '#f5f557', label: 'Жёлтый' },
  { id: 'lime', color: '#50ef39', label: 'Лайм' },
  { id: 'purple', color: '#6b2fbb', label: 'Фиолетовый' },
  { id: 'white', color: '#d6e0f0', label: 'Белый' },
  { id: 'dark', color: '#3f474e', label: 'Чёрный' },
];

export const HudBar: React.FC<HudBarProps> = ({
  difficulty,
  suitColor,
  soundEnabled,
  musicTheme,
  onChangeMusicTheme,
  onToggleSound,
  onOpenDifficulty,
  onChangeSuitColor,
}) => {
  const activeThemeInfo = MUSIC_THEMES.find((t) => t.id === musicTheme) ?? MUSIC_THEMES[0];

  return (
    <header className="w-full bg-neutral-950 border-b border-red-950/80 px-4 py-2 flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-slate-200 z-30 select-none shadow-md">
      {/* Left: Vessel Identifier & Emergency Power Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></span>
          <span className="font-black text-red-500 tracking-widest text-sm">
            USSC HYPERION // АВАРИЯ СЕТИ
          </span>
        </div>
        <span className="hidden xl:inline text-neutral-700">|</span>
        <span className="hidden xl:flex items-center gap-1.5 text-red-400/80 text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
          <span>ОСНОВНОЙ СВЕТ ОТКЛЮЧЕН • АКТИВЕН ФОНАРИК СКАФАНДРА</span>
        </span>
      </div>

      {/* Right: Suit Picker, Music Theme Switcher, Difficulty, Sound */}
      <div className="flex items-center gap-2">
        <div className="hidden lg:flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 px-2.5 py-1 rounded">
          <span className="text-[10px] text-neutral-400 mr-1">Цвет:</span>
          {SUITS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                sound.playTerminalClick();
                onChangeSuitColor(s.id);
              }}
              title={s.label}
              style={{ backgroundColor: s.color }}
              className={`w-3.5 h-3.5 rounded-full transition transform hover:scale-125 cursor-pointer ${
                suitColor === s.id ? 'ring-2 ring-white scale-110' : 'opacity-65 hover:opacity-100'
              }`}
            />
          ))}
        </div>

        {/* 5-Theme Music Switcher */}
        <div className="flex items-center gap-1 bg-neutral-900 border border-cyan-900/60 px-2 py-0.5 rounded">
          <Music className="w-3.5 h-3.5 text-cyan-400 shrink-0 mr-0.5" />
          <span className="hidden md:inline text-[10px] text-cyan-300 font-bold mr-1 whitespace-nowrap">
            {activeThemeInfo.shortName}
          </span>
          {MUSIC_THEMES.map((th, idx) => {
            const isActive = th.id === musicTheme;
            return (
              <button
                key={th.id}
                onClick={() => {
                  sound.playTerminalClick();
                  onChangeMusicTheme(th.id);
                }}
                title={th.name}
                aria-label={`Музыкальная тема ${th.name}`}
                className={`w-5 h-5 rounded text-[10px] font-bold transition cursor-pointer flex items-center justify-center ${
                  isActive
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'bg-neutral-800 text-slate-400 hover:bg-neutral-700 hover:text-white'
                }`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => {
            sound.playTerminalClick();
            onOpenDifficulty();
          }}
          className={`px-2.5 py-1 rounded border text-[11px] font-bold tracking-wider transition cursor-pointer ${
            difficulty === 'hard'
              ? 'border-red-600 bg-red-950/50 text-red-300 hover:bg-red-900/50'
              : 'border-emerald-600/80 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40'
          }`}
        >
          {difficulty === 'hard' ? '☠ ДЛЯ МАЛЬЧИКОВ' : '● ИЗИ'}
        </button>

        <button
          onClick={onToggleSound}
          title={soundEnabled ? 'Выключить звук' : 'Включить звук'}
          aria-label={soundEnabled ? 'Выключить звук' : 'Включить звук'}
          className="p-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-slate-300 hover:text-white rounded transition cursor-pointer"
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <VolumeX className="w-4 h-4 text-neutral-600" />
          )}
        </button>
      </div>
    </header>
  );
};
