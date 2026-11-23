const DICT=new Set(WORDS);
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const store={get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const DAY0=Date.UTC(2026,0,1);
const today=((Math.floor((Date.now()-DAY0)/864e5))%PUZZLES.length+PUZZLES.length)%PUZZLES.length;
const ROUNDS=5;
let S,solo,duoS=null,mode="solo",matchId=null,M=null,me=null,matches=[],saving=false,saveErr=null,net="ok",pollT=null,listT=null,lobbyMsg="",joinCode=null;

/* ---------- ladder engine ---------- */
function neighbors(w){const out=[];for(let i=0;i<4;i++)for(let c=97;c<123;c++){const ch=String.fromCharCode(c);if(ch===w[i])continue;const x=w.slice(0,i)+ch+w.slice(i+1);if(DICT.has(x))out.push(x)}return out}
function nextOnPath(from,to){/* shortest route; among equal routes, the one through the most medical words */
  const cost=w=>MED[w]?99:100;const dist=new Map([[from,0]]),prev=new Map([[from,null]]),open=[[0,from]],done=new Set();
  while(open.length){let bi=0;for(let i=1;i<open.length;i++)if(open[i][0]<open[bi][0])bi=i;const [d,u]=open.splice(bi,1)[0];if(done.has(u))continue;done.add(u);if(u===to)break;
    for(const v of neighbors(u)){const nd=d+cost(v);if(!dist.has(v)||nd<dist.get(v)){dist.set(v,nd);prev.set(v,u);open.push([nd,v])}}}
  if(!prev.has(to))return null;let x=to;while(prev.get(x)!==from&&prev.get(x)!==null)x=prev.get(x);return x}
function renderGloss(){const g=$("gloss");if(!g)return;const seen=new Set();const items=[];
  const add=(w,tag)=>{if(!MED[w]||seen.has(w))return;seen.add(w);items.push(`<div class="gl${tag?" "+tag:""}"><b>${w.toUpperCase()}</b><span>${esc(MED[w])}</span></div>`)};
  add(S.start,"from");add(S.goal,"to");S.path.slice(1).forEach(w=>add(w,"found"));
  g.innerHTML=`<h3>Medical terms</h3>`+items.join("")}
function fresh(i,key){const [a,b,par]=PUZZLES[i];return{idx:i,start:a,goal:b,par,path:[a],typed:"",hints:0,won:false,key:key||null}}
function diffPos(a,b){for(let i=0;i<4;i++)if(a[i]!==b[i])return i;return -1}
function say(t,cls){const m=$("msg");m.textContent=t;m.className="msg"+(cls?" "+cls:"")}
function playable(){return S&&!S.won&&!$("board").hidden}
function renderBoard(){
  const L=$("ladder");L.innerHTML="";
  S.path.forEach((w,k)=>{const r=document.createElement("div");r.className="row done";const ch=k?diffPos(S.path[k-1],w):-1;
    for(let i=0;i<4;i++){const t=document.createElement("div");t.className="tile"+(i===ch?" changed":"");t.textContent=w[i];r.appendChild(t)}if(MED[w])r.classList.add("isMed"),r.title=MED[w];L.appendChild(r)});
  const last=S.path[S.path.length-1];
  if(!S.won){const r=document.createElement("div");r.className="row current";r.id="cur";
    for(let i=0;i<4;i++){const t=document.createElement("div");const c=S.typed[i];t.className="tile"+(c?"":" carry")+(i===S.typed.length?" cursor":"");t.textContent=c||"";r.appendChild(t)}L.appendChild(r);
    const g=document.createElement("div");g.className="row goal isMed";
    for(let i=0;i<4;i++){const t=document.createElement("div");t.className="tile"+(last[i]===S.goal[i]?" hit":"");t.textContent=S.goal[i];g.appendChild(t)}L.appendChild(g)}
  const steps=S.path.length-1;const mc=S.path.slice(1).filter(w=>MED[w]&&w!==S.goal).length;$("medc").textContent=mc;renderGloss();$("steps").textContent=steps;$("par").textContent=S.par;$("hints").textContent=S.hints;
  const duo=mode==="duo";
  $("nav").hidden=duo;$("giveup").hidden=!duo;$("reset").hidden=duo;
  if(duo){$("lastlab").textContent="Round";$("best").textContent=M?Math.min(M.rounds.length,ROUNDS)+"/"+ROUNDS:"–"}
  else{$("lastlab").textContent="Best";const best=(store.get("rungs-med-best")||{})[S.idx];$("best").textContent=best?best:"–";
    $("pnum").textContent="#"+(S.idx+1)+(S.idx===today?" today":"")}
  $("undo").disabled=S.path.length<2||S.won;$("hint").disabled=S.won;$("giveup").disabled=S.won;
  const wb=$("winbox");
  if(S.won&&!duo){const over=steps-S.par;const verdict=over<=0?(S.hints?"Par, with help":"Perfect ladder"):over===1?"One over par":over+" over par";
    wb.hidden=false;wb.className="win";
    wb.innerHTML=`<h2>${verdict}</h2><p>${S.start.toUpperCase()} to ${S.goal.toUpperCase()} in ${steps} rungs${S.hints?`, ${S.hints} hint${S.hints>1?"s":""}`:""}. Par is ${S.par}.${mc?` You climbed through ${mc} medical word${mc>1?"s":""} on the way.`:""}</p><button id="go">Next puzzle</button>`;
    $("go").onclick=()=>loadSolo(S.idx+1);$("kb").hidden=true}
  else if(S.won&&duo){wb.hidden=false;wb.className="win";
    wb.innerHTML=saveErr?`<h2>Your result did not save</h2><p>${esc(saveErr)}</p><button id="go">Try again</button>`:`<h2>Sending your ladder…</h2>`;
    if(saveErr)$("go").onclick=()=>finishTurn(S.lastRes);$("kb").hidden=true}
  else{wb.hidden=true;$("kb").hidden=false}
}
function shake(){const r=$("cur");if(!r)return;r.classList.remove("shake");void r.offsetWidth;r.classList.add("shake")}
function submit(){
  const w=S.typed,last=S.path[S.path.length-1];
  if(w.length<4){say("Fill all four letters.","err");return shake()}
  let d=0;for(let i=0;i<4;i++)if(w[i]!==last[i])d++;
  if(d===0){say("That is the same word. Change one letter.","err");return shake()}
  if(d>1){say(`${w.toUpperCase()} changes ${d} letters. Change only one.`,"err");return shake()}
  if(!DICT.has(w)){say(`${w.toUpperCase()} is not in the word list.`,"err");return shake()}
  if(S.path.includes(w)){say(`You already used ${w.toUpperCase()}.`,"err");return shake()}
  S.path.push(w);S.typed="";
  if(w===S.goal){S.won=true;const st=S.path.length-1;
    if(mode==="solo"){const b=store.get("rungs-med-best")||{};if(!b[S.idx]||st<b[S.idx]){b[S.idx]=st;store.set("rungs-med-best",b)}say("Reached the top.","ok")}
    else{say("");renderBoard();return finishTurn({steps:st,hints:S.hints,path:S.path.slice()})}}
  else say("");
  renderBoard()}
function key(k){if(!playable())return;
  if(k==="enter")return submit();
  if(k==="back"){S.typed=S.typed.slice(0,-1);say("");return renderBoard()}
  if(/^[a-z]$/.test(k)&&S.typed.length<4){S.typed+=k;renderBoard()}}
function loadSolo(i){solo=S=fresh((i+PUZZLES.length)%PUZZLES.length);say("");renderBoard()}


/* ---------- partner matches (Supabase) ---------- */
const API="https://kemvjazkorkzlsyqenmc.supabase.co/rest/v1/rpc/",KEY="sb_publishable_gjonaGaZQNldX5SYAGeyZg_5Kv6k16w";
function uuid(){if(crypto.randomUUID)return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;const h=[...b].map(x=>x.toString(16).padStart(2,"0")).join("");return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20)}
let token=store.get("rungs-token");if(!token){token=uuid();store.set("rungs-token",token)}
let myName=store.get("rungs-name")||"";
async function rpc(fn,args){
  let r;try{r=await fetch(API+fn,{method:"POST",headers:{apikey:KEY,"Content-Type":"application/json"},body:JSON.stringify(args)})}
  catch(e){net="off";throw new Error("You seem to be offline. Partner games need the internet; solo play still works.")}
  net="ok";const j=await r.json().catch(()=>null);
  if(!r.ok)throw new Error((j&&j.message)||"Something went wrong. Try again.");return j}
