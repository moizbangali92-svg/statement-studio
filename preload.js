// Statement Studio - preload bridge
// The renderer never sees Node. It only sees these functions.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    isDesktop: true,

    // Company storage - all async, all returning plain JSON strings.
    list: () => ipcRenderer.invoke('cs:list'),
    read: (id) => ipcRenderer.invoke('cs:read', id),
    write: (id, text) => ipcRenderer.invoke('cs:write', id, text),
    remove: (id) => ipcRenderer.invoke('cs:delete', id),
    rename: (id, nextId) => ipcRenderer.invoke('cs:rename', id, nextId),

    // Backup and recovery.
    snapshot: () => ipcRenderer.invoke('cs:snapshot'),
    exportAll: () => ipcRenderer.invoke('cs:exportAll'),
    importBackup: () => ipcRenderer.invoke('cs:importBackup'),

    // Where the data actually lives, and a button to open that folder.
    dataDir: () => ipcRenderer.invoke('cs:dataDir'),
    revealDataDir: () => ipcRenderer.invoke('cs:reveal'),
});
