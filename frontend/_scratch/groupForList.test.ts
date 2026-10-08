import { groupForList } from "../src/lib/spaceHubs";
const ok=(c:boolean,m:string)=>{console.log(c?"ok  ":"FAIL",m); if(!c) process.exitCode=1;};
const c=(slug:string,kind:string,category:string|null=null)=>({slug,kind,category} as any);
const list=[c("q","question"),c("s1","study"),c("t-b","topic","Beta"),c("t-a","topic","Alpha"),c("t-n","topic"),c("b1","branch"),c("seed","branch"),c("t-a2","topic","Alpha")];
const g=groupForList(list,["Alpha","Beta"],new Set(["seed"]));
ok(g.map(x=>x.title).join("|")==="Alpha|Beta|Topics|Branches|Growing seeds|Studies|Questions","group order: "+g.map(x=>x.title).join("|"));
ok(g[0].items.map((x:any)=>x.slug).join()==="t-a,t-a2","input order kept inside group");
ok(groupForList([],[],new Set()).length===0,"empty -> no groups");
ok(groupForList([c("x","topic","Zed"),c("y","topic","Yak")],[],new Set()).map(x=>x.title).join()==="Zed,Yak","unordered categories keep first-seen order");
