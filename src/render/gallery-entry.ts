import { mountGallery, type GalleryHandle } from './gallery';

declare global {
  interface Window {
    __gallery?: GalleryHandle;
  }
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const handle = mountGallery(canvas);
window.__gallery = handle;
const q = new URLSearchParams(location.search);
const view = q.get('view');
if (view) handle.view(view);
const season = q.get('season');
if (season === 'spring' || season === 'summer' || season === 'autumn' || season === 'winter') handle.setSeason(season);
if (q.get('fog')) handle.demoFog();
