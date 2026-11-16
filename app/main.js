/* Minyun v2. Local-first interface. All user supplied text is escaped. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = {catalog:null, token:'', page:'explore', selected:[], plan:null, saved:[], asking:false, map:null, routeMap:null, boundary:null, markers:null, routeLayer:null, editId:null, deleteId:null};
  let toastTimer;
  function toast(text) { $('toast').textContent=text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500); }
  async function api(path,method='GET',body) {
    const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),30000);
    try {
      const r=await fetch(path,{method,signal:ctrl.signal,headers:{'Content-Type':'application/json','X-Minyun-Token':state.token},...(body?{body:JSON.stringify(body)}:{})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'请求失败');return d;
    } catch(e) { if(e.name==='AbortError')throw new Error('请求超时，请重试。'); throw e; }
    finally { clearTimeout(timer); }
  }
  function site(id) { return state.catalog.sites.find(s=>s.id===id); }
  function source(id) { return state.catalog.sources.find(s=>s.id===id); }
  function options(items) { return items.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join(''); }
  function showPage(page) {
    if(!['explore','ask','plan','saved'].includes(page))page='explore';
    state.page=page;
    document.querySelectorAll('.page').forEach(el=>{el.hidden=el.id!=='page-'+page;});
    document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===page);b.setAttribute('aria-current',b.dataset.page===page?'page':'false');});
    $('pageLabel').textContent={explore:'发现非遗',ask:'有据问答',plan:'策划一程',saved:'我的行程'}[page];
    if(location.hash!=='#'+page)history.replaceState(null,'','#'+page);
    if(page==='explore'&&state.map)requestAnimationFrame(()=>state.map.invalidateSize());
    if(page==='plan'&&state.routeMap)requestAnimationFrame(()=>state.routeMap.invalidateSize());
    if(page==='saved')renderSaved().catch(e=>toast(e.message));
  }
  function initMap(id) {
    const map=L.map(id,{minZoom:5,maxZoom:14,attributionControl:true,scrollWheelZoom:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([26.1,118.5],7);
    map.attributionControl.addAttribution('文化分布示意 · 边界数据 DataV · 非导航地图');
    L.geoJSON(state.boundary,{style:{color:'#a9bba0',weight:1,fillColor:'#d6e0cd',fillOpacity:.8}}).addTo(map);
    const bounds=L.geoJSON(state.boundary).getBounds();map.fitBounds(bounds,{padding:[20,20],animate:false});return map;
  }
  function renderExplore() {
    const q=$('search').value.trim().toLowerCase(),city=$('cityFilter').value,cat=$('categoryFilter').value;
    const list=state.catalog.sites.filter(s=>(city==='全部'||s.city===city)&&(cat==='all'||s.cat===cat)&&(!q||[s.name,s.officialName,s.city,...s.tags].join(' ').toLowerCase().includes(q)));
    $('resultCount').textContent=list.length+' 个文化条目';
    $('verifiedCount').textContent=state.catalog.sources.length+' 个条目已匹配权威名录';
    $('siteGrid').innerHTML=list.length?list.map(s=>`<article class="site-card"><button class="card-image" data-detail="${s.id}" aria-label="查看${esc(s.name)}"><img loading="lazy" src="${s.image}" alt="${esc(s.name)}主题图片"><span class="image-category">${esc(state.catalog.categories[s.cat].name)}</span></button><div class="card-copy"><div class="meta"><span>${esc(s.city)}</span><span>${s.verified?'名录可查 ↗':'待核验'}</span></div><h3>${esc(s.name)}</h3><p>${esc(s.brief)}</p><div class="card-footer"><button data-detail="${s.id}">读它的故事 ↗</button><button data-add="${s.id}" ${s.verified?'':'disabled'} class="${state.selected.includes(s.id)?'added':''}">${state.selected.includes(s.id)?'✓ 已选':'＋ 加入候选'}</button></div></div></article>`).join(''):'<div class="empty-state"><h2>还没有找到这个项目</h2><p>试试项目简称，或重置城市与类别。</p></div>';
    if(state.markers)state.map.removeLayer(state.markers);
    state.markers=L.layerGroup().addTo(state.map);
    list.forEach(s=>{
      const marker=L.circleMarker([s.lat,s.lng],{radius:6,color:'#fff',weight:2,fillColor:s.verified?'#ad6447':'#9da693',fillOpacity:.95}).addTo(state.markers);
      marker.bindTooltip(s.name,{direction:'top'});
      const wrap=document.createElement('div');wrap.className='map-popup';
      const title=document.createElement('strong');title.textContent=s.name;wrap.appendChild(title);
      const meta=document.createElement('p');meta.textContent=s.city+' · '+(s.verified?'名录可查':'待核验');wrap.appendChild(meta);
      const btn=document.createElement('button');btn.textContent='查看资料 →';btn.addEventListener('click',()=>openDetail(s.id));wrap.appendChild(btn);
      marker.bindPopup(wrap);
    });
    if(city!=='全部'&&list.length)state.map.fitBounds(L.latLngBounds(list.map(s=>[s.lat,s.lng])),{padding:[45,45],maxZoom:10});
    else state.map.fitBounds(L.geoJSON(state.boundary).getBounds(),{padding:[20,20]});
  }
  function openDetail(id) {
    const s=site(id);if(!s)return;
    const src=source(s.sourceId);
    $('detailBody').innerHTML=`<div class="detail-hero"><img src="${s.image}" alt="${esc(s.name)}主题照片"><div class="detail-title"><h2>${esc(s.name)}</h2><span>${esc(s.city)} / ${esc(state.catalog.categories[s.cat].name)} / ${esc(s.level)}</span></div></div><div class="detail-content"><div class="fact-grid"><div><span>名录正式名称</span>${esc(s.officialName)}</div><div><span>申报地区或单位</span>${esc(s.region)}</div><div><span>公布批次</span>${esc(s.year||'尚待核验')}</div><div><span>名录记载的保护单位</span>${esc(s.protectUnit||'尚待核验')}</div></div><h3>名录怎么说</h3><p>${esc(s.text||s.brief)}</p>${src?`<div class="source-box"><strong>资料有据，原文可查</strong><p>${esc(src.publisher)}<br>核验日期 ${src.checkedAt}</p><a href="${src.url}" target="_blank" rel="noopener noreferrer">打开权威原文 ↗</a>　<button class="text-button" data-source="${src.id}">查看本地摘录</button></div>`:''}<h3>探访前，做一点准备</h3><p>${esc(s.experience)}<br>${esc(s.availability)}</p><p class="detail-source-note">${esc(s.locationNote)}<br>图片：${esc(s.imageCredit)}</p><div class="detail-actions"><button class="button primary" data-add="${s.id}" ${s.verified?'':'disabled'}>${state.selected.includes(s.id)?'✓ 已加入候选':'＋ 加入行程候选'}</button><button class="button secondary" data-related="${s.id}">查问相关资料 ↗</button></div></div>`;
    $('detailDialog').showModal();
  }
  function openSource(id) {
    const s=source(id);if(!s)return;
    $('infoBody').innerHTML=`<span class="eyebrow">SOURCE RECORD</span><h2>${esc(s.officialName)}</h2><p>${esc(s.publisher)}<br>核验日期：${s.checkedAt}</p><p>${esc(s.scope)}</p><pre>${esc(s.excerpt)}</pre><p><a href="${s.url}" target="_blank" rel="noopener noreferrer">查看原网页 ↗</a></p><p style="font-size:10px">摘录 SHA-256：${esc(s.sha256)}</p>`;
    $('infoDialog').showModal();
  }
  function invalidatePlan() { state.plan=null;$('planOutput').hidden=true;$('planEmpty').hidden=false;$('planError').textContent=''; }
  function syncChosen() {
    $('chosenList').innerHTML=state.selected.length?state.selected.map(id=>`<button type="button" data-remove="${id}">${esc(site(id).name)} ×</button>`).join(''):'未指定，由系统筛选';
  }
  function toggleCandidate(id) {
    const s=site(id);if(!s?.verified)return;
    if(state.selected.includes(id)){state.selected=state.selected.filter(x=>x!==id);toast('已移出候选');}
    else {
      if(state.selected.length>=8){toast('最多选择 8 个候选项目');return;}
      if($('planCity').value!==s.city){state.selected=[];$('planCity').value=s.city;toast('已切换到'+s.city+'，开始新的候选行程');}
      else toast('已加入候选，前往“策划一程”安排');
      state.selected.push(id);$('planCategory').value='all';
    }
    invalidatePlan();syncChosen();renderExplore();
    if($('detailDialog').open){$('detailDialog').close();openDetail(id);}
  }
  function introChat() {
    $('messages').innerHTML='<div class="message bot"><div class="msg-label">阿闽 · 原文检索</div><div class="msg-body">你好，我是阿闽。\n\n我会从已核验的非遗名录中找资料，把答案和出处一起交给你。\n\n你可以问：“南音使用哪些乐器？”或“歌仔戏起源在哪里？”</div></div>';
    $('evidenceList').innerHTML='<div class="empty-note"><span>“</span><p>不把“像真的”<br>当成“有依据”。</p></div>';
  }
  async function ask(query) {
    if(state.asking)return;
    const q=(query||$('question').value).trim();if(!q){toast('先写下你想了解的问题');return;}
    if(q.length>500){toast('问题请控制在 500 字以内');return;}
    showPage('ask');state.asking=true;$('askSubmit').disabled=true;$('clearChat').disabled=true;$('question').value='';
    const user=document.createElement('div');user.className='message user';user.textContent=q;$('messages').appendChild(user);
    const pending=document.createElement('div');pending.className='pending';pending.textContent='正在检索原文与引用依据…';$('messages').appendChild(pending);$('messages').scrollTop=$('messages').scrollHeight;
    const start=performance.now();
    try {
      const result=await api('/api/answer','POST',{query:q,useModel:$('useModel').checked});
      const message=document.createElement('div');message.className='message bot';
      message.innerHTML=`<div class="msg-label">阿闽 · ${result.mode==='model'?'模型整理，请对照原文':'原文摘录'}</div><div class="msg-body">${esc(result.answer)}</div>${result.notice?'<p class="retrieval-note">'+esc(result.notice)+'</p>':''}<div class="result-links">${result.hits.slice(0,3).map(h=>`<button data-detail="${h.siteId}">${esc(h.name)} ↗</button>`).join('')}</div>`;
      $('messages').appendChild(message);
      $('evidenceList').innerHTML=result.citations.map(c=>`<article class="evidence-card"><span class="source-label">REFERENCE 0${c.index}</span><h3>[${c.index}] ${esc(c.officialName)}</h3><p>${esc(c.publisher)}<br>${esc(c.region)} · ${esc(c.year)}<br>核验日期 ${c.checkedAt}</p><button class="text-button" data-source="${c.id}">读本地原文</button><a href="${c.url}" target="_blank" rel="noopener noreferrer">来源网页 ↗</a></article>`).join('')+`<div class="retrieval-note">${result.hits.length?'检索到 '+result.hits.length+' 个项目 · '+Math.round(performance.now()-start)+' ms':'没有足够依据 · 未生成事实答案'}${result.hits.length?'<div class="method-chips">'+result.hits[0].matched.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div>':''}</div>`;
    } catch(e) {
      const msg=document.createElement('div');msg.className='message bot';msg.textContent='这次查询没有完成：'+e.message+'。你可以重试，已保存的行程不受影响。';$('messages').appendChild(msg);
    } finally { pending.remove();state.asking=false;$('askSubmit').disabled=false;$('clearChat').disabled=false;$('messages').scrollTop=$('messages').scrollHeight; }
  }
  function planParams() { return {city:$('planCity').value,mode:$('travelMode').value,minutes:Number($('duration').value),startTime:$('startTime').value,category:$('planCategory').value,maxStops:Number($('maxStops').value),siteIds:[...state.selected]}; }
  async function generatePlan(e) {
    e?.preventDefault();$('planError').textContent='';$('planSubmit').disabled=true;
    const params=planParams();
    try { const p=await api('/api/plan','POST',params);if(JSON.stringify(params)!==JSON.stringify(planParams())){toast('条件已改变，请按新条件重新生成');return;}renderPlan(p); }
    catch(err){invalidatePlan();$('planError').textContent=err.message;}
    finally{$('planSubmit').disabled=false;}
  }
  function renderPlan(p) {
    state.plan=p;$('planEmpty').hidden=true;$('planOutput').hidden=false;
    $('planSummary').innerHTML=`<span class="eyebrow" style="color:#ccb68c">YOUR MINYUN JOURNEY</span><h2>${esc(p.city)} · ${p.stops.length} 站文化小旅行</h2><p>从城市参考点出发 · ${p.startTime} — ${p.endTime} · ${ {drive:'乘车',walk:'步行',bike:'骑行'}[p.mode]}估算</p><div class="plan-stats"><div><strong>${p.minutes}<small> 分钟</small></strong><span>含停留与交通</span></div><div><strong>${p.estimatedKm}<small> km</small></strong><span>估算路程</span></div><div><strong>${p.remainingMinutes}<small> 分钟</small></strong><span>余量 / 时间预算 ${p.budgetMinutes} 分</span></div></div>`;
    $('timeline').innerHTML=p.stops.map((t,i)=>`<article class="timeline-step"><span class="timeline-number">${i+1}</span><div class="time">${t.arrive} — ${t.leave}</div><h3>${esc(t.name)}</h3><p>上一点至此：约 ${t.travelMinutes} 分钟 / ${t.estimatedKm} km<br>建议停留 ${t.visitMinutes} 分钟 · 场次需事先确认</p><button class="text-button" data-detail="${t.siteId}">了解这个项目 ↗</button></article>`).join('');
    $('planMethod').innerHTML=`<p>本次在 ${p.candidateCount} 个候选中，检查 ${p.examined} 种访问顺序。优先安排更多站点，再考虑类别多样性和估算耗时。</p><ul>${p.assumptions.map(a=>'<li>'+esc(a)+'</li>').join('')}</ul>${p.excluded.length?'<p>本次未选：'+p.excluded.map(x=>esc(x.name)).join('、')+'。</p>':''}`;
    requestAnimationFrame(()=>{
      if(!state.routeMap)state.routeMap=initMap('routeMap');
      state.routeMap.invalidateSize();if(state.routeLayer)state.routeMap.removeLayer(state.routeLayer);
      state.routeLayer=L.layerGroup().addTo(state.routeMap);
      const pts=p.stops.map(t=>{const s=site(t.siteId);return [s.lat,s.lng];});
      L.polyline(pts,{color:'#ae6547',weight:3,dashArray:'5 8'}).addTo(state.routeLayer);
      pts.forEach((pt,i)=>L.marker(pt,{icon:L.divIcon({className:'',html:'<span class="map-number">'+(i+1)+'</span>',iconSize:[26,26]})}).bindTooltip(p.stops[i].name).addTo(state.routeLayer));
      state.routeMap.fitBounds(L.latLngBounds(pts),{padding:[35,35],maxZoom:13,animate:false});
    });
  }
  function download(name,body,type) { const blob=new Blob([body],{type});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000); }
  function exportPlan() {
    const p=state.plan;if(!p)return;
    const content=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.city)}非遗行程单</title><style>body{font:15px/1.8 "Microsoft YaHei",sans-serif;color:#234330;max-width:820px;margin:40px auto;padding:20px}h1{font-size:32px}header{border-bottom:2px solid #234330;padding-bottom:20px}article{padding:18px 0;border-bottom:1px solid #ddd}small,p{color:#647260}a{color:#285d47}h2{font-size:20px}footer{font-size:12px;margin-top:30px}@media print{body{margin:0}article{break-inside:avoid}}</style><header><small>闽韵智小铺 · 有据可循，有路可行</small><h1>${esc(p.city)} · 非遗文化行程单</h1><p>${p.startTime}—${p.endTime} / ${p.minutes} 分钟 / 估算 ${p.estimatedKm} km / 余量 ${p.remainingMinutes} 分钟</p></header>${p.stops.map((t,i)=>`<article><small>第 ${i+1} 站 · ${t.arrive}—${t.leave}</small><h2>${esc(t.name)}</h2><p>交通约 ${t.travelMinutes} 分钟；停留 ${t.visitMinutes} 分钟。</p><p>${esc(site(t.siteId).experience)}</p><a href="${source(site(t.siteId).sourceId).url}">查看非遗名录原文</a></article>`).join('')}<footer><p>${p.assumptions.map(esc).join('<br>')}</p><p>请提前核对场馆地址、营业时间、演出场次及预约。文化分布点不等于营业门店。<br>资料版本：${p.dataVersion} · 在浏览器打印可保存为 PDF。</p></footer></html>`;
    download(p.city+'非遗行程单.html',content,'text/html;charset=utf-8');toast('行程单已导出，可直接打开或打印成 PDF');
  }
  async function saveCurrent() {
    if(!state.plan)return;$('savePlan').disabled=true;
    try {await api('/api/plans','POST',{params:state.plan.params,title:state.plan.city+' · '+state.plan.stops.length+'站文化行程'});toast('已保存，刷新后仍可在“我的行程”查看');}
    catch(e){toast(e.message);}finally{$('savePlan').disabled=false;}
  }
  async function renderSaved() {
    state.saved=await api('/api/plans');
    $('savedGrid').innerHTML=state.saved.length?state.saved.map(r=>`<article class="saved-card"><div class="saved-city">${esc(r.plan.city)}<span style="float:right;font-size:12px;color:#71836b">${r.plan.stops.length} STOPS</span></div><h2>${esc(r.title)}</h2><p>${r.plan.startTime}—${r.plan.endTime} · ${r.plan.minutes} 分钟<br>${r.plan.stops.map(s=>esc(s.name)).join(' → ')}</p><div class="saved-buttons"><button data-restore="${r.id}">查看 / 导出 ↗</button><button data-edit="${r.id}">重命名</button><button data-delete="${r.id}">删除</button></div></article>`).join(''):'<div class="empty-state"><h2>下一程，从这里开始。</h2><p>在“策划一程”生成并保存行程，就能在这里再次找到。</p><button class="button primary" data-go="plan">去安排一程 ↗</button></div>';
  }
  function restore(id) {
    const r=state.saved.find(x=>x.id===id);if(!r)return;const p=r.plan.params;
    for(const [id,value,label] of [['duration',p.minutes,p.minutes+' 分钟'],['maxStops',p.maxStops,p.maxStops+' 站']]){
      if(![...$(id).options].some(o=>o.value===String(value)))$(id).add(new Option(label,String(value)));
    }
    $('planCity').value=p.city;$('travelMode').value=p.mode;$('duration').value=String(p.minutes);$('startTime').value=p.startTime;$('planCategory').value=p.category;$('maxStops').value=String(p.maxStops);state.selected=[...p.siteIds];syncChosen();showPage('plan');renderPlan(r.plan);window.scrollTo({top:0});
  }
  function info(kind) {
    $('infoBody').innerHTML=kind==='help'?`<span class="eyebrow">DEMONSTRATION GUIDE</span><h2>用一条旅程，讲清作品。</h2><ol><li>在“发现非遗”搜索“簪花”，打开详情，查看正式名录名称和来源。</li><li>在“有据问答”询问“歌仔戏起源在哪里？”，对照右侧原文；再问实时场次，展示信息边界。</li><li>到“策划一程”，选择泉州、4 小时、乘车，生成行程；切换步行或 2 小时，观察约束如何改变结果。</li><li>保存行程，刷新页面，再到“我的行程”恢复、重命名并导出。</li></ol><p>文化资料、图片、地图边界随包提供。本地服务运行时，以上核心流程不依赖外网。</p>`:`<span class="eyebrow">ABOUT MINYUN</span><h2>有据可循，有路可行。</h2><p>赛道：AI创新应用挑战赛 · Vibe Coding 作品<br>版本：2.0.0</p><h3>本版真实能力</h3><p>48 个文化条目，45 个已对上国家级名录；3 个待核验条目不参与问答与自动行程。默认问答为检索原文摘录；配置服务端模型后可选用模型整理。时间规划采用小规模穷举与估算交通模型。</p><h3>资料与使用边界</h3><p>国家级非遗名录内容来源：中国非物质文化遗产网。核验日期：2026-11-16。这里只核验文化事实与名录字段，未核验实际门店坐标、票价、营业时间和场次。</p><p>地图使用 Leaflet（BSD-2-Clause）及本地 DataV 行政边界；仅作文化分布示意。非遗图片沿用参赛者原仓库；参赛者确认已获授权，具体来源凭据待补充。</p><p>个人行程只保存在本机。可选模型模式会把你的问题和检索摘录发给你自行配置的模型服务。</p>`;
    $('infoDialog').showModal();
  }
  async function init() {
    if(location.protocol==='file:')throw new Error('请双击参赛包中的“启动作品.cmd”启动本地服务，再在浏览器使用作品。直接打开 HTML 无法访问行程数据库。');
    const health=await api('/api/health');state.token=health.csrfToken;
    const [catalog,boundary]=await Promise.all([api('/api/catalog'),fetch('/data/fujian.geo.json').then(r=>r.json())]);state.catalog=catalog;state.boundary=boundary;
    $('health').textContent='本地服务已就绪';$('mapProjects').textContent=catalog.sources.length;
    const cats=[['all','全部类别'],...Object.entries(catalog.categories).map(([k,v])=>[k,v.name])];
    $('cityFilter').innerHTML=options(catalog.cities.map(c=>[c,c]));$('categoryFilter').innerHTML=options(cats);
    $('planCity').innerHTML=options(catalog.cities.filter(c=>c!=='全部'&&c!=='平潭').map(c=>[c,c]));$('planCity').value='泉州';$('planCategory').innerHTML=options(cats);
    $('useModel').disabled=!health.modelConfigured;if(health.modelConfigured)$('modelHint').textContent='开启后发送问题与摘录到所配置的模型';
    state.map=initMap('atlasMap');renderExplore();introChat();syncChosen();showPage(location.hash.slice(1)||'explore');
    document.addEventListener('click',e=>{
      const b=e.target.closest('button,[data-go]');if(!b)return;
      if(b.dataset.page)showPage(b.dataset.page);
      if(b.dataset.go){showPage(b.dataset.go);window.scrollTo({top:0});}
      if(b.dataset.detail)openDetail(b.dataset.detail);
      if(b.dataset.source)openSource(b.dataset.source);
      if(b.dataset.add)toggleCandidate(b.dataset.add);
      if(b.dataset.remove){state.selected=state.selected.filter(x=>x!==b.dataset.remove);invalidatePlan();syncChosen();renderExplore();}
      if(b.dataset.ask)ask(b.dataset.ask);
      if(b.dataset.related){$('detailDialog').close();ask(site(b.dataset.related).name+'是什么？');}
      if(b.dataset.restore)restore(b.dataset.restore);
      if(b.dataset.edit){state.editId=b.dataset.edit;$('editTitle').value=state.saved.find(r=>r.id===state.editId).title;$('editDialog').showModal();$('editTitle').focus();}
      if(b.dataset.delete){state.deleteId=b.dataset.delete;$('deleteDialog').showModal();}
      if(b.classList.contains('dialog-close'))b.closest('dialog').close();
    });
    $('filterForm').addEventListener('submit',e=>e.preventDefault());['search','cityFilter','categoryFilter'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',renderExplore));
    $('clearFilter').onclick=()=>{$('search').value='';$('cityFilter').value='全部';$('categoryFilter').value='all';renderExplore();};
    $('resetMap').onclick=()=>state.map.fitBounds(L.geoJSON(state.boundary).getBounds(),{padding:[20,20]});
    $('askForm').onsubmit=e=>{e.preventDefault();ask();};
    $('question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();ask();}};
    $('clearChat').onclick=introChat;$('planForm').onsubmit=generatePlan;
    $('planForm').addEventListener('change',e=>{if(e.target.id==='planCity')state.selected=[];invalidatePlan();syncChosen();renderExplore();});
    $('clearChosen').onclick=()=>{state.selected=[];invalidatePlan();syncChosen();renderExplore();};
    $('savePlan').onclick=saveCurrent;$('exportPlan').onclick=exportPlan;
    $('downloadJson').onclick=()=>{if(state.plan)download('闽韵行程备份.json',JSON.stringify({schema:'minyun-plan-v2',params:state.plan.params},null,2),'application/json');};
    $('importPlan').onchange=async e=>{
      const f=e.target.files[0];if(!f)return;
      try{if(f.size>100000)throw new Error('备份文件过大');const d=JSON.parse(await f.text());if(d.schema!=='minyun-plan-v2'||!d.params)throw new Error('不是有效的闽韵行程备份');await api('/api/plans','POST',{params:d.params,title:'导入 · '+d.params.city+'文化行程'});await renderSaved();toast('已导入并按当前数据重新校验');}catch(err){toast('导入失败：'+err.message);}finally{e.target.value='';}
    };
    $('editForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/plans/'+state.editId,'PATCH',{title:$('editTitle').value});$('editDialog').close();await renderSaved();toast('名称已保存');}catch(err){toast(err.message);}};
    $('cancelEdit').onclick=()=>$('editDialog').close();$('cancelDelete').onclick=()=>$('deleteDialog').close();
    $('confirmDelete').onclick=async()=>{try{await api('/api/plans/'+state.deleteId,'DELETE');$('deleteDialog').close();await renderSaved();toast('已删除这份行程');}catch(err){toast(err.message);}};
    $('helpBtn').onclick=()=>info('help');$('aboutBtn').onclick=()=>info('about');
    window.addEventListener('hashchange',()=>showPage(location.hash.slice(1)));
    document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  }
  init().catch(e=>{$('health').textContent='本地服务未连接';$('globalError').hidden=false;$('globalError').textContent=e.message;$('globalError').scrollIntoView();});
})();
