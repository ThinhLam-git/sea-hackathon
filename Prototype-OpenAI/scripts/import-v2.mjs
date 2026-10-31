import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const destination=path.resolve('fixtures/v2');
const source=process.argv[2]?path.resolve(process.argv[2]):null;
const seedPath=source?path.join(source,'Database model/Order_Rescue_Data_Model_30_Cases_v2.2.json'):path.join(destination,'seed.json');
const testPath=source?path.join(source,'Test case/Order_Rescue_Test_Cases_30_v2.2.json'):path.join(destination,'test-cases.json');
const [seedBytes,testBytes]=await Promise.all([fs.readFile(seedPath),fs.readFile(testPath)]);
const seed=JSON.parse(seedBytes),test=JSON.parse(testBytes);
assert.equal(seed.metadata.pair_id,test.metadata.pair_id);assert.equal(seed.metadata.synthetic,true);assert.equal(test.metadata.synthetic,true);
assert.equal(seed.seed_data.order_rescue.length,30);assert.equal(test.test_cases.length,30);assert.equal(test.metadata.expected_outputs_approval,'DRAFT_NEEDS_USER_REVIEW');
const ids=new Set(seed.seed_data.order_rescue.map(r=>r.case_id));assert.equal(ids.size,30);
for(const c of test.test_cases)assert.ok(ids.has(c.case_id));
for(const row of seed.seed_data.order_rescue){for(const key of ['initial_assessment','initial_policy_output','after_reply_assessment','after_reply_policy_output','final_assessment_source','final_assessment'])assert.equal(row[key],null);}
for(const source of Object.values(seed.source_ref_index))assert.equal(source.available_phase,'T0');
const replay={prompt_version:'assess-v2.2.1',policy_version:seed.demo_policy_profile.policy_version,source:'hand_authored_draft_fixture',cases:Object.fromEntries(test.test_cases.map(c=>[c.case_id,{INITIAL:c.expected.initial_assessment,AFTER_REPLY:c.expected.after_reply_assessment}]))};
const controls=test.test_cases.map(c=>({case_id:c.case_id,group:c.group,buyer_reply:c.simulation.buyer_reply,response_mode:c.simulation.response_mode}));
// Draft semantic controls are used only for the exact synthetic Replay response. Live replies are always interpreted by the agent.
const replayFacts={
 'DEMO-001':{intent:['YES','Tôi vẫn muốn nhận'],availability:['YES','ngày mai có người ở nhà']},
 'DEMO-002':{intent:['YES','tôi vẫn muốn nhận'],availability:['YES','mai ở nhà']},
 'DEMO-003':{intent:['YES','tôi vẫn muốn nhận'],availability:['YES','ngày mai tôi ở nhà']},
 'DEMO-006':{intent:['YES','Tôi vẫn muốn nhận'],availability:['YES','mai có người ở nhà']},
 'DEMO-007':{intent:['YES','Tôi vẫn muốn nhận'],availability:['YES','ngày làm việc tới tôi xuống cổng nhận được']},
 'DEMO-008':{intent:['YES','Tôi vẫn muốn nhận'],availability:['YES','ngày mai có người ở nhà']},
 'DEMO-011':{intent:['YES','Vẫn muốn nhận'],availability:['YES','ngày mai tôi ở nhà']},
 'DEMO-012':{intent:['YES','tôi vẫn muốn nhận'],availability:['YES','mai ở nhà']},
 'DEMO-016':{intent:['YES','Tôi muốn nhận'],availability:['YES','Mai đủ tiền và tôi ở nhà nhận'],cod_readiness:['YES','Mai đủ tiền']},
 'DEMO-017':{intent:['YES','Tôi đồng ý nhận'],availability:['YES','ngày mai ở nhà']},
 'DEMO-019':{intent:['YES','Tôi vẫn muốn nhận'],availability:['YES','có ở nhà'],cod_readiness:['YES','mai đủ COD hiện tại']},
 'DEMO-020':{intent:['YES','tôi muốn nhận'],availability:['YES','mai ở nhà'],cod_readiness:['YES','Tiền COD tôi đã chuẩn bị']},
 'DEMO-021':{intent:['YES','Tôi vẫn muốn nhận'],availability:['YES','mai ở nhà'],cod_readiness:['YES','đã đủ COD trên đơn']},
 'DEMO-024':{intent:['YES','Tôi vẫn muốn nhận'],availability:['YES','mai ở nhà']},
 'DEMO-027':{intent:['YES','vẫn muốn nhận'],availability:['YES','Mai đủ tiền và tôi ở nhà'],cod_readiness:['YES','Mai đủ tiền']},
 'DEMO-028':{intent:['YES','tôi vẫn muốn nhận'],availability:['YES','mai ở nhà']},
 'DEMO-029':{intent:['YES','tôi vẫn muốn nhận'],availability:['YES','mai ở nhà']},
};
const semanticKeys=['intent','availability','cod_readiness','address_change','after_deadline'];
const replaySemantics=Object.fromEntries(Object.entries(replayFacts).map(([case_id,facts])=>[case_id,Object.fromEntries(semanticKeys.map(key=>[key,facts[key]?{state:facts[key][0],citations:[{source_ref:`${case_id}-REPLY`,quote:facts[key][1]}]}:{state:'UNKNOWN',citations:[]}]))]));
await fs.mkdir(destination,{recursive:true});
await Promise.all([fs.writeFile(path.join(destination,'seed.json'),seedBytes),fs.writeFile(path.join(destination,'test-cases.json'),testBytes),fs.writeFile(path.join(destination,'replay.json'),JSON.stringify(replay,null,2)+'\n'),fs.writeFile(path.join(destination,'controls.json'),JSON.stringify(controls,null,2)+'\n'),fs.writeFile(path.join(destination,'replay-semantics.json'),JSON.stringify(replaySemantics,null,2)+'\n')]);
const provenance={pair_id:seed.metadata.pair_id,contract_version:seed.shared_contract.contract_version,synthetic:true,case_count:30,ground_truth_status:test.metadata.expected_outputs_approval,source_folder:'https://drive.google.com/drive/folders/1QY7Qto0DnRzALgPabY-lTsgzu2DQGGyB',sha256:{seed:createHash('sha256').update(seedBytes).digest('hex'),tests:createHash('sha256').update(testBytes).digest('hex')}};
await fs.writeFile(path.join(destination,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
console.log('Imported v2.2: 30 raw seed cases, isolated replay assessments and demo controls. Draft labels retained.');
