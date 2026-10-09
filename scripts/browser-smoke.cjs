const { chromium } = require('../.local/browser-check/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const deployment=JSON.parse(fs.readFileSync('docs/deployment.json','utf8'));
  if(process.env.FRONTEND_CHECK_URL) deployment.frontend_url=process.env.FRONTEND_CHECK_URL;
  const {author_api_key:key}=JSON.parse(fs.readFileSync('.local/cloud-secrets.json','utf8'));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];
  const traceIds=[];
  page.on('response', async response => {
    const url = new URL(response.url());
    if(response.url().startsWith(deployment.backend_url) || (url.origin === new URL(deployment.frontend_url).origin && url.pathname.startsWith('/api/backend/'))){
      const id=await response.headerValue('x-trace-id');
      if(id) traceIds.push({path:new URL(response.url()).pathname,trace_id:id,status:response.status()});
    }
  });
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(deployment.frontend_url);
  await page.getByTestId('home-demo-case-primary').click();
  await page.getByTestId('case-title').waitFor();
  assert.equal(await page.getByTestId('case-title').textContent(),'Fever and dry cough');
  assert.equal(await page.getByTestId('case-demo-badge').textContent(),'Demo');
  await page.goto(deployment.frontend_url+'/clinical-cases/new');
  await page.getByTestId('author-source-text').fill('A synthetic 28-year-old presents with sudden fever, dry cough and fatigue for two days. Final diagnosis: influenza.');
  await page.getByTestId('author-key').fill(key);
  await page.getByTestId('author-extract-submit').click();
  await page.getByTestId('author-draft-title').waitFor({timeout:65000});
  assert.equal(await page.getByTestId('author-reference-diagnosis').inputValue(),'');
  const extracted=await page.getByTestId('author-draft-vignette').inputValue();
  assert(!/influenza/i.test(extracted));
  const title='Sudden fever, dry cough and fatigue';
  await page.getByTestId('author-draft-title').fill(title);
  await page.getByTestId('author-reference-diagnosis').fill('Influenza');
  await page.getByTestId('author-accepted-alternatives').fill('Flu');
  await page.getByTestId('author-review-confirmation').check();
  await page.getByRole('checkbox',{name:'I understand and want to submit as a guest.'}).check();
  await page.getByTestId('author-save-submit').click();
  await page.waitForURL(/clinical-cases\/[0-9a-f-]{36}$/);
  const caseUrl=page.url();
  await page.getByRole('heading',{name:title}).waitFor();
  for(const [diagnosis,feedback] of [['  FLU  ','Your diagnosis matches an accepted answer.'],['Unrelated diagnosis','Your diagnosis does not match an accepted answer.']]){
    await page.getByTestId('attempt-diagnosis').fill(diagnosis);
    await page.getByRole('checkbox',{name:'I understand and want to submit as a guest.'}).check();
    await page.getByTestId('attempt-submit').click();
    await page.getByText(feedback,{exact:true}).waitFor();
  }
  await page.reload();
  await page.getByRole('heading',{name:title}).waitFor();
  const id=caseUrl.split('/').at(-1);
  assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(await page.getByTestId('case-demo-badge').count(),0);
  const response=await page.request.get(deployment.backend_url+'/api/v1/clinical-cases/'+id);
  assert.equal(response.status(),200);
  const getTrace=response.headers()['x-trace-id'];
  assert.match(getTrace,/^[0-9a-f]{32}$/);
  traceIds.push({path:'/api/v1/clinical-cases/{id}',trace_id:getTrace,status:200});
  const publicCase=await response.json();
  assert(!('reference_diagnosis' in publicCase));
  assert(!('accepted_answers' in publicCase));
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'.local/cloud-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  const report={status:'passed',stable_selectors:true,trace_ids:traceIds,case_url:caseUrl,real_gemini:true,review_save_correct_incorrect_reload:true,hidden_answers:true,mobile_overflow:false,page_errors:errors};
  fs.writeFileSync('docs/cloud-browser-check.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch(e=>{console.error(e.message);process.exit(1)});
