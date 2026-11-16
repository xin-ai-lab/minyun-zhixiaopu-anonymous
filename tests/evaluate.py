"""Small, declared development regression set; not a user study or held-out benchmark."""
import sys,json,time,statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine import answer,DATA_HASH
CASES=[
 ('簪花围是什么','q01'),('南管是什么','q02'),('泉州提线木偶怎么表演','q03'),('高甲戏使用什么乐器','q04'),('惠安女服饰有什么特点','q05'),
 ('德化白瓷怎么制作','q06'),('安溪铁观音的起源','q07'),('厦门送王船是什么习俗','q09'),('水密隔舱福船的特点','q10'),('闽剧用什么方言演唱','f01'),
 ('寿山石雕是什么','f02'),('脱胎漆器的历史','f03'),('福州评话的形式','f05'),('福州茉莉花茶如何窨制','f06'),('佛跳墙来自哪里','f07'),
 ('厦门漆线雕的历史','x01'),('厦门中秋博饼是什么','x02'),('厦门珠绣有什么材料','x03'),('歌仔戏起源在哪里','z01'),('芗剧是什么','z01'),
 ('妈祖信俗的起源','p01'),('莆仙戏的历史','p02'),('武夷岩茶有什么特点','n01'),('建盏如何烧制','n02'),('霍童线狮怎么表演','d03'),
 ('火星上有多少只企鹅',None),('今天上证指数多少',None),('如何安装显卡驱动',None),('平潭贝雕的国家级传承人是谁',None),('藤牌操的传承人名单',None)]
def evaluate():
 rows=[]
 for q,expected in CASES:
  t=time.perf_counter();a=answer(q);ms=(time.perf_counter()-t)*1000;ids=[h['siteId'] for h in a['hits']]
  rows.append({'query':q,'expectedTop1':expected,'actual':ids,'pass':(ids[0]==expected if ids else expected is None),'milliseconds':round(ms,3)})
 pos=[r for r in rows if r['expectedTop1']];neg=[r for r in rows if not r['expectedTop1']]
 return {'definition':'公开的开发定向回归集，不代表真实用户准确率；部分用例参与修复。','dataHash':DATA_HASH,'total':len(rows),'passed':sum(r['pass'] for r in rows),'entityTop1':{'passed':sum(r['pass'] for r in pos),'total':len(pos)},'refusal':{'passed':sum(r['pass'] for r in neg),'total':len(neg)},'medianMilliseconds':round(statistics.median(r['milliseconds'] for r in rows),3),'cases':rows}
if __name__=='__main__':
 result=evaluate();out=ROOT/'evidence/evaluation.json';out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False,indent=2));sys.exit(0 if result['passed']==result['total'] else 1)
