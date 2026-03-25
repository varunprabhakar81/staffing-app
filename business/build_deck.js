const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.title = "Staffing Intelligence — Executive Summary";

const C = {
  navy:     "1E2761",
  ice:      "CADCFC",
  white:    "FFFFFF",
  offwhite: "F4F6FB",
  teal:     "0D9488",
  amber:    "F59E0B",
  slate:    "64748B",
  light:    "E8EDF6",
  green:    "059669",
  muted:    "94A3B8",
};

// ─── SLIDE 1: TITLE ────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.navy };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:0.35, h:5.625, fill:{ color:C.teal }, line:{ color:C.teal } });
  s.addShape(pres.shapes.RECTANGLE, { x:7.2, y:0, w:2.8, h:5.625, fill:{ color:"FFFFFF", transparency:94 }, line:{ color:C.navy } });
  s.addShape(pres.shapes.RECTANGLE, { x:8.5, y:0, w:1.5, h:5.625, fill:{ color:"FFFFFF", transparency:90 }, line:{ color:C.navy } });
  s.addText("DELOITTE · NETSUITE PRACTICE", { x:0.65, y:1.3, w:7, h:0.35, fontSize:9, color:C.ice, bold:true, charSpacing:4, fontFace:"Calibri", margin:0 });
  s.addText("Staffing Intelligence", { x:0.65, y:1.8, w:7.5, h:1.2, fontSize:44, color:C.white, bold:true, fontFace:"Calibri", margin:0 });
  s.addShape(pres.shapes.RECTANGLE, { x:0.65, y:2.95, w:3.5, h:0.04, fill:{ color:C.teal }, line:{ color:C.teal } });
  s.addText("Real-time staffing management for a modern consulting practice", { x:0.65, y:3.05, w:6.8, h:0.5, fontSize:15, color:C.ice, fontFace:"Calibri", margin:0 });
  s.addText("March 2026  ·  Live in production  ·  25 consultants", { x:0.65, y:4.8, w:7, h:0.35, fontSize:10, color:C.muted, fontFace:"Calibri", margin:0 });
}

// ─── SLIDE 2: WHAT WE BUILT ────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.offwhite };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:0.7, fill:{ color:C.navy }, line:{ color:C.navy } });
  s.addText("WHAT WE BUILT", { x:0.5, y:0, w:9, h:0.7, fontSize:10, color:C.ice, bold:true, charSpacing:3, valign:"middle", fontFace:"Calibri", margin:0 });
  s.addText("A platform that replaces spreadsheets", { x:0.5, y:0.9, w:9, h:0.65, fontSize:26, color:C.navy, bold:true, fontFace:"Calibri", margin:0 });
  s.addText("Built from scratch in 18 sessions — live on Railway, backed by Supabase, powered by Claude AI.", { x:0.5, y:1.55, w:9, h:0.4, fontSize:12, color:C.slate, fontFace:"Calibri", margin:0 });

  const caps = [
    { title:"Availability heatmap",          desc:"Weekly hours by consultant across all projects. Inline editing, no spreadsheets." },
    { title:"Role-based access",             desc:"4 roles — admin, resource manager, project manager, executive." },
    { title:"Ask Claude (AI)",               desc:"Natural language queries against live staffing data." },
    { title:"Staffing needs pipeline",       desc:"Open roles matched to available consultants with AI recommendations." },
    { title:"Utilization dashboard",         desc:"KPIs, overallocation alerts, rolling-off warnings, top projects." },
    { title:"User management",               desc:"Invite, activate, deactivate and manage roles from an admin panel." },
    { title:"Consultant profile editor",     desc:"View and edit skill sets, level, location, and rate overrides per consultant. Role-gated." },
    { title:"Consultants management panel",  desc:"Manage all 25 consultants from Settings — edit, deactivate, and reactivate." },
  ];
  const colW=2.1, rowH=1.35, startX=0.4, startY=2.1, gap=0.17;
  caps.forEach((cap, i) => {
    const col=i%4, row=Math.floor(i/4);
    const x=startX+col*(colW+gap), y=startY+row*(rowH+gap);
    s.addShape(pres.shapes.RECTANGLE, { x, y, w:colW, h:rowH, fill:{ color:C.white }, line:{ color:"E2E8F0", pt:0.75 } });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w:0.06, h:rowH, fill:{ color:C.teal }, line:{ color:C.teal } });
    s.addText(cap.title, { x:x+0.16, y:y+0.18, w:colW-0.25, h:0.3, fontSize:11, bold:true, color:C.navy, fontFace:"Calibri", margin:0 });
    s.addText(cap.desc,  { x:x+0.16, y:y+0.5,  w:colW-0.25, h:0.7, fontSize:10, color:C.slate, fontFace:"Calibri", wrap:true, margin:0 });
  });
  s.addText("staffing-app-production.up.railway.app", { x:0.5, y:5.3, w:9, h:0.25, fontSize:9, color:C.muted, fontFace:"Calibri", margin:0 });
}

