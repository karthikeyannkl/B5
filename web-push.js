/* Cloudflare-Workers-compatible RFC 8291 Web Push sender (P-256 / aes128gcm). */
const te = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64u = value => { const s=String(value||'').replace(/-/g,'+').replace(/_/g,'/'); const raw=atob(s+'='.repeat((4-s.length%4)%4)); return Uint8Array.from(raw,c=>c.charCodeAt(0)); };
const concat = (...parts) => { const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0)); let o=0; for(const p of parts){out.set(p,o);o+=p.length;} return out; };
async function hkdf(ikm, salt, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,length*8));
}
async function vapidJwt(endpoint, publicKey, privateKey, subject) {
  const url = new URL(endpoint);
  const pub = unb64u(publicKey);
  if(pub.length!==65 || pub[0]!==4) throw new Error('VAPID public key must be an uncompressed P-256 public key.');
  const jwk={kty:'EC',crv:'P-256',x:b64u(pub.slice(1,33)),y:b64u(pub.slice(33,65)),d:b64u(unb64u(privateKey)),ext:true,key_ops:['sign']};
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const enc=o=>b64u(te.encode(JSON.stringify(o)));
  const head=enc({typ:'JWT',alg:'ES256'});
  const body=enc({aud:url.origin,exp:Math.floor(Date.now()/1000)+12*60*60,sub:subject||'mailto:notifications@borntowin5.com'});
  const input=te.encode(head+'.'+body);
  const sig=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,input));
  return head+'.'+body+'.'+b64u(sig);
}
async function encryptPayload(subscription, payload) {
  const uaPublic=unb64u(subscription.keys.p256dh), authSecret=unb64u(subscription.keys.auth);
  if(uaPublic.length!==65 || authSecret.length<16) throw new Error('Invalid Push subscription keys.');
  const uaKey=await crypto.subtle.importKey('raw',uaPublic,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const eph=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const asPublic=new Uint8Array(await crypto.subtle.exportKey('raw',eph.publicKey));
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaKey},eph.privateKey,256));
  const authPrk=await hkdf(shared,authSecret,concat(te.encode('WebPush: info\0'),uaPublic,asPublic),32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const cek=await hkdf(authPrk,salt,te.encode('Content-Encoding: aes128gcm\0'),16);
  const nonce=await hkdf(authPrk,salt,te.encode('Content-Encoding: nonce\0'),12);
  const plain=concat(te.encode(payload),new Uint8Array([2]));
  const aes=await crypto.subtle.importKey('raw',cek,{name:'AES-GCM'},false,['encrypt']);
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,tagLength:128},aes,plain));
  const rs=new Uint8Array([0,0,16,0]); // record size 4096
  return concat(salt,rs,new Uint8Array([asPublic.length]),asPublic,cipher);
}
async function sendNotification(subscription, payload, options={}) {
  const publicKey=String(options.publicKey||''); const privateKey=String(options.privateKey||'');
  if(!publicKey||!privateKey) throw new Error('VAPID keys are not configured.');
  const jwt=await vapidJwt(subscription.endpoint,publicKey,privateKey,options.subject);
  const body=await encryptPayload(subscription,payload);
  const response=await fetch(subscription.endpoint,{method:'POST',headers:{'Authorization':`vapid t=${jwt}, k=${publicKey}`,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream','TTL':String(options.ttl||86400)},body});
  if(!response.ok){const err=new Error(`Push service returned HTTP ${response.status}`);err.statusCode=response.status;throw err;}
  return {statusCode:response.status};
}
module.exports={sendNotification};
