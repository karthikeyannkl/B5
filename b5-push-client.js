/* B5 Web Push opt-in. Requires VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in Worker secrets. */
(() => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  const style = document.createElement('style');
  style.textContent = '#b5-push-optin{position:fixed;right:14px;bottom:14px;z-index:99999;border:1px solid #c59b38;border-radius:999px;padding:10px 14px;background:#042619;color:#f6f4ee;font:600 13px system-ui;box-shadow:0 4px 18px #0003;cursor:pointer}#b5-push-optin:focus{outline:2px solid #c59b38;outline-offset:2px}';
  document.head.appendChild(style);
  const button = document.createElement('button'); button.id='b5-push-optin'; button.type='button'; button.textContent='Enable Notifications';
  button.setAttribute('aria-label','Enable B5 browser notifications'); document.body.appendChild(button);
  const b64ToBytes = s => { const p='='.repeat((4-s.length%4)%4); const raw=atob((s+p).replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from(raw,c=>c.charCodeAt(0)); };
  const call = async (url, data, method='POST') => { const r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined}); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||'Request failed'); return d; };
  button.addEventListener('click', async () => {
    button.disabled=true; const old=button.textContent; button.textContent='Enabling…';
    try {
      const permission=await Notification.requestPermission(); if(permission!=='granted') throw new Error('Browser notifications are not allowed. Enable them in browser settings.');
      const reg=await navigator.serviceWorker.register('/service-worker.js',{scope:'/'}); await navigator.serviceWorker.ready;
      let sub=await reg.pushManager.getSubscription();
      if(!sub){const key=await call('/api/push/vapid-public-key',null,'GET'); sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(key.publicKey)});}
      await call('/api/push/subscribe',{subscription:sub.toJSON()});
      await call('/api/push/test',{});
      button.textContent='Notifications Enabled'; button.title='B5 notifications are enabled for this browser.';
      setTimeout(()=>button.remove(),5000);
    } catch(e) { button.textContent=old; button.disabled=false; alert(e.message||'Could not enable notifications. Please sign in and try again.'); }
  });
})();
