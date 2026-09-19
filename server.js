const express=require('express');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const app=express();
app.use(express.json({limit:'2mb'}));
app.use(express.static(__dirname));

const DB_FILE=path.join(__dirname,'data','db.json');
fs.mkdirSync(path.dirname(DB_FILE),{recursive:true});
function freshDB(){return {adminPassword:'ADMIN',members:[],pins:[],messages:[],levelTrack:{upgrades:[],history:[]}};}
function load(){try{return JSON.parse(fs.readFileSync(DB_FILE,'utf8'))}catch(e){const d=freshDB();save(d);return d}}
function save(d){fs.writeFileSync(DB_FILE,JSON.stringify(d,null,2))}
let db=load();
// Backward-compatible migration for existing databases.
db.messages=db.messages||[];db.pins=db.pins||[];db.members=db.members||[];db.levelTrack=db.levelTrack||{};db.levelTrack.upgrades=db.levelTrack.upgrades||[];db.levelTrack.history=db.levelTrack.history||[];
db.members.forEach(m=>{if(!m.level)m.level=1});save(db);

function id(){return 'B5-'+crypto.randomBytes(3).toString('hex').toUpperCase()}
function pin(){return 'B5-'+crypto.randomBytes(3).toString('hex').toUpperCase()}
function uid(prefix='UP'){return prefix+'-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(2).toString('hex').toUpperCase()}
function memberPublic(m){return {memberId:m.memberId,name:m.name,mobile:m.mobile,status:m.status,referral:m.referral,level:Number(m.level||1),registeredAt:m.registeredAt||null}}
function findMember(q){q=String(q||'').toLowerCase();return db.members.filter(m=>(m.name+' '+m.memberId+' '+m.mobile).toLowerCase().includes(q))}
function descendants(rootId){
 let levels={1:[],2:[],3:[],4:[],5:[],6:[],7:[]}, current=[rootId];
 for(let l=1;l<=7;l++){const next=db.members.filter(m=>current.includes(m.referral)).map(m=>m.memberId);levels[l]=db.members.filter(m=>next.includes(m.memberId));current=next;if(!current.length)break}
 return levels;
}
function tree(rootId){
 const root=db.members.find(m=>m.memberId===rootId);if(!root)return {name:'நீங்கள்',id:'Not Registered',children:[]};
 const kids=(id)=>db.members.filter(m=>m.referral===id).map(m=>({name:m.name,id:m.memberId,children:kids(m.memberId)}));
 return {name:root.name,id:root.memberId,children:kids(root.memberId)};
}
function wallet(memberId){const ps=db.pins.filter(p=>p.assignedTo===memberId);return {received:ps.length,used:ps.filter(p=>p.status==='USED').length,available:ps.filter(p=>p.status==='AVAILABLE').length,pins:ps.slice(-50)}}
function directRefs(memberId){return db.members.filter(m=>m.referral===memberId)}
const milestones={1:3,2:6,3:9,4:12,5:15,6:18};
function nextLevelInfo(m){const level=Number(m.level||1);if(level>=7)return {nextLevel:null,need:null,eligible:false};const need=milestones[level];const count=directRefs(m.memberId).length;return {nextLevel:level+1,need,count,eligible:count>=need}}
function findUpgrade(id){return db.levelTrack.upgrades.find(u=>u.id===id)}
function activeUpgradeForMember(memberId){return db.levelTrack.upgrades.find(u=>u.payerMemberId===memberId)}
function upgradeStatus(u){if(!u)return null;if(!u.payment)return 'REQUEST SENT — WAITING FOR ADMIN PAYMENT DETAILS';if(!u.utr)return 'PAYMENT DETAILS SENT — WAITING FOR UTR';if(!u.receiverConfirmed)return 'UTR SUBMITTED — WAITING FOR RECEIVER CONFIRMATION';return 'RECEIVER CONFIRMED — WAITING FOR ADMIN FINAL APPROVAL'}

app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'member.html')));
app.get('/member.html',(req,res)=>res.sendFile(path.join(__dirname,'member.html')));
app.get('/admin.html',(req,res)=>res.sendFile(path.join(__dirname,'admin.html')));

