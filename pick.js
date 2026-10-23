// Opening a library folder from this computer: the folder panel, drag and drop, and the recent folders
import { forgetFolder, recentFolders, rememberFolder } from './folder.js';
import { demo, load, served, source, under } from './tour.js';
import { bar, demoButton, details, folder, FOLDER_ICON, hash, openError, openPanel, pick, recentList } from './ui.js';

const FORGET_ICON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z"/></svg>';

// A source for a folder picked where the browser can't keep folder handles: every file was listed when it was picked, and
// each becomes a blob URL when first asked for
function picked(files) {
  // Paths start with the picked folder's own name
  const byPath = new Map([...files].map((f) => [f.webkitRelativePath.slice(f.webkitRelativePath.indexOf('/') + 1), f]));
  const urls = new Map();
  return {
    // Remembers the view by folder name, as there is no handle to tell folders apart
    key: `picked/${files[0]?.webkitRelativePath.split('/')[0]}`,
    url: (path) => {
      // A missing file becomes an empty blob, so it fails to load like a missing file on a server
      if (!urls.has(path)) urls.set(path, URL.createObjectURL(byPath.get(path) ?? new Blob()));
      return urls.get(path);
    },
  };
}

// Chrome and Edge read picked folders through sw.js, which must first control the page
const controlled = window.showDirectoryPicker && (async () => {
  const sw = navigator.serviceWorker;
  await sw.register('sw.js', { type: 'module' });
  const reg = await sw.ready;
  const changed = new Promise((ok) => sw.addEventListener('controllerchange', ok, { once: true }));
  if (!sw.controller) {
    // Asks the worker to control this page too, which it doesn't on a first visit or a hard reload
    reg.active.postMessage('claim');
    // Gives up rather than hold up startup, should control never come
    const timeout = new Promise((_, fail) => setTimeout(() => fail(new Error('sw.js never took control')), 5000));
    await Promise.race([changed, timeout]);
  }
})();
// A failure is reported when a folder is opened
if (controlled) controlled.catch(() => {});

export function showOpenPanel() {
  openError.textContent = '';
  showRecent();
  details.classList.remove('open');
  openPanel.classList.add('open');
}

async function show(from) {
  try {
    await load(from);
    openPanel.classList.remove('open');
    return true;
  } catch {
    openError.textContent = 'No usable library.json in that folder: choose the folder that contains it.';
    return false;
  }
}

// Opens a folder handle, from the picker, a drop or the recent list. Returns whether it opened.
export async function useFolder(handle) {
  // Read here first, where the reason is visible: a remembered folder may have moved or been deleted since
  let library;
  try {
    const file = await (await handle.getFileHandle('library.json')).getFile();
    library = JSON.parse(await file.text());
    if (!library.tours?.length) throw new Error('library.json lists no tours');
  } catch (e) {
    openError.textContent = `Couldn't read a library.json in ${handle.name}: choose the folder that contains it.`;
    if (e.name === 'NotFoundError') await forgetFolder(handle).then(showRecent);
    return false;
  }
  try {
    await controlled;
  } catch {
    openError.textContent = "The browser couldn't start reading folders: reload the page to try again.";
    return false;
  }
  // Each remembered folder has its own address, so tabs showing different folders, and PSV's image cache, never mix them
  const id = await rememberFolder(handle, library.name, library.tours.map((t) => t.path));
  return show(under(`local/${id}/`));
}

folder.onchange = () => show(picked(folder.files));
demoButton.onclick = () => show(demo);
pick.onclick = () => folder.click();

if (window.showDirectoryPicker) {
  pick.onclick = async () => {
    const handle = await showDirectoryPicker({ id: 'panoramas' }).catch(() => null);
    if (handle) await useFolder(handle);
  };

  // A folder dropped anywhere opens too: Chrome and Edge hand over the same kind of handle as the picker.
  // A served data/ is the only folder there is, so nothing is taken then.
  const takesDrops = (e) => {
    const servedOpen = source === served && !bar.classList.contains('empty');
    return e.dataTransfer.types.includes('Files') && !servedOpen;
  };
  let dragEnd;
  let openedForDrag = false;
  const endDrag = () => {
    openPanel.classList.remove('dropping');
    if (openedForDrag) openPanel.classList.remove('open');
    openedForDrag = false;
  };
  addEventListener('dragover', (e) => {
    if (!takesDrops(e)) return;
    e.preventDefault();
    if (!openPanel.classList.contains('open')) {
      openedForDrag = true;
      showOpenPanel();
    }
    openPanel.classList.add('dropping');
    // dragover repeats while a drag is over the page and dragleave fires for every element crossed, so the drag has
    // left once dragover stops
    clearTimeout(dragEnd);
    dragEnd = setTimeout(endDrag, 200);
  });
  addEventListener('drop', async (e) => {
    if (!takesDrops(e)) return;
    e.preventDefault();
    clearTimeout(dragEnd);
    openPanel.classList.remove('dropping');
    openedForDrag = false;
    // The item is only readable during the event, so its handle is asked for before any await
    const pending = e.dataTransfer.items[0].getAsFileSystemHandle();
    openError.textContent = '';
    const handle = await pending.catch(() => null);
    if (handle?.kind === 'directory') await useFolder(handle);
    else openError.textContent = 'That was a file: drop the folder that contains library.json.';
  });
}

function recentItem({ handle, name, paths }) {
  const label = name ?? handle.name;
  const item = document.createElement('div');
  item.className = 'item';
  item.innerHTML = `<button class="open">${FOLDER_ICON}<span class="name"></span><span class="count"></span></button>
    <button class="forget" title="Remove from recent">${FORGET_ICON}</button>`;
  item.querySelector('.name').textContent = label;
  item.querySelector('.count').textContent = `${paths.length} tour${paths.length === 1 ? '' : 's'}`;
  item.querySelector('.open').onclick = async () => {
    if (await handle.requestPermission().catch(() => 'denied') === 'granted') await useFolder(handle);
    else openError.textContent = `Permission to read ${label} wasn't given.`;
  };
  item.querySelector('.forget').onclick = () => forgetFolder(handle).then(showRecent);
  return item;
}

// Fills the recent list and returns it: most recent first, except that a folder holding the hash's tour comes first, so
// a shared link finds its folder
export async function showRecent() {
  const wanted = hash().get('tour');
  const recent = window.showDirectoryPicker ? await recentFolders() : [];
  recent.sort((a, b) => b.paths.includes(wanted) - a.paths.includes(wanted));
  recentList.replaceChildren(...recent.map(recentItem));
  return recent;
}
