(function(){
const STORE='MY_PLAN_FINAL_V1';
let plan=null, activeTab='setup', charts={}, openNodes=new Set();
const $=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const pct=(a,b)=>b?Math.round((a/b)*100):0;

document.addEventListener('DOMContentLoaded', init);
function init(){
  if(window.pdfjsLib){ pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; }
  plan = loadPlan();
  bind();
  renderAll();
}
function bind(){
  document
    .querySelectorAll('.tab[data-tab]')
    .forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));

  $('studentName')?.addEventListener('input', e => {
    if(!plan) plan = emptyPlan();
    plan.learnerName = e.target.value.trim();
    save();
    renderHeader();
  });

  $('readPdfBtn')?.addEventListener('click', readPdf);

  $('pdfFile')?.addEventListener('change', () => {
    const f = $('pdfFile')?.files?.[0];
    setStatus(f ? `PDF selected: ${f.name}. Click Read PDF to continue.` : 'Choose a PDF first.');
  });

  $('exportPdfBtn')?.addEventListener('click', exportPdfReport);
  $('addExamBtn')?.addEventListener('click', () => openExamModal());

  $('resetProgressBtn')?.addEventListener('click', resetProgress);
  $('resetPerformanceBtn')?.addEventListener('click', resetPerformance);
  $('resetAllBtn')?.addEventListener('click', resetAll);

  $('searchInput')?.addEventListener('input', renderTracker);
  $('filterSelect')?.addEventListener('change', renderTracker);

  $('expandAllBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.node').forEach(n => {
      n.classList.add('open');
      if(n.dataset.nodeId) openNodes.add(n.dataset.nodeId);
    });
  });

  $('collapseAllBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.node').forEach(n => {
      n.classList.remove('open');
      if(n.dataset.nodeId) openNodes.delete(n.dataset.nodeId);
    });
  });

  $('confirmSaveParse')?.addEventListener('click', () => {
    save();
    $('parseReview')?.classList.add('hidden');
    showTab('tracker');
    setStatus('Syllabus loaded. Open a topic and choose how prepared you are.');
  });

  $('cancelParse')?.addEventListener('click', e => {
    e.preventDefault();
    $('parseReview')?.classList.add('hidden');
  });

  $('modalClose')?.addEventListener('click', closeModal);
  $('modalSave')?.addEventListener('click', saveModal);
  $('modalDelete')?.addEventListener('click', deleteModalTarget);

  $('examCancel')?.addEventListener('click', closeExamModal);
  $('examSave')?.addEventListener('click', saveExamModal);

  $('editModal')?.addEventListener('click', e => {
    if(e.target === $('editModal')) closeModal();
  });

  $('examModal')?.addEventListener('click', e => {
    if(e.target === $('examModal')) closeExamModal();
  });

  document.addEventListener('keydown', e => {
    if(e.key === 'Escape'){
      closeModal();
      closeExamModal();
      closeStatusModal();
      $('parseReview')?.classList.add('hidden');
    }
  });

  buildStatusModal();
}
function emptyPlan(){ return {version:'MY_PLAN_1', createdAt:new Date().toISOString(), learnerName:'', syllabus:{title:'',source:'',subjects:[]}, progress:{topics:{}, notes:{}}, performance:{exams:[]}}; }
function loadPlan(){ try{const p=JSON.parse(localStorage.getItem(STORE)) || emptyPlan(); if(!p.progress) p.progress={topics:{},notes:{}}; if(!p.performance) p.performance={exams:[]}; if(!p.performance.exams) p.performance.exams=[]; return p;}catch(e){return emptyPlan()} }
function save(){ localStorage.setItem(STORE, JSON.stringify(plan)); }
function setStatus(msg){ $('status').textContent=msg; }
async function readPdf(){
  const file=$('pdfFile').files[0];
  if(!file){ setStatus('Choose a PDF first.'); return; }
  try{
    setStatus('Reading PDF. Please wait...');
    $('readPdfBtn').disabled=true;
    const parsed = await MyPlanParser.parsePdfFile(file);
    parsed.learnerName = $('studentName').value.trim() || plan?.learnerName || '';
    plan = parsed;
    if(!plan.performance) plan.performance={exams:[]};
    $('studentName').value = plan.learnerName || '';
    save();
    renderParseReview();
    renderAll();
    showTab('tracker');
    setStatus(`Loaded ${countAll().topics} topics from ${file.name}.`);
  }catch(err){
    console.error(err);
    setStatus('Could not read this PDF: ' + (err && err.message ? err.message : 'unknown error') + '. Please check that this is a text-based PDF.');
  }finally{ $('readPdfBtn').disabled=false; }
}
/*function importJsonFile(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const imported=JSON.parse(ev.target.result);
      plan=MyPlanParser.normalizeImport(imported,file.name);
      if(!plan.performance) plan.performance={exams: imported.performance?.exams || imported.exams || []};
      plan.learnerName = $('studentName').value.trim() || plan.learnerName || '';
      $('studentName').value = plan.learnerName || '';
      save(); renderAll(); showTab('tracker'); setStatus(`Imported JSON: ${file.name}`);
    }catch(err){ console.error(err); setStatus('This JSON format is not supported.'); alert('This JSON format is not supported.'); }
  };
  reader.readAsText(file);
}*/
function renderAll(){ renderHeader(); renderSetupState(); renderTracker(); renderProgress(); renderPerformance(); renderReview(); renderSettings(); }
function renderHeader(){ $('studentName').value=plan?.learnerName||''; }
function renderSetupState(){
  const has=hasSyllabus();
  $('emptyMessage').classList.toggle('hidden',has);
  $('loadedMessage').classList.toggle('hidden',!has);
  if(has){ const c=countAll(); $('loadedMessage').innerHTML=`<b>${safe(plan.syllabus.title||'Loaded syllabus')}</b><br>${c.subjects} subjects • ${c.chapters} chapters • ${c.topics} topics`; }
}
function showTab(tab){
  if(!tab) return;
  activeTab = tab;

  document
    .querySelectorAll('.tab[data-tab]')
    .forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $('setupCard')?.classList.add('hidden');

  const target = tab === 'setup' ? $('setupCard') : $(tab + 'View');
  target?.classList.remove('hidden');

  if(tab === 'progress') renderProgress();
  if(tab === 'review') renderReview();
  if(tab === 'performance') renderPerformance();
  if(tab === 'tracker') renderTracker();

  requestAnimationFrame(() => {
    (target || document.querySelector('main'))?.scrollIntoView({
      behavior:'smooth',
      block:'start'
    });
  });
}
function hasSyllabus(){ return !!(plan?.syllabus?.subjects?.length); }
function countAll(subject){
  const subjects=subject?[subject]:(plan?.syllabus?.subjects||[]); let chapters=0, topics=0, done=0;
  subjects.forEach(s=>(s.chapters||[]).forEach(c=>{chapters++; (c.topics||[]).forEach(t=>{topics++; if(isDone(t.id)) done++;});}));
  return {subjects:subjects.length, chapters, topics, done, pending:topics-done, percent:pct(done,topics)};
}
function topicRecord(id){ return plan?.progress?.topics?.[id] || {}; }
function isDone(id){ const r=topicRecord(id); return !!r.done || r.state==='Well Prepared' || r.state==='Prepared'; }
function hasStatus(id){ const r=topicRecord(id); return !!(r.state || r.done); }
function setDone(id,done){ if(!plan.progress) plan.progress={topics:{},notes:{}}; if(!plan.progress.topics) plan.progress.topics={}; plan.progress.topics[id]={...(plan.progress.topics[id]||{}), done, state: done ? 'Well Prepared' : '', updatedAt:new Date().toISOString()}; }
function setTopicState(id,state,note=''){ if(!plan.progress) plan.progress={topics:{},notes:{}}; if(!plan.progress.topics) plan.progress.topics={}; plan.progress.topics[id]={...(plan.progress.topics[id]||{}), state, note, done:(state==='Well Prepared'||state==='Prepared'), updatedAt:new Date().toISOString()}; }
function stateClass(state){ return ({'Well Prepared':'state-well','Prepared':'state-prepared','Preparing':'state-preparing','Not Prepared':'state-not'}[state] || 'state-empty'); }
function renderParseReview(){
  const box=$('parseReview'); box.classList.remove('hidden');
  const c=countAll();
  $('parseSummary').innerHTML=`Parsed <b>${c.subjects}</b> subjects, <b>${c.chapters}</b> chapters, and <b>${c.topics}</b> topics. Review/delete irrelevant subjects before continuing.`;
  $('parseSubjects').innerHTML=(plan.syllabus.subjects||[]).map(s=>`<div class="mini-stat"><b>${safe(s.name)}</b><span class="muted">${countAll(s).chapters} chapters • ${countAll(s).topics} topics</span></div>`).join('');
}
function renderTracker(){
  const root=$('treeRoot');
  if(!hasSyllabus()){ root.innerHTML='<div class="empty">Upload a PDF to see the hierarchy.</div>'; return; }
  const q=($('searchInput').value||'').toLowerCase().trim(), filter=$('filterSelect').value;
  root.innerHTML='';
  plan.syllabus.subjects.forEach(subject=>{
    const subjectEl=subjectNode(subject,q,filter);
    if(subjectEl) root.appendChild(subjectEl);
  });
  if(!root.children.length) root.innerHTML='<div class="empty">No matching item found.</div>';
  renderSetupState(); renderProgressBarsMini();
}
function subjectNode(subject,q,filter){
  const children=[]; (subject.chapters||[]).forEach(ch=>{const n=chapterNode(subject,ch,q,filter); if(n) children.push(n);});
  const hay=(subject.name+' '+JSON.stringify(subject)).toLowerCase(); if(q && !hay.includes(q) && !children.length) return null;
  const c=countAll(subject);
  const node=makeNode('subject', subject.name, `${c.done}/${c.topics} ready`, children, `<button class="btn small ghost" data-edit-subject="${subject.id}">Edit</button><button class="btn small warn" data-delete-subject="${subject.id}">Delete</button>`, subject.id);
  node.querySelector('[data-edit-subject]')?.addEventListener('click',e=>{e.stopPropagation(); openModal('subject', subject.id);});
  node.querySelector('[data-delete-subject]')?.addEventListener('click',e=>{e.stopPropagation(); deleteSubject(subject.id);});
  return node;
}
function chapterNode(subject,ch,q,filter){
  const topicEls=[]; (ch.topics||[]).forEach(t=>{ const d=isDone(t.id); const hay=(subject.name+' '+ch.name+' '+t.name).toLowerCase(); if(q && !hay.includes(q)) return; if(filter==='done'&&!d) return; if(filter==='pending'&&d) return; topicEls.push(topicRow(t)); });
  const hasMatch=(subject.name+' '+ch.name+' '+(ch.topics||[]).map(t=>t.name).join(' ')).toLowerCase().includes(q);
  if((q && !hasMatch && !topicEls.length) || (!topicEls.length && filter!=='all')) return null;
  const done=(ch.topics||[]).filter(t=>isDone(t.id)).length, total=(ch.topics||[]).length;
  const actions=`<button class="btn small soft" data-state-ch="${ch.id}">Set chapter status</button><button class="btn small ghost" data-reset-ch="${ch.id}">Reset</button><button class="btn small ghost" data-edit-ch="${ch.id}">Edit</button>`;
  const node=makeNode('chapter', ch.name, `${done}/${total} ready`, topicEls, actions, ch.id);
  node.querySelector('[data-state-ch]').addEventListener('click',e=>{e.stopPropagation(); openStatusModal('chapter', ch.id);});
  node.querySelector('[data-reset-ch]').addEventListener('click',e=>{e.stopPropagation(); resetChapter(ch.id);});
  node.querySelector('[data-edit-ch]').addEventListener('click',e=>{e.stopPropagation(); openModal('chapter', ch.id);});
  return node;
}
function makeNode(type,title,meta,children,actions='',id=''){
  const div=document.createElement('div'); div.className=`node ${type==='chapter'?'chapter':''}`;
  if(id) div.dataset.nodeId=id;
  if(id && openNodes.has(id)) div.classList.add('open');
  div.innerHTML=`<div class="node-head"><span class="chev">▶</span><span class="node-title">${safe(title)}</span><span class="node-meta">${safe(meta)}</span><span class="actions">${actions}</span></div><div class="node-children"></div>`;
  div.querySelector('.node-head').addEventListener('click',()=>{div.classList.toggle('open'); if(id){ if(div.classList.contains('open')) openNodes.add(id); else openNodes.delete(id); }});
  const box=div.querySelector('.node-children'); children.forEach(c=>box.appendChild(c)); return div;
}
function topicRow(t){
  const r=topicRecord(t.id), label=r.state || (r.done?'Well Prepared':'Not marked');
  const row=document.createElement('div'); row.className='topic-row';
  row.innerHTML=`<button class="status-dot ${stateClass(r.state)}" title="${safe(label)}"></button><span class="topic-name">${safe(t.name)}</span><span class="state-label">${safe(label)}</span><span class="topic-actions"><button class="btn small ghost" data-edit-topic>Edit</button></span>`;
  row.addEventListener('click',()=>openStatusModal('topic',t.id));
  row.querySelector('[data-edit-topic]').addEventListener('click',e=>{e.stopPropagation(); openModal('topic',t.id);});
  return row;
}
function markChapter(chapterId,state){ const ch=findChapter(chapterId); if(!ch)return; (ch.topics||[]).forEach(t=>setTopicState(t.id,state)); save(); renderAll(); }
function resetChapter(chapterId){ const ch=findChapter(chapterId); if(!ch)return; (ch.topics||[]).forEach(t=>delete plan.progress.topics[t.id]); save(); renderAll(); }
function deleteSubject(subjectId){ const s=findSubject(subjectId); if(!s)return; if(!confirm(`Delete ${s.name}? This removes the subject and its progress.`))return; const ids=new Set(); (s.chapters||[]).forEach(c=>(c.topics||[]).forEach(t=>ids.add(t.id))); plan.syllabus.subjects=plan.syllabus.subjects.filter(x=>x.id!==subjectId); ids.forEach(id=>delete plan.progress.topics[id]); save(); renderAll(); setStatus('Subject deleted.'); }
function renderProgressBarsMini(){ const c=countAll(); $('overallMini').innerHTML=`<b>${c.percent}%</b><span class="muted">Ready / prepared</span><div class="progressbar"><span style="width:${c.percent}%"></span></div>`; }
function renderProgress(){
  const box=$('progressContent'); if(!hasSyllabus()){box.innerHTML='<div class="empty">Upload a syllabus to see progress charts.</div>'; return;}
  const c=countAll();
  box.innerHTML=`<div class="grid3"><div class="mini-stat"><b>${c.percent}%</b><span class="muted">Overall readiness</span><div class="progressbar"><span style="width:${c.percent}%"></span></div></div><div class="mini-stat"><b>${c.done}</b><span class="muted">Ready topics</span></div><div class="mini-stat"><b>${c.pending}</b><span class="muted">Not ready yet</span></div></div><div class="chart-grid" style="margin-top:18px"><div class="chart-card"><canvas id="subjectChart"></canvas></div><div class="chart-card"><canvas id="overallChart"></canvas></div></div><div id="subjectBars" style="margin-top:18px"></div>`;
  const rows=plan.syllabus.subjects.map(s=>({name:s.name, ...countAll(s)}));
  $('subjectBars').innerHTML=rows.map(r=>`<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-weight:900"><span>${safe(r.name)}</span><span>${r.percent}%</span></div><div class="progressbar"><span style="width:${r.percent}%"></span></div></div>`).join('');
  drawCharts(rows,c);
}
function drawCharts(rows,c){
  Object.values(charts).forEach(ch=>ch.destroy?.()); charts={};
  if(!window.Chart) return;
  charts.subject=new Chart($('subjectChart'),{type:'bar',data:{labels:rows.map(r=>r.name),datasets:[{label:'Readiness %',data:rows.map(r=>r.percent),backgroundColor:'#4bc2c4',borderColor:'#272b6a',borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Subject readiness'}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}}}}});
  charts.overall=new Chart($('overallChart'),{type:'doughnut',data:{labels:['Ready / prepared','Not ready yet'],datasets:[{data:[c.done,c.pending],backgroundColor:['#4bc2c4','#e2e8f0'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:true,text:'Overall syllabus'},legend:{position:'bottom'}}}});
}

function subjectNames(){ return (plan?.syllabus?.subjects||[]).map(s=>s.name); }
function exams(){ if(!plan.performance) plan.performance={exams:[]}; if(!plan.performance.exams) plan.performance.exams=[]; return plan.performance.exams; }
function examPercent(score){ const o=Number(score?.obtained), t=Number(score?.total); return t>0 && isFinite(o) ? Math.round((o/t)*100) : null; }
function examOverallPercent(exam){ let got=0,total=0; Object.values(exam.scores||{}).forEach(sc=>{ const o=Number(sc.obtained), t=Number(sc.total); if(isFinite(o)&&isFinite(t)&&t>0){got+=o; total+=t;} }); return total?Math.round((got/total)*100):null; }
function renderPerformance(){
  const box=$('performanceContent'); if(!box) return;
  if(!hasSyllabus()){ box.innerHTML='<div class="empty">Upload a syllabus first. Subjects for marks will appear automatically.</div>'; return; }
  const list=exams();
  const subjects=subjectNames();
  if(!list.length){ box.innerHTML=`<div class="empty">No examinations added yet.<br><br><button class="btn primary" onclick="MyPlanApp.openExamModal()">Add examination</button></div>`; return; }
  const latest=list[list.length-1];
  const latestRows=subjects.map(sub=>({subject:sub, percent:examPercent(latest.scores?.[sub])})).filter(x=>x.percent!==null);
  const overallRows=list.map(ex=>({exam:ex.name, percent:examOverallPercent(ex)})).filter(x=>x.percent!==null);
  box.innerHTML=`<div class="grid3"><div class="mini-stat"><b>${list.length}</b><span class="muted">Examinations</span></div><div class="mini-stat"><b>${examOverallPercent(latest)??'-'}%</b><span class="muted">Latest overall</span></div><div class="mini-stat"><b>${safe(latest.name)}</b><span class="muted">Latest exam</span></div></div><div class="performance-controls"><label><b>View subject trend</b><select class="input" id="performanceSubjectSelect"><option value="__all__">Overall trend</option>${subjects.map(s=>`<option value="${safe(s)}">${safe(s)}</option>`).join('')}</select></label></div><div class="chart-grid" style="margin-top:18px"><div class="chart-card"><canvas id="examTrendChart"></canvas></div><div class="chart-card"><canvas id="examLatestChart"></canvas></div></div><div class="exam-list">${list.slice().reverse().map(examCard).join('')}</div>`;
  $('performanceSubjectSelect')?.addEventListener('change', drawPerformanceCharts);
  box.querySelectorAll('[data-edit-exam]').forEach(b=>b.addEventListener('click',()=>openExamModal(b.dataset.editExam)));
  box.querySelectorAll('[data-delete-exam]').forEach(b=>b.addEventListener('click',()=>deleteExam(b.dataset.deleteExam)));
  drawPerformanceCharts();
}
function examCard(ex){ const overall=examOverallPercent(ex); const rows=Object.entries(ex.scores||{}).filter(([_,v])=>examPercent(v)!==null).map(([s,v])=>`<span class="pill">${safe(s)}: ${safe(v.obtained)}/${safe(v.total)} (${examPercent(v)}%)</span>`).join(' '); return `<div class="review-card"><div class="toolbar" style="margin:0"><div><b>${safe(ex.name)}</b><div class="muted">${safe(ex.date||'No date')} • Overall ${overall??'-'}%</div></div><div class="actions"><button class="btn small ghost" data-edit-exam="${safe(ex.id)}">Edit</button><button class="btn small warn" data-delete-exam="${safe(ex.id)}">Delete</button></div></div><div style="margin-top:10px">${rows||'<span class="muted">No marks entered.</span>'}</div></div>`; }
function drawPerformanceCharts(){
  if(!window.Chart || !$('examTrendChart') || !$('examLatestChart')) return;
  charts.examTrend?.destroy?.(); charts.examLatest?.destroy?.();
  const list=exams(); const selected=$('performanceSubjectSelect')?.value || '__all__';
  const trend=list.map(ex=>({label:ex.name, percent:selected==='__all__'?examOverallPercent(ex):examPercent(ex.scores?.[selected])})).filter(x=>x.percent!==null);
  charts.examTrend=new Chart($('examTrendChart'),{type:'line',data:{labels:trend.map(x=>x.label),datasets:[{label:selected==='__all__'?'Overall %':selected+' %',data:trend.map(x=>x.percent),borderColor:'#4bc2c4',backgroundColor:'rgba(75,194,196,.12)',tension:.25,fill:true,pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:selected==='__all__'?'Overall performance trend':selected+' performance trend'}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}}}}});
  const latest=list[list.length-1], latestRows=subjectNames().map(sub=>({subject:sub, percent:examPercent(latest.scores?.[sub])})).filter(x=>x.percent!==null);
  charts.examLatest=new Chart($('examLatestChart'),{type:'bar',data:{labels:latestRows.map(x=>x.subject),datasets:[{label:'Score %',data:latestRows.map(x=>x.percent),backgroundColor:'#ee4977'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Latest exam by subject'}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}}}}});
}
function openExamModal(id=''){
  if(!hasSyllabus()){ alert('Upload a syllabus first.'); return; }
  const ex=id?exams().find(x=>x.id===id):null;
  $('examEditId').value=id||''; $('examModalTitle').textContent=ex?'Edit examination':'Add examination'; $('examName').value=ex?.name||''; $('examDate').value=ex?.date||new Date().toISOString().slice(0,10);
  $('examSubjectRows').innerHTML=subjectNames().map(sub=>{const sc=ex?.scores?.[sub]||{}; return `<div class="exam-row" data-subject="${safe(sub)}"><div class="exam-subject-name">${safe(sub)}</div><input class="input" type="number" min="0" step="0.01" placeholder="Scored" data-role="obtained" value="${safe(sc.obtained??'')}"><input class="input" type="number" min="0" step="0.01" placeholder="Total" data-role="total" value="${safe(sc.total??'')}"></div>`;}).join('');
  $('examModal').classList.remove('hidden');
}
function closeExamModal(){ $('examModal')?.classList.add('hidden'); }
function saveExamModal(){
  const name=$('examName').value.trim(); if(!name){ alert('Enter examination name.'); return; }
  const id=$('examEditId').value || 'exam_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
  const scores={};
  document.querySelectorAll('#examSubjectRows .exam-row').forEach(row=>{
    const sub=row.dataset.subject || row.querySelector('.exam-subject-name')?.textContent?.trim();
    const o=row.querySelector('[data-role="obtained"]')?.value;
    const t=row.querySelector('[data-role="total"]')?.value;
    if(sub && (o!=='' || t!=='')) scores[sub]={obtained:Number(o||0), total:Number(t||0)};
  });
  if(!Object.values(scores).some(sc=>Number(sc.total)>0)){
    alert('Enter marks for at least one subject.');
    return;
  }
  const exam={id,name,date:$('examDate').value,scores,updatedAt:new Date().toISOString()};
  const list=exams(); const idx=list.findIndex(x=>x.id===id); if(idx>=0) list[idx]=exam; else list.push(exam);
  save(); closeExamModal(); renderPerformance(); showTab('performance'); setStatus('Examination saved.');
}
function deleteExam(id){ const ex=exams().find(x=>x.id===id); if(!ex)return; if(!confirm(`Delete ${ex.name}?`))return; plan.performance.exams=exams().filter(x=>x.id!==id); save(); renderPerformance(); }
function resetPerformance(){ if(!confirm('Reset all examination records? Syllabus and topic progress will remain.'))return; plan.performance={exams:[]}; save(); renderPerformance(); setStatus('Performance history reset.'); }
function exportPerformance(){ download({learnerName:plan.learnerName||'', syllabusTitle:plan.syllabus?.title||'', exams:exams()}, 'my-plan-performance.json'); }

function renderReview(){
  const box=$('reviewContent'); if(!hasSyllabus()){box.innerHTML='<div class="empty">No syllabus loaded.</div>';return;}
  const doneTopics=[]; plan.syllabus.subjects.forEach(s=>s.chapters.forEach(c=>c.topics.forEach(t=>{const p=plan.progress.topics[t.id]; if(p?.state||p?.done) doneTopics.push({subject:s.name,chapter:c.name,topic:t.name,state:p.state||'Well Prepared',note:p.note||'',updatedAt:p.updatedAt});})));
  box.innerHTML=doneTopics.length?doneTopics.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')).map(x=>`<div class="review-card"><b>${safe(x.topic)}</b><div class="muted">${safe(x.subject)} • ${safe(x.chapter)}</div><div class="pill">${safe(x.state)}</div>${x.note?`<p>${safe(x.note)}</p>`:''}</div>`).join(''):'<div class="empty">No topic status has been set yet.</div>'; 
}
function renderSettings(){
  $('settingsSummary').innerHTML=hasSyllabus()?`${safe(plan.syllabus.title)} • ${countAll().topics} topics`:'No syllabus loaded';
}

function buildStatusModal(){
  if($('statusModal')) return;
  const div=document.createElement('div');
  div.id='statusModal'; div.className='modal-backdrop hidden';
  div.innerHTML=`<div class="modal gentle-modal"><div class="modal-head gentle"><h2 id="statusModalTitle" style="margin:0">How prepared are you?</h2><p id="statusModalSub" style="margin:6px 0 0;opacity:.8"></p></div><div class="modal-body"><div class="state-grid"><button class="state" data-state="Well Prepared"><span class="status-dot state-well"></span><b>Well Prepared</b><small>I can answer this confidently.</small></button><button class="state" data-state="Prepared"><span class="status-dot state-prepared"></span><b>Prepared</b><small>I know this, but revision may help.</small></button><button class="state" data-state="Preparing"><span class="status-dot state-preparing"></span><b>Preparing</b><small>I am working on it.</small></button><button class="state" data-state="Not Prepared"><span class="status-dot state-not"></span><b>Not Prepared</b><small>I need to start or relearn this.</small></button></div><label class="note-label"><b>Optional note</b><textarea class="input" id="statusNote" rows="3" placeholder="What is weak, left, or planned?"></textarea></label></div><div class="modal-foot"><button class="btn ghost" id="statusCancel">Cancel</button></div></div>`;
  document.body.appendChild(div);
  $('statusCancel').addEventListener('click',closeStatusModal);
}
function openStatusModal(type,id){
  const target=type==='chapter'?findChapter(id):findTopic(id); if(!target)return;
  $('statusModal').dataset.type=type; $('statusModal').dataset.id=id;
  $('statusModalTitle').textContent= type==='chapter' ? 'Set this chapter status' : 'How prepared are you?';
  $('statusModalSub').textContent= target.name;
  $('statusNote').value = type==='topic' ? (topicRecord(id).note||'') : '';
  document.querySelectorAll('#statusModal .state').forEach(btn=>{ btn.classList.remove('selected'); btn.onclick=()=>saveStatusChoice(btn.dataset.state); });
  $('statusModal').classList.remove('hidden');
}
function closeStatusModal(){ $('statusModal')?.classList.add('hidden'); }
function saveStatusChoice(state){
  const type=$('statusModal').dataset.type, id=$('statusModal').dataset.id, note=$('statusNote').value.trim();
  if(type==='chapter') markChapter(id,state); else { setTopicState(id,state,note); save(); renderAll(); }
  closeStatusModal();
}

function openModal(type,id){
  const target = type==='subject'?findSubject(id):type==='chapter'?findChapter(id):findTopic(id);
  if(!target)return;
  $('modalTitle').textContent=`Edit ${type}`; $('modalName').value=target.name; $('modalType').value=type; $('modalId').value=id; $('editModal').classList.remove('hidden');
}
function closeModal(){ $('editModal')?.classList.add('hidden'); }
function saveModal(){ const type=$('modalType').value,id=$('modalId').value,name=$('modalName').value.trim(); if(!name)return; const target=type==='subject'?findSubject(id):type==='chapter'?findChapter(id):findTopic(id); if(target){target.name=name; save(); renderAll(); closeModal();} }
function deleteModalTarget(){
  const type=$('modalType').value,id=$('modalId').value; if(!confirm(`Delete this ${type}?`))return;
  if(type==='subject') deleteSubject(id);
  if(type==='chapter'){ plan.syllabus.subjects.forEach(s=>{s.chapters=s.chapters.filter(c=>{ if(c.id===id){c.topics.forEach(t=>delete plan.progress.topics[t.id]); return false;} return true;});}); save(); renderAll(); }
  if(type==='topic'){ plan.syllabus.subjects.forEach(s=>s.chapters.forEach(c=>{c.topics=c.topics.filter(t=>t.id!==id); delete plan.progress.topics[id];})); save(); renderAll(); }
  closeModal();
}
function resetProgress(){ if(!confirm('Reset all progress? Syllabus will remain.'))return; plan.progress={topics:{},notes:{}}; save(); renderAll(); }
function resetAll(){
  if(!confirm('Start over? This removes syllabus, progress, performance and review data from this browser.')) return;

  localStorage.removeItem(STORE);
  plan = emptyPlan();
  openNodes.clear();

  Object.values(charts).forEach(ch => {
    try { ch?.destroy?.(); } catch(e) {}
  });
  charts = {};

  ['pdfFile','studentName'].forEach(id => {
    const el = $(id);
    if(el) el.value = '';
  });

  $('parseSubjects') && ($('parseSubjects').innerHTML = '');
  $('parseSummary') && ($('parseSummary').textContent = '');
  $('parseReview')?.classList.add('hidden');

  $('treeRoot') && ($('treeRoot').innerHTML = '');
  $('progressContent') && ($('progressContent').innerHTML = '');
  $('performanceContent') && ($('performanceContent').innerHTML = '');
  $('reviewContent') && ($('reviewContent').innerHTML = '');
  $('overallMini') && ($('overallMini').innerHTML = '');

  closeModal();
  closeExamModal();
  closeStatusModal();

  renderAll();
  showTab('setup');
  setStatus('Everything has been reset. Upload a syllabus to begin again.');
} 
function exportSyllabus(){ if(!hasSyllabus())return alert('No syllabus loaded.'); download(plan.syllabus, 'my-plan-syllabus.json'); }
function exportProfile(){ download(plan, 'my-plan-profile.json'); }
function download(obj,name){ const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }
function exportPdfReport(){
  if(!hasSyllabus()) return alert('No syllabus loaded.');
  const c=countAll(); $('reportName').textContent=plan.learnerName||'Learner'; $('reportDate').textContent=new Date().toLocaleString(); $('reportTitle').textContent=plan.syllabus.title||'My Plan'; $('reportOverall').textContent=`${c.percent}% complete (${c.done}/${c.topics} topics)`;
  const rows=$('reportRows'); rows.innerHTML='';
  plan.syllabus.subjects.forEach(s=>{const r=countAll(s); const div=document.createElement('div'); div.className='report-row'; div.innerHTML=`<div><b>${safe(s.name)}</b><br><span>${r.done}/${r.topics} topics complete</span></div><b>${r.percent}%</b>`; rows.appendChild(div);});
  const tpl=$('pdfTemplate'); tpl.classList.remove('hidden'); html2pdf().set({margin:10,filename:`My_Plan_${(plan.learnerName||'Progress').replace(/\W+/g,'_')}.pdf`,image:{type:'jpeg',quality:.98},html2canvas:{scale:2,useCORS:true},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).from(tpl).save().then(()=>tpl.classList.add('hidden'));
}
function findSubject(id){return plan.syllabus.subjects.find(s=>s.id===id)}
function findChapter(id){let out=null; plan.syllabus.subjects.some(s=>(out=s.chapters.find(c=>c.id===id))); return out;}
function findTopic(id){let out=null; plan.syllabus.subjects.some(s=>s.chapters.some(c=>(out=c.topics.find(t=>t.id===id)))); return out;}
window.MyPlanApp={getPlan:()=>plan, openExamModal};
})();
