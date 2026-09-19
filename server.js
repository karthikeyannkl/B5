const express=require('express');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const app=express();
app.use(express.json({limit:'2mb'}));
app.use(express.static(__dirname));

const DB_FILE=path.join(__dirname,'data','db.json');
fs.mkdirSync(path.dirname(DB_FILE),{recursive:true});
function freshDB(){return {adminPassword:'ADMIN',members:[],pins:[],messages:[],levelTrack:{upgrades:{},history:[]}};}
function load(){try{return JSON.parse(fs.readFileSync(DB_FILE,'utf8'))}catch(e){const d=freshDB();save(d);return d}}
function save(d){fs.writeFileSync(DB_FILE,JSON.stringify(d,null,2))}
let db=load();
if(!db.levelTrack) db.levelTrack={upgrades:{},history:[]};
if(!db.levelTrack.upgrades) db.levelTrack.upgrades={};
if(!db.levelTrack.history) db.levelTrack.history=[];
function ensureMember(m){if(!m)return m;if(!Number.isInteger(Number(m.currentLevel))||Number(m.currentLevel)<1)m.currentLevel=1;return m}
db.members.forEach(ensureMember);
save(db);

function id(){return 'B5-'+crypto.randomBytes(3).toString('hex').toUpperCase()}
function pin(){return 'B5-'+crypto.randomBytes(3).toString('hex').toUpperCase()}
function memberPublic(m){ensureMember(m);return {memberId:m.memberId,name:m.name,mobile:m.mobile,status:m.status,referral:m.referral,currentLevel:Number(m.currentLevel||1)}}
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
 const total=db.members.length,pending=db.members.filter(m=>m.status==='Pending').length,verified=db.members.filter(m=>m.status==='Verified').length;
 const report=db.members.map(m=>{const w=wallet(m.memberId);return {name:m.name,memberId:m.memberId,received:w.received,used:w.used,available:w.available}});
 res.json({total,pending,verified,members:db.members.map(memberPublic),pinReport:report});
});
app.get('/api/admin/members',(req,res)=>res.json({members:findMember(req.query.q).map(memberPublic)}));
app.post('/api/admin/member-status',(req,res)=>{const m=db.members.find(x=>x.memberId===req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});m.status=req.body.status;save(db);res.json({ok:true,member:memberPublic(m)})});
app.post('/api/admin/message',(req,res)=>{if(req.body.to==='all'){db.messages.push({to:'ALL',message:req.body.message,at:new Date().toISOString()})}else{if(!db.members.some(m=>m.memberId===req.body.memberId))return res.status(404).json({error:'Member not found'});db.messages.push({to:req.body.memberId,message:req.body.message,at:new Date().toISOString()})}save(db);res.json({ok:true})});
app.get('/api/member/messages/:id',(req,res)=>{const id=req.params.id;if(!db.members.some(m=>m.memberId===id))return res.status(404).json({error:'Member not found'});res.json({messages:db.messages.filter(x=>x.to==='ALL'||x.to===id).slice(-100).reverse()})});
app.post('/api/admin/pins/generate',(req,res)=>{
 const m=db.members.find(x=>x.memberId===req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});
 const n=Math.min(500,Math.max(1,Number(req.body.quantity)||1)),out=[];
 for(let i=0;i<n;i++){let p=pin();while(db.pins.some(x=>x.pin===p))p=pin();const row={pin:p,assignedTo:m.memberId,status:'AVAILABLE',usedBy:null,createdAt:new Date().toISOString()};db.pins.push(row);out.push(row)}
 save(db);const w=wallet(m.memberId);res.json({pins:out,member:memberPublic(m),available:w.available,used:w.used});
});

