import { parseBackup, messageKey } from "../src/lib/topicBackup.js";
const ok=(c:boolean,m:string)=>{console.log(c?"ok  ":"FAIL",m); if(!c) process.exitCode=1;};
let threw=false; try{parseBackup({format:"x"});}catch{threw=true;} ok(threw,"rejects foreign file");
const t=parseBackup({format:"exomusica-topics",version:1,topics:[
 {slug:"art-you-like",name:"Art",position:"3",messages:[{id:1,author:"a",at:"2026-01-01T00:00:00Z",text:"hi"},{id:2,author:"",at:"2026-01-01T00:00:00Z",text:"x"},{id:3,author:"b",at:"nope",text:"x"},{id:4,author:"b",at:"2026-01-02T00:00:00Z",text:"re",replyTo:1}]},
 {slug:"bad slug!",name:"x"},{name:"noslug"}]});
ok(t.length===1,"drops invalid topics"); ok(t[0].messages.length===2,"drops invalid messages"); ok(t[0].position===3,"position coerced"); ok(t[0].messages[1].replyTo===1,"reply kept");
ok(messageKey(1,"2026-01-01T00:00:00Z","a")===messageKey(1,new Date("2026-01-01T00:00:00.000Z"),"a"),"key stable across Date/ISO");
