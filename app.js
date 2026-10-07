import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onIdTokenChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile, sendEmailVerification, sendPasswordResetEmail, reload, getIdToken } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, collection, getDoc, setDoc, updateDoc, onSnapshot,
  query, where, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
auth.languageCode='he';
const ADMIN_EMAIL='elishastrick613@gmail.com';
let access=false,profile=null,generation=0,saving=false,registerMode=false,saveFeedback=null,homeSaved=false;
function saveContext(){return JSON.stringify([auth.currentUser?.uid,$('class').value,$('date').value,$('lesson').value,subjectValue()])}
function saveStatus(){return saving?'שומר…':saveFeedback?.context===saveContext()?saveFeedback.text:''}
let ownSubscription=null,studentSubscription=null,recordSubscription=null,teacherSubscription=null;
let studentsReady=false,recordsReady=false,weekKey='',teachers=[];
function isAdmin(){return auth.currentUser?.emailVerified&&auth.currentUser.email===ADMIN_EMAIL}
function friendly(error){
 const messages={
 'auth/invalid-credential':'המייל או הסיסמה אינם נכונים.',
 'auth/email-already-in-use':'המייל כבר רשום. יש לבחור כניסה או איפוס סיסמה.',
 'auth/weak-password':'יש לבחור סיסמה חזקה יותר, לפחות 8 תווים.',
 'auth/invalid-email':'כתובת המייל אינה תקינה.',
 'auth/too-many-requests':'בוצעו ניסיונות רבים. יש להמתין מעט ולנסות שוב.',
 'auth/network-request-failed':'אין חיבור לשירות. בדוק את החיבור לאינטרנט.',
 'auth/operation-not-allowed':'אפשרות ההתחברות טרם הופעלה ב־Firebase.',
 'permission-denied':'הגישה נדחתה. ייתכן שהאישור בוטל או שכללי ההרשאות טרם פורסמו.',
 'unavailable':'שירות השמירה אינו זמין כרגע. הנתונים לא נשמרו; נסה שוב.',
 };
 return messages[error?.code]||'הפעולה לא הושלמה. בדוק את החיבור ונסה שוב.';
}
function showMessage(text){const el=access?$('appMessage'):$('authMessage');el.textContent=text;el.hidden=false}
function stopData(){for(const off of [studentSubscription,recordSubscription,teacherSubscription])off?.();studentSubscription=recordSubscription=teacherSubscription=null;studentsReady=recordsReady=false;weekKey='';state={students:[],records:{}};drafts={};teachers=[];if($('add').open)$('add').close();$('content').innerHTML='';$('nav').innerHTML=''}
function showGate(){access=false;$('workspace').hidden=true;$('classPreferenceButton').hidden=true;$('gradesButton').hidden=true;if($('classPreference').open)$('classPreference').close();$('authPanel').hidden=false;$('logoutButton').hidden=!auth.currentUser;$('accountBadge').textContent=auth.currentUser?'חשבון מורה':'כניסת מורים'}
function statusScreen(html){$('authFields').hidden=true;$('accountStatus').hidden=false;$('accountStatus').innerHTML=html}
async function runSession(user){
 const token=++generation;ownSubscription?.();ownSubscription=null;stopData();showGate();profile=null;$('authMessage').textContent='';$('password').value='';
 if(!user){$('authFields').hidden=false;$('accountStatus').hidden=true;return}
 if(!user.emailVerified){statusScreen(`<h3>אימות כתובת המייל</h3><p>יש לאמת את המייל לפני הכניסה.</p><p dir="ltr">${esc(user.email)}</p><div class="actions"><button class="primary" onclick="refreshVerification()">אימתתי את המייל</button><button onclick="sendVerification()">שליחת קישור אימות</button></div>`);return}
 statusScreen('<p>בודק את הרשאת הכניסה…</p>');
 try{
  const ref=doc(db,'teachers',user.uid);let snapshot=await getDoc(ref);if(token!==generation)return;
  if(!snapshot.exists()){await setDoc(ref,{name:(user.displayName||user.email.split('@')[0]).slice(0,80),email:user.email,status:'pending',createdAt:serverTimestamp()})}
  if(token!==generation)return;
  ownSubscription=onSnapshot(ref,snapshot=>{
   if(token!==generation)return;profile=snapshot.data();
   const allowed=isAdmin()||profile?.status==='approved';
   if(!allowed){stopData();showGate();statusScreen(`<h3>${profile?.status==='suspended'?'הגישה הושהתה':'הבקשה ממתינה לאישור'}</h3><p>${profile?.status==='suspended'?'יש לפנות למנהל השכבה.':'לאחר אישור המנהל תיפתח האפליקציה כאן אוטומטית.'}</p>`);return}
   updateClassPreferenceLabel();
   if(access)return;access=true;$('classPreferenceButton').hidden=false;$('gradesButton').hidden=false;$('authPanel').hidden=true;$('workspace').hidden=false;$('accountBadge').textContent=(isAdmin()?'מנהל · ':'מורה · ')+profile.name;
   view='home';homeSaved=false;
   if(profile.preferredClass){$('class').value=profile.preferredClass;$('newclass').value=profile.preferredClass}else openClassPreference();
   studentSubscription=onSnapshot(collection(db,'students'),snapshot=>{if(token!==generation||!access)return;state.students=snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.name.localeCompare(b.name,'he'));studentsReady=true;classOptions();render()},streamError);
   if(isAdmin())teacherSubscription=onSnapshot(collection(db,'teachers'),snapshot=>{if(token!==generation||!access)return;teachers=snapshot.docs.map(d=>({id:d.id,...d.data()}));if(view==='admin')render()},streamError);
   render();
  },error=>{if(token!==generation)return;stopData();showGate();statusScreen('<h3>לא ניתן לבדוק הרשאות</h3><p>יש לוודא שכללי האבטחה פורסמו ולנסות להיכנס שוב.</p>');showMessage(friendly(error))});
 }catch(error){if(token!==generation)return;statusScreen('<h3>החיבור אינו מוכן עדיין</h3><p>יש לפרסם את כללי ההרשאות ב־Firebase ואז להיכנס שוב.</p>');showMessage(friendly(error))}
}
function streamError(error){stopData();showGate();statusScreen('<h3>החיבור לנתונים הופסק</h3><p>לא ניתן להציג נתונים. נסה לצאת ולהיכנס שוב.</p>');showMessage(friendly(error))}
function syncWeek(){
 const date=new Date($('date').value+'T12:00:00');if(Number.isNaN(date.getTime()))return;
 date.setDate(date.getDate()-date.getDay());const start=fmt(date);date.setDate(date.getDate()+6);const end=fmt(date);if(weekKey===start)return;
 recordSubscription?.();weekKey=start;recordsReady=false;state.records={};const session=generation;
 recordSubscription=onSnapshot(query(collection(db,'assessments'),where('date','>=',start),where('date','<=',end)),snapshot=>{
  if(session!==generation||!access||weekKey!==start)return;
  state.records=Object.fromEntries(snapshot.docs.map(d=>{const r=d.data();return [JSON.stringify([r.studentId,r.date,r.lesson,r.subject,r.ownerUid]),r]}));recordsReady=true;render();
 },streamError);
}
async function assessmentId(k){const [id,date,lesson,subject,uid]=JSON.parse(k);return `${uid}_${id}_${date}_${lesson}_${subject}`}
async function logout(){try{await signOut(auth)}catch(error){showMessage(friendly(error))}}
async function authSubmit(event){
 event.preventDefault();const email=$('email').value.trim(),password=$('password').value,name=$('teacherName').value.trim();
 if(registerMode&&!name){showMessage('יש להזין את שם המורה.');return}
 $('authButton').disabled=true;showMessage('מתחבר…');
 try{if(registerMode){const result=await createUserWithEmailAndPassword(auth,email,password);await updateProfile(result.user,{displayName:name});await sendEmailVerification(result.user);showMessage('קישור אימות נשלח למייל שלך. בדוק גם את תיקיית הספאם.')}else await signInWithEmailAndPassword(auth,email,password)}
 catch(error){showMessage(friendly(error))}finally{$('authButton').disabled=false}
}
async function sendVerification(){if(!auth.currentUser)return;try{await sendEmailVerification(auth.currentUser);showMessage('קישור אימות נשלח למייל.')}catch(error){showMessage(friendly(error))}}
async function refreshVerification(){if(!auth.currentUser)return;try{await reload(auth.currentUser);if(!auth.currentUser.emailVerified){showMessage('המייל עדיין לא אומת. פתח את הקישור שנשלח אליך.');return}await getIdToken(auth.currentUser,true)}catch(error){showMessage(friendly(error))}}
async function resetPassword(){const email=$('email').value.trim();if(!email){showMessage('הזן את כתובת המייל כדי לקבל קישור לאיפוס סיסמה.');return}try{await sendPasswordResetEmail(auth,email);showMessage('אם החשבון קיים, יישלח אליו קישור לאיפוס סיסמה.')}catch(error){showMessage(friendly(error))}}
function renderAdmin(){
 if(!isAdmin())return;const names={pending:'ממתין לאישור',approved:'מאושר',suspended:'גישה מושהית'};
 $('nav').innerHTML=`<button onclick="goView('personal')">חזרה להערכות</button><button class="active">אישור מורים</button>`;
 $('content').innerHTML=`<section class="panel"><h2>אישור מורים</h2><div class="actions"><button class="primary" onclick="openRosterImport()">ייבוא תלמידים לפי כיתות</button></div><p>הבקשות מוצגות אחרי שהמורה נרשם ואימת את המייל.</p>${teachers.filter(t=>t.email!==ADMIN_EMAIL).sort((a,b)=>(a.status==='pending'?-1:1)-(b.status==='pending'?-1:1)).map(t=>`<article class="teacher-card"><strong>${esc(t.name)}</strong><p dir="ltr">${esc(t.email)}</p><span class="badge">${names[t.status]||'ממתין'}</span><div class="actions">${t.status!=='approved'?`<button class="primary" onclick="approveTeacher('${t.id}','approved')">אישור גישה</button>`:`<button onclick="approveTeacher('${t.id}','suspended')">השהיית גישה</button>`}</div></article>`).join('')||'<div class="empty">אין עדיין בקשות של מורים.</div>'}</section>`;
}
async function approveTeacher(id,status){if(!isAdmin()||!['approved','suspended'].includes(status))return;try{await updateDoc(doc(db,'teachers',id),{status,updatedAt:serverTimestamp()});showMessage(status==='approved'?'המורה אושר.':'הגישה הושהתה.')}catch(error){showMessage(friendly(error))}}
function updateClassPreferenceLabel(){$('classPreferenceButton').textContent=profile?.preferredClass?'הכיתה שלי: '+profile.preferredClass:'בחירת הכיתה שלי'}
function openClassPreference(){if(!access)return;$('preferredClass').value=profile?.preferredClass||'';$('classPreferenceMessage').textContent='';if(!$('classPreference').open)$('classPreference').showModal()}
async function saveClassPreference(event){
 event.preventDefault();if(!access||!auth.currentUser)return;const preferredClass=$('preferredClass').value;
 if(!['ז׳1','ז׳2','ז׳3','ז׳4'].includes(preferredClass))return;
 const button=$('saveClassPreference');button.disabled=true;
 try{await updateDoc(doc(db,'teachers',auth.currentUser.uid),{preferredClass,updatedAt:serverTimestamp()});profile={...profile,preferredClass};$('class').value=preferredClass;$('newclass').value=preferredClass;selected=roster()[0]?.id;updateClassPreferenceLabel();$('classPreference').close();render();showMessage('הכיתה שלך נשמרה ותיפתח אוטומטית בכניסה הבאה.')}
 catch(error){$('classPreferenceMessage').textContent=friendly(error)}finally{button.disabled=false}
}
function openAddStudent(){if(!access)return;$('newclass').value=$('class').value;$('add').showModal()}
document.getElementById('classPreference').addEventListener('cancel',event=>{if(access&&!profile?.preferredClass)event.preventDefault()});
document.getElementById('modeButton').onclick=()=>{registerMode=!registerMode;$('nameLabel').hidden=!registerMode;$('teacherName').required=registerMode;$('authButton').textContent=registerMode?'הרשמה':'כניסה';$('modeButton').textContent=registerMode?'כבר רשום? כניסה':'מורה חדש? הרשמה';$('password').autocomplete=registerMode?'new-password':'current-password';$('authMessage').textContent=''};


