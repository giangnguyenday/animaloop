const databaseName = 'animaloop-poster-drafts';
const draftStore = 'drafts';
const indexedDraftMarker = ':indexeddb:';
const pendingDrafts = new Map();
let openDatabase;

function draftDatabase() {
  if (!openDatabase) {
    openDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(draftStore);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          openDatabase = undefined;
        };
        resolve(database);
      };
    }).catch((error) => {
      openDatabase = undefined;
      throw error;
    });
  }
  return openDatabase;
}

async function useDraftStore(mode, operation) {
  const database = await draftDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(draftStore, mode);
    const request = operation(transaction.objectStore(draftStore));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('Draft storage was interrupted.'));
  });
}

export async function loadPosterDraft(key) {
  let saved;
  try { saved = localStorage.getItem(key); }
  catch { /* IndexedDB can still hold the draft when local storage is unavailable. */ }
  if (typeof saved === 'string' && saved !== indexedDraftMarker) return saved;

  try {
    const draft = await useDraftStore('readonly', (store) => store.get(key));
    return typeof draft === 'string' ? draft : null;
  } catch (error) {
    if (saved !== null) throw error;
    return null;
  }
}

export function savePosterDraft(key, serialized) {
  const queue = pendingDrafts.get(key) ?? { version: 0 };
  const version = ++queue.version;
  let before;
  try {
    before = localStorage.getItem(key);
    localStorage.setItem(key, serialized);
    return Promise.resolve();
  } catch { /* Larger drafts can exceed the local storage quota. */ }

  const pending = Promise.resolve(queue.pending).catch(() => {}).then(async () => {
    if (queue.version !== version) return;
    await useDraftStore('readwrite', (store) => store.put(serialized, key));
    if (queue.version !== version) return;

    try {
      // A newer draft saved in another window can take precedence while this write completes.
      if (localStorage.getItem(key) === before) localStorage.setItem(key, indexedDraftMarker);
    } catch (error) {
      // A missing or unreadable primary entry already directs loads to IndexedDB.
      if (typeof before === 'string' && before !== indexedDraftMarker) throw error;
    }
  });
  queue.pending = pending;
  pendingDrafts.set(key, queue);
  return pending.finally(() => {
    if (queue.pending === pending) pendingDrafts.delete(key);
  });
}
