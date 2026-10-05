// 첨부 파일 내용을 브라우저 IndexedDB에 저장한다 (localStorage는 용량이 작아 파일에 맞지 않는다).
// 이 브라우저에만 남고 다른 사람·기기와 공유되지 않는다. 막힌 환경에서는 Promise가 실패한다.

const DB_NAME = 'pbc-mate-files';
const STORE = 'files';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(result?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

export const putFile = (id, blob) => run('readwrite', (s) => s.put(blob, id));
export const getFile = (id) => run('readonly', (s) => s.get(id));
export const deleteFile = (id) => run('readwrite', (s) => s.delete(id));
export const clearFiles = () => run('readwrite', (s) => s.clear());
