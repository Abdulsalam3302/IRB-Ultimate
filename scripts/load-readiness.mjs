import {performance} from 'node:perf_hooks';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.TEST_BASE_URL||`http://127.0.0.1:${process.env.PORT||3000}`;
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('Load tests require an isolated loopback target.');
const phases=[];
async function phase(name,path,requests,concurrency){
 const latencies=[];const statuses={};let cursor=0;const start=performance.now();
 await Promise.all(Array.from({length:concurrency},async()=>{
  while(cursor++<requests){const t=performance.now();try{const response=await fetch(base+path,{signal:AbortSignal.timeout(5000)});await response.arrayBuffer();statuses[response.status]=(statuses[response.status]||0)+1;}catch{statuses.error=(statuses.error||0)+1;}latencies.push(performance.now()-t);}
 }));
 latencies.sort((a,b)=>a-b);const elapsed=performance.now()-start;
 const result={name,path,requests,concurrency,elapsedMs:Math.round(elapsed),requestsPerSecond:Math.round(requests/(elapsed/1000)),p50Ms:Math.round(latencies[Math.floor(latencies.length*.5)]),p95Ms:Math.round(latencies[Math.floor(latencies.length*.95)]),p99Ms:Math.round(latencies[Math.floor(latencies.length*.99)]),statuses};phases.push(result);
 if(statuses.error||Object.keys(statuses).some(code=>Number(code)>=500))process.exitCode=1;
 if(result.p95Ms>2000)process.exitCode=1;
}
await phase('public-page-concurrency','/',300,30);
await phase('database-readiness','/api/ready',150,15);
await phase('expensive-public-api-abuse-bound','/api/irb/meta/requirements',60,10);
if(!phases[2].statuses[429])process.exitCode=1;
await mkdir('/tmp/irb-e2e',{recursive:true});
await writeFile('/tmp/irb-e2e/load.json',JSON.stringify({testedAt:new Date().toISOString(),scope:'single local instance; synthetic read-only traffic; not a production capacity guarantee',phases},null,2));
console.log(JSON.stringify(phases,null,2));
