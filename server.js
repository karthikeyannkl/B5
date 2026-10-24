const express=require('express');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const nodemailer=require('nodemailer');
const app=express();

// AIC Cloud SMTP configuration. Credentials are supplied only through environment variables.
const SMTP_HOST=process.env.SMTP_HOST||'mail.aiccloud.in';
const SMTP_PORT=Number(process.env.SMTP_PORT||587);
const SMTP_USER=process.env.SMTP_USER||'notifications@borntowin5.com';
const SMTP_PASS=process.env.SMTP_PASS||'';
const EMAIL_FROM=process.env.EMAIL_FROM||SMTP_USER;
const mailer=SMTP_PASS?nodemailer.createTransport({
  host:SMTP_HOST,
  port:SMTP_PORT,
  secure:false,
  requireTLS:true,
  auth:{user:SMTP_USER,pass:SMTP_PASS}
}):null;

const ADMIN_NOTIFICATION_EMAIL=process.env.B5_ADMIN_CONTACT_EMAIL||process.env.ADMIN_EMAIL||SMTP_USER;

async function sendEmail(to,subject,text,html){
  if(!mailer) throw new Error('SMTP_PASS is not configured');
  return mailer.sendMail({from:EMAIL_FROM,to,subject,text,html:html||undefined});
}

function dispatchEmailNotification({eventType='GENERAL',eventKey='',to='',recipientId='',subject='',text='',html='',metadata={}}){
  try{
    if(!db||typeof db!=='object')return null;
    db.emailNotificationLog=Array.isArray(db.emailNotificationLog)?db.emailNotificationLog:[];
    if(eventKey){
      const existing=db.emailNotificationLog.find(x=>x.eventKey===eventKey&&(x.status==='SENT'||x.status==='SKIPPED_NO_SMTP'||x.status==='PENDING'));
      if(existing)return existing;
    }
    const now=new Date().toISOString();
    const entry={
      id:'EML-'+crypto.randomBytes(4).toString('hex').toUpperCase(),
      eventType,
      eventKey:eventKey||`${eventType}:${recipientId||to}:${Date.now()}`,
      to:String(to||'').trim(),
      recipientId:String(recipientId||''),
      subject:String(subject||''),
      bodyPreview:String(text||'').slice(0,240),
      eventGenerated:true,
      liveDelivered:false,
      status:'PENDING',
      deliveryStatus:'PENDING',
      attempts:0,
      error:null,
      createdAt:now,
      updatedAt:now,
      metadata:metadata||{}
    };
    db.emailNotificationLog.push(entry);
    if(db.emailNotificationLog.length>500)db.emailNotificationLog=db.emailNotificationLog.slice(-500);
    if(!entry.to){
      entry.status='SKIPPED_NO_RECIPIENT';
      entry.deliveryStatus='SKIPPED_NO_RECIPIENT';
      entry.error='Recipient email address is empty';
      entry.updatedAt=new Date().toISOString();
      return entry;
    }
    if(String(entry.to).toLowerCase().endsWith('@simulate-smtp-fail.test')){
      entry.status='FAILED';
      entry.deliveryStatus='FAILED';
      entry.liveDelivered=false;
      entry.attempts=2;
      entry.error='Simulated SMTP transport error (non-fatal; core transaction preserved)';
      entry.updatedAt=new Date().toISOString();
      return entry;
    }
    if(!mailer){
      entry.status='SKIPPED_NO_SMTP';
      entry.deliveryStatus='SKIPPED_NO_SMTP';
      entry.attempts=1;
      entry.error='SMTP_PASS is not configured (event generated & logged locally)';
      entry.updatedAt=new Date().toISOString();
      return entry;
    }
    (async()=>{
      for(let attempt=1;attempt<=2;attempt++){
        entry.attempts=attempt;
        try{
          await sendEmail(entry.to,subject,text,html);
          entry.status='SENT';
          entry.deliveryStatus='SENT';
          entry.liveDelivered=true;
          entry.error=null;
          entry.updatedAt=new Date().toISOString();
          localSave(db);
          return;
        }catch(err){
          entry.status='FAILED';
          entry.deliveryStatus='FAILED';
          entry.liveDelivered=false;
          entry.error=err?.message||String(err);
          entry.updatedAt=new Date().toISOString();
          if(attempt<2)await new Promise(r=>setTimeout(r,350));
        }
      }
      localSave(db);
    })();
    return entry;
  }catch(e){
    console.error('Notification log error:',e.message);
    return null;
  }
}

function notifyMemberEmail(member,subject,text,opts={}){
  const to=member&&(member.email||member.rEmail);
  return dispatchEmailNotification({
    eventType:opts.eventType||'MEMBER_NOTIFICATION',
    eventKey:opts.eventKey||'',
    to:to||'',
    recipientId:(member&&member.memberId)||opts.recipientId||'',
    subject,
    text,
    metadata:opts.metadata||{}
  });
}

function notifyAdminEmail(subject,text,opts={}){
  return dispatchEmailNotification({
    eventType:opts.eventType||'ADMIN_NOTIFICATION',
    eventKey:opts.eventKey||'',
    to:ADMIN_NOTIFICATION_EMAIL,
    recipientId:'ADMIN',
    subject,
    text,
    metadata:opts.metadata||{}
  });
}

if(mailer){
  mailer.verify().then(()=>console.log('AIC Cloud SMTP connection verified')).catch(err=>console.error('AIC Cloud SMTP verification failed:',err.message));
}

app.use(express.json({limit:'25mb'}));
app.use('/api',(req,res,next)=>{
  res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma','no-cache');
  res.set('Expires','0');
  next();
});
app.use((req,res,next)=>{
  const p=String(req.path||'').toLowerCase();
  if(
    p.startsWith('/data/')||
    p.startsWith('/proofs/')||
    p.startsWith('/tests/')||
    p.startsWith('/_backups/')||
    p==='/db.json'||
    p.startsWith('/.env')||
    p==='/server.js'||
    p.endsWith('.bak')||
    p.endsWith('.bak2')||
    p.endsWith('.sql')
  ){
    return res.status(403).json({error:'Forbidden: Direct access to internal server or database files is not permitted.'});
  }
  next();
});
app.use(express.static(__dirname));

const DB_FILE=process.env.DB_FILE || path.join(__dirname,'data','db.json');
const PROOFS_DIR=path.join(path.dirname(DB_FILE),'proofs');
fs.mkdirSync(path.dirname(DB_FILE),{recursive:true});
fs.mkdirSync(PROOFS_DIR,{recursive:true});

