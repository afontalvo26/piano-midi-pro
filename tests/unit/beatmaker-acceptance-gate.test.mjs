import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {test} from "node:test";

function gate(flag){
  return spawnSync(process.execPath,["scripts/verify-beatmaker-acceptance.mjs",flag],
    {cwd:process.cwd(),encoding:"utf8",timeout:20_000});
}

test("113-criterion manifest is structural inventory, never product approval",()=>{
  const result=gate("--check");
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/113\/113 criterios/);
  assert.match(result.stdout,/0 aprobados/);
  assert.match(result.stdout,/NO equivale a certificación/);
});

test("release must remain red until independently evidenced in real environments",()=>{
  const result=gate("--release");
  assert.equal(result.error,undefined);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/sin aceptación/);
  assert.match(result.stderr,/SMK-37 Elite.*no certificadas/);
  assert.doesNotMatch(result.stdout,/PASS RELEASE/);
});
