const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tabState = new Map();
const KEYS = {session:'csc451.session.v2', legacy:'csc451.session.v1', history:'csc451.history.v1', flags:'csc451.flags.v1', reviews:'csc451.reviews.v1', bank:'csc451.variants.v1', network:'csc451.network.v1'};
const MODES = ['quiz','recall','variants','smart'];
const SCOPES = ['all','mcq','concepts','backprop','missed','flagged','ai'];
const LETTERS = ['A','B','C','D'];
const icons = {
 arrow:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
 bookmark:'<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4V4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
 check:'<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m4 10 4 4 8-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
 cross:'<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
};
let baseQuestions=[], recall={}, byId=new Map(), state, history=[], reviews={}, bank={}, flags=new Set(), storageOK=true;
const NETWORK_ID='csc451-c-network-v1';
let networkWork={version:1,networkId:NETWORK_ID,values:{},updatedAt:0,open:true,backwardOpen:false},backpropLessonState=null;
let activityState={busy:false,jobId:null,error:'',phase:'',run:0,anchor:null,kind:'generate'};
const isBackpropHash=()=>location.hash==='#backprop';
const isLearningHash=()=>location.hash==='#learn'||location.hash.startsWith('#lesson-')||isBackpropHash();
let learningOpen=isLearningHash(), lessonMounted=false,backpropMounted=false,learningTopic=isBackpropHash()?'backprop':'metrics';
let historyOpen=location.hash==='#history', historyMounted=false, archiveReady=false, archiveTimer=null, archiveProblem='',lastArchiveTime=0;
let archivedIds=new Set(), serverRestoredState=false;

const plainObject = value => value !== null && typeof value==='object' && !Array.isArray(value);
function read(key, fallback) { return tabState.has(key)?structuredClone(tabState.get(key)):fallback; }

function save(key,value) { tabState.set(key,structuredClone(value));return true; }

function cleanNetworkWork(value) {
 if(!plainObject(value)||value.version!==1||value.networkId!==NETWORK_ID||!plainObject(value.values)||!Number.isSafeInteger(value.updatedAt)||value.updatedAt<0)return null;
 const values=Object.fromEntries(StudyNetwork.FIELD_KEYS.filter(key=>typeof value.values[key]==='string').map(key=>[key,value.values[key].slice(0,120)]));
 return {version:1,networkId:NETWORK_ID,values,updatedAt:value.updatedAt,open:typeof value.open==='boolean'?value.open:true,backwardOpen:value.backwardOpen===true};
}
function copyNetworkWork() {return {...networkWork,values:{...networkWork.values}};}
function recoverNetworkWork(value) {
 const candidate=cleanNetworkWork(value);
 if(candidate&&candidate.updatedAt>networkWork.updatedAt)networkWork=candidate;
}
function recoverBackpropLesson(value) {
 const candidate=StudyBackprop.sanitizeState(value);
 if(candidate&&(!backpropLessonState||candidate.updatedAt>backpropLessonState.updatedAt))backpropLessonState=candidate;
}
function saveNetworkWork() {
 networkWork.updatedAt=Math.max(Date.now(),networkWork.updatedAt+1);
 persist();
}
function saveStatus() { $('#save-status').textContent='This tab only · refresh resets'; const label=$('[data-network-save]');if(label)label.textContent='This tab only'; }

function persist() { state.networkWork=copyNetworkWork();if(backpropLessonState)state.backpropLesson=structuredClone(backpropLessonState);saveStatus(); }

