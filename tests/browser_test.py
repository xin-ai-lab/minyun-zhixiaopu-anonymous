"""UI acceptance checks using installed Chrome and playwright (development only)."""
import sys,json,asyncio,os,subprocess,socket,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
from playwright.async_api import async_playwright, expect
OUT=ROOT/'tests/artifacts'
async def run(url):
 OUT.mkdir(exist_ok=True,parents=True);checks=[];errors=[];external=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('CHROME_PATH',r'C:\Program Files\Google\Chrome\Application\chrome.exe'),headless=True)
  page=await browser.new_page(viewport={'width':1440,'height':1000})
  page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if not r.request.url.startswith(url) and not r.request.url.startswith(('blob:','data:')):external.append(r.request.url);await r.abort()
   else:await r.continue_()
  await page.route('**/*',route)
  async def check(name,condition):
   checks.append({'name':name,'pass':bool(condition)})
   if not condition:raise AssertionError(name)
  await page.goto(url);await page.wait_for_selector('.site-card')
  await check('offline catalog loads',await page.locator('.site-card').count()==48)
  await page.locator('#search').fill('不存在的项目');await check('empty search state',await page.locator('.empty-state').count()==1)
  await page.locator('#clearFilter').click();await page.locator('#search').fill('簪花');await check('search filter',await page.locator('.site-card').count()==1)
  await page.locator('[data-detail="q01"]').first.click();await check('detail source',await page.locator('#detailDialog .source-box').count()==1)
  await page.keyboard.press('Escape');await check('keyboard close dialog',not await page.locator('#detailDialog').is_visible())
  await page.locator('#clearFilter').click()
  await page.locator('[data-page="ask"]').click();await page.locator('#question').fill('歌仔戏起源在哪里？');await page.locator('#askSubmit').click();await page.wait_for_selector('.evidence-card')
  await check('origin correction and citation', '台湾' in await page.locator('#messages').inner_text() and await page.locator('.evidence-card').count()==1)
  await page.locator('#question').fill('平潭贝雕的国家级传承人是谁？');await page.locator('#askSubmit').click();await expect(page.locator('#askSubmit')).to_be_enabled()
  await check('unverified source refusal',await page.locator('.evidence-card').count()==0)
  await page.locator('[data-page="plan"]').click();await page.locator('#planSubmit').click();await page.wait_for_selector('#planOutput:visible')
  await check('plan valid',await page.locator('.timeline-step').count()==3)
  await page.locator('#duration').select_option('120');await check('changed constraints invalidate result',not await page.locator('#planOutput').is_visible())
  await page.locator('#planSubmit').click();await page.wait_for_selector('#planOutput:visible')
  await page.locator('#startTime').fill('23:30');await page.locator('#planSubmit').click();await expect(page.locator('#planError')).not_to_be_empty()
  await check('invalid overnight shows error',not await page.locator('#planOutput').is_visible())
  await page.locator('#startTime').fill('09:00');await page.locator('#duration').select_option('240');await page.locator('#planSubmit').click();await page.wait_for_selector('#planOutput:visible')
  async with page.expect_download() as d:await page.locator('#exportPlan').click()
  dl=await d.value;await dl.save_as(OUT/'行程单.html');await check('HTML export includes limits','未接入实时路况' in (OUT/'行程单.html').read_text(encoding='utf8'))
  async with page.expect_download() as d:await page.locator('#downloadJson').click()
  dl=await d.value;await dl.save_as(OUT/'backup.json')
  await page.locator('#savePlan').click();await expect(page.locator('#savePlan')).to_be_enabled()
  await page.reload();await page.wait_for_selector('#health');await page.locator('[data-page="saved"]').click();await page.wait_for_selector('.saved-card')
  await check('saved after reload',await page.locator('.saved-card').count()==1)
  await page.locator('[data-edit]').first.click();await page.locator('#editTitle').fill('<img src=x onerror=alert(1)>');await page.locator('#editForm button[type="submit"],#editForm button:not([type])').click();await page.wait_for_selector('#editDialog',state='hidden')
  await check('rename XSS escaped',await page.locator('.saved-card img').count()==0 and '<img' in await page.locator('.saved-card h2').inner_text())
  await page.locator('#importPlan').set_input_files(str(OUT/'backup.json'));await expect(page.locator('.saved-card')).to_have_count(2);await check('JSON round trip',True)
  await page.locator('[data-delete]').first.click();await page.locator('#cancelDelete').click();await check('delete cancel',await page.locator('.saved-card').count()==2)
  await page.locator('[data-delete]').first.click();await page.locator('#confirmDelete').click();await expect(page.locator('.saved-card')).to_have_count(1);await check('delete confirm',True)
  # Import valid API values not present in the preset selects, then restore and regenerate.
  custom=json.loads((OUT/'backup.json').read_text());custom['params'].update(minutes=275,maxStops=1)
  (OUT/'custom.json').write_text(json.dumps(custom),encoding='utf8');await page.locator('#importPlan').set_input_files(str(OUT/'custom.json'));await expect(page.locator('.saved-card')).to_have_count(2)
  await page.locator('[data-restore]').first.click();await check('custom duration restored',await page.locator('#duration').input_value()=='275')
  await page.locator('#planSubmit').click();await page.wait_for_selector('#planOutput:visible')
  for width,height in [(320,800),(390,844),(768,1024),(1440,1000),(1920,1080)]:
   await page.set_viewport_size({'width':width,'height':height})
   for tab in ['explore','ask','plan','saved']:
    await page.locator('[data-page="'+tab+'"]').click();await page.wait_for_timeout(200)
    overflow=await page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
    await check(f'layout {width} {tab}',not overflow)
    if tab in ['explore','plan','ask']:await page.screenshot(path=str(OUT/f'{tab}-{width}.png'))
  await page.set_viewport_size({'width':1440,'height':1000});await page.locator('[data-page="explore"]').click()
  await page.evaluate('document.querySelectorAll("img").forEach(i=>i.loading="eager")');await page.wait_for_timeout(500)
  await check('all images load',await page.evaluate('[...document.images].every(i=>i.complete&&i.naturalWidth>0)'))
  await check('no uncaught JS errors',not errors);await check('no external requests in core flow',not external)
  await browser.close()
 return {'checks':checks,'passed':sum(c['pass'] for c in checks),'total':len(checks),'javascriptErrors':errors,'externalRequests':external,'browser':'Installed Google Chrome, headless; network restricted to localhost','viewports':[320,390,768,1440,1920]}
def main():
 with tempfile.TemporaryDirectory(prefix='minyun UI 中文 ') as tmp:
  with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
  env=dict(os.environ,MINYUN_DB=str(Path(tmp)/'test.sqlite3'))
  proc=subprocess.Popen([sys.executable,str(ROOT/'server.py'),'--no-browser','--port',str(port)],env=env,stdout=subprocess.DEVNULL)
  try:
   import urllib.request
   for i in range(100):
    try:urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health').close();break
    except Exception:time.sleep(.05)
   result=asyncio.run(run(f'http://127.0.0.1:{port}'))
   (ROOT/'evidence/browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(result,ensure_ascii=False,indent=2))
  finally:proc.terminate();proc.wait()
if __name__=='__main__':main()
