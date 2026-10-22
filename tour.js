// Loads a library and shows its tours
import { DEFAULTS, Viewer } from '@photo-sphere-viewer/core';
import { EquirectangularTilesAdapter } from '@photo-sphere-viewer/equirectangular-tiles-adapter';
import { VirtualTourPlugin } from '@photo-sphere-viewer/virtual-tour-plugin';
import { GalleryPlugin } from '@photo-sphere-viewer/gallery-plugin';
import { bar, closePanels, deg, details, galleryButton, hash, openFolderButton, picker, rad, setBadge, setHash, viewerElement } from './ui.js';

// ?debug=1 shows PSV's tile debug view
const debug = new URLSearchParams(location.search).get('debug') === '1';

// Field of view in degrees: views open at 90 and zoom between 10 and 110. PSV's zoom 0 is MAX_FOV and 100 is MIN_FOV.
const MIN_FOV = 10;
const MAX_FOV = 110;
const START_ZOOM = (MAX_FOV - 90) / (MAX_FOV - MIN_FOV) * 100;

// Where the library's files are: source.url(path) gives a file's URL
export let source;
let tours;
export let viewer;
// Walks to the arrow ahead
export let stepAhead = () => {};
// Lets a newer tour open win over an older, slower one
let opening = 0;
let saveTimer;

// Encodes each part of a path, so file names with # ? or % work
const encode = (path) => path.split('/').map(encodeURIComponent).join('/');
const ROOT = 'https://data.invalid/';
// Resolves ./ and ../ in a data path
const resolve = (path, from = '') => decodeURIComponent(new URL(encode(path), ROOT + encode(from)).pathname.slice(1));

// Files served next to the page: data/, or a picked folder through sw.js
export const under = (dir) => ({ url: (path) => new URL(encode(path), new URL(dir, location.href)).href });
export const served = under('data/');
// The example library, shipped with the site
export const demo = under('examples/');

async function json(path, from = source) {
  const r = await fetch(from.url(resolve(path)));
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export async function load(from) {
  const library = await json('library.json', from);
  if (!library.tours?.length) throw new Error('library.json lists no tours');
  source = from;
  tours = library.tours;
  document.title = library.name ?? 'Panorama Viewer';
  // ?demo=1 reopens the demo on reload, until another library opens
  const url = new URL(location.href);
  if (from === demo) url.searchParams.set('demo', '1');
  else url.searchParams.delete('demo');
  history.replaceState(null, '', url);
  picker.replaceChildren(...tours.map((t) => new Option(t.name, t.path)));
  bar.classList.remove('empty');
  // Only a picked folder can be swapped for another
  openFolderButton.hidden = source === served;
  await openFromHash();
}

// Opens the tour in the hash, or the first one
function openFromHash() {
  const entry = tours.find((t) => t.path === hash().get('tour')) ?? tours[0];
  const ticket = ++opening;
  return open(entry, ticket).catch((e) => {
    console.error(e);
    if (ticket !== opening) return;
    placeholder();
    setBadge(`Couldn't open ${entry.name}`, true);
  });
}

// No reload, which would lose a picked folder
picker.onchange = () => {
  // So keys walk again
  picker.blur();
  setHash({ tour: picker.value });
  openFromHash();
};
// An edited hash reopens there, if the tour is in this library
addEventListener('hashchange', () => {
  if (tours?.some((t) => t.path === hash().get('tour'))) openFromHash();
});

// A white chevron, outlined in viewer.css
const arrowStyle = {
  element: (link) => {
    const b = document.createElement('button');
    b.className = 'walk-arrow';
    b.dataset.to = link.nodeId;
    // Not a tab stop: Enter wouldn't walk it
    b.tabIndex = -1;
    b.innerHTML = '<svg viewBox="0 0 100 100"><path d="M18 64 L50 32 L82 64" stroke="#fff" stroke-width="14"/></svg>';
    return b;
  },
  size: { width: 80, height: 80 },
};

// Arrows fade when idle and come back on any input; the press that brings them back doesn't click one
let fadeTimer;
let liveTimer;
let onArrow = false;
function fadeArrows() {
  clearTimeout(liveTimer);
  viewerElement.classList.add('faded', 'inert');
}
function liven() {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => viewerElement.classList.remove('inert'), 250);
}
function showArrows(e) {
  clearTimeout(fadeTimer);
  if (e?.pointerType) onArrow = e.pointerType === 'mouse' && !!e.target.closest('.psv-virtual-tour-link');
  if (viewerElement.classList.contains('faded')) {
    viewerElement.classList.remove('faded');
    if (e?.type === 'pointerdown') addEventListener('pointerup', liven, { once: true });
    else viewerElement.classList.remove('inert');
  }
  // Stays while the mouse rests on an arrow
  if (!onArrow) fadeTimer = setTimeout(fadeArrows, 1000);
}
for (const type of ['pointermove', 'pointerdown', 'wheel']) viewerElement.addEventListener(type, showArrows, true);
addEventListener('keydown', showArrows);