// ─── SLIDE 3: PROGRESS ─────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.navy };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:0.7, fill:{ color:C.teal }, line:{ color:C.teal } });
  s.addText("WHERE WE ARE", { x:0.5, y:0, w:9, h:0.7, fontSize:10, color:C.white, bold:true, charSpacing:3, valign:"middle", fontFace:"Calibri", margin:0 });
  s.addText("80%", { x:0.5, y:1.0, w:3, h:1.4, fontSize:72, bold:true, color:C.teal, fontFace:"Calibri", margin:0 });
  s.addText("of v1 complete", { x:0.5, y:2.35, w:3, h:0.4, fontSize:14, color:C.ice, fontFace:"Calibri", margin:0 });
  s.addShape(pres.shapes.RECTANGLE, { x:0.5, y:2.85, w:9,      h:0.22, fill:{ color:"FFFFFF", transparency:80 }, line:{ color:C.navy } });
  s.addShape(pres.shapes.RECTANGLE, { x:0.5, y:2.85, w:9*0.80, h:0.22, fill:{ color:C.teal }, line:{ color:C.teal } });
  s.addText("35 issues shipped across auth, RBAC, heatmap editing, user management, consultant management, AI integration, and production deploy.", { x:3.7, y:1.2, w:5.8, h:0.9, fontSize:12, color:C.ice, fontFace:"Calibri", wrap:true, margin:0 });
  const kpis=[{val:"18",label:"Sessions shipped"},{val:"35",label:"Issues closed"},{val:"~13h",label:"To v1 stable"},{val:"~60h",label:"Phase 2 scope"}];
  kpis.forEach((k,i)=>{
    const x=0.5+i*2.35;
    s.addShape(pres.shapes.RECTANGLE, { x, y:3.3, w:2.15, h:1.4, fill:{ color:"FFFFFF", transparency:90 }, line:{ color:C.navy } });
    s.addText(k.val,   { x:x+0.1, y:3.4,  w:1.95, h:0.7,  fontSize:30, bold:true, color:C.white, fontFace:"Calibri", margin:0 });
    s.addText(k.label, { x:x+0.1, y:4.1,  w:1.95, h:0.45, fontSize:10, color:C.ice, fontFace:"Calibri", margin:0 });
  });
}

// ─── SLIDE 4: BUILD PHASES ─────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.offwhite };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:0.7, fill:{ color:C.navy }, line:{ color:C.navy } });
  s.addText("BUILD PHASES", { x:0.5, y:0, w:9, h:0.7, fontSize:10, color:C.ice, bold:true, charSpacing:3, valign:"middle", fontFace:"Calibri", margin:0 });
  s.addText("Four phases from zero to multi-tenant scale", { x:0.5, y:0.85, w:9, h:0.5, fontSize:20, color:C.navy, bold:true, fontFace:"Calibri", margin:0 });

  const phases=[
    { name:"Foundation",    status:"Complete",          statusColor:C.green,  done:true,  items:["Supabase data layer","Real-time SSE refresh","Railway production deploy","Auth + session management","Row-level security"] },
    { name:"Core platform", status:"Complete",          statusColor:C.green,  done:true,  items:["Availability heatmap","RBAC — 4 roles","User management panel","Staffing needs + AI match","Overview dashboard"] },
    { name:"V1 stable",     status:"In progress · ~13h",statusColor:C.amber,  done:false, items:["Session role staleness fix","UAT sign-off","Auth hardening","User mgmt enhancements","UX polish pass"] },
    { name:"Phase 2",       status:"Planned · ~60h",   statusColor:"378ADD", done:false, items:["Multi-tenant onboarding","Finance + ops dashboard","Weekly snapshots","Extended roles","Excel export/import"] },
  ];
  phases.forEach((phase,i)=>{
    const x=0.3+i*2.42, cardW=2.2;
    s.addShape(pres.shapes.RECTANGLE, { x, y:1.5, w:cardW, h:3.85, fill:{ color:phase.done?C.navy:C.white }, line:{ color:phase.done?C.navy:"E2E8F0", pt:0.75 } });
    s.addShape(pres.shapes.RECTANGLE, { x, y:1.5, w:cardW, h:0.08, fill:{ color:phase.statusColor }, line:{ color:phase.statusColor } });
    s.addText(phase.name,   { x:x+0.15, y:1.62, w:cardW-0.2, h:0.38, fontSize:12, bold:true, color:phase.done?C.white:C.navy, fontFace:"Calibri", margin:0 });
    s.addText(phase.status, { x:x+0.15, y:2.0,  w:cardW-0.2, h:0.3,  fontSize:9,  bold:true, color:phase.statusColor, fontFace:"Calibri", margin:0 });
    phase.items.forEach((item,j)=>{
      s.addText([
        { text:phase.done?"✓  ":"·  ", options:{ color:phase.done?C.teal:C.muted, bold:true } },
        { text:item, options:{ color:phase.done?C.ice:C.slate } }
      ], { x:x+0.15, y:2.42+j*0.52, w:cardW-0.2, h:0.45, fontSize:10, fontFace:"Calibri", margin:0 });
    });
  });
  s.addText("Each phase ships to production — no big-bang release.", { x:0.5, y:5.3, w:9, h:0.25, fontSize:9, color:C.muted, fontFace:"Calibri", italic:true, margin:0 });
}

