import type { JSX } from 'preact';
import { useGame } from '../hooks';
import { closePanel } from '../menu';
import { ui } from '../store';
import type { PanelId } from '../store';
import { S } from '../strings';
import { Modal } from './Common';

export function MenuPanel(): JSX.Element {
  const { client } = useGame();
  const go = (p: PanelId): void => ui.set({ panel: p });
  return (
    <Modal title={S.menu.title} onClose={() => closePanel(client)}>
      <div class="menu-list">
        <button class="btn primary big" onClick={() => closePanel(client)}>{S.menu.resume}</button>
        <div class="row menu-quick">
          <button class="btn" onClick={() => go('heroes')}>{S.menu.heroes}</button>
          <button class="btn" onClick={() => go('research')}>{S.menu.research}</button>
          <button class="btn" onClick={() => go('diplomacy')}>{S.menu.diplomacy}</button>
          <button class="btn" onClick={() => go('quests')}>{S.menu.quests}</button>
          <button class="btn" onClick={() => go('army')}>{S.menu.army}</button>
        </div>
        <button class="btn" onClick={() => go('save')}>{S.menu.save}</button>
        <button class="btn" onClick={() => go('settings')}>{S.menu.settings}</button>
        <button class="btn" onClick={() => go('newgame')}>{S.menu.newGame}</button>
      </div>
      <p class="small muted">{S.pause.hint}</p>
    </Modal>
  );
}