// WASD walk in linked tours. PSV matches keys exactly, so Shift and Caps Lock versions are listed too.
const walkKeys = {};
for (const [key, turn] of Object.entries({ w: 0, a: -90, s: 180, d: 90 })) {
  for (const k of [key, key.toUpperCase(), `Shift+${key}`, `Shift+${key.toUpperCase()}`]) walkKeys[k] = turn;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The details panel's HTML
function describe(t) {
  const parts = [`<h3>${esc(t.title)}</h3>`];
  if (t.description) parts.push(`<p>${esc(t.description)}</p>`);
  if (t.credits?.length || t.copyright) {
    parts.push('<h4>Credits</h4>');
    if (t.credits?.length) parts.push('<ul>', ...t.credits.map((c) => `<li><b>${esc(c.role)}:</b> ${esc(c.name)}</li>`), '</ul>');
    if (t.copyright) parts.push(`<p>${esc(t.copyright)}</p>`);
  }
  if (t.source) {
    const { name, url, archived } = t.source;
    // Only web links, so a javascript: link can't run
    const link = /^https?:\/\//i.test(url ?? '') ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name);
    parts.push(`<h4>Source</h4><p>${link}${archived ? `, archived ${esc(archived)}` : ''}</p>`);
  }
  return parts.join('');
}

// Checks ids and links before the current tour is torn down; PSV only checks them later
function check(panoramas) {
  const byId = new Map(panoramas.map((p) => [p.id, p]));
  if (byId.size < panoramas.length) throw new Error('Two panoramas share an id');
  for (const p of panoramas) {
    if (!/^[\w.-]+$/.test(p.id)) throw new Error(`Panorama id "${p.id}" isn't only letters, digits, _ . and -`);
    for (const l of p.links ?? []) {
      if (!byId.has(l.to) || l.to === p.id) throw new Error(`${p.id} links to "${l.to}"`);
    }
  }
  return byId;
}

// partial is true, or a label of its own
function badgeFor(p) {
  if (typeof p.partial === 'string') return p.partial;
  return p.partial ? 'Incomplete Panorama' : '';
}

// Faces the heading when startView has no yaw
const startOf = (p) => ({ yaw: rad(p.startView?.yaw ?? p.heading ?? 0), pitch: rad(p.startView?.pitch ?? 0) });

async function open(entry, ticket) {
  clearTimeout(saveTimer);
  picker.value = entry.path;

  const from = source;
  const tour = await json(entry.path, from);
  if (ticket !== opening) return;
  const byId = check(tour.panoramas);
  const hasLinks = tour.panoramas.some((p) => p.links?.length);
  // Tours without arrows get thumbnails instead
  const thumbs = tour.panoramas.length > 1 && !hasLinks;

  // PSV calls panoramas nodes. Turning each by its heading lines them all up, so link yaws work as given.
  const nodes = tour.panoramas.map((p, i) => {
    const dir = resolve(`${p.tiles.dir}/`, entry.path);
    return {
      id: p.id,
      // The gallery shows names as HTML
      name: esc(`${p.title ?? i + 1}${p.partial ? ' (partial)' : ''}`),
      panorama: {
        baseUrl: from.url(`${dir}base.jpg`),
        levels: p.tiles.levels,
        tileUrl: (col, row, level) => from.url(`${dir}${level}/${col}_${row}.jpg`),
      },
      thumbnail: from.url(`${dir}thumb.jpg`),
      sphereCorrection: { pan: -rad(p.heading ?? 0) },
      links: (p.links ?? []).map((l) => ({ nodeId: l.to, position: { yaw: rad(l.yaw), pitch: rad(l.pitch ?? 0) } })),
    };
  });

  // Reopens where the hash says, if it's this tour
  const saved = hash();
  const resumed = saved.get('tour') === entry.path ? byId.get(saved.get('panorama')) : undefined;
  const start = resumed ?? byId.get(tour.start) ?? tour.panoramas[0];
  const startView = resumed
    ? { yaw: rad(Number(saved.get('yaw')) || 0), pitch: rad(Number(saved.get('pitch')) || 0) }
    : startOf(start);
  const savedZoom = Number(saved.get('zoom') ?? NaN);
  const startZoom = resumed && Number.isFinite(savedZoom) ? savedZoom : START_ZOOM;

  // No fade or spinner: local panoramas load almost instantly
  const cut = { effect: 'none', rotation: false, showLoader: false };
  const transitionOptions = (toNode, fromNode, fromLink) => {
    // Walking keeps the current view
    if (fromLink) return { ...cut, rotateTo: undefined, zoomTo: undefined };
    // A gallery jump opens the panorama's start view
    if (fromNode) return { ...cut, rotateTo: startOf(byId.get(toNode.id)), zoomTo: START_ZOOM };
    return cut;
  };

  // The link nearest a direction, if one is within 45 degrees
  const nearest = (turn) => {
    const yaw = viewer.getPosition().yaw + rad(turn);
    const off = (l) => Math.abs(Math.atan2(Math.sin(l.position.yaw - yaw), Math.cos(l.position.yaw - yaw)));
    // None until the first panorama loads
    const links = viewer.getPlugin(VirtualTourPlugin).getCurrentNode()?.links ?? [];
    return links.filter((l) => off(l) <= rad(45)).sort((a, b) => off(a) - off(b))[0];
  };
  // A held key walks once, not on every repeat
  const step = (turn) => (_, e) => {
    if (e?.repeat) return;
    const link = nearest(turn);
    if (link) viewer.getPlugin(VirtualTourPlugin).setCurrentNode(link.nodeId, null, link);
  };
  stepAhead = hasLinks ? step(0) : () => {};
  const walking = hasLinks ? Object.fromEntries(Object.entries(walkKeys).map(([k, turn]) => [k, step(turn)])) : {};
  // Highlights the arrow ahead
  const markAhead = () => {
    const link = nearest(0);
    for (const b of viewer.container.querySelectorAll('.walk-arrow')) {
      b.classList.toggle('ahead', b.dataset.to === link?.nodeId);
      b.classList.toggle('aside', !!link && b.dataset.to !== link.nodeId);
    }
  };

  const tourPlugin = [VirtualTourPlugin, { renderMode: '3d', nodes, startNodeId: start.id, showLinkTooltip: false, transitionOptions, arrowStyle }];
  const galleryPlugin = [GalleryPlugin, { thumbnailSize: { width: 160, height: 80 }, visibleOnLoad: true, hideOnClick: false }];
  // Before newViewer, so bad details fail without tearing down the current tour
  const info = describe(tour);
  newViewer({
    adapter: [EquirectangularTilesAdapter, { baseBlur: false, debug }],
    defaultYaw: startView.yaw,
    defaultPitch: startView.pitch,
    defaultZoomLvl: startZoom,
    keyboardActions: { ...DEFAULTS.keyboardActions, ...walking },
    // Gallery first: it clears itself as it starts
    plugins: thumbs ? [galleryPlugin, tourPlugin] : [tourPlugin],
  });
  details.innerHTML = info;
  // Clears the last tour's badge
  setBadge('');
  galleryButton.hidden = !thumbs;

  // Saves the view in the hash once it settles
  const plugin = viewer.getPlugin(VirtualTourPlugin);
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const node = plugin.getCurrentNode();
      if (!node) return;
      const { yaw, pitch } = viewer.getPosition();
      setHash({
        tour: entry.path,
        panorama: node.id,
        // -180 to 180
        yaw: ((deg(yaw) + 540) % 360 - 180).toFixed(1),
        pitch: deg(pitch).toFixed(1),
        zoom: Math.round(viewer.getZoomLevel()),
      });
    }, 300);
  };
  viewer.addEventListener('position-updated', save);
  viewer.addEventListener('zoom-updated', save);
  plugin.addEventListener('node-changed', ({ node }) => {
    setBadge(badgeFor(byId.get(node.id)));
    save();
  });
  if (hasLinks) {
    // node-changed fires after the arrows are drawn
    plugin.addEventListener('node-changed', markAhead);
    viewer.addEventListener('position-updated', markAhead);
  }
  showArrows();
}

