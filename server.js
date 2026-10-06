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

async function sendEmail(to,subject,text,html){
  if(!mailer) throw new Error('SMTP_PASS is not configured');
  return mailer.sendMail({from:EMAIL_FROM,to,subject,text,html:html||undefined});
}

if(mailer){
  mailer.verify().then(()=>console.log('AIC Cloud SMTP connection verified')).catch(err=>console.error('AIC Cloud SMTP verification failed:',err.message));
}

app.use(express.json({limit:'12mb'}));
app.use(express.static(__dirname));

const DB_FILE=process.env.DB_FILE || path.join(__dirname,'data','db.json');
fs.mkdirSync(path.dirname(DB_FILE),{recursive:true});
function freshDB(){return {adminPassword:'ADMIN',members:[],pins:[],messages:[],passwordResetRequests:[],leveltrackRequests:[],leveltrackUpgrades:[],leveltrackPayments:[],leveltrackMessages:[],paymentSettings:{admins:[{id:'A',name:'Admin A',accountHolder:'',bank:'',account:'',ifsc:'',upi:'',active:true},{id:'B',name:'Admin B',accountHolder:'',bank:'',account:'',ifsc:'',upi:'',active:true},{id:'C',name:'Admin C',accountHolder:'',bank:'',account:'',ifsc:'',upi:'',active:true}],adminRotationIndex:0,trust:{name:'Registered Trust',accountHolder:'',bank:'',account:'TEMP-TRUST-001',ifsc:'',upi:'',active:true}}};}
function load(){try{return JSON.parse(fs.readFileSync(DB_FILE,'utf8'))}catch(e){return freshDB()}}

// Permanent persistence: AIC hosts the app; Supabase stores the single source of truth.
const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_SECRET_KEY=String(process.env.SUPABASE_SECRET_KEY||'');
let supabaseReady=false;
let supabaseSaveQueue=Promise.resolve();
function supabaseHeaders(extra={}){return {'apikey':SUPABASE_SECRET_KEY,'Authorization':'Bearer '+SUPABASE_SECRET_KEY,'Content-Type':'application/json','Accept':'application/json',...extra}}
async function supabaseFetch(pathname,options={}){
  if(!SUPABASE_URL||!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');
  const r=await fetch(SUPABASE_URL+'/rest/v1/'+pathname,{...options,headers:{...supabaseHeaders(),...(options.headers||{})}});
  const body=await r.text();
  if(!r.ok) throw new Error('Supabase API '+r.status+': '+body);
  try{return body?JSON.parse(body):null}catch{return body}
}
function localSave(d){fs.writeFileSync(DB_FILE,JSON.stringify(d,null,2))}
function hasRealData(d){
  return !!(d && ((d.members||[]).length || (d.messages||[]).length || (d.passwordResetRequests||[]).length || (d.leveltrackRequests||[]).length || (d.leveltrackUpgrades||[]).length || (d.leveltrackPayments||[]).length || (d.leveltrackMessages||[]).length || (d.pins||[]).some(x=>x && !x.system)));
}
function save(d){
  localSave(d);
  if(!supabaseReady)return;
  const snapshot=JSON.parse(JSON.stringify(d));
  supabaseSaveQueue=supabaseSaveQueue.then(async()=>{
    try{
      await supabaseFetch('app_state?id=eq.1',{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({data:snapshot})});
    }catch(e){console.error('Supabase API save failed:',e.message);}
  });
}

let db=load();


// ---------------- OPTIONAL SENIORITY TEST DATA ----------------
// Enable only when testing: B5_SENIORITY_TEST_MODE=1
// Creates the supplied 10 test IDs and pins them to Seniority 1-10 for L2-L7.
const SENIORITY_TEST_IDS=[
  ['KARTHI01','7000000001'],['SATHYA02','7000000002'],['KARTHI03','7000000003'],['SATHYA04','7000000004'],['KARTHI05','7000000005'],
  ['SATHYA06','7000000006'],['KARTHI07','7000000007'],['SATHYA08','7000000008'],['KARTHI09','7000000009'],['KARTHI10','7000000010'],
  ['SATHYA11','7000000011'],['KARTHI12','7000000012'],['SATHYA13','7000000013']
];
const SENIORITY_TEST_REF='REF-FC329E';
// Fresh independent 13-referral test tree. This is ADDED alongside the existing test tree; no old data is cleared.
const SENIORITY_TEST_REF_NEW='REF-NEW13ROOT';
const SENIORITY_TEST_NEW_IDS=[
  ['TEST01','7100000001'],['TEST02','7100000002'],['TEST03','7100000003'],['TEST04','7100000004'],['TEST05','7100000005'],
  ['TEST06','7100000006'],['TEST07','7100000007'],['TEST08','7100000008'],['TEST09','7100000009'],['TEST10','7100000010'],
  ['TEST11','7100000011'],['TEST12','7100000012'],['TEST13','7100000013']
];
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

  // Add a completely separate fresh root + 13 direct referrals for a clean second test run.
  let newRoot=db.members.find(m=>String(m.referralId||'').toUpperCase()===SENIORITY_TEST_REF_NEW);
  if(!newRoot){
    newRoot={memberId:'B5-NEW13R',referralId:SENIORITY_TEST_REF_NEW,name:'New 13 Referral Root',mobile:'7888888888',email:'',status:'ACTIVE',referral:'FIRST MEMBER',level:1,levelMemberId:'L1-NEW13ROOT',joinedAt:'2026-10-06T00:00:00.000Z',levelReachedAt:{},passwordHash:hashPassword('B5@123456'),place:'TEST',accountHolder:'New 13 Referral Root',bank:'TEST BANK',account:'TEST-NEWROOT',ifsc:'TEST0000001',branch:'TEST',upi:'new13root@upi',profileLocked:true};
    db.members.push(newRoot);
  }
  const newRootId=newRoot.memberId;
  SENIORITY_TEST_NEW_IDS.forEach(([memberId,mobile],i)=>{
    let m=db.members.find(x=>x.memberId===memberId);
    const stamp=`2026-10-06T00:01:${String(i).padStart(2,'0')}.000Z`;
    const reached={};for(let l=2;l<=7;l++)reached[l]=stamp;
    if(!m){
      m={memberId,mobile,name:memberId,referral:newRootId,referralId:referralCode(memberId),status:'ACTIVE',level:1,levelMemberId:`L1-NEW13-${String(i+1).padStart(2,'0')}`,joinedAt:stamp,registeredAt:stamp,levelReachedAt:reached,passwordHash:hashPassword('B5@123456'),place:'TEST',accountHolder:memberId,bank:'TEST BANK',account:`NEW13-${String(i+1).padStart(4,'0')}`,ifsc:'TEST0000001',branch:'TEST',upi:`${memberId.toLowerCase()}@upi`,profileLocked:true};
      db.members.push(m);
    }else{
      m.status='ACTIVE';m.referral=newRootId;m.level=1;m.levelMemberId=`L1-NEW13-${String(i+1).padStart(2,'0')}`;m.joinedAt=m.joinedAt||stamp;m.levelReachedAt={...(m.levelReachedAt||{}),...reached};
    }
    m._seniorityTestNewOrder=i+1;
  });
  return true;
}