const curRound=m=>m.rounds[m.rounds.length-1];
const opp=m=>1-m.me;
const res=(r,i)=>(r.res||{})[String(i)];
function turnOf(m){if(!m.names[1]||m.over)return null;const r=curRound(m);const st=r.starter;if(!res(r,st))return st;if(!res(r,1-st))return 1-st;return null}
const scoreOf=x=>!x||x.gaveUp?Infinity:x.steps+x.hints;
function winnerOf(r){const a=res(r,0),b=res(r,1);if(!a||!b)return undefined;const sa=scoreOf(a),sb=scoreOf(b);return sa<sb?0:sb<sa?1:null}
function tally(m){const t=[0,0];m.rounds.forEach(r=>{const w=winnerOf(r);if(w!=null)t[w]++});return t}
function pickPuzzle(m){const used=new Set(m?m.rounds.map(r=>r.p):[]);let p;do{p=Math.floor(Math.random()*PUZZLES.length)}while(used.has(p)&&used.size<PUZZLES.length);return p}
const nm=(m,i)=>i===m.me?"You":(m.names[i]||"Your partner");
function needName(){const v=($("pname")&&$("pname").value.trim())||myName;if(!v){lobbyMsg="Type your name first so your partner knows who you are.";renderAll();return null}myName=v.slice(0,24);store.set("rungs-name",myName);return myName}
async function createMatch(){const n=needName();if(!n)return;try{const m=await rpc("rungs_create",{p_token:token,p_name:n,p_puzzle:pickPuzzle(null)});setMatch(m)}catch(e){lobbyMsg=e.message;renderAll()}}
async function joinMatch(code){const n=needName();if(!n)return;code=(code||"").trim().toUpperCase();if(!code){lobbyMsg="Type the code your partner sent you.";return renderAll()}
  try{const m=await rpc("rungs_join",{p_code:code,p_token:token,p_name:n});joinCode=null;setMatch(m)}catch(e){lobbyMsg=e.message;renderAll()}}
