const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('plset', {
  load: () => ipcRenderer.invoke('session:load'),
  save: state => ipcRenderer.invoke('session:save', state),
  copyText: text => ipcRenderer.invoke('clipboard:write-text', text),
  openOutput: () => ipcRenderer.invoke('output:open'),
  exportSession: () => ipcRenderer.invoke('session:export'),
  exportText: (name, text) => ipcRenderer.invoke('report:export', name, text),
  importSession: () => ipcRenderer.invoke('session:import'),
  onState: callback => { const listener = (_, state) => callback(state); ipcRenderer.on('session:changed', listener); return () => ipcRenderer.removeListener('session:changed', listener); },
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: callback => { const listener = (_, value) => callback(value); ipcRenderer.on('update:changed', listener); return () => ipcRenderer.removeListener('update:changed', listener); },
});
