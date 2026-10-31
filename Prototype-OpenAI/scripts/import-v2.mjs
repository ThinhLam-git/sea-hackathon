import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const destination=path.resolve('fixtures/v2');
const source=process.argv[2]?path.resolve(process.argv[2]):null;
const seedPath=path.join(source??destination,'seed.json');
const testPath=path.join(source??destination,'test-cases.json');
const [seedBytes,testBytes]=await Promise.all([fs.readFile(seedPath),fs.readFile(testPath)]);
const seed=JSON.parse(seedBytes),test=JSON.parse(testBytes);
assert.equal(seed.metadata.pair_id,test.metadata.pair_id);assert.equal(seed.metadata.synthetic,true);assert.equal(test.metadata.synthetic,true);
assert.equal(seed.metadata.pair_id,'order-rescue-demo-30-v2.4-reconciled');assert.equal(seed.shared_contract.contract_version,'2.4');
assert.equal(seed.seed_data.order_rescue.length,30);assert.equal(test.test_cases.length,30);assert.equal(test.metadata.expected_outputs_approval,'FINAL');
const ids=new Set(seed.seed_data.order_rescue.map(r=>r.case_id));assert.equal(ids.size,30);
for(const c of test.test_cases)assert.ok(ids.has(c.case_id));
for(const row of seed.seed_data.order_rescue){for(const key of ['initial_assessment','initial_policy_output','after_reply_assessment','after_reply_policy_output','final_assessment_source','final_assessment'])assert.equal(row[key],null);}
for(const source of Object.values(seed.source_ref_index))assert.equal(source.available_phase,'T0');
const modes={BUYER_REPLY:0,USER_NO_REPLY:0,NOT_ASKED:0};
for(const c of test.test_cases){
 const mode=c.simulation.response_mode;assert.ok(mode in modes);modes[mode]++;
 assert.equal(c.ground_truth_status,'FINAL');
 const e=c.expected;
 assert.deepEqual(e.final_assessment,e.final_assessment_source===1?e.initial_assessment:e.after_reply_assessment);
 if(mode!=='BUYER_REPLY'){assert.equal(c.simulation.buyer_reply,null);assert.equal(e.after_reply_assessment,null);assert.equal(e.after_reply_policy_output,null);assert.equal(e.final_assessment_source,1);assert.equal(e.final_policy_output.final_action,'ESCALATE_REVIEW');}
 if(mode==='NOT_ASKED'){assert.equal(e.question.count,0);assert.equal(e.initial_assessment.question_key,null);assert.equal(e.question.reference_text,null);assert.equal(c.simulation.events_after_start.length,0);}
 else assert.equal(e.question.count,1);
}
assert.deepEqual(modes,{BUYER_REPLY:22,USER_NO_REPLY:5,NOT_ASKED:3});
const replay={prompt_version:'assess-v2.4.0',policy_version:seed.demo_policy_profile.policy_version,source:'hand_authored_final_fixture',cases:Object.fromEntries(test.test_cases.map(c=>[c.case_id,{INITIAL:c.expected.initial_assessment,AFTER_REPLY:c.expected.after_reply_assessment}]))};
const controls=test.test_cases.map(c=>({case_id:c.case_id,group:c.group,buyer_reply:c.simulation.buyer_reply,response_mode:c.simulation.response_mode,question_text:c.expected.question.reference_text}));
await fs.mkdir(destination,{recursive:true});
await Promise.all([fs.writeFile(path.join(destination,'seed.json'),seedBytes),fs.writeFile(path.join(destination,'test-cases.json'),testBytes),fs.writeFile(path.join(destination,'replay.json'),JSON.stringify(replay,null,2)+'\n'),fs.writeFile(path.join(destination,'controls.json'),JSON.stringify(controls,null,2)+'\n')]);
const provenance={pair_id:seed.metadata.pair_id,contract_version:seed.shared_contract.contract_version,synthetic:true,case_count:30,ground_truth_status:test.metadata.expected_outputs_approval,source_workbook:test.metadata.source_workbook,source_workbook_sha256:test.metadata.source_workbook_sha256,previous_source:'archive/v2.2/provenance.json',approval_scope:'Product-approved synthetic fixture labels; not live-model acceptance or operational validation.',sha256:{seed:createHash('sha256').update(seedBytes).digest('hex'),tests:createHash('sha256').update(testBytes).digest('hex')}};
await fs.writeFile(path.join(destination,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
console.log('Imported v2.4 reconciled: 30 FINAL synthetic fixtures; 22 replies, 5 no-replies, 3 NOT_ASKED. Labels are not model accuracy.');