async function refreshList(){try{matches=await rpc("rungs_list",{p_token:token})||[];if(mode==="duo"&&!matchId)renderAll()}catch(e){if(mode==="duo"&&!matchId)renderAll()}}
async function refreshMatch(){if(!matchId)return;try{const m=await rpc("rungs_get",{p_code:matchId,p_token:token});if(matchId===m.code){M=m;renderAll()}}catch(e){renderAll()}}
function setMatch(m){matchId=m.code;M=m;lobbyMsg="";startPolling();renderAll()}
function openMatch(code){matchId=code;M=null;S=null;duoS=null;startPolling();renderAll();refreshMatch()}
function leaveMatch(){matchId=null;M=null;S=null;duoS=null;startPolling();renderAll();refreshList()}
function startPolling(){clearInterval(pollT);clearInterval(listT);if(mode!=="duo")return;
  if(matchId)pollT=setInterval(()=>{if(!document.hidden&&!saving)refreshMatch()},5000);else listT=setInterval(()=>{if(!document.hidden)refreshList()},15000)}
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&mode==="duo"){matchId?refreshMatch():refreshList()}});
async function finishTurn(r){
  saving=true;saveErr=null;S.lastRes=r;renderBoard();
  try{const m=await rpc("rungs_submit",{p_code:matchId,p_token:token,p_round:M.rounds.length-1,p_res:r,p_next:pickPuzzle(M)});
    saving=false;S=null;duoS=null;M=m;renderAll()}
  catch(e){saving=false;saveErr=e.message;renderBoard()}}
async function rematch(){try{M=await rpc("rungs_rematch",{p_code:matchId,p_token:token,p_puzzle:pickPuzzle(null)});renderAll()}catch(e){}}
async function shareMatch(code){const url=location.origin+location.pathname+"?join="+code;const text=`Play Rungs with me! Open this link, or open the app and join match ${code}.`;
  try{if(navigator.share){await navigator.share({title:"Rungs",text,url});return}}catch(e){if(e.name==="AbortError")return}
  try{await navigator.clipboard.writeText(text+" "+url);flash("Invite link copied. Paste it to your partner.")}catch(e){flash("Send your partner this code: "+code)}}
