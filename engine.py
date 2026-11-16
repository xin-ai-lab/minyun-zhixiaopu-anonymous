"""Evidence retrieval and constrained itinerary planning. Python standard library only."""
from pathlib import Path
import collections, hashlib, itertools, json, math, re

ROOT = Path(__file__).resolve().parent
CATALOG = json.loads((ROOT / 'data/catalog.json').read_text(encoding='utf-8'))
SITES = CATALOG['sites']
BY_ID = {s['id']: s for s in SITES}
SOURCES = {s['id']: s for s in CATALOG['sources']}
VERSION = CATALOG['version']
DATA_HASH = hashlib.sha256((ROOT / 'data/catalog.json').read_bytes()).hexdigest()
STOP = ('请问','请介绍','介绍一下','能不能','帮我','我想','了解','什么','哪些','怎么','哪里','一下','关于','以及','是否','可以','推荐','非遗')
ALIASES = {'簪花': '簪花围 蟳埔女习俗', '蟳埔': '簪花围 蟳埔女习俗', '南管': '南音', '芗剧': '歌仔戏', '木偶': '提线木偶 布袋木偶', '非物质文化遗产': '非遗', '大红袍': '武夷岩茶', '脱胎漆器': '福州脱胎漆器髹饰技艺'}

def normalize(text):
    return re.sub(r'[^\w\u4e00-\u9fff]', '', str(text).lower())

def tokens(text):
    words = re.findall(r'[a-z0-9]+|[\u4e00-\u9fff]+', str(text).lower())
    return [t for word in words for t in ([word] if len(word)<2 or word.isascii() else [word[i:i+2] for i in range(len(word)-1)])]

# Index source paragraphs rather than synthesised historical claims.
DOCS = []
for site in SITES:
    if not site['verified']: continue
    paragraphs = [p.strip() for p in site['text'].split('\n') if p.strip()]
    for i, p in enumerate(paragraphs):
        for j in range(0, len(p), 500):
            text=p[j:j+600]
            DOCS.append({'siteId':site['id'],'sourceId':site['sourceId'],'chunkId':f"{site['id']}:{i}:{j}",'text':text,
                         'tf':collections.Counter(tokens(site['name']+' '+site['officialName']+' '+site['city']+' '+text))})
DF=collections.Counter(t for d in DOCS for t in d['tf'])
AVG=sum(sum(d['tf'].values()) for d in DOCS)/max(1,len(DOCS))

def search(query, city='全部', category='all', limit=6):
    if not isinstance(query,str) or len(query)>500: raise ValueError('问题请控制在 500 字以内。')
    raw=normalize(query)
    if not raw:return []
    clean=raw
    for stop in STOP:clean=clean.replace(stop,'')
    expanded=clean+' '+ ' '.join(v for k,v in ALIASES.items() if k in clean)
    qt=set(tokens(expanded))
    if not qt: qt=set(tokens(raw))
    named=[s['id'] for s in SITES if normalize(s['name']) in raw or normalize(s['officialName']) in raw
           or any(normalize(t) in raw for t in s['tags'] if len(t)>=2)]
    detected=[c for c in CATALOG['cities'][1:] if c in raw]
    scored=[]
    for d in DOCS:
        s=BY_ID[d['siteId']]
        if city!='全部' and s['city']!=city:continue
        if category!='all' and s['cat']!=category:continue
        if detected and not named and s['city'] not in detected:continue
        length=sum(d['tf'].values());score=0;matched=[]
        for t in qt:
            f=d['tf'].get(t,0)
            if f:
                idf=math.log(1+(len(DOCS)-DF[t]+0.5)/(DF[t]+0.5))
                score+=idf*f*2.2/(f+1.2*(0.25+0.75*length/AVG));matched.append(t)
        if s['id'] in named:score+=12
        if score>1 and (matched or s['id'] in named):scored.append((score,d,matched))
    scored.sort(key=lambda x:(-x[0],x[1]['chunkId']))
    result=[];seen=set()
    for score,d,matched in scored:
        if d['siteId'] in seen:continue
        # A single generic bigram is not sufficient evidence for an unrelated question.
        if len(matched)<2 and d['siteId'] not in named and not detected:continue
        seen.add(d['siteId']);s=BY_ID[d['siteId']]
        result.append({'siteId':s['id'],'name':s['name'],'city':s['city'],'category':s['cat'],
                       'score':round(score,3),'matched':matched[:10],'chunkId':d['chunkId'],'text':d['text'],
                       'source':SOURCES[s['sourceId']]})
        if len(result)>=limit:break
    return result

def answer(query,city='全部',category='all'):
    query=query.strip()
    if not query: raise ValueError('请输入你想了解的问题。')
    hits=search(query,city,category,4)
    dynamic=any(w in query for w in ('今天','明天','门票','票价','预约','营业','几点','电话','多少钱','实时'))
    if not hits:
        return {'mode':'evidence','answer':'当前资料中没有找到足够相关的依据。我不会补写未经证实的答案。你可以换用项目名称，或先在非遗地图中查看已收录内容。','citations':[], 'hits':[], 'needsVerification':True}
    paragraphs=[]
    for i,h in enumerate(hits[:3],1):
        sentences=re.split(r'(?<=[。！？])',h['text'])
        qs=set(tokens(query)); ranked=sorted(enumerate(sentences),key=lambda x:-len(set(tokens(x[1]))&qs))[:2]
        excerpt=''.join(sentences[j] for j,_ in sorted(ranked))[:420]
        paragraphs.append(f"【{h['name']}】{excerpt} [{i}]")
    pre='以下为名录原文的相关摘录。'
    if dynamic:pre='当前资料不包含实时票价、营业时间或预约余量；这些信息需要向场馆确认。以下是已收录的文化背景。'
    return {'mode':'evidence','answer':pre+'\n\n'+'\n\n'.join(paragraphs),'hits':hits,
            'citations':[{'index':i+1,**h['source']} for i,h in enumerate(hits[:3])],
            'needsVerification':dynamic,'method':'BM25 + 中文双字分词 + 实体别名 + 地区约束；摘要为原文摘录'}