app.post('/api/member/send-otp',(req,res)=>{if(!/^\d{10}$/.test(String(req.body.mobile||'')))return res.status(400).json({error:'Invalid mobile number'});res.json({ok:true,otp:'123456'})});
app.post('/api/member/login',(req,res)=>{const m=db.members.find(x=>x.mobile===req.body.mobile);if(req.body.otp!=='123456')return res.status(401).json({error:'OTP சரியாக இல்லை'});if(!m)return res.status(404).json({error:'Member not found. Please register first.'});res.json({member:memberPublic(m)})});
app.post('/api/member/check-pin',(req,res)=>{const p=String(req.body.pin||'').toUpperCase();if(!db.pins.some(x=>x.pin===p&&x.status==='AVAILABLE'))return res.status(400).json({error:'Invalid or unavailable Joining PIN'});res.json({ok:true})});
app.post('/api/member/register',(req,res)=>{
 const b=req.body;
 if(db.members.some(m=>m.mobile===b.mobile))return res.status(409).json({error:'Mobile number already registered'});
 const p=String(b.pin||'').toUpperCase(),pr=db.pins.find(x=>x.pin===p&&x.status==='AVAILABLE');
 if(!pr)return res.status(400).json({error:'Invalid or unavailable Joining PIN'});
 if(b.referral!=='FIRST MEMBER'&&!db.members.some(m=>m.memberId===b.referral))return res.status(400).json({error:'Invalid Referral ID'});
 const m={...b,memberId:id(),status:'Pending',currentLevel:1,registeredAt:new Date().toISOString()};
 delete m.pin;db.members.push(m);pr.status='USED';pr.usedBy=m.memberId;pr.usedAt=new Date().toISOString();save(db);res.json({member:memberPublic(m)});
});
app.get('/api/member/dashboard/:id',(req,res)=>{
 const m=db.members.find(x=>x.memberId===req.params.id);if(!m)return res.status(404).json({error:'Member not found'});
 const lv=descendants(m.memberId),w=wallet(m.memberId);
 const levels={};for(let i=1;i<=7;i++)levels[i]=lv[i].map(memberPublic);
 res.json({member:memberPublic(m),levels,tree:tree(m.memberId),wallet:w});
});
app.get('/api/member/level/:id/:level',(req,res)=>{
 const m=db.members.find(x=>x.memberId===req.params.id),l=Number(req.params.level);if(!m||l<1||l>7)return res.status(404).json({error:'Not found'});
 const lv=descendants(m.memberId);res.json({members:lv[l].map(memberPublic)});
});
app.post('/api/member/use-pin',(req,res)=>{
 const p=db.pins.find(x=>x.assignedTo===req.body.memberId&&x.status==='AVAILABLE');if(!p)return res.status(400).json({error:'No available PIN'});
 p.status='USED';p.usedBy=req.body.memberId;p.usedAt=new Date().toISOString();save(db);res.json({wallet:wallet(req.body.memberId)});
});
// ---------------- LevelTrack server module ----------------
const LEVEL_MILESTONES={1:3,2:6,3:9,4:12,5:15,6:18};
function directRefs(memberId){return db.members.filter(m=>m.referral===memberId).map(memberPublic)}
function getUpgrade(memberId){return db.levelTrack.upgrades[memberId]||null}
function memberWithLT(memberId){const m=db.members.find(x=>x.memberId===memberId);if(!m)return null;ensureMember(m);return m}
function ltPublicUpgrade(u){if(!u)return null;return {from:u.from,to:u.to,payerMemberId:u.payerMemberId,payment:u.payment?{receiverName:u.payment.receiverName,receiverMemberId:u.payment.receiverMemberId,receiverPhone:u.payment.receiverPhone,accountHolder:u.payment.accountHolder,bankName:u.payment.bankName,accountNumber:u.payment.accountNumber,ifsc:u.payment.ifsc,upi:u.payment.upi,amount:u.payment.amount,message:u.payment.message}:null,utr:u.utr||'',receiverConfirmed:!!u.receiverConfirmed,requestedAt:u.requestedAt}}
function ltHistoryFor(id){return db.levelTrack.history.filter(x=>x.payerMemberId===id||x.receiverMemberId===id).slice().reverse()}
app.get('/leveltrack-member.html',(req,res)=>res.sendFile(path.join(__dirname,'leveltrack-member.html')));
app.get('/leveltrack-admin.html',(req,res)=>res.sendFile(path.join(__dirname,'leveltrack-admin.html')));
app.get('/api/member/leveltrack/:id',(req,res)=>{const m=memberWithLT(req.params.id);if(!m)return res.status(404).json({error:'Member not found'});const refs=directRefs(m.memberId);res.json({member:memberPublic(m),directReferrals:refs,upgrade:ltPublicUpgrade(getUpgrade(m.memberId)),upgradeHistory:ltHistoryFor(m.memberId),paymentHistory:db.levelTrack.history.filter(x=>x.receiverMemberId===m.memberId).slice().reverse()})});
app.post('/api/member/leveltrack/request',(req,res)=>{const m=memberWithLT(req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});const level=Number(m.currentLevel||1);if(level>=7)return res.status(400).json({error:'Level 7 is the final level'});if(getUpgrade(m.memberId))return res.status(400).json({error:'An upgrade request is already active'});const need=LEVEL_MILESTONES[level];const count=directRefs(m.memberId).length;if(count<need)return res.status(400).json({error:`Need ${need-count} more direct referrals`});const u={from:level,to:level+1,payerMemberId:m.memberId,payment:null,utr:'',receiverConfirmed:false,requestedAt:new Date().toISOString()};db.levelTrack.upgrades[m.memberId]=u;save(db);res.json({ok:true,upgrade:ltPublicUpgrade(u)})});
app.get('/api/admin/leveltrack/members',(req,res)=>{const q=String(req.query.q||'').toLowerCase();const members=db.members.filter(m=>!q||(m.name+' '+m.memberId+' '+m.mobile).toLowerCase().includes(q)).map(m=>{ensureMember(m);return {...memberPublic(m),directReferrals:directRefs(m.memberId).length,hasUpgrade:!!getUpgrade(m.memberId)}});res.json({members})});
app.get('/api/admin/leveltrack/member/:id',(req,res)=>{const m=memberWithLT(req.params.id);if(!m)return res.status(404).json({error:'Member not found'});res.json({member:memberPublic(m),directReferrals:directRefs(m.memberId).length,upgrade:ltPublicUpgrade(getUpgrade(m.memberId)),history:ltHistoryFor(m.memberId)})});
app.post('/api/admin/leveltrack/payment',(req,res)=>{const m=memberWithLT(req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});const u=getUpgrade(m.memberId);if(!u)return res.status(400).json({error:'No active upgrade request'});if(u.payment)return res.status(400).json({error:'Payment details already sent'});const rid=String(req.body.receiverMemberId||'').trim();const receiver=db.members.find(x=>x.memberId===rid);if(!receiver)return res.status(404).json({error:'Receiver Member ID not found'});u.payment={receiverName:String(req.body.receiverName||receiver.name).trim(),receiverMemberId:rid,receiverPhone:String(req.body.receiverPhone||receiver.mobile).trim(),accountHolder:String(req.body.accountHolder||'').trim(),bankName:String(req.body.bankName||'').trim(),accountNumber:String(req.body.accountNumber||'').trim(),ifsc:String(req.body.ifsc||'').trim(),upi:String(req.body.upi||'').trim(),amount:String(req.body.amount||'').trim(),message:String(req.body.message||'').trim()};save(db);res.json({ok:true,upgrade:ltPublicUpgrade(u)})});
app.post('/api/member/leveltrack/utr',(req,res)=>{const m=memberWithLT(req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});const u=getUpgrade(m.memberId);if(!u||!u.payment)return res.status(400).json({error:'Admin payment details are required first'});const utr=String(req.body.utr||'').trim();if(!utr)return res.status(400).json({error:'UTR is required'});u.utr=utr;save(db);res.json({ok:true})});
app.get('/api/member/leveltrack/receiver/:id',(req,res)=>{const id=req.params.id;const incoming=Object.entries(db.levelTrack.upgrades).map(([payer,u])=>({payer,u})).find(x=>x.u.payment&&x.u.payment.receiverMemberId===id&&x.u.utr&&!x.u.receiverConfirmed);if(!incoming)return res.json({payment:null});res.json({payment:{payerMemberId:incoming.u.payerMemberId,from:incoming.u.from,to:incoming.u.to,amount:incoming.u.payment.amount,utr:incoming.u.utr}})});
app.post('/api/member/leveltrack/receiver',(req,res)=>{const id=req.body.memberId;const incoming=Object.entries(db.levelTrack.upgrades).map(([payer,u])=>({payer,u})).find(x=>x.u.payment&&x.u.payment.receiverMemberId===id&&x.u.utr&&!x.u.receiverConfirmed);if(!incoming)return res.status(404).json({error:'No incoming payment waiting for confirmation'});if(req.body.action==='CONFIRM')incoming.u.receiverConfirmed=true;else if(req.body.action==='REJECT')incoming.u.receiverConfirmed=false;else return res.status(400).json({error:'Invalid action'});save(db);res.json({ok:true})});
app.post('/api/admin/leveltrack/final-approve',(req,res)=>{const m=memberWithLT(req.body.memberId);if(!m)return res.status(404).json({error:'Member not found'});const u=getUpgrade(m.memberId);if(!u||!u.payment||!u.utr||!u.receiverConfirmed)return res.status(400).json({error:'Payment, UTR and receiver confirmation are required'});const receiver=memberWithLT(u.payment.receiverMemberId);if(!receiver)return res.status(404).json({error:'Receiver not found'});const history={from:u.from,to:u.to,payerMemberId:u.payerMemberId,receiverMemberId:u.payment.receiverMemberId,amount:u.payment.amount,utr:u.utr,status:'COMPLETED',at:new Date().toISOString()};db.levelTrack.history.push(history);m.currentLevel=u.to;delete db.levelTrack.upgrades[m.memberId];save(db);res.json({ok:true,member:memberPublic(m),history})});
app.get('/api/admin/leveltrack/summary',(req,res)=>{const levels={1:0,2:0,3:0,4:0,5:0,6:0,7:0};db.members.forEach(m=>{ensureMember(m);levels[m.currentLevel]=(levels[m.currentLevel]||0)+1});const pending=Object.values(db.levelTrack.upgrades).length;res.json({levels,pending})});
const PORT=process.env.PORT||10000;
app.listen(PORT,'0.0.0.0',()=>console.log('BORNTOWIN5 running on '+PORT));
