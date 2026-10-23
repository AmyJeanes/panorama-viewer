// Entry point: the bar's buttons, keys, mouse look and startup
import { CONSTANTS } from '@photo-sphere-viewer/core';
import { GalleryPlugin } from '@photo-sphere-viewer/gallery-plugin';
import { pruneFolders } from './folder.js';
import { showOpenPanel, showRecent, useFolder } from './pick.js';
import { demo, load, placeholder, served, stepAhead, viewer } from './tour.js';
import {
  bar, closePanels, details, FOLDER_ICON, fullscreenButton, galleryButton, hash, infoButton, lookButton, openFolderButton,
  openPanel, picker, rad, toggle, viewerElement,
} from './ui.js';

// ?demo=1 opens the demo; ?pick=1 ignores data/, to try the site as hosted
const query = new URLSearchParams(location.search);
const first = query.get('demo') === '1' ? demo : query.get('pick') === '1' ? null : served;

const { ICONS } = CONSTANTS;
// Hiding leaves a tab at the edge to bring the bar back
const hideButton = document.getElementById('hide');
const showButton = document.getElementById('show');
// An eye struck through, so it doesn't read as a back button
hideButton.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>';
showButton.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8.6 7.4 10 6l6 6-6 6-1.4-1.4 4.6-4.6z"/></svg>';
hideButton.onclick = () => {
  closePanels();
  bar.classList.add('tucked');
};
showButton.onclick = () => bar.classList.remove('tucked');
infoButton.innerHTML = ICONS.info;
infoButton.onclick = () => {
  // The details hang from the bar, so it must be showing
  if (looking()) document.exitPointerLock();
  bar.classList.remove('tucked');
  toggle(details);
};
// The whole page goes fullscreen, so it stays that way across tours
fullscreenButton.hidden = !document.fullscreenEnabled;
fullscreenButton.innerHTML = ICONS.fullscreenIn;
fullscreenButton.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
addEventListener('fullscreenchange', () => {
  fullscreenButton.innerHTML = document.fullscreenElement ? ICONS.fullscreenOut : ICONS.fullscreenIn;
});
galleryButton.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg>';
galleryButton.onclick = () => viewer.getPlugin(GalleryPlugin).toggle();
openFolderButton.innerHTML = FOLDER_ICON;
openFolderButton.onclick = () => (openPanel.classList.contains('open') ? openPanel.classList.remove('open') : showOpenPanel());

// Mouse look: the pointer is locked, so moving the mouse turns the view. A click walks ahead; right click, M or Esc ends it.
const looking = () => document.pointerLockElement === viewerElement;
const lock = (options) => Promise.resolve(viewerElement.requestPointerLock(options));
function toggleLook() {
  if (looking()) {
    document.exitPointerLock();
    return;
  }
  // Raw movement where supported: Chrome's normal locked movement jumps on Windows
  lock({ unadjustedMovement: true })
    .catch((e) => (e.name === 'NotSupportedError' ? lock() : undefined))
    .catch(() => {});
}
lookButton.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 2h2v5h-2zm0 15h2v5h-2zM2 11h5v2H2zm15 0h5v2h-5z"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>';
// Mouse or trackpad only: a stylus can't unlock without a keyboard
lookButton.hidden = !viewerElement.requestPointerLock || !matchMedia('(pointer: fine)').matches;
lookButton.onclick = () => {
  closePanels();
  toggleLook();
};
let lockedAt = 0;
let lockedPress = false;
document.addEventListener('pointerlockchange', () => {
  viewerElement.classList.toggle('look', looking());
  lockedAt = performance.now();
  viewer?.notification.show({ content: looking() ? 'Mouse look on. Right click, M or Esc to stop.' : 'Mouse look off', timeout: 2000 });
});
// Right click starts and ends it too, on the press: Chrome sends no contextmenu while locked
viewerElement.addEventListener('mousedown', (e) => {
  if (e.button !== 2) return;
  closePanels();
  toggleLook();
});
viewerElement.addEventListener('contextmenu', (e) => e.preventDefault());
// While locked, mouse events reach #viewer, not PSV
viewerElement.addEventListener('mousemove', (e) => {
  if (!looking()) return;
  // Like dragging: moving across the screen turns by the field of view. Pitch stops at straight up and down.
  const { yaw, pitch } = viewer.getPosition();
  viewer.rotate({
    yaw: yaw + e.movementX * rad(viewer.state.hFov) / viewerElement.clientWidth,
    pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch - e.movementY * rad(viewer.state.vFov) / viewerElement.clientHeight)),
  });
});
// Ignores clicks in the first half second, which Chrome sends for the click that started the lock
viewerElement.addEventListener('mousedown', (e) => {
  lockedPress = looking() && e.button === 0 && performance.now() - lockedAt > 500;
});
viewerElement.addEventListener('click', () => lockedPress && looking() && stepAhead());
// The gallery scrolls with the wheel at once, about a thumbnail a notch; PSV's eases each notch in and lags behind
viewerElement.addEventListener('wheel', (e) => {
  const list = e.target.closest('.psv-gallery-container');
  if (!list) return;
  e.preventDefault();
  // Before PSV's own handler, on the list
  e.stopPropagation();
  const { gallery } = viewer.getPlugin(GalleryPlugin);
  const axis = gallery.isAboveBreakpoint ? 'scrollLeft' : 'scrollTop';
  list[axis] += (e.deltaY || e.deltaX) * (e.deltaMode ? 33 : 1) * 2;
  // PSV's arrow buttons carry on from here
  gallery.state[axis] = list[axis];
}, true);
// Zoom follows the wheel by how far it turned, settling within a tenth of a second; PSV's own wheel zoom lags behind.
// Firefox counts lines, about 33px each.
viewerElement.addEventListener('wheel', (e) => {
  if (!viewer || !e.deltaY || e.target.closest('.psv--capture-event')) return;
  e.preventDefault();
  viewer.dynamics.zoom.step(-e.deltaY * (e.deltaMode ? 33 : 1) / 20, 30);
});

// Shortcut keys, once a tour is open
const shortcuts = { f: fullscreenButton, i: infoButton, m: lookButton, g: galleryButton, h: hideButton };
addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  // H hides the bar and brings it back
  const button = key === 'h' && bar.classList.contains('tucked') ? showButton : shortcuts[key];
  if (!button || button.hidden || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (viewer && !bar.classList.contains('empty')) button.click();
});
// Typing in the picker chooses a tour, not shortcuts
picker.addEventListener('keydown', (e) => e.stopPropagation());
// Clicking the view unfocuses the picker, so keys work again
viewerElement.addEventListener('pointerdown', () => picker.blur(), true);

// Opens the remembered folder with the hash's tour, if Chrome kept permission
async function openRemembered() {
  const [likely] = await showRecent();
  if (!likely?.paths.includes(hash().get('tour'))) return false;
  if (await likely.handle.queryPermission().catch(() => 'denied') !== 'granted') return false;
  return useFolder(likely.handle);
}

await pruneFolders();
const opened = first && await load(first).then(() => true, () => false);
// Otherwise, show the folder panel
if (!opened && !await openRemembered()) {
  placeholder();
  bar.classList.add('empty');
  openPanel.classList.add('open');
}
