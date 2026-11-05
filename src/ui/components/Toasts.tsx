import { useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import { fmtMs } from '../format';
import { ui, useUI } from '../store';
import { S } from '../strings';

export function Toasts(): JSX.Element {
  const u = useUI();
  useEffect(() => {
    const id = window.setInterval(() => ui.prune(), 500);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div class="toasts" aria-live="polite">
      {u.toasts.slice(-3).map((t) => <div key={t.id} class={`toast ${t.sev}`}>{t.text}</div>)}
    </div>
  );
}

export function AwayPanel(): JSX.Element | null {
  const u = useUI();
  const a = u.away;
  if (!a) return null;
  const rows: [string, number][] = [[S.away.built, a.built], [S.away.trained, a.trained], [S.away.marches, a.returned], [S.away.gathered, a.gathered], [S.away.battles, a.battles], [S.away.overflow, a.lost]];
  const any = rows.some(([, n]) => n > 0);
  return (
    <div class="modal-back">
      <div class="panel modal" role="dialog" aria-label={S.away.title}>
        <header class="panel-head"><h2>{S.away.title}</h2></header>
        <div class="panel-body">
          <p>{S.away.away} <b>{fmtMs(a.ms)}</b>.</p>
          {!any && <p class="muted">{S.away.nothing}</p>}
          {rows.filter(([, n]) => n > 0).map(([l, n]) => <div class="statrow" key={l}><span>{l}</span><b>{n}</b></div>)}
          <div class="row actions end"><button class="btn primary" onClick={() => ui.set({ away: null })}>{S.away.ok}</button></div>
        </div>
      </div>
    </div>
  );
}