const metrics=['הגעה בזמן לשיעור','ספר ומחברת','עבודה רציפה','ביצוע מטלה','מוכנות לשיעור הבא'];
const prayerMetrics=['הגעה בזמן','תפילה נאותה ומכובדת','שמירה על השקט'];
function metricsFor(subject=subjectValue()){return subject==='תפילה'?prayerMetrics:metrics}
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={students:[],records:{}};
let view='home',selected=state.students[0]?.id,drafts={};let localDate=new Date();localDate.setMinutes(localDate.getMinutes()-localDate.getTimezoneOffset());$('date').value=localDate.toISOString().slice(0,10);$('lesson').innerHTML=Array.from({length:8},(_,i)=>`<option>${i+1}</option>`).join('');
function classOptions(){let old=$('class').value;$('class').innerHTML=[...new Set(['ז׳1','ז׳2','ז׳3','ז׳4',...state.students.map(s=>s.cls)])].map(c=>`<option>${esc(c)}</option>`).join('');if([...$('class').options].some(o=>o.value===old))$('class').value=old}classOptions();
function subjectValue(){return $('subject').value==='other'?$('otherSubject').value.trim():$('subject').value}function changeSubject(){$('otherSubjectLabel').hidden=$('subject').value!=='other';render();if($('subject').value==='other')$('otherSubject').focus()}
function roster(){return state.students.filter(s=>s.cls===$('class').value)}function key(id){return JSON.stringify([id,$('date').value,$('lesson').value,subjectValue(),auth.currentUser?.uid])}function record(id){let k=key(id);return drafts[k]||state.records[k]||{values:Array(metricsFor().length).fill(null),absent:false}}function changeClass(){selected=roster()[0]?.id;render()}function choose(id){selected=id;render()}function update(id,index,value){if(saving||!access)return;saveFeedback={context:saveContext(),text:'יש שינויים שטרם נשמרו'};$('appMessage').hidden=true;let k=key(id),r=record(id);drafts[k]={...r,values:[...r.values]};if(index==='absent')drafts[k].absent=value;else drafts[k].values[index]=value;render()}
function toggle(id,i,v,label){let r=record(id);return `<button class="${r.values[i]===v?(v?'yes':'no'):''}" aria-pressed="${r.values[i]===v}" ${r.absent||saving?'disabled':''} onclick="update('${id}',${i},${v})">${label}</button>`}function attendance(id){let r=record(id);return `<button class="${r.absent?'active':''}" ${saving?'disabled':''} onclick="update('${id}','absent',${!r.absent})">${r.absent?'נעדר ✓':'סימון היעדרות'}</button>`}
async function save(ids){
 if(!access||saving)return;
 if(!$('date').value||!subjectValue()||subjectValue().length>80||subjectValue().includes('/')){alert('יש למלא תאריך ומקצוע.');return}
 if(ids.some(id=>!record(id).absent&&record(id).values.some(v=>v===null))){alert('יש לסמן כן או לא בכל המדדים, או לסמן נעדר.');return}
 const user=auth.currentUser,session=generation,context=saveContext();saveFeedback=null;
 const entries=ids.map(id=>({key:key(id),data:{studentId:id,date:$('date').value,lesson:$('lesson').value,subject:subjectValue(),ownerUid:user.uid,teacher:profile.name,values:[...record(id).values],absent:record(id).absent,updatedAt:serverTimestamp()}}));
 if(entries.length>100){alert('אפשר לשמור עד 100 תלמידים בכל פעם.');return}
 saving=true;render();
 try{const batch=writeBatch(db);for(const item of entries){const id=await assessmentId(item.key);batch.set(doc(db,'assessments',id),item.data)}await batch.commit();if(session!==generation)return;for(const item of entries){delete drafts[item.key];state.records[item.key]=item.data}saveFeedback={context,text:entries.length===1?'ההערכה נשמרה ✓':entries.length+' הערכות נשמרו ✓'};homeSaved=true;view='home';render();showMessage('השמירה בוצעה בהצלחה')}
 catch(error){saveFeedback={context,text:'לא נשמר — נסה שוב'};showMessage(friendly(error))}
 finally{saving=false;render()}
}
function render(){if(!access)return;$('lessonFilters').hidden=view==='home';$('nav').hidden=view==='home';$('pageToolbar').hidden=view==='home';syncWeek();if(!studentsReady||!recordsReady){$('content').innerHTML='<div class="panel empty">טוען נתונים…</div>';return}if(view==='admin'){renderAdmin();return}const metrics=metricsFor();let tabs=[['class','הכיתה שלי ודירוג'],['weekly','סיכום שבועי'],['grades','ציוני הכיתה']];if(isAdmin())tabs.push(['admin','אישור מורים']);$('nav').innerHTML=tabs.map(([v,t])=>`<button class="${view===v?'active':''}" onclick="goView('${v}')">${t}</button>`).join('');if(view==='grades'){renderGrades(roster());return}if(view==='home'){renderHome();return}if(view==='example'){exampleReport();return}let students=roster();if(!students.some(s=>s.id===selected))selected=students[0]?.id;let s=students.find(s=>s.id===selected);if(!s){$('content').innerHTML='<div class="panel empty">עדיין אין תלמידים בכיתה. מנהל השכבה יעדכן את הרשימה.</div>';return}if(view==='personal'){$('content').innerHTML=`<div class="student-layout"><aside class="panel students">${students.map(t=>`<button class="${t.id===selected?'active':''}" onclick="choose('${t.id}')">${esc(t.name)}</button>`).join('')}</aside><section class="panel"><div class="hero"><div><h2>${esc(s.name)}</h2><p>${esc(s.cls)} · הערכה לשיעור ${esc($('lesson').value)}</p></div>${attendance(s.id)}</div>${metrics.map((m,i)=>`<div class="metric"><span>${m}</span><div class="choices">${toggle(s.id,i,true,'כן')}${toggle(s.id,i,false,'לא')}</div></div>`).join('')}<div class="actions"><button class="primary" ${saving?'disabled':''} onclick="saveCurrentStudent()">שמירת ההערכה</button><span id="saved" class="muted">${saveStatus()||(state.records[key(s.id)]?'קיימת הערכה שלך לשיעור זה':'')}</span></div></section></div>`}else if(view==='class'){$('content').innerHTML=`<section class="panel"><h2>דירוג הכיתה · ${esc($('class').value)}</h2><p>התלמידים מסודרים לפי א׳–ב׳. סמן כן או לא בכל מדד, או סמן היעדרות.</p><p class="grading-progress">${students.filter(t=>record(t.id).absent||record(t.id).values.every(v=>typeof v==='boolean')).length} מתוך ${students.length} תלמידים מוכנים לשמירה</p><div class="mobile-class">${students.map(t=>`<article class="student-card"><div class="hero"><h3>${esc(t.name)}</h3>${attendance(t.id)}</div>${metrics.map((m,i)=>`<div class="metric"><span>${m}</span><div class="choices">${toggle(t.id,i,true,'כן')}${toggle(t.id,i,false,'לא')}</div></div>`).join('')}</article>`).join('')}</div><div class="scroll class-table"><table><thead><tr><th>תלמיד</th>${metrics.map(m=>`<th>${m}</th>`).join('')}<th>נוכחות</th></tr></thead><tbody>${students.map(t=>`<tr><td>${esc(t.name)}</td>${metrics.map((_,i)=>`<td>${toggle(t.id,i,true,'כן')}${toggle(t.id,i,false,'לא')}</td>`).join('')}<td>${attendance(t.id)}</td></tr>`).join('')}</tbody></table></div><div class="actions class-save-bar"><button class="primary" ${saving?'disabled':''} onclick="saveClass()">שמירת הערכות הכיתה</button><span id="saved" class="save-status" role="status" aria-live="polite">${saveStatus()}</span></div></section>`}else weekly(students)}
function weekly(students){
let date=new Date($('date').value+'T12:00:00');date.setDate(date.getDate()-date.getDay());let start=fmt(date);date.setDate(date.getDate()+6);let end=fmt(date);
let records=Object.values(state.records).filter(r=>r.date>=start&&r.date<=end&&students.some(s=>s.id===r.studentId));
let present=records.filter(r=>!r.absent),yes=present.reduce((n,r)=>n+r.values.filter(v=>v===true).length,0),total=present.reduce((n,r)=>n+r.values.filter(v=>typeof v==='boolean').length,0);
function summary(title,labels,isPrayer){return `<section class="panel"><h2>${title}</h2><p>היעדרויות אינן נכללות באחוזים. השבוע הוא מיום ראשון עד שבת.</p><div class="scroll responsive-report"><table><thead><tr><th>תלמיד</th>${labels.map(m=>`<th>${m}</th>`).join('')}</tr></thead><tbody>${students.map(s=>{let rr=present.filter(r=>r.studentId===s.id&&(r.subject==='תפילה')===isPrayer);return `<tr><td>${esc(s.name)}</td>${labels.map((label,i)=>{let valid=rr.filter(r=>typeof r.values[i]==='boolean');let p=valid.length?Math.round(valid.filter(r=>r.values[i]===true).length/valid.length*100):null;return `<td data-label="${esc(label)}">${p===null?'אין נתונים':p+'%'}<div class="bar"><span style="width:${p||0}%"></span></div></td>`}).join('')}</tr>`}).join('')}</tbody></table></div></section>`}
$('content').innerHTML=`<div class="cards"><div class="stat">שבוע נבחר<strong>${start.split('-').reverse().join('.')} — ${end.split('-').reverse().join('.')}</strong></div><div class="stat">הערכות ללא היעדרות<strong>${present.length}</strong></div><div class="stat">סימוני כן מכל המדדים<strong>${total?Math.round(yes/total*100)+'%':'—'}</strong></div></div>${summary('התקדמות בשיעורים',metrics,false)}${summary('התקדמות בתפילה',prayerMetrics,true)}<section class="panel"><h2>פירוט השיעורים והתפילות</h2><div class="scroll responsive-report"><table><thead><tr><th>תאריך</th><th>תלמיד</th><th>שיעור</th><th>מקצוע</th><th>מורה</th><th>תוצאות</th></tr></thead><tbody>${records.sort((a,b)=>b.date.localeCompare(a.date)||Number(a.lesson)-Number(b.lesson)).map(r=>`<tr><td data-label="תאריך">${esc(r.date)}</td><td data-label="תלמיד">${esc(students.find(s=>s.id===r.studentId)?.name||'')}</td><td data-label="שיעור">${esc(r.lesson)}</td><td data-label="מקצוע">${esc(r.subject)}</td><td data-label="מורה">${esc(r.teacher)}</td><td data-label="תוצאות">${r.absent?'נעדר':r.values.map((v,i)=>`${esc(metricsFor(r.subject)[i])}: ${v?'כן':'לא'}`).join(' · ')}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">טרם נשמרו הערכות בשבוע הזה.</td></tr>'}</tbody></table></div></section>`
}function fmt(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}


