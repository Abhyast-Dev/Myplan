/* My Plan parser.js
   Purpose: turn syllabus PDFs / JSON into one simple internal structure:
   plan.syllabus.subjects[] -> chapters[] -> topics[]
   Browser-only, GitHub Pages friendly. No server, no AI dependency.
*/
(function(){
  const Parser = {};

  Parser.extractPdfText = async function(file){
    if(!window.pdfjsLib) throw new Error('PDF.js was not loaded');
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data: buffer, disableWorker: true, useWorkerFetch: false, isEvalSupported: false}).promise;
    const pages = [];
    for(let pageNo=1; pageNo<=pdf.numPages; pageNo++){
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const items = content.items
        .map(it=>({str:String(it.str||''), x:it.transform?.[4]||0, y:it.transform?.[5]||0}))
        .filter(it=>it.str.trim());
      items.sort((a,b)=> Math.abs(b.y-a.y)>4 ? b.y-a.y : a.x-b.x);
      const lines=[]; let currentY=null; let line=[];
      for(const it of items){
        if(currentY===null || Math.abs(it.y-currentY)<=4){ line.push(it.str); currentY = currentY ?? it.y; }
        else { lines.push(joinLine(line)); line=[it.str]; currentY=it.y; }
      }
      if(line.length) lines.push(joinLine(line));
      pages.push(lines.join('\n'));
    }
    return pages.join('\n\n');
  };

  Parser.parsePdfFile = async function(file){
    const text = await Parser.extractPdfText(file);
    return Parser.parseText(text, file.name);
  };

  Parser.parseText = function(text, fileName='uploaded.pdf'){
    const raw = normalizeRaw(text);
    const compact = raw.replace(/\s+/g,' ');
    if(/JEE\s*\(?Main\)?|B\.E\.\/B\.Tech|B\.Arch|B\.Planning/i.test(compact)) return parseJee(raw, fileName);
    if(/NEET\s*\(?UG\)?|SYLLABUS FOR NEET/i.test(compact)) return parseEntrance(raw, fileName, 'NEET UG Syllabus Tracker', ['Physics','Chemistry','Biology','Botany','Zoology']);
    if(/Subject Code\s*[–-]\s*086|COURSE STRUCTURE\s+CLASS\s+IX|Key Concepts\s+Learning Outcomes|No\.\s*of\s*Periods/i.test(compact)) return parseCbseScience(raw, fileName);
    return parseSchoolOrGeneric(raw, fileName);
  };

  Parser.normalizeImport = function(obj, fileName='import.json'){
    if(obj && obj.syllabus && obj.progress){
      obj.syllabus = normalizeSyllabus(obj.syllabus);
      obj.progress = obj.progress || {topics:{}, notes:{}};
      obj.progress.topics = obj.progress.topics || {};
      return obj;
    }
    if(obj && Array.isArray(obj.subjects)) return newPlan(obj, obj.title || 'Imported Syllabus', fileName);
    if(obj && obj.syllabus && Array.isArray(obj.syllabus.subjects)) return {...obj, syllabus: normalizeSyllabus(obj.syllabus)};
    // Legacy single object: { Grade, Subjects:[{name, units:[{name, topics[]}]}] }
    if(obj && obj.Grade && Array.isArray(obj.Subjects)){
      return newPlan({subjects: legacySubjects([obj])}, `Imported Syllabus ${obj.Grade||''}`.trim(), fileName);
    }
    // Legacy array: [{ Grade, Subjects:[...] }]
    if(Array.isArray(obj) && obj.some(x=>x?.Subjects)){
      return newPlan({subjects: legacySubjects(obj)}, 'Imported Legacy Syllabus', fileName);
    }
    throw new Error('Unsupported JSON format');
  };

  Parser.newPlan = newPlan;
  Parser.normalizeSyllabus = normalizeSyllabus;
  Parser._test = {parseJee, parseEntrance, parseCbseScience, parseSchoolOrGeneric, parseUnits, normalizeRaw};

  function newPlan(syllabus, title, source){
    return {
      version:'MY_PLAN_1',
      createdAt:new Date().toISOString(),
      learnerName:'',
      syllabus: normalizeSyllabus({title, source, ...syllabus}),
      progress:{topics:{}, notes:{}}
    };
  }

  function normalizeSyllabus(syllabus){
    const subjects = (syllabus.subjects||syllabus.Subjects||[]).map(s=>{
      const chapters = (s.chapters || flattenUnits(s.units) || legacyChapters(s) || []).map(c=>({
        id:c.id||id(),
        name:cleanName(c.name||'Untitled Chapter'),
        topics:(c.topics||[]).map(t=> typeof t==='string' ? {id:id(), name:cleanTopic(t)} : {id:t.id||id(), name:cleanTopic(t.name||'Untitled Topic')}).filter(t=>t.name)
      })).filter(c=>c.name && c.topics.length);
      return {id:s.id||id(), name:cleanName(s.name||s.Subject||'Untitled Subject'), chapters};
    }).filter(s=>s.name && s.chapters.length);
    return {id:syllabus.id||id(), title:syllabus.title||'Uploaded Syllabus', source:syllabus.source||'', generatedAt:syllabus.generatedAt||new Date().toISOString(), subjects};
  }

  function legacySubjects(arr){
    const subjects=[];
    arr.forEach(g=>(g.Subjects||[]).forEach(s=>{
      const name = cleanName(s.name || s.Subject || 'Subject');
      subjects.push({id:id(), name, chapters: legacyChapters(s)});
    }));
    return subjects;
  }

  function flattenUnits(units){
    if(!Array.isArray(units)) return [];
    const chapters=[];
    units.forEach(u=>{
      if(Array.isArray(u.chapters) && u.chapters.length){
        u.chapters.forEach(c=>chapters.push({...c, name: c.name || u.name}));
      } else if(Array.isArray(u.topics)) {
        chapters.push({name:u.name, topics:u.topics});
      }
    });
    return chapters;
  }

  function legacyChapters(s){
    const chapters=[];
    (s.units||[]).forEach(u=>{
      if(Array.isArray(u.chapters)) u.chapters.forEach(c=>chapters.push({id:id(), name:c.name||u.name, topics:(c.topics||[]).map(t=>({id:id(), name:String(t)}))}));
      if(Array.isArray(u.topics)) chapters.push({id:id(), name:u.name, topics:u.topics.map(t=>({id:id(), name:String(t)}))});
    });
    (s.chapters||[]).forEach(c=>chapters.push({id:id(), name:c.name, topics:(c.topics||[]).map(t=>({id:id(), name:String(t)}))}));
    return chapters;
  }

  function parseJee(raw, fileName){
    const text = stripBoilerplate(raw);
    const subjects=[];
    const paper1End = firstIndex(text, [/Syllabus\s+for\s+JEE\s*\(Main\)\s+Paper\s+2A/i, /Paper\s+2A\s*\(B\.Arch/i, /Syllabus\s+for\s+JEE\s*\(Main\)\s+Paper\s+2B/i], text.length);
    const paper1 = text.slice(0, paper1End);
    pushSubject(subjects, 'Mathematics', sectionBetween(paper1, /^\s*MATHEMATICS\b/im, /^\s*PHYSICS\b/im));
    pushSubject(subjects, 'Physics', sectionBetween(paper1, /^\s*PHYSICS\b/im, /^\s*CHEMISTRY\b/im));
    pushSubject(subjects, 'Chemistry', sectionBetween(paper1, /^\s*CHEMISTRY\b/im, null));

    const paper2A = sectionBetween(text, /Syllabus\s+for\s+JEE\s*\(Main\)\s+Paper\s+2A|Paper\s+2A\s*\(B\.Arch/i, /Syllabus\s+for\s+JEE\s*\(Main\)\s+Paper\s+2B|Paper\s+2B\s*\(B\.Planning/i);
    if(paper2A){
      pushSubject(subjects, 'B.Arch Mathematics', sectionBetween(paper2A, /Part\s*[-–]?\s*I\s+MATHEMATICS|^\s*MATHEMATICS\b/im, /Part\s*[–-]?\s*II\s+APTITUDE|^\s*APTITUDE TEST\b/im));
      pushSubject(subjects, 'B.Arch Aptitude Test', sectionBetween(paper2A, /^\s*(?:Part\s*[–-]?\s*II\s+)?APTITUDE TEST\b/im, /^\s*(?:Part\s*[–-]?\s*III\s+)?DRAWING TEST\b/im));
      pushSubject(subjects, 'B.Arch Drawing Test', sectionBetween(paper2A, /^\s*(?:Part\s*[–-]?\s*III\s+)?DRAWING TEST\b/im, null));
    }
    const paper2B = sectionBetween(text, /Syllabus\s+for\s+JEE\s*\(Main\)\s+Paper\s+2B|Paper\s+2B\s*\(B\.Planning/i, null);
    if(paper2B){
      pushSubject(subjects, 'B.Planning Mathematics', sectionBetween(paper2B, /Part\s*[-–]?\s*I\s+MATHEMATICS|^\s*MATHEMATICS\b/im, /Part\s*[–-]?\s*II\s+APTITUDE|^\s*APTITUDE TEST\b/im));
      pushSubject(subjects, 'B.Planning Aptitude Test', sectionBetween(paper2B, /^\s*(?:Part\s*[–-]?\s*II\s+)?APTITUDE TEST\b/im, /^\s*(?:Part\s*[–-]?\s*III\s+)?PLANNING\b/im));
      pushSubject(subjects, 'B.Planning', sectionBetween(paper2B, /^\s*(?:Part\s*[–-]?\s*III\s+)?PLANNING\b/im, null));
    }
    return newPlan({subjects:dedupeSubjects(subjects)}, 'JEE Main Syllabus Tracker', fileName);
  }

  function parseEntrance(raw, fileName, title, orderedSubjects){
    const text = stripBoilerplate(raw);
    const subjectNames = orderedSubjects || ['Physics','Chemistry','Biology','Botany','Zoology'];
    const subjects=[];
    subjectNames.forEach((name,idx)=>{
      const later = subjectNames.slice(idx+1).map(escapeRe).join('|');
      const section = sectionBetween(text, new RegExp('^\\s*'+escapeRe(name)+'\\b','im'), later ? new RegExp('^\\s*(?:'+later+')\\b','im') : null);
      if(section && section.length>80) pushSubject(subjects, name, section);
    });
    if(!subjects.length){
      const after = sectionBetween(text, /SYLLABUS\s+FOR\s+NEET/i, null) || text;
      pushSubject(subjects, 'Syllabus', after);
    }
    return newPlan({subjects:dedupeSubjects(subjects)}, title, fileName);
  }

  function parseCbseScience(raw, fileName){
    const text = stripBoilerplate(raw);
    const syllabusStart = firstIndex(text, [/COURSE STRUCTURE/i, /^\s*Cell\s+No\.\s*of\s*Periods/im], 0);
    const working = syllabusStart ? text.slice(syllabusStart) : text;
    const lines = working.split(/\n+/).map(l=>l.trim()).filter(Boolean);
    const headingIndexes=[];
    lines.forEach((line,i)=>{
      if(isCbseChapterHeading(line)) headingIndexes.push(i);
    });
    const chapters=[];
    for(let h=0; h<headingIndexes.length; h++){
      const start = headingIndexes[h];
      const end = h+1<headingIndexes.length ? headingIndexes[h+1] : lines.length;
      const headingLine = lines[start];
      const name = cleanName(headingLine.replace(/No\.\s*of\s*Periods\s*:\s*\d+.*/i,'').trim());
      const blockLines = lines.slice(start+1,end);
      const topics = extractCbseTopics(blockLines);
      if(name && topics.length) chapters.push({id:id(), name, topics: topics.map(t=>({id:id(), name:t}))});
    }
    if(!chapters.length){
      // Fallback: parse by headings and bullets.
      parseUnits(working).forEach(c=>chapters.push(c));
    }
    return newPlan({subjects:[{id:id(), name:'Science', chapters}]}, 'CBSE Science Syllabus Tracker', fileName);
  }

  function isCbseChapterHeading(line){
    if(/No\.\s*of\s*Periods\s*:\s*\d+/i.test(line)) return true;
    // Some PDF text breaks the heading and periods onto adjacent lines; keep known/simple chapter-looking lines.
    return /^(Cell|Tissues|Reproduction|Diversity|Exploring Mixtures|Structure of an Atom|Atoms and Molecules|Earth as a System|Motion|Force|Work|Sound)(?:\s+No\.|$)/.test(line) && line.length<90;
  }

  function extractCbseTopics(lines){
    const topics=[];
    let capture = false;
    for(const rawLine of lines){
      let line = rawLine.replace(/Key Concepts|Learning Outcomes/ig,'').trim();
      if(!line) continue;
      if(/^C[-–]?\s*\d+(?:\.\d+)?/i.test(line)) { capture=false; continue; }
      if(/[•●]/.test(line)) capture=true;
      if(capture || /^[A-Z][A-Za-z ,;()&\/-]{8,}$/.test(line)){
        line.split(/[•●]/).map(x=>x.trim()).filter(Boolean).forEach(piece=>{
          const cleaned = cleanTopic(piece.replace(/^[-–]+/,'').trim());
          if(isUsefulTopic(cleaned)) topics.push(cleaned);
        });
      }
    }
    return dedupeStrings(topics).slice(0,120);
  }

  function parseSchoolOrGeneric(raw, fileName){
    const text = stripBoilerplate(raw);
    const subjects = parseFlatSchoolTable(text);
    if(subjects.length) return newPlan({subjects}, inferSchoolTitle(text), fileName);
    return newPlan({subjects:[{id:id(), name:'Uploaded Syllabus', chapters:parseUnits(text)}]}, 'Uploaded Syllabus Tracker', fileName);
  }

  function parseFlatSchoolTable(text){
    const subjectList = ['English','Hindi','Maths','Mathematics','Science','Social Science','French','German','Japanese','Sanskrit','Computer','Physics','Chemistry','Biology'];
    const lines = text.split(/\n+/).map(l=>l.trim()).filter(Boolean);
    const starts=[];
    lines.forEach((line,i)=>{
      const hit = subjectList.find(s=>new RegExp('^'+escapeRe(s)+'(?:\\s+|$)','i').test(line));
      if(hit) starts.push({i, name:hit});
    });
    const subjects=[];
    starts.forEach((st,idx)=>{
      const end = idx+1<starts.length ? starts[idx+1].i : lines.length;
      let block = lines.slice(st.i,end);
      // If first line is "Maths Chapter 2 : Power Play", keep the remaining content after subject as first content line.
      const first = block[0].replace(new RegExp('^'+escapeRe(st.name)+'\\s*','i'),'').trim();
      block = (first ? [first, ...block.slice(1)] : block.slice(1)).filter(Boolean);
      const chapters = parseSchoolBlock(block, st.name);
      if(chapters.length) subjects.push({id:id(), name:st.name==='Maths'?'Mathematics':st.name, chapters});
    });
    return dedupeSubjects(subjects);
  }

  function parseSchoolBlock(lines, subject){
    const chapters=[]; let current=null;
    const startNew = line => /^(READING|WRITING|GRAMMAR|LITERATURE|व्याकरण|रचनात्मक लेखन|Chapter\s*\d+\s*:|CHAPTER[-\s]*\d+|Lecon[-\s]*\d+|Lektion\s*\d+|DAI\s*\d+\s*KA|पाठ\s*\d+)/i.test(line) || /^[A-Z ]{5,}$/.test(line);
    lines.forEach(line=>{
      line = cleanTopic(line);
      if(!line || /^Subject$/i.test(line)) return;
      if(startNew(line) || !current){
        let name=line;
        const m=line.match(/^(Chapter\s*\d+\s*:?|CHAPTER[-\s]*\d+\s*)\s*(.+)$/i);
        if(m) name = (m[1]+' '+m[2]).trim();
        current={id:id(), name:cleanName(name), topics:[]};
        chapters.push(current);
        if(!/^(READING|WRITING|GRAMMAR|LITERATURE|व्याकरण|रचनात्मक लेखन)$/i.test(line)) current.topics.push({id:id(), name:line});
      } else {
        current.topics.push({id:id(), name:line});
      }
    });
    return chapters.filter(c=>c.name && (c.topics.length || c.name.length));
  }

  function pushSubject(subjects, name, section){
    if(!section || section.replace(/\s+/g,' ').trim().length < 30) return;
    let chapters = parseUnits(section);
    if(!chapters.length){
      const body = section.replace(new RegExp('^\\s*'+escapeRe(name)+'\\b','i'),'');
      chapters = [{id:id(), name:'Syllabus', topics: splitTopics(body).map(t=>({id:id(), name:t}))}].filter(c=>c.topics.length);
    }
    if(chapters.length) subjects.push({id:id(), name:cleanName(name), chapters});
  }

  function parseUnits(section){
    let s = stripBoilerplate(section);
    s = s.replace(/\bUNITS\s*(\d+)\s*:/gi,'UNIT $1:');
    s = s.replace(/\bUNIT\s*([0-9]+)\s*[:\-.]?\s*/gi, '\n@@UNIT@@ ');
    s = s.replace(/\bUNIT\s*([IVXLCDM]+)\s*[:\-.]\s*/gi, '\n@@UNIT@@ ');
    if(s.includes('@@UNIT@@')) s = s.slice(s.indexOf('@@UNIT@@'));
    const parts = s.split(/@@UNIT@@/).map(x=>x.trim()).filter(x=>x.length>25);
    const chapters=[];
    if(parts.length>=2 || /^@@UNIT@@/.test(s)){
      parts.forEach((chunk,i)=>{
        const chapter = chunkToChapter(chunk, `Unit ${i+1}`);
        if(chapter.topics.length) chapters.push(chapter);
      });
    } else {
      // CBSE/table-like fallback: split on chapter headings and long all-caps headings.
      const lines = s.split(/\n+/).map(l=>l.trim()).filter(Boolean);
      let buffers=[]; let current=[];
      lines.forEach(line=>{
        const heading = isCbseChapterHeading(line) || (/^[A-Z][A-Za-z0-9 ,()&\/-]{3,90}$/.test(line) && !/^C[-–]?\s*\d/.test(line) && !/^(Key Concepts|Learning Outcomes|COURSE STRUCTURE|Total|Grand Total)/i.test(line));
        if(heading && current.length){ buffers.push(current.join('\n')); current=[line]; }
        else current.push(line);
      });
      if(current.length) buffers.push(current.join('\n'));
      if(buffers.length<2) buffers=[s];
      buffers.forEach((chunk,i)=>{
        const chapter = chunkToChapter(chunk, `Section ${i+1}`);
        if(chapter.topics.length) chapters.push(chapter);
      });
    }
    return chapters;
  }

  function chunkToChapter(chunk, fallback){
    chunk = chunk.replace(/^(PHYSICAL CHEMISTRY|INORGANIC CHEMISTRY|ORGANIC CHEMISTRY)\s+/i,'').trim();
    const lines = chunk.split(/\n+/).map(l=>l.trim()).filter(Boolean);
    let title=''; let body='';
    if(lines.length && lines[0].length <= 140){
      title = lines[0];
      body = lines.slice(1).join(' ');
    } else {
      const oneLine = chunk.replace(/\n/g,' ').replace(/\s+/g,' ').trim();
      const titleMatch = oneLine.match(/^([A-Z][A-Z0-9 ,()\/&.'’\-–]{5,120})(?=\s+[A-Z][a-z]|\s+[a-z]|$)/);
      if(titleMatch){ title=titleMatch[1]; body=oneLine.slice(title.length); }
      else {
        const m = oneLine.match(/^(.{12,90}?)(?:[:.;]|\s{2,})\s+(.+)$/);
        title = m ? m[1] : oneLine.split(/\s+/).slice(0,8).join(' ');
        body = m ? m[2] : oneLine.slice(title.length);
      }
    }
    title = cleanName(title.replace(/^(UNIT|Unit)\s*[-–]?\s*(\d+|[IVX]+)\s*[:.]?/i,'')) || fallback;
    body = body.trim() || chunk.replace(title,'');
    const topics = splitTopics(body).map(t=>({id:id(), name:t}));
    // If the body itself did not split well, preserve it as a single topic rather than losing content.
    if(!topics.length && body.trim()) topics.push({id:id(), name:cleanTopic(body.trim())});
    return {id:id(), name:title, topics};
  }

  function splitTopics(body){
    let cleaned = cleanTopic(body)
      .replace(/[●]/g,'•')
      .replace(/\s+/g,' ')
      .trim();
    if(!cleaned) return [];
    // Remove common administrative noise without deleting syllabus content.
    cleaned = cleaned.replace(/File No\..*?(?=(UNIT|PHYSICS|CHEMISTRY|BIOLOGY|$))/gi,' ')
                     .replace(/Generated from eOffice.*?(?=(UNIT|PHYSICS|CHEMISTRY|BIOLOGY|$))/gi,' ');
    let pieces = cleaned.split(/(?:•|\u2022|;|\.\s+(?=[A-Z0-9])|\b\d+\.\s+|,\s+(?=[A-Z][a-z]{2,}))/).map(x=>x.trim());
    if(pieces.length < 3) pieces = cleaned.split(/;|,|\band\b/i).map(x=>x.trim());
    const out=[];
    pieces.forEach(p=>{
      p = cleanTopic(p.replace(/^[-–:,.;\s]+|[-–:,.;\s]+$/g,''));
      if(isUsefulTopic(p)) out.push(p);
    });
    return dedupeStrings(out);
  }

  function stripBoilerplate(text){
    return normalizeRaw(text)
      .replace(/Syllabus\s+for\s+JEE\s*\(Main\)\s*-\s*2026/gi,'')
      .replace(/\bPage\s+\d+\b/gi,'')
      .replace(/^\s*\d+\s*$/gm,'')
      .replace(/^\s*4565948\/2025\/UGMEB.*$/gm,'')
      .replace(/^\s*File No\..*$/gm,'')
      .replace(/^\s*Generated from eOffice.*$/gm,'')
      .replace(/^\s*DFA\/.*$/gm,'')
      .replace(/\n{3,}/g,'\n\n');
  }

  function sectionBetween(text, startRe, endRe){
    const start = text.search(startRe); if(start<0) return '';
    const after = text.slice(start);
    if(!endRe) return after;
    const end = after.slice(1).search(endRe);
    return end>=0 ? after.slice(0,end+1) : after;
  }

  function firstIndex(text, regexes, fallback){
    let found = fallback;
    regexes.forEach(re=>{ const idx=text.search(re); if(idx>=0 && idx<found) found=idx; });
    return found;
  }

  function inferSchoolTitle(text){
    const cls = text.match(/Class\s*[-–]?\s*([A-ZIVX0-9]+)/i)?.[0] || '';
    const pt = text.match(/PT[-\s]*\d+\s*Syllabus\s*\d{2}[-–]\d{2}/i)?.[0] || 'School Syllabus Tracker';
    return `${cls} ${pt}`.trim();
  }

  function cleanTextLine(s){ return String(s||'').replace(/\u00a0/g,' ').replace(/\uFFFD/g,' ').replace(/[ \t]+/g,' ').trim(); }
  function normalizeRaw(text){ return String(text||'').replace(/\r/g,'\n').split('\n').map(cleanTextLine).join('\n').replace(/\n{3,}/g,'\n\n').trim(); }
  function joinLine(parts){ return parts.map(cleanTextLine).filter(Boolean).join(' ').replace(/\s+/g,' ').trim(); }
  function cleanName(s){ return cleanTopic(s).replace(/[:.]+$/,'').replace(/\s{2,}/g,' ').slice(0,140).trim(); }
  function cleanTopic(s){ return String(s||'').replace(/\u00a0/g,' ').replace(/\uFFFD/g,' ').replace(/[ \t]+/g,' ').replace(/\s+([,.;:])/g,'$1').trim(); }
  function isUsefulTopic(s){
    if(!s || s.length<3 || s.length>240) return false;
    if(/^(and|or|the|their|its|of|in|to|for|with|Key Concepts|Learning Outcomes)$/i.test(s)) return false;
    if(/^\d+$/.test(s)) return false;
    if(/^NMC|^National Testing Agency|^PUBLIC NOTICE/i.test(s)) return false;
    return true;
  }
  function dedupeStrings(arr){ const seen=new Set(); return arr.filter(x=>{const k=x.toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true;}); }
  function dedupeSubjects(subjects){ const seen=new Set(); return subjects.filter(s=>{ const k=s.name.toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; }); }
  function escapeRe(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
  function id(){ return (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id_'+Math.random().toString(36).slice(2)+Date.now().toString(36); }

  window.MyPlanParser = Parser;
})();
