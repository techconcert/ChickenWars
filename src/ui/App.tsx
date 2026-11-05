import { useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import type { GameClient } from '@app/game';
import type { GameEvent } from '@sim/events';
import { playForEvents } from '@platform/audio';
import { getSettings } from '@platform/settings';
import { installInput } from '@platform/input';
import { GameCtx, useClientRev } from './hooks';
import type { GameCtxValue } from './hooks';
import { ui, useUI } from './store';
import type { PanelId } from './store';
import { S, errText, toastFor } from './strings';
import { act } from './act';
import { closePanel, openPauseMenu } from './menu';
import { TopBar } from './components/TopBar';
import { Queues } from './components/Queues';
import { MarchesList } from './components/MarchesList';
import { BuildMenu, PlacingBanner } from './components/BuildMenu';
import { BuildingPanel } from './components/BuildingPanel';
import { ArmyPanel } from './components/ArmyPanel';
import { CellPanel, MarchPanel, NodePanel, PoiPanel } from './components/WorldPanels';
import { MarchDialog } from './components/MarchDialog';
import { ReportPanel } from './components/ReportPanel';
import { AwayPanel, Toasts } from './components/Toasts';
import { RaidBanner } from './components/RaidBanner';
import { HeroesPanel } from './components/HeroesPanel';
import { ResearchPanel } from './components/ResearchPanel';
import { DiplomacyPanel } from './components/DiplomacyPanel';
import { QuestTracker, QuestsPanel } from './components/QuestsPanel';
import { EventCard } from './components/EventCard';
import { EndScreen } from './components/EndScreen';
import { NewGamePanel } from './components/NewGamePanel';
import { Minimap } from './components/Minimap';
import { DebugOverlay } from './components/DebugOverlay';
import { SavePanel } from './components/SavePanel';
import { SettingsPanel } from './components/SettingsPanel';
import { MenuPanel } from './components/MenuPanel';

export interface AppProps { client: GameClient; getRenderStats: () => Record<string, number> | null; debug: boolean }

function wireEvents(client: GameClient): () => void {
  return client.on((events: GameEvent[]) => {
    playForEvents(events);
    for (const e of events) {
      const t = toastFor(e);
      if (t && e.t !== 'MarchArrived' && e.t !== 'NodeDepleted') ui.toast(t.text, t.sev, t.sticky);
      if (e.t === 'BattleResolved') {
        ui.set({ reportId: e.report });
        if (getSettings().autoOpenReport) ui.set({ panel: 'report' });
      } else if (e.t === 'AmbushResolved') {
        ui.set({ reportId: e.report });
        if (getSettings().autoOpenReport && !e.won) ui.set({ panel: 'report' });
      }
    }
  });
}

function Panels({ panel }: { panel: PanelId }): JSX.Element | null {
  switch (panel) {
    case 'menu': return <MenuPanel />;
    case 'army': return <ArmyPanel />;
    case 'save': return <SavePanel />;
    case 'settings': return <SettingsPanel />;
    case 'report': return <ReportPanel />;
    case 'newgame': return <NewGamePanel />;
    case 'heroes': return <HeroesPanel />;
    case 'research': return <ResearchPanel />;
    case 'diplomacy': return <DiplomacyPanel />;
    case 'quests': return <QuestsPanel />;
    default: return null;
  }
}

function Context({ client }: { client: GameClient }): JSX.Element | null {
  const sel = client.selection;
  if (!sel) return null;
  switch (sel.kind) {
    case 'building': return client.scene === 'base' ? <BuildingPanel id={sel.id} /> : null;
    case 'node': return <NodePanel id={sel.id} />;
    case 'poi': return <PoiPanel id={sel.id} />;
    case 'lord': { const poi = Object.values(client.getState().world.pois).find((p) => p.lordId === sel.id); return poi ? <PoiPanel id={poi.id} /> : null; }
    case 'march': return <MarchPanel id={sel.id} />;
    case 'cell': return <CellPanel id={sel.id} />;
    default: return null;
  }
}

export function App({ client, getRenderStats, debug }: AppProps): JSX.Element {
  const rev = useClientRev(client, 8);
  const u = useUI();
  useEffect(() => wireEvents(client), [client]);
  // a rejected placement click (queue full, no resources, bad tile...) explains itself with a toast
  useEffect(() => {
    const on = (e: Event): void => {
      const d = (e as CustomEvent<{ code?: string }>).detail;
      if (d?.code) ui.toast(errText(d.code), 'warning');
    };
    window.addEventListener('hl-place-error', on);
    return () => window.removeEventListener('hl-place-error', on);
  }, []);
  useEffect(() => { if (debug) ui.set({ debug: true }); }, [debug]);
  // switching between town and world closes the popups that belong to the other scene (building panel, node/camp/march panels, march dialog, build menu)
  useEffect(() => {
    const sel = client.selection;
    if (sel && (sel.kind === 'building') !== (client.scene === 'base')) client.select(null);
    if (client.scene === 'base' && ui.get().marchReq) ui.set({ marchReq: null });
    if (client.scene === 'world' && ui.get().panel === 'build') ui.set({ panel: null });
  }, [client.scene]);
  // selecting something on the map replaces the build menu with that thing's panel
  useEffect(() => { if (client.selection && ui.get().panel === 'build') ui.set({ panel: null }); }, [client.selection, rev]);
  useEffect(() => installInput({
    pause: () => client.setSpeed(client.speed === 0 ? 1 : 0),
    speed1: () => client.setSpeed(1), speed2: () => client.setSpeed(2), speed3: () => client.setSpeed(4),
    escape: () => {
      if (ui.get().marchReq) ui.set({ marchReq: null });
      else if (ui.get().panel) closePanel(client);
      else if (client.placing) client.setPlacing(null);
      else if (client.selection) client.select(null);
      else openPauseMenu(client);
    },
    build: () => { if (client.scene === 'base') ui.openPanel('build'); },
    // U: upgrade the building whose panel is showing (a refusal explains itself with a toast)
    upgrade: () => {
      const sel = client.selection;
      if (client.scene !== 'base' || !sel || sel.kind !== 'building' || ui.get().panel) return;
      act(client, { t: 'upgrade', building: sel.id });
    },
    heroes: () => ui.openPanel('heroes'), research: () => ui.openPanel('research'), diplomacy: () => ui.openPanel('diplomacy'), quests: () => ui.openPanel('quests'),
    toggleScene: () => { client.setScene(client.scene === 'world' ? 'base' : 'world'); client.setPlacing(null); },
    tabScene: () => { client.setScene(client.scene === 'world' ? 'base' : 'world'); client.setPlacing(null); },
    debug: () => ui.set({ debug: !ui.get().debug }),
  }, () => ui.get().capturingKey), [client]);
  // the quest strip sits under the top bar; the side columns start below whatever height the stack has
  useEffect(() => {
    const el = document.querySelector('.topstack') as HTMLElement | null;
    const hud = document.querySelector('.hud') as HTMLElement | null;
    if (!el || !hud) return;
    const bar = el.querySelector('.topbar') as HTMLElement | null;
    // --top-h: the top bar only (side panels stay put when the decision strip opens or collapses); --stack-h: bar plus strip (toasts and the placement banner sit below it)
    const set = (): void => {
      hud.style.setProperty('--top-h', `${bar ? bar.offsetHeight : el.offsetHeight}px`);
      hud.style.setProperty('--stack-h', `${el.offsetHeight}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    if (bar) ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  const state = client.getState();
  const value: GameCtxValue = { client, state, rev, getRenderStats };
  const world = client.scene === 'world';
  return (
    <GameCtx.Provider value={value}>
      <div class={`hud scene-${client.scene}`}>
        <div class="topstack"><TopBar />{!u.panel && <EventCard />}</div>
        <aside class="col-left"><QuestTracker /><Queues /></aside>
        <aside class="col-right"><MarchesList /></aside>
        {u.panel === 'build' && !world && <BuildMenu />}
        {u.panel !== 'build' && <Context client={client} />}
        <PlacingBanner />
        <RaidBanner />
        <Toasts />
        {world && <Minimap />}
        {u.debug && <DebugOverlay />}
        {state.flags.won && !state.flags.sandbox && u.panel !== 'newgame' && <EndScreen />}
        <Panels panel={u.panel} />
        {u.marchReq && <MarchDialog />}
        <AwayPanel />
        {!world && <button class="btn small debugbtn" title={S.debug.grantTip} onClick={() => client.dispatch({ t: 'debugGrant', amount: 1000 })}>{S.debug.grant}</button>}
        {!world && u.panel !== 'build' && !client.selection && (
          <div class="dock"><button class="btn primary big" onClick={() => ui.openPanel('build')}>{S.build.title} (B)</button><button class="btn big" onClick={() => ui.openPanel('army')}>{S.army.title}</button></div>
        )}
      </div>
    </GameCtx.Provider>
  );
}
