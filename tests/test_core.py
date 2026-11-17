"""Repeatable regression tests. No external services or dependencies required."""
import sys,unittest,json,subprocess,tempfile,time,os,urllib.request,urllib.error,socket
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import engine

class EvidenceTests(unittest.TestCase):
    def test_integrity(self):
        self.assertEqual(len(engine.SITES),48);self.assertEqual(len(engine.SOURCES),45)
        for s in engine.SITES:
            self.assertTrue((ROOT/s['image']).is_file())
            if s['verified']:
                src=engine.SOURCES[s['sourceId']]
                self.assertEqual(engine.hashlib.sha256(src['excerpt'].encode()).hexdigest(),src['sha256'])
                self.assertTrue(src['url'].startswith('https://www.ihchina.cn/project_details/'))
    def test_alias(self):self.assertEqual(engine.search('南管是什么？')[0]['siteId'],'q02')
    def test_entity_isolation(self):self.assertEqual({h['siteId'] for h in engine.search('南音使用哪些乐器？')},{'q02'})
    def test_correct_origin(self):self.assertIn('台湾',engine.answer('歌仔戏起源在哪里？')['answer'])
    def test_unverified_refusal(self):self.assertEqual(engine.answer('平潭贝雕的国家级传承人是谁？')['hits'],[])
    def test_out_of_scope(self):
        for q in ['火星上有多少只企鹅？','今天上证指数多少？','如何安装显卡驱动？','明天北京天气？']:
            with self.subTest(q=q):self.assertEqual(engine.answer(q)['citations'],[])
    def test_dynamic_boundary(self):self.assertTrue(engine.answer('泉州南音今天几点演出？')['needsVerification'])
    def test_exploratory_category_intent(self):
        for query,allowed in [('泉州有哪些传统表演？',{'opera','music'}),('福州有哪些手工技艺？',{'craft'}),('厦门有哪些民俗？',{'folk'})]:
            with self.subTest(query=query):
                hits=engine.search(query)
                self.assertTrue(hits)
                self.assertTrue(all(h['category'] in allowed for h in hits))
        # A project may involve performance while officially belonging to another category.
        self.assertEqual(engine.search('妈祖信俗有哪些表演仪式？')[0]['siteId'],'p01')
    def test_bad_question(self):
        for q in ['',None,[],123,'a'*501]:
            with self.subTest(q=repr(q)[:30]),self.assertRaises(ValueError):engine.answer(q)
    def test_citation_alignment(self):
        a=engine.answer('泉州有哪些非遗？')
        for i,s in enumerate(a['citations'],1):self.assertIn(f'[{i}]',a['answer']);self.assertEqual(s['id'],a['hits'][i-1]['source']['id'])

class PlannerTests(unittest.TestCase):
    def test_budget_and_unique(self):
        for city in engine.ANCHORS:
            for mode in engine.SPEED:
                with self.subTest(city=city,mode=mode):
                    try:p=engine.plan({'city':city,'mode':mode,'minutes':600})
                    except ValueError:continue
                    self.assertLessEqual(p['minutes'],600)
                    self.assertEqual(p['minutes'],sum(s['travelMinutes']+s['visitMinutes'] for s in p['stops']))
                    self.assertEqual(len(p['stops']),len({s['siteId'] for s in p['stops']}))
                    self.assertTrue(all(engine.BY_ID[s['siteId']]['city']==city for s in p['stops']))
    def test_transport_changes(self):
        a=engine.plan({'mode':'drive'});b=engine.plan({'mode':'walk'})
        self.assertNotEqual(a['stops'],b['stops'])
    def test_candidate_subset(self):
        p=engine.plan({'siteIds':['q01','q02'],'minutes':240})
        self.assertEqual({s['siteId'] for s in p['stops']},{'q01','q02'})
    def test_determinism(self):self.assertEqual(engine.plan({}),engine.plan({}))
    def test_invalid_inputs(self):
        for p in [None,[],{'minutes':29},{'minutes':601},{'startTime':'24:00'},{'startTime':'23:30'}, {'mode':'fly'}, {'city':'平潭'}, {'category':'bad'},{'siteIds':['q01','q01']},{'siteIds':['f01']},{'siteIds':['t01']},{'maxStops':5}]:
            with self.subTest(p=p),self.assertRaises(ValueError):engine.plan(p)
    def test_infeasible(self):
        with self.assertRaises(ValueError):engine.plan({'minutes':30,'mode':'walk'})
    def test_custom_duration(self):self.assertEqual(engine.plan({'minutes':275,'maxStops':1})['params']['minutes'],275)

class APITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.db=Path(cls.tmp.name)/'test.sqlite3'
        cls.start()
    @classmethod
    def start(cls):
        with socket.socket() as s:s.bind(('127.0.0.1',0));cls.port=s.getsockname()[1]
        cls.url=f'http://127.0.0.1:{cls.port}'
        env=dict(os.environ,MINYUN_DB=str(cls.db));env.pop('AI_API_KEY',None)
        cls.proc=subprocess.Popen([sys.executable,str(ROOT/'server.py'),'--no-browser','--port',str(cls.port)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for i in range(100):
            try:cls.token=json.load(urllib.request.urlopen(cls.url+'/api/health'))['csrfToken'];break
            except Exception:time.sleep(.05)
        else:raise RuntimeError('Test server failed')
    @classmethod
    def tearDownClass(cls):cls.proc.terminate();cls.proc.wait();cls.tmp.cleanup()
    def request(self,path,method='GET',body=None,token=True):
        h={'Content-Type':'application/json'}
        if token:h['X-Minyun-Token']=self.token
        req=urllib.request.Request(self.url+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers=h)
        try:
            with urllib.request.urlopen(req) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:return e.code,json.load(e)
    def test_health(self):self.assertEqual(self.request('/api/health')[1]['dataHash'],engine.DATA_HASH)
    def test_auth(self):self.assertEqual(self.request('/api/plan','POST',{},False)[0],403)
    def test_private_files(self):
        for p in ['/.env','/.git/config','/var/minyun.sqlite3','/server.py','/archive/v1/index.html','/assets/%2e%2e/server.py']:
            with self.subTest(p=p):self.assertEqual(self.request(p)[0],404)
    def test_bad_query_type(self):self.assertEqual(self.request('/api/answer','POST',{'query':[]})[0],400)
    def test_crud_restart(self):
        code,p=self.request('/api/plans','POST',{'params':{'minutes':275,'maxStops':1},'title':'持久化测试'})
        self.assertEqual(code,201);ident=p['id']
        self.assertEqual(self.request('/api/plans/'+ident,'PATCH',{'title':'重命名'})[0],200)
        type(self).proc.terminate();type(self).proc.wait();type(self).start()
        found=[p for p in self.request('/api/plans')[1] if p['id']==ident]
        self.assertEqual(found[0]['title'],'重命名')
        self.assertEqual(self.request('/api/plans/'+ident,'DELETE',{})[0],200)
        self.assertEqual(self.request('/api/plans/'+ident,'DELETE',{})[0],404)
    def test_forged_plan_recomputed(self):
        code,p=self.request('/api/plans','POST',{'params':{'minutes':120},'title':'重算','plan':{'minutes':0}})
        self.assertEqual(code,201);self.assertGreater(p['plan']['minutes'],0)
    def test_script_title_is_data(self):
        title='<img src=x onerror=alert(1)>'
        code,p=self.request('/api/plans','POST',{'params':{},'title':title})
        self.assertEqual(code,201);self.assertEqual(p['title'],title)
    def test_bad_json(self):self.assertEqual(self.request('/api/plan','POST',[])[0],400)

if __name__=='__main__':unittest.main(verbosity=2)
