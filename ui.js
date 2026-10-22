// The page's parts and the small helpers the other modules share

export const rad = (d) => d * Math.PI / 180;
export const deg = (r) => r * 180 / Math.PI;
// The hash holds where you are (#tour=&panorama=&yaw=&pitch=&zoom=, world degrees), so a reload or shared link reopens it.
// It is never sent to the server, so tour names stay on this computer.
export const hash = () => new URLSearchParams(location.hash.slice(1));
// Slashes are fine in a hash, and keep tour paths readable
export const setHash = (state) => history.replaceState(null, '', `#${new URLSearchParams(state).toString().replaceAll('%2F', '/')}`);

export const bar = document.getElementById('bar');
export const picker = document.getElementById('tour');
export const badge = document.getElementById('badge');
export const openPanel = document.getElementById('open');
export const folder = document.getElementById('folder');
export const pick = document.getElementById('pick');
export const recentList = document.getElementById('recent');
export const openError = document.getElementById('openError');
export const galleryButton = document.getElementById('gallery');
export const infoButton = document.getElementById('info');
export const details = document.getElementById('details');
export const fullscreenButton = document.getElementById('fullscreen');
export const lookButton = document.getElementById('look');
export const openFolderButton = document.getElementById('openFolder');
export const viewerElement = document.getElementById('viewer');
export const FOLDER_ICON = pick.querySelector('svg').outerHTML;

// The details and the folder panel slide down from the bar, one at a time
export const toggle = (panel) => {
  const show = !panel.classList.contains('open');
  for (const p of [details, openPanel]) p.classList.toggle('open', p === panel && show);
};
export const closePanels = () => {
  details.classList.remove('open');
  // With nothing open, the folder panel is all there is to do, so it stays
  if (!bar.classList.contains('empty')) openPanel.classList.remove('open');
};
export const setBadge = (text, error = false) => {
  badge.textContent = text;
  badge.classList.toggle('error', error);
};