function flash(t){const n=$("flash");if(n){n.textContent=t;n.hidden=false}}
function renderLobby(){
  const el=$("lobby");
  const row=m=>{const t=turnOf(m);let pill;if(!m.names[1])pill=`<span class="pill">Waiting for partner</span>`;else if(m.over)pill=`<span class="pill">Finished</span>`;else if(t===m.me)pill=`<span class="pill go">Your go</span>`;else pill=`<span class="pill">Their go</span>`;
    const vs=!m.names[1]?"No partner yet":"vs "+esc(m.names[opp(m)]||"Partner");
    return `<li><span class="who"><span class="code">${esc(m.code)}</span>${vs}</span>${pill}<button data-open="${esc(m.code)}">Open</button></li>`};
  el.innerHTML=`<div class="card"><h3>Take turns on the same puzzles</h3>
    <p>Start a match and send the invite to your partner. You each play the same puzzle, one after the other. Five rounds, and the lower score (rungs plus hints) wins each round.</p>
    <label class="fld" for="pname">Your name<input id="pname" maxlength="24" autocomplete="nickname" placeholder="e.g. Ben" value="${esc(myName)}"></label>
    <div class="btnrow"><button class="primary" id="newmatch">Start a match</button></div>
    <label class="fld" for="jcode">Got a code from your partner?<span class="inrow"><input id="jcode" maxlength="6" autocapitalize="characters" placeholder="ABC123" value="${esc(joinCode||"")}"><button id="joinbtn">Join</button></span></label>
    ${lobbyMsg?`<p class="msg err">${esc(lobbyMsg)}</p>`:""}</div>
  <div class="card"><h3>Your matches</h3>${net==="off"?`<p>You seem to be offline. Partner games need the internet. Solo play still works.</p>`:matches.length?`<ul class="list">${matches.map(row).join("")}</ul>`:`<p>No matches yet. Start one above.</p>`}</div>`;
  $("newmatch").onclick=createMatch;$("joinbtn").onclick=()=>joinMatch($("jcode").value);
  $("jcode").addEventListener("keydown",e=>{if(e.key==="Enter")joinMatch($("jcode").value)});
  el.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>openMatch(b.dataset.open));
}
function renderMatch(){
  const el=$("matchbar");
  if(!M){el.innerHTML=`<div class="card"><p>${net==="off"?"You seem to be offline. This match will load when you're back online.":"Loading match…"}</p></div><button class="linkbtn" id="back">Back to matches</button>`;$("back").onclick=leaveMatch;return}
  const me=M.me,op=opp(M),t=tally(M),turn=turnOf(M),r=curRound(M),P=PUZZLES[r.p];
  let status;
  if(!M.names[1])status=`Waiting for your partner to join match <b>${esc(M.code)}</b>. Send them the invite.`;
  else if(M.over){const w=t[me]>t[op]?"You won the match":t[me]<t[op]?esc(nm(M,op))+" won the match":"The match is a draw";status=`${w}, ${t[me]}–${t[op]}.`}
  else if(turn===me){const th=res(r,op);status=`Your go: ${P[0].toUpperCase()} to ${P[1].toUpperCase()}.`+(th?` ${esc(nm(M,op))} scored ${th.gaveUp?"a give-up":scoreOf(th)}. Beat it.`:` ${esc(nm(M,op))} plays this one after you.`)}
  else status=`${esc(nm(M,op))}'s go. You'll see their ladder once they finish. This page checks for their move every few seconds.`;
  const done=M.rounds.filter(x=>winnerOf(x)!==undefined);
  const lad=x=>!x?"":x.gaveUp?"gave up":(x.path||[]).join(" → ")+` (${x.steps} rungs${x.hints?`, ${x.hints} hint${x.hints>1?"s":""}`:""})`;
  el.innerHTML=`<div class="card">
    <div class="score"><div class="side"><span class="nm">You</span><span class="pts">${t[me]}</span></div>
    <div class="mid">Round ${Math.min(M.rounds.length,ROUNDS)} of ${ROUNDS}<br>${esc(M.code)}</div>
    <div class="side r"><span class="nm">${esc(M.names[op]||"Partner")}</span><span class="pts">${M.names[1]?t[op]:"–"}</span></div></div>
    <div class="status">${status}</div>
    <div class="btnrow">${!M.names[1]?`<button class="primary" id="share">Invite partner</button>`:""}${M.over?`<button class="primary" id="again">Play again</button>`:""}</div>
    <p class="msg ok" id="flash" hidden></p>
  </div>
  ${done.length?`<div class="hist">${done.map((x,i)=>{const w=winnerOf(x);const Pz=PUZZLES[x.p];return `<div><b>Round ${i+1}: ${Pz[0].toUpperCase()} → ${Pz[1].toUpperCase()}</b> · par ${Pz[2]} · ${w===null?"tie":w===me?"you win":esc(nm(M,w))+" wins"}<br><span class="lad">You: ${esc(lad(res(x,me)))}</span><br><span class="lad">${esc(nm(M,op))}: ${esc(lad(res(x,op)))}</span></div>`}).join("")}</div>`:""}
  <button class="linkbtn" id="back">Back to matches</button>`;
  $("back").onclick=leaveMatch;if(M.over)$("again").onclick=rematch;if(!M.names[1])$("share").onclick=()=>shareMatch(M.code);
  if(turn===me&&!saving){const k=M.code+":"+M.rounds.length;if(!duoS||duoS.key!==k){duoS=fresh(r.p,k);say("")}S=duoS}
  else if(!saving&&!(S&&S.won&&saveErr))S=null;
}
function renderAll(){
  $("m-solo").setAttribute("aria-selected",mode==="solo");$("m-duo").setAttribute("aria-selected",mode==="duo");
  if(mode==="solo"){$("lobby").hidden=true;$("matchbar").hidden=true;S=solo;$("board").hidden=false;renderBoard();return}
  if(!matchId){$("lobby").hidden=false;$("matchbar").hidden=true;$("board").hidden=true;renderLobby();return}
  $("lobby").hidden=true;$("matchbar").hidden=false;renderMatch();$("board").hidden=!S;if(S)renderBoard()}

