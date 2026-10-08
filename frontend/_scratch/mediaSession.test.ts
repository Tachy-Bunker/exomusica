(globalThis as any).window = { location: { origin: "https://exo.test" } };
const { metadataFor } = await import("../src/lib/mediaSession");
const ok=(c:boolean,m:string)=>{console.log(c?"ok  ":"FAIL",m); if(!c) process.exitCode=1;};
const m = metadataFor({ title:"T", composer:"C", albumTitle:"A", coverArtUrl:"/uploads/c.png" } as any);
ok(m.title==="T"&&m.artist==="C"&&m.album==="A","fields");
ok(m.artwork.length===3&&m.artwork[0].src==="https://exo.test/uploads/c.png"&&m.artwork[0].type==="image/png","artwork absolute + typed");
ok(metadataFor({ title:"x", composer:"", albumTitle:"", coverArtUrl:null, origin:{label:"Topic: Art"} } as any).album==="Topic: Art","origin as album for attachments");
ok(metadataFor({ title:"x", composer:"", albumTitle:"", coverArtUrl:null } as any).artwork.length===0,"no art -> none");
