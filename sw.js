// Serves local/<folder id>/<path> from that remembered folder. Photo Sphere Viewer needs plain URLs, but a folder can only
// be read asynchronously through its handle, so this worker answers those URLs by reading the files itself.
import { folderById } from './folder.js';

const prefix = new URL('local/', self.registration.scope).href;

// Folder handles by path, such as '<id>' or '<id>/<source>/tiles/<image>', each found from the one above it. The top one
// is looked up in IndexedDB, so it survives the browser stopping this worker; the rest are only kept while it runs.
const folders = new Map();
function folderAt(path) {
  if (!folders.has(path)) {
    const found = findFolder(path);
    // Failures aren't kept, so a folder that turns up later is found
    found.catch(() => folders.delete(path));
    folders.set(path, found);
  }
  return folders.get(path);
}
async function findFolder(path) {
  const i = path.lastIndexOf('/');
  if (i < 0) {
    const handle = await folderById(path);
    if (!handle) throw new Error(`No folder ${path}`);
    return handle;
  }
  const parent = await folderAt(path.slice(0, i));
  return parent.getDirectoryHandle(path.slice(i + 1));
}

async function serve(path) {
  try {
    const i = path.lastIndexOf('/');
    const folder = await folderAt(path.slice(0, i));
    const file = await (await folder.getFileHandle(path.slice(i + 1))).getFile();
    return new Response(file, { headers: { 'Content-Type': file.type } });
  } catch {
    return new Response(null, { status: 404 });
  }
}

// An updated worker takes over straight away
self.addEventListener('install', () => self.skipWaiting());
// The page asks to be controlled, which a worker doesn't do by itself on a first visit or a hard reload
self.addEventListener('message', (e) => {
  if (e.data === 'claim') e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (e) => {
  if (e.request.url.startsWith(prefix)) e.respondWith(serve(decodeURIComponent(e.request.url.slice(prefix.length))));
});