app.post('/api/admin/login',(req,res)=>{if(req.body.password!==db.adminPassword)return res.status(401).json({error:'Incorrect password'});res.json({ok:true})});
app.post('/api/admin/password',(req,res)=>{if(req.body.oldPassword!==db.adminPassword)return res.status(401).json({error:'Current password is incorrect'});db.adminPassword=String(req.body.newPassword||'');save(db);res.json({ok:true})});
app.get('/api/admin/dashboard',(req,res)=>{const total=db.members.length,pending=db.members.filter(m=>m.status==='Pending').length,verified=db.members.filter(m=>m.status==='Verified'||m.status==='ACTIVE').length;const report=db.members.map(m=>{const w=wallet(m.memberId);return {name:m.name,memberId:m.memberId,received:w.received,used:w.used,available:w.available}});res.json({total,pending,verified,members:db.members.map(memberPublic),pinReport:report})});
app.get('/api/admin/members',(req,res)=>res.json({members:findMember(req.query.q).map(memberPublic)}));
app.post('/api/admin/member-status',(req,res)=>{const m=db.members.find(x=>x.memberId===req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});m.status=req.body.status;save(db);res.json({ok:true,member:memberPublic(m)})});
app.get('/api/admin/member-details/:id',(req,res)=>{const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Member not found'});const refs=directRefs(m.memberId);res.json({member:m,directReferrals:refs.map(memberPublic),downline:tree(m.memberId)})});
app.post('/api/admin/message',(req,res)=>{const msg=String(req.body.message||'').trim();if(!msg)return res.status(400).json({error:'Message required'});if(req.body.to==='all'){db.messages.push({to:'ALL',message:msg,at:new Date().toISOString()})}else{if(!db.members.some(m=>m.memberId===req.body.memberId))return res.status(404).json({error:'Member not found'});db.messages.push({to:req.body.memberId,message:msg,at:new Date().toISOString()})}save(db);res.json({ok:true})});
app.post('/api/admin/pins/generate',(req,res)=>{const m=db.members.find(x=>x.memberId===req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});const n=Math.min(500,Math.max(1,Number(req.body.quantity)||1)),out=[];for(let i=0;i<n;i++){let p=pin();while(db.pins.some(x=>x.pin===p))p=pin();const row={pin:p,assignedTo:m.memberId,status:'AVAILABLE',usedBy:null,createdAt:new Date().toISOString()};db.pins.push(row);out.push(row)}save(db);const w=wallet(m.memberId);res.json({pins:out,member:memberPublic(m),available:w.available,used:w.used})});

app.post('/api/member/send-otp',(req,res)=>{if(!/^\d{10}$/.test(String(req.body.mobile||'')))return res.status(400).json({error:'Invalid mobile number'});res.json({ok:true,otp:'123456'})});
app.post('/api/member/login',(req,res)=>{const m=db.members.find(x=>x.mobile===req.body.mobile);if(req.body.otp!=='123456')return res.status(401).json({error:'OTP சரியாக இல்லை'});if(!m)return res.status(404).json({error:'Member not found. Please register first.'});res.json({member:memberPublic(m)})});
app.post('/api/member/check-pin',(req,res)=>{const p=String(req.body.pin||'').toUpperCase();if(!db.pins.some(x=>x.pin===p&&x.status==='AVAILABLE'))return res.status(400).json({error:'Invalid or unavailable Joining PIN'});res.json({ok:true})});
app.post('/api/member/register',(req,res)=>{const b=req.body;if(db.members.some(m=>m.mobile===b.mobile))return res.status(409).json({error:'Mobile number already registered'});const p=String(b.pin||'').toUpperCase(),pr=db.pins.find(x=>x.pin===p&&x.status==='AVAILABLE');if(!pr)return res.status(400).json({error:'Invalid or unavailable Joining PIN'});if(b.referral!=='FIRST MEMBER'&&!db.members.some(m=>m.memberId===b.referral))return res.status(400).json({error:'Invalid Referral ID'});const m={...b,memberId:id(),status:'Pending',level:1,registeredAt:new Date().toISOString()};delete m.pin;db.members.push(m);pr.status='USED';pr.usedBy=m.memberId;pr.usedAt=new Date().toISOString();save(db);res.json({member:memberPublic(m)})});
app.get('/api/member/referral-info/:id',(req,res)=>{const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Referral ID not found'});res.json({member:memberPublic(m)})});
app.get('/api/member/messages/:id',(req,res)=>{const id=req.params.id;if(!db.members.some(m=>m.memberId===id))return res.status(404).json({error:'Member not found'});const messages=db.messages.filter(x=>x.to==='ALL'||x.to===id).sort((a,b)=>new Date(a.at)-new Date(b.at));res.json({messages})});
app.get('/api/member/dashboard/:id',(req,res)=>{const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Member not found'});const lv=descendants(m.memberId),w=wallet(m.memberId);const levels={};for(let i=1;i<=7;i++)levels[i]=lv[i].map(memberPublic);res.json({member:memberPublic(m),levels,tree:tree(m.memberId),wallet:w})});
app.get('/api/member/level/:id/:level',(req,res)=>{const m=db.members.find(x=>x.memberId===req.params.id),l=Number(req.params.level);if(!m||l<1||l>7)return res.status(404).json({error:'Not found'});const lv=descendants(m.memberId);res.json({members:lv[l].map(memberPublic)})});
app.post('/api/member/use-pin',(req,res)=>{const p=db.pins.find(x=>x.assignedTo===req.body.memberId&&x.status==='AVAILABLE');if(!p)return res.status(400).json({error:'No available PIN'});p.status='USED';p.usedBy=req.body.memberId;p.usedAt=new Date().toISOString();save(db);res.json({wallet:wallet(req.body.memberId)})});

// ================= V26 SERVER DYNAMIC LEVEL TRACKING =================
app.get('/api/member/leveltrack/:id',(req,res)=>{
 const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Member not found'});
 const info=nextLevelInfo(m), u=activeUpgradeForMember(m.memberId);
 const incoming=db.levelTrack.upgrades.find(x=>x.payment&&x.payment.receiverMemberId===m.memberId&&x.utr);
 const history=db.levelTrack.history.filter(x=>x.payerMemberId===m.memberId||x.receiverMemberId===m.memberId);
 const earnings=db.levelTrack.history.filter(x=>x.receiverMemberId===m.memberId).map(x=>({level:x.to,fromMemberId:x.payerMemberId,amount:x.payment?.amount||'',status:'COMPLETED',utr:x.utr||''}));
 res.json({member:memberPublic(m),directReferralCount:directRefs(m.memberId).length,need:info.need,nextLevel:info.nextLevel,eligible:info.eligible,directReferrals:directRefs(m.memberId).map(memberPublic),upgrade:u?{...u,status:upgradeStatus(u)}:null,incoming:incoming?{...incoming,status:upgradeStatus(incoming)}:null,history,earnings});
});
app.post('/api/member/leveltrack/request',(req,res)=>{
 const m=db.members.find(x=>x.memberId===req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});
 if(activeUpgradeForMember(m.memberId))return res.status(409).json({error:'An upgrade request is already active'});
 const info=nextLevelInfo(m);if(!info.eligible)return res.status(400).json({error:'Referral milestone not completed'});
 const u={id:uid(),payerMemberId:m.memberId,payerName:m.name,from:Number(m.level||1),to:info.nextLevel,directReferralCount:info.count,createdAt:new Date().toISOString(),payment:null,utr:'',receiverConfirmed:false,status:'REQUEST SENT — WAITING FOR ADMIN PAYMENT DETAILS'};
 db.levelTrack.upgrades.push(u);save(db);res.json({ok:true,upgrade:u});
});
app.post('/api/admin/leveltrack/payment-details',(req,res)=>{
 const u=findUpgrade(req.body.upgradeId);if(!u)return res.status(404).json({error:'Upgrade request not found'});
 const r=db.members.find(x=>x.memberId===req.body.receiverMemberId);if(!r)return res.status(404).json({error:'Receiver Member ID not found'});
 if(u.payment)return res.status(409).json({error:'Payment details already sent'});
 u.payment={receiverName:r.name,receiverMemberId:r.memberId,receiverPhone:r.mobile,accountHolder:String(req.body.accountHolder||''),bankName:String(req.body.bankName||''),accountNumber:String(req.body.accountNumber||''),ifsc:String(req.body.ifsc||''),upi:String(req.body.upi||''),amount:String(req.body.amount||''),adminMessage:String(req.body.adminMessage||'')};
 u.status=upgradeStatus(u);save(db);res.json({ok:true,upgrade:u});
});
app.post('/api/member/leveltrack/utr',(req,res)=>{
 const u=findUpgrade(req.body.upgradeId);if(!u)return res.status(404).json({error:'Upgrade request not found'});if(u.payerMemberId!==req.body.memberId)return res.status(403).json({error:'Not authorized'});if(!u.payment)return res.status(400).json({error:'Admin payment details are required first'});const utr=String(req.body.utr||'').trim();if(!utr)return res.status(400).json({error:'UTR required'});u.utr=utr;u.status=upgradeStatus(u);save(db);res.json({ok:true,upgrade:u});
});
app.post('/api/member/leveltrack/receiver-confirm',(req,res)=>{
 const u=findUpgrade(req.body.upgradeId);if(!u)return res.status(404).json({error:'Upgrade request not found'});if(!u.payment||u.payment.receiverMemberId!==req.body.receiverMemberId)return res.status(403).json({error:'Receiver not authorized'});if(!u.utr)return res.status(400).json({error:'UTR not submitted yet'});u.receiverConfirmed=true;u.status=upgradeStatus(u);save(db);res.json({ok:true,upgrade:u});
});
app.post('/api/member/leveltrack/receiver-reject',(req,res)=>{
 const u=findUpgrade(req.body.upgradeId);if(!u)return res.status(404).json({error:'Upgrade request not found'});if(!u.payment||u.payment.receiverMemberId!==req.body.receiverMemberId)return res.status(403).json({error:'Receiver not authorized'});u.receiverConfirmed=false;u.status='PAYMENT NOT RECEIVED — WAITING FOR CORRECTION';save(db);res.json({ok:true,upgrade:u});
});
app.get('/api/admin/leveltrack',(req,res)=>{
 const requests=db.levelTrack.upgrades.filter(u=>!db.levelTrack.history.some(h=>h.upgradeId===u.id)).map(u=>({...u,status:upgradeStatus(u),receiverMemberId:u.payment?.receiverMemberId||null,payment:u.payment||null}));
 res.json({requests,history:db.levelTrack.history});
});
app.post('/api/admin/leveltrack/final-approve',(req,res)=>{
 const u=findUpgrade(req.body.upgradeId);if(!u)return res.status(404).json({error:'Upgrade request not found'});if(!u.payment||!u.utr||!u.receiverConfirmed)return res.status(400).json({error:'Payment details, UTR and receiver confirmation are required'});
 const m=db.members.find(x=>x.memberId===u.payerMemberId);if(!m)return res.status(404).json({error:'Payer member not found'});
 if(Number(m.level)!==Number(u.from))return res.status(409).json({error:'Member level has already changed'});
 m.level=Number(u.to);m.status='ACTIVE';
 const history={upgradeId:u.id,payerMemberId:u.payerMemberId,receiverMemberId:u.payment.receiverMemberId,from:u.from,to:u.to,payment:u.payment,utr:u.utr,approvedAt:new Date().toISOString()};
 db.levelTrack.history.push(history);db.levelTrack.upgrades=db.levelTrack.upgrades.filter(x=>x.id!==u.id);save(db);res.json({ok:true,member:memberPublic(m),history});
});
// ================= END V26 =================

const PORT=process.env.PORT||10000;
app.listen(PORT,'0.0.0.0',()=>console.log('BORNTOWIN5 running on '+PORT));
