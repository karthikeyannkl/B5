const express=require('express');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const app=express();
app.use(express.json({limit:'2mb'}));
app.use(express.static(__dirname));

const DATA_DIR=process.env.DATA_DIR || path.join(__dirname,'data');
const DB_FILE=path.join(DATA_DIR,'db.json');
const BACKUP_FILE=path.join(DATA_DIR,'db.backup.json');
let pgPool=null;
fs.mkdirSync(DATA_DIR,{recursive:true});
function freshDB(){return {schemaVersion:3,adminPassword:'ADMIN',members:[],pins:[],messages:[],leveltrackRequests:[],leveltrackUpgrades:[],leveltrackPayments:[],leveltrackMessages:[]};}
function loadLocal(){
  for(const file of [DB_FILE,BACKUP_FILE]){
    try{if(fs.existsSync(file)){const d=JSON.parse(fs.readFileSync(file,'utf8'));if(d&&typeof d==='object')return d}}catch(e){console.error('Local DB read failed',e)}
  }
  return freshDB();
}
async function initPersistentDB(){
  if(process.env.DATABASE_URL){
    const {Pool}=require('pg');
    pgPool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='false'?false:{rejectUnauthorized:false},max:5});
    await pgPool.query(`CREATE TABLE IF NOT EXISTS borntown5_state (id INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL, state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const r=await pgPool.query('SELECT state FROM borntown5_state WHERE id=1');
    if(r.rows[0]?.state){ return r.rows[0].state; }
    const d=loadLocal();
    await pgPool.query(`INSERT INTO borntown5_state(id,schema_version,state) VALUES(1,$1,$2::jsonb) ON CONFLICT(id) DO NOTHING`,[3,JSON.stringify(d)]);
    return d;
  }
  return loadLocal();
}
let db=null;
async function save(d){
  d.schemaVersion=3;
  if(pgPool){
    await pgPool.query(`INSERT INTO borntown5_state(id,schema_version,state,updated_at) VALUES(1,$1,$2::jsonb,NOW()) ON CONFLICT(id) DO UPDATE SET schema_version=EXCLUDED.schema_version,state=EXCLUDED.state,updated_at=NOW()`,[3,JSON.stringify(d)]);
    return;
  }
  const tmp=DB_FILE+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(d,null,2));
  fs.renameSync(tmp,DB_FILE);
  try{fs.copyFileSync(DB_FILE,BACKUP_FILE)}catch(e){}
}
async function boot(){
  db=await initPersistentDB();
// Backward-compatible defaults for existing db.json files.
db.members=db.members||[];db.pins=db.pins||[];db.messages=db.messages||[];
db.leveltrackRequests=db.leveltrackRequests||[];db.leveltrackUpgrades=db.leveltrackUpgrades||[];
db.leveltrackPayments=db.leveltrackPayments||[];db.leveltrackMessages=db.leveltrackMessages||[];
// First Joining PIN required by the original BORNTOWIN5 registration flow.
if(!db.pins.some(x=>x.pin==='B5-FMUXNF' && x.status==='AVAILABLE')){
  const old=db.pins.find(x=>x.pin==='B5-FMUXNF');
  if(!old) db.pins.push({pin:'B5-FMUXNF',assignedTo:null,status:'AVAILABLE',usedBy:null,createdAt:new Date().toISOString(),system:true});
  else if(!old.usedBy){old.status='AVAILABLE';old.assignedTo=null;}
}
await save(db);
}



function id(){return 'B5-'+crypto.randomBytes(3).toString('hex').toUpperCase()}
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return salt+':'+crypto.scryptSync(String(password),salt,64).toString('hex')}
function verifyPassword(password,stored){if(!stored||!String(stored).includes(':'))return false;const [salt,hash]=String(stored).split(':');const actual=crypto.scryptSync(String(password),salt,64).toString('hex');return crypto.timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(hash,'hex'))}
function pin(){return 'B5-'+crypto.randomBytes(3).toString('hex').toUpperCase()}
function memberPublic(m){return {memberId:m.memberId,name:m.name,mobile:m.mobile,status:(m.status==='Rejected'?'Rejected':'ACTIVE'),referral:m.referral,level:Number(m.level||1),levelMemberId:m.levelMemberId||null,joinedAt:m.joinedAt||m.registeredAt||null,upgradeDate:m.upgradeDate||null,profile:m.profile||{},profileSavedAt:m.profileSavedAt||null}}
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
app.get('/',async (req,res)=>res.sendFile(path.join(__dirname,'member.html')));
app.get('/member.html',async (req,res)=>res.sendFile(path.join(__dirname,'member.html')));
app.get('/admin.html',async (req,res)=>res.sendFile(path.join(__dirname,'admin.html')));

app.post('/api/admin/login',async (req,res)=>{if(req.body.password!==db.adminPassword)return res.status(401).json({error:'Incorrect password'});res.json({ok:true})});
app.post('/api/admin/password',async (req,res)=>{if(req.body.oldPassword!==db.adminPassword)return res.status(401).json({error:'Current password is incorrect'});db.adminPassword=String(req.body.newPassword||'');await save(db);res.json({ok:true})});
app.get('/api/admin/dashboard',async (req,res)=>{
 const today=new Date().toISOString().slice(0,10);
 const total=db.members.length,pending=db.members.filter(m=>m.status==='Pending').length,verified=db.members.filter(m=>m.status==='Verified').length;
 const todayMembers=db.members.filter(m=>String(m.registeredAt||m.joinedAt||'').slice(0,10)===today).map(memberPublic);
 const report=db.members.map(m=>{const w=wallet(m.memberId);return {name:m.name,memberId:m.memberId,received:w.received,used:w.used,available:w.available}});
 const sent=db.pins.filter(p=>p.assignedTo).length;
 const used=db.pins.filter(p=>p.status==='USED').length;
 const leaders=new Set(db.pins.filter(p=>p.assignedTo).map(p=>p.assignedTo)).size;
 res.json({total,pending,verified,todayRegistrations:todayMembers.length,members:db.members.map(memberPublic),pinSummary:{sent,used,leaders},pinReport:report});
});
app.get('/api/admin/members',async (req,res)=>res.json({members:findMember(req.query.q).map(memberPublic)}));
app.get('/api/admin/member-details/:id',async (req,res)=>{
 const m=db.members.find(x=>x.memberId===req.params.id);
 if(!m)return res.status(404).json({error:'Member not found'});
 const kids=(id)=>db.members.filter(x=>x.referral===id).map(x=>({memberId:x.memberId,name:x.name,mobile:x.mobile,status:x.status,level:Number(x.level||1),levelMemberId:x.levelMemberId||null,children:kids(x.memberId)}));
 res.json({member:memberPublic(m),details:m,referralTree:{memberId:m.memberId,name:m.name,mobile:m.mobile,status:m.status,level:Number(m.level||1),levelMemberId:m.levelMemberId||null,children:kids(m.memberId)},directReferrals:db.members.filter(x=>x.referral===m.memberId).length,totalDownline:downlineCount(m.memberId)});
});
app.post('/api/admin/member-password-reset',async (req,res)=>{
 const m=db.members.find(x=>x.memberId===String(req.body.memberId||''));
 if(!m)return res.status(404).json({error:'Member not found'});
 const password=String(req.body.newPassword||'');
 if(password.length<6)return res.status(400).json({error:'Password must be at least 6 characters'});
 m.passwordHash=hashPassword(password);
 await save(db);
 res.json({ok:true,member:memberPublic(m)});
});
app.post('/api/admin/member-status',async (req,res)=>{
 const m=db.members.find(x=>x.memberId===req.body.memberId);
 if(!m)return res.status(404).json({error:'Member not found'});
 m.status=req.body.status;
 if(req.body.status==='Verified'){
   if(!m.level)m.level=1;
   if(!m.levelMemberId)m.levelMemberId=nextLevelMemberId(m.level);
   if(!m.joinedAt)m.joinedAt=new Date().toISOString();
 }
 await save(db);res.json({ok:true,member:memberPublic(m)})
});
app.post('/api/admin/message',async (req,res)=>{if(req.body.to==='all'){db.messages.push({to:'ALL',message:req.body.message,at:new Date().toISOString()})}else{if(!db.members.some(m=>m.memberId===req.body.memberId))return res.status(404).json({error:'Member not found'});db.messages.push({to:req.body.memberId,message:req.body.message,at:new Date().toISOString()})}await save(db);res.json({ok:true})});
app.post('/api/admin/pins/generate',async (req,res)=>{
 const m=db.members.find(x=>x.memberId===req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});
 const n=Math.min(500,Math.max(1,Number(req.body.quantity)||1)),out=[];
 for(let i=0;i<n;i++){let p=pin();while(db.pins.some(x=>x.pin===p))p=pin();const row={pin:p,assignedTo:m.memberId,status:'AVAILABLE',usedBy:null,createdAt:new Date().toISOString()};db.pins.push(row);out.push(row)}
 await save(db);const w=wallet(m.memberId);res.json({pins:out,member:memberPublic(m),available:w.available,used:w.used});
});

app.get('/api/member/profile/:id',async (req,res)=>{
 const m=db.members.find(x=>x.memberId===req.params.id); if(!m)return res.status(404).json({error:'Member not found'});
 res.json({member:memberPublic(m)});
});
app.post('/api/member/profile/:id',async (req,res)=>{
 const m=db.members.find(x=>x.memberId===req.params.id); if(!m)return res.status(404).json({error:'Member not found'});
 if(m.profileSavedAt)return res.status(409).json({error:'Profile already saved. Future changes must be made by Admin.'});
 const b=req.body||{};
 const required=['name','address','nominee','account','ifsc','bank','branch'];
 for(const k of required){if(!String(b[k]||'').trim())return res.status(400).json({error:'Required profile field missing: '+k});}
 m.name=String(b.name).trim();
 m.gender=String(b.gender||'').trim();m.age=String(b.age||'').trim();m.education=String(b.education||'').trim();m.category=String(b.category||'').trim();m.skill=String(b.skill||'').trim();m.address=String(b.address).trim();m.nominee=String(b.nominee).trim();m.account=String(b.account).trim();m.ifsc=String(b.ifsc).trim();m.bank=String(b.bank).trim();m.branch=String(b.branch).trim();
 m.profile={gender:m.gender,age:m.age,education:m.education,category:m.category,skill:m.skill,address:m.address,nominee:m.nominee,account:m.account,ifsc:m.ifsc,bank:m.bank,branch:m.branch};
 m.profileSavedAt=new Date().toISOString(); await save(db); res.json({ok:true,member:memberPublic(m)});
});

app.get('/api/member/referral-info/:id',async (req,res)=>{
 const id=String(req.params.id||'').trim();
 if(!id||id==='FIRST MEMBER')return res.json({valid:id==='FIRST MEMBER',member:null});
 const m=db.members.find(x=>x.memberId===id);
 if(!m)return res.status(404).json({valid:false,error:'Referral ID not found'});
 res.json({valid:true,member:{memberId:m.memberId,name:m.name,mobile:m.mobile,level:Number(m.level||1)}});
});
app.post('/api/member/login',async (req,res)=>{
 const mobile=String(req.body.mobile||'').trim(), password=String(req.body.password||'');
 if(!/^\d{10}$/.test(mobile))return res.status(400).json({error:'Invalid mobile number'});
 const m=db.members.find(x=>x.mobile===mobile);
 if(!m)return res.status(404).json({error:'Member not found. Please register first.'});
 if(!m.passwordHash)return res.status(401).json({error:'Password not set for this member. Admin must reset/set the password.'});
 if(!verifyPassword(password,m.passwordHash))return res.status(401).json({error:'Incorrect password'});
 res.json({member:memberPublic(m)});
});
app.post('/api/member/check-pin',async (req,res)=>{const p=String(req.body.pin||'').toUpperCase();if(!db.pins.some(x=>x.pin===p&&x.status==='AVAILABLE'))return res.status(400).json({error:'Invalid or unavailable Joining PIN'});res.json({ok:true})});
app.post('/api/member/register',async (req,res)=>{
 const b=req.body;
 if(db.members.some(m=>m.mobile===b.mobile))return res.status(409).json({error:'Mobile number already registered'});
 if(String(b.password||'').length<6)return res.status(400).json({error:'Password must be at least 6 characters'});
 const p=String(b.pin||'').toUpperCase(),pr=db.pins.find(x=>x.pin===p&&x.status==='AVAILABLE');
 if(!pr)return res.status(400).json({error:'Invalid or unavailable Joining PIN'});
 if(b.referral!=='FIRST MEMBER'&&!db.members.some(m=>m.memberId===b.referral))return res.status(400).json({error:'Invalid Referral ID'});
 const m={...b,memberId:id(),status:'Pending',registeredAt:new Date().toISOString(),passwordHash:hashPassword(b.password)};
 delete m.pin; delete m.password;db.members.push(m);pr.status='USED';pr.usedBy=m.memberId;pr.usedAt=new Date().toISOString();await save(db);res.json({member:memberPublic(m)});
});
app.get('/api/member/dashboard/:id',async (req,res)=>{
 const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Member not found'});
 const lv=descendants(m.memberId),w=wallet(m.memberId);
 const levels={};for(let i=1;i<=7;i++)levels[i]=lv[i].map(memberPublic);
 const messages=[...db.messages.filter(x=>x.to===m.memberId||x.to==='ALL'),...db.leveltrackMessages.filter(x=>x.to===m.memberId)].sort((a,b)=>String(b.at).localeCompare(String(a.at))).map(x=>({to:x.to,message:x.message,at:x.at}));
 res.json({member:memberPublic(m),levels,tree:tree(m.memberId),wallet:w,messages});
});
app.get('/api/member/level/:id/:level',async (req,res)=>{
 const m=db.members.find(x=>x.memberId===req.params.id),l=Number(req.params.level);if(!m||l<1||l>7)return res.status(404).json({error:'Not found'});
 const lv=descendants(m.memberId);res.json({members:lv[l].map(memberPublic)});
});
app.get('/api/member/messages/:id',async (req,res)=>{
 const id=req.params.id; if(!db.members.some(m=>m.memberId===id))return res.status(404).json({error:'Member not found'});
 const messages=[...db.messages.filter(x=>x.to===id||x.to==='ALL'),...db.leveltrackMessages.filter(x=>x.to===id)].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,100);
 res.json({messages});
});

app.post('/api/member/use-pin',async (req,res)=>{
 const p=db.pins.find(x=>x.assignedTo===req.body.memberId&&x.status==='AVAILABLE');if(!p)return res.status(400).json({error:'No available PIN'});
 p.status='USED';p.usedBy=req.body.memberId;p.usedAt=new Date().toISOString();await save(db);res.json({wallet:wallet(req.body.memberId)});
});


// ---------------- LEVELTRACK SERVER API ----------------
const LEVEL_RULES={
  1:{provide:500,upgrade:1000,self:500,trust:0,required:3},
  2:{provide:1000,upgrade:3000,self:2000,trust:0,required:6},
  3:{provide:3000,upgrade:20000,self:10000,trust:0,required:9},
  4:{provide:20000,upgrade:100000,self:70000,trust:30000,required:12},
  5:{provide:100000,upgrade:200000,self:200000,trust:100000,required:15},
  6:{provide:200000,upgrade:500000,self:300000,trust:200000,required:18},
  7:{provide:500000,upgrade:0,self:1500000,trust:1000000,required:18}
};
function nextLevelMemberId(level){
  const prefix='L'+level+'-';
  const nums=db.members.map(m=>String(m.levelMemberId||'')).filter(x=>x.startsWith(prefix)).map(x=>Number(x.slice(prefix.length))).filter(Number.isFinite);
  return prefix+String((nums.length?Math.max(...nums):0)+1).padStart(3,'0');
}
function ltMember(id){return db.members.find(m=>m.memberId===id)}
function direct(id){return db.members.filter(m=>m.referral===id)}
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
  return db.leveltrackUpgrades.filter(u=>u.memberId===memberId).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).map(u=>({id:u.id,from:u.from,to:u.to,amount:u.amount,utr:u.utr||'',memberPaid:!!u.memberPaid,receiverApproved:!!u.receiverApproved,adminApproved:!!u.adminApproved,date:u.completedAt||u.createdAt}));
}
function ltDashboard(memberId){
  const m=ltMember(memberId); if(!m)return null;
  if(!m.level)m.level=1;
  if(m.status==='Verified'&&!m.levelMemberId)m.levelMemberId=nextLevelMemberId(m.level);
  const requests=db.leveltrackRequests.filter(r=>r.memberId===memberId).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const latestRequest=requests[0]||null;
  const relatedUpgrades=db.leveltrackUpgrades.filter(u=>u.memberId===memberId).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  let upgrade=(latestRequest && db.leveltrackUpgrades.find(u=>u.requestId===latestRequest.id)) || relatedUpgrades[0] || null;
  if(upgrade && latestRequest){ upgrade={...latestRequest,...upgrade}; }
  if(!upgrade && latestRequest && latestRequest.status==='Assigned'){ upgrade={...latestRequest}; }
  const payments=db.leveltrackPayments.filter(p=>p.receiverMemberId===memberId).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const directReferrals=direct(memberId).length;
  const requiredDirectReferrals={1:3,2:6,3:9,4:12,5:15,6:18}[Number(m.level||1)]||0;
  const msgs=[...db.messages.filter(x=>x.to===memberId||x.to==='ALL'),...db.leveltrackMessages.filter(x=>x.to===memberId)].sort((a,b)=>String(b.at).localeCompare(String(a.at))).map(x=>({message:x.message,at:x.at}));
  return {member:memberPublic(m),directReferrals,totalDownline:downlineCount(memberId),tree:ltTree(memberId),upgrade,requests,incomingPayments:payments,history:ltHistory(memberId),requiredDirectReferrals,messages:msgs};
}
app.get('/leveltrack-admin.html',async (req,res)=>res.sendFile(path.join(__dirname,'leveltrack-admin.html')));
app.get('/leveltrack-member.html',async (req,res)=>res.sendFile(path.join(__dirname,'leveltrack-member.html')));
app.get('/api/leveltrack/admin/dashboard',async (req,res)=>{
  const levels={1:0,2:0,3:0,4:0,5:0,6:0,7:0};
  db.members.forEach(m=>{const l=Math.min(7,Math.max(1,Number(m.level||1)));levels[l]++});
  res.json({levels,members:db.members.map(memberPublic),requests:db.leveltrackRequests.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),upgrades:db.leveltrackUpgrades.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),payments:db.leveltrackPayments.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))});
});
app.get('/api/leveltrack/admin/members',async (req,res)=>res.json({members:findMember(req.query.q).map(memberPublic)}));
app.get('/api/leveltrack/admin/member-details/:id',async (req,res)=>{
  const m=ltMember(req.params.id);if(!m)return res.status(404).json({error:'Member not found'});
  res.json({member:memberPublic(m),directReferrals:direct(m.memberId).length,totalDownline:downlineCount(m.memberId),tree:ltTree(m.memberId)});
});
app.post('/api/leveltrack/admin/requests/:id/assign',async (req,res)=>{
  const r=db.leveltrackRequests.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Upgrade request not found'});
  if(r.status!=='Requested')return res.status(400).json({error:'Request is not pending'});
  const m=ltMember(r.memberId);if(!m)return res.status(404).json({error:'Member not found'});
  const amount=Number(req.body.amount||LEVEL_RULES[r.from]?.upgrade||0);if(!amount)return res.status(400).json({error:'Upgrade amount required'});
  Object.assign(r,{status:'Assigned',assignedAt:new Date().toISOString(),payee:req.body.payee||'',accountHolder:req.body.accountHolder||'',payeeId:req.body.payeeId||'',amount,account:req.body.account||'',bank:req.body.bank||'',ifsc:req.body.ifsc||'',upi:req.body.upi||'',adminMessage:req.body.adminMessage||''});
  let u=db.leveltrackUpgrades.find(x=>x.requestId===r.id);if(!u){u={id:'LTU-'+crypto.randomBytes(4).toString('hex').toUpperCase(),requestId:r.id,memberId:m.memberId,from:r.from,to:r.to,createdAt:new Date().toISOString()};db.leveltrackUpgrades.push(u)}
  Object.assign(u,{amount,payee:r.payee,accountHolder:r.accountHolder||'',payeeId:r.payeeId,account:r.account,bank:r.bank,ifsc:r.ifsc,upi:r.upi,adminMessage:r.adminMessage||'',detailsSent:true,detailsSentAt:new Date().toISOString()});
  db.leveltrackMessages.push({to:m.memberId,message:`LevelTrack payment details sent for L${r.from} → L${r.to}. Amount ₹${amount.toLocaleString()}.`,at:new Date().toISOString()});await save(db);res.json({ok:true,request:r,upgrade:{...r,...u}});
});
app.post('/api/leveltrack/admin/payments/:id/verify',async (req,res)=>{
  const p=db.leveltrackPayments.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Payment not found'});
  if(!p.memberAccepted)return res.status(400).json({error:'Receiver has not accepted the payment'});
  p.adminApproved=true;p.adminVerifiedAt=new Date().toISOString();
  const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);if(u){u.receiverApproved=true;}
  await save(db);res.json({ok:true,payment:p});
});
app.post('/api/leveltrack/admin/upgrades/:id/final-approve',async (req,res)=>{
  const u=db.leveltrackUpgrades.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'Upgrade not found'});
  const p=db.leveltrackPayments.find(x=>x.upgradeId===u.id);if(!u.memberPaid||!u.receiverApproved||!p?.adminApproved)return res.status(400).json({error:'Payment must be paid, accepted and admin verified first'});
  const m=ltMember(u.memberId);if(!m)return res.status(404).json({error:'Member not found'});
  if(Number(m.level)!==Number(u.from))return res.status(400).json({error:'Member level changed already'});
  m.level=Number(u.to);m.levelMemberId=nextLevelMemberId(m.level);m.upgradeDate=new Date().toISOString();m.status='Verified';u.adminApproved=true;u.completedAt=new Date().toISOString();
  const r=db.leveltrackRequests.find(x=>x.id===u.requestId);if(r)r.status='Completed';
  db.leveltrackMessages.push({to:m.memberId,message:`Level upgrade completed. You are now Level ${m.level}.`,at:new Date().toISOString()});await save(db);res.json({ok:true,member:memberPublic(m),upgrade:u});
});
app.get('/api/leveltrack/admin/daily-report',async (req,res)=>{
  const date=String(req.query.date||new Date().toISOString().slice(0,10));
  const upgrades=db.leveltrackUpgrades.filter(u=>u.adminApproved&&String(u.completedAt||'').slice(0,10)===date).map(u=>({from:u.from,to:u.to,amount:u.amount,date:String(u.completedAt).slice(0,10),member:memberPublic(ltMember(u.memberId))}));
  res.json({date,count:upgrades.length,upgrades});
});
app.get('/api/leveltrack/member/dashboard/:id',async (req,res)=>{
  const d=ltDashboard(req.params.id);if(!d)return res.status(404).json({error:'Member not found'});await save(db);res.json(d);
});
app.post('/api/leveltrack/member/upgrade-request',async (req,res)=>{
  const m=ltMember(req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});
  const from=Number(m.level||1),to=from+1;if(from>=7)return res.status(400).json({error:'Level 7 is the final level'});
  const pending=db.leveltrackRequests.find(r=>r.memberId===m.memberId&&r.status!=='Completed');if(pending)return res.status(400).json({error:'Upgrade request already pending'});
  const r={id:'LTR-'+crypto.randomBytes(4).toString('hex').toUpperCase(),memberId:m.memberId,from,to,status:'Requested',date:new Date().toISOString().slice(0,10),createdAt:new Date().toISOString()};db.leveltrackRequests.push(r);db.leveltrackMessages.push({to:'ADMIN',message:`New LevelTrack upgrade request: ${m.name} — L${from} → L${to}.`,at:new Date().toISOString()});await save(db);res.json({ok:true,request:r});
});
app.post('/api/leveltrack/member/upgrade/:id/pay',async (req,res)=>{
  const u=db.leveltrackUpgrades.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'Upgrade not found'});
  if(u.memberId!==req.body.memberId)return res.status(403).json({error:'Not your upgrade'});
  const utr=String(req.body.utr||'').trim();if(!utr)return res.status(400).json({error:'UTR required'});
  u.memberPaid=true;u.utr=utr;u.paidAt=new Date().toISOString();
  let p=db.leveltrackPayments.find(x=>x.upgradeId===u.id);if(!p){p={id:'LTP-'+crypto.randomBytes(4).toString('hex').toUpperCase(),upgradeId:u.id,fromMemberId:u.memberId,receiverMemberId:u.payeeId,from:ltMember(u.memberId)?.name||u.memberId,to:u.payee||u.payeeId,amount:u.amount,utr,memberAccepted:false,adminApproved:false,createdAt:new Date().toISOString()};db.leveltrackPayments.push(p)} else {p.utr=utr;p.memberPaid=true;}
  db.leveltrackMessages.push({to:u.payeeId,message:`Payment received for L${u.from} → L${u.to}. Please accept the payment.`,at:new Date().toISOString()});await save(db);res.json({ok:true,upgrade:u,payment:p});
});
app.post('/api/leveltrack/member/incoming/:id/accept',async (req,res)=>{
  const p=db.leveltrackPayments.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Payment not found'});
  if(p.receiverMemberId!==req.body.memberId)return res.status(403).json({error:'Not your payment'});
  p.memberAccepted=true;p.acceptedAt=new Date().toISOString();const u=db.leveltrackUpgrades.find(x=>x.id===p.upgradeId);if(u)u.receiverApproved=true;await save(db);res.json({ok:true,payment:p});
});
app.get('/api/leveltrack/member/messages/:id',async (req,res)=>{
  const msgs=[...db.messages.filter(x=>x.to===req.params.id||x.to==='ALL').map(x=>({message:x.message,at:x.at})),...db.leveltrackMessages.filter(x=>x.to===req.params.id).map(x=>({message:x.message,at:x.at}))].sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  res.json({messages:msgs});
});

app.post('/api/admin/backup/export',async (req,res)=>{
  if(String(req.body?.password||'')!==String(db.adminPassword||'')) return res.status(401).json({error:'Admin password required'});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  res.setHeader('Content-Disposition',`attachment; filename=borntown5-backup-${stamp}.json`);
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.send(JSON.stringify({...db,exportedAt:new Date().toISOString()},null,2));
});

app.get('/api/health',async (req,res)=>res.json({ok:true,service:'BORNTOWIN5',schemaVersion:db.schemaVersion||2,dataStore:pgPool?'postgresql':'local-file',members:db.members.length,pins:db.pins.length,messages:db.messages.length,leveltrackRequests:db.leveltrackRequests.length,leveltrackPayments:db.leveltrackPayments.length}));

const PORT=process.env.PORT||10000;
boot().then(()=>{app.listen(PORT,'0.0.0.0',()=>console.log('BORNTOWIN5 running on '+PORT));}).catch(err=>{console.error('BORNTOWIN5 startup failed',err);process.exit(1);});