/* ---------- wiring ---------- */
document.addEventListener("click",e=>{const b=e.target.closest("button");if(b&&e.detail>0)b.blur()});
document.addEventListener("keydown",e=>{if(e.metaKey||e.ctrlKey||e.altKey)return;if(e.target.tagName==="BUTTON"&&e.key==="Enter")return;if(e.target.tagName==="INPUT")return;
  const k=e.key.toLowerCase();if(k==="enter"){if(playable()){e.preventDefault();key("enter")}}else if(k==="backspace"){if(playable()){e.preventDefault();key("back")}}else if(/^[a-z]$/.test(k))key(k)});
const kb=$("kb");["qwertyuiop","asdfghjkl","*zxcvbnm<"].forEach(r=>{const d=document.createElement("div");
  for(const c of r){const b=document.createElement("button");if(c==="*"){b.textContent="Enter";b.className="wide";b.onclick=()=>key("enter")}else if(c==="<"){b.textContent="Delete";b.className="wide";b.onclick=()=>key("back")}else{b.textContent=c;b.onclick=()=>key(c)}b.addEventListener("mousedown",e=>e.preventDefault());d.appendChild(b)}kb.appendChild(d)});
$("undo").onclick=()=>{if(S&&S.path.length>1&&!S.won){S.path.pop();S.typed="";say("");renderBoard()}};
$("reset").onclick=()=>{const h=S.hints;loadSolo(S.idx);S.hints=h;renderBoard()};
$("hint").onclick=()=>{if(!playable())return;const last=S.path[S.path.length-1];const n=nextOnPath(last,S.goal);
  if(!n){say("No route from here. Undo a rung.","err");return}S.hints++;S.typed=n;say(`Try ${n.toUpperCase()}. Press Enter to place it.`);renderBoard()};
$("giveup").onclick=()=>{if(!playable()||mode!=="duo")return;S.won=true;finishTurn({gaveUp:true,steps:S.path.length-1,hints:S.hints,path:S.path.slice()})};
$("prev").onclick=()=>loadSolo(S.idx-1);$("next").onclick=()=>loadSolo(S.idx+1);
$("m-solo").onclick=()=>{mode="solo";say("");startPolling();renderAll()};
$("m-duo").onclick=()=>{mode="duo";say("");startPolling();renderAll();matchId?refreshMatch():refreshList()};
const q=new URLSearchParams(location.search).get("join");
solo=fresh(today);
if(q){joinCode=q.toUpperCase().slice(0,6);mode="duo";try{history.replaceState(null,"",location.pathname)}catch(e){}}
startPolling();renderAll();
if(mode==="duo"){if(joinCode&&myName)joinMatch(joinCode);else refreshList()}
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