// ─── SLIDE 5: WHAT'S NEXT ──────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.offwhite };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:0.7, fill:{ color:C.navy }, line:{ color:C.navy } });
  s.addText("WHAT'S NEXT", { x:0.5, y:0, w:9, h:0.7, fontSize:10, color:C.ice, bold:true, charSpacing:3, valign:"middle", fontFace:"Calibri", margin:0 });
  s.addText("V1 Stable — production-ready in ~13h of build time", { x:0.5, y:0.85, w:9, h:0.5, fontSize:20, color:C.navy, bold:true, fontFace:"Calibri", margin:0 });

  const items=[
    { id:"#123", title:"Session role staleness fix",              desc:"Role changes take effect immediately without requiring a manual logout.", est:"2h",   pri:"sec" },
    { id:"#82",  title:"UAT completion",                          desc:"Write formal test script and sign off before onboarding real users.", est:"2h",   pri:"high" },
    { id:"#102", title:"Email verification flow",                 desc:"Enforce magic link confirmation for invited users.", est:"2h",   pri:"high" },
    { id:"#103", title:"Password strength policy",                desc:"Enforce complexity rules in Supabase Auth for all user accounts.", est:"1h",   pri:"high" },
    { id:"#100", title:"User management access enhancements",     desc:"Additional access controls and audit columns for the admin panel.", est:"2h",   pri:"med" },
  ];
  items.forEach((item,i)=>{
    const y=1.55+i*0.74;
    const priColor=item.pri==="high"?C.teal:item.pri==="sec"?"378ADD":C.amber;
    s.addShape(pres.shapes.RECTANGLE, { x:0.4, y, w:9.2, h:0.65, fill:{ color:C.white }, line:{ color:"E2E8F0", pt:0.75 } });
    s.addShape(pres.shapes.RECTANGLE, { x:0.4, y, w:0.06, h:0.65, fill:{ color:priColor }, line:{ color:priColor } });
    s.addText(item.id,    { x:0.55, y:y+0.04, w:0.55, h:0.3,  fontSize:8,  color:C.muted, fontFace:"Calibri", bold:true, margin:0 });
    s.addText(item.title, { x:1.1,  y:y+0.04, w:6.5,  h:0.28, fontSize:11, bold:true, color:C.navy, fontFace:"Calibri", margin:0 });
    s.addText(item.desc,  { x:1.1,  y:y+0.33, w:6.5,  h:0.26, fontSize:9,  color:C.slate, fontFace:"Calibri", margin:0 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x:8.7, y:y+0.15, w:0.75, h:0.3, fill:{ color:C.light }, line:{ color:C.light }, rectRadius:0.05 });
    s.addText(item.est, { x:8.7, y:y+0.15, w:0.75, h:0.3, fontSize:9, color:C.navy, fontFace:"Calibri", align:"center", valign:"middle", bold:true, margin:0 });
  });
  s.addText("staffing-app-production.up.railway.app  ·  Session 18  ·  March 2026", { x:0.5, y:5.3, w:9, h:0.25, fontSize:9, color:C.muted, fontFace:"Calibri", margin:0 });
}

// ─── WRITE ─────────────────────────────────────────────────
pres.writeFile({ fileName: "business/Staffing_Intelligence_Executive_Summary.pptx" })
  .then(() => console.log("Done — business/Staffing_Intelligence_Executive_Summary.pptx"))
  .catch(e => console.error(e));
