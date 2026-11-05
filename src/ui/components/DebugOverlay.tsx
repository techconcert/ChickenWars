import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { hashHex } from '@sim/save/hash';
import { SEASON_IDS } from '@sim/constants';
import { useGame } from '../hooks';
import { S } from '../strings';

export function DebugOverlay(): JSX.Element {
  const { state, client, getRenderStats } = useGame();
  const [fps, setFps] = useState(0);
  const hash = useRef('');
  const last = useRef(0);
  useEffect(() => {
    let frames = 0;
    let t0 = performance.now();
    let raf = 0;
    const loop = (t: number): void => {
      frames++;
      if (t - t0 >= 1000) { setFps(Math.round((frames * 1000) / (t - t0))); frames = 0; t0 = t; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const now = performance.now();
  if (!hash.current || now - last.current > 1000) { hash.current = hashHex(state); last.current = now; }
  const st = getRenderStats();
  return (
    <pre class="debug">
      {`${S.debug.tick} ${state.tick}  ${S.debug.day} ${state.season.day} ${SEASON_IDS[state.season.index]} y${state.season.year}\n`}
      {`speed ${client.speed}x  scene ${client.scene}  ${S.debug.hash} ${hash.current}\n`}
      {`${S.debug.fps} ${fps}${st ? `  ${S.debug.calls} ${st.drawCalls ?? st.calls ?? '-'}  ${S.debug.tris} ${st.triangles ?? st.tris ?? '-'}` : ''}`}
    </pre>
  );
}
