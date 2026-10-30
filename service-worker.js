/* BORNTOWIN5 Web Push Service Worker */
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { body: event.data ? event.data.text() : '' }; }
  const title = String(data.title || 'BORNTOWIN5');
  const options = { body: String(data.body || 'You have a new B5 update.'), icon: '/b5-logo.png', badge: '/b5-logo.png', tag: String(data.tag || 'b5-notification'), data: { url: String(data.url || '/leveltrack-member.html') }, renotify: false };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/leveltrack-member.html', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) { if (client.url.startsWith(self.location.origin) && 'focus' in client) { client.navigate(target); return client.focus(); } }
    return clients.openWindow(target);
  }));
});
