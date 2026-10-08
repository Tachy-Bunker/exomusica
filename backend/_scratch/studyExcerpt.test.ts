import { studyExcerpt } from "../src/lib/studyExcerpt.js";
const ok=(c:boolean,m:string)=>{console.log(c?"ok  ":"FAIL",m); if(!c) process.exitCode=1;};
ok(studyExcerpt("# Title\n\nSome **bold** text with a [link](http://x.y) and ![img](a.png).")==="Title Some bold text with a link and .","markdown stripped: "+studyExcerpt("# Title\n\nSome **bold** text with a [link](http://x.y) and ![img](a.png)."));
ok(studyExcerpt("a ".repeat(200)).endsWith("…")&&studyExcerpt("a ".repeat(200)).length<=152,"long cut");
ok(studyExcerpt("")==="","empty");
ok(!studyExcerpt("| a | b |\n|---|---|\ntext {clip:1-2 x} end").includes("clip"),"clips/tables dropped");