async function initPersistentDatabase(){
  if(!SUPABASE_URL||!SUPABASE_SECRET_KEY) throw new Error('Supabase API is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY.');
  const rows=await supabaseFetch('app_state?select=data&id=eq.1');
  if(Array.isArray(rows) && rows.length){
    const remote=typeof rows[0].data==='string'?JSON.parse(rows[0].data):rows[0].data;
    if(hasRealData(remote)){
      db=remote;
      supabaseReady=true;
      localSave(db);
      console.log('PERMANENT DATABASE: Supabase loaded; existing data preserved');
      return;
    }
    if(hasRealData(db)){
      await supabaseFetch('app_state?id=eq.1',{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({data:db})});
      supabaseReady=true;
      console.log('PERMANENT DATABASE: empty Supabase state initialized from existing local data');
      return;
    }
    throw new Error('Supabase app_state is empty and no existing local data is available. Refusing to create an empty database.');
  }
  if(!hasRealData(db)) throw new Error('Supabase app_state is empty and no existing local data is available. Refusing to create an empty database.');
  await supabaseFetch('app_state',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify({id:1,data:db})});
  supabaseReady=true;
  console.log('PERMANENT DATABASE: initialized Supabase from existing local data');
}

// Backward-compatible defaults for existing db.json files.
db.members=db.members||[];db.pins=db.pins||[];db.messages=db.messages||[];db.passwordResetRequests=db.passwordResetRequests||[];
db.leveltrackRequests=db.leveltrackRequests||[];db.leveltrackUpgrades=db.leveltrackUpgrades||[];
db.leveltrackPayments=db.leveltrackPayments||[];db.leveltrackMessages=db.leveltrackMessages||[];db.paymentSettings=db.paymentSettings||{admins:[{id:'A',name:'Admin A',accountHolder:'',bank:'',account:'',ifsc:'',upi:'',active:true},{id:'B',name:'Admin B',accountHolder:'',bank:'',account:'',ifsc:'',upi:'',active:true},{id:'C',name:'Admin C',accountHolder:'',bank:'',account:'',ifsc:'',upi:'',active:true}],adminRotationIndex:0,trust:{name:'Registered Trust',accountHolder:'',bank:'',account:'TEMP-TRUST-001',ifsc:'',upi:'',active:true}};db.paymentSettings.admins=db.paymentSettings.admins||[];db.paymentSettings.trust=db.paymentSettings.trust||{name:'Registered Trust',account:'TEMP-TRUST-001'};db.paymentSettings.adminRotationIndex=Number(db.paymentSettings.adminRotationIndex||0);
// First Joining PIN required by the original BORNTOWIN5 registration flow.
if(!db.pins.some(x=>(x.pin==='PIN-START1'||x.pin==='B5-FMUXNF') && x.status==='AVAILABLE')){
  const old=db.pins.find(x=>x.pin==='PIN-START1')||db.pins.find(x=>x.pin==='B5-FMUXNF');
  if(!old) db.pins.push({pin:'PIN-START1',assignedTo:null,status:'AVAILABLE',usedBy:null,createdAt:new Date().toISOString(),system:true});
  else if(!old.usedBy){old.status='AVAILABLE';old.assignedTo=null;}
}
save(db);

function id(){return 'B5-'+crypto.randomBytes(3).toString('hex').toUpperCase()}
function referralCode(memberId){return 'REF-'+String(memberId||'').replace(/^B5-/,'').toUpperCase()}
function pin(){return 'PIN-'+crypto.randomBytes(3).toString('hex').toUpperCase()}
db.members.forEach(m=>{if(!m.referralId)m.referralId=referralCode(m.memberId)});save(db);
function hashPassword(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex')}
function memberPublic(m){return {memberId:m.memberId,referralId:m.referralId||referralCode(m.memberId),name:m.name,mobile:m.mobile,email:m.email||m.rEmail||'',status:(m.status==='Rejected'?'Rejected':'ACTIVE'),referral:m.referral,level:Number(m.level||1),levelMemberId:m.levelMemberId||null,joinedAt:m.joinedAt||m.registeredAt||null,upgradeDate:m.upgradeDate||null,profileLocked:!!m.profileLocked}}
function memberProfile(m){return {memberId:m.memberId,referralId:m.referralId||referralCode(m.memberId),name:m.name||'',place:m.place||'',mobile:m.mobile||'',email:m.email||m.rEmail||'',referral:m.referral||'FIRST MEMBER',accountHolder:m.accountHolder||m.name||'',bank:m.bank||'',account:m.account||'',ifsc:m.ifsc||'',branch:m.branch||'',upi:m.upi||'',photo:m.photo||'',profileLocked:!!m.profileLocked}}
function findMember(q){q=String(q||'').toLowerCase();return db.members.filter(m=>(m.name+' '+m.memberId+' '+m.mobile).toLowerCase().includes(q))}
function descendants(rootId){
 let levels={1:[],2:[],3:[],4:[],5:[],6:[],7:[]}, current=[rootId];
 for(let l=1;l<=7;l++){const next=db.members.filter(m=>current.includes(m.referral)).map(m=>m.memberId);levels[l]=db.members.filter(m=>next.includes(m.memberId));current=next;if(!current.length)break}
 return levels;
}
function tree(rootId){
 const root=db.members.find(m=>m.memberId===rootId);
 if(!root)return {name:'நீங்கள்',id:'Not Registered',children:[]};
 const kids=(id)=>db.members.filter(m=>m.referral===id).map(m=>({name:m.name,id:m.memberId,children:kids(m.memberId)}));
 return {name:root.name,id:root.memberId,children:kids(root.memberId)};
}
function wallet(memberId){
 const ps=db.pins.filter(p=>p.assignedTo===memberId);
 return {received:ps.length,used:ps.filter(p=>p.status==='USED').length,available:ps.filter(p=>p.status==='AVAILABLE').length,pins:ps.slice(-50)};
}
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'member.html')));
app.get('/member.html',(req,res)=>res.sendFile(path.join(__dirname,'member.html')));
app.get('/admin.html',(req,res)=>res.sendFile(path.join(__dirname,'admin.html')));