function saveProofImageDurably(paymentId,partType,screenshotInput){
  const raw=String(screenshotInput||'').trim();
  const safeId=String(paymentId||'LTP').replace(/[^a-zA-Z0-9_-]/g,'');
  const safePart=String(partType||'member').replace(/[^a-zA-Z0-9_-]/g,'');
  const proofRef=`/api/leveltrack/proofs/${encodeURIComponent(safeId)}/${encodeURIComponent(safePart)}`;
  const m=raw.match(/^data:(image\/([a-zA-Z0-9+.-]+));base64,(.+)$/);
  if(m){
    const mime=m[1];
    const ext=(m[2]||'png').replace(/[^a-zA-Z0-9]/g,'').toLowerCase()||'png';
    const filePath=path.join(PROOFS_DIR,`${safeId}-${safePart}.${ext}`);
    try{
      const buf=Buffer.from(m[3],'base64');
      const tmp=`${filePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmp,buf);
      fs.renameSync(tmp,filePath);
    }catch(e){
      console.error('Durable proof file write warning:',e.message);
    }
    return {proofRef,proofMime:mime,screenshot:raw};
  }
  return {proofRef,proofMime:'image/png',screenshot:raw};
}

function freshDB(){return {adminPassword:'ADMIN',members:[],pins:[],messages:[],passwordResetRequests:[],leveltrackRequests:[],leveltrackUpgrades:[],leveltrackPayments:[],leveltrackMessages:[],emailNotificationLog:[],paymentSettings:{admins:[{id:'A',name:'Admin A',accountHolder:'',bank:'',account:'',ifsc:'',upi:'',active:true},{id:'B',name:'Admin B',accountHolder:'',bank:'',account:'',ifsc:'',upi:'',active:true},{id:'C',name:'Admin C',accountHolder:'',bank:'',account:'',ifsc:'',upi:'',active:true}],adminRotationIndex:0,adminRotationByLevel:{4:0,5:0,6:0,7:0},trust:{name:'Registered Trust',accountHolder:'',bank:'',account:'TEMP-TRUST-001',ifsc:'',upi:'',active:true}}};}
function load(){try{return JSON.parse(fs.readFileSync(DB_FILE,'utf8'))}catch(e){return freshDB()}}

// Permanent persistence: AIC hosts the app; Supabase stores the single source of truth.
const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_SECRET_KEY=String(process.env.SUPABASE_SECRET_KEY||'');
const LOCAL_TEST_ONLY=String(process.env.B5_LOCAL_TEST_ONLY||'')==='1';
let supabaseReady=false;
let pendingSupabaseSnapshot=null;
let supabaseSaveWorker=null;
let supabaseRetryBlocked=false;
let lastSaveAt=null;
let lastSaveError=null;
let totalSavesCompleted=0;

function supabaseHeaders(extra={}){return {'apikey':SUPABASE_SECRET_KEY,'Authorization':'Bearer '+SUPABASE_SECRET_KEY,'Content-Type':'application/json','Accept':'application/json',...extra}}
async function supabaseFetch(pathname,options={}){
  if(!SUPABASE_URL||!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch(SUPABASE_URL+'/rest/v1/'+pathname,{...options,signal:controller.signal,headers:{...supabaseHeaders(),...(options.headers||{})}});
    const body=await r.text();
    if(!r.ok) throw new Error('Supabase API '+r.status+': '+body);
    try{return body?JSON.parse(body):null}catch{return body}
  }catch(e){
    if(e && e.name==='AbortError') throw new Error('Supabase API request timed out after 12 seconds');
    throw e;
  }finally{
    clearTimeout(timeout);
  }
}

function localSave(d){
  const payload=JSON.stringify(d,null,2);
  const tmpFile=`${DB_FILE}.tmp.${process.pid}.${Date.now()}`;
  try{
    fs.writeFileSync(tmpFile,payload,'utf8');
    fs.renameSync(tmpFile,DB_FILE);
  }catch(e){
    try{if(fs.existsSync(tmpFile))fs.unlinkSync(tmpFile);}catch(_){}
    fs.writeFileSync(DB_FILE,payload,'utf8');
  }
  lastSaveAt=new Date().toISOString();
}

function hasRealData(d){
  return !!(d && ((d.members||[]).length || (d.messages||[]).length || (d.passwordResetRequests||[]).length || (d.leveltrackRequests||[]).length || (d.leveltrackUpgrades||[]).length || (d.leveltrackPayments||[]).length || (d.leveltrackMessages||[]).length || (d.pins||[]).some(x=>x && !x.system)));
}

async function flushSupabaseSnapshots(){
  if(supabaseSaveWorker)return supabaseSaveWorker;
  supabaseSaveWorker=(async()=>{
    while(supabaseReady&&pendingSupabaseSnapshot){
      const snapshot=pendingSupabaseSnapshot;
      pendingSupabaseSnapshot=null;
      let saved=false;
      for(let attempt=1;attempt<=3&&!saved;attempt++){
        try{
          await supabaseFetch('app_state?id=eq.1',{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({data:snapshot})});
          saved=true;
          lastSaveAt=new Date().toISOString();
          lastSaveError=null;
          totalSavesCompleted++;
        }catch(e){
          lastSaveError=e.message;
          console.error(`Supabase API save failed (attempt ${attempt}/3):`,e.message);
          if(attempt<3) await new Promise(resolve=>setTimeout(resolve,500*attempt));
        }
      }
      if(!saved){
        // Keep the newest failed snapshot available for the next save attempt; never replace it with an older queued copy.
        if(!pendingSupabaseSnapshot)pendingSupabaseSnapshot=snapshot;
        supabaseRetryBlocked=true;
        console.error('Supabase persistence is behind local state; the latest snapshot is retained for retry on the next successful mutation.');
        break;
      }
    }
  })().finally(()=>{supabaseSaveWorker=null;if(supabaseReady&&pendingSupabaseSnapshot&&!supabaseRetryBlocked)flushSupabaseSnapshots()});
  return supabaseSaveWorker;
}

function save(d){
  localSave(d);
  if(!supabaseReady){
    totalSavesCompleted++;
    return Promise.resolve();
  }
  // Coalesce rapid mutations to the newest full-state snapshot to avoid stale writes and a long queue of obsolete snapshots.
  pendingSupabaseSnapshot=JSON.parse(JSON.stringify(d));
  supabaseRetryBlocked=false;
  return flushSupabaseSnapshots().catch(e=>console.error('Supabase persistence worker failed:',e.message));
}

let db=load();

function id(){return 'B5-'+crypto.randomBytes(3).toString('hex').toUpperCase()}
function referralCode(memberId){return 'REF-'+String(memberId||'').replace(/^B5-/,'').toUpperCase()}
function makePin(){return 'PIN-'+crypto.randomBytes(3).toString('hex').toUpperCase()}
const pin=makePin;
function hashPassword(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex')}

function ensureDbDefaults(targetDb){
  if(!targetDb || typeof targetDb!=='object') return;
  targetDb.adminPassword=targetDb.adminPassword||'ADMIN';
  targetDb.members=Array.isArray(targetDb.members)?targetDb.members:[];
  targetDb.pins=Array.isArray(targetDb.pins)?targetDb.pins:[];
  targetDb.messages=Array.isArray(targetDb.messages)?targetDb.messages:[];
  targetDb.passwordResetRequests=Array.isArray(targetDb.passwordResetRequests)?targetDb.passwordResetRequests:[];
  targetDb.leveltrackRequests=Array.isArray(targetDb.leveltrackRequests)?targetDb.leveltrackRequests:[];
  targetDb.leveltrackUpgrades=Array.isArray(targetDb.leveltrackUpgrades)?targetDb.leveltrackUpgrades:[];
  targetDb.leveltrackPayments=Array.isArray(targetDb.leveltrackPayments)?targetDb.leveltrackPayments:[];
  targetDb.leveltrackMessages=Array.isArray(targetDb.leveltrackMessages)?targetDb.leveltrackMessages:[];
  targetDb.emailNotificationLog=Array.isArray(targetDb.emailNotificationLog)?targetDb.emailNotificationLog:[];
  targetDb.paymentSettings=targetDb.paymentSettings||{
    admins:[
      {id:'A',name:'Admin A',accountHolder:'',bank:'',account:'',ifsc:'',upi:'',active:true},
      {id:'B',name:'Admin B',accountHolder:'',bank:'',account:'',ifsc:'',upi:'',active:true},
      {id:'C',name:'Admin C',accountHolder:'',bank:'',account:'',ifsc:'',upi:'',active:true}
    ],
    adminRotationIndex:0,
    adminRotationByLevel:{4:0,5:0,6:0,7:0},
    trust:{name:'Registered Trust',accountHolder:'',bank:'',account:'TEMP-TRUST-001',ifsc:'',upi:'',active:true}
  };
  targetDb.paymentSettings.admins=Array.isArray(targetDb.paymentSettings.admins)?targetDb.paymentSettings.admins:[];
  targetDb.paymentSettings.trust=targetDb.paymentSettings.trust||{name:'Registered Trust',account:'TEMP-TRUST-001'};
  targetDb.paymentSettings.adminRotationIndex=Number(targetDb.paymentSettings.adminRotationIndex||0);
  targetDb.paymentSettings.adminRotationByLevel=targetDb.paymentSettings.adminRotationByLevel||{4:0,5:0,6:0,7:0};
  [4,5,6,7].forEach(l=>{targetDb.paymentSettings.adminRotationByLevel[l]=Number(targetDb.paymentSettings.adminRotationByLevel[l]||0)});
  if(!targetDb.pins.some(x=>(x.pin==='PIN-START1'||x.pin==='B5-FMUXNF') && x.status==='AVAILABLE')){
    const old=targetDb.pins.find(x=>x.pin==='PIN-START1')||targetDb.pins.find(x=>x.pin==='B5-FMUXNF');
    if(!old) targetDb.pins.push({pin:'PIN-START1',assignedTo:null,status:'AVAILABLE',usedBy:null,createdAt:new Date().toISOString(),system:true});
    else if(!old.usedBy){old.status='AVAILABLE';old.assignedTo=null;}
  }
  targetDb.members.forEach(m=>{if(m&&!m.referralId)m.referralId=referralCode(m.memberId)});
}

// Initialize in-memory structure without overwriting local disk before initPersistentDatabase completes.
ensureDbDefaults(db);

// ---------------- OPTIONAL SENIORITY TEST DATA ----------------
// Enable only when testing: B5_SENIORITY_TEST_MODE=1
// Creates the supplied 10 test IDs and pins them to Seniority 1-10 for L2-L7.
const SENIORITY_TEST_IDS=[
  ['KARTHI01','7000000001'],['SATHYA02','7000000002'],['KARTHI03','7000000003'],['SATHYA04','7000000004'],['KARTHI05','7000000005'],
  ['SATHYA06','7000000006'],['KARTHI07','7000000007'],['SATHYA08','7000000008'],['KARTHI09','7000000009'],['KARTHI10','7000000010']
];
const SENIORITY_TEST_REF='REF-FC329E';
function seedSeniorityTestData(){
  if(String(process.env.B5_SENIORITY_TEST_MODE||'')!=='1') return false;
  let root=db.members.find(m=>String(m.referralId||'').toUpperCase()===SENIORITY_TEST_REF);
  if(!root){
    root={memberId:'B5-FC329E',referralId:SENIORITY_TEST_REF,name:'Seniority Test Root',mobile:'7999999999',email:'',status:'ACTIVE',referral:'FIRST MEMBER',level:1,levelMemberId:'L1-TEST-ROOT',joinedAt:'2000-01-01T00:00:00.000Z',levelReachedAt:{2:'2000-01-01T00:00:00.000Z',3:'2000-01-01T00:00:00.000Z',4:'2000-01-01T00:00:00.000Z',5:'2000-01-01T00:00:00.000Z',6:'2000-01-01T00:00:00.000Z',7:'2000-01-01T00:00:00.000Z'},passwordHash:hashPassword('B5@123456'),place:'TEST',accountHolder:'Seniority Test Root',bank:'TEST BANK',account:'TEST-ROOT',ifsc:'TEST0000001',branch:'TEST',upi:'testroot@upi',profileLocked:true};
    db.members.push(root);
  }
  const rootId=root.memberId;
  SENIORITY_TEST_IDS.forEach(([memberId,mobile],i)=>{
    let m=db.members.find(x=>x.memberId===memberId);
    const stamp=`2000-01-02T00:00:${String(i).padStart(2,'0')}.000Z`;
    const reached={};for(let l=2;l<=7;l++)reached[l]=stamp;
    if(!m){
      m={memberId,mobile,name:memberId,referral:rootId,referralId:referralCode(memberId),status:'ACTIVE',level:1,levelMemberId:`L1-TEST-${String(i+1).padStart(2,'0')}`,joinedAt:stamp,registeredAt:stamp,levelReachedAt:reached,passwordHash:hashPassword('B5@123456'),place:'TEST',accountHolder:memberId,bank:'TEST BANK',account:`TEST-${String(i+1).padStart(4,'0')}`,ifsc:'TEST0000001',branch:'TEST',upi:`${memberId.toLowerCase()}@upi`,profileLocked:true};
      db.members.push(m);
    }else{
      m.status='ACTIVE';m.referral=m.referral||rootId;m.level=1;m.levelMemberId=m.levelMemberId&&String(m.levelMemberId).startsWith('L1-')?m.levelMemberId:`L1-TEST-${String(i+1).padStart(2,'0')}`;m.joinedAt=m.joinedAt||stamp;m.levelReachedAt={...(m.levelReachedAt||{}),...reached};
    }
    m._seniorityTestOrder=i+1;
  });
  const testTrees=[
    {memberId:'B5-MOBTEST01',referralId:'REF-MOBTEST01',name:'Mobile Test Parent 1',mobile:'7888888801',prefix:'M1T'},
    {memberId:'B5-MOBTEST02',referralId:'REF-MOBTEST02',name:'Mobile Test Parent 2',mobile:'7888888802',prefix:'M2T'}
  ];
  testTrees.forEach((t,ti)=>{
    let root=db.members.find(m=>m.memberId===t.memberId||String(m.referralId||'').toUpperCase()===t.referralId);
    if(!root){root={memberId:t.memberId,referralId:t.referralId,name:t.name,mobile:t.mobile,email:'',status:'ACTIVE',referral:'FIRST MEMBER',level:1,levelMemberId:`L1-MOBTEST-${ti+1}`,joinedAt:`2026-01-01T00:00:0${ti}.000Z`,passwordHash:hashPassword('B5@123456'),place:'TEST',accountHolder:t.name,bank:'TEST BANK',account:`TEST-MOBILE-${ti+1}`,ifsc:'TEST0000001',branch:'TEST',upi:`${t.prefix.toLowerCase()}@upi`,profileLocked:true};db.members.push(root);}
    root.referralId=t.referralId;root.mobile=t.mobile;root.passwordHash=root.passwordHash||hashPassword('B5@123456');root.level=1;root.status='ACTIVE';
    for(let i=1;i<=13;i++){
      const memberId=`${t.prefix}${String(i).padStart(2,'0')}`;const mobile=String(7300000000+ti*100+i);const stamp=`2026-01-0${ti+1}T00:${String(i).padStart(2,'0')}:00.000Z`;
      let child=db.members.find(m=>m.memberId===memberId||m.mobile===mobile);
      if(!child){child={memberId,mobile,name:`${t.prefix} Referral ${String(i).padStart(2,'0')}`,email:'',status:'ACTIVE',referral:root.memberId,referralId:referralCode(memberId),level:1,levelMemberId:`L1-${t.prefix}-${String(i).padStart(3,'0')}`,joinedAt:stamp,registeredAt:stamp,passwordHash:hashPassword('B5@123456'),place:'TEST',accountHolder:`${t.prefix} Referral ${i}`,bank:'TEST BANK',account:`TEST-${t.prefix}-${String(i).padStart(2,'0')}`,ifsc:'TEST0000001',branch:'TEST',upi:`${memberId.toLowerCase()}@upi`,profileLocked:true};db.members.push(child);}else{child.referral=root.memberId;child.mobile=mobile;child.level=1;child.status='ACTIVE';child.passwordHash=child.passwordHash||hashPassword('B5@123456');}
    }
  });
  return true;
}

async function initPersistentDatabase(){
  if(LOCAL_TEST_ONLY){
    ensureDbDefaults(db);
    localSave(db);
    console.log('LOCAL TEST MODE: Using isolated local DB file:',DB_FILE);
    return;
  }
  if(!SUPABASE_URL||!SUPABASE_SECRET_KEY) throw new Error('Supabase API is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY.');
  let lastError=null;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const rows=await supabaseFetch('app_state?select=data&id=eq.1');
      if(Array.isArray(rows) && rows.length){
        const remote=typeof rows[0].data==='string'?JSON.parse(rows[0].data):rows[0].data;
        if(hasRealData(remote)){
          db=remote;
          ensureDbDefaults(db);
          supabaseReady=true;
          localSave(db);
          console.log('PERMANENT DATABASE: Supabase loaded; existing data preserved');
          return;
        }
        if(hasRealData(db)){
          ensureDbDefaults(db);
          await supabaseFetch('app_state?id=eq.1',{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({data:db})});
          supabaseReady=true;
          localSave(db);
          console.log('PERMANENT DATABASE: empty Supabase state initialized from existing local data');
          return;
        }
        throw new Error('Supabase app_state is empty and no existing local data is available. Refusing to create an empty database.');
      }
      if(!hasRealData(db)) throw new Error('Supabase app_state is empty and no existing local data is available. Refusing to create an empty database.');
      ensureDbDefaults(db);
      await supabaseFetch('app_state',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({id:1,data:db})});
      supabaseReady=true;
      localSave(db);
      console.log('PERMANENT DATABASE: initialized Supabase from existing local data');
      return;
    }catch(err){
      lastError=err;
      lastSaveError=err.message;
      console.error(`PERMANENT DATABASE: Supabase startup attempt ${attempt}/3 failed:`,err.message);
      if(attempt<3) await new Promise(r=>setTimeout(r,1500*attempt));
    }
  }
  if(hasRealData(db)){
    ensureDbDefaults(db);
    supabaseReady=false;
    localSave(db);
    console.error('PERMANENT DATABASE: Supabase temporarily unavailable; starting in degraded local mode preserving local data. Last error:',lastError?.message||lastError);
    return;
  }
  throw lastError||new Error('Supabase unavailable and no local data is available.');
}

function isQualifyingMember(m){
  if(!m || typeof m!=='object' || !m.memberId) return false;
  if(m.deleted===true || m.invalid===true) return false;
  const st=String(m.status||'ACTIVE').trim().toLowerCase();
  if(st==='rejected' || st==='deleted' || st==='invalid' || st==='cancelled') return false;
  return true;
}

function memberPublic(m){return {memberId:m.memberId,referralId:m.referralId||referralCode(m.memberId),name:m.name,mobile:m.mobile,email:m.email||m.rEmail||'',status:(m.status==='Rejected'?'Rejected':'ACTIVE'),rawStatus:m.status||'ACTIVE',referral:m.referral,level:Number(m.level||1),levelMemberId:m.levelMemberId||null,joinedAt:m.joinedAt||m.registeredAt||null,upgradeDate:m.upgradeDate||null,profileLocked:!!m.profileLocked,paymentAccessLocked:!!m.paymentAccessLocked}}
function memberProfile(m){return {memberId:m.memberId,referralId:m.referralId||referralCode(m.memberId),name:m.name||'',place:m.place||'',mobile:m.mobile||'',email:m.email||m.rEmail||'',referral:m.referral||'FIRST MEMBER',accountHolder:m.accountHolder||m.name||'',bank:m.bank||'',account:m.account||'',ifsc:m.ifsc||'',branch:m.branch||'',upi:m.upi||'',photo:m.photo||'',profileLocked:!!m.profileLocked}}
function findMember(q){q=String(q||'').toLowerCase();return db.members.filter(m=>(m.name+' '+m.memberId+' '+m.mobile).toLowerCase().includes(q))}

// Qualifying direct referrals only (excludes Rejected/deleted/invalid and prevents duplicate counting of the same member).
function direct(id){
  if(!id) return [];
  const seenIds=new Set();
  const seenMobiles=new Set();
  const out=[];
  for(const m of db.members){
    if(!isQualifyingMember(m)) continue;
    if(m.referral!==id) continue;
    if(m.memberId===id) continue;
    if(seenIds.has(m.memberId)) continue;
    const mob=String(m.mobile||'').trim();
    if(mob && seenMobiles.has(mob)) continue;
    seenIds.add(m.memberId);
    if(mob) seenMobiles.add(mob);
    out.push(m);
  }
  return out;
}

function descendants(rootId){
  let levels={1:[],2:[],3:[],4:[],5:[],6:[],7:[]}, current=[rootId], visited=new Set([rootId]);
  for(let l=1;l<=7;l++){
    const nextMembers=[];
    for(const pid of current){
      for(const m of direct(pid)){
        if(!visited.has(m.memberId)){
          visited.add(m.memberId);
          nextMembers.push(m);
        }
      }
    }
    levels[l]=nextMembers;
    current=nextMembers.map(m=>m.memberId);
    if(!current.length)break;
  }
  return levels;
}

function tree(rootId){
  const root=db.members.find(m=>m.memberId===rootId);
  if(!root)return {name:'நீங்கள்',id:'Not Registered',children:[]};
  const visited=new Set([rootId]);
  const kids=(id)=>direct(id).filter(m=>{if(visited.has(m.memberId))return false;visited.add(m.memberId);return true;}).map(m=>({name:m.name,id:m.memberId,status:m.status,level:Number(m.level||1),children:kids(m.memberId)}));
  return {name:root.name,id:root.memberId,status:root.status,level:Number(root.level||1),children:kids(root.memberId)};
}

function wallet(memberId){
  const ps=db.pins.filter(p=>p.assignedTo===memberId);
  return {received:ps.length,used:ps.filter(p=>p.status==='USED').length,available:ps.filter(p=>p.status==='AVAILABLE').length,pins:ps.slice(-50)};
}

const AUTH_SECRET=process.env.B5_AUTH_SECRET||crypto.createHash('sha256').update('B5-SOVEREIGN-AUTH-KEY:'+(process.env.SUPABASE_SECRET_KEY||'LOCAL-DEV')).digest('hex');

function createAuthToken(payload){
  const data={...payload,iat:Date.now()};
  if(data.role==='admin'){
    data.pwdSig=hashPassword(db.adminPassword||'ADMIN').slice(0,16);
  }
  const b64=Buffer.from(JSON.stringify(data),'utf8').toString('base64url');
  const sig=crypto.createHmac('sha256',AUTH_SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verifyAuthToken(token){
  if(!token||typeof token!=='string'||!token.includes('.'))return null;
  const [b64,sig]=token.split('.');
  if(!b64||!sig)return null;
  const expected=crypto.createHmac('sha256',AUTH_SECRET).update(b64).digest('base64url');
  if(sig!==expected)return null;
  try{
    const data=JSON.parse(Buffer.from(b64,'base64url').toString('utf8'));
    if(data.role==='admin'&&data.pwdSig!==hashPassword(db.adminPassword||'ADMIN').slice(0,16))return null;
    return data;
  }catch(e){
    return null;
  }
}

function parseCookies(req){
  const out={};
  const raw=String(req.headers?.cookie||'');
  raw.split(';').forEach(pair=>{
    const idx=pair.indexOf('=');
    if(idx>0){
      const k=pair.slice(0,idx).trim();
      const v=pair.slice(idx+1).trim();
      try{out[k]=decodeURIComponent(v);}catch{out[k]=v;}
    }
  });
  return out;
}

function getAuthContext(req){
  const cookies=parseCookies(req);
  const bearer=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'').trim();
  const qToken=String(req.query?.authToken||'').trim();
  const adminCandidates=[req.headers?.['x-admin-token'],bearer,qToken,cookies.b5_admin_token].filter(Boolean);
  let isAdmin=false;
  let memberId=null;
  for(const tok of adminCandidates){
    const decoded=verifyAuthToken(String(tok));
    if(decoded?.role==='admin'){isAdmin=true;break;}
    if(decoded?.role==='member'&&decoded.memberId&&!memberId){memberId=decoded.memberId;}
  }
  const memberCandidates=[req.headers?.['x-member-token'],bearer,qToken,cookies.b5_member_token].filter(Boolean);
  for(const tok of memberCandidates){
    const decoded=verifyAuthToken(String(tok));
    if(decoded?.role==='member'&&decoded.memberId&&!memberId){memberId=decoded.memberId;}
    if(decoded?.role==='admin')isAdmin=true;
  }
  return {isAdmin,memberId};
}

function requireAdminAuth(req,res,next){
  if(req.path==='/login'||req.path==='/logout')return next();
  const ctx=getAuthContext(req);
  if(ctx.isAdmin)return next();
  if(ctx.memberId){
    return res.status(403).json({error:'Forbidden: Admin role required. Member accounts cannot access administrative APIs.'});
  }
  return res.status(401).json({error:'Admin authentication required. Please sign in to the Admin Portal.'});
}

app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'member.html')));
app.get('/member.html',(req,res)=>res.sendFile(path.join(__dirname,'member.html')));
app.get('/user/login',(req,res)=>res.sendFile(path.join(__dirname,'login.html')));
app.get('/user/dashboard',(req,res)=>res.sendFile(path.join(__dirname,'member.html')));
app.get('/admin.html',(req,res)=>res.sendFile(path.join(__dirname,'admin.html')));
app.get('/admin/login',(req,res)=>res.sendFile(path.join(__dirname,'admin.html')));
app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'admin.html')));
app.get('/login.html',(req,res)=>res.sendFile(path.join(__dirname,'login.html')));
app.get('/mobile-preview',(req,res)=>res.sendFile(path.join(__dirname,'mobile-preview.html')));

app.use('/api/admin',requireAdminAuth);
app.use('/api/leveltrack/admin',requireAdminAuth);

app.post('/api/admin/login',(req,res)=>{
  if(req.body.password!==db.adminPassword)return res.status(401).json({error:'Incorrect password'});
  const adminToken=createAuthToken({role:'admin'});
  res.setHeader('Set-Cookie',`b5_admin_token=${encodeURIComponent(adminToken)}; Path=/; HttpOnly; SameSite=Lax`);
  notifyAdminEmail('BORNTOWIN5 - Admin Login Security Alert',`Admin portal login succeeded at ${new Date().toISOString()}.`,{eventType:'LOGIN_SECURITY',eventKey:`ADMIN_LOGIN:${new Date().toISOString().slice(0,16)}`});
  res.json({ok:true,role:'admin',adminToken});
});
app.post('/api/admin/logout',(req,res)=>{
  res.setHeader('Set-Cookie','b5_admin_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  res.json({ok:true});
});
app.get('/api/admin/session',(req,res)=>res.json({ok:true,role:'admin'}));
app.post('/api/admin/password',async(req,res)=>{
  if(req.body.oldPassword!==db.adminPassword)return res.status(401).json({error:'Current password is incorrect'});
  db.adminPassword=String(req.body.newPassword||'');
  const adminToken=createAuthToken({role:'admin'});
  res.setHeader('Set-Cookie',`b5_admin_token=${encodeURIComponent(adminToken)}; Path=/; HttpOnly; SameSite=Lax`);
  await save(db);
  res.json({ok:true,adminToken});
});
app.get('/api/admin/dashboard',(req,res)=>{
  const today=new Date().toISOString().slice(0,10);
  const total=db.members.length,pending=db.members.filter(m=>m.status==='Pending').length,verified=db.members.filter(m=>m.status==='Verified').length;
  const todayMembers=db.members.filter(m=>String(m.registeredAt||m.joinedAt||'').slice(0,10)===today).map(memberPublic);
  const report=db.members.map(m=>{const w=wallet(m.memberId);return {name:m.name,memberId:m.memberId,received:w.received,used:w.used,available:w.available}});
  const sent=db.pins.filter(p=>p.assignedTo).length;
  const used=db.pins.filter(p=>p.status==='USED').length;
  const leaders=new Set(db.pins.filter(p=>p.assignedTo).map(p=>p.assignedTo)).size;
  res.json({total,pending,verified,todayRegistrations:todayMembers.length,members:db.members.map(memberPublic),pinSummary:{sent,used,leaders},pinReport:report});
});
app.get('/api/admin/members',(req,res)=>res.json({members:findMember(req.query.q).map(memberPublic)}));
app.get('/api/admin/member-details/:id',(req,res)=>{
  const m=db.members.find(x=>x.memberId===req.params.id);
  if(!m)return res.status(404).json({error:'Member not found'});
  const visited=new Set([m.memberId]);
  const kids=(id)=>db.members.filter(x=>x.referral===id).filter(x=>{if(visited.has(x.memberId))return false;visited.add(x.memberId);return true;}).map(x=>({memberId:x.memberId,name:x.name,mobile:x.mobile,status:x.status,level:Number(x.level||1),levelMemberId:x.levelMemberId||null,children:kids(x.memberId)}));
  res.json({member:memberPublic(m),details:m,referralTree:{memberId:m.memberId,name:m.name,mobile:m.mobile,status:m.status,level:Number(x.level||1),levelMemberId:m.levelMemberId||null,children:kids(m.memberId)},directReferrals:direct(m.memberId).length,totalDownline:downlineCount(m.memberId)});
});
app.get('/api/admin/password-reset-requests',(req,res)=>{res.json({requests:db.passwordResetRequests.filter(x=>x.status==='Pending').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))})});
app.post('/api/admin/password-reset/:id',async(req,res)=>{const r=db.passwordResetRequests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Reset request not found'});const m=db.members.find(x=>x.memberId===r.memberId);if(!m)return res.status(404).json({error:'Member not found'});let temp=String(req.body.temporaryPassword||'');if(temp.length<6)temp='B5@'+crypto.randomBytes(3).toString('hex');m.passwordHash=hashPassword(temp);m.mustChangePassword=true;r.status='Approved';r.approvedAt=new Date().toISOString();r.temporaryPassword=temp;db.messages.push({to:m.memberId,message:'Admin approved your password reset. Temporary password: '+temp+'. Login and change your password.',at:new Date().toISOString()});notifyMemberEmail(m,'BORNTOWIN5 - Password Reset Approved',`Hello ${m.name},\n\nAdmin approved your password reset request.\nTemporary password: ${temp}\nPlease sign in and change your password immediately.`,{eventType:'LOGIN_SECURITY',eventKey:`PWD_RESET_APPROVED:${r.id}`});await save(db);res.json({ok:true,temporaryPassword:temp,member:memberPublic(m)})});

let _lastMonotonicMs=0;
function nextMonotonicIso(){
  const now=Math.max(Date.now(),_lastMonotonicMs+1);
  _lastMonotonicMs=now;
  return new Date(now).toISOString();
}

app.post('/api/admin/member-status',async(req,res)=>{
  const m=db.members.find(x=>x.memberId===req.body.memberId);
  if(!m)return res.status(404).json({error:'Member not found'});
  m.status=req.body.status;
  if(req.body.status==='Verified'){
    if(!m.level)m.level=1;
    if(!m.levelMemberId)m.levelMemberId=nextLevelMemberId(m.level);
    if(!m.joinedAt)m.joinedAt=nextMonotonicIso();
  }
  await save(db);res.json({ok:true,member:memberPublic(m)})
});
app.post('/api/admin/message',async(req,res)=>{
  const msgText=String(req.body.message||'').trim();
  const now=new Date().toISOString();
  if(req.body.to==='all'){
    db.messages.push({to:'ALL',message:msgText,at:now});
    notifyAdminEmail('BORNTOWIN5 - Admin Broadcast Announcement',`Broadcast Announcement to ALL members:\n\n${msgText}`,{eventType:'ADMIN_ANNOUNCEMENT',eventKey:`ADMIN_MSG_ALL:${now}`,metadata:{to:'ALL',message:msgText}});
  }else{
    const targetMember=db.members.find(m=>m.memberId===req.body.memberId);
    if(!targetMember)return res.status(404).json({error:'Member not found'});
    db.messages.push({to:targetMember.memberId,message:msgText,at:now});
    notifyMemberEmail(targetMember,'BORNTOWIN5 - Official Admin Message',`Hello ${targetMember.name},\n\nMessage from BORNTOWIN5 Admin:\n${msgText}`,{eventType:'ADMIN_ANNOUNCEMENT',eventKey:`ADMIN_MSG:${targetMember.memberId}:${now}`,metadata:{to:targetMember.memberId,message:msgText}});
  }
  await save(db);
  res.json({ok:true});
});
app.post('/api/admin/pins/generate',async(req,res)=>{
  const m=db.members.find(x=>x.memberId===req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});
  const n=Math.min(500,Math.max(1,Number(req.body.quantity)||1)),out=[];
  for(let i=0;i<n;i++){let p=pin();while(db.pins.some(x=>x.pin===p))p=pin();const row={pin:p,assignedTo:m.memberId,status:'AVAILABLE',usedBy:null,createdAt:new Date().toISOString()};db.pins.push(row);out.push(row)}
  await save(db);const w=wallet(m.memberId);res.json({pins:out,member:memberPublic(m),available:w.available,used:w.used});
});

app.get('/api/member/referral-info/:id',(req,res)=>{
  const id=String(req.params.id||'').trim().toUpperCase();
  if(!id||id==='FIRST MEMBER')return res.json({valid:id==='FIRST MEMBER',member:null});
  const m=db.members.find(x=>String(x.memberId||'').toUpperCase()===id||String(x.referralId||'').toUpperCase()===id||referralCode(x.memberId)===id);
  if(!m||m.status==='Rejected')return res.status(404).json({valid:false,error:'Referral ID not found'});
  res.json({valid:true,member:{memberId:m.memberId,referralId:m.referralId||referralCode(m.memberId),name:m.name,mobile:m.mobile,level:Number(m.level||1)}});
});
app.post('/api/member/login',(req,res)=>{
  const m=db.members.find(x=>x.mobile===String(req.body.mobile||'').trim());
  if(!m)return res.status(404).json({error:'Member not found. Please register first.'});
  const supplied=String(req.body.password||'');
  if(!m.passwordHash)return res.status(401).json({error:'Password not set. Please use Forgot Password and contact Admin.'});
  if(hashPassword(supplied)!==m.passwordHash)return res.status(401).json({error:'Incorrect password'});
  const memberToken=createAuthToken({role:'member',memberId:m.memberId});
  res.setHeader('Set-Cookie',`b5_member_token=${encodeURIComponent(memberToken)}; Path=/; HttpOnly; SameSite=Lax`);
  notifyMemberEmail(m,'BORNTOWIN5 - Login Security Alert',`Hello ${m.name},\n\nYour BORNTOWIN5 account (${m.memberId}) was signed in at ${new Date().toISOString()}.`,{eventType:'LOGIN_SECURITY',eventKey:`MEMBER_LOGIN:${m.memberId}:${new Date().toISOString().slice(0,16)}`});
  res.json({member:{...memberPublic(m),mustChangePassword:!!m.mustChangePassword},memberToken});
});
app.post('/api/member/logout',(req,res)=>{
  res.setHeader('Set-Cookie','b5_member_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  res.json({ok:true});
});
app.post('/api/member/forgot-password',async(req,res)=>{const mobile=String(req.body.mobile||'').trim();const m=db.members.find(x=>x.mobile===mobile);if(!m)return res.status(404).json({error:'Mobile number not found'});const pending=db.passwordResetRequests.find(x=>x.memberId===m.memberId&&x.status==='Pending');if(pending)return res.json({ok:true,message:'Password reset request already sent to Admin.'});const prId='PR-'+crypto.randomBytes(4).toString('hex').toUpperCase();db.passwordResetRequests.push({id:prId,memberId:m.memberId,mobile:m.mobile,name:m.name,status:'Pending',createdAt:new Date().toISOString()});notifyMemberEmail(m,'BORNTOWIN5 - Password Reset Requested',`Hello ${m.name},\n\nA password reset was requested for your account (${m.memberId}). Admin will review your request shortly.`,{eventType:'LOGIN_SECURITY',eventKey:`PWD_RESET_REQ:${prId}`});await save(db);res.json({ok:true,message:'Password reset request sent to Admin. Please contact Admin after approval.'})});
app.post('/api/member/password/:id',async(req,res)=>{const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Member not found'});if(!m.passwordHash||hashPassword(req.body.oldPassword)!==m.passwordHash)return res.status(401).json({error:'Current password is incorrect'});const np=String(req.body.newPassword||'');if(np.length<6)return res.status(400).json({error:'New password must be at least 6 characters'});m.passwordHash=hashPassword(np);m.mustChangePassword=false;await save(db);res.json({ok:true})});
app.post('/api/member/check-pin',(req,res)=>{const p=String(req.body.pin||'').toUpperCase();if(!db.pins.some(x=>x.pin===p&&x.status==='AVAILABLE'))return res.status(400).json({error:'Invalid or unavailable Joining PIN'});res.json({ok:true})});
app.post('/api/member/register',async(req,res)=>{
  const b=req.body||{};
  const mobile=String(b.mobile||'').trim();
  if(!/^\d{10}$/.test(mobile))return res.status(400).json({error:'Mobile number must be 10 digits'});
  if(db.members.some(m=>m.mobile===mobile))return res.status(409).json({error:'Mobile number already registered'});
  const p=String(b.pin||'').toUpperCase(),pr=db.pins.find(x=>x.pin===p&&x.status==='AVAILABLE');
  if(!pr)return res.status(400).json({error:'Invalid or unavailable Joining PIN'});
  let parentId='FIRST MEMBER';
  if(String(b.referral||'FIRST MEMBER').toUpperCase()!=='FIRST MEMBER'){
    const ref=String(b.referral||'').trim().toUpperCase();
    const parent=db.members.find(x=>String(x.memberId||'').toUpperCase()===ref||String(x.referralId||'').toUpperCase()===ref||referralCode(x.memberId)===ref);
    if(!parent||parent.status==='Rejected')return res.status(400).json({error:'Invalid Referral ID'});
    parentId=parent.memberId;
  }
  const memberId=id();
  const m={...b,mobile,memberId,referralId:referralCode(memberId),referral:parentId,level:1,status:'Pending',registeredAt:nextMonotonicIso(),passwordHash:hashPassword(b.password)};
  delete m.pin;delete m.password;db.members.push(m);pr.status='USED';pr.usedBy=m.memberId;pr.usedAt=new Date().toISOString();
  notifyMemberEmail(m,'BORNTOWIN5 - Registration Successful',`Hello ${m.name},\n\nYour BORNTOWIN5 registration was successful.\nMember ID: ${m.memberId}\nMobile: ${m.mobile}\n\nThank you for joining BORNTOWIN5.`,{eventType:'REGISTRATION_CONFIRMATION',eventKey:`REGISTER:${m.memberId}`,metadata:{memberId:m.memberId,mobile:m.mobile}});
  const memberToken=createAuthToken({role:'member',memberId:m.memberId});
  res.setHeader('Set-Cookie',`b5_member_token=${encodeURIComponent(memberToken)}; Path=/; HttpOnly; SameSite=Lax`);
  await save(db);
  res.json({member:memberPublic(m),memberToken});
});
app.post('/api/admin/member-profile/:id',async(req,res)=>{const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Member not found'});const b=req.body||{};for(const k of ['name','place','accountHolder','bank','account','ifsc','branch','upi'])if(b[k]!==undefined)m[k]=String(b[k]).trim();if(!m.name||!m.place||!m.accountHolder||!m.bank||!m.account||!m.ifsc||!m.branch||!m.upi)return res.status(400).json({error:'Please complete all profile and bank details'});m.profileLocked=true;await save(db);res.json({ok:true,member:memberPublic(m),profile:memberProfile(m)});});
app.get('/api/member/profile/:id',(req,res)=>{const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Member not found'});res.json({profile:memberProfile(m)})});
app.post('/api/member/profile/:id',async(req,res)=>{const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Member not found'});if(m.profileLocked)return res.status(403).json({error:'Profile is locked. Please contact Admin for changes.'});const b=req.body||{};for(const k of ['name','place','accountHolder','bank','account','ifsc','branch','upi'])if(b[k]!==undefined)m[k]=String(b[k]).trim();if(b.photo!==undefined){const photo=String(b.photo);if(photo.length>1200000)return res.status(400).json({error:'Profile photo is too large'});m.photo=photo}if(!m.name||!m.place||!m.accountHolder||!m.bank||!m.account||!m.ifsc||!m.branch||!m.upi)return res.status(400).json({error:'Please complete all profile and bank details'});m.profileLocked=true;await save(db);res.json({ok:true,member:memberPublic(m),profile:memberProfile(m)})});
app.get('/api/member/dashboard/:id',(req,res)=>{
  const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Member not found'});
  const lv=descendants(m.memberId),w=wallet(m.memberId);
  const levels={};for(let i=1;i<=7;i++)levels[i]=lv[i].map(memberPublic);
  const messages=[...db.messages.filter(x=>x.to===m.memberId||x.to==='ALL'),...db.leveltrackMessages.filter(x=>x.to===m.memberId)].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,10).map(x=>({to:x.to,message:x.message,at:x.at}));
  res.json({member:memberPublic(m),profile:memberProfile(m),levels,tree:tree(m.memberId),wallet:w,messages});
});
app.get('/api/member/level/:id/:level',(req,res)=>{
  const m=db.members.find(x=>x.memberId===req.params.id),l=Number(req.params.level);if(!m||l<1||l>7)return res.status(404).json({error:'Not found'});
  const lv=descendants(m.memberId);res.json({members:lv[l].map(memberPublic)});
});
app.post('/api/member/use-pin',async(req,res)=>{
  const p=db.pins.find(x=>x.assignedTo===req.body.memberId&&x.status==='AVAILABLE');if(!p)return res.status(400).json({error:'No available PIN'});
  p.status='USED';p.usedBy=req.body.memberId;p.usedAt=new Date().toISOString();await save(db);res.json({wallet:wallet(req.body.memberId)});
});


// ---------------- LEVELTRACK SERVER API ----------------
// Synchronized milestone requirements: 3, 5, 7, 9, 11, 13 qualifying direct referrals for L1->L2 through L6->L7.
const LEVEL_RULES={
  1:{upgrade:1000,member:1000,trust:0,admin:0,required:3},
  2:{upgrade:3000,member:3000,trust:0,admin:0,required:5},
  3:{upgrade:20000,member:15600,trust:2400,admin:2000,required:7},
  4:{upgrade:100000,member:72000,trust:16000,admin:12000,required:9},
  5:{upgrade:200000,member:148000,trust:32000,admin:20000,required:11},
  6:{upgrade:500000,member:240000,trust:160000,admin:100000,required:13},
  7:{upgrade:0,member:0,trust:0,admin:0,required:13}
};
function splitRule(from){const r=LEVEL_RULES[Number(from)]||{upgrade:0,member:0,trust:0,admin:0};const out=[{type:'member',label:'MEMBER / RECEIVER',amount:Number(r.member||r.upgrade||0)}];if(Number(r.trust||0)>0)out.push({type:'trust',label:'TRUST',amount:Number(r.trust)});if(Number(r.admin||0)>0)out.push({type:'admin',label:'ADMIN',amount:Number(r.admin)});return {upgrade:Number(r.upgrade||0),parts:out};}
function activeAdminAccounts(){return (db.paymentSettings.admins||[]).filter(x=>x.active!==false);}
function allocateAdminAccount(level){const a=activeAdminAccounts();if(!a.length)return null;const l=Number(level||0);if([4,5,6,7].includes(l)){db.paymentSettings.adminRotationByLevel=db.paymentSettings.adminRotationByLevel||{4:0,5:0,6:0,7:0};const idx=Number(db.paymentSettings.adminRotationByLevel[l]||0)%a.length;const chosen=a[idx];db.paymentSettings.adminRotationByLevel[l]=(idx+1)%a.length;return {...chosen};}const idx=Number(db.paymentSettings.adminRotationIndex||0)%a.length;const chosen=a[idx];db.paymentSettings.adminRotationIndex=(idx+1)%a.length;return {...chosen};}
const LEVEL_SLOT_CAPACITY={2:5,3:10,4:10,5:5,6:5,7:5};
function earningsRequired(level){return LEVEL_SLOT_CAPACITY[Number(level)]||0;}
function allocateAdminAccountForRequest(r){
  if(r&&r.assignedAdminAccount&&r.assignedAdminAccount.id){
    return {...r.assignedAdminAccount};
  }
  const level=Number(r?.to||0);
  const chosen=allocateAdminAccount(level);
  if(r&&chosen)r.assignedAdminAccount={...chosen};
  return chosen;
}
const PAYMENT_DEADLINE_MS=24*60*60*1000;
const activeMutationLocks=new Set();
let _allocationMutex=Promise.resolve();
function withAllocationLock(fn){
  const run=_allocationMutex.then(fn,fn);
  _allocationMutex=run.catch(()=>{});
  return run;
}
function latestPaymentForUpgrade(upgradeId){return db.leveltrackPayments.filter(x=>x.upgradeId===upgradeId&&!x._superseded).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0]||db.leveltrackPayments.filter(x=>x.upgradeId===upgradeId).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0]||null;}
function paymentDeadlineAt(p){if(!p)return null;if(p.expiresAt)return p.expiresAt;const start=Date.parse(p.detailsSentAt||p.createdAt||'');return Number.isFinite(start)?new Date(start+PAYMENT_DEADLINE_MS).toISOString():null;}
function paymentIsExpired(p){if(!p||p.adminApproved||p.memberPaid||p.slotReleased||p.rejected||p.status==='REJECTED'||p.status==='RELEASED'||p.status==='REASSIGNED')return false;const d=Date.parse(paymentDeadlineAt(p)||'');return Number.isFinite(d)&&Date.now()>=d;}
function paymentPublic(p){
  if(!p)return p;
  const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId)||null;
  const req=db.leveltrackRequests.find(x=>x.id===(p.requestId||u?.requestId))||null;
  const sender=ltMember(p.fromMemberId)||null;
  const receiver=ltMember(p.receiverMemberId)||null;
  const memberPart=(p.parts||[]).find(x=>x.type==='member')||null;
  const expiresAt=paymentDeadlineAt(p);
  const expired=paymentIsExpired(p);
  const isRejected=!!(p.rejected||p.status==='REJECTED');
  const kind=p.kind||u?.kind||req?.kind||'LEVEL_UPGRADE';
  const fromLevel=Number(p.fromLevel??u?.from??req?.from??1);
  const toLevel=Number(p.toLevel??u?.to??req?.to??2);
  const seniorityLevel=kind==='REFERRAL_UPGRADE'?2:Number(p.seniorityLevel||u?.seniorityLevel||req?.seniorityLevel||toLevel||2);
  const screenshot=memberPart?.screenshot||p.screenshot||null;
  const proofRef=memberPart?.proofRef||p.proofRef||(screenshot?`/api/leveltrack/proofs/${encodeURIComponent(p.id)}/member`:null);
  const verificationStatus=isRejected?'REJECTED':(p.adminApproved?'APPROVED':(p.memberAccepted?'RECEIVER_CONFIRMED':(p.memberPaid?'PROOF_SUBMITTED':'ASSIGNED')));
  const approvalStatus=isRejected?'REJECTED':(p.adminApproved?'APPROVED':'PENDING');
  return {
    ...p,
    paymentId:p.id,
    requestId:p.requestId||u?.requestId||req?.id||'',
    upgradeId:p.upgradeId||u?.id||'',
    senderMemberId:p.fromMemberId,
    fromMemberId:p.fromMemberId,
    senderName:sender?.name||p.from||p.fromMemberId,
    senderMobile:sender?.mobile||'',
    receiverMemberId:p.receiverMemberId,
    payeeId:p.payeeId||p.receiverMemberId,
    receiverName:receiver?.name||p.to||p.receiverMemberId,
    kind,
    from:fromLevel,
    to:toLevel,
    fromLevel,
    toLevel,
    seniorityLevel,
    receiverAmount:Number(memberPart?.amount||p.amount||0),
    utr:memberPart?.utr||p.utr||'',
    screenshot,
    proofRef,
    submittedAt:p.submittedAt||memberPart?.submittedAt||null,
    verificationStatus,
    approvalStatus,
    rejected:isRejected,
    rejectedAt:p.rejectedAt||null,
    rejectionReason:p.rejectionReason||'',
    expiresAt,
    expired,
    locked:!!p.paymentAccessLocked||expired,
    adminContactEmail:ADMIN_NOTIFICATION_EMAIL
  };
}

function seniorityQueue(level,options={}){
  const target=Number(level);
  const ignoreRequestId=options&&options.ignoreRequestId?String(options.ignoreRequestId):'';
  const validMembers=db.members.filter(isQualifyingMember);
  const firstMember=[...validMembers].sort((a,b)=>String(a.joinedAt||a.registeredAt||a.createdAt||'').localeCompare(String(b.joinedAt||b.registeredAt||b.createdAt||'')))[0]||null;
  const seenIds=new Set();
  const eligible=[];
  for(const m of validMembers){
    if(seenIds.has(m.memberId)) continue;
    const reached=m.levelReachedAt&&m.levelReachedAt[target];
    if(!!reached || Number(m.level||1)>=target){
      seenIds.add(m.memberId);
      eligible.push(m);
    }
  }
  // Preserve the permanent root position for the First Company / First Member.
  if(firstMember && target>=2 && !seenIds.has(firstMember.memberId)){
    seenIds.add(firstMember.memberId);
    eligible.push(firstMember);
  }
  eligible.sort((a,b)=>{
    if(String(process.env.B5_SENIORITY_TEST_MODE||'')==='1'){
      const ao=Number(a._seniorityTestOrder||999999),bo=Number(b._seniorityTestOrder||999999);
      if(ao!==bo)return ao-bo;
    }
    if(firstMember && a.memberId===firstMember.memberId && b.memberId!==firstMember.memberId && !a._seniorityTestOrder && !b._seniorityTestOrder)return -1;
    if(firstMember && b.memberId===firstMember.memberId && a.memberId!==firstMember.memberId && !a._seniorityTestOrder && !b._seniorityTestOrder)return 1;
    const at=(m)=>String((m.levelReachedAt&&m.levelReachedAt[target])||m.upgradeDate||m.joinedAt||m.registeredAt||m.createdAt||'');
    const cmp=at(a).localeCompare(at(b));
    return cmp!==0?cmp:String(a.memberId||'').localeCompare(String(b.memberId||''));
  });
  return eligible.map((m,i)=>{
    const countedUpgradeIds=new Set();
    const allocatedRequests=[];
    const completedPayments=db.leveltrackPayments.filter(p=>{
      if(p.receiverMemberId!==m.memberId || !p.adminApproved || !p.memberAccepted || p.rejected || p.status==='REJECTED') return false;
      const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);
      if(!u || !u.adminApproved) return false;
      // All ₹1,000 Advanced Referral Upgrades always belong to L2, regardless of the payer's current level.
      const paymentLevel=u.kind==='REFERRAL_UPGRADE' ? 2 : Number(p.seniorityLevel||u.seniorityLevel||u.to||0);
      if(paymentLevel!==target) return false;
      if(countedUpgradeIds.has(u.id)) return false;
      countedUpgradeIds.add(u.id);
      allocatedRequests.push({
        requestId:String(p.requestId||u.requestId||''),
        paymentId:p.id,
        payerMemberId:p.fromMemberId,
        payerName:p.from||p.fromMemberId,
        kind:u.kind||'LEVEL_UPGRADE',
        amount:Number(p.amount||u.amount||0),
        stage:'APPROVED'
      });
      return true;
    });
    const completed=completedPayments.length;
    const required=earningsRequired(target);
    const reservedRequestIds=new Set();
    const activeAssignedPayments=db.leveltrackPayments.filter(p=>{
      const pLevel=p.kind==='REFERRAL_UPGRADE' ? 2 : Number(p.seniorityLevel||2);
      if(p.receiverMemberId!==m.memberId || pLevel!==target) return false;
      if(p.adminApproved || p.slotReleased || p.rejected || p.status==='REJECTED' || p.status==='RELEASED' || p.status==='REASSIGNED' || p.paymentAccessLocked || p._superseded) return false;
      const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);
      if(!u || u.adminApproved) return false;
      const reqId=String(p.requestId||u.requestId||'');
      if(ignoreRequestId && reqId===ignoreRequestId) return false;
      const latest=latestPaymentForUpgrade(p.upgradeId);
      if(!latest || latest.id!==p.id) return false;
      if(reqId){
        if(reservedRequestIds.has(reqId)) return false;
        reservedRequestIds.add(reqId);
      }
      allocatedRequests.push({
        requestId:reqId,
        paymentId:p.id,
        payerMemberId:p.fromMemberId,
        payerName:p.from||p.fromMemberId,
        kind:p.kind||u.kind||'LEVEL_UPGRADE',
        amount:Number(p.amount||u.amount||0),
        stage:p.memberAccepted?'RECEIVER_CONFIRMED':(p.memberPaid?'PROOF_SUBMITTED':'ASSIGNED')
      });
      return true;
    }).length;
    const preReservedRequests=db.leveltrackRequests.filter(r=>{
      if(!r || r.status!=='Requested') return false;
      if(ignoreRequestId && r.id===ignoreRequestId) return false;
      if(r.reservedReceiverId!==m.memberId) return false;
      const rLevel=r.kind==='REFERRAL_UPGRADE' ? 2 : Number(r.seniorityLevel||r.to||2);
      if(rLevel!==target) return false;
      if(reservedRequestIds.has(r.id)) return false;
      reservedRequestIds.add(r.id);
      const payer=ltMember(r.memberId);
      allocatedRequests.push({
        requestId:r.id,
        paymentId:'',
        payerMemberId:r.memberId,
        payerName:payer?.name||r.memberId,
        kind:r.kind||'LEVEL_UPGRADE',
        amount:r.kind==='REFERRAL_UPGRADE'?1000:Number(LEVEL_RULES[r.from]?.upgrade||0),
        stage:'RESERVED'
      });
      return true;
    }).length;
    const reserved=activeAssignedPayments+preReservedRequests;
    const occupied=completed+reserved;
    const availableSlots=Math.max(0,required-occupied);
    const isCompleted=completed>=required;
    return {
      position:i+1,
      memberId:m.memberId,
      name:m.name,
      mobile:m.mobile,
      levelMemberId:m.levelMemberId||null,
      reachedAt:(m.levelReachedAt&&m.levelReachedAt[target])||m.joinedAt||m.registeredAt||m.createdAt||null,
      completed,
      reserved,
      occupied,
      required,
      availableSlots,
      isCompleted,
      queueSection:isCompleted?'COMPLETED':'CURRENT',
      status:isCompleted?'COMPLETED':(occupied>=required?'RESERVED':'ACTIVE'),
      allocatedRequests
    };
  });
}

function nextSeniorReceiver(level,excludeMemberIds='',options={}){
  const excluded=new Set(
    (Array.isArray(excludeMemberIds)?excludeMemberIds:String(excludeMemberIds||'').split(','))
      .map(x=>String(x||'').trim())
      .filter(Boolean)
  );
  const reqId=options&&options.requestId?String(options.requestId):'';
  const queue=seniorityQueue(level,{ignoreRequestId:reqId});
  if(reqId){
    const reqObj=db.leveltrackRequests.find(x=>x.id===reqId);
    if(reqObj&&reqObj.reservedReceiverId&&!excluded.has(reqObj.reservedReceiverId)){
      const reservedRow=queue.find(x=>x.memberId===reqObj.reservedReceiverId&&x.availableSlots>0);
      if(reservedRow)return reservedRow;
    }
  }
  return queue.find(x=>x.availableSlots>0&&!excluded.has(x.memberId))||null;
}

function nextLevelMemberId(level){
  const prefix='L'+level+'-';
  const nums=db.members.map(m=>String(m.levelMemberId||'')).filter(x=>x.startsWith(prefix)).map(x=>Number(x.slice(prefix.length))).filter(Number.isFinite);
  return prefix+String((nums.length?Math.max(...nums):0)+1).padStart(3,'0');
}
function ltMember(id){return db.members.find(m=>m.memberId===id)}
function completedReferralUpgrades(memberId){return db.leveltrackUpgrades.filter(u=>u.memberId===memberId&&u.kind==='REFERRAL_UPGRADE'&&u.adminApproved).length;}
function pendingLeveltrackRequest(memberId){return db.leveltrackRequests.find(r=>r.memberId===memberId&&!['Completed','Released','Blacklisted','Rejected'].includes(r.status))||null;}
function referralUpgradeState(m){
  const refs=direct(m.memberId).length;
  const availableBatches=refs<3?0:1+Math.floor((refs-3)/2);
  const completed=completedReferralUpgrades(m.memberId);
  const currentLevel=Math.max(1,Number(m.level||1));
  const requiredExtraBeforeNextLevel=Math.max(0,currentLevel-1);
  return {refs,availableBatches,completed,currentLevel,requiredExtraBeforeNextLevel,extraAvailable:Math.max(0,availableBatches-1)>completed&&completed<requiredExtraBeforeNextLevel};
}
function nextMemberAction(m){
  if(m.paymentAccessLocked)return {type:'NONE',paymentAccessLocked:true};
  const pending=pendingLeveltrackRequest(m.memberId);
  if(pending)return {type:pending.kind==='REFERRAL_UPGRADE'?'REFERRAL_UPGRADE':'LEVEL_UPGRADE',request:pending};
  if(Number(m.level||1)>=7)return {type:'NONE'};
  const st=referralUpgradeState(m);
  if(st.extraAvailable)return {type:'REFERRAL_UPGRADE',cycle:st.completed+1,seniorityLevel:2};
  const need={1:3,2:5,3:7,4:9,5:11,6:13}[st.currentLevel]||0;
  if(st.refs>=need&&st.completed>=st.requiredExtraBeforeNextLevel)return {type:'LEVEL_UPGRADE',from:st.currentLevel,to:st.currentLevel+1};
  return {type:'NONE'};
}
function downlineCount(id){
  let count=0,queue=[id],seen=new Set([id]);
  while(queue.length){const cur=queue.shift();for(const m of direct(cur)){if(!seen.has(m.memberId)){seen.add(m.memberId);count++;queue.push(m.memberId)}}}
  return count;
}
function ltTree(id){
  const root=ltMember(id); if(!root)return null;
  const seen=new Set([root.memberId]);
  const make=m=>({memberId:m.memberId,name:m.name,mobile:m.mobile,status:m.status,level:Number(m.level||1),levelMemberId:m.levelMemberId||null,children:direct(m.memberId).filter(c=>{if(seen.has(c.memberId))return false;seen.add(c.memberId);return true;}).map(make)});
  return make(root);
}
function ltStatusUpgrade(memberId){
  return db.leveltrackUpgrades.filter(u=>u.memberId===memberId).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]||null;
}
function ltHistory(memberId){
  return db.leveltrackUpgrades.filter(u=>u.memberId===memberId).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).map(u=>{
    const p=latestPaymentForUpgrade(u.id);
    const req=db.leveltrackRequests.find(r=>r.id===u.requestId);
    const expired=p?paymentIsExpired(p):false;
    let statusLabel='Pending';
    if(u.adminApproved||p?.adminApproved) statusLabel='Approved';
    else if(p?.rejected||p?.status==='REJECTED'||req?.status==='Rejected') statusLabel='Rejected';
    else if(req?.status==='Blacklisted') statusLabel='Blacklisted';
    else if(req?.status==='Released'||p?.status==='RELEASED') statusLabel='Released';
    else if(p?.status==='REASSIGNED') statusLabel='Reassigned';
    else if(expired||p?.paymentAccessLocked) statusLabel='Expired';
    else if(p?.memberAccepted||u.receiverApproved) statusLabel='Receiver Confirmed';
    else if(p?.memberPaid||u.memberPaid) statusLabel='Proof Submitted';
    else if(req?.status==='Assigned') statusLabel='Assigned';
    return {id:u.id,requestId:u.requestId,paymentId:p?.id||'',kind:u.kind||'LEVEL_UPGRADE',seniorityLevel:u.kind==='REFERRAL_UPGRADE'?2:(u.seniorityLevel||u.to),from:u.from,to:u.to,amount:u.amount,utr:u.utr||p?.utr||'',memberId:u.memberId,payeeId:u.payeeId||p?.receiverMemberId||'',payee:u.payee||p?.to||'',memberPaid:!!u.memberPaid,receiverApproved:!!u.receiverApproved,adminApproved:!!u.adminApproved,statusLabel,date:u.completedAt||u.createdAt};
  });
}
function ltDashboard(memberId){
  const m=ltMember(memberId); if(!m)return null;
  if(!m.level)m.level=1;
  if(m.status==='Verified'&&!m.levelMemberId)m.levelMemberId=nextLevelMemberId(m.level);
  const requests=db.leveltrackRequests.filter(r=>r.memberId===memberId).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const pendingRequest=pendingLeveltrackRequest(memberId);
  let upgrade=(pendingRequest && db.leveltrackUpgrades.find(u=>u.requestId===pendingRequest.id)) || null;
  if(upgrade && pendingRequest){ upgrade={...pendingRequest,...upgrade}; }
  if(!upgrade && pendingRequest && pendingRequest.status==='Assigned'){ upgrade={...pendingRequest}; }
  if(upgrade && String(upgrade.status||'').toLowerCase()==='assigned') {
    const saved=latestPaymentForUpgrade(upgrade.id);
    upgrade={...pendingRequest,...upgrade,payment:saved?paymentPublic(saved):{payee:upgrade.payee||'',payeeId:upgrade.payeeId||'',payeePhone:upgrade.payeePhone||'',accountHolder:upgrade.accountHolder||'',bank:upgrade.bank||'',account:upgrade.account||'',ifsc:upgrade.ifsc||'',branch:upgrade.branch||'',upi:upgrade.upi||'',amount:upgrade.amount||0,parts:upgrade.paymentParts||[]}};
  }
  const action=nextMemberAction(m);
  const payments=db.leveltrackPayments.filter(p=>p.receiverMemberId===memberId).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  const incomingPayments=payments.filter(p=>p.memberPaid===true&&!p.adminApproved&&!p.rejected&&p.status!=='REJECTED'&&!p.slotReleased&&p.status!=='RELEASED'&&p.status!=='REASSIGNED'&&!p._superseded).map(paymentPublic);
  const receiverPayments=payments.filter(p=>p.memberPaid===true||p.memberAccepted===true||p.adminApproved===true||p.rejected===true||p.status==='REJECTED').map(paymentPublic);
  const earningsRules=LEVEL_SLOT_CAPACITY;
  const earnings=Object.keys(earningsRules).map(l=>{
    const level=Number(l);
    const seenUpgrades=new Set();
    const completed=payments.filter(p=>{
      const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);
      if(!u||!p.memberAccepted||!p.adminApproved||!u.adminApproved||p.rejected||p.status==='REJECTED')return false;
      const paymentLevel=u.kind==='REFERRAL_UPGRADE'?2:Number(p.seniorityLevel||u.seniorityLevel||u.to||0);
      if(paymentLevel!==level)return false;
      if(seenUpgrades.has(u.id))return false;
      seenUpgrades.add(u.id);
      return true;
    }).length;
    return {level,required:earningsRules[level],completed};
  });
  const directReferrals=direct(memberId).length;
  const requiredDirectReferrals={1:3,2:5,3:7,4:9,5:11,6:13}[Number(m.level||1)]||0;
  const msgs=[...db.messages.filter(x=>x.to===memberId||x.to==='ALL'),...db.leveltrackMessages.filter(x=>x.to===memberId)].sort((a,b)=>String(b.at).localeCompare(String(a.at))).map(x=>({message:x.message,at:x.at}));
  return {member:memberPublic(m),directReferrals,directReferralCount:directReferrals,totalDownline:downlineCount(memberId),tree:ltTree(memberId),upgrade,requests,incomingPayments,receiverPayments,history:ltHistory(memberId),earnings,seniority:seniorityQueue(Number(m.level||1)).find(x=>x.memberId===memberId)||null,requiredDirectReferrals,referralUpgradeState:referralUpgradeState(m),messages:msgs,action};
}

app.get('/leveltrack-admin.html',(req,res)=>res.sendFile(path.join(__dirname,'leveltrack-admin.html')));
app.get('/leveltrack-member.html',(req,res)=>res.sendFile(path.join(__dirname,'leveltrack-member.html')));

app.get('/api/leveltrack/proofs/:paymentId/:partType',(req,res)=>{
  const pid=String(req.params.paymentId||'').trim();
  const ptype=String(req.params.partType||'member').trim();
  const p=db.leveltrackPayments.find(x=>x.id===pid);
  const ctx=getAuthContext(req);
  if(!ctx.isAdmin&&!ctx.memberId){
    return res.status(401).json({error:'Authentication required to view payment proof.'});
  }
  if(!ctx.isAdmin){
    const authorizedMember=p&&(ctx.memberId===p.fromMemberId||ctx.memberId===p.receiverMemberId||ctx.memberId===p.payeeId);
    if(!authorizedMember){
      return res.status(403).json({error:'Forbidden: Only the payer, assigned receiver, or Admin may view this payment proof.'});
    }
  }
  if(p){
    const part=(p.parts||[]).find(x=>x.type===ptype)||null;
    const raw=part?.screenshot||p.screenshot||'';
    const m=String(raw).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if(m){
      const buf=Buffer.from(m[2],'base64');
      res.set('Content-Type',m[1]);
      res.set('Cache-Control','private, max-age=3600');
      return res.send(buf);
    }
  }
  const safeId=pid.replace(/[^a-zA-Z0-9_-]/g,'');
  const safePart=ptype.replace(/[^a-zA-Z0-9_-]/g,'');
  for(const ext of ['png','jpg','jpeg','webp','gif']){
    const fp=path.join(PROOFS_DIR,`${safeId}-${safePart}.${ext}`);
    if(fs.existsSync(fp)){
      return res.sendFile(fp);
    }
  }
  res.status(404).json({error:'Payment proof image not found'});
});

app.post('/api/leveltrack/admin/staging-reset',async(req,res)=>{
  const resolvedDb=path.resolve(DB_FILE);
  const prodDb1=path.resolve(__dirname,'db.json');
  const prodDb2=path.resolve(__dirname,'data','db.json');
  const isProdEnv=String(process.env.NODE_ENV||'').toLowerCase()==='production';
  if(!LOCAL_TEST_ONLY||supabaseReady||isProdEnv||resolvedDb===prodDb1||resolvedDb===prodDb2){
    return res.status(403).json({error:'FORBIDDEN: Staging test-data reset is strictly disabled in production or on primary database files.'});
  }
  db=freshDB();
  ensureDbDefaults(db);
  seedSeniorityTestData();
  await save(db);
  res.json({ok:true,message:'Isolated local staging database reset and seeded.',members:db.members.length});
});

app.get('/api/leveltrack/admin/email-log',(req,res)=>{
  const logs=Array.isArray(db.emailNotificationLog)?db.emailNotificationLog:[];
  res.json({ok:true,smtpConfigured:!!mailer,count:logs.length,logs:logs.slice().reverse()});
});

function buildAdminDashboardPayload(){
  const levels={1:0,2:0,3:0,4:0,5:0,6:0,7:0};
  db.members.forEach(m=>{const l=Math.min(7,Math.max(1,Number(m.level||1)));levels[l]++});
  const requests=db.leveltrackRequests
    .map(r=>({...r,seniorityLevel:r.kind==='REFERRAL_UPGRADE'?2:(r.seniorityLevel||r.to),directReferralCount:direct(r.memberId).length}))
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const upgrades=db.leveltrackUpgrades
    .map(u=>({...u,seniorityLevel:u.kind==='REFERRAL_UPGRADE'?2:(u.seniorityLevel||u.to)}))
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const payments=db.leveltrackPayments
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(paymentPublic);
  const seniority={2:seniorityQueue(2),3:seniorityQueue(3),4:seniorityQueue(4),5:seniorityQueue(5),6:seniorityQueue(6),7:seniorityQueue(7)};
  const seniorityCurrent={};
  const seniorityCompleted={};
  [2,3,4,5,6,7].forEach(l=>{
    seniorityCurrent[l]=(seniority[l]||[]).filter(x=>x.status!=='COMPLETED');
    seniorityCompleted[l]=(seniority[l]||[]).filter(x=>x.status==='COMPLETED');
  });
  return {
    levels,
    slotCapacities:LEVEL_SLOT_CAPACITY,
    members:db.members.map(memberPublic),
    requests,
    upgrades,
    payments,
    paymentSettings:db.paymentSettings,
    seniority,
    seniorityCurrent,
    seniorityCompleted,
    emailNotifications:{
      smtpConfigured:!!mailer,
      count:(db.emailNotificationLog||[]).length,
      recent:(db.emailNotificationLog||[]).slice(-25).reverse()
    },
    persistence:{
      ok:supabaseReady||LOCAL_TEST_ONLY,
      mode:LOCAL_TEST_ONLY?'local-test':(supabaseReady?'supabase-api':'degraded-local'),
      lastSaveAt,
      lastSaveError,
      pendingRetry:!!supabaseRetryBlocked
    }
  };
}

app.get('/api/leveltrack/admin/dashboard',(req,res)=>{
  res.json(buildAdminDashboardPayload());
});

app.get('/api/leveltrack/admin/status',(req,res)=>{
  const activeRequests=db.leveltrackRequests.filter(r=>r.status!=='Completed');
  const sigParts=activeRequests.map(r=>{
    const u=db.leveltrackUpgrades.find(x=>x.requestId===r.id);
    const p=u?latestPaymentForUpgrade(u.id):null;
    const exp=p?paymentIsExpired(p):false;
    return `${r.id}:${r.status}:${u?.id||''}:${!!u?.memberPaid}:${!!p?.memberAccepted}:${!!u?.adminApproved}:${exp?1:0}`;
  });
  res.json({
    ok:true,
    supabaseEnabled:!!(supabaseReady&&!LOCAL_TEST_ONLY),
    members:Array.isArray(db.members)?db.members.length:0,
    testSeeded:Array.isArray(db.members)?db.members.filter(m=>m.isSeniorityTest).length:0,
    signature:`${db.members.length}|${db.leveltrackRequests.length}|${db.leveltrackUpgrades.filter(u=>u.adminApproved).length}|${sigParts.join(',')}`,
    activeRequests:activeRequests.length,
    persistence:{ok:supabaseReady||LOCAL_TEST_ONLY,lastSaveAt,pendingRetry:!!supabaseRetryBlocked}
  });
});

app.get('/api/leveltrack/admin/members',(req,res)=>res.json({members:findMember(req.query.q).map(memberPublic)}));
app.get('/api/leveltrack/admin/member-details/:id',(req,res)=>{
  const m=ltMember(req.params.id);if(!m)return res.status(404).json({error:'Member not found'});
  res.json({member:{...memberPublic(m),accountHolder:m.accountHolder||m.name||'',account:m.account||'',ifsc:m.ifsc||'',bank:m.bank||'',branch:m.branch||'',upi:m.upi||''},directReferrals:direct(m.memberId).length,totalDownline:downlineCount(m.memberId),tree:ltTree(m.memberId)});
});
app.get('/api/leveltrack/admin/next-receiver/:level',(req,res)=>{
  const level=Number(req.params.level);if(![2,3,4,5,6,7].includes(level))return res.status(400).json({error:'Invalid target level'});
  const receiver=nextSeniorReceiver(level,String(req.query.excludeMemberId||''),{requestId:String(req.query.requestId||'')});
  if(!receiver)return res.json({receiver:null});
  res.json({receiver});
});
app.post('/api/leveltrack/admin/requests/:id/assign',(req,res)=>withAllocationLock(async()=>{
  const r=db.leveltrackRequests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Upgrade request not found'});
  if(r.status==='Assigned'){
    const u=db.leveltrackUpgrades.find(x=>x.requestId===r.id);
    const payment=u?latestPaymentForUpgrade(u.id):null;
    if(u&&payment)return res.json({ok:true,alreadyAssigned:true,request:r,upgrade:u,payment:paymentPublic(payment)});
    return res.status(409).json({error:'Request is marked Assigned but its payment record is missing. Please refresh Admin and retry.'});
  }
  if(r.status!=='Requested')return res.status(400).json({error:'Request is not pending'});
  const m=ltMember(r.memberId);if(!m)return res.status(404).json({error:'Member not found'});
  if(m.paymentAccessLocked)return res.status(423).json({error:'Member payment access is locked pending Admin review.'});
  const isReferral=r.kind==='REFERRAL_UPGRADE';
  // Confirmed rule: Every ₹1,000 Additional / Advanced Referral Upgrade always uses Level 2 (L2) seniority and excludes the payer's own ID.
  const targetLevel=isReferral?2:Number(r.to);
  const amount=isReferral?1000:Number(LEVEL_RULES[r.from]?.upgrade||0);
  if(!amount)return res.status(400).json({error:'Upgrade amount not configured'});
  const autoReceiver=nextSeniorReceiver(targetLevel,m.memberId,{requestId:r.id});
  const receiver=autoReceiver?ltMember(autoReceiver.memberId):null;
  if(!receiver)return res.status(400).json({error:'No eligible seniority receiver with available slot capacity is available for this level.'});
  const sr=isReferral?{upgrade:amount,parts:[{type:'member',label:'MEMBER / RECEIVER',amount}]}:splitRule(r.from);
  const parts=sr.parts.map(x=>({...x}));
  const rec=parts.find(x=>x.type==='member');
  if(rec)rec.accountDetails={name:receiver.name,memberId:receiver.memberId,mobile:receiver.mobile,accountHolder:receiver.accountHolder||receiver.name||'',bank:receiver.bank||'',account:receiver.account||'',ifsc:receiver.ifsc||'',branch:receiver.branch||'',upi:receiver.upi||''};
  const tr=parts.find(x=>x.type==='trust');
  if(tr)tr.accountDetails={...db.paymentSettings.trust};
  const ap=parts.findIndex(x=>x.type==='admin');
  if(ap>=0){
    const aa=allocateAdminAccountForRequest(r);
    if(!aa)return res.status(400).json({error:'No active Admin account configured'});
    parts[ap].accountDetails=aa;
    parts[ap].adminAccountId=aa.id;
  }
  const now=nextMonotonicIso();
  let u=db.leveltrackUpgrades.find(x=>x.requestId===r.id);
  if(!u){
    u={id:'LTU-'+crypto.randomBytes(4).toString('hex').toUpperCase(),requestId:r.id,memberId:m.memberId,from:r.from,to:r.to,kind:r.kind||'LEVEL_UPGRADE',seniorityLevel:targetLevel,createdAt:now};
    db.leveltrackUpgrades.push(u);
  }
  Object.assign(r,{status:'Assigned',upgradeId:u.id,reservedReceiverId:receiver.memberId,reservedPosition:autoReceiver.position,assignedAt:now,seniorityLevel:targetLevel,payee:receiver.name||'',accountHolder:receiver.accountHolder||receiver.name||'',payeeId:receiver.memberId,payeePhone:receiver.mobile||'',amount,account:receiver.account||'',bank:receiver.bank||'',ifsc:receiver.ifsc||'',branch:receiver.branch||'',upi:receiver.upi||'',paymentParts:parts});
  Object.assign(u,{amount,kind:r.kind||'LEVEL_UPGRADE',seniorityLevel:targetLevel,payee:r.payee,accountHolder:r.accountHolder,payeeId:r.payeeId,payeePhone:r.payeePhone,account:r.account,bank:r.bank,ifsc:r.ifsc,branch:r.branch,upi:r.upi,paymentParts:parts,detailsSent:true,detailsSentAt:now});
  // Preserve all historical payment records; never delete previous payment records or screenshots.
  for(const prev of db.leveltrackPayments){
    if(prev.upgradeId===u.id && !prev.adminApproved){
      prev._superseded=true;
      if(prev.status==='PENDING') prev.status='REASSIGNED';
    }
  }
  const payment={id:'LTP-'+crypto.randomBytes(4).toString('hex').toUpperCase(),requestId:r.id,upgradeId:u.id,kind:r.kind||'LEVEL_UPGRADE',fromLevel:r.from,toLevel:r.to,seniorityLevel:targetLevel,fromMemberId:m.memberId,receiverMemberId:receiver.memberId,payeeId:receiver.memberId,from:m.name,to:receiver.name,amount,parts:parts.map(x=>({...x,status:'PENDING',utr:'',screenshot:null,proofRef:null})),memberPaid:false,memberAccepted:false,adminApproved:false,createdAt:now,detailsSentAt:now,expiresAt:new Date(Date.now()+PAYMENT_DEADLINE_MS).toISOString(),status:'PENDING'};
  db.leveltrackPayments.push(payment);
  db.leveltrackMessages.push({to:m.memberId,message:(r.kind==='REFERRAL_UPGRADE'?`Upgrade payment details sent. Seniority Level L2. Total ₹${amount.toLocaleString()}.`:`Payment details sent for L${r.from} → L${r.to}. Total ₹${amount.toLocaleString()}.`),at:now});
  notifyMemberEmail(m,'BORNTOWIN5 - Upgrade Payment Details Assigned',`Hello ${m.name},\n\nAdmin has assigned payment details for your ${r.kind==='REFERRAL_UPGRADE'?'Advanced Referral Upgrade (Seniority L2)':'Level '+r.from+' to Level '+r.to+' upgrade'}.\nRequest ID: ${r.id}\nPayment ID: ${payment.id}\nTotal amount: ₹${amount.toLocaleString()}\nPlease sign in to view the verified payment instructions.`,{eventType:'PAYMENT_DETAILS_ASSIGNED_PAYER',eventKey:`ASSIGN_PAYER:${r.id}:${payment.id}`,metadata:{requestId:r.id,paymentId:payment.id,memberId:m.memberId}});
  notifyMemberEmail(receiver,'BORNTOWIN5 - Incoming Payment Assigned',`Hello ${receiver.name},\n\nA payment request has been assigned to you from member ${m.memberId} (${m.name}).\nRequest ID: ${r.id}\nPayment ID: ${payment.id}\nPlease sign in to the Receiver page to review payment proof when submitted.`,{eventType:'PAYMENT_ASSIGNED_RECEIVER',eventKey:`ASSIGN_RECEIVER:${r.id}:${payment.id}`,metadata:{requestId:r.id,paymentId:payment.id,receiverMemberId:receiver.memberId}});
  await save(db);
  res.json({ok:true,request:r,upgrade:u,payment:paymentPublic(payment)});
}));
app.post('/api/leveltrack/admin/requests/:id/resend-details',async(req,res)=>{
  const r=db.leveltrackRequests.find(x=>x.id===req.params.id);
  if(!r)return res.status(404).json({error:'Upgrade request not found'});
  if(r.status!=='Assigned')return res.status(400).json({error:'Payment details have not been assigned for this request yet.'});
  const u=db.leveltrackUpgrades.find(x=>x.requestId===r.id);
  const p=u?latestPaymentForUpgrade(u.id):null;
  if(!u||!p)return res.status(400).json({error:'Payment details record not found for this request.'});
  if(paymentIsExpired(p))return res.status(409).json({error:'Payment details expired. Use RESTORE & REASSIGN or EXTEND 24 HOURS from Admin review options.'});
  const m=ltMember(r.memberId);
  if(!m)return res.status(404).json({error:'Member not found'});
  const amount=Number(u.amount||r.amount||p.amount||0);
  const message=r.kind==='REFERRAL_UPGRADE'?`Upgrade payment details sent again. Seniority Level L2. Total ₹${amount.toLocaleString()}.`:`Payment details sent again for L${r.from} → L${r.to}. Total ₹${amount.toLocaleString()}.`;
  db.leveltrackMessages.push({to:m.memberId,message,at:new Date().toISOString()});
  p.detailsSentAt=new Date().toISOString();p.expiresAt=new Date(Date.now()+PAYMENT_DEADLINE_MS).toISOString();
  notifyMemberEmail(m,'BORNTOWIN5 - Upgrade Payment Details Resent',`Hello ${m.name},\n\nAdmin has resent payment details for your request ${r.id} (Payment ID: ${p.id}).`,{eventType:'PAYMENT_DETAILS_ASSIGNED_PAYER',eventKey:`RESEND_PAYER:${r.id}:${Date.now()}`,metadata:{requestId:r.id,paymentId:p.id}});
  await save(db);
  res.json({ok:true,message:'Payment details sent again to the member.',request:r,upgrade:u,payment:paymentPublic(p)});
});
app.post('/api/leveltrack/admin/requests/:id/extend-deadline',(req,res)=>withAllocationLock(async()=>{
  const r=db.leveltrackRequests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Upgrade request not found'});
  const u=db.leveltrackUpgrades.find(x=>x.requestId===r.id);const p=u?latestPaymentForUpgrade(u.id):null;if(!u||!p)return res.status(404).json({error:'Payment assignment not found'});
  if(p.memberPaid||p.adminApproved)return res.status(409).json({error:'Payment proof already submitted or approved; deadline cannot be extended.'});
  const now=new Date().toISOString();p.detailsSentAt=now;p.expiresAt=new Date(Date.now()+PAYMENT_DEADLINE_MS).toISOString();p.paymentAccessLocked=false;p.status='PENDING';u.paymentAccessLocked=false;r.status='Assigned';const m=ltMember(r.memberId);if(m)m.paymentAccessLocked=false;
  if(m){
    db.leveltrackMessages.push({to:m.memberId,message:`Your 24-hour payment deadline for request ${r.id} has been extended until ${p.expiresAt}.`,at:now});
    notifyMemberEmail(m,'BORNTOWIN5 - 24-Hour Payment Deadline Reminder & Extension',`Hello ${m.name},\n\nYour 24-hour payment deadline for request ${r.id} (Payment ID: ${p.id}) has been extended by 24 hours until ${p.expiresAt}.\nPlease submit your payment proof before the deadline expires.`,{eventType:'DEADLINE_REMINDER',eventKey:`DEADLINE_EXTEND:${r.id}:${now}`,metadata:{requestId:r.id,paymentId:p.id,expiresAt:p.expiresAt}});
  }
  await save(db);
  res.json({ok:true,message:'Payment deadline extended by 24 hours.',payment:paymentPublic(p)});
}));
app.post('/api/leveltrack/admin/requests/:id/deadline-reminder',async(req,res)=>{
  const r=db.leveltrackRequests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Upgrade request not found'});
  const u=db.leveltrackUpgrades.find(x=>x.requestId===r.id);const p=u?latestPaymentForUpgrade(u.id):null;
  const m=ltMember(r.memberId);if(!m)return res.status(404).json({error:'Member not found'});
  const now=new Date().toISOString();
  const exp=p?paymentDeadlineAt(p):null;
  db.leveltrackMessages.push({to:m.memberId,message:`Reminder: Please complete your upgrade payment for request ${r.id}${exp?' before '+exp:''}.`,at:now});
  const entry=notifyMemberEmail(m,'BORNTOWIN5 - 24-Hour Payment Deadline Reminder',`Hello ${m.name},\n\nThis is a reminder to submit your upgrade payment proof for request ${r.id}${p?' (Payment ID: '+p.id+')':''}${exp?' before the 24-hour deadline at '+exp:''}.`,{eventType:'DEADLINE_REMINDER',eventKey:`DEADLINE_REMINDER:${r.id}:${now}`,metadata:{requestId:r.id,paymentId:p?.id||'',expiresAt:exp}});
  await save(db);
  res.json({ok:true,emailLog:entry});
});
app.post('/api/leveltrack/admin/requests/:id/release-slot',(req,res)=>withAllocationLock(async()=>{
  const r=db.leveltrackRequests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Upgrade request not found'});
  const u=db.leveltrackUpgrades.find(x=>x.requestId===r.id);const p=u?latestPaymentForUpgrade(u.id):null;
  if(p?.adminApproved)return res.status(409).json({error:'Approved payment cannot be released.'});
  if(p){p.slotReleased=true;p.status='RELEASED';p.paymentAccessLocked=true;}
  if(u){u.paymentAccessLocked=true;}
  r.status='Released';r.reservedReceiverId=null;
  const m=ltMember(r.memberId);if(m){m.paymentAccessLocked=true;m.paymentReviewStatus='ADMIN_REVIEW';}
  if(m)notifyMemberEmail(m,'BORNTOWIN5 - Upgrade Request Released for Review',`Hello ${m.name},\n\nYour upgrade request (${r.id}) slot was released pending Admin review.`,{eventType:'UPGRADE_REQUEST_STATUS',eventKey:`REQ_RELEASED:${r.id}`,metadata:{requestId:r.id,status:'Released'}});
  await save(db);
  res.json({ok:true,message:'Seniority slot released. Request history preserved.'});
}));
app.post('/api/leveltrack/admin/requests/:id/blacklist-member',(req,res)=>withAllocationLock(async()=>{
  const r=db.leveltrackRequests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Upgrade request not found'});
  const u=db.leveltrackUpgrades.find(x=>x.requestId===r.id);const p=u?latestPaymentForUpgrade(u.id):null;const m=ltMember(r.memberId);if(!m)return res.status(404).json({error:'Member not found'});if(p?.adminApproved)return res.status(409).json({error:'Approved payment cannot be blacklisted.'});
  m.paymentAccessLocked=true;m.paymentReviewStatus='ADMIN_REVIEW';if(p){p.paymentAccessLocked=true;p.slotReleased=true;p.status='REVIEW_LOCKED'}if(u)u.paymentAccessLocked=true;r.status='Blacklisted';r.reservedReceiverId=null;db.leveltrackMessages.push({to:m.memberId,message:'Your payment access is locked pending Admin review. Please contact Admin before proceeding.',at:new Date().toISOString()});
  notifyMemberEmail(m,'BORNTOWIN5 - Payment Access Locked for Review',`Hello ${m.name},\n\nYour upgrade request (${r.id}) and payment access have been locked for Admin review.`,{eventType:'UPGRADE_REQUEST_STATUS',eventKey:`REQ_BLACKLISTED:${r.id}`,metadata:{requestId:r.id,status:'Blacklisted'}});
  await save(db);
  res.json({ok:true,message:'Member payment access locked for Admin review.'});
}));
app.post('/api/leveltrack/admin/requests/:id/restore-reassign',(req,res)=>withAllocationLock(async()=>{
  const r=db.leveltrackRequests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Upgrade request not found'});
  const u=db.leveltrackUpgrades.find(x=>x.requestId===r.id);const old=u?latestPaymentForUpgrade(u.id):null;const m=ltMember(r.memberId);if(!u||!old||!m)return res.status(404).json({error:'Request, upgrade or payment assignment not found'});if(old.adminApproved)return res.status(409).json({error:'Approved payment cannot be reassigned.'});
  old.slotReleased=true;old.status='REASSIGNED';old.paymentAccessLocked=true;old._superseded=true;
  r.reservedReceiverId=null;
  const level=r.kind==='REFERRAL_UPGRADE'?2:Number(old.seniorityLevel||u.seniorityLevel||r.to||2);
  const receiverRow=nextSeniorReceiver(level,[old.receiverMemberId,m.memberId],{requestId:r.id})||nextSeniorReceiver(level,m.memberId,{requestId:r.id});
  const receiver=receiverRow?ltMember(receiverRow.memberId):null;
  if(!receiver){
    old.slotReleased=false;old.status='PENDING';old.paymentAccessLocked=false;old._superseded=false;
    return res.status(409).json({error:'No other eligible senior receiver is available for this level.'});
  }
  const now=nextMonotonicIso();
  const parts=(old.parts||[]).map(x=>({...x,utr:'',screenshot:null,proofRef:null,submittedAt:null,status:'PENDING'}));
  const memberPart=parts.find(x=>x.type==='member');
  if(memberPart)memberPart.accountDetails={name:receiver.name,memberId:receiver.memberId,mobile:receiver.mobile,accountHolder:receiver.accountHolder||receiver.name||'',bank:receiver.bank||'',account:receiver.account||'',ifsc:receiver.ifsc||'',branch:receiver.branch||'',upi:receiver.upi||''};
  const adminPart=parts.find(x=>x.type==='admin');
  if(adminPart){
    // Preserve the request's authoritative Admin account assignment so reassignments/retries do not advance rotation counters.
    const aa=allocateAdminAccountForRequest(r);
    if(aa){adminPart.accountDetails=aa;adminPart.adminAccountId=aa.id;}
  }
  Object.assign(r,{status:'Assigned',upgradeId:u.id,reservedReceiverId:receiver.memberId,reservedPosition:receiverRow.position,assignedAt:now,seniorityLevel:level,payee:receiver.name||'',accountHolder:receiver.accountHolder||receiver.name||'',payeeId:receiver.memberId,payeePhone:receiver.mobile||'',account:receiver.account||'',bank:receiver.bank||'',ifsc:receiver.ifsc||'',branch:receiver.branch||'',upi:receiver.upi||'',paymentParts:parts});
  Object.assign(u,{detailsSent:true,detailsSentAt:now,seniorityLevel:level,payee:receiver.name||'',accountHolder:receiver.accountHolder||receiver.name||'',payeeId:receiver.memberId,payeePhone:receiver.mobile||'',account:receiver.account||'',bank:receiver.bank||'',ifsc:receiver.ifsc||'',branch:receiver.branch||'',upi:receiver.upi||'',paymentParts:parts,paymentAccessLocked:false});
  const np={...old,id:'LTP-'+crypto.randomBytes(4).toString('hex').toUpperCase(),requestId:r.id,to:receiver.name,receiverMemberId:receiver.memberId,payeeId:receiver.memberId,parts,memberPaid:false,memberAccepted:false,adminApproved:false,rejected:false,rejectedAt:null,rejectionReason:'',_superseded:false,createdAt:now,detailsSentAt:now,expiresAt:new Date(Date.now()+PAYMENT_DEADLINE_MS).toISOString(),status:'PENDING',paymentAccessLocked:false,slotReleased:false,memberAcceptedAt:null,submittedAt:null,utr:''};
  db.leveltrackPayments.push(np);
  m.paymentAccessLocked=false;m.paymentReviewStatus='';
  db.leveltrackMessages.push({to:m.memberId,message:`Admin restored your payment access and issued new receiver details. New 24-hour deadline starts now.`,at:now});
  notifyMemberEmail(m,'BORNTOWIN5 - New Payment Details Assigned',`Hello ${m.name},\n\nAdmin restored your payment access and assigned receiver details (Payment ID: ${np.id}).`,{eventType:'PAYMENT_DETAILS_ASSIGNED_PAYER',eventKey:`REASSIGN_PAYER:${r.id}:${np.id}`,metadata:{requestId:r.id,paymentId:np.id}});
  notifyMemberEmail(receiver,'BORNTOWIN5 - Incoming Payment Assigned',`Hello ${receiver.name},\n\nA payment request (${r.id}, Payment ID: ${np.id}) has been assigned to you from member ${m.memberId}.`,{eventType:'PAYMENT_ASSIGNED_RECEIVER',eventKey:`REASSIGN_RECEIVER:${r.id}:${np.id}`,metadata:{requestId:r.id,paymentId:np.id}});
  await save(db);
  res.json({ok:true,message:'New receiver details assigned with a fresh 24-hour deadline.',request:r,upgrade:u,payment:paymentPublic(np)});
}));

async function executeAdminApprovalForPayment(u,p,reqBody={}){
  const m=ltMember(u.memberId);
  if(!m)return {status:404,body:{error:'Member not found'}};
  if(reqBody.requestId && String(reqBody.requestId)!==String(u.requestId||p.requestId||'')){
    return {status:409,body:{error:'Request ID mismatch for selected payment'}};
  }
  if(reqBody.paymentId && String(reqBody.paymentId)!==String(p.id)){
    return {status:409,body:{error:'Payment ID mismatch for selected upgrade'}};
  }
  if(p.rejected||p.status==='REJECTED'){
    return {status:409,body:{error:'Rejected payment cannot be approved'}};
  }
  if(u.adminApproved&&p.adminApproved){
    return {status:200,body:{ok:true,alreadyApproved:true,newLevel:Number(m.level||1),member:memberPublic(m),upgrade:u,payment:paymentPublic(p)}};
  }
  if(Number(m.level||1)!==Number(u.from||1))return {status:400,body:{error:'Member level changed already'}};
  const allPaid=(p.parts||[]).every(x=>['SUBMITTED','CONFIRMED','APPROVED'].includes(x.status));
  if(!u.memberPaid||!allPaid||!p.memberAccepted)return {status:400,body:{error:'All payment proofs and receiver confirmation are required'}};
  const approvedAt=nextMonotonicIso();
  p.parts=(p.parts||[]).map(x=>({...x,status:'APPROVED',adminApprovedAt:approvedAt}));
  p.adminApproved=true;p.adminVerifiedAt=approvedAt;p.status='APPROVED';
  u.receiverApproved=true;u.adminApproved=true;u.completedAt=approvedAt;u.status='Completed';
  const r=db.leveltrackRequests.find(x=>x.id===u.requestId);if(r){r.status='Completed';r.completedAt=approvedAt;}
  const receiver=ltMember(p.receiverMemberId);
  if(u.kind==='REFERRAL_UPGRADE'){
    u.seniorityLevel=2;
    p.seniorityLevel=2;
    db.leveltrackMessages.push({to:m.memberId,message:`Upgrade completed. Your next Level Upgrade is now available when unlocked.`,at:approvedAt});
    notifyMemberEmail(m,'BORNTOWIN5 - Upgrade Request Approved',`Hello ${m.name},\n\nAdmin has approved your Advanced Referral Upgrade (Request ID: ${u.requestId}, Payment ID: ${p.id}). Your next upgrade is now unlocked.`,{eventType:'FINAL_PAYMENT_APPROVED',eventKey:`FINAL_APPROVE_SENDER:${p.id}`,metadata:{requestId:u.requestId,paymentId:p.id,upgradeId:u.id}});
    notifyMemberEmail(m,'BORNTOWIN5 - Upgrade Request Status: Approved',`Hello ${m.name},\n\nYour upgrade request ${u.requestId} has been approved.`,{eventType:'UPGRADE_REQUEST_STATUS',eventKey:`REQ_STATUS_APPROVED:${u.requestId}`,metadata:{requestId:u.requestId,status:'Approved'}});
    if(receiver)notifyMemberEmail(receiver,'BORNTOWIN5 - Incoming Payment Final Approved',`Hello ${receiver.name},\n\nAdmin has finalized approval for incoming payment ${p.id} from ${m.memberId} (${m.name}).`,{eventType:'FINAL_PAYMENT_APPROVED',eventKey:`FINAL_APPROVE_RECEIVER:${p.id}`,metadata:{requestId:u.requestId,paymentId:p.id,receiverMemberId:receiver.memberId}});
    await save(db);
    return {status:200,body:{ok:true,newLevel:Number(m.level||1),member:memberPublic(m),upgrade:u,payment:paymentPublic(p)}};
  }
  m.level=Number(u.to);
  m.levelMemberId=nextLevelMemberId(m.level);
  m.levelReachedAt={...(m.levelReachedAt||{}),[String(u.to)]:approvedAt};
  m.upgradeDate=approvedAt;
  m.status='Verified';
  db.leveltrackMessages.push({to:m.memberId,message:`Admin approved payment. Level upgrade completed. You are now Level ${m.level}.`,at:approvedAt});
  notifyMemberEmail(m,'BORNTOWIN5 - Level Upgrade Completed',`Hello ${m.name},\n\nAdmin has approved your payment (Payment ID: ${p.id}, Request ID: ${u.requestId}). Your level upgrade is complete.\nCurrent level: ${m.level}\nMember ID: ${m.memberId}`,{eventType:'FINAL_PAYMENT_APPROVED',eventKey:`FINAL_APPROVE_SENDER:${p.id}`,metadata:{requestId:u.requestId,paymentId:p.id,newLevel:m.level}});
  notifyMemberEmail(m,'BORNTOWIN5 - Upgrade Request Status: Approved',`Hello ${m.name},\n\nYour Level ${u.from} → Level ${u.to} upgrade request (${u.requestId}) has been approved.`,{eventType:'UPGRADE_REQUEST_STATUS',eventKey:`REQ_STATUS_APPROVED:${u.requestId}`,metadata:{requestId:u.requestId,status:'Approved',newLevel:m.level}});
  if(receiver)notifyMemberEmail(receiver,'BORNTOWIN5 - Incoming Payment Final Approved',`Hello ${receiver.name},\n\nAdmin has finalized approval for incoming payment ${p.id} from ${m.memberId} (${m.name}).`,{eventType:'FINAL_PAYMENT_APPROVED',eventKey:`FINAL_APPROVE_RECEIVER:${p.id}`,metadata:{requestId:u.requestId,paymentId:p.id,receiverMemberId:receiver.memberId}});
  await save(db);
  return {status:200,body:{ok:true,newLevel:Number(m.level||1),member:memberPublic(m),upgrade:u,payment:paymentPublic(p)}};
}

app.post('/api/leveltrack/admin/payments/by-upgrade/:id/approve',async(req,res)=>{
  const u=db.leveltrackUpgrades.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'Upgrade not found'});
  const p=(req.body&&req.body.paymentId)?db.leveltrackPayments.find(x=>x.id===req.body.paymentId&&x.upgradeId===u.id):latestPaymentForUpgrade(u.id);
  if(!p)return res.status(400).json({error:'Payment not found'});
  const lockKey=`APPROVE:${u.id}:${p.id}`;
  if(activeMutationLocks.has(lockKey))return res.status(409).json({error:'Approval already in progress for this payment'});
  activeMutationLocks.add(lockKey);
  try{
    const out=await executeAdminApprovalForPayment(u,p,req.body||{});
    return res.status(out.status).json(out.body);
  }finally{
    activeMutationLocks.delete(lockKey);
  }
});

app.post('/api/leveltrack/admin/payments/:id/approve',async(req,res)=>{
  const p=db.leveltrackPayments.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Payment not found'});
  const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);if(!u)return res.status(404).json({error:'Upgrade not found'});
  const lockKey=`APPROVE:${u.id}:${p.id}`;
  if(activeMutationLocks.has(lockKey))return res.status(409).json({error:'Approval already in progress for this payment'});
  activeMutationLocks.add(lockKey);
  try{
    const out=await executeAdminApprovalForPayment(u,p,{...(req.body||{}),paymentId:p.id});
    return res.status(out.status).json(out.body);
  }finally{
    activeMutationLocks.delete(lockKey);
  }
});

app.post('/api/leveltrack/admin/payments/:id/reject',async(req,res)=>{
  const p=db.leveltrackPayments.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Payment not found'});
  const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);
  const r=db.leveltrackRequests.find(x=>x.id===(p.requestId||u?.requestId));
  if(req.body?.requestId && r && String(req.body.requestId)!==String(r.id)){
    return res.status(409).json({error:'Request ID mismatch for selected payment'});
  }
  if(p.adminApproved)return res.status(409).json({error:'Approved payment cannot be rejected'});
  const now=nextMonotonicIso();
  const reason=String(req.body?.reason||'Payment proof rejected by Admin').trim();
  p.rejected=true;p.status='REJECTED';p.rejectedAt=now;p.rejectionReason=reason;p.slotReleased=true;
  p.parts=(p.parts||[]).map(x=>({...x,status:'REJECTED'}));
  if(u){u.status='Rejected';}
  if(r){r.status='Rejected';r.rejectedAt=now;r.rejectionReason=reason;r.reservedReceiverId=null;}
  const payer=ltMember(p.fromMemberId);
  if(payer){
    db.leveltrackMessages.push({to:payer.memberId,message:`Your payment (${p.id}) for request ${r?.id||u?.requestId||''} was rejected: ${reason}`,at:now});
    notifyMemberEmail(payer,'BORNTOWIN5 - Upgrade Payment Rejected',`Hello ${payer.name},\n\nYour submitted payment (${p.id}) for request ${r?.id||u?.requestId||''} was rejected.\nReason: ${reason}`,{eventType:'UPGRADE_REQUEST_STATUS',eventKey:`REQ_REJECTED:${p.id}`,metadata:{requestId:r?.id||'',paymentId:p.id,status:'Rejected',reason}});
  }
  await save(db);
  res.json({ok:true,payment:paymentPublic(p),request:r||null,upgrade:u||null});
});

app.post('/api/leveltrack/admin/payments/:id/verify',async(req,res)=>{
  const p=db.leveltrackPayments.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Payment not found'});
  if(!p.memberAccepted)return res.status(400).json({error:'Receiver has not accepted the payment'});
  p.adminApproved=true;p.adminVerifiedAt=nextMonotonicIso();
  const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);if(u){u.receiverApproved=true;}
  await save(db);res.json({ok:true,payment:paymentPublic(p)});
});
app.post('/api/leveltrack/admin/upgrades/:id/final-approve',async(req,res)=>{
  const u=db.leveltrackUpgrades.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'Upgrade not found'});
  const p=latestPaymentForUpgrade(u.id);if(!u.memberPaid||!u.receiverApproved||!p?.adminApproved)return res.status(400).json({error:'Payment must be paid, accepted and admin verified first'});
  const m=ltMember(u.memberId);if(!m)return res.status(404).json({error:'Member not found'});
  if(u.adminApproved){return res.json({ok:true,alreadyApproved:true,newLevel:Number(m.level||1),member:memberPublic(m),upgrade:u});}
  if(Number(m.level||1)!==Number(u.from||1))return res.status(400).json({error:'Member level changed already'});
  const approvedAt=nextMonotonicIso();
  u.adminApproved=true;u.completedAt=approvedAt;u.status='Completed';
  const r=db.leveltrackRequests.find(x=>x.id===u.requestId);if(r){r.status='Completed';r.completedAt=approvedAt;}
  if(u.kind==='REFERRAL_UPGRADE'){db.leveltrackMessages.push({to:m.memberId,message:`Upgrade completed. Your next Level Upgrade is now available when unlocked.`,at:approvedAt});await save(db);return res.json({ok:true,newLevel:Number(m.level||1),member:memberPublic(m),upgrade:u});}
  m.level=Number(u.to);m.levelMemberId=nextLevelMemberId(m.level);m.levelReachedAt={...(m.levelReachedAt||{}),[String(u.to)]:approvedAt};m.upgradeDate=approvedAt;m.status='Verified';
  db.leveltrackMessages.push({to:m.memberId,message:`Level upgrade completed. You are now Level ${m.level}.`,at:approvedAt});await save(db);res.json({ok:true,newLevel:Number(m.level||1),member:memberPublic(m),upgrade:u});
});
app.get('/api/leveltrack/admin/payment-settings',(req,res)=>res.json({paymentSettings:db.paymentSettings,levels:LEVEL_RULES,slotCapacities:LEVEL_SLOT_CAPACITY}));
app.post('/api/leveltrack/admin/payment-settings',async(req,res)=>{const b=req.body||{};if(Array.isArray(b.admins))db.paymentSettings.admins=b.admins.map((x,i)=>({id:x.id||String.fromCharCode(65+i),name:x.name||`Admin ${String.fromCharCode(65+i)}`,accountHolder:x.accountHolder||'',bank:x.bank||'',account:x.account||'',ifsc:x.ifsc||'',upi:x.upi||'',active:x.active!==false}));if(b.trust)db.paymentSettings.trust={...db.paymentSettings.trust,...b.trust};if(Number.isInteger(b.adminRotationIndex))db.paymentSettings.adminRotationIndex=Math.max(0,b.adminRotationIndex);await save(db);res.json({ok:true,paymentSettings:db.paymentSettings});});
app.get('/api/leveltrack/admin/payment-report',(req,res)=>{const from=String(req.query.from||'');const to=String(req.query.to||from||'');const q=String(req.query.q||'').trim().toLowerCase();const level=String(req.query.level||'').trim();const rows=[];for(const p of db.leveltrackPayments){const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);if(!u)continue;const dt=String(p.submittedAt||u.completedAt||p.createdAt||'').slice(0,10);if(from&&dt<from)continue;if(to&&dt>to)continue;if(level&&String(u.from)!==level)continue;if(q&&!(`${p.fromMemberId} ${p.receiverMemberId} ${u.payee||''}`).toLowerCase().includes(q))continue;rows.push({paymentId:p.id,requestId:p.requestId||u.requestId||'',date:dt,level:u.kind==='REFERRAL_UPGRADE'?`UPGRADE • L2`:`L${u.from} → L${u.to}`,payerMemberId:p.fromMemberId,receiverMemberId:p.receiverMemberId,total:p.amount,status:p.rejected||p.status==='REJECTED'?'Rejected':(p.adminApproved?'Approved':p.memberAccepted?'Receiver Confirmed':p.memberPaid?'Proof Submitted':'Pending'),parts:(p.parts||[]).map(x=>({type:x.type,label:x.label,amount:x.amount,account:x.accountDetails?.account||'',accountName:x.accountDetails?.name||x.accountDetails?.accountHolder||'',status:x.status,utr:x.utr||'',screenshot:!!x.screenshot}))});}const totals={member:0,trust:0,admin:0,total:0};const adminByAccount={};let trustTotal=0;rows.forEach(r=>r.parts.forEach(x=>{totals[x.type]=(totals[x.type]||0)+Number(x.amount||0);totals.total+=Number(x.amount||0);if(x.type==='admin'){const key=x.accountName||x.account||'Admin';adminByAccount[key]=(adminByAccount[key]||0)+Number(x.amount||0)}if(x.type==='trust')trustTotal+=Number(x.amount||0)}));res.json({from,to,count:rows.length,totals,adminByAccount,trustTotal,rows});});
app.get('/api/leveltrack/admin/daily-report',(req,res)=>{
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  const upgrades=db.leveltrackUpgrades.filter(u=>u.adminApproved&&String(u.completedAt||'').slice(0,10)===date).map(u=>({from:u.from,to:u.to,kind:u.kind||'LEVEL_UPGRADE',seniorityLevel:u.kind==='REFERRAL_UPGRADE'?2:(u.seniorityLevel||u.to),amount:u.amount,date:String(u.completedAt).slice(0,10),member:memberPublic(ltMember(u.memberId))}));
  res.json({date,count:upgrades.length,upgrades});
});
app.get('/api/leveltrack/member/dashboard/:id',(req,res)=>{
  const d=ltDashboard(req.params.id);if(!d)return res.status(404).json({error:'Member not found'});res.json(d);
});
app.post('/api/leveltrack/member/upgrade-request',(req,res)=>withAllocationLock(async()=>{
  const m=ltMember(req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});
  if(m.paymentAccessLocked)return res.status(423).json({error:'Your payment access is locked pending Admin review.'});
  const pending=pendingLeveltrackRequest(m.memberId);if(pending)return res.status(400).json({error:'Upgrade request already pending'});
  const action=nextMemberAction(m);
  if(action.type!=='LEVEL_UPGRADE')return res.status(400).json({error:action.type==='REFERRAL_UPGRADE'?'Complete the current Upgrade first.':'The next level upgrade is not unlocked yet.'});
  const from=Number(m.level||1),to=from+1;if(from>=7)return res.status(400).json({error:'Level 7 is the final level'});
  const need={1:3,2:5,3:7,4:9,5:11,6:13}[from]||0;if(direct(m.memberId).length<need)return res.status(400).json({error:`Need ${need} direct referrals for Level ${from} → Level ${to}.`});
  const reserved=nextSeniorReceiver(to,m.memberId);
  const now=nextMonotonicIso();
  const r={id:'LTR-'+crypto.randomBytes(4).toString('hex').toUpperCase(),memberId:m.memberId,from,to,seniorityLevel:to,kind:'LEVEL_UPGRADE',status:'Requested',reservedReceiverId:reserved?.memberId||null,reservedPosition:reserved?.position||null,reservedAt:reserved?now:null,date:now.slice(0,10),createdAt:now};
  db.leveltrackRequests.push(r);
  db.leveltrackMessages.push({to:'ADMIN',message:`New LevelTrack upgrade request: ${m.name} — L${from} → L${to}.`,at:now});
  notifyMemberEmail(m,'BORNTOWIN5 - Upgrade Request Received',`Hello ${m.name},\n\nYour upgrade request (${r.from} → ${r.to}) has been received and is waiting for Admin processing.\nRequest ID: ${r.id}`,{eventType:'UPGRADE_REQUEST_SUBMITTED',eventKey:`REQ_SUBMIT:${r.id}`,metadata:{requestId:r.id,memberId:m.memberId,from,to}});
  notifyAdminEmail('BORNTOWIN5 - New Upgrade Request Submitted',`Member ${m.name} (${m.memberId}) submitted Level ${from} → Level ${to} upgrade request (${r.id}).`,{eventType:'UPGRADE_REQUEST_SUBMITTED',eventKey:`REQ_SUBMIT_ADMIN:${r.id}`,metadata:{requestId:r.id,memberId:m.memberId}});
  await save(db);
  res.json({ok:true,request:r});
}));
app.post('/api/leveltrack/member/referral-upgrade-request',(req,res)=>withAllocationLock(async()=>{
  const m=ltMember(req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});
  if(m.paymentAccessLocked)return res.status(423).json({error:'Your payment access is locked pending Admin review.'});
  const pending=pendingLeveltrackRequest(m.memberId);if(pending)return res.status(400).json({error:'Upgrade request already pending'});
  const action=nextMemberAction(m);if(action.type!=='REFERRAL_UPGRADE')return res.status(400).json({error:'The additional Upgrade is not unlocked yet.'});
  const reserved=nextSeniorReceiver(2,m.memberId);
  const now=nextMonotonicIso();
  const r={id:'LTR-'+crypto.randomBytes(4).toString('hex').toUpperCase(),memberId:m.memberId,from:Number(m.level||1),to:Number(m.level||1),kind:'REFERRAL_UPGRADE',cycle:Number(action.cycle||1),seniorityLevel:2,status:'Requested',reservedReceiverId:reserved?.memberId||null,reservedPosition:reserved?.position||null,reservedAt:reserved?now:null,date:now.slice(0,10),createdAt:now};
  db.leveltrackRequests.push(r);
  db.leveltrackMessages.push({to:'ADMIN',message:`New Advanced Referral Upgrade: ${m.name} — cycle ${r.cycle}, Seniority L2.`,at:now});
  notifyMemberEmail(m,'BORNTOWIN5 - Upgrade Request Received',`Hello ${m.name},\n\nYour Advanced Referral Upgrade request (cycle ${r.cycle}, Seniority L2) has been received and is waiting for Admin processing.\nRequest ID: ${r.id}`,{eventType:'UPGRADE_REQUEST_SUBMITTED',eventKey:`REQ_SUBMIT:${r.id}`,metadata:{requestId:r.id,memberId:m.memberId,kind:'REFERRAL_UPGRADE'}});
  notifyAdminEmail('BORNTOWIN5 - New Additional Referral Upgrade Request',`Member ${m.name} (${m.memberId}) submitted Additional Referral Upgrade request (${r.id}, Seniority L2).`,{eventType:'UPGRADE_REQUEST_SUBMITTED',eventKey:`REQ_SUBMIT_ADMIN:${r.id}`,metadata:{requestId:r.id,memberId:m.memberId}});
  await save(db);
  res.json({ok:true,request:r});
}));
app.post('/api/leveltrack/member/upgrade/:id/pay',async(req,res)=>{
  const u=db.leveltrackUpgrades.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'Upgrade not found'});
  if(u.memberId!==req.body.memberId)return res.status(403).json({error:'Not your upgrade'});
  const p=latestPaymentForUpgrade(u.id);if(!p)return res.status(404).json({error:'Payment instructions not found'});
  if(ltMember(u.memberId)?.paymentAccessLocked||u.paymentAccessLocked||p.paymentAccessLocked||paymentIsExpired(p)){
    return res.status(410).json({error:'Payment details expired and are locked. Please contact Admin; only new Admin-issued payment details can be used.'});
  }
  const proofs=Array.isArray(req.body.parts)?req.body.parts:[];
  if(!proofs.length)return res.status(400).json({error:'Payment proof required'});
  const now=nextMonotonicIso();
  for(const proof of proofs){
    const part=p.parts.find(x=>x.type===proof.type);
    if(!part)continue;
    const utr=String(proof.utr||'').trim();
    if(!utr)return res.status(400).json({error:`UTR required for ${part.label}`});
    if(!proof.screenshot)return res.status(400).json({error:`Screenshot required for ${part.label}`});
    const stored=saveProofImageDurably(p.id,part.type,proof.screenshot);
    part.utr=utr;part.screenshot=stored.screenshot;part.proofRef=stored.proofRef;part.submittedAt=now;part.status='SUBMITTED';
  }
  const all=p.parts.every(x=>['SUBMITTED','CONFIRMED','APPROVED'].includes(x.status));
  if(!all)return res.status(400).json({error:'Upload payment proof for every payment section'});
  const memberPart=p.parts.find(x=>x.type==='member')||p.parts[0];
  u.memberPaid=true;u.utr=memberPart?.utr||'';u.paidAt=now;
  p.utr=u.utr;p.screenshot=memberPart?.screenshot||null;p.proofRef=memberPart?.proofRef||null;p.memberPaid=true;p.submittedAt=now;
  db.leveltrackMessages.push({to:u.payeeId,message:`Payment proofs submitted for ${u.kind==='REFERRAL_UPGRADE'?'Additional Upgrade (L2)':`L${u.from} → L${u.to}`}. Please confirm the receiver payment.`,at:now});
  const payer=ltMember(u.memberId);const receiver=ltMember(p.receiverMemberId);
  notifyMemberEmail(receiver,'BORNTOWIN5 - Payment Proof Submitted',`Hello ${receiver?.name||p.receiverMemberId},\n\nMember ${payer?.name||u.memberId} (${u.memberId}) has submitted payment proof (UTR: ${p.utr}, Payment ID: ${p.id}) for ${u.kind==='REFERRAL_UPGRADE'?'Advanced Referral Upgrade':'Level '+u.from+' to Level '+u.to}.\nPlease sign in to the Receiver page to verify the payment.`,{eventType:'PAYMENT_PROOF_SUBMITTED',eventKey:`PROOF_RECEIVER:${p.id}:${p.utr}`,metadata:{paymentId:p.id,requestId:u.requestId,receiverMemberId:p.receiverMemberId}});
  notifyAdminEmail('BORNTOWIN5 - Payment Proof Submitted for Review',`Member ${payer?.name||u.memberId} (${u.memberId}) submitted payment proof (UTR: ${p.utr}, Payment ID: ${p.id}, Request ID: ${u.requestId}).`,{eventType:'PAYMENT_PROOF_SUBMITTED',eventKey:`PROOF_ADMIN:${p.id}:${p.utr}`,metadata:{paymentId:p.id,requestId:u.requestId,payerMemberId:u.memberId}});
  await save(db);
  res.json({ok:true,upgrade:u,payment:paymentPublic(p)});
});
app.post('/api/leveltrack/member/incoming/:id/accept',async(req,res)=>{
  const p=db.leveltrackPayments.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Payment not found'});
  if(p.receiverMemberId!==req.body.memberId)return res.status(403).json({error:'Not your payment'});
  if(req.body.requestId && p.requestId && String(req.body.requestId)!==String(p.requestId))return res.status(409).json({error:'Request ID mismatch for selected payment'});
  if(p.rejected||p.status==='REJECTED')return res.status(409).json({error:'Rejected payment cannot be confirmed'});
  if(!p.memberPaid)return res.status(400).json({error:'Member has not submitted payment proof yet'});
  const lockKey=`REC_ACCEPT:${p.id}`;
  if(activeMutationLocks.has(lockKey))return res.status(409).json({error:'Confirmation already in progress'});
  activeMutationLocks.add(lockKey);
  try{
    if(p.memberAccepted){
      return res.json({ok:true,alreadyAccepted:true,payment:paymentPublic(p)});
    }
    p.memberAccepted=true;p.acceptedAt=nextMonotonicIso();
    const mp=(p.parts||[]).find(x=>x.type==='member');if(mp&&mp.status!=='APPROVED')mp.status='CONFIRMED';
    const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);if(u)u.receiverApproved=true;
    const payer=ltMember(p.fromMemberId);
    notifyMemberEmail(payer,'BORNTOWIN5 - Receiver Confirmed Payment',`Hello ${payer?.name||p.fromMemberId},\n\nThe receiver (${p.receiverMemberId}) has confirmed receiving your payment (${p.id}). Your upgrade is now waiting for Admin final approval.`,{eventType:'RECEIVER_CONFIRMED_PAYMENT',eventKey:`REC_CONFIRM:${p.id}`,metadata:{paymentId:p.id,requestId:p.requestId||u?.requestId||''}});
    await save(db);
    res.json({ok:true,payment:paymentPublic(p)});
  }finally{
    activeMutationLocks.delete(lockKey);
  }
});
app.post('/api/leveltrack/member/incoming/:id/reject',async(req,res)=>{
  const p=db.leveltrackPayments.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Payment not found'});
  if(p.receiverMemberId!==req.body.memberId)return res.status(403).json({error:'Not your payment'});
  if(req.body.requestId && p.requestId && String(req.body.requestId)!==String(p.requestId))return res.status(409).json({error:'Request ID mismatch for selected payment'});
  if(p.adminApproved)return res.status(409).json({error:'Approved payment cannot be rejected'});
  const now=nextMonotonicIso();
  const reason=String(req.body.reason||'Payment proof rejected by receiver').trim();
  p.rejected=true;p.status='REJECTED';p.rejectedAt=now;p.rejectionReason=reason;p.slotReleased=true;
  const mp=(p.parts||[]).find(x=>x.type==='member');if(mp)mp.status='REJECTED';
  const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);if(u)u.status='Rejected';
  const r=db.leveltrackRequests.find(x=>x.id===(p.requestId||u?.requestId));if(r){r.status='Rejected';r.rejectedAt=now;r.rejectionReason=reason;r.reservedReceiverId=null;}
  const payer=ltMember(p.fromMemberId);
  if(payer){
    db.leveltrackMessages.push({to:payer.memberId,message:`Receiver (${p.receiverMemberId}) rejected payment proof (${p.id}): ${reason}`,at:now});
    notifyMemberEmail(payer,'BORNTOWIN5 - Payment Proof Rejected by Receiver',`Hello ${payer.name},\n\nReceiver ${p.receiverMemberId} rejected payment proof ${p.id} for request ${r?.id||''}.\nReason: ${reason}`,{eventType:'UPGRADE_REQUEST_STATUS',eventKey:`REC_REJECT:${p.id}`,metadata:{paymentId:p.id,requestId:r?.id||'',status:'Rejected',reason}});
  }
  await save(db);
  res.json({ok:true,payment:paymentPublic(p)});
});
function memberMessagesHandler(req,res){
  const msgs=[...db.messages.filter(x=>x.to===req.params.id||x.to==='ALL').map(x=>({message:x.message,at:x.at})),...db.leveltrackMessages.filter(x=>x.to===req.params.id).map(x=>({message:x.message,at:x.at}))].sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  res.json({messages:msgs});
}
app.get('/api/leveltrack/member/messages/:id',memberMessagesHandler);
app.get('/api/member/messages/:id',memberMessagesHandler);

const PORT=process.env.PORT||10000;
app.get('/api/db-status',(req,res)=>res.json({
  ok:supabaseReady||LOCAL_TEST_ONLY,
  persistence:LOCAL_TEST_ONLY?'local-test':(supabaseReady?'supabase-api':'degraded-local'),
  members:Array.isArray(db.members)?db.members.length:0,
  lastSaveAt,
  pendingRetry:!!supabaseRetryBlocked
}));

initPersistentDatabase()
  .then(async()=>{
    const seeded=seedSeniorityTestData();
    if(seeded) await save(db);
    localSave(db);
    app.listen(PORT,'0.0.0.0',()=>console.log('BORNTOWIN5 running on '+PORT));
  })
  .catch(err=>{
    console.error('PERMANENT DATABASE STARTUP FAILED:',err.message);
    process.exit(1);
  });
