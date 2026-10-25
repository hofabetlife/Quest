import React, { useEffect, useRef, useState } from 'react';
import { Difficulty, TaskState } from '../types.ts';
import { sound } from '../utils/audio.ts';
import { Trophy, Copy, Check, RotateCcw } from 'lucide-react';

interface VictoryModalProps {
  difficulty: Difficulty;
  tasks: TaskState;
  onResetQuest: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  difficulty,
  onResetQuest,
}) => {
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const confirmedKey = difficulty === 'normal' ? 'ORION-506' : 'CYGNUS-492';

  const handleCopy = () => {
    sound.playTerminalClick();
    navigator.clipboard.writeText(confirmedKey).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Hyperspace Warp Speed Canvas Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const stars: { x: number; y: number; z: number; oZ: number }[] = [];
    const numStars = 220;

    for (let i = 0; i < numStars; i++) {
      stars.push({
        x: (Math.random() - 0.5) * canvas.width * 2,
        y: (Math.random() - 0.5) * canvas.height * 2,
        z: Math.random() * canvas.width,
        oZ: Math.random() * canvas.width,
      });
    }

    const render = () => {
      ctx.fillStyle = 'rgba(2, 4, 10, 0.25)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      stars.forEach((s) => {
        s.oZ = s.z;
        s.z -= 18;
        if (s.z <= 0) {
          s.z = canvas.width;
          s.oZ = s.z;
          s.x = (Math.random() - 0.5) * canvas.width * 2;
          s.y = (Math.random() - 0.5) * canvas.height * 2;
        }

        const k = 220 / s.z;
        const px = s.x * k + cx;
        const py = s.y * k + cy;

        const oK = 220 / s.oZ;
        const ox = s.x * oK + cx;
        const oy = s.y * oK + cy;

        if (px >= 0 && px <= canvas.width && py >= 0 && py <= canvas.height) {
          ctx.beginPath();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = Math.min(3, (1 - s.z / canvas.width) * 3);
          ctx.moveTo(ox, oy);
          ctx.lineTo(px, py);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(px, py, Math.min(2.5, (1 - s.z / canvas.width) * 2.5), 0, Math.PI * 2);
          ctx.fill();
        }
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 overflow-y-auto">
      {/* Background Hyperspace Canvas */}
      <canvas
        ref={canvasRef}
        width={900}
        height={600}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-40"
      />

      <div className="relative z-10 w-full max-w-md bg-slate-950/95 border-2 border-emerald-400 rounded-xl shadow-[0_0_80px_rgba(0,255,157,0.4)] p-7 font-mono text-center text-slate-200">
        <div className="flex justify-center mb-3">
          <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/40">
            <Trophy className="w-7 h-7 text-emerald-400" />
          </div>
        </div>

        <h2 className="text-xl font-black text-white uppercase tracking-wider mb-5">
          ГИПЕРПРЫЖОК ВЫПОЛНЕН
        </h2>

        {/* Big Key Display */}
        <div className="bg-black/90 border-2 border-dashed border-amber-400 rounded-lg py-5 px-4 mb-5">
          <div className="text-3xl md:text-4xl font-black text-amber-300 tracking-[0.25em] font-mono select-all">
            {confirmedKey}
          </div>
        </div>

        {/* Copy Button */}
        <div className="flex justify-center mb-5">
          <button
            onClick={handleCopy}
            className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider rounded-lg flex items-center gap-2 shadow-lg shadow-emerald-500/30 transition active:scale-95 cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'СКОПИРОВАНО!' : 'СКОПИРОВАТЬ КЛЮЧ'}</span>
          </button>
        </div>

        {/* Restart / Replay */}
        <button
          onClick={onResetQuest}
          className="text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1.5 mx-auto transition cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Пройти заново</span>
        </button>
      </div>
    </div>
  );
};