function renderHome(){
 const cls=profile?.preferredClass||$('class').value;$('class').value=cls;
 const count=state.students.filter(s=>s.cls===cls).length;
 $('content').innerHTML=`<div class="home-heading"><h2>שלום, ${esc(profile?.name||'')}</h2><p>לב השכבה · שכבה ז׳ תשפג״ז</p></div>${homeSaved?'<div class="home-success" role="status">✓ השמירה בוצעה בהצלחה</div>':''}<div class="home-dashboard"><section class="panel home-main"><h2>הכיתה שלי · ${esc(cls)}</h2><p>${count} תלמידים בכיתה</p><button class="primary home-start" onclick="enterMyClass()">הכיתה שלי ודירוג</button><button class="home-settings" onclick="openClassPreference()">שינוי הכיתה שלי</button></section><aside class="panel home-links"><h3>סיכומים</h3><button onclick="goView('weekly')">סיכום שבועי</button><button onclick="goView('grades')">ציוני הכיתה</button>${isAdmin()?'<button onclick="goView(\'admin\')">ניהול מורים ותלמידים</button>':''}</aside></div>`;
}
function enterMyClass(){$('class').value=profile?.preferredClass||$('class').value;selected=roster()[0]?.id;goView('class')}


function renderGrades(students){
 const date=new Date($('date').value+'T12:00:00');date.setDate(date.getDate()-date.getDay());const start=fmt(date);date.setDate(date.getDate()+6);const end=fmt(date);
 const records=Object.values(state.records).filter(r=>!r.absent&&r.date>=start&&r.date<=end);
 const score=rows=>{const values=rows.flatMap(r=>r.values).filter(v=>typeof v==='boolean');return values.length?Math.round(values.filter(v=>v).length/values.length*100)+'%':'אין נתונים'};
 const overview=`<section class="panel"><h2>ציוני הכיתה · ${esc($('class').value)}</h2><p>סיכום שבועי ${start.split('-').reverse().join('.')}–${end.split('-').reverse().join('.')} · אחוזי ״כן״ בכל המקצועות. היעדרויות אינן נכללות.</p><div class="scroll"><table class="grades-table"><thead><tr><th>תלמיד</th><th>שיעורים</th><th>תפילה</th><th>סך הכול</th></tr></thead><tbody>${students.map(s=>{const rows=records.filter(r=>r.studentId===s.id);return `<tr><td>${esc(s.name)}</td><td>${score(rows.filter(r=>r.subject!=='תפילה'))}</td><td>${score(rows.filter(r=>r.subject==='תפילה'))}</td><td><strong>${score(rows)}</strong></td></tr>`}).join('')||'<tr><td colspan="4" class="empty">טרם נוספו תלמידים לכיתה.</td></tr>'}</tbody></table></div><p class="muted">כל המורים המאושרים נכללים בסיכום. פירוט לכל מדד מופיע למטה.</p></section>`;
 weekly(students);$('content').innerHTML=overview+$('content').innerHTML;
}


