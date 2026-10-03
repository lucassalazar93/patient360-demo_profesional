/* Avisos del sistema para Patient 360 Profesional. Solo muestra y atiende notificaciones:
   no guarda archivos en caché ni intercepta la red, así que la herramienta siempre carga la versión publicada. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// Al tocar el aviso se vuelve a la herramienta y se abre la ficha de ese paciente
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    const open = windows.find(w => w.url.includes('#profesional')) || windows[0];
    if (!open) return self.clients.openWindow('./#profesional');
    await open.focus();
    open.postMessage({ type: 'p360-open', patient: data.patient, visit: data.visit });
  }));
});
