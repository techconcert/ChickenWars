import type { ComponentChildren, JSX } from 'preact';
import { getIcon } from '@gen/icons';
import type { Res } from '@sim/state';
import { costEntries, fmtNum } from '../format';
import { portraitUrl } from '../portrait';
import { S } from '../strings';

export function Icon({ id, size = 24, title }: { id: string; size?: number; title?: string }): JSX.Element {
  return <img class="icon" src={getIcon(id, size * 2)} width={size} height={size} alt="" title={title} draggable={false} />;
}

/** Hover tooltip wrapper: content appears below the child. */
export function Tip({ tip, children, class: cls }: { tip: ComponentChildren; children: ComponentChildren; class?: string }): JSX.Element {
  return (
    <span class={`tipwrap ${cls ?? ''}`}>
      {children}
      <span class="tip" role="tooltip">{tip}</span>
    </span>
  );
}

export function Bar({ value, max, cls }: { value: number; max: number; cls?: string }): JSX.Element {
  const p = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return <div class={`bar ${cls ?? ''}`}><div class="bar-fill" style={{ width: `${(p * 100).toFixed(1)}%` }} /></div>;
}

/** Cost chips; entries the player cannot afford are marked red. */
export function Cost({ cost, have }: { cost: Res; have?: Record<string, number> }): JSX.Element {
  const e = costEntries(cost);
  if (!e.length) return <span class="muted">-</span>;
  return (
    <span class="cost">
      {e.map(([r, n]) => (
        <span key={r} class={`costchip ${have && (have[r] ?? 0) < n ? 'short' : ''}`} title={S.resources[r]}>
          <Icon id={r} size={16} />{fmtNum(n)}
        </span>
      ))}
    </span>
  );
}

export function Panel({ title, onClose, children, wide, class: cls }: { title: string; onClose?: () => void; children: ComponentChildren; wide?: boolean; class?: string }): JSX.Element {
  return (
    <div class={`panel ${wide ? 'wide' : ''} ${cls ?? ''}`} role="dialog" aria-label={title}>
      <header class="panel-head">
        <h2>{title}</h2>
        {onClose && <button class="btn small ghost" onClick={onClose} aria-label={S.common.close}>x</button>}
      </header>
      <div class="panel-body">{children}</div>
    </div>
  );
}

export function Modal(props: { title: string; onClose: () => void; children: ComponentChildren; wide?: boolean; xl?: boolean }): JSX.Element {
  return (
    <div class="modal-back" onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <Panel title={props.title} onClose={props.onClose} wide={props.wide} class={`modal ${props.xl ? 'xl' : ''}`}>{props.children}</Panel>
    </div>
  );
}

/** Procedural face for a hero (class tints the clothes) or a lord (pass the banner colour as accent). */
export function Portrait({ id, size = 48, cls = 'lord', accent, ring }: { id: string; size?: number; cls?: string; accent?: string; ring?: string }): JSX.Element {
  return <img class="portrait" src={portraitUrl(id, size, cls, accent)} width={size} height={size} alt="" draggable={false} style={ring ? { borderColor: ring } : undefined} />;
}

export function Rarity({ r }: { r: string }): JSX.Element {
  return <span class={`rar rar-${r}`} title={S.rarity[r]}>{S.rarity[r]}</span>;
}

/** Small chevron button that folds a side panel's body up (collapsed) or down (expanded). */
export function CollapseBtn({ collapsed, onToggle, label }: { collapsed: boolean; onToggle: () => void; label: string }): JSX.Element {
  return <button class="qtoggle collapse-btn" onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-expanded={!collapsed} aria-label={label} title={label}>{collapsed ? 'v' : '^'}</button>;
}