// PSV asks for every frame even when nothing changes, which keeps the browser busy at the screen's refresh rate.
// Its loop pauses a second after the last redraw and resumes when PSV asks for one, or on input.
let wake = () => {};
for (const type of ['pointerdown', 'wheel', 'keydown']) addEventListener(type, () => wake(), true);
// A held drag moves the view from PSV's loop
addEventListener('pointermove', (e) => e.buttons && wake(), true);

function pauseWhenIdle(v) {
  const r = v.renderer;
  let lastDraw;
  let awake = false;
  v.addEventListener('render', () => { lastDraw = performance.now(); });
  const frame = (t) => {
    r.__renderLoop(t);
    if (t - lastDraw > 1000) {
      awake = false;
      // After three.js has asked for the next frame, so that one is cancelled too
      queueMicrotask(() => awake || r.renderer.setAnimationLoop(null));
    }
  };
  const start = () => {
    // A replaced viewer stays asleep
    if (awake || wake !== start) return;
    awake = true;
    lastDraw = performance.now();
    // So the first frame back doesn't count the pause as time passed
    r.timestamp = undefined;
    r.renderer.setAnimationLoop(frame);
  };
  const needsUpdate = v.needsUpdate;
  v.needsUpdate = () => {
    needsUpdate.call(v);
    start();
  };
  // PSV starts its own loop as the first panorama loads
  v.addEventListener('ready', () => {
    if (viewer !== v) return;
    wake = start;
    start();
  }, { once: true });
}

