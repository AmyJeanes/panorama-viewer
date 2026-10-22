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
document.getElementById('hide').innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z"/></svg>';
document.getElementById('show').innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8.6 7.4 10 6l6 6-6 6-1.4-1.4 4.6-4.6z"/></svg>';
document.getElementById('hide').onclick = () => {
  closePanels();
  bar.classList.add('tucked');
};
document.getElementById('show').onclick = () => bar.classList.remove('tucked');
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

// Mouse look: the pointer is locked, so moving the mouse turns the view. A click walks ahead; M or Esc ends it.
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
});
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
// PSV doesn't see the wheel while locked, so zoom here
viewerElement.addEventListener('wheel', (e) => {
  if (!looking() || !e.deltaY) return;
  e.preventDefault();
  viewer.zoomIn(-Math.sign(e.deltaY) * 5);
});

// Shortcut keys, once a tour is open
const shortcuts = { f: fullscreenButton, i: infoButton, m: lookButton, g: galleryButton };
addEventListener('keydown', (e) => {
  const button = shortcuts[e.key.toLowerCase()];
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
