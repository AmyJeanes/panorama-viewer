// Remembers folders opened with showDirectoryPicker, in IndexedDB, where both the page and sw.js can read them.
// The one store holds two kinds of entry:
//   'recent' -> the Recent list, most recent first: [{ id, handle, name, paths }]
//   <id>     -> that folder's handle, which sw.js serves at local/<id>/
// Without storage, as in some private windows, nothing is remembered.

const RECENT = 'recent';
const MAX_RECENT = 5;

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('panorama-viewer', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('folder');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Runs one request on the store, such as store.get(key), and resolves with its result
async function run(mode, makeRequest) {
  const store = (await database()).transaction('folder', mode).objectStore('folder');
  const request = makeRequest(store);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const get = (key) => run('readonly', (store) => store.get(key));
const put = (key, value) => run('readwrite', (store) => store.put(value, key));
const remove = (key) => run('readwrite', (store) => store.delete(key));
const keys = () => run('readonly', (store) => store.getAllKeys());

// A folder's name and tour paths come from its library.json: they label it in the list, and find the folder a link's
// tour is in
export async function recentFolders() {
  try {
    // Skips entries saved by an earlier version, without tour paths
    return ((await get(RECENT)) ?? []).filter((f) => f.paths);
  } catch {
    return [];
  }
}
const saveRecent = (list) => put(RECENT, list).catch(() => {});

// This folder's entry in the list, if it has one, and the others
async function lookUp(handle) {
  let entry;
  const others = [];
  for (const f of await recentFolders()) {
    if (await f.handle.isSameEntry(handle)) entry = f;
    else others.push(f);
  }
  return { entry, others };
}

// Puts the folder at the top of the list and returns its id, the same each time it is opened
export async function rememberFolder(handle, name, paths) {
  const { entry, others } = await lookUp(handle);
  const id = entry?.id ?? crypto.randomUUID();
  // Kept by id as well as in the list, so removing a folder from the list doesn't cut off a page still showing it
  await put(id, handle).catch(() => {});
  await saveRecent([{ id, handle, name, paths }, ...others].slice(0, MAX_RECENT));
  return id;
}

export const folderById = (id) => get(id);

export async function forgetFolder(handle) {
  const { others } = await lookUp(handle);
  await saveRecent(others);
}

// Deletes the handles of folders no longer in the list. Run as a page opens, before it shows a folder of its own.
export async function pruneFolders() {
  try {
    const kept = new Set((await recentFolders()).map((f) => f.id));
    for (const key of await keys()) {
      if (key !== RECENT && !kept.has(key)) await remove(key);
    }
  } catch {
    // Without storage there is nothing to delete
  }
}
