import { afterEach, expect, it, vi } from "vitest";
import { api, type HttpReq } from "../lib/api";
import { ProviderClient } from "./provider";
const response = (value: unknown, status = 200) => ({ status, body: JSON.stringify(value) });
afterEach(() => vi.restoreAllMocks());
function secrets() { vi.spyOn(api, "secretGet").mockResolvedValue("refresh"); return vi.spyOn(api, "secretSet").mockResolvedValue("credman"); }
it("refreshes a rejected access token, rotates refresh tokens and follows task pagination", async () => {
  const store = secrets(); let tokens = 0, pages = 0;
  const http = vi.fn(async (r: HttpReq) => {
    if (r.url.includes("oauth2.googleapis")) return response({ access_token: `token${++tokens}`, refresh_token: `refresh${tokens}` });
    if (++pages === 1) return response({}, 401);
    if (pages === 2) return response({ items: [{id:"a", title:"A"}], nextPageToken:"next" });
    expect(r.url).toContain("pageToken=next"); expect(r.headers?.authorization).toBe("Bearer token2");
    return response({items:[{id:"b",title:"B"}]});
  });
  const c = new ProviderClient({provider:"google-tasks",clientId:"client",connected:true},http);
  expect(await c.containers()).toEqual([{id:"a",name:"A"},{id:"b",name:"B"}]);
  expect(tokens).toBe(2); expect(store).toHaveBeenLastCalledWith("external_google-tasks_refresh","refresh2");
});
it("does not forward tokens to an untrusted Graph next link", async () => {
  secrets();
  const http = vi.fn(async (r: HttpReq) => r.url.includes("/token") ? response({access_token:"token"}) : response({value:[],"@odata.nextLink":"https://untrusted.invalid/steal"}));
  const c = new ProviderClient({provider:"outlook",clientId:"client",connected:true},http);
  await expect(c.containers()).rejects.toThrow("pagination"); expect(http).toHaveBeenCalledTimes(2);
});
it("sends If-Match on edits and does not retry a conflicting write", async () => {
  secrets();
  const http = vi.fn(async (r: HttpReq) => { if(r.url.includes("/token")) return response({access_token:"token"}); expect(r.headers?.["If-Match"]).toBe('"v1"'); return response({},412); });
  const c = new ProviderClient({provider:"outlook",clientId:"client",connected:true,container:"cal"},http);
  await expect(c.save("event","local",{title:"Edited",date:"2026-10-30",start:600,end:660},'"v1"')).rejects.toMatchObject({status:412});
  expect(http).toHaveBeenCalledTimes(2);
});
it("rejects callback state mismatch before token exchange", async () => {
  secrets(); vi.spyOn(api,"oauthLoopback").mockResolvedValue({code:"code",state:"wrong",redirectUri:"http://localhost:1234"});
  const http = vi.fn();
  await expect(new ProviderClient({provider:"outlook",clientId:"client",connected:false},http).login("")).rejects.toThrow("respons tidak valid");
  expect(http).not.toHaveBeenCalled();
});
it("keeps an existing account binding and never stores another account's credentials", async () => {
  const store = secrets();
  vi.spyOn(api,"oauthLoopback").mockImplementation(async url => ({code:"code",state:new URL(url).searchParams.get("state"),redirectUri:"http://localhost:1234"}));
  const http = vi.fn(async (r: HttpReq) => r.url.endsWith("/me") ? response({id:"other",mail:"other@example.test"}) : response({access_token:"token",refresh_token:"refresh"}));
  await expect(new ProviderClient({provider:"outlook",clientId:"client",connected:false,subject:"original",email:"original@example.test"},http).login("")).rejects.toThrow("terikat");
  expect(store).not.toHaveBeenCalled();
});
