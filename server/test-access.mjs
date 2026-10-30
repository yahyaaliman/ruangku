// Against a disposable local PocketBase database only. Never production.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const base = process.env.PB_TEST_URL || 'http://127.0.0.1:18090';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('Test only runs against loopback.');
const credentials = JSON.parse(await readFile(process.env.PB_TEST_AUTH || '../pb-test-auth.json', 'utf8'));
async function request(method, path, body, token) {
  const res = await fetch(base + path, { method, headers: { 'content-type':'application/json', ...(token ? {authorization:token} : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
}
const login = async (collection, email, password) => {
  const r = await request('POST', `/api/collections/${collection}/auth-with-password`, {identity:email,password});
  assert.equal(r.status,200,JSON.stringify(r.data)); return r.data.token;
};
const admin = await login('_superusers',credentials.email,credentials.password);
async function create(col,body,token=admin) { const r=await request('POST',`/api/collections/${col}/records`,body,token); assert.equal(r.status,200,JSON.stringify(r.data)); return r.data; }
const stamp=randomUUID().slice(0,8), password=randomUUID()+'Aa1!';
const owner=await create('users',{email:`owner-${stamp}@example.test`,password,passwordConfirm:password,verified:true});
const alice=await create('users',{email:`alice-${stamp}@example.test`,password,passwordConfirm:password,verified:true});
const bob=await create('users',{email:`bob-${stamp}@example.test`,password,passwordConfirm:password,verified:true});
const ownerToken=await login('users',owner.email,password), aliceToken=await login('users',alice.email,password);
const ws=await create('workspaces',{name:'Access test '+stamp,owner:owner.id},ownerToken);
const project = async (rid) => create('records',{workspace:ws.id,rid,kind:'project',project:rid,data:{name:rid,workspaceId:`ws-${ws.id}`},ts:1,author:owner.id},ownerToken);
const a=await project('A-'+stamp),b=await project('B-'+stamp);
const am=await create('members',{workspace:ws.id,email:alice.email,role:'editor',projectAccess:'selected',projects:[a.id]},ownerToken);
await create('members',{workspace:ws.id,email:bob.email,role:'editor',projectAccess:'all'},ownerToken);
const task = async (rid,project) => create('records',{workspace:ws.id,rid,kind:'task',project,data:{title:rid,projectId:project},ts:2,author:owner.id},ownerToken);
const ta=await task('ta-'+stamp,a.rid),tb=await task('tb-'+stamp,b.rid);
assert.equal((await request('PATCH',`/api/collections/records/records/${ta.id}`,{data:{title:'Allowed edit',projectId:a.rid},ts:3},aliceToken)).status,200,'Allowed writes must work');
const visible=await request('GET',`/api/collections/records/records?filter=${encodeURIComponent(`workspace='${ws.id}'`)}`,undefined,aliceToken);
assert.equal(visible.status,200); assert.deepEqual(visible.data.items.map(r=>r.rid).sort(),[a.rid,ta.rid].sort(),'Other members must not widen Alice grants');
assert.equal((await request('GET',`/api/collections/records/records/${tb.id}`,undefined,aliceToken)).status,404);
assert.equal((await request('PATCH',`/api/collections/records/records/${tb.id}`,{data:{title:'hacked',projectId:b.rid}},aliceToken)).status,404);
assert.equal((await request('DELETE',`/api/collections/records/records/${tb.id}`,undefined,aliceToken)).status,404);
const forged=await request('POST','/api/collections/records/records',{workspace:ws.id,rid:'forged-'+stamp,kind:'task',project:a.rid,data:{title:'forged',projectId:b.rid},author:alice.id},aliceToken);
assert.ok(forged.status>=400,'Forged project must be rejected');
const foreignParent=await request('POST','/api/collections/records/records',{workspace:ws.id,rid:'child-'+stamp,kind:'task',project:a.rid,data:{title:'child',projectId:a.rid,parentId:tb.rid},author:alice.id},aliceToken);
assert.ok(foreignParent.status>=400,'Parent cannot point outside grant');
const grantSelf=await request('PATCH',`/api/collections/members/records/${am.id}`,{projectAccess:'all'},aliceToken);assert.ok(grantSelf.status>=400);
// Owning another workspace cannot widen grants here.
const own=await create('workspaces',{name:'Alice own',owner:alice.id},aliceToken);
const ownProject=await create('records',{workspace:own.id,rid:'own-'+stamp,kind:'project',project:'own-'+stamp,data:{name:'Own',workspaceId:`ws-${own.id}`},ts:1,author:alice.id},aliceToken);
assert.ok((await request('PATCH',`/api/collections/members/records/${am.id}`,{projects:[ownProject.id]},ownerToken)).status>=400,'Cross-workspace grants are rejected');
const unverified=await create('users',{email:`unverified-${stamp}@example.test`,password,passwordConfirm:password,verified:false});
await create('members',{workspace:ws.id,email:unverified.email,role:'editor',projectAccess:'all'},ownerToken);
const unverifiedToken=await login('users',unverified.email,password);
assert.equal((await request('GET',`/api/collections/records/records/${ta.id}`,undefined,unverifiedToken)).status,404,'An unverified email cannot claim an invitation');
// Deleting a whole tree must accept child tombstones after the parent is deleted.
assert.equal((await request('PATCH',`/api/collections/records/records/${b.id}`,{deleted:true,data:null,project:b.rid,ts:4},ownerToken)).status,200);
assert.equal((await request('PATCH',`/api/collections/records/records/${tb.id}`,{deleted:true,data:null,project:b.rid,ts:5},ownerToken)).status,200);
const revoke=await request('PATCH',`/api/collections/members/records/${am.id}`,{projects:[]},ownerToken);assert.equal(revoke.status,200,JSON.stringify(revoke.data));
assert.equal((await request('GET',`/api/collections/records/records/${ta.id}`,undefined,aliceToken)).status,404,'Revocation must take effect immediately');
assert.equal((await request('GET',`/api/collections/records/records?filter=${encodeURIComponent(`workspace='${ws.id}'`)}`,undefined,aliceToken)).data.items.length,0);
console.log('Project access integration: listing, direct read/write/delete, forged scope, parent reference, self-grant and revocation passed.');