function newViewer(options) {
  wake = () => {};
  viewer?.destroy();
  // A failed build leaves nothing to destroy
  viewer = undefined;
  viewerElement.replaceChildren();
  viewer = new Viewer({
    container: viewerElement,
    minFov: MIN_FOV,
    maxFov: MAX_FOV,
    keyboard: 'always',
    navbar: false,
    ...options,
  });
  pauseWhenIdle(viewer);
  bar.hidden = false;
  viewer.addEventListener('click', closePanels);
}

// A dim sky and floor with a faint 15 degree grid
function placeholderImage() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const g = c.getContext('2d');
  const fill = g.createLinearGradient(0, 0, 0, c.height);
  fill.addColorStop(0, '#0a0f17');
  fill.addColorStop(0.5, '#223044');
  fill.addColorStop(0.5, '#171b21');
  fill.addColorStop(1, '#08090b');
  g.fillStyle = fill;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,255,255,.08)';
  g.beginPath();
  for (let i = 0; i < 24; i++) g.rect(i * c.width / 24, -1, 0, c.height + 2);
  for (let i = 1; i < 12; i++) g.rect(-1, i * c.height / 12, c.width + 2, 0);
  g.stroke();
  return c.toDataURL('image/jpeg');
}

// The placeholder turns slowly, starting again a moment after the last input
let lastInput = -Infinity;
let pressed = false;
for (const type of ['pointerdown', 'pointerup', 'wheel', 'keydown']) {
  addEventListener(type, () => { lastInput = performance.now(); }, true);
}
addEventListener('pointerdown', () => { pressed = true; }, true);
addEventListener('pointerup', () => { pressed = false; }, true);

// Shown until a tour opens
export function placeholder() {
  newViewer({ panorama: placeholderImage(), defaultZoomLvl: START_ZOOM });
  stepAhead = () => {};
  details.innerHTML = '';
  galleryButton.hidden = true;
  setBadge('');

  const v = viewer;
  let last;
  const turn = (t) => {
    if (viewer !== v) return;
    requestAnimationFrame(turn);
    // About 60 turns a second is smooth at this speed and saves redraws on faster screens
    if (t - last < 15) return;
    const idle = t - lastInput - 1500;
    if (last && idle > 0 && !pressed && !document.pointerLockElement) {
      const { yaw, pitch } = v.getPosition();
      // Eases in over a second
      v.rotate({ yaw: yaw + rad(3) * Math.min(1, idle / 1000) * (t - last) / 1000, pitch });
    }
    last = t;
  };
  v.addEventListener('ready', () => requestAnimationFrame(turn), { once: true });
}
