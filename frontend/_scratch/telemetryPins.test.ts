import { parsePins, togglePin, orderPanels, PANEL_IDS } from "../src/lib/telemetryPins";
const ok=(c:boolean,m:string)=>{console.log(c?"ok  ":"FAIL",m); if(!c) process.exitCode=1;};
ok(parsePins("not json").length===0,"bad json");
ok(JSON.stringify(parsePins('["cult","nope","cult","members"]'))==='["cult","members"]',"filters unknown + dupes");
ok(JSON.stringify(togglePin(["cult"],"members"))==='["cult","members"]',"add");
ok(JSON.stringify(togglePin(["cult","members"],"cult"))==='["members"]',"remove");
ok(JSON.stringify(orderPanels(PANEL_IDS,["cult","members"]))==='["cult","members","conversations","messages","contribute"]',"order");
