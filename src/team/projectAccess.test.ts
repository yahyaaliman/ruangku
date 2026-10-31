import { expect, it } from "vitest";
import { memberCanAccess } from "./projectAccess";
import type { Item } from "../lib/types";
import type { Project } from "../lib/tasks";
import type { Member } from "../lib/team";
const projects = [{id:"a",workspaceId:"ws-1"},{id:"child",parentId:"a"},{id:"b",workspaceId:"ws-2"},{id:"personal"}] as Item<Project>[];
const member = {name:"A",email:"a@example.test",role:"editor",workspaceId:"ws-1",projectAccess:"selected",projectIds:["a"]} as Member;
it("limits bot read/write/notifications to exact grants, without inheriting access to children",()=>{
  expect(memberCanAccess(member,"a",projects)).toBe(true);
  for(const id of ["child","b","personal",undefined]) expect(memberCanAccess(member,id,projects)).toBe(false);
});
it("all-project members and admins stay inside their workspace",()=>{
  expect(memberCanAccess({...member,projectAccess:"all"},"child",projects)).toBe(true);
  expect(memberCanAccess({...member,role:"admin"},"b",projects)).toBe(false);
});