function uniqueId(prefix='event') {return prefix+'-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));}
function contentHash(value) {let h=2166136261;for(const ch of JSON.stringify(value))h=Math.imul(h^ch.charCodeAt(0),16777619);return (h>>>0).toString(36);}
function ensureRoundId() {if(state&&!state.roundId)state.roundId='round-'+state.startedAt+'-'+contentHash(state.items.map(e=>e.id));return state?.roundId;}






function archiveQuestion() {}

function archiveAnswer() {}

function archiveSnapshot() {}

function scheduleArchiveSnapshot() {}

async function initializeArchive(savedState) { return savedState; }

function importArchiveState() {}

function shuffle(values) {const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function freshSeed() {try {return crypto.getRandomValues(new Uint32Array(1))[0];}catch{return Date.now()>>>0;}}
const isRecall = () => state.mode==='recall'||state.mode==='smart';
const currentEntry = () => state.items[state.cursor];
const currentQuestion = () => byId.get(currentEntry()?.id);
const isShortAnswer = (q=currentQuestion()) => q?.part==='B' && /^B(?:[1-9]|10)$/.test(q.id);
const answerFor = entry => state.answers[entry.key];
const isAnswered = entry => !!answerFor(entry);
function choiceOrder(q) {return state.optionOrder[q.id] || [0,1,2,3];}
function letterFor(q,index) {return LETTERS[choiceOrder(q).indexOf(index)] || '—';}
function recallFor(q) {return recall[q.id] || q.recall || {prompt:q.prompt,answer:q.choices[q.correct].text,checklist:[q.choices[q.correct].explanation]};}
function labelFor(q) {return q.aiGenerated?'AI'+q.number:q.generated?'V'+(q.number||q.id.split('-').at(-1)):q.id;}
function counts() {const answered=state.items.filter(isAnswered);return {answered:answered.length,correct:answered.filter(e=>answerFor(e).correct).length,total:state.items.length};}
function reviewSummary() {return StudyScheduler.summary(reviews,Date.now());}
function whenDue(time) {
 if(!Number.isFinite(time))return '';
 const diff=time-Date.now();
 if(diff<=0)return 'Due now';
 if(diff<3600000)return `In ${Math.max(1,Math.ceil(diff/60000))} min`;
 if(diff<86400000)return `In ${Math.ceil(diff/3600000)} h`;
 return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(new Date(time));
}
function scopeIds(scope) {
 if(scope==='ai')return Object.values(bank).filter(q=>q.aiGenerated).sort((a,b)=>b.number-a.number).map(q=>q.id);
 if(scope==='missed')return [...new Set(history[0]?.missed || [])].filter(id=>byId.has(id));
 if(scope==='flagged')return [...flags].filter(id=>byId.has(id));
 return baseQuestions.filter(q=>scope==='all'||q.part===({mcq:'A',concepts:'B',backprop:'C'}[scope])).map(q=>q.id);
}
function smartIds(early=false) {
 const due=StudyScheduler.dueIds(reviews,Date.now()).filter(id=>byId.has(id));
 const unseen=baseQuestions.filter(q=>!reviews[q.id]).map(q=>q.id);
 if(early && !due.length && !unseen.length)return Object.keys(reviews).filter(id=>byId.has(id)).sort((a,b)=>reviews[a].dueAt-reviews[b].dueAt).slice(0,12);
 return [...due,...unseen].slice(0,12);
}
function registerVariants(generated) {
 for(const q of generated){if(!StudyVariants.verify(q))throw Error('A generated question failed verification');bank[q.id]=q;byId.set(q.id,q);archiveQuestion(q);}
 save(KEYS.bank,bank);
}
function newRound({mode=state?.mode || 'quiz',scope=state?.scope || 'all',doShuffle=state?.shuffle || false,ids,early=false}={}) {
 if(state&&archiveReady)archiveSnapshot(state.finished?'completed':'replaced');
 leaveLearning();
 let seed=null;
 if(mode==='variants'&&!ids){seed=freshSeed();const generated=StudyVariants.generate(seed,12);registerVariants(generated);ids=generated.map(q=>q.id);}
 if(!ids)ids=mode==='smart'?smartIds(early):scopeIds(scope);
 ids=ids.filter(id=>byId.has(id));
 if(doShuffle&&mode!=='smart')ids=shuffle(ids);
 state={version:2,roundId:uniqueId('round'),mode,scope,shuffle:doShuffle,seed,items:ids.map((id,i)=>({id,key:`${id}~${i}`,retry:0})),cursor:0,optionOrder:Object.fromEntries(ids.map(id=>[id,doShuffle?shuffle([0,1,2,3]):[0,1,2,3]])),answers:{},drafts:{},revealed:{},finished:false,recorded:false,startedAt:Date.now()};
 archiveSnapshot();
 persist();render();
}
function renderChrome() {
 const c=counts(),r=reviewSummary();
 const area=historyOpen?'history':learningOpen?'learn':'practice';
 document.querySelectorAll('[data-area]').forEach(button=>{button.disabled=activityState.busy;if(button.dataset.area===area)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
 $('#mode-control').hidden=historyOpen||learningOpen;
 $('#workspace').setAttribute('aria-label',historyOpen?'Study progress':learningOpen?(learningTopic==='backprop'?'Learn backpropagation':'Learn metrics'):'Practice question');
 $('#mode-select').value=historyOpen?'history':learningOpen?'learn':state.mode;$('#scope-select').value=state.scope;$('#shuffle-toggle').checked=state.shuffle;
 for(const selector of ['#mode-select','#scope-select','#shuffle-toggle','#restart-button','#smart-review-button'])$(selector).disabled=activityState.busy;
 $('#scope-control').hidden=historyOpen||learningOpen||state.mode==='variants'||state.mode==='smart';$('#shuffle-control').hidden=historyOpen||learningOpen||state.mode==='smart';
 $('#restart-button').hidden=historyOpen||learningOpen;
 $('.study-progress').hidden=historyOpen||learningOpen;
 $('.keyboard-hint').hidden=historyOpen||learningOpen;
 document.body.classList.toggle('learning-mode',learningOpen||historyOpen);
 $('#restart-button span').textContent=state.mode==='variants'?'New set':'Restart';
 $('#restart-button').title=state.mode==='variants'?'Generate new calculations':'Start a new round';
 $('#progress-label').textContent=`${c.answered} / ${c.total} ${isRecall()?'reviewed':'answered'}`;
 $('#progress-fill').style.width=`${c.total?c.answered/c.total*100:0}%`;
 const progress=$('#progress-fill').parentElement;progress.setAttribute('role','progressbar');progress.setAttribute('aria-label',isRecall()?'Questions reviewed':'Questions answered');progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax',String(c.total));progress.setAttribute('aria-valuenow',String(c.answered));
 $('#session-stats').innerHTML=`<div class="stat"><strong>${c.correct}<span> / ${c.answered}</span></strong><span>${isRecall()?'Got it':'Correct'}</span></div><div class="stat"><strong>${history.length}</strong><span>Rounds completed</span></div>`;
 $('#due-count').textContent=`${r.due} due`;
 $('#review-status').textContent=r.total?(r.due?'Ready to review':`Next review · ${whenDue(r.nextDueAt)}`):'Build your review as you practice';
 $('#question-nav').innerHTML=state.items.map((entry,i)=>{const q=byId.get(entry.id),a=answerFor(entry);return `<button type="button" class="nav-question ${i===state.cursor&&!state.finished?'is-current':''} ${a?(a.correct?'is-correct':'is-wrong'):''} ${flags.has(entry.id)?'is-bookmarked':''}" data-nav="${i}" ${activityState.busy?'disabled':''} ${i===state.cursor&&!state.finished?'aria-current="step"':''} aria-label="${esc(q.aiGenerated?'AI question '+q.number:q.generated?'Calculation '+labelFor(q):q.id)}${entry.retry?', repeat '+entry.retry:''}${a?(a.correct?', got it':', needs review'):', unanswered'}${flags.has(entry.id)?', bookmarked':''}">${esc(labelFor(q))}${entry.retry?'↻':''}</button>`;}).join('');
 $('.keyboard-hint').innerHTML=isShortAnswer()?'<span><kbd>Ctrl</kbd> + <kbd>↵</kbd> Grade / Next</span><span><kbd>F</kbd> Bookmark</span>':isRecall()?'<span><kbd>Ctrl</kbd> + <kbd>↵</kbd> Reveal / Next</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> Rate</span><span><kbd>F</kbd> Bookmark</span>':'<span><kbd>A</kbd><kbd>B</kbd><kbd>C</kbd><kbd>D</kbd> Choose</span><span><kbd>↵</kbd> Next</span><span><kbd>←</kbd><kbd>→</kbd> Navigate</span><span><kbd>F</kbd> Bookmark</span>';
 saveStatus();
}
function confusion(q) {
 const m=q.matrix || {tp:8,fn:2,fp:8,tn:82},total=m.tp+m.fn+m.fp+m.tn;
 return `<div class="context-panel"><div class="context-heading">Confusion matrix <span>${total} examples · Positive class</span></div><table class="confusion-table"><caption class="sr-only">Confusion matrix</caption><thead><tr><th scope="col"></th><th scope="col">Predicted positive</th><th scope="col">Negative</th></tr></thead><tbody><tr><th scope="row">Actually positive</th><td><strong>${m.tp}</strong> <span>TP</span></td><td><strong>${m.fn}</strong> <span>FN</span></td></tr><tr><th scope="row">Negative</th><td><strong>${m.fp}</strong> <span>FP</span></td><td><strong>${m.tn}</strong> <span>TN</span></td></tr></tbody></table></div>`;
}
function network() {
 return StudyNetwork.render(networkWork.values,{open:networkWork.open,backwardOpen:networkWork.backwardOpen,savedLabel:'This tab only'})+'<div class="network-lesson-link"><button type="button" class="text-button" data-open-backprop>Learn backpropagation →</button></div>';
}
function emptyView() {
 const smart=state.mode==='smart',s=reviewSummary();
 $('#workspace').innerHTML=`<section class="empty-state smart-empty"><div class="question-meta">${smart?'Smart review':state.scope==='flagged'?'Bookmarked':'Missed questions'}</div><h1>${smart?'You’re up to date.':'Nothing here yet.'}</h1>${smart&&s.nextDueAt?`<p class="next-review">Next review · ${whenDue(s.nextDueAt)}</p>`:''}<div class="results-actions"><button type="button" class="primary-button" data-action="all">Practice questions ${icons.arrow}</button>${smart&&s.total?'<button type="button" class="secondary-button" data-action="early">Review early</button>':''}</div></section>`;
}
function questionActions(answered) {
 const c=counts(),complete=c.answered===c.total;
 return `<div class="question-actions"><button type="button" class="secondary-button" id="previous-button" ${state.cursor===0||activityState.busy?'disabled':''}>← Previous</button><span class="question-step">${state.cursor+1}<span> / ${state.items.length}</span></span><button type="button" class="primary-button" id="next-button" ${!answered||activityState.busy?'disabled':''}>${complete?'Results':'Next'} ${icons.arrow}</button></div>`;
}
function aiTools() { return ''; }

























function firstSentence(text) {
 if(globalThis.Intl?.Segmenter)return [...new Intl.Segmenter('en',{granularity:'sentence'}).segment(text)][0]?.segment.trim()||text;
 return text.match(/^.*?[.!?](?:\s|$)/)?.[0].trim()||text;
}
function shortAnswerResponse(entry,a,r) {
 const shown=!!state.revealed[entry.key];
 const input='<div class="short-answer-response recall-response"><label for="short-answer-input">Your answer</label><textarea id="short-answer-input" aria-label="Your answer" rows="5" maxlength="10000" placeholder="Explain it in your own words…" '+(shown?'readonly':'')+'>'+esc(state.drafts[entry.key]||'')+'</textarea></div>';
 if(!shown)return input+'<div class="recall-actions"><button type="button" class="primary-button" id="reveal-written">Check with model answer</button><span class="recall-notice">Ctrl + Enter</span></div>';
 return input+'<section class="model-answer" aria-label="Model answer"><h2>Model answer</h2><p>'+esc(r.answer)+'</p><details class="recall-check-details"><summary>Key points</summary><ul>'+r.checklist.map(p=>'<li>'+esc(p)+'</li>').join('')+'</ul></details></section><div class="recall-notice">Self-check</div><div class="rating-controls" aria-label="Rate your answer">'+[['again','Again'],['hard','Almost'],['good','Got it']].map(([v,label])=>'<button type="button" class="rating-button '+v+'" data-written-rating="'+v+'" '+(a?'disabled':'')+'>'+label+'</button>').join('')+'</div><button type="button" class="text-button" id="edit-answer">Edit answer</button>';
}
function revealWritten(){const e=currentEntry();if(!e||!isShortAnswer())return;state.revealed[e.key]=true;persist();render();}
function rateWritten(rating){const e=currentEntry();if(!e||!isShortAnswer()||!state.revealed[e.key]||answerFor(e)||!['again','hard','good'].includes(rating))return;state.answers[e.key]={choice:null,correct:rating==='good',rating,assessed:true};scheduleAnswer(e,rating);persist();render();$('#next-button')?.focus({preventScroll:true});}






function editGrade() { const entry=currentEntry();delete state.answers[entry.key];delete state.revealed[entry.key];state.finished=false;state.recorded=false;persist();render();$('#short-answer-input')?.focus(); }





function startStudyReview() { showHistory(); }

function renderQuestion() {
 const entry=currentEntry(),q=currentQuestion();if(!q){emptyView();return;}
 const a=answerFor(entry),r=recallFor(q),shown=state.revealed[entry.key],recallMode=isRecall(),written=isShortAnswer(q);
 const modeLabel=written?'Short answer · Self-check':state.mode==='smart'?(reviews[q.id]?'Smart review':'New in review'):state.mode==='recall'?'Recall':q.aiGenerated?'AI variant':q.generated?'Fresh calculation':q.adapted?'Adapted':'';
 let response;
 if(written){response=shortAnswerResponse(entry,a,r);}
 else if(recallMode){
  response=`<div class="recall-response"><label for="recall-input">Your answer</label><textarea id="recall-input" rows="4" maxlength="10000" placeholder="Write it out, or answer aloud…" ${shown?'readonly':''}>${esc(state.drafts[entry.key] || '')}</textarea></div>${!shown?'<div class="recall-actions"><button type="button" class="primary-button" id="reveal-button">Reveal answer</button><span class="recall-notice">Ctrl + Enter</span></div>':`<section class="model-answer" aria-label="Model answer"><h2>Model answer</h2><p>${esc(r.answer)}</p><details class="recall-check-details"><summary>Key points</summary><ul class="recall-checklist">${r.checklist.map(point=>`<li>${esc(point)}</li>`).join('')}</ul></details></section><div class="recall-notice">Self-check</div><div class="rating-controls" role="group" aria-label="Rate your recall">${[['again','Again'],['hard','Almost'],['good','Got it']].map(([value,label],i)=>`<button type="button" class="rating-button ${value}" data-rating="${value}" aria-pressed="${a?.rating===value}" ${a?'aria-disabled="true"':''}><span>${label}</span><small>${i+1}</small></button>`).join('')}</div>`}`;
 }else{
  response=`<div class="answers" role="group" aria-label="Answer choices">${choiceOrder(q).map((i,displayIndex)=>{const choice=q.choices[i],correct=i===q.correct;return `<button type="button" class="answer ${a?(correct?'is-correct':a.choice===i?'is-wrong':'is-muted'):''} ${a?.choice===i?'is-selected':''}" data-answer="${i}" ${a?'aria-disabled="true"':''}><span class="answer-letter">${LETTERS[displayIndex]}</span><span class="answer-content"><span class="answer-text">${esc(choice.text)}</span></span>${a?`<span class="answer-state">${correct?icons.check:a.choice===i?icons.cross:''}<span class="sr-only">${correct?'Correct answer':a.choice===i?'Your answer, incorrect':'Incorrect option'}</span></span>`:''}</button>`;}).join('')}</div>`;
 }
 const feedback=written?'':a?(recallMode?`${a.rating==='good'?'Got it':a.rating==='hard'?'Almost':'Review again'} · ${whenDue(reviews[q.id]?.dueAt)}`:a.correct?'Correct.':`Correct answer: ${letterFor(q,q.correct)}.`):recallMode?(shown?'Rate your answer to continue':''):'Select an answer';
 const explanation=a&&!written&&!recallMode?`<p class="feedback-summary">${esc(firstSentence(q.choices[a.choice].explanation))}</p><details class="answer-breakdown"><summary>All explanations</summary>${choiceOrder(q).map((i,index)=>`<div class="answer-breakdown-row ${i===q.correct?'is-correct':''}"><span class="answer-letter">${LETTERS[index]}</span><div><strong>${esc(q.choices[i].text)}${i===q.correct?' <span class="sr-only">(Correct)</span>':''}</strong><p class="answer-explanation">${esc(q.choices[i].explanation)}</p></div></div>`).join('')}</details>`:'';
 $('#workspace').innerHTML=`<article class="question-view"><div class="question-meta"><span class="part-label">${esc(labelFor(q))} <span class="meta-divider">/</span> ${state.cursor+1} of ${state.items.length}</span><span class="topic-label">${esc(q.topic)}${modeLabel?` <span class="adapted-label">${esc(modeLabel)}</span>`:''}${entry.retry?' <span class="adapted-label">Repeat</span>':''}</span></div><div class="question-heading"><h1 class="question-title">${esc(written||recallMode&&!q.generated?r.prompt:q.prompt)}</h1><button type="button" id="bookmark-button" class="icon-button bookmark-button ${flags.has(q.id)?'is-active':''}" aria-label="${flags.has(q.id)?'Remove bookmark':'Bookmark question'}" aria-pressed="${flags.has(q.id)}">${icons.bookmark}</button></div>${q.code?`<pre class="code-block"><code>${esc(q.code)}</code></pre>`:''}${q.context==='confusion'?confusion(q):q.context==='network'?network():''}${response}<div ${written?'hidden':''} class="feedback ${a?(a.correct?'correct':'wrong'):''}" role="status" aria-live="polite">${a?(a.correct?icons.check:icons.cross):''}<span>${feedback}</span></div>${explanation}${aiTools(q)}${questionActions(!!a)}</article>`;
}
function scheduleAnswer(entry,rating) {
 reviews[entry.id]=StudyScheduler.rate(reviews[entry.id] || null,rating,Date.now());save(KEYS.reviews,reviews);
 // In Smart review, retry a weak answer after three other questions, at most twice.
 if(state.mode==='smart'&&rating!=='good'&&entry.retry<2&&state.items.length-state.cursor-1>=3&&!state.items.slice(state.cursor+1).some(e=>e.id===entry.id)){
  state.items.splice(state.cursor+4,0,{id:entry.id,key:`${entry.key}:retry${entry.retry+1}`,retry:entry.retry+1});
 }
}
function choose(index) {
 const entry=currentEntry(),q=currentQuestion();if(!entry||isShortAnswer(q)||isRecall()||state.finished||answerFor(entry)||!Number.isInteger(index)||index<0||index>3)return;
 const correct=index===q.correct,rating=correct?'good':'again';state.answers[entry.key]={choice:index,correct,rating,assessed:false};scheduleAnswer(entry,rating);archiveAnswer(entry);persist();render();$(`[data-answer="${index}"]`).focus({preventScroll:true});
}
function reveal() {
 const entry=currentEntry();if(!entry||isShortAnswer()||!isRecall()||state.finished||state.revealed[entry.key])return;
 state.revealed[entry.key]=true;persist();render();$('.model-answer').setAttribute('tabindex','-1');$('.model-answer').focus({preventScroll:true});
}
function rateRecall(rating) {
 const entry=currentEntry();if(!entry||isShortAnswer()||!isRecall()||!state.revealed[entry.key]||answerFor(entry)||!['again','hard','good'].includes(rating))return;
 state.answers[entry.key]={choice:null,correct:rating==='good',rating,assessed:true};scheduleAnswer(entry,rating);archiveAnswer(entry);persist();render();$(`[data-rating="${rating}"]`).focus({preventScroll:true});
}
function finish() {
 if(!state.items.length||counts().answered!==state.items.length)return;
 state.finished=true;
 if(!state.recorded){const c=counts();history.unshift({date:Date.now(),roundId:ensureRoundId(),mode:state.mode,scope:state.scope,signature:state.mode+'|'+state.items.map(e=>e.id).sort().join('|'),total:c.total,correct:c.correct,missed:[...new Set(state.items.filter(e=>!answerFor(e).correct).map(e=>e.id))]});save(KEYS.history,history);state.recorded=true;}
 archiveSnapshot('completed');
 persist();render();focusWorkspace();
}
function renderResults() {
 const c=counts(),percent=Math.round(c.correct/c.total*100)||0,missed=[...new Set(state.items.filter(e=>!answerFor(e).correct).map(e=>e.id))],recallMode=state.items.every(e=>answerFor(e).assessed);
 const signature=state.mode+'|'+state.items.map(e=>e.id).sort().join('|');
 const comparable=history.filter(h=>h.signature===signature),best=Math.max(percent,...comparable.map(h=>Math.round(h.correct/h.total*100)));
 const topics=[...new Set(state.items.map(e=>byId.get(e.id).topic))],s=reviewSummary(),newCount=baseQuestions.filter(q=>!reviews[q.id]).length;
 $('#workspace').innerHTML=`<section class="results"><div class="question-meta">Round complete${recallMode?' · Self-assessed':''}</div><div class="results-hero"><div><h1>${recallMode?'Recall complete.':percent===100?'All correct.':percent>=80?'Looking strong.':'Keep practicing.'}</h1><p class="results-caption">${c.correct} ${recallMode?'got it':'correct'} · ${c.total-c.correct} to review</p></div><div class="score-ring" style="--score:${percent}%" aria-label="${recallMode?'Self-assessed recall':'Score'} ${percent} percent"><strong>${percent}<span>%</span></strong></div></div><div class="results-stats"><div><strong>${c.total}</strong><span>${recallMode?'Reviewed':'Questions'}</span></div><div><strong>${best}%</strong><span>Best this set</span></div><div><strong>${s.due}</strong><span>Due for review</span></div></div><div class="results-actions"><button type="button" class="primary-button" data-action="review">Session summary</button><button type="button" class="secondary-button" data-action="smart">${s.due||newCount?'Continue smart review':'Smart review'} ${icons.arrow}</button><button type="button" class="secondary-button" data-action="missed" ${!missed.length?'disabled':''}>Review missed (${missed.length})</button><button type="button" class="secondary-button" data-action="repeat">${state.mode==='variants'?'New calculations':'New shuffled round'}</button></div>${s.nextDueAt?`<p class="next-review">${s.due?'Ready to review':`Next review · ${whenDue(s.nextDueAt)}`}</p>`:''}<div class="topic-results"><h2>By topic</h2>${topics.map(t=>{const entries=state.items.filter(e=>byId.get(e.id).topic===t),n=entries.filter(e=>answerFor(e).correct).length;return `<div class="topic-result"><span>${esc(t)}</span><div class="topic-track"><i style="width:${n/entries.length*100}%"></i></div><strong>${n} / ${entries.length}</strong></div>`;}).join('')}</div><div class="review-heading"><h2>Review answers</h2><button type="button" class="text-button" id="review-filter" aria-pressed="false">Missed only</button></div><div class="review-list">${state.items.map((entry,i)=>{const q=byId.get(entry.id),a=answerFor(entry);return `<button type="button" class="review-item ${a.correct?'review-correct':'review-wrong'}" data-review="${i}"><span class="review-mark">${a.correct?icons.check:icons.cross}</span><span class="review-question"><strong>${esc(labelFor(q))}${entry.retry?'↻':''}</strong> ${esc(isShortAnswer(q)||recallMode&&!q.generated?recallFor(q).prompt:q.prompt)}</span><span class="review-answer">${a.aiGraded?a.grade.verdict:a.assessed?(a.rating==='good'?'Got it':a.rating==='hard'?'Almost':'Again'):letterFor(q,a.choice)+(a.correct?'':' → '+letterFor(q,q.correct))}</span></button>`;}).join('')}</div><div class="history-line">${history.length} completed round${history.length===1?'':'s'} in this tab</div></section>`;
}
function unmountLessons() {
 if(lessonMounted){StudyLessons.unmount();lessonMounted=false;}
 if(backpropMounted){StudyBackprop.unmount();backpropMounted=false;}
}
function leaveLearning() {
 unmountLessons();
 
 learningOpen=false;historyOpen=false;
 if(isLearningHash()||location.hash==='#history'){const url=new URL(location.href);url.hash='';window.history.replaceState(null,'',url.href);}
}
function showLearning(topic=learningTopic) {
 if(activityState.busy)return;
 topic=topic==='backprop'?'backprop':'metrics';
 if(topic!==learningTopic)unmountLessons();
 learningTopic=topic;
 historyOpen=false;
 learningOpen=true;window.history.replaceState(null,'',topic==='backprop'?'#backprop':'#learn');render();focusWorkspace();
}
function showHistory() { unmountLessons();learningOpen=false;historyOpen=true;window.history.replaceState(null,'','#history');render();focusWorkspace(); }



function render() {
 renderChrome();
 if(historyOpen){
  const c=counts();$('#workspace').innerHTML='<section class="empty-state"><div class="question-meta">Current tab</div><h1>This session</h1><p>'+c.correct+' correct · '+c.answered+' answered · '+c.total+' questions</p><p>Nothing is saved. Refresh to reset.</p></section>';
  return;
 }
 if(learningOpen){
  if(!lessonMounted&&!backpropMounted){
   $('#workspace').innerHTML=`<nav class="learning-topics" aria-label="Learning topics"><button type="button" data-learning-topic="metrics" ${learningTopic==='metrics'?'aria-current="page"':''}>Metrics</button><button type="button" data-learning-topic="backprop" ${learningTopic==='backprop'?'aria-current="page"':''}>Backpropagation</button></nav><div id="learning-content"></div>`;
   if(learningTopic==='backprop'){
    StudyBackprop.mount($('#learning-content'),{initialState:backpropLessonState,onStateChange:value=>{backpropLessonState=value;persist();},onPractice:()=>confirmNewRound(()=>{newRound({mode:'quiz',scope:'backprop',doShuffle:false});focusWorkspace();})});backpropMounted=true;
   }else{StudyLessons.mount($('#learning-content'),{onPractice:()=>confirmNewRound(()=>{newRound({mode:'quiz',scope:'all',doShuffle:false,ids:['A35','A36','A37','A38','A39','B7']});focusWorkspace();})});lessonMounted=true;}
  }
  return;
 }
 unmountLessons();
 state.finished?renderResults():renderQuestion();
}
function focusWorkspace() {$('#workspace').focus({preventScroll:true});window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
function closeNav() {$('#study-sidebar').classList.remove('is-open');$('#nav-toggle').setAttribute('aria-expanded','false');}
function go(index) {if(activityState.busy||index<0||index>=state.items.length)return;leaveLearning();state.cursor=index;state.finished=false;persist();render();closeNav();focusWorkspace();}
function next() {if(activityState.busy||state.finished||!state.items.length)return;if(counts().answered===state.items.length){finish();return;}if(!isAnswered(currentEntry()))return;go(state.cursor<state.items.length-1?state.cursor+1:state.items.findIndex(e=>!isAnswered(e)));}
function toggleBookmark() {const q=currentQuestion();if(!q||state.finished)return;flags.has(q.id)?flags.delete(q.id):flags.add(q.id);persist();render();$('#bookmark-button').focus({preventScroll:true});}
function hasWork() {return Object.keys(state.answers).length||Object.values(state.drafts).some(text=>text.trim())||Object.values(state.revealed).some(Boolean);}
function confirmNewRound(onConfirm) {
 if(!hasWork()||state.finished){onConfirm();return;}
 const dialog=document.createElement('dialog');dialog.className='round-dialog';dialog.innerHTML='<form method="dialog"><h2>Start a new round?</h2><p>Refresh clears this demo.</p><div><button class="secondary-button" value="cancel">Keep studying</button><button class="primary-button" value="start">Start new round</button></div></form>';
 document.body.append(dialog);dialog.addEventListener('close',()=>{if(dialog.returnValue==='start')onConfirm();else renderChrome();dialog.remove();});dialog.showModal();
}
function startSmart(early=false) {confirmNewRound(()=>{newRound({mode:'smart',early});focusWorkspace();});}
function setupEvents() {
 document.querySelectorAll('[data-area]').forEach(button=>button.addEventListener('click',()=>{if(activityState.busy)return;closeNav();if(button.dataset.area==='learn')showLearning();else if(button.dataset.area==='history')showHistory();else{leaveLearning();render();focusWorkspace();}}));
 $('#workspace').addEventListener('input',event=>{
  const field=event.target.dataset.networkField;
  if(!learningOpen&&!historyOpen&&currentQuestion()?.context==='network'&&StudyNetwork.FIELD_KEYS.includes(field)){
   networkWork.values[field]=event.target.value.slice(0,120);saveNetworkWork();
  }
 });
 $('#workspace').addEventListener('toggle',event=>{
  const panel=event.target;
  if(!panel.matches?.('[data-network-panel],[data-network-backward]'))return;
  const key=panel.hasAttribute('data-network-panel')?'open':'backwardOpen';
  if(networkWork[key]!==panel.open){networkWork[key]=panel.open;saveNetworkWork();}
 },true);
 $('#workspace').addEventListener('input',event=>{if(!learningOpen&&event.target.id==='recall-input'&&!state.revealed[currentEntry().key]){state.drafts[currentEntry().key]=event.target.value;persist();}else if(!learningOpen&&event.target.id==='short-answer-input'){state.drafts[currentEntry().key]=event.target.value;persist();const button=$('#grade-answer');if(button)button.disabled=activityState.busy||location.protocol==='file:'||!event.target.value.trim();}});
 $('#workspace').addEventListener('click',event=>{
  const topic=event.target.closest('[data-learning-topic]')?.dataset.learningTopic;
  if(topic){showLearning(topic);return;}
  if(event.target.closest('[data-open-backprop]')){showLearning('backprop');return;}
  if(learningOpen||historyOpen)return;
  if(event.target.closest('#reveal-written')){revealWritten();return;}
  const writtenRating=event.target.closest('[data-written-rating]');if(writtenRating){rateWritten(writtenRating.dataset.writtenRating);return;}
  if(event.target.closest('#edit-answer')){editGrade();return;}
  const answer=event.target.closest('[data-answer]');if(answer){choose(Number(answer.dataset.answer));return;}
  const rating=event.target.closest('[data-rating]');if(rating){rateRecall(rating.dataset.rating);return;}
  const review=event.target.closest('[data-review]');if(review){go(Number(review.dataset.review));return;}
  if(event.target.closest('#reveal-button'))reveal();
  if(event.target.closest('#next-button'))next();
  if(event.target.closest('#previous-button'))go(state.cursor-1);
  if(event.target.closest('#bookmark-button'))toggleBookmark();
  if(event.target.closest('#review-filter')){const b=$('#review-filter'),filter=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(filter));document.querySelectorAll('.review-correct').forEach(el=>el.hidden=filter);}
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='all')newRound({mode:'quiz',scope:'all',doShuffle:false});
  if(action==='early')newRound({mode:'smart',early:true});
  if(action==='smart')startSmart();
  if(action==='review')startStudyReview();
  if(action==='missed')newRound({mode:isRecall()?'recall':'quiz',scope:'missed',doShuffle:true,ids:[...new Set(state.items.filter(e=>!answerFor(e).correct).map(e=>e.id))]});
  if(action==='repeat')newRound({mode:state.mode,scope:state.scope,doShuffle:true,...(state.mode==='variants'||state.mode==='smart'?{}:{ids:[...new Set(state.items.map(e=>e.id))]})});
 });
 $('#question-nav').addEventListener('click',e=>{const b=e.target.closest('[data-nav]');if(b)go(Number(b.dataset.nav));});
 $('#mode-select').addEventListener('change',e=>{const mode=e.target.value;if(mode==='history'){showHistory();return;}if(mode==='learn'){showLearning();return;}if((learningOpen||historyOpen)&&mode===state.mode){leaveLearning();render();focusWorkspace();return;}confirmNewRound(()=>{newRound({mode});focusWorkspace();});});
 $('#scope-select').addEventListener('change',e=>{const scope=e.target.value;confirmNewRound(()=>{newRound({scope});focusWorkspace();});});
 $('#shuffle-toggle').addEventListener('change',e=>{const doShuffle=e.target.checked;confirmNewRound(()=>{newRound({doShuffle});focusWorkspace();});});
 $('#restart-button').addEventListener('click',()=>confirmNewRound(()=>{newRound();focusWorkspace();}));
 $('#smart-review-button').addEventListener('click',()=>startSmart());
 $('#nav-toggle').addEventListener('click',()=>{const open=$('#study-sidebar').classList.toggle('is-open');$('#nav-toggle').setAttribute('aria-expanded',String(open));});
 document.addEventListener('keydown',e=>{
  if(learningOpen||historyOpen)return;
  if(document.querySelector('dialog[open]')||e.repeat||state.finished||!state.items.length)return;
  if(e.target.closest('summary,a[href]'))return;
  if(isShortAnswer()){
   if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();answerFor(currentEntry())?next():revealWritten();return;}
   if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,select,textarea'))return;
   if(e.key==='ArrowRight'||e.key==='Enter'){e.preventDefault();next();}else if(e.key==='ArrowLeft'){e.preventDefault();go(state.cursor-1);}else if(e.key.toLowerCase()==='f'){e.preventDefault();toggleBookmark();}
   return;
  }
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&isRecall()){e.preventDefault();state.revealed[currentEntry().key]?next():reveal();return;}
  if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,select,textarea'))return;
  const key=e.key.toLowerCase();
  if(!isRecall()&&LETTERS.includes(key.toUpperCase())){e.preventDefault();choose(choiceOrder(currentQuestion())[LETTERS.indexOf(key.toUpperCase())]);}
  else if(['1','2','3','4'].includes(key)){e.preventDefault();if(isRecall()){if(state.revealed[currentEntry().key]&&Number(key)<=3)rateRecall(['again','hard','good'][Number(key)-1]);}else choose(choiceOrder(currentQuestion())[Number(key)-1]);}
  else if(e.key==='ArrowRight'||(e.key==='Enter'&&(!e.target.closest('button')||e.target.closest('.answer,.rating-button')))){e.preventDefault();next();}
  else if(e.key==='ArrowLeft'){e.preventDefault();go(state.cursor-1);}
  else if(key==='f'){e.preventDefault();toggleBookmark();}
  else if(e.key==='Escape')closeNav();
 });
 window.addEventListener('focus',()=>{if(state)renderChrome();});
 window.addEventListener('hashchange',()=>{if(location.hash==='#history'){showHistory();}else if(isLearningHash()){
  const topic=isBackpropHash()?'backprop':'metrics';
  if(!learningOpen||topic!==learningTopic){unmountLessons();historyOpen=false;learningOpen=true;learningTopic=topic;render();}
 }else if(learningOpen||historyOpen){leaveLearning();render();}});
 
 window.addEventListener('blur',()=>{archiveSnapshot();});
 setInterval(()=>{if(state)renderChrome();},60000);
}
function validQuestion(q) {return q&&typeof q.id==='string'&&typeof q.prompt==='string'&&typeof q.topic==='string'&&Array.isArray(q.choices)&&q.choices.length===4&&Number.isInteger(q.correct)&&q.correct>=0&&q.correct<4&&q.choices.every(c=>typeof c.text==='string'&&typeof c.explanation==='string');}
function validReview(r) {return plainObject(r)&&['again','hard','good'].includes(r.rating)&&['repetitions','lapses','intervalMs','dueAt','lastReviewedAt'].every(k=>Number.isFinite(r[k])&&r[k]>=0&&r[k]<=Number.MAX_SAFE_INTEGER)&&Number.isSafeInteger(r.repetitions)&&Number.isSafeInteger(r.lapses)&&r.intervalMs>0&&r.intervalMs<=60*86400000&&r.dueAt<=8640000000000000&&r.lastReviewedAt<=8640000000000000;}
function migrateLegacy(old) {
 if(!plainObject(old)||old.version!==1||!Array.isArray(old.order)||!old.order.length||!old.order.every(id=>byId.has(id)))return null;
 const items=old.order.map((id,i)=>({id,key:`${id}~${i}`,retry:0})),answers={};
 for(const e of items){const choice=old.answers?.[e.id];if(Number.isInteger(choice)&&choice>=0&&choice<4){const correct=choice===byId.get(e.id).correct;answers[e.key]={choice,correct,rating:correct?'good':'again',assessed:false,archiveEventId:old.archiveAnswerIds?.[e.id],answeredAt:old.startedAt||Date.now()};if(!reviews[e.id])reviews[e.id]=StudyScheduler.rate(null,correct?'good':'again',correct?Date.now():Date.now()-120000);}}
 save(KEYS.reviews,reviews);
 return {version:2,mode:'quiz',scope:SCOPES.includes(old.scope)?old.scope:'all',shuffle:!!old.shuffle,items,cursor:Math.min(Math.max(0,old.cursor||0),items.length-1),optionOrder:old.optionOrder||{},answers,drafts:{},revealed:{},finished:!!old.finished,recorded:!!old.recorded,startedAt:old.startedAt||Date.now()};
}
function restore(saved) {
 if(!plainObject(saved)||saved.version!==2||!MODES.includes(saved.mode)||!Array.isArray(saved.items)||saved.items.length>500||!saved.items.every(e=>plainObject(e)&&byId.has(e.id)&&typeof e.key==='string'&&Number.isInteger(e.retry)&&e.retry>=0&&e.retry<=2)||new Set(saved.items.map(e=>e.key)).size!==saved.items.length)return false;
 state=saved;state.scope=SCOPES.includes(saved.scope)?saved.scope:'all';state.cursor=Number.isInteger(saved.cursor)?Math.max(0,Math.min(saved.cursor,Math.max(0,state.items.length-1))):0;
 state.shuffle=!!saved.shuffle;state.answers=plainObject(saved.answers)?saved.answers:{};state.drafts=plainObject(saved.drafts)?saved.drafts:{};state.revealed=plainObject(saved.revealed)?saved.revealed:{};state.optionOrder=plainObject(saved.optionOrder)?saved.optionOrder:{};
 let refreshedB=false;
 for(const e of state.items){
  state.drafts[e.key]=typeof state.drafts[e.key]==='string'?state.drafts[e.key].slice(0,10000):'';
  const a=state.answers[e.key],isB=isShortAnswer(byId.get(e.id));
  if(a){
   const common=plainObject(a)&&typeof a.correct==='boolean'&&['again','hard','good'].includes(a.rating);
   const valid=common&&(a.aiGraded?(isB&&false&&a.grade.questionId===e.id&&a.grade.correct===a.correct&&a.choice===null&&a.submitted===state.drafts[e.key].trim()):(a.assessed?a.choice===null:Number.isInteger(a.choice)&&a.choice>=0&&a.choice<4));
   if(!valid||(isB&&!a.aiGraded)){delete state.answers[e.key];if(isB)refreshedB=true;}
  }
  if(isB)delete state.revealed[e.key];else if(answerFor(e)?.assessed)state.revealed[e.key]=true;
  const order=state.optionOrder[e.id];if(!Array.isArray(order)||order.length!==4||new Set(order).size!==4||!order.every(i=>Number.isInteger(i)&&i>=0&&i<4))state.optionOrder[e.id]=[0,1,2,3];
 }
 if(refreshedB){state.finished=false;state.recorded=false;}
 if(state.finished&&(!state.items.length||counts().answered!==state.items.length))state.finished=false;
 return true;
}
async function init() {
 try {
  if(!globalThis.StudyScheduler||!globalThis.StudyVariants||!globalThis.StudyNetwork||!globalThis.StudyBackprop||!globalThis.StudyBackpropCases||!globalThis.StudyBackpropEngine)throw Error('Study tools did not load');
  const getJSON=async file=>{const response=await fetch(file);if(!response.ok)throw Error('Question file unavailable');return response.json();};
  baseQuestions=window.EXAM_QUESTIONS || (await Promise.all(['questions-a.json','questions-bc.json'].map(getJSON))).flat();
  recall=window.EXAM_RECALL || await getJSON('recall.json');
  if(baseQuestions.length!==70||new Set(baseQuestions.map(q=>q.id)).size!==70||!baseQuestions.every(validQuestion)||baseQuestions.some(q=>!recall[q.id]||typeof recall[q.id].prompt!=='string'||typeof recall[q.id].answer!=='string'||!Array.isArray(recall[q.id].checklist)))throw Error('Incomplete question set');
  byId=new Map(baseQuestions.map(q=>[q.id,q]));
  const savedBank=read(KEYS.bank,{});if(plainObject(savedBank))for(const [id,q] of Object.entries(savedBank)){if(validQuestion(q)&&q.id===id&&q.generated&&StudyVariants.verify(q)){bank[id]=q;byId.set(id,q);}}
  const savedReviews=read(KEYS.reviews,{});if(plainObject(savedReviews))reviews=Object.fromEntries(Object.entries(savedReviews).filter(([id,r])=>byId.has(id)&&validReview(r)));
  const savedHistory=read(KEYS.history,[]);history=Array.isArray(savedHistory)?savedHistory.filter(h=>plainObject(h)&&Number.isInteger(h.total)&&h.total>0&&Number.isInteger(h.correct)&&h.correct>=0&&h.correct<=h.total&&Array.isArray(h.missed)):[];
  const savedFlags=read(KEYS.flags,[]);flags=new Set(Array.isArray(savedFlags)?savedFlags.filter(id=>byId.has(id)):[]);
  for(const [value,label] of [['missed','Last missed'],['flagged','Bookmarked']]){const option=document.createElement('option');option.value=value;option.textContent=label;$('#scope-select').append(option);}
  $('#shuffle-toggle').closest('label').title='Shuffle questions and answer choices';
  setupEvents();
  let saved=read(KEYS.session,null)||read(KEYS.legacy,null);
  networkWork=cleanNetworkWork(read(KEYS.network,null))||networkWork;
  recoverNetworkWork(saved?.networkWork);
  recoverBackpropLesson(saved?.backpropLesson);
  saved=await initializeArchive(saved);importArchiveState(saved);
  const requestedLearning=learningOpen,requestedHistory=historyOpen,requestedTopic=learningTopic;
  if(restore(saved?.version===1?migrateLegacy(saved):saved)){persist();render();}else newRound();
  if(requestedLearning)showLearning(requestedTopic);
  if(requestedHistory)showHistory();
  archiveSnapshot();
 }catch(error){$('#workspace').innerHTML='<div class="empty-state"><h1>Questions could not load.</h1><button class="primary-button" id="reload-button">Try again</button></div>';$('#reload-button').onclick=()=>location.reload();console.error(error);}
}
init();