def haversine(a,b):
    lat1,lng1,lat2,lng2=map(math.radians,[a[0],a[1],b[0],b[1]])
    h=math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin((lng2-lng1)/2)**2
    return 6371*2*math.asin(min(1,math.sqrt(h)))

ANCHORS={'泉州':[24.907,118.587],'福州':[26.075,119.303],'厦门':[24.479,118.089],
         '漳州':[24.513,117.647],'莆田':[25.454,119.008],'三明':[26.266,117.638],
         '南平':[27.331,118.121],'龙岩':[25.075,117.017],'宁德':[26.666,119.548]}
SPEED={'walk':4.5,'bike':12,'drive':25}
def fmt(m):return f'{m//60:02d}:{m%60:02d}'

def plan(options):
    if not isinstance(options,dict):raise ValueError('行程参数格式错误。')
    city=options.get('city','泉州');mode=options.get('mode','drive');category=options.get('category','all')
    if city not in ANCHORS:raise ValueError('该地区暂无已核验的行程候选点，请选择其他城市。')
    if mode not in SPEED:raise ValueError('请选择步行、骑行或乘车。')
    if category!='all' and category not in CATALOG['categories']:raise ValueError('非遗类别无效。')
    try:
        budget=int(options.get('minutes',240));max_stops=int(options.get('maxStops',3))
        time=options.get('startTime','09:00')
        if not re.fullmatch(r'\d{2}:\d{2}',time):raise ValueError()
        hh,mm=map(int,time.split(':'));start=hh*60+mm
        if hh>23 or mm>59:raise ValueError()
    except (TypeError,ValueError):raise ValueError('出发时间或时长格式不正确。')
    if not 30<=budget<=600 or not 1<=max_stops<=4:raise ValueError('可用时间应为 30–600 分钟，站点数为 1–4。')
    if start+budget>24*60:raise ValueError('当前版本支持当天行程，请将结束时间设置在午夜之前。')
    chosen=options.get('siteIds',[])
    if not isinstance(chosen,list) or len(chosen)>8 or any(not isinstance(x,str) for x in chosen):raise ValueError('最多选择 8 个候选项目。')
    if len(chosen)!=len(set(chosen)):raise ValueError('候选项目不能重复。')
    if any(x not in BY_ID or not BY_ID[x]['verified'] or BY_ID[x]['city']!=city for x in chosen):raise ValueError('候选项目必须属于所选城市且具有核验来源。')
    all_pool=[s for s in SITES if s['verified'] and s['city']==city]
    pool=[s for s in all_pool if not chosen or s['id'] in chosen]
    if category!='all':pool=[s for s in pool if s['cat']==category]
    anchor=ANCHORS[city]
    pool=sorted(pool,key=lambda s:(haversine(anchor,[s['lat'],s['lng']]),s['id']))[:8]
    if not pool:raise ValueError('当前条件没有候选项目，请更换类别或清空已选项目。')
    def segment(a,b):
        km=haversine(a,b)*1.35
        return km,int(math.ceil(km/SPEED[mode]*60))+(8 if mode=='drive' else 3)
    best=None;examined=0
    for n in range(1,min(max_stops,len(pool))+1):
        for route in itertools.permutations(pool,n):
            examined+=1;cur=anchor;elapsed=0;km=0;steps=[]
            for s in route:
                dist,travel=segment(cur,[s['lat'],s['lng']]);arrive=start+elapsed+travel
                elapsed+=travel+s['visitMinutes'];km+=dist
                if elapsed>budget:break
                steps.append({'siteId':s['id'],'name':s['name'],'travelMinutes':travel,'estimatedKm':round(dist,2),
                              'arrive':fmt(arrive),'leave':fmt(start+elapsed),'visitMinutes':s['visitMinutes']})
                cur=[s['lat'],s['lng']]
            if len(steps)!=n:continue
            key=(n,len({s['cat'] for s in route}),-elapsed,-km)
            if best is None or key>best[0]:best=(key,steps,elapsed,km)
    if best is None:raise ValueError('当前时间预算无法容纳一次完整体验及交通，请增加时间或改用乘车。')
    _,steps,elapsed,km=best
    chosen_ids={s['siteId'] for s in steps}
    return {'city':city,'startTime':fmt(start),'endTime':fmt(start+elapsed),'minutes':elapsed,'budgetMinutes':budget,
            'remainingMinutes':budget-elapsed,'estimatedKm':round(km,1),'mode':mode,'stops':steps,'examined':examined,
            'candidateCount':len(pool),'excluded':[{'id':s['id'],'name':s['name'],'reason':'未进入当前时间预算下的推荐组合'} for s in pool if s['id'] not in chosen_ids],
            'params':{'city':city,'mode':mode,'category':category,'minutes':budget,'maxStops':max_stops,'startTime':fmt(start),'siteIds':chosen},
            'assumptions':['从城市参考点出发，不包含返程。','距离为球面直线距离 × 1.35 的路程估算。','交通速度：步行 4.5、骑行 12、乘车 25 千米/小时；另加换乘缓冲。','停留时长为策划建议；未接入实时路况、营业时间和预约余量。','最多 8 个候选、4 站；穷举可行顺序，优先站点数、类别多样性，再最小化估算耗时。'],
            'dataVersion':DATA_HASH[:12]}