app.post('/api/admin/login',(req,res)=>{if(req.body.password!==db.adminPassword)return res.status(401).json({error:'Incorrect password'});res.json({ok:true})});
app.post('/api/admin/password',(req,res)=>{if(req.body.oldPassword!==db.adminPassword)return res.status(401).json({error:'Current password is incorrect'});db.adminPassword=String(req.body.newPassword||'');save(db);res.json({ok:true})});
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
 const kids=(id)=>db.members.filter(x=>x.referral===id).map(x=>({memberId:x.memberId,name:x.name,mobile:x.mobile,status:x.status,level:Number(x.level||1),levelMemberId:x.levelMemberId||null,children:kids(x.memberId)}));
 res.json({member:memberPublic(m),details:m,referralTree:{memberId:m.memberId,name:m.name,mobile:m.mobile,status:m.status,level:Number(m.level||1),levelMemberId:m.levelMemberId||null,children:kids(m.memberId)},directReferrals:db.members.filter(x=>x.referral===m.memberId).length,totalDownline:downlineCount(m.memberId)});
});
app.get('/api/admin/password-reset-requests',(req,res)=>{res.json({requests:db.passwordResetRequests.filter(x=>x.status==='Pending').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))})});
app.post('/api/admin/password-reset/:id',(req,res)=>{const r=db.passwordResetRequests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Reset request not found'});const m=db.members.find(x=>x.memberId===r.memberId);if(!m)return res.status(404).json({error:'Member not found'});let temp=String(req.body.temporaryPassword||'');if(temp.length<6)temp='B5@'+crypto.randomBytes(3).toString('hex');m.passwordHash=hashPassword(temp);m.mustChangePassword=true;r.status='Approved';r.approvedAt=new Date().toISOString();r.temporaryPassword=temp;db.messages.push({to:m.memberId,message:'Admin approved your password reset. Temporary password: '+temp+'. Login and change your password.',at:new Date().toISOString()});save(db);res.json({ok:true,temporaryPassword:temp,member:memberPublic(m)})});

app.post('/api/admin/member-status',(req,res)=>{
 const m=db.members.find(x=>x.memberId===req.body.memberId);
 if(!m)return res.status(404).json({error:'Member not found'});
 m.status=req.body.status;
 if(req.body.status==='Verified'){
   if(!m.level)m.level=1;
   if(!m.levelMemberId)m.levelMemberId=nextLevelMemberId(m.level);
   if(!m.joinedAt)m.joinedAt=new Date().toISOString();
 }
 save(db);res.json({ok:true,member:memberPublic(m)})
});
app.post('/api/admin/message',(req,res)=>{if(req.body.to==='all'){db.messages.push({to:'ALL',message:req.body.message,at:new Date().toISOString()})}else{if(!db.members.some(m=>m.memberId===req.body.memberId))return res.status(404).json({error:'Member not found'});db.messages.push({to:req.body.memberId,message:req.body.message,at:new Date().toISOString()})}save(db);res.json({ok:true})});
app.post('/api/admin/pins/generate',(req,res)=>{
 const m=db.members.find(x=>x.memberId===req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});
 const n=Math.min(500,Math.max(1,Number(req.body.quantity)||1)),out=[];
 for(let i=0;i<n;i++){let p=pin();while(db.pins.some(x=>x.pin===p))p=pin();const row={pin:p,assignedTo:m.memberId,status:'AVAILABLE',usedBy:null,createdAt:new Date().toISOString()};db.pins.push(row);out.push(row)}
 save(db);const w=wallet(m.memberId);res.json({pins:out,member:memberPublic(m),available:w.available,used:w.used});
});

app.get('/api/member/referral-info/:id',(req,res)=>{
 const id=String(req.params.id||'').trim();
 if(!id||id==='FIRST MEMBER')return res.json({valid:id==='FIRST MEMBER',member:null});
 const m=db.members.find(x=>x.memberId===id||x.referralId===id||referralCode(x.memberId)===id);
 if(!m)return res.status(404).json({valid:false,error:'Referral ID not found'});
 res.json({valid:true,member:{memberId:m.memberId,referralId:m.referralId||referralCode(m.memberId),name:m.name,mobile:m.mobile,level:Number(m.level||1)}});
});
app.post('/api/member/login',(req,res)=>{const m=db.members.find(x=>x.mobile===String(req.body.mobile||'').trim());if(!m)return res.status(404).json({error:'Member not found. Please register first.'});const supplied=String(req.body.password||'');if(!m.passwordHash)return res.status(401).json({error:'Password not set. Please use Forgot Password and contact Admin.'});if(hashPassword(supplied)!==m.passwordHash)return res.status(401).json({error:'Incorrect password'});res.json({member:{...memberPublic(m),mustChangePassword:!!m.mustChangePassword}})});
app.post('/api/member/forgot-password',(req,res)=>{const mobile=String(req.body.mobile||'').trim();const m=db.members.find(x=>x.mobile===mobile);if(!m)return res.status(404).json({error:'Mobile number not found'});const pending=db.passwordResetRequests.find(x=>x.memberId===m.memberId&&x.status==='Pending');if(pending)return res.json({ok:true,message:'Password reset request already sent to Admin.'});db.passwordResetRequests.push({id:'PR-'+crypto.randomBytes(4).toString('hex').toUpperCase(),memberId:m.memberId,mobile:m.mobile,name:m.name,status:'Pending',createdAt:new Date().toISOString()});save(db);res.json({ok:true,message:'Password reset request sent to Admin. Please contact Admin after approval.'})});
app.post('/api/member/password/:id',(req,res)=>{const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Member not found'});if(!m.passwordHash||hashPassword(req.body.oldPassword)!==m.passwordHash)return res.status(401).json({error:'Current password is incorrect'});const np=String(req.body.newPassword||'');if(np.length<6)return res.status(400).json({error:'New password must be at least 6 characters'});m.passwordHash=hashPassword(np);m.mustChangePassword=false;save(db);res.json({ok:true})});
app.post('/api/member/check-pin',(req,res)=>{const p=String(req.body.pin||'').toUpperCase();if(!db.pins.some(x=>x.pin===p&&x.status==='AVAILABLE'))return res.status(400).json({error:'Invalid or unavailable Joining PIN'});res.json({ok:true})});
app.post('/api/member/register',(req,res)=>{
 const b=req.body;
 if(db.members.some(m=>m.mobile===b.mobile))return res.status(409).json({error:'Mobile number already registered'});
 const p=String(b.pin||'').toUpperCase(),pr=db.pins.find(x=>x.pin===p&&x.status==='AVAILABLE');
 if(!pr)return res.status(400).json({error:'Invalid or unavailable Joining PIN'});
 let parentId='FIRST MEMBER';
 if(String(b.referral||'FIRST MEMBER').toUpperCase()!=='FIRST MEMBER'){const ref=String(b.referral||'').trim().toUpperCase();const parent=db.members.find(x=>x.memberId===ref||x.referralId===ref||referralCode(x.memberId)===ref);if(!parent)return res.status(400).json({error:'Invalid Referral ID'});parentId=parent.memberId;}
 const memberId=id();
 const m={...b,memberId,referralId:referralCode(memberId),referral:parentId,status:'Pending',registeredAt:new Date().toISOString(),passwordHash:hashPassword(b.password)};
 delete m.pin;delete m.password;db.members.push(m);pr.status='USED';pr.usedBy=m.memberId;pr.usedAt=new Date().toISOString();save(db);sendEmail(m.email||m.rEmail,'BORNTOWIN5 - Registration Successful',`Hello ${m.name},\n\nYour BORNTOWIN5 registration was successful.\nMember ID: ${m.memberId}\nMobile: ${m.mobile}\n\nThank you for joining BORNTOWIN5.`).then(()=>console.log('Registration Successful email sent:',m.memberId)).catch(e=>console.error('Registration email failed:',e.message));res.json({member:memberPublic(m)});
});
app.post('/api/admin/member-profile/:id',(req,res)=>{const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Member not found'});const b=req.body||{};for(const k of ['name','place','accountHolder','bank','account','ifsc','branch','upi'])if(b[k]!==undefined)m[k]=String(b[k]).trim();if(!m.name||!m.place||!m.accountHolder||!m.bank||!m.account||!m.ifsc||!m.branch||!m.upi)return res.status(400).json({error:'Please complete all profile and bank details'});m.profileLocked=true;save(db);res.json({ok:true,member:memberPublic(m),profile:memberProfile(m)});});
app.get('/api/member/profile/:id',(req,res)=>{const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Member not found'});res.json({profile:memberProfile(m)})});
app.post('/api/member/profile/:id',(req,res)=>{const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Member not found'});if(m.profileLocked)return res.status(403).json({error:'Profile is locked. Please contact Admin for changes.'});const b=req.body||{};for(const k of ['name','place','accountHolder','bank','account','ifsc','branch','upi'])if(b[k]!==undefined)m[k]=String(b[k]).trim();if(b.photo!==undefined){const photo=String(b.photo);if(photo.length>1200000)return res.status(400).json({error:'Profile photo is too large'});m.photo=photo}if(!m.name||!m.place||!m.accountHolder||!m.bank||!m.account||!m.ifsc||!m.branch||!m.upi)return res.status(400).json({error:'Please complete all profile and bank details'});m.profileLocked=true;save(db);res.json({ok:true,member:memberPublic(m),profile:memberProfile(m)})});
app.get('/api/member/dashboard/:id',(req,res)=>{
 const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Member not found'});
 const lv=descendants(m.memberId),w=wallet(m.memberId);
 const levels={};for(let i=1;i<=7;i++)levels[i]=lv[i].map(memberPublic);
 const messages=[...db.messages.filter(x=>x.to===m.memberId||x.to==='ALL'),...db.leveltrackMessages.filter(x=>x.to===m.memberId)].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,2).map(x=>({to:x.to,message:x.message,at:x.at}));
 res.json({member:memberPublic(m),profile:memberProfile(m),levels,tree:tree(m.memberId),wallet:w,messages});
});
app.get('/api/member/level/:id/:level',(req,res)=>{
 const m=db.members.find(x=>x.memberId===req.params.id),l=Number(req.params.level);if(!m||l<1||l>7)return res.status(404).json({error:'Not found'});
 const lv=descendants(m.memberId);res.json({members:lv[l].map(memberPublic)});
});
app.post('/api/member/use-pin',(req,res)=>{
 const p=db.pins.find(x=>x.assignedTo===req.body.memberId&&x.status==='AVAILABLE');if(!p)return res.status(400).json({error:'No available PIN'});
 p.status='USED';p.usedBy=req.body.memberId;p.usedAt=new Date().toISOString();save(db);res.json({wallet:wallet(req.body.memberId)});
});


// ---------------- LEVELTRACK SERVER API ----------------
const LEVEL_RULES={
  1:{upgrade:1000,member:1000,trust:0,admin:0,required:3},
  2:{upgrade:3000,member:3000,trust:0,admin:0,required:6},
  3:{upgrade:20000,member:15600,trust:2400,admin:2000,required:9},
  4:{upgrade:100000,member:72000,trust:16000,admin:12000,required:12},
  5:{upgrade:200000,member:148000,trust:32000,admin:20000,required:15},
  6:{upgrade:500000,member:240000,trust:160000,admin:100000,required:18},
  7:{upgrade:0,member:0,trust:0,admin:0,required:18}
};
function splitRule(from){const r=LEVEL_RULES[Number(from)]||{upgrade:0,member:0,trust:0,admin:0};const out=[{type:'member',label:'MEMBER / RECEIVER',amount:Number(r.member||r.upgrade||0)}];if(Number(r.trust||0)>0)out.push({type:'trust',label:'TRUST',amount:Number(r.trust)});if(Number(r.admin||0)>0)out.push({type:'admin',label:'ADMIN',amount:Number(r.admin)});return {upgrade:Number(r.upgrade||0),parts:out};}
function activeAdminAccounts(){return (db.paymentSettings.admins||[]).filter(x=>x.active!==false);}
function allocateAdminAccount(){const a=activeAdminAccounts();if(!a.length)return null;const idx=Number(db.paymentSettings.adminRotationIndex||0)%a.length;const chosen=a[idx];db.paymentSettings.adminRotationIndex=(idx+1)%a.length;return {...chosen};}
function earningsRequired(level){return ({2:5,3:10,4:10,5:5,6:5,7:5})[Number(level)]||0;}
function seniorityQueue(level){
  const target=Number(level);
  const firstMember=[...db.members].sort((a,b)=>String(a.joinedAt||a.registeredAt||a.createdAt||'').localeCompare(String(b.joinedAt||b.registeredAt||b.createdAt||'')))[0]||null;
  const eligible=db.members.filter(m=>{const reached=m.levelReachedAt&&m.levelReachedAt[target];return !!reached || Number(m.level||1)>=target;});
  // The First Company / First Member is the permanent root position for every level.
  if(firstMember && target>=2 && !eligible.some(m=>m.memberId===firstMember.memberId)) eligible.push(firstMember);
  eligible.sort((a,b)=>{
    if(String(process.env.B5_SENIORITY_TEST_MODE||'')==='1'){
      const ao=Number(a._seniorityTestOrder||999999),bo=Number(b._seniorityTestOrder||999999);
      if(ao!==bo)return ao-bo;
    }
    if(firstMember && a.memberId===firstMember.memberId && b.memberId!==firstMember.memberId && !a._seniorityTestOrder && !b._seniorityTestOrder)return -1;
    if(firstMember && b.memberId===firstMember.memberId && a.memberId!==firstMember.memberId && !a._seniorityTestOrder && !b._seniorityTestOrder)return 1;
    const at=(m)=>String((m.levelReachedAt&&m.levelReachedAt[target])||m.upgradeDate||m.joinedAt||m.registeredAt||m.createdAt||'');
    return at(a).localeCompare(at(b));
  });
  return eligible.map((m,i)=>{const completed=db.leveltrackPayments.filter(p=>{const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);return p.receiverMemberId===m.memberId&&p.adminApproved&&Number(u?.seniorityLevel||u?.to)===target;}).length;const required=earningsRequired(target);return {position:i+1,memberId:m.memberId,name:m.name,mobile:m.mobile,reachedAt:(m.levelReachedAt&&m.levelReachedAt[target])||m.joinedAt||m.registeredAt||m.createdAt||null,completed,required,status:completed>=required?'COMPLETED':'ACTIVE'};});
}
function nextSeniorReceiver(level,excludeMemberId=''){return seniorityQueue(level).find(x=>x.status==='ACTIVE'&&x.memberId!==excludeMemberId)||null;}
function nextLevelMemberId(level){
  const prefix='L'+level+'-';
  const nums=db.members.map(m=>String(m.levelMemberId||'')).filter(x=>x.startsWith(prefix)).map(x=>Number(x.slice(prefix.length))).filter(Number.isFinite);
  return prefix+String((nums.length?Math.max(...nums):0)+1).padStart(3,'0');
}
function ltMember(id){return db.members.find(m=>m.memberId===id)}
function direct(id){return db.members.filter(m=>m.referral===id)}
function completedReferralUpgrades(memberId){return db.leveltrackUpgrades.filter(u=>u.memberId===memberId&&u.kind==='REFERRAL_UPGRADE'&&u.adminApproved).length;}
function pendingLeveltrackRequest(memberId){return db.leveltrackRequests.find(r=>r.memberId===memberId&&r.status!=='Completed')||null;}
function referralUpgradeState(m){
  const refs=direct(m.memberId).length;
  const availableBatches=refs<3?0:1+Math.floor((refs-3)/2);
  const completed=completedReferralUpgrades(m.memberId);
  const currentLevel=Math.max(1,Number(m.level||1));
  const requiredExtraBeforeNextLevel=Math.max(0,currentLevel-1);
  return {refs,availableBatches,completed,currentLevel,requiredExtraBeforeNextLevel,extraAvailable:Math.max(0,availableBatches-1)>completed&&completed<requiredExtraBeforeNextLevel};
}
function nextMemberAction(m){
  const pending=pendingLeveltrackRequest(m.memberId);
  if(pending)return {type:pending.kind==='REFERRAL_UPGRADE'?'REFERRAL_UPGRADE':'LEVEL_UPGRADE',request:pending};
  if(Number(m.level||1)>=7)return {type:'NONE'};
  const st=referralUpgradeState(m);
  if(st.extraAvailable)return {type:'REFERRAL_UPGRADE',cycle:st.completed+1,seniorityLevel:st.currentLevel};
  const need={1:3,2:5,3:7,4:9,5:11,6:13}[st.currentLevel]||0;
  if(st.refs>=need&&st.completed>=st.requiredExtraBeforeNextLevel)return {type:'LEVEL_UPGRADE',from:st.currentLevel,to:st.currentLevel+1};
  return {type:'NONE'};
}
function downlineCount(id){
  let count=0,queue=[id],seen=new Set([id]);
  while(queue.length){const cur=queue.shift();for(const m of db.members){if(m.referral===cur&&!seen.has(m.memberId)){seen.add(m.memberId);count++;queue.push(m.memberId)}}}
  return count;
}
function ltTree(id){
  const root=ltMember(id); if(!root)return null;
  const make=m=>({memberId:m.memberId,name:m.name,mobile:m.mobile,status:m.status,level:Number(m.level||1),levelMemberId:m.levelMemberId||null,children:direct(m.memberId).map(make)});
  return make(root);
}
function ltStatusUpgrade(memberId){
  return db.leveltrackUpgrades.filter(u=>u.memberId===memberId).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]||null;
}
function ltHistory(memberId){
  return db.leveltrackUpgrades.filter(u=>u.memberId===memberId).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).map(u=>({id:u.id,kind:u.kind||'LEVEL_UPGRADE',seniorityLevel:u.seniorityLevel||u.to,from:u.from,to:u.to,amount:u.amount,utr:u.utr||'',memberPaid:!!u.memberPaid,receiverApproved:!!u.receiverApproved,adminApproved:!!u.adminApproved,date:u.completedAt||u.createdAt}));
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
  if(upgrade && String(upgrade.status||'').toLowerCase()==='assigned') { const saved=db.leveltrackPayments.find(p=>p.upgradeId===upgrade.id); upgrade={...pendingRequest,...upgrade,payment:saved||{payee:upgrade.payee||'',payeeId:upgrade.payeeId||'',payeePhone:upgrade.payeePhone||'',accountHolder:upgrade.accountHolder||'',bank:upgrade.bank||'',account:upgrade.account||'',ifsc:upgrade.ifsc||'',branch:upgrade.branch||'',upi:upgrade.upi||'',amount:upgrade.amount||0,parts:upgrade.paymentParts||[]}}; }
  const action=nextMemberAction(m);
  const payments=db.leveltrackPayments.filter(p=>p.receiverMemberId===memberId).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const incomingPayments=payments.filter(p=>p.memberPaid===true&&!p.adminApproved);
  const earningsRules={2:5,3:10,4:10,5:5,6:5,7:5};
  const earnings=Object.keys(earningsRules).map(l=>{const level=Number(l);const completed=payments.filter(p=>{const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);return u&&Number(u.to)===level&&p.memberAccepted&&u.adminApproved}).length;return {level,required:earningsRules[level],completed}});
  const directReferrals=direct(memberId).length;
  const requiredDirectReferrals={1:3,2:5,3:7,4:9,5:11,6:13}[Number(m.level||1)]||0;
  const msgs=[...db.messages.filter(x=>x.to===memberId||x.to==='ALL'),...db.leveltrackMessages.filter(x=>x.to===memberId)].sort((a,b)=>String(b.at).localeCompare(String(a.at))).map(x=>({message:x.message,at:x.at}));
  return {member:memberPublic(m),directReferrals,totalDownline:downlineCount(memberId),tree:ltTree(memberId),upgrade,requests,incomingPayments,history:ltHistory(memberId),earnings,seniority:seniorityQueue(Number(m.level||1)).find(x=>x.memberId===memberId)||null,requiredDirectReferrals,messages:msgs,action};
}
app.get('/leveltrack-admin.html',(req,res)=>res.sendFile(path.join(__dirname,'leveltrack-admin.html')));
app.get('/leveltrack-member.html',(req,res)=>res.sendFile(path.join(__dirname,'leveltrack-member.html')));
app.get('/api/leveltrack/admin/dashboard',(req,res)=>{
  const levels={1:0,2:0,3:0,4:0,5:0,6:0,7:0};
  db.members.forEach(m=>{const l=Math.min(7,Math.max(1,Number(m.level||1)));levels[l]++});
  res.json({levels,members:db.members.map(memberPublic),requests:db.leveltrackRequests.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),upgrades:db.leveltrackUpgrades.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),payments:db.leveltrackPayments.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),paymentSettings:db.paymentSettings,seniority:{2:seniorityQueue(2),3:seniorityQueue(3),4:seniorityQueue(4),5:seniorityQueue(5),6:seniorityQueue(6),7:seniorityQueue(7)}});
});
app.get('/api/leveltrack/admin/members',(req,res)=>res.json({members:findMember(req.query.q).map(memberPublic)}));
app.get('/api/leveltrack/admin/member-details/:id',(req,res)=>{
  const m=ltMember(req.params.id);if(!m)return res.status(404).json({error:'Member not found'});
  res.json({member:{...memberPublic(m),accountHolder:m.accountHolder||m.name||'',account:m.account||'',ifsc:m.ifsc||'',bank:m.bank||'',branch:m.branch||'',upi:m.upi||''},directReferrals:direct(m.memberId).length,totalDownline:downlineCount(m.memberId),tree:ltTree(m.memberId)});
});
app.get('/api/leveltrack/admin/next-receiver/:level',(req,res)=>{
 const level=Number(req.params.level);if(![2,3,4,5,6,7].includes(level))return res.status(400).json({error:'Invalid target level'});
 const receiver=nextSeniorReceiver(level,String(req.query.excludeMemberId||''));
 if(!receiver)return res.json({receiver:null});
 res.json({receiver});
});
app.post('/api/leveltrack/admin/requests/:id/assign',(req,res)=>{
 const r=db.leveltrackRequests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Upgrade request not found'});
 if(r.status==='Assigned'){
  const u=db.leveltrackUpgrades.find(x=>x.requestId===r.id);
  const payment=u?db.leveltrackPayments.find(x=>x.upgradeId===u.id):null;
  if(u&&payment)return res.json({ok:true,alreadyAssigned:true,request:r,upgrade:u,payment});
  return res.status(409).json({error:'Request is marked Assigned but its payment record is missing. Please refresh Admin and retry.'});
 }
 if(r.status!=='Requested')return res.status(400).json({error:'Request is not pending'});
 const m=ltMember(r.memberId);if(!m)return res.status(404).json({error:'Member not found'});const isReferral=r.kind==='REFERRAL_UPGRADE';const targetLevel=isReferral?Number(r.seniorityLevel||m.level):Number(r.to);const amount=isReferral?1000:Number(LEVEL_RULES[r.from]?.upgrade||0);if(!amount)return res.status(400).json({error:'Upgrade amount not configured'});const autoReceiver=nextSeniorReceiver(targetLevel,isReferral?m.memberId:'');const receiver=autoReceiver?ltMember(autoReceiver.memberId):null;if(!receiver)return res.status(400).json({error:'No eligible seniority receiver is available for this level. Add a member to the level queue first.'});
 const sr=isReferral?{upgrade:amount,parts:[{type:'member',label:'MEMBER / RECEIVER',amount}]}:splitRule(r.from);const parts=sr.parts;const rec=parts.find(x=>x.type==='member');if(rec)rec.accountDetails={name:receiver.name,memberId:receiver.memberId,mobile:receiver.mobile,accountHolder:receiver.accountHolder||receiver.name||'',bank:receiver.bank||'',account:receiver.account||'',ifsc:receiver.ifsc||'',branch:receiver.branch||'',upi:receiver.upi||''};
 const tr=parts.find(x=>x.type==='trust');if(tr)tr.accountDetails={...db.paymentSettings.trust};const ap=parts.findIndex(x=>x.type==='admin');if(ap>=0){const aa=allocateAdminAccount();if(!aa)return res.status(400).json({error:'No active Admin account configured'});parts[ap].accountDetails=aa;}
 const now=new Date().toISOString();Object.assign(r,{status:'Assigned',assignedAt:now,seniorityLevel:targetLevel,payee:receiver.name||'',accountHolder:receiver.accountHolder||receiver.name||'',payeeId:receiver.memberId,payeePhone:receiver.mobile||'',amount,account:receiver.account||'',bank:receiver.bank||'',ifsc:receiver.ifsc||'',branch:receiver.branch||'',upi:receiver.upi||'',paymentParts:parts});
 let u=db.leveltrackUpgrades.find(x=>x.requestId===r.id);if(!u){u={id:'LTU-'+crypto.randomBytes(4).toString('hex').toUpperCase(),requestId:r.id,memberId:m.memberId,from:r.from,to:r.to,kind:r.kind||'LEVEL_UPGRADE',seniorityLevel:targetLevel,createdAt:now};db.leveltrackUpgrades.push(u)}Object.assign(u,{amount,kind:r.kind||'LEVEL_UPGRADE',seniorityLevel:targetLevel,payee:r.payee,accountHolder:r.accountHolder,payeeId:r.payeeId,payeePhone:r.payeePhone,account:r.account,bank:r.bank,ifsc:r.ifsc,branch:r.branch,upi:r.upi,paymentParts:parts,detailsSent:true,detailsSentAt:now});
 const payment={id:'LTP-'+crypto.randomBytes(4).toString('hex').toUpperCase(),upgradeId:u.id,kind:r.kind||'LEVEL_UPGRADE',seniorityLevel:targetLevel,fromMemberId:m.memberId,receiverMemberId:receiver.memberId,from:m.name,to:receiver.name,amount,parts:parts.map(x=>({...x,status:'PENDING',utr:'',screenshot:null})),memberPaid:false,memberAccepted:false,adminApproved:false,createdAt:now};db.leveltrackPayments=db.leveltrackPayments.filter(x=>x.upgradeId!==u.id);db.leveltrackPayments.push(payment);db.leveltrackMessages.push({to:m.memberId,message:(r.kind==='REFERRAL_UPGRADE'?`Upgrade payment details sent. Seniority Level L${targetLevel}. Total ₹${amount.toLocaleString()}.`:`Payment details sent for L${r.from} → L${r.to}. Total ₹${amount.toLocaleString()}.`),at:now});save(db);res.json({ok:true,request:r,upgrade:u,payment});
});
app.post('/api/leveltrack/admin/requests/:id/resend-details',(req,res)=>{
 const r=db.leveltrackRequests.find(x=>x.id===req.params.id);
 if(!r)return res.status(404).json({error:'Upgrade request not found'});
 if(r.status!=='Assigned')return res.status(400).json({error:'Payment details have not been assigned for this request yet.'});
 const u=db.leveltrackUpgrades.find(x=>x.requestId===r.id);
 const p=u?db.leveltrackPayments.find(x=>x.upgradeId===u.id):null;
 if(!u||!p)return res.status(400).json({error:'Payment details record not found for this request.'});
 const m=ltMember(r.memberId);
 if(!m)return res.status(404).json({error:'Member not found'});
 const amount=Number(u.amount||r.amount||p.amount||0);
 const message=r.kind==='REFERRAL_UPGRADE'?`Upgrade payment details sent again. Seniority Level L${r.seniorityLevel||u.seniorityLevel||r.from}. Total ₹${amount.toLocaleString()}.`:`Payment details sent again for L${r.from} → L${r.to}. Total ₹${amount.toLocaleString()}.`;
 db.leveltrackMessages.push({to:m.memberId,message,at:new Date().toISOString()});
 save(db);
 res.json({ok:true,message:'Payment details sent again to the member.',request:r,upgrade:u,payment:p});
});
app.post('/api/leveltrack/admin/payments/by-upgrade/:id/approve',(req,res)=>{const u=db.leveltrackUpgrades.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'Upgrade not found'});const p=db.leveltrackPayments.find(x=>x.upgradeId===u.id);if(!p)return res.status(400).json({error:'Payment not found'});if(u.adminApproved&&p.adminApproved)return res.json({ok:true,alreadyApproved:true,member:memberPublic(ltMember(u.memberId)),upgrade:u,payment:p});const allPaid=(p.parts||[]).every(x=>['SUBMITTED','CONFIRMED','APPROVED'].includes(x.status));if(!u.memberPaid||!allPaid||!p.memberAccepted)return res.status(400).json({error:'All payment proofs and receiver confirmation are required'});p.parts=(p.parts||[]).map(x=>({...x,status:'APPROVED',adminApprovedAt:new Date().toISOString()}));p.adminApproved=true;p.adminVerifiedAt=new Date().toISOString();u.receiverApproved=true;u.adminApproved=true;const m=ltMember(u.memberId);if(!m)return res.status(404).json({error:'Member not found'});if(Number(m.level)!==Number(u.from))return res.status(400).json({error:'Member level changed already'});u.completedAt=new Date().toISOString();const r=db.leveltrackRequests.find(x=>x.id===u.requestId);if(r)r.status='Completed';if(u.kind==='REFERRAL_UPGRADE'){db.leveltrackMessages.push({to:m.memberId,message:`Upgrade completed. Your next Level Upgrade is now available when unlocked.`,at:new Date().toISOString()});save(db);return res.json({ok:true,member:memberPublic(m),upgrade:u,payment:p});}m.level=Number(u.to);m.levelMemberId=nextLevelMemberId(m.level);m.levelReachedAt={...(m.levelReachedAt||{}),[String(u.to)]:new Date().toISOString()};m.upgradeDate=new Date().toISOString();m.status='Verified';db.leveltrackMessages.push({to:m.memberId,message:`Admin approved payment. Level upgrade completed. You are now Level ${m.level}.`,at:new Date().toISOString()});save(db);res.json({ok:true,member:memberPublic(m),upgrade:u,payment:p})});
app.post('/api/leveltrack/admin/payments/:id/verify',(req,res)=>{
  const p=db.leveltrackPayments.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Payment not found'});
  if(!p.memberAccepted)return res.status(400).json({error:'Receiver has not accepted the payment'});
  p.adminApproved=true;p.adminVerifiedAt=new Date().toISOString();
  const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);if(u){u.receiverApproved=true;}
  save(db);res.json({ok:true,payment:p});
});
app.post('/api/leveltrack/admin/upgrades/:id/final-approve',(req,res)=>{
  const u=db.leveltrackUpgrades.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'Upgrade not found'});
  const p=db.leveltrackPayments.find(x=>x.upgradeId===u.id);if(!u.memberPaid||!u.receiverApproved||!p?.adminApproved)return res.status(400).json({error:'Payment must be paid, accepted and admin verified first'});
  const m=ltMember(u.memberId);if(!m)return res.status(404).json({error:'Member not found'});
  if(Number(m.level)!==Number(u.from))return res.status(400).json({error:'Member level changed already'});
  u.adminApproved=true;u.completedAt=new Date().toISOString();
  const r=db.leveltrackRequests.find(x=>x.id===u.requestId);if(r)r.status='Completed';
  if(u.kind==='REFERRAL_UPGRADE'){db.leveltrackMessages.push({to:m.memberId,message:`Upgrade completed. Your next Level Upgrade is now available when unlocked.`,at:new Date().toISOString()});save(db);return res.json({ok:true,member:memberPublic(m),upgrade:u});}
  m.level=Number(u.to);m.levelMemberId=nextLevelMemberId(m.level);m.levelReachedAt={...(m.levelReachedAt||{}),[String(u.to)]:new Date().toISOString()};m.upgradeDate=new Date().toISOString();m.status='Verified';
  db.leveltrackMessages.push({to:m.memberId,message:`Level upgrade completed. You are now Level ${m.level}.`,at:new Date().toISOString()});save(db);res.json({ok:true,member:memberPublic(m),upgrade:u});
});
app.get('/api/leveltrack/admin/payment-settings',(req,res)=>res.json({paymentSettings:db.paymentSettings,levels:LEVEL_RULES}));
app.post('/api/leveltrack/admin/payment-settings',(req,res)=>{const b=req.body||{};if(Array.isArray(b.admins))db.paymentSettings.admins=b.admins.map((x,i)=>({id:x.id||String.fromCharCode(65+i),name:x.name||`Admin ${String.fromCharCode(65+i)}`,accountHolder:x.accountHolder||'',bank:x.bank||'',account:x.account||'',ifsc:x.ifsc||'',upi:x.upi||'',active:x.active!==false}));if(b.trust)db.paymentSettings.trust={...db.paymentSettings.trust,...b.trust};if(Number.isInteger(b.adminRotationIndex))db.paymentSettings.adminRotationIndex=Math.max(0,b.adminRotationIndex);save(db);res.json({ok:true,paymentSettings:db.paymentSettings});});
app.get('/api/leveltrack/admin/payment-report',(req,res)=>{const from=String(req.query.from||'');const to=String(req.query.to||from||'');const q=String(req.query.q||'').trim().toLowerCase();const level=String(req.query.level||'').trim();const rows=[];for(const p of db.leveltrackPayments){const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);if(!u)continue;const dt=String(p.submittedAt||u.completedAt||p.createdAt||'').slice(0,10);if(from&&dt<from)continue;if(to&&dt>to)continue;if(level&&String(u.from)!==level)continue;if(q&&!(`${p.fromMemberId} ${p.receiverMemberId} ${u.payee||''}`).toLowerCase().includes(q))continue;rows.push({paymentId:p.id,date:dt,level:u.kind==='REFERRAL_UPGRADE'?`UPGRADE • L${u.seniorityLevel||u.from}`:`L${u.from} → L${u.to}`,payerMemberId:p.fromMemberId,receiverMemberId:p.receiverMemberId,total:p.amount,status:p.adminApproved?'Approved':p.memberAccepted?'Receiver Confirmed':p.memberPaid?'Proof Submitted':'Pending',parts:(p.parts||[]).map(x=>({type:x.type,label:x.label,amount:x.amount,account:x.accountDetails?.account||'',accountName:x.accountDetails?.name||x.accountDetails?.accountHolder||'',status:x.status,utr:x.utr||'',screenshot:!!x.screenshot}))});}const totals={member:0,trust:0,admin:0,total:0};const adminByAccount={};let trustTotal=0;rows.forEach(r=>r.parts.forEach(x=>{totals[x.type]=(totals[x.type]||0)+Number(x.amount||0);totals.total+=Number(x.amount||0);if(x.type==='admin'){const key=x.accountName||x.account||'Admin';adminByAccount[key]=(adminByAccount[key]||0)+Number(x.amount||0)}if(x.type==='trust')trustTotal+=Number(x.amount||0)}));res.json({from,to,count:rows.length,totals,adminByAccount,trustTotal,rows});});
app.get('/api/leveltrack/admin/daily-report',(req,res)=>{
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  const upgrades=db.leveltrackUpgrades.filter(u=>u.adminApproved&&String(u.completedAt||'').slice(0,10)===date).map(u=>({from:u.from,to:u.to,kind:u.kind||'LEVEL_UPGRADE',seniorityLevel:u.seniorityLevel||u.to,amount:u.amount,date:String(u.completedAt).slice(0,10),member:memberPublic(ltMember(u.memberId))}));
  res.json({date,count:upgrades.length,upgrades});
});
app.get('/api/leveltrack/member/dashboard/:id',(req,res)=>{
  const d=ltDashboard(req.params.id);if(!d)return res.status(404).json({error:'Member not found'});res.json(d);
});
app.post('/api/leveltrack/member/upgrade-request',(req,res)=>{
  const m=ltMember(req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});
  const pending=pendingLeveltrackRequest(m.memberId);if(pending)return res.status(400).json({error:'Upgrade request already pending'});
  const action=nextMemberAction(m);
  if(action.type!=='LEVEL_UPGRADE')return res.status(400).json({error:action.type==='REFERRAL_UPGRADE'?'Complete the current Upgrade first.':'The next level upgrade is not unlocked yet.'});
  const from=Number(m.level||1),to=from+1;if(from>=7)return res.status(400).json({error:'Level 7 is the final level'});
  const need={1:3,2:5,3:7,4:9,5:11,6:13}[from]||0;if(direct(m.memberId).length<need)return res.status(400).json({error:`Need ${need} direct referrals for Level ${from} → Level ${to}.`});
  const r={id:'LTR-'+crypto.randomBytes(4).toString('hex').toUpperCase(),memberId:m.memberId,from,to,kind:'LEVEL_UPGRADE',status:'Requested',date:new Date().toISOString().slice(0,10),createdAt:new Date().toISOString()};db.leveltrackRequests.push(r);db.leveltrackMessages.push({to:'ADMIN',message:`New LevelTrack upgrade request: ${m.name} — L${from} → L${to}.`,at:new Date().toISOString()});save(db);res.json({ok:true,request:r});
});
app.post('/api/leveltrack/member/referral-upgrade-request',(req,res)=>{
  const m=ltMember(req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});
  const pending=pendingLeveltrackRequest(m.memberId);if(pending)return res.status(400).json({error:'Upgrade request already pending'});
  const action=nextMemberAction(m);if(action.type!=='REFERRAL_UPGRADE')return res.status(400).json({error:'The additional Upgrade is not unlocked yet.'});
  const r={id:'LTR-'+crypto.randomBytes(4).toString('hex').toUpperCase(),memberId:m.memberId,from:Number(m.level||1),to:Number(m.level||1),kind:'REFERRAL_UPGRADE',cycle:Number(action.cycle||1),seniorityLevel:Number(action.seniorityLevel||m.level||1),status:'Requested',date:new Date().toISOString().slice(0,10),createdAt:new Date().toISOString()};db.leveltrackRequests.push(r);db.leveltrackMessages.push({to:'ADMIN',message:`New additional Upgrade: ${m.name} — cycle ${r.cycle}, Seniority L${r.seniorityLevel}.`,at:new Date().toISOString()});save(db);res.json({ok:true,request:r});
});
app.post('/api/leveltrack/member/upgrade/:id/pay',(req,res)=>{const u=db.leveltrackUpgrades.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'Upgrade not found'});if(u.memberId!==req.body.memberId)return res.status(403).json({error:'Not your upgrade'});const p=db.leveltrackPayments.find(x=>x.upgradeId===u.id);if(!p)return res.status(404).json({error:'Payment instructions not found'});const proofs=Array.isArray(req.body.parts)?req.body.parts:[];if(!proofs.length)return res.status(400).json({error:'Payment proof required'});for(const proof of proofs){const part=p.parts.find(x=>x.type===proof.type);if(!part)continue;const utr=String(proof.utr||'').trim();if(!utr)return res.status(400).json({error:`UTR required for ${part.label}`});if(!proof.screenshot)return res.status(400).json({error:`Screenshot required for ${part.label}`});part.utr=utr;part.screenshot=proof.screenshot;part.submittedAt=new Date().toISOString();part.status='SUBMITTED';}const all=p.parts.every(x=>['SUBMITTED','CONFIRMED','APPROVED'].includes(x.status));if(!all)return res.status(400).json({error:'Upload payment proof for every payment section'});u.memberPaid=true;u.utr=p.parts.find(x=>x.type==='member')?.utr||'';u.paidAt=new Date().toISOString();p.utr=u.utr;p.memberPaid=true;p.submittedAt=new Date().toISOString();db.leveltrackMessages.push({to:u.payeeId,message:`Payment proofs submitted for L${u.from} → L${u.to}. Please confirm the receiver payment.`,at:new Date().toISOString()});save(db);res.json({ok:true,upgrade:u,payment:p});});
app.post('/api/leveltrack/member/incoming/:id/accept',(req,res)=>{
  const p=db.leveltrackPayments.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Payment not found'});
  if(p.receiverMemberId!==req.body.memberId)return res.status(403).json({error:'Not your payment'});
  p.memberAccepted=true;p.acceptedAt=new Date().toISOString();const mp=(p.parts||[]).find(x=>x.type==='member');if(mp)mp.status='CONFIRMED';const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);if(u)u.receiverApproved=true;save(db);res.json({ok:true,payment:p});
});
app.get('/api/leveltrack/member/messages/:id',(req,res)=>{
  const msgs=[...db.messages.filter(x=>x.to===req.params.id||x.to==='ALL').map(x=>({message:x.message,at:x.at})),...db.leveltrackMessages.filter(x=>x.to===req.params.id).map(x=>({message:x.message,at:x.at}))].sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  res.json({messages:msgs});
});

const PORT=process.env.PORT||10000;
app.get('/api/db-status',(req,res)=>res.json({ok:supabaseReady,persistence:'supabase-api',members:Array.isArray(db.members)?db.members.length:0}));

initPersistentDatabase()
  .then(()=>{
    const seeded=seedSeniorityTestData();
    if(seeded) save(db);
    localSave(db);
    app.listen(PORT,'0.0.0.0',()=>console.log('BORNTOWIN5 running on '+PORT));
  })
  .catch(err=>{
    console.error('PERMANENT DATABASE STARTUP FAILED:',err.message);
    process.exit(1);
  });