function parseRoster(text){
 const rows=[],seen=new Set();
 for(const raw of text.split(/\r?\n/)){const line=raw.trim().replace(/^\|\s*/, '').replace(/\s*\|$/, '');if(!line||/^[\s|:-]+$/.test(line))continue;
  const match=line.match(/^ז[׳'’]?\s*(?:-\s*)?([1-4])\s*[|\t]\s*(.+)$/);
  if(!match)throw Error('שורה אינה תקינה. יש לכתוב כיתה ושם, עם סימן | ביניהם.');
  const cls='ז׳'+match[1],name=match[2].trim().replace(/\s+/g,' ');if(!name||name.length>80)throw Error('יש לבדוק את אורך שם התלמיד.');
  const key=JSON.stringify([cls,name]);if(!seen.has(key)){seen.add(key);rows.push({cls,name})}
 }
 if(!rows.length||rows.length>100)throw Error('יש להזין בין 1 ל־100 תלמידים בכל ייבוא.');return rows;
}
function openRosterImport(){if(!isAdmin())return;$('rosterImportMessage').textContent='';$('rosterImport').showModal()}
async function importRoster(event){
 event.preventDefault();if(!isAdmin()||!studentsReady)return;const button=$('importRosterButton');button.disabled=true;
 try{const rows=parseRoster($('rosterText').value),existing=new Set(state.students.map(s=>JSON.stringify([s.cls,s.name.replace(/\s+/g,' ').trim()]))),newRows=rows.filter(s=>!existing.has(JSON.stringify([s.cls,s.name])));
  if(!newRows.length){$('rosterImportMessage').textContent='כל התלמידים ברשימה כבר קיימים.';return}
  const uid=auth.currentUser.uid,batch=writeBatch(db);
  for(const student of newRows){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([student.cls,student.name])));const id='import-'+Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');batch.set(doc(db,'students',id),{...student,ownerUid:uid,createdAt:serverTimestamp()})}
  await batch.commit();$('rosterImport').close();$('rosterText').value='';view='class';render();showMessage(newRows.length+' תלמידים נוספו בהצלחה.');
 }catch(error){$('rosterImportMessage').textContent=error.code?friendly(error):error.message}finally{button.disabled=false}
}

function exampleReport(){
const card=(title,labels,scores)=>`<article class="report-card"><h3>${title}</h3><p>איתי לדוגמה · ז׳1</p>${labels.map((m,i)=>`<div class="report-row"><div><span>${esc(m)}</span><span class="score">${scores[i]}%</span></div><div class="bar"><span style="width:${scores[i]}%"></span></div><p class="muted">${scores[i]/20} מתוך 5 הערכות סומנו ״כן״</p></div>`).join('')}<div class="report-note">${title==='שיעורים'?'חוזקה: הגעה בזמן. יעד לשבוע הבא: מוכנות לשיעור הבא.':'חוזקה: הגעה בזמן לתפילה. יעד לשבוע הבא: שמירה על השקט.'}</div></article>`;
$('content').innerHTML=`<section class="panel"><div class="report-toolbar"><h2>כך נראה סיכום שבועי</h2><span class="demo-label">דוגמה פיקטיבית בלבד</span></div><p class="report-week">איתי לדוגמה · ז׳1 · שבוע 04.10.2026–10.10.2026</p><p>נתוני הדוגמה מוצגים בנפרד ואינם נשמרים בהערכות שלך.</p></section><div class="cards"><div class="stat">הערכות בשיעורים<strong>5</strong></div><div class="stat">הערכות בתפילה<strong>5</strong></div><div class="stat">היעדרויות שלא נכללו<strong>1</strong></div></div><h3 class="report-title">התמונה השבועית של התלמיד</h3><div class="report-grid">${card('שיעורים',metrics,[100,80,80,60,40])}${card('תפילה',prayerMetrics,[100,80,60])}</div><section class="panel"><h2>דוגמה לפירוט יומי</h2><div class="example-history"><div class="history-item"><strong>יום ראשון, 04.10 · שיעור 2 · גמרא</strong><p>הגעה בזמן: כן · ספר ומחברת: כן · עבודה רציפה: כן · ביצוע מטלה: לא · מוכנות לשיעור הבא: לא</p></div><div class="history-item"><strong>יום ראשון, 04.10 · תפילה</strong><p>הגעה בזמן: כן · תפילה נאותה ומכובדת: כן · שמירה על השקט: לא</p></div><div class="history-item"><strong>יום שני, 05.10 · שיעור 3 · תורה</strong><p>נעדר — ההערכה אינה נכללת באחוזי ההצלחה.</p></div></div></section>`;
}

$('addform').onsubmit=async e=>{e.preventDefault();if(!access)return;let name=$('newname').value.trim(),cls=$('newclass').value;if(!name||!cls)return;const button=$('addform').querySelector('button[type=submit]');button.disabled=true;try{await setDoc(doc(collection(db,'students')),{name,cls,ownerUid:auth.currentUser.uid,createdAt:serverTimestamp()});$('add').close();$('addform').reset()}catch(error){showMessage(friendly(error))}finally{button.disabled=false}};
Object.assign(window,{changeClass,choose,update,save,changeSubject,logout,authSubmit,resetPassword,sendVerification,refreshVerification,approveTeacher,goView,openClassPreference,saveClassPreference,openAddStudent,saveCurrentStudent,saveClass,openRosterImport,importRoster,enterMyClass});
function saveCurrentStudent(){return save([selected])}
function saveClass(){return save(roster().map(s=>s.id))}
function goView(next){homeSaved=false;view=next;render()}
onIdTokenChanged(auth,runSession);



