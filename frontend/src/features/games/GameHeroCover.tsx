import { useEffect, type PointerEvent } from 'react';
import { motion, useMotionTemplate, useSpring } from 'motion/react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { GameCover } from './GameCover';

const SPRING = { duration: 0.5, bounce: 0 };
const MAX_TILT = 7;
export const GAME_HERO_COVER_CLASS =
  'size-[var(--hero-cover-size)] [--hero-cover-size:104px] @2xl/app:[--hero-cover-size:136px]';

export function GameHeroCover({ name, processing }: { name: string; processing: boolean }) {
  const canTilt = useMediaQuery(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
  );
  const rotateX = useSpring(0, SPRING);
  const rotateY = useSpring(0, SPRING);
  const transform = useMotionTemplate`perspective(600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

  useEffect(() => {
    if (!canTilt) {
      rotateX.jump(0);
      rotateY.jump(0);
    }
  }, [canTilt, rotateX, rotateY]);

  function followPointer(event: PointerEvent<HTMLDivElement>) {
    if (!canTilt || event.pointerType !== 'mouse') return;
    // Medir el marco fijo evita que la propia inclinación altere el siguiente destino.
    const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - left) / width)) - 0.5;
    const y = Math.max(0, Math.min(1, (event.clientY - top) / height)) - 0.5;
    rotateX.set(-y * MAX_TILT * 2);
    rotateY.set(x * MAX_TILT * 2);
  }

  function resetTilt() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <div
      className={`game-hero-cover shrink-0 @2xl/app:row-span-2 ${GAME_HERO_COVER_CLASS}`}
      onPointerMove={followPointer}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
    >
      {/* La capa que se inclina no debe ampliar ni mover el área que detecta el ratón. */}
      <motion.div className="pointer-events-none" style={{ transform }}>
        <GameCover name={name} size="var(--hero-cover-size)" processing={processing} />
      </motion.div>
    </div>
  );
}
